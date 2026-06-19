# LeadFlow Platform

AI-powered Lead Generation, Opportunity Intelligence & Agency Outreach Platform

## Overview

LeadFlow is a complete production-grade SaaS platform that helps agencies automatically discover leads, identify opportunities, analyze businesses, score prospects, generate personalized outreach messages, and manage leads through a built-in CRM.

### Target Agencies
- Web Development Agencies
- SEO Agencies
- Software Houses
- AI Automation Agencies
- Marketing Agencies
- Digital Transformation Companies
- Cyber Security Consultancies

## Architecture

### Technology Stack

**Backend:**
- NestJS 10 + TypeScript
- PostgreSQL 16 + Prisma ORM
- Redis 7 + BullMQ
- Playwright + Cheerio (Scraping)
- JWT Authentication + RBAC
- Docker + Docker Compose

**Frontend:**
- React 19 + TypeScript
- Vite 7 (Build Tool)
- TailwindCSS 3.4 + shadcn/ui
- React Router v7
- Zustand (State Management)
- Recharts (Analytics)

**AI Stack:**
- Gemini (Primary Provider)
- Groq (Fallback Provider)
- Provider Abstraction Layer

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React 19)                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ Dashboard│ │ Leads    │ │Discovery │ │  Campaigns   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ Analytics│ │ Website  │ │  Queue   │ │   Settings   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────────────┐
│                     Backend (NestJS)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Auth Module  │  │ Leads Module │  │ Campaigns Module │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ AI Analysis  │  │  Scoring     │  │  Connectors      │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Website Audit│  │  Outreach    │  │  Analytics       │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
┌───────▼──────┐ ┌────▼─────┐ ┌─────▼──────┐
│  PostgreSQL  │ │  Redis   │ │  BullMQ    │
│     16       │ │    7     │ │   Queues   │
└──────────────┘ └──────────┘ └────────────┘
```

## Project Structure

```
leadflow-platform/
├── backend/                    # NestJS Backend
│   ├── src/
│   │   ├── auth/              # Authentication & Authorization
│   │   ├── users/             # User Management
│   │   ├── leads/             # Lead Management
│   │   ├── campaigns/         # Campaign Management
│   │   ├── messages/          # Message Management
│   │   ├── activities/        # Activity Tracking
│   │   ├── scoring/           # Lead Scoring Engine
│   │   ├── website-audit/     # Website Analysis
│   │   ├── ai-analysis/       # AI Analysis Engine
│   │   ├── outreach/          # Outreach Generator
│   │   ├── follow-ups/        # Follow-up Engine
│   │   ├── connectors/        # Lead Source Connectors
│   │   ├── queue/             # BullMQ Queue System
│   │   ├── analytics/         # Analytics & Reporting
│   │   ├── common/            # Shared Utilities
│   │   │   ├── prisma/        # Prisma Service
│   │   │   └── redis/         # Redis Service
│   │   ├── config/            # Configuration
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── prisma/
│   │   ├── schema.prisma      # Database Schema
│   │   └── seed.ts            # Seed Data
│   ├── package.json
│   ├── tsconfig.json
│   ├── nest-cli.json
│   └── Dockerfile
├── frontend/                   # React Frontend
│   ├── src/
│   │   ├── pages/             # Page Components
│   │   ├── components/        # Shared Components
│   │   ├── lib/               # API Client
│   │   ├── store/             # Zustand Stores
│   │   └── App.tsx
│   ├── dist/                  # Production Build
│   └── package.json
├── docker/
│   ├── docker-compose.yml     # Docker Orchestration
│   └── .env.example           # Environment Template
└── README.md
```

## Database Schema

### Core Tables
- **Users** - Platform users with role-based access
- **Organizations** - Agency workspaces
- **Leads** - Business leads with scoring
- **Messages** - Outreach messages
- **Campaigns** - Marketing campaigns
- **Activities** - Audit trail
- **ScoringResults** - Lead scoring data
- **WebsiteAudits** - Website analysis results
- **AIReports** - AI-generated reports
- **FollowUps** - Follow-up sequences

### Enums
- UserRole: ADMIN, AGENCY_OWNER, SALES_MANAGER, SALES_REP, VIEWER
- LeadStatus: NEW, CONTACTED, QUALIFIED, PROPOSAL, NEGOTIATION, WON, LOST
- Temperature: COLD, WARM, HOT
- LeadSource: GOOGLE_MAPS, LINKEDIN, REDDIT, TWITTER, etc.

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for local development)

### Using Docker (Recommended)

1. **Clone and setup:**
```bash
cd leadflow-platform
cp docker/.env.example docker/.env
# Edit docker/.env with your API keys
```

2. **Start services:**
```bash
cd docker
docker-compose up -d
```

3. **Access:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api
- API Docs: http://localhost:3001/api/docs

4. **Seed database:**
```bash
docker exec -it leadflow-backend npm run db:seed
```

5. **Login with demo credentials:**
- Email: `admin@leadflow.com`
- Password: `admin123`

### Local Development

**Backend:**
```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev
npx prisma db seed
npm run start:dev
```

**Frontend:**
```bash
cd frontend
cd dist  # or build from app directory
# Serve with any static server
npx serve .
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/logout` - Logout
- `GET /api/auth/profile` - Get profile

### Leads
- `GET /api/leads` - List leads (with filtering)
- `POST /api/leads` - Create lead
- `GET /api/leads/:id` - Get lead details
- `PUT /api/leads/:id` - Update lead
- `DELETE /api/leads/:id` - Delete lead
- `GET /api/leads/stats` - Lead statistics

### Discovery
- `POST /api/connectors/google-maps/search` - Search Google Maps
- `POST /api/connectors/reddit/search` - Search Reddit
- `POST /api/connectors/linkedin/search` - Search LinkedIn
- `POST /api/connectors/save` - Save leads

### AI Analysis
- `POST /api/ai/analyze/:leadId` - Analyze lead
- `POST /api/ai/outreach/:leadId` - Generate outreach

### Website Audit
- `POST /api/website-audit/:leadId` - Run audit
- `GET /api/website-audit/:leadId` - Get audit results

### Campaigns
- `GET /api/campaigns` - List campaigns
- `POST /api/campaigns` - Create campaign
- `POST /api/campaigns/:id/launch` - Launch campaign

### Analytics
- `GET /api/analytics/dashboard` - Dashboard data
- `GET /api/analytics/campaigns` - Campaign stats
- `GET /api/analytics/activities` - Activity timeline

### Queue
- `GET /api/queue/stats` - Queue statistics

## Features

### Lead Discovery Engine
- Multi-source lead collection
- Google Maps connector
- Reddit intent signal detection
- LinkedIn company search
- Extensible connector architecture

### Opportunity Intelligence
- Website signal detection (no SSL, poor mobile, slow speed)
- Growth signal detection
- Hiring signal detection
- Intent signal scoring

### Website Analysis
- SSL certificate check
- Mobile responsiveness
- Page speed analysis
- SEO basics check
- Technology detection
- Lighthouse-style scoring

### AI Analysis
- Business summary generation
- Industry analysis
- Technical weakness detection
- Growth signal identification
- Opportunity assessment
- Personalized outreach generation

### Lead Scoring
- Multi-factor scoring (0-100)
- Temperature classification (Cold/Warm/Hot)
- Priority levels (Low/Medium/High/Critical)
- Automatic score updates

### Campaign Management
- Email, WhatsApp, LinkedIn campaigns
- Lead targeting
- Performance tracking
- Open/reply rate analytics

### CRM
- Complete lead lifecycle
- Activity tracking
- Note-taking
- Task management
- Follow-up sequences

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | JWT signing secret |
| `GEMINI_API_KEY` | Google Gemini API key |
| `GROQ_API_KEY` | Groq API key |
| `GOOGLE_MAPS_API_KEY` | Google Maps API key |

## User Roles

| Role | Permissions |
|------|------------|
| **Admin** | Full platform access |
| **Agency Owner** | Organization management |
| **Sales Manager** | Team management, campaigns |
| **Sales Rep** | Leads, outreach, follow-ups |
| **Viewer** | Read-only access |

## License

MIT License - Open Source