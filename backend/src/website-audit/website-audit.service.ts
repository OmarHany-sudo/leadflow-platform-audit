import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class WebsiteAuditService {
  private readonly logger = new Logger(WebsiteAuditService.name);

  constructor(private prisma: PrismaService) {}

  async auditWebsite(leadId: string, url: string) {
    this.logger.log(`Starting website audit for: ${url}`);

    const startTime = Date.now();
    
    try {
      // Run checks in parallel
      const [
        sslResult,
        performanceResult,
        seoResult,
        techResult,
        mobileResult,
      ] = await Promise.allSettled([
        this.checkSSL(url),
        this.checkPerformance(url),
        this.checkSEO(url),
        this.detectTechnologies(url),
        this.checkMobileResponsive(url),
      ]);

      const loadTime = sslResult.status === 'fulfilled' ? Date.now() - startTime : undefined;

      // Aggregate results
      const audit = {
        url,
        isAccessible: true,
        hasSSL: sslResult.status === 'fulfilled' ? sslResult.value.hasSSL : false,
        sslExpiry: sslResult.status === 'fulfilled' ? sslResult.value.expiry : null,
        loadTime: loadResult ? loadTime / 1000 : null,
        isMobileResponsive: mobileResult.status === 'fulfilled' ? mobileResult.value : false,
        hasMetaTags: seoResult.status === 'fulfilled' ? seoResult.value.hasMetaTags : false,
        hasStructuredData: seoResult.status === 'fulfilled' ? seoResult.value.hasStructuredData : false,
        hasSitemap: seoResult.status === 'fulfilled' ? seoResult.value.hasSitemap : false,
        hasRobotsTxt: seoResult.status === 'fulfilled' ? seoResult.value.hasRobotsTxt : false,
        metaTags: seoResult.status === 'fulfilled' ? seoResult.value.metaTags : {},
        technologies: techResult.status === 'fulfilled' ? techResult.value : [],
        lighthousePerformance: performanceResult.status === 'fulfilled' ? performanceResult.value.performance : null,
        lighthouseAccessibility: performanceResult.status === 'fulfilled' ? performanceResult.value.accessibility : null,
        lighthouseBestPractices: performanceResult.status === 'fulfilled' ? performanceResult.value.bestPractices : null,
        lighthouseSEO: performanceResult.status === 'fulfilled' ? performanceResult.value.seo : null,
      };

      // Calculate scores
      const lighthousePerformance = audit.lighthousePerformance || 0;
      const hasSSL = audit.hasSSL ? 10 : 0;
      const isMobile = audit.isMobileResponsive ? 15 : 0;
      const hasMetaTags = audit.hasMetaTags ? 10 : 0;
      const hasStructuredData = audit.hasStructuredData ? 5 : 0;
      const hasSitemap = audit.hasSitemap ? 5 : 0;

      const totalScore = lighthousePerformance + hasSSL + isMobile + hasMetaTags + hasStructuredData + hasSitemap;

      // Save or update audit
      const saved = await this.prisma.websiteAudit.upsert({
        where: { leadId },
        create: {
          leadId,
          ...audit,
          report: {
            score: totalScore,
            checks: {
              ssl: audit.hasSSL,
              mobile: audit.isMobileResponsive,
              metaTags: audit.hasMetaTags,
              structuredData: audit.hasStructuredData,
              sitemap: audit.hasSitemap,
              robotsTxt: audit.hasRobotsTxt,
            },
            technologies: audit.technologies,
          },
        },
        update: {
          ...audit,
          report: {
            score: totalScore,
            checks: {
              ssl: audit.hasSSL,
              mobile: audit.isMobileResponsive,
              metaTags: audit.hasMetaTags,
              structuredData: audit.hasStructuredData,
              sitemap: audit.hasSitemap,
              robotsTxt: audit.hasRobotsTxt,
            },
            technologies: audit.technologies,
          },
          updatedAt: new Date(),
        },
      });

      this.logger.log(`Website audit completed for ${url} - Score: ${totalScore}`);

      // Update lead with findings
      const signals = [];
      if (!audit.hasSSL) signals.push({ type: 'NO_SSL', message: 'Website does not have SSL certificate' });
      if (!audit.isMobileResponsive) signals.push({ type: 'NOT_MOBILE_FRIENDLY', message: 'Website is not mobile responsive' });
      if (lighthousePerformance < 50) signals.push({ type: 'SLOW_WEBSITE', message: 'Website performance is poor' });
      if (!audit.hasMetaTags) signals.push({ type: 'POOR_SEO', message: 'Missing basic SEO meta tags' });

      await this.prisma.lead.update({
        where: { id: leadId },
        data: {
          signals: signals as any,
        },
      });

      return saved;
    } catch (error) {
      this.logger.error(`Website audit failed for ${url}: ${error.message}`);
      
      // Save failed audit
      return this.prisma.websiteAudit.upsert({
        where: { leadId },
        create: {
          leadId,
          url,
          isAccessible: false,
          report: { error: error.message },
        },
        update: {
          url,
          isAccessible: false,
          report: { error: error.message },
          updatedAt: new Date(),
        },
      });
    }
  }

  async getAudit(leadId: string) {
    return this.prisma.websiteAudit.findUnique({
      where: { leadId },
    });
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

  private async checkPerformance(url: string): Promise<any> {
    try {
      const start = performance.now();
      const response = await fetch(url, { redirect: 'follow' });
      await response.text();
      const loadTime = performance.now() - start;

      // Simple performance estimation
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

  private async checkSEO(url: string): Promise<any> {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      const html = await response.text();

      const hasMetaTags = html.includes('<meta') && html.includes('name="description"');
      const hasStructuredData = html.includes('application/ld+json') || html.includes('schema.org');
      const hasSitemap = await this.checkUrlExists(new URL('/sitemap.xml', url).toString());
      const hasRobotsTxt = await this.checkUrlExists(new URL('/robots.txt', url).toString());

      // Extract meta tags
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
      return {
        hasMetaTags: false,
        hasStructuredData: false,
        hasSitemap: false,
        hasRobotsTxt: false,
        metaTags: {},
      };
    }
  }

  private async detectTechnologies(url: string): Promise<string[]> {
    const technologies: string[] = [];
    
    try {
      const response = await fetch(url, { redirect: 'follow' });
      const html = await response.text();
      const headers = response.headers;

      // CMS Detection
      if (html.includes('wp-content') || html.includes('wp-includes')) technologies.push('WordPress');
      if (html.includes('shopify')) technologies.push('Shopify');
      if (html.includes('woocommerce')) technologies.push('WooCommerce');
      if (html.includes('wix')) technologies.push('Wix');
      if (html.includes('squarespace')) technologies.push('Squarespace');
      if (html.includes('magento')) technologies.push('Magento');

      // Framework Detection
      if (html.includes('react')) technologies.push('React');
      if (html.includes('next.js') || html.includes('_next')) technologies.push('Next.js');
      if (html.includes('vue') || html.includes('__VUE__')) technologies.push('Vue');
      if (html.includes('angular')) technologies.push('Angular');
      if (html.includes('laravel')) technologies.push('Laravel');

      // Server Detection
      const server = headers.get('server');
      if (server) technologies.push(server);
      if (headers.get('x-powered-by')?.includes('PHP')) technologies.push('PHP');
      if (headers.get('x-powered-by')?.includes('Express')) technologies.push('Express.js');

      // Analytics
      if (html.includes('google-analytics') || html.includes('gtag')) technologies.push('Google Analytics');
      if (html.includes('facebook-pixel') || html.includes('fbq(')) technologies.push('Facebook Pixel');

      return [...new Set(technologies)];
    } catch {
      return technologies;
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

  private async checkUrlExists(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}