export interface AiSubscriptionConnection {
  id: string;
  glyph: "claude" | "codex" | "gemini" | "grok" | "cursor";
  name: string;
  installed: boolean;
  authenticated: boolean;
  needsReauth?: boolean;
  planLabel?: string;
  detail?: string;
  installCmd?: string;
}

export interface AiOpenRouterState {
  connected: boolean;
  creditsRemainingUsd?: number | null;
  isProvisioningKey?: boolean;
  oauthSupported?: boolean;
  note?: string;
}

export interface AiLocalServerState {
  id: string;
  name: string;
  baseUrl: string;
  running: boolean;
  modelCount?: number;
}

export interface AiDirectKeyState {
  id: string;
  name: string;
  configured: boolean;
}

export interface AiConnectionsSnapshot {
  activeProviderId: string;
  activeLabel: string;
  activeMeta: string;
  pillLabel?: string;
  health: "ok" | "warn" | "err" | "none";
  zdrEnabled: boolean;
  preset: "balanced" | "max_depth" | "low_cost";
  resolvedScreening?: string;
  resolvedSynthesis?: string;
  subscriptions: AiSubscriptionConnection[];
  openrouter: AiOpenRouterState;
  localServers?: AiLocalServerState[];
  directKeys?: AiDirectKeyState[];
  hubConnected?: boolean;
}

export class PaperAiConnections extends HTMLElement {
  mode: "single" | "multi";
  state: AiConnectionsSnapshot;
  refreshFromEndpoint(): Promise<void>;
}

export class PaperAiPill extends HTMLElement {
  state: AiConnectionsSnapshot;
  refreshFromEndpoint(): Promise<void>;
}
