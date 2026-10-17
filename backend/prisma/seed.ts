import "dotenv/config";
import { PrismaClient, Role, WorkItemType, Priority, WorkItemStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

// Initialize Prisma Client
const prisma = new PrismaClient();

const TEAMS = ["Engineering", "Operations", "Finance"];

const USERS: { email: string; name: string; memberships: Record<string, Role> }[] = [
  { email: "alice@ops.com", name: "Alice", memberships: { Engineering: "ADMIN" } },
  { email: "bob@ops.com", name: "Bob", memberships: { Engineering: "LEAD" } },
  { email: "carol@ops.com", name: "Carol", memberships: { Engineering: "MEMBER", Operations: "VIEWER" } },
  { email: "dave@ops.com", name: "Dave", memberships: { Operations: "LEAD" } },
  { email: "eve@ops.com", name: "Eve", memberships: { Operations: "MEMBER" } },
  { email: "frank@ops.com", name: "Frank", memberships: { Finance: "ADMIN" } },
  { email: "grace@ops.com", name: "Grace", memberships: { Finance: "LEAD" } },
  { email: "henry@ops.com", name: "Henry", memberships: { Finance: "MEMBER" } },
  { email: "ivan@ops.com", name: "Ivan", memberships: { Engineering: "VIEWER" } },
  { email: "judy@ops.com", name: "Judy", memberships: { Operations: "VIEWER", Finance: "VIEWER" } },
];

const TYPES = Object.values(WorkItemType);
const PRIORITIES = Object.values(Priority);
const STATUSES = Object.values(WorkItemStatus);
const DAY = 86_400_000;

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

async function main() {
  await prisma.activityEvent.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.workItem.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();

  const teams = await Promise.all(TEAMS.map((name) => prisma.team.create({ data: { name } })));
  const teamByName = Object.fromEntries(teams.map((t) => [t.name, t]));

  const passwordHash = await bcrypt.hash("password123", 10);
  const users = [];
  for (const u of USERS) {
    const user = await prisma.user.create({
      data: {
        email: u.email,
        name: u.name,
        passwordHash,
        memberships: {
          create: Object.entries(u.memberships).map(([team, role]) => ({
            teamId: teamByName[team].id,
            role,
          })),
        },
      },
    });
    users.push({ ...user, teams: Object.keys(u.memberships) });
  }

  const items = [];
  const events = [];
  const now = Date.now();

  for (let i = 0; i < 2000; i++) {
    const team = pick(teams);
    const members = users.filter((u) => u.teams.includes(team.name));
    const creator = pick(members);
    const assignee = Math.random() < 0.7 ? pick(members) : null;
    const createdAt = new Date(now - Math.floor(Math.random() * 90 * DAY));
    const id = crypto.randomUUID();
    const type = pick(TYPES);
    const priority = pick(PRIORITIES);

    items.push({
      id,
      title: `${type.replace("_", " ")} #${i + 1}: ${team.name} work item`,
      description: `Auto-generated ${priority.toLowerCase()} priority ${type.toLowerCase()} for ${team.name}.`,
      type,
      priority,
      status: pick(STATUSES),
      teamId: team.id,
      assigneeId: assignee?.id ?? null,
      createdById: creator.id,
      dueDate: Math.random() < 0.85 ? new Date(now + Math.floor((Math.random() * 60 - 30) * DAY)) : null,
      version: 1 + Math.floor(Math.random() * 3),
      createdAt,
      updatedAt: createdAt,
    });
    events.push({
      workItemId: id,
      userId: creator.id,
      eventType: "CREATED",
      toValue: "OPEN",
      createdAt,
    });
  }

  await prisma.workItem.createMany({ data: items });
  await prisma.activityEvent.createMany({ data: events });
  console.log(`Seeded ${teams.length} teams, ${users.length} users, ${items.length} work items`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
