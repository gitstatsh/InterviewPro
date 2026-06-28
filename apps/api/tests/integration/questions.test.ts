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
      request.user = { id: "user-1", name: "Test", email: "test@test.com" };
      request.session = { id: "s-1" };
    },
  };
});

const ORG_ID = "org-abc";

function inject(app: FastifyInstance, method: string, url: string, payload?: object) {
  return app.inject({
    method: method as any,
    url,
    headers: { "content-type": "application/json", "x-organization-id": ORG_ID },
    payload: payload ? JSON.stringify(payload) : undefined,
  });
}

describe("Questions API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
    await app.ready();
    vi.clearAllMocks();
  });

  describe("GET /api/v1/questions", () => {
    it("returns paginated questions list", async () => {
      mockPrisma.question.count.mockResolvedValue(3);
      mockPrisma.question.findMany.mockResolvedValue([
        { id: "q1", title: "Explain closures", category: "JavaScript", difficulty: "MEDIUM", tags: [], isGlobal: false, aiGenerated: false },
      ]);

      const res = await inject(app, "GET", "/api/v1/questions");
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.meta.total).toBe(3);
      expect(body.data).toHaveLength(1);
    });

    it("filters by category and difficulty", async () => {
      mockPrisma.question.count.mockResolvedValue(0);
      mockPrisma.question.findMany.mockResolvedValue([]);

      await inject(app, "GET", "/api/v1/questions?category=React&difficulty=HARD");
      const whereArg = mockPrisma.question.findMany.mock.calls[0][0].where;
      expect(whereArg.category).toBe("React");
      expect(whereArg.difficulty).toBe("HARD");
    });
  });

  describe("GET /api/v1/questions/:id", () => {
    it("returns question for valid id", async () => {
      mockPrisma.question.findUnique.mockResolvedValue({ id: "q1", title: "Test Q", isGlobal: false, organizationId: ORG_ID });
      const res = await inject(app, "GET", "/api/v1/questions/q1");
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.id).toBe("q1");
    });

    it("returns 404 for missing question", async () => {
      mockPrisma.question.findUnique.mockResolvedValue(null);
      const res = await inject(app, "GET", "/api/v1/questions/ghost");
      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /api/v1/questions", () => {
    const valid = {
      title: "Explain the React reconciliation algorithm",
      body: "How does React determine what has changed in the virtual DOM and what updates to apply?",
      category: "React",
      difficulty: "HARD",
    };

    it("creates question and returns 201", async () => {
      mockPrisma.question.create.mockResolvedValue({ id: "q-new", ...valid });
      const res = await inject(app, "POST", "/api/v1/questions", valid);
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).data.id).toBe("q-new");
    });

    it("rejects missing title", async () => {
      const { title: _, ...noTitle } = valid;
      const res = await inject(app, "POST", "/api/v1/questions", noTitle);
      expect(res.statusCode).toBe(500); // Zod parse error
    });
  });

  describe("PATCH /api/v1/questions/:id", () => {
    it("updates question successfully", async () => {
      mockPrisma.question.findUnique.mockResolvedValue({ id: "q1", isGlobal: false, organizationId: ORG_ID });
      mockPrisma.question.update.mockResolvedValue({ id: "q1", difficulty: "EASY" });

      const res = await inject(app, "PATCH", "/api/v1/questions/q1", { difficulty: "EASY" });
      expect(res.statusCode).toBe(200);
    });

    it("cannot edit global questions", async () => {
      mockPrisma.question.findUnique.mockResolvedValue({ id: "q1", isGlobal: true, organizationId: null });
      const res = await inject(app, "PATCH", "/api/v1/questions/q1", { difficulty: "EASY" });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("DELETE /api/v1/questions/:id", () => {
    it("deletes org-owned question", async () => {
      mockPrisma.question.findUnique.mockResolvedValue({ id: "q1", isGlobal: false, organizationId: ORG_ID });
      mockPrisma.question.delete.mockResolvedValue({});
      const res = await inject(app, "DELETE", "/api/v1/questions/q1");
      expect(res.statusCode).toBe(204);
    });

    it("cannot delete global question", async () => {
      mockPrisma.question.findUnique.mockResolvedValue({ id: "q1", isGlobal: true, organizationId: null });
      const res = await inject(app, "DELETE", "/api/v1/questions/q1");
      expect(res.statusCode).toBe(403);
    });
  });

  describe("POST /api/v1/questions/generate", () => {
    it("returns AI-generated questions preview", async () => {
      const res = await inject(app, "POST", "/api/v1/questions/generate", {
        topic: "React hooks",
        category: "React",
        difficulty: "MEDIUM",
        count: 3,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe("POST /api/v1/questions/bulk", () => {
    it("bulk-saves questions", async () => {
      mockPrisma.question.create.mockResolvedValue({ id: "q-bulk" });
      const res = await inject(app, "POST", "/api/v1/questions/bulk", {
        questions: [{
          title: "Explain useCallback",
          body: "When and why should you use the useCallback hook in React?",
          category: "React",
          difficulty: "MEDIUM",
          isGlobal: false,
        }],
      });
      expect(res.statusCode).toBe(201);
    });
  });
});
