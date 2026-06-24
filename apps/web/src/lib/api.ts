// Typed fetch client: bearer auth, org scoping via x-organization-id,
// single-flight refresh-token rotation on 401, and file downloads.
// In dev the Vite proxy forwards /api to the API server; in the Capacitor
// shell set VITE_API_URL to the deployed API origin at build time.

import { Capacitor } from "@capacitor/core";

/** Production web origin — /api is proxied to the API service. Used when the native shell has no VITE_API_URL. */
const NATIVE_API_ORIGIN = "https://app.cleartask.com.au";

function resolveApiBase(): string {
  const configured = import.meta.env.VITE_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (Capacitor.isNativePlatform()) return NATIVE_API_ORIGIN;
  return "";
}

const API_BASE = resolveApiBase();

const ACCESS_KEY = "tt.access";
const REFRESH_KEY = "tt.refresh";
const ORG_KEY = "tt.org";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getStoredOrgId(): string | null {
  return localStorage.getItem(ORG_KEY);
}

export function setStoredOrgId(orgId: string | null): void {
  if (orgId) localStorage.setItem(ORG_KEY, orgId);
  else localStorage.removeItem(ORG_KEY);
}

export function setTokens(
  tokens: { accessToken: string; refreshToken: string } | null,
): void {
  if (tokens) {
    localStorage.setItem(ACCESS_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  } else {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }
}

export function hasStoredSession(): boolean {
  return localStorage.getItem(REFRESH_KEY) !== null;
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        setTokens(null);
        return false;
      }
      setTokens((await readJsonBody(res)) as { accessToken: string; refreshToken: string });
      return true;
    } catch {
      return false;
    } finally {
      // Allow the next 401 to trigger a fresh rotation.
      setTimeout(() => (refreshInFlight = null), 0);
    }
  })();
  return refreshInFlight;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  formData?: FormData;
  query?: Record<string, string | number | boolean | undefined>;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const apiPath = `/api/v1${path}`;
  const url = API_BASE
    ? new URL(`${API_BASE}${apiPath}`)
    : new URL(apiPath, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function readJsonBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(
      res.status,
      "Could not reach the server. Check your connection and try again.",
    );
  }
}

async function rawRequest(
  path: string,
  opts: RequestOptions,
  retried = false,
): Promise<Response> {
  const headers: Record<string, string> = {};
  const access = localStorage.getItem(ACCESS_KEY);
  if (access) headers.authorization = `Bearer ${access}`;
  const orgId = getStoredOrgId();
  if (orgId) headers["x-organization-id"] = orgId;
  if (opts.body !== undefined) headers["content-type"] = "application/json";

  const res = await fetch(buildUrl(path, opts.query), {
    method: opts.method ?? "GET",
    headers,
    body: opts.formData ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });

  if (res.status === 401 && !retried && !path.startsWith("/auth/")) {
    if (await refreshTokens()) return rawRequest(path, opts, true);
  }
  return res;
}

export async function api<T = unknown>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const res = await rawRequest(path, opts);
  if (!res.ok) {
    const data = (await readJsonBody(res).catch(() => ({}))) as {
      error?: string;
      issues?: { path: string; message: string }[];
    };
    throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`, data.issues);
  }
  return (await readJsonBody(res)) as T;
}

// Fetches a file with auth headers and triggers a browser download.
export async function downloadFile(
  path: string,
  query?: RequestOptions["query"],
): Promise<void> {
  const res = await rawRequest(path, { query });
  if (!res.ok) {
    const data = (await readJsonBody(res).catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, data.error ?? "Download failed");
  }
  const disposition = res.headers.get("content-disposition") ?? "";
  const fileName = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? "download";
  const blobUrl = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(blobUrl);
}

// Authenticated binary fetch returning an object URL (attachment preview /
// download links that need the bearer header).
export async function fetchBlobUrl(path: string): Promise<string> {
  const res = await rawRequest(path, {});
  if (!res.ok) throw new ApiError(res.status, "Failed to load file");
  return URL.createObjectURL(await res.blob());
}
