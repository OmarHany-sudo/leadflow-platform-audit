import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { WebhookStatus } from '@prisma/client';
import { createHmac } from 'crypto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, data: {
    name: string;
    url: string;
    secret?: string;
    events?: string[];
    integrationId?: string;
  }) {
    const webhook = await this.prisma.webhook.create({
      data: {
        name: data.name,
        url: data.url,
        secret: data.secret,
        events: data.events || [],
        status: WebhookStatus.ACTIVE,
        integrationId: data.integrationId,
        organizationId,
      },
    });

    this.logger.log(`Webhook created: ${webhook.name} -> ${webhook.url}`);
    return webhook;
  }

  async findAll(organizationId: string) {
    return this.prisma.webhook.findMany({
      where: { organizationId },
      include: {
        _count: { select: { deliveries: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const webhook = await this.prisma.webhook.findFirst({
      where: { id, organizationId },
      include: {
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    return webhook;
  }

  async update(organizationId: string, id: string, data: {
    name?: string;
    url?: string;
    secret?: string;
    events?: string[];
    status?: string;
  }) {
    const webhook = await this.prisma.webhook.updateMany({
      where: { id, organizationId },
      data: {
        ...data,
        status: data.status as WebhookStatus,
        updatedAt: new Date(),
      },
    });

    if (webhook.count === 0) {
      throw new NotFoundException('Webhook not found');
    }

    return this.findOne(organizationId, id);
  }

  async delete(organizationId: string, id: string) {
    await this.prisma.webhook.deleteMany({
      where: { id, organizationId },
    });

    return { message: 'Webhook deleted' };
  }

  /**
   * Deliver webhook event
   */
  async deliver(webhookId: string, event: string, payload: any): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const webhook = await this.prisma.webhook.findUnique({
      where: { id: webhookId },
    });

    if (!webhook || webhook.status !== WebhookStatus.ACTIVE) {
      return { success: false, error: 'Webhook not active' };
    }

    // Check if event is subscribed
    const events = webhook.events as string[];
    if (events.length > 0 && !events.includes(event) && !events.includes('*')) {
      return { success: false, error: 'Event not subscribed' };
    }

    // Create delivery record
    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        webhookId,
        event,
        payload: payload as any,
        attemptCount: 1,
      },
    });

    try {
      // Build signature
      const signature = webhook.secret
        ? this.generateSignature(webhook.secret, payload)
        : undefined;

      // Send webhook
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': event,
          'X-Webhook-ID': webhookId,
          'X-Delivery-ID': delivery.id,
          ...(signature ? { 'X-Webhook-Signature': signature } : {}),
        },
        body: JSON.stringify({
          event,
          timestamp: new Date().toISOString(),
          data: payload,
        }),
      });

      // Update delivery record
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          responseStatus: response.status,
          responseBody: await response.text().catch(() => null),
          deliveredAt: new Date(),
        },
      });

      if (response.ok) {
        this.logger.log(`Webhook delivered: ${webhook.name} - ${event}`);
        return { success: true, statusCode: response.status };
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error: any) {
      // Update delivery record with failure
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          failedAt: new Date(),
          attemptCount: { increment: 1 },
        },
      });

      this.logger.error(`Webhook delivery failed: ${webhook.name} - ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Deliver event to all matching webhooks for an organization
   */
  async deliverToOrganization(organizationId: string, event: string, payload: any): Promise<void> {
    const webhooks = await this.prisma.webhook.findMany({
      where: {
        organizationId,
        status: WebhookStatus.ACTIVE,
      },
    });

    for (const webhook of webhooks) {
      // Fire and forget - don't wait
      this.deliver(webhook.id, event, payload).catch(err => {
        this.logger.error(`Failed to deliver to webhook ${webhook.id}: ${err.message}`);
      });
    }
  }

  private generateSignature(secret: string, payload: any): string {
    return createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }
}
