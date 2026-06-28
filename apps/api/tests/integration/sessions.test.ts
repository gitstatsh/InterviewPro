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
      request.user = { id: "user-1", name: "Interviewer", email: "i@test.com" };
      request.session = { id: "s-1" };
    },
  };
});

const ORG_ID = "org-xyz";

function inject(app: FastifyInstance, method: string, url: string, payload?: object) {
  return app.inject({
    method: method as any,
    url,
    headers: payload
      ? { "content-type": "application/json", "x-organization-id": ORG_ID }
      : { "x-organization-id": ORG_ID },
    payload: payload ? JSON.stringify(payload) : undefined,
  });
}

const mockSession = {
  id: "sess-1",
  title: "Frontend Engineer Round 1",
  status: "SCHEDULED",
  organizationId: ORG_ID,
  candidateId: "cand-1",
  interviewerId: "user-1",
  scheduledAt: new Date("2026-07-10T10:00:00Z"),
  startedAt: null,
  completedAt: null,
  notes: null,
  aiSummary: null,
};

describe("Sessions API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
    await app.ready();
    vi.clearAllMocks();
  });

  describe("GET /api/v1/sessions", () => {
    it("returns paginated sessions", async () => {
      mockPrisma.interviewSession.count.mockResolvedValue(1);
      mockPrisma.interviewSession.findMany.mockResolvedValue([{
        ...mockSession,
        candidate: { id: "cand-1", firstName: "Alice", lastName: "C", email: "a@test.com" },
        interviewer: { id: "user-1", name: "Int", email: "i@test.com" },
        _count: { sessionQuestions: 3 },
      }]);

      const res = await inject(app, "GET", "/api/v1/sessions");
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.meta.total).toBe(1);
    });

    it("filters by status", async () => {
      mockPrisma.interviewSession.count.mockResolvedValue(0);
      mockPrisma.interviewSession.findMany.mockResolvedValue([]);

      await inject(app, "GET", "/api/v1/sessions?status=COMPLETED");
      const where = mockPrisma.interviewSession.findMany.mock.calls[0][0].where;
      expect(where.status).toBe("COMPLETED");
    });
  });

  describe("GET /api/v1/sessions/:id", () => {
    it("returns session with questions and answers", async () => {
      mockPrisma.interviewSession.findFirst.mockResolvedValue({
        ...mockSession,
        candidate: { id: "cand-1", firstName: "Alice", lastName: "C", email: "a@c.com" },
        interviewer: { id: "user-1", name: "Int", email: "i@t.com" },
        sessionQuestions: [],
      });

      const res = await inject(app, "GET", "/api/v1/sessions/sess-1");
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.id).toBe("sess-1");
    });

    it("returns 404 for missing session", async () => {
      mockPrisma.interviewSession.findFirst.mockResolvedValue(null);
      const res = await inject(app, "GET", "/api/v1/sessions/ghost");
      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /api/v1/sessions", () => {
    it("creates session with 201", async () => {
      mockPrisma.candidate.findFirst.mockResolvedValue({ id: "cand-1" });
      mockPrisma.question.findMany.mockResolvedValue([{ id: "q1" }]);
      mockPrisma.interviewSession.create.mockResolvedValue({
        ...mockSession,
        candidate: { id: "cand-1", firstName: "A", lastName: "B", email: "a@b.com" },
        interviewer: { id: "user-1", name: "I", email: "i@t.com" },
        sessionQuestions: [],
      });

      const res = await inject(app, "POST", "/api/v1/sessions", {
        title: "Frontend Engineer Round 1",
        candidateId: "cand-1",
        interviewerId: "user-1",
        questionIds: ["q1"],
      });
      expect(res.statusCode).toBe(201);
    });

    it("returns error when candidate not found", async () => {
      mockPrisma.candidate.findFirst.mockResolvedValue(null);
      const res = await inject(app, "POST", "/api/v1/sessions", {
        title: "Test Session",
        candidateId: "ghost",
        interviewerId: "user-1",
        questionIds: ["q1"],
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns error when questions not found", async () => {
      mockPrisma.candidate.findFirst.mockResolvedValue({ id: "cand-1" });
      mockPrisma.question.findMany.mockResolvedValue([]); // none found
      const res = await inject(app, "POST", "/api/v1/sessions", {
        title: "Test Session",
        candidateId: "cand-1",
        interviewerId: "user-1",
        questionIds: ["q1", "q2"],
      });
      expect(res.statusCode).toBe(422);
    });
  });

  describe("Session lifecycle", () => {
    it("starts a SCHEDULED session", async () => {
      mockPrisma.interviewSession.findFirst.mockResolvedValue({ ...mockSession, status: "SCHEDULED" });
      mockPrisma.interviewSession.update.mockResolvedValue({ ...mockSession, status: "IN_PROGRESS" });

      const res = await inject(app, "POST", "/api/v1/sessions/sess-1/start");
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.status).toBe("IN_PROGRESS");
    });

    it("cannot start an IN_PROGRESS session", async () => {
      mockPrisma.interviewSession.findFirst.mockResolvedValue({ ...mockSession, status: "IN_PROGRESS" });
      const res = await inject(app, "POST", "/api/v1/sessions/sess-1/start");
      expect(res.statusCode).toBe(409);
    });

    it("completes an IN_PROGRESS session", async () => {
      mockPrisma.interviewSession.findFirst.mockResolvedValue({ ...mockSession, status: "IN_PROGRESS" });
      mockPrisma.interviewSession.update.mockResolvedValue({ ...mockSession, status: "COMPLETED" });

      const res = await inject(app, "POST", "/api/v1/sessions/sess-1/complete");
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.status).toBe("COMPLETED");
    });

    it("cannot complete a SCHEDULED session", async () => {
      mockPrisma.interviewSession.findFirst.mockResolvedValue({ ...mockSession, status: "SCHEDULED" });
      const res = await inject(app, "POST", "/api/v1/sessions/sess-1/complete");
      expect(res.statusCode).toBe(409);
    });

    it("cancels any active session", async () => {
      mockPrisma.interviewSession.findFirst.mockResolvedValue({ ...mockSession, status: "SCHEDULED" });
      mockPrisma.interviewSession.update.mockResolvedValue({ ...mockSession, status: "CANCELLED" });

      const res = await inject(app, "POST", "/api/v1/sessions/sess-1/cancel");
      expect(res.statusCode).toBe(200);
    });

    it("cannot cancel an already-completed session", async () => {
      mockPrisma.interviewSession.findFirst.mockResolvedValue({ ...mockSession, status: "COMPLETED" });
      const res = await inject(app, "POST", "/api/v1/sessions/sess-1/cancel");
      expect(res.statusCode).toBe(409);
    });
  });

  describe("PUT /api/v1/sessions/:id/questions/:sqId/answer", () => {
    it("upserts answer for in-progress session", async () => {
      mockPrisma.sessionQuestion.findFirst.mockResolvedValue({
        id: "sq-1",
        sessionId: "sess-1",
        session: { organizationId: ORG_ID, status: "IN_PROGRESS" },
      });
      mockPrisma.answer.upsert.mockResolvedValue({ id: "ans-1", content: "My answer", flagged: false });

      const res = await inject(app, "PUT", "/api/v1/sessions/sess-1/questions/sq-1/answer", {
        content: "My answer",
        flagged: false,
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.content).toBe("My answer");
    });

    it("rejects answer for non-in-progress session", async () => {
      mockPrisma.sessionQuestion.findFirst.mockResolvedValue({
        id: "sq-1",
        sessionId: "sess-1",
        session: { organizationId: ORG_ID, status: "COMPLETED" },
      });

      const res = await inject(app, "PUT", "/api/v1/sessions/sess-1/questions/sq-1/answer", {
        content: "Late answer",
        flagged: false,
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
