import { prisma } from "../../lib/prisma.js";
import { paginate, paginationMeta } from "@interview/shared";
import type {
  SessionCreateInput,
  SessionUpdateInput,
  SessionListInput,
  SessionAnswerInput,
} from "@interview/shared";

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
  return err;
}

function conflict(msg: string) {
  const err: any = new Error(msg);
  err.statusCode = 409;
  err.code = "CONFLICT";
  return err;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listSessions(organizationId: string, params: SessionListInput, requesterId?: string, requesterRole?: string) {
  const { page, limit, search, status, candidateId, sortBy, sortOrder } = params;

  const where: any = { organizationId };
  if (requesterRole === "ORG_MEMBER" && requesterId) where.interviewerId = requesterId;
  if (status) where.status = status;
  if (candidateId) where.candidateId = candidateId;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { candidate: { firstName: { contains: search, mode: "insensitive" } } },
      { candidate: { lastName: { contains: search, mode: "insensitive" } } },
      { candidate: { email: { contains: search, mode: "insensitive" } } },
    ];
  }

  const orderBy: any =
    sortBy === "status" ? { status: sortOrder } : { [sortBy]: sortOrder };

  const [total, sessions] = await Promise.all([
    prisma.interviewSession.count({ where }),
    prisma.interviewSession.findMany({
      where,
      orderBy,
      ...paginate(page, limit),
      include: {
        candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
        interviewer: { select: { id: true, name: true, email: true } },
        _count: { select: { sessionQuestions: true } },
      },
    }),
  ]);

  return { data: sessions, meta: paginationMeta(total, page, limit) };
}

// ─── Get one ──────────────────────────────────────────────────────────────────

export async function getSession(id: string, organizationId: string) {
  const session = await prisma.interviewSession.findFirst({
    where: { id, organizationId },
    include: {
      candidate: true,
      interviewer: { select: { id: true, name: true, email: true } },
      sessionQuestions: {
        orderBy: { order: "asc" },
        include: {
          question: true,
          answer: { include: { assessment: true } },
        },
      },
    },
  });
  if (!session) throw notFound();
  return session;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createSession(organizationId: string, data: SessionCreateInput) {
  // Validate candidate belongs to org
  const candidate = await prisma.candidate.findFirst({
    where: { id: data.candidateId, organizationId },
  });
  if (!candidate) throw notFound("Candidate not found");

  const questionIds = data.questionIds ?? [];

  // Validate questions are accessible if any provided
  if (questionIds.length > 0) {
    const questions = await prisma.question.findMany({
      where: {
        id: { in: questionIds },
        organizationId,
      },
      select: { id: true },
    });
    if (questions.length !== questionIds.length) {
      const err: any = new Error("One or more questions not found or not accessible");
      err.statusCode = 422;
      err.code = "INVALID_QUESTIONS";
      throw err;
    }
  }

  return prisma.interviewSession.create({
    data: {
      organizationId,
      candidateId: data.candidateId,
      interviewerId: data.interviewerId,
      title: data.title,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      notes: data.notes ?? null,
      sessionQuestions: questionIds.length > 0 ? {
        create: questionIds.map((qId, i) => ({
          questionId: qId,
          order: i + 1,
          timeLimit: data.timeLimits?.[qId] ?? null,
        })),
      } : undefined,
    },
    include: {
      candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
      interviewer: { select: { id: true, name: true, email: true } },
      sessionQuestions: {
        orderBy: { order: "asc" },
        include: { question: true, answer: true },
      },
    },
  });
}

// ─── Assign question bank ─────────────────────────────────────────────────────

export async function assignBankToSession(
  id: string,
  organizationId: string,
  bankId: string,
  replace: boolean
) {
  const session = await prisma.interviewSession.findFirst({
    where: { id, organizationId },
    include: { _count: { select: { sessionQuestions: true } } },
  });
  if (!session) throw notFound("Session not found");
  if (session.status !== "SCHEDULED") {
    throw forbidden("Can only assign a question bank to a scheduled session");
  }

  // Validate the bank belongs to this org
  const bank = await prisma.questionBank.findFirst({
    where: { id: bankId, organizationId },
    include: { questions: { include: { question: true } } },
  });
  if (!bank) {
    const err: any = new Error("Question bank not found");
    err.statusCode = 404;
    err.code = "BANK_NOT_FOUND";
    throw err;
  }
  if (bank.questions.length === 0) {
    const err: any = new Error("This question bank has no questions");
    err.statusCode = 422;
    err.code = "EMPTY_BANK";
    throw err;
  }

  const bankQuestionIds = bank.questions.map((bq) => bq.questionId);

  if (replace) {
    // Remove existing session questions then add bank's questions
    await prisma.sessionQuestion.deleteMany({ where: { sessionId: id } });
    await prisma.sessionQuestion.createMany({
      data: bankQuestionIds.map((qId, i) => ({
        sessionId: id,
        questionId: qId,
        order: i + 1,
      })),
    });
  } else {
    // Append — find questions not already in session
    const existing = await prisma.sessionQuestion.findMany({
      where: { sessionId: id },
      select: { questionId: true },
    });
    const existingIds = new Set(existing.map((sq) => sq.questionId));
    const newIds = bankQuestionIds.filter((qId) => !existingIds.has(qId));
    const startOrder = existing.length + 1;
    if (newIds.length > 0) {
      await prisma.sessionQuestion.createMany({
        data: newIds.map((qId, i) => ({
          sessionId: id,
          questionId: qId,
          order: startOrder + i,
        })),
      });
    }
  }

  return prisma.interviewSession.findFirst({
    where: { id },
    include: {
      candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
      interviewer: { select: { id: true, name: true, email: true } },
      sessionQuestions: { orderBy: { order: "asc" }, include: { question: true, answer: { include: { assessment: true } } } },
    },
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateSession(
  id: string,
  organizationId: string,
  data: SessionUpdateInput
) {
  const session = await prisma.interviewSession.findFirst({ where: { id, organizationId } });
  if (!session) throw notFound();
  if (session.status === "COMPLETED" || session.status === "CANCELLED") {
    throw forbidden("Cannot edit a completed or cancelled session");
  }

  return prisma.interviewSession.update({
    where: { id },
    data: {
      ...(data.title && { title: data.title }),
      scheduledAt:
        data.scheduledAt !== undefined
          ? data.scheduledAt
            ? new Date(data.scheduledAt)
            : null
          : undefined,
      ...(data.notes !== undefined && { notes: data.notes }),
    },
  });
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export async function startSession(id: string, organizationId: string) {
  const session = await prisma.interviewSession.findFirst({
    where: { id, organizationId },
    include: { _count: { select: { sessionQuestions: true } } },
  });
  if (!session) throw notFound();
  if (session.status !== "SCHEDULED") throw conflict("Session is not in SCHEDULED state");

  if ((session as any)._count.sessionQuestions === 0) {
    const err: any = new Error("Assign Question Bank to Start the Interview Session");
    err.statusCode = 422;
    err.code = "NO_QUESTIONS";
    throw err;
  }

  return prisma.interviewSession.update({
    where: { id },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });
}

export async function completeSession(id: string, organizationId: string) {
  const session = await prisma.interviewSession.findFirst({ where: { id, organizationId } });
  if (!session) throw notFound();
  if (session.status !== "IN_PROGRESS") throw conflict("Session is not IN_PROGRESS");

  return prisma.interviewSession.update({
    where: { id },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
}

export async function cancelSession(id: string, organizationId: string) {
  const session = await prisma.interviewSession.findFirst({ where: { id, organizationId } });
  if (!session) throw notFound();
  if (session.status === "COMPLETED" || session.status === "CANCELLED") {
    throw conflict("Session is already completed or cancelled");
  }

  return prisma.interviewSession.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
}

export async function reactivateSession(id: string, organizationId: string) {
  const session = await prisma.interviewSession.findFirst({ where: { id, organizationId } });
  if (!session) throw notFound();
  if (session.status !== "CANCELLED") throw conflict("Only cancelled sessions can be reactivated");

  return prisma.interviewSession.update({
    where: { id },
    data: { status: "SCHEDULED", startedAt: null, completedAt: null },
  });
}

// ─── Answers ──────────────────────────────────────────────────────────────────

export async function upsertAnswer(
  sessionId: string,
  sessionQuestionId: string,
  organizationId: string,
  data: SessionAnswerInput
) {
  // verify session question belongs to this session and org
  const sq = await prisma.sessionQuestion.findFirst({
    where: { id: sessionQuestionId, sessionId },
    include: { session: { select: { organizationId: true, status: true } } },
  });
  if (!sq) throw notFound("Session question not found");
  if (sq.session.organizationId !== organizationId) throw forbidden("Access denied");
  if (sq.session.status !== "IN_PROGRESS") throw forbidden("Session is not in progress");

  return prisma.answer.upsert({
    where: { sessionQuestionId },
    create: { sessionQuestionId, content: data.content, notes: data.notes ?? null, flagged: data.flagged },
    update: { content: data.content, notes: data.notes ?? null, flagged: data.flagged },
  });
}

export async function deleteSession(id: string, organizationId: string) {
  const session = await prisma.interviewSession.findFirst({ where: { id, organizationId } });
  if (!session) throw notFound("Session not found");
  // cascade: answers → assessments are cascade-deleted by DB; delete session questions first
  const sqIds = (await prisma.sessionQuestion.findMany({ where: { sessionId: id }, select: { id: true } })).map(s => s.id);
  await prisma.$transaction([
    prisma.assessment.deleteMany({ where: { answer: { sessionQuestionId: { in: sqIds } } } }),
    prisma.answer.deleteMany({ where: { sessionQuestionId: { in: sqIds } } }),
    prisma.sessionQuestion.deleteMany({ where: { sessionId: id } }),
    prisma.report.deleteMany({ where: { sessionId: id } }),
    prisma.interviewSession.delete({ where: { id } }),
  ]);
}

export async function updateSessionNotes(
  id: string,
  organizationId: string,
  notes: string
) {
  const session = await prisma.interviewSession.findFirst({ where: { id, organizationId } });
  if (!session) throw notFound();
  if (session.status === "CANCELLED") throw forbidden("Session is cancelled");

  return prisma.interviewSession.update({ where: { id }, data: { notes } });
}
