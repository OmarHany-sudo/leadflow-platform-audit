import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

export interface IntelligenceFactors {
  leadQuality: number;
  engagement: number;
  companySignals: number;
  pipelineVelocity: number;
  marketFactors: number;
}

export interface IntelligenceReport {
  opportunityId: string;
  winProbability: number;
  estimatedRevenue: string;
  recommendedServices: Array<{ service: string; confidence: number; estimatedValue: string }>;
  competitorAnalysis: Array<{ competitor: string; threat: string; ourAdvantage: string }>;
  urgencyScore: number;
  positiveFactors: string[];
  riskFactors: string[];
  factors: IntelligenceFactors;
}

@Injectable()
export class OpportunityIntelligenceService {
  private readonly logger = new Logger(OpportunityIntelligenceService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Generate comprehensive intelligence report for an opportunity
   */
  async generateReport(opportunityId: string, organizationId: string): Promise<IntelligenceReport> {
    this.logger.log(`Generating intelligence report for opportunity ${opportunityId}`);

    const opportunity = await this.prisma.opportunity.findFirst({
      where: { id: opportunityId, organizationId },
      include: {
        lead: {
          include: {
            websiteAudit: true,
            scoringResults: true,
            aiReport: true,
            messages: { orderBy: { createdAt: 'desc' }, take: 10 },
            contacts: true,
          },
        },
        currentStage: true,
        pipeline: { include: { stages: true } },
        insights: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!opportunity) {
      throw new Error('Opportunity not found');
    }

    const lead = opportunity.lead;

    // Calculate win probability
    const factors = this.calculateFactors(opportunity);
    const winProbability = this.calculateWinProbability(factors);

    // Estimate revenue
    const estimatedRevenue = this.estimateRevenue(lead, opportunity);

    // Generate service recommendations
    const recommendedServices = this.recommendServices(lead, opportunity);

    // Analyze competitors
    const competitorAnalysis = this.analyzeCompetitors(lead);

    // Calculate urgency
    const urgencyScore = this.calculateUrgency(lead, opportunity);

    // Extract factors
    const positiveFactors = this.extractPositiveFactors(factors, lead);
    const riskFactors = this.extractRiskFactors(factors, lead);

    // Save insight
    await this.prisma.opportunityInsight.create({
      data: {
        opportunityId,
        winProbability,
        estimatedRevenue,
        recommendedService: recommendedServices[0]?.service || '',
        competitorAnalysis: competitorAnalysis as any,
        urgencyScore,
        positiveFactors: positiveFactors as any,
        riskFactors: riskFactors as any,
        fullAnalysis: JSON.stringify({ factors, estimatedRevenue, recommendedServices }),
      },
    });

    return {
      opportunityId,
      winProbability,
      estimatedRevenue,
      recommendedServices,
      competitorAnalysis,
      urgencyScore,
      positiveFactors,
      riskFactors,
      factors,
    };
  }

  /**
   * Get all insights for an opportunity
   */
  async getInsights(opportunityId: string, organizationId: string) {
    const opportunity = await this.prisma.opportunity.findFirst({
      where: { id: opportunityId, organizationId },
    });

    if (!opportunity) {
      throw new Error('Opportunity not found');
    }

    return this.prisma.opportunityInsight.findMany({
      where: { opportunityId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private calculateFactors(opportunity: any): IntelligenceFactors {
    const lead = opportunity.lead;

    // Lead quality (0-100)
    const leadQuality = lead.score || 0;

    // Engagement (0-100) - based on messages
    let engagement = 0;
    if (lead.messages && lead.messages.length > 0) {
      const replies = lead.messages.filter((m: any) => m.status === 'READ' || m.status === 'DELIVERED').length;
      engagement = Math.min(100, (replies / Math.max(lead.messages.length, 1)) * 100);
      // Boost for recent messages
      const recentMessages = lead.messages.filter((m: any) =>
        m.createdAt > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      ).length;
      engagement += Math.min(30, recentMessages * 5);
      engagement = Math.min(100, engagement);
    }

    // Company signals (0-100)
    let companySignals = 0;
    if (lead.signals && Array.isArray(lead.signals)) {
      companySignals = Math.min(100, lead.signals.length * 10);
    }
    if (lead.aiReport?.growthSignals?.length) {
      companySignals += Math.min(30, lead.aiReport.growthSignals.length * 5);
    }
    companySignals = Math.min(100, companySignals);

    // Pipeline velocity (0-100) - based on stage progress
    let pipelineVelocity = 0;
    const stages = opportunity.pipeline?.stages || [];
    const currentStageIndex = stages.findIndex((s: any) => s.id === opportunity.currentStageId);
    if (stages.length > 0 && currentStageIndex >= 0) {
      pipelineVelocity = Math.round((currentStageIndex / (stages.length - 1)) * 100);
    }

    // Market factors (0-100) - based on industry
    let marketFactors = 50; // Default
    if (lead.industry) {
      const highGrowthIndustries = ['technology', 'software', 'ai', 'fintech', 'healthcare', 'ecommerce'];
      if (highGrowthIndustries.some(i => lead.industry?.toLowerCase().includes(i))) {
        marketFactors = 80;
      }
    }

    return { leadQuality, engagement, companySignals, pipelineVelocity, marketFactors };
  }

  private calculateWinProbability(factors: IntelligenceFactors): number {
    const weighted =
      (factors.leadQuality * 0.30) +
      (factors.engagement * 0.25) +
      (factors.companySignals * 0.20) +
      (factors.pipelineVelocity * 0.15) +
      (factors.marketFactors * 0.10);

    return Math.round(Math.min(100, Math.max(0, weighted)));
  }

  private estimateRevenue(lead: any, opportunity: any): string {
    const baseValue = opportunity.estimatedValue ? Number(opportunity.estimatedValue) : 0;

    if (baseValue > 0) {
      // Adjust based on score
      const scoreMultiplier = (lead.score || 50) / 50;
      const adjusted = Math.round(baseValue * scoreMultiplier);
      return `$${adjusted.toLocaleString()}`;
    }

    // Estimate from lead data
    if (lead.employeeCount) {
      const empStr = lead.employeeCount.toString();
      if (empStr.includes('500')) return '$50,000 - $100,000';
      if (empStr.includes('100')) return '$25,000 - $50,000';
      if (empStr.includes('50')) return '$15,000 - $30,000';
      if (empStr.includes('10')) return '$5,000 - $15,000';
    }

    if (lead.revenue) {
      const revStr = lead.revenue.toString().toLowerCase();
      if (revStr.includes('m')) return '$50,000 - $100,000';
      if (revStr.includes('k')) return '$10,000 - $25,000';
    }

    // Default based on score
    if (lead.score >= 80) return '$20,000 - $50,000';
    if (lead.score >= 60) return '$10,000 - $20,000';
    if (lead.score >= 40) return '$5,000 - $10,000';
    return '$1,000 - $5,000';
  }

  private recommendServices(lead: any, opportunity: any): Array<{ service: string; confidence: number; estimatedValue: string }> {
    const services: Array<{ service: string; confidence: number; estimatedValue: string }> = [];

    // Based on website audit
    if (lead.websiteAudit) {
      if (!lead.websiteAudit.hasSSL || !lead.websiteAudit.isMobileResponsive) {
        services.push({ service: 'Website Redesign', confidence: 0.92, estimatedValue: '$15,000 - $30,000' });
      }
      if (!lead.websiteAudit.hasMetaTags || !lead.websiteAudit.hasStructuredData) {
        services.push({ service: 'SEO Optimization', confidence: 0.85, estimatedValue: '$5,000 - $15,000' });
      }
      if ((lead.websiteAudit.lighthousePerformance || 100) < 50) {
        services.push({ service: 'Performance Optimization', confidence: 0.80, estimatedValue: '$8,000 - $15,000' });
      }
    }

    // No website = high confidence for web development
    if (!lead.website) {
      services.unshift({ service: 'Website Development', confidence: 0.95, estimatedValue: '$10,000 - $25,000' });
    }

    // Based on AI report recommendations
    if (lead.aiReport?.recommendedServices && Array.isArray(lead.aiReport.recommendedServices)) {
      for (const svc of lead.aiReport.recommendedServices) {
        const serviceName = typeof svc === 'string' ? svc : svc.service;
        if (!services.find(s => s.service === serviceName)) {
          services.push({ service: serviceName, confidence: 0.75, estimatedValue: '$5,000 - $20,000' });
        }
      }
    }

    // Based on industry
    if (lead.industry) {
      const industryLower = lead.industry.toLowerCase();
      if (industryLower.includes('retail') || industryLower.includes('ecommerce')) {
        if (!services.find(s => s.service === 'E-commerce Platform')) {
          services.push({ service: 'E-commerce Platform', confidence: 0.70, estimatedValue: '$20,000 - $50,000' });
        }
      }
      if (industryLower.includes('health') || industryLower.includes('medical')) {
        if (!services.find(s => s.service === 'HIPAA Compliant Solution')) {
          services.push({ service: 'HIPAA Compliant Solution', confidence: 0.75, estimatedValue: '$25,000 - $60,000' });
        }
      }
    }

    // AI automation for businesses with hiring signals
    if (lead.signals?.some((s: any) => s.type === 'HIRING')) {
      services.push({ service: 'AI Process Automation', confidence: 0.72, estimatedValue: '$15,000 - $40,000' });
    }

    return services.slice(0, 5);
  }

  private analyzeCompetitors(lead: any): Array<{ competitor: string; threat: string; ourAdvantage: string }> {
    const competitors: Array<{ competitor: string; threat: string; ourAdvantage: string }> = [];

    // Based on detected technologies
    if (lead.websiteAudit?.technologies) {
      const techs = lead.websiteAudit.technologies as string[];

      if (techs.some((t: string) => t.toLowerCase().includes('wix') || t.toLowerCase().includes('squarespace'))) {
        competitors.push({
          competitor: 'DIY Website Builders',
          threat: 'Low cost barrier but limited customization',
          ourAdvantage: 'Custom solutions with better performance and SEO',
        });
      }
      if (techs.some((t: string) => t.toLowerCase().includes('wordpress'))) {
        competitors.push({
          competitor: 'WordPress Agencies',
          threat: 'Large market presence, plugin ecosystem',
          ourAdvantage: 'Modern tech stack, better security, faster development',
        });
      }
    }

    // Generic competitors
    if (competitors.length === 0) {
      competitors.push({
        competitor: 'Local Agencies',
        threat: 'Geographic proximity, local relationships',
        ourAdvantage: 'AI-powered insights, data-driven approach, proven ROI',
      });
      competitors.push({
        competitor: 'Freelance Developers',
        threat: 'Lower pricing, flexible engagement',
        ourAdvantage: 'Full-service team, quality assurance, ongoing support',
      });
    }

    return competitors;
  }

  private calculateUrgency(lead: any, opportunity: any): number {
    let urgency = 0;

    // Negative sentiment detected
    if (lead.messages && Array.isArray(lead.messages)) {
      for (const msg of lead.messages) {
        const lower = msg.content?.toLowerCase() || '';
        if (lower.includes('urgent') || lower.includes('asap') || lower.includes('immediately')) {
          urgency += 30;
        }
      }
    }

    // Recent complaint signals
    if (lead.signals?.some((s: any) => s.type === 'COMPLAINT')) urgency += 25;

    // Hiring signal = immediate need
    if (lead.signals?.some((s: any) => s.type === 'HIRING')) urgency += 20;

    // Funding announcement
    if (lead.signals?.some((s: any) => s.type === 'FUNDING')) urgency += 15;

    // Website critical issues
    if (lead.websiteAudit) {
      if (!lead.websiteAudit.hasSSL) urgency += 10;
      if (!lead.websiteAudit.isMobileResponsive) urgency += 10;
      if ((lead.websiteAudit.lighthousePerformance || 100) < 30) urgency += 10;
    }

    // Expected close date approaching
    if (opportunity.expectedCloseDate) {
      const daysUntil = Math.ceil((new Date(opportunity.expectedCloseDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysUntil < 7) urgency += 25;
      else if (daysUntil < 14) urgency += 15;
      else if (daysUntil < 30) urgency += 5;
    }

    return Math.min(100, urgency);
  }

  private extractPositiveFactors(factors: IntelligenceFactors, lead: any): string[] {
    const positives: string[] = [];

    if (factors.leadQuality >= 70) positives.push(`High lead quality score (${factors.leadQuality})`);
    if (factors.engagement >= 50) positives.push(`Active engagement from lead (${Math.round(factors.engagement)}%)`);
    if (factors.companySignals >= 50) positives.push(`Strong company growth signals`);
    if (factors.pipelineVelocity >= 50) positives.push(`Good pipeline progression`);
    if (factors.marketFactors >= 70) positives.push(`Operating in high-growth industry`);
    if (lead.contacts?.some((c: any) => c.isDecisionMaker)) positives.push('Decision maker contact available');
    if (lead.aiReport?.recommendedServices?.length) positives.push('Clear service match identified');

    return positives;
  }

  private extractRiskFactors(factors: IntelligenceFactors, lead: any): string[] {
    const risks: string[] = [];

    if (factors.leadQuality < 40) risks.push(`Low lead quality score (${factors.leadQuality})`);
    if (factors.engagement < 20) risks.push('Limited engagement from lead');
    if (!lead.contacts || lead.contacts.length === 0) risks.push('No contact information available');
    if (!lead.website) risks.push('No existing website to assess');
    if (factors.pipelineVelocity < 20) risks.push('Slow pipeline progression');
    if (!lead.email && !lead.phone) risks.push('No direct contact method');

    return risks;
  }
}
