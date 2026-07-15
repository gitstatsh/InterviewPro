/**
 * COBRA — Fastify plugin exposing the two test-support endpoints:
 *
 *   POST /__coverage__/reset      → clears V8 coverage + DB tap buffer
 *   GET  /__coverage__/snapshot   → returns raw V8 script coverage + DB log
 *
 * Both require an `x-cobra-token` header matching env.COBRA_TOKEN. If the
 * header is missing or wrong we return 404 (not 401) so an unauthenticated
 * probe can't even confirm the endpoints exist. The plugin itself is only
 * registered from app.ts when TEST_MODE=1, so in production these paths
 * genuinely don't exist.
 */

import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { env } from "../config/env.js";
import {
  resetCoverage,
  startCoverageSession,
  takeCoverageSnapshot,
} from "./cobra-coverage.js";
import { resetDbLog, takeDbLog } from "./cobra-db-tap.js";

const cobraPlugin: FastifyPluginAsync = async (fastify) => {
  await startCoverageSession();

  const requireToken = (request: any, reply: any): boolean => {
    const provided = request.headers["x-cobra-token"] as string | undefined;
    if (!env.COBRA_TOKEN || provided !== env.COBRA_TOKEN) {
      reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Route not found" },
      });
      return false;
    }
    return true;
  };

  fastify.post("/__coverage__/reset", async (request, reply) => {
    if (!requireToken(request, reply)) return;
    await resetCoverage();
    resetDbLog();
    return reply.send({ ok: true });
  });

  fastify.get("/__coverage__/snapshot", async (request, reply) => {
    if (!requireToken(request, reply)) return;
    const v8 = await takeCoverageSnapshot();
    const db = takeDbLog();
    return reply.send({ v8, db });
  });

  fastify.log.warn(
    "[cobra] test-mode coverage endpoints registered at /__coverage__/*"
  );
};

export default fp(cobraPlugin, { name: "cobra" });
