import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { redis } from "./lib/redis.js";
import { prisma } from "./lib/prisma.js";
import { createAISummaryWorker } from "./lib/queue.js";
import { generateSummary } from "./modules/summaries/summaries.service.js";
import { initSentry } from "./lib/sentry.js";

async function start() {
  // Initialize Sentry after env is validated
  initSentry();

  const app = await buildApp();

  try {
    await redis.connect();
    app.log.info("Redis connected");
  } catch (err) {
    app.log.warn("Redis connection failed — continuing without cache");
  }

  // Start AI summary worker
  const summaryWorker = createAISummaryWorker(async (job) => {
    app.log.info({ jobId: job.id, sessionId: job.data.sessionId }, "Processing AI summary job");
    await generateSummary(job.data.sessionId);
    app.log.info({ jobId: job.id }, "AI summary job completed");
  });

  summaryWorker.on("failed", (job, err) => {
    app.log.error({ jobId: job?.id, err: err.message }, "AI summary job failed");
  });

  await app.listen({ port: env.PORT, host: "0.0.0.0" });

  const shutdown = async () => {
    app.log.info("Shutting down...");
    await summaryWorker.close();
    await app.close();
    await prisma.$disconnect();
    await redis.quit();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
