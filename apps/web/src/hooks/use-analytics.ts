"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type Preset = "7d" | "30d" | "90d" | "180d" | "365d";

export function useAnalytics(orgId: string | null, preset: Preset = "30d") {
  return useQuery({
    queryKey: ["analytics", orgId, preset],
    queryFn: () =>
      api.get<{ data: any }>(`/analytics?preset=${preset}`, orgId ?? undefined),
    enabled: !!orgId,
    staleTime: 60_000,
  });
}
