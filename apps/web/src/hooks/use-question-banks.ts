"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  QuestionBankCreateInput,
  QuestionBankUpdateInput,
  AddQuestionsToBankInput,
} from "@interview/shared";

const key = (orgId: string | null) => ["question-banks", orgId];

export function useQuestionBanks(orgId: string | null, params: Record<string, any> = {}) {
  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""))
  ).toString();

  return useQuery({
    queryKey: [...key(orgId), params],
    queryFn: () =>
      api.get<{ data: any[]; meta: any }>(
        `/question-banks${query ? `?${query}` : ""}`,
        orgId ?? undefined
      ),
    enabled: !!orgId,
  });
}

export function useQuestionBank(orgId: string | null, id: string | null) {
  return useQuery({
    queryKey: [...key(orgId), id],
    queryFn: () => api.get<{ data: any }>(`/question-banks/${id}`, orgId ?? undefined),
    enabled: !!orgId && !!id,
  });
}

export function useCreateQuestionBank(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: QuestionBankCreateInput) =>
      api.post<{ data: any }>("/question-banks", data, orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(orgId) }),
  });
}

export function useUpdateQuestionBank(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: QuestionBankUpdateInput }) =>
      api.patch<{ data: any }>(`/question-banks/${id}`, data, orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(orgId) }),
  });
}

export function useDeleteQuestionBank(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/question-banks/${id}`, orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(orgId) }),
  });
}

export function useAddQuestionsToBank(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bankId, data }: { bankId: string; data: AddQuestionsToBankInput }) =>
      api.post<{ data: any }>(`/question-banks/${bankId}/questions`, data, orgId),
    onSuccess: (_, { bankId }) => {
      qc.invalidateQueries({ queryKey: key(orgId) });
      qc.invalidateQueries({ queryKey: [...key(orgId), bankId] });
    },
  });
}

export function useRemoveQuestionFromBank(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bankId, questionId }: { bankId: string; questionId: string }) =>
      api.delete(`/question-banks/${bankId}/questions/${questionId}`, orgId),
    onSuccess: (_, { bankId }) => {
      qc.invalidateQueries({ queryKey: key(orgId) });
      qc.invalidateQueries({ queryKey: [...key(orgId), bankId] });
    },
  });
}

export function useShareQuestionBank(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, shared }: { id: string; shared: boolean }) =>
      api.post<{ data: any }>(`/question-banks/${id}/share`, { shared }, orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(orgId) }),
  });
}

export function useGenerateFromJD(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bankId, data }: { bankId: string; data: { jobDescription: string; count: number; difficulty: string } }) =>
      api.post<{ data: any }>(`/question-banks/${bankId}/generate-from-jd`, data, orgId),
    onSuccess: (_, { bankId }) => {
      qc.invalidateQueries({ queryKey: ["question-banks", orgId] });
      qc.invalidateQueries({ queryKey: ["question-banks", orgId, bankId] });
    },
  });
}
