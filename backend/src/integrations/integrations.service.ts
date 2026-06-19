import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { IntegrationStatus, IntegrationType } from '@prisma/client';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, data: {
    name: string;
    type: string;
    provider: string;
    credentials?: Record<string, any>;
    settings?: Record<string, any>;
  }) {
    const integration = await this.prisma.integration.create({
      data: {
        name: data.name,
        type: data.type as IntegrationType,
        provider: data.provider,
        credentials: data.credentials || {},
        settings: data.settings || {},
        status: IntegrationStatus.PENDING_SETUP,
        organizationId,
      },
    });

    this.logger.log(`Integration created: ${integration.name} (${integration.id})`);
    return integration;
  }

  async findAll(organizationId: string) {
    return this.prisma.integration.findMany({
      where: { organizationId },
      include: {
        _count: { select: { webhooks: true, apiKeys: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const integration = await this.prisma.integration.findFirst({
      where: { id, organizationId },
      include: {
        webhooks: true,
        apiKeys: true,
      },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    return integration;
  }

  async update(organizationId: string, id: string, data: {
    name?: string;
    type?: string;
    provider?: string;
    credentials?: Record<string, any>;
    settings?: Record<string, any>;
    status?: string;
  }) {
    const integration = await this.prisma.integration.updateMany({
      where: { id, organizationId },
      data: {
        ...data,
        type: data.type as IntegrationType,
        status: data.status as IntegrationStatus,
        updatedAt: new Date(),
      },
    });

    if (integration.count === 0) {
      throw new NotFoundException('Integration not found');
    }

    return this.findOne(organizationId, id);
  }

  async updateStatus(organizationId: string, id: string, status: IntegrationStatus) {
    return this.prisma.integration.updateMany({
      where: { id, organizationId },
      data: { status, updatedAt: new Date() },
    });
  }

  async updateLastSync(organizationId: string, id: string) {
    return this.prisma.integration.updateMany({
      where: { id, organizationId },
      data: { lastSyncAt: new Date(), updatedAt: new Date() },
    });
  }

  async delete(organizationId: string, id: string) {
    await this.prisma.integration.deleteMany({
      where: { id, organizationId },
    });

    return { message: 'Integration deleted' };
  }

  async getCredentials(organizationId: string, provider: string) {
    const integration = await this.prisma.integration.findFirst({
      where: {
        organizationId,
        provider,
        status: IntegrationStatus.ACTIVE,
      },
      select: { credentials: true, provider: true, name: true },
    });

    return integration?.credentials || null;
  }

  async validateCredentials(provider: string, credentials: Record<string, any>): Promise<boolean> {
    // Placeholder for credential validation
    // Each provider would have its own validation logic
    switch (provider) {
      case 'google':
        return !!credentials.apiKey || !!credentials.accessToken;
      case 'slack':
        return !!credentials.webhookUrl || !!credentials.botToken;
      case 'zapier':
        return !!credentials.apiKey;
      default:
        return Object.keys(credentials).length > 0;
    }
  }
}
