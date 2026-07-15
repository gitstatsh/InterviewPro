import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import authPlugin from "./plugins/auth.plugin.js";
import tenantPlugin from "./plugins/tenant.plugin.js";
import authRoutes from "./modules/auth/auth.routes.js";
import orgRoutes from "./modules/organizations/organizations.routes.js";
import rolesRoutes from "./modules/roles/roles.routes.js";
import questionsRoutes from "./modules/questions/questions.routes.js";
import candidatesRoutes from "./modules/candidates/candidates.routes.js";
import sessionsRoutes from "./modules/sessions/sessions.routes.js";
import assessmentsRoutes from "./modules/assessments/assessments.routes.js";
import summariesRoutes from "./modules/summaries/summaries.routes.js";
import reportsRoutes from "./modules/reports/reports.routes.js";
import analyticsRoutes from "./modules/analytics/analytics.routes.js";
import questionBanksRoutes from "./modules/question-banks/question-banks.routes.js";
import cobraRoutes from "./modules/cobra/cobra.routes.js";
import { env } from "./config/env.js";
import { captureException } from "./lib/sentry.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "test" ? "silent" : "info",
      transport:
        env.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
    bodyLimit: 10 * 1024 * 1024, // 10 MB — needed for base64 logo uploads
    keepAliveTimeout: 120_000,   // 120s — prevents socket hang up when Next.js proxy reuses connections during long AI calls
    connectionTimeout: 300_000,  // 300s — allow AI generation calls up to 5 minutes
  });

  // ── Plugins ──────────────────────────────────────────────────────────────

  await app.register(cors, {
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  await app.register(cookie);

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests, please try again later",
      },
    }),
  });

  await app.register(authPlugin);
  await app.register(tenantPlugin);

  // COBRA: register test-support coverage endpoints only when explicitly
  // opted in. Never registered in production even if the module is present.
  if (env.TEST_MODE === "1" || env.COBRA_ENABLED === "1") {
    const { default: cobraPlugin } = await import("./testing/cobra-routes.js");
    await app.register(cobraPlugin);
  }

  // ── Error Handler ─────────────────────────────────────────────────────────

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    if ((error.statusCode ?? 500) >= 500) captureException(error);
    const statusCode = error.statusCode ?? 500;
    return reply.status(statusCode).send({
      error: {
        code: error.code ?? "INTERNAL_ERROR",
        message:
          env.NODE_ENV === "production"
            ? "An unexpected error occurred"
            : error.message,
      },
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      error: { code: "NOT_FOUND", message: "Route not found" },
    });
  });

  // ── Health Check ──────────────────────────────────────────────────────────

  app.get("/health", async (_request, reply) => {
    const start = Date.now();
    try {
      await import("./lib/prisma.js").then(({ prisma }) => prisma.$queryRaw`SELECT 1`);
    } catch {
      return reply.status(503).send({ status: "unhealthy", db: "unreachable", uptime: process.uptime() });
    }
    return reply.send({
      status: "ok",
      version: process.env.npm_package_version ?? "unknown",
      uptime: process.uptime(),
      dbLatencyMs: Date.now() - start,
    });
  });

  // ── Routes ────────────────────────────────────────────────────────────────

  // Auth routes register at root — Better Auth uses /api/auth/* natively,
  // custom routes (/me, /health) are nested under /api/v1 inside the plugin
  await app.register(authRoutes, { prefix: "/api/v1" });
  await app.register(orgRoutes, { prefix: "/api/v1" });
  await app.register(rolesRoutes, { prefix: "/api/v1" });
  await app.register(questionsRoutes, { prefix: "/api/v1" });
  await app.register(candidatesRoutes, { prefix: "/api/v1" });
  await app.register(sessionsRoutes, { prefix: "/api/v1" });
  await app.register(assessmentsRoutes, { prefix: "/api/v1" });
  await app.register(summariesRoutes, { prefix: "/api/v1" });
  await app.register(reportsRoutes, { prefix: "/api/v1" });
  await app.register(analyticsRoutes, { prefix: "/api/v1" });
  await app.register(questionBanksRoutes, { prefix: "/api/v1" });
  await app.register(cobraRoutes, { prefix: "/api/v1" });
  // Also expose Better Auth at its native path (no /api/v1 prefix)
  await app.all("/api/auth/*", async (request, reply) => {
    const { auth: betterAuth } = await import("./lib/auth.js");
    const response = await betterAuth.handler(
      new Request(
        `${request.protocol}://${request.hostname}${request.url}`,
        {
          method: request.method,
          headers: request.headers as unknown as HeadersInit,
          body:
            request.method !== "GET" && request.method !== "HEAD"
              ? JSON.stringify(request.body)
              : undefined,
        }
      )
    );
    reply.status(response.status);
    response.headers.forEach((value: string, key: string) => {
      reply.header(key, value);
    });
    return reply.send(await response.text());
  });

  return app;
}
