import { QueryClient } from "@tanstack/react-query";
import type { PaperToastRegion } from "../../vendor/paper/elements/index.js";

const WORKSPACE_STORAGE_KEY = "mount-charter.workspaceId";

export function getCsrfToken(): string {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="mount-charter-csrf-token"]');
  return meta?.content || "";
}

export function getActiveWorkspaceId(): number | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function setActiveWorkspaceId(id: number): void {
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, String(id));
  } catch {
    // Ignore storage errors
  }
}

function buildHeaders(extra?: Record<string, string>, includeJson = true): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJson) headers["Content-Type"] = "application/json";
  const token = getCsrfToken();
  if (token) headers["X-Mount-Charter-Token"] = token;
  const wsId = getActiveWorkspaceId();
  if (wsId) headers["X-Mount-Charter-Workspace"] = String(wsId);
  if (extra) Object.assign(headers, extra);
  return headers;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest<T = unknown>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: buildHeaders(undefined, !isFormData && body !== undefined),
    body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
  });

  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) msg = data.error;
    } catch {
      // Ignore parse failure
    }
    throw new ApiError(res.status, msg);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export async function postSseStream(
  url: string,
  body: unknown,
  handlers: {
    onEvent: (event: string, data: unknown) => void;
    signal?: AbortSignal;
  },
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders({ Accept: "text/event-stream" }, true),
    body: JSON.stringify(body ?? {}),
    signal: handlers.signal,
  });

  if (!res.ok || !res.body) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) msg = data.error;
    } catch {
      // Ignore
    }
    throw new ApiError(res.status, msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";

    for (const frame of frames) {
      let eventName = "message";
      const dataLines: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      const raw = dataLines.join("\n");
      try {
        handlers.onEvent(eventName, JSON.parse(raw));
      } catch {
        handlers.onEvent(eventName, raw);
      }
    }
  }
}

export interface DownloadResult {
  saved: boolean;
  cancelled?: boolean;
  filename: string;
}

type ExportCallback = (res: { ok?: boolean; cancelled?: boolean; error?: string }) => void;

function getExportCallbacks(): Map<string, ExportCallback> {
  const w = window as unknown as {
    __mwExportCallbacks?: Map<string, ExportCallback>;
    __mwExportResolve?: (
      id: string,
      res: { ok?: boolean; cancelled?: boolean; error?: string },
    ) => void;
  };
  if (!w.__mwExportCallbacks) {
    w.__mwExportCallbacks = new Map();
    w.__mwExportResolve = (id, res) => {
      const cb = w.__mwExportCallbacks?.get(id);
      if (cb) {
        w.__mwExportCallbacks?.delete(id);
        cb(res);
      }
    };
  }
  return w.__mwExportCallbacks;
}

/**
 * Download an export or stored document cleanly inside both standard browsers
 * and the macOS WKWebView shell (awaits NSSavePanel result so cancel/error are honest).
 */
export async function downloadFile(url: string, fallbackFilename: string): Promise<DownloadResult> {
  const res = await fetch(url, { headers: buildHeaders(undefined, false) });
  if (!res.ok) {
    throw new ApiError(res.status, `Download failed (${res.status})`);
  }
  const cd = res.headers.get("content-disposition") || "";
  const match = cd.match(/filename="([^"]+)"/);
  const filename = match?.[1] || fallbackFilename;
  const blob = await res.blob();

  const webkitHandlers = (
    window as unknown as {
      webkit?: {
        messageHandlers?: {
          mountCharterExport?: { postMessage: (v: unknown) => void };
        };
      };
    }
  ).webkit?.messageHandlers;

  if (webkitHandlers?.mountCharterExport) {
    const base64 = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const result = String(fr.result || "");
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
    const requestId = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const callbacks = getExportCallbacks();
    return await new Promise<DownloadResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        callbacks.delete(requestId);
        // Fallback for older native builds that didn't emit a callback
        resolve({ saved: true, filename });
      }, 60_000);
      callbacks.set(requestId, (result) => {
        clearTimeout(timer);
        if (result.cancelled) {
          resolve({ saved: false, cancelled: true, filename });
        } else if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve({ saved: true, filename });
        }
      });
      webkitHandlers.mountCharterExport!.postMessage({ requestId, filename, base64 });
    });
  }

  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  return { saved: true, filename };
}

export function revealDataFolderNative(): boolean {
  const handler = (
    window as unknown as {
      webkit?: {
        messageHandlers?: {
          mountCharterRevealDataDir?: { postMessage: (v: unknown) => void };
        };
      };
    }
  ).webkit?.messageHandlers?.mountCharterRevealDataDir;
  if (handler) {
    handler.postMessage("reveal");
    return true;
  }
  return false;
}

export function showToast(
  message: string,
  options: { title?: string; tone?: "info" | "ok" | "warn" | "err" } = {},
): void {
  const region = document.querySelector("paper-toast-region") as
    | (PaperToastRegion & { showPopover?: () => void; matches?: (s: string) => boolean })
    | null;
  if (region && typeof region.show === "function") {
    try {
      if (typeof region.showPopover === "function" && !region.matches?.(":popover-open")) {
        region.showPopover();
      }
    } catch {
      // Ignore if popover API unsupported
    }
    const mappedTone = options.tone === "info" ? "" : options.tone;
    region.show(message, { title: options.title, tone: mappedTone });
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function invalidateWorkspaceQueries(controlNumber?: string): Promise<void> {
  const keys: Array<unknown[]> = [
    ["workspaces"],
    ["dashboard"],
    ["controls"],
    ["documents"],
    ["evidence-links"],
    ["pending-matches"],
    ["test-runs"],
    ["ai-interactions"],
    ["action-items"],
    ["settings-profile"],
    ["settings-ai"],
    ["frameworks"],
    ["framework"],
    ["governance-risks"],
    ["governance-capas"],
    ["governance-reviews"],
    ["governance-vendors"],
    ["governance-policies"],
    ["governance-incidents"],
    ["collectors"],
  ];
  if (controlNumber) {
    keys.push(["control", controlNumber]);
  } else {
    keys.push(["control"]);
  }
  return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))).then(
    () => undefined,
  );
}
