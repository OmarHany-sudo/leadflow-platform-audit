import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Temperature, LeadStatus } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getDashboard(organizationId: string) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalLeads,
      hotLeads,
      warmLeads,
      coldLeads,
      newLeads,
      contactedLeads,
      wonLeads,
      recentLeads,
      topIndustries,
      topCountries,
      topCities,
      leadSourceBreakdown,
      dailyLeads,
      scoreDistribution,
    ] = await Promise.all([
      this.prisma.lead.count({ where: { organizationId } }),
      this.prisma.lead.count({ where: { organizationId, temperature: Temperature.HOT } }),
      this.prisma.lead.count({ where: { organizationId, temperature: Temperature.WARM } }),
      this.prisma.lead.count({ where: { organizationId, temperature: Temperature.COLD } }),
      this.prisma.lead.count({ where: { organizationId, status: LeadStatus.NEW } }),
      this.prisma.lead.count({ where: { organizationId, status: LeadStatus.CONTACTED } }),
      this.prisma.lead.count({ where: { organizationId, status: LeadStatus.WON } }),
      this.prisma.lead.count({ where: { organizationId, createdAt: { gte: sevenDaysAgo } } }),
      
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
      
      this.prisma.lead.groupBy({
        by: ['city'],
        where: { organizationId },
        _count: { city: true },
        orderBy: { _count: { city: 'desc' } },
        take: 10,
      }),
      
      this.prisma.lead.groupBy({
        by: ['source'],
        where: { organizationId },
        _count: { source: true },
        orderBy: { _count: { source: 'desc' } },
      }),
      
      this.getDailyLeads(organizationId, thirtyDaysAgo),
      this.getScoreDistribution(organizationId),
    ]);

    return {
      overview: {
        totalLeads,
        hotLeads,
        warmLeads,
        coldLeads,
        newLeads,
        contactedLeads,
        wonLeads,
        recentLeads,
        conversionRate: totalLeads > 0 ? ((wonLeads / totalLeads) * 100).toFixed(1) : '0',
      },
      topIndustries: topIndustries.map(i => ({ name: i.industry || 'Unknown', count: i._count.industry })),
      topCountries: topCountries.map(c => ({ name: c.country || 'Unknown', count: c._count.country })),
      topCities: topCities.map(c => ({ name: c.city || 'Unknown', count: c._count.city })),
      leadSources: leadSourceBreakdown.map(s => ({ source: s.source, count: s._count.source })),
      dailyLeads,
      scoreDistribution,
    };
  }

  async getCampaignStats(organizationId: string) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { organizationId },
      select: {
        type: true,
        status: true,
        totalLeads: true,
        sentCount: true,
        openedCount: true,
        repliedCount: true,
        convertedCount: true,
      },
    });

    const totals = campaigns.reduce((acc, c) => ({
      total: acc.total + c.totalLeads,
      sent: acc.sent + c.sentCount,
      opened: acc.opened + c.openedCount,
      replied: acc.replied + c.repliedCount,
      converted: acc.converted + c.convertedCount,
    }), { total: 0, sent: 0, opened: 0, replied: 0, converted: 0 });

    return {
      campaigns: campaigns.length,
      ...totals,
      openRate: totals.sent > 0 ? ((totals.opened / totals.sent) * 100).toFixed(1) : '0',
      replyRate: totals.sent > 0 ? ((totals.replied / totals.sent) * 100).toFixed(1) : '0',
      conversionRate: totals.sent > 0 ? ((totals.converted / totals.sent) * 100).toFixed(1) : '0',
    };
  }

  async getActivityTimeline(organizationId: string, days: number = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const activities = await this.prisma.activity.groupBy({
      by: ['type'],
      where: {
        lead: { organizationId },
        createdAt: { gte: since },
      },
      _count: { type: true },
    });

    return activities.map(a => ({
      type: a.type,
      count: a._count.type,
    }));
  }

  private async getDailyLeads(organizationId: string, since: Date) {
    const leads = await this.prisma.lead.findMany({
      where: {
        organizationId,
        createdAt: { gte: since },
      },
      select: {
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const grouped = leads.reduce((acc, lead) => {
      const date = lead.createdAt.toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped).map(([date, count]) => ({ date, count }));
  }

  private async getScoreDistribution(organizationId: string) {
    const leads = await this.prisma.lead.findMany({
      where: { organizationId },
      select: { score: true },
    });

    const ranges = {
      '0-20': 0,
      '21-40': 0,
      '41-60': 0,
      '61-80': 0,
      '81-100': 0,
    };

    for (const lead of leads) {
      const score = lead.score || 0;
      if (score <= 20) ranges['0-20']++;
      else if (score <= 40) ranges['21-40']++;
      else if (score <= 60) ranges['41-60']++;
      else if (score <= 80) ranges['61-80']++;
      else ranges['81-100']++;
    }

    return Object.entries(ranges).map(([range, count]) => ({ range, count }));
  }
}