import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { z } from 'zod';
import { idempotencyMiddleware } from '../middleware/idempotency';
import { requireItemAccess } from '../middleware/authorize';
import { HttpError } from '../lib/errors';
import prisma from '../lib/prisma';
import {
  listItems,
  getItem,
  createItem,
  updateItem,
  claimItem,
  transitionStatus,
  getActivity,
  addComment,
  getMembership,
} from '../services/workItems';

// NOTE: `authenticate` is applied when this router is mounted in index.ts
const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues
      .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
      .join('; ');
    throw new HttpError(400, message, 'VALIDATION_ERROR');
  }
  return result.data;
}

const idParam = (req: Request) => String(req.params.id);

const Status = z.enum(['OPEN', 'IN_PROGRESS', 'AWAITING_APPROVAL', 'RESOLVED', 'CLOSED']);
const Priority = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const ItemType = z.enum(['INCIDENT', 'CUSTOMER_ISSUE', 'PAYMENT', 'COMPLIANCE', 'TASK']);

const listQuery = z.object({
  status: Status.optional(),
  priority: Priority.optional(),
  type: ItemType.optional(),
  teamId: z.string().optional(),
  assigneeId: z.string().optional(),
  q: z.string().trim().min(1).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().optional(),
});

const createBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1),
  type: ItemType,
  priority: Priority,
  teamId: z.string().min(1),
  dueDate: z.coerce.date().nullable().optional(),
});

// status is intentionally NOT patchable: it must go through /transition (workflow rules)
const updateBody = z
  .object({
    clientVersion: z.number().int(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).optional(),
    type: ItemType.optional(),
    priority: Priority.optional(),
    assigneeId: z.string().nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
  })
  .strict();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = parse(listQuery, req.query);
    res.json(await listItems(req.user.userId, filters));
  })
);

router.post(
  '/',
  idempotencyMiddleware,
  asyncHandler(async (req, res) => {
    const body = parse(createBody, req.body);
    const membership = await getMembership(prisma, req.user.userId, body.teamId);
    if (!membership) {
      throw new HttpError(403, 'Access denied: not a member of this team', 'FORBIDDEN');
    }
    if (membership.role === 'VIEWER') {
      throw new HttpError(403, 'Viewers cannot create items', 'INSUFFICIENT_ROLE');
    }
    const item = await createItem(body, req.user.userId);
    res.status(201).json(item);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getItem(idParam(req), req.user.userId));
  })
);

router.patch(
  '/:id',
  requireItemAccess('write'),
  asyncHandler(async (req, res) => {
    if (req.body?.clientVersion === undefined || req.body?.clientVersion === null) {
      throw new HttpError(400, 'clientVersion is required', 'VERSION_REQUIRED');
    }
    const { clientVersion, ...data } = parse(updateBody, req.body);
    res.json(await updateItem(idParam(req), req.user.userId, data, clientVersion));
  })
);

router.post(
  '/:id/claim',
  idempotencyMiddleware,
  asyncHandler(async (req, res) => {
    res.json(await claimItem(idParam(req), req.user.userId));
  })
);

router.post(
  '/:id/transition',
  requireItemAccess('write'),
  asyncHandler(async (req, res) => {
    const { newStatus } = parse(z.object({ newStatus: Status }), req.body);
    res.json(await transitionStatus(idParam(req), req.user.userId, newStatus, req.userRole));
  })
);

router.get(
  '/:id/activity',
  asyncHandler(async (req, res) => {
    const { cursor, limit } = parse(
      z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().optional() }),
      req.query
    );
    res.json(await getActivity(idParam(req), req.user.userId, cursor, limit));
  })
);

router.post(
  '/:id/comments',
  requireItemAccess('write'),
  asyncHandler(async (req, res) => {
    const { content } = parse(z.object({ content: z.string().trim().min(1) }), req.body);
    res.status(201).json(await addComment(idParam(req), req.user.userId, content));
  })
);

export default router;
