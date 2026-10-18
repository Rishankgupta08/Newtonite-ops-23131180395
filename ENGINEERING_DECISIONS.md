# Engineering Decisions — Newtonite Ops

Five key decisions made while building this system, with context,
alternatives considered, and trade-offs accepted.

---

## Decision 1: Optimistic Locking via Version Field

**Context**
Two users could load the same work item, both make changes, and submit.
Without a guard, the second write silently overwrites the first.

**Options considered**
1. Pessimistic locking: SELECT FOR UPDATE holds a DB row lock for the 
   duration of the user's edit session (seconds to minutes). 
   This serializes all edits and kills concurrency under load.
2. Last-write-wins: simplest to implement, but silent data loss is 
   unacceptable for an operations platform.
3. Optimistic locking with a version counter: client sends the version 
   it read; server updates only WHERE version = clientVersion, 
   then increments. Mismatch returns 409 with the current item.

**Choice**
Optimistic locking. Every WorkItem has a version: Int column.
PATCH /items/:id and POST /items/:id/transition require clientVersion.
The frontend rolls back optimistic UI updates on 409 and shows a 
"this item changed — showing latest version" banner.

**Trade-off**
Users occasionally see a conflict error and must re-apply their edit.
This is the correct behaviour: silent overwrites are worse than visible 
conflicts on an operational system where the edit may be a priority 
escalation or ownership change.

---

## Decision 2: Transactional Outbox for Async Notifications

**Context**
When a work item is assigned, we want to notify the new assignee.
A naive implementation calls an external service (email, Slack) inside 
the same HTTP request. If the call fails after the DB commit, 
the notification is lost. If it fails before, the transaction rolls back 
but the notification was already sent.

**Options considered**
1. Synchronous external call inside request: simple, but creates 
   temporal coupling and risks inconsistency.
2. Fire-and-forget after commit: loses notifications on worker crash.
3. Transactional outbox: write an OutboxJob row in the SAME Prisma 
   $transaction as the item change. A separate worker polls and processes 
   jobs with retry, backoff, and a max-attempt cap.

**Choice**
Transactional outbox. The job row is written atomically with the item 
change. The worker uses SELECT FOR UPDATE SKIP LOCKED to prevent 
double-processing under concurrent workers. Failed jobs retry up to 3 
times then mark FAILED with a reason.

**Trade-off**
Adds polling latency (up to 5 seconds). At-least-once delivery means 
handlers must be idempotent (they are: DONE jobs are never re-claimed).
A dedicated queue (BullMQ + Redis) would give push semantics and 
sub-second delivery, but adds an infrastructure dependency not 
justified for this scale.

---

## Decision 3: Cursor-Based Pagination over Offset

**Context**
The system seeds 2,000+ work items and expects tens of thousands in 
production. The brief explicitly requires server-side pagination and 
warns against loading the full dataset into the browser.

**Options considered**
1. Offset pagination (LIMIT n OFFSET m): simple to implement, but 
   performance degrades as offset grows because the DB scans and 
   discards all preceding rows. Also produces inconsistent pages 
   when items are inserted or deleted between page loads.
2. Cursor pagination (WHERE createdAt < cursor LIMIT n): the cursor 
   encodes the last-seen item's createdAt + id. Each page is an 
   O(log n) index scan regardless of page number.

**Choice**
Cursor pagination. The GET /items endpoint accepts a cursor param 
(base64-encoded timestamp+id) and returns nextCursor in the response.
The frontend uses TanStack Query's useInfiniteQuery with "Load more".

**Trade-off**
No random page access ("jump to page 47"). Acceptable for this use 
case where users scan forward looking for relevant items.

---

## Decision 4: Role-Per-Team Authorization Model

**Context**
The company has multiple teams and a user may belong to more than one 
with different responsibilities in each. A global role system 
(Alice is always an Admin) does not model this accurately.

**Options considered**
1. Global roles: simple, but a user who is a Lead in Engineering 
   should not be able to approve Finance items.
2. Resource ACLs: per-item permissions. Flexible but complex to manage 
   and query.
3. Role per team membership: a Membership row joins User + Team + Role.
   Every item belongs to a team. Authorization checks the requesting 
   user's role in the item's team.

**Choice**
Role-per-team. The requireItemAccess middleware loads the item's teamId, 
finds the user's Membership for that team, and checks role against the 
required permission level. Users outside the team receive 403 on both 
read and write, preventing information disclosure.

**Trade-off**
A user with memberships in 5 teams must be assigned the correct role in 
each. There is no "global admin" shortcut. This is intentional: 
cross-team visibility requires an explicit membership.

---

## Decision 5: PostgreSQL for Everything (Including the Job Queue)

**Context**
The system needs a primary datastore, a job queue for async processing, 
and potentially a search index. Each could be a separate technology.

**Options considered**
1. PostgreSQL + Redis (BullMQ) + Elasticsearch: purpose-built tools 
   for each concern. Best performance at scale, but three infrastructure 
   dependencies to run locally and on CI.
2. PostgreSQL only: the outbox table replaces Redis/BullMQ 
   (SELECT FOR UPDATE SKIP LOCKED is a well-established queue pattern). 
   ILIKE handles search for tens of thousands of items. One docker-compose 
   service, one connection string, one thing to operate.

**Choice**
PostgreSQL for everything. The OutboxJob table with SKIP LOCKED 
provides reliable at-least-once delivery. ILIKE search with a 
GIN index would handle the expected item volume. This keeps the 
local setup to a single docker compose up command.

**Trade-off**
At 10× scale (millions of items, thousands of concurrent users):
- The outbox table becomes a hot spot. Migration path: BullMQ + Redis.
- ILIKE becomes too slow. Migration path: pg_trgm GIN index, 
  then Elasticsearch if needed.
- Read load on Postgres grows. Migration path: read replicas, 
  then partition the activity_events table by created_at.

These are known, documented, and straightforward migration paths.
The current choice maximises reliability within a one-day build window.
