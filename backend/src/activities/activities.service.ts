import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class ActivitiesService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    
    const [activities, total] = await Promise.all([
      this.prisma.activity.findMany({
        where: {
          lead: { organizationId },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true },
          },
          lead: {
            select: { id: true, businessName: true },
          },
        },
      }),
      this.prisma.activity.count({
        where: { lead: { organizationId } },
      }),
    ]);

    return { data: activities, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findByLead(leadId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    
    const [activities, total] = await Promise.all([
      this.prisma.activity.findMany({
        where: { leadId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.activity.count({ where: { leadId } }),
    ]);

    return { data: activities, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async create(userId: string, data: any) {
    return this.prisma.activity.create({
      data: {
        ...data,
        userId,
      },
    });
  }
}