"use client";

import { useState, useRef, useCallback } from "react";
import {
  useCandidates,
  useCreateCandidate,
  useUpdateCandidate,
  useDeleteCandidate,
  useImportCandidates,
} from "@/hooks/use-candidates";
import { useActiveOrg } from "@/hooks/use-organization";
import { useMyRole, canManageCandidates } from "@/hooks/use-organizations";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CandidateCreateSchema, type CandidateCreateInput } from "@interview/shared";
import { toast } from "sonner";
import {
  Loader2, Plus, Trash2, Search, ChevronLeft, ChevronRight,
  Upload, UserCircle, X, Pencil, ChevronUp, ChevronDown, Mail, Phone, Linkedin, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// ─── CSV Import Modal ─────────────────────────────────────────────────────────

function CSVImportModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { mutateAsync: importCandidates, isPending } = useImportCandidates(orgId);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) {
        setParseError("CSV must have a header row and at least one data row.");
        return;
      }
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, ""));
      const headerMap: Record<string, string> = {
        firstname: "firstName",
        lastname: "lastName",
        email: "email",
        phone: "phone",
        linkedin: "linkedinUrl",
        linkedinurl: "linkedinUrl",
        notes: "notes",
      };

      const parsed = lines.slice(1).map((line) => {
        const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          const key = headerMap[h] ?? h;
          obj[key] = values[i] ?? "";
        });
        return obj;
      });

      setRows(parsed.filter((r) => r.email));
      setParseError(null);
    };
    reader.readAsText(file);
  }, []);

  const onImport = async () => {
    try {
      const res = await importCandidates(rows);
      const { created, skipped, errors } = res.data;
      if (errors.length > 0) {
        toast.warning(`${created} created, ${skipped} skipped. ${errors.length} error(s).`);
      } else {
        toast.success(`${created} candidate${created !== 1 ? "s" : ""} imported, ${skipped} skipped`);
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? "Import failed");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold">Import Candidates from CSV</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Expected CSV columns:</p>
            <code className="text-xs">firstName, lastName, email, phone (opt), linkedinUrl (opt), notes (opt)</code>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition"
          >
            <Upload className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />
            <p className="text-sm font-medium">Drop a CSV file or click to browse</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>

          {parseError && <p className="text-destructive text-sm">{parseError}</p>}

          {rows.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">{rows.length} rows found — preview (first 5)</div>
              <div className="divide-y divide-border max-h-40 overflow-y-auto">
                {rows.slice(0, 5).map((r, i) => (
                  <div key={i} className="px-3 py-2 text-sm flex items-center gap-2">
                    <span className="font-medium">{r.firstName} {r.lastName}</span>
                    <span className="text-muted-foreground">{r.email}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="p-6 border-t border-border flex gap-3">
          <button
            onClick={onImport}
            disabled={rows.length === 0 || isPending}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Import {rows.length > 0 ? `${rows.length} candidates` : ""}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm text-muted-foreground border border-border hover:bg-accent transition">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Candidate Form ───────────────────────────────────────────────────────────

function CandidateForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: Partial<CandidateCreateInput>;
  onSave: (d: CandidateCreateInput) => Promise<void>;
  onCancel: () => void;
  isPending: boolean;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<CandidateCreateInput>({
    resolver: zodResolver(CandidateCreateSchema),
    defaultValues: initial,
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-4 bg-white border border-border rounded-xl p-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">First name</label>
          <input {...register("firstName")} placeholder="Jane" className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
          {errors.firstName && <p className="text-destructive text-xs mt-1">{errors.firstName.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Last name</label>
          <input {...register("lastName")} placeholder="Smith" className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
          {errors.lastName && <p className="text-destructive text-xs mt-1">{errors.lastName.message}</p>}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
        <input {...register("email")} type="email" placeholder="jane@example.com" className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
        {errors.email && <p className="text-destructive text-xs mt-1">{errors.email.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Phone <span className="text-muted-foreground font-normal">(optional)</span></label>
          <input {...register("phone")} placeholder="+1 555 0100" className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">LinkedIn URL <span className="text-muted-foreground font-normal">(optional)</span></label>
          <input {...register("linkedinUrl")} placeholder="https://linkedin.com/in/..." className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
          {errors.linkedinUrl && <p className="text-destructive text-xs mt-1">{errors.linkedinUrl.message}</p>}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Resume URL <span className="text-muted-foreground font-normal">(optional)</span></label>
        <input {...register("resumeUrl")} placeholder="https://example.com/resume.pdf" className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
        {errors.resumeUrl && <p className="text-destructive text-xs mt-1">{errors.resumeUrl.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
        <textarea {...register("notes")} rows={3} placeholder="Source, referral, any relevant context…" className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none transition" />
      </div>

      <div className="flex gap-3 pt-1">
        <button type="submit" disabled={isPending} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition">
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />} Save candidate
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-muted-foreground border border-border hover:bg-accent transition">Cancel</button>
      </div>
    </form>
  );
}

// ─── Sort Button ──────────────────────────────────────────────────────────────

function SortButton({
  label,
  field,
  current,
  order,
  onClick,
}: {
  label: string;
  field: string;
  current: string;
  order: string;
  onClick: (field: string) => void;
}) {
  const active = current === field;
  return (
    <button
      onClick={() => onClick(field)}
      className={cn("flex items-center gap-1 text-xs font-medium transition", active ? "text-primary" : "text-muted-foreground hover:text-foreground")}
    >
      {label}
      {active ? (
        order === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
      ) : (
        <ChevronDown className="w-3 h-3 opacity-40" />
      )}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CandidatesPage() {
  const { activeOrgId } = useActiveOrg();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useCandidates(activeOrgId, {
    search: search || undefined,
    sortBy,
    sortOrder,
    page,
    limit: 20,
  });

  const myRole = useMyRole(activeOrgId);
  const canWrite = canManageCandidates(myRole);

  const { mutateAsync: create, isPending: creating } = useCreateCandidate(activeOrgId!);
  const { mutateAsync: update, isPending: updating } = useUpdateCandidate(activeOrgId!);
  const { mutateAsync: remove } = useDeleteCandidate(activeOrgId!);

  const candidates: any[] = data?.data ?? [];
  const meta = data?.meta;

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const handleCreate = async (d: CandidateCreateInput) => {
    try {
      await create(d);
      toast.success("Candidate added");
      setShowCreate(false);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleUpdate = async (id: string, d: CandidateCreateInput) => {
    try {
      await update({ id, data: d });
      toast.success("Candidate updated");
      setEditingId(null);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from your organization?`)) return;
    try {
      await remove(id);
      toast.success("Candidate removed");
    } catch (err: any) { toast.error(err.message); }
  };

  if (!activeOrgId) {
    return <div className="text-center py-16 text-muted-foreground">No organization selected.</div>;
  }

  return (
    <div>
      {showImport && <CSVImportModal orgId={activeOrgId} onClose={() => setShowImport(false)} />}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Candidates</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {meta ? `${meta.total} candidate${meta.total !== 1 ? "s" : ""} in this organization` : "Manage your candidate pipeline."}
          </p>
        </div>
        <div className="flex gap-2">
          {canWrite && (
            <button onClick={() => setShowImport(true)} className="flex items-center gap-2 border border-border text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent transition">
              <Upload className="w-4 h-4" /> Import CSV
            </button>
          )}
          {canWrite && (
            <button onClick={() => { setShowCreate(true); setEditingId(null); }} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition">
              <Plus className="w-4 h-4" /> Add candidate
            </button>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="mb-6">
          <CandidateForm onSave={handleCreate} onCancel={() => setShowCreate(false)} isPending={creating} />
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by name or email…"
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : candidates.length === 0 ? (
        <div className="bg-white border border-dashed border-border rounded-xl p-12 text-center">
          <UserCircle className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="font-medium text-foreground">No candidates found</p>
          <p className="text-sm text-muted-foreground mt-1">
            {search ? "Try a different search term" : "Add your first candidate or import from a CSV file"}
          </p>
        </div>
      ) : (
        <div className={cn("bg-white border border-border rounded-xl overflow-hidden", isFetching && "opacity-60 transition-opacity")}>
          {/* Table header */}
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-border bg-muted/30 text-xs">
            <SortButton label="Name" field="firstName" current={sortBy} order={sortOrder} onClick={toggleSort} />
            <SortButton label="Email" field="email" current={sortBy} order={sortOrder} onClick={toggleSort} />
            <SortButton label="Added" field="createdAt" current={sortBy} order={sortOrder} onClick={toggleSort} />
            <span />
          </div>

          <div className="divide-y divide-border">
            {candidates.map((c: any) => (
              <div key={c.id}>
                {editingId === c.id ? (
                  <div className="p-4">
                    <CandidateForm
                      initial={{ firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone ?? "", resumeUrl: c.resumeUrl ?? "", linkedinUrl: c.linkedinUrl ?? "", notes: c.notes ?? "" }}
                      onSave={(d) => handleUpdate(c.id, d)}
                      onCancel={() => setEditingId(null)}
                      isPending={updating}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-4 px-5 py-4 items-center hover:bg-accent/20 transition">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                        {c.firstName[0]}{c.lastName[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{c.firstName} {c.lastName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {c.phone && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{c.phone}</span>}
                          {c._count?.interviewSessions > 0 && (
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                              {c._count.interviewSessions} session{c._count.interviewSessions !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 min-w-0">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground truncate">{c.email}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(c.createdAt), "MMM d, yyyy")}
                      </span>
                      <div className="flex items-center gap-1">
                        {c.linkedinUrl && (
                          <a href={c.linkedinUrl} target="_blank" rel="noreferrer" className="p-1 rounded text-muted-foreground hover:text-primary transition" title="LinkedIn">
                            <Linkedin className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {c.resumeUrl && (
                          <a href={c.resumeUrl} target="_blank" rel="noreferrer" className="p-1 rounded text-muted-foreground hover:text-primary transition" title="Resume">
                            <FileText className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>

                    {canWrite && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditingId(c.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(c.id, `${c.firstName} ${c.lastName}`)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, meta.total)} of {meta.total}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg border border-border hover:bg-accent disabled:opacity-40 transition">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))} disabled={page === meta.totalPages} className="p-1.5 rounded-lg border border-border hover:bg-accent disabled:opacity-40 transition">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
