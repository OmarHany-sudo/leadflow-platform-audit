import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { UserRole, LeadStatus, Temperature, Priority, LeadSource } from '@prisma/client';
import { CreateLeadDto, UpdateLeadDto, LeadQueryDto, BulkAssignDto } from './dto/lead.dto';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(private prisma: PrismaService) {}

  async create(userId: string, organizationId: string, dto: CreateLeadDto) {
    const lead = await this.prisma.lead.create({
      data: {
        ...dto,
        organizationId,
        createdById: userId,
        status: dto.status || LeadStatus.NEW,
        temperature: dto.temperature || Temperature.COLD,
        priority: dto.priority || Priority.LOW,
      },
      include: {
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        scoringResults: true,
        websiteAudit: true,
        aiReport: true,
      },
    });

    // Log activity
    await this.logActivity(lead.id, userId, 'LEAD_CREATED', `Lead "${lead.businessName}" created`);

    this.logger.log(`Lead created: ${lead.businessName} (${lead.id})`);
    return lead;
  }

  async findAll(userId: string, organizationId: string, query: LeadQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status,
      temperature,
      priority,
      source,
      industry,
      country,
      city,
      assignedToId,
      search,
      scoreMin,
      scoreMax,
    } = query;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = { organizationId };

    if (status) where.status = status;
    if (temperature) where.temperature = temperature;
    if (priority) where.priority = priority;
    if (source) where.source = source;
    if (industry) where.industry = industry;
    if (country) where.country = country;
    if (city) where.city = city;
    if (assignedToId) where.assignedToId = assignedToId;
    if (scoreMin !== undefined || scoreMax !== undefined) {
      where.score = {};
      if (scoreMin !== undefined) where.score.gte = scoreMin;
      if (scoreMax !== undefined) where.score.lte = scoreMax;
    }

    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { website: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
        { industry: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [leads, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          assignedTo: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          scoringResults: true,
          _count: {
            select: {
              messages: true,
              activities: true,
              tasks: true,
              notes: true,
            },
          },
        },
      }),
      this.prisma.lead.count({ where }),
    ]);

    return {
      data: leads,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(userId: string, organizationId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, organizationId },
      include: {
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        scoringResults: true,
        websiteAudit: true,
        aiReport: {
          include: {
            generatedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          include: {
            sender: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        tasks: {
          orderBy: { createdAt: 'desc' },
          include: {
            assignedTo: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        followUps: {
          orderBy: { scheduledAt: 'asc' },
        },
      },
    });

    if (!lead) {
      throw new NotFoundException(`Lead with ID ${id} not found`);
    }

    return lead;
  }

  async update(userId: string, organizationId: string, id: string, dto: UpdateLeadDto) {
    const existing = await this.findOne(userId, organizationId, id);

    const lead = await this.prisma.lead.update({
      where: { id },
      data: {
        ...dto,
        updatedAt: new Date(),
      },
      include: {
        assignedTo: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    await this.logActivity(lead.id, userId, 'LEAD_UPDATED', `Lead "${lead.businessName}" updated`);

    return lead;
  }

  async remove(userId: string, organizationId: string, id: string) {
    const lead = await this.findOne(userId, organizationId, id);

    await this.prisma.lead.delete({ where: { id } });

    this.logger.log(`Lead deleted: ${id}`);
    return { message: 'Lead deleted successfully' };
  }

  async assign(userId: string, organizationId: string, leadId: string, assignedToId: string) {
    // Verify target user is in same organization
    const targetUser = await this.prisma.user.findFirst({
      where: { id: assignedToId, organizationId },
    });

    if (!targetUser) {
      throw new NotFoundException('Target user not found in organization');
    }

    const lead = await this.prisma.lead.update({
      where: { id: leadId, organizationId },
      data: { assignedToId },
      include: {
        assignedTo: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    await this.logActivity(lead.id, userId, 'LEAD_ASSIGNED', `Lead assigned to ${targetUser.firstName} ${targetUser.lastName}`);

    return lead;
  }

  async bulkAssign(userId: string, organizationId: string, dto: BulkAssignDto) {
    const { leadIds, assignedToId } = dto;

    const targetUser = await this.prisma.user.findFirst({
      where: { id: assignedToId, organizationId },
    });

    if (!targetUser) {
      throw new NotFoundException('Target user not found in organization');
    }

    await this.prisma.lead.updateMany({
      where: {
        id: { in: leadIds },
        organizationId,
      },
      data: { assignedToId },
    });

    // Log activities
    for (const leadId of leadIds) {
      await this.logActivity(leadId, userId, 'LEAD_ASSIGNED', `Lead assigned to ${targetUser.firstName} ${targetUser.lastName}`);
    }

    return { message: `${leadIds.length} leads assigned successfully` };
  }

  async updateStatus(userId: string, organizationId: string, id: string, status: LeadStatus) {
    const lead = await this.prisma.lead.update({
      where: { id, organizationId },
      data: { status },
    });

    await this.logActivity(lead.id, userId, 'STATUS_CHANGED', `Status changed to ${status}`);

    return lead;
  }

  async updateScore(userId: string, organizationId: string, id: string, score: number) {
    // Determine temperature based on score
    let temperature = Temperature.COLD;
    if (score >= 80) temperature = Temperature.HOT;
    else if (score >= 50) temperature = Temperature.WARM;

    let priority = Priority.LOW;
    if (score >= 80) priority = Priority.CRITICAL;
    else if (score >= 60) priority = Priority.HIGH;
    else if (score >= 40) priority = Priority.MEDIUM;

    const lead = await this.prisma.lead.update({
      where: { id, organizationId },
      data: { score, temperature, priority },
    });

    await this.logActivity(lead.id, userId, 'SCORE_UPDATED', `Score updated to ${score}`);

    return lead;
  }

  async getStats(userId: string, organizationId: string) {
    const [
      totalLeads,
      byStatus,
      byTemperature,
      bySource,
      byIndustry,
      byCountry,
      hotLeads,
      recentLeads,
    ] = await Promise.all([
      this.prisma.lead.count({ where: { organizationId } }),
      this.prisma.lead.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: { status: true },
      }),
      this.prisma.lead.groupBy({
        by: ['temperature'],
        where: { organizationId },
        _count: { temperature: true },
      }),
      this.prisma.lead.groupBy({
        by: ['source'],
        where: { organizationId },
        _count: { source: true },
      }),
      this.prisma.lead.groupBy({
        by: ['industry'],
        where: { organizationId },
        _count: { industry: true },
        orderBy: { _count: { industry: 'desc' } },
        take: 10,
      }),
      this.prisma.lead.groupBy({
        by: ['country'],
        where: { organizationId },
        _count: { country: true },
        orderBy: { _count: { country: 'desc' } },
        take: 10,
      }),
      this.prisma.lead.count({
        where: { organizationId, temperature: Temperature.HOT },
      }),
      this.prisma.lead.count({
        where: {
          organizationId,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return {
      total: totalLeads,
      byStatus: Object.fromEntries(byStatus.map(s => [s.status, s._count.status])),
      byTemperature: Object.fromEntries(byTemperature.map(t => [t.temperature, t._count.temperature])),
      bySource: Object.fromEntries(bySource.map(s => [s.source, s._count.source])),
      byIndustry,
      byCountry,
      hotLeads,
      recentLeads,
    };
  }

  private async logActivity(leadId: string, userId: string, type: string, description: string) {
    await this.prisma.activity.create({
      data: {
        type: type as any,
        description,
        leadId,
        userId,
      },
    });
  }
}