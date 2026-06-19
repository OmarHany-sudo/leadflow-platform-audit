import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  // Server
  port: parseInt(process.env.PORT, 10) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // URLs
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  apiUrl: process.env.API_URL || 'http://localhost:3001',
  
  // Security
  jwtSecret: process.env.JWT_SECRET || 'leadflow_jwt_secret_key_2024',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'leadflow_refresh_secret_key_2024',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  
  // Bcrypt
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
  
  // App Info
  appName: process.env.APP_NAME || 'LeadFlow',
  appVersion: process.env.APP_VERSION || '1.0.0',
}));

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL,
}));

export const redisConfig = registerAs('redis', () => ({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
}));

export const aiConfig = registerAs('ai', () => ({
  // Primary: Gemini
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  
  // Fallback: Groq
  groqApiKey: process.env.GROQ_API_KEY,
  groqModel: process.env.GROQ_MODEL || 'llama-3.1-70b-versatile',
  
  // Future: OpenAI
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  
  // Default Provider
  defaultProvider: process.env.AI_DEFAULT_PROVIDER || 'gemini',
  
  // Scoring Weights
  scoringWeights: {
    noWebsite: 50,
    poorWebsite: 25,
    poorSEO: 20,
    slowWebsite: 15,
    noSSL: 10,
    weakBranding: 10,
    hiringActivity: 20,
    recentFunding: 30,
    intentSignal: 50,
    growingBusiness: 25,
  },
}));