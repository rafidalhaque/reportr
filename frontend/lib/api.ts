/**
 * Typed fetch wrapper for the FastAPI backend.
 *
 * - All requests send credentials ("include") so the HttpOnly JWT cookies
 *   (bb_staff / bb_researcher) flow with every call.
 * - Base path defaults to the relative "/api"; override with NEXT_PUBLIC_API_BASE.
 * - Errors: the backend returns {"detail": "<message>"} with 4xx/5xx status;
 *   we surface that message as an ApiError. 401 means "not logged in".
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

export type Query = Record<string, string | number | boolean | null | undefined>;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function buildUrl(path: string, query?: Query): string {
  const base = API_BASE.endsWith("/") ? API_BASE.slice(0, -1) : API_BASE;
  let url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value));
      }
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  return url;
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { detail?: unknown };
    if (typeof data.detail === "string" && data.detail) return data.detail;
    if (data.detail) return JSON.stringify(data.detail);
  } catch {
    // not JSON
  }
  return `Request failed (${res.status})`;
}

export async function apiFetch<T>(
  path: string,
  init?: Omit<RequestInit, "headers"> & { query?: Query; headers?: HeadersInit }
): Promise<T> {
  const { query, headers, body, ...rest } = init ?? {};
  const finalHeaders = new Headers(headers);
  if (
    body != null &&
    typeof body === "string" &&
    !finalHeaders.has("Content-Type")
  ) {
    finalHeaders.set("Content-Type", "application/json");
  }

  const res = await fetch(buildUrl(path, query), {
    ...rest,
    body,
    headers: finalHeaders,
    credentials: "include",
  });

  if (!res.ok) {
    throw new ApiError(res.status, await parseError(res));
  }
  // 204 No Content (logins set cookies and return 204; logouts return 202)
  if (res.status === 204 || res.status === 202) {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export function apiGet<T>(path: string, query?: Query): Promise<T> {
  return apiFetch<T>(path, { method: "GET", query });
}

export function apiPost<T>(path: string, body?: unknown, query?: Query): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    query,
  });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "PATCH",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "PUT",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiDelete(path: string): Promise<void> {
  return apiFetch<void>(path, { method: "DELETE" });
}

/** Cookie login for fastapi-users backends (form-urlencoded: username + password). */
export function loginForm(
  kind: "staff" | "researchers",
  email: string,
  password: string
): Promise<void> {
  const body = new URLSearchParams({ username: email, password });
  return apiFetch<void>(`/auth/${kind}/login`, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
}

export function logout(kind: "staff" | "researchers"): Promise<void> {
  return apiFetch<void>(`/auth/${kind}/logout`, { method: "POST" });
}

/** Multipart upload (form field "file") → keep {key, name} to attach to a report. */
export function uploadFile(file: File): Promise<{ key: string; name: string }> {
  return postForm<{ key: string; name: string }>("/uploads", file);
}

/** Generic multipart POST (field name "file", e.g. CSV import endpoints). */
export function postForm<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<T>(path, { method: "POST", body: form });
}

/** Human-friendly message for a failed login (fastapi-users detail codes). */
export function loginErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw === "LOGIN_BAD_CREDENTIALS") return "Invalid email or password.";
  if (raw === "LOGIN_USER_DISABLED") return "This account has been disabled.";
  return raw;
}

/** Best-effort error message for display. */
export function errMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}
