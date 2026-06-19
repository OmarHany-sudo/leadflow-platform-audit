# LeadFlow Platform - System Architecture

## 1. System Overview

LeadFlow is a modular, scalable SaaS platform for AI-powered lead generation and opportunity intelligence.

## 2. Architecture Principles

- **Clean Architecture** - Separation of concerns
- **Modular Design** - Independent, replaceable modules
- **Dependency Injection** - Loose coupling
- **Repository Pattern** - Data access abstraction
- **Event-Driven** - Queue-based background processing

## 3. Module Dependency Map

```
                    ┌─────────────────┐
                    │   API Gateway   │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   ┌────▼────┐        ┌─────▼─────┐       ┌─────▼─────┐
   │  Auth   │        │   Leads   │       │Analytics  │
   │ Module  │        │  Module   │       │  Module   │
   └────┬────┘        └─────┬─────┘       └───────────┘
        │                   │
   ┌────▼────┐        ┌────▼────┐
   │  Users  │        │Scoring  │
   │         │        │ Module  │
   └────┬────┘        └────┬────┘
        │                  │
        └────────┬─────────┘
                 │
        ┌────────▼────────┐
        │   AI Analysis   │
        │     Module      │
        └────────┬────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
┌───▼───┐   ┌──▼────┐   ┌──▼────┐
│Website│   │Outreach│   │Follow-│
│ Audit │   │Module  │   │ Ups   │
└───────┘   └───────┘    └───────┘

┌─────────────────────────────────────┐
│           Connectors                │
│  ┌────────┐ ┌──────┐ ┌──────────┐  │
  │ Google  │ │Reddit│ │ LinkedIn │  │
  │  Maps   │ │      │ │          │  │
  └─────────┘ └──────┘ └──────────┘  │
│  ┌────────┐ ┌──────┐ ┌──────────┐  │
  │ Twitter │ │Product│ │Crunchbase│  │
  │         │ │ Hunt  │ │          │  │
  └─────────┘ └──────┘ └──────────┘  │
└─────────────────────────────────────┘
```

## 4. Data Flow

### Lead Discovery Flow
```
User Query -> Connector -> Raw Data -> Enrichment -> Scoring -> CRM Storage
                                                |
                                           AI Analysis
                                                |
                                          Opportunity Report
```

### Campaign Flow
```
Campaign Creation -> Lead Selection -> Message Generation -> Queue -> Send
                                                               |
                                                         Performance Tracking
```

## 5. Technology Decisions

| Component | Technology | Reason |
|-----------|-----------|--------|
| Backend | NestJS | Enterprise-grade Node.js framework |
| ORM | Prisma | Type-safe, excellent DX |
| Database | PostgreSQL | ACID, JSON support, full-text search |
| Queue | BullMQ + Redis | Reliable, feature-rich job processing |
| Scraping | Playwright + Cheerio | Modern web scraping |
| Frontend | React + Vite | Fast, modern, great ecosystem |
| UI | shadcn/ui | Accessible, customizable |
| Charts | Recharts | React-native charting |
| AI | Gemini + Groq | Fast, cost-effective, reliable |

## 6. Scalability Plan

### Phase 1: Single Instance (1-1000 users)
- Docker Compose deployment
- Single PostgreSQL instance
- Single Redis instance

### Phase 2: Horizontal Scaling (1000-10000 users)
- Kubernetes deployment
- PostgreSQL read replicas
- Redis Cluster
- Load balancing

### Phase 3: Microservices (10000+ users)
- Service decomposition
- Event-driven architecture
- Dedicated ML services
- Multi-region deployment