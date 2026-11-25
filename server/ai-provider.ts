import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  AiProvider,
  AiProviderStatus,
  ConcreteAiProvider,
  ProviderModelsResponse,
  WorkspaceProfile,
} from "@shared/schema";
import { getKeychainSecret, safeHttpUrl, setKeychainSecret } from "./security";

export class AIConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIConfigurationError";
  }
}

export class AIBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIBudgetError";
  }
}

export interface ProviderMeta {
  id: ConcreteAiProvider;
  name: string;
  mode: "api_key" | "local_oss" | "subscription_cli";
  keychainAccount?: string;
  envVar?: string;
  cliBinary?: string;
  defaultBaseUrl?: string;
  defaultScreeningModel: string;
  defaultSynthesisModel: string;
  suggestedModels: string[];
  description: string;
}

export const PROVIDER_CATALOG: readonly ProviderMeta[] = [
  {
    id: "anthropic",
    name: "Anthropic (Claude API)",
    mode: "api_key",
    keychainAccount: "ANTHROPIC_API_KEY",
    envVar: "ANTHROPIC_API_KEY",
    defaultScreeningModel: "claude-sonnet-4-6",
    defaultSynthesisModel: "claude-opus-4-6",
    suggestedModels: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"],
    description: "Direct Anthropic Messages API key stored in macOS Keychain.",
  },
  {
    id: "openai",
    name: "OpenAI (ChatGPT API)",
    mode: "api_key",
    keychainAccount: "OPENAI_API_KEY",
    envVar: "OPENAI_API_KEY",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultScreeningModel: "gpt-5.4-mini",
    defaultSynthesisModel: "gpt-5.4",
    suggestedModels: ["gpt-5.4", "gpt-5.4-mini", "gpt-4.1", "o3-mini"],
    description: "OpenAI API key stored in macOS Keychain.",
  },
  {
    id: "gemini",
    name: "Google Gemini (API)",
    mode: "api_key",
    keychainAccount: "GEMINI_API_KEY",
    envVar: "GEMINI_API_KEY",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultScreeningModel: "gemini-2.5-flash",
    defaultSynthesisModel: "gemini-2.5-pro",
    suggestedModels: ["gemini-2.5-pro", "gemini-2.5-flash"],
    description: "Google AI Studio / Gemini API key stored in macOS Keychain.",
  },
  {
    id: "xai",
    name: "xAI (Grok API)",
    mode: "api_key",
    keychainAccount: "XAI_API_KEY",
    envVar: "XAI_API_KEY",
    defaultBaseUrl: "https://api.x.ai/v1",
    defaultScreeningModel: "grok-3-mini",
    defaultSynthesisModel: "grok-4",
    suggestedModels: ["grok-4", "grok-3", "grok-3-mini"],
    description: "xAI Console API key for Grok models stored in macOS Keychain.",
  },
  {
    id: "meta",
    name: "Meta Llama (API)",
    mode: "api_key",
    keychainAccount: "META_API_KEY",
    envVar: "META_API_KEY",
    defaultBaseUrl: "https://api.llama.com/compat/v1",
    defaultScreeningModel: "Llama-4-Scout-17B-16E-Instruct-FP8",
    defaultSynthesisModel: "Llama-4-Maverick-17B-128E-Instruct-FP8",
    suggestedModels: [
      "Llama-4-Maverick-17B-128E-Instruct-FP8",
      "Llama-4-Scout-17B-16E-Instruct-FP8",
      "Llama-3.3-70B-Instruct",
    ],
    description: "Meta Llama API (or override Base URL for OpenRouter/Together/Groq).",
  },
  {
    id: "custom_openai",
    name: "Open-Source / Custom OpenAI-Compatible API",
    mode: "api_key",
    keychainAccount: "CUSTOM_LLM_API_KEY",
    envVar: "CUSTOM_LLM_API_KEY",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultScreeningModel: "meta-llama/llama-3.3-70b-instruct",
    defaultSynthesisModel: "deepseek/deepseek-r1",
    suggestedModels: [
      "deepseek/deepseek-r1",
      "meta-llama/llama-3.3-70b-instruct",
      "qwen/qwen-2.5-72b-instruct",
      "mistralai/mistral-large",
    ],
    description:
      "Any OpenAI-compatible API (OpenRouter, Mistral, Together, Fireworks, Groq, vLLM).",
  },
  {
    id: "ollama",
    name: "Ollama (100% Offline Local Open-Source)",
    mode: "local_oss",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    defaultScreeningModel: "llama3.3:latest",
    defaultSynthesisModel: "qwen2.5:14b",
    suggestedModels: ["qwen2.5:14b", "llama3.3:latest", "gemma3:12b", "mistral:latest"],
    description:
      "Runs open-source models completely offline on your Mac via Ollama (zero cloud egress).",
  },
  {
    id: "lmstudio",
    name: "LM Studio (100% Offline Local Open-Source)",
    mode: "local_oss",
    defaultBaseUrl: "http://127.0.0.1:1234/v1",
    defaultScreeningModel: "local-model",
    defaultSynthesisModel: "local-model",
    suggestedModels: ["local-model"],
    description:
      "Connects to LM Studio's local OpenAI server on 127.0.0.1:1234 (zero cloud egress).",
  },
  {
    id: "claude_cli",
    name: "Claude Subscription (Official Claude CLI)",
    mode: "subscription_cli",
    cliBinary: "claude",
    defaultScreeningModel: "sonnet",
    defaultSynthesisModel: "opus",
    suggestedModels: ["opus", "sonnet", "haiku"],
    description:
      "Uses your signed-in Claude Pro/Max/Team subscription via the official `claude` CLI.",
  },
  {
    id: "codex_cli",
    name: "ChatGPT Subscription (Official Codex CLI)",
    mode: "subscription_cli",
    cliBinary: "codex",
    defaultScreeningModel: "auto",
    defaultSynthesisModel: "auto",
    suggestedModels: ["gpt-5.4", "gpt-5.4-mini", "o3"],
    description:
      "Uses your signed-in ChatGPT Plus/Pro/Team subscription via OpenAI's official `codex` CLI.",
  },
  {
    id: "gemini_cli",
    name: "Gemini Subscription (Official Gemini CLI)",
    mode: "subscription_cli",
    cliBinary: "gemini",
    defaultScreeningModel: "auto",
    defaultSynthesisModel: "auto",
    suggestedModels: ["gemini-2.5-pro", "gemini-2.5-flash"],
    description: "Uses your signed-in Google/Gemini account via the official `gemini` CLI.",
  },
] as const;

const MODEL_CACHE_TTL_MS = 15 * 60 * 1000;
const modelCache = new Map<string, { expiresAt: number; data: ProviderModelsResponse }>();

export function clearModelCache(provider?: ConcreteAiProvider): void {
  if (!provider) {
    modelCache.clear();
    return;
  }
  for (const key of Array.from(modelCache.keys())) {
    if (key.startsWith(`${provider}:`)) {
      modelCache.delete(key);
    }
  }
}

export function getProviderMeta(id: ConcreteAiProvider): ProviderMeta {
  const found = PROVIDER_CATALOG.find((p) => p.id === id);
  if (!found) {
    throw new AIConfigurationError(`Unknown AI provider: ${id}`);
  }
  return found;
}

export function resolveProviderApiKey(provider: ConcreteAiProvider): {
  key: string | null;
  source: "keychain" | "env" | "none";
} {
  const meta = getProviderMeta(provider);
  if (!meta.keychainAccount) return { key: null, source: "none" };
  const fromKeychain = getKeychainSecret(meta.keychainAccount);
  if (fromKeychain) return { key: fromKeychain, source: "keychain" };
  if (meta.envVar) {
    const fromEnv = process.env[meta.envVar]?.trim();
    if (fromEnv) return { key: fromEnv, source: "env" };
  }
  return { key: null, source: "none" };
}

export function saveProviderApiKey(provider: ConcreteAiProvider, apiKey: string | null): boolean {
  const meta = getProviderMeta(provider);
  if (!meta.keychainAccount) return false;
  const ok = setKeychainSecret(meta.keychainAccount, apiKey);
  if (ok) clearModelCache(provider);
  return ok;
}

/**
 * Locate an official CLI binary safely across standard macOS & user PATH directories.
 */
export function findCliBinary(binary: string): string | null {
  if (!/^[a-z0-9_-]{1,32}$/i.test(binary)) return null;
  const home = os.homedir();
  const candidates = [
    ...(process.env.PATH || "").split(":").filter(Boolean),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    path.join(home, ".local/bin"),
    path.join(home, ".npm-global/bin"),
  ];
  const seen = new Set<string>();
  for (const dir of candidates) {
    if (seen.has(dir)) continue;
    seen.add(dir);
    const full = path.join(dir, binary);
    try {
      fs.accessSync(full, fs.constants.X_OK);
      return full;
    } catch {
      // continue searching
    }
  }
  return null;
}

/**
 * Validate custom/provider base URL while blocking cloud metadata SSRF targets (169.254.169.254).
 */
export function validateLlmBaseUrl(raw: string): string | null {
  const safe = safeHttpUrl(raw);
  if (!safe) return null;
  try {
    const u = new URL(safe);
    const host = u.hostname.toLowerCase();
    if (host === "169.254.169.254" || host === "metadata.google.internal") {
      return null;
    }
    return safe.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/**
 * Resolve the concrete provider to use for a workspace profile.
 * When `aiProvider` is `"auto"` (the provider-agnostic default), checks:
 *   1. First Cloud API key saved in macOS Keychain
 *   2. First Cloud API key present in process environment (e.g. GEMINI_API_KEY)
 *   3. First signed-in official Subscription CLI found on PATH (claude, codex, gemini)
 *   4. null (unconfigured — never silently defaults to a specific vendor)
 */
export function resolveEffectiveProvider(
  profile: WorkspaceProfile | null,
  options?: { skipCliScan?: boolean },
): ConcreteAiProvider | null {
  const configured = profile?.aiProvider || "auto";
  if (configured !== "auto") {
    return configured;
  }

  const apiProviders = PROVIDER_CATALOG.filter((m) => m.mode === "api_key");

  // 1. Keychain Cloud API keys first (explicitly saved by user in Mount Charter)
  for (const meta of apiProviders) {
    const { key, source } = resolveProviderApiKey(meta.id);
    if (source === "keychain" && key && key.length >= 8) {
      return meta.id;
    }
  }

  // 2. Environment Cloud API keys (e.g. GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, XAI_API_KEY)
  for (const meta of apiProviders) {
    const { key, source } = resolveProviderApiKey(meta.id);
    if (source === "env" && key && key.length >= 8) {
      return meta.id;
    }
  }

  // 3. Official Subscription CLIs on PATH
  if (!options?.skipCliScan) {
    for (const meta of PROVIDER_CATALOG.filter((m) => m.mode === "subscription_cli")) {
      if (meta.cliBinary && findCliBinary(meta.cliBinary)) {
        return meta.id;
      }
    }
  }

  return null;
}

// ─── Live Model Discovery & Always-Latest Flagship Ranking ───────────────────

function extractVersionScore(id: string): number {
  const lower = id.toLowerCase();
  // Match patterns like 4-6, 4.6, 5.4, 2.5, 3.0, 3-5, or standalone major version after hyphen
  const dashed = lower.match(/(?:^|[-_/])(\d+)[.-](\d+)(?:$|[-_/.:])/);
  let score = 0;
  if (dashed) {
    const major = Number.parseInt(dashed[1], 10);
    const minor = Number.parseInt(dashed[2], 10);
    // Ignore 8-digit calendar dates like 20250514
    if (major < 100 && minor < 100) {
      score = major * 100 + minor * 10;
    }
  } else {
    const single = lower.match(/(?:gpt|claude|gemini|grok|llama|qwen|o)[-_]?(\d+)(?:$|[-_/.:])/);
    if (single) {
      const major = Number.parseInt(single[1], 10);
      if (major < 100) score = major * 100;
    }
  }
  // Prefer stable releases slightly over preview/exp/beta of the exact same version
  if (/(?:preview|exp|experimental|beta|alpha)/.test(lower)) score -= 2;
  // Prefer un-dated rolling aliases slightly over pinned dated snapshots of the same version
  if (/-\d{8}$|-\d{4}-\d{2}-\d{2}$/.test(lower)) score -= 1;
  return score;
}

function isNonChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  return /(?:embedding|embed-|imagen|veo|aqa|tts|whisper|dall-e|moderation|transcribe|realtime|audio|sora|babbage|davinci|robotics|learnlm|computer-use|image-gen|speech)/.test(
    lower,
  );
}

function sortByVersionDesc(models: string[]): string[] {
  return [...models].sort((a, b) => {
    const diff = extractVersionScore(b) - extractVersionScore(a);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  });
}

/**
 * Select the newest fast (`screening`) and newest flagship (`synthesis`) models
 * from a provider's discovered `/models` list.
 */
export function pickBestModelsForProvider(
  provider: ConcreteAiProvider,
  rawModels: string[],
): { screening: string; synthesis: string } {
  const meta = getProviderMeta(provider);

  if (provider === "claude_cli") {
    return { screening: "sonnet", synthesis: "opus" };
  }
  if (provider === "codex_cli" || provider === "gemini_cli") {
    return { screening: "auto", synthesis: "auto" };
  }

  const chatModels = rawModels.filter((m) => m && !isNonChatModel(m));
  if (chatModels.length === 0) {
    return {
      screening: meta.defaultScreeningModel,
      synthesis: meta.defaultSynthesisModel,
    };
  }

  const sorted = sortByVersionDesc(chatModels);

  if (provider === "anthropic") {
    const claude = sorted.filter((m) => m.toLowerCase().includes("claude"));
    const pool = claude.length > 0 ? claude : sorted;
    const opus = pool.filter((m) => m.toLowerCase().includes("opus"));
    const sonnet = pool.filter((m) => m.toLowerCase().includes("sonnet"));
    const haiku = pool.filter((m) => m.toLowerCase().includes("haiku"));
    return {
      screening: sonnet[0] || haiku[0] || pool[0],
      synthesis: opus[0] || sonnet[0] || pool[0],
    };
  }

  if (provider === "gemini") {
    const gemini = sorted.filter(
      (m) => m.toLowerCase().startsWith("gemini-") && !m.toLowerCase().includes("gemma"),
    );
    const pool = gemini.length > 0 ? gemini : sorted;
    const pro = pool.filter((m) => m.toLowerCase().includes("pro"));
    const flash = pool.filter(
      (m) => m.toLowerCase().includes("flash") && !m.toLowerCase().includes("lite"),
    );
    const anyFlash = pool.filter((m) => m.toLowerCase().includes("flash"));
    return {
      screening: flash[0] || anyFlash[0] || pool[0],
      synthesis: pro[0] || pool[0],
    };
  }

  if (provider === "openai") {
    const gptOrO = sorted.filter((m) => /^(?:gpt-|o\d)/i.test(m));
    const pool = gptOrO.length > 0 ? gptOrO : sorted;
    const fast = pool.filter((m) => /(?:mini|nano|flash)/i.test(m));
    const flagship = pool.filter((m) => !/(?:mini|nano|flash)/i.test(m));
    return {
      screening: fast[0] || pool[0],
      synthesis: flagship[0] || pool[0],
    };
  }

  if (provider === "xai") {
    const grok = sorted.filter((m) => m.toLowerCase().includes("grok"));
    const pool = grok.length > 0 ? grok : sorted;
    const fast = pool.filter((m) => /(?:mini|fast)/i.test(m));
    const flagship = pool.filter((m) => !/(?:mini|fast)/i.test(m));
    return {
      screening: fast[0] || pool[0],
      synthesis: flagship[0] || pool[0],
    };
  }

  if (provider === "meta") {
    const scout = sorted.filter((m) => /scout|8b|17b/i.test(m));
    const maverick = sorted.filter((m) => /maverick|405b|70b/i.test(m));
    return {
      screening: scout[0] || sorted[0],
      synthesis: maverick[0] || sorted[0],
    };
  }

  // Local OSS (Ollama / LM Studio) & Custom OpenAI-Compatible APIs
  const byParamSize = [...chatModels].sort((a, b) => {
    const sizeA = Number.parseInt(a.match(/(\d+)b/i)?.[1] || "0", 10);
    const sizeB = Number.parseInt(b.match(/(\d+)b/i)?.[1] || "0", 10);
    return sizeB - sizeA;
  });
  return {
    screening: chatModels[0],
    synthesis: byParamSize[0] || chatModels[0],
  };
}

function getCachedModelsSync(
  provider: ConcreteAiProvider,
  baseUrl?: string | null,
): ProviderModelsResponse | null {
  const cacheKey = `${provider}:${baseUrl?.trim() || ""}`;
  const entry = modelCache.get(cacheKey);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.data;
  }
  return null;
}

/**
 * Query a provider's live `/models` endpoint (all Cloud APIs, Local OSS servers, or CLI aliases)
 * with a 15-minute cache and graceful fallback to curated models.
 */
export async function fetchProviderModels(
  provider: ConcreteAiProvider,
  options?: { baseUrl?: string | null; forceRefresh?: boolean },
): Promise<ProviderModelsResponse> {
  const meta = getProviderMeta(provider);
  const cacheKey = `${provider}:${options?.baseUrl?.trim() || ""}`;
  if (!options?.forceRefresh) {
    const cached = getCachedModelsSync(provider, options?.baseUrl);
    if (cached) return cached;
  }

  const nowIso = new Date().toISOString();
  const fallback = (note: string): ProviderModelsResponse => {
    const rec = pickBestModelsForProvider(provider, meta.suggestedModels);
    return {
      provider,
      models: [...meta.suggestedModels],
      recommendedScreening: rec.screening,
      recommendedSynthesis: rec.synthesis,
      liveFetched: false,
      fetchedAt: nowIso,
      note,
    };
  };

  if (meta.mode === "subscription_cli") {
    const res: ProviderModelsResponse = {
      provider,
      models: [...meta.suggestedModels],
      recommendedScreening: meta.defaultScreeningModel,
      recommendedSynthesis: meta.defaultSynthesisModel,
      liveFetched: true,
      fetchedAt: nowIso,
      note:
        provider === "claude_cli"
          ? "Using official rolling Claude CLI aliases (sonnet / opus always track the latest flagship)."
          : `Set to "auto" to let the official \`${meta.cliBinary}\` CLI run its latest flagship automatically.`,
    };
    modelCache.set(cacheKey, { expiresAt: Date.now() + MODEL_CACHE_TTL_MS, data: res });
    return res;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    let discovered: string[] = [];

    if (provider === "anthropic") {
      const { key } = resolveProviderApiKey("anthropic");
      if (!key) return fallback("Save an Anthropic API key to fetch live models.");
      const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        signal: controller.signal,
      });
      if (!res.ok) return fallback(`Anthropic /v1/models returned HTTP ${res.status}.`);
      const json = (await res.json()) as { data?: Array<{ id?: string }> };
      discovered = (json.data || []).map((m) => String(m.id || "")).filter(Boolean);
    } else if (provider === "gemini") {
      const { key } = resolveProviderApiKey("gemini");
      if (!key) return fallback("Save a Google Gemini API key to fetch live models.");
      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100",
        {
          headers: {
            "x-goog-api-key": key,
          },
          signal: controller.signal,
        },
      );
      if (!res.ok) return fallback(`Gemini /v1beta/models returned HTTP ${res.status}.`);
      const json = (await res.json()) as {
        models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
      };
      discovered = (json.models || [])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => String(m.name || "").replace(/^models\//, ""))
        .filter((id) => id && !isNonChatModel(id));
    } else {
      const rawBase = options?.baseUrl?.trim() || meta.defaultBaseUrl || "";
      const validBase = validateLlmBaseUrl(rawBase);
      if (!validBase) {
        return fallback("Set a valid http(s):// Base URL to fetch live models.");
      }
      const headers: Record<string, string> = {};
      if (meta.mode === "api_key") {
        const { key } = resolveProviderApiKey(provider);
        if (!key && provider !== "custom_openai") {
          return fallback(`Save a ${meta.name} key to fetch live models.`);
        }
        if (key) headers.Authorization = `Bearer ${key}`;
      }
      const res = await fetch(`${validBase}/models`, {
        headers,
        signal: controller.signal,
      });
      if (!res.ok) return fallback(`${meta.name} /models returned HTTP ${res.status}.`);
      const json = (await res.json()) as { data?: Array<{ id?: string }> };
      discovered = (json.data || [])
        .map((m) => String(m.id || ""))
        .filter((id) => id && !isNonChatModel(id));
    }

    const uniqueSorted = sortByVersionDesc(Array.from(new Set(discovered)));
    if (uniqueSorted.length === 0) {
      return fallback(
        meta.mode === "local_oss"
          ? "No models returned — ensure Ollama or LM Studio is running with at least one pulled model."
          : `No chat models returned from ${meta.name}.`,
      );
    }

    const rec = pickBestModelsForProvider(provider, uniqueSorted);
    const result: ProviderModelsResponse = {
      provider,
      models: uniqueSorted.slice(0, 60),
      recommendedScreening: rec.screening,
      recommendedSynthesis: rec.synthesis,
      liveFetched: true,
      fetchedAt: nowIso,
      note: `Fetched ${uniqueSorted.length} live model(s) from ${meta.name}.`,
    };
    modelCache.set(cacheKey, { expiresAt: Date.now() + MODEL_CACHE_TTL_MS, data: result });
    return result;
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Network error";
    return fallback(
      meta.mode === "local_oss"
        ? "Could not reach local model server — ensure Ollama or LM Studio is running."
        : `Could not reach ${meta.name} model catalog (${reason}). Showing curated defaults.`,
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function probeLocalModels(baseUrl: string): Promise<string[]> {
  const valid = validateLlmBaseUrl(baseUrl);
  if (!valid) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${valid}/models`, { signal: controller.signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: Array<{ id?: string }> };
    return (data.data || []).map((m) => String(m.id || "")).filter(Boolean);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function resolveModelSyncPreview(
  provider: ConcreteAiProvider,
  savedModel: string | null | undefined,
  tier: "screening" | "synthesis",
  baseUrl?: string | null,
): string {
  const trimmed = savedModel?.trim();
  if (trimmed && trimmed !== "auto") return trimmed;
  const meta = getProviderMeta(provider);
  if (provider === "claude_cli") {
    return tier === "synthesis" ? "opus" : "sonnet";
  }
  if (provider === "codex_cli" || provider === "gemini_cli") {
    return "CLI default (latest)";
  }
  const cached = getCachedModelsSync(provider, baseUrl);
  if (cached) {
    return tier === "synthesis" ? cached.recommendedSynthesis : cached.recommendedScreening;
  }
  return tier === "synthesis" ? meta.defaultSynthesisModel : meta.defaultScreeningModel;
}

export function getAiProviderStatus(profile: WorkspaceProfile | null): AiProviderStatus {
  const configuredProvider: AiProvider = profile?.aiProvider || "auto";
  const activeId = resolveEffectiveProvider(profile);

  const providers = PROVIDER_CATALOG.map((meta) => {
    if (meta.mode === "api_key") {
      const { key, source } = resolveProviderApiKey(meta.id);
      const ok = Boolean(key && key.length >= 8);
      return {
        id: meta.id,
        name: meta.name,
        mode: meta.mode,
        configured: ok,
        source,
        detail: ok
          ? `API key loaded from ${source === "keychain" ? "macOS Keychain" : "environment"}`
          : meta.description,
        defaultScreeningModel: meta.defaultScreeningModel,
        defaultSynthesisModel: meta.defaultSynthesisModel,
        defaultBaseUrl: meta.defaultBaseUrl,
        suggestedModels: meta.suggestedModels,
      };
    }
    if (meta.mode === "local_oss") {
      return {
        id: meta.id,
        name: meta.name,
        mode: meta.mode,
        configured: true,
        source: "local",
        detail: meta.description,
        defaultScreeningModel: meta.defaultScreeningModel,
        defaultSynthesisModel: meta.defaultSynthesisModel,
        defaultBaseUrl: meta.defaultBaseUrl,
        suggestedModels: meta.suggestedModels,
      };
    }
    const binPath = meta.cliBinary ? findCliBinary(meta.cliBinary) : null;
    const home = os.homedir();
    const displayPath = binPath
      ? binPath.startsWith(home)
        ? `~${binPath.slice(home.length)}`
        : binPath
      : null;
    return {
      id: meta.id,
      name: meta.name,
      mode: meta.mode,
      configured: Boolean(binPath),
      source: binPath ? "cli" : "none",
      detail: displayPath
        ? `Detected ${meta.cliBinary} CLI at ${displayPath}`
        : `Official \`${meta.cliBinary}\` CLI not found on PATH. Install and sign in to connect your subscription.`,
      defaultScreeningModel: meta.defaultScreeningModel,
      defaultSynthesisModel: meta.defaultSynthesisModel,
      suggestedModels: meta.suggestedModels,
    };
  });

  const savedScreening = profile?.aiScreeningModel?.trim() || "auto";
  const savedSynthesis = profile?.aiSynthesisModel?.trim() || "auto";

  if (!activeId) {
    return {
      configuredProvider,
      activeProvider: null,
      mode: "none",
      configured: false,
      source: "none",
      message:
        "No AI provider connected yet. Save a Cloud API key, connect a local Ollama/LM Studio server, or install a signed-in Subscription CLI (claude, codex, or gemini).",
      baseUrl: profile?.aiBaseUrl || null,
      screeningModel: savedScreening,
      synthesisModel: savedSynthesis,
      resolvedScreeningModel: null,
      resolvedSynthesisModel: null,
      providers,
    };
  }

  const active = providers.find((p) => p.id === activeId)!;
  const effectiveBaseUrl = profile?.aiBaseUrl || active.defaultBaseUrl || null;
  const resolvedScreening = resolveModelSyncPreview(
    active.id,
    savedScreening,
    "screening",
    effectiveBaseUrl,
  );
  const resolvedSynthesis = resolveModelSyncPreview(
    active.id,
    savedSynthesis,
    "synthesis",
    effectiveBaseUrl,
  );

  const prefix = configuredProvider === "auto" ? "Auto-detected " : "";
  return {
    configuredProvider,
    activeProvider: active.id,
    mode: active.mode,
    configured: active.configured,
    source: active.source,
    message: active.configured
      ? `${prefix}${active.name}: ${active.detail}`
      : `${active.name} is not configured yet. ${active.detail}`,
    baseUrl: effectiveBaseUrl,
    screeningModel: savedScreening,
    synthesisModel: savedSynthesis,
    resolvedScreeningModel: resolvedScreening,
    resolvedSynthesisModel: resolvedSynthesis,
    providers,
  };
}

export interface LlmInvocationParams {
  profile: WorkspaceProfile | null;
  tier: "screening" | "synthesis";
  system?: string;
  user: string;
  maxTokens?: number;
  modelOverride?: string;
  signal?: AbortSignal;
  onToken?: (chunk: string) => void;
}

export interface LlmInvocationResult {
  text: string;
  tokensUsed: number;
  model: string;
  provider: ConcreteAiProvider;
}

function execCliPrompt(
  binaryPath: string,
  args: string[],
  stdinText: string | null,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      binaryPath,
      args,
      {
        timeout: 120_000,
        maxBuffer: 8 * 1024 * 1024,
        signal,
        env: { ...process.env, NO_COLOR: "1" },
      },
      (err, stdout, stderr) => {
        if (err) {
          const detail = (stderr || err.message || "").trim().slice(0, 400);
          reject(new Error(`Subscription CLI failed: ${detail}`));
          return;
        }
        resolve(stdout.trim());
      },
    );
    if (stdinText !== null && child.stdin) {
      child.stdin.write(stdinText);
      child.stdin.end();
    }
  });
}

async function resolveRuntimeModel(
  provider: ConcreteAiProvider,
  profile: WorkspaceProfile | null,
  tier: "screening" | "synthesis",
  modelOverride?: string,
): Promise<string> {
  const override = modelOverride?.trim();
  if (override && override !== "auto") return override;

  const saved = (
    tier === "synthesis" ? profile?.aiSynthesisModel : profile?.aiScreeningModel
  )?.trim();
  if (saved && saved !== "auto") return saved;

  if (provider === "claude_cli") {
    return tier === "synthesis" ? "opus" : "sonnet";
  }
  if (provider === "codex_cli" || provider === "gemini_cli") {
    return "auto";
  }

  const meta = getProviderMeta(provider);
  const discovered = await fetchProviderModels(provider, {
    baseUrl: profile?.aiBaseUrl || meta.defaultBaseUrl,
  });
  return tier === "synthesis" ? discovered.recommendedSynthesis : discovered.recommendedScreening;
}

export async function invokeLlm(params: LlmInvocationParams): Promise<LlmInvocationResult> {
  const provider = resolveEffectiveProvider(params.profile);
  if (!provider) {
    throw new AIConfigurationError(
      "No AI provider connected yet. Save a Cloud API key, start a local Ollama/LM Studio server, or install a signed-in Subscription CLI in Settings → AI Providers & Subscriptions.",
    );
  }
  const meta = getProviderMeta(provider);
  const model = await resolveRuntimeModel(
    provider,
    params.profile,
    params.tier,
    params.modelOverride,
  );
  const maxTokens = params.maxTokens ?? 2048;

  // 1. Anthropic Messages API via native fetch (supports SSE streaming)
  if (provider === "anthropic") {
    const { key } = resolveProviderApiKey("anthropic");
    if (!key || key.length < 20) {
      throw new AIConfigurationError(
        "Anthropic API key is not configured. Save your key in Settings → AI Providers & Subscriptions.",
      );
    }
    const streaming = Boolean(params.onToken);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        stream: streaming,
        ...(params.system ? { system: params.system } : {}),
        messages: [{ role: "user", content: params.user }],
      }),
      signal: params.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Anthropic API error (${res.status}): ${errText.slice(0, 300)}`);
    }

    if (streaming && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let inputTokens = 0;
      let outputTokens = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const ev = JSON.parse(payload) as {
              type?: string;
              delta?: { text?: string };
              message?: { usage?: { input_tokens?: number } };
              usage?: { output_tokens?: number };
            };
            if (ev.type === "message_start" && ev.message?.usage?.input_tokens) {
              inputTokens = ev.message.usage.input_tokens;
            } else if (ev.type === "content_block_delta" && ev.delta?.text) {
              fullText += ev.delta.text;
              params.onToken?.(ev.delta.text);
            } else if (ev.type === "message_delta" && ev.usage?.output_tokens) {
              outputTokens = ev.usage.output_tokens;
            }
          } catch {
            // ignore non-JSON keepalive lines
          }
        }
      }
      return { text: fullText, tokensUsed: inputTokens + outputTokens, model, provider };
    }

    const data = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const block = data.content?.find((b) => b.type === "text" && typeof b.text === "string");
    if (!block?.text) throw new Error("Unexpected response type from Anthropic");
    return {
      text: block.text,
      tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      model,
      provider,
    };
  }

  // 2. Official Signed-In Subscription CLIs (Claude, ChatGPT Codex, Gemini)
  if (meta.mode === "subscription_cli") {
    const binPath = meta.cliBinary ? findCliBinary(meta.cliBinary) : null;
    if (!binPath) {
      throw new AIConfigurationError(
        `Official \`${meta.cliBinary}\` CLI not found. Install and sign in, or switch provider in Settings → AI Providers & Subscriptions.`,
      );
    }
    const combinedPrompt = params.system
      ? `${params.system}\n\n---\n\n${params.user}`
      : params.user;

    let stdout = "";
    if (provider === "claude_cli") {
      const cliArgs = ["-p", "--output-format", "text"];
      if (model && model !== "auto") cliArgs.push("--model", model);
      stdout = await execCliPrompt(binPath, cliArgs, combinedPrompt, params.signal);
    } else if (provider === "codex_cli") {
      const cliArgs = ["exec", "--skip-git-repo-check"];
      if (model && model !== "auto") cliArgs.push("-m", model);
      cliArgs.push("-");
      stdout = await execCliPrompt(binPath, cliArgs, combinedPrompt, params.signal);
    } else {
      const cliArgs: string[] = [];
      if (model && model !== "auto") cliArgs.push("-m", model);
      cliArgs.push("-p", combinedPrompt);
      stdout = await execCliPrompt(binPath, cliArgs, null, params.signal);
    }

    params.onToken?.(stdout);
    const approxTokens = Math.ceil((combinedPrompt.length + stdout.length) / 4);
    return {
      text: stdout,
      tokensUsed: approxTokens,
      model: model === "auto" ? `${provider}:default` : model,
      provider,
    };
  }

  // 3. OpenAI-Compatible REST API (OpenAI, Gemini, xAI Grok, Meta Llama, Ollama, LM Studio, Custom)
  const rawBase = params.profile?.aiBaseUrl?.trim() || meta.defaultBaseUrl || "";
  const baseUrl = validateLlmBaseUrl(rawBase);
  if (!baseUrl) {
    throw new AIConfigurationError(
      `Invalid or missing Base URL for ${meta.name}. Set a valid http(s):// endpoint in Settings → AI Providers & Subscriptions.`,
    );
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (meta.mode === "api_key") {
    const { key } = resolveProviderApiKey(provider);
    if (!key && provider !== "custom_openai") {
      throw new AIConfigurationError(
        `${meta.name} key is not configured. Save your key in Settings → AI Providers & Subscriptions.`,
      );
    }
    if (key) headers.Authorization = `Bearer ${key}`;
  }

  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (params.system) messages.push({ role: "system", content: params.system });
  messages.push({ role: "user", content: params.user });

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    signal: params.signal,
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(
      `${meta.name} request failed (HTTP ${response.status}): ${errBody.slice(0, 300)}`,
    );
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
  };
  const text = String(json.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new Error(`${meta.name} returned an empty response.`);
  params.onToken?.(text);

  const reportedTokens =
    json.usage?.total_tokens ??
    (json.usage?.prompt_tokens || 0) + (json.usage?.completion_tokens || 0);
  const tokensUsed =
    reportedTokens > 0 ? reportedTokens : Math.ceil((params.user.length + text.length) / 4);

  return { text, tokensUsed, model, provider };
}
