import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ContactRole } from '@prisma/client';

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(private prisma: PrismaService) {}

  async create(userId: string, data: {
    leadId: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    jobTitle?: string;
    department?: string;
    role?: string;
    isPrimary?: boolean;
    isDecisionMaker?: boolean;
    linkedInUrl?: string;
    twitterUrl?: string;
    facebookUrl?: string;
  }) {
    // Verify lead exists
    const lead = await this.prisma.lead.findUnique({
      where: { id: data.leadId },
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    // If setting as primary, unset existing primary
    if (data.isPrimary) {
      await this.prisma.contact.updateMany({
        where: { leadId: data.leadId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const contact = await this.prisma.contact.create({
      data: {
        leadId: data.leadId,
        createdById: userId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        jobTitle: data.jobTitle,
        department: data.department,
        role: (data.role as ContactRole) || ContactRole.INFLUENCER,
        isPrimary: data.isPrimary || false,
        isDecisionMaker: data.isDecisionMaker || false,
        linkedInUrl: data.linkedInUrl,
        twitterUrl: data.twitterUrl,
        facebookUrl: data.facebookUrl,
      },
    });

    // Log activity
    await this.prisma.activity.create({
      data: {
        type: 'CONTACT_ADDED',
        description: `Contact "${contact.firstName} ${contact.lastName}" added`,
        leadId: data.leadId,
        userId,
      },
    });

    this.logger.log(`Contact created: ${contact.firstName} ${contact.lastName} (${contact.id})`);
    return contact;
  }

  async findByLead(leadId: string) {
    return this.prisma.contact.findMany({
      where: { leadId },
      orderBy: [
        { isPrimary: 'desc' },
        { isDecisionMaker: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async findOne(id: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: {
        lead: { select: { businessName: true, id: true } },
      },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    return contact;
  }

  async update(id: string, userId: string, data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    jobTitle?: string;
    department?: string;
    role?: string;
    isPrimary?: boolean;
    isDecisionMaker?: boolean;
    linkedInUrl?: string;
    twitterUrl?: string;
    facebookUrl?: string;
  }) {
    const contact = await this.findOne(id);

    // If setting as primary, unset existing primary
    if (data.isPrimary) {
      await this.prisma.contact.updateMany({
        where: { leadId: contact.leadId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const updated = await this.prisma.contact.update({
      where: { id },
      data: {
        ...data,
        role: data.role as ContactRole,
        updatedAt: new Date(),
      },
    });

    // Log activity
    await this.prisma.activity.create({
      data: {
        type: 'CONTACT_UPDATED',
        description: `Contact "${updated.firstName} ${updated.lastName}" updated`,
        leadId: contact.leadId,
        userId,
      },
    });

    return updated;
  }

  async delete(id: string, userId: string) {
    const contact = await this.findOne(id);

    await this.prisma.contact.delete({ where: { id } });

    return { message: 'Contact deleted' };
  }

  async setPrimary(id: string, userId: string) {
    const contact = await this.findOne(id);

    // Unset existing primary
    await this.prisma.contact.updateMany({
      where: { leadId: contact.leadId, isPrimary: true },
      data: { isPrimary: false },
    });

    // Set new primary
    return this.prisma.contact.update({
      where: { id },
      data: { isPrimary: true },
    });
  }

  async search(organizationId: string, query: {
    search?: string;
    leadId?: string;
    role?: string;
    isDecisionMaker?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { search, leadId, role, isDecisionMaker, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    // Build where - need to join through lead for organization
    const where: any = {};
    if (leadId) where.leadId = leadId;
    if (role) where.role = role;
    if (isDecisionMaker !== undefined) where.isDecisionMaker = isDecisionMaker;

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { jobTitle: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [contacts, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          lead: { select: { businessName: true, id: true, organizationId: true } },
        },
      }),
      this.prisma.contact.count({ where }),
    ]);

    // Filter by organization
    const filtered = contacts.filter(c => c.lead.organizationId === organizationId);

    return {
      data: filtered,
      meta: { total: Math.min(total, filtered.length), page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
