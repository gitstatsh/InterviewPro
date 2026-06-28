import { vi } from "vitest";

// Must be mocked before any module that imports env (which calls process.exit on missing vars)
vi.mock("../../src/config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    REDIS_URL: "redis://localhost:6379",
    BETTER_AUTH_SECRET: "test-secret-32chars-minimum-len",
    BETTER_AUTH_URL: "http://localhost:3001",
    FRONTEND_URL: "http://localhost:3000",
    ANTHROPIC_API_KEY: "test-key",
    RESEND_API_KEY: "",
    PORT: 3001,
  },
}));

// Mock prisma globally for all integration tests
vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    candidate: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    question: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    interviewSession: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
      $queryRaw: vi.fn(),
    },
    sessionQuestion: {
      findFirst: vi.fn(),
    },
    answer: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    assessment: {
      upsert: vi.fn(),
    },
    organization: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    organizationMember: {
      findFirst: vi.fn(),
    },
    role: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    permission: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

// Mock redis
vi.mock("../../src/lib/redis.js", () => ({
  redis: {
    connect: vi.fn(),
    quit: vi.fn(),
    on: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

// Mock Better Auth
vi.mock("../../src/lib/auth.js", () => ({
  auth: {
    handler: vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })),
    api: { getSession: vi.fn() },
  },
}));

// Mock queue
vi.mock("../../src/lib/queue.js", () => ({
  aiSummaryQueue: { add: vi.fn(async () => ({ id: "job-1" })) },
  createAISummaryWorker: vi.fn(() => ({ on: vi.fn(), close: vi.fn() })),
}));

// Mock AI
vi.mock("../../src/lib/ai.js", () => ({
  generateQuestions: vi.fn(async () => [
    { title: "Q1", body: "Body 1", category: "React", difficulty: "MEDIUM", tags: [] },
  ]),
}));
