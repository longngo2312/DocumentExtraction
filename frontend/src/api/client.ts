const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

//custom error class
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Shared by every in-flight request so a burst of parallel 401s triggers one
 * refresh, not one per request. Without this, concurrent calls would each
 * rotate the cookie and all but the first would trip reuse detection.
 */
let refreshInFlight: Promise<string | null> | null = null;

function requestNewAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  const inflight = fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  })
    .then(async (res) => {
      if (!res.ok) return null;
      const body = await res.json();
      return (body?.token as string) ?? null;
    })
    // Never rejects, so callers can just check for null.
    .catch(() => null);

  refreshInFlight = inflight;
  inflight.finally(() => {
    if (refreshInFlight === inflight) refreshInFlight = null;
  });

  return inflight;
}

function endSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  // Full reload rather than a router navigate: this can fire from anywhere,
  // including outside React, and it clears every store in one step.
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

async function send(path: string, init: RequestInit): Promise<Response> {
  const isFormData = init.body instanceof FormData;
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    // Required for the refresh cookie; harmless elsewhere since the cookie is
    // scoped to /api/auth and won't be attached to other routes.
    credentials: "include",
    headers: {
      ...(isFormData
        ? {}
        : {
            "Content-Type": "application/json",
          }) /* Handle both json data and upload data */,
      ...authHeaders(),
      ...init.headers,
    },
  });
}

/**
 * One request, transparently retried once against a refreshed access token.
 * Shared by every caller so the refresh behaviour can't drift between them.
 * Throws ApiError on a non-2xx; the body is left unread for the caller.
 */
async function request(
  path: string,
  init: RequestInit,
  allowRetry: boolean,
): Promise<Response> {
  let res = await send(path, init);

  // The auth routes are excluded: a 401 from /auth/login means bad credentials,
  // and retrying /auth/refresh through here would recurse.
  const canRetry = allowRetry && !path.startsWith("/auth/");

  if (res.status === 401 && canRetry) {
    const token = await requestNewAccessToken();
    if (token) {
      localStorage.setItem("token", token);
      // FormData bodies survive a replay; a stream body would not, but nothing
      // in this app sends one.
      res = await send(path, init);
    } else {
      endSession();
      throw new ApiError("Session expired. Please log in again.", 401);
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    // Most routes return { error }; auth returns { success:false, message }.
    throw new ApiError(
      body?.error ?? body?.message ?? res.statusText,
      res.status,
    );
  }

  return res;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  allowRetry = true,
): Promise<T> {
  const res = await request(path, init, allowRetry);

  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

/**
 * Same auth and refresh path as apiFetch, but hands back the raw bytes.
 *
 * This exists because the uploaded file is behind a Bearer header, and a plain
 * <img src="/api/documents/1/file"> or a PDF.js URL fetch cannot set one. The
 * caller turns this blob into an object URL instead.
 */
export async function apiFetchBlob(
  path: string,
  init: RequestInit = {},
): Promise<Blob> {
  const res = await request(path, init, true);
  return res.blob();
}
