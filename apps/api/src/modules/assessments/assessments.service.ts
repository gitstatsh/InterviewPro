import { prisma } from "../../lib/prisma.js";
import type { AssessmentUpsertInput, BulkAssessmentInput } from "@interview/shared";

function notFound(msg = "Not found") {
  const err: any = new Error(msg);
  err.statusCode = 404;
  err.code = "NOT_FOUND";
  return err;
}

function forbidden(msg: string) {
  const err: any = new Error(msg);
  err.statusCode = 403;
  err.code = "FORBIDDEN";
  return err;
}

// ─── Upsert single assessment ─────────────────────────────────────────────────

export async function upsertAssessment(
  answerId: string,
  organizationId: string,
  data: AssessmentUpsertInput
) {
  // verify the answer belongs to a session in this org
  const answer = await prisma.answer.findFirst({
    where: { id: answerId },
    include: {
      sessionQuestion: {
        include: { session: { select: { organizationId: true, status: true } } },
      },
    },
  });
  if (!answer) throw notFound("Answer not found");
  if (answer.sessionQuestion.session.organizationId !== organizationId) throw forbidden("Access denied");
  if (!["IN_PROGRESS", "COMPLETED"].includes(answer.sessionQuestion.session.status)) {
    throw forbidden("Can only assess active or completed sessions");
  }

  return prisma.assessment.upsert({
    where: { answerId },
    create: { answerId, score: data.score, notes: data.notes ?? null },
    update: { score: data.score, notes: data.notes ?? null },
  });
}

// ─── Bulk upsert ──────────────────────────────────────────────────────────────

export async function bulkUpsertAssessments(
  organizationId: string,
  data: BulkAssessmentInput
) {
  // verify all answers belong to a session in this org and session is COMPLETED
  const answerIds = data.assessments.map((a) => a.answerId);
  const answers = await prisma.answer.findMany({
    where: { id: { in: answerIds } },
    include: {
      sessionQuestion: {
        include: { session: { select: { id: true, organizationId: true, status: true } } },
      },
    },
  });

  for (const answer of answers) {
    if (answer.sessionQuestion.session.organizationId !== organizationId) throw forbidden("Access denied");
    if (answer.sessionQuestion.session.status !== "COMPLETED") {
      throw forbidden("Can only assess completed sessions");
    }
  }

  const results = await Promise.all(
    data.assessments.map(({ answerId, score, notes }) =>
      prisma.assessment.upsert({
        where: { answerId },
        create: { answerId, score, notes: notes ?? null },
        update: { score, notes: notes ?? null },
      })
    )
  );

  return results;
}

// ─── Get session assessment summary ──────────────────────────────────────────

export async function getSessionAssessment(sessionId: string, organizationId: string) {
  const session = await prisma.interviewSession.findFirst({
    where: { id: sessionId, organizationId },
    include: {
      candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
      interviewer: { select: { id: true, name: true, email: true } },
      sessionQuestions: {
        orderBy: { order: "asc" },
        include: {
          question: {
            select: { id: true, title: true, category: true, difficulty: true },
          },
          answer: {
            include: { assessment: true },
          },
        },
      },
    },
  });

  if (!session) throw notFound("Session not found");

  // All answered questions — assessment may or may not exist yet
  const scoredItems = session.sessionQuestions
    .filter((sq) => sq.answer?.content)
    .map((sq) => ({
      questionId: sq.question.id,
      title: sq.question.title,
      category: sq.question.category,
      difficulty: sq.question.difficulty,
      answerId: sq.answer!.id,
      content: sq.answer!.content,
      flagged: sq.answer!.flagged,
      score: sq.answer!.assessment?.score ?? null,
      notes: sq.answer!.assessment?.notes ?? null,
      assessmentId: sq.answer!.assessment?.id ?? null,
    }));

  const totalQuestions = session.sessionQuestions.length;
  const answeredCount = session.sessionQuestions.filter((sq) => sq.answer?.content).length;
  const assessedItems = scoredItems.filter((i) => i.score !== null);
  const assessedCount = assessedItems.length;

  // Average score per category (only scored items)
  const byCategory: Record<string, { scores: number[]; avg?: number }> = {};
  for (const item of assessedItems) {
    if (!byCategory[item.category]) byCategory[item.category] = { scores: [] };
    byCategory[item.category].scores.push(item.score!);
  }
  for (const cat of Object.keys(byCategory)) {
    const scores = byCategory[cat].scores;
    byCategory[cat].avg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  }

  const overallAvg =
    assessedItems.length > 0
      ? Math.round(
          (assessedItems.reduce((a, b) => a + b.score!, 0) / assessedItems.length) * 10
        ) / 10
      : null;

  const flaggedCount = session.sessionQuestions.filter((sq) => sq.answer?.flagged).length;

  return {
    session: {
      id: session.id,
      title: session.title,
      status: session.status,
      scheduledAt: session.scheduledAt,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      notes: session.notes,
      aiSummary: session.aiSummary,
    },
    candidate: session.candidate,
    interviewer: session.interviewer,
    summary: {
      totalQuestions,
      answeredCount,
      assessedCount,
      overallAvg,
      flaggedCount,
      byCategory,
    },
    items: scoredItems,
    unanswered: session.sessionQuestions
      .filter((sq) => !sq.answer?.content)
      .map((sq) => ({ questionId: sq.question.id, title: sq.question.title })),
  };
}
