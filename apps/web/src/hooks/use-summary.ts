"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useAISummary(orgId: string | null, sessionId: string | null) {
  return useQuery({
    queryKey: ["summary", orgId, sessionId],
    queryFn: () =>
      api.get<{ data: { summary: any; sessionStatus: string } }>(
        `/sessions/${sessionId}/summary`,
        orgId ?? undefined
      ),
    enabled: !!orgId && !!sessionId,
    // Poll while pending
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.data?.summary;
      return s?.status === "pending" ? 3000 : false;
    },
  });
}

export function useGenerateSummary(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      api.post<{ data: { jobId: string; status: string } }>(
        `/sessions/${sessionId}/summary/generate`,
        {},
        orgId
      ),
    onSuccess: (_, sessionId) => {
      // Start polling
      qc.invalidateQueries({ queryKey: ["summary", orgId, sessionId] });
    },
  });
}
