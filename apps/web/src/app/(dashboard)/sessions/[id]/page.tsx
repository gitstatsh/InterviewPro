"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession, useSessionLifecycle, useUpsertAnswer, useUpdateNotes, useAssignBank } from "@/hooks/use-sessions";
import { useUpsertAssessment } from "@/hooks/use-assessments";
import { useActiveOrg } from "@/hooks/use-organization";
import { useMyRole, canManageContent, canStartSession, canCompleteSession, isOrgHR } from "@/hooks/use-organizations";
import { useQuestionBanks } from "@/hooks/use-question-banks";
import { toast } from "sonner";
import {
  Loader2, ChevronLeft, ChevronRight, Flag, CheckCheck, Ban, RotateCcw,
  Clock, User, Calendar, FileText, AlertCircle, CheckCircle2, Circle, ClipboardCheck,
  Star, BookOpen, PlayCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const STATUS_STYLES: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

// ─── Timer ────────────────────────────────────────────────────────────────────

function QuestionTimer({ limit, startedAt }: { limit: number | null; startedAt: Date | null }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  if (!limit) return null;

  const remaining = Math.max(0, limit - elapsed);
  const pct = Math.min(100, (elapsed / limit) * 100);
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const isOver = remaining === 0;
  const isNear = remaining < limit * 0.2 && !isOver;

  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", isOver ? "bg-destructive" : isNear ? "bg-amber-500" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn("text-xs font-mono font-medium", isOver ? "text-destructive" : isNear ? "text-amber-600" : "text-muted-foreground")}>
        {isOver ? "Time's up" : `${mins}:${secs.toString().padStart(2, "0")}`}
      </span>
    </div>
  );
}

// ─── Quick Rating ─────────────────────────────────────────────────────────────

const RATING_CONFIG = [
  { score: 1, label: "Poor",      emoji: "😞", color: "bg-red-100 text-red-600 border-red-200 hover:bg-red-200",         active: "bg-red-500 text-white border-red-500 scale-110 shadow-md shadow-red-200" },
  { score: 2, label: "Weak",      emoji: "😕", color: "bg-orange-100 text-orange-600 border-orange-200 hover:bg-orange-200", active: "bg-orange-500 text-white border-orange-500 scale-110 shadow-md shadow-orange-200" },
  { score: 3, label: "Average",   emoji: "😐", color: "bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-200", active: "bg-yellow-500 text-white border-yellow-500 scale-110 shadow-md shadow-yellow-200" },
  { score: 4, label: "Good",      emoji: "🙂", color: "bg-lime-100 text-lime-700 border-lime-200 hover:bg-lime-200",      active: "bg-lime-500 text-white border-lime-500 scale-110 shadow-md shadow-lime-200" },
  { score: 5, label: "Excellent", emoji: "🌟", color: "bg-green-100 text-green-700 border-green-200 hover:bg-green-200", active: "bg-green-500 text-white border-green-500 scale-110 shadow-md shadow-green-200" },
];

function QuickRating({
  initialScore,
  forceScore,
  orgId,
  onRate,
  disabled = false,
}: {
  initialScore: number | null;
  forceScore?: number | null;
  orgId: string;
  onRate: (score: number) => Promise<void>;
  disabled?: boolean;
}) {
  const [localScore, setLocalScore] = useState<number | null>(initialScore);
  const score = forceScore != null ? forceScore : localScore;
  const [hovered, setHovered] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  const handleRate = async (s: number) => {
    if (disabled) return;
    setLocalScore(s);
    setSaved(false);
    try {
      await onRate(s);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e: any) {
      toast.error("Failed to save rating");
    }
  };

  const display = hovered ?? score;

  return (
    <div className="pt-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Star className="w-3 h-3" /> Rate this answer
        </span>
        {saved && (
          <span className="text-xs text-green-600 font-medium flex items-center gap-1 animate-pulse">
            <CheckCircle2 className="w-3 h-3" /> Saved
          </span>
        )}
        {score && !saved && (
          <span className="text-xs text-muted-foreground">
            {RATING_CONFIG[score - 1].label}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        {RATING_CONFIG.map(({ score: s, label, emoji, color, active }) => (
          <button
            key={s}
            disabled={disabled}
            onClick={() => handleRate(s)}
            onMouseEnter={() => setHovered(s)}
            onMouseLeave={() => setHovered(null)}
            title={`${s} — ${label}`}
            className={cn(
              "flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed",
              display === s ? active : color
            )}
          >
            <span className={cn("text-base transition-transform duration-150", display === s ? "scale-125" : "scale-100")}>
              {emoji}
            </span>
            <span className="hidden sm:block">{s}</span>
          </button>
        ))}
      </div>
      {!score && !disabled && (
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Rate the candidate's answer after they've finished speaking
        </p>
      )}
    </div>
  );
}

// ─── Autosave Answer ──────────────────────────────────────────────────────────

function AnswerEditor({
  sessionId,
  sq,
  orgId,
  disabled,
  isActive,
  isHR,
}: {
  sessionId: string;
  sq: any;
  orgId: string;
  disabled: boolean;
  isActive: boolean;
  isHR: boolean;
}) {
  const NO_RESPONSE_TEXT = "No response from candidate";
  const [content, setContent] = useState(sq.answer?.content ?? "");
  const [notes, setNotes] = useState(sq.answer?.notes ?? "");
  const [flagged, setFlagged] = useState(sq.answer?.flagged ?? false);
  const [noResponse, setNoResponse] = useState(sq.answer?.content === NO_RESPONSE_TEXT);
  const [forcedRating, setForcedRating] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const answerIdRef = useRef<string | null>(sq.answer?.id ?? null);
  const notesRef = useRef(sq.answer?.notes ?? "");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { mutateAsync: upsert } = useUpsertAnswer(orgId);
  const { mutateAsync: upsertAssessment } = useUpsertAssessment(orgId);

  const save = useCallback(
    async (c: string, f: boolean, n?: string) => {
      if (disabled) return;
      setSaving(true);
      try {
        const res = await upsert({ sessionId, sqId: sq.id, data: { content: c, flagged: f, notes: n ?? notesRef.current } });
        if (res?.data?.id) answerIdRef.current = res.data.id;
      } finally {
        setSaving(false);
      }
    },
    [sessionId, sq.id, orgId, disabled]
  );

  const handleChange = (val: string) => {
    setContent(val);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(val, flagged), 1500);
  };

  const handleNotesChange = (val: string) => {
    setNotes(val);
    notesRef.current = val;
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => save(content, flagged, val), 1500);
  };

  const handleFlag = () => {
    const next = !flagged;
    setFlagged(next);
    save(content, next);
  };

  const handleNoResponse = async () => {
    if (noResponse) {
      setNoResponse(false);
      setForcedRating(null);
      setContent("");
      await save("", flagged);
      return;
    }
    setNoResponse(true);
    setContent(NO_RESPONSE_TEXT);
    setForcedRating(1);
    // save answer then auto-rate 1
    const res = await upsert({ sessionId, sqId: sq.id, data: { content: NO_RESPONSE_TEXT, flagged, notes: notesRef.current } });
    const aid = res?.data?.id ?? answerIdRef.current;
    if (aid) {
      answerIdRef.current = aid;
      await upsertAssessment({ answerId: aid, data: { score: 1 } });
    }
  };

  const handleRate = async (score: number) => {
    let aid = answerIdRef.current;
    if (!aid) {
      const res = await upsert({ sessionId, sqId: sq.id, data: { content: content || "", flagged } });
      aid = res?.data?.id ?? null;
      if (aid) answerIdRef.current = aid;
    }
    if (!aid) throw new Error("Could not create answer record");
    await upsertAssessment({ answerId: aid, data: { score } });
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <textarea
          value={content}
          onChange={(e) => { if (!noResponse) handleChange(e.target.value); }}
          disabled={disabled || noResponse}
          rows={6}
          placeholder={disabled ? "" : "Type the candidate's answer here — autosaves as you type…"}
          className={cn(
            "w-full px-3 py-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none transition",
            noResponse
              ? "bg-gray-50 border-gray-200 text-gray-400 italic cursor-not-allowed"
              : "border-input bg-background disabled:bg-muted disabled:cursor-not-allowed"
          )}
        />
        {saving && (
          <span className="absolute bottom-2 right-3 text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> saving…
          </span>
        )}
      </div>
      {!disabled && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleFlag}
            className={cn("flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition", flagged ? "bg-amber-50 border-amber-300 text-amber-700" : "border-border text-muted-foreground hover:text-foreground hover:bg-accent")}
          >
            <Flag className="w-3.5 h-3.5" />
            {flagged ? "Flagged for review" : "Flag for review"}
          </button>
          <button
            onClick={handleNoResponse}
            className={cn(
              "flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition",
              noResponse
                ? "bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200"
                : "border-border text-muted-foreground hover:bg-gray-50 hover:text-gray-700"
            )}
          >
            <Ban className="w-3.5 h-3.5" />
            {noResponse ? "Undo no response" : "No response from candidate"}
          </button>
        </div>
      )}

      {/* Rating — always visible for active sessions (not HR) */}
      {isActive && !isHR && (
        <div className="border-t border-border pt-4 mt-1">
          <QuickRating
            key={sq.id}
            initialScore={sq.answer?.assessment?.score ?? null}
            forceScore={forcedRating}
            orgId={orgId}
            onRate={handleRate}
          />
        </div>
      )}
      {/* Rating — readonly view for completed sessions (not HR) */}
      {!isActive && !isHR && sq.answer?.assessment?.score && (
        <div className="border-t border-border pt-4 mt-1">
          <QuickRating
            key={sq.id}
            initialScore={sq.answer.assessment.score}
            orgId={orgId}
            onRate={async () => {}}
            disabled
          />
        </div>
      )}

      {/* Per-question interviewer notes */}
      <div className="border-t border-border pt-4 mt-1">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Interviewer notes</span>
          {!disabled && <span className="text-xs text-muted-foreground ml-auto">Autosaves</span>}
        </div>
        <textarea
          value={notes}
          onChange={(e) => handleNotesChange(e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder={disabled ? "" : "Overall impressions, follow-up items, red flags…"}
          className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none transition disabled:bg-muted disabled:cursor-not-allowed"
        />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SessionDetailPage() {
  const _params = useParams<{ id: string }>();
  const id = _params?.id ?? "";
  const { activeOrgId } = useActiveOrg();
  const router = useRouter();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [notes, setNotes] = useState("");
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myRole = useMyRole(activeOrgId);
  const canAssignBank = canManageContent(myRole) && !isOrgHR(myRole);
  const isHR = isOrgHR(myRole);
  const canStart = canStartSession(myRole);
  const canComplete = canCompleteSession(myRole);

  const { data, isLoading } = useSession(activeOrgId, id);
  const { start, complete, cancel, reactivate } = useSessionLifecycle(activeOrgId!);
  const { mutate: saveNotes } = useUpdateNotes(activeOrgId!);
  const { mutateAsync: assignBank, isPending: assigning } = useAssignBank(activeOrgId!);
  const { data: banksData } = useQuestionBanks(activeOrgId, { limit: 100 });
  const [selectedBankId, setSelectedBankId] = useState("");

  const session = data?.data;

  useEffect(() => {
    if (session?.notes != null) setNotes(session.notes);
  }, [session?.id]);

  const handleNoteChange = (val: string) => {
    setNotes(val);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => {
      saveNotes({ id, notes: val });
    }, 1500);
  };

  const handleStart = async () => {
    if (!confirm("Start this session? This will move it to In Progress.")) return;
    try {
      await start.mutateAsync(id);
      toast.success("Session started");
    } catch (err: any) { toast.error(err.message); }
  };

  const handleAssignBank = async () => {
    if (!selectedBankId) { toast.error("Select a question bank first"); return; }
    try {
      await assignBank({ sessionId: id, data: { bankId: selectedBankId, replace: true } });
      toast.success("Question bank assigned");
      setSelectedBankId("");
    } catch (err: any) { toast.error(err.message); }
  };

  const handleComplete = async () => {
    if (!confirm("Mark this session as completed?")) return;
    try {
      await complete.mutateAsync(id);
      toast.success("Session completed");
    } catch (err: any) { toast.error(err.message); }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel this session? This cannot be undone.")) return;
    try {
      await cancel.mutateAsync(id);
      toast.success("Session cancelled");
      router.push("/sessions");
    } catch (err: any) { toast.error(err.message); }
  };

  const handleReactivate = async () => {
    if (!confirm("Reactivate this session? It will return to Scheduled status.")) return;
    try {
      await reactivate.mutateAsync(id);
      toast.success("Session reactivated");
    } catch (err: any) { toast.error(err.message); }
  };

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!session) {
    return <div className="text-center py-16 text-muted-foreground">Session not found.</div>;
  }

  const sqs: any[] = session.sessionQuestions ?? [];
  const currentSQ = sqs[currentIdx];
  const answeredCount = sqs.filter((sq: any) => sq.answer?.content).length;
  const isActive = session.status === "IN_PROGRESS";
  const isReadonly = !isActive;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <button onClick={() => router.push("/sessions")} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-full px-3 py-1.5 mb-3 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" /> All Interviews
          </button>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", STATUS_STYLES[session.status])}>
              {session.status.replace("_", " ")}
            </span>
          </div>
          <h1 className="text-xl font-bold text-foreground">{session.title}</h1>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{session.candidate.firstName} {session.candidate.lastName}</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-muted-foreground">{session.candidate.email}</span>
            {session.scheduledAt && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{format(new Date(session.scheduledAt), "MMM d, yyyy 'at' h:mm a")}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 text-sm">
            <span className="text-muted-foreground">Assigned to</span>
            <span className="font-medium text-foreground">{session.interviewer.name}</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-muted-foreground">{session.interviewer.email}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {session.status === "SCHEDULED" && canStart && sqs.length > 0 && (
            <button onClick={handleStart} disabled={start.isPending} className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition">
              {start.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />} Start session
            </button>
          )}
          {isActive && canComplete && (
            <>
              <button onClick={handleComplete} disabled={complete.isPending} className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition">
                {complete.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />} Complete
              </button>
              <button onClick={handleCancel} disabled={cancel.isPending} className="flex items-center gap-1.5 border border-border text-muted-foreground px-3 py-2 rounded-lg text-sm hover:text-destructive hover:border-destructive transition">
                <Ban className="w-4 h-4" /> Cancel
              </button>
            </>
          )}
          {session.status === "COMPLETED" && myRole !== null && (
            isHR ? (
              <button onClick={() => router.push(`/sessions/${id}/report`)} className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition">
                <FileText className="w-4 h-4" /> View Report
              </button>
            ) : (
              <button onClick={() => router.push(`/sessions/${id}/assess`)} className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition">
                <ClipboardCheck className="w-4 h-4" /> Score answers
              </button>
            )
          )}
          {session.status === "CANCELLED" && (
            <button onClick={handleReactivate} disabled={reactivate.isPending} className="flex items-center gap-1.5 border border-amber-400 text-amber-700 bg-amber-50 px-3 py-2 rounded-lg text-sm font-medium hover:bg-amber-100 disabled:opacity-50 transition">
              {reactivate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Reactivate
            </button>
          )}
        </div>
      </div>

      {sqs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <BookOpen className="w-8 h-8 text-muted-foreground/40" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">No questions yet</h3>
          {session.status === "SCHEDULED" && canAssignBank ? (
            <p className="text-sm text-muted-foreground max-w-xs">Assign a question bank below to populate this session with questions.</p>
          ) : session.status === "SCHEDULED" && isHR ? (
            <p className="text-sm text-muted-foreground max-w-xs">An <span className="font-medium text-foreground">Org Member</span> will assign the question bank before this session can be started.</p>
          ) : (
            <p className="text-sm text-muted-foreground max-w-xs">No questions were added to this session.</p>
          )}
        </div>
      )}

      <div className={cn("grid grid-cols-[280px_1fr] gap-6", sqs.length === 0 && "hidden")}>
        {/* Left: question nav */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-3">
            Questions ({answeredCount}/{sqs.length} answered)
          </p>
          {sqs.map((sq: any, i: number) => {
            const answered = !!sq.answer?.content;
            const flagged = sq.answer?.flagged;
            return (
              <button
                key={sq.id}
                onClick={() => setCurrentIdx(i)}
                className={cn(
                  "w-full text-left flex items-start gap-2.5 px-3 py-3 rounded-xl border transition",
                  i === currentIdx
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30 hover:bg-accent/30"
                )}
              >
                <div className="mt-0.5 shrink-0">
                  {flagged ? (
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                  ) : answered ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <Circle className="w-4 h-4 text-muted-foreground/40" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{i + 1}. {sq.question.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{sq.question.category} · {sq.question.difficulty}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right: current question + answer */}
        <div className="space-y-5">
          {currentSQ && (
            <>
              <div className="bg-white border border-border rounded-xl p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{currentSQ.question.category}</span>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{currentSQ.question.difficulty}</span>
                      {currentSQ.question.tags?.map((t: string) => (
                        <span key={t} className="text-xs text-muted-foreground">{t}</span>
                      ))}
                    </div>
                    <h2 className="text-base font-semibold text-foreground">
                      Q{currentIdx + 1}. {currentSQ.question.title}
                    </h2>
                  </div>
                  {isActive && (
                    <QuestionTimer
                      limit={currentSQ.timeLimit}
                      startedAt={session.startedAt}
                    />
                  )}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{currentSQ.question.body}</p>
                {currentSQ.question.expectedAnswer && (
                  <details className="mt-4">
                    <summary className="text-xs font-medium text-primary cursor-pointer hover:opacity-80">
                      View expected answer hints
                    </summary>
                    <p className="text-sm text-muted-foreground mt-2 p-3 bg-primary/5 rounded-lg border border-primary/10">{currentSQ.question.expectedAnswer}</p>
                  </details>
                )}
              </div>

              {/* Answer */}
              <div className="bg-white border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">
                    {isReadonly ? "Recorded answer" : <>Record answer <span className="text-destructive">*</span></>}
                  </h3>
                  {!isReadonly && <span className="text-xs text-muted-foreground ml-auto">Autosaves</span>}
                </div>
                <AnswerEditor
                  key={currentSQ.id}
                  sessionId={id}
                  sq={currentSQ}
                  orgId={activeOrgId!}
                  disabled={isReadonly}
                  isActive={isActive}
                  isHR={isHR}
                />
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                  disabled={currentIdx === 0}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-accent disabled:opacity-40 transition"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>
                <span className="text-sm text-muted-foreground">{currentIdx + 1} / {sqs.length}</span>
                <button
                  onClick={() => setCurrentIdx((i) => Math.min(sqs.length - 1, i + 1))}
                  disabled={currentIdx === sqs.length - 1}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-accent disabled:opacity-40 transition"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Info banner for Org HR — they cannot assign banks */}
      {session.status === "SCHEDULED" && isHR && sqs.length === 0 && (
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <BookOpen className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-700">
            The question bank for this session will be assigned by an <strong>Org Member</strong>. The session can only be started once questions have been added.
          </p>
        </div>
      )}

      {/* Assign question bank — mandatory for Org Member when session is SCHEDULED */}
      {session.status === "SCHEDULED" && canAssignBank && (
        <div className="mt-6 bg-white border border-amber-300 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-foreground">Assign question bank <span className="text-amber-600 font-normal">(required)</span></h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            You must assign a question bank before this session can be started.
            {sqs.length > 0 && " Assigning a new bank will replace the current questions."}
          </p>
          <div className="flex gap-3">
            <select
              value={selectedBankId}
              onChange={(e) => setSelectedBankId(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select a question bank…</option>
              {(banksData?.data ?? []).map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b._count?.questions ?? 0} questions)
                </option>
              ))}
            </select>
            <button
              onClick={handleAssignBank}
              disabled={assigning || !selectedBankId}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
            >
              {assigning && <Loader2 className="w-4 h-4 animate-spin" />}
              Assign bank
            </button>
          </div>
          {sqs.length === 0 && (
            <p className="text-xs text-amber-600 mt-3 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> No questions yet — assign a bank to enable starting this session.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
