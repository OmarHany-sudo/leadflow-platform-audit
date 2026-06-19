import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { randomBytes, createHash } from 'crypto';

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, userId: string, data: {
    name: string;
    integrationId?: string;
    permissions?: string[];
    scopes?: string[];
    expiresInDays?: number;
  }): Promise<{ apiKey: string; record: any }> {
    // Generate API key
    const rawKey = `lf_${randomBytes(32).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 12);

    const expiresAt = data.expiresInDays
      ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const record = await this.prisma.apiKey.create({
      data: {
        name: data.name,
        keyHash,
        keyPrefix,
        permissions: data.permissions || [],
        scopes: data.scopes || [],
        isActive: true,
        expiresAt,
        integrationId: data.integrationId,
        organizationId,
        createdBy: userId,
      },
    });

    this.logger.log(`API key created: ${record.name} (${record.id})`);

    // Return the raw key only once
    return {
      apiKey: rawKey,
      record: {
        id: record.id,
        name: record.name,
        keyPrefix: record.keyPrefix,
        permissions: record.permissions,
        scopes: record.scopes,
        isActive: record.isActive,
        expiresAt: record.expiresAt,
        createdAt: record.createdAt,
      },
    };
  }

  async findAll(organizationId: string) {
    return this.prisma.apiKey.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        permissions: true,
        scopes: true,
        usageCount: true,
        lastUsedAt: true,
        isActive: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const key = await this.prisma.apiKey.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        permissions: true,
        scopes: true,
        usageCount: true,
        lastUsedAt: true,
        isActive: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!key) {
      throw new NotFoundException('API key not found');
    }

    return key;
  }

  async revoke(organizationId: string, id: string) {
    const key = await this.prisma.apiKey.updateMany({
      where: { id, organizationId },
      data: { isActive: false, updatedAt: new Date() },
    });

    if (key.count === 0) {
      throw new NotFoundException('API key not found');
    }

    return { message: 'API key revoked' };
  }

  async delete(organizationId: string, id: string) {
    await this.prisma.apiKey.deleteMany({
      where: { id, organizationId },
    });

    return { message: 'API key deleted' };
  }

  async validateKey(apiKey: string): Promise<{ valid: boolean; organizationId?: string; permissions?: any[]; scopes?: any[] }> {
    const keyHash = createHash('sha256').update(apiKey).digest('hex');

    const record = await this.prisma.apiKey.findUnique({
      where: { keyHash },
    });

    if (!record) {
      return { valid: false };
    }

    if (!record.isActive) {
      return { valid: false };
    }

    if (record.expiresAt && record.expiresAt < new Date()) {
      return { valid: false };
    }

    // Update usage
    await this.prisma.apiKey.update({
      where: { id: record.id },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });

    return {
      valid: true,
      organizationId: record.organizationId,
      permissions: record.permissions as any[],
      scopes: record.scopes as any[],
    };
  }
}
