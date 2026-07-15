"use client";

import type { CobraBuild } from "@interview/shared";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Code2,
  FileCode2,
  GitCommitHorizontal,
  Loader2,
  ShieldCheck,
  TestTube2,
  XCircle,
} from "lucide-react";
import { useCobraDashboard, useCobraMappings } from "@/hooks/use-cobra";
import { cn } from "@/lib/utils";

function statusStyle(status: CobraBuild["status"]) {
  if (status === "passed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "failed") return "bg-red-50 text-red-700 border-red-200";
  if (status === "running") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function StatusIcon({ status }: { status: CobraBuild["status"] }) {
  if (status === "passed") return <CheckCircle2 className="h-4 w-4" />;
  if (status === "failed") return <XCircle className="h-4 w-4" />;
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin" />;
  return <Clock3 className="h-4 w-4" />;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="rounded-xl bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></span>
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function BuildDetails({ build }: { build: CobraBuild }) {
  const executed = new Map(build.executedTests.map((test) => [test.testId, test]));
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-2xl border border-border/60 bg-white shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Changed files</h2>
          <p className="mt-1 text-xs text-muted-foreground">Commit {build.commitSha.slice(0, 12)} on {build.branch}</p>
        </div>
        <div className="divide-y divide-border/60">
          {build.selection.changedFiles.length ? build.selection.changedFiles.map((file) => (
            <div key={file.path} className="flex items-start gap-3 px-5 py-3">
              <FileCode2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="break-all text-sm font-medium">{file.path}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{file.status} · {file.lines.length ? `${file.lines.length} changed lines` : "whole file"}</p>
              </div>
            </div>
          )) : <p className="px-5 py-8 text-center text-sm text-muted-foreground">No changed files supplied.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-border/60 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold">Recommended tests</h2>
            <p className="mt-1 text-xs text-muted-foreground">{build.selection.mode === "full-regression" ? "Full regression safety fallback" : "Mapped impact selection"}</p>
          </div>
          <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", build.selection.mode === "full-regression" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-violet-200 bg-violet-50 text-violet-700")}>{build.selection.mode}</span>
        </div>
        <div className="max-h-80 divide-y divide-border/60 overflow-auto">
          {build.selection.recommendedTests.length ? build.selection.recommendedTests.map((testId) => {
            const result = executed.get(testId);
            return (
              <div key={testId} className="flex items-center justify-between gap-3 px-5 py-3">
                <p className="text-sm">{testId}</p>
                <span className="shrink-0 text-xs text-muted-foreground">{result ? `${result.status} · ${result.durationMs}ms` : "recommended"}</span>
              </div>
            );
          }) : <p className="px-5 py-8 text-center text-sm text-muted-foreground">No tests required for this change.</p>}
        </div>
      </section>
    </div>
  );
}

export default function CobraPage() {
  const dashboardQuery = useCobraDashboard();
  const mappingsQuery = useCobraMappings();
  const dashboard = dashboardQuery.data?.data;
  const mapping = mappingsQuery.data?.data;
  const latest = dashboard?.builds[0];

  if (dashboardQuery.isLoading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (dashboardQuery.isError || !dashboard) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-red-700">COBRA dashboard data could not be loaded.</div>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary"><ShieldCheck className="h-4 w-4" /> Code OBserver and Risk Analytics</div>
          <h1 className="text-2xl font-bold">COBRA coverage dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Change impact, selective automation, and per-test V8 coverage.</p>
        </div>
        <span className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", dashboard.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600")}>{dashboard.enabled ? "Engine enabled" : "Read-only"}</span>
      </header>

      {!dashboard.mapping.ready && (
        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div><p className="font-semibold">Source baseline mapping required</p><p className="text-sm">Run <code>corepack pnpm cobra:baseline</code> against a commit-matched deployment with source maps. Until then, every change safely falls back to full regression.</p></div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="Mapped tests" value={dashboard.mapping.testCount} icon={TestTube2} />
        <Metric label="Mapped files" value={dashboard.mapping.fileCount} icon={Code2} />
        <Metric label="Builds observed" value={dashboard.builds.length} icon={GitCommitHorizontal} />
        <Metric label="Latest duration" value={latest?.durationMs != null ? `${(latest.durationMs / 1000).toFixed(1)}s` : "—"} icon={Activity} />
      </div>

      {latest ? <BuildDetails build={latest} /> : (
        <div className="rounded-2xl border border-dashed border-border bg-white p-12 text-center text-sm text-muted-foreground">No Git push has been analyzed yet.</div>
      )}

      <section className="rounded-2xl border border-border/60 bg-white shadow-sm">
        <div className="border-b border-border px-5 py-4"><h2 className="font-semibold">Build history</h2><p className="mt-1 text-xs text-muted-foreground">Status and selection decisions across pushes.</p></div>
        <div className="divide-y divide-border/60">
          {dashboard.builds.length ? dashboard.builds.map((build) => (
            <div key={build.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="flex items-center gap-3"><GitCommitHorizontal className="h-4 w-4 text-muted-foreground" /><div><p className="text-sm font-medium">{build.commitSha.slice(0, 12)} <span className="font-normal text-muted-foreground">· {build.branch}</span></p><p className="mt-0.5 text-xs text-muted-foreground">{new Date(build.receivedAt).toLocaleString()} · {build.selection.recommendedTests.length} recommended · {build.selection.skippedTests.length} skipped</p></div></div>
              <span className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", statusStyle(build.status))}><StatusIcon status={build.status} />{build.status}</span>
            </div>
          )) : <p className="px-5 py-8 text-center text-sm text-muted-foreground">No build history.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-border/60 bg-white shadow-sm">
        <div className="border-b border-border px-5 py-4"><h2 className="font-semibold">Test → code mapping</h2><p className="mt-1 text-xs text-muted-foreground">Baseline {mapping?.baselineRunId ?? "not available"}</p></div>
        <div className="divide-y divide-border/60">
          {mapping?.tests.length ? mapping.tests.map((test) => (
            <details key={test.testId} className="group px-5 py-3">
              <summary className="cursor-pointer list-none text-sm font-medium">{test.testId}<span className="ml-2 text-xs font-normal text-muted-foreground">{test.files.length} files</span></summary>
              <div className="mt-3 space-y-2 border-l-2 border-primary/20 pl-4">{test.files.map((file) => <div key={file.path}><p className="break-all text-xs font-medium">{file.path}</p><p className="text-xs text-muted-foreground">Lines {file.linesTouched.join(", ") || "—"}</p></div>)}</div>
            </details>
          )) : <p className="px-5 py-8 text-center text-sm text-muted-foreground">No mapping data.</p>}
        </div>
      </section>
    </div>
  );
}
