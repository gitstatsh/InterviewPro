"use client";

import { useState } from "react";
import { useMembers, useInviteMember, useRemoveMember, useMyRole, canInviteMembers } from "@/hooks/use-organizations";
import { useActiveOrg } from "@/hooks/use-organization";
import { useSession } from "@/lib/auth-client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InviteMemberSchema, type InviteMemberInput } from "@interview/shared";
import { toast } from "sonner";
import { Loader2, UserPlus, Trash2, Search, ChevronLeft, ChevronRight } from "lucide-react";

const ROLE_BADGE: Record<string, string> = {
  OWNER: "bg-purple-100 text-purple-700",
  ORG_HR: "bg-emerald-100 text-emerald-700",
  ORG_MEMBER: "bg-amber-100 text-amber-700",
};

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  ORG_HR: "Org HR",
  ORG_MEMBER: "Org Member",
};

export default function MembersPage() {
  const { activeOrgId } = useActiveOrg();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showInvite, setShowInvite] = useState(false);

  const { data, isLoading, isFetching } = useMembers(activeOrgId, {
    search: search || undefined,
    page,
    limit: 10,
  });

  const { data: authData } = useSession();
  const currentUserId = authData?.user?.id;
  const myRole = useMyRole(activeOrgId);
  const canInvite = canInviteMembers(myRole);

  const { mutateAsync: invite, isPending: inviting } = useInviteMember(activeOrgId!);
  const { mutateAsync: remove } = useRemoveMember(activeOrgId!);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteMemberInput>({
    resolver: zodResolver(InviteMemberSchema),
    defaultValues: { role: "ORG_MEMBER" },
  });

  const members: any[] = data?.data ?? [];
  const meta = data?.meta;

  const onInvite = async (input: InviteMemberInput) => {
    try {
      await invite(input);
      toast.success(`Invite sent to ${input.email}`);
      reset();
      setShowInvite(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send invite");
    }
  };

  const onRemove = async (memberId: string, name: string) => {
    if (!confirm(`Remove ${name} from this organization?`)) return;
    try {
      await remove(memberId);
      toast.success(`${name} removed`);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to remove member");
    }
  };

  if (!activeOrgId) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>No organization selected.</p>
        <a href="/organizations/new" className="text-primary hover:underline text-sm mt-2 block">
          Create one to get started
        </a>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Members</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage who has access to this organization.
          </p>
        </div>
        {canInvite && (
          <button
            onClick={() => setShowInvite((v) => !v)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition"
          >
            <UserPlus className="w-4 h-4" />
            Invite member
          </button>
        )}
      </div>

      {/* Invite form */}
      {showInvite && (
        <form
          onSubmit={handleSubmit(onInvite)}
          className="bg-white border border-border rounded-xl p-6 mb-6"
        >
          <h2 className="text-sm font-semibold text-foreground mb-4">Invite a new member</h2>
          <div className="flex gap-3">
            <div className="flex-1">
              <input
                {...register("email")}
                type="email"
                placeholder="colleague@company.com"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
              />
              {errors.email && (
                <p className="text-destructive text-xs mt-1">{errors.email.message}</p>
              )}
            </div>
            <select
              {...register("role")}
              className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="ORG_MEMBER">Org Member</option>
              <option value="ORG_HR">Org HR</option>
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
            >
              {inviting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Send invite
            </button>
          </div>
        </form>
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
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="font-medium">No members found</p>
            <p className="text-sm mt-1">
              {search ? "Try a different search term" : "Invite your first team member above"}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">Member</th>
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">Role</th>
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">Joined</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className={isFetching ? "opacity-60 transition-opacity" : ""}>
              {members.map((m: any) => (
                <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm shrink-0">
                        {m.user.name?.[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-foreground">{m.user.name}</p>
                          {m.user.id === currentUserId && (
                            <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary leading-none">Me</span>
                          )}
                          {!m.user.emailVerified && m.user.id !== currentUserId && (
                            <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 leading-none">Pending</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{m.user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[m.role] ?? ""}`}>
                      {ROLE_LABELS[m.role] ?? m.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {new Date(m.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {m.role !== "OWNER" && m.user.id !== currentUserId && (
                      <button
                        onClick={() => onRemove(m.id, m.user.name)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
                        title="Remove member"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>
            {(page - 1) * 10 + 1}–{Math.min(page * 10, meta.total)} of {meta.total} members
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={page === meta.totalPages}
              className="p-1.5 rounded-lg border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
