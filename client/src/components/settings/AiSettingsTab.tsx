import type { AiProviderStatus, WorkspaceProfile } from "@shared/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createElement, useEffect, useRef, useState } from "react";
import { apiRequest, showToast } from "@/lib/api";

interface PaperAiConnectionsEl extends HTMLElement {
  state?: Record<string, unknown>;
}

export function AiSettingsTab({
  profile,
  costUsedTodayUsd = 0,
}: {
  profile?: WorkspaceProfile;
  aiStatus?: AiProviderStatus;
  costUsedTodayUsd?: number;
}) {
  const qc = useQueryClient();
  const hostRef = useRef<PaperAiConnectionsEl | null>(null);
  const [dailyBudget, setDailyBudget] = useState(String(profile?.aiDailyCostBudgetUsd ?? 5));
  const [maxChunks, setMaxChunks] = useState(String(profile?.aiMaxChunksPerRun ?? 25));

  useEffect(() => {
    if (profile) {
      setDailyBudget(String(profile.aiDailyCostBudgetUsd ?? 5));
      setMaxChunks(String(profile.aiMaxChunksPerRun ?? 25));
    }
  }, [profile]);

  const { data: snapshot, refetch } = useQuery<Record<string, unknown>>({
    queryKey: ["ai-connections"],
    queryFn: () => apiRequest("GET", "/api/ai/connections"),
  });

  useEffect(() => {
    if (hostRef.current && snapshot) {
      hostRef.current.state = snapshot;
    }
  }, [snapshot]);

  const testMut = useMutation({
    mutationFn: () =>
      apiRequest<{ provider: string; model: string }>("POST", "/api/settings/test-api"),
    onSuccess: (res) => {
      showToast(`Connected cleanly (${res.provider} · ${res.model})`, { tone: "ok" });
      void qc.invalidateQueries({ queryKey: ["ai-connections"] });
      void qc.invalidateQueries({ queryKey: ["settings-profile"] });
    },
    onError: (err) => {
      showToast(err instanceof Error ? err.message : "Connectivity check failed", { tone: "err" });
    },
  });

  const saveGuardrailsMut = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/settings/profile", {
        aiDailyCostBudgetUsd: Math.max(0.25, Math.min(250, Number(dailyBudget) || 5)),
        aiMaxChunksPerRun: Math.max(1, Math.min(100, Math.round(Number(maxChunks) || 25))),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings-profile"] });
      showToast("Saved compliance spend guardrails", { tone: "ok" });
    },
  });

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const refreshAll = async (force = false) => {
      if (force) {
        await apiRequest("GET", "/api/ai/connections?refresh=1");
      }
      await qc.invalidateQueries({ queryKey: ["ai-connections"] });
      await qc.invalidateQueries({ queryKey: ["settings-profile"] });
    };

    const onSelect = async (e: Event) => {
      const providerId = (e as CustomEvent<{ providerId?: string }>).detail?.providerId;
      if (!providerId) return;
      try {
        await apiRequest("PUT", "/api/settings/profile", { aiProvider: providerId });
        await refreshAll();
        showToast("Active AI connection updated", { tone: "ok" });
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Update failed", { tone: "err" });
      }
    };

    const onZdr = async (e: Event) => {
      const enabled = Boolean((e as CustomEvent<{ enabled?: boolean }>).detail?.enabled);
      try {
        await apiRequest("PUT", "/api/settings/profile", { aiZdrOnly: enabled });
        await refreshAll();
        showToast(
          enabled
            ? "Strict Zero Data Retention enabled (zdr: true · data_collection: deny)"
            : "Zero Data Retention relaxed",
          { tone: "ok" },
        );
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to update ZDR setting", {
          tone: "err",
        });
      }
    };

    const onPreset = async (e: Event) => {
      const preset = (e as CustomEvent<{ preset?: string }>).detail?.preset;
      if (!preset) return;
      try {
        await apiRequest("PUT", "/api/settings/profile", {
          aiRoutingPreset: preset,
          aiScreeningModel: "auto",
          aiSynthesisModel: "auto",
        });
        await refreshAll();
        showToast(`Switched routing preset to ${preset.replace("_", " ")}`, { tone: "ok" });
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to update preset", { tone: "err" });
      }
    };

    const onOpenRouterOAuth = async () => {
      try {
        await apiRequest("POST", "/api/ai/openrouter/oauth");
        showToast("Opened OpenRouter sign-in in your browser — return here once approved", {
          tone: "info",
        });
        // Poll briefly so UI turns green automatically after browser approval
        const poll = setInterval(() => {
          void refetch();
        }, 2500);
        setTimeout(() => clearInterval(poll), 60_000);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "OpenRouter sign-in failed", {
          tone: "err",
        });
      }
    };

    const onSsoStart = async (e: Event) => {
      const providerId = (e as CustomEvent<{ providerId?: string }>).detail?.providerId;
      if (!providerId) return;
      try {
        await apiRequest("POST", `/api/ai/cli/${encodeURIComponent(providerId)}/login`);
        showToast("Opened browser SSO sign-in — click Recheck once signed in", { tone: "info" });
        const poll = setInterval(() => {
          void refreshAll(true);
        }, 3000);
        setTimeout(() => clearInterval(poll), 45_000);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Sign-in launch failed", { tone: "err" });
      }
    };

    const onSignOut = async (e: Event) => {
      const providerId = (e as CustomEvent<{ providerId?: string }>).detail?.providerId;
      if (!providerId) return;
      try {
        await apiRequest("POST", `/api/ai/cli/${encodeURIComponent(providerId)}/logout`);
        await refreshAll(true);
        showToast("Signed out cleanly", { tone: "ok" });
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Sign-out failed", { tone: "err" });
      }
    };

    const onKeySave = async (e: Event) => {
      const detail = (e as CustomEvent<{ providerId?: string; apiKey?: string }>).detail;
      if (!detail?.providerId || !detail.apiKey) return;
      try {
        await apiRequest("POST", "/api/settings/api-key", {
          provider: detail.providerId,
          apiKey: detail.apiKey,
        });
        await refreshAll(true);
        showToast("API key saved securely to macOS Keychain", { tone: "ok" });
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to save key", { tone: "err" });
      }
    };

    const onKeyRemove = async (e: Event) => {
      const providerId = (e as CustomEvent<{ providerId?: string }>).detail?.providerId;
      if (!providerId) return;
      try {
        await apiRequest(
          "DELETE",
          `/api/settings/api-key?provider=${encodeURIComponent(providerId)}`,
        );
        await refreshAll(true);
        showToast("Removed API key from Keychain", { tone: "ok" });
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to remove key", { tone: "err" });
      }
    };

    const onRefresh = () => {
      void refreshAll(true);
    };

    el.addEventListener("paper-ai-select", onSelect);
    el.addEventListener("paper-ai-zdr-change", onZdr);
    el.addEventListener("paper-ai-preset-change", onPreset);
    el.addEventListener("paper-ai-openrouter-oauth", onOpenRouterOAuth);
    el.addEventListener("paper-ai-sso-start", onSsoStart);
    el.addEventListener("paper-ai-signout", onSignOut);
    el.addEventListener("paper-ai-key-save", onKeySave);
    el.addEventListener("paper-ai-key-remove", onKeyRemove);
    el.addEventListener("paper-ai-refresh", onRefresh);
    return () => {
      el.removeEventListener("paper-ai-select", onSelect);
      el.removeEventListener("paper-ai-zdr-change", onZdr);
      el.removeEventListener("paper-ai-preset-change", onPreset);
      el.removeEventListener("paper-ai-openrouter-oauth", onOpenRouterOAuth);
      el.removeEventListener("paper-ai-sso-start", onSsoStart);
      el.removeEventListener("paper-ai-signout", onSignOut);
      el.removeEventListener("paper-ai-key-save", onKeySave);
      el.removeEventListener("paper-ai-key-remove", onKeyRemove);
      el.removeEventListener("paper-ai-refresh", onRefresh);
    };
  }, [qc, refetch]);

  return (
    <div style={{ display: "grid", gap: "var(--paper-space-4)", maxWidth: 720 }}>
      {createElement("paper-ai-connections", {
        ref: hostRef,
        mode: "single",
        features: "zdr,presets,local,direct-keys",
      })}

      <section className="pp-card" style={{ display: "grid", gap: "var(--paper-space-3)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--paper-space-2)",
          }}
        >
          <div>
            <h3 className="pp-section-title" style={{ margin: 0 }}>
              Compliance Spend Guardrails &amp; Verification
            </h3>
            <p className="pp-meta" style={{ margin: "2px 0 0" }}>
              Today&apos;s recorded AI spend:{" "}
              <strong className="mw-mono">${costUsedTodayUsd.toFixed(4)} USD</strong>
            </p>
          </div>
          <button
            type="button"
            className="pp-button pp-button--sm"
            disabled={testMut.isPending}
            onClick={() => testMut.mutate()}
          >
            {testMut.isPending ? "Testing…" : "Test Connection"}
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "var(--paper-space-3)",
          }}
        >
          <label className="pp-field">
            <span className="pp-label">Daily USD Spend Cap</span>
            <input
              type="number"
              min="0.25"
              max="250"
              step="0.25"
              className="pp-input pp-input--sm"
              value={dailyBudget}
              onChange={(e) => setDailyBudget(e.target.value)}
            />
          </label>
          <label className="pp-field">
            <span className="pp-label">Max Evidence Chunks / Run</span>
            <input
              type="number"
              min="1"
              max="100"
              className="pp-input pp-input--sm"
              value={maxChunks}
              onChange={(e) => setMaxChunks(e.target.value)}
            />
          </label>
        </div>

        <div>
          <button
            type="button"
            className="pp-button pp-button--primary pp-button--sm"
            disabled={saveGuardrailsMut.isPending}
            onClick={() => saveGuardrailsMut.mutate()}
          >
            {saveGuardrailsMut.isPending ? "Saving…" : "Save Guardrails"}
          </button>
        </div>
      </section>
    </div>
  );
}
