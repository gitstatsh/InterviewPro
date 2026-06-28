import { Queue, Worker, type Job } from "bullmq";
import { env } from "../config/env.js";

// Pass connection URL string — BullMQ creates its own ioredis instance,
// avoiding a version mismatch with our ioredis singleton.
const connection = { url: env.REDIS_URL };

export const AI_SUMMARY_QUEUE = "ai-summary";

export const aiSummaryQueue = new Queue(AI_SUMMARY_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export interface AISummaryJobData {
  sessionId: string;
  organizationId: string;
}

export function createAISummaryWorker(
  processor: (job: Job<AISummaryJobData>) => Promise<void>
) {
  return new Worker<AISummaryJobData>(AI_SUMMARY_QUEUE, processor, {
    connection,
    concurrency: env.NODE_ENV === "production" ? 4 : 2,
  });
}
