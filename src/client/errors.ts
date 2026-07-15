/**
 * Error types thrown by the bexio API client.
 */

/** Base class for every error raised by this library. */
export class BexioError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Configuration problems (e.g. missing token) detected before any request is sent. */
export class BexioConfigError extends BexioError {}

/** Network-level failure or timeout — no HTTP response was received. */
export class BexioNetworkError extends BexioError {
  constructor(
    message: string,
    readonly method: string,
    readonly path: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/**
 * A non-2xx HTTP response from the bexio API.
 *
 * bexio errors usually carry a JSON body of the shape `{ "error_code": 404, "message": "..." }`;
 * both fields are surfaced here when present. `body` always contains the raw (parsed if JSON)
 * response payload for callers that need the full details.
 */
export class BexioApiError extends BexioError {
  constructor(
    message: string,
    readonly status: number,
    readonly method: string,
    readonly path: string,
    readonly body: unknown,
    readonly errorCode?: number,
  ) {
    super(message);
  }

  /** True for 401 (invalid/expired token). */
  get isAuthError(): boolean {
    return this.status === 401;
  }

  /** True for 403 (token lacks the required scope or user lacks rights). */
  get isPermissionError(): boolean {
    return this.status === 403;
  }

  /** True for 404. */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** True for 429 (rate limit exceeded). */
  get isRateLimit(): boolean {
    return this.status === 429;
  }
}

/** 429 response that persisted through all retry attempts. */
export class BexioRateLimitError extends BexioApiError {
  constructor(
    method: string,
    path: string,
    body: unknown,
    /** Seconds until the current rate-limit window resets, when reported by the API. */
    readonly resetSeconds?: number,
  ) {
    super(
      `bexio API rate limit exceeded${resetSeconds !== undefined ? `; resets in ${resetSeconds}s` : ''}`,
      429,
      method,
      path,
      body,
      429,
    );
  }
}

/** Extracts `{ error_code, message }` from a bexio error body when present. */
export function parseErrorBody(body: unknown): { errorCode?: number; message?: string } {
  if (typeof body !== 'object' || body === null) return {};
  const record = body as Record<string, unknown>;
  const errorCode = typeof record.error_code === 'number' ? record.error_code : undefined;
  let message: string | undefined;
  if (typeof record.message === 'string') message = record.message;
  else if (Array.isArray(record.message)) message = record.message.map(String).join('; ');
  // Some 4.0 endpoints use RFC 7807-style bodies.
  else if (typeof record.detail === 'string') message = record.detail;
  else if (typeof record.title === 'string') message = record.title;
  return { errorCode, message };
}
