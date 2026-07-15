import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CobraBuild } from "@interview/shared";

const serviceMocks = vi.hoisted(() => ({
  createBuild: vi.fn(),
  getBuild: vi.fn(),
  getDashboard: vi.fn(),
}));
const mockEnvironment = vi.hoisted(() => ({
  COBRA_AUTO_RUN: "0",
  COBRA_TOKEN: "test-cobra-token",
}));

vi.mock("../../src/config/env.js", () => ({
  env: mockEnvironment,
}));
vi.mock("../../src/plugins/auth.plugin.js", () => ({
  requireAuth: async () => undefined,
}));
vi.mock("../../src/modules/cobra/cobra.service.js", () => serviceMocks);
vi.mock("../../src/modules/cobra/cobra.storage.js", () => ({
  readMapping: vi.fn(() => null),
  refreshMappingFromRun: vi.fn(),
}));

import cobraRoutes from "../../src/modules/cobra/cobra.routes";

function plannedBuild(): CobraBuild {
  return {
    id: "planned-build",
    commitSha: "abc1234",
    branch: "main",
    source: "manual",
    receivedAt: "2026-01-01T00:00:00.000Z",
    status: "planned",
    selection: {
      mode: "full-regression",
      reason: "mapping-missing",
      changedFiles: [],
      recommendedTests: [],
      skippedTests: [],
      unmappedFiles: [],
    },
    executedTests: [],
  };
}

describe("COBRA API execution safety", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockEnvironment.COBRA_AUTO_RUN = "0";
    serviceMocks.createBuild.mockReturnValue(plannedBuild());
    app = Fastify({ logger: false });
    await app.register(cobraRoutes);
    await app.ready();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await app.close();
  });

  it("creates a manual analysis plan without executing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/cobra/analyze",
      payload: { changedFiles: [] },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      data: { id: "planned-build", status: "planned" },
    });
    expect(serviceMocks.createBuild).toHaveBeenCalledOnce();
  });

  it("rejects direct execution without creating a stuck build", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/cobra/analyze",
      payload: { changedFiles: [], execute: true },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: { code: "VERIFIED_RUNNER_REQUIRED" },
    });
    expect(response.json()).not.toHaveProperty("data");
    expect(serviceMocks.createBuild).not.toHaveBeenCalled();
  });

  it("rejects configured webhook auto-run without creating a stuck build", async () => {
    mockEnvironment.COBRA_AUTO_RUN = "1";
    const response = await app.inject({
      method: "POST",
      url: "/cobra/webhooks/git",
      headers: { "x-cobra-token": "test-cobra-token" },
      payload: {
        before: "abc1234",
        after: "def5678",
        commits: [{ modified: ["apps/web/src/page.tsx"] }],
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: { code: "VERIFIED_RUNNER_REQUIRED" },
    });
    expect(response.json()).not.toHaveProperty("data");
    expect(serviceMocks.createBuild).not.toHaveBeenCalled();
  });
});
