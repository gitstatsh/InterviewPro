"use client";

import { useState } from "react";
import { ChevronDown, Plus, Check, Building2 } from "lucide-react";
import { useOrganizations } from "@/hooks/use-organizations";
import { useActiveOrg } from "@/hooks/use-organization";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function OrgSwitcher() {
  const { data, isLoading } = useOrganizations();
  const { activeOrgId, setActiveOrgId } = useActiveOrg();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const orgs: any[] = data?.data ?? [];
  const active = orgs.find((o) => o.id === activeOrgId) ?? orgs[0];
  const isOwner = active?.memberRole === "OWNER";

  if (!activeOrgId && orgs.length > 0 && orgs[0]) {
    setActiveOrgId(orgs[0].id);
  }

  if (isLoading) {
    return <div className="h-9 w-full rounded-xl animate-pulse" style={{ background: "hsl(232 30% 16%)" }} />;
  }

  if (orgs.length === 0) {
    return (
      <button
        onClick={() => router.push("/organizations/new")}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-xl border border-dashed text-sm transition-colors text-slate-400 hover:text-white"
        style={{ borderColor: "hsl(232 30% 25%)" }}
      >
        <Plus className="w-4 h-4" />
        Create organization
      </button>
    );
  }

  const OrgAvatar = ({ org, size = "sm" }: { org: any; size?: "sm" | "xs" }) => {
    const dim = size === "sm" ? "w-7 h-7" : "w-6 h-6";
    return org?.logo ? (
      <img src={org.logo} alt={org.name} className={cn(dim, "rounded-lg object-contain shrink-0 bg-white p-0.5")} />
    ) : (
      <div className={cn(dim, "rounded-lg flex items-center justify-center shrink-0")} style={{ background: "hsl(234 89% 60% / 0.2)" }}>
        <Building2 className={cn(size === "sm" ? "w-3.5 h-3.5" : "w-3 h-3", "text-blue-400")} />
      </div>
    );
  };

  if (!isOwner) {
    return (
      <div className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-xl" style={{ background: "hsl(232 30% 15%)" }}>
        <OrgAvatar org={active} />
        <span className="flex-1 text-left text-sm font-medium truncate text-slate-200">
          {active?.name ?? "Select org"}
        </span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-xl transition-all duration-200 text-slate-200 hover:text-white"
        style={{ background: "hsl(232 30% 15%)" }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "hsl(232 30% 20%)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "hsl(232 30% 15%)"; }}
      >
        <OrgAvatar org={active} />
        <span className="flex-1 text-left text-sm font-medium truncate">
          {active?.name ?? "Select org"}
        </span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-slate-500 transition-transform duration-200 shrink-0", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-border rounded-xl shadow-xl z-50 py-1.5 overflow-hidden">
          {orgs.map((org: any) => (
            <button
              key={org.id}
              onClick={() => { setActiveOrgId(org.id); setOpen(false); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
              <OrgAvatar org={org} size="xs" />
              <span className="flex-1 text-left truncate text-foreground">{org.name}</span>
              {org.id === activeOrgId && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
            </button>
          ))}
          <div className="border-t border-border mt-1 pt-1">
            <button
              onClick={() => { setOpen(false); router.push("/organizations/new"); router.refresh(); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Plus className="w-4 h-4" />
              New organization
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
