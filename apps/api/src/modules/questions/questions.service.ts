import { prisma } from "../../lib/prisma.js";
import { generateQuestions } from "../../lib/ai.js";
import { paginate, paginationMeta } from "@interview/shared";
import type {
  QuestionCreateInput,
  QuestionUpdateInput,
  QuestionListInput,
  AIGenerateInput,
} from "@interview/shared";

export async function listQuestions(
  orgId: string | null,
  params: QuestionListInput
) {
  const { page, limit, search, sortBy, sortOrder, category, subCategory, difficulty, isGlobal, tags } =
    params;
  const { skip, take } = paginate(page, limit);

  const tagList = tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [];

  const where: any = {
    organizationId: orgId,
    ...(category ? { category: { contains: category, mode: "insensitive" as const } } : {}),
    ...(subCategory ? { subCategory: { contains: subCategory, mode: "insensitive" as const } } : {}),
    ...(difficulty ? { difficulty } : {}),
    ...(tagList.length > 0 ? { tags: { hasSome: tagList } } : {}),
  };

  if (search) {
    where.AND = [
      {
        OR: [
          { title: { contains: search, mode: "insensitive" as const } },
          { body: { contains: search, mode: "insensitive" as const } },
        ],
      },
    ];
  }

  const orderField = sortBy === "title" ? { title: sortOrder } : { createdAt: sortOrder };

  const [questions, total] = await Promise.all([
    prisma.question.findMany({
      where,
      orderBy: orderField,
      skip,
      take,
    }),
    prisma.question.count({ where }),
  ]);

  return { data: questions, meta: paginationMeta(total, page, limit) };
}

export async function getQuestion(questionId: string, orgId: string | null) {
  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) throw notFound();
  if (question.organizationId !== orgId) throw notFound();
  return question;
}

export async function createQuestion(
  orgId: string,
  data: QuestionCreateInput & { aiGenerated?: boolean }
) {
  // Verify the organization exists before creating
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) {
    const err: any = new Error("Organization not found — please refresh and select a valid organization");
    err.statusCode = 404;
    err.code = "ORG_NOT_FOUND";
    throw err;
  }

  return prisma.question.create({
    data: {
      title: data.title,
      body: data.body,
      category: data.category,
      subCategory: data.subCategory ?? null,
      difficulty: data.difficulty,
      tags: data.tags ?? [],
      isGlobal: data.isGlobal ?? false,
      expectedAnswer: data.expectedAnswer,
      aiGenerated: data.aiGenerated ?? false,
      organizationId: orgId,
    },
  });
}

export async function updateQuestion(
  questionId: string,
  orgId: string,
  data: QuestionUpdateInput
) {
  const q = await getQuestion(questionId, orgId);
  if (q.isGlobal) {
    throw Object.assign(new Error("Global questions cannot be edited"), {
      code: "FORBIDDEN",
      statusCode: 403,
    });
  }
  if (q.organizationId !== orgId) throw notFound();

  return prisma.question.update({
    where: { id: questionId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.body !== undefined && { body: data.body }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.subCategory !== undefined && { subCategory: data.subCategory }),
      ...(data.difficulty !== undefined && { difficulty: data.difficulty }),
      ...(data.tags !== undefined && { tags: data.tags }),
      ...(data.expectedAnswer !== undefined && { expectedAnswer: data.expectedAnswer }),
    },
  });
}

export async function deleteQuestion(questionId: string, orgId: string) {
  const q = await getQuestion(questionId, orgId);
  if (q.isGlobal) {
    throw Object.assign(new Error("Global questions cannot be deleted"), {
      code: "FORBIDDEN",
      statusCode: 403,
    });
  }
  if (q.organizationId !== orgId) throw notFound();

  // Delete dependents in order before removing the question
  const sessionQuestions = await prisma.sessionQuestion.findMany({
    where: { questionId },
    select: { id: true },
  });
  const sqIds = sessionQuestions.map((sq) => sq.id);

  await prisma.$transaction([
    prisma.assessment.deleteMany({ where: { answer: { sessionQuestionId: { in: sqIds } } } }),
    prisma.answer.deleteMany({ where: { sessionQuestionId: { in: sqIds } } }),
    prisma.sessionQuestion.deleteMany({ where: { questionId } }),
    prisma.questionBankQuestion.deleteMany({ where: { questionId } }),
    prisma.question.delete({ where: { id: questionId } }),
  ]);

}

export async function aiGenerateQuestions(input: AIGenerateInput) {
  return generateQuestions(input);
}

export async function bulkSaveQuestions(
  orgId: string,
  questions: (QuestionCreateInput & { aiGenerated?: boolean })[]
) {
  return Promise.all(questions.map((q) => createQuestion(orgId, q)));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function notFound() {
  return Object.assign(new Error("Question not found"), {
    code: "NOT_FOUND",
    statusCode: 404,
  });
}
