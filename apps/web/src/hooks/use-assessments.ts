"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AssessmentUpsertInput, BulkAssessmentInput } from "@interview/shared";

export function useSessionAssessment(orgId: string | null, sessionId: string | null) {
  return useQuery({
    queryKey: ["assessments", orgId, sessionId],
    queryFn: () =>
      api.get<{ data: any }>(`/sessions/${sessionId}/assessment`, orgId ?? undefined),
    enabled: !!orgId && !!sessionId,
  });
}

export function useUpsertAssessment(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ answerId, data }: { answerId: string; data: AssessmentUpsertInput }) =>
      api.put<{ data: any }>(`/answers/${answerId}/assessment`, data, orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assessments", orgId] }),
  });
}

export function useBulkAssess(orgId: string, sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BulkAssessmentInput) =>
      api.post<{ data: any[] }>(`/sessions/${sessionId}/assessments`, data, orgId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessments", orgId, sessionId] });
    },
  });
}
