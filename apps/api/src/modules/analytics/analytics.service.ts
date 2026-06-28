import { prisma } from "../../lib/prisma.js";

export async function getOrgAnalytics(
  organizationId: string,
  from: Date,
  to: Date,
  requesterId?: string,
  requesterRole?: string
) {
  const isOrgMember = requesterRole === "ORG_MEMBER";
  const memberFilter = isOrgMember && requesterId ? { interviewerId: requesterId } : {};
  const dateFilter = { gte: from, lte: to };

  const [
    totalSessions,
    sessionsByStatus,
    sessionsOverTime,
    scoreStats,
    topQuestions,
    candidateCount,
    recentSessions,
  ] = await Promise.all([
    // Total sessions in range
    prisma.interviewSession.count({
      where: { organizationId, ...memberFilter, createdAt: dateFilter },
    }),

    // Sessions grouped by status
    prisma.interviewSession.groupBy({
      by: ["status"],
      where: { organizationId, ...memberFilter, createdAt: dateFilter },
      _count: { id: true },
    }),

    // Sessions per month (completed only)
    prisma.$queryRaw<{ month: string; count: bigint }[]>`
      SELECT
        TO_CHAR(COALESCE("completedAt", "createdAt"), 'YYYY-MM') as month,
        COUNT(*) as count
      FROM "InterviewSession"
      WHERE "organizationId" = ${organizationId}
        AND status = 'COMPLETED'
      GROUP BY TO_CHAR(COALESCE("completedAt", "createdAt"), 'YYYY-MM')
      ORDER BY month ASC
    `,

    // Assessment score distribution & averages
    prisma.$queryRaw<{ score: number; count: bigint }[]>`
      SELECT a.score, COUNT(*) as count
      FROM "Assessment" a
      JOIN "Answer" ans ON ans.id = a."answerId"
      JOIN "SessionQuestion" sq ON sq.id = ans."sessionQuestionId"
      JOIN "InterviewSession" s ON s.id = sq."sessionId"
      WHERE s."organizationId" = ${organizationId}
        AND s."completedAt" >= ${from}
        AND s."completedAt" <= ${to}
      GROUP BY a.score
      ORDER BY a.score
    `,

    // Top 10 most-used questions with avg score
    prisma.$queryRaw<{ id: string; title: string; category: string; usageCount: bigint; avgScore: number | null }[]>`
      SELECT
        q.id,
        q.title,
        q.category,
        COUNT(sq.id) as "usageCount",
        ROUND(AVG(a.score)::numeric, 1) as "avgScore"
      FROM "Question" q
      JOIN "SessionQuestion" sq ON sq."questionId" = q.id
      JOIN "InterviewSession" s ON s.id = sq."sessionId"
      LEFT JOIN "Answer" ans ON ans."sessionQuestionId" = sq.id
      LEFT JOIN "Assessment" a ON a."answerId" = ans.id
      WHERE s."organizationId" = ${organizationId}
        AND s."createdAt" >= ${from}
        AND s."createdAt" <= ${to}
      GROUP BY q.id, q.title, q.category
      ORDER BY "usageCount" DESC
      LIMIT 10
    `,

    // Candidate count
    prisma.candidate.count({
      where: { organizationId, createdAt: dateFilter },
    }),

    // Recent 5 completed sessions with avg score
    prisma.interviewSession.findMany({
      where: {
        organizationId,
        ...memberFilter,
        status: "COMPLETED",
        completedAt: dateFilter,
      },
      orderBy: { completedAt: "desc" },
      take: 5,
      include: {
        candidate: { select: { firstName: true, lastName: true } },
        sessionQuestions: {
          include: {
            answer: { include: { assessment: { select: { score: true } } } },
          },
        },
      },
    }),
  ]);

  // Compute status counts map
  const statusCounts: Record<string, number> = {};
  for (const s of sessionsByStatus) {
    statusCounts[s.status] = s._count.id;
  }

  const completedCount = statusCounts["COMPLETED"] ?? 0;
  const scheduledCount = statusCounts["SCHEDULED"] ?? 0;
  const inProgressCount = statusCounts["IN_PROGRESS"] ?? 0;
  const cancelledCount = statusCounts["CANCELLED"] ?? 0;

  // Score distribution
  const scoreDistribution = [1, 2, 3, 4, 5].map((score) => ({
    score,
    label: `${score}`,
    count: Number(scoreStats.find((s) => s.score === score)?.count ?? 0),
  }));

  const totalScored = scoreDistribution.reduce((a, b) => a + b.count, 0);
  const weightedSum = scoreDistribution.reduce((a, b) => a + b.score * b.count, 0);
  const overallAvgScore = totalScored > 0 ? Math.round((weightedSum / totalScored) * 10) / 10 : null;

  // Pass rate: sessions where avg score >= 3
  const recentWithAvg = recentSessions.map((s) => {
    const scores = s.sessionQuestions
      .flatMap((sq) => sq.answer?.assessment?.score ?? [])
      .filter(Boolean);
    const avg = scores.length > 0
      ? Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10
      : null;
    return {
      id: s.id,
      title: s.title,
      candidateName: `${s.candidate.firstName} ${s.candidate.lastName}`,
      completedAt: s.completedAt,
      avg,
    };
  });

  // Build monthly time series from raw results
  const days = Math.round((to.getTime() - from.getTime()) / 86400000);
  const chartTimeSeries = sessionsOverTime.map((row) => ({
    month: row.month,
    sessions: Number(row.count),
  }));

  return {
    period: { from: from.toISOString(), to: to.toISOString(), days },
    overview: {
      totalSessions,
      completedCount,
      scheduledCount,
      inProgressCount,
      cancelledCount,
      candidateCount,
      overallAvgScore,
      passRate:
        completedCount > 0
          ? Math.round(
              (recentSessions.filter((s) => {
                const scores = s.sessionQuestions
                  .flatMap((sq) => sq.answer?.assessment?.score ?? [])
                  .filter(Boolean);
                return scores.length > 0 && scores.reduce((a: number, b: number) => a + b, 0) / scores.length >= 3;
              }).length /
                completedCount) *
                100
            )
          : null,
    },
    timeSeries: chartTimeSeries,
    scoreDistribution,
    topQuestions: topQuestions.map((q) => ({
      ...q,
      usageCount: Number(q.usageCount),
      avgScore: q.avgScore ? Number(q.avgScore) : null,
    })),
    recentSessions: recentWithAvg,
  };
}

