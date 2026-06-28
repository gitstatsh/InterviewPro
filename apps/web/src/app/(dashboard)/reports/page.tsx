"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSessions } from "@/hooks/use-sessions";
import { useActiveOrg } from "@/hooks/use-organization";
import { useDownloadPDF } from "@/hooks/use-reports";
import { toast } from "sonner";
import {
  Loader2, FileText, Download, Eye, Search, ChevronLeft, ChevronRight, User, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export default function ReportsPage() {
  const { activeOrgId } = useActiveOrg();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching } = useSessions(activeOrgId, {
    search: search || undefined,
    status: "COMPLETED",
    page,
    limit: 20,
  });

  const { mutateAsync: downloadPDF, isPending: downloading } = useDownloadPDF(activeOrgId ?? "");

  const sessions: any[] = data?.data ?? [];
  const meta = data?.meta;

  const handleDownload = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await downloadPDF(sessionId);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to download PDF");
    }
  };

  if (!activeOrgId) {
    return <div className="text-center py-16 text-muted-foreground">No organisation selected.</div>;
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {meta ? `${meta.total} completed interview${meta.total !== 1 ? "s" : ""} with reports` : "View and download interview reports."}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by candidate or session title…"
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-white border border-dashed border-border rounded-xl p-12 text-center">
          <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="font-medium text-foreground">No completed interviews yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            {search ? "Try adjusting your search" : "Reports are generated once an interview session is completed"}
          </p>
        </div>
      ) : (
        <div className={cn("space-y-3", isFetching && "opacity-60 transition-opacity")}>
          {sessions.map((s: any, i: number) => (
            <div
              key={s.id}
              className="group bg-white border border-border rounded-2xl overflow-hidden hover:border-primary/40 hover:shadow-lg transition-all duration-200 cursor-pointer card-hover"
              style={{
                opacity: 0,
                animation: `fade-in-up 0.35s cubic-bezier(0.16,1,0.3,1) ${i * 60}ms both`,
              }}
              onClick={() => router.push(`/sessions/${s.id}/report?from=reports`)}
            >
              {/* Emerald accent bar */}
              <div className="h-0.5 w-full bg-emerald-400" />
              <div className="p-5 flex items-center justify-between gap-4">
                <div className="min-w-0 flex gap-4 flex-1">
                  {/* Report icon */}
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
                    <FileText className="w-4.5 h-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        Completed
                      </span>
                      {s.aiSummary && (
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700">
                          ✦ AI Summary
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-foreground text-[15px] truncate group-hover:text-primary transition-colors">{s.title}</p>
                    <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground flex-wrap">
                      {s.candidate && (
                        <span className="flex items-center gap-1.5">
                          <User className="w-3 h-3" />
                          {s.candidate.firstName} {s.candidate.lastName}
                        </span>
                      )}
                      {s.completedAt && (
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3 h-3" />
                          Completed {format(new Date(s.completedAt), "MMM d, yyyy")}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full bg-muted">
                        {s._count?.questions ?? s.questions?.length ?? 0} questions
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => router.push(`/sessions/${s.id}/report?from=reports`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted-foreground border border-border hover:bg-accent hover:text-foreground transition"
                  >
                    <Eye className="w-3.5 h-3.5" /> View
                  </button>
                  <button
                    onClick={(e) => handleDownload(s.id, e)}
                    disabled={downloading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition shadow-sm"
                  >
                    {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    PDF
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-muted-foreground">
            Page {meta.page} of {meta.totalPages} · {meta.total} total
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={meta.page === 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border border-border hover:bg-accent disabled:opacity-50 transition"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={meta.page === meta.totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border border-border hover:bg-accent disabled:opacity-50 transition"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
