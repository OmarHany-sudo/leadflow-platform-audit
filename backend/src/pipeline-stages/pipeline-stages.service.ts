import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class PipelineStagesService {
  private readonly logger = new Logger(PipelineStagesService.name);

  constructor(private prisma: PrismaService) {}

  async create(pipelineId: string, data: {
    name: string;
    description?: string;
    color?: string;
    winProbability?: number;
    expectedDays?: number;
    order?: number;
  }) {
    const maxOrder = await this.prisma.pipelineStage.aggregate({
      where: { pipelineId },
      _max: { order: true },
    });

    const stage = await this.prisma.pipelineStage.create({
      data: {
        name: data.name,
        description: data.description,
        color: data.color || '#3B82F6',
        winProbability: data.winProbability ?? 50,
        expectedDays: data.expectedDays ?? 7,
        order: data.order ?? ((maxOrder._max.order ?? -1) + 1),
        pipelineId,
      },
    });

    this.logger.log(`Stage created: ${stage.name} (${stage.id})`);
    return stage;
  }

  async findByPipeline(pipelineId: string) {
    return this.prisma.pipelineStage.findMany({
      where: { pipelineId },
      orderBy: { order: 'asc' },
      include: {
        _count: { select: { opportunities: true } },
      },
    });
  }

  async update(pipelineId: string, stageId: string, data: {
    name?: string;
    description?: string;
    color?: string;
    winProbability?: number;
    expectedDays?: number;
  }) {
    const stage = await this.prisma.pipelineStage.updateMany({
      where: { id: stageId, pipelineId },
      data,
    });

    if (stage.count === 0) {
      throw new NotFoundException('Stage not found');
    }

    return this.prisma.pipelineStage.findUnique({ where: { id: stageId } });
  }

  async reorder(pipelineId: string, stageOrders: { id: string; order: number }[]) {
    const updates = stageOrders.map(({ id, order }) =>
      this.prisma.pipelineStage.updateMany({
        where: { id, pipelineId },
        data: { order },
      }),
    );

    await this.prisma.$transaction(updates);
    return this.findByPipeline(pipelineId);
  }

  async delete(pipelineId: string, stageId: string) {
    // Check if stage has opportunities
    const opportunityCount = await this.prisma.opportunity.count({
      where: { currentStageId: stageId },
    });

    if (opportunityCount > 0) {
      throw new Error('Cannot delete stage with active opportunities');
    }

    await this.prisma.pipelineStage.deleteMany({
      where: { id: stageId, pipelineId },
    });

    return { message: 'Stage deleted' };
  }
}
