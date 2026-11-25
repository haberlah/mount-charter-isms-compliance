import { execFile, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { ConcreteAiProvider, WorkspaceProfile } from "@shared/schema";
import {
  clearModelCache,
  fetchOpenRouterKeyInfo,
  findCliBinary,
  probeLocalModels,
  resolveProviderApiKey,
  saveProviderApiKey,
} from "./ai-provider";

const OPENROUTER_API = "https://openrouter.ai/api/v1";
const OPENROUTER_AUTH_URL = "https://openrouter.ai/auth";
const PKCE_TTL_MS = 5 * 60 * 1000;

interface ActivePkceFlow {
  server: http.Server;
  state: string;
  timer: NodeJS.Timeout;
}

let activePkceFlow: ActivePkceFlow | null = null;

function base64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function getHubSocketPaths(): { socketPath: string; tokenPath: string } {
  const dir =
    process.env.AI_VAULT_DIR?.trim() ||
    path.join(os.homedir(), "Library", "Application Support", "AI-Vault");
  return {
    socketPath: path.join(dir, "broker.sock"),
    tokenPath: path.join(dir, "hub.token"),
  };
}

/**
 * Optional local 0600 Unix-socket hub request (returns null immediately if hub is not installed).
 * Keeps Mount Charter 100% standalone for external MIT users while syncing seamlessly when the hub is running.
 */
function requestLocalHub(
  method: string,
  reqPath: string,
  body: Record<string, unknown> | null = null,
  timeoutMs = 3500,
): Promise<{ status: number; data: Record<string, unknown> } | null> {
  if (process.env.MOUNT_CHARTER_DISABLE_HUB === "1") return Promise.resolve(null);
  const { socketPath, tokenPath } = getHubSocketPaths();
  if (!fs.existsSync(socketPath) || !fs.existsSync(tokenPath)) return Promise.resolve(null);
  let token = "";
  try {
    token = fs.readFileSync(tokenPath, "utf8").trim();
  } catch {
    return Promise.resolve(null);
  }
  if (!token) return Promise.resolve(null);

  return new Promise((resolve) => {
    const payload = body !== null ? JSON.stringify(body) : null;
    const req = http.request(
      {
        socketPath,
        path: reqPath,
        method,
        timeout: timeoutMs,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": String(Buffer.byteLength(payload)),
              }
            : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
              string,
              unknown
            >;
            resolve({ status: res.statusCode || 500, data });
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
    if (payload) req.write(payload);
    req.end();
  });
}

const CLI_DEFS = [
  {
    id: "claude_cli" as const,
    glyph: "claude" as const,
    name: "Claude",
    binary: "claude",
    installCmd: "curl -fsSL https://claude.ai/install.sh | bash",
    loginArgs: ["auth", "login", "--claudeai"],
    logoutArgs: ["auth", "logout"],
    needsTerminal: false,
  },
  {
    id: "codex_cli" as const,
    glyph: "codex" as const,
    name: "ChatGPT",
    binary: "codex",
    installCmd: "npm i -g @openai/codex",
    loginArgs: ["login"],
    logoutArgs: ["logout"],
    needsTerminal: false,
  },
  {
    id: "gemini_cli" as const,
    glyph: "gemini" as const,
    name: "Gemini",
    binary: "gemini",
    installCmd: "brew install gemini-cli",
    loginArgs: [] as string[],
    logoutArgs: null as string[] | null,
    needsTerminal: true,
  },
  {
    id: "grok_cli" as const,
    glyph: "grok" as const,
    name: "Grok",
    binary: "grok",
    installCmd: "curl -fsSL https://grok.com/install.sh | sh",
    loginArgs: ["login", "--oauth"],
    logoutArgs: ["logout"],
    needsTerminal: false,
  },
  {
    id: "cursor_cli" as const,
    glyph: "cursor" as const,
    name: "Cursor",
    binary: "cursor-agent",
    installCmd: "curl -fsSL https://cursor.com/install | bash",
    loginArgs: ["login"],
    logoutArgs: ["logout"],
    needsTerminal: false,
  },
];

function execShortCli(
  binPath: string,
  args: string[],
  timeoutMs = 3500,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      binPath,
      args,
      {
        cwd: os.tmpdir(),
        timeout: timeoutMs,
        maxBuffer: 512 * 1024,
        env: {
          HOME: process.env.HOME || os.homedir(),
          PATH: process.env.PATH || "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
          NO_COLOR: "1",
          BROWSER: "/usr/bin/false",
        },
      },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          stdout: String(stdout || "").trim(),
          stderr: String(stderr || "").trim(),
        });
      },
    );
  });
}

async function probeLocalCliSubscription(def: (typeof CLI_DEFS)[number]) {
  const binPath = findCliBinary(def.binary);
  const base = {
    id: def.id,
    glyph: def.glyph,
    name: def.name,
    installed: Boolean(binPath),
    authenticated: false,
    needsReauth: false,
    planLabel: "",
    detail: binPath ? "Sign in to connect" : "CLI not installed",
    installCmd: def.installCmd,
  };
  if (!binPath) return base;

  if (def.id === "claude_cli") {
    const r = await execShortCli(binPath, ["auth", "status", "--json"]);
    if (r.ok && r.stdout) {
      try {
        const j = JSON.parse(r.stdout) as {
          loggedIn?: boolean;
          authMethod?: string;
          loginExpiresAt?: string;
          planTier?: string;
          email?: string;
        };
        const expMs = j.loginExpiresAt ? Date.parse(j.loginExpiresAt) : Number.NaN;
        const expired = Number.isFinite(expMs) && expMs < Date.now();
        base.authenticated = Boolean(j.loggedIn) && j.authMethod === "claude.ai" && !expired;
        base.needsReauth = expired;
        base.planLabel = j.planTier || (base.authenticated ? "Signed in" : "");
        base.detail = j.email || (base.authenticated ? "Browser SSO active" : "Sign in to connect");
      } catch {
        // ignore parse failure
      }
    }
  } else if (def.id === "codex_cli") {
    const r = await execShortCli(binPath, ["login", "status"]);
    const ok = r.ok && /chatgpt/i.test(`${r.stdout}\n${r.stderr}`);
    base.authenticated = ok;
    base.planLabel = ok ? "ChatGPT" : "";
    base.detail = ok ? "Signed in via ChatGPT SSO" : "Sign in to connect";
  } else if (def.id === "gemini_cli") {
    try {
      const st = fs.statSync(path.join(os.homedir(), ".gemini", "oauth_creds.json"));
      if (st.isFile() && st.size > 10) {
        base.authenticated = true;
        base.planLabel = "Google OAuth";
        base.detail = "Signed in via Google OAuth";
      }
    } catch {
      // not signed in
    }
  } else if (def.id === "grok_cli") {
    let hasFile = false;
    try {
      hasFile = fs.statSync(path.join(os.homedir(), ".grok", "auth.json")).size > 10;
    } catch {
      hasFile = false;
    }
    if (hasFile) {
      const r = await execShortCli(binPath, ["models"]);
      const notAuthed = /not authenticated|login/i.test(`${r.stdout}\n${r.stderr}`);
      base.authenticated = r.ok && !notAuthed;
      base.needsReauth = notAuthed;
      base.planLabel = base.authenticated ? "Grok" : "";
      base.detail = base.authenticated ? "Signed in via Grok OAuth" : "Session expired";
    }
  } else if (def.id === "cursor_cli") {
    const r = await execShortCli(binPath, ["status", "--format", "json"], 4500);
    if (r.ok && r.stdout) {
      try {
        const j = JSON.parse(r.stdout) as {
          isAuthenticated?: boolean;
          status?: string;
          userInfo?: { email?: string; teamName?: string };
        };
        base.authenticated = Boolean(j.isAuthenticated || j.status === "authenticated");
        base.planLabel = j.userInfo?.teamName
          ? `Team (${j.userInfo.teamName})`
          : base.authenticated
            ? "Signed in"
            : "";
        base.detail =
          j.userInfo?.email || (base.authenticated ? "Cursor SSO active" : "Sign in to connect");
      } catch {
        // ignore parse failure
      }
    }
  }
  return base;
}

export async function getMountCharterConnectionsSnapshot(
  profile: WorkspaceProfile,
  { forceRefresh = false } = {},
) {
  const qs = new URLSearchParams({
    activeProviderId: profile.aiProvider || "auto",
    zdr: profile.aiZdrOnly !== false ? "1" : "0",
    preset: profile.aiRoutingPreset || "balanced",
    ...(forceRefresh ? { refresh: "1" } : {}),
  });
  const hubRes = await requestLocalHub("GET", `/v1/connections?${qs.toString()}`, null, 5000);
  if (hubRes && hubRes.status === 200) {
    return {
      ...hubRes.data,
      resolvedScreening: profile.aiScreeningModel || "auto",
      resolvedSynthesis: profile.aiSynthesisModel || "auto",
    };
  }

  // Standalone MIT fallback (zero external daemon required)
  const [subscriptions, orInfo, ollamaModels, lmModels] = await Promise.all([
    Promise.all(CLI_DEFS.map((d) => probeLocalCliSubscription(d))),
    fetchOpenRouterKeyInfo(),
    probeLocalModels("http://127.0.0.1:11434/v1"),
    probeLocalModels("http://127.0.0.1:1234/v1"),
  ]);

  const directList: Array<{ id: ConcreteAiProvider; name: string }> = [
    { id: "anthropic", name: "Anthropic" },
    { id: "openai", name: "OpenAI" },
    { id: "gemini", name: "Google Gemini" },
    { id: "xai", name: "xAI Grok" },
  ];
  const directKeys = directList.map((d) => ({
    id: d.id,
    name: d.name,
    configured: Boolean(resolveProviderApiKey(d.id).key),
  }));

  const orConnected = Boolean(orInfo.ok && !orInfo.isProvisioningKey);
  const openrouter = {
    connected: orConnected,
    creditsRemainingUsd: orInfo.limitRemainingUsd ?? orInfo.accountCreditsRemainingUsd ?? null,
    isProvisioningKey: Boolean(orInfo.isProvisioningKey),
    oauthSupported: true,
    note: orInfo.error || "",
  };

  const localServers = [
    {
      id: "ollama",
      name: "Ollama",
      baseUrl: "http://127.0.0.1:11434/v1",
      running: ollamaModels.length > 0,
      modelCount: ollamaModels.length,
    },
    {
      id: "lmstudio",
      name: "LM Studio",
      baseUrl: "http://127.0.0.1:1234/v1",
      running: lmModels.length > 0,
      modelCount: lmModels.length,
    },
  ];

  const connectedSubs = subscriptions.filter((s) => s.authenticated);
  const activeId = profile.aiProvider || "auto";
  const effective =
    activeId !== "auto"
      ? activeId
      : orConnected
        ? "openrouter"
        : connectedSubs[0]?.id ||
          localServers.find((l) => l.running)?.id ||
          directKeys.find((d) => d.configured)?.id ||
          "none";

  let activeLabel = "Not connected";
  let activeMeta = "Sign in to a subscription or OpenRouter to begin";
  let pillLabel = "Connect AI";
  let health: "ok" | "warn" | "err" | "none" = "none";

  if (effective === "openrouter" && orConnected) {
    activeLabel = "OpenRouter · Unified API";
    activeMeta =
      openrouter.creditsRemainingUsd != null
        ? `$${openrouter.creditsRemainingUsd.toFixed(2)} credit · ${profile.aiZdrOnly !== false ? "Strict ZDR" : "Standard"}`
        : profile.aiZdrOnly !== false
          ? "Strict ZDR enabled"
          : "Connected";
    pillLabel =
      openrouter.creditsRemainingUsd != null
        ? `OR $${openrouter.creditsRemainingUsd.toFixed(2)}`
        : "OpenRouter";
    health = "ok";
  } else if (connectedSubs.some((s) => s.id === effective)) {
    const sub = connectedSubs.find((s) => s.id === effective);
    activeLabel = `${sub?.name || "Subscription"} Subscription`;
    activeMeta = `$0 API spend · ${sub?.planLabel || "Signed in"}`;
    pillLabel = `${sub?.name || "Sub"} Sub`;
    health = "ok";
  } else if (localServers.some((l) => l.id === effective && l.running)) {
    const loc = localServers.find((l) => l.id === effective);
    activeLabel = `${loc?.name || "Local"} (Offline)`;
    activeMeta = `$0 · 100% local · ${loc?.modelCount || 0} models`;
    pillLabel = loc?.name || "Local";
    health = "ok";
  } else if (directKeys.some((d) => d.id === effective && d.configured)) {
    const dk = directKeys.find((d) => d.id === effective);
    activeLabel = `${dk?.name || "API"} API`;
    activeMeta = "Direct API key in macOS Keychain";
    pillLabel = dk?.name || "API";
    health = "ok";
  } else if (openrouter.isProvisioningKey || subscriptions.some((s) => s.needsReauth)) {
    activeLabel = "Action required";
    activeMeta = openrouter.isProvisioningKey
      ? "OpenRouter Provisioning key detected — connect with Browser SSO"
      : "A subscription session expired — click Reconnect";
    pillLabel = "Reconnect AI";
    health = "warn";
  }

  return {
    activeProviderId: activeId,
    activeLabel,
    activeMeta,
    pillLabel,
    health,
    zdrEnabled: profile.aiZdrOnly !== false,
    preset: profile.aiRoutingPreset || "balanced",
    resolvedScreening: profile.aiScreeningModel || "auto",
    resolvedSynthesis: profile.aiSynthesisModel || "auto",
    subscriptions,
    openrouter,
    localServers,
    directKeys,
    hubConnected: false,
  };
}

/**
 * 1-click OpenRouter OAuth PKCE (RFC 7636 S256) with ephemeral 127.0.0.1:0 callback.
 */
export async function startMountCharterOpenRouterOAuth(): Promise<{
  started: boolean;
  authUrl: string;
  port?: number;
}> {
  const hubRes = await requestLocalHub("POST", "/v1/connections/openrouter/oauth", {
    openBrowser: true,
  });
  if (hubRes && hubRes.status === 200 && typeof hubRes.data.authUrl === "string") {
    return {
      started: true,
      authUrl: hubRes.data.authUrl,
      port: typeof hubRes.data.port === "number" ? hubRes.data.port : undefined,
    };
  }

  if (activePkceFlow) {
    try {
      clearTimeout(activePkceFlow.timer);
      activePkceFlow.server.close();
    } catch {
      // ignore
    }
    activePkceFlow = null;
  }

  const codeVerifier = base64Url(crypto.randomBytes(48));
  const codeChallenge = base64Url(crypto.createHash("sha256").update(codeVerifier).digest());
  const state = base64Url(crypto.randomBytes(32));

  const server = http.createServer(async (req, res) => {
    const hdrs = {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    };
    try {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      if (String(req.headers.host || "").toLowerCase() !== `127.0.0.1:${port}`) {
        res.writeHead(403, hdrs);
        res.end("<h1>Forbidden</h1>");
        return;
      }
      const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404, hdrs);
        res.end("<h1>Not found</h1>");
        return;
      }

      const returnedState = url.searchParams.get("state") || "";
      const code = url.searchParams.get("code") || "";
      const flow = activePkceFlow;
      activePkceFlow = null;
      if (flow) {
        clearTimeout(flow.timer);
        setTimeout(() => server.close(), 250);
      }

      const a = Buffer.from(returnedState, "utf8");
      const b = Buffer.from(state, "utf8");
      if (!flow || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        res.writeHead(400, hdrs);
        res.end("<h2>Invalid or expired sign-in state</h2>");
        return;
      }
      if (!/^[A-Za-z0-9._~-]{8,512}$/.test(code)) {
        res.writeHead(400, hdrs);
        res.end("<h2>Invalid authorization code</h2>");
        return;
      }

      const exRes = await fetch(`${OPENROUTER_API}/auth/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        redirect: "error",
        body: JSON.stringify({
          code,
          code_verifier: codeVerifier,
          code_challenge_method: "S256",
        }),
      });
      if (!exRes.ok) {
        res.writeHead(502, hdrs);
        res.end("<h2>OpenRouter key exchange failed</h2>");
        return;
      }
      const exJson = (await exRes.json()) as { key?: string };
      const apiKey = typeof exJson.key === "string" ? exJson.key.trim() : "";
      if (!apiKey || apiKey.length < 16) {
        res.writeHead(502, hdrs);
        res.end("<h2>Empty key returned</h2>");
        return;
      }
      saveProviderApiKey("openrouter", apiKey);
      clearModelCache("openrouter");
      res.writeHead(200, hdrs);
      res.end(
        "<!doctype html><html><body style='font-family:system-ui;padding:40px'><h2>Connected to OpenRouter</h2><p>Your API key is saved in macOS Keychain. You can close this tab and return to Mount Charter.</p></body></html>",
      );
    } catch {
      res.writeHead(500, hdrs);
      res.end("<h1>Error</h1>");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const callbackUrl = `http://127.0.0.1:${port}/callback?state=${encodeURIComponent(state)}`;
  const authUrl = `${OPENROUTER_AUTH_URL}?callback_url=${encodeURIComponent(callbackUrl)}&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256`;

  const timer = setTimeout(() => {
    if (activePkceFlow?.server === server) {
      activePkceFlow = null;
      try {
        server.close();
      } catch {
        // ignore
      }
    }
  }, PKCE_TTL_MS);
  timer.unref();
  activePkceFlow = { server, state, timer };

  if (process.platform === "darwin") {
    execFile("/usr/bin/open", [authUrl], () => {});
  }
  return { started: true, authUrl, port };
}

export async function triggerMountCharterCliSso(
  providerId: string,
  action: "login" | "logout",
): Promise<{ started?: boolean; disconnected?: boolean; error?: string }> {
  const def = CLI_DEFS.find((d) => d.id === providerId);
  if (!def) return { error: "Unknown subscription CLI provider" };

  const hubRes = await requestLocalHub("POST", `/v1/connections/cli/${def.id}/${action}`, {});
  if (hubRes && hubRes.status === 200) {
    return hubRes.data as { started?: boolean; disconnected?: boolean };
  }

  const binPath = findCliBinary(def.binary);
  if (!binPath) return { error: `${def.name} CLI not installed` };

  if (action === "logout") {
    if (def.logoutArgs) await execShortCli(binPath, def.logoutArgs, 5000);
    return { disconnected: true };
  }

  if (def.needsTerminal && process.platform === "darwin") {
    const script = `tell application "Terminal"\nactivate\ndo script "${binPath}"\nend tell`;
    spawn("/usr/bin/osascript", ["-e", script], { detached: true, stdio: "ignore" }).unref();
    return { started: true };
  }

  spawn(binPath, def.loginArgs, {
    cwd: os.tmpdir(),
    detached: true,
    stdio: "ignore",
    env: {
      HOME: process.env.HOME || os.homedir(),
      PATH: process.env.PATH || "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
      NO_COLOR: "1",
    },
  }).unref();
  return { started: true };
}
