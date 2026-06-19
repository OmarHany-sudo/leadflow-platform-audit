import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { Temperature, Priority } from '@prisma/client';

interface AIProvider {
  name: string;
  generateContent(prompt: string): Promise<string>;
}

// Gemini Provider
class GeminiProvider implements AIProvider {
  name = 'gemini';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateContent(prompt: string): Promise<string> {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 8192,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (error) {
      throw new Error(`Gemini provider failed: ${error.message}`);
    }
  }
}

// Groq Provider
class GroqProvider implements AIProvider {
  name = 'groq';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateContent(prompt: string): Promise<string> {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 8192,
        }),
      });

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (error) {
      throw new Error(`Groq provider failed: ${error.message}`);
    }
  }
}

@Injectable()
export class AiAnalysisService {
  private readonly logger = new Logger(AiAnalysisService.name);
  private providers: Map<string, AIProvider> = new Map();
  private defaultProvider: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    // Initialize providers
    const geminiKey = this.configService.get('ai.geminiApiKey');
    const groqKey = this.configService.get('ai.groqApiKey');

    if (geminiKey) {
      this.providers.set('gemini', new GeminiProvider(
        geminiKey,
        this.configService.get('ai.geminiModel'),
      ));
    }

    if (groqKey) {
      this.providers.set('groq', new GroqProvider(
        groqKey,
        this.configService.get('ai.groqModel'),
      ));
    }

    this.defaultProvider = this.configService.get('ai.defaultProvider', 'gemini');
  }

  async analyzeLead(leadId: string, userId: string, provider?: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        scoringResults: true,
        websiteAudit: true,
      },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    // Generate AI analysis
    const analysis = await this.generateLeadAnalysis(lead, provider);

    // Save report
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
        data: {
          score: analysis.priorityScore,
          temperature,
          priority,
        },
      });
    }

    this.logger.log(`AI analysis completed for lead: ${lead.businessName}`);
    return report;
  }

  async generateOutreachMessage(leadId: string, type: string, provider?: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        aiReport: true,
        scoringResults: true,
        websiteAudit: true,
      },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    const prompt = this.buildOutreachPrompt(lead, type);
    const content = await this.generateWithFallback(prompt, provider);

    return {
      content,
      type,
      leadId,
      isAIGenerated: true,
      aiPrompt: prompt,
    };
  }

  async generateFollowUp(leadId: string, sequence: number, previousMessages: any[], provider?: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    const prompt = this.buildFollowUpPrompt(lead, sequence, previousMessages);
    const content = await this.generateWithFallback(prompt, provider);

    return {
      content,
      sequence,
      leadId,
      isAIGenerated: true,
    };
  }

  private async generateLeadAnalysis(lead: any, preferredProvider?: string): Promise<any> {
    const prompt = this.buildAnalysisPrompt(lead);
    const response = await this.generateWithFallback(prompt, preferredProvider);

    try {
      // Try to parse JSON response
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

    // Fallback: return raw response
    return {
      businessSummary: response.substring(0, 1000),
      priorityScore: 50,
      leadTemperature: 'WARM',
      outreachStrategy: response,
    };
  }

  private async generateWithFallback(prompt: string, preferredProvider?: string): Promise<string> {
    const providerName = preferredProvider || this.defaultProvider;
    const provider = this.providers.get(providerName);

    if (provider) {
      try {
        return await provider.generateContent(prompt);
      } catch (error) {
        this.logger.warn(`${providerName} failed, trying fallback: ${error.message}`);
      }
    }

    // Try all available providers
    for (const [name, prov] of this.providers) {
      if (name === providerName) continue; // Already tried
      try {
        return await prov.generateContent(prompt);
      } catch (error) {
        this.logger.warn(`${name} also failed: ${error.message}`);
      }
    }

    throw new Error('All AI providers failed');
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

  private buildOutreachPrompt(lead: any, type: string): string {
    return `Write a personalized ${type} outreach message for:

Business: ${lead.businessName}
Industry: ${lead.industry || 'Unknown'}
Location: ${lead.city || ''}, ${lead.country || ''}
Pain Points: ${lead.aiReport?.technicalWeaknesses?.join(', ') || 'Unknown'}

Requirements:
- Personalized using the business name
- Reference specific pain points or opportunities
- Professional but friendly tone
- Include clear call-to-action
- Keep it concise (150-300 words)
- Write in ${lead.country?.includes('Saudi') || lead.country?.includes('Arab') ? 'Arabic' : 'English'}

Generate only the message content, no extra text.`;
  }

  private buildFollowUpPrompt(lead: any, sequence: number, previousMessages: any[]): string {
    const previousContent = previousMessages.map(m => m.content).join('\n---\n');
    
    return `Write follow-up #${sequence} for:

Business: ${lead.businessName}
Industry: ${lead.industry || 'Unknown'}

Previous messages:
${previousContent}

Requirements:
- Professional and polite
- Add new value or information
- Reference previous communication
- Clear call-to-action
- Keep it concise (100-200 words)
- Write in ${lead.country?.includes('Saudi') || lead.country?.includes('Arab') ? 'Arabic' : 'English'}

Generate only the message content.`;
  }
}