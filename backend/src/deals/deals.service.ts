import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { DealStatus } from '@prisma/client';

@Injectable()
export class DealsService {
  private readonly logger = new Logger(DealsService.name);

  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, userId: string, data: {
    opportunityId: string;
    title?: string;
    description?: string;
    value: number;
    currency?: string;
    assignedToId?: string;
  }) {
    // Verify opportunity exists and belongs to org
    const opportunity = await this.prisma.opportunity.findFirst({
      where: { id: data.opportunityId, organizationId },
      include: { lead: { select: { businessName: true } } },
    });

    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

    const deal = await this.prisma.deal.create({
      data: {
        title: data.title || `${opportunity.lead.businessName} - Deal`,
        description: data.description,
        value: data.value,
        currency: data.currency || 'USD',
        opportunityId: data.opportunityId,
        organizationId,
        assignedToId: data.assignedToId || opportunity.assignedToId,
        status: DealStatus.PENDING,
      },
      include: {
        opportunity: {
          include: {
            lead: { select: { businessName: true } },
          },
        },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Log activity
    await this.prisma.activity.create({
      data: {
        type: 'DEAL_CREATED',
        description: `Deal "${deal.title}" created`,
        leadId: opportunity.leadId,
        userId,
        opportunityId: data.opportunityId,
      },
    });

    this.logger.log(`Deal created: ${deal.title} (${deal.id})`);
    return deal;
  }

  async findAll(organizationId: string, query: {
    page?: number;
    limit?: number;
    status?: string;
    assignedToId?: string;
  }) {
    const { page = 1, limit = 20, status, assignedToId } = query;
    const skip = (page - 1) * limit;

    const where: any = { organizationId };
    if (status) where.status = status;
    if (assignedToId) where.assignedToId = assignedToId;

    const [deals, total] = await Promise.all([
      this.prisma.deal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          opportunity: {
            include: {
              lead: { select: { businessName: true, industry: true } },
              currentStage: { select: { name: true } },
            },
          },
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.deal.count({ where }),
    ]);

    return {
      data: deals,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(organizationId: string, id: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, organizationId },
      include: {
        opportunity: {
          include: {
            lead: { select: { businessName: true, industry: true, score: true } },
            currentStage: true,
            insights: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    return deal;
  }

  async update(organizationId: string, id: string, data: {
    title?: string;
    description?: string;
    value?: number;
    currency?: string;
    assignedToId?: string;
  }) {
    const deal = await this.prisma.deal.updateMany({
      where: { id, organizationId },
      data: { ...data, updatedAt: new Date() },
    });

    if (deal.count === 0) {
      throw new NotFoundException('Deal not found');
    }

    return this.findOne(organizationId, id);
  }

  async close(organizationId: string, userId: string, id: string) {
    const deal = await this.findOne(organizationId, id);

    const updated = await this.prisma.deal.update({
      where: { id, organizationId },
      data: {
        status: DealStatus.COMPLETED,
        closeDate: new Date(),
        updatedAt: new Date(),
      },
    });

    // Log activity
    await this.prisma.activity.create({
      data: {
        type: 'DEAL_CLOSED',
        description: `Deal "${deal.title}" closed`,
        leadId: deal.opportunity.leadId,
        userId,
        opportunityId: deal.opportunityId,
      },
    });

    return updated;
  }

  async cancel(organizationId: string, userId: string, id: string, reason?: string) {
    const deal = await this.findOne(organizationId, id);

    const updated = await this.prisma.deal.update({
      where: { id, organizationId },
      data: {
        status: DealStatus.CANCELLED,
        closeDate: new Date(),
        closeReason: reason,
        updatedAt: new Date(),
      },
    });

    // Log activity
    await this.prisma.activity.create({
      data: {
        type: 'DEAL_CANCELLED',
        description: `Deal "${deal.title}" cancelled${reason ? ': ' + reason : ''}`,
        leadId: deal.opportunity.leadId,
        userId,
        opportunityId: deal.opportunityId,
      },
    });

    return updated;
  }

  async delete(organizationId: string, id: string) {
    const deal = await this.findOne(organizationId, id);

    await this.prisma.deal.delete({
      where: { id, organizationId },
    });

    return { message: 'Deal deleted' };
  }

  async getStats(organizationId: string) {
    const [
      totalDeals,
      byStatus,
      totalValue,
      avgValue,
      recentClosed,
    ] = await Promise.all([
      this.prisma.deal.count({ where: { organizationId } }),
      this.prisma.deal.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: { status: true },
      }),
      this.prisma.deal.aggregate({
        where: { organizationId },
        _sum: { value: true },
      }),
      this.prisma.deal.aggregate({
        where: { organizationId },
        _avg: { value: true },
      }),
      this.prisma.deal.count({
        where: {
          organizationId,
          closeDate: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return {
      total: totalDeals,
      byStatus: Object.fromEntries(byStatus.map(s => [s.status, s._count.status])),
      totalValue: totalValue._sum.value || 0,
      averageValue: avgValue._avg.value || 0,
      recentClosed,
    };
  }
}
