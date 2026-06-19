# Prisma Migration Plan
## LeadFlow Platform - Architecture v2

### Migration Strategy
- **Type:** Incremental (non-destructive)
- **Approach:** Feature-based migrations
- **Safety:** All migrations use safe operations (no data loss)
- **Rollback:** Each migration can be rolled back independently

---

## Migration 1: Contact & Pipeline Foundation

### New Models

```prisma
// Contact - Separate from Lead
model Contact {
  id          String       @id @default(cuid())
  firstName   String
  lastName    String
  email       String?
  phone       String?
  jobTitle    String?
  department  String?
  
  // Role classification
  role        ContactRole  @default(INFLUENCER)
  isPrimary   Boolean      @default(false)
  isDecisionMaker Boolean  @default(false)
  
  // Social Profiles
  linkedInUrl     String?
  twitterUrl      String?
  facebookUrl     String?
  
  // Enrichment
  enrichedAt      DateTime?
  enrichmentData  Json?    @default("{}")
  
  // Relations
  lead        Lead     @relation(fields: [leadId], references: [id], onDelete: Cascade)
  leadId      String
  
  createdBy   User     @relation(fields: [createdById], references: [id])
  createdById String
  
  // Timestamps
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([leadId])
  @@index([email])
  @@map("contacts")
}

// Pipeline - Sales pipeline definition
model Pipeline {
  id          String       @id @default(cuid())
  name        String
  description String?
  type        PipelineType @default(SALES)
  isDefault   Boolean      @default(false)
  
  // Organization
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  organizationId String
  
  // Relations
  stages        PipelineStage[]
  opportunities Opportunity[]
  
  // Timestamps
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  @@unique([organizationId, name])
  @@index([organizationId])
  @@map("pipelines")
}

// Pipeline Stage - Individual stage in a pipeline
model PipelineStage {
  id          String @id @default(cuid())
  name        String
  description String?
  color       String @default("#3B82F6")
  
  // Ordering
  order       Int    @default(0)
  
  // Sales metrics
  winProbability Int @default(0) // 0-100
  expectedDays   Int @default(7) // Expected days in this stage
  
  // Relations
  pipeline     Pipeline @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  pipelineId   String
  
  opportunities Opportunity[]
  
  // Timestamps
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  
  @@index([pipelineId])
  @@index([order])
  @@map("pipeline_stages")
}
```

### New Enums

```prisma
enum ContactRole {
  DECISION_MAKER
  INFLUENCER
  BUDGET_HOLDER
  TECHNICAL_EVALUATOR
  CHAMPION
  BLOCKER
  USER
  OTHER
}

enum PipelineType {
  SALES
  MARKETING
  RECRUITING
  CUSTOM
}
```

### Relation Updates

```prisma
// Add to Lead model:
// contacts      Contact[]
// opportunities Opportunity[]
// qualificationLogs QualificationLog[]

// Add to Organization model:
// pipelines     Pipeline[]
// integrations  Integration[]
// webhooks      Webhook[]

// Add to User model:
// contactsCreated Contact[]
// deals           Deal[]
```

---

## Migration 2: Opportunity & Deal Models

```prisma
// Opportunity - Qualified lead in pipeline
model Opportunity {
  id          String             @id @default(cuid())
  title       String
  description String?            @db.Text
  
  // Value
  estimatedValue   Decimal?      @db.Decimal(12, 2)
  actualValue      Decimal?      @db.Decimal(12, 2)
  currency         String        @default("USD")
  
  // Status
  status          OpportunityStatus @default(OPEN)
  priority        Priority          @default(MEDIUM)
  
  // Dates
  expectedCloseDate DateTime?
  actualCloseDate   DateTime?
  
  // Source
  source          String?         // e.g., "QUALIFIED_LEAD", "REFERRAL"
  sourceDetails   Json?           @default("{}")
  
  // Relations
  lead            Lead            @relation(fields: [leadId], references: [id], onDelete: Cascade)
  leadId          String
  
  pipeline        Pipeline        @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  pipelineId      String
  
  currentStage    PipelineStage   @relation(fields: [currentStageId], references: [id])
  currentStageId  String
  
  organization    Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  organizationId  String
  
  assignedTo      User?           @relation(fields: [assignedToId], references: [id])
  assignedToId    String?
  
  // Related
  deal            Deal?
  insights        OpportunityInsight[]
  activities      Activity[]
  
  // Timestamps
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  
  @@index([leadId])
  @@index([pipelineId])
  @@index([organizationId])
  @@index([status])
  @@index([assignedToId])
  @@map("opportunities")
}

// Deal - Closed opportunity
model Deal {
  id          String     @id @default(cuid())
  title       String
  description String?    @db.Text
  
  // Financial
  value       Decimal    @db.Decimal(12, 2)
  currency    String     @default("USD")
  
  // Status
  status      DealStatus @default(PENDING)
  
  // Close info
  closeDate   DateTime?
  closeReason String?    @db.Text
  
  // Relations
  opportunity   Opportunity @relation(fields: [opportunityId], references: [id], onDelete: Cascade)
  opportunityId String      @unique
  
  organization  Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  organizationId String
  
  assignedTo    User?       @relation(fields: [assignedToId], references: [id])
  assignedToId  String?
  
  // Timestamps
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  
  @@index([opportunityId])
  @@index([organizationId])
  @@index([status])
  @@map("deals")
}
```

### New Enums

```prisma
enum OpportunityStatus {
  OPEN
  QUALIFIED
  PROPOSAL_SENT
  NEGOTIATION
  WON
  LOST
  STALE
  ARCHIVED
}

enum DealStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  CANCELLED
  REFUNDED
  DISPUTED
}
```

---

## Migration 3: Qualification & Intelligence

```prisma
// Qualification Log - Track why/how leads were qualified
model QualificationLog {
  id          String @id @default(cuid())
  
  // BANT Criteria
  hasBudget    Boolean @default(false)
  budgetScore  Int     @default(0)
  hasAuthority Boolean @default(false)
  authorityScore Int   @default(0)
  hasNeed      Boolean @default(false)
  needScore    Int     @default(0)
  hasTimeline  Boolean @default(false)
  timelineScore Int    @default(0)
  
  // Overall
  totalScore   Int     @default(0)
  isQualified  Boolean @default(false)
  
  // Reasoning
  reasons      Json?   @default("[]")
  
  // Relations
  lead         Lead    @relation(fields: [leadId], references: [id], onDelete: Cascade)
  leadId       String
  
  createdAt    DateTime @default(now())
  
  @@index([leadId])
  @@index([isQualified])
  @@map("qualification_logs")
}

// Opportunity Insight - AI-generated intelligence
model OpportunityInsight {
  id          String @id @default(cuid())
  
  // AI Analysis
  winProbability  Int     @default(0) // 0-100
  estimatedRevenue String?
  recommendedService String?
  competitorAnalysis Json? @default("[]")
  urgencyScore    Int     @default(0) // 0-100
  
  // Factors
  positiveFactors Json?   @default("[]")
  riskFactors     Json?   @default("[]")
  
  // Raw
  fullAnalysis    String? @db.Text
  
  // Relations
  opportunity   Opportunity @relation(fields: [opportunityId], references: [id], onDelete: Cascade)
  opportunityId String
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  @@index([opportunityId])
  @@map("opportunity_insights")
}
```

---

## Migration 4: Integration System

```prisma
// Integration - User-owned external service connection
model Integration {
  id          String          @id @default(cuid())
  name        String
  type        IntegrationType
  provider    String          // e.g., "google", "slack", "zapier"
  
  // Credentials (encrypted)
  credentials Json?           @default("{}")
  
  // Status
  status      IntegrationStatus @default(PENDING_SETUP)
  lastSyncAt  DateTime?
  
  // Settings
  settings    Json?           @default("{}")
  
  // Relations
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  organizationId String
  
  webhooks    Webhook[]
  apiKeys     ApiKey[]
  
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  
  @@index([organizationId])
  @@index([type])
  @@index([status])
  @@map("integrations")
}

// API Key - User-managed API access
model ApiKey {
  id          String @id @default(cuid())
  name        String
  keyHash     String @unique
  keyPrefix   String // First 8 chars for display
  
  // Scope
  permissions Json?  @default("[]")
  scopes      Json?  @default("[]")
  
  // Usage
  usageCount  Int    @default(0)
  lastUsedAt  DateTime?
  
  // Status
  isActive    Boolean @default(true)
  expiresAt   DateTime?
  
  // Relations
  integration   Integration? @relation(fields: [integrationId], references: [id], onDelete: SetNull)
  integrationId String?
  
  organization  Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  organizationId String
  
  createdBy     String
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  @@index([organizationId])
  @@index([keyHash])
  @@index([isActive])
  @@map("api_keys")
}

// Webhook - Event subscription
model Webhook {
  id          String @id @default(cuid())
  name        String
  url         String
  secret      String? // For HMAC signature
  
  // Events
  events      Json   @default("[]") // e.g., ["lead.created", "opportunity.won"]
  
  // Status
  status      WebhookStatus @default(ACTIVE)
  
  // Relations
  integration   Integration? @relation(fields: [integrationId], references: [id], onDelete: SetNull)
  integrationId String?
  
  organization  Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  organizationId String
  
  deliveries    WebhookDelivery[]
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  @@index([organizationId])
  @@index([status])
  @@map("webhooks")
}

// Webhook Delivery - Track webhook deliveries
model WebhookDelivery {
  id          String @id @default(cuid())
  
  event       String
  payload     Json
  
  // Response
  responseStatus  Int?
  responseBody    String? @db.Text
  
  // Timing
  deliveredAt DateTime?
  failedAt    DateTime?
  
  // Retry
  attemptCount Int   @default(0)
  
  // Relations
  webhook     Webhook @relation(fields: [webhookId], references: [id], onDelete: Cascade)
  webhookId   String
  
  createdAt   DateTime @default(now())
  
  @@index([webhookId])
  @@index([event])
  @@map("webhook_deliveries")
}
```

### New Enums

```prisma
enum IntegrationType {
  CRM
  EMAIL
  SMS
  SOCIAL
  ANALYTICS
  STORAGE
  AUTOMATION
  CUSTOM
}

enum IntegrationStatus {
  PENDING_SETUP
  ACTIVE
  ERROR
  DISABLED
  EXPIRED
}

enum WebhookStatus {
  ACTIVE
  PAUSED
  DISABLED
  FAILED
}
```

---

## Migration 5: AI Workflows & Dead Letter

```prisma
// Sentiment Analysis - Analyzed message sentiments
model SentimentAnalysis {
  id          String @id @default(cuid())
  
  content     String @db.Text
  sentiment   SentimentType
  score       Float  // -1 to 1
  
  // Details
  positiveScore Float @default(0)
  negativeScore Float @default(0)
  neutralScore  Float @default(0)
  
  keyPhrases    Json? @default("[]")
  
  // Relations
  messageId   String
  leadId      String
  
  createdAt   DateTime @default(now())
  
  @@index([leadId])
  @@index([messageId])
  @@index([sentiment])
  @@map("sentiment_analysis")
}

// Reply Classification - Categorized replies
model ReplyClassification {
  id          String @id @default(cuid())
  
  content     String @db.Text
  intent      ReplyIntent
  confidence  Float
  
  // Extracted info
  extractedData Json? @default("{}")
  
  // Relations
  messageId   String
  leadId      String
  
  createdAt   DateTime @default(now())
  
  @@index([leadId])
  @@index([messageId])
  @@index([intent])
  @@map("reply_classifications")
}

// Dead Letter Job - Failed jobs for manual review
model DeadLetterJob {
  id          String @id @default(cuid())
  
  queueName   String
  jobName     String
  jobId       String
  data        Json?  @default("{}")
  
  // Error
  error       String @db.Text
  errorStack  String? @db.Text
  
  // Retry info
  attempts    Int    @default(0)
  maxAttempts Int    @default(3)
  
  // Resolution
  status      DeadLetterStatus @default(PENDING)
  resolvedAt  DateTime?
  resolvedBy  String?
  resolutionNote String? @db.Text
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([queueName])
  @@index([status])
  @@index([jobId])
  @@map("dead_letter_jobs")
}
```

### New Enums

```prisma
enum SentimentType {
  POSITIVE
  NEGATIVE
  NEUTRAL
  MIXED
}

enum ReplyIntent {
  INTERESTED
  NOT_INTERESTED
  REQUEST_INFO
  PRICING_INQUIRY
  SCHEDULING
  REFERRAL
  COMPLAINT
  SPAM
  OUT_OF_OFFICE
  UNSUBSCRIBE
  NO_RESPONSE
  FOLLOW_UP
}

enum DeadLetterStatus {
  PENDING
  RETRYING
  RESOLVED
  DISCARDED
}
```

---

## Migration 6: Enum Updates to Existing Models

### ActivityType Enum Additions

```prisma
enum ActivityType {
  // ... existing values ...
  
  // Pipeline & Opportunity
  OPPORTUNITY_CREATED
  OPPORTUNITY_UPDATED
  OPPORTUNITY_STAGE_CHANGED
  OPPORTUNITY_WON
  OPPORTUNITY_LOST
  DEAL_CREATED
  DEAL_CLOSED
  DEAL_CANCELLED
  
  // Contact
  CONTACT_ADDED
  CONTACT_UPDATED
  
  // Qualification
  LEAD_QUALIFIED
  LEAD_DISQUALIFIED
  
  // Integration
  INTEGRATION_CONNECTED
  INTEGRATION_ERROR
  WEBHOOK_DELIVERED
  WEBHOOK_FAILED
  
  // AI
  SENTIMENT_ANALYZED
  REPLY_CLASSIFIED
  ENRICHMENT_COMPLETED
}
```

---

## Execution Order

```
1. Migration 1: Contact & Pipeline Foundation
2. Migration 2: Opportunity & Deal Models
3. Migration 3: Qualification & Intelligence
4. Migration 4: Integration System
5. Migration 5: AI Workflows & Dead Letter
6. Migration 6: Enum Updates
```

---

*Prisma migration plan prepared for Architecture v2.*
