import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BaseProcessor } from '../base/base.processor';
import { WebsiteAuditJob } from '../queue.service';

@Processor('website-audit', {
  concurrency: 3,
  limiter: { max: 10, duration: 60000 },
  lockDuration: 60000,
  stalledInterval: 30000,
})
export class WebsiteAuditProcessor extends WorkerHost {
  private readonly logger = new Logger(WebsiteAuditProcessor.name);
  private baseProcessor: BaseProcessor<WebsiteAuditJob>;

  constructor(private prisma: PrismaService) {
    super();
    this.baseProcessor = new WebsiteAuditProcessorLogic(prisma);
  }

  async process(job: Job<WebsiteAuditJob>): Promise<any> {
    return this.baseProcessor.processWithTracking(job);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Website audit job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Website audit job ${job.id} failed: ${error.message}`);
  }
}

class WebsiteAuditProcessorLogic extends BaseProcessor<WebsiteAuditJob> {
  constructor(prisma: PrismaService) {
    super('website-audit', prisma);
  }

  async process(job: Job<WebsiteAuditJob>): Promise<any> {
    const { leadId, url, organizationId } = job.data;

    // Validate URL
    await this.updateProgress(job, 10, 'Validating URL');
    if (!url || !this.isValidUrl(url)) {
      throw new Error(`Invalid URL: ${url}`);
    }

    const normalizedUrl = this.normalizeUrl(url);
    this.logger.log(`Auditing website: ${normalizedUrl} for lead ${leadId}`);

    const startTime = Date.now();

    // Step 1: Check SSL (20%)
    await this.updateProgress(job, 20, 'Checking SSL certificate');
    const sslResult = await this.checkSSL(normalizedUrl);

    // Step 2: Check mobile responsiveness (30%)
    await this.updateProgress(job, 30, 'Checking mobile responsiveness');
    const mobileResult = await this.checkMobileResponsive(normalizedUrl);

    // Step 3: Analyze SEO (45%)
    await this.updateProgress(job, 45, 'Analyzing SEO');
    const seoResult = await this.checkSEO(normalizedUrl);

    // Step 4: Check performance (60%)
    await this.updateProgress(job, 60, 'Checking performance');
    const perfResult = await this.checkPerformance(normalizedUrl);

    // Step 5: Detect technologies (75%)
    await this.updateProgress(job, 75, 'Detecting technologies');
    const techResult = await this.detectTechnologies(normalizedUrl);

    // Step 6: Compile and save (90%)
    await this.updateProgress(job, 90, 'Compiling audit report');
    const loadTime = (Date.now() - startTime) / 1000;

    // Calculate score
    const lighthousePerf = perfResult.performance || 0;
    const hasSSL = sslResult.hasSSL ? 10 : 0;
    const isMobile = mobileResult ? 15 : 0;
    const hasMetaTags = seoResult.hasMetaTags ? 10 : 0;
    const hasStructuredData = seoResult.hasStructuredData ? 5 : 0;
    const hasSitemap = seoResult.hasSitemap ? 5 : 0;
    const totalScore = lighthousePerf + hasSSL + isMobile + hasMetaTags + hasStructuredData + hasSitemap;

    const audit = await this.prisma.websiteAudit.upsert({
      where: { leadId },
      create: {
        leadId,
        url: normalizedUrl,
        isAccessible: true,
        hasSSL: sslResult.hasSSL,
        sslExpiry: sslResult.expiry,
        loadTime,
        isMobileResponsive: mobileResult,
        hasMetaTags: seoResult.hasMetaTags,
        hasStructuredData: seoResult.hasStructuredData,
        hasSitemap: seoResult.hasSitemap,
        hasRobotsTxt: seoResult.hasRobotsTxt,
        metaTags: seoResult.metaTags as any,
        technologies: techResult as any,
        lighthousePerformance: perfResult.performance,
        lighthouseAccessibility: perfResult.accessibility,
        lighthouseBestPractices: perfResult.bestPractices,
        lighthouseSEO: perfResult.seo,
        report: {
          score: totalScore,
          checks: {
            ssl: sslResult.hasSSL,
            mobile: mobileResult,
            metaTags: seoResult.hasMetaTags,
            structuredData: seoResult.hasStructuredData,
            sitemap: seoResult.hasSitemap,
            robotsTxt: seoResult.hasRobotsTxt,
          },
          technologies: techResult,
        },
      },
      update: {
        url: normalizedUrl,
        isAccessible: true,
        hasSSL: sslResult.hasSSL,
        sslExpiry: sslResult.expiry,
        loadTime,
        isMobileResponsive: mobileResult,
        hasMetaTags: seoResult.hasMetaTags,
        hasStructuredData: seoResult.hasStructuredData,
        hasSitemap: seoResult.hasSitemap,
        hasRobotsTxt: seoResult.hasRobotsTxt,
        metaTags: seoResult.metaTags as any,
        technologies: techResult as any,
        lighthousePerformance: perfResult.performance,
        lighthouseAccessibility: perfResult.accessibility,
        lighthouseBestPractices: perfResult.bestPractices,
        lighthouseSEO: perfResult.seo,
        report: {
          score: totalScore,
          checks: {
            ssl: sslResult.hasSSL,
            mobile: mobileResult,
            metaTags: seoResult.hasMetaTags,
            structuredData: seoResult.hasStructuredData,
            sitemap: seoResult.hasSitemap,
            robotsTxt: seoResult.hasRobotsTxt,
          },
          technologies: techResult,
        },
        updatedAt: new Date(),
      },
    });

    // Update lead signals
    const signals = [];
    if (!sslResult.hasSSL) signals.push({ type: 'NO_SSL', message: 'Website does not have SSL certificate' });
    if (!mobileResult) signals.push({ type: 'NOT_MOBILE_FRIENDLY', message: 'Website is not mobile responsive' });
    if (lighthousePerf < 50) signals.push({ type: 'SLOW_WEBSITE', message: 'Website performance is poor' });
    if (!seoResult.hasMetaTags) signals.push({ type: 'POOR_SEO', message: 'Missing basic SEO meta tags' });

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { signals: signals as any },
    });

    await this.updateProgress(job, 100, `Audit complete - Score: ${totalScore}`);

    return audit;
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private normalizeUrl(url: string): string {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return `https://${url}`;
    }
    return url;
  }

  private async checkSSL(url: string): Promise<{ hasSSL: boolean; expiry?: Date }> {
    try {
      const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      const hasSSL = url.startsWith('https') || response.url.startsWith('https');
      return { hasSSL };
    } catch {
      return { hasSSL: false };
    }
  }

  private async checkMobileResponsive(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
        },
      });
      const html = await response.text();
      return html.includes('viewport') || html.includes('responsive') || html.includes('media=');
    } catch {
      return false;
    }
  }

  private async checkSEO(url: string): Promise<any> {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      const html = await response.text();

      const hasMetaTags = html.includes('<meta') && html.includes('name="description"');
      const hasStructuredData = html.includes('application/ld+json') || html.includes('schema.org');
      const hasSitemap = await this.checkUrlExists(new URL('/sitemap.xml', url).toString());
      const hasRobotsTxt = await this.checkUrlExists(new URL('/robots.txt', url).toString());

      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i);

      return {
        hasMetaTags: !!hasMetaTags,
        hasStructuredData: !!hasStructuredData,
        hasSitemap,
        hasRobotsTxt,
        metaTags: {
          title: titleMatch?.[1] || null,
          description: descMatch?.[1] || null,
        },
      };
    } catch {
      return { hasMetaTags: false, hasStructuredData: false, hasSitemap: false, hasRobotsTxt: false, metaTags: {} };
    }
  }

  private async checkPerformance(url: string): Promise<any> {
    try {
      const start = Date.now();
      const response = await fetch(url, { redirect: 'follow' });
      await response.text();
      const loadTime = Date.now() - start;

      const loadTimeScore = Math.max(0, 100 - (loadTime / 100));
      return {
        performance: Math.round(loadTimeScore),
        accessibility: null,
        bestPractices: null,
        seo: null,
      };
    } catch {
      return { performance: 0, accessibility: null, bestPractices: null, seo: null };
    }
  }

  private async detectTechnologies(url: string): Promise<string[]> {
    const technologies: string[] = [];

    try {
      const response = await fetch(url, { redirect: 'follow' });
      const html = await response.text();
      const headers = response.headers;

      if (html.includes('wp-content') || html.includes('wp-includes')) technologies.push('WordPress');
      if (html.includes('shopify')) technologies.push('Shopify');
      if (html.includes('woocommerce')) technologies.push('WooCommerce');
      if (html.includes('wix')) technologies.push('Wix');
      if (html.includes('squarespace')) technologies.push('Squarespace');
      if (html.includes('react')) technologies.push('React');
      if (html.includes('next.js') || html.includes('_next')) technologies.push('Next.js');
      if (html.includes('vue') || html.includes('__VUE__')) technologies.push('Vue');

      const server = headers.get('server');
      if (server) technologies.push(server);

      if (html.includes('google-analytics') || html.includes('gtag')) technologies.push('Google Analytics');
      if (html.includes('facebook-pixel') || html.includes('fbq(')) technologies.push('Facebook Pixel');

      return [...new Set(technologies)];
    } catch {
      return technologies;
    }
  }

  private async checkUrlExists(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}
