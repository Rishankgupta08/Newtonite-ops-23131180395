import { execSync } from 'child_process';
import path from 'path';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../index';
import prisma from '../lib/prisma';

const PASSWORD = 'password123';

type Ctx = {
  team1Id: string;
  team2Id: string;
  users: Record<'admin' | 'lead' | 'member' | 'viewer' | 'outsider', string>; // ids
  tokens: Record<'admin' | 'lead' | 'member' | 'viewer' | 'outsider', string>;
  items: { item1: string; item2: string; item3: string };
};

let ctx: Ctx;

async function login(email: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.token;
}

async function wipe() {
  await prisma.outboxJob.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.activityEvent.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.workItem.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();
}

async function seed(): Promise<Omit<Ctx, 'tokens'>> {
  await wipe();
  const passwordHash = await bcrypt.hash(PASSWORD, 4);

  const team1 = await prisma.team.create({ data: { name: 'Team One' } });
  const team2 = await prisma.team.create({ data: { name: 'Team Two' } });

  const mkUser = (key: string, teamId: string, role: 'ADMIN' | 'LEAD' | 'MEMBER' | 'VIEWER') =>
    prisma.user.create({
      data: {
        email: `${key}@test.com`,
        name: key,
        passwordHash,
        memberships: { create: { teamId, role } },
      },
    });

  const admin = await mkUser('admin', team1.id, 'ADMIN');
  const lead = await mkUser('lead', team1.id, 'LEAD');
  const member = await mkUser('member', team1.id, 'MEMBER');
  const viewer = await mkUser('viewer', team1.id, 'VIEWER');
  const outsider = await mkUser('outsider', team2.id, 'MEMBER');

  const mkItem = (title: string, extra: Record<string, unknown> = {}) =>
    prisma.workItem.create({
      data: {
        title,
        description: `${title} description`,
        type: 'TASK',
        priority: 'MEDIUM',
        status: 'OPEN',
        teamId: team1.id,
        createdById: admin.id,
        ...extra,
      },
    });

  const item1 = await mkItem('Item 1');
  const item2 = await mkItem('Item 2');
  const item3 = await mkItem('Item 3', { assigneeId: member.id, status: 'IN_PROGRESS' });

  return {
    team1Id: team1.id,
    team2Id: team2.id,
    users: {
      admin: admin.id,
      lead: lead.id,
      member: member.id,
      viewer: viewer.id,
      outsider: outsider.id,
    },
    items: { item1: item1.id, item2: item2.id, item3: item3.id },
  };
}

beforeAll(() => {
  // Reset the TEST database (jest.setup.ts guarantees DATABASE_URL === TEST_DATABASE_URL)
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    stdio: 'pipe',
  });
});

beforeEach(async () => {
  const seeded = await seed();
  const [admin, lead, member, viewer, outsider] = await Promise.all(
    ['admin', 'lead', 'member', 'viewer', 'outsider'].map((n) => login(`${n}@test.com`))
  );
  ctx = { ...seeded, tokens: { admin, lead, member, viewer, outsider } };
});

afterAll(async () => {
  await prisma.$disconnect();
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('critical behaviors', () => {
  test('1. concurrent claim: only one user wins', async () => {
    const id = ctx.items.item1;
    const before = await prisma.workItem.findUniqueOrThrow({ where: { id } });
    expect(before.assigneeId).toBeNull();

    const [a, b] = await Promise.all([
      request(app).post(`/api/items/${id}/claim`).set(auth(ctx.tokens.member)),
      request(app).post(`/api/items/${id}/claim`).set(auth(ctx.tokens.lead)),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.code).toBe('ALREADY_CLAIMED');

    const after = await prisma.workItem.findUniqueOrThrow({ where: { id } });
    expect(after.assigneeId).not.toBeNull();
    const winner = a.status === 200 ? 'member' : 'lead';
    expect(after.assigneeId).toBe(ctx.users[winner]);
  });

  test('2. stale update is rejected', async () => {
    const id = ctx.items.item1;
    const start = await request(app).get(`/api/items/${id}`).set(auth(ctx.tokens.member));
    expect(start.status).toBe(200);
    expect(start.body.version).toBe(1);

    const first = await request(app)
      .patch(`/api/items/${id}`)
      .set(auth(ctx.tokens.member))
      .send({ clientVersion: 1, title: 'First update' });
    expect(first.status).toBe(200);
    expect(first.body.version).toBe(2);

    const stale = await request(app)
      .patch(`/api/items/${id}`)
      .set(auth(ctx.tokens.lead))
      .send({ clientVersion: 1, title: 'Stale update' });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');

    const row = await prisma.workItem.findUniqueOrThrow({ where: { id } });
    expect(row.title).toBe('First update');
    expect(row.version).toBe(2);
  });

  test('3. idempotent create: same key creates one item', async () => {
    const body = {
      title: 'Idempotent item',
      description: 'created once',
      type: 'TASK',
      priority: 'LOW',
      teamId: ctx.team1Id,
    };
    const send = () =>
      request(app)
        .post('/api/items')
        .set(auth(ctx.tokens.member))
        .set('Idempotency-Key', 'test-key-xyz')
        .send(body);

    const first = await send();
    expect(first.status).toBe(201);

    // The middleware persists the response asynchronously; wait until it is stored
    for (let i = 0; i < 50; i++) {
      if (await prisma.idempotencyKey.findUnique({ where: { key: 'test-key-xyz' } })) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    const second = await send();
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);

    const count = await prisma.workItem.count({ where: { title: 'Idempotent item' } });
    expect(count).toBe(1);
  });

  test('4. invalid workflow transition is rejected', async () => {
    const id = ctx.items.item1;
    const res = await request(app)
      .post(`/api/items/${id}/transition`)
      .set(auth(ctx.tokens.member))
      .send({ newStatus: 'CLOSED' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TRANSITION');

    const row = await prisma.workItem.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('OPEN');
  });

  test('5. only Lead can approve (AWAITING_APPROVAL -> RESOLVED)', async () => {
    const id = ctx.items.item1;
    await prisma.workItem.update({ where: { id }, data: { status: 'AWAITING_APPROVAL' } });

    const asMember = await request(app)
      .post(`/api/items/${id}/transition`)
      .set(auth(ctx.tokens.member))
      .send({ newStatus: 'RESOLVED' });
    expect(asMember.status).toBe(403);
    expect(asMember.body.code).toBe('INSUFFICIENT_ROLE');
    expect((await prisma.workItem.findUniqueOrThrow({ where: { id } })).status).toBe(
      'AWAITING_APPROVAL'
    );

    const asLead = await request(app)
      .post(`/api/items/${id}/transition`)
      .set(auth(ctx.tokens.lead))
      .send({ newStatus: 'RESOLVED' });
    expect(asLead.status).toBe(200);
    expect(asLead.body.status).toBe('RESOLVED');
  });

  test('6. user outside team gets 403', async () => {
    const id = ctx.items.item1;
    const t = ctx.tokens.outsider;

    const get = await request(app).get(`/api/items/${id}`).set(auth(t));
    expect([403, 404]).toContain(get.status);

    const patch = await request(app)
      .patch(`/api/items/${id}`)
      .set(auth(t))
      .send({ clientVersion: 1, title: 'hacked' });
    expect([403, 404]).toContain(patch.status);

    const claim = await request(app).post(`/api/items/${id}/claim`).set(auth(t));
    expect([403, 404]).toContain(claim.status);

    const row = await prisma.workItem.findUniqueOrThrow({ where: { id } });
    expect(row.title).toBe('Item 1');
    expect(row.assigneeId).toBeNull();
  });

  test('7. VIEWER cannot create, modify or claim items', async () => {
    const t = ctx.tokens.viewer;
    const id = ctx.items.item1;

    const create = await request(app)
      .post('/api/items')
      .set(auth(t))
      .send({
        title: 'Viewer item',
        description: 'nope',
        type: 'TASK',
        priority: 'LOW',
        teamId: ctx.team1Id,
      });
    expect(create.status).toBe(403);
    expect(await prisma.workItem.count({ where: { title: 'Viewer item' } })).toBe(0);

    const patch = await request(app)
      .patch(`/api/items/${id}`)
      .set(auth(t))
      .send({ clientVersion: 1, title: 'Viewer edit' });
    expect(patch.status).toBe(403);

    const claim = await request(app).post(`/api/items/${id}/claim`).set(auth(t));
    expect(claim.status).toBe(403);

    const row = await prisma.workItem.findUniqueOrThrow({ where: { id } });
    expect(row.title).toBe('Item 1');
    expect(row.assigneeId).toBeNull();
  });

  test('8. activity log is always in sync with item state', async () => {
    const id = ctx.items.item2;
    const claim = await request(app).post(`/api/items/${id}/claim`).set(auth(ctx.tokens.member));
    expect(claim.status).toBe(200);

    const activity = await request(app).get(`/api/items/${id}/activity`).set(auth(ctx.tokens.member));
    expect(activity.status).toBe(200);

    const claimed = activity.body.items.filter(
      (e: any) => e.kind === 'event' && e.eventType === 'CLAIMED'
    );
    expect(claimed).toHaveLength(1);
    expect(claimed[0].toValue).toBe(ctx.users.member);

    // Item state and event agree
    const row = await prisma.workItem.findUniqueOrThrow({ where: { id } });
    expect(row.assigneeId).toBe(ctx.users.member);
    expect(await prisma.activityEvent.count({ where: { workItemId: id, eventType: 'CLAIMED' } })).toBe(1);
  });
});
