import { prisma } from "../../lib/prisma.js";
import { paginate, paginationMeta } from "@interview/shared";
import type {
  CandidateCreateInput,
  CandidateUpdateInput,
  CandidateListInput,
  CandidateCSVRow,
} from "@interview/shared";

function buildWhere(organizationId: string, search?: string) {
  const where: any = { organizationId };
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function listCandidates(organizationId: string, params: CandidateListInput) {
  const { page, limit, search, sortBy, sortOrder } = params;
  const where = buildWhere(organizationId, search);

  const [total, candidates] = await Promise.all([
    prisma.candidate.count({ where }),
    prisma.candidate.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      ...paginate(page, limit),
      include: {
        _count: { select: { interviewSessions: true } },
      },
    }),
  ]);

  return {
    data: candidates,
    meta: paginationMeta(total, page, limit),
  };
}

export async function getCandidate(id: string, organizationId: string) {
  const candidate = await prisma.candidate.findFirst({
    where: { id, organizationId },
    include: {
      interviewSessions: {
        orderBy: { scheduledAt: "desc" },
        take: 10,
        select: {
          id: true,
          scheduledAt: true,
          status: true,
          createdAt: true,
        },
      },
      _count: { select: { interviewSessions: true } },
    },
  });

  if (!candidate) {
    const err: any = new Error("Candidate not found");
    err.statusCode = 404;
    err.code = "NOT_FOUND";
    throw err;
  }

  return candidate;
}

export async function createCandidate(organizationId: string, data: CandidateCreateInput) {
  const existing = await prisma.candidate.findFirst({
    where: { organizationId, email: data.email },
  });
  if (existing) {
    const err: any = new Error("A candidate with this email already exists in your organization");
    err.statusCode = 409;
    err.code = "DUPLICATE_EMAIL";
    throw err;
  }

  return prisma.candidate.create({
    data: {
      ...data,
      resumeUrl: data.resumeUrl || null,
      linkedinUrl: data.linkedinUrl || null,
      organizationId,
    },
  });
}

export async function updateCandidate(
  id: string,
  organizationId: string,
  data: CandidateUpdateInput
) {
  const existing = await prisma.candidate.findFirst({ where: { id, organizationId } });
  if (!existing) {
    const err: any = new Error("Candidate not found");
    err.statusCode = 404;
    err.code = "NOT_FOUND";
    throw err;
  }

  if (data.email && data.email !== existing.email) {
    const clash = await prisma.candidate.findFirst({
      where: { organizationId, email: data.email },
    });
    if (clash) {
      const err: any = new Error("A candidate with this email already exists in your organization");
      err.statusCode = 409;
      err.code = "DUPLICATE_EMAIL";
      throw err;
    }
  }

  return prisma.candidate.update({
    where: { id },
    data: {
      ...data,
      resumeUrl: data.resumeUrl === "" ? null : data.resumeUrl,
      linkedinUrl: data.linkedinUrl === "" ? null : data.linkedinUrl,
    },
  });
}

export async function deleteCandidate(id: string, organizationId: string) {
  const existing = await prisma.candidate.findFirst({ where: { id, organizationId } });
  if (!existing) {
    const err: any = new Error("Candidate not found");
    err.statusCode = 404;
    err.code = "NOT_FOUND";
    throw err;
  }
  const sessionCount = await prisma.interviewSession.count({ where: { candidateId: id } });
  if (sessionCount > 0) {
    const err: any = new Error(
      `Cannot delete candidate — they have ${sessionCount} associated interview session${sessionCount > 1 ? "s" : ""}. Delete those sessions first.`
    );
    err.statusCode = 409;
    err.code = "CANDIDATE_HAS_SESSIONS";
    throw err;
  }
  await prisma.candidate.delete({ where: { id } });
}

export async function importCandidatesFromCSV(
  organizationId: string,
  rows: CandidateCSVRow[]
): Promise<{ created: number; skipped: number; errors: string[] }> {
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const existing = await prisma.candidate.findFirst({
        where: { organizationId, email: row.email },
      });
      if (existing) {
        skipped++;
        continue;
      }
      await prisma.candidate.create({
        data: {
          organizationId,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          phone: row.phone ?? null,
          linkedinUrl: row.linkedinUrl || null,
          notes: row.notes ?? null,
        },
      });
      created++;
    } catch (err: any) {
      errors.push(`${row.email}: ${err.message}`);
    }
  }

  return { created, skipped, errors };
}
