"use client";

import { useState } from "react";
import { useQuestions, useCreateQuestion, useUpdateQuestion, useDeleteQuestion, useGenerateQuestions, useBulkSaveQuestions } from "@/hooks/use-questions";
import { useQuestionBanks, useAddQuestionsToBank } from "@/hooks/use-question-banks";
import { useActiveOrg } from "@/hooks/use-organization";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { QuestionCreateSchema, AIGenerateSchema, type QuestionCreateInput, type AIGenerateInput, QUESTION_CATEGORIES, QUESTION_DIFFICULTIES } from "@interview/shared";
import { toast } from "sonner";
import {
  Loader2, Plus, Search, X, Pencil, Trash2, ChevronLeft, ChevronRight,
  BookOpen, CheckSquare, Square, Sparkles, Tag, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

const DIFF_COLOR: Record<string, string> = {
  EASY: "bg-green-100 text-green-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  HARD: "bg-red-100 text-red-700",
};

// ─── Question Form Modal ──────────────────────────────────────────────────────

function QuestionModal({ orgId, initial, onClose }: { orgId: string; initial?: any; onClose: () => void }) {
  const { mutateAsync: create, isPending: creating } = useCreateQuestion(orgId);
  const { mutateAsync: update, isPending: updating } = useUpdateQuestion(orgId);
  const isPending = creating || updating;

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<QuestionCreateInput>({
    resolver: zodResolver(QuestionCreateSchema),
    defaultValues: initial
      ? { title: initial.title, body: initial.body, category: initial.category, subCategory: initial.subCategory ?? "", difficulty: initial.difficulty, tags: initial.tags ?? [], expectedAnswer: initial.expectedAnswer ?? "" }
      : { difficulty: "MEDIUM", tags: [] },
  });

  const [tagInput, setTagInput] = useState("");
  const tags = watch("tags") ?? [];

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t) && tags.length < 10) { setValue("tags", [...tags, t]); setTagInput(""); }
  };

  const onSubmit = async (data: QuestionCreateInput) => {
    try {
      if (initial) { await update({ id: initial.id, data }); toast.success("Question updated"); }
      else { await create(data); toast.success("Question created"); }
      onClose();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold">{initial ? "Edit question" : "New question"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Question title <span className="text-destructive">*</span></label>
            <input {...register("title")} placeholder="Short, descriptive title" className="w-full px-3 py-2.5 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
            {errors.title && <p className="text-destructive text-xs mt-1">{errors.title.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Question body <span className="text-destructive">*</span></label>
            <textarea {...register("body")} rows={4} placeholder="The full question text shown during the interview…" className="w-full px-3 py-2.5 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none transition" />
            {errors.body && <p className="text-destructive text-xs mt-1">{errors.body.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Category <span className="text-destructive">*</span></label>
              <input {...register("category")} list="cat-suggestions" placeholder="e.g. Testing, JavaScript, DevOps…" className="w-full px-3 py-2.5 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
              <datalist id="cat-suggestions">{QUESTION_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
              {errors.category && <p className="text-destructive text-xs mt-1">{errors.category.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Sub-category <span className="text-muted-foreground font-normal">(optional)</span></label>
              <input {...register("subCategory")} placeholder="e.g. Selenium, Jest, Cypress, Pytest…" className="w-full px-3 py-2.5 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Difficulty</label>
            <div className="flex gap-2">
              {QUESTION_DIFFICULTIES.map((d) => (
                <label key={d} className={cn("flex-1 flex items-center justify-center py-2 rounded-lg border text-xs font-medium cursor-pointer transition", watch("difficulty") === d ? DIFF_COLOR[d] + " border-transparent" : "border-border text-muted-foreground hover:bg-accent")}>
                  <input type="radio" {...register("difficulty")} value={d} className="hidden" />{d}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Tags <span className="text-muted-foreground font-normal">(optional, max 10)</span></label>
            <div className="flex gap-2 mb-2 flex-wrap">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded">
                  {t}<button type="button" onClick={() => setValue("tags", tags.filter((x) => x !== t))} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} placeholder="Type a tag and press Enter" className="flex-1 px-3 py-2 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
              <button type="button" onClick={addTag} className="px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-accent transition">Add</button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Expected answer <span className="text-muted-foreground font-normal">(optional)</span></label>
            <textarea {...register("expectedAnswer")} rows={3} placeholder="Key points for a good answer…" className="w-full px-3 py-2.5 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none transition" />
          </div>
        </div>

        <div className="p-6 border-t border-border flex gap-3">
          <button onClick={handleSubmit(onSubmit)} disabled={isPending} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition">
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}{initial ? "Save changes" : "Create question"}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground border border-border hover:bg-accent transition">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Add to Bank Modal ────────────────────────────────────────────────────────

function AddToBankModal({ orgId, question, onClose }: { orgId: string; question: any; onClose: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const { data } = useQuestionBanks(orgId, { limit: 100, includeShared: false });
  const { mutateAsync: addToBank, isPending } = useAddQuestionsToBank(orgId);
  const banks: any[] = data?.data ?? [];

  const onSave = async () => {
    if (!selected) return toast.error("Pick a bank");
    try { await addToBank({ bankId: selected, data: { questionIds: [question.id] } }); toast.success(`Added to bank`); onClose(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-semibold">Add to question bank</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5">
          <p className="text-xs text-muted-foreground mb-3 truncate">Adding: <span className="font-medium text-foreground">{question.title}</span></p>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {banks.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No banks yet — create one in <a href="/questions/banks" className="text-primary underline">Question Banks</a></p>}
            {banks.map((b) => (
              <button key={b.id} type="button" onClick={() => setSelected(b.id)} className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left border transition", selected === b.id ? "border-primary bg-primary/5" : "border-border hover:bg-accent")}>
                {selected === b.id ? <CheckSquare className="w-4 h-4 text-primary shrink-0" /> : <Square className="w-4 h-4 text-muted-foreground shrink-0" />}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{b.name}</p>
                  <p className="text-xs text-muted-foreground">{b._count?.questions ?? 0} questions</p>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="p-5 border-t border-border flex gap-3">
          <button onClick={onSave} disabled={isPending || !selected} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition">
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />} Add to bank
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground border border-border hover:bg-accent transition">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── AI Generate Modal ────────────────────────────────────────────────────────

function AIGenerateModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const [preview, setPreview] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const { mutateAsync: generate, isPending: generating } = useGenerateQuestions(orgId);
  const { mutateAsync: bulkSave, isPending: saving } = useBulkSaveQuestions(orgId);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<AIGenerateInput>({
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
      await bulkSave(toSave);
      toast.success(`${toSave.length} question${toSave.length !== 1 ? "s" : ""} saved`);
      onClose();
    } catch (e: any) { toast.error(e.message); }
  };

  const toggle = (i: number) =>
    setSelected((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">AI Question Generator</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {preview.length === 0 ? (
            <form onSubmit={handleSubmit(onGenerate)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Category <span className="text-destructive">*</span></label>
                  <input
                    {...register("category")}
                    list="ai-cat-suggestions"
                    placeholder="e.g. Testing, JavaScript…"
                    className="w-full px-3 py-2.5 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
                  />
                  <datalist id="ai-cat-suggestions">
                    {QUESTION_CATEGORIES.map((c) => <option key={c} value={c} />)}
                  </datalist>
                  {errors.category && <p className="text-destructive text-xs mt-1">{errors.category.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Sub-category <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <input
                    {...register("subCategory")}
                    placeholder="e.g. Selenium, Jest, Pytest…"
                    className="w-full px-3 py-2.5 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Specific topic <span className="text-muted-foreground font-normal">(optional)</span></label>
                <input
                  {...register("topic")}
                  placeholder="e.g. XPath selectors, Page Object Model, async testing…"
                  className="w-full px-3 py-2.5 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
                />
                {errors.topic && <p className="text-destructive text-xs mt-1">{errors.topic.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Difficulty</label>
                  <div className="flex gap-2">
                    {QUESTION_DIFFICULTIES.map((d) => (
                      <label key={d} className={cn("flex-1 flex items-center justify-center py-2 rounded-lg border text-xs font-medium cursor-pointer transition", watch("difficulty") === d ? DIFF_COLOR[d] + " border-transparent" : "border-border text-muted-foreground hover:bg-accent")}>
                        <input type="radio" {...register("difficulty")} value={d} className="hidden" />{d}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Number of questions</label>
                  <input
                    {...register("count", { valueAsNumber: true })}
                    type="number" min={1} max={10}
                    className="w-full px-3 py-2.5 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={generating}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? "Generating…" : "Generate questions"}
              </button>
            </form>
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
                        {q.difficulty && <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded", DIFF_COLOR[q.difficulty])}>{q.difficulty}</span>}
                        {q.category && <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{q.category}</span>}
                      </div>
                      <p className="font-medium text-sm text-foreground">{q.title}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{q.body}</p>
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

        {preview.length > 0 && (
          <div className="p-6 border-t border-border flex gap-3">
            <button
              onClick={onSave}
              disabled={saving || selected.size === 0}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save {selected.size} question{selected.size !== 1 ? "s" : ""} to library
            </button>
            <button onClick={() => setPreview([])} className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground border border-border hover:bg-accent transition">Back</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function QuestionsPage() {
  const { activeOrgId } = useActiveOrg();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [subCategoryFilter, setSubCategoryFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<"create" | "edit" | "bank" | "ai" | null>(null);
  const [active, setActive] = useState<any>(null);

  const { data, isLoading, isFetching } = useQuestions(activeOrgId, {
    search: search || undefined,
    category: categoryFilter || undefined,
    subCategory: subCategoryFilter || undefined,
    difficulty: difficultyFilter || undefined,
    page,
    limit: 20,
  });
  const { mutateAsync: deleteQ } = useDeleteQuestion(activeOrgId ?? "");

  const questions: any[] = data?.data ?? [];
  const meta = data?.meta;

  if (!activeOrgId) return <div className="text-center py-16 text-muted-foreground">No organization selected.</div>;

  const handleDelete = async (q: any) => {
    if (!confirm(`Delete "${q.title}"? This cannot be undone.`)) return;
    try { await deleteQ(q.id); toast.success("Question deleted"); } catch (e: any) { toast.error(e.message); }
  };

  const hasFilter = !!(search || categoryFilter || subCategoryFilter || difficultyFilter);

  return (
    <div>
      {modal === "create" && <QuestionModal orgId={activeOrgId} onClose={() => setModal(null)} />}
      {modal === "edit" && active && <QuestionModal orgId={activeOrgId} initial={active} onClose={() => { setModal(null); setActive(null); }} />}
      {modal === "bank" && active && <AddToBankModal orgId={activeOrgId} question={active} onClose={() => { setModal(null); setActive(null); }} />}
      {modal === "ai" && <AIGenerateModal orgId={activeOrgId} onClose={() => setModal(null)} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Questions</h1>
          <p className="text-muted-foreground text-sm mt-1">{meta ? `${meta.total} question${meta.total !== 1 ? "s" : ""}` : "Your question library"}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setModal("ai")} className="flex items-center gap-2 border border-border px-4 py-2 rounded-lg text-sm font-medium text-foreground hover:bg-accent transition">
            <Sparkles className="w-4 h-4 text-primary" /> Generate with AI
          </button>
          <button onClick={() => setModal("create")} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition">
            <Plus className="w-4 h-4" /> New question
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search questions…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
        </div>
        <div className="relative">
          <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }} list="cat-filter-list" placeholder="Category" className="pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition w-44" />
          <datalist id="cat-filter-list">{QUESTION_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div className="relative">
          <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={subCategoryFilter} onChange={(e) => { setSubCategoryFilter(e.target.value); setPage(1); }} placeholder="Sub-category" className="pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition w-44" />
        </div>
        <select value={difficultyFilter} onChange={(e) => { setDifficultyFilter(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
          <option value="">All difficulties</option>
          {QUESTION_DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        {hasFilter && (
          <button onClick={() => { setSearch(""); setCategoryFilter(""); setSubCategoryFilter(""); setDifficultyFilter(""); setPage(1); }} className="px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-accent transition">Clear</button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : questions.length === 0 ? (
        <div className="bg-white border border-dashed border-border rounded-xl p-12 text-center">
          <Sparkles className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="font-medium text-foreground">No questions found</p>
          <p className="text-sm text-muted-foreground mt-1">{hasFilter ? "Try adjusting your filters" : "Create your first question to get started"}</p>
        </div>
      ) : (
        <div className={cn("space-y-2", isFetching && "opacity-60 transition-opacity")}>
          {questions.map((q: any) => (
            <div key={q.id} className="bg-white border border-border rounded-xl p-4 flex items-start gap-4 group hover:border-primary/20 transition">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded", DIFF_COLOR[q.difficulty])}>{q.difficulty}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{q.category}</span>
                  {q.subCategory && <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{q.subCategory}</span>}
                  {q.aiGenerated && <span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">AI</span>}
                  {q.tags?.map((t: string) => <span key={t} className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{t}</span>)}
                </div>
                <p className="font-medium text-sm text-foreground">{q.title}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{q.body}</p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                <button onClick={() => { setActive(q); setModal("bank"); }} title="Add to bank" className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5 transition"><BookOpen className="w-4 h-4" /></button>
                <button onClick={() => { setActive(q); setModal("edit"); }} title="Edit" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(q)} title="Delete" className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition"><Trash2 className="w-4 h-4" /></button>
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
