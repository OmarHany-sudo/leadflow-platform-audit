import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { Temperature, Priority } from '@prisma/client';

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);
  private weights: Record<string, number>;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.weights = this.configService.get('ai.scoringWeights', {
      noWebsite: 50,
      poorWebsite: 25,
      poorSEO: 20,
      slowWebsite: 15,
      noSSL: 10,
      weakBranding: 10,
      hiringActivity: 20,
      recentFunding: 30,
      intentSignal: 50,
      growingBusiness: 25,
    });
  }

  async scoreLead(leadId: string, organizationId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, organizationId },
      include: {
        websiteAudit: true,
        scoringResults: true,
      },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    const scores = {
      websiteScore: 0,
      growthScore: 0,
      hiringScore: 0,
      intentScore: 0,
    };

    const signals: any[] = [];

    // Website signals
    if (!lead.website) {
      scores.websiteScore += this.weights.noWebsite;
      signals.push({ type: 'NO_WEBSITE', score: this.weights.noWebsite, message: 'Business has no website' });
    } else if (lead.websiteAudit) {
      const audit = lead.websiteAudit;
      
      if (!audit.hasSSL) {
        scores.websiteScore += this.weights.noSSL;
        signals.push({ type: 'NO_SSL', score: this.weights.noSSL, message: 'Website lacks SSL certificate' });
      }
      
      if (!audit.isMobileResponsive) {
        scores.websiteScore += this.weights.poorWebsite;
        signals.push({ type: 'NOT_MOBILE_FRIENDLY', score: this.weights.poorWebsite, message: 'Website is not mobile responsive' });
      }

      const lighthousePerf = audit.lighthousePerformance || 0;
      if (lighthousePerf < 50) {
        scores.websiteScore += this.weights.slowWebsite;
        signals.push({ type: 'SLOW_WEBSITE', score: this.weights.slowWebsite, message: `Performance score: ${lighthousePerf}` });
      }

      if (!audit.hasMetaTags) {
        scores.websiteScore += this.weights.poorSEO;
        signals.push({ type: 'POOR_SEO', score: this.weights.poorSEO, message: 'Missing SEO meta tags' });
      }

      if (lighthousePerf < 30) {
        scores.websiteScore += this.weights.poorWebsite;
        signals.push({ type: 'POOR_DESIGN', score: this.weights.poorWebsite, message: 'Very poor website performance' });
      }
    }

    // Intent signals from raw data
    if (lead.signals && Array.isArray(lead.signals)) {
      for (const signal of lead.signals) {
        if (signal.type === 'INTENT_SIGNAL') {
          scores.intentScore += this.weights.intentSignal;
          signals.push({ type: 'INTENT_SIGNAL', score: this.weights.intentSignal, message: signal.message });
        }
        if (signal.type === 'HIRING') {
          scores.hiringScore += this.weights.hiringActivity;
          signals.push({ type: 'HIRING', score: this.weights.hiringActivity, message: signal.message });
        }
        if (signal.type === 'FUNDING') {
          scores.growthScore += this.weights.recentFunding;
          signals.push({ type: 'FUNDING', score: this.weights.recentFunding, message: signal.message });
        }
        if (signal.type === 'GROWTH') {
          scores.growthScore += this.weights.growingBusiness;
          signals.push({ type: 'GROWTH', score: this.weights.growingBusiness, message: signal.message });
        }
      }
    }

    // Calculate total score (0-100)
    const totalScore = Math.min(100, 
      scores.websiteScore + 
      scores.growthScore + 
      scores.hiringScore + 
      scores.intentScore
    );

    // Determine temperature
    let temperature = Temperature.COLD;
    if (totalScore >= 80) temperature = Temperature.HOT;
    else if (totalScore >= 50) temperature = Temperature.WARM;

    // Determine priority
    let priority = Priority.LOW;
    if (totalScore >= 80) priority = Priority.CRITICAL;
    else if (totalScore >= 60) priority = Priority.HIGH;
    else if (totalScore >= 40) priority = Priority.MEDIUM;

    // Save scoring result
    const result = await this.prisma.scoringResult.upsert({
      where: { leadId },
      create: {
        leadId,
        ...scores,
        signals: signals as any,
        totalScore,
        factors: [
          { name: 'Website Issues', score: scores.websiteScore, max: 100 },
          { name: 'Growth Signals', score: scores.growthScore, max: 100 },
          { name: 'Hiring Signals', score: scores.hiringScore, max: 100 },
          { name: 'Intent Signals', score: scores.intentScore, max: 100 },
        ] as any,
      },
      update: {
        ...scores,
        signals: signals as any,
        totalScore,
        factors: [
          { name: 'Website Issues', score: scores.websiteScore, max: 100 },
          { name: 'Growth Signals', score: scores.growthScore, max: 100 },
          { name: 'Hiring Signals', score: scores.hiringScore, max: 100 },
          { name: 'Intent Signals', score: scores.intentScore, max: 100 },
        ] as any,
        updatedAt: new Date(),
      },
    });

    // Update lead score
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { score: totalScore, temperature, priority, signals: signals as any },
    });

    this.logger.log(`Lead scored: ${lead.businessName} = ${totalScore} (${temperature})`);
    return result;
  }

  async getScore(leadId: string) {
    return this.prisma.scoringResult.findUnique({
      where: { leadId },
    });
  }

  async rescoreLead(leadId: string, organizationId: string) {
    return this.scoreLead(leadId, organizationId);
  }
}