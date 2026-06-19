import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BaseProcessor } from '../base/base.processor';
import { FollowUpStatus, MessageStatus } from '@prisma/client';

interface FollowUpJobData {
  followUpId: string;
  leadId: string;
  userId: string;
  type: string;
  content: string;
}

@Processor('follow-up', {
  concurrency: 3,
  limiter: { max: 15, duration: 60000 },
  lockDuration: 30000,
  stalledInterval: 30000,
})
export class FollowUpProcessor extends WorkerHost {
  private readonly logger = new Logger(FollowUpProcessor.name);
  private baseProcessor: BaseProcessor<FollowUpJobData>;

  constructor(private prisma: PrismaService) {
    super();
    this.baseProcessor = new FollowUpProcessorLogic(prisma);
  }

  async process(job: Job<FollowUpJobData>): Promise<any> {
    return this.baseProcessor.processWithTracking(job);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Follow-up job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Follow-up job ${job.id} failed: ${error.message}`);
  }
}

class FollowUpProcessorLogic extends BaseProcessor<FollowUpJobData> {
  constructor(prisma: PrismaService) {
    super('follow-up', prisma);
  }

  async process(job: Job<FollowUpJobData>): Promise<any> {
    const { followUpId, leadId, userId, type, content } = job.data;

    // Load follow-up (20%)
    await this.updateProgress(job, 20, 'Loading follow-up record');
    const followUp = await this.prisma.followUp.findUnique({
      where: { id: followUpId },
      include: { lead: true },
    });

    if (!followUp) {
      throw new Error(`Follow-up ${followUpId} not found`);
    }

    if (followUp.status === FollowUpStatus.SENT) {
      return { message: 'Follow-up already sent', followUpId };
    }

    if (followUp.status === FollowUpStatus.CANCELLED) {
      return { message: 'Follow-up was cancelled', followUpId };
    }

    // Verify lead is still active (35%)
    await this.updateProgress(job, 35, 'Verifying lead status');
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      throw new Error('Lead no longer exists');
    }

    if (lead.status === 'ARCHIVED' || lead.status === 'LOST') {
      await this.prisma.followUp.update({
        where: { id: followUpId },
        data: { status: FollowUpStatus.CANCELLED },
      });
      return { message: 'Lead is archived/lost, follow-up cancelled' };
    }

    // Personalize content (50%)
    await this.updateProgress(job, 50, 'Personalizing message');
    const personalizedContent = this.personalizeContent(content, lead);

    // Send message (70%)
    await this.updateProgress(job, 70, `Sending ${type} message`);
    await this.sendMessage(type, personalizedContent, lead);

    // Update follow-up status (85%)
    await this.updateProgress(job, 85, 'Updating follow-up status');
    const updated = await this.prisma.followUp.update({
      where: { id: followUpId },
      data: {
        status: FollowUpStatus.SENT,
        sentAt: new Date(),
      },
    });

    // Save message record
    await this.prisma.message.create({
      data: {
        leadId,
        senderId: userId,
        type: type.toUpperCase() as any,
        content: personalizedContent,
        status: MessageStatus.SENT,
        sentAt: new Date(),
        isAIGenerated: false,
      },
    });

    // Log activity
    await this.prisma.activity.create({
      data: {
        type: 'FOLLOW_UP_SENT',
        description: `Follow-up #${followUp.sequence} sent to ${lead.businessName}`,
        leadId,
        userId,
      },
    });

    // Schedule next follow-up if needed (95%)
    await this.updateProgress(job, 95, 'Scheduling next follow-up');
    await this.scheduleNextFollowUp(leadId, userId, followUp.sequence);

    // Complete (100%)
    await this.updateProgress(job, 100, 'Follow-up sent successfully');

    return { followUpId, leadId, type, sentAt: updated.sentAt };
  }

  private personalizeContent(content: string, lead: any): string {
    return content
      .replace(/\{\{businessName\}\}/g, lead.businessName || 'your business')
      .replace(/\{\{contactName\}\}/g, lead.contactName || 'there')
      .replace(/\{\{industry\}\}/g, lead.industry || 'your industry')
      .replace(/\{\{city\}\}/g, lead.city || 'your area');
  }

  private async sendMessage(type: string, content: string, lead: any): Promise<void> {
    this.logger.log(`Sending ${type} follow-up to ${lead.businessName}`);

    // Placeholder - integrate with actual email/WhatsApp/LinkedIn APIs
    switch (type.toLowerCase()) {
      case 'email':
        // await this.emailService.send({ to: lead.email, subject: 'Follow-up', body: content });
        break;
      case 'whatsapp':
        // await this.whatsappService.send({ to: lead.phone, message: content });
        break;
      case 'linkedin':
        // await this.linkedinService.sendMessage({ to: lead.linkedInUrl, message: content });
        break;
      case 'call':
        // Log call reminder
        break;
      default:
        this.logger.warn(`Unknown message type: ${type}`);
    }

    await this.sleep(200);
  }

  private async scheduleNextFollowUp(leadId: string, userId: string, currentSequence: number): Promise<void> {
    // Check if we should schedule a next follow-up (max 5)
    if (currentSequence >= 5) {
      this.logger.log(`Max follow-up sequence reached for lead ${leadId}`);
      return;
    }

    // Check for replies
    const recentReplies = await this.prisma.message.count({
      where: {
        leadId,
        status: MessageStatus.SENT,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    });

    if (recentReplies > 0) {
      this.logger.log(`Lead ${leadId} has recent activity, not scheduling next follow-up`);
      return;
    }

    const nextSequence = currentSequence + 1;
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + (nextSequence * 3));

    await this.prisma.followUp.create({
      data: {
        leadId,
        userId,
        sequence: nextSequence,
        type: 'EMAIL',
        content: `Follow-up #${nextSequence} for ${leadId}`,
        status: FollowUpStatus.SCHEDULED,
        scheduledAt,
      },
    });

    this.logger.log(`Scheduled follow-up #${nextSequence} for lead ${leadId} at ${scheduledAt}`);
  }
}
