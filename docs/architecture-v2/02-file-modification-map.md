# File Modification Map
## LeadFlow Platform - Architecture v2 Implementation

### Legend
- **NEW** : File does not exist, will be created
- **MOD** : File exists, will be modified
- **DEL** : File will be deleted/deprecated

---

## 1. Prisma Schema (MOD)

```
prisma/schema.prisma
```
**Changes:**
- Add `Contact` model
- Add `Pipeline` model
- Add `PipelineStage` model
- Add `Opportunity` model
- Add `Deal` model
- Add `Integration` model
- Add `ApiKey` model
- Add `Webhook` model
- Add `WebhookDelivery` model
- Add `OpportunityInsight` model
- Add `QualificationLog` model
- Add `SentimentAnalysis` model
- Add `ReplyClassification` model
- Add `DeadLetterJob` model
- Add new enums: `PipelineType`, `OpportunityStatus`, `DealStatus`, `IntegrationType`, `WebhookStatus`, `SentimentType`, `ReplyIntent`
- Update `Lead` model: add `contacts`, `opportunities`, `qualificationLogs` relations
- Update `Organization` model: add `pipelines`, `integrations`, `webhooks` relations
- Update `User` model: add `contactsCreated`, `deals` relations
- Update `ActivityType` enum: add opportunity/deal activity types

---

## 2. Queue Processors (7 NEW + 1 NEW base)

```
backend/src/queue/
├── base/
│   └── base.processor.ts                 [NEW] Abstract base processor
├── processors/
│   ├── lead-discovery.processor.ts       [NEW]
│   ├── website-audit.processor.ts        [NEW]
│   ├── ai-analysis.processor.ts          [NEW]
│   ├── campaign.processor.ts             [NEW]
│   ├── follow-up.processor.ts            [NEW]
│   ├── enrichment.processor.ts           [NEW]
│   └── scoring.processor.ts              [NEW]
├── queue.service.ts                      [MOD] Add DLQ methods, progress tracking
└── queue.module.ts                       [MOD] Register processors
```

**Base Processor Features:**
- Retry logic with exponential backoff
- Progress tracking via Job.updateProgress()
- Dead letter handling (DeadLetterJob model)
- Failure handling with error categorization
- Queue metrics emission

---

## 3. Pipeline Module (NEW)

```
backend/src/pipelines/
├── pipelines.module.ts                   [NEW]
├── pipelines.service.ts                  [NEW]
├── pipelines.controller.ts               [NEW]
├── dto/
│   ├── create-pipeline.dto.ts            [NEW]
│   ├── update-pipeline.dto.ts            [NEW]
│   └── pipeline-response.dto.ts          [NEW]
└── entities/
    └── pipeline.entity.ts                [NEW - Prisma type export]
```

**Features:**
- CRUD for pipelines
- Default pipeline auto-creation per organization
- Pipeline stage ordering

---

## 4. Pipeline Stages Module (NEW)

```
backend/src/pipeline-stages/
├── pipeline-stages.module.ts             [NEW]
├── pipeline-stages.service.ts            [NEW]
├── pipeline-stages.controller.ts         [NEW]
├── dto/
│   ├── create-stage.dto.ts               [NEW]
│   ├── update-stage.dto.ts               [NEW]
│   └── reorder-stages.dto.ts             [NEW]
└── entities/
    └── pipeline-stage.entity.ts          [NEW]
```

**Features:**
- CRUD for stages
- Stage reordering
- Win probability per stage
- Default stage templates (Lead, Qualified, Proposal, Won, Lost)

---

## 5. Opportunities Module (NEW)

```
backend/src/opportunities/
├── opportunities.module.ts               [NEW]
├── opportunities.service.ts              [NEW]
├── opportunities.controller.ts           [NEW]
├── dto/
│   ├── create-opportunity.dto.ts         [NEW]
│   ├── update-opportunity.dto.ts         [NEW]
│   ├── opportunity-query.dto.ts          [NEW]
│   └── opportunity-response.dto.ts       [NEW]
└── entities/
    └── opportunity.entity.ts             [NEW]
```

**Features:**
- CRUD for opportunities
- Auto-creation from qualified leads
- Stage transition tracking
- Value estimation
- Win probability

---

## 6. Deals Module (NEW)

```
backend/src/deals/
├── deals.module.ts                       [NEW]
├── deals.service.ts                      [NEW]
├── deals.controller.ts                   [NEW]
├── dto/
│   ├── create-deal.dto.ts                [NEW]
│   ├── update-deal.dto.ts                [NEW]
│   └── deal-response.dto.ts              [NEW]
└── entities/
    └── deal.entity.ts                    [NEW]
```

**Features:**
- Deal creation from opportunities
- Deal value tracking
- Close date estimation
- Revenue forecasting

---

## 7. Qualification Engine (NEW)

```
backend/src/qualification/
├── qualification.module.ts               [NEW]
├── qualification.service.ts              [NEW]
├── qualification.controller.ts           [NEW]
├── dto/
│   ├── qualification-criteria.dto.ts     [NEW]
│   └── qualification-result.dto.ts       [NEW]
└── types/
    └── qualification.types.ts            [NEW]
```

**Features:**
- BANT scoring (Budget, Authority, Need, Timeline)
- Score-based qualification
- Website audit-based qualification
- AI analysis-based qualification
- Intent signal detection
- Growth signal detection
- Auto-create opportunities for qualified leads

---

## 8. Opportunity Intelligence Engine (NEW)

```
backend/src/opportunity-intelligence/
├── opportunity-intelligence.module.ts    [NEW]
├── opportunity-intelligence.service.ts   [NEW]
├── opportunity-intelligence.controller.ts [NEW]
├── dto/
│   └── intelligence-report.dto.ts        [NEW]
└── types/
    └── intelligence.types.ts             [NEW]
```

**Features:**
- Win probability calculation
- Estimated revenue prediction
- Recommended service matching
- Competitor analysis
- Urgency score calculation

---

## 9. Contacts Module (NEW)

```
backend/src/contacts/
├── contacts.module.ts                    [NEW]
├── contacts.service.ts                   [NEW]
├── contacts.controller.ts                [NEW]
├── dto/
│   ├── create-contact.dto.ts             [NEW]
│   ├── update-contact.dto.ts             [NEW]
│   └── contact-query.dto.ts              [NEW]
└── entities/
    └── contact.entity.ts                 [NEW]
```

**Features:**
- Multi-contact per lead/company
- Contact roles (decision-maker, influencer, etc.)
- Primary contact designation
- Social profiles per contact

---

## 10. Integrations Module (NEW)

```
backend/src/integrations/
├── integrations.module.ts                [NEW]
├── integrations.service.ts               [NEW]
├── integrations.controller.ts            [NEW]
├── dto/
│   ├── create-integration.dto.ts         [NEW]
│   ├── update-integration.dto.ts         [NEW]
│   └── integration-response.dto.ts       [NEW]
└── entities/
    └── integration.entity.ts             [NEW]
```

**Features:**
- User-owned integration credentials
- Integration type management
- Status tracking
- Encrypted credential storage

---

## 11. API Keys Module (NEW)

```
backend/src/api-keys/
├── api-keys.module.ts                    [NEW]
├── api-keys.service.ts                   [NEW]
├── api-keys.controller.ts                [NEW]
├── dto/
│   ├── create-api-key.dto.ts             [NEW]
│   └── api-key-response.dto.ts           [NEW]
└── entities/
    └── api-key.entity.ts                 [NEW]
```

**Features:**
- API key generation
- Key rotation
- Usage tracking
- Scoped permissions

---

## 12. Webhooks Module (NEW)

```
backend/src/webhooks/
├── webhooks.module.ts                    [NEW]
├── webhooks.service.ts                   [NEW]
├── webhooks.controller.ts                [NEW]
├── dto/
│   ├── create-webhook.dto.ts             [NEW]
│   ├── update-webhook.dto.ts             [NEW]
│   └── webhook-delivery.dto.ts           [NEW]
└── entities/
    └── webhook.entity.ts                 [NEW]
```

**Features:**
- Webhook registration
- Event filtering
- Delivery tracking
- Retry logic
- Signature verification

---

## 13. AI Workflow Upgrades (NEW)

```
backend/src/ai-workflows/
├── ai-workflows.module.ts                [NEW]
├── services/
│   ├── enrichment.service.ts             [NEW]
│   ├── contact-discovery.service.ts      [NEW]
│   ├── social-discovery.service.ts       [NEW]
│   ├── sentiment-analysis.service.ts     [NEW]
│   └── reply-classifier.service.ts       [NEW]
├── controllers/
│   └── ai-workflows.controller.ts        [NEW]
├── dto/
│   ├── enrichment-request.dto.ts         [NEW]
│   ├── sentiment-request.dto.ts          [NEW]
│   └── classification-request.dto.ts     [NEW]
└── types/
    └── ai-workflows.types.ts             [NEW]
```

**Features:**
- Data enrichment pipeline
- Missing contact discovery via AI
- Social profile discovery
- Sentiment analysis on replies
- Reply intent classification

---

## 14. Modified Existing Files

### App Module (MOD)
```
backend/src/app.module.ts
```
**Changes:** Import all new modules

### Leads Service (MOD)
```
backend/src/leads/leads.service.ts
```
**Changes:**
- Add `qualifyLead()` method
- Add `createOpportunityFromLead()` method
- Add contact integration

### Leads Controller (MOD)
```
backend/src/leads/leads.controller.ts
```
**Changes:** Add qualification endpoints

### AI Analysis Service (MOD)
```
backend/src/ai-analysis/ai-analysis.service.ts
```
**Changes:**
- Add enrichment prompts
- Add sentiment analysis method
- Add reply classification method

### Queue Service (MOD)
```
backend/src/queue/queue.service.ts
```
**Changes:**
- Add `addToDeadLetter()` method
- Add `updateJobProgress()` method
- Add `getJobMetrics()` method

### Activities Service (MOD)
```
backend/src/activities/activities.service.ts
```
**Changes:** Add opportunity/deal activity logging

---

## 15. File Count Summary

| Category | NEW Files | MOD Files | Total |
|----------|-----------|-----------|-------|
| Prisma | 0 | 1 | 1 |
| Queue Processors | 8 | 2 | 10 |
| Pipeline | 6 | 0 | 6 |
| Pipeline Stages | 6 | 0 | 6 |
| Opportunities | 6 | 0 | 6 |
| Deals | 6 | 0 | 6 |
| Qualification | 5 | 0 | 5 |
| Intelligence | 5 | 0 | 5 |
| Contacts | 6 | 0 | 6 |
| Integrations | 6 | 0 | 6 |
| API Keys | 5 | 0 | 5 |
| Webhooks | 6 | 0 | 6 |
| AI Workflows | 8 | 0 | 8 |
| Existing Modifications | 0 | 6 | 6 |
| **TOTAL** | **80** | **9** | **89** |

---

*File map prepared for Architecture v2 implementation.*
