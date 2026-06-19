# Architecture Gap Resolution Plan
## LeadFlow Platform - v2 Architecture

### Document Information
- **Version:** 2.0.0
- **Date:** 2026-06-20
- **Status:** Implementation Ready
- **Source:** GAP_ANALYSIS.md findings

---

## 1. Gap Inventory (from Audit Report)

### Critical Gaps (P0 - Must Fix)

| # | Gap | Impact | Component |
|---|-----|--------|-----------|
| 1 | **7 BullMQ queues defined but NO processors implemented** | System is entirely synchronous; background jobs never execute; scalability is non-existent | Queue Module |
| 2 | **No Pipeline/Opportunity/Deal entities** | Platform is lead-only, not a CRM; no revenue tracking; no sales workflow | Data Model |
| 3 | **No Lead Qualification Engine** | Leads never auto-qualify; sales team must manually review every lead | Business Logic |

### High Priority Gaps (P1)

| # | Gap | Impact | Component |
|---|-----|--------|-----------|
| 4 | **No Integration entity** | Users cannot add their own API keys for external services | Integrations |
| 5 | **No Webhook entity** | No event-driven external notifications | Integrations |
| 6 | **No ApiKey entity** | No user-managed API access | Integrations |
| 7 | **No Contact entity** | Contacts mixed with Leads; no multi-contact per company | Data Model |
| 8 | **AI prompts are hardcoded** | Cannot update prompts without code deployment | AI Module |

### Medium Priority Gaps (P2)

| # | Gap | Impact | Component |
|---|-----|--------|-----------|
| 9 | **No Sentiment Analysis workflow** | Cannot analyze reply sentiment | AI Workflows |
| 10 | **No Social Profile Discovery** | Missing LinkedIn profiles not auto-discovered | Enrichment |
| 11 | **No Reply Classification** | Cannot categorize responses automatically | AI Workflows |
| 12 | **No Opportunity Intelligence Engine** | No win probability, revenue estimation, competitor analysis | Intelligence |
| 13 | **No Template entity** | Messages and outreach lack template management | Content |

---

## 2. Resolution Strategy

### Phase 1: Foundation (Infrastructure) - Week 1
**Goal:** Close P0 gaps - make the system actually work

| Task | Files | Effort |
|------|-------|--------|
| 1.1 Redesign Prisma schema with all v2 entities | `prisma/schema.prisma` | 2 days |
| 1.2 Generate migration | `prisma/migrations/` | 0.5 day |
| 1.3 Implement 7 BullMQ Processors | `queue/processors/*.processor.ts` | 3 days |
| 1.4 Implement base processor with retry/DLQ | `queue/base/` | 1 day |

**Deliverable:** Background jobs execute, dead letter queue active, schema ready for CRM

### Phase 2: CRM Core - Week 2
**Goal:** Close P0 gap #2 - transform into sales CRM

| Task | Files | Effort |
|------|-------|--------|
| 2.1 Implement Pipeline entity + service + controller | `pipelines/` | 2 days |
| 2.2 Implement PipelineStage entity + service | `pipeline-stages/` | 1 day |
| 2.3 Implement Opportunity entity + service + controller | `opportunities/` | 2 days |
| 2.4 Implement Deal entity + service + controller | `deals/` | 2 days |

**Deliverable:** Complete CRM workflow with pipeline management

### Phase 3: Intelligence Engine - Week 2-3
**Goal:** Close P0 gap #3 and P2 gap #12

| Task | Files | Effort |
|------|-------|--------|
| 3.1 Implement Qualification Engine | `qualification/` | 2 days |
| 3.2 Implement Opportunity Intelligence Engine | `opportunity-intelligence/` | 2 days |
| 3.3 Wire auto-qualification to scoring pipeline | `leads/leads.service.ts` | 1 day |

**Deliverable:** Auto-qualified leads, win probability, revenue estimates

### Phase 4: Integration System - Week 3
**Goal:** Close P1 gaps #4, #5, #6

| Task | Files | Effort |
|------|-------|--------|
| 4.1 Implement Integration entity + service | `integrations/` | 1.5 days |
| 4.2 Implement ApiKey entity + service | `api-keys/` | 1 day |
| 4.3 Implement Webhook entity + service | `webhooks/` | 1.5 days |

**Deliverable:** User-owned integrations, API keys, webhook notifications

### Phase 5: Contact Management - Week 3
**Goal:** Close P1 gap #7

| Task | Files | Effort |
|------|-------|--------|
| 5.1 Implement Contact entity + service + controller | `contacts/` | 2 days |
| 5.2 Wire contacts to leads/opportunities | `leads/leads.service.ts` | 0.5 day |

**Deliverable:** Multi-contact per company support

### Phase 6: AI Workflow Upgrade - Week 4
**Goal:** Close P1 gap #8, P2 gaps #9, #10, #11

| Task | Files | Effort |
|------|-------|--------|
| 6.1 Implement Data Enrichment service | `ai-workflows/enrichment.service.ts` | 1 day |
| 6.2 Implement Missing Contact Discovery | `ai-workflows/contact-discovery.service.ts` | 1 day |
| 6.3 Implement Social Profile Discovery | `ai-workflows/social-discovery.service.ts` | 1 day |
| 6.4 Implement Sentiment Analysis | `ai-workflows/sentiment.service.ts` | 1 day |
| 6.5 Implement Reply Classification | `ai-workflows/reply-classifier.service.ts` | 1 day |

**Deliverable:** Complete AI workflow pipeline

---

## 3. Dependency Graph

```
Phase 1 (Foundation)
  |-- Prisma Schema Update [ROOT]
  |-- Base Processor [ROOT]
  |-- 7 Queue Processors [depends on: Base Processor, Prisma Schema]

Phase 2 (CRM Core) [depends on: Prisma Schema]
  |-- Pipeline
  |-- PipelineStage [depends on: Pipeline]
  |-- Opportunity [depends on: PipelineStage, Lead]
  |-- Deal [depends on: Opportunity]

Phase 3 (Intelligence) [depends on: CRM Core, Processors]
  |-- Qualification Engine
  |-- Opportunity Intelligence

Phase 4 (Integrations) [depends on: Prisma Schema]
  |-- Integration
  |-- ApiKey [depends on: Integration]
  |-- Webhook [depends on: Integration]

Phase 5 (Contacts) [depends on: Prisma Schema]
  |-- Contact

Phase 6 (AI Workflows) [depends on: Processors]
  |-- Enrichment
  |-- Contact Discovery
  |-- Social Discovery
  |-- Sentiment Analysis
  |-- Reply Classification
```

---

## 4. Success Criteria

| Criterion | Metric | Verification |
|-----------|--------|------------|
| Queue processors execute jobs | 7/7 queues have active processors | Unit tests pass |
| Dead letter queue captures failures | Failed jobs appear in DLQ within 5 min | Integration test |
| Leads auto-qualify | >80% of scored leads get qualified automatically | E2E test |
| Pipeline workflow functional | Can create pipeline -> stages -> opportunities -> deals | E2E test |
| Win probability generated | AI generates 0-100 score for each opportunity | Unit test |
| User integrations work | User can add/remove integration credentials | E2E test |
| Multi-contact support | Can add 3+ contacts to a single lead | E2E test |
| Sentiment analysis working | Reply text classified as positive/negative/neutral | Unit test |

---

## 5. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Migration data loss | Backup before migration; use non-destructive migrations |
| Queue processor crashes | Base processor with circuit breaker pattern |
| AI provider failures | Fallback provider chain (Gemini -> Groq) |
| Schema too large | Incremental migrations; each feature gets its own migration |
| Breaking existing API | Version controllers; maintain backward compatibility |

---

*Plan prepared for Architecture v2 implementation sprint.*
