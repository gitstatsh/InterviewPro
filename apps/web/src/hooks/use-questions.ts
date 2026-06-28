"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { QuestionCreateInput, QuestionUpdateInput, AIGenerateInput } from "@interview/shared";

export function useQuestions(orgId: string | null, params: Record<string, any> = {}) {
  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""))
  ).toString();

  return useQuery({
    queryKey: ["questions", orgId, params],
    queryFn: () =>
      api.get<{ data: any[]; meta: any }>(
        `/questions${query ? `?${query}` : ""}`,
        orgId ?? undefined
      ),
    enabled: !!orgId,
  });
}

export function useQuestion(orgId: string | null, id: string | null) {
  return useQuery({
    queryKey: ["questions", orgId, id],
    queryFn: () => api.get<{ data: any }>(`/questions/${id}`, orgId ?? undefined),
    enabled: !!orgId && !!id,
  });
}

export function useCreateQuestion(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: QuestionCreateInput) =>
      api.post<{ data: any }>("/questions", data, orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["questions", orgId] }),
  });
}

export function useUpdateQuestion(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: QuestionUpdateInput }) =>
      api.patch<{ data: any }>(`/questions/${id}`, data, orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["questions", orgId] }),
  });
}

export function useDeleteQuestion(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/questions/${id}`, orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["questions", orgId] }),
  });
}

export function useGenerateQuestions(orgId: string) {
  return useMutation({
    mutationFn: (data: AIGenerateInput) =>
      api.post<{ data: any[] }>("/questions/generate", data, orgId),
  });
}

export function useBulkSaveQuestions(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (questions: QuestionCreateInput[]) =>
      api.post<{ data: any[] }>("/questions/bulk", { questions }, orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["questions", orgId] }),
  });
}
