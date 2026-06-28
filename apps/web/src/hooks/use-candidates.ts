"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CandidateCreateInput, CandidateUpdateInput } from "@interview/shared";

export function useCandidates(orgId: string | null, params: Record<string, any> = {}) {
  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""))
  ).toString();

  return useQuery({
    queryKey: ["candidates", orgId, params],
    queryFn: () =>
      api.get<{ data: any[]; meta: any }>(
        `/candidates${query ? `?${query}` : ""}`,
        orgId ?? undefined
      ),
    enabled: !!orgId,
  });
}

export function useCandidate(orgId: string | null, id: string | null) {
  return useQuery({
    queryKey: ["candidates", orgId, id],
    queryFn: () => api.get<{ data: any }>(`/candidates/${id}`, orgId ?? undefined),
    enabled: !!orgId && !!id,
  });
}

export function useCreateCandidate(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CandidateCreateInput) =>
      api.post<{ data: any }>("/candidates", data, orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["candidates", orgId] }),
  });
}

export function useUpdateCandidate(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CandidateUpdateInput }) =>
      api.patch<{ data: any }>(`/candidates/${id}`, data, orgId),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["candidates", orgId] });
      qc.invalidateQueries({ queryKey: ["candidates", orgId, id] });
    },
  });
}

export function useDeleteCandidate(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/candidates/${id}`, orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["candidates", orgId] }),
  });
}

export function useImportCandidates(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: any[]) =>
      api.post<{ data: { created: number; skipped: number; errors: string[] } }>(
        "/candidates/import",
        { rows },
        orgId
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["candidates", orgId] }),
  });
}
