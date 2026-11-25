import type {
  AiProvider,
  AiProviderStatus,
  ConcreteAiProvider,
  ProviderModelsResponse,
  WorkspaceProfile,
} from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Icon } from "@/components/PaperUi";
import { apiRequest, invalidateWorkspaceQueries, showToast } from "@/lib/api";

type ProviderMode = "api_key" | "local_oss" | "subscription_cli";

interface AiSettingsTabProps {
  profile: WorkspaceProfile | undefined;
  aiStatus: AiProviderStatus | undefined;
}

const CUSTOM_SENTINEL = "__custom__";

export function AiSettingsTab({ profile, aiStatus }: AiSettingsTabProps) {
  /** Saved routing preference: "auto" (auto-detect connected provider) or a pinned concrete provider */
  const [providerPref, setProviderPref] = useState<AiProvider>("auto");
  /** Currently inspected concrete provider card in the UI (never forces Anthropic when auto-detected) */
  const [viewedProvider, setViewedProvider] = useState<ConcreteAiProvider | null>(null);
  const [activeMode, setActiveMode] = useState<ProviderMode>("api_key");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [screeningModel, setScreeningModel] = useState("auto");
  const [synthesisModel, setSynthesisModel] = useState("auto");
  const [customScreening, setCustomScreening] = useState(false);
  const [customSynthesis, setCustomSynthesis] = useState(false);
  const [dailyBudget, setDailyBudget] = useState(250000);
  const [maxChunks, setMaxChunks] = useState(25);
  const [liveCatalog, setLiveCatalog] = useState<ProviderModelsResponse | null>(null);
  const [refreshingModels, setRefreshingModels] = useState(false);

  const providers = aiStatus?.providers || [];

  useEffect(() => {
    if (!profile) return;
    const pref = profile.aiProvider || "auto";
    setProviderPref(pref);
    const resolved: ConcreteAiProvider | null =
      pref !== "auto" ? pref : (aiStatus?.activeProvider ?? null);
    setViewedProvider(resolved);
    if (resolved) {
      const meta = aiStatus?.providers.find((p) => p.id === resolved);
      if (meta) setActiveMode(meta.mode);
    }
    setBaseUrl(profile.aiBaseUrl || "");
    setScreeningModel(profile.aiScreeningModel || "auto");
    setSynthesisModel(profile.aiSynthesisModel || "auto");
    setDailyBudget(profile.aiDailyTokenBudget);
    setMaxChunks(profile.aiMaxChunksPerRun);
  }, [profile, aiStatus?.activeProvider, aiStatus?.providers]);

  const effectiveConcrete: ConcreteAiProvider | null =
    viewedProvider ?? (providerPref !== "auto" ? providerPref : (aiStatus?.activeProvider ?? null));
  const activeMeta = effectiveConcrete
    ? providers.find((p) => p.id === effectiveConcrete)
    : undefined;

  const selectProviderCard = (next: ConcreteAiProvider) => {
    setProviderPref(next);
    setViewedProvider(next);
    setApiKeyInput("");
    setLiveCatalog(null);
    setCustomScreening(false);
    setCustomSynthesis(false);
    const meta = providers.find((p) => p.id === next);
    if (meta) {
      setActiveMode(meta.mode);
      setBaseUrl(meta.defaultBaseUrl || "");
    }
    // Always reset to "auto" on provider change so stale models from another vendor never linger
    setScreeningModel("auto");
    setSynthesisModel("auto");
  };

  const enableAutoDetect = () => {
    setProviderPref("auto");
    setViewedProvider(aiStatus?.activeProvider ?? null);
    setApiKeyInput("");
    setBaseUrl("");
    setScreeningModel("auto");
    setSynthesisModel("auto");
    setCustomScreening(false);
    setCustomSynthesis(false);
    setLiveCatalog(null);
    if (aiStatus?.activeProvider) {
      const meta = providers.find((p) => p.id === aiStatus.activeProvider);
      if (meta) setActiveMode(meta.mode);
    }
  };

  const selectMode = (mode: ProviderMode) => {
    setActiveMode(mode);
    if (activeMeta && activeMeta.mode === mode) return;
    const configuredInMode = providers.find((p) => p.mode === mode && p.configured);
    const first = configuredInMode || providers.find((p) => p.mode === mode);
    if (first && providerPref !== "auto") {
      selectProviderCard(first.id);
    }
  };

  const refreshModels = async (targetProvider?: ConcreteAiProvider | null) => {
    const target = targetProvider ?? effectiveConcrete;
    if (!target) {
      showToast("Select or connect an AI provider first to fetch available models.", {
        tone: "warn",
      });
      return;
    }
    setRefreshingModels(true);
    try {
      const params = new URLSearchParams({ provider: target, refresh: "1" });
      if (baseUrl.trim()) params.set("baseUrl", baseUrl.trim());
      const res = await apiRequest<ProviderModelsResponse>(
        "GET",
        `/api/settings/models?${params.toString()}`,
      );
      setLiveCatalog(res);
      showToast(res.note, { tone: res.liveFetched ? "ok" : "warn" });
    } catch (err) {
      showToast((err as Error).message, { tone: "err" });
    } finally {
      setRefreshingModels(false);
    }
  };

  const saveAi = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/settings/profile", {
        aiProvider: providerPref,
        aiBaseUrl: baseUrl.trim() || null,
        aiScreeningModel: screeningModel.trim() || "auto",
        aiSynthesisModel: synthesisModel.trim() || "auto",
        aiDailyTokenBudget: Number(dailyBudget),
        aiMaxChunksPerRun: Number(maxChunks),
      }),
    onSuccess: () => {
      void invalidateWorkspaceQueries();
      showToast("AI provider & model settings saved", { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const saveKey = useMutation({
    mutationFn: async () => {
      if (!effectiveConcrete) throw new Error("Select a Cloud API provider first.");
      await apiRequest("PUT", "/api/settings/api-key", {
        provider: effectiveConcrete,
        apiKey: apiKeyInput.trim(),
      });
      await apiRequest("PUT", "/api/settings/profile", {
        aiProvider: providerPref === "auto" ? "auto" : effectiveConcrete,
        aiBaseUrl: baseUrl.trim() || null,
        aiScreeningModel: screeningModel.trim() || "auto",
        aiSynthesisModel: synthesisModel.trim() || "auto",
      });
    },
    onSuccess: () => {
      setApiKeyInput("");
      void invalidateWorkspaceQueries();
      showToast(`${activeMeta?.name || effectiveConcrete} key saved to macOS Keychain`, {
        tone: "ok",
      });
      void refreshModels(effectiveConcrete);
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const removeKey = useMutation({
    mutationFn: () => {
      if (!effectiveConcrete) throw new Error("Select a provider first.");
      return apiRequest(
        "DELETE",
        `/api/settings/api-key?provider=${encodeURIComponent(effectiveConcrete)}`,
      );
    },
    onSuccess: () => {
      setLiveCatalog(null);
      void invalidateWorkspaceQueries();
      showToast(`Removed ${activeMeta?.name || effectiveConcrete} API key from Keychain`, {
        tone: "info",
      });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const testApi = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/settings/profile", {
        aiProvider: providerPref,
        aiBaseUrl: baseUrl.trim() || null,
        aiScreeningModel: screeningModel.trim() || "auto",
        aiSynthesisModel: synthesisModel.trim() || "auto",
      });
      return apiRequest<{ ok: boolean; provider: string; model: string; tokensUsed: number }>(
        "POST",
        "/api/settings/test-api",
      );
    },
    onSuccess: (res) => {
      void invalidateWorkspaceQueries();
      showToast(`Connected via ${res.provider} (${res.model})`, { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const modeProviders = providers.filter((p) => p.mode === activeMode);
  const activeStatusProvider = aiStatus?.activeProvider
    ? providers.find((p) => p.id === aiStatus.activeProvider)
    : undefined;

  const catalogMatches = liveCatalog && liveCatalog.provider === effectiveConcrete;
  const availableModels = Array.from(
    new Set([
      ...(catalogMatches ? liveCatalog.models : []),
      ...(activeMeta?.suggestedModels || []),
    ]),
  ).filter((m) => Boolean(m) && m !== "auto");

  const resolvedScreeningLabel = catalogMatches
    ? liveCatalog.recommendedScreening
    : aiStatus?.activeProvider === effectiveConcrete && aiStatus?.resolvedScreeningModel
      ? aiStatus.resolvedScreeningModel
      : activeMeta?.defaultScreeningModel || "latest fast";

  const resolvedSynthesisLabel = catalogMatches
    ? liveCatalog.recommendedSynthesis
    : aiStatus?.activeProvider === effectiveConcrete && aiStatus?.resolvedSynthesisModel
      ? aiStatus.resolvedSynthesisModel
      : activeMeta?.defaultSynthesisModel || "latest flagship";

  const screeningIsKnown = screeningModel === "auto" || availableModels.includes(screeningModel);
  const synthesisIsKnown = synthesisModel === "auto" || availableModels.includes(synthesisModel);

  return (
    <div className="mw-stack">
      <div className="pp-card">
        <div className="pp-card__header">
          <div>
            <h2 className="pp-card__title">AI Provider &amp; Subscription Connection</h2>
            <div className="mw-faint">
              Provider-agnostic by default: auto-detects your connected Cloud API key, local offline
              Ollama/LM Studio server, or signed-in Subscription CLI.
            </div>
          </div>
          <span
            className={`pp-status ${aiStatus?.configured ? "pp-status--ok" : "pp-status--warn"}`}
          >
            {aiStatus?.configured
              ? `${aiStatus.configuredProvider === "auto" ? "Auto" : "Active"}: ${activeStatusProvider?.name || aiStatus.activeProvider}`
              : "Not configured"}
          </span>
        </div>

        <div className="pp-card__body mw-stack">
          <div className="mw-row mw-row--between mw-row--wrap">
            <p className="mw-muted" style={{ margin: 0 }}>
              {aiStatus?.message}
            </p>
            <button
              type="button"
              className={`pp-button pp-button--sm ${providerPref === "auto" ? "pp-button--primary" : ""}`}
              onClick={enableAutoDetect}
              title="Automatically use whichever Cloud API key or Subscription CLI is connected"
            >
              {providerPref === "auto" ? "Auto-Detect Enabled" : "Switch to Auto-Detect"}
            </button>
          </div>

          <div className="mw-row mw-row--wrap" role="group" aria-label="AI connection mode">
            {(
              [
                { id: "api_key", label: "Cloud API Key" },
                { id: "local_oss", label: "Local Open-Source (Offline)" },
                { id: "subscription_cli", label: "Signed-In Subscription CLI" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                className={`pp-button pp-button--sm ${activeMode === m.id ? "pp-button--primary" : ""}`}
                onClick={() => selectMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="mw-export-grid">
            {modeProviders.map((p) => {
              const selected = p.id === effectiveConcrete;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectProviderCard(p.id)}
                  className={`mw-question-card ${selected ? "mw-question-card--dirty" : ""}`}
                  style={{
                    textAlign: "left",
                    cursor: "pointer",
                    background: selected ? "var(--paper-accent-soft)" : "var(--paper-surface)",
                  }}
                >
                  <div className="mw-row mw-row--between" style={{ width: "100%" }}>
                    <strong style={{ fontSize: 13.5 }}>{p.name}</strong>
                    <span className={p.configured ? "pp-status pp-status--ok" : "pp-badge"}>
                      {p.mode === "subscription_cli"
                        ? p.configured
                          ? "CLI Found"
                          : "CLI Missing"
                        : p.mode === "local_oss"
                          ? "Offline"
                          : p.configured
                            ? "Key Saved"
                            : "No Key"}
                    </span>
                  </div>
                  <div className="mw-faint">{p.detail}</div>
                </button>
              );
            })}
          </div>

          {activeMode === "api_key" && (
            <div className="mw-stack mw-stack--sm">
              {!effectiveConcrete ? (
                <div className="mw-faint">
                  Click any Cloud API provider card above to paste and save an API key in macOS
                  Keychain, or export an environment key (e.g.{" "}
                  <code className="mw-mono">GEMINI_API_KEY</code>,{" "}
                  <code className="mw-mono">OPENAI_API_KEY</code>,{" "}
                  <code className="mw-mono">ANTHROPIC_API_KEY</code>) for instant auto-detection.
                </div>
              ) : (
                <>
                  {(effectiveConcrete === "meta" || effectiveConcrete === "custom_openai") && (
                    <div className="pp-field">
                      <label className="pp-field__label" htmlFor="ai-base-url">
                        OpenAI-Compatible Endpoint URL
                      </label>
                      <input
                        id="ai-base-url"
                        type="url"
                        className="pp-input mw-mono"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder={activeMeta?.defaultBaseUrl || "https://openrouter.ai/api/v1"}
                      />
                    </div>
                  )}

                  <div className="mw-row mw-row--wrap">
                    <input
                      type="password"
                      className="pp-input"
                      placeholder={`Paste ${activeMeta?.name || "provider"} API key…`}
                      aria-label="Provider API key"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      style={{ flex: 1, minWidth: 240 }}
                    />
                    <button
                      type="button"
                      className="pp-button pp-button--primary pp-button--sm"
                      disabled={apiKeyInput.trim().length < 8 || saveKey.isPending}
                      onClick={() => saveKey.mutate()}
                    >
                      <Icon name="key" />
                      <span>Save to Keychain</span>
                    </button>
                    <button
                      type="button"
                      className="pp-button pp-button--sm"
                      disabled={testApi.isPending || !activeMeta?.configured}
                      onClick={() => testApi.mutate()}
                    >
                      {testApi.isPending ? "Testing…" : "Test Connection"}
                    </button>
                    {activeMeta?.configured && activeMeta.source === "keychain" && (
                      <button
                        type="button"
                        className="pp-button pp-button--danger pp-button--sm"
                        onClick={() => removeKey.mutate()}
                      >
                        Remove Key
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {activeMode === "local_oss" && (
            <div className="mw-stack mw-stack--sm">
              <div className="mw-row mw-row--wrap">
                <input
                  type="url"
                  className="pp-input mw-mono"
                  aria-label="Local OpenAI-compatible server URL"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={activeMeta?.defaultBaseUrl || "http://127.0.0.1:11434/v1"}
                  style={{ flex: 1, minWidth: 260 }}
                />
                <button
                  type="button"
                  className="pp-button pp-button--sm"
                  disabled={refreshingModels || !effectiveConcrete}
                  onClick={() => void refreshModels(effectiveConcrete)}
                >
                  {refreshingModels ? "Detecting…" : "Detect Local Models"}
                </button>
                <button
                  type="button"
                  className="pp-button pp-button--primary pp-button--sm"
                  disabled={testApi.isPending || !effectiveConcrete}
                  onClick={() => testApi.mutate()}
                >
                  {testApi.isPending ? "Testing…" : "Test Local LLM"}
                </button>
              </div>
              <div className="mw-faint">
                Zero data leaves your Mac — ideal for classified, defence, health, or APRA-regulated
                evidence.
              </div>
            </div>
          )}

          {activeMode === "subscription_cli" && (
            <div className="mw-stack mw-stack--sm">
              {effectiveConcrete && activeMeta ? (
                <div className="mw-check-row">
                  <div>
                    <div style={{ fontWeight: 500 }}>{activeMeta.name}</div>
                    <div className="mw-faint">{activeMeta.detail}</div>
                  </div>
                  <button
                    type="button"
                    className="pp-button pp-button--primary pp-button--sm"
                    disabled={testApi.isPending || !activeMeta.configured}
                    onClick={() => testApi.mutate()}
                  >
                    {testApi.isPending ? "Testing…" : "Test Subscription CLI"}
                  </button>
                </div>
              ) : (
                <div className="mw-faint">
                  Click any Subscription CLI card above to connect your signed-in Claude, ChatGPT
                  Codex, or Gemini subscription.
                </div>
              )}
              <div className="mw-faint">
                Note: xAI Grok and Meta AI do not offer official subscription CLIs — connect Grok or
                Llama via <strong>Cloud API Key</strong> or run Llama 100% locally via{" "}
                <strong>Local Open-Source (Ollama / LM Studio)</strong>.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pp-card">
        <div className="pp-card__header">
          <div>
            <h2 className="pp-card__title">Model Selection &amp; Spend Guardrails</h2>
            <div className="mw-faint">
              Keep set to <strong className="mw-mono">auto</strong> to always resolve the newest
              fast &amp; flagship models from your connected provider, or pin specific models below.
            </div>
          </div>
          <div className="mw-row">
            {catalogMatches && (
              <span className={liveCatalog.liveFetched ? "pp-status pp-status--ok" : "pp-badge"}>
                {liveCatalog.liveFetched
                  ? `${liveCatalog.models.length} live models`
                  : "Curated defaults"}
              </span>
            )}
            <button
              type="button"
              className="pp-button pp-button--sm"
              disabled={refreshingModels || !effectiveConcrete}
              onClick={() => void refreshModels(effectiveConcrete)}
            >
              {refreshingModels ? "Refreshing…" : "Refresh Available Models"}
            </button>
          </div>
        </div>
        <div className="pp-card__body mw-stack">
          <div className="mw-form-grid">
            <div className="pp-field">
              <label className="pp-field__label" htmlFor="ai-screen-select">
                Screening &amp; Document Chunk Model
              </label>
              <select
                id="ai-screen-select"
                className="pp-select mw-mono"
                value={customScreening || !screeningIsKnown ? CUSTOM_SENTINEL : screeningModel}
                onChange={(e) => {
                  if (e.target.value === CUSTOM_SENTINEL) {
                    setCustomScreening(true);
                  } else {
                    setCustomScreening(false);
                    setScreeningModel(e.target.value);
                  }
                }}
              >
                <option value="auto">auto — Always latest fast ({resolvedScreeningLabel})</option>
                {availableModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
                <option value={CUSTOM_SENTINEL}>Custom model ID…</option>
              </select>
              {(customScreening || !screeningIsKnown) && (
                <input
                  type="text"
                  className="pp-input pp-input--sm mw-mono"
                  aria-label="Custom screening model ID"
                  placeholder="Enter exact provider model ID…"
                  value={screeningModel === "auto" ? "" : screeningModel}
                  onChange={(e) => setScreeningModel(e.target.value)}
                />
              )}
            </div>

            <div className="pp-field">
              <label className="pp-field__label" htmlFor="ai-synth-select">
                Audit Review &amp; Framework Synthesis Model
              </label>
              <select
                id="ai-synth-select"
                className="pp-select mw-mono"
                value={customSynthesis || !synthesisIsKnown ? CUSTOM_SENTINEL : synthesisModel}
                onChange={(e) => {
                  if (e.target.value === CUSTOM_SENTINEL) {
                    setCustomSynthesis(true);
                  } else {
                    setCustomSynthesis(false);
                    setSynthesisModel(e.target.value);
                  }
                }}
              >
                <option value="auto">
                  auto — Always latest flagship ({resolvedSynthesisLabel})
                </option>
                {availableModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
                <option value={CUSTOM_SENTINEL}>Custom model ID…</option>
              </select>
              {(customSynthesis || !synthesisIsKnown) && (
                <input
                  type="text"
                  className="pp-input pp-input--sm mw-mono"
                  aria-label="Custom synthesis model ID"
                  placeholder="Enter exact provider model ID…"
                  value={synthesisModel === "auto" ? "" : synthesisModel}
                  onChange={(e) => setSynthesisModel(e.target.value)}
                />
              )}
            </div>

            <div className="pp-field">
              <label className="pp-field__label" htmlFor="ai-budget">
                Daily Token Budget
              </label>
              <input
                id="ai-budget"
                type="number"
                min={10000}
                max={5000000}
                className="pp-input mw-mono"
                value={dailyBudget}
                onChange={(e) => setDailyBudget(Number(e.target.value))}
              />
            </div>
            <div className="pp-field">
              <label className="pp-field__label" htmlFor="ai-chunks">
                Max Chunks per Document Run
              </label>
              <input
                id="ai-chunks"
                type="number"
                min={1}
                max={100}
                className="pp-input mw-mono"
                value={maxChunks}
                onChange={(e) => setMaxChunks(Number(e.target.value))}
              />
            </div>
          </div>
          <div>
            <button
              type="button"
              className="pp-button pp-button--primary"
              disabled={saveAi.isPending}
              onClick={() => saveAi.mutate()}
            >
              Save AI Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
