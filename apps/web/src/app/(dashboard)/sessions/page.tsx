"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSessions, useCreateSession, useSessionLifecycle, useDeleteSession } from "@/hooks/use-sessions";
import { useCandidates } from "@/hooks/use-candidates";
import { useActiveOrg } from "@/hooks/use-organization";
import { useSession as useAuthSession } from "@/lib/auth-client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SessionCreateSchema, type SessionCreateInput, SESSION_STATUSES } from "@interview/shared";
import { toast } from "sonner";
import {
  Loader2, Plus, Search, ChevronLeft, ChevronRight,
  Calendar, Clock, X, User, Play, Ban,
  BookOpen, Trash2, AlertTriangle,
} from "lucide-react";
import { useOrganizations, useMyRole, canManageSessions, canDeleteSessions, canStartSession } from "@/hooks/use-organizations";
import { useMembers } from "@/hooks/use-organizations";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type StatusFilter = (typeof SESSION_STATUSES)[number] | "";

const STATUS_STYLES: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};


// ─── Create Session Modal ─────────────────────────────────────────────────────

function CreateSessionModal({ orgId, currentUserId, onClose }: { orgId: string; currentUserId: string; onClose: () => void }) {
  const router = useRouter();
  const { data: candidatesData } = useCandidates(orgId, { limit: 100 });
  const { data: membersData } = useMembers(orgId, { limit: 100 });
  const { mutateAsync: create, isPending } = useCreateSession(orgId);

  const { register, handleSubmit, formState: { errors } } = useForm<SessionCreateInput>({
    resolver: zodResolver(SessionCreateSchema),
    defaultValues: { interviewerId: currentUserId, questionIds: [] },
  });

  const candidates: any[] = candidatesData?.data ?? [];
  const orgMembers: any[] = (membersData?.data ?? []).filter((m: any) => m.role === "ORG_MEMBER");

  const onSubmit = async (data: SessionCreateInput) => {
    try {
      const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt).toISOString() : undefined;
      const res = await create({ ...data, scheduledAt, questionIds: [] });
      toast.success("Interview session created");
      router.push(`/sessions/${res.data.id}`);
      onClose();
    } catch (err: any) { toast.error(err.message ?? "Failed to create session"); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold">Schedule Interview</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Session title</label>
            <input {...register("title")} placeholder="e.g. Frontend Engineer — Technical Round" className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
            {errors.title && <p className="text-destructive text-xs mt-1">{errors.title.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Candidate</label>
            <select {...register("candidateId")} className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">Select candidate…</option>
              {candidates.map((c: any) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName} — {c.email}</option>)}
            </select>
            {errors.candidateId && <p className="text-destructive text-xs mt-1">{errors.candidateId.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Assign to <span className="text-muted-foreground font-normal">(Org Member who will conduct the interview)</span>
            </label>
            <select {...register("interviewerId")} className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value={currentUserId}>Me</option>
              {orgMembers.map((m: any) => (
                <option key={m.user.id} value={m.user.id}>{m.user.name} — {m.user.email}</option>
              ))}
            </select>
            {errors.interviewerId && <p className="text-destructive text-xs mt-1">{errors.interviewerId.message}</p>}
            {orgMembers.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">No Org Members in this organisation yet.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Scheduled at <span className="text-muted-foreground font-normal">(optional)</span></label>
            <input {...register("scheduledAt")} type="datetime-local" className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700 flex items-start gap-2">
            <BookOpen className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
            The assigned Org Member will select the question bank for this session before it can be started.
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Pre-session notes <span className="text-muted-foreground font-normal">(optional)</span></label>
            <textarea {...register("notes")} rows={2} placeholder="Anything to know before the interview…" className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none transition" />
          </div>
        </div>

        <div className="p-6 border-t border-border flex gap-3">
          <button onClick={handleSubmit(onSubmit)} disabled={isPending} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition">
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />} Schedule interview
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground border border-border hover:bg-accent transition">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SessionsPage() {
  const { activeOrgId } = useActiveOrg();
  const { data: authData } = useAuthSession();
  const { data: orgsData } = useOrganizations();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const { data, isLoading, isFetching } = useSessions(activeOrgId, { search: search || undefined, status: status || undefined, page, limit: 20 });
  const { start, cancel } = useSessionLifecycle(activeOrgId!);
  const { mutateAsync: deleteSession, isPending: deleting } = useDeleteSession(activeOrgId!);
  const router = useRouter();

  const myRole = useMyRole(activeOrgId);
  const canCreate = canManageSessions(myRole);
  const canDelete = canDeleteSessions(myRole);
  const canStart = canStartSession(myRole);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSession(deleteTarget.id);
      toast.success("Session deleted");
      setDeleteTarget(null);
    } catch (e: any) { toast.error(e.message); }
  };
  const sessions: any[] = data?.data ?? [];
  const meta = data?.meta;

  if (!activeOrgId) return <div className="text-center py-16 text-muted-foreground">No organization selected.</div>;

  return (
    <div>
      {showCreate && authData?.user && (
        <CreateSessionModal orgId={activeOrgId} currentUserId={authData.user.id} onClose={() => setShowCreate(false)} />
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Delete interview session?</h2>
                <p className="text-sm text-muted-foreground">This cannot be undone.</p>
              </div>
            </div>
            <div className="bg-muted rounded-lg px-4 py-3 mb-4 text-sm">
              <p className="font-medium text-foreground">{deleteTarget.title}</p>
              <p className="text-muted-foreground text-xs mt-1">All recorded answers, ratings, notes, and reports for this session will be permanently deleted.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={handleDelete} disabled={deleting} className="flex items-center gap-2 bg-destructive text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 transition">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Yes, delete session
              </button>
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2.5 rounded-lg text-sm border border-border hover:bg-accent transition">Cancel</button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Interviews</h1>
          <p className="text-muted-foreground text-sm mt-1">{meta ? `${meta.total} session${meta.total !== 1 ? "s" : ""}` : "Manage interview sessions."}</p>
        </div>
        {canCreate && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition">
            <Plus className="w-4 h-4" /> Schedule interview
          </button>
        )}
      </div>
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search by title or candidate…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value as StatusFilter); setPage(1); }} className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
          <option value="">All statuses</option>
          {SESSION_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : sessions.length === 0 ? (
        <div className="bg-white border border-dashed border-border rounded-xl p-12 text-center">
          <Calendar className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="font-medium text-foreground">No sessions found</p>
          <p className="text-sm text-muted-foreground mt-1">{search || status ? "Try adjusting your filters" : "Schedule your first interview to get started"}</p>
        </div>
      ) : (
        <div className={cn("space-y-3", isFetching && "opacity-60 transition-opacity")}>
          {sessions.map((s: any, i: number) => (
            <div
              key={s.id}
              className="group bg-white border border-border rounded-2xl overflow-hidden hover:border-primary/40 hover:shadow-lg transition-all duration-200 cursor-pointer card-hover"
              style={{ animationDelay: `${i * 50}ms` }}
              onClick={() => router.push(`/sessions/${s.id}`)}
            >
              {/* Status accent bar */}
              <div className={cn("h-0.5 w-full", {
                "bg-blue-400": s.status === "SCHEDULED",
                "bg-amber-400": s.status === "IN_PROGRESS",
                "bg-emerald-400": s.status === "COMPLETED",
                "bg-gray-300": s.status === "CANCELLED",
              })} />
              <div className="p-5 flex items-start justify-between gap-4">
                <div className="min-w-0 flex gap-4">
                  {/* Status icon circle */}
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5", {
                    "bg-blue-50 text-blue-500": s.status === "SCHEDULED",
                    "bg-amber-50 text-amber-500": s.status === "IN_PROGRESS",
                    "bg-emerald-50 text-emerald-500": s.status === "COMPLETED",
                    "bg-gray-50 text-gray-400": s.status === "CANCELLED",
                  })}>
                    {s.status === "SCHEDULED" && <Clock className="w-4.5 h-4.5" />}
                    {s.status === "IN_PROGRESS" && <Play className="w-4.5 h-4.5" />}
                    {s.status === "COMPLETED" && <BookOpen className="w-4.5 h-4.5" />}
                    {s.status === "CANCELLED" && <Ban className="w-4.5 h-4.5" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className={cn("text-xs font-semibold px-2.5 py-0.5 rounded-full", STATUS_STYLES[s.status])}>
                        {s.status.replace("_", " ")}
                      </span>
                      <span className="text-xs text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full">
                        {s._count?.sessionQuestions ?? 0} question{s._count?.sessionQuestions !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <p className="font-semibold text-foreground text-[15px] group-hover:text-primary transition-colors">{s.title}</p>
                    <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />{s.candidate.firstName} {s.candidate.lastName}
                      </span>
                      {s.scheduledAt && (
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />{format(new Date(s.scheduledAt), "MMM d, yyyy 'at' h:mm a")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200" onClick={(e) => e.stopPropagation()}>
                  {s.status === "SCHEDULED" && canStart && (
                    <button
                      onClick={() => start.mutateAsync(s.id).then(() => { toast.success("Session started"); router.push(`/sessions/${s.id}`); }).catch((e) => toast.error(e.message))}
                      disabled={start.isPending}
                      className="flex items-center gap-1.5 bg-amber-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-600 transition disabled:opacity-50 shadow-sm"
                    >
                      <Play className="w-3.5 h-3.5" /> Start
                    </button>
                  )}
                  {s.status === "IN_PROGRESS" && (
                    <button
                      onClick={() => router.push(`/sessions/${s.id}`)}
                      className="flex items-center gap-1.5 bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-200 transition"
                    >
                      <Play className="w-3.5 h-3.5" /> Continue
                    </button>
                  )}
                  {(s.status === "SCHEDULED" || s.status === "IN_PROGRESS") && (
                    <button
                      onClick={() => { if (confirm("Cancel this session?")) cancel.mutateAsync(s.id).then(() => toast.success("Cancelled")).catch((e) => toast.error(e.message)); }}
                      disabled={cancel.isPending}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => setDeleteTarget({ id: s.id, title: s.title })}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, meta.total)} of {meta.total}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg border border-border hover:bg-accent disabled:opacity-40 transition"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))} disabled={page === meta.totalPages} className="p-1.5 rounded-lg border border-border hover:bg-accent disabled:opacity-40 transition"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
