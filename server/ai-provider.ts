import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  AiProvider,
  AiProviderStatus,
  AiRoutingPreset,
  ConcreteAiProvider,
  ProviderModelMetadata,
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

export const OPENROUTER_PRESET_MODELS: Record<
  AiRoutingPreset,
  { screening: string; synthesis: string; longContext: string; label: string; estNote: string }
> = {
  balanced: {
    screening: "google/gemini-2.5-flash",
    synthesis: "anthropic/claude-sonnet-4.6",
    longContext: "google/gemini-2.5-pro",
    label: "Balanced (Recommended)",
    estNote: "Fast screening + frontier audit reasoning (~$0.03–$0.08 / doc run)",
  },
  max_depth: {
    screening: "anthropic/claude-sonnet-4.6",
    synthesis: "anthropic/claude-opus-4.6",
    longContext: "google/gemini-2.5-pro",
    label: "Maximum Audit Depth",
    estNote: "Frontier reasoning across triage, SLA checks & reviews (~$0.15–$0.35 / run)",
  },
  low_cost: {
    screening: "google/gemini-2.5-flash",
    synthesis: "google/gemini-2.5-flash",
    longContext: "google/gemini-2.5-flash",
    label: "Low-Cost Fast",
    estNote: "High-throughput low-cost routing for bulk document intake (<$0.01 / doc)",
  },
};

export const PROVIDER_CATALOG: readonly ProviderMeta[] = [
  {
    id: "openrouter",
    name: "OpenRouter (1 Key, All Frontier Models)",
    mode: "api_key",
    keychainAccount: "OPENROUTER_API_KEY",
    envVar: "OPENROUTER_API_KEY",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultScreeningModel: OPENROUTER_PRESET_MODELS.balanced.screening,
    defaultSynthesisModel: OPENROUTER_PRESET_MODELS.balanced.synthesis,
    suggestedModels: [
      "anthropic/claude-opus-4.6",
      "anthropic/claude-sonnet-4.6",
      "google/gemini-2.5-pro",
      "google/gemini-2.5-flash",
      "openai/gpt-5.4",
      "openai/gpt-5.4-mini",
      "deepseek/deepseek-r1",
    ],
    description:
      "Recommended: 1 API key in macOS Keychain with automatic task-tier routing, Zero Data Retention (ZDR), and exact USD cost tracking.",
  },
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
    description: "Meta Llama API (or override Base URL for Together/Groq).",
  },
  {
    id: "custom_openai",
    name: "Custom OpenAI-Compatible API",
    mode: "api_key",
    keychainAccount: "CUSTOM_LLM_API_KEY",
    envVar: "CUSTOM_LLM_API_KEY",
    defaultBaseUrl: "https://api.together.xyz/v1",
    defaultScreeningModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    defaultSynthesisModel: "deepseek-ai/DeepSeek-R1",
    suggestedModels: [
      "deepseek-ai/DeepSeek-R1",
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "Qwen/Qwen2.5-72B-Instruct-Turbo",
    ],
    description:
      "Any self-hosted or third-party OpenAI-compatible API (Mistral, Together, Groq, vLLM).",
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
  {
    id: "grok_cli",
    name: "Grok Subscription (Official Grok CLI)",
    mode: "subscription_cli",
    cliBinary: "grok",
    defaultScreeningModel: "auto",
    defaultSynthesisModel: "auto",
    suggestedModels: ["grok-4.6", "grok-4.5"],
    description: "Uses your signed-in xAI Grok account via the official `grok` CLI.",
  },
  {
    id: "cursor_cli",
    name: "Cursor Subscription (Official Cursor CLI)",
    mode: "subscription_cli",
    cliBinary: "cursor-agent",
    defaultScreeningModel: "auto",
    defaultSynthesisModel: "auto",
    suggestedModels: ["claude-sonnet-4-6", "gpt-5.4"],
    description:
      "Uses your signed-in Cursor Pro/Team subscription via the official `cursor-agent` CLI.",
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

export async function fetchOpenRouterKeyInfo(): Promise<{
  ok: boolean;
  label?: string;
  usageUsd?: number;
  limitUsd?: number | null;
  limitRemainingUsd?: number | null;
  accountCreditsRemainingUsd?: number | null;
  isProvisioningKey?: boolean;
  isFreeTier?: boolean;
  error?: string;
}> {
  const { key } = resolveProviderApiKey("openrouter");
  if (!key) return { ok: false, error: "No OpenRouter API key configured." };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const headers = {
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "https://github.com/haberlah/mount-charter-isms-compliance",
      "X-Title": "Mount Charter ISMS",
    };
    const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, error: `OpenRouter key check failed (HTTP ${res.status})` };
    const json = (await res.json()) as {
      data?: {
        label?: string;
        usage?: number;
        limit?: number | null;
        limit_remaining?: number | null;
        is_free_tier?: boolean;
        is_provisioning_key?: boolean;
        is_management_key?: boolean;
      };
    };
    const isProvisioningKey = Boolean(
      json.data?.is_provisioning_key || json.data?.is_management_key,
    );

    let accountCreditsRemainingUsd: number | null = null;
    try {
      const credRes = await fetch("https://openrouter.ai/api/v1/credits", {
        headers,
        signal: controller.signal,
      });
      if (credRes.ok) {
        const credJson = (await credRes.json()) as {
          data?: { total_credits?: number; total_usage?: number };
        };
        if (
          typeof credJson.data?.total_credits === "number" &&
          typeof credJson.data?.total_usage === "number"
        ) {
          accountCreditsRemainingUsd = Math.max(
            0,
            credJson.data.total_credits - credJson.data.total_usage,
          );
        }
      }
    } catch {
      // /credits is optional
    }

    return {
      ok: !isProvisioningKey,
      label: json.data?.label,
      usageUsd: typeof json.data?.usage === "number" ? json.data.usage : 0,
      limitUsd: json.data?.limit ?? null,
      limitRemainingUsd: json.data?.limit_remaining ?? accountCreditsRemainingUsd,
      accountCreditsRemainingUsd,
      isProvisioningKey,
      isFreeTier: Boolean(json.data?.is_free_tier),
      ...(isProvisioningKey
        ? {
            error:
              "Provisioning/Management key detected — OpenRouter requires a standard Inference API key for model calls (openrouter.ai/settings/keys).",
          }
        : {}),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Locate an official CLI binary safely across trusted macOS directories first,
 * verifying executable permissions and owner/non-world-writable safety.
 */
export function findCliBinary(binary: string): string | null {
  if (!/^[a-z0-9_-]{1,32}$/i.test(binary)) return null;
  const home = os.homedir();
  const candidates = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    path.join(home, ".local/bin"),
    path.join(home, ".grok/bin"),
    path.join(home, ".npm-global/bin"),
    ...(process.env.PATH || "").split(":").filter(Boolean),
  ];
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  const seen = new Set<string>();
  for (const dir of candidates) {
    if (seen.has(dir)) continue;
    seen.add(dir);
    const full = path.join(dir, binary);
    try {
      fs.accessSync(full, fs.constants.X_OK);
      const real = fs.realpathSync(full);
      const st = fs.statSync(real);
      if (!st.isFile()) continue;
      if ((st.mode & 0o002) !== 0) continue; // reject world-writable binary
      if (uid !== null && st.uid !== uid && st.uid !== 0) continue;
      return full;
    } catch {
      // continue searching
    }
  }
  return null;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function isBlockedSsrfHost(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "169.254.169.254" ||
    host === "100.100.100.200" ||
    host === "0.0.0.0" ||
    host === "fd00:ec2::254" ||
    host === "metadata.google.internal" ||
    host === "metadata.goog" ||
    host === "metadata.azure.internal" ||
    host.endsWith(".metadata.google.internal")
  ) {
    return true;
  }
  // Link-local 169.254.0.0/16 & CGNAT 100.64.0.0/10 & 0.0.0.0/8
  if (/^169\.254\.\d+\.\d+$/.test(host) || /^0\.\d+\.\d+\.\d+$/.test(host)) {
    return true;
  }
  const cgnat = host.match(/^100\.(\d+)\.\d+\.\d+$/);
  if (cgnat) {
    const octet = Number(cgnat[1]);
    if (octet >= 64 && octet <= 127) return true;
  }
  // IPv4-mapped IPv6 (e.g. ::ffff:169.254.169.254 or hex form ::ffff:a9fe:a9fe)
  if (host.startsWith("::ffff:")) {
    const tail = host.slice(7);
    if (isBlockedSsrfHost(tail) || /^a9fe:/i.test(tail) || /^6464:/i.test(tail)) return true;
  }
  // IPv6 link-local fe80::/10
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;
  return false;
}

/**
 * Validate custom/provider base URL while blocking cloud metadata & link-local SSRF targets.
 */
export function validateLlmBaseUrl(
  raw: string,
  options: { loopbackOnly?: boolean } = {},
): string | null {
  const safe = safeHttpUrl(raw);
  if (!safe) return null;
  try {
    const u = new URL(safe);
    if (u.username || u.password) return null;
    const host = u.hostname.toLowerCase();
    if (options.loopbackOnly) {
      if (!LOOPBACK_HOSTS.has(host)) return null;
      return safe.replace(/\/+$/, "");
    }
    if (isBlockedSsrfHost(host)) {
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
 *   1. First Cloud API key saved in macOS Keychain (OpenRouter prioritized when saved)
 *   2. First Cloud API key present in process environment
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

  // 2. Environment Cloud API keys
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

// ─── Live Model Discovery, Preset Selection & Always-Latest Flagship Ranking ──

function extractVersionScore(id: string): number {
  const lower = id.toLowerCase();
  const dashed = lower.match(/(?:^|[-_/])(\d+)[.-](\d+)(?:$|[-_/.:])/);
  let score = 0;
  if (dashed) {
    const major = Number.parseInt(dashed[1], 10);
    const minor = Number.parseInt(dashed[2], 10);
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
  if (/(?:preview|exp|experimental|beta|alpha)/.test(lower)) score -= 2;
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
 * Select the newest fast (`screening`), newest flagship (`synthesis`), and `longContext`
 * models from a provider's discovered `/models` list, respecting the workspace routing preset.
 */
export function pickBestModelsForProvider(
  provider: ConcreteAiProvider,
  rawModels: string[],
  preset: AiRoutingPreset = "balanced",
  modelMeta?: Record<string, ProviderModelMetadata>,
): { screening: string; synthesis: string; longContext?: string } {
  const meta = getProviderMeta(provider);

  if (provider === "claude_cli") {
    return preset === "max_depth"
      ? { screening: "opus", synthesis: "opus" }
      : preset === "low_cost"
        ? { screening: "haiku", synthesis: "sonnet" }
        : { screening: "sonnet", synthesis: "opus" };
  }
  if (provider === "codex_cli" || provider === "gemini_cli") {
    return { screening: "auto", synthesis: "auto" };
  }

  const chatModels = rawModels.filter((m) => m && !isNonChatModel(m));
  if (chatModels.length === 0) {
    if (provider === "openrouter") {
      const p = OPENROUTER_PRESET_MODELS[preset] || OPENROUTER_PRESET_MODELS.balanced;
      return { screening: p.screening, synthesis: p.synthesis, longContext: p.longContext };
    }
    return {
      screening: meta.defaultScreeningModel,
      synthesis: meta.defaultSynthesisModel,
    };
  }

  const sorted = sortByVersionDesc(chatModels);

  if (provider === "openrouter") {
    // Filter out :free rate-limited proxies for production audit reliability
    const paid = sorted.filter((m) => !m.endsWith(":free"));
    const pool = paid.length > 0 ? paid : sorted;

    const pickFirst = (pred: (id: string) => boolean): string | undefined => pool.find(pred);

    const bestFlash =
      pickFirst((m) => /^google\/gemini-[^:]*flash(?!.*lite)/i.test(m)) ||
      pickFirst((m) => /^openai\/gpt-[^:]*mini/i.test(m)) ||
      pickFirst((m) => /^anthropic\/claude-[^:]*haiku/i.test(m));

    const bestSonnet =
      pickFirst((m) => /^anthropic\/claude-[^:]*sonnet/i.test(m)) ||
      pickFirst((m) => /^openai\/gpt-5/i.test(m) && !/mini|nano/i.test(m)) ||
      pickFirst((m) => /^google\/gemini-[^:]*pro/i.test(m));

    const bestOpus =
      pickFirst((m) => /^anthropic\/claude-[^:]*opus/i.test(m)) ||
      bestSonnet ||
      pickFirst((m) => /^openai\/gpt-5/i.test(m) && !/mini|nano/i.test(m));

    const bestLongCtx =
      pickFirst(
        (m) =>
          (modelMeta?.[m]?.contextLength ?? 0) >= 500_000 && /^google\/gemini-[^:]*pro/i.test(m),
      ) ||
      pickFirst((m) => /^google\/gemini-[^:]*pro/i.test(m)) ||
      bestSonnet ||
      pool[0];

    const defaults = OPENROUTER_PRESET_MODELS[preset] || OPENROUTER_PRESET_MODELS.balanced;
    if (preset === "max_depth") {
      return {
        screening: bestSonnet || defaults.screening,
        synthesis: bestOpus || defaults.synthesis,
        longContext: bestLongCtx || defaults.longContext,
      };
    }
    if (preset === "low_cost") {
      return {
        screening: bestFlash || defaults.screening,
        synthesis: bestFlash || defaults.synthesis,
        longContext: bestFlash || defaults.longContext,
      };
    }
    return {
      screening: bestFlash || defaults.screening,
      synthesis: bestSonnet || defaults.synthesis,
      longContext: bestLongCtx || defaults.longContext,
    };
  }

  if (provider === "anthropic") {
    const claude = sorted.filter((m) => m.toLowerCase().includes("claude"));
    const pool = claude.length > 0 ? claude : sorted;
    const opus = pool.filter((m) => m.toLowerCase().includes("opus"));
    const sonnet = pool.filter((m) => m.toLowerCase().includes("sonnet"));
    const haiku = pool.filter((m) => m.toLowerCase().includes("haiku"));
    if (preset === "low_cost") {
      return {
        screening: haiku[0] || sonnet[0] || pool[0],
        synthesis: sonnet[0] || pool[0],
      };
    }
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
    if (preset === "low_cost") {
      return {
        screening: flash[0] || anyFlash[0] || pool[0],
        synthesis: flash[0] || anyFlash[0] || pool[0],
      };
    }
    return {
      screening: flash[0] || anyFlash[0] || pool[0],
      synthesis: pro[0] || pool[0],
      longContext: pro[0] || flash[0] || pool[0],
    };
  }

  if (provider === "openai") {
    const gptOrO = sorted.filter((m) => /^(?:gpt-|o\d)/i.test(m));
    const pool = gptOrO.length > 0 ? gptOrO : sorted;
    const fast = pool.filter((m) => /(?:mini|nano|flash)/i.test(m));
    const flagship = pool.filter((m) => !/(?:mini|nano|flash)/i.test(m));
    return {
      screening: fast[0] || pool[0],
      synthesis: preset === "low_cost" ? fast[0] || pool[0] : flagship[0] || pool[0],
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
  preset: AiRoutingPreset = "balanced",
): ProviderModelsResponse | null {
  const cacheKey = `${provider}:${baseUrl?.trim() || ""}:${preset}`;
  const entry = modelCache.get(cacheKey);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.data;
  }
  return null;
}

export function estimateCostFromPricing(
  provider: ConcreteAiProvider,
  model: string,
  promptTokens: number,
  completionTokens: number,
  baseUrl?: string | null,
  preset: AiRoutingPreset = "balanced",
): number {
  const cached = getCachedModelsSync(provider, baseUrl, preset);
  const meta = cached?.modelMeta?.[model];
  if (meta?.promptPricePerM != null || meta?.completionPricePerM != null) {
    const pPrice = meta.promptPricePerM ?? 0;
    const cPrice = meta.completionPricePerM ?? 0;
    return (promptTokens / 1_000_000) * pPrice + (completionTokens / 1_000_000) * cPrice;
  }
  // Conservative curated fallback rates per 1M tokens when live catalog isn't warm yet
  const lower = model.toLowerCase();
  if (provider === "ollama" || provider === "lmstudio" || provider.endsWith("_cli")) return 0;
  if (lower.includes("opus")) {
    return (promptTokens / 1_000_000) * 15 + (completionTokens / 1_000_000) * 75;
  }
  if (lower.includes("sonnet")) {
    return (promptTokens / 1_000_000) * 3 + (completionTokens / 1_000_000) * 15;
  }
  if (lower.includes("flash") || lower.includes("haiku") || lower.includes("mini")) {
    return (promptTokens / 1_000_000) * 0.3 + (completionTokens / 1_000_000) * 1.5;
  }
  return (promptTokens / 1_000_000) * 2.5 + (completionTokens / 1_000_000) * 10;
}

/**
 * Query a provider's live `/models` endpoint (all Cloud APIs incl. OpenRouter capability/pricing,
 * Local OSS servers, or CLI aliases) with a 15-minute cache and graceful fallback.
 */
export async function fetchProviderModels(
  provider: ConcreteAiProvider,
  options?: { baseUrl?: string | null; preset?: AiRoutingPreset; forceRefresh?: boolean },
): Promise<ProviderModelsResponse> {
  const meta = getProviderMeta(provider);
  const preset = options?.preset || "balanced";
  const cacheKey = `${provider}:${options?.baseUrl?.trim() || ""}:${preset}`;
  if (!options?.forceRefresh) {
    const cached = getCachedModelsSync(provider, options?.baseUrl, preset);
    if (cached) return cached;
  }

  const nowIso = new Date().toISOString();
  const fallback = (note: string): ProviderModelsResponse => {
    const rec = pickBestModelsForProvider(provider, meta.suggestedModels, preset);
    return {
      provider,
      models: [...meta.suggestedModels],
      recommendedScreening: rec.screening,
      recommendedSynthesis: rec.synthesis,
      recommendedLongContext: rec.longContext,
      liveFetched: false,
      fetchedAt: nowIso,
      note,
    };
  };

  if (meta.mode === "subscription_cli") {
    const rec = pickBestModelsForProvider(provider, meta.suggestedModels, preset);
    const res: ProviderModelsResponse = {
      provider,
      models: [...meta.suggestedModels],
      recommendedScreening: rec.screening,
      recommendedSynthesis: rec.synthesis,
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
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    let discovered: string[] = [];
    const modelMeta: Record<string, ProviderModelMetadata> = {};

    if (provider === "openrouter") {
      const headers: Record<string, string> = {
        "HTTP-Referer": "https://github.com/haberlah/mount-charter-isms-compliance",
        "X-Title": "Mount Charter ISMS",
      };
      const { key } = resolveProviderApiKey("openrouter");
      if (key) headers.Authorization = `Bearer ${key}`;
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        headers,
        signal: controller.signal,
      });
      if (!res.ok) return fallback(`OpenRouter /models returned HTTP ${res.status}.`);
      const json = (await res.json()) as {
        data?: Array<{
          id?: string;
          context_length?: number;
          pricing?: { prompt?: string; completion?: string };
          supported_parameters?: string[];
        }>;
      };
      for (const item of json.data || []) {
        const id = String(item.id || "").trim();
        if (!id || isNonChatModel(id)) continue;
        discovered.push(id);
        const promptPerTok = Number.parseFloat(item.pricing?.prompt || "NaN");
        const compPerTok = Number.parseFloat(item.pricing?.completion || "NaN");
        const params = Array.isArray(item.supported_parameters) ? item.supported_parameters : [];
        modelMeta[id] = {
          contextLength: typeof item.context_length === "number" ? item.context_length : undefined,
          promptPricePerM: Number.isFinite(promptPerTok) ? promptPerTok * 1_000_000 : undefined,
          completionPricePerM: Number.isFinite(compPerTok) ? compPerTok * 1_000_000 : undefined,
          supportsTools: params.includes("tools"),
          supportsStructuredOutputs:
            params.includes("structured_outputs") || params.includes("response_format"),
        };
      }
      // Prioritize flagship vendors at the top of the selectable dropdown
      const tierVendors = /^(anthropic|google|openai|x-ai|deepseek|meta-llama|mistralai|qwen)\//i;
      const featured = sortByVersionDesc(
        Array.from(
          new Set(discovered.filter((id) => tierVendors.test(id) && !id.endsWith(":free"))),
        ),
      );
      const rest = sortByVersionDesc(
        Array.from(new Set(discovered.filter((id) => !featured.includes(id)))),
      );
      discovered = [...featured, ...rest];
    } else if (provider === "anthropic") {
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
      // Pin named cloud providers to their official HTTPS origin — never send a named
      // vendor's Keychain API key to an attacker- or user-supplied baseUrl.
      const allowCustomBase =
        provider === "custom_openai" || provider === "ollama" || provider === "lmstudio";
      const rawBase = allowCustomBase
        ? options?.baseUrl?.trim() || meta.defaultBaseUrl || ""
        : meta.defaultBaseUrl || "";
      const validBase = validateLlmBaseUrl(rawBase, {
        loopbackOnly: meta.mode === "local_oss",
      });
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
        redirect: headers.Authorization ? "error" : "follow",
        signal: controller.signal,
      });
      if (!res.ok) return fallback(`${meta.name} /models returned HTTP ${res.status}.`);
      const json = (await res.json()) as { data?: Array<{ id?: string }> };
      discovered = (json.data || [])
        .map((m) => String(m.id || ""))
        .filter((id) => id && !isNonChatModel(id));
    }

    const uniqueSorted =
      provider === "openrouter" ? discovered : sortByVersionDesc(Array.from(new Set(discovered)));
    if (uniqueSorted.length === 0) {
      return fallback(
        meta.mode === "local_oss"
          ? "No models returned — ensure Ollama or LM Studio is running with at least one pulled model."
          : `No chat models returned from ${meta.name}.`,
      );
    }

    const rec = pickBestModelsForProvider(provider, uniqueSorted, preset, modelMeta);
    const trimmedModels = uniqueSorted.slice(0, 80);
    const prunedMeta: Record<string, ProviderModelMetadata> = {};
    for (const id of [...trimmedModels, rec.screening, rec.synthesis, rec.longContext || ""]) {
      if (id && modelMeta[id]) prunedMeta[id] = modelMeta[id];
    }

    const result: ProviderModelsResponse = {
      provider,
      models: trimmedModels,
      recommendedScreening: rec.screening,
      recommendedSynthesis: rec.synthesis,
      recommendedLongContext: rec.longContext,
      modelMeta: Object.keys(prunedMeta).length > 0 ? prunedMeta : undefined,
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
  preset: AiRoutingPreset = "balanced",
): string {
  const trimmed = savedModel?.trim();
  if (trimmed && trimmed !== "auto") return trimmed;
  const meta = getProviderMeta(provider);
  if (provider === "claude_cli") {
    const rec = pickBestModelsForProvider(provider, meta.suggestedModels, preset);
    return tier === "synthesis" ? rec.synthesis : rec.screening;
  }
  if (provider === "codex_cli" || provider === "gemini_cli") {
    return "CLI default (latest)";
  }
  const cached = getCachedModelsSync(provider, baseUrl, preset);
  if (cached) {
    return tier === "synthesis" ? cached.recommendedSynthesis : cached.recommendedScreening;
  }
  if (provider === "openrouter") {
    const p = OPENROUTER_PRESET_MODELS[preset] || OPENROUTER_PRESET_MODELS.balanced;
    return tier === "synthesis" ? p.synthesis : p.screening;
  }
  return tier === "synthesis" ? meta.defaultSynthesisModel : meta.defaultScreeningModel;
}

export function getAiProviderStatus(profile: WorkspaceProfile | null): AiProviderStatus {
  const configuredProvider: AiProvider = profile?.aiProvider || "auto";
  const preset: AiRoutingPreset = profile?.aiRoutingPreset || "balanced";
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
        "No AI provider connected yet. Save an OpenRouter or vendor Cloud API key, connect a local Ollama/LM Studio server, or install a signed-in Subscription CLI.",
      baseUrl: profile?.aiBaseUrl || null,
      screeningModel: savedScreening,
      synthesisModel: savedSynthesis,
      resolvedScreeningModel: null,
      resolvedSynthesisModel: null,
      providers,
    };
  }

  const active = providers.find((p) => p.id === activeId)!;
  const effectiveBaseUrl =
    active.id === "openrouter"
      ? active.defaultBaseUrl || "https://openrouter.ai/api/v1"
      : profile?.aiBaseUrl || active.defaultBaseUrl || null;
  const resolvedScreening = resolveModelSyncPreview(
    active.id,
    savedScreening,
    "screening",
    effectiveBaseUrl,
    preset,
  );
  const resolvedSynthesis = resolveModelSyncPreview(
    active.id,
    savedSynthesis,
    "synthesis",
    effectiveBaseUrl,
    preset,
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
  tier: "screening" | "synthesis" | "long_context";
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
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  model: string;
  provider: ConcreteAiProvider;
}

const SAFE_CLI_MODEL_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,79}$/;

function buildSanitizedCliEnv(): NodeJS.ProcessEnv {
  const allowKeys = [
    "HOME",
    "PATH",
    "TMPDIR",
    "USER",
    "LOGNAME",
    "SHELL",
    "LANG",
    "TERM",
    "__CF_USER_TEXT_ENCODING",
  ];
  const env: NodeJS.ProcessEnv = {
    NO_COLOR: "1",
    DISABLE_AUTOUPDATER: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    BROWSER: "/usr/bin/false",
  };
  for (const key of allowKeys) {
    if (process.env[key]) env[key] = process.env[key];
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith("LC_") && v) env[k] = v;
  }
  return env;
}

function execCliPrompt(
  binaryPath: string,
  args: string[],
  stdinText: string | null,
  signal?: AbortSignal,
): Promise<string> {
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-cli-"));
  try {
    fs.chmodSync(scratchDir, 0o700);
  } catch {
    // non-POSIX fallback
  }
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      try {
        fs.rmSync(scratchDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    };
    const child = execFile(
      binaryPath,
      args,
      {
        cwd: scratchDir,
        timeout: 180_000,
        maxBuffer: 8 * 1024 * 1024,
        signal,
        env: buildSanitizedCliEnv(),
      },
      (err, stdout, stderr) => {
        cleanup();
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
  tier: "screening" | "synthesis" | "long_context",
  modelOverride?: string,
  totalPromptChars = 0,
): Promise<string> {
  const override = modelOverride?.trim();
  if (override && override !== "auto") return override;

  const effectiveTier =
    tier === "long_context" || totalPromptChars > 48_000 ? "long_context" : tier;
  const preset: AiRoutingPreset = profile?.aiRoutingPreset || "balanced";

  const saved = (
    effectiveTier === "screening" ? profile?.aiScreeningModel : profile?.aiSynthesisModel
  )?.trim();
  if (saved && saved !== "auto" && effectiveTier !== "long_context") return saved;

  if (provider === "claude_cli") {
    const rec = pickBestModelsForProvider(
      provider,
      getProviderMeta(provider).suggestedModels,
      preset,
    );
    return effectiveTier === "screening" ? rec.screening : rec.synthesis;
  }
  if (provider === "codex_cli" || provider === "gemini_cli") {
    return "auto";
  }

  const meta = getProviderMeta(provider);
  const discovered = await fetchProviderModels(provider, {
    baseUrl:
      provider === "openrouter" ? meta.defaultBaseUrl : profile?.aiBaseUrl || meta.defaultBaseUrl,
    preset,
  });
  if (effectiveTier === "long_context" && discovered.recommendedLongContext) {
    return discovered.recommendedLongContext;
  }
  return effectiveTier === "screening"
    ? discovered.recommendedScreening
    : discovered.recommendedSynthesis;
}

export async function invokeLlm(params: LlmInvocationParams): Promise<LlmInvocationResult> {
  const provider = resolveEffectiveProvider(params.profile);
  if (!provider) {
    throw new AIConfigurationError(
      "No AI provider connected yet. Save an OpenRouter or Cloud API key, start a local Ollama/LM Studio server, or install a signed-in Subscription CLI in Settings → AI Providers & Subscriptions.",
    );
  }
  const meta = getProviderMeta(provider);
  const totalPromptChars = (params.system?.length || 0) + params.user.length;
  const model = await resolveRuntimeModel(
    provider,
    params.profile,
    params.tier,
    params.modelOverride,
    totalPromptChars,
  );
  const preset: AiRoutingPreset = params.profile?.aiRoutingPreset || "balanced";
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
      const costUsd = estimateCostFromPricing(
        provider,
        model,
        inputTokens,
        outputTokens,
        null,
        preset,
      );
      return {
        text: fullText,
        tokensUsed: inputTokens + outputTokens,
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        costUsd,
        model,
        provider,
      };
    }

    const data = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const block = data.content?.find((b) => b.type === "text" && typeof b.text === "string");
    if (!block?.text) throw new Error("Unexpected response type from Anthropic");
    const promptTokens = data.usage?.input_tokens || 0;
    const completionTokens = data.usage?.output_tokens || 0;
    return {
      text: block.text,
      tokensUsed: promptTokens + completionTokens,
      promptTokens,
      completionTokens,
      costUsd: estimateCostFromPricing(
        provider,
        model,
        promptTokens,
        completionTokens,
        null,
        preset,
      ),
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

    const safeCliModel = model && model !== "auto" && SAFE_CLI_MODEL_RE.test(model) ? model : null;
    if (model && model !== "auto" && !safeCliModel) {
      throw new AIConfigurationError(`Invalid CLI model identifier: ${model.slice(0, 40)}`);
    }

    let stdout = "";
    if (provider === "claude_cli") {
      const cliArgs = [
        "-p",
        "--output-format",
        "text",
        "--tools",
        "",
        "--no-session-persistence",
        "--permission-mode",
        "dontAsk",
      ];
      if (safeCliModel) cliArgs.push("--model", safeCliModel);
      stdout = await execCliPrompt(binPath, cliArgs, combinedPrompt, params.signal);
    } else if (provider === "codex_cli") {
      const cliArgs = [
        "exec",
        "--ephemeral",
        "--skip-git-repo-check",
        "-s",
        "read-only",
        "-c",
        'forced_login_method="chatgpt"',
      ];
      if (safeCliModel) cliArgs.push("-m", safeCliModel);
      cliArgs.push("-");
      stdout = await execCliPrompt(binPath, cliArgs, combinedPrompt, params.signal);
    } else if (provider === "grok_cli") {
      const cliArgs = [
        "--permission-mode",
        "plan",
        "--disable-web-search",
        "--no-subagents",
        "--tools",
        "",
        "--output-format",
        "plain",
        "-p",
        "-",
      ];
      if (safeCliModel) cliArgs.push("-m", safeCliModel);
      stdout = await execCliPrompt(binPath, cliArgs, combinedPrompt, params.signal);
    } else if (provider === "cursor_cli") {
      const cliArgs = ["-p", "--mode", "ask", "--sandbox", "enabled", "--output-format", "text"];
      if (safeCliModel) cliArgs.push("--model", safeCliModel);
      stdout = await execCliPrompt(binPath, cliArgs, combinedPrompt, params.signal);
    } else {
      // Pipe prompt strictly via stdin (never argv / ps aux)
      const cliArgs: string[] = ["--approval-mode", "plan", "--skip-trust"];
      if (safeCliModel) cliArgs.push("-m", safeCliModel);
      cliArgs.push("-p", "");
      stdout = await execCliPrompt(binPath, cliArgs, combinedPrompt, params.signal);
    }

    params.onToken?.(stdout);
    const promptTokens = Math.ceil(combinedPrompt.length / 4);
    const completionTokens = Math.ceil(stdout.length / 4);
    return {
      text: stdout,
      tokensUsed: promptTokens + completionTokens,
      promptTokens,
      completionTokens,
      costUsd: 0,
      model: model === "auto" ? `${provider}:default` : model,
      provider,
    };
  }

  // 3. OpenAI-Compatible REST API (OpenRouter, OpenAI, Gemini, xAI Grok, Meta Llama, Ollama, LM Studio, Custom)
  // Pin named cloud providers to their official HTTPS origins — only custom_openai/ollama/lmstudio accept aiBaseUrl.
  const allowCustomBase =
    provider === "custom_openai" || provider === "ollama" || provider === "lmstudio";
  const rawBase = allowCustomBase
    ? params.profile?.aiBaseUrl?.trim() || meta.defaultBaseUrl || ""
    : meta.defaultBaseUrl || "";
  const baseUrl = validateLlmBaseUrl(rawBase, { loopbackOnly: meta.mode === "local_oss" });
  if (!baseUrl) {
    throw new AIConfigurationError(
      `Invalid or missing Base URL for ${meta.name}. Set a valid http(s):// endpoint in Settings → AI Providers & Subscriptions.`,
    );
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://github.com/haberlah/mount-charter-isms-compliance";
    headers["X-Title"] = "Mount Charter ISMS";
  }
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

  const streaming = Boolean(params.onToken);
  const bodyObj: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.2,
    ...(streaming ? { stream: true, stream_options: { include_usage: true } } : {}),
  };

  if (provider === "openrouter") {
    const zdrEnabled = params.profile?.aiZdrOnly !== false;
    if (zdrEnabled) {
      // Fail-closed strict Zero Data Retention: enforce ZDR endpoints, deny data collection,
      // and disable silent non-ZDR fallback routing.
      bodyObj.provider = {
        data_collection: "deny",
        zdr: true,
        allow_fallbacks: false,
      };
    } else {
      const fallbackModel =
        params.tier === "screening" ? "google/gemini-2.5-flash" : "anthropic/claude-sonnet-4.6";
      if (fallbackModel !== model) {
        bodyObj.models = [model, fallbackModel];
      }
    }
  }

  let response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    redirect: headers.Authorization ? "error" : "follow",
    signal: params.signal,
    body: JSON.stringify(bodyObj),
  });

  // Resilient 1-retry with brief backoff on transient 503/429 spikes (never substituting sunset models)
  if (
    !response.ok &&
    (response.status === 503 || response.status === 429) &&
    !params.signal?.aborted
  ) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      redirect: headers.Authorization ? "error" : "follow",
      signal: params.signal,
      body: JSON.stringify(bodyObj),
    });
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(
      `${meta.name} request failed (HTTP ${response.status}): ${errBody.slice(0, 300)}`,
    );
  }

  if (streaming && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    let promptTokens = 0;
    let completionTokens = 0;
    let reportedCost: number | null = null;
    let resolvedModel = model;

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
            model?: string;
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: {
              prompt_tokens?: number;
              completion_tokens?: number;
              total_tokens?: number;
              cost?: number;
            };
          };
          if (ev.model) resolvedModel = ev.model;
          const chunk = ev.choices?.[0]?.delta?.content;
          if (chunk) {
            fullText += chunk;
            params.onToken?.(chunk);
          }
          if (ev.usage) {
            if (typeof ev.usage.prompt_tokens === "number") promptTokens = ev.usage.prompt_tokens;
            if (typeof ev.usage.completion_tokens === "number") {
              completionTokens = ev.usage.completion_tokens;
            }
            if (typeof ev.usage.cost === "number") reportedCost = ev.usage.cost;
          }
        } catch {
          // ignore SSE comments / keepalives
        }
      }
    }

    if (!fullText.trim()) throw new Error(`${meta.name} returned an empty streamed response.`);
    if (promptTokens === 0) promptTokens = Math.ceil(totalPromptChars / 4);
    if (completionTokens === 0) completionTokens = Math.ceil(fullText.length / 4);
    const costUsd =
      reportedCost !== null
        ? reportedCost
        : estimateCostFromPricing(
            provider,
            resolvedModel,
            promptTokens,
            completionTokens,
            baseUrl,
            preset,
          );

    return {
      text: fullText.trim(),
      tokensUsed: promptTokens + completionTokens,
      promptTokens,
      completionTokens,
      costUsd,
      model: resolvedModel,
      provider,
    };
  }

  const json = (await response.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      total_tokens?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
      cost?: number;
    };
  };
  const text = String(json.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new Error(`${meta.name} returned an empty response.`);
  params.onToken?.(text);

  const resolvedModel = json.model || model;
  const promptTokens = json.usage?.prompt_tokens ?? Math.ceil(totalPromptChars / 4);
  const completionTokens = json.usage?.completion_tokens ?? Math.ceil(text.length / 4);
  const tokensUsed = json.usage?.total_tokens ?? promptTokens + completionTokens;
  const costUsd =
    typeof json.usage?.cost === "number"
      ? json.usage.cost
      : estimateCostFromPricing(
          provider,
          resolvedModel,
          promptTokens,
          completionTokens,
          baseUrl,
          preset,
        );

  return {
    text,
    tokensUsed,
    promptTokens,
    completionTokens,
    costUsd,
    model: resolvedModel,
    provider,
  };
}
