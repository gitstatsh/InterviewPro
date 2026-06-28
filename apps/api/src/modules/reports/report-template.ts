export interface ReportData {
  session: {
    id: string;
    title: string;
    status: string;
    scheduledAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    notes: string | null;
  };
  candidate: { firstName: string; lastName: string; email: string; phone?: string | null; linkedinUrl?: string | null };
  interviewer: { name: string; email: string };
  summary: {
    totalQuestions: number;
    answeredCount: number;
    assessedCount: number;
    overallAvg: number | null;
    flaggedCount: number;
    byCategory: Record<string, { scores: number[]; avg?: number }>;
  };
  items: Array<{
    title: string;
    category: string;
    difficulty: string;
    content: string;
    flagged: boolean;
    score: number | null;
    notes: string | null;
  }>;
  aiSummary: {
    status: string;
    recommendation?: string;
    recommendationReason?: string;
    strengths?: string[];
    concerns?: string[];
    keyInsights?: string[];
    overallScore?: number;
  } | null;
  generatedAt: string;
}

const DIFF_COLOR: Record<string, string> = {
  EASY: "#16a34a",
  MEDIUM: "#d97706",
  HARD: "#dc2626",
};

const SCORE_COLOR = (s: number) =>
  s >= 4 ? "#16a34a" : s >= 3 ? "#d97706" : "#dc2626";

const REC_LABEL: Record<string, { label: string; color: string }> = {
  strong_hire: { label: "Strong Hire", color: "#16a34a" },
  hire: { label: "Hire", color: "#2563eb" },
  no_hire: { label: "No Hire", color: "#d97706" },
  strong_no_hire: { label: "Strong No Hire", color: "#dc2626" },
};

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildReportHTML(data: ReportData): string {
  const { session, candidate, interviewer, summary, items, aiSummary } = data;
  const rec = aiSummary?.recommendation ? REC_LABEL[aiSummary.recommendation] : null;

  const scoreBar = (score: number | null, max = 5) => {
    if (score === null) return `<span style="color:#9ca3af">Not scored</span>`;
    const pct = (score / max) * 100;
    const col = SCORE_COLOR(score);
    return `
      <div style="display:flex;align-items:center;gap:8px">
        <div style="flex:1;height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:${col};border-radius:3px"></div>
        </div>
        <span style="font-weight:600;color:${col};min-width:28px">${score}/5</span>
      </div>`;
  };

  const categoryRows = Object.entries(summary.byCategory)
    .map(([cat, val]) => {
      const avg = val.avg ?? 0;
      return `
        <tr>
          <td style="padding:8px 12px;font-size:13px;color:#374151">${cat}</td>
          <td style="padding:8px 12px">${scoreBar(avg)}</td>
          <td style="padding:8px 12px;font-size:13px;text-align:center;color:#6b7280">${val.scores.length}</td>
        </tr>`;
    })
    .join("");

  const qItems = items
    .map((item, i) => {
      const diffColor = DIFF_COLOR[item.difficulty] ?? "#6b7280";
      return `
        <div style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;page-break-inside:avoid">
          <div style="background:#f9fafb;padding:14px 18px;border-bottom:1px solid #e5e7eb">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
              <div style="flex:1">
                <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
                  <span style="font-size:11px;background:#e5e7eb;padding:2px 8px;border-radius:20px;color:#6b7280">${item.category}</span>
                  <span style="font-size:11px;padding:2px 8px;border-radius:20px;color:${diffColor};background:${diffColor}18;font-weight:600">${item.difficulty}</span>
                  ${item.flagged ? `<span style="font-size:11px;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:20px">⚑ Flagged</span>` : ""}
                </div>
                <div style="font-size:14px;font-weight:600;color:#111827">Q${i + 1}. ${item.title}</div>
              </div>
              <div style="min-width:120px">
                ${item.score !== null ? scoreBar(item.score) : `<span style="font-size:12px;color:#9ca3af">Not scored</span>`}
              </div>
            </div>
          </div>
          <div style="padding:14px 18px">
            <div style="font-size:12px;font-weight:600;color:#6b7280;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">Answer</div>
            <div style="font-size:13px;color:#374151;white-space:pre-wrap;line-height:1.6">${item.content || "<em style='color:#9ca3af'>No answer recorded</em>"}</div>
            ${item.notes ? `<div style="margin-top:10px;padding:10px;background:#f0fdf4;border-radius:8px;font-size:12px;color:#15803d"><strong>Scoring notes:</strong> ${item.notes}</div>` : ""}
          </div>
        </div>`;
    })
    .join("");

  const aiSection = aiSummary?.status === "completed"
    ? `
      <div style="margin-bottom:32px">
        <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 16px">AI Analysis</h2>
        ${rec ? `
          <div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:12px">
            <span style="font-size:15px;font-weight:700;color:${rec.color};border:2px solid ${rec.color};padding:4px 14px;border-radius:20px">${rec.label}</span>
            ${aiSummary.overallScore ? `<span style="font-size:14px;color:#6b7280;font-weight:600">Score: ${aiSummary.overallScore}/5</span>` : ""}
          </div>` : ""}
        ${aiSummary.recommendationReason ? `<p style="font-size:14px;color:#374151;margin:0 0 16px;line-height:1.6">${aiSummary.recommendationReason}</p>` : ""}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
          ${aiSummary.strengths?.length ? `
            <div style="background:#f0fdf4;border-radius:10px;padding:14px">
              <div style="font-size:12px;font-weight:700;color:#15803d;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em">Strengths</div>
              ${aiSummary.strengths.map((s) => `<div style="font-size:13px;color:#374151;margin-bottom:4px">• ${s}</div>`).join("")}
            </div>` : ""}
          ${aiSummary.concerns?.length ? `
            <div style="background:#fef2f2;border-radius:10px;padding:14px">
              <div style="font-size:12px;font-weight:700;color:#dc2626;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em">Concerns</div>
              ${aiSummary.concerns.map((c) => `<div style="font-size:13px;color:#374151;margin-bottom:4px">• ${c}</div>`).join("")}
            </div>` : ""}
        </div>
        ${aiSummary.keyInsights?.length ? `
          <div style="background:#fffbeb;border-radius:10px;padding:14px">
            <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em">Key Insights</div>
            ${aiSummary.keyInsights.map((k) => `<div style="font-size:13px;color:#374151;margin-bottom:4px">• ${k}</div>`).join("")}
          </div>` : ""}
      </div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Interview Report — ${candidate.firstName} ${candidate.lastName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; background: #fff; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body style="padding:40px;max-width:900px;margin:0 auto">

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:24px;border-bottom:2px solid #e5e7eb">
    <div>
      <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px">Interview Report</div>
      <h1 style="font-size:24px;font-weight:700;color:#111827;margin-bottom:4px">${session.title}</h1>
      <div style="font-size:14px;color:#6b7280">Generated ${fmt(data.generatedAt)}</div>
    </div>
    ${summary.overallAvg !== null
      ? `<div style="text-align:center;background:#f9fafb;border:2px solid #e5e7eb;border-radius:12px;padding:14px 24px">
          <div style="font-size:32px;font-weight:700;color:${SCORE_COLOR(summary.overallAvg)}">${summary.overallAvg}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px">Overall Score</div>
        </div>`
      : ""}
  </div>

  <!-- Candidate + Session info -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px">
    <div style="background:#f9fafb;border-radius:10px;padding:18px">
      <div style="font-size:12px;font-weight:700;color:#6b7280;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em">Candidate</div>
      <div style="font-size:16px;font-weight:600;color:#111827;margin-bottom:4px">${candidate.firstName} ${candidate.lastName}</div>
      <div style="font-size:13px;color:#6b7280;margin-bottom:2px">${candidate.email}</div>
      ${candidate.phone ? `<div style="font-size:13px;color:#6b7280">${candidate.phone}</div>` : ""}
      ${candidate.linkedinUrl ? `<div style="font-size:12px;margin-top:6px"><a href="${candidate.linkedinUrl}" style="color:#2563eb">LinkedIn Profile</a></div>` : ""}
    </div>
    <div style="background:#f9fafb;border-radius:10px;padding:18px">
      <div style="font-size:12px;font-weight:700;color:#6b7280;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em">Session Details</div>
      <div style="font-size:13px;color:#374151;margin-bottom:4px"><strong>Interviewer:</strong> ${interviewer.name}</div>
      ${session.scheduledAt ? `<div style="font-size:13px;color:#374151;margin-bottom:4px"><strong>Scheduled:</strong> ${fmt(session.scheduledAt)}</div>` : ""}
      ${session.startedAt ? `<div style="font-size:13px;color:#374151;margin-bottom:4px"><strong>Started:</strong> ${fmt(session.startedAt)}</div>` : ""}
      ${session.completedAt ? `<div style="font-size:13px;color:#374151;margin-bottom:4px"><strong>Completed:</strong> ${fmt(session.completedAt)}</div>` : ""}
    </div>
  </div>

  <!-- Score Summary -->
  <div style="margin-bottom:32px">
    <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 16px">Score Summary</h2>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
      ${[
        ["Questions", summary.totalQuestions],
        ["Answered", summary.answeredCount],
        ["Scored", summary.assessedCount],
        ["Flagged", summary.flaggedCount],
      ]
        .map(
          ([label, val]) => `
          <div style="background:#f9fafb;border-radius:10px;padding:14px;text-align:center">
            <div style="font-size:24px;font-weight:700;color:#111827">${val}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;text-transform:uppercase;letter-spacing:0.05em">${label}</div>
          </div>`
        )
        .join("")}
    </div>

    ${Object.keys(summary.byCategory).length
      ? `<table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
          <thead>
            <tr style="background:#f3f4f6">
              <th style="padding:10px 12px;font-size:12px;text-align:left;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Category</th>
              <th style="padding:10px 12px;font-size:12px;text-align:left;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Average Score</th>
              <th style="padding:10px 12px;font-size:12px;text-align:center;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Questions</th>
            </tr>
          </thead>
          <tbody>
            ${categoryRows}
          </tbody>
        </table>`
      : ""}
  </div>

  <!-- AI Analysis -->
  ${aiSection}

  <!-- Interviewer Notes -->
  ${session.notes
    ? `<div style="margin-bottom:32px">
        <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 12px">Interviewer Notes</h2>
        <div style="background:#f9fafb;border-radius:10px;padding:16px;font-size:14px;color:#374151;line-height:1.7;white-space:pre-wrap">${session.notes}</div>
      </div>`
    : ""}

  <!-- Q&A Detail -->
  <div>
    <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 16px">Question &amp; Answer Detail</h2>
    ${qItems || `<p style="color:#9ca3af;font-size:14px">No answers recorded.</p>`}
  </div>

  <!-- Footer -->
  <div style="margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:11px;color:#9ca3af">
    <span>Interview Platform — Confidential</span>
    <span>${candidate.firstName} ${candidate.lastName} — ${session.title}</span>
  </div>

</body>
</html>`;
}
