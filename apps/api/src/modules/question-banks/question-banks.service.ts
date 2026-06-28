import { prisma } from "../../lib/prisma.js";
import { generateQuestionsFromJD } from "../../lib/ai.js";
import { paginate, paginationMeta } from "@interview/shared";
import type {
  QuestionBankCreateInput,
  QuestionBankUpdateInput,
  QuestionBankListInput,
  AddQuestionsToBankInput,
  GenerateFromJDInput,
} from "@interview/shared";

function notFound(msg = "Question bank not found") {
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

const bankInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  organization: { select: { id: true, name: true } },
  _count: { select: { questions: true } },
};

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listBanks(organizationId: string, params: QuestionBankListInput) {
  const { page, limit, search } = params;

  const where: any = { organizationId };

  if (search) {
    where.AND = [
      {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { description: { contains: search, mode: "insensitive" as const } },
        ],
      },
    ];
  }

  const [total, banks] = await Promise.all([
    prisma.questionBank.count({ where }),
    prisma.questionBank.findMany({
      where,
      orderBy: [{ organizationId: "asc" }, { createdAt: "desc" }],
      ...paginate(page, limit),
      include: bankInclude,
    }),
  ]);

  return { data: banks, meta: paginationMeta(total, page, limit) };
}

// ─── Get one ──────────────────────────────────────────────────────────────────

export async function getBank(id: string, organizationId: string) {
  const bank = await prisma.questionBank.findFirst({
    where: { id, organizationId },
    include: {
      ...bankInclude,
      questions: {
        orderBy: { order: "asc" },
        include: {
          question: true,
        },
      },
    },
  });
  if (!bank) throw notFound();
  return bank;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createBank(
  organizationId: string,
  userId: string,
  data: QuestionBankCreateInput
) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!org) throw notFound("Organization not found");

  return prisma.questionBank.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      isShared: data.isShared ?? false,
      organizationId,
      createdById: userId,
    },
    include: bankInclude,
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateBank(
  id: string,
  organizationId: string,
  data: QuestionBankUpdateInput
) {
  const bank = await prisma.questionBank.findFirst({ where: { id, organizationId } });
  if (!bank) throw notFound();

  return prisma.questionBank.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.isShared !== undefined && { isShared: data.isShared }),
    },
    include: bankInclude,
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteBank(id: string, organizationId: string) {
  const bank = await prisma.questionBank.findFirst({ where: { id, organizationId } });
  if (!bank) throw notFound();

  // Block delete if any question from this bank is used in a non-cancelled session
  const bankQuestionIds = (
    await prisma.questionBankQuestion.findMany({ where: { bankId: id }, select: { questionId: true } })
  ).map((q) => q.questionId);

  if (bankQuestionIds.length > 0) {
    const activeSessionCount = await prisma.sessionQuestion.count({
      where: {
        questionId: { in: bankQuestionIds },
        session: { status: { in: ["SCHEDULED", "IN_PROGRESS", "COMPLETED"] } },
      },
    });
    if (activeSessionCount > 0) {
      const err: any = new Error(
        `Cannot delete this question bank — its questions are used in ${activeSessionCount} interview session${activeSessionCount > 1 ? "s" : ""}. Delete those sessions first.`
      );
      err.statusCode = 409;
      err.code = "BANK_IN_USE";
      throw err;
    }
  }

  return prisma.questionBank.delete({ where: { id } });
}

// ─── Add questions ────────────────────────────────────────────────────────────

export async function addQuestionsToBank(
  id: string,
  organizationId: string,
  data: AddQuestionsToBankInput
) {
  const bank = await prisma.questionBank.findFirst({ where: { id, organizationId } });
  if (!bank) throw notFound();

  // Verify all questions belong to this org
  const questions = await prisma.question.findMany({
    where: {
      id: { in: data.questionIds },
      organizationId,
    },
    select: { id: true },
  });

  if (questions.length !== data.questionIds.length) {
    const err: any = new Error("One or more questions not found or not accessible");
    err.statusCode = 422;
    err.code = "INVALID_QUESTIONS";
    throw err;
  }

  // Get current max order
  const maxOrder = await prisma.questionBankQuestion.aggregate({
    where: { bankId: id },
    _max: { order: true },
  });
  const startOrder = (maxOrder._max.order ?? 0) + 1;

  // Upsert each (skip duplicates)
  await Promise.all(
    data.questionIds.map((qId, i) =>
      prisma.questionBankQuestion.upsert({
        where: { bankId_questionId: { bankId: id, questionId: qId } },
        create: { bankId: id, questionId: qId, order: startOrder + i },
        update: {},
      })
    )
  );

  return getBank(id, organizationId);
}

// ─── Remove question ──────────────────────────────────────────────────────────

export async function removeQuestionFromBank(
  id: string,
  questionId: string,
  organizationId: string
) {
  const bank = await prisma.questionBank.findFirst({ where: { id, organizationId } });
  if (!bank) throw notFound();

  await prisma.questionBankQuestion.deleteMany({
    where: { bankId: id, questionId },
  });

  return getBank(id, organizationId);
}

// ─── Reorder questions ────────────────────────────────────────────────────────

export async function reorderBankQuestions(
  id: string,
  organizationId: string,
  orderedQuestionIds: string[]
) {
  const bank = await prisma.questionBank.findFirst({ where: { id, organizationId } });
  if (!bank) throw notFound();

  await Promise.all(
    orderedQuestionIds.map((qId, i) =>
      prisma.questionBankQuestion.updateMany({
        where: { bankId: id, questionId: qId },
        data: { order: i + 1 },
      })
    )
  );

  return getBank(id, organizationId);
}

// ─── Generate from Job Description ───────────────────────────────────────────

export async function generateFromJD(
  id: string,
  organizationId: string,
  data: GenerateFromJDInput
) {
  const bank = await prisma.questionBank.findFirst({
    where: { id, organizationId },
  });
  if (!bank) throw notFound();

  const generated = await generateQuestionsFromJD(data);

  // Bulk-save questions then add them to the bank
  const saved = await Promise.all(
    generated.map((q) =>
      prisma.question.create({
        data: {
          title: q.title,
          body: q.body,
          category: (q as any).category ?? "General",
          subCategory: (q as any).subCategory ?? null,
          difficulty: q.difficulty ?? "MEDIUM",
          tags: q.tags ?? [],
          expectedAnswer: q.expectedAnswer ?? null,
          aiGenerated: true,
          organizationId,
        },
      })
    )
  );

  const maxOrder = await prisma.questionBankQuestion.aggregate({
    where: { bankId: id },
    _max: { order: true },
  });
  const startOrder = (maxOrder._max.order ?? 0) + 1;

  await Promise.all(
    saved.map((q, i) =>
      prisma.questionBankQuestion.upsert({
        where: { bankId_questionId: { bankId: id, questionId: q.id } },
        create: { bankId: id, questionId: q.id, order: startOrder + i },
        update: {},
      })
    )
  );

  return { questions: saved, bank: await getBank(id, organizationId) };
}
