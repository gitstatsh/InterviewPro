"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SessionCreateInput, SessionUpdateInput, SessionAnswerInput, AssignBankToSessionInput } from "@interview/shared";

export function useSessions(orgId: string | null, params: Record<string, any> = {}) {
  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""))
  ).toString();

  return useQuery({
    queryKey: ["sessions", orgId, params],
    queryFn: () =>
      api.get<{ data: any[]; meta: any }>(
        `/sessions${query ? `?${query}` : ""}`,
        orgId ?? undefined
      ),
    enabled: !!orgId,
  });
}

export function useSession(orgId: string | null, id: string | null) {
  return useQuery({
    queryKey: ["sessions", orgId, id],
    queryFn: () => api.get<{ data: any }>(`/sessions/${id}`, orgId ?? undefined),
    enabled: !!orgId && !!id,
    refetchInterval: (q) => {
      const status = (q.state.data as any)?.data?.status;
      return status === "IN_PROGRESS" ? 10000 : false;
    },
  });
}

export function useCreateSession(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SessionCreateInput) =>
      api.post<{ data: any }>("/sessions", data, orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions", orgId] }),
  });
}

export function useUpdateSession(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SessionUpdateInput }) =>
      api.patch<{ data: any }>(`/sessions/${id}`, data, orgId),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["sessions", orgId] });
      qc.invalidateQueries({ queryKey: ["sessions", orgId, id] });
    },
  });
}

export function useSessionLifecycle(orgId: string) {
  const qc = useQueryClient();
  const invalidate = (id: string) => {
    qc.invalidateQueries({ queryKey: ["sessions", orgId] });
    qc.invalidateQueries({ queryKey: ["sessions", orgId, id] });
  };

  const start = useMutation({
    mutationFn: (id: string) => api.post<{ data: any }>(`/sessions/${id}/start`, {}, orgId),
    onSuccess: (_, id) => invalidate(id),
  });

  const complete = useMutation({
    mutationFn: (id: string) => api.post<{ data: any }>(`/sessions/${id}/complete`, {}, orgId),
    onSuccess: (_, id) => invalidate(id),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.post<{ data: any }>(`/sessions/${id}/cancel`, {}, orgId),
    onSuccess: (_, id) => invalidate(id),
  });

  const reactivate = useMutation({
    mutationFn: (id: string) => api.post<{ data: any }>(`/sessions/${id}/reactivate`, {}, orgId),
    onSuccess: (_, id) => invalidate(id),
  });

  return { start, complete, cancel, reactivate };
}

export function useDeleteSession(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/sessions/${id}`, orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions", orgId] }),
  });
}

export function useUpsertAnswer(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, sqId, data }: { sessionId: string; sqId: string; data: SessionAnswerInput }) =>
      api.put<{ data: any }>(`/sessions/${sessionId}/questions/${sqId}/answer`, data, orgId),
    onSuccess: (_, { sessionId }) =>
      qc.invalidateQueries({ queryKey: ["sessions", orgId, sessionId] }),
  });
}

export function useAssignBank(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, data }: { sessionId: string; data: AssignBankToSessionInput }) =>
      api.post<{ data: any }>(`/sessions/${sessionId}/assign-bank`, data, orgId),
    onSuccess: (_, { sessionId }) => {
      qc.invalidateQueries({ queryKey: ["sessions", orgId] });
      qc.invalidateQueries({ queryKey: ["sessions", orgId, sessionId] });
    },
  });
}

export function useUpdateNotes(orgId: string) {
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      api.patch<{ data: any }>(`/sessions/${id}/notes`, { notes }, orgId),
  });
}
