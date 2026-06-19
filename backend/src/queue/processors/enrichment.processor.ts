import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BaseProcessor } from '../base/base.processor';
import { EnrichmentJob } from '../queue.service';
import { ContactRole } from '@prisma/client';

@Processor('enrichment', {
  concurrency: 2,
  limiter: { max: 8, duration: 60000 },
  lockDuration: 120000,
  stalledInterval: 30000,
})
export class EnrichmentProcessor extends WorkerHost {
  private readonly logger = new Logger(EnrichmentProcessor.name);
  private baseProcessor: BaseProcessor<EnrichmentJob>;

  constructor(private prisma: PrismaService) {
    super();
    this.baseProcessor = new EnrichmentProcessorLogic(prisma);
  }

  async process(job: Job<EnrichmentJob>): Promise<any> {
    return this.baseProcessor.processWithTracking(job);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Enrichment job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Enrichment job ${job.id} failed: ${error.message}`);
  }
}

class EnrichmentProcessorLogic extends BaseProcessor<EnrichmentJob> {
  constructor(prisma: PrismaService) {
    super('enrichment', prisma);
  }

  async process(job: Job<EnrichmentJob>): Promise<any> {
    const { leadId, organizationId } = job.data;

    // Load lead (15%)
    await this.updateProgress(job, 15, 'Loading lead data');
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId, organizationId },
      include: { contacts: true },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    const enrichmentResults = {
      socialProfiles: false,
      contactsFound: 0,
      companyInfo: false,
      leadUpdated: false,
    };

    // Discover social profiles (30%)
    await this.updateProgress(job, 30, 'Discovering social profiles');
    const socialProfiles = await this.discoverSocialProfiles(lead);
    if (socialProfiles.length > 0) {
      await this.prisma.lead.update({
        where: { id: leadId },
        data: {
          linkedInUrl: socialProfiles.find(s => s.platform === 'linkedin')?.url || lead.linkedInUrl,
          twitterUrl: socialProfiles.find(s => s.platform === 'twitter')?.url || lead.twitterUrl,
          facebookUrl: socialProfiles.find(s => s.platform === 'facebook')?.url || lead.facebookUrl,
          instagramUrl: socialProfiles.find(s => s.platform === 'instagram')?.url || lead.instagramUrl,
        },
      });
      enrichmentResults.socialProfiles = true;
    }

    // Find additional contacts (45%)
    await this.updateProgress(job, 45, 'Finding additional contacts');
    const contacts = await this.findContacts(lead);
    if (contacts.length > 0) {
      // Get the first contact's details for lead enrichment
      const primaryContact = contacts[0];
      
      // Update lead with contact info if missing
      const updateData: any = {};
      if (!lead.email && primaryContact.email) updateData.email = primaryContact.email;
      if (!lead.phone && primaryContact.phone) updateData.phone = primaryContact.phone;
      if (!lead.contactName && primaryContact.name) updateData.contactName = primaryContact.name;
      
      if (Object.keys(updateData).length > 0) {
        await this.prisma.lead.update({ where: { id: leadId }, data: updateData });
        enrichmentResults.leadUpdated = true;
      }

      for (const contact of contacts) {
        // Check if contact already exists
        const existing = await this.prisma.contact.findFirst({
          where: {
            leadId,
            OR: [
              ...(contact.email ? [{ email: contact.email }] : []),
              ...(contact.name ? [{ firstName: contact.name.split(' ')[0], lastName: contact.name.split(' ').slice(1).join(' ') }] : []),
            ],
          },
        });

        if (!existing && contact.name) {
          const nameParts = contact.name.split(' ');
          await this.prisma.contact.create({
            data: {
              leadId,
              createdById: lead.createdById,
              firstName: nameParts[0] || 'Unknown',
              lastName: nameParts.slice(1).join(' ') || '',
              email: contact.email,
              phone: contact.phone,
              jobTitle: contact.title,
              role: contact.isDecisionMaker ? ContactRole.DECISION_MAKER : ContactRole.INFLUENCER,
              isPrimary: enrichmentResults.contactsFound === 0,
              isDecisionMaker: contact.isDecisionMaker || false,
              linkedInUrl: contact.linkedIn,
              enrichmentData: contact.rawData as any,
              enrichedAt: new Date(),
            },
          });
          enrichmentResults.contactsFound++;
        }
      }
    }

    // Enrich company information (60%)
    await this.updateProgress(job, 60, 'Enriching company information');
    const companyInfo = await this.enrichCompanyInfo(lead);
    if (companyInfo) {
      await this.prisma.lead.update({
        where: { id: leadId },
        data: {
          description: lead.description || companyInfo.description,
          employeeCount: lead.employeeCount || companyInfo.employeeCount,
          revenue: lead.revenue || companyInfo.revenue,
          foundedYear: lead.foundedYear || companyInfo.foundedYear,
          industry: lead.industry || companyInfo.industry,
          category: lead.category || companyInfo.category,
        },
      });
      enrichmentResults.companyInfo = true;
    }

    // Run sentiment analysis on existing messages (75%)
    await this.updateProgress(job, 75, 'Analyzing message sentiments');
    await this.analyzeSentiments(leadId);

    // Trigger re-scoring (90%)
    await this.updateProgress(job, 90, 'Triggering re-score');
    // The scoring will be triggered by the leads service

    // Log enrichment activity (100%)
    await this.updateProgress(job, 100, 'Enrichment complete');
    await this.prisma.activity.create({
      data: {
        type: 'ENRICHMENT_COMPLETED',
        description: `Enrichment completed for ${lead.businessName}: ${enrichmentResults.contactsFound} contacts found, social profiles: ${enrichmentResults.socialProfiles}`,
        leadId,
        userId: lead.createdById,
      },
    });

    this.logger.log(`Enrichment complete for lead ${leadId}: ${JSON.stringify(enrichmentResults)}`);
    return enrichmentResults;
  }

  private async discoverSocialProfiles(lead: any): Promise<any[]> {
    const profiles: any[] = [];

    // Try to find LinkedIn from business name
    if (lead.businessName) {
      const linkedInUrl = `https://linkedin.com/company/${lead.businessName.toLowerCase().replace(/\s+/g, '-')}`;
      profiles.push({ platform: 'linkedin', url: linkedInUrl });
    }

    // Try to find Twitter
    if (lead.businessName) {
      const twitterHandle = lead.businessName.toLowerCase().replace(/\s+/g, '');
      profiles.push({ platform: 'twitter', url: `https://twitter.com/${twitterHandle}` });
    }

    // Try to find Facebook
    if (lead.businessName) {
      const fbName = lead.businessName.toLowerCase().replace(/\s+/g, '.');
      profiles.push({ platform: 'facebook', url: `https://facebook.com/${fbName}` });
    }

    return profiles;
  }

  private async findContacts(lead: any): Promise<any[]> {
    const contacts: any[] = [];

    // Use lead name as primary contact if no contacts exist
    if (lead.contactName) {
      contacts.push({
        name: lead.contactName,
        email: lead.email,
        phone: lead.phone,
        title: 'Contact',
        isDecisionMaker: false,
      });
    }

    // Try to extract contact info from raw data
    if (lead.rawData) {
      const raw = lead.rawData as any;
      if (raw.contacts && Array.isArray(raw.contacts)) {
        for (const c of raw.contacts) {
          contacts.push({
            name: c.name,
            email: c.email,
            phone: c.phone,
            title: c.title || 'Contact',
            isDecisionMaker: c.isDecisionMaker || false,
            linkedIn: c.linkedIn,
            rawData: c,
          });
        }
      }
    }

    return contacts;
  }

  private async enrichCompanyInfo(lead: any): Promise<any> {
    // Try to get additional company info from available data
    const info: any = {};

    if (lead.rawData) {
      const raw = lead.rawData as any;
      info.description = raw.description || raw.about;
      info.employeeCount = raw.employeeCount || raw.employees;
      info.revenue = raw.revenue;
      info.foundedYear = raw.founded;
      info.industry = raw.industry;
      info.category = raw.category || raw.sector;
    }

    // Only return if we found something new
    const hasNewInfo = Object.values(info).some(v => v !== undefined);
    return hasNewInfo ? info : null;
  }

  private async analyzeSentiments(leadId: string): Promise<void> {
    // Get messages that haven't been analyzed yet
    const messages = await this.prisma.message.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    for (const message of messages) {
      // Simple keyword-based sentiment analysis
      const sentiment = this.detectSentiment(message.content);

      // Check if analysis already exists
      const existing = await this.prisma.sentimentAnalysis.findFirst({
        where: { messageId: message.id },
      });

      if (!existing) {
        await this.prisma.sentimentAnalysis.create({
          data: {
            messageId: message.id,
            leadId,
            content: message.content,
            sentiment: sentiment.type,
            score: sentiment.score,
            positiveScore: sentiment.positive,
            negativeScore: sentiment.negative,
            neutralScore: sentiment.neutral,
            keyPhrases: sentiment.keyPhrases as any,
          },
        });
      }
    }
  }

  private detectSentiment(text: string): { type: string; score: number; positive: number; negative: number; neutral: number; keyPhrases: string[] } {
    const lower = text.toLowerCase();
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'love', 'best', 'perfect', 'thanks', 'interested', 'yes', 'agree', 'awesome', 'fantastic', 'happy', 'pleased'];
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'worst', 'no', 'not interested', 'stop', 'unsubscribe', 'poor', 'disappointed', 'frustrated', 'annoying', 'useless', 'never'];
    const neutralWords = ['ok', 'fine', 'maybe', 'perhaps', 'information', 'details', 'question', 'what', 'how', 'when'];

    let positive = 0;
    let negative = 0;
    let neutral = 0;
    const keyPhrases: string[] = [];

    for (const word of positiveWords) {
      if (lower.includes(word)) { positive++; keyPhrases.push(word); }
    }
    for (const word of negativeWords) {
      if (lower.includes(word)) { negative++; keyPhrases.push(word); }
    }
    for (const word of neutralWords) {
      if (lower.includes(word)) { neutral++; }
    }

    // Normalize
    const total = positive + negative + neutral || 1;
    const posScore = positive / total;
    const negScore = negative / total;
    const neuScore = neutral / total;

    let type = 'NEUTRAL';
    let score = 0;

    if (positive > negative && positive > neutral) {
      type = 'POSITIVE';
      score = posScore;
    } else if (negative > positive && negative > neutral) {
      type = 'NEGATIVE';
      score = -negScore;
    } else if (neutral > 0) {
      type = 'NEUTRAL';
      score = neuScore * 0.1;
    }

    return {
      type,
      score: Math.round(score * 100) / 100,
      positive: Math.round(posScore * 100) / 100,
      negative: Math.round(negScore * 100) / 100,
      neutral: Math.round(neuScore * 100) / 100,
      keyPhrases: [...new Set(keyPhrases)],
    };
  }
}
