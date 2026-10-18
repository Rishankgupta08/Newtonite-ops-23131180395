# Newtonite Ops

Internal operational work-item management system built for the 
Newtonite Software Engineering Challenge.

## What it does

Newtonite Ops replaces spreadsheets and chat threads with a structured 
internal platform where teams create, assign, track and resolve operational 
work items. It enforces role-based access per team, guards against concurrent 
conflicts, maintains an append-only activity history, and processes async 
notifications through a transactional outbox.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | React 18 + Vite + TanStack Query v5 |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL 16 |
| ORM | Prisma |
| Tests | Jest + Supertest |
| Infra | Docker Compose (Postgres only) |

## Prerequisites

- Node.js 20+
- npm 9+
- Docker and Docker Compose

## Quick Start

### 1. Clone and configure

```bash
git clone <repo-url>
cd newtonite-ops-<rollno>
cp backend/.env.example backend/.env
```

The .env file is ready to use as-is for local development.
No changes needed unless your port 5432 is already occupied.

### 2. Start the database

```bash
docker compose up -d
```

### 3. Backend setup

```bash
cd backend
npm install
npm run db:migrate
# When prompted for migration name, type: init
npm run db:seed
npm run dev
# Backend runs on http://localhost:4000
# Health check: http://localhost:4000/health → {"status":"ok"}
```

### 4. Frontend setup (new terminal tab)

```bash
cd frontend
npm install
npm run dev
# Frontend runs on http://localhost:5173
```

## Demo Credentials

All passwords: **password123**

| Name | Email | Team | Role |
|------|-------|------|------|
| Alice | alice@ops.com | Engineering | Admin |
| Bob | bob@ops.com | Engineering | Lead |
| Carol | carol@ops.com | Engineering | Member |
| Ivan | ivan@ops.com | Engineering | Viewer |
| Dave | dave@ops.com | Operations | Lead |
| Eve | eve@ops.com | Operations | Member |
| Frank | frank@ops.com | Finance | Admin |
| Grace | grace@ops.com | Finance | Lead |
| Judy | judy@ops.com | Operations + Finance | Viewer |

**Suggested demo flow:**
1. Login as Alice (Admin) — see full dashboard with 116 assigned items
2. Login as Bob (Lead) — approve items in AWAITING_APPROVAL status
3. Login as Carol (Member) — claim unassigned items
4. Login as Ivan (Viewer) — confirm no write actions are available

## Run Tests

```bash
cd backend
npm test
```

All 8 critical behavior tests run in under 2 seconds.

## Critical Behaviors Implemented

| Behavior | Implementation | Test |
|----------|---------------|------|
| Concurrent claim | Conditional UPDATE WHERE assigneeId IS NULL | ✓ |
| Stale update rejection | Optimistic locking via version field | ✓ |
| Idempotent requests | Idempotency-Key header + DB dedup | ✓ |
| Workflow enforcement | Server-side allowed-transitions map | ✓ |
| Lead-only approval | Role check on AWAITING_APPROVAL→RESOLVED | ✓ |
| Resource-level authz | Team membership checked per request | ✓ |
| Viewer write block | VIEWER role rejected on all writes | ✓ |
| Activity log sync | Every state change written in same transaction | ✓ |

## Architecture

```
Browser (React + TanStack Query)
    ↓ HTTP (Vite proxy → :4000)
Express API (Node.js + TypeScript)
    ↓ Prisma ORM
PostgreSQL 16
    ↑ polls every 5s
Outbox Worker (same Node.js process)
```

Request flow for a work item transition:
1. Frontend sends POST /api/items/:id/transition with Bearer token
2. authenticate middleware verifies JWT
3. requireItemAccess('write') loads item, checks team membership
4. transitionStatus validates allowed-transitions map server-side
5. Prisma $transaction: updates item version + writes ActivityEvent atomically
6. Response returns updated item

## API Endpoints

```
POST   /api/auth/login
GET    /api/auth/me
GET    /api/items
POST   /api/items
GET    /api/items/:id
PATCH  /api/items/:id
POST   /api/items/:id/claim
POST   /api/items/:id/transition
GET    /api/items/:id/activity
POST   /api/items/:id/comments
GET    /api/teams
GET    /api/teams/:teamId/members
```

## Known Limitations

- No email delivery: NOTIFY_ASSIGNEE jobs log to console instead of sending email.
  A real SMTP/SES integration would replace the console.log in outboxWorker.ts.
- No real-time updates: the frontend refetches on focus and after mutations.
  WebSockets or SSE would push changes instantly to other open tabs.
- Single-process worker: the outbox worker runs in the same Node.js process as
  the API. At scale this would be a separate horizontally-scalable service.
- JWT auth only: tokens use a symmetric secret. Production would use OIDC/OAuth2
  with short-lived access tokens and refresh token rotation.
- No file attachments: the work item schema has no attachment support.
- Search uses ILIKE: full-text search uses Postgres ILIKE which is sufficient
  for tens of thousands of items but would need a tsvector index or Elasticsearch
  beyond that scale.
- Seeded users only: there is no sign-up flow. Users are pre-seeded for demo.

## What I Would Build Next

- WebSocket push for live conflict detection across tabs
- tsvector full-text search index on work_items
- Separate worker process with proper queue management
- Email notifications via SendGrid or AWS SES
- Refresh token rotation for JWT
- Pagination of activity log (currently loads last 50 events)
- Bulk operations: assign/close multiple items at once
