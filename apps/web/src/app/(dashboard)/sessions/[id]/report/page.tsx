"use client";

import { useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useReport, useDownloadPDF, useEmailReport } from "@/hooks/use-reports";
import { useActiveOrg } from "@/hooks/use-organization";
import { toast } from "sonner";
import {
  Loader2, ChevronLeft, Download, Mail, Flag, Star,
  User, Calendar, Clock, BarChart2, Sparkles, ThumbsUp, ThumbsDown, Lightbulb, X, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const SCORE_COLOR = (s: number) =>
  s >= 4 ? "text-green-600" : s >= 3 ? "text-amber-600" : "text-red-600";

const SCORE_BG = (s: number) =>
  s >= 4 ? "bg-green-50 border-green-200" : s >= 3 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";

const DIFF_COLOR: Record<string, string> = {
  EASY: "bg-green-100 text-green-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  HARD: "bg-red-100 text-red-700",
};

const REC_DISPLAY: Record<string, { label: string; cls: string }> = {
  strong_hire: { label: "Strong Hire", cls: "bg-green-100 text-green-700 border-green-300" },
  hire: { label: "Hire", cls: "bg-blue-100 text-blue-700 border-blue-300" },
  no_hire: { label: "No Hire", cls: "bg-amber-100 text-amber-700 border-amber-300" },
  strong_no_hire: { label: "Strong No Hire", cls: "bg-red-100 text-red-700 border-red-300" },
};

function ScoreBar({ score, max = 5 }: { score: number; max?: number }) {
  const pct = (score / max) * 100;
  const col = score >= 4 ? "bg-green-500" : score >= 3 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", col)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("text-sm font-bold tabular-nums w-10 text-right", SCORE_COLOR(score))}>
        {score}/5
      </span>
    </div>
  );
}

// ─── Email Modal ──────────────────────────────────────────────────────────────

function EmailModal({
  sessionId,
  orgId,
  onClose,
}: {
  sessionId: string;
  orgId: string;
  onClose: () => void;
}) {
  const [emails, setEmails] = useState<string[]>([""]);
  const { mutateAsync: emailReport, isPending } = useEmailReport(orgId);

  const send = async () => {
    const valid = emails.filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (valid.length === 0) { toast.error("Enter at least one valid email"); return; }
    try {
      await emailReport({ sessionId, recipients: valid });
      toast.success(`Report sent to ${valid.length} recipient${valid.length > 1 ? "s" : ""}`);
      onClose();
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold">Email Report</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-muted-foreground">Recipients will receive the PDF report as an email attachment.</p>
          {emails.map((e, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="email"
                value={e}
                onChange={(ev) => setEmails((prev) => prev.map((x, j) => j === i ? ev.target.value : x))}
                placeholder="email@company.com"
                className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
              />
              {emails.length > 1 && (
                <button onClick={() => setEmails((prev) => prev.filter((_, j) => j !== i))} className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          {emails.length < 10 && (
            <button onClick={() => setEmails((p) => [...p, ""])} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
              <Plus className="w-4 h-4" /> Add recipient
            </button>
          )}
        </div>
        <div className="p-5 border-t border-border flex gap-3">
          <button onClick={send} disabled={isPending} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Send report
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground border border-border hover:bg-accent transition">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const { activeOrgId } = useActiveOrg();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromReports = searchParams.get("from") === "reports";
  const [showEmail, setShowEmail] = useState(false);

  const { data, isLoading } = useReport(activeOrgId, id);
  const { mutate: downloadPDF, isPending: downloading } = useDownloadPDF(activeOrgId!);

  const report = data?.data;

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!report) return <div className="text-center py-16 text-muted-foreground">Report not found.</div>;

  const { session, candidate, interviewer, summary, items, aiSummary } = report;
  const rec = aiSummary?.recommendation ? REC_DISPLAY[aiSummary.recommendation] : null;

  return (
    <div className="max-w-4xl mx-auto">
      {showEmail && <EmailModal sessionId={id} orgId={activeOrgId!} onClose={() => setShowEmail(false)} />}

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <button onClick={() => router.push(fromReports ? "/reports" : "/sessions")} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-full px-3 py-1.5 mb-3 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" /> {fromReports ? "All Reports" : "All Interviews"}
          </button>
          <h1 className="text-xl font-bold text-foreground">{session.title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {candidate.firstName} {candidate.lastName} · {candidate.email}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setShowEmail(true)} className="flex items-center gap-2 border border-border px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent transition">
            <Mail className="w-4 h-4" /> Email
          </button>
          <button
            onClick={() => downloadPDF(id, { onError: (e: any) => toast.error(e.message) })}
            disabled={downloading}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download PDF
          </button>
        </div>
      </div>

      {/* Candidate + session info */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Candidate</span>
          </div>
          <p className="font-semibold text-foreground">{candidate.firstName} {candidate.lastName}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{candidate.email}</p>
          {candidate.phone && <p className="text-sm text-muted-foreground">{candidate.phone}</p>}
          {candidate.linkedinUrl && (
            <a href={candidate.linkedinUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline mt-1 block">LinkedIn</a>
          )}
        </div>
        <div className="bg-white border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Session Details</span>
          </div>
          <p className="text-sm text-foreground"><span className="text-muted-foreground">Interviewer:</span> {interviewer.name}</p>
          {session.scheduledAt && <p className="text-sm text-muted-foreground mt-1"><Clock className="w-3 h-3 inline mr-1" />{format(new Date(session.scheduledAt), "MMM d, yyyy 'at' h:mm a")}</p>}
          {session.completedAt && <p className="text-sm text-muted-foreground mt-1">Completed {format(new Date(session.completedAt), "MMM d, yyyy")}</p>}
        </div>
      </div>

      {/* Score summary */}
      <div className="bg-white border border-border rounded-xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Star className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Score Summary</h2>
        </div>
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            ["Total", summary.totalQuestions],
            ["Answered", summary.answeredCount],
            ["Scored", summary.assessedCount],
            ["Flagged", summary.flaggedCount],
          ].map(([label, val]) => (
            <div key={label as string} className="text-center bg-muted/40 rounded-lg py-3">
              <div className="text-2xl font-bold text-foreground">{val}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
            </div>
          ))}
        </div>
        {summary.overallAvg !== null && (
          <div className={cn("flex items-center justify-between p-4 rounded-xl border mb-4", SCORE_BG(summary.overallAvg))}>
            <span className="font-semibold text-foreground">Overall Average</span>
            <span className={cn("text-2xl font-bold tabular-nums", SCORE_COLOR(summary.overallAvg))}>{summary.overallAvg}/5</span>
          </div>
        )}
        {Object.keys(summary.byCategory).length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">By category</span>
            </div>
            {Object.entries(summary.byCategory).map(([cat, val]: [string, any]) => (
              <div key={cat}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">{cat}</span>
                  <span className="text-muted-foreground text-xs">{val.scores.length} question{val.scores.length !== 1 ? "s" : ""}</span>
                </div>
                <ScoreBar score={val.avg ?? 0} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI Summary */}
      {aiSummary?.status === "completed" && (
        <div className="bg-white border border-border rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground">AI Analysis</h2>
          </div>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            {rec && (
              <span className={cn("font-semibold px-3 py-1 rounded-full border text-sm", rec.cls)}>
                {rec.label}
              </span>
            )}
            {aiSummary.overallScore && <span className="text-sm text-muted-foreground font-medium">AI Score: {aiSummary.overallScore}/5</span>}
          </div>
          {aiSummary.recommendationReason && <p className="text-sm text-foreground mb-4 leading-relaxed">{aiSummary.recommendationReason}</p>}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {aiSummary.strengths?.length > 0 && (
              <div className="bg-green-50 rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <ThumbsUp className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-xs font-bold text-green-700 uppercase tracking-wide">Strengths</span>
                </div>
                <ul className="space-y-1">
                  {aiSummary.strengths.map((s: string, i: number) => (
                    <li key={i} className="text-sm text-foreground flex gap-2"><span className="text-green-500 shrink-0">•</span>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {aiSummary.concerns?.length > 0 && (
              <div className="bg-red-50 rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <ThumbsDown className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-xs font-bold text-red-600 uppercase tracking-wide">Concerns</span>
                </div>
                <ul className="space-y-1">
                  {aiSummary.concerns.map((c: string, i: number) => (
                    <li key={i} className="text-sm text-foreground flex gap-2"><span className="text-red-400 shrink-0">•</span>{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {aiSummary.keyInsights?.length > 0 && (
            <div className="bg-amber-50 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-bold text-amber-600 uppercase tracking-wide">Key Insights</span>
              </div>
              <ul className="space-y-1">
                {aiSummary.keyInsights.map((k: string, i: number) => (
                  <li key={i} className="text-sm text-foreground flex gap-2"><span className="text-amber-400 shrink-0">•</span>{k}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Interviewer notes */}
      {session.notes && (
        <div className="bg-white border border-border rounded-xl p-5 mb-6">
          <h2 className="font-semibold text-foreground mb-3">Interviewer Notes</h2>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{session.notes}</p>
        </div>
      )}

      {/* Q&A Detail */}
      <div>
        <h2 className="font-semibold text-foreground mb-4">Question & Answer Detail</h2>
        {items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
            No answers recorded
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item: any, i: number) => (
              <div key={i} className="bg-white border border-border rounded-xl overflow-hidden">
                <div className="bg-muted/30 px-5 py-3 border-b border-border flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{item.category}</span>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", DIFF_COLOR[item.difficulty])}>{item.difficulty}</span>
                      {item.flagged && (
                        <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                          <Flag className="w-3 h-3" /> Flagged
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-foreground text-sm">Q{i + 1}. {item.title}</p>
                  </div>
                  {item.score !== null && (
                    <div className="shrink-0 w-32">
                      <ScoreBar score={item.score} />
                    </div>
                  )}
                </div>
                <div className="px-5 py-4">
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{item.content}</p>
                  {item.notes && (
                    <div className="mt-3 p-3 bg-green-50 rounded-lg text-xs text-green-800">
                      <strong>Notes:</strong> {item.notes}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-border text-xs text-muted-foreground text-center">
        Interview Platform — Generated {format(new Date(report.generatedAt), "MMM d, yyyy 'at' h:mm a")}
      </div>
    </div>
  );
}
