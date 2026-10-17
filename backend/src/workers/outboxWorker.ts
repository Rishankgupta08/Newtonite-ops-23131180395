import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';

const POLL_INTERVAL_MS = 5000;
const BATCH_SIZE = 10;
/** A PROCESSING job untouched for this long is assumed to belong to a crashed worker. */
const STALE_PROCESSING_MS = 60_000;

let timer: NodeJS.Timeout | null = null;
let running = false;

function log(msg: string, ...rest: unknown[]) {
  console.log(`[${new Date().toISOString()}] [outbox]`, msg, ...rest);
}

interface ClaimedJob {
  id: string;
  eventType: string;
  payload: any;
  attempts: number;
  maxAttempts: number;
}

/**
 * Atomically claim up to BATCH_SIZE pending jobs.
 * FOR UPDATE SKIP LOCKED means concurrent workers never claim the same row.
 */
async function claimJobs(): Promise<ClaimedJob[]> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "OutboxJob"
      WHERE status = 'PENDING' AND attempts < "maxAttempts"
      ORDER BY "createdAt" ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED`;
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    await tx.outboxJob.updateMany({
      where: { id: { in: ids } },
      data: { status: 'PROCESSING', attempts: { increment: 1 }, lastAttemptAt: new Date() },
    });

    const jobs = await tx.outboxJob.findMany({
      where: { id: { in: ids } },
      orderBy: { createdAt: 'asc' },
    });
    return jobs.map((j) => ({
      id: j.id,
      eventType: j.eventType,
      payload: j.payload,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
    }));
  });
}

async function handleJob(job: ClaimedJob): Promise<void> {
  const p = (job.payload ?? {}) as Record<string, any>;
  switch (job.eventType) {
    case 'NOTIFY_ASSIGNEE': {
      const assignee = p.assigneeId ?? p.newAssigneeId ?? 'nobody (unassigned)';
      log(`📬 Notifying user ${assignee} about item ${p.itemId}`);
      return;
    }
    case 'SEND_ESCALATION':
      log(`🚨 Escalation for item ${p.itemId}: ${p.reason}`);
      return;
    default:
      throw new Error(`Unknown eventType: ${job.eventType}`);
  }
}

async function processJob(job: ClaimedJob): Promise<void> {
  log(`Processing job ${job.id} (${job.eventType}) attempt ${job.attempts}/${job.maxAttempts}`);
  try {
    await handleJob(job);
    // Only transitions a job we are currently processing -> DONE is never re-processed
    await prisma.outboxJob.updateMany({
      where: { id: job.id, status: 'PROCESSING' },
      data: { status: 'DONE', failedReason: null },
    });
    log(`Job ${job.id} DONE`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (job.attempts >= job.maxAttempts) {
      await prisma.outboxJob.updateMany({
        where: { id: job.id, status: 'PROCESSING' },
        data: { status: 'FAILED', failedReason: message },
      });
      log(`Job ${job.id} FAILED permanently: ${message}`);
    } else {
      await prisma.outboxJob.updateMany({
        where: { id: job.id, status: 'PROCESSING' },
        data: { status: 'PENDING', failedReason: message },
      });
      log(`Job ${job.id} failed (${message}); will retry`);
    }
  }
}

/** Recover jobs stuck in PROCESSING because a worker died mid-flight. */
async function recoverStaleJobs(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MS);
  const stale = { status: 'PROCESSING' as const, lastAttemptAt: { lt: cutoff } };

  const failed = await prisma.outboxJob.updateMany({
    where: { ...stale, attempts: { gte: prisma.outboxJob.fields.maxAttempts } },
    data: { status: 'FAILED', failedReason: 'Worker crashed while processing' },
  });
  const reset = await prisma.outboxJob.updateMany({
    where: stale,
    data: { status: 'PENDING' },
  });
  if (failed.count || reset.count) {
    log(`Recovered stale jobs: ${reset.count} reset to PENDING, ${failed.count} marked FAILED`);
  }
}

export async function pollOnce(): Promise<void> {
  if (running) return; // don't overlap polls
  running = true;
  try {
    await recoverStaleJobs();
    const jobs = await claimJobs();
    if (jobs.length) log(`Claimed ${jobs.length} job(s)`);
    for (const job of jobs) {
      await processJob(job);
    }
  } catch (err) {
    log('Poll error:', err);
  } finally {
    running = false;
  }
}

export function startOutboxWorker(): void {
  if (timer) return;
  log(`Worker started (poll every ${POLL_INTERVAL_MS / 1000}s, batch ${BATCH_SIZE})`);
  timer = setInterval(() => void pollOnce(), POLL_INTERVAL_MS);
  void pollOnce();
}

export function stopOutboxWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    log('Worker stopped');
  }
}
