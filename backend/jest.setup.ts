import dotenv from 'dotenv';
dotenv.config({ quiet: true });

// Point the whole process (app + Prisma client + CLI children) at the TEST database
// BEFORE any module that instantiates PrismaClient is imported.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error('TEST_DATABASE_URL is not set — refusing to run tests.');
}
if (testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL — refusing to wipe the dev DB.');
}
if (!/test/i.test(new URL(testUrl).pathname)) {
  throw new Error('TEST_DATABASE_URL database name must contain "test" — refusing to run.');
}

process.env.DATABASE_URL = testUrl;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.NODE_ENV = 'test';
