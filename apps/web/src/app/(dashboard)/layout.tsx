"use client";

import { useSession } from "@/lib/auth-client";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/lib/auth-client";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Library,
  Calendar,
  FileText,
  Settings,
  LogOut,
  UserCircle,
  ShieldCheck,
} from "lucide-react";
import { OrgSwitcher } from "@/components/features/organizations/org-switcher";
import { useMyRole, canManageContent, canManageCandidates, canInviteMembers } from "@/hooks/use-organizations";
import { useActiveOrg } from "@/hooks/use-organization";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; roles?: "content" | "candidates" | "hr" | "any" };

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: "any" },
  { href: "/candidates", label: "Candidates", icon: Users, roles: "candidates" },
  { href: "/questions", label: "Questions", icon: Library, roles: "content" },
  { href: "/questions/banks", label: "Question Banks", icon: BookOpen, roles: "content" },
  { href: "/sessions", label: "Interviews", icon: Calendar, roles: "any" },
  { href: "/reports", label: "Reports", icon: FileText, roles: "any" },
  { href: "/cobra", label: "COBRA", icon: ShieldCheck, roles: "any" },
  { href: "/settings", label: "Org Settings", icon: Settings, roles: "hr" },
  { href: "/settings/members", label: "Members", icon: Users, roles: "hr" },
  { href: "/profile", label: "Profile", icon: UserCircle, roles: "any" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { activeOrgId } = useActiveOrg();
  const myRole = useMyRole(activeOrgId);
  const showContent = canManageContent(myRole);
  const showCandidates = canManageCandidates(myRole);

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    redirect("/login");
  }

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/login";
  };

  const filteredNav = NAV_ITEMS.filter((item) => {
    if (item.roles === "content") return showContent;
    if (item.roles === "candidates") return showCandidates;
    if (item.roles === "hr") return canInviteMembers(myRole);
    return true;
  });

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 flex flex-col h-screen sticky top-0 shrink-0" style={{ background: "hsl(232 44% 10%)" }}>
        {/* Top: logo + org switcher */}
        <div className="p-4 border-b" style={{ borderColor: "hsl(232 30% 16%)" }}>
          <div className="flex items-center gap-2.5 px-1 mb-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "hsl(234 89% 60%)" }}>
              <span className="text-white font-bold text-sm">I</span>
            </div>
            <span className="font-semibold text-white text-sm tracking-wide">InterviewPro</span>
          </div>
          <OrgSwitcher />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {filteredNav.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && item.href !== "/settings" && item.href !== "/questions" && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "text-white shadow-lg"
                    : "text-slate-400 hover:text-white"
                )}
                style={isActive ? {
                  background: "hsl(234 89% 60%)",
                  boxShadow: "0 4px 14px hsl(234 89% 60% / 0.35)",
                } : {}}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "hsl(232 30% 18%)"; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = ""; }}
              >
                <Icon className={cn("w-4 h-4 shrink-0 transition-transform duration-200", isActive ? "" : "group-hover:scale-110")} />
                {item.label}
                {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60" />}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: user + sign out */}
        <div className="p-3 border-t" style={{ borderColor: "hsl(232 30% 16%)" }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1" style={{ background: "hsl(232 30% 15%)" }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, hsl(234 89% 60%), hsl(262 83% 65%))" }}>
              {session.user.name?.[0]?.toUpperCase() ?? "U"}
            </div>
            <p className="text-sm font-medium text-white truncate flex-1">
              {session.user.name}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-red-400 transition-all duration-200"
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "hsl(0 60% 15%)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; }}
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
