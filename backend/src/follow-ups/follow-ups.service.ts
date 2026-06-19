import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { FollowUpStatus } from '@prisma/client';
import { AiAnalysisService } from '../ai-analysis/ai-analysis.service';

@Injectable()
export class FollowUpsService {
  constructor(
    private prisma: PrismaService,
    private aiService: AiAnalysisService,
  ) {}

  async findAll(leadId: string) {
    return this.prisma.followUp.findMany({
      where: { leadId },
      orderBy: { sequence: 'asc' },
    });
  }

  async create(leadId: string, userId: string, data: any) {
    return this.prisma.followUp.create({
      data: {
        ...data,
        leadId,
        userId,
      },
    });
  }

  async generateSequence(leadId: string, userId: string, count: number = 4, provider?: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    const followUps = [];
    const previousMessages = lead.messages || [];

    for (let i = 1; i <= count; i++) {
      const result = await this.aiService.generateFollowUp(leadId, i, previousMessages, provider);
      
      const scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() + (i * 3)); // Every 3 days

      const followUp = await this.prisma.followUp.create({
        data: {
          leadId,
          userId,
          sequence: i,
          type: 'EMAIL',
          content: result.content,
          status: FollowUpStatus.SCHEDULED,
          scheduledAt,
        },
      });

      followUps.push(followUp);
    }

    return followUps;
  }

  async updateStatus(id: string, status: FollowUpStatus) {
    return this.prisma.followUp.update({
      where: { id },
      data: { status },
    });
  }
}