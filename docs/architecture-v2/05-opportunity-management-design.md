# Opportunity Management Design
## LeadFlow Platform - Architecture v2

### Design Principles
- **Pipeline-driven:** All opportunities flow through configurable pipelines
- **Stage-gated:** Movement between stages is tracked and analyzed
- **AI-augmented:** Win probability and insights are AI-generated
- **Revenue-focused:** Everything ties back to deal value

---

## 1. Entity Relationship Diagram

```
Organization
  |
  +-- Pipeline (1:N)
  |     |
  |     +-- PipelineStage (1:N, ordered)
  |           |
  |           +-- Opportunity (N:1)
  |                 |
  |                 +-- Deal (1:1)
  |                 |
  |                 +-- OpportunityInsight (1:N)
  |
  +-- Lead (1:N)
  |     |
  |     +-- Opportunity (1:N)
  |     |
  |     +-- Contact (1:N)
  |
  +-- User (assignedTo)
```

---

## 2. Pipeline Architecture

### Default Pipeline (Auto-created per organization)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│    NEW      │───>│  QUALIFIED  │───>│   PROPOSAL  │───>│  NEGOTIATION│───>│    WON      │
│  (10%)      │    │   (25%)     │    │   (50%)     │    │   (75%)     │    │  (100%)     │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                                                                  │
       │                                                                  │
       └──────────────────────────────────────────────────────────────────┘
                                    LOST (0%)
```

### Stage Configuration

| Stage | Win Probability | Expected Days | Color | Exit Criteria |
|-------|----------------|---------------|-------|---------------|
| New | 10% | 3 | #94A3B8 | Initial contact made |
| Qualified | 25% | 7 | #3B82F6 | BANT confirmed |
| Proposal Sent | 50% | 14 | #8B5CF6 | Proposal delivered |
| Negotiation | 75% | 7 | #F59E0B | Terms discussed |
| Won | 100% | 0 | #10B981 | Contract signed |
| Lost | 0% | 0 | #EF4444 | Explicitly lost |

### Custom Pipelines

Organizations can create custom pipelines:
- **Marketing Pipeline:** Lead -> MQL -> SQL -> Opportunity
- **Recruiting Pipeline:** Applicant -> Screening -> Interview -> Offer
- **Custom Sales:** Discovery -> Demo -> Trial -> Close

---

## 3. Opportunity Lifecycle

### State Machine

```
                    ┌──────────┐
                    │   NEW    │
                    └────┬─────┘
                         │
              ┌──────────▼──────────┐
              │   AUTO-QUALIFIED    │◄──────────────────┐
              │   (Qualification    │                   │
              │    Engine)          │                   │
              └──────────┬──────────┘                   │
                         │                             │
              ┌──────────▼──────────┐                  │
              │      OPEN           │                  │
              │  (In Pipeline)      │                  │
              └──────────┬──────────┘                  │
                         │                             │
           ┌─────────────┼─────────────┐               │
           │             │             │               │
    ┌──────▼─────┐ ┌────▼─────┐ ┌────▼─────┐         │
    │ QUALIFIED  │ │ PROPOSAL │ │NEGOTIATION│         │
    └──────┬─────┘ └────┬─────┘ └────┬─────┘         │
           │            │            │               │
           └─────────────┼─────────────┘               │
                         │                             │
              ┌──────────▼──────────┐                  │
              │        WON          │                  │
              └──────────┬──────────┘                  │
                         │                             │
              ┌──────────▼──────────┐                  │
              │       DEAL          │                  │
              │    (Created)        │                  │
              └─────────────────────┘                  │
                                                       │
                    ┌──────────────────────────────────┘
                    │
              ┌─────▼─────┐
              │    LOST   │
              │  (Stale)  │
              └───────────┘
```

### Lifecycle Events

| Event | Trigger | Action |
|-------|---------|--------|
| Created | Lead qualifies | Opportunity created in first pipeline stage |
| Stage Changed | Manual move / Auto-progress | Update stage, log activity, update win probability |
| Won | Explicit win | Create Deal, update revenue metrics |
| Lost | Explicit loss | Archive, update metrics |
| Stale | No activity 30+ days | Flag for review, notify assigned user |

---

## 4. Qualification Engine Integration

### Qualification Criteria (BANT)

```typescript
interface BANTCriteria {
  budget: {
    hasBudget: boolean;      // Detected from signals
    score: number;           // 0-100
    indicators: string[];    // "revenue > $1M", "recent funding", "hiring"
  };
  authority: {
    hasAuthority: boolean;
    score: number;
    indicators: string[];    // "decision maker contact", "C-level found"
  };
  need: {
    hasNeed: boolean;
    score: number;
    indicators: string[];    // "poor website", "negative sentiment", "competitor analysis"
  };
  timeline: {
    hasTimeline: boolean;
    score: number;
    indicators: string[];    // "urgent language", "hiring now", "recent complaints"
  };
}
```

### Qualification Scoring

| Score Range | Result | Action |
|-------------|--------|--------|
| 0-40 | Cold | No action, nurture |
| 41-60 | Warm | Add to outreach queue |
| 61-80 | Hot | Create opportunity |
| 81-100 | Qualified | Create opportunity + assign to sales |

### Auto-Qualification Flow

```
Lead Scored -> Score >= 60? -> Yes -> Run Qualification Engine
                                           |
                                           v
                                    BANT Analysis
                                           |
                                           v
                                    Score >= 61?
                                           |
                              ┌────────────┼────────────┐
                              Yes                        No
                              |                          |
                              v                          v
                    Create Opportunity            Log qualification
                    Add to Pipeline               Update lead status
                    Assign to sales               Continue nurturing
                    Notify team
```

---

## 5. Opportunity Intelligence Engine

### Win Probability Calculation

```typescript
interface WinProbabilityFactors {
  // Lead quality (30%)
  leadScore: number;           // 0-100
  
  // Engagement (25%)
  emailOpenRate: number;       // 0-100
  replyRate: number;           // 0-100
  websiteVisits: number;       // Count
  
  // Company signals (20%)
  growthSignals: number;       // Count
  fundingSignals: boolean;
  hiringSignals: number;       // Count
  
  // Pipeline velocity (15%)
  stageProgressionSpeed: number; // Days per stage
  stageRecency: number;        // Days since last stage change
  
  // Market factors (10%)
  industryTrend: number;       // -100 to 100
  competitorPresence: number;  // 0-100 (lower is better)
}
```

### Estimated Revenue

| Factor | Weight | Source |
|--------|--------|--------|
| Company size | 30% | employeeCount, revenue |
| Industry average | 25% | Industry benchmark data |
| Service match | 25% | AI recommended services |
| Engagement level | 20% | Interaction depth |

### Recommended Services

AI analyzes:
1. Website audit findings
2. Industry patterns
3. Competitor gaps
4. Growth signals

Generates ranked list:
```
[
  { service: "Website Redesign", confidence: 0.92, estimatedValue: "$15,000" },
  { service: "SEO Optimization", confidence: 0.78, estimatedValue: "$8,000" },
  { service: "AI Chatbot", confidence: 0.65, estimatedValue: "$12,000" }
]
```

### Competitor Analysis

AI analyzes:
- Competitor websites found
- Technology stack gaps
- Market positioning
- Pricing signals

### Urgency Score

| Factor | Points | Max |
|--------|--------|-----|
| Negative sentiment detected | +30 | 30 |
| Recent complaint | +25 | 25 |
| Hiring signal | +20 | 20 |
| Funding announcement | +15 | 15 |
| Website issues critical | +10 | 10 |

**Total / 100 = Urgency Score**

---

## 6. API Design

### Pipeline Endpoints

```
POST   /api/pipelines                    Create pipeline
GET    /api/pipelines                    List pipelines
GET    /api/pipelines/:id                Get pipeline with stages
PUT    /api/pipelines/:id                Update pipeline
DELETE /api/pipelines/:id                Delete pipeline
POST   /api/pipelines/:id/stages         Add stage
PUT    /api/pipelines/:id/stages/reorder Reorder stages
```

### Opportunity Endpoints

```
POST   /api/opportunities                Create opportunity
GET    /api/opportunities                List opportunities (filtered)
GET    /api/opportunities/:id            Get opportunity with insights
PUT    /api/opportunities/:id            Update opportunity
PUT    /api/opportunities/:id/stage      Change stage
PUT    /api/opportunities/:id/assign     Assign to user
POST   /api/opportunities/:id/qualify    Run qualification
POST   /api/opportunities/:id/win        Mark as won
POST   /api/opportunities/:id/lose       Mark as lost
DELETE /api/opportunities/:id            Delete opportunity
```

### Deal Endpoints

```
POST   /api/deals                        Create deal from opportunity
GET    /api/deals                        List deals
GET    /api/deals/:id                    Get deal
PUT    /api/deals/:id                    Update deal
PUT    /api/deals/:id/close              Close deal
PUT    /api/deals/:id/cancel             Cancel deal
DELETE /api/deals/:id                    Delete deal
```

---

## 7. Activity Logging

### Tracked Activities

| Activity | Data | Trigger |
|----------|------|---------|
| OPPORTUNITY_CREATED | opportunityId, leadId, pipelineId | Opportunity creation |
| OPPORTUNITY_STAGE_CHANGED | opportunityId, fromStage, toStage | Stage change |
| OPPORTUNITY_WON | opportunityId, finalValue | Win |
| OPPORTUNITY_LOST | opportunityId, reason | Loss |
| DEAL_CREATED | dealId, opportunityId | Deal creation |
| DEAL_CLOSED | dealId, finalAmount | Deal close |
| LEAD_QUALIFIED | leadId, qualificationScore | Auto-qualification |

---

## 8. Metrics & Reporting

### Pipeline Metrics

```
pipelineVelocity = AVG(days in each stage)
conversionRate = (WON opportunities / Total opportunities) * 100
stageConversion = (Moved to next stage / Entered stage) * 100
avgDealSize = AVG(deal value for WON deals)
totalPipelineValue = SUM(estimatedValue of all OPEN opportunities)
weightedPipelineValue = SUM(estimatedValue * winProbability)
```

### Forecasting

```
expectedRevenue = SUM(estimatedValue * winProbability) for all OPEN
bestCase = SUM(estimatedValue) for all OPEN with >50% probability
worstCase = SUM(estimatedValue) for all OPEN with >80% probability
```

---

*Opportunity Management design prepared for Architecture v2 implementation.*
