import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { PipelineType } from '@prisma/client';

@Injectable()
export class PipelinesService {
  private readonly logger = new Logger(PipelinesService.name);

  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, data: {
    name: string;
    description?: string;
    type?: PipelineType;
  }) {
    // Create pipeline with default stages
    const pipeline = await this.prisma.pipeline.create({
      data: {
        name: data.name,
        description: data.description,
        type: data.type || PipelineType.SALES,
        organizationId,
        stages: {
          create: [
            { name: 'New', order: 0, winProbability: 10, color: '#94A3B8', expectedDays: 3 },
            { name: 'Qualified', order: 1, winProbability: 25, color: '#3B82F6', expectedDays: 7 },
            { name: 'Proposal Sent', order: 2, winProbability: 50, color: '#8B5CF6', expectedDays: 14 },
            { name: 'Negotiation', order: 3, winProbability: 75, color: '#F59E0B', expectedDays: 7 },
            { name: 'Won', order: 4, winProbability: 100, color: '#10B981', expectedDays: 0 },
            { name: 'Lost', order: 5, winProbability: 0, color: '#EF4444', expectedDays: 0 },
          ],
        },
      },
      include: { stages: { orderBy: { order: 'asc' } } },
    });

    this.logger.log(`Pipeline created: ${pipeline.name} (${pipeline.id})`);
    return pipeline;
  }

  async findAll(organizationId: string) {
    return this.prisma.pipeline.findMany({
      where: { organizationId },
      include: {
        stages: { orderBy: { order: 'asc' } },
        _count: { select: { opportunities: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id, organizationId },
      include: {
        stages: {
          orderBy: { order: 'asc' },
          include: {
            _count: { select: { opportunities: true } },
          },
        },
        opportunities: {
          take: 20,
          include: {
            lead: { select: { businessName: true, industry: true, score: true } },
            assignedTo: { select: { id: true, firstName: true, lastName: true } },
            insights: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
    });

    if (!pipeline) {
      throw new NotFoundException('Pipeline not found');
    }

    return pipeline;
  }

  async update(organizationId: string, id: string, data: {
    name?: string;
    description?: string;
    type?: PipelineType;
  }) {
    const pipeline = await this.prisma.pipeline.updateMany({
      where: { id, organizationId },
      data,
    });

    if (pipeline.count === 0) {
      throw new NotFoundException('Pipeline not found');
    }

    return this.findOne(organizationId, id);
  }

  async delete(organizationId: string, id: string) {
    // Check if pipeline has opportunities
    const opportunityCount = await this.prisma.opportunity.count({
      where: { pipelineId: id, organizationId },
    });

    if (opportunityCount > 0) {
      throw new Error('Cannot delete pipeline with active opportunities');
    }

    await this.prisma.pipeline.deleteMany({
      where: { id, organizationId },
    });

    return { message: 'Pipeline deleted' };
  }

  async getOrCreateDefault(organizationId: string) {
    let pipeline = await this.prisma.pipeline.findFirst({
      where: { organizationId, isDefault: true },
      include: { stages: { orderBy: { order: 'asc' } } },
    });

    if (!pipeline) {
      pipeline = await this.prisma.pipeline.create({
        data: {
          name: 'Sales Pipeline',
          description: 'Default sales pipeline',
          type: PipelineType.SALES,
          isDefault: true,
          organizationId,
          stages: {
            create: [
              { name: 'New', order: 0, winProbability: 10, color: '#94A3B8', expectedDays: 3 },
              { name: 'Qualified', order: 1, winProbability: 25, color: '#3B82F6', expectedDays: 7 },
              { name: 'Proposal Sent', order: 2, winProbability: 50, color: '#8B5CF6', expectedDays: 14 },
              { name: 'Negotiation', order: 3, winProbability: 75, color: '#F59E0B', expectedDays: 7 },
              { name: 'Won', order: 4, winProbability: 100, color: '#10B981', expectedDays: 0 },
              { name: 'Lost', order: 5, winProbability: 0, color: '#EF4444', expectedDays: 0 },
            ],
          },
        },
        include: { stages: { orderBy: { order: 'asc' } } },
      });

      this.logger.log(`Default pipeline created for organization ${organizationId}`);
    }

    return pipeline;
  }

  async getPipelineMetrics(organizationId: string, pipelineId: string) {
    const stages = await this.prisma.pipelineStage.findMany({
      where: { pipelineId },
      include: {
        _count: { select: { opportunities: true } },
        opportunities: {
          select: {
            estimatedValue: true,
            status: true,
          },
        },
      },
    });

    let totalValue = 0;
    let weightedValue = 0;
    let totalOpportunities = 0;

    for (const stage of stages) {
      totalOpportunities += stage._count.opportunities;
      for (const opp of stage.opportunities) {
        if (opp.estimatedValue) {
          totalValue += Number(opp.estimatedValue);
          weightedValue += Number(opp.estimatedValue) * (stage.winProbability / 100);
        }
      }
    }

    return {
      stages: stages.map(s => ({
        id: s.id,
        name: s.name,
        opportunityCount: s._count.opportunities,
        winProbability: s.winProbability,
      })),
      totalOpportunities,
      totalValue,
      weightedValue,
    };
  }
}
