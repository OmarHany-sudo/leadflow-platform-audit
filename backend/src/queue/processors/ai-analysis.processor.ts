import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { BaseProcessor } from '../base/base.processor';
import { AIAnalysisJob } from '../queue.service';
import { Temperature, Priority } from '@prisma/client';

@Processor('ai-analysis', {
  concurrency: 2,
  limiter: { max: 3, duration: 60000 },
  lockDuration: 120000,
  stalledInterval: 30000,
})
export class AiAnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(AiAnalysisProcessor.name);
  private baseProcessor: BaseProcessor<AIAnalysisJob>;

  constructor(private prisma: PrismaService, private configService: ConfigService) {
    super();
    this.baseProcessor = new AiAnalysisProcessorLogic(prisma, configService);
  }

  async process(job: Job<AIAnalysisJob>): Promise<any> {
    return this.baseProcessor.processWithTracking(job);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`AI analysis job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`AI analysis job ${job.id} failed: ${error.message}`);
  }
}

class AiAnalysisProcessorLogic extends BaseProcessor<AIAnalysisJob> {
  private providers: Map<string, any> = new Map();
  private defaultProvider: string;

  constructor(prisma: PrismaService, private configService: ConfigService) {
    super('ai-analysis', prisma);
    this.initializeProviders();
  }

  private initializeProviders() {
    const geminiKey = this.configService.get('ai.geminiApiKey');
    const groqKey = this.configService.get('ai.groqApiKey');

    if (geminiKey) {
      this.providers.set('gemini', { name: 'gemini', apiKey: geminiKey, model: this.configService.get('ai.geminiModel', 'gemini-1.5-flash') });
    }

    if (groqKey) {
      this.providers.set('groq', { name: 'groq', apiKey: groqKey, model: this.configService.get('ai.groqModel', 'llama-3.1-70b-versatile') });
    }

    this.defaultProvider = this.configService.get('ai.defaultProvider', 'gemini');
  }

  async process(job: Job<AIAnalysisJob>): Promise<any> {
    const { leadId, userId, provider } = job.data;

    // Load lead data (15%)
    await this.updateProgress(job, 15, 'Loading lead data');
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { scoringResults: true, websiteAudit: true },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    // Build AI prompt (40%)
    await this.updateProgress(job, 40, 'Building analysis prompt');
    const prompt = this.buildAnalysisPrompt(lead);

    // Call AI provider (60%)
    await this.updateProgress(job, 60, 'Calling AI provider');
    const response = await this.generateWithFallback(prompt, provider);

    // Parse response (75%)
    await this.updateProgress(job, 75, 'Parsing AI response');
    const analysis = this.parseAIResponse(response);

    // Validate and save (90%)
    await this.updateProgress(job, 90, 'Saving analysis report');
    const report = await this.prisma.aIReport.upsert({
      where: { leadId },
      create: {
        leadId,
        generatedById: userId,
        ...analysis,
        aiProvider: provider || this.defaultProvider,
        fullReport: analysis as any,
      },
      update: {
        ...analysis,
        aiProvider: provider || this.defaultProvider,
        fullReport: analysis as any,
        updatedAt: new Date(),
      },
    });

    // Update lead score based on analysis
    if (analysis.priorityScore) {
      let temperature = Temperature.COLD;
      if (analysis.priorityScore >= 80) temperature = Temperature.HOT;
      else if (analysis.priorityScore >= 50) temperature = Temperature.WARM;

      let priority = Priority.LOW;
      if (analysis.priorityScore >= 80) priority = Priority.CRITICAL;
      else if (analysis.priorityScore >= 60) priority = Priority.HIGH;
      else if (analysis.priorityScore >= 40) priority = Priority.MEDIUM;

      await this.prisma.lead.update({
        where: { id: leadId },
        data: { score: analysis.priorityScore, temperature, priority },
      });
    }

    await this.updateProgress(job, 100, 'Analysis complete');

    this.logger.log(`AI analysis completed for lead: ${lead.businessName}`);
    return report;
  }

  private async generateWithFallback(prompt: string, preferredProvider?: string): Promise<string> {
    const providerName = preferredProvider || this.defaultProvider;
    const provider = this.providers.get(providerName);

    if (provider) {
      try {
        return await this.generateWithGemini(provider, prompt);
      } catch (error: any) {
        this.logger.warn(`${providerName} failed, trying fallback: ${error.message}`);
      }
    }

    // Try all available providers
    for (const [name, prov] of this.providers) {
      if (name === providerName) continue;
      try {
        return await this.generateWithGemini(prov, prompt);
      } catch (error: any) {
        this.logger.warn(`${name} also failed: ${error.message}`);
      }
    }

    throw new Error('All AI providers failed');
  }

  private async generateWithGemini(provider: any, prompt: string): Promise<string> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${provider.model}:generateContent?key=${provider.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  private buildAnalysisPrompt(lead: any): string {
    const websiteAudit = lead.websiteAudit ? JSON.stringify(lead.websiteAudit, null, 2) : 'No website audit available';
    const scoringResults = lead.scoringResults ? JSON.stringify(lead.scoringResults, null, 2) : 'No scoring results';

    return `Analyze the following business lead and provide a detailed opportunity assessment in JSON format:

Business Name: ${lead.businessName}
Industry: ${lead.industry || 'Unknown'}
Category: ${lead.category || 'Unknown'}
Website: ${lead.website || 'None'}
Location: ${lead.city || ''}, ${lead.country || ''}
Description: ${lead.description || 'None'}
Employee Count: ${lead.employeeCount || 'Unknown'}
Revenue: ${lead.revenue || 'Unknown'}

Website Audit:
${websiteAudit}

Scoring Results:
${scoringResults}

Respond ONLY with a JSON object in this exact format:
{
  "businessSummary": "Brief business summary...",
  "industryAnalysis": "Industry context and trends...",
  "websiteAnalysis": "Website quality assessment...",
  "technicalWeaknesses": ["weakness 1", "weakness 2"],
  "growthSignals": ["signal 1", "signal 2"],
  "opportunities": ["opportunity 1", "opportunity 2"],
  "recommendedServices": ["service 1", "service 2"],
  "leadTemperature": "HOT|WARM|COLD",
  "priorityScore": 75,
  "estimatedDealValue": "$5,000 - $10,000",
  "outreachStrategy": "Recommended outreach approach...",
  "recommendedPitch": "Key selling points..."
}`;
  }

  private parseAIResponse(response: string): any {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          businessSummary: parsed.businessSummary || '',
          industryAnalysis: parsed.industryAnalysis || '',
          websiteAnalysis: parsed.websiteAnalysis || '',
          technicalWeaknesses: parsed.technicalWeaknesses || [],
          growthSignals: parsed.growthSignals || [],
          opportunities: parsed.opportunities || [],
          recommendedServices: parsed.recommendedServices || [],
          leadTemperature: parsed.leadTemperature || 'COLD',
          priorityScore: Math.min(100, Math.max(0, parseInt(parsed.priorityScore) || 0)),
          estimatedDealValue: parsed.estimatedDealValue || '',
          outreachStrategy: parsed.outreachStrategy || '',
          recommendedPitch: parsed.recommendedPitch || '',
        };
      }
    } catch (e) {
      this.logger.warn('Failed to parse AI response as JSON, using text format');
    }

    return {
      businessSummary: response.substring(0, 1000),
      priorityScore: 50,
      leadTemperature: 'WARM',
      outreachStrategy: response,
    };
  }
}
