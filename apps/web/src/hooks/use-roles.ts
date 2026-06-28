"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { RoleCreateInput, RoleUpdateInput, AssignRoleInput } from "@interview/shared";

export function useRoles(orgId: string | null, params: Record<string, any> = {}) {
  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined))
  ).toString();

  return useQuery({
    queryKey: ["roles", orgId, params],
    queryFn: () =>
      api.get<{ data: any[]; meta: any }>(
        `/roles${query ? `?${query}` : ""}`,
        orgId ?? undefined
      ),
    enabled: !!orgId,
  });
}

export function usePermissions() {
  return useQuery({
    queryKey: ["permissions"],
    queryFn: () => api.get<{ data: any[] }>("/permissions"),
    staleTime: Infinity,
  });
}

export function useCreateRole(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RoleCreateInput) =>
      api.post<{ data: any }>("/roles", data, orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles", orgId] }),
  });
}

export function useUpdateRole(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: RoleUpdateInput }) =>
      api.patch<{ data: any }>(`/roles/${id}`, data, orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles", orgId] }),
  });
}

export function useDeleteRole(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/roles/${id}`, orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles", orgId] }),
  });
}

export function useMemberRoles(orgId: string, memberId: string) {
  return useQuery({
    queryKey: ["member-roles", orgId, memberId],
    queryFn: () =>
      api.get<{ data: any[] }>(`/organizations/${orgId}/members/${memberId}/roles`, orgId),
    enabled: !!orgId && !!memberId,
  });
}

export function useAssignRole(orgId: string, memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AssignRoleInput) =>
      api.post(`/organizations/${orgId}/members/${memberId}/roles`, data, orgId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["member-roles", orgId, memberId] }),
  });
}

export function useRemoveRole(orgId: string, memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roleId: string) =>
      api.delete(`/organizations/${orgId}/members/${memberId}/roles/${roleId}`, orgId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["member-roles", orgId, memberId] }),
  });
}
