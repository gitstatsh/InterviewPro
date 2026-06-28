import puppeteer from "puppeteer";
import { Resend } from "resend";
import { prisma } from "../../lib/prisma.js";
import { buildReportHTML, type ReportData } from "./report-template.js";
import { env } from "../../config/env.js";

// Lazy — only instantiated when actually sending email
function getResend() {
  if (!env.RESEND_API_KEY) {
    const err: any = new Error("Email not configured — set RESEND_API_KEY");
    err.statusCode = 503;
    err.code = "EMAIL_NOT_CONFIGURED";
    throw err;
  }
  return new Resend(env.RESEND_API_KEY);
}

function notFound(msg = "Session not found") {
  const err: any = new Error(msg);
  err.statusCode = 404;
  err.code = "NOT_FOUND";
  return err;
}

// ─── Build report data ────────────────────────────────────────────────────────

async function buildReportData(sessionId: string, organizationId: string): Promise<ReportData> {
  const session = await prisma.interviewSession.findFirst({
    where: { id: sessionId, organizationId },
    include: {
      candidate: true,
      interviewer: { select: { id: true, name: true, email: true } },
      sessionQuestions: {
        orderBy: { order: "asc" },
        include: {
          question: { select: { id: true, title: true, category: true, difficulty: true } },
          answer: { include: { assessment: true } },
        },
      },
    },
  });

  if (!session) throw notFound();

  const answeredItems = session.sessionQuestions.filter((sq) => sq.answer?.content);
  const scoredItems = answeredItems.filter((sq) => sq.answer?.assessment);

  const byCategory: Record<string, { scores: number[]; avg?: number }> = {};
  for (const sq of scoredItems) {
    const cat = sq.question.category;
    if (!byCategory[cat]) byCategory[cat] = { scores: [] };
    byCategory[cat].scores.push(sq.answer!.assessment!.score);
  }
  for (const cat of Object.keys(byCategory)) {
    const sc = byCategory[cat].scores;
    byCategory[cat].avg = Math.round((sc.reduce((a, b) => a + b, 0) / sc.length) * 10) / 10;
  }

  const allScores = scoredItems.map((sq) => sq.answer!.assessment!.score);
  const overallAvg =
    allScores.length > 0
      ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10
      : null;

  return {
    session: {
      id: session.id,
      title: session.title,
      status: session.status,
      scheduledAt: session.scheduledAt?.toISOString() ?? null,
      startedAt: session.startedAt?.toISOString() ?? null,
      completedAt: session.completedAt?.toISOString() ?? null,
      notes: session.notes,
    },
    candidate: {
      firstName: session.candidate.firstName,
      lastName: session.candidate.lastName,
      email: session.candidate.email,
      phone: session.candidate.phone,
      linkedinUrl: session.candidate.linkedinUrl,
    },
    interviewer: {
      name: session.interviewer.name ?? session.interviewer.email,
      email: session.interviewer.email,
    },
    summary: {
      totalQuestions: session.sessionQuestions.length,
      answeredCount: answeredItems.length,
      assessedCount: scoredItems.length,
      overallAvg,
      flaggedCount: answeredItems.filter((sq) => sq.answer?.flagged).length,
      byCategory,
    },
    items: answeredItems.map((sq) => ({
      title: sq.question.title,
      category: sq.question.category,
      difficulty: sq.question.difficulty,
      content: sq.answer!.content,
      flagged: sq.answer!.flagged,
      score: sq.answer!.assessment?.score ?? null,
      notes: sq.answer!.assessment?.notes ?? null,
    })),
    aiSummary: session.aiSummary as any,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Generate PDF buffer ──────────────────────────────────────────────────────

export async function generateReportPDF(sessionId: string, organizationId: string): Promise<Buffer> {
  const data = await buildReportData(sessionId, organizationId);
  const html = buildReportHTML(data);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

// ─── Get report data (for web preview) ───────────────────────────────────────

export async function getReportData(sessionId: string, organizationId: string) {
  return buildReportData(sessionId, organizationId);
}

// ─── Email report ─────────────────────────────────────────────────────────────

export async function emailReport(
  sessionId: string,
  organizationId: string,
  recipients: string[]
) {
  const resend = getResend(); // throws if key not set
  const data = await buildReportData(sessionId, organizationId);
  const pdf = await generateReportPDF(sessionId, organizationId);
  const candidateName = `${data.candidate.firstName} ${data.candidate.lastName}`;
  const filename = `interview-report-${candidateName.toLowerCase().replace(/\s+/g, "-")}-${sessionId.slice(-6)}.pdf`;

  await resend.emails.send({
    from: `Interview Platform <${env.FROM_EMAIL ?? "onboarding@resend.dev"}>`,
    to: env.EMAIL_OVERRIDE_TO ? [env.EMAIL_OVERRIDE_TO] : recipients,
    subject: `Interview Report: ${candidateName} — ${data.session.title}`,
    html: `
      <p>Hi,</p>
      <p>Please find attached the interview report for <strong>${candidateName}</strong> (${data.session.title}).</p>
      ${data.summary.overallAvg !== null ? `<p>Overall score: <strong>${data.summary.overallAvg}/5</strong></p>` : ""}
      <p>This report was generated by Interview Platform.</p>
    `,
    attachments: [{ filename, content: pdf.toString("base64") }],
  });

  return { sent: true, recipients };
}
