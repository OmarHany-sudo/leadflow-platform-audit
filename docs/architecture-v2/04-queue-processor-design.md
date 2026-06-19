# Queue Processor Design
## LeadFlow Platform - Architecture v2

### Design Principles
- **Resilience:** Every processor must handle failures gracefully
- **Observability:** Full progress tracking and metrics
- **Recoverability:** Dead letter queue for failed jobs
- **Scalability:** Stateless processors, horizontal scaling ready

---

## 1. Base Processor Architecture

```typescript
// Abstract base class for all processors
abstract class BaseProcessor<T> {
  // Retry configuration
  protected readonly maxRetries: number = 3;
  protected readonly backoffMs: number = 5000;
  
  // Progress tracking
  protected async updateProgress(job: Job, percent: number, message: string): Promise<void>
  
  // Error handling
  protected async handleError(job: Job, error: Error): Promise<void>
  
  // Dead letter queue
  protected async sendToDLQ(job: Job, error: Error): Promise<void>
  
  // Job logging
  protected async logJobStatus(jobId: string, status: JobStatus, result?: any): Promise<void>
  
  // Abstract method
  abstract process(job: Job<T>): Promise<any>
}
```

### Retry Logic

| Attempt | Delay | Action |
|---------|-------|--------|
| 1 | 0ms | Immediate execution |
| 2 | 5s | Exponential backoff |
| 3 | 25s | Exponential backoff |
| Fail | N/A | Send to Dead Letter Queue |

### Progress Tracking States

```
0%   - Job received
10%  - Validating job data
20%  - Loading dependencies
30%  - Starting main processing
50%  - Processing (halfway)
70%  - Finalizing
90%  - Saving results
100% - Complete
```

---

## 2. Lead Discovery Processor

### Responsibility
Execute lead discovery from external connectors (Google Maps, Reddit, LinkedIn)

### Job Data
```typescript
interface LeadDiscoveryJobData {
  connector: string;        // "google-maps", "reddit", "linkedin"
  query: string;            // Search query
  location?: string;        // Geographic location
  organizationId: string;
  userId: string;
  options?: {
    limit?: number;
    filters?: Record<string, any>;
  };
}
```

### Processing Flow
```
1. Validate connector availability
2. Load connector configuration
3. Execute connector search
4. Transform raw results to Lead format
5. Save leads to database
6. Queue enrichment jobs for each lead
7. Update job log with results
```

### Progress Steps
| Step | Progress | Description |
|------|----------|-------------|
| Validate | 10% | Validate connector and query |
| Load Config | 20% | Load connector credentials |
| Search | 40% | Execute external search |
| Transform | 60% | Transform results |
| Save | 80% | Save leads to database |
| Enrich | 90% | Queue enrichment jobs |
| Complete | 100% | Done |

### Failure Handling
- **Retryable:** Network errors, rate limits, timeout
- **Non-retryable:** Invalid connector, bad query format
- **DLQ:** After 3 retries, send to DLQ with full context

---

## 3. Website Audit Processor

### Responsibility
Perform comprehensive website analysis for leads

### Job Data
```typescript
interface WebsiteAuditJobData {
  leadId: string;
  url: string;
  organizationId: string;
  auditType?: 'full' | 'quick' | 'seo' | 'performance';
}
```

### Processing Flow
```
1. Validate URL format
2. Check SSL certificate
3. Check mobile responsiveness
4. Analyze SEO (meta tags, structured data, sitemap)
5. Check performance (load time, page size)
6. Detect technologies
7. Run Lighthouse simulation
8. Aggregate results
9. Save audit report
10. Update lead with findings
11. Trigger scoring if needed
```

### Progress Steps
| Step | Progress | Description |
|------|----------|-------------|
| Validate URL | 10% | Validate URL |
| SSL Check | 20% | Check SSL cert |
| Mobile | 30% | Check responsive |
| SEO | 45% | Analyze SEO |
| Performance | 60% | Check speed |
| Tech Detect | 75% | Detect stack |
| Aggregate | 85% | Compile report |
| Save | 95% | Save results |
| Complete | 100% | Done |

### Failure Handling
- **Retryable:** Timeout, DNS error, temporary unavailability
- **Non-retryable:** Invalid URL, malformed response
- **DLQ:** After 3 retries

---

## 4. AI Analysis Processor

### Responsibility
Generate AI-powered analysis reports for leads

### Job Data
```typescript
interface AIAnalysisJobData {
  leadId: string;
  userId: string;
  provider?: 'gemini' | 'groq';
  analysisType?: 'full' | 'summary' | 'outreach' | 'competitive';
}
```

### Processing Flow
```
1. Load lead data with relations
2. Load website audit results
3. Load scoring results
4. Build AI prompt
5. Call AI provider with fallback
6. Parse response
7. Validate and sanitize results
8. Save AI report
9. Update lead score/temperature
10. Trigger qualification check
```

### Progress Steps
| Step | Progress | Description |
|------|----------|-------------|
| Load Lead | 15% | Load lead data |
| Load Audit | 30% | Load audit data |
| Build Prompt | 40% | Construct prompt |
| AI Call | 60% | Call AI provider |
| Parse | 75% | Parse response |
| Validate | 85% | Validate results |
| Save | 95% | Save report |
| Complete | 100% | Done |

### Failure Handling
- **Retryable:** AI provider timeout, rate limit
- **Non-retryable:** Lead deleted, invalid data
- **Fallback:** Gemini -> Groq -> Error
- **DLQ:** After all providers fail

---

## 5. Campaign Processor

### Responsibility
Execute campaign message delivery

### Job Data
```typescript
interface CampaignJobData {
  campaignId: string;
  organizationId: string;
  userId: string;
  batchSize?: number;
}
```

### Processing Flow
```
1. Load campaign configuration
2. Get pending leads
3. For each lead:
   a. Generate/prepare message
   b. Send via appropriate channel
   c. Track delivery status
   d. Update campaign metrics
4. Update campaign status
5. Generate campaign report
```

### Progress Steps
| Step | Progress | Description |
|------|----------|-------------|
| Load Config | 10% | Load campaign |
| Get Leads | 20% | Fetch leads |
| Prepare | 30% | Prepare messages |
| Send Batch 1 | 40% | First batch |
| Send Batch 2 | 55% | Second batch |
| Send Batch 3 | 70% | Third batch |
| Track | 85% | Update tracking |
| Report | 95% | Generate report |
| Complete | 100% | Done |

### Failure Handling
- **Retryable:** Rate limit, temporary channel failure
- **Non-retryable:** Campaign deleted, invalid config
- **Partial failure:** Continue with remaining leads
- **DLQ:** Failed individual sends tracked separately

---

## 6. Follow-Up Processor

### Responsibility
Send scheduled follow-up messages

### Job Data
```typescript
interface FollowUpJobData {
  followUpId: string;
  leadId: string;
  userId: string;
  type: 'email' | 'whatsapp' | 'linkedin' | 'call';
  content: string;
}
```

### Processing Flow
```
1. Load follow-up record
2. Verify lead still exists and is active
3. Load message template/content
4. Personalize content
5. Send via appropriate channel
6. Update follow-up status
7. Log activity
8. Schedule next follow-up if needed
```

### Progress Steps
| Step | Progress | Description |
|------|----------|-------------|
| Load | 20% | Load follow-up |
| Verify | 35% | Verify lead |
| Personalize | 50% | Personalize |
| Send | 70% | Send message |
| Update | 85% | Update status |
| Next | 95% | Schedule next |
| Complete | 100% | Done |

### Failure Handling
- **Retryable:** Channel timeout, rate limit
- **Non-retryable:** Lead unsubscribed, invalid channel
- **DLQ:** After 3 retries

---

## 7. Enrichment Processor

### Responsibility
Enrich lead data with additional information

### Job Data
```typescript
interface EnrichmentJobData {
  leadId: string;
  organizationId: string;
  enrichmentType?: 'full' | 'social' | 'contacts' | 'company';
}
```

### Processing Flow
```
1. Load lead data
2. Discover social profiles
3. Find additional contacts
4. Enrich company information
5. Update lead record
6. Create contacts if found
7. Run sentiment analysis on existing messages
8. Trigger re-scoring
```

### Progress Steps
| Step | Progress | Description |
|------|----------|-------------|
| Load | 15% | Load lead |
| Social | 30% | Find social |
| Contacts | 45% | Find contacts |
| Company | 60% | Enrich company |
| Update | 75% | Update lead |
| Contacts | 85% | Save contacts |
| Score | 95% | Trigger scoring |
| Complete | 100% | Done |

### Failure Handling
- **Retryable:** API timeout, rate limit
- **Non-retryable:** Lead deleted
- **Partial:** Continue with available enrichment sources

---

## 8. Scoring Processor

### Responsibility
Calculate lead scores based on multiple signals

### Job Data
```typescript
interface ScoringJobData {
  leadId: string;
  organizationId: string;
  triggerSource?: 'website-audit' | 'enrichment' | 'ai-analysis' | 'manual';
}
```

### Processing Flow
```
1. Load lead with all relations
2. Calculate website score
3. Calculate growth signals score
4. Calculate hiring signals score
5. Calculate intent signals score
6. Aggregate total score
7. Determine temperature
8. Determine priority
9. Save scoring result
10. Update lead
11. Trigger qualification if score changed significantly
```

### Progress Steps
| Step | Progress | Description |
|------|----------|-------------|
| Load | 15% | Load lead |
| Website | 30% | Website score |
| Growth | 45% | Growth score |
| Hiring | 55% | Hiring score |
| Intent | 65% | Intent score |
| Aggregate | 75% | Total score |
| Update | 85% | Save result |
| Qualify | 95% | Trigger qualification |
| Complete | 100% | Done |

### Failure Handling
- **Retryable:** Database timeout
- **Non-retryable:** Lead deleted
- **DLQ:** After 3 retries

---

## 9. Processor Registration

```typescript
// queue.module.ts
BullModule.registerQueue(
  { name: 'lead-discovery' },
  { name: 'website-audit' },
  { name: 'ai-analysis' },
  { name: 'scoring' },
  { name: 'outreach' },
  { name: 'campaign' },
  { name: 'enrichment' },
  { name: 'follow-up' },
  { name: 'qualification' },
  { name: 'opportunity-intelligence' },
);
```

### Worker Configuration
```typescript
// Each processor gets dedicated worker
{
  concurrency: 3,           // Process 3 jobs simultaneously
  limiter: {                // Rate limiting
    max: 10,
    duration: 1000,
  },
  lockDuration: 30000,      // 30s lock
  stalledInterval: 30000,   // Check stalled jobs every 30s
}
```

---

## 10. Dead Letter Queue Design

### Flow
```
Job Fails -> Retry 1 -> Retry 2 -> Retry 3 -> Dead Letter Queue
                                              |
                                              v
                                        Manual Review UI
                                              |
                                        [Retry] [Discard] [Edit & Retry]
```

### Dead Letter Job Schema
```prisma
model DeadLetterJob {
  id          String @id @default(cuid())
  queueName   String
  jobName     String
  jobId       String
  data        Json?
  error       String @db.Text
  errorStack  String? @db.Text
  attempts    Int @default(0)
  maxAttempts Int @default(3)
  status      DeadLetterStatus @default(PENDING)
  resolvedAt  DateTime?
  resolvedBy  String?
  resolutionNote String? @db.Text
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

---

*Queue processor design prepared for Architecture v2 implementation.*
