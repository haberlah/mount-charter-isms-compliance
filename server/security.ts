import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { KEYCHAIN_SERVICE } from "./config";

export function createLaunchToken(): string {
  return randomBytes(24).toString("hex");
}

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "content-security-policy": CONTENT_SECURITY_POLICY,
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
});

export function isValidLoopbackHost(
  hostHeader: string | undefined,
  expectedPort?: number | null,
): boolean {
  if (typeof hostHeader !== "string" || !hostHeader.trim()) return false;
  const raw = hostHeader.trim().toLowerCase();
  const match = /^(127\.0\.0\.1|localhost):(\d+)$/.exec(raw);
  if (!match) return false;
  const portNum = Number(match[2]);
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) return false;
  if (expectedPort != null && portNum !== Number(expectedPort)) return false;
  return true;
}

export function isLoopbackOrigin(
  originHeader: string | undefined,
  expectedPort?: number | null,
): boolean {
  if (!originHeader) return true;
  try {
    const url = new URL(originHeader);
    if (url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    if (host !== "127.0.0.1" && host !== "localhost") return false;
    if (expectedPort != null && url.port !== String(expectedPort)) return false;
    return true;
  } catch {
    return false;
  }
}

export function verifyApiReadRequest(
  req: Pick<Request, "headers">,
  options: { expectedPort?: number | null } = {},
): { ok: true } | { ok: false; status: number; error: string } {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  if (origin && !isLoopbackOrigin(origin, options.expectedPort)) {
    return { ok: false, status: 403, error: "Non-loopback Origin rejected." };
  }
  const fetchSite = req.headers["sec-fetch-site"];
  if (fetchSite && !["same-origin", "none"].includes(String(fetchSite))) {
    return { ok: false, status: 403, error: "Cross-site API read rejected." };
  }
  return { ok: true };
}

export function verifyMutationRequest(
  req: Pick<Request, "headers">,
  expectedToken: string,
  options: { expectedPort?: number | null } = {},
): { ok: true } | { ok: false; status: number; error: string } {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  if (origin && !isLoopbackOrigin(origin, options.expectedPort)) {
    return { ok: false, status: 403, error: "Non-loopback Origin rejected." };
  }
  const fetchSite = req.headers["sec-fetch-site"];
  if (fetchSite && !["same-origin", "none"].includes(String(fetchSite))) {
    return { ok: false, status: 403, error: "Cross-site mutation rejected." };
  }
  const provided = String(req.headers["x-mount-charter-token"] ?? "");
  if (!provided || !expectedToken) {
    return { ok: false, status: 401, error: "Missing X-Mount-Charter-Token." };
  }
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expectedToken, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: "Invalid X-Mount-Charter-Token." };
  }
  return { ok: true };
}

/**
 * Validate external evidence URLs. Only http: and https: protocols are allowed,
 * preventing stored XSS via javascript:, data:, or file: URIs.
 */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

const SAFE_KEYCHAIN_ACCOUNT = /^[A-Z0-9_]{1,64}$/;

export function isValidKeychainAccount(account: string): boolean {
  return SAFE_KEYCHAIN_ACCOUNT.test(account);
}

export function getKeychainSecret(account: string): string | null {
  if (!isValidKeychainAccount(account)) return null;
  if (process.platform !== "darwin" || process.env.MOUNT_CHARTER_DISABLE_KEYCHAIN === "1") {
    const val = process.env[`MOUNT_CHARTER_SECRET_${account}`];
    if (!val) return null;
    return val.startsWith("b64:") ? Buffer.from(val.slice(4), "base64").toString("utf8") : val;
  }
  const services = [
    KEYCHAIN_SERVICE,
    process.env.AI_VAULT_SERVICE?.trim() || "com.local.ai-vault.shared",
  ];
  for (const svc of services) {
    try {
      const out = execFileSync(
        "/usr/bin/security",
        ["find-generic-password", "-s", svc, "-a", account, "-w"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
      const raw = out.trim();
      if (!raw) continue;
      if (raw.startsWith("b64:")) {
        return Buffer.from(raw.slice(4), "base64").toString("utf8");
      }
      return raw;
    } catch {
      // try next service
    }
  }
  return null;
}

export function setKeychainSecret(account: string, value: string | null | undefined): boolean {
  if (!isValidKeychainAccount(account)) return false;
  const normalized = value ? String(value).replace(/\r\n/g, "\n").trim() : "";
  if (process.platform !== "darwin" || process.env.MOUNT_CHARTER_DISABLE_KEYCHAIN === "1") {
    if (normalized) process.env[`MOUNT_CHARTER_SECRET_${account}`] = normalized;
    else delete process.env[`MOUNT_CHARTER_SECRET_${account}`];
    return true;
  }
  if (!normalized) {
    try {
      execFileSync(
        "/usr/bin/security",
        ["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account],
        {
          stdio: "ignore",
        },
      );
    } catch {
      // Missing Keychain item is fine
    }
    return true;
  }
  // Always base64-encode secrets written through `security -i` so no quote, whitespace,
  // or metacharacter can ever alter command parsing.
  const stored = `b64:${Buffer.from(normalized, "utf8").toString("base64")}`;
  const script = `add-generic-password -U -s "${KEYCHAIN_SERVICE}" -a "${account}" -w "${stored}"\n`;
  const res = spawnSync("/usr/bin/security", ["-i"], { input: script, encoding: "utf8" });
  return res.status === 0;
}

export function resolveAnthropicApiKey(): {
  key: string | null;
  source: "keychain" | "env" | "none";
} {
  const keychainKey = getKeychainSecret("ANTHROPIC_API_KEY");
  if (keychainKey) return { key: keychainKey, source: "keychain" };
  const envKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (envKey) return { key: envKey, source: "env" };
  return { key: null, source: "none" };
}
