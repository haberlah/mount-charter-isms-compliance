import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createElement, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { apiRequest, showToast } from "@/lib/api";

interface PaperAiPillEl extends HTMLElement {
  state?: Record<string, unknown>;
}

export function AiPillHost() {
  const ref = useRef<PaperAiPillEl | null>(null);
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const { data } = useQuery<Record<string, unknown>>({
    queryKey: ["ai-connections"],
    queryFn: () => apiRequest("GET", "/api/ai/connections"),
    staleTime: 20_000,
  });

  useEffect(() => {
    if (ref.current && data) {
      ref.current.state = data;
    }
  }, [data]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onSelect = async (e: Event) => {
      const providerId = (e as CustomEvent<{ providerId?: string }>).detail?.providerId;
      if (!providerId) return;
      try {
        await apiRequest("PUT", "/api/settings/profile", { aiProvider: providerId });
        void qc.invalidateQueries({ queryKey: ["ai-connections"] });
        void qc.invalidateQueries({ queryKey: ["settings-profile"] });
        showToast("Switched active AI connection", { tone: "ok" });
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to switch AI connection", {
          tone: "err",
        });
      }
    };
    const onOpenPrefs = () => {
      navigate("/settings?tab=ai");
    };
    el.addEventListener("paper-ai-select", onSelect);
    el.addEventListener("paper-ai-open-preferences", onOpenPrefs);
    return () => {
      el.removeEventListener("paper-ai-select", onSelect);
      el.removeEventListener("paper-ai-open-preferences", onOpenPrefs);
    };
  }, [navigate, qc]);

  return createElement("paper-ai-pill", { ref, mode: "single" });
}
