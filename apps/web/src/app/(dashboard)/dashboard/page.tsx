"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "@/lib/auth-client";
import { useAnalytics, type Preset } from "@/hooks/use-analytics";
import { useActiveOrg } from "@/hooks/use-organization";
import { useRouter } from "next/navigation";
import { Loader2, Users, Calendar, CheckCheck, Clock, PlayCircle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useMyRole } from "@/hooks/use-organizations";

const PRESETS: { label: string; value: Preset }[] = [
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "6m", value: "180d" },
  { label: "1y", value: "365d" },
];

const SCORE_COLOR = (s: number) =>
  s >= 4 ? "#16a34a" : s >= 3 ? "#d97706" : "#dc2626";

function useCountUp(target: number, duration = 800) {
  const [count, setCount] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    if (target === prev.current) return;
    const start = prev.current;
    const diff = target - start;
    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // cubic ease-out
      setCount(Math.round(start + diff * ease));
      if (progress < 1) requestAnimationFrame(step);
      else prev.current = target;
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return count;
}

function StatCard({
  label, value, sub, icon: Icon, gradient, delay = 0,
}: {
  label: string;
  value: number;
  sub?: string;
  icon: React.ElementType;
  gradient: string;
  delay?: number;
}) {
  const [visible, setVisible] = useState(false);
  const count = useCountUp(visible ? value : 0);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div
      className="relative bg-white rounded-2xl p-5 overflow-hidden card-hover border border-border/60 shadow-sm"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transition: `opacity 0.4s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.4s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {/* Soft glow blob */}
      <div className={cn("absolute top-0 right-0 w-28 h-28 rounded-full opacity-[0.08] blur-2xl -translate-y-6 translate-x-6", gradient)} />
      <div className="flex items-start justify-between mb-4">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className={cn("p-2.5 rounded-xl shadow-md", gradient)}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <p className="text-3xl font-bold text-foreground tabular-nums">{count}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
    </div>
  );
}

function SessionRow({ s, index, onClick }: { s: any; index: number; onClick: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 300 + index * 70);
    return () => clearTimeout(t);
  }, [index]);

  return (
    <button
      onClick={onClick}
      className="group w-full flex items-center justify-between px-6 py-4 hover:bg-accent/40 transition-all duration-150 text-left border-b border-border/60 last:border-0"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : "translateX(-12px)",
        transition: `opacity 0.35s ease ${300 + index * 70}ms, transform 0.35s ease ${300 + index * 70}ms`,
      }}
    >
      <div className="min-w-0 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-primary/8 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors group-hover:scale-110 duration-200">
          <Calendar className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{s.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {s.candidateName} · {s.completedAt ? format(new Date(s.completedAt), "MMM d, yyyy") : "—"}
          </p>
        </div>
      </div>
      {s.avg != null ? (
        <span className="text-sm font-bold tabular-nums shrink-0 ml-3 px-2.5 py-0.5 rounded-lg bg-muted/60 group-hover:scale-105 transition-transform" style={{ color: SCORE_COLOR(s.avg) }}>
          {s.avg}/5
        </span>
      ) : (
        <span className="text-xs text-muted-foreground shrink-0 ml-3 px-2.5 py-0.5 rounded-lg bg-muted/60">Not scored</span>
      )}
    </button>
  );
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const { activeOrgId } = useActiveOrg();
  const router = useRouter();
  const [preset, setPreset] = useState<Preset>("30d");
  const [headerVisible, setHeaderVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setHeaderVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  const { data, isLoading, isFetching } = useAnalytics(activeOrgId, preset);
  const analytics = data?.data;
  const myRole = useMyRole(activeOrgId);
  const roleResolved = myRole !== null;
  const isOrgMember = myRole === "ORG_MEMBER";

  const firstName = session?.user?.name?.split(" ")[0];

  return (
    <div>
      {/* Header */}
      <div
        className="flex items-center justify-between mb-8"
        style={{
          opacity: headerVisible ? 1 : 0,
          transform: headerVisible ? "translateY(0)" : "translateY(-10px)",
          transition: "opacity 0.5s ease, transform 0.5s ease",
        }}
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Welcome back{firstName ? `, ${firstName}` : ""} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Here's your interview activity overview.</p>
        </div>

        <div className="flex items-center gap-1 bg-white rounded-xl p-1 border border-border shadow-sm">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPreset(p.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
                preset === p.value
                  ? "bg-primary text-primary-foreground shadow-sm scale-[1.03]"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {!activeOrgId ? (
        <div className="bg-white border border-dashed border-border rounded-2xl p-16 text-center animate-fade-in-up">
          <p className="text-muted-foreground">Select an organization to view analytics.</p>
        </div>
      ) : isLoading || !roleResolved ? (
        <div className="flex justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className={cn(isFetching && "opacity-70 transition-opacity duration-300")}>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {isOrgMember ? (
              <>
                <StatCard label="Scheduled" value={analytics?.overview.scheduledCount ?? 0} sub="awaiting start" icon={Calendar} gradient="bg-blue-500" delay={0} />
                <StatCard label="In Progress" value={analytics?.overview.inProgressCount ?? 0} sub="currently active" icon={PlayCircle} gradient="bg-amber-500" delay={80} />
                <StatCard label="Completed" value={analytics?.overview.completedCount ?? 0} sub="in this period" icon={CheckCheck} gradient="bg-emerald-500" delay={160} />
                <StatCard label="Total Interviews" value={analytics?.overview.totalSessions ?? 0} sub="all statuses" icon={Clock} gradient="bg-violet-500" delay={240} />
              </>
            ) : (
              <>
                <StatCard label="Scheduled" value={analytics?.overview.scheduledCount ?? 0} sub="awaiting start" icon={Calendar} gradient="bg-blue-500" delay={0} />
                <StatCard label="In Progress" value={analytics?.overview.inProgressCount ?? 0} sub="currently active" icon={PlayCircle} gradient="bg-amber-500" delay={80} />
                <StatCard label="Completed" value={analytics?.overview.completedCount ?? 0} sub="in this period" icon={CheckCheck} gradient="bg-emerald-500" delay={160} />
                <StatCard label="Candidates" value={analytics?.overview.candidateCount ?? 0} sub="in this period" icon={Users} gradient="bg-violet-500" delay={240} />
              </>
            )}
          </div>

          {/* Recent sessions */}
          <div
            className="bg-white border border-border/60 rounded-2xl overflow-hidden shadow-sm"
            style={{
              opacity: 1,
              animation: "fade-in-up 0.4s cubic-bezier(0.16,1,0.3,1) 200ms both",
            }}
          >
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                <h2 className="font-semibold text-sm">Recent Sessions</h2>
              </div>
              <button
                onClick={() => router.push("/sessions")}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-all hover:gap-1.5"
              >
                View all <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            {analytics?.recentSessions?.length > 0 ? (
              <div>
                {analytics.recentSessions.map((s: any, i: number) => (
                  <SessionRow key={s.id} s={s} index={i} onClick={() => router.push(`/sessions/${s.id}`)} />
                ))}
              </div>
            ) : (
              <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                No completed sessions in this period
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
