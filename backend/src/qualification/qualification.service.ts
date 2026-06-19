import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { Temperature, Priority } from '@prisma/client';

export interface BANTCriteria {
  budget: { hasBudget: boolean; score: number; indicators: string[] };
  authority: { hasAuthority: boolean; score: number; indicators: string[] };
  need: { hasNeed: boolean; score: number; indicators: string[] };
  timeline: { hasTimeline: boolean; score: number; indicators: string[] };
}

export interface QualificationResult {
  leadId: string;
  bant: BANTCriteria;
  totalScore: number;
  isQualified: boolean;
  qualificationLevel: 'cold' | 'warm' | 'hot' | 'qualified';
  reasons: string[];
  opportunityCreated: boolean;
}

@Injectable()
export class QualificationService {
  private readonly logger = new Logger(QualificationService.name);

  constructor(
    private prisma: PrismaService,
    private opportunitiesService: OpportunitiesService,
  ) {}

  /**
   * Qualify a lead based on BANT criteria, scoring, website audit, and AI analysis
   */
  async qualifyLead(leadId: string, organizationId: string, userId: string): Promise<QualificationResult> {
    this.logger.log(`Qualifying lead ${leadId}`);

    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, organizationId },
      include: {
        websiteAudit: true,
        scoringResults: true,
        aiReport: true,
        contacts: true,
      },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    // Evaluate BANT criteria
    const bant = this.evaluateBANT(lead);

    // Calculate total score (max 100)
    const totalScore = Math.round(
      (bant.budget.score * 0.25) +
      (bant.authority.score * 0.25) +
      (bant.need.score * 0.25) +
      (bant.timeline.score * 0.25)
    );

    // Determine qualification level
    let qualificationLevel: 'cold' | 'warm' | 'hot' | 'qualified' = 'cold';
    if (totalScore >= 81) qualificationLevel = 'qualified';
    else if (totalScore >= 61) qualificationLevel = 'hot';
    else if (totalScore >= 41) qualificationLevel = 'warm';

    const isQualified = totalScore >= 61;

    // Build reasons
    const reasons = this.buildReasons(bant, totalScore);

    // Save qualification log
    await this.prisma.qualificationLog.create({
      data: {
        leadId,
        hasBudget: bant.budget.hasBudget,
        budgetScore: bant.budget.score,
        hasAuthority: bant.authority.hasAuthority,
        authorityScore: bant.authority.score,
        hasNeed: bant.need.hasNeed,
        needScore: bant.need.score,
        hasTimeline: bant.timeline.hasTimeline,
        timelineScore: bant.timeline.score,
        totalScore,
        isQualified,
        reasons: reasons as any,
      },
    });

    // Auto-create opportunity for qualified leads
    let opportunityCreated = false;
    if (isQualified) {
      try {
        // Check if opportunity already exists
        const existing = await this.prisma.opportunity.findFirst({
          where: { leadId, organizationId },
        });

        if (!existing) {
          await this.opportunitiesService.createFromLead(organizationId, userId, leadId);
          opportunityCreated = true;
        }

        // Update lead status to qualified
        await this.prisma.lead.update({
          where: { id: leadId },
          data: {
            status: 'QUALIFIED' as any,
            temperature: totalScore >= 80 ? Temperature.HOT : Temperature.WARM,
            priority: totalScore >= 80 ? Priority.HIGH : Priority.MEDIUM,
          },
        });

        // Log activity
        await this.prisma.activity.create({
          data: {
            type: 'LEAD_QUALIFIED',
            description: `Lead qualified with score ${totalScore}/100 (${qualificationLevel})`,
            leadId,
            userId,
          },
        });
      } catch (error: any) {
        this.logger.error(`Failed to create opportunity for qualified lead: ${error.message}`);
      }
    }

    this.logger.log(`Lead ${leadId} qualification: ${totalScore}/100 - ${qualificationLevel}`);

    return {
      leadId,
      bant,
      totalScore,
      isQualified,
      qualificationLevel,
      reasons,
      opportunityCreated,
    };
  }

  /**
   * Batch qualify multiple leads
   */
  async batchQualify(leadIds: string[], organizationId: string, userId: string): Promise<QualificationResult[]> {
    const results: QualificationResult[] = [];

    for (const leadId of leadIds) {
      try {
        const result = await this.qualifyLead(leadId, organizationId, userId);
        results.push(result);
      } catch (error: any) {
        this.logger.error(`Failed to qualify lead ${leadId}: ${error.message}`);
        results.push({
          leadId,
          bant: this.emptyBANT(),
          totalScore: 0,
          isQualified: false,
          qualificationLevel: 'cold',
          reasons: [`Error: ${error.message}`],
          opportunityCreated: false,
        });
      }
    }

    return results;
  }

  /**
   * Get qualification history for a lead
   */
  async getQualificationHistory(leadId: string) {
    return this.prisma.qualificationLog.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private evaluateBANT(lead: any): BANTCriteria {
    return {
      budget: this.evaluateBudget(lead),
      authority: this.evaluateAuthority(lead),
      need: this.evaluateNeed(lead),
      timeline: this.evaluateTimeline(lead),
    };
  }

  private evaluateBudget(lead: any) {
    const indicators: string[] = [];
    let score = 0;
    let hasBudget = false;

    // Revenue signals
    if (lead.revenue) {
      score += 30;
      indicators.push(`Company revenue: ${lead.revenue}`);
      hasBudget = true;
    }

    // Employee count signals budget
    if (lead.employeeCount) {
      const empStr = lead.employeeCount.toString();
      if (empStr.includes('500')) { score += 25; hasBudget = true; }
      else if (empStr.includes('100')) { score += 20; hasBudget = true; }
      else if (empStr.includes('50')) { score += 15; hasBudget = true; }
      else if (empStr.includes('10')) { score += 10; }
      indicators.push(`Team size: ${lead.employeeCount}`);
    }

    // Funding signals
    if (lead.signals && Array.isArray(lead.signals)) {
      for (const signal of lead.signals) {
        if (signal.type === 'FUNDING') {
          score += 25;
          indicators.push(signal.message);
          hasBudget = true;
        }
      }
    }

    // AI analysis signals
    if (lead.aiReport?.estimatedDealValue) {
      score += 15;
      indicators.push(`AI estimated deal value: ${lead.aiReport.estimatedDealValue}`);
    }

    return { hasBudget, score: Math.min(100, score), indicators };
  }

  private evaluateAuthority(lead: any) {
    const indicators: string[] = [];
    let score = 0;
    let hasAuthority = false;

    // Decision maker contact
    if (lead.contacts && lead.contacts.length > 0) {
      const decisionMakers = lead.contacts.filter((c: any) => c.isDecisionMaker);
      if (decisionMakers.length > 0) {
        score += 40;
        hasAuthority = true;
        indicators.push(`${decisionMakers.length} decision maker(s) identified`);
      }

      // Any contact with title
      const titledContacts = lead.contacts.filter((c: any) => c.jobTitle);
      if (titledContacts.length > 0) {
        score += 20;
        indicators.push(`Contacts with titles: ${titledContacts.map((c: any) => c.jobTitle).join(', ')}`);
      }
    }

    // Contact name present
    if (lead.contactName) {
      score += 15;
      indicators.push(`Primary contact: ${lead.contactName}`);
    }

    // Social profiles indicate business presence
    if (lead.linkedInUrl) {
      score += 10;
      indicators.push('LinkedIn profile found');
    }

    return { hasAuthority, score: Math.min(100, score), indicators };
  }

  private evaluateNeed(lead: any) {
    const indicators: string[] = [];
    let score = 0;
    let hasNeed = false;

    // Website audit signals
    if (lead.websiteAudit) {
      const audit = lead.websiteAudit;
      if (!audit.hasSSL) { score += 15; indicators.push('Website lacks SSL'); hasNeed = true; }
      if (!audit.isMobileResponsive) { score += 15; indicators.push('Not mobile responsive'); hasNeed = true; }
      if (!audit.hasMetaTags) { score += 10; indicators.push('Poor SEO - no meta tags'); hasNeed = true; }
      if ((audit.lighthousePerformance || 0) < 50) { score += 15; indicators.push('Poor website performance'); hasNeed = true; }
    }

    // No website = high need
    if (!lead.website) {
      score += 30;
      indicators.push('No website - high need');
      hasNeed = true;
    }

    // AI analysis weaknesses
    if (lead.aiReport?.technicalWeaknesses && Array.isArray(lead.aiReport.technicalWeaknesses)) {
      score += Math.min(20, lead.aiReport.technicalWeaknesses.length * 5);
      for (const w of lead.aiReport.technicalWeaknesses) {
        indicators.push(typeof w === 'string' ? w : w.description);
      }
      if (lead.aiReport.technicalWeaknesses.length > 0) hasNeed = true;
    }

    // Intent signals
    if (lead.signals && Array.isArray(lead.signals)) {
      for (const signal of lead.signals) {
        if (signal.type === 'INTENT_SIGNAL') {
          score += 20;
          indicators.push(`Intent: ${signal.message}`);
          hasNeed = true;
        }
      }
    }

    // Scoring result
    if (lead.scoringResults) {
      const sr = Array.isArray(lead.scoringResults) ? lead.scoringResults[0] : lead.scoringResults;
      if (sr?.websiteScore > 30) {
        score += 10;
        indicators.push(`Website issues score: ${sr.websiteScore}`);
      }
    }

    return { hasNeed, score: Math.min(100, score), indicators };
  }

  private evaluateTimeline(lead: any) {
    const indicators: string[] = [];
    let score = 0;
    let hasTimeline = false;

    // Hiring signals = immediate need
    if (lead.signals && Array.isArray(lead.signals)) {
      for (const signal of lead.signals) {
        if (signal.type === 'HIRING') {
          score += 30;
          indicators.push(`Hiring signal: ${signal.message}`);
          hasTimeline = true;
        }
        if (signal.type === 'GROWTH') {
          score += 20;
          indicators.push(`Growth signal: ${signal.message}`);
          hasTimeline = true;
        }
      }
    }

    // Growth signals from AI
    if (lead.aiReport?.growthSignals && Array.isArray(lead.aiReport.growthSignals)) {
      score += Math.min(25, lead.aiReport.growthSignals.length * 5);
      for (const g of lead.aiReport.growthSignals) {
        indicators.push(typeof g === 'string' ? g : g.description);
      }
      if (lead.aiReport.growthSignals.length > 0) hasTimeline = true;
    }

    // Recent funding = immediate budget
    if (lead.signals && Array.isArray(lead.signals)) {
      for (const signal of lead.signals) {
        if (signal.type === 'FUNDING') {
          score += 25;
          indicators.push(`Recent funding: ${signal.message}`);
          hasTimeline = true;
        }
      }
    }

    // Opportunities from AI report
    if (lead.aiReport?.opportunities && Array.isArray(lead.aiReport.opportunities)) {
      score += Math.min(15, lead.aiReport.opportunities.length * 3);
      hasTimeline = true;
    }

    return { hasTimeline, score: Math.min(100, score), indicators };
  }

  private buildReasons(bant: BANTCriteria, totalScore: number): string[] {
    const reasons: string[] = [];
    reasons.push(`Overall qualification score: ${totalScore}/100`);

    if (bant.budget.hasBudget) {
      reasons.push(`Budget: Positive signals (${bant.budget.score}/100) - ${bant.budget.indicators.join(', ')}`);
    } else {
      reasons.push(`Budget: Limited signals (${bant.budget.score}/100)`);
    }

    if (bant.authority.hasAuthority) {
      reasons.push(`Authority: Decision makers identified (${bant.authority.score}/100)`);
    } else {
      reasons.push(`Authority: Limited contact information (${bant.authority.score}/100)`);
    }

    if (bant.need.hasNeed) {
      reasons.push(`Need: Clear pain points identified (${bant.need.score}/100)`);
    } else {
      reasons.push(`Need: Limited need signals (${bant.need.score}/100)`);
    }

    if (bant.timeline.hasTimeline) {
      reasons.push(`Timeline: Urgency indicators present (${bant.timeline.score}/100)`);
    } else {
      reasons.push(`Timeline: No urgency signals (${bant.timeline.score}/100)`);
    }

    return reasons;
  }

  private emptyBANT(): BANTCriteria {
    return {
      budget: { hasBudget: false, score: 0, indicators: [] },
      authority: { hasAuthority: false, score: 0, indicators: [] },
      need: { hasNeed: false, score: 0, indicators: [] },
      timeline: { hasTimeline: false, score: 0, indicators: [] },
    };
  }
}
