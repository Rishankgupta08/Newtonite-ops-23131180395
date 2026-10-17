import { Prisma, Priority, Role, WorkItemStatus, WorkItemType } from '@prisma/client';
import prisma from '../lib/prisma';
import { HttpError } from '../lib/errors';

// ---------- helpers ----------

const ITEM_INCLUDE = {
  assignee: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  team: { select: { id: true, name: true } },
} satisfies Prisma.WorkItemInclude;

const WRITE_ROLES: Role[] = ['MEMBER', 'LEAD', 'ADMIN'];
const APPROVER_ROLES: Role[] = ['LEAD', 'ADMIN'];

export const ALLOWED_TRANSITIONS: Record<WorkItemStatus, WorkItemStatus[]> = {
  OPEN: ['IN_PROGRESS'],
  IN_PROGRESS: ['AWAITING_APPROVAL', 'OPEN'],
  AWAITING_APPROVAL: ['RESOLVED', 'IN_PROGRESS'],
  RESOLVED: ['CLOSED'],
  CLOSED: [],
};

type Tx = Prisma.TransactionClient;

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ c: createdAt.toISOString(), i: id })).toString('base64');
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const { c, i } = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
    const createdAt = new Date(c);
    if (typeof i !== 'string' || Number.isNaN(createdAt.getTime())) throw new Error();
    return { createdAt, id: i };
  } catch {
    throw new HttpError(400, 'Invalid cursor', 'INVALID_CURSOR');
  }
}

/** Condition for "strictly after cursor" in (createdAt DESC, id DESC) ordering. */
function beforeCursor(cursor?: string) {
  if (!cursor) return undefined;
  const { createdAt, id } = decodeCursor(cursor);
  return {
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
  };
}

function clampLimit(limit?: number): number {
  if (!limit || !Number.isFinite(limit) || limit < 1) return 20;
  return Math.min(Math.floor(limit), 100);
}

async function getMembership(db: Tx | typeof prisma, userId: string, teamId: string) {
  return db.membership.findUnique({ where: { userId_teamId: { userId, teamId } } });
}

async function requireMembership(db: Tx | typeof prisma, userId: string, teamId: string) {
  const membership = await getMembership(db, userId, teamId);
  if (!membership) {
    throw new HttpError(403, 'Access denied: not a member of this team', 'FORBIDDEN');
  }
  return membership;
}

async function conflict(db: Tx | typeof prisma, id: string, message: string, code: string) {
  const currentItem = await db.workItem.findUnique({ where: { id }, include: ITEM_INCLUDE });
  return new HttpError(409, message, code, currentItem);
}

// ---------- 1. list ----------

export interface ListFilters {
  status?: WorkItemStatus;
  priority?: Priority;
  type?: WorkItemType;
  teamId?: string;
  assigneeId?: string;
  q?: string;
  cursor?: string;
  limit?: number;
}

export async function listItems(userId: string, filters: ListFilters) {
  const limit = clampLimit(filters.limit);

  const where: Prisma.WorkItemWhereInput = {
    // visibility: only teams the user belongs to
    team: { memberships: { some: { userId } } },
    ...(filters.status && { status: filters.status }),
    ...(filters.priority && { priority: filters.priority }),
    ...(filters.type && { type: filters.type }),
    ...(filters.teamId && { teamId: filters.teamId }),
    ...(filters.assigneeId && { assigneeId: filters.assigneeId }),
    ...(filters.q && {
      OR: [
        { title: { contains: filters.q, mode: 'insensitive' } },
        { description: { contains: filters.q, mode: 'insensitive' } },
      ],
    }),
  };

  const pageWhere: Prisma.WorkItemWhereInput = {
    AND: [where, ...(filters.cursor ? [beforeCursor(filters.cursor)!] : [])],
  };

  const [rows, total] = await Promise.all([
    prisma.workItem.findMany({
      where: pageWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: ITEM_INCLUDE,
    }),
    prisma.workItem.count({ where }),
  ]);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  return { items, nextCursor, total };
}

// ---------- 2. get ----------

export async function getItem(id: string, userId: string) {
  const item = await prisma.workItem.findUnique({ where: { id }, include: ITEM_INCLUDE });
  if (!item) throw new HttpError(404, 'Work item not found', 'NOT_FOUND');
  await requireMembership(prisma, userId, item.teamId);
  return item;
}

// ---------- 3. create ----------

export interface CreateItemData {
  title: string;
  description: string;
  type: WorkItemType;
  priority: Priority;
  teamId: string;
  dueDate?: Date | null;
}

export async function createItem(data: CreateItemData, userId: string) {
  return prisma.$transaction(async (tx) => {
    const status: WorkItemStatus = 'OPEN';
    const item = await tx.workItem.create({
      data: {
        title: data.title,
        description: data.description,
        type: data.type,
        priority: data.priority,
        teamId: data.teamId,
        dueDate: data.dueDate ?? null,
        status,
        version: 1,
        createdById: userId,
      },
      include: ITEM_INCLUDE,
    });
    await tx.activityEvent.create({
      data: { workItemId: item.id, userId, eventType: 'CREATED', toValue: status },
    });
    await tx.outboxJob.create({
      data: {
        eventType: 'NOTIFY_ASSIGNEE',
        payload: { itemId: item.id, teamId: item.teamId, assigneeId: item.assigneeId },
        status: 'PENDING',
      },
    });
    return item;
  });
}

// ---------- 4. update (optimistic locking) ----------

export interface UpdateItemData {
  title?: string;
  description?: string;
  type?: WorkItemType;
  priority?: Priority;
  assigneeId?: string | null;
  dueDate?: Date | null;
}

export async function updateItem(
  id: string,
  userId: string,
  data: UpdateItemData,
  clientVersion: number
) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.workItem.findUnique({
      where: { id },
      select: { id: true, version: true, teamId: true, status: true, priority: true, assigneeId: true },
    });
    if (!item) throw new HttpError(404, 'Work item not found', 'NOT_FOUND');

    const membership = await requireMembership(tx, userId, item.teamId);
    if (!WRITE_ROLES.includes(membership.role)) {
      throw new HttpError(403, 'Access denied: insufficient role', 'INSUFFICIENT_ROLE');
    }

    if (clientVersion !== item.version) {
      throw await conflict(tx, id, 'Item was modified by someone else', 'VERSION_CONFLICT');
    }

    if (data.assigneeId) {
      const assigneeMembership = await getMembership(tx, data.assigneeId, item.teamId);
      if (!assigneeMembership) {
        throw new HttpError(400, 'Assignee is not a member of this team', 'INVALID_ASSIGNEE');
      }
    }

    // DB-level guard: only succeeds if version is still what the client saw
    const result = await tx.workItem.updateMany({
      where: { id, version: clientVersion },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw await conflict(tx, id, 'Item was modified by someone else', 'VERSION_CONFLICT');
    }

    const events: Prisma.ActivityEventCreateManyInput[] = [];
    const outbox: Prisma.OutboxJobCreateManyInput[] = [];
    if (data.priority !== undefined && data.priority !== item.priority) {
      events.push({
        workItemId: id,
        userId,
        eventType: 'PRIORITY_CHANGED',
        fromValue: item.priority,
        toValue: data.priority,
      });
    }
    if (data.assigneeId !== undefined && data.assigneeId !== item.assigneeId) {
      events.push({
        workItemId: id,
        userId,
        eventType: 'ASSIGNEE_CHANGED',
        fromValue: item.assigneeId,
        toValue: data.assigneeId,
      });
      outbox.push({
        eventType: 'NOTIFY_ASSIGNEE',
        payload: { itemId: id, newAssigneeId: data.assigneeId, assigneeId: data.assigneeId },
      });
    }
    const otherFields = (['title', 'description', 'type', 'dueDate'] as const).filter(
      (f) => data[f] !== undefined
    );
    if (otherFields.length) {
      events.push({
        workItemId: id,
        userId,
        eventType: 'UPDATED',
        metadata: { fields: otherFields },
      });
    }
    if (events.length) await tx.activityEvent.createMany({ data: events });
    if (outbox.length) await tx.outboxJob.createMany({ data: outbox });

    return tx.workItem.findUniqueOrThrow({ where: { id }, include: ITEM_INCLUDE });
  });
}

// ---------- 5. claim (atomic) ----------

export async function claimItem(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.workItem.findUnique({
      where: { id },
      select: { teamId: true, status: true },
    });
    if (!item) throw new HttpError(404, 'Work item not found', 'NOT_FOUND');

    const membership = await requireMembership(tx, userId, item.teamId);
    if (!WRITE_ROLES.includes(membership.role)) {
      throw new HttpError(403, 'Access denied: viewers cannot claim items', 'INSUFFICIENT_ROLE');
    }

    // Single atomic statement: exactly one concurrent caller can match assigneeId IS NULL
    const result = await tx.workItem.updateMany({
      where: { id, assigneeId: null },
      data: { assigneeId: userId, version: { increment: 1 }, status: 'IN_PROGRESS' },
    });
    if (result.count === 0) {
      throw await conflict(tx, id, 'Item already claimed', 'ALREADY_CLAIMED');
    }

    await tx.activityEvent.create({
      data: {
        workItemId: id,
        userId,
        eventType: 'CLAIMED',
        toValue: userId,
        fromValue: null,
        metadata: { previousStatus: item.status },
      },
    });
    await tx.outboxJob.create({
      data: {
        eventType: 'NOTIFY_ASSIGNEE',
        payload: { itemId: id, newAssigneeId: userId, assigneeId: userId },
        status: 'PENDING',
      },
    });

    return tx.workItem.findUniqueOrThrow({ where: { id }, include: ITEM_INCLUDE });
  });
}

// ---------- 6. transition ----------

export async function transitionStatus(
  id: string,
  userId: string,
  newStatus: WorkItemStatus,
  userRole: string
) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.workItem.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!item) throw new HttpError(404, 'Work item not found', 'NOT_FOUND');

    const oldStatus = item.status;
    if (!ALLOWED_TRANSITIONS[oldStatus].includes(newStatus)) {
      throw new HttpError(400, 'Invalid transition', 'INVALID_TRANSITION');
    }
    if (
      oldStatus === 'AWAITING_APPROVAL' &&
      newStatus === 'RESOLVED' &&
      !APPROVER_ROLES.includes(userRole as Role)
    ) {
      throw new HttpError(403, 'Only a Lead can approve', 'INSUFFICIENT_ROLE');
    }

    // Guard against a concurrent transition: status must still be what we validated
    const result = await tx.workItem.updateMany({
      where: { id, status: oldStatus },
      data: { status: newStatus, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw await conflict(tx, id, 'Item status changed concurrently', 'VERSION_CONFLICT');
    }

    await tx.activityEvent.create({
      data: {
        workItemId: id,
        userId,
        eventType: 'STATUS_CHANGED',
        fromValue: oldStatus,
        toValue: newStatus,
      },
    });

    return tx.workItem.findUniqueOrThrow({ where: { id }, include: ITEM_INCLUDE });
  });
}

// ---------- 7. activity ----------

export async function getActivity(id: string, userId: string, cursor?: string, limit?: number) {
  const take = clampLimit(limit);

  const item = await prisma.workItem.findUnique({ where: { id }, select: { teamId: true } });
  if (!item) throw new HttpError(404, 'Work item not found', 'NOT_FOUND');
  await requireMembership(prisma, userId, item.teamId);

  const cursorWhere = beforeCursor(cursor);
  const order = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
  const userSelect = { select: { id: true, name: true } };

  const [events, comments] = await Promise.all([
    prisma.activityEvent.findMany({
      where: { workItemId: id, ...cursorWhere },
      orderBy: order,
      take: take + 1,
      include: { user: userSelect },
    }),
    prisma.comment.findMany({
      where: { workItemId: id, ...cursorWhere },
      orderBy: order,
      take: take + 1,
      include: { user: userSelect },
    }),
  ]);

  const merged = [
    ...events.map((e) => ({ kind: 'event' as const, ...e })),
    ...comments.map((c) => ({ kind: 'comment' as const, ...c })),
  ].sort((a, b) => {
    const t = b.createdAt.getTime() - a.createdAt.getTime();
    return t !== 0 ? t : b.id < a.id ? -1 : b.id > a.id ? 1 : 0;
  });

  const hasMore = merged.length > take;
  const items = merged.slice(0, take);
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  return { items, nextCursor };
}

// ---------- comments ----------

export async function addComment(id: string, userId: string, content: string) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.workItem.findUnique({ where: { id }, select: { id: true } });
    if (!item) throw new HttpError(404, 'Work item not found', 'NOT_FOUND');

    const comment = await tx.comment.create({
      data: { workItemId: id, userId, content },
      include: { user: { select: { id: true, name: true } } },
    });
    await tx.activityEvent.create({
      data: {
        workItemId: id,
        userId,
        eventType: 'COMMENT_ADDED',
        metadata: { commentId: comment.id },
      },
    });
    return comment;
  });
}

export { getMembership };
