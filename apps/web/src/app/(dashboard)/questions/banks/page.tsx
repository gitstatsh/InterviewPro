"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuestionBanks, useCreateQuestionBank, useDeleteQuestionBank, useShareQuestionBank, useGenerateFromJD } from "@/hooks/use-question-banks";
import { useActiveOrg } from "@/hooks/use-organization";
import { useMyRole, canManageContent } from "@/hooks/use-organizations";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { QuestionBankCreateSchema, type QuestionBankCreateInput } from "@interview/shared";
import { toast } from "sonner";
import {
  Loader2, Plus, Search, Trash2, BookOpen,
  ChevronLeft, ChevronRight, X, FileText, Sparkles, CheckSquare, Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { QuestionDetailDialog } from "@/components/features/questions/question-detail-dialog";

function GenerateFromJDModal({ orgId, banks, onClose }: { orgId: string; banks: any[]; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "preview">("form");
  const [preview, setPreview] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [jobDescription, setJobDescription] = useState("");
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const [targetBankId, setTargetBankId] = useState<string>(banks[0]?.id ?? "");
  const [generating, setGenerating] = useState(false);
  const { mutateAsync: generateFromJD } = useGenerateFromJD(orgId);

  const ownBanks = banks.filter((b) => b.organizationId === orgId);

  const onGenerate = async () => {
    if (jobDescription.trim().length < 50) return toast.error("Job description must be at least 50 characters");
    if (!targetBankId) return toast.error("Select a bank to save questions into");
    setGenerating(true);
    try {
      const res = await generateFromJD({ bankId: targetBankId, data: { jobDescription, count, difficulty } });
      const questions = res.data.questions ?? [];
      setPreview(questions);
      setSelected(new Set(questions.map((_: any, i: number) => i)));
      setStep("preview");
    } catch (e: any) { toast.error(e.message); }
    finally { setGenerating(false); }
  };

  const onDone = () => {
    const kept = preview.filter((_, i) => selected.has(i));
    toast.success(`${kept.length} question${kept.length !== 1 ? "s" : ""} generated and saved to bank`);
    router.push(`/questions/banks/${targetBankId}`);
    onClose();
  };

  const toggle = (i: number) =>
    setSelected((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const DIFF_COLOR: Record<string, string> = {
    EASY: "bg-green-100 text-green-700",
    MEDIUM: "bg-yellow-100 text-yellow-700",
    HARD: "bg-red-100 text-red-700",
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Generate from Job Description</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === "form" ? (
            <div className="space-y-5">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-sm font-medium text-blue-700 mb-1">How it works</p>
                <p className="text-xs text-blue-600">Paste a job description and AI will analyse required skills, responsibilities and seniority level to generate targeted interview questions automatically.</p>
              </div>

              {ownBanks.length === 0 ? (
                <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 text-sm text-amber-700">
                  You need to create a question bank first before generating questions.
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-1.5">Save to bank <span className="text-destructive">*</span></label>
                  <select
                    value={targetBankId}
                    onChange={(e) => setTargetBankId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {ownBanks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1.5">Job Description <span className="text-destructive">*</span></label>
                <textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  rows={10}
                  placeholder="Paste the full job description here — title, responsibilities, required skills, qualifications, nice-to-haves…"
                  className="w-full px-3 py-2.5 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none transition"
                />
                <p className={cn("text-xs mt-1", jobDescription.length < 50 && jobDescription.length > 0 ? "text-destructive" : "text-muted-foreground")}>
                  {jobDescription.length} characters {jobDescription.length < 50 && jobDescription.length > 0 ? `(${50 - jobDescription.length} more needed)` : ""}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Difficulty</label>
                  <div className="flex gap-2">
                    {(["EASY", "MEDIUM", "HARD"] as const).map((d) => (
                      <button key={d} type="button" onClick={() => setDifficulty(d)}
                        className={cn("flex-1 py-2 rounded-lg border text-xs font-medium transition",
                          difficulty === d ? DIFF_COLOR[d] + " border-transparent" : "border-border text-muted-foreground hover:bg-accent"
                        )}>{d}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Number of questions</label>
                  <input type="number" min={1} max={20} value={count}
                    onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value))))}
                    className="w-full px-3 py-2.5 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">{selected.size} of {preview.length} selected</p>
                <button onClick={() => setSelected(selected.size === preview.length ? new Set() : new Set(preview.map((_, i) => i)))} className="text-xs text-primary hover:underline">
                  {selected.size === preview.length ? "Deselect all" : "Select all"}
                </button>
              </div>
              {preview.map((q, i) => (
                <div key={i} onClick={() => toggle(i)} className={cn("border rounded-xl p-4 cursor-pointer transition", selected.has(i) ? "border-primary bg-primary/5" : "border-border hover:border-primary/30")}>
                  <div className="flex items-start gap-3">
                    {selected.has(i) ? <CheckSquare className="w-4 h-4 text-primary shrink-0 mt-0.5" /> : <Square className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {q.difficulty && <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded", DIFF_COLOR[q.difficulty])}>{q.difficulty}</span>}
                        {q.category && <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{q.category}</span>}
                        {q.subCategory && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{q.subCategory}</span>}
                      </div>
                      <p className="font-medium text-sm text-foreground">{q.title}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {q.body}
                        <QuestionDetailDialog title={q.title} body={q.body} difficulty={q.difficulty} category={q.category} tags={q.tags} />
                      </p>
                      {q.tags?.length > 0 && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {q.tags.map((t: string) => <span key={t} className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{t}</span>)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border flex gap-3">
          {step === "form" ? (
            <button onClick={onGenerate} disabled={generating || jobDescription.trim().length < 50 || !targetBankId || ownBanks.length === 0}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? "Analysing JD & generating…" : "Generate questions"}
            </button>
          ) : (
            <>
              <button onClick={onDone} disabled={selected.size === 0}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition">
                View {selected.size} question{selected.size !== 1 ? "s" : ""} in bank
              </button>
              <button onClick={() => setStep("form")} className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground border border-border hover:bg-accent transition">Back</button>
            </>
          )}
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground border border-border hover:bg-accent transition ml-auto">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function CreateBankModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const { mutateAsync: create, isPending } = useCreateQuestionBank(orgId);
  const router = useRouter();
  const { register, handleSubmit, formState: { errors } } = useForm<QuestionBankCreateInput>({
    resolver: zodResolver(QuestionBankCreateSchema),
    defaultValues: {},
  });
  const onSubmit = async (data: QuestionBankCreateInput) => {
    try {
      const res = await create(data);
      toast.success("Question bank created");
      onClose();
      router.push(`/questions/banks/${res.data.id}`);
    } catch (err: any) { toast.error(err.message ?? "Failed to create bank"); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold">New Question Bank</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Bank name</label>
            <input {...register("name")} placeholder="e.g. Backend Engineering — Senior" className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
            {errors.name && <p className="text-destructive text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
            <textarea {...register("description")} rows={2} placeholder="What is this bank for?" className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none transition" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={isPending} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition">
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />} Create bank
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground border border-border hover:bg-accent transition">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BankCard({ bank, isOwn, onClick, onDelete }: { bank: any; isOwn: boolean; onClick: () => void; onDelete?: () => void; }) {
  return (
    <div onClick={onClick} className="bg-white border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-sm transition cursor-pointer group">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{bank._count?.questions ?? 0} question{bank._count?.questions !== 1 ? "s" : ""}</span>
          </div>
          <p className="font-semibold text-foreground truncate">{bank.name}</p>
          {bank.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{bank.description}</p>}
          <p className="text-xs text-muted-foreground mt-2">
            By {bank.createdBy?.name ?? bank.createdBy?.email} · {bank.createdAt ? format(new Date(bank.createdAt), "MMM d, yyyy") : ""}
          </p>
        </div>
        {isOwn && onDelete && (
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition" onClick={(e) => e.stopPropagation()}>
            {onDelete && <button onClick={onDelete} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition"><Trash2 className="w-4 h-4" /></button>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function QuestionBanksPage() {
  const router = useRouter();
  const { activeOrgId } = useActiveOrg();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showJD, setShowJD] = useState(false);
  const myRole = useMyRole(activeOrgId);
  const canWrite = canManageContent(myRole);

  const { data, isLoading, isFetching } = useQuestionBanks(activeOrgId, { search: search || undefined, page, limit: 12 });
  const { mutateAsync: deleteBank } = useDeleteQuestionBank(activeOrgId ?? "");

  const banks: any[] = data?.data ?? [];
  const meta = data?.meta;

  if (!activeOrgId) return <div className="text-center py-16 text-muted-foreground">No organisation selected.</div>;

  const handleDelete = async (bank: any) => {
    if (!confirm(`Delete "${bank.name}"? Questions inside it will not be deleted.`)) return;
    try { await deleteBank(bank.id); toast.success("Bank deleted"); } catch (e: any) { toast.error(e.message); }
  };
  return (
    <div>
      {showCreate && <CreateBankModal orgId={activeOrgId} onClose={() => setShowCreate(false)} />}
      {showJD && <GenerateFromJDModal orgId={activeOrgId} banks={banks} onClose={() => setShowJD(false)} />}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Question Bank</h1>
          <p className="text-muted-foreground text-sm mt-1">Organise questions into banks, then apply them to interview sessions</p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowJD(true)} className="flex items-center gap-2 border border-primary/30 text-primary bg-primary/5 px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/10 transition">
              <FileText className="w-4 h-4" /> Generate from JD with AI
            </button>
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition">
              <Plus className="w-4 h-4" /> New bank
            </button>
          </div>
        )}
      </div>
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search banks…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
        </div>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : banks.length === 0 ? (
        <div className="bg-white border border-dashed border-border rounded-xl p-12 text-center">
          <BookOpen className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="font-medium text-foreground">No question banks yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create a bank to organise and reuse your interview questions</p>
          <button onClick={() => setShowCreate(true)} className="mt-4 inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition"><Plus className="w-4 h-4" /> New bank</button>
        </div>
      ) : (
        <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", isFetching && "opacity-60")}>
          {banks.map((bank) => (
            <BankCard key={bank.id} bank={bank} isOwn={true} onClick={() => router.push(`/questions/banks/${bank.id}`)} onDelete={canWrite ? () => handleDelete(bank) : undefined} />
          ))}
        </div>
      )}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 text-sm text-muted-foreground">
          <span>Showing {(page - 1) * 12 + 1}–{Math.min(page * 12, meta.total)} of {meta.total}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg border border-border hover:bg-accent disabled:opacity-40 transition"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))} disabled={page === meta.totalPages} className="p-1.5 rounded-lg border border-border hover:bg-accent disabled:opacity-40 transition"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
