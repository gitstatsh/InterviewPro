"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useReport(orgId: string | null, sessionId: string | null) {
  return useQuery({
    queryKey: ["report", orgId, sessionId],
    queryFn: () => api.get<{ data: any }>(`/sessions/${sessionId}/report`, orgId ?? undefined),
    enabled: !!orgId && !!sessionId,
  });
}

export function useDownloadPDF(orgId: string) {
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/sessions/${sessionId}/report/pdf`,
        {
          credentials: "include",
          headers: { "x-organization-id": orgId },
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? "PDF generation failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `interview-report-${sessionId.slice(-8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });
}

export function useEmailReport(orgId: string) {
  return useMutation({
    mutationFn: ({ sessionId, recipients }: { sessionId: string; recipients: string[] }) =>
      api.post<{ data: { sent: boolean; recipients: string[] } }>(
        `/sessions/${sessionId}/report/email`,
        { recipients },
        orgId
      ),
  });
}
