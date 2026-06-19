import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { MessageType, MessageStatus } from '@prisma/client';
import { AiAnalysisService } from '../ai-analysis/ai-analysis.service';

@Injectable()
export class OutreachService {
  private readonly logger = new Logger(OutreachService.name);

  constructor(
    private prisma: PrismaService,
    private aiService: AiAnalysisService,
  ) {}

  async generateEmail(leadId: string, userId: string, provider?: string) {
    return this.aiService.generateOutreachMessage(leadId, 'email', provider);
  }

  async generateWhatsApp(leadId: string, userId: string, provider?: string) {
    return this.aiService.generateOutreachMessage(leadId, 'whatsapp', provider);
  }

  async generateLinkedIn(leadId: string, userId: string, provider?: string) {
    return this.aiService.generateOutreachMessage(leadId, 'linkedin', provider);
  }

  async generateContactForm(leadId: string, userId: string, provider?: string) {
    return this.aiService.generateOutreachMessage(leadId, 'contact_form', provider);
  }

  async generateColdOutreach(leadId: string, userId: string, provider?: string) {
    return this.aiService.generateOutreachMessage(leadId, 'cold_outreach', provider);
  }

  async saveMessage(leadId: string, userId: string, type: MessageType, content: string, subject?: string, isAIGenerated: boolean = false) {
    const message = await this.prisma.message.create({
      data: {
        leadId,
        senderId: userId,
        type,
        content,
        subject,
        status: MessageStatus.DRAFT,
        isAIGenerated,
      },
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    this.logger.log(`Message saved: ${message.id} for lead ${leadId}`);
    return message;
  }

  async sendMessage(messageId: string, userId: string) {
    const message = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        status: MessageStatus.SENT,
        sentAt: new Date(),
      },
    });

    // Log activity
    await this.prisma.activity.create({
      data: {
        type: 'MESSAGE_SENT',
        description: `Message sent: ${message.type}`,
        leadId: message.leadId,
        userId,
      },
    });

    return message;
  }

  async getMessages(leadId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    
    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { leadId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sender: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.message.count({ where: { leadId } }),
    ]);

    return { data: messages, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getTemplates(type?: MessageType) {
    // Return outreach templates
    const templates = [
      {
        id: 'web-dev-intro',
        name: 'Web Development Introduction',
        type: MessageType.EMAIL,
        subject: 'Transform Your Online Presence',
        content: `Hi {{businessName}},\n\nI noticed your business in {{city}} and wanted to reach out. We specialize in creating modern, high-converting websites for {{industry}} businesses.\n\nWould you be open to a quick call to discuss how we can help {{businessName}} grow online?\n\nBest regards,`,
      },
      {
        id: 'seo-audit-offer',
        name: 'Free SEO Audit',
        type: MessageType.EMAIL,
        subject: 'Free SEO Audit for {{businessName}}',
        content: `Hi {{businessName}} team,\n\nI ran a quick analysis of your website and found several opportunities to improve your search rankings.\n\nI'd love to share a complimentary SEO audit with actionable insights.\n\nInterested?\n\nBest,`,
      },
      {
        id: 'ai-automation',
        name: 'AI Automation Pitch',
        type: MessageType.EMAIL,
        subject: 'Automate {{businessName}} Workflows with AI',
        content: `Hi there,\n\nAI automation is transforming how {{industry}} businesses operate. We help companies like {{businessName}} save 10+ hours per week through intelligent automation.\n\nCan I show you a quick demo?\n\nBest regards,`,
      },
    ];

    if (type) {
      return templates.filter(t => t.type === type);
    }

    return templates;
  }
}