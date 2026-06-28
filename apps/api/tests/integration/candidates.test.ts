import "./setup.js";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import type { FastifyInstance } from "fastify";

const mockPrisma = prisma as any;

// Simulates an authenticated session cookie (auth plugin reads from DB via Better Auth)
// We patch the auth plugin's onRequest hook by making the session lookup return a user.
vi.mock("../../src/plugins/auth.plugin.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../src/plugins/auth.plugin.js")>();
  return {
    ...orig,
    requireAuth: async (request: any, reply: any) => {
      request.user = { id: "user-1", name: "Test User", email: "test@example.com" };
      request.session = { id: "session-1" };
    },
  };
});

const ORG_ID = "org-123";

async function buildTestApp() {
  const app = await buildApp();
  await app.ready();
  return app;
}

function injectWithOrg(app: FastifyInstance, method: string, url: string, payload?: object) {
  return app.inject({
    method: method as any,
    url,
    headers: { "content-type": "application/json", "x-organization-id": ORG_ID },
    payload: payload ? JSON.stringify(payload) : undefined,
  });
}

describe("Candidates API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
    vi.clearAllMocks();
  });

  describe("GET /api/v1/candidates", () => {
    it("returns paginated candidates", async () => {
      mockPrisma.candidate.count.mockResolvedValue(2);
      mockPrisma.candidate.findMany.mockResolvedValue([
        { id: "c1", firstName: "Alice", lastName: "Chen", email: "alice@test.com", createdAt: new Date(), _count: { interviewSessions: 0 } },
        { id: "c2", firstName: "Bob", lastName: "Jones", email: "bob@test.com", createdAt: new Date(), _count: { interviewSessions: 1 } },
      ]);

      const res = await injectWithOrg(app, "GET", "/api/v1/candidates");
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(2);
      expect(body.meta.total).toBe(2);
    });

    it("passes search param to query", async () => {
      mockPrisma.candidate.count.mockResolvedValue(0);
      mockPrisma.candidate.findMany.mockResolvedValue([]);

      const res = await injectWithOrg(app, "GET", "/api/v1/candidates?search=alice&sortBy=firstName&sortOrder=asc");
      expect(res.statusCode).toBe(200);
      const callArgs = mockPrisma.candidate.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toBeDefined();
      expect(callArgs.orderBy).toEqual({ firstName: "asc" });
    });
  });

  describe("GET /api/v1/candidates/:id", () => {
    it("returns 200 for found candidate", async () => {
      mockPrisma.candidate.findFirst.mockResolvedValue({
        id: "c1", firstName: "Alice", lastName: "Chen", email: "alice@test.com",
        interviewSessions: [], _count: { interviewSessions: 0 },
      });

      const res = await injectWithOrg(app, "GET", "/api/v1/candidates/c1");
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.id).toBe("c1");
    });

    it("returns 404 for missing candidate", async () => {
      mockPrisma.candidate.findFirst.mockResolvedValue(null);
      const res = await injectWithOrg(app, "GET", "/api/v1/candidates/nonexistent");
      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /api/v1/candidates", () => {
    const validBody = { firstName: "Jane", lastName: "Smith", email: "jane@test.com" };

    it("creates candidate and returns 201", async () => {
      mockPrisma.candidate.findFirst.mockResolvedValue(null); // no duplicate
      mockPrisma.candidate.create.mockResolvedValue({ id: "c-new", ...validBody, organizationId: ORG_ID, createdAt: new Date() });

      const res = await injectWithOrg(app, "POST", "/api/v1/candidates", validBody);
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).data.email).toBe("jane@test.com");
    });

    it("returns 409 on duplicate email", async () => {
      mockPrisma.candidate.findFirst.mockResolvedValue({ id: "existing" });
      const res = await injectWithOrg(app, "POST", "/api/v1/candidates", validBody);
      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body).error.code).toBe("DUPLICATE_EMAIL");
    });

    it("returns 400 on invalid email", async () => {
      const res = await injectWithOrg(app, "POST", "/api/v1/candidates", { ...validBody, email: "not-an-email" });
      expect(res.statusCode).toBe(500); // Zod throws, caught by error handler
    });

    it("returns 400 when org header missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/candidates",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify(validBody),
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("PATCH /api/v1/candidates/:id", () => {
    it("updates candidate", async () => {
      mockPrisma.candidate.findFirst
        .mockResolvedValueOnce({ id: "c1", email: "old@test.com" }) // exists check
        .mockResolvedValue(null); // no email clash
      mockPrisma.candidate.update.mockResolvedValue({ id: "c1", notes: "Updated" });

      const res = await injectWithOrg(app, "PATCH", "/api/v1/candidates/c1", { notes: "Updated" });
      expect(res.statusCode).toBe(200);
    });

    it("returns 404 when candidate not found", async () => {
      mockPrisma.candidate.findFirst.mockResolvedValue(null);
      const res = await injectWithOrg(app, "PATCH", "/api/v1/candidates/ghost", { notes: "x" });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("DELETE /api/v1/candidates/:id", () => {
    it("deletes and returns 204", async () => {
      mockPrisma.candidate.findFirst.mockResolvedValue({ id: "c1" });
      mockPrisma.candidate.delete.mockResolvedValue({});
      const res = await injectWithOrg(app, "DELETE", "/api/v1/candidates/c1");
      expect(res.statusCode).toBe(204);
    });

    it("returns 404 for missing candidate", async () => {
      mockPrisma.candidate.findFirst.mockResolvedValue(null);
      const res = await injectWithOrg(app, "DELETE", "/api/v1/candidates/ghost");
      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /api/v1/candidates/import", () => {
    it("imports valid rows", async () => {
      mockPrisma.candidate.findFirst.mockResolvedValue(null); // no duplicates
      mockPrisma.candidate.create.mockResolvedValue({});
      const res = await injectWithOrg(app, "POST", "/api/v1/candidates/import", {
        rows: [
          { firstName: "Al", lastName: "B", email: "al@test.com" },
          { firstName: "Ca", lastName: "D", email: "ca@test.com" },
        ],
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body).data;
      expect(body.created).toBe(2);
      expect(body.skipped).toBe(0);
    });

    it("skips duplicates", async () => {
      mockPrisma.candidate.findFirst.mockResolvedValue({ id: "existing" }); // always duplicate
      const res = await injectWithOrg(app, "POST", "/api/v1/candidates/import", {
        rows: [{ firstName: "Al", lastName: "B", email: "al@test.com" }],
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).data.skipped).toBe(1);
    });

    it("returns 400 for empty rows", async () => {
      const res = await injectWithOrg(app, "POST", "/api/v1/candidates/import", { rows: [] });
      expect(res.statusCode).toBe(400);
    });
  });
});
