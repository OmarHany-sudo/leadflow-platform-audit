import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  async findAll(leadId: string, page: number = 1, limit: number = 20) {
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

  async create(leadId: string, userId: string, data: any) {
    return this.prisma.message.create({
      data: {
        ...data,
        leadId,
        senderId: userId,
      },
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }
}