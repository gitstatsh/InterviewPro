"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuestionBank, useUpdateQuestionBank, useDeleteQuestionBank, useAddQuestionsToBank, useRemoveQuestionFromBank, useShareQuestionBank, useGenerateFromJD } from "@/hooks/use-question-banks";
import { useQuestions, useGenerateQuestions, useBulkSaveQuestions, useCreateQuestion } from "@/hooks/use-questions";
import { useActiveOrg } from "@/hooks/use-organization";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  QuestionCreateSchema, AIGenerateSchema,
  type QuestionCreateInput, type AIGenerateInput,
  QUESTION_CATEGORIES, QUESTION_DIFFICULTIES,
} from "@interview/shared";
import { toast } from "sonner";
import {
  Loader2, ChevronLeft, Plus, Trash2, Search,
  Pencil, X, Sparkles, Check, BookOpen, CheckSquare, Square, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { QuestionDetailDialog } from "@/components/features/questions/question-detail-dialog";

const DIFF_COLOR: Record<string, string> = {
  EASY: "bg-green-100 text-green-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  HARD: "bg-red-100 text-red-700",
};

// ─── AI Generate Modal ────────────────────────────────────────────────────────

function AIGenerateModal({ orgId, bankId, onClose }: { orgId: string; bankId: string; onClose: () => void }) {
  const [preview, setPreview] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const { mutateAsync: generate, isPending: generating } = useGenerateQuestions(orgId);
  const { mutateAsync: bulkSave, isPending: saving } = useBulkSaveQuestions(orgId);
  const { mutateAsync: addToBank } = useAddQuestionsToBank(orgId);

  const { register, handleSubmit, formState: { errors } } = useForm<AIGenerateInput>({
    resolver: zodResolver(AIGenerateSchema),
    defaultValues: { difficulty: "MEDIUM", count: 5, category: "System Design" },
  });

  const onGenerate = async (data: AIGenerateInput) => {
    try {
      const res = await generate(data);
      setPreview(res.data);
      setSelected(new Set(res.data.map((_: any, i: number) => i)));
    } catch (e: any) { toast.error(e.message); }
  };

  const onSave = async () => {
    const toSave = preview.filter((_, i) => selected.has(i)).map((q) => ({ ...q, aiGenerated: true }));
    if (!toSave.length) return toast.error("Select at least one question");
    try {
      const saved = await bulkSave(toSave);
      await addToBank({ bankId, data: { questionIds: saved.data.map((q: any) => q.id) } });
      toast.success(`${toSave.length} question${toSave.length !== 1 ? "s" : ""} saved to bank`);
      onClose();
    } catch (e: any) { toast.error(e.message); }
  };

  const toggle = (i: number) => setSelected((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /><h2 className="text-lg font-semibold">AI Question Generator</h2></div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {preview.length === 0 ? (
            <form onSubmit={handleSubmit(onGenerate)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Topic / Category</label>
                  <select {...register("category")} className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    {QUESTION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Difficulty</label>
                  <select {...register("difficulty")} className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    {QUESTION_DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Custom topic <span className="text-muted-foreground font-normal">(optional)</span></label>
                <input {...register("topic")} placeholder="e.g. React hooks, system design, SQL joins…" className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Number of questions</label>
                <input {...register("count", { valueAsNumber: true })} type="number" min={1} max={10} className="w-32 px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
              </div>
              <button type="submit" disabled={generating} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition">
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? "Generating…" : "Generate questions"}
              </button>
            </form>
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
                      <p className="font-medium text-sm text-foreground">{q.title}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {q.body}
                        <QuestionDetailDialog title={q.title} body={q.body} difficulty={q.difficulty} category={q.category} tags={q.tags} />
                      </p>
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        {q.tags?.map((t: string) => <span key={t} className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{t}</span>)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {preview.length > 0 && (
          <div className="p-6 border-t border-border flex gap-3">
            <button onClick={onSave} disabled={saving || selected.size === 0} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save {selected.size} question{selected.size !== 1 ? "s" : ""} to bank
            </button>
            <button onClick={() => setPreview([])} className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground border border-border hover:bg-accent transition">Back</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add from pool modal ──────────────────────────────────────────────────────

function AddFromPoolModal({ orgId, bankId, existingIds, onClose }: { orgId: string; bankId: string; existingIds: string[]; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data } = useQuestions(orgId, { search: search || undefined, limit: 50 });
  const { mutateAsync: addToBank, isPending } = useAddQuestionsToBank(orgId);

  const questions: any[] = (data?.data ?? []).filter((q: any) => !existingIds.includes(q.id));
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const onSave = async () => {
    if (!selected.size) return toast.error("Select at least one question");
    try {
      await addToBank({ bankId, data: { questionIds: [...selected] } });
      toast.success(`${selected.size} question${selected.size !== 1 ? "s" : ""} added`);
      onClose();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-semibold">Add existing questions</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {questions.length === 0
            ? <p className="text-center py-8 text-sm text-muted-foreground">No questions found{existingIds.length > 0 ? " (already in bank excluded)" : ""}</p>
            : questions.map((q: any) => (
              <button key={q.id} type="button" onClick={() => toggle(q.id)} className={cn("w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/30 transition", selected.has(q.id) && "bg-primary/5")}>
                {selected.has(q.id) ? <CheckSquare className="w-4 h-4 text-primary shrink-0" /> : <Square className="w-4 h-4 text-muted-foreground shrink-0" />}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{q.title}</p>
                  <p className="text-xs text-muted-foreground">{q.category} · <span className={cn("px-1 rounded", DIFF_COLOR[q.difficulty])}>{q.difficulty}</span></p>
                </div>
              </button>
            ))}
        </div>
        <div className="p-4 border-t border-border flex gap-3">
          <button onClick={onSave} disabled={isPending || selected.size === 0} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition">
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />} Add {selected.size || ""} question{selected.size !== 1 ? "s" : ""}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground border border-border hover:bg-accent transition">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Manual Create Modal ──────────────────────────────────────────────────────

function ManualCreateModal({ orgId, bankId, onClose }: { orgId: string; bankId: string; onClose: () => void }) {
  const { mutateAsync: create, isPending } = useCreateQuestion(orgId);
  const { mutateAsync: addToBank } = useAddQuestionsToBank(orgId);
  const { register, handleSubmit, formState: { errors } } = useForm<QuestionCreateInput>({
    resolver: zodResolver(QuestionCreateSchema),
    defaultValues: { difficulty: "MEDIUM", category: "System Design", tags: [] },
  });
  const onSubmit = async (data: QuestionCreateInput) => {
    try {
      const res = await create(data);
      await addToBank({ bankId, data: { questionIds: [res.data.id] } });
      toast.success("Question created and added to bank");
      onClose();
    } catch (e: any) { toast.error(e.message); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-semibold">Add question manually</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Question title</label>
            <input {...register("title")} placeholder="Short, descriptive title" className="w-full px-3 py-2.5 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
            {errors.title && <p className="text-destructive text-xs mt-1">{errors.title.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Question body</label>
            <textarea {...register("body")} rows={4} placeholder="The full question text shown to the interviewer…" className="w-full px-3 py-2.5 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none transition" />
            {errors.body && <p className="text-destructive text-xs mt-1">{errors.body.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Category</label>
              <select {...register("category")} className="w-full px-3 py-2.5 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {QUESTION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Difficulty</label>
              <select {...register("difficulty")} className="w-full px-3 py-2.5 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {QUESTION_DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Expected answer <span className="text-muted-foreground font-normal">(optional)</span></label>
            <textarea {...register("expectedAnswer")} rows={2} placeholder="Key points for a good answer…" className="w-full px-3 py-2.5 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none transition" />
          </div>
        </form>
        <div className="p-5 border-t border-border flex gap-3">
          <button onClick={handleSubmit(onSubmit)} disabled={isPending} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition">
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />} Add to bank
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground border border-border hover:bg-accent transition">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Generate from JD Modal ──────────────────────────────────────────────────

function GenerateFromJDModal({ orgId, bankId, onClose }: { orgId: string; bankId: string; onClose: () => void }) {
  const [step, setStep] = useState<"form" | "preview">("form");
  const [preview, setPreview] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [jobDescription, setJobDescription] = useState("");
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const { mutateAsync: generateFromJD } = useGenerateFromJD(orgId);

  const onGenerate = async () => {
    if (jobDescription.trim().length < 50) return toast.error("Job description must be at least 50 characters");
    setGenerating(true);
    try {
      const res = await generateFromJD({ bankId, data: { jobDescription, count, difficulty } });
      const questions = res.data.questions ?? [];
      setPreview(questions);
      setSelected(new Set(questions.map((_: any, i: number) => i)));
      setStep("preview");
    } catch (e: any) { toast.error(e.message); }
    finally { setGenerating(false); }
  };

  const onSave = async () => {
    setSaving(true);
    const kept = preview.filter((_, i) => selected.has(i));
    if (!kept.length) { toast.error("Select at least one question"); setSaving(false); return; }
    toast.success(`${kept.length} question${kept.length !== 1 ? "s" : ""} generated and saved to bank`);
    onClose();
  };

  const toggle = (i: number) =>
    setSelected((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });

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
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
                <p className="font-medium mb-1">How it works</p>
                <p className="text-xs text-blue-600">Paste the full job description below. AI will analyse the required skills, responsibilities and experience level to generate targeted interview questions for this role.</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Job Description <span className="text-destructive">*</span></label>
                <textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  rows={12}
                  placeholder="Paste the full job description here — title, responsibilities, required skills, qualifications, nice-to-haves…"
                  className="w-full px-3 py-2.5 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none transition"
                />
                <p className={cn("text-xs mt-1", jobDescription.length < 50 && jobDescription.length > 0 ? "text-destructive" : "text-muted-foreground")}>
                  {jobDescription.length} characters {jobDescription.length < 50 ? `(${50 - jobDescription.length} more needed)` : ""}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Difficulty</label>
                  <div className="flex gap-2">
                    {(["EASY", "MEDIUM", "HARD"] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDifficulty(d)}
                        className={cn("flex-1 py-2 rounded-lg border text-xs font-medium transition",
                          difficulty === d
                            ? d === "EASY" ? "bg-green-100 text-green-700 border-transparent"
                              : d === "MEDIUM" ? "bg-yellow-100 text-yellow-700 border-transparent"
                              : "bg-red-100 text-red-700 border-transparent"
                            : "border-border text-muted-foreground hover:bg-accent"
                        )}
                      >{d}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Number of questions</label>
                  <input
                    type="number" min={1} max={20} value={count}
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
                <button
                  onClick={() => setSelected(selected.size === preview.length ? new Set() : new Set(preview.map((_, i) => i)))}
                  className="text-xs text-primary hover:underline"
                >
                  {selected.size === preview.length ? "Deselect all" : "Select all"}
                </button>
              </div>
              {preview.map((q, i) => (
                <div
                  key={i}
                  onClick={() => toggle(i)}
                  className={cn("border rounded-xl p-4 cursor-pointer transition", selected.has(i) ? "border-primary bg-primary/5" : "border-border hover:border-primary/30")}
                >
                  <div className="flex items-start gap-3">
                    {selected.has(i) ? <CheckSquare className="w-4 h-4 text-primary shrink-0 mt-0.5" /> : <Square className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {q.difficulty && (
                          <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded",
                            q.difficulty === "EASY" ? "bg-green-100 text-green-700" :
                            q.difficulty === "HARD" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                          )}>{q.difficulty}</span>
                        )}
                        {q.category && <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{q.category}</span>}
                        {q.subCategory && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{q.subCategory}</span>}
                      </div>
                      <p className="font-medium text-sm text-foreground">{q.title}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {q.body}
                        <QuestionDetailDialog title={q.title} body={q.body} difficulty={q.difficulty} category={q.category} tags={q.tags} expectedAnswer={q.expectedAnswer} />
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
            <button
              onClick={onGenerate}
              disabled={generating || jobDescription.trim().length < 50}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? "Analysing JD & generating…" : "Generate questions"}
            </button>
          ) : (
            <>
              <button
                onClick={onSave}
                disabled={saving || selected.size === 0}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Keep {selected.size} question{selected.size !== 1 ? "s" : ""} in bank
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

// ─── Bank Detail Page ─────────────────────────────────────────────────────────

export default function BankDetailPage() {
  const router = useRouter();
  const params = useParams<{ bankId: string }>();
  const bankId = params?.bankId ?? "";
  const { activeOrgId } = useActiveOrg();
  const [modal, setModal] = useState<"ai" | "manual" | "pool" | "jd" | null>(null);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuestionBank(activeOrgId, bankId);
  const { mutateAsync: removeQ } = useRemoveQuestionFromBank(activeOrgId ?? "");


  const bank = data?.data;
  const isOwn = bank?.organizationId === activeOrgId;

  const questions: any[] = (bank?.questions ?? [])
    .map((bq: any) => bq.question)
    .filter((q: any) => !search || q.title.toLowerCase().includes(search.toLowerCase()) || q.category.toLowerCase().includes(search.toLowerCase()));

  const existingIds = (bank?.questions ?? []).map((bq: any) => bq.questionId);

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!bank) return <div className="text-center py-16 text-muted-foreground">Bank not found.</div>;

  const handleRemove = async (q: any) => {
    if (!confirm(`Remove "${q.title}" from this bank? The question itself won't be deleted.`)) return;
    try { await removeQ({ bankId, questionId: q.id }); toast.success("Question removed from bank"); } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {modal === "ai" && <AIGenerateModal orgId={activeOrgId!} bankId={bankId} onClose={() => setModal(null)} />}
      {modal === "manual" && <ManualCreateModal orgId={activeOrgId!} bankId={bankId} onClose={() => setModal(null)} />}
      {modal === "pool" && <AddFromPoolModal orgId={activeOrgId!} bankId={bankId} existingIds={existingIds} onClose={() => setModal(null)} />}
      {modal === "jd" && <GenerateFromJDModal orgId={activeOrgId!} bankId={bankId} onClose={() => setModal(null)} />}

      {/* Header */}
      <div className="mb-6">
        <button onClick={() => router.push("/questions/banks")} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3 transition">
          <ChevronLeft className="w-4 h-4" /> All banks
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{bank._count?.questions ?? 0} question{bank._count?.questions !== 1 ? "s" : ""}</span>
            </div>
            <h1 className="text-xl font-bold text-foreground">{bank.name}</h1>
            {bank.description && <p className="text-sm text-muted-foreground mt-1">{bank.description}</p>}
            <p className="text-xs text-muted-foreground mt-1">Created by {bank.createdBy?.name ?? bank.createdBy?.email}</p>
          </div>
        </div>
      </div>

      {/* Add questions — only own banks */}
      {isOwn && (
        <div className="flex gap-2 mb-6 flex-wrap">
          <button onClick={() => setModal("manual")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-border text-foreground hover:bg-accent transition">
            <Plus className="w-4 h-4" /> Add manually
          </button>
          <button onClick={() => setModal("ai")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-border text-foreground hover:bg-accent transition">
            <Sparkles className="w-4 h-4 text-primary" /> Generate with AI
          </button>
          <button onClick={() => setModal("pool")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-border text-foreground hover:bg-accent transition">
            <BookOpen className="w-4 h-4" /> Add from existing questions
          </button>
          <button onClick={() => setModal("jd")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 transition">
            <FileText className="w-4 h-4" /> Generate from Job Description
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter questions in this bank…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
      </div>

      {/* Questions list */}
      {questions.length === 0 ? (
        <div className="bg-white border border-dashed border-border rounded-xl p-10 text-center">
          <BookOpen className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="font-medium text-foreground">{bank._count?.questions === 0 ? "No questions yet" : "No questions match your filter"}</p>
          {isOwn && bank._count?.questions === 0 && (
            <p className="text-sm text-muted-foreground mt-1">Add questions manually, generate with AI, or pick from your existing pool</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {questions.map((q: any, idx: number) => (
            <div key={q.id} className="bg-white border border-border rounded-xl p-4 flex items-start gap-4 group hover:border-primary/20 transition">
              <span className="text-xs text-muted-foreground font-mono w-5 shrink-0 pt-0.5">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded", DIFF_COLOR[q.difficulty])}>{q.difficulty}</span>
                  <span className="text-xs text-muted-foreground">{q.category}</span>
                  {q.aiGenerated && <span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">AI</span>}
                  {q.tags?.map((t: string) => <span key={t} className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{t}</span>)}
                </div>
                <p className="font-medium text-sm text-foreground">{q.title}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {q.body}
                  <QuestionDetailDialog title={q.title} body={q.body} difficulty={q.difficulty} category={q.category} tags={q.tags} expectedAnswer={q.expectedAnswer} />
                </p>
              </div>
              {isOwn && (
                <button onClick={() => handleRemove(q)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
