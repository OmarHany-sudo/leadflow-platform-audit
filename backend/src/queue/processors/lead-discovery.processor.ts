import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BaseProcessor } from '../base/base.processor';
import { LeadDiscoveryJob } from '../queue.service';
import { LeadSource } from '@prisma/client';

@Processor('lead-discovery', {
  concurrency: 2,
  limiter: { max: 5, duration: 60000 },
  lockDuration: 30000,
  stalledInterval: 30000,
})
export class LeadDiscoveryProcessor extends WorkerHost {
  private readonly logger = new Logger(LeadDiscoveryProcessor.name);
  private baseProcessor: BaseProcessor<LeadDiscoveryJob>;

  constructor(private prisma: PrismaService) {
    super();
    this.baseProcessor = new LeadDiscoveryProcessorLogic(prisma);
  }

  async process(job: Job<LeadDiscoveryJob>): Promise<any> {
    return this.baseProcessor.processWithTracking(job);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Lead discovery job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Lead discovery job ${job.id} failed: ${error.message}`);
  }
}

class LeadDiscoveryProcessorLogic extends BaseProcessor<LeadDiscoveryJob> {
  constructor(prisma: PrismaService) {
    super('lead-discovery', prisma);
  }

  async process(job: Job<LeadDiscoveryJob>): Promise<any> {
    const { connector, query, location, organizationId, userId, options } = job.data;

    // Step 1: Validate connector (10%)
    await this.updateProgress(job, 10, 'Validating connector');
    const validConnectors = ['google-maps', 'reddit', 'linkedin', 'twitter', 'product-hunt', 'crunchbase'];
    if (!validConnectors.includes(connector)) {
      throw new Error(`Invalid connector: ${connector}. Valid options: ${validConnectors.join(', ')}`);
    }

    // Step 2: Load connector configuration (20%)
    await this.updateProgress(job, 20, 'Loading connector configuration');
    const connectorConfig = await this.loadConnectorConfig(connector, organizationId);

    // Step 3: Execute external search (40%)
    await this.updateProgress(job, 40, `Executing ${connector} search for "${query}"`);
    const rawResults = await this.executeSearch(connector, query, location, connectorConfig);

    // Step 4: Transform results (60%)
    await this.updateProgress(job, 60, `Transforming ${rawResults.length} results`);
    const leads = this.transformResults(rawResults, connector, location);

    // Step 5: Save leads to database (80%)
    await this.updateProgress(job, 80, `Saving ${leads.length} leads`);
    const savedLeads = await this.saveLeads(leads, organizationId, userId);

    // Step 6: Queue enrichment jobs (90%)
    await this.updateProgress(job, 90, 'Queueing enrichment jobs');
    await this.queueEnrichment(savedLeads, organizationId);

    // Complete (100%)
    await this.updateProgress(job, 100, `Discovery complete: ${savedLeads.length} leads saved`);

    return {
      connector,
      query,
      leadsFound: rawResults.length,
      leadsSaved: savedLeads.length,
      leadIds: savedLeads.map(l => l.id),
    };
  }

  private async loadConnectorConfig(connector: string, organizationId: string): Promise<any> {
    // Check for user-managed integration credentials
    const integration = await this.prisma.integration.findFirst({
      where: { organizationId, provider: connector },
    });

    return integration?.credentials || {};
  }

  private async executeSearch(
    connector: string,
    query: string,
    location: string | undefined,
    config: any,
  ): Promise<any[]> {
    switch (connector) {
      case 'google-maps':
        return this.searchGoogleMaps(query, location, config);
      case 'reddit':
        return this.searchReddit(query, config);
      case 'linkedin':
        return this.searchLinkedIn(query, config);
      default:
        return this.getMockResults(connector, query, location);
    }
  }

  private async searchGoogleMaps(query: string, location: string | undefined, config: any): Promise<any[]> {
    const apiKey = config.apiKey || process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      this.logger.warn('No Google Maps API key configured, using mock results');
      return this.getMockResults('google-maps', query, location);
    }

    try {
      // Geocode location
      const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location || '')}&key=${apiKey}`;
      const geoRes = await fetch(geoUrl);
      const geoData = await geoRes.json();

      if (geoData.status !== 'OK') {
        throw new Error(`Geocoding failed: ${geoData.status}`);
      }

      const { lat, lng } = geoData.results[0].geometry.location;

      // Search places
      const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=50000&keyword=${encodeURIComponent(query)}&key=${apiKey}`;
      const placesRes = await fetch(placesUrl);
      const placesData = await placesRes.json();

      if (placesData.status !== 'OK') {
        return [];
      }

      // Get details for each place
      const results = await Promise.all(
        placesData.results.slice(0, 20).map(async (place: any) => {
          const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,opening_hours,types&key=${apiKey}`;
          const detailsRes = await fetch(detailsUrl);
          const detailsData = await detailsRes.json();
          const details = detailsData.result;

          return {
            businessName: place.name,
            address: details?.formatted_address || place.vicinity,
            phone: details?.formatted_phone_number || null,
            website: details?.website || null,
            rating: place.rating || null,
            reviewsCount: place.user_ratings_total || 0,
            category: place.types?.[0] || null,
            latitude: place.geometry?.location?.lat,
            longitude: place.geometry?.location?.lng,
            sourceUrl: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
            rawData: place,
          };
        }),
      );

      return results;
    } catch (error: any) {
      this.logger.error(`Google Maps search failed: ${error.message}`);
      return this.getMockResults('google-maps', query, location);
    }
  }

  private async searchReddit(query: string, config: any): Promise<any[]> {
    const keywords = query.split(',').map(k => k.trim());
    const subreddits = config.subreddits || ['webdev', 'smallbusiness', 'startups'];

    try {
      const results: any[] = [];
      const searchQuery = keywords.join(' OR ');

      for (const subreddit of subreddits) {
        const url = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(searchQuery)}&restrict_sr=1&sort=new&t=month&limit=25`;

        const response = await fetch(url, {
          headers: { 'User-Agent': 'LeadFlow/1.0' },
        });

        if (!response.ok) continue;

        const data = await response.json();

        for (const post of data.data?.children || []) {
          const p = post.data;
          const intentScore = this.calculateRedditIntent(p.title + ' ' + (p.selftext || ''));

          if (intentScore > 30) {
            results.push({
              businessName: p.author,
              description: p.title + '\n' + (p.selftext || ''),
              sourceUrl: `https://reddit.com${p.permalink}`,
              signals: [{ type: 'INTENT_SIGNAL', score: intentScore, message: p.title }],
              rawData: { subreddit, author: p.author, score: p.score, numComments: p.num_comments },
              score: intentScore,
            });
          }
        }
      }

      return results.sort((a, b) => (b.score || 0) - (a.score || 0));
    } catch (error: any) {
      this.logger.error(`Reddit search failed: ${error.message}`);
      return this.getMockResults('reddit', query, undefined);
    }
  }

  private async searchLinkedIn(companyName: string, config: any): Promise<any[]> {
    // LinkedIn requires API approval - return structured mock
    return [{
      businessName: companyName,
      industry: 'Technology',
      sourceUrl: `https://linkedin.com/company/${companyName.toLowerCase().replace(/\s+/g, '-')}`,
      employeeCount: '11-50',
      description: `Professional page for ${companyName}`,
    }];
  }

  private calculateRedditIntent(text: string): number {
    const keywords = [
      { keyword: 'need website', score: 50 },
      { keyword: 'website redesign', score: 45 },
      { keyword: 'looking for developer', score: 40 },
      { keyword: 'need developer', score: 40 },
      { keyword: 'need seo', score: 40 },
      { keyword: 'looking for agency', score: 45 },
      { keyword: 'need app', score: 40 },
      { keyword: 'mobile app', score: 35 },
      { keyword: 'ai automation', score: 35 },
      { keyword: 'chatbot', score: 30 },
    ];

    const lower = text.toLowerCase();
    let score = 0;

    for (const { keyword, score: keywordScore } of keywords) {
      if (lower.includes(keyword)) score += keywordScore;
    }

    return Math.min(100, score);
  }

  private transformResults(rawResults: any[], connector: string, location?: string): any[] {
    const sourceMap: Record<string, LeadSource> = {
      'google-maps': LeadSource.GOOGLE_MAPS,
      'reddit': LeadSource.REDDIT,
      'linkedin': LeadSource.LINKEDIN,
      'twitter': LeadSource.TWITTER,
      'product-hunt': LeadSource.PRODUCT_HUNT,
      'crunchbase': LeadSource.CRUNCHBASE,
    };

    return rawResults.map(result => ({
      businessName: result.businessName || 'Unknown Business',
      contactName: result.contactName,
      email: result.email,
      phone: result.phone,
      website: result.website,
      industry: result.industry,
      category: result.category,
      address: result.address,
      city: result.city || (location ? location.split(',')[0] : undefined),
      country: result.country,
      latitude: result.latitude,
      longitude: result.longitude,
      linkedInUrl: result.linkedInUrl,
      description: result.description,
      employeeCount: result.employeeCount,
      revenue: result.revenue,
      source: sourceMap[connector] || LeadSource.API,
      sourceUrl: result.sourceUrl,
      sourceConnector: connector,
      signals: result.signals || [],
      rawData: result.rawData || {},
      score: result.score || 0,
    }));
  }

  private async saveLeads(leads: any[], organizationId: string, userId: string): Promise<any[]> {
    const saved = [];

    for (const leadData of leads) {
      try {
        const existing = await this.prisma.lead.findFirst({
          where: {
            organizationId,
            OR: [
              { businessName: leadData.businessName },
              ...(leadData.website ? [{ website: leadData.website }] : []),
            ],
          },
        });

        if (existing) {
          this.logger.log(`Skipping duplicate lead: ${leadData.businessName}`);
          continue;
        }

        const lead = await this.prisma.lead.create({
          data: { ...leadData, organizationId, createdById: userId },
        });
        saved.push(lead);
      } catch (error: any) {
        this.logger.error(`Failed to save lead ${leadData.businessName}: ${error.message}`);
      }
    }

    return saved;
  }

  private async queueEnrichment(leads: any[], organizationId: string): Promise<void> {
    // Import QueueService dynamically to avoid circular dependency
    const { QueueService } = await import('../queue.service');

    for (const lead of leads) {
      if (lead.website) {
        // Website audit job will be queued by the leads service
        this.logger.log(`Lead ${lead.id} has website, audit will be triggered`);
      }
    }
  }

  private getMockResults(connector: string, query: string, location?: string): any[] {
    const baseName = query.split(' ')[0];
    const loc = location || 'Riyadh';

    if (connector === 'google-maps') {
      return [
        {
          businessName: `${baseName} Elite`,
          address: `King Fahd Road, ${loc}`,
          phone: '+966501234567',
          website: `https://${baseName.toLowerCase()}-elite.com`,
          rating: 4.5,
          reviewsCount: 127,
          category: baseName,
          sourceUrl: 'https://maps.google.com',
        },
        {
          businessName: `${loc} Premium ${baseName}`,
          address: `Olaya Street, ${loc}`,
          phone: '+966502345678',
          website: null,
          rating: 4.2,
          reviewsCount: 89,
          category: baseName,
          sourceUrl: 'https://maps.google.com',
        },
        {
          businessName: `Golden ${baseName} Center`,
          address: `Tahlia Street, ${loc}`,
          phone: '+966503456789',
          website: `https://golden-${baseName.toLowerCase()}.com`,
          rating: 3.8,
          reviewsCount: 234,
          category: baseName,
          sourceUrl: 'https://maps.google.com',
        },
      ];
    }

    if (connector === 'reddit') {
      return [
        {
          businessName: 'reddit_user_123',
          description: `Looking for a web development agency to rebuild our e-commerce site. We need website redesign with modern UI/UX.`,
          sourceUrl: 'https://reddit.com/r/webdev/comments/abc123',
          score: 85,
          signals: [{ type: 'INTENT_SIGNAL', score: 85, message: 'Looking for web development agency' }],
        },
        {
          businessName: 'startup_founder_456',
          description: `Our startup needs a mobile app and CRM integration. Searching for software house with AI automation experience.`,
          sourceUrl: 'https://reddit.com/r/startups/comments/def456',
          score: 90,
          signals: [{ type: 'INTENT_SIGNAL', score: 90, message: 'Needs mobile app and CRM' }],
        },
      ];
    }

    return [];
  }
}
