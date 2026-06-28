"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const ORG_KEY = "active_org_id";

export function useActiveOrg() {
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);

  // Fetch the user's real org list to validate the stored ID
  const { data: orgsData } = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api.get<{ data: any[] }>("/organizations"),
    staleTime: 30000,
  });

  useEffect(() => {
    const stored = localStorage.getItem(ORG_KEY);
    if (!stored) return;

    // Once we have the orgs list, validate the stored ID
    if (orgsData) {
      const orgs: any[] = orgsData.data ?? [];
      const valid = orgs.find((o) => o.id === stored);
      if (valid) {
        setActiveOrgIdState(stored);
      } else {
        // Stale ID — clear it and auto-select the first available org
        localStorage.removeItem(ORG_KEY);
        if (orgs.length > 0) {
          localStorage.setItem(ORG_KEY, orgs[0].id);
          setActiveOrgIdState(orgs[0].id);
        } else {
          setActiveOrgIdState(null);
        }
      }
    } else {
      // Orgs not loaded yet — use stored value optimistically
      setActiveOrgIdState(stored);
    }
  }, [orgsData]);

  const setActiveOrgId = useCallback((id: string | null) => {
    if (id) {
      localStorage.setItem(ORG_KEY, id);
    } else {
      localStorage.removeItem(ORG_KEY);
    }
    setActiveOrgIdState(id);
  }, []);

  return { activeOrgId, setActiveOrgId };
}
