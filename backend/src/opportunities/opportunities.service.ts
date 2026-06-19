import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { OpportunityStatus, Priority } from '@prisma/client';
import { PipelinesService } from '../pipelines/pipelines.service';

@Injectable()
export class OpportunitiesService {
  private readonly logger = new Logger(OpportunitiesService.name);

  constructor(
    private prisma: PrismaService,
    private pipelinesService: PipelinesService,
  ) {}

  async create(organizationId: string, userId: string, data: {
    title: string;
    description?: string;
    leadId: string;
    pipelineId?: string;
    stageId?: string;
    estimatedValue?: number;
    currency?: string;
    expectedCloseDate?: string;
    priority?: string;
    assignedToId?: string;
  }) {
    // Get or create default pipeline
    let pipelineId = data.pipelineId;
    let stageId = data.stageId;

    if (!pipelineId) {
      const defaultPipeline = await this.pipelinesService.getOrCreateDefault(organizationId);
      pipelineId = defaultPipeline.id;

      if (!stageId && defaultPipeline.stages.length > 0) {
        // Find the "New" or first non-terminal stage
        const newStage = defaultPipeline.stages.find(s => s.name.toLowerCase() === 'new')
          || defaultPipeline.stages[0];
        stageId = newStage.id;
      }
    }

    if (!stageId) {
      throw new Error('No stage ID provided and could not determine default stage');
    }

    const opportunity = await this.prisma.opportunity.create({
      data: {
        title: data.title,
        description: data.description,
        leadId: data.leadId,
        pipelineId: pipelineId!,
        currentStageId: stageId!,
        organizationId,
        estimatedValue: data.estimatedValue ? data.estimatedValue : null,
        currency: data.currency || 'USD',
        expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : null,
        priority: (data.priority as Priority) || Priority.MEDIUM,
        assignedToId: data.assignedToId,
        status: OpportunityStatus.OPEN,
        source: 'MANUAL',
      },
      include: {
        lead: { select: { businessName: true, industry: true, score: true } },
        currentStage: true,
        pipeline: true,
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Log activity
    await this.prisma.activity.create({
      data: {
        type: 'OPPORTUNITY_CREATED',
        description: `Opportunity "${opportunity.title}" created`,
        leadId: data.leadId,
        userId,
        opportunityId: opportunity.id,
      },
    });

    this.logger.log(`Opportunity created: ${opportunity.title} (${opportunity.id})`);
    return opportunity;
  }

  async createFromLead(organizationId: string, userId: string, leadId: string) {
    // Get lead details
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, organizationId },
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    // Check if opportunity already exists
    const existing = await this.prisma.opportunity.findFirst({
      where: { leadId, organizationId },
    });

    if (existing) {
      return existing;
    }

    // Get default pipeline
    const defaultPipeline = await this.pipelinesService.getOrCreateDefault(organizationId);
    const newStage = defaultPipeline.stages.find(s => s.name.toLowerCase() === 'new')
      || defaultPipeline.stages[0];

    // Create opportunity
    const opportunity = await this.prisma.opportunity.create({
      data: {
        title: `${lead.businessName} - Opportunity`,
        description: `Auto-generated from qualified lead: ${lead.businessName}`,
        leadId,
        pipelineId: defaultPipeline.id,
        currentStageId: newStage.id,
        organizationId,
        estimatedValue: this.estimateValue(lead),
        priority: this.mapPriority(lead.priority),
        status: OpportunityStatus.OPEN,
        source: 'QUALIFIED_LEAD',
        assignedToId: lead.assignedToId,
      },
      include: {
        lead: { select: { businessName: true, industry: true, score: true } },
        currentStage: true,
      },
    });

    // Log activity
    await this.prisma.activity.create({
      data: {
        type: 'OPPORTUNITY_CREATED',
        description: `Opportunity auto-created from qualified lead: ${lead.businessName}`,
        leadId,
        userId,
        opportunityId: opportunity.id,
      },
    });

    this.logger.log(`Opportunity auto-created for lead: ${lead.businessName}`);
    return opportunity;
  }

  async findAll(organizationId: string, query: {
    page?: number;
    limit?: number;
    status?: string;
    pipelineId?: string;
    assignedToId?: string;
    search?: string;
    priority?: string;
  }) {
    const { page = 1, limit = 20, status, pipelineId, assignedToId, search, priority } = query;
    const skip = (page - 1) * limit;

    const where: any = { organizationId };
    if (status) where.status = status;
    if (pipelineId) where.pipelineId = pipelineId;
    if (assignedToId) where.assignedToId = assignedToId;
    if (priority) where.priority = priority;

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { lead: { businessName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [opportunities, total] = await Promise.all([
      this.prisma.opportunity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          lead: { select: { businessName: true, industry: true, score: true } },
          currentStage: true,
          pipeline: { select: { name: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          deal: { select: { id: true, status: true, value: true } },
          insights: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.opportunity.count({ where }),
    ]);

    return {
      data: opportunities,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(organizationId: string, id: string) {
    const opportunity = await this.prisma.opportunity.findFirst({
      where: { id, organizationId },
      include: {
        lead: {
          select: {
            businessName: true, industry: true, score: true,
            email: true, phone: true, website: true, city: true, country: true,
            contacts: true, aiReport: true, scoringResults: true,
          },
        },
        currentStage: true,
        pipeline: { include: { stages: { orderBy: { order: 'asc' } } } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        deal: true,
        insights: { orderBy: { createdAt: 'desc' } },
        activities: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });

    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

    return opportunity;
  }

  async update(organizationId: string, userId: string, id: string, data: {
    title?: string;
    description?: string;
    estimatedValue?: number;
    currency?: string;
    expectedCloseDate?: string;
    priority?: string;
    assignedToId?: string;
  }) {
    const opportunity = await this.prisma.opportunity.updateMany({
      where: { id, organizationId },
      data: {
        ...data,
        expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : undefined,
        priority: data.priority as Priority,
        updatedAt: new Date(),
      },
    });

    if (opportunity.count === 0) {
      throw new NotFoundException('Opportunity not found');
    }

    // Log activity
    await this.prisma.activity.create({
      data: {
        type: 'OPPORTUNITY_UPDATED',
        description: `Opportunity updated`,
        leadId: (await this.prisma.opportunity.findUnique({ where: { id } }))!.leadId,
        userId,
        opportunityId: id,
      },
    });

    return this.findOne(organizationId, id);
  }

  async changeStage(organizationId: string, userId: string, id: string, stageId: string) {
    const opp = await this.findOne(organizationId, id);
    const oldStageId = opp.currentStageId;

    const updated = await this.prisma.opportunity.update({
      where: { id, organizationId },
      data: {
        currentStageId: stageId,
        updatedAt: new Date(),
      },
      include: { currentStage: true },
    });

    // Log activity
    await this.prisma.activity.create({
      data: {
        type: 'OPPORTUNITY_STAGE_CHANGED',
        description: `Stage changed from ${oldStageId} to ${stageId}`,
        leadId: opp.leadId,
        userId,
        opportunityId: id,
      },
    });

    return updated;
  }

  async assign(organizationId: string, userId: string, id: string, assignedToId: string) {
    const updated = await this.prisma.opportunity.updateMany({
      where: { id, organizationId },
      data: { assignedToId, updatedAt: new Date() },
    });

    if (updated.count === 0) {
      throw new NotFoundException('Opportunity not found');
    }

    return this.findOne(organizationId, id);
  }

  async markAsWon(organizationId: string, userId: string, id: string) {
    const opp = await this.findOne(organizationId, id);

    const updated = await this.prisma.opportunity.update({
      where: { id, organizationId },
      data: {
        status: OpportunityStatus.WON,
        actualValue: opp.estimatedValue,
        actualCloseDate: new Date(),
        updatedAt: new Date(),
      },
    });

    // Create deal automatically
    await this.prisma.deal.create({
      data: {
        title: `${opp.title} - Deal`,
        description: opp.description,
        value: opp.estimatedValue || 0,
        currency: opp.currency,
        status: 'PENDING',
        opportunityId: id,
        organizationId,
        assignedToId: opp.assignedToId,
      },
    });

    // Log activity
    await this.prisma.activity.create({
      data: {
        type: 'OPPORTUNITY_WON',
        description: `Opportunity won: ${opp.title}`,
        leadId: opp.leadId,
        userId,
        opportunityId: id,
      },
    });

    return updated;
  }

  async markAsLost(organizationId: string, userId: string, id: string, reason?: string) {
    const opp = await this.findOne(organizationId, id);

    const updated = await this.prisma.opportunity.update({
      where: { id, organizationId },
      data: {
        status: OpportunityStatus.LOST,
        actualCloseDate: new Date(),
        updatedAt: new Date(),
      },
    });

    // Log activity
    await this.prisma.activity.create({
      data: {
        type: 'OPPORTUNITY_LOST',
        description: `Opportunity lost${reason ? ': ' + reason : ''}`,
        leadId: opp.leadId,
        userId,
        opportunityId: id,
      },
    });

    return updated;
  }

  async delete(organizationId: string, id: string) {
    const opp = await this.findOne(organizationId, id);

    await this.prisma.opportunity.delete({
      where: { id, organizationId },
    });

    return { message: 'Opportunity deleted' };
  }

  async getStats(organizationId: string) {
    const [
      totalOpportunities,
      byStatus,
      totalValue,
      avgScore,
    ] = await Promise.all([
      this.prisma.opportunity.count({ where: { organizationId } }),
      this.prisma.opportunity.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: { status: true },
      }),
      this.prisma.opportunity.aggregate({
        where: { organizationId },
        _sum: { estimatedValue: true },
      }),
      this.prisma.opportunity.aggregate({
        where: { organizationId },
        _avg: { estimatedValue: true },
      }),
    ]);

    return {
      total: totalOpportunities,
      byStatus: Object.fromEntries(byStatus.map(s => [s.status, s._count.status])),
      totalValue: totalValue._sum.estimatedValue || 0,
      averageValue: avgScore._avg.estimatedValue || 0,
    };
  }

  private estimateValue(lead: any): number | null {
    // Simple estimation logic based on available data
    if (lead.employeeCount) {
      const empStr = lead.employeeCount.toString();
      if (empStr.includes('500')) return 50000;
      if (empStr.includes('100')) return 25000;
      if (empStr.includes('50')) return 15000;
      if (empStr.includes('10')) return 8000;
    }
    if (lead.revenue) {
      const revStr = lead.revenue.toString().toLowerCase();
      if (revStr.includes('m')) return 50000;
      if (revStr.includes('k')) return 10000;
    }
    // Default based on score
    if (lead.score >= 80) return 20000;
    if (lead.score >= 60) return 10000;
    if (lead.score >= 40) return 5000;
    return null;
  }

  private mapPriority(priority: string): Priority {
    switch (priority) {
      case 'CRITICAL': return Priority.CRITICAL;
      case 'HIGH': return Priority.HIGH;
      case 'MEDIUM': return Priority.MEDIUM;
      default: return Priority.LOW;
    }
  }
}
