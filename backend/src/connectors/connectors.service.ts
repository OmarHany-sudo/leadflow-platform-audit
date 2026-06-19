import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { LeadSource } from '@prisma/client';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class ConnectorsService {
  private readonly logger = new Logger(ConnectorsService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private queueService: QueueService,
  ) {}

  // Google Maps Connector
  async searchGoogleMaps(query: string, location: string, organizationId: string, userId: string) {
    this.logger.log(`Google Maps search: "${query}" in "${location}"`);
    
    const apiKey = this.configService.get('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      // Return mock data for demo
      return this.getMockGoogleMapsResults(query, location);
    }

    try {
      // Geocode location
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`;
      const geoRes = await fetch(geocodeUrl);
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
        throw new Error(`Places search failed: ${placesData.status}`);
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
            hours: details?.opening_hours?.weekday_text || null,
            latitude: place.geometry?.location?.lat,
            longitude: place.geometry?.location?.lng,
            source: LeadSource.GOOGLE_MAPS,
            sourceUrl: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
            rawData: place,
          };
        }),
      );

      return results;
    } catch (error) {
      this.logger.error(`Google Maps search failed: ${error.message}`);
      return this.getMockGoogleMapsResults(query, location);
    }
  }

  // Reddit Connector
  async searchReddit(keywords: string[], subreddits: string[] = ['webdev', 'smallbusiness', 'startups'], organizationId?: string, userId?: string) {
    this.logger.log(`Reddit search: ${keywords.join(', ')}`);

    const results: any[] = [];
    const searchQuery = keywords.join(' OR ');

    try {
      // Use Reddit JSON API (no auth needed for public posts)
      for (const subreddit of subreddits) {
        const url = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(searchQuery)}&restrict_sr=1&sort=new&t=month&limit=25`;
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'LeadFlow/1.0 (Lead Generation Platform)',
          },
        });

        if (!response.ok) continue;

        const data = await response.json();
        
        for (const post of data.data?.children || []) {
          const p = post.data;
          
          // Calculate intent score
          const intentScore = this.calculateRedditIntentScore(p.title + ' ' + (p.selftext || ''));
          
          if (intentScore > 30) {
            results.push({
              businessName: p.author,
              description: p.title + '\n' + (p.selftext || ''),
              source: LeadSource.REDDIT,
              sourceUrl: `https://reddit.com${p.permalink}`,
              signals: [{ type: 'INTENT_SIGNAL', score: intentScore, message: p.title }],
              rawData: {
                subreddit,
                author: p.author,
                score: p.score,
                numComments: p.num_comments,
                created: p.created_utc,
              },
              score: intentScore,
            });
          }
        }
      }

      return results.sort((a, b) => b.score - a.score);
    } catch (error) {
      this.logger.error(`Reddit search failed: ${error.message}`);
      return this.getMockRedditResults(keywords);
    }
  }

  // LinkedIn Connector (mock for now - requires API approval)
  async searchLinkedIn(companyName: string, industry?: string, location?: string) {
    this.logger.log(`LinkedIn search: ${companyName}`);
    // LinkedIn API requires partnership program approval
    // Return structured mock for demo
    return {
      businessName: companyName,
      industry: industry || 'Technology',
      source: LeadSource.LINKEDIN,
      sourceUrl: `https://linkedin.com/company/${companyName.toLowerCase().replace(/\s+/g, '-')}`,
      employeeCount: '11-50',
      location: location || 'San Francisco, CA',
      description: `Professional page for ${companyName}`,
    };
  }

  // Save leads from connectors
  async saveLeads(leads: any[], organizationId: string, userId: string) {
    const saved = [];
    
    for (const leadData of leads) {
      try {
        const lead = await this.prisma.lead.create({
          data: {
            businessName: leadData.businessName || 'Unknown Business',
            contactName: leadData.contactName,
            email: leadData.email,
            phone: leadData.phone,
            website: leadData.website,
            industry: leadData.industry,
            category: leadData.category,
            address: leadData.address,
            city: leadData.city,
            country: leadData.country,
            latitude: leadData.latitude,
            longitude: leadData.longitude,
            linkedInUrl: leadData.linkedInUrl,
            facebookUrl: leadData.facebookUrl,
            twitterUrl: leadData.twitterUrl,
            instagramUrl: leadData.instagramUrl,
            source: leadData.source || LeadSource.API,
            sourceUrl: leadData.sourceUrl,
            sourceConnector: leadData.sourceConnector,
            description: leadData.description,
            employeeCount: leadData.employeeCount,
            revenue: leadData.revenue,
            signals: leadData.signals || [],
            rawData: leadData.rawData || {},
            score: leadData.score || 0,
            organizationId,
            createdById: userId,
          },
        });
        
        saved.push(lead);

        // Queue enrichment if website exists
        if (lead.website) {
          await this.queueService.addWebsiteAuditJob({
            leadId: lead.id,
            url: lead.website,
            organizationId,
          });
        }
      } catch (error) {
        this.logger.error(`Failed to save lead: ${error.message}`);
      }
    }

    this.logger.log(`Saved ${saved.length} leads from connector`);
    return saved;
  }

  private calculateRedditIntentScore(text: string): number {
    const intentKeywords = [
      { keyword: 'need website', score: 50 },
      { keyword: 'website redesign', score: 45 },
      { keyword: 'looking for developer', score: 40 },
      { keyword: 'need developer', score: 40 },
      { keyword: 'need seo', score: 40 },
      { keyword: 'looking for agency', score: 45 },
      { keyword: 'need app', score: 40 },
      { keyword: 'mobile app', score: 35 },
      { keyword: 'need crm', score: 35 },
      { keyword: 'ai automation', score: 35 },
      { keyword: 'chatbot', score: 30 },
      { keyword: 'digital transformation', score: 35 },
    ];

    const lower = text.toLowerCase();
    let score = 0;
    
    for (const { keyword, score: keywordScore } of intentKeywords) {
      if (lower.includes(keyword)) {
        score += keywordScore;
      }
    }

    return Math.min(100, score);
  }

  private getMockGoogleMapsResults(query: string, location: string) {
    return [
      {
        businessName: `${query.split(' ')[0]} Elite`,
        address: `King Fahd Road, ${location}`,
        phone: '+966501234567',
        website: `https://${query.toLowerCase().replace(/\s+/g, '')}-elite.com`,
        rating: 4.5,
        reviewsCount: 127,
        category: query.split(' ')[0],
        source: LeadSource.GOOGLE_MAPS,
        sourceUrl: 'https://maps.google.com',
      },
      {
        businessName: `${location} Premium ${query.split(' ')[0]}`,
        address: `Olaya Street, ${location}`,
        phone: '+966502345678',
        website: null,
        rating: 4.2,
        reviewsCount: 89,
        category: query.split(' ')[0],
        source: LeadSource.GOOGLE_MAPS,
        sourceUrl: 'https://maps.google.com',
      },
      {
        businessName: `Golden ${query.split(' ')[0]} Center`,
        address: `Tahlia Street, ${location}`,
        phone: '+966503456789',
        website: `https://golden-${query.toLowerCase().replace(/\s+/g, '')}.com`,
        rating: 3.8,
        reviewsCount: 234,
        category: query.split(' ')[0],
        source: LeadSource.GOOGLE_MAPS,
        sourceUrl: 'https://maps.google.com',
      },
    ];
  }

  private getMockRedditResults(keywords: string[]) {
    return [
      {
        businessName: 'reddit_user_123',
        description: `Looking for a web development agency to rebuild our e-commerce site. We need website redesign with modern UI/UX.`,
        source: LeadSource.REDDIT,
        sourceUrl: 'https://reddit.com/r/webdev/comments/abc123',
        score: 85,
        signals: [{ type: 'INTENT_SIGNAL', score: 85, message: 'Looking for web development agency' }],
      },
      {
        businessName: 'startup_founder_456',
        description: `Our startup needs a mobile app and CRM integration. Searching for software house with AI automation experience.`,
        source: LeadSource.REDDIT,
        sourceUrl: 'https://reddit.com/r/startups/comments/def456',
        score: 90,
        signals: [{ type: 'INTENT_SIGNAL', score: 90, message: 'Needs mobile app and CRM' }],
      },
    ];
  }
}