import { prisma } from "../../lib/prisma.js";
import { aiSummaryQueue } from "../../lib/queue.js";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../config/env.js";

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export interface AISummary {
  strengths: string[];
  concerns: string[];
  recommendation: "strong_hire" | "hire" | "no_hire" | "strong_no_hire";
  recommendationReason: string;
  overallScore: number;
  categoryScores: Record<string, number>;
  keyInsights: string[];
  generatedAt: string;
}

function notFound(msg = "Session not found") {
  const err: any = new Error(msg);
  err.statusCode = 404;
  err.code = "NOT_FOUND";
  return err;
}

function forbidden(msg: string) {
  const err: any = new Error(msg);
  err.statusCode = 403;
  err.code = "FORBIDDEN";
  throw err;
}

// ─── Enqueue ──────────────────────────────────────────────────────────────────

export async function enqueueSummary(sessionId: string, organizationId: string) {
  const session = await prisma.interviewSession.findFirst({
    where: { id: sessionId, organizationId },
  });
  if (!session) throw notFound();
  if (session.status !== "COMPLETED") {
    const err: any = new Error("Session must be completed before generating summary");
    err.statusCode = 409;
    err.code = "SESSION_NOT_COMPLETED";
    throw err;
  }

  // Mark as pending in aiSummary JSONB
  await prisma.interviewSession.update({
    where: { id: sessionId },
    data: { aiSummary: { status: "pending" } },
  });

  const job = await aiSummaryQueue.add("generate", { sessionId, organizationId });
  return { jobId: job.id, status: "pending" };
}

// ─── Generate (called by worker) ──────────────────────────────────────────────

export async function generateSummary(sessionId: string) {
  const session = await prisma.interviewSession.findFirst({
    where: { id: sessionId },
    include: {
      candidate: { select: { firstName: true, lastName: true, email: true } },
      interviewer: { select: { name: true } },
      sessionQuestions: {
        orderBy: { order: "asc" },
        include: {
          question: { select: { title: true, category: true, difficulty: true } },
          answer: { include: { assessment: true } },
        },
      },
    },
  });

  if (!session) throw notFound();

  // Build transcript for Claude
  const qas = session.sessionQuestions
    .filter((sq) => sq.answer?.content)
    .map((sq) => ({
      category: sq.question.category,
      difficulty: sq.question.difficulty,
      question: sq.question.title,
      answer: sq.answer!.content,
      score: sq.answer!.assessment?.score ?? null,
      scoreNotes: sq.answer!.assessment?.notes ?? null,
      flagged: sq.answer!.flagged,
    }));

  if (qas.length === 0) {
    await prisma.interviewSession.update({
      where: { id: sessionId },
      data: { aiSummary: { status: "error", error: "No answered questions to summarize" } },
    });
    return;
  }

  const scoredQAs = qas.filter((q) => q.score !== null);
  const overallAvg =
    scoredQAs.length > 0
      ? (scoredQAs.reduce((a, b) => a + b.score!, 0) / scoredQAs.length).toFixed(1)
      : "N/A";

  const prompt = `You are an expert technical interviewer analyzing a candidate's interview performance.

Session: ${session.title}
Candidate: ${session.candidate.firstName} ${session.candidate.lastName}
Interviewer: ${session.interviewer.name}
Overall Score: ${overallAvg}/5

Interview Q&A Transcript:
${qas
  .map(
    (qa, i) => `
Q${i + 1} [${qa.category} / ${qa.difficulty}]: ${qa.question}
Answer: ${qa.answer}
${qa.score ? `Score: ${qa.score}/5${qa.scoreNotes ? ` — ${qa.scoreNotes}` : ""}` : "Not scored"}
${qa.flagged ? "⚑ FLAGGED FOR REVIEW" : ""}`
  )
  .join("\n")}

${session.notes ? `Interviewer Notes: ${session.notes}` : ""}

Analyze this interview and respond with a JSON object ONLY (no markdown, no extra text) in this exact format:
{
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "concerns": ["concern 1", "concern 2"],
  "recommendation": "strong_hire" | "hire" | "no_hire" | "strong_no_hire",
  "recommendationReason": "2-3 sentence explanation",
  "overallScore": <number 1-5>,
  "categoryScores": { "<category>": <avg score 1-5>, ... },
  "keyInsights": ["insight 1", "insight 2", "insight 3"]
}`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Extract JSON — strip any accidental markdown
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in Claude response");

    const summary: AISummary = {
      ...JSON.parse(jsonMatch[0]),
      generatedAt: new Date().toISOString(),
    };

    await prisma.interviewSession.update({
      where: { id: sessionId },
      data: { aiSummary: { status: "completed", ...summary } },
    });
  } catch (err: any) {
    await prisma.interviewSession.update({
      where: { id: sessionId },
      data: {
        aiSummary: {
          status: "error",
          error: env.NODE_ENV === "production" ? "Summary generation failed" : err.message,
        },
      },
    });
    throw err;
  }
}

// ─── Get summary ──────────────────────────────────────────────────────────────

export async function getSummary(sessionId: string, organizationId: string) {
  const session = await prisma.interviewSession.findFirst({
    where: { id: sessionId, organizationId },
    select: { id: true, aiSummary: true, status: true, title: true },
  });
  if (!session) throw notFound();

  return {
    sessionId: session.id,
    title: session.title,
    sessionStatus: session.status,
    summary: session.aiSummary,
  };
}
