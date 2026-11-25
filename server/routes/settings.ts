import {
  aiProviderValues,
  aiRoutingPresetValues,
  concreteAiProviderValues,
  updateProfileSchema,
} from "@shared/schema";
import { Router } from "express";
import { z } from "zod";
import { AIConfigurationError, getAiProviderStatus, testApiConnectivity } from "../ai";
import {
  fetchOpenRouterKeyInfo,
  fetchProviderModels,
  OPENROUTER_PRESET_MODELS,
  probeLocalModels,
  resolveEffectiveProvider,
  saveProviderApiKey,
  validateLlmBaseUrl,
} from "../ai-provider";
import { getDataDir } from "../config";
import { storage } from "../storage";
import { resolveWorkspaceId, sendValidationError } from "./helpers";

export const settingsRouter = Router();

settingsRouter.get("/settings/profile", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const profile = storage.getProfile(workspaceId);
  res.json({
    profile,
    aiStatus: getAiProviderStatus(profile),
    tokensUsedToday: storage.getTokensUsedToday(workspaceId),
    costUsedTodayUsd: storage.getCostUsedTodayUsd(workspaceId),
    openrouterPresets: OPENROUTER_PRESET_MODELS,
    dataDir: getDataDir(),
  });
});

settingsRouter.put("/settings/profile", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(
      res,
      parsed.error.issues[0]?.message || "Invalid profile update",
      parsed.error.issues,
    );
  }
  if (parsed.data.aiBaseUrl?.trim()) {
    if (!validateLlmBaseUrl(parsed.data.aiBaseUrl)) {
      return sendValidationError(
        res,
        "AI Base URL must be a valid http:// or https:// endpoint (metadata IPs blocked).",
      );
    }
  }
  const profile = storage.updateProfile(workspaceId, parsed.data);
  res.json({
    profile,
    aiStatus: getAiProviderStatus(profile),
    tokensUsedToday: storage.getTokensUsedToday(workspaceId),
    costUsedTodayUsd: storage.getCostUsedTodayUsd(workspaceId),
    openrouterPresets: OPENROUTER_PRESET_MODELS,
    dataDir: getDataDir(),
  });
});

settingsRouter.post("/settings/apply-schedule-defaults", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const result = storage.applyScheduleDefaults(workspaceId);
  res.json(result);
});

const apiKeySchema = z.object({
  provider: z.enum(concreteAiProviderValues),
  apiKey: z.string().trim().min(8, "API key appears too short").max(400),
});

settingsRouter.put("/settings/api-key", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const parsed = apiKeySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error.issues[0]?.message || "Invalid API key");
  }
  const saved = saveProviderApiKey(parsed.data.provider, parsed.data.apiKey);
  if (!saved) {
    return res
      .status(500)
      .json({ error: `Failed to save ${parsed.data.provider} API key to macOS Keychain` });
  }
  const profile = storage.getProfile(workspaceId);
  res.json({ saved: true, provider: parsed.data.provider, aiStatus: getAiProviderStatus(profile) });
});

settingsRouter.delete("/settings/api-key", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const rawProvider = typeof req.query.provider === "string" ? req.query.provider : "";
  const parsedProvider = z.enum(concreteAiProviderValues).safeParse(rawProvider);
  if (!parsedProvider.success) {
    return sendValidationError(res, "Specify a valid AI provider to remove its API key.");
  }
  const provider = parsedProvider.data;
  saveProviderApiKey(provider, null);
  const profile = storage.getProfile(workspaceId);
  res.json({ removed: true, provider, aiStatus: getAiProviderStatus(profile) });
});

settingsRouter.get("/settings/models", async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const profile = storage.getProfile(workspaceId);
  const rawProvider = typeof req.query.provider === "string" ? req.query.provider.trim() : "auto";
  const parsedProvider = z.enum(aiProviderValues).safeParse(rawProvider);
  if (!parsedProvider.success) {
    return sendValidationError(res, "Unknown AI provider");
  }

  const baseUrlParam =
    typeof req.query.baseUrl === "string" && req.query.baseUrl.trim()
      ? req.query.baseUrl.trim()
      : null;
  if (baseUrlParam && !validateLlmBaseUrl(baseUrlParam)) {
    return sendValidationError(
      res,
      "AI Base URL must be a valid http:// or https:// endpoint (metadata IPs blocked).",
    );
  }

  const forceRefresh = req.query.refresh === "1" || req.query.refresh === "true";
  const rawPreset = typeof req.query.preset === "string" ? req.query.preset.trim() : undefined;
  const parsedPreset = rawPreset ? z.enum(aiRoutingPresetValues).safeParse(rawPreset) : null;
  const preset = parsedPreset?.success ? parsedPreset.data : profile.aiRoutingPreset;

  const concreteProvider =
    parsedProvider.data === "auto" ? resolveEffectiveProvider(profile) : parsedProvider.data;

  if (!concreteProvider) {
    return res.json({
      provider: null,
      models: [],
      recommendedScreening: "auto",
      recommendedSynthesis: "auto",
      liveFetched: false,
      fetchedAt: new Date().toISOString(),
      note: "No AI provider connected yet. Save an API key, start a local server, or install a Subscription CLI.",
    });
  }

  const result = await fetchProviderModels(concreteProvider, {
    baseUrl: baseUrlParam ?? profile.aiBaseUrl,
    preset,
    forceRefresh,
  });
  res.json(result);
});

settingsRouter.get("/settings/openrouter-key-info", async (_req, res) => {
  const info = await fetchOpenRouterKeyInfo();
  res.json(info);
});

settingsRouter.get("/settings/local-models", async (req, res) => {
  const baseUrl =
    typeof req.query.baseUrl === "string" && req.query.baseUrl.trim()
      ? req.query.baseUrl.trim()
      : "http://127.0.0.1:11434/v1";
  const models = await probeLocalModels(baseUrl);
  res.json({ baseUrl, models });
});

settingsRouter.post("/settings/test-api", async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  try {
    const profile = storage.getProfile(workspaceId);
    const result = await testApiConnectivity(profile);
    storage.logAiInteraction({
      workspaceId,
      interactionType: "connectivity_test",
      inputSummary: `${result.provider} connectivity check`,
      outputSummary: "OK",
      modelUsed: result.model,
      provider: result.provider,
      tokensUsed: result.tokensUsed,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      costUsd: result.costUsd,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof AIConfigurationError) {
      return res.status(503).json({ error: err.message });
    }
    res.status(502).json({
      error: err instanceof Error ? err.message : "AI connectivity test failed",
    });
  }
});
