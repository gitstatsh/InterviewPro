import "./setup.js";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import type { FastifyInstance } from "fastify";

const mockPrisma = prisma as any;

vi.mock("../../src/plugins/auth.plugin.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../src/plugins/auth.plugin.js")>();
  return {
    ...orig,
    requireAuth: async (request: any) => {
      request.user = { id: "user-1", name: "Admin", email: "admin@org.com" };
      request.session = { id: "s-1" };
    },
  };
});

const ORG_ID = "org-analytics";

function inject(app: FastifyInstance, method: string, url: string) {
  return app.inject({
    method: method as any,
    url,
    headers: { "x-organization-id": ORG_ID },
  });
}

function setupDefaultMocks() {
  // 1. Total session count
  mockPrisma.interviewSession.count.mockResolvedValue(5);
  // 2. Sessions grouped by status
  mockPrisma.interviewSession.groupBy.mockResolvedValue([
    { status: "COMPLETED", _count: { id: 3 } },
    { status: "SCHEDULED", _count: { id: 1 } },
    { status: "IN_PROGRESS", _count: { id: 1 } },
  ]);
  // 3–5. Three $queryRaw calls: sessionsOverTime, scoreStats, topQuestions
  mockPrisma.$queryRaw
    .mockResolvedValueOnce([
      { date: "2026-06-01", count: BigInt(1) },
      { date: "2026-06-02", count: BigInt(2) },
    ])
    .mockResolvedValueOnce([
      { score: 3, count: BigInt(2) },
      { score: 4, count: BigInt(3) },
      { score: 5, count: BigInt(1) },
    ])
    .mockResolvedValueOnce([
      { id: "q1", title: "Closures", category: "JS", usageCount: BigInt(4), avgScore: 4.2 },
    ]);
  // 6. Candidate count
  mockPrisma.candidate.count.mockResolvedValue(4);
  // 7. Recent sessions (findMany with includes)
  mockPrisma.interviewSession.findMany.mockResolvedValue([
    {
      id: "s1",
      candidate: { firstName: "Alice", lastName: "B" },
      completedAt: new Date("2026-06-20"),
      sessionQuestions: [
        { answer: { assessment: { score: 4 } } },
        { answer: { assessment: { score: 5 } } },
      ],
    },
  ]);
}

describe("Analytics API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
    await app.ready();
    vi.clearAllMocks();
  });

  describe("GET /api/v1/analytics", () => {
    it("returns full analytics for preset=30d", async () => {
      setupDefaultMocks();

      const res = await inject(app, "GET", "/api/v1/analytics?preset=30d");
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.overview.totalSessions).toBe(5);
      expect(body.data.overview.completedCount).toBe(3);
      expect(body.data.overview.candidateCount).toBe(4);
      expect(body.data.timeSeries.length).toBeGreaterThan(0);
      expect(body.data.scoreDistribution).toHaveLength(5);
      expect(body.data.topQuestions).toHaveLength(1);
      expect(body.data.recentSessions).toHaveLength(1);
    });

    it("accepts all valid preset values", async () => {
      for (const preset of ["7d", "30d", "90d", "180d", "365d"]) {
        setupDefaultMocks();
        const res = await inject(app, "GET", `/api/v1/analytics?preset=${preset}`);
        expect(res.statusCode).toBe(200);
      }
    });

    it("returns error for unknown preset", async () => {
      const res = await inject(app, "GET", "/api/v1/analytics?preset=bad");
      expect([400, 500]).toContain(res.statusCode);
    });

    it("returns 400 when org header missing", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/analytics?preset=30d" });
      expect(res.statusCode).toBe(400);
    });

    it("converts BigInt values to numbers in response", async () => {
      setupDefaultMocks();
      const res = await inject(app, "GET", "/api/v1/analytics?preset=7d");
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      // BigInt serialization would have thrown if not converted
      expect(typeof body.data.timeSeries[0]?.sessions).toBe("number");
    });

    it("returns period metadata", async () => {
      setupDefaultMocks();
      const res = await inject(app, "GET", "/api/v1/analytics?preset=7d");
      const body = JSON.parse(res.body);
      expect(body.data.period).toMatchObject({
        days: expect.any(Number),
        from: expect.any(String),
        to: expect.any(String),
      });
    });

    it("returns null avgScore when no scored answers", async () => {
      mockPrisma.interviewSession.count.mockResolvedValue(0);
      mockPrisma.interviewSession.groupBy.mockResolvedValue([]);
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.candidate.count.mockResolvedValue(0);
      mockPrisma.interviewSession.findMany.mockResolvedValue([]);

      const res = await inject(app, "GET", "/api/v1/analytics?preset=7d");
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.overview.overallAvgScore).toBeNull();
    });
  });
});
