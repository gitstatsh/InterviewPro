"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  OrganizationCreateInput,
  OrganizationUpdateInput,
  InviteMemberInput,
} from "@interview/shared";

export type MemberRole = "OWNER" | "ADMIN" | "ORG_HR" | "ORG_MEMBER" | "MEMBER";

export function useMyRole(activeOrgId: string | null): MemberRole | null {
  const { data } = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api.get<{ data: any[] }>("/organizations"),
    enabled: !!activeOrgId,
    retry: false,
  });
  if (!activeOrgId || !data?.data) return null;
  const org = data.data.find((o: any) => o.id === activeOrgId);
  return (org?.memberRole as MemberRole) ?? null;
}

export function canManageCandidates(role: MemberRole | null) {
  return role !== null && ["OWNER", "ADMIN", "ORG_HR"].includes(role);
}
export function canManageSessions(role: MemberRole | null) {
  return role !== null && ["OWNER", "ADMIN", "ORG_HR"].includes(role);
}
export function canManageContent(role: MemberRole | null) {
  return role !== null && ["OWNER", "ADMIN", "ORG_HR", "ORG_MEMBER", "MEMBER"].includes(role);
}
export function canDeleteSessions(role: MemberRole | null) {
  return role !== null && ["OWNER", "ADMIN", "ORG_HR"].includes(role);
}
export function canInviteMembers(role: MemberRole | null) {
  return role !== null && ["OWNER", "ADMIN", "ORG_HR"].includes(role);
}
export function canStartSession(role: MemberRole | null) {
  return role !== null && ["OWNER", "ADMIN", "ORG_MEMBER", "MEMBER"].includes(role);
}
export function canCompleteSession(role: MemberRole | null) {
  return role !== null && ["OWNER", "ADMIN", "ORG_HR", "ORG_MEMBER", "MEMBER"].includes(role);
}
export function isOwner(role: MemberRole | null) {
  return role === "OWNER";
}
export function isOrgHR(role: MemberRole | null) {
  return role === "ORG_HR";
}

export function useOrganizations() {
  return useQuery({
    queryKey: ["organizations"],
    queryFn: () => api.get<{ data: any[] }>("/organizations"),
  });
}

export function useOrganization(orgId: string | null) {
  return useQuery({
    queryKey: ["organizations", orgId],
    queryFn: () => api.get<{ data: any }>(`/organizations/${orgId}`),
    enabled: !!orgId,
  });
}

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: OrganizationCreateInput) =>
      api.post<{ data: any }>("/organizations", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["organizations"] }),
  });
}

export function useUpdateOrganization(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: OrganizationUpdateInput) =>
      api.patch<{ data: any }>(`/organizations/${orgId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["organizations"] }),
  });
}

export function useDeleteOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orgId: string) => api.delete(`/organizations/${orgId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["organizations"] }),
  });
}

export function useMembers(
  orgId: string | null,
  params: Record<string, any> = {}
) {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== "")
    )
  ).toString();

  return useQuery({
    queryKey: ["members", orgId, params],
    queryFn: () =>
      api.get<{ data: any[]; meta: any }>(
        `/organizations/${orgId}/members${query ? `?${query}` : ""}`,
        orgId!
      ),
    enabled: !!orgId,
  });
}

export function useInviteMember(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: InviteMemberInput) =>
      api.post<{ data: any }>(`/organizations/${orgId}/members/invite`, data, orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", orgId] }),
  });
}

export function useRemoveMember(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) =>
      api.delete(`/organizations/${orgId}/members/${memberId}`, orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", orgId] }),
  });
}
