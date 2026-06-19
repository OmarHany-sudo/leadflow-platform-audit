import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BaseProcessor } from '../base/base.processor';
import { CampaignJob } from '../queue.service';
import { CampaignStatus, CampaignLeadStatus, MessageStatus } from '@prisma/client';

@Processor('campaign', {
  concurrency: 2,
  limiter: { max: 10, duration: 60000 },
  lockDuration: 30000,
  stalledInterval: 30000,
})
export class CampaignProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignProcessor.name);
  private baseProcessor: BaseProcessor<CampaignJob>;

  constructor(private prisma: PrismaService) {
    super();
    this.baseProcessor = new CampaignProcessorLogic(prisma);
  }

  async process(job: Job<CampaignJob>): Promise<any> {
    return this.baseProcessor.processWithTracking(job);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Campaign job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Campaign job ${job.id} failed: ${error.message}`);
  }
}

class CampaignProcessorLogic extends BaseProcessor<CampaignJob> {
  constructor(prisma: PrismaService) {
    super('campaign', prisma);
  }

  async process(job: Job<CampaignJob>): Promise<any> {
    const { campaignId, organizationId, userId, batchSize = 50 } = job.data;

    // Load campaign (10%)
    await this.updateProgress(job, 10, 'Loading campaign configuration');
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, organizationId },
      include: {
        leads: {
          where: { status: CampaignLeadStatus.PENDING },
          include: { lead: true },
          take: batchSize,
        },
      },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status !== CampaignStatus.RUNNING) {
      throw new Error(`Campaign is not running (status: ${campaign.status})`);
    }

    const pendingLeads = campaign.leads;
    if (pendingLeads.length === 0) {
      await this.updateProgress(job, 100, 'No pending leads to process');
      await this.completeCampaign(campaignId);
      return { processed: 0, message: 'No pending leads' };
    }

    // Process leads in batches (30% - 90%)
    let processed = 0;
    let failed = 0;

    for (let i = 0; i < pendingLeads.length; i++) {
      const campaignLead = pendingLeads[i];
      const progress = 30 + Math.floor((i / pendingLeads.length) * 60);
      await this.updateProgress(job, progress, `Processing lead ${i + 1}/${pendingLeads.length}: ${campaignLead.lead.businessName}`);

      try {
        // Prepare message
        const message = await this.prepareMessage(campaign, campaignLead.lead);

        // Send message (simulated - replace with actual send logic)
        await this.sendMessage(message, campaign.type);

        // Update campaign lead status
        await this.prisma.campaignLead.update({
          where: { id: campaignLead.id },
          data: {
            status: CampaignLeadStatus.SENT,
            sentAt: new Date(),
          },
        });

        // Save message
        await this.prisma.message.create({
          data: {
            leadId: campaignLead.lead.id,
            senderId: userId,
            type: campaign.type as any,
            content: message.content,
            subject: message.subject,
            status: MessageStatus.SENT,
            sentAt: new Date(),
            isAIGenerated: message.isAIGenerated,
            campaignId,
          },
        });

        // Update campaign metrics
        await this.prisma.campaign.update({
          where: { id: campaignId },
          data: { sentCount: { increment: 1 } },
        });

        // Log activity
        await this.prisma.activity.create({
          data: {
            type: 'MESSAGE_SENT',
            description: `Campaign message sent to ${campaignLead.lead.businessName}`,
            leadId: campaignLead.lead.id,
            userId,
          },
        });

        processed++;
        await this.sleep(100); // Rate limiting between sends
      } catch (error: any) {
        this.logger.error(`Failed to process lead ${campaignLead.lead.id}: ${error.message}`);

        await this.prisma.campaignLead.update({
          where: { id: campaignLead.id },
          data: { status: CampaignLeadStatus.FAILED },
        });
        failed++;
      }
    }

    // Check if campaign is complete (95%)
    await this.updateProgress(job, 95, 'Checking campaign completion');
    const remainingPending = await this.prisma.campaignLead.count({
      where: { campaignId, status: CampaignLeadStatus.PENDING },
    });

    if (remainingPending === 0) {
      await this.completeCampaign(campaignId);
    }

    // Complete (100%)
    await this.updateProgress(job, 100, `Campaign batch complete: ${processed} sent, ${failed} failed`);

    return { processed, failed, remaining: remainingPending };
  }

  private async prepareMessage(campaign: any, lead: any): Promise<any> {
    // Use AI to generate personalized message if available
    const aiReport = await this.prisma.aIReport.findUnique({ where: { leadId: lead.id } });

    const templates: Record<string, string> = {
      EMAIL: `Hi {{businessName}} team,\n\nWe help {{industry}} businesses like yours grow through modern digital solutions.\n\nWould you be open to a quick call to discuss how we can help {{businessName}}?\n\nBest regards,`,
      WHATSAPP: `Hi {{businessName}}, this is a quick note about how we help {{industry}} businesses grow. Interested in learning more?`,
      LINKEDIN: `Hi {{contactName}}, I noticed {{businessName}} in the {{industry}} space. I'd love to connect and explore how we can support your growth.`,
    };

    let content = templates[campaign.type] || templates.EMAIL;
    content = content.replace(/\{\{businessName\}\}/g, lead.businessName || 'your business');
    content = content.replace(/\{\{industry\}\}/g, lead.industry || 'your industry');
    content = content.replace(/\{\{contactName\}\}/g, lead.contactName || 'there');
    content = content.replace(/\{\{city\}\}/g, lead.city || 'your area');

    return {
      content,
      subject: campaign.name,
      isAIGenerated: !!aiReport,
    };
  }

  private async sendMessage(message: any, type: string): Promise<void> {
    // Placeholder - integrate with actual email/WhatsApp/LinkedIn APIs
    this.logger.log(`Sending ${type} message: ${message.subject}`);

    // Simulate send delay
    await this.sleep(200);
  }

  private async completeCampaign(campaignId: string): Promise<void> {
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    this.logger.log(`Campaign ${campaignId} marked as completed`);
  }
}
