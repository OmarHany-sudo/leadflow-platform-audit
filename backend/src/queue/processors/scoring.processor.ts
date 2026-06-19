import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BaseProcessor } from '../base/base.processor';
import { ScoringJob } from '../queue.service';
import { Temperature, Priority } from '@prisma/client';

@Processor('scoring', {
  concurrency: 3,
  limiter: { max: 15, duration: 60000 },
  lockDuration: 30000,
  stalledInterval: 30000,
})
export class ScoringProcessor extends WorkerHost {
  private readonly logger = new Logger(ScoringProcessor.name);
  private baseProcessor: BaseProcessor<ScoringJob>;

  constructor(private prisma: PrismaService) {
    super();
    this.baseProcessor = new ScoringProcessorLogic(prisma);
  }

  async process(job: Job<ScoringJob>): Promise<any> {
    return this.baseProcessor.processWithTracking(job);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Scoring job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Scoring job ${job.id} failed: ${error.message}`);
  }
}

class ScoringProcessorLogic extends BaseProcessor<ScoringJob> {
  private weights: Record<string, number> = {
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
  };

  constructor(prisma: PrismaService) {
    super('scoring', prisma);
  }

  async process(job: Job<ScoringJob>): Promise<any> {
    const { leadId, organizationId, triggerSource } = job.data;

    // Load lead with all relations (15%)
    await this.updateProgress(job, 15, 'Loading lead data');
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, organizationId },
      include: {
        websiteAudit: true,
        scoringResults: true,
        contacts: true,
        aiReport: true,
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

    // Website signals (30%)
    await this.updateProgress(job, 30, 'Calculating website score');
    this.calculateWebsiteScore(lead, scores, signals);

    // Growth signals (45%)
    await this.updateProgress(job, 45, 'Calculating growth score');
    this.calculateGrowthScore(lead, scores, signals);

    // Hiring signals (55%)
    await this.updateProgress(job, 55, 'Calculating hiring score');
    this.calculateHiringScore(lead, scores, signals);

    // Intent signals (65%)
    await this.updateProgress(job, 65, 'Calculating intent score');
    this.calculateIntentScore(lead, scores, signals);

    // Contact quality bonus (75%)
    await this.updateProgress(job, 75, 'Evaluating contact quality');
    this.calculateContactBonus(lead, scores, signals);

    // Calculate total score (85%)
    await this.updateProgress(job, 85, 'Aggregating final score');
    const totalScore = Math.min(100,
      scores.websiteScore +
      scores.growthScore +
      scores.hiringScore +
      scores.intentScore
    );

    // Determine temperature and priority
    let temperature = Temperature.COLD;
    if (totalScore >= 80) temperature = Temperature.HOT;
    else if (totalScore >= 50) temperature = Temperature.WARM;

    let priority = Priority.LOW;
    if (totalScore >= 80) priority = Priority.CRITICAL;
    else if (totalScore >= 60) priority = Priority.HIGH;
    else if (totalScore >= 40) priority = Priority.MEDIUM;

    // Save scoring result (90%)
    await this.updateProgress(job, 90, 'Saving scoring result');
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

    // Update lead (95%)
    await this.updateProgress(job, 95, 'Updating lead score');
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { score: totalScore, temperature, priority, signals: signals as any },
    });

    // Complete (100%)
    await this.updateProgress(job, 100, `Scoring complete: ${totalScore} (${temperature})`);

    this.logger.log(`Lead scored: ${lead.businessName} = ${totalScore} (${temperature}) triggered by ${triggerSource || 'manual'}`);
    return result;
  }

  private calculateWebsiteScore(lead: any, scores: any, signals: any[]): void {
    if (!lead.website) {
      scores.websiteScore += this.weights.noWebsite;
      signals.push({ type: 'NO_WEBSITE', score: this.weights.noWebsite, message: 'Business has no website' });
      return;
    }

    if (lead.websiteAudit) {
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
  }

  private calculateGrowthScore(lead: any, scores: any, signals: any[]): void {
    if (lead.signals && Array.isArray(lead.signals)) {
      for (const signal of lead.signals) {
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

    // AI report growth signals
    if (lead.aiReport?.growthSignals && Array.isArray(lead.aiReport.growthSignals)) {
      scores.growthScore += lead.aiReport.growthSignals.length * 5;
      for (const gs of lead.aiReport.growthSignals) {
        signals.push({ type: 'GROWTH_SIGNAL', score: 5, message: typeof gs === 'string' ? gs : gs.description });
      }
    }
  }

  private calculateHiringScore(lead: any, scores: any, signals: any[]): void {
    if (lead.signals && Array.isArray(lead.signals)) {
      for (const signal of lead.signals) {
        if (signal.type === 'HIRING') {
          scores.hiringScore += this.weights.hiringActivity;
          signals.push({ type: 'HIRING', score: this.weights.hiringActivity, message: signal.message });
        }
      }
    }

    // Employee count signals
    if (lead.employeeCount) {
      const empStr = lead.employeeCount.toString();
      if (empStr.includes('50') || empStr.includes('100') || empStr.includes('500')) {
        scores.hiringScore += 10;
        signals.push({ type: 'GROWING_TEAM', score: 10, message: `Team size: ${lead.employeeCount}` });
      }
    }
  }

  private calculateIntentScore(lead: any, scores: any, signals: any[]): void {
    if (lead.signals && Array.isArray(lead.signals)) {
      for (const signal of lead.signals) {
        if (signal.type === 'INTENT_SIGNAL') {
          scores.intentScore += this.weights.intentSignal;
          signals.push({ type: 'INTENT_SIGNAL', score: this.weights.intentSignal, message: signal.message });
        }
      }
    }

    // AI report intent signals
    if (lead.aiReport?.opportunities && Array.isArray(lead.aiReport.opportunities)) {
      scores.intentScore += lead.aiReport.opportunities.length * 3;
      for (const opp of lead.aiReport.opportunities) {
        signals.push({ type: 'AI_OPPORTUNITY', score: 3, message: typeof opp === 'string' ? opp : opp.description });
      }
    }

    // Reply classification intent
    if (lead.messages && Array.isArray(lead.messages)) {
      for (const msg of lead.messages) {
        if (msg.content) {
          const lower = msg.content.toLowerCase();
          if (lower.includes('interested') || lower.includes('pricing') || lower.includes('quote')) {
            scores.intentScore += 15;
            signals.push({ type: 'REPLY_INTENT', score: 15, message: 'Positive reply detected' });
          }
        }
      }
    }
  }

  private calculateContactBonus(lead: any, scores: any, signals: any[]): void {
    if (!lead.contacts || lead.contacts.length === 0) return;

    // Bonus for having decision maker contact
    const decisionMakers = lead.contacts.filter((c: any) => c.isDecisionMaker);
    if (decisionMakers.length > 0) {
      scores.intentScore += 10;
      signals.push({ type: 'DECISION_MAKER_FOUND', score: 10, message: `${decisionMakers.length} decision maker(s) identified` });
    }

    // Bonus for multiple contacts
    if (lead.contacts.length >= 2) {
      scores.growthScore += 5;
      signals.push({ type: 'MULTI_CONTACT', score: 5, message: `${lead.contacts.length} contacts available` });
    }

    // Bonus for enriched contacts
    const enrichedContacts = lead.contacts.filter((c: any) => c.enrichedAt);
    if (enrichedContacts.length > 0) {
      scores.growthScore += 5;
      signals.push({ type: 'ENRICHED_CONTACTS', score: 5, message: `${enrichedContacts.length} contacts enriched` });
    }
  }
}
