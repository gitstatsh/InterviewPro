"use client";

import { useQuery } from "@tanstack/react-query";
import type { CobraDashboard, CobraMappingIndex } from "@interview/shared";
import { api } from "@/lib/api";

export function useCobraDashboard() {
  return useQuery({
    queryKey: ["cobra", "dashboard"],
    queryFn: () => api.get<{ data: CobraDashboard }>("/cobra/dashboard"),
    refetchInterval: 5_000,
  });
}

export function useCobraMappings() {
  return useQuery({
    queryKey: ["cobra", "mappings"],
    queryFn: () => api.get<{ data: CobraMappingIndex | null }>("/cobra/mappings"),
  });
}
