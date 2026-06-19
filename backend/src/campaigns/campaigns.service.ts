import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CampaignStatus, CampaignLeadStatus } from '@prisma/client';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private prisma: PrismaService,
    private queueService: QueueService,
  ) {}

  async create(organizationId: string, userId: string, data: any) {
    const campaign = await this.prisma.campaign.create({
      data: {
        ...data,
        organizationId,
        createdById: userId,
        status: CampaignStatus.DRAFT,
      },
    });

    this.logger.log(`Campaign created: ${campaign.name} (${campaign.id})`);
    return campaign;
  }

  async findAll(organizationId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    
    const [campaigns, total] = await Promise.all([
      this.prisma.campaign.findMany({
        where: { organizationId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          _count: {
            select: { leads: true, messages: true },
          },
        },
      }),
      this.prisma.campaign.count({ where: { organizationId } }),
    ]);

    return { data: campaigns, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(organizationId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, organizationId },
      include: {
        leads: {
          include: {
            lead: true,
          },
        },
        messages: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    return campaign;
  }

  async update(organizationId: string, id: string, data: any) {
    const campaign = await this.prisma.campaign.update({
      where: { id, organizationId },
      data,
    });

    return campaign;
  }

  async delete(organizationId: string, id: string) {
    await this.prisma.campaign.delete({
      where: { id, organizationId },
    });

    return { message: 'Campaign deleted' };
  }

  async addLeads(organizationId: string, campaignId: string, leadIds: string[]) {
    const campaign = await this.findOne(organizationId, campaignId);

    const campaignLeads = await Promise.all(
      leadIds.map(leadId =>
        this.prisma.campaignLead.upsert({
          where: { campaignId_leadId: { campaignId, leadId } },
          create: {
            campaignId,
            leadId,
            status: CampaignLeadStatus.PENDING,
          },
          update: {},
        }),
      ),
    );

    // Update total leads count
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        totalLeads: { increment: leadIds.length },
      },
    });

    return campaignLeads;
  }

  async launch(organizationId: string, campaignId: string, userId: string) {
    const campaign = await this.findOne(organizationId, campaignId);

    if (campaign.status === 'RUNNING') {
      throw new Error('Campaign is already running');
    }

    // Update status
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.RUNNING,
        startedAt: new Date(),
      },
    });

    // Queue campaign job
    await this.queueService.addCampaignJob({
      campaignId,
      organizationId,
      userId,
    });

    this.logger.log(`Campaign launched: ${campaign.name} (${campaignId})`);

    return { message: 'Campaign launched', campaignId };
  }

  async getStats(organizationId: string) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { organizationId },
      select: {
        status: true,
        totalLeads: true,
        sentCount: true,
        openedCount: true,
        repliedCount: true,
        convertedCount: true,
      },
    });

    const byStatus = campaigns.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalSent = campaigns.reduce((sum, c) => sum + c.sentCount, 0);
    const totalOpened = campaigns.reduce((sum, c) => sum + c.openedCount, 0);
    const totalReplied = campaigns.reduce((sum, c) => sum + c.repliedCount, 0);

    return {
      total: campaigns.length,
      byStatus,
      openRate: totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : '0',
      replyRate: totalSent > 0 ? ((totalReplied / totalSent) * 100).toFixed(1) : '0',
    };
  }
}