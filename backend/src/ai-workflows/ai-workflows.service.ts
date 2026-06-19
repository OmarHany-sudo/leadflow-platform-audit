import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { SentimentType, ReplyIntent } from '@prisma/client';

@Injectable()
export class AiWorkflowsService {
  private readonly logger = new Logger(AiWorkflowsService.name);
  private providers: Map<string, any> = new Map();
  private defaultProvider: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.initializeProviders();
  }

  private initializeProviders() {
    const geminiKey = this.configService.get('ai.geminiApiKey');
    const groqKey = this.configService.get('ai.groqApiKey');

    if (geminiKey) {
      this.providers.set('gemini', { name: 'gemini', apiKey: geminiKey, model: this.configService.get('ai.geminiModel', 'gemini-1.5-flash') });
    }

    if (groqKey) {
      this.providers.set('groq', { name: 'groq', apiKey: groqKey, model: this.configService.get('ai.groqModel', 'llama-3.1-70b-versatile') });
    }

    this.defaultProvider = this.configService.get('ai.defaultProvider', 'gemini');
  }

  // ============================================================
  // DATA ENRICHMENT
  // ============================================================

  async enrichLead(leadId: string, enrichmentType: 'full' | 'social' | 'contacts' | 'company' = 'full') {
    this.logger.log(`Enriching lead ${leadId} - type: ${enrichmentType}`);

    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { contacts: true, websiteAudit: true },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    const enrichment = {
      leadId,
      enrichmentType,
      socialProfiles: [] as any[],
      contactsFound: [] as any[],
      companyInfo: null as any,
      enrichedAt: new Date(),
    };

    if (enrichmentType === 'full' || enrichmentType === 'social') {
      enrichment.socialProfiles = await this.discoverSocialProfiles(lead);
    }

    if (enrichmentType === 'full' || enrichmentType === 'contacts') {
      enrichment.contactsFound = await this.discoverMissingContacts(lead);
    }

    if (enrichmentType === 'full' || enrichmentType === 'company') {
      enrichment.companyInfo = await this.enrichCompanyData(lead);
    }

    // Update lead with enriched data
    const updateData: any = {};
    if (enrichment.socialProfiles.length > 0) {
      for (const profile of enrichment.socialProfiles) {
        if (profile.platform === 'linkedin') updateData.linkedInUrl = profile.url;
        if (profile.platform === 'twitter') updateData.twitterUrl = profile.url;
        if (profile.platform === 'facebook') updateData.facebookUrl = profile.url;
      }
    }

    if (enrichment.companyInfo) {
      if (!lead.description) updateData.description = enrichment.companyInfo.description;
      if (!lead.employeeCount) updateData.employeeCount = enrichment.companyInfo.employeeCount;
      if (!lead.industry) updateData.industry = enrichment.companyInfo.industry;
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.lead.update({ where: { id: leadId }, data: updateData });
    }

    // Create found contacts
    for (const contact of enrichment.contactsFound) {
      const existing = await this.prisma.contact.findFirst({
        where: {
          leadId,
          OR: [
            ...(contact.email ? [{ email: contact.email }] : []),
            ...(contact.name ? [{ firstName: contact.name.split(' ')[0] }] : []),
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
            linkedInUrl: contact.linkedIn,
            isDecisionMaker: contact.isDecisionMaker || false,
            enrichedAt: new Date(),
            enrichmentData: contact.rawData as any,
          },
        });
      }
    }

    return enrichment;
  }

  private async discoverSocialProfiles(lead: any): Promise<any[]> {
    const profiles: any[] = [];
    const baseName = lead.businessName?.toLowerCase().replace(/\s+/g, '-') || '';

    if (baseName) {
      profiles.push(
        { platform: 'linkedin', url: `https://linkedin.com/company/${baseName}`, discovered: true },
        { platform: 'twitter', url: `https://twitter.com/${baseName}`, discovered: true },
        { platform: 'facebook', url: `https://facebook.com/${baseName}`, discovered: true },
      );
    }

    return profiles;
  }

  private async discoverMissingContacts(lead: any): Promise<any[]> {
    const contacts: any[] = [];

    // Extract from existing data
    if (lead.contactName && !lead.contacts?.find((c: any) => c.firstName === lead.contactName?.split(' ')[0])) {
      contacts.push({
        name: lead.contactName,
        email: lead.email,
        phone: lead.phone,
        title: 'Primary Contact',
        source: 'lead_data',
      });
    }

    // Look for contact info in raw data
    if (lead.rawData) {
      const raw = lead.rawData as any;
      if (raw.contacts && Array.isArray(raw.contacts)) {
        for (const c of raw.contacts) {
          contacts.push({
            name: c.name,
            email: c.email,
            phone: c.phone,
            title: c.title,
            linkedIn: c.linkedin,
            isDecisionMaker: c.isDecisionMaker,
            source: 'raw_data',
            rawData: c,
          });
        }
      }
      if (raw.owner || raw.manager) {
        contacts.push({
          name: raw.owner || raw.manager,
          title: 'Business Owner',
          source: 'raw_data',
          isDecisionMaker: true,
        });
      }
    }

    return contacts;
  }

  private async enrichCompanyData(lead: any): Promise<any> {
    const info: any = {};

    if (lead.rawData) {
      const raw = lead.rawData as any;
      info.description = raw.description || raw.about || raw.bio;
      info.employeeCount = raw.employeeCount || raw.employees || raw.companySize;
      info.revenue = raw.revenue;
      info.foundedYear = raw.founded || raw.yearFounded;
      info.industry = raw.industry || raw.sector || raw.category;
    }

    const hasNewInfo = Object.values(info).some(v => v !== undefined);
    return hasNewInfo ? info : null;
  }

  // ============================================================
  // SOCIAL PROFILE DISCOVERY
  // ============================================================

  async discoverSocialProfilesForLead(leadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new Error('Lead not found');

    const profiles = await this.discoverSocialProfiles(lead);

    // Update lead
    const updateData: any = {};
    for (const profile of profiles) {
      if (profile.platform === 'linkedin' && !lead.linkedInUrl) updateData.linkedInUrl = profile.url;
      if (profile.platform === 'twitter' && !lead.twitterUrl) updateData.twitterUrl = profile.url;
      if (profile.platform === 'facebook' && !lead.facebookUrl) updateData.facebookUrl = profile.url;
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.lead.update({ where: { id: leadId }, data: updateData });
    }

    return profiles;
  }

  // ============================================================
  // SENTIMENT ANALYSIS
  // ============================================================

  async analyzeSentiment(leadId: string, messageId?: string) {
    const where: any = { leadId };
    if (messageId) where.id = messageId;

    const messages = await this.prisma.message.findMany({ where });
    const results = [];

    for (const message of messages) {
      // Check if already analyzed
      const existing = await this.prisma.sentimentAnalysis.findFirst({
        where: { messageId: message.id },
      });

      if (existing) {
        results.push(existing);
        continue;
      }

      const sentiment = this.detectSentiment(message.content);

      const analysis = await this.prisma.sentimentAnalysis.create({
        data: {
          messageId: message.id,
          leadId,
          content: message.content,
          sentiment: sentiment.type as SentimentType,
          score: sentiment.score,
          positiveScore: sentiment.positive,
          negativeScore: sentiment.negative,
          neutralScore: sentiment.neutral,
          keyPhrases: sentiment.keyPhrases as any,
        },
      });

      results.push(analysis);
    }

    return results;
  }

  private detectSentiment(text: string): { type: string; score: number; positive: number; negative: number; neutral: number; keyPhrases: string[] } {
    const lower = text.toLowerCase();
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'love', 'best', 'perfect', 'thanks', 'interested', 'yes', 'agree', 'awesome', 'fantastic', 'happy', 'pleased', 'wonderful', 'impressed', 'recommend'];
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'worst', 'no', 'not interested', 'stop', 'unsubscribe', 'poor', 'disappointed', 'frustrated', 'annoying', 'useless', 'never', 'waste', 'problem', 'issue', 'error'];
    const neutralWords = ['ok', 'fine', 'maybe', 'perhaps', 'information', 'details', 'question', 'what', 'how', 'when', 'thanks', 'hello', 'hi'];

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
      if (lower.includes(word)) neutral++;
    }

    const total = positive + negative + neutral || 1;
    const posScore = positive / total;
    const negScore = negative / total;
    const neuScore = neutral / total;

    let type = 'NEUTRAL';
    let score = 0;

    if (positive > negative && positive > neutral) {
      type = 'POSITIVE';
      score = Math.min(1, posScore);
    } else if (negative > positive && negative > neutral) {
      type = 'NEGATIVE';
      score = Math.max(-1, -negScore);
    } else {
      type = 'NEUTRAL';
      score = neuScore * 0.1;
    }

    // Check for strong intent indicators
    if (lower.includes('interested') || lower.includes('pricing') || lower.includes('quote')) {
      score = Math.min(1, score + 0.3);
      if (score > 0) type = 'POSITIVE';
    }
    if (lower.includes('unsubscribe') || lower.includes('stop') || lower.includes('not interested')) {
      score = Math.max(-1, score - 0.5);
      type = 'NEGATIVE';
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

  // ============================================================
  // REPLY CLASSIFICATION
  // ============================================================

  async classifyReply(leadId: string, messageId?: string) {
    const where: any = { leadId };
    if (messageId) where.id = messageId;

    const messages = await this.prisma.message.findMany({ where });
    const results = [];

    for (const message of messages) {
      // Check if already classified
      const existing = await this.prisma.replyClassification.findFirst({
        where: { messageId: message.id },
      });

      if (existing) {
        results.push(existing);
        continue;
      }

      const classification = this.classifyIntent(message.content);

      const result = await this.prisma.replyClassification.create({
        data: {
          messageId: message.id,
          leadId,
          content: message.content,
          intent: classification.intent as ReplyIntent,
          confidence: classification.confidence,
          extractedData: classification.extractedData as any,
        },
      });

      results.push(result);
    }

    return results;
  }

  private classifyIntent(text: string): { intent: string; confidence: number; extractedData: any } {
    const lower = text.toLowerCase();
    const extractedData: any = {};

    // Intent detection patterns
    const patterns: Record<string, { keywords: string[]; confidence: number }> = {
      INTERESTED: {
        keywords: ['interested', 'yes', 'sounds good', 'tell me more', 'would like', 'keen', 'definitely', 'absolutely'],
        confidence: 0.9,
      },
      NOT_INTERESTED: {
        keywords: ['not interested', 'no thanks', 'pass', 'not for us', 'doesn\'t fit', 'not needed', 'we have'],
        confidence: 0.9,
      },
      REQUEST_INFO: {
        keywords: ['more info', 'details', 'specifications', 'how does', 'explain', 'what is', 'tell me about', 'brochure', 'catalog'],
        confidence: 0.85,
      },
      PRICING_INQUIRY: {
        keywords: ['price', 'pricing', 'cost', 'how much', 'quote', 'budget', 'fee', 'rate', 'discount', 'expensive', 'cheap'],
        confidence: 0.9,
      },
      SCHEDULING: {
        keywords: ['schedule', 'meeting', 'call', 'demo', 'appointment', 'available', 'when', 'time', 'calendar', 'book'],
        confidence: 0.85,
      },
      REFERRAL: {
        keywords: ['refer', 'colleague', 'someone else', 'different department', 'contact', 'person'],
        confidence: 0.75,
      },
      COMPLAINT: {
        keywords: ['complaint', 'problem', 'issue', 'frustrated', 'disappointed', 'bad experience', 'error', 'bug', 'not working'],
        confidence: 0.85,
      },
      OUT_OF_OFFICE: {
        keywords: ['out of office', 'on vacation', 'away', 'sick leave', 'maternity leave', 'return', 'back on'],
        confidence: 0.9,
      },
      UNSUBSCRIBE: {
        keywords: ['unsubscribe', 'stop emailing', 'remove', 'don\'t contact', 'opt out', 'gdpr'],
        confidence: 0.95,
      },
      FOLLOW_UP: {
        keywords: ['follow up', 'check back', 'remind', 'later', 'next week', 'next month', 'not now'],
        confidence: 0.8,
      },
    };

    // Check each pattern
    for (const [intent, pattern] of Object.entries(patterns)) {
      for (const keyword of pattern.keywords) {
        if (lower.includes(keyword)) {
          // Extract additional data
          if (intent === 'PRICING_INQUIRY') {
            const priceMatch = text.match(/\$[\d,]+(?:\.\d{2})?/);
            if (priceMatch) extractedData.price = priceMatch[0];
          }
          if (intent === 'SCHEDULING') {
            const dateMatch = text.match(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|next week|tomorrow|\d{1,2}\/\d{1,2})\b/i);
            if (dateMatch) extractedData.suggestedDate = dateMatch[0];
          }
          if (intent === 'REFERRAL') {
            const nameMatch = text.match(/(?:contact|reach|talk to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
            if (nameMatch) extractedData.referredPerson = nameMatch[1];
          }

          return { intent, confidence: pattern.confidence, extractedData };
        }
      }
    }

    // Default to NO_RESPONSE if very short
    if (text.length < 10) {
      return { intent: 'NO_RESPONSE', confidence: 0.6, extractedData };
    }

    return { intent: 'NO_RESPONSE', confidence: 0.5, extractedData };
  }

  // ============================================================
  // BATCH OPERATIONS
  // ============================================================

  async batchAnalyzeSentiments(leadIds: string[]) {
    const results = [];
    for (const leadId of leadIds) {
      try {
        const result = await this.analyzeSentiment(leadId);
        results.push({ leadId, success: true, count: result.length });
      } catch (error: any) {
        results.push({ leadId, success: false, error: error.message });
      }
    }
    return results;
  }

  async batchClassifyReplies(leadIds: string[]) {
    const results = [];
    for (const leadId of leadIds) {
      try {
        const result = await this.classifyReply(leadId);
        results.push({ leadId, success: true, count: result.length });
      } catch (error: any) {
        results.push({ leadId, success: false, error: error.message });
      }
    }
    return results;
  }
}
