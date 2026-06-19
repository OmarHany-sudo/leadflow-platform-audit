import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';

export interface LeadDiscoveryJob {
  connector: string;
  query: string;
  location?: string;
  organizationId: string;
  userId: string;
  options?: Record<string, any>;
}

export interface WebsiteAuditJob {
  leadId: string;
  url: string;
  organizationId: string;
}

export interface AIAnalysisJob {
  leadId: string;
  userId: string;
  provider?: string;
}

export interface ScoringJob {
  leadId: string;
  organizationId: string;
}

export interface OutreachJob {
  leadId: string;
  type: string;
  userId: string;
  provider?: string;
}

export interface CampaignJob {
  campaignId: string;
  organizationId: string;
  userId: string;
}

export interface EnrichmentJob {
  leadId: string;
  organizationId: string;
}

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue('lead-discovery') private leadDiscoveryQueue: Queue,
    @InjectQueue('website-audit') private websiteAuditQueue: Queue,
    @InjectQueue('ai-analysis') private aiAnalysisQueue: Queue,
    @InjectQueue('scoring') private scoringQueue: Queue,
    @InjectQueue('outreach') private outreachQueue: Queue,
    @InjectQueue('campaign') private campaignQueue: Queue,
    @InjectQueue('enrichment') private enrichmentQueue: Queue,
    private prisma: PrismaService,
  ) {}

  async onModuleInit() {
    this.logger.log('Queue service initialized with 7 queues');
  }

  // Lead Discovery
  async addLeadDiscoveryJob(data: LeadDiscoveryJob, options?: any): Promise<Job> {
    this.logger.log(`Adding lead discovery job: ${data.connector} - ${data.query}`);
    const job = await this.leadDiscoveryQueue.add('discover', data, {
      ...options,
      jobId: `lead-discovery-${Date.now()}`,
    });
    await this.logJob(job, 'lead-discovery', 'PENDING');
    return job;
  }

  // Website Audit
  async addWebsiteAuditJob(data: WebsiteAuditJob, options?: any): Promise<Job> {
    this.logger.log(`Adding website audit job: ${data.url}`);
    const job = await this.websiteAuditQueue.add('audit', data, options);
    await this.logJob(job, 'website-audit', 'PENDING');
    return job;
  }

  // AI Analysis
  async addAIAnalysisJob(data: AIAnalysisJob, options?: any): Promise<Job> {
    this.logger.log(`Adding AI analysis job: ${data.leadId}`);
    const job = await this.aiAnalysisQueue.add('analyze', data, options);
    await this.logJob(job, 'ai-analysis', 'PENDING');
    return job;
  }

  // Scoring
  async addScoringJob(data: ScoringJob, options?: any): Promise<Job> {
    this.logger.log(`Adding scoring job: ${data.leadId}`);
    const job = await this.scoringQueue.add('score', data, options);
    await this.logJob(job, 'scoring', 'PENDING');
    return job;
  }

  // Outreach
  async addOutreachJob(data: OutreachJob, options?: any): Promise<Job> {
    this.logger.log(`Adding outreach job: ${data.leadId} - ${data.type}`);
    const job = await this.outreachQueue.add('generate', data, options);
    await this.logJob(job, 'outreach', 'PENDING');
    return job;
  }

  // Campaign
  async addCampaignJob(data: CampaignJob, options?: any): Promise<Job> {
    this.logger.log(`Adding campaign job: ${data.campaignId}`);
    const job = await this.campaignQueue.add('execute', data, options);
    await this.logJob(job, 'campaign', 'PENDING');
    return job;
  }

  // Enrichment
  async addEnrichmentJob(data: EnrichmentJob, options?: any): Promise<Job> {
    this.logger.log(`Adding enrichment job: ${data.leadId}`);
    const job = await this.enrichmentQueue.add('enrich', data, options);
    await this.logJob(job, 'enrichment', 'PENDING');
    return job;
  }

  // Get queue stats
  async getQueueStats() {
    const queues = [
      { name: 'lead-discovery', queue: this.leadDiscoveryQueue },
      { name: 'website-audit', queue: this.websiteAuditQueue },
      { name: 'ai-analysis', queue: this.aiAnalysisQueue },
      { name: 'scoring', queue: this.scoringQueue },
      { name: 'outreach', queue: this.outreachQueue },
      { name: 'campaign', queue: this.campaignQueue },
      { name: 'enrichment', queue: this.enrichmentQueue },
    ];

    const stats = await Promise.all(
      queues.map(async ({ name, queue }) => {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
        ]);

        return {
          name,
          waiting,
          active,
          completed,
          failed,
          delayed,
          total: waiting + active + delayed,
        };
      }),
    );

    return stats;
  }

  // Get recent jobs
  async getRecentJobs(queueName: string, limit: number = 50) {
    return this.prisma.jobLog.findMany({
      where: { queueName },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  private async logJob(job: Job, queueName: string, status: string) {
    try {
      await this.prisma.jobLog.create({
        data: {
          queueName,
          jobName: job.name,
          jobId: job.id as string,
          status: status as any,
          data: job.data as any,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log job: ${error.message}`);
    }
  }
}