"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSessionAssessment, useBulkAssess } from "@/hooks/use-assessments";
import { useAISummary, useGenerateSummary } from "@/hooks/use-summary";
import { useActiveOrg } from "@/hooks/use-organization";
import { useMyRole, isOrgHR } from "@/hooks/use-organizations";
import { SCORE_LABELS } from "@interview/shared";
import { toast } from "sonner";
import {
  Loader2, ChevronLeft, Star, AlertCircle, CheckCircle2,
  Flag, TrendingUp, BarChart2, Save, Sparkles, ThumbsUp, ThumbsDown, Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// ─── AI Summary Panel ─────────────────────────────────────────────────────────

const RECOMMENDATION_DISPLAY: Record<string, { label: string; cls: string }> = {
  strong_hire: { label: "Strong Hire", cls: "bg-green-100 text-green-700 border-green-200" },
  hire: { label: "Hire", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  no_hire: { label: "No Hire", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  strong_no_hire: { label: "Strong No Hire", cls: "bg-red-100 text-red-700 border-red-200" },
};

function AISummaryPanel({
  sessionId,
  orgId,
  summary,
  generating,
  onGenerate,
}: {
  sessionId: string;
  orgId: string;
  summary: any | null;
  generating: boolean;
  onGenerate: () => void;
}) {
  const status = summary?.status;

  return (
    <div className="bg-white border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">AI Summary</h3>
        </div>
        {(!status || status === "error") && (
          <button
            onClick={onGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition"
          >
            {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {generating ? "Queuing…" : "Generate"}
          </button>
        )}
      </div>

      {!status && (
        <p className="text-sm text-muted-foreground">
          Generate an AI-powered summary with strengths, concerns, and a hiring recommendation.
        </p>
      )}

      {status === "pending" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Analyzing transcript… this takes about 15 seconds.
        </div>
      )}

      {status === "error" && (
        <p className="text-sm text-destructive">{summary.error ?? "Generation failed — try again."}</p>
      )}

      {status === "completed" && (
        <div className="space-y-4">
          {/* Recommendation */}
          {summary.recommendation && (
            <div className="flex items-center gap-2">
              <span className={cn("text-sm font-semibold px-3 py-1 rounded-full border", RECOMMENDATION_DISPLAY[summary.recommendation]?.cls ?? "")}>
                {RECOMMENDATION_DISPLAY[summary.recommendation]?.label ?? summary.recommendation}
              </span>
              <span className="text-sm text-muted-foreground font-medium">Score: {summary.overallScore}/5</span>
            </div>
          )}

          {summary.recommendationReason && (
            <p className="text-sm text-foreground">{summary.recommendationReason}</p>
          )}

          {/* Strengths */}
          {summary.strengths?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <ThumbsUp className="w-3.5 h-3.5 text-green-600" />
                <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Strengths</span>
              </div>
              <ul className="space-y-1">
                {summary.strengths.map((s: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="text-green-500 mt-0.5 shrink-0">•</span>{s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Concerns */}
          {summary.concerns?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <ThumbsDown className="w-3.5 h-3.5 text-red-500" />
                <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">Concerns</span>
              </div>
              <ul className="space-y-1">
                {summary.concerns.map((c: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="text-red-400 mt-0.5 shrink-0">•</span>{c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Key insights */}
          {summary.keyInsights?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Key Insights</span>
              </div>
              <ul className="space-y-1">
                {summary.keyInsights.map((k: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="text-amber-400 mt-0.5 shrink-0">•</span>{k}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Generated {summary.generatedAt ? format(new Date(summary.generatedAt), "MMM d, yyyy 'at' h:mm a") : ""}
            {" · "}
            <button onClick={onGenerate} disabled={generating} className="underline hover:no-underline disabled:opacity-50">Regenerate</button>
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Score Picker ─────────────────────────────────────────────────────────────

function ScorePicker({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          title={SCORE_LABELS[n]}
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold transition border",
            value === n
              ? n <= 2
                ? "bg-red-500 border-red-500 text-white"
                : n === 3
                ? "bg-amber-500 border-amber-500 text-white"
                : "bg-green-500 border-green-500 text-white"
              : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// ─── Score Bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score, max = 5 }: { score: number; max?: number }) {
  const pct = (score / max) * 100;
  const color = score < 2.5 ? "bg-red-500" : score < 3.5 ? "bg-amber-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold tabular-nums w-8 text-right">{score}</span>
    </div>
  );
}

// ─── Recommendation Badge ─────────────────────────────────────────────────────

function Recommendation({ avg }: { avg: number | null }) {
  if (avg === null) return null;
  const { label, cls } =
    avg >= 4
      ? { label: "Strong Hire", cls: "bg-green-100 text-green-700 border-green-200" }
      : avg >= 3
      ? { label: "Hire", cls: "bg-blue-100 text-blue-700 border-blue-200" }
      : avg >= 2
      ? { label: "No Hire", cls: "bg-amber-100 text-amber-700 border-amber-200" }
      : { label: "Strong No Hire", cls: "bg-red-100 text-red-700 border-red-200" };

  return (
    <span className={cn("text-sm font-semibold px-3 py-1 rounded-full border", cls)}>
      {label}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AssessPage() {
  const _params = useParams<{ id: string }>();
  const id = _params?.id ?? "";
  const { activeOrgId } = useActiveOrg();
  const router = useRouter();

  const myRole = useMyRole(activeOrgId);

  useEffect(() => {
    if (myRole !== null && isOrgHR(myRole)) {
      router.replace(`/sessions/${id}/report`);
    }
  }, [myRole, id, router]);

  const { data, isLoading } = useSessionAssessment(activeOrgId, id);
  const { mutateAsync: bulkAssess, isPending: saving } = useBulkAssess(activeOrgId!, id);
  const { data: summaryData } = useAISummary(activeOrgId, id);
  const { mutateAsync: generateSummary, isPending: generating } = useGenerateSummary(activeOrgId!);

  // Local state: scores[answerId] = number, notes[answerId] = string
  const [scores, setScores] = useState<Record<string, number>>({});
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});

  const assessment = data?.data;

  // Pre-populate from existing assessments
  useEffect(() => {
    if (!assessment) return;
    const initScores: Record<string, number> = {};
    const initNotes: Record<string, string> = {};
    for (const item of assessment.items) {
      initScores[item.answerId] = item.score;
      initNotes[item.answerId] = item.notes ?? "";
    }
    setScores(initScores);
    setNoteMap(initNotes);
  }, [assessment?.session?.id]);

  const handleSave = async () => {
    const assessments = assessment?.items
      .map((item: any) => ({
        answerId: item.answerId,
        score: scores[item.answerId],
        notes: noteMap[item.answerId] || undefined,
      }))
      .filter((a: any) => a.score !== undefined);

    if (!assessments || assessments.length === 0) {
      toast.error("Score at least one question before saving");
      return;
    }

    try {
      await bulkAssess({ assessments });
      toast.success("Assessments saved");
    } catch (err: any) { toast.error(err.message); }
  };

  // Compute live overall avg from local state
  const liveScoreValues = Object.values(scores).filter(Boolean);
  const liveAvg =
    liveScoreValues.length > 0
      ? Math.round((liveScoreValues.reduce((a, b) => a + b, 0) / liveScoreValues.length) * 10) / 10
      : null;

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!assessment) {
    return <div className="text-center py-16 text-muted-foreground">Assessment not found.</div>;
  }

  const { session, candidate, interviewer, summary } = assessment;
  // Rebuild items with local score state for category breakdown
  const liveByCategory: Record<string, number[]> = {};
  for (const item of assessment.items) {
    const s = scores[item.answerId];
    if (s) {
      if (!liveByCategory[item.category]) liveByCategory[item.category] = [];
      liveByCategory[item.category].push(s);
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <button onClick={() => router.push(`/sessions/${id}`)} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-full px-3 py-1.5 mb-3 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" /> Back to session
          </button>
          <h1 className="text-xl font-bold text-foreground">Score Assessment</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {candidate.firstName} {candidate.lastName} &mdash; {session.title}
          </p>
          {session.completedAt && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Completed {format(new Date(session.completedAt), "MMM d, yyyy 'at' h:mm a")}
            </p>
          )}
        </div>
        <button onClick={() => router.push(`/sessions/${id}/report`)} className="flex items-center gap-2 border border-border px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-accent transition">
          View Report
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save scores
        </button>
      </div>

      <div className="grid grid-cols-[1fr_260px] gap-6">
        {/* Left: question scoring */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Score each answer (1–5)</h2>

          {assessment.items.length === 0 ? (
            <div className="bg-white border border-dashed border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
              No answered questions to assess.
            </div>
          ) : (
            assessment.items.map((item: any) => (
              <div key={item.answerId} className="bg-white border border-border rounded-xl p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{item.category}</span>
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{item.difficulty}</span>
                      {item.flagged && (
                        <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                          <Flag className="w-3 h-3" /> Flagged
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-foreground text-sm">{item.title}</p>
                  </div>
                  <div className="shrink-0">
                    <ScorePicker
                      value={scores[item.answerId] ?? null}
                      onChange={(n) => setScores((prev) => ({ ...prev, [item.answerId]: n }))}
                    />
                  </div>
                </div>

                {/* Candidate's answer */}
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Candidate's answer</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{item.content}</p>
                </div>

                {/* Score label + notes */}
                {scores[item.answerId] && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{SCORE_LABELS[scores[item.answerId]]}</span>
                  </div>
                )}

                <textarea
                  value={noteMap[item.answerId] ?? ""}
                  onChange={(e) => setNoteMap((prev) => ({ ...prev, [item.answerId]: e.target.value }))}
                  rows={2}
                  placeholder="Scoring notes (optional)…"
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none transition"
                />
              </div>
            ))
          )}

          {/* Unanswered questions */}
          {assessment.unanswered.length > 0 && (
            <div className="bg-white border border-dashed border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Unanswered questions ({assessment.unanswered.length})
              </p>
              <div className="space-y-1">
                {assessment.unanswered.map((q: any) => (
                  <div key={q.questionId} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    {q.title}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: live summary sidebar */}
        <div className="space-y-4">
          {/* Overall score */}
          <div className="bg-white border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Overall score</h3>
            </div>
            {liveAvg !== null ? (
              <>
                <div className="text-3xl font-bold text-foreground tabular-nums mb-2">
                  {liveAvg}<span className="text-lg text-muted-foreground font-normal">/5</span>
                </div>
                <ScoreBar score={liveAvg} />
                <div className="mt-3">
                  <Recommendation avg={liveAvg} />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Score questions to see average</p>
            )}
          </div>

          {/* Progress */}
          <div className="bg-white border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Progress</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total questions</span>
                <span className="font-medium">{summary.totalQuestions}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Answered</span>
                <span className="font-medium">{summary.answeredCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Scored</span>
                <span className="font-medium">{liveScoreValues.length}</span>
              </div>
              {summary.flaggedCount > 0 && (
                <div className="flex justify-between text-amber-600">
                  <span>Flagged</span>
                  <span className="font-medium">{summary.flaggedCount}</span>
                </div>
              )}
            </div>
          </div>

          {/* By category */}
          {Object.keys(liveByCategory).length > 0 && (
            <div className="bg-white border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart2 className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">By category</h3>
              </div>
              <div className="space-y-3">
                {Object.entries(liveByCategory).map(([cat, catScores]) => {
                  const avg = Math.round((catScores.reduce((a, b) => a + b, 0) / catScores.length) * 10) / 10;
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground truncate pr-2">{cat}</span>
                        <span className="font-medium shrink-0">{avg}/5</span>
                      </div>
                      <ScoreBar score={avg} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Interviewer notes preview */}
          {session.notes && (
            <div className="bg-white border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Interviewer notes</h3>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{session.notes}</p>
            </div>
          )}

          {/* AI Summary */}
          <AISummaryPanel
            sessionId={id}
            orgId={activeOrgId!}
            summary={summaryData?.data?.summary ?? null}
            generating={generating}
            onGenerate={() => generateSummary(id).catch((e) => toast.error(e.message))}
          />
        </div>
      </div>
    </div>
  );
}
