import { timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../plugins/auth.plugin.js";
import { env } from "../../config/env.js";
import { createBuild, getBuild, getDashboard } from "./cobra.service.js";
import { readMapping, refreshMappingFromRun } from "./cobra.storage.js";

const ChangedFileSchema = z.object({
  path: z.string().min(1),
  oldPath: z.string().min(1).optional(),
  status: z.enum(["added", "modified", "deleted", "renamed"]).default("modified"),
  lines: z.array(z.number().int().positive()).default([]),
  oldLines: z.array(z.number().int().positive()).optional(),
  structuralChange: z.boolean().optional(),
});

const AnalyzeSchema = z.object({
  baseSha: z.string().optional(),
  headSha: z.string().optional(),
  commitSha: z.string().optional(),
  branch: z.string().optional(),
  changedFiles: z.array(ChangedFileSchema).default([]),
  execute: z.boolean().optional(),
});

const WebhookSchema = AnalyzeSchema.extend({
  before: z.string().optional(),
  after: z.string().optional(),
  ref: z.string().optional(),
  commits: z
    .array(
      z.object({
        added: z.array(z.string()).optional(),
        modified: z.array(z.string()).optional(),
        removed: z.array(z.string()).optional(),
      })
    )
    .optional(),
}).passthrough();

function validToken(provided: string | undefined): boolean {
  if (!env.COBRA_TOKEN || !provided) return false;
  const expected = Buffer.from(env.COBRA_TOKEN);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function webhookFiles(payload: z.infer<typeof WebhookSchema>) {
  if (payload.changedFiles.length > 0) return payload.changedFiles;
  const files = new Map<string, "added" | "modified" | "deleted">();
  for (const commit of payload.commits ?? []) {
    for (const file of commit.added ?? []) files.set(file, "added");
    for (const file of commit.modified ?? []) if (!files.has(file)) files.set(file, "modified");
    for (const file of commit.removed ?? []) files.set(file, "deleted");
  }
  return [...files].map(([path, status]) => ({ path, status, lines: [] }));
}

const cobraRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/cobra/dashboard", { preHandler: [requireAuth] }, async () => ({
    data: getDashboard(),
  }));

  fastify.get("/cobra/builds/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const id = z.object({ id: z.string() }).parse(request.params).id;
    const build = getBuild(id);
    if (!build) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "COBRA build not found" } });
    return reply.send({ data: build });
  });

  fastify.get("/cobra/mappings", { preHandler: [requireAuth] }, async () => ({
    data: readMapping(),
  }));

  fastify.post("/cobra/mappings/refresh", { preHandler: [requireAuth] }, async (request, reply) => {
    const body = z.object({ runId: z.string().optional() }).parse(request.body ?? {});
    try {
      return reply.send({ data: refreshMappingFromRun(body.runId) });
    } catch (error) {
      return reply.status(400).send({ error: { code: "MAPPING_REFRESH_FAILED", message: (error as Error).message } });
    }
  });

  fastify.post("/cobra/analyze", { preHandler: [requireAuth] }, async (request, reply) => {
    const body = AnalyzeSchema.parse(request.body);
    if (body.execute) {
      return reply.status(409).send({
        error: {
          code: "VERIFIED_RUNNER_REQUIRED",
          message:
            "Direct API execution is disabled. Use `corepack pnpm cobra:impact --base <ref> --head <ref>` so Git and deployment revisions are verified.",
        },
      });
    }
    const build = createBuild({ ...body, source: "manual" });
    return reply.status(202).send({ data: build });
  });

  fastify.post("/cobra/webhooks/git", async (request, reply) => {
    const provided = request.headers["x-cobra-token"] as string | undefined;
    if (!validToken(provided)) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Route not found" } });
    }
    const payload = WebhookSchema.parse(request.body);
    const shouldExecute = payload.execute || env.COBRA_AUTO_RUN === "1";
    if (shouldExecute) {
      return reply.status(409).send({
        error: {
          code: "VERIFIED_RUNNER_REQUIRED",
          message:
            "Webhook execution is disabled. Run `corepack pnpm cobra:impact --base <ref> --head <ref>` in a verified repository checkout.",
        },
      });
    }
    const build = createBuild({
      baseSha: payload.baseSha ?? payload.before,
      headSha: payload.headSha ?? payload.after,
      commitSha: payload.commitSha ?? payload.after,
      branch: payload.branch ?? payload.ref?.replace(/^refs\/heads\//, ""),
      source: "webhook",
      changedFiles: webhookFiles(payload),
    });
    return reply.status(202).send({ data: build });
  });
};

export default cobraRoutes;
