/**
 * Low-level HTTP transport for the bexio API.
 *
 * Owns authentication, JSON (de)serialization, query-string building, timeouts,
 * error mapping and retry behaviour (429 rate limits and transient failures).
 * Resource classes build on {@link BexioHttp.request} and its verb shortcuts.
 */
import {
  BexioApiError,
  BexioConfigError,
  BexioNetworkError,
  BexioRateLimitError,
  parseErrorBody,
} from './errors.js';
import type { QueryParams } from './types.js';

/** Supplies the Bearer token; async providers enable OAuth refresh flows. */
export type TokenProvider = string | (() => string | Promise<string>);

export interface BexioHttpOptions {
  /**
   * API token: a Personal Access Token from https://developer.bexio.com/pat or an
   * OAuth 2.0 access token. A callback may be given to fetch/refresh tokens lazily.
   */
  token: TokenProvider;
  /** API host. Defaults to `https://api.bexio.com`. */
  baseUrl?: string;
  /** ISO 639-1 code sent as `Accept-Language` (affects translated fields such as tax codes). */
  language?: string;
  /** Per-request timeout in milliseconds. Defaults to 30 000. */
  timeoutMs?: number;
  /**
   * Maximum number of retries after a failed attempt. Defaults to 3.
   * 429 responses are always retried (honouring the reported reset time);
   * network errors and 5xx responses are retried for idempotent (GET) requests only.
   */
  maxRetries?: number;
  /** Custom fetch implementation (dependency injection for tests). Defaults to global fetch. */
  fetch?: typeof globalThis.fetch;
  /** Additional headers sent with every request. */
  defaultHeaders?: Record<string, string>;
}

export interface RequestOptions {
  /** Query-string parameters; `undefined` values are omitted. */
  query?: QueryParams;
  /** JSON request body. */
  body?: unknown;
  /** multipart/form-data body (file uploads). Takes precedence over `body`. */
  form?: FormData;
  /** Extra headers for this request. */
  headers?: Record<string, string>;
  /**
   * Expected response payload:
   * - `json` (default): parse as JSON
   * - `binary`: return a `Uint8Array` (PDF/file downloads)
   * - `text`: return the raw string
   */
  responseType?: 'json' | 'binary' | 'text';
  /** Abort signal to cancel the request from the caller side. */
  signal?: AbortSignal;
}

const DEFAULT_BASE_URL = 'https://api.bexio.com';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
/** Upper bound for a single retry pause. */
const MAX_RETRY_DELAY_MS = 60_000;

function buildQueryString(query: QueryParams | undefined): string {
  if (!query) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      // OpenAPI default (style=form, explode=true): repeat the key per item,
      // e.g. fields[]=a&fields[]=b — required by the 4.0 purchase endpoints.
      for (const item of value) {
        if (item !== undefined) search.append(key, String(item));
      }
    } else {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    // A listener added to an already-aborted signal never fires — check first.
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error('Aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export class BexioHttp {
  private readonly token: TokenProvider;
  private readonly baseUrl: string;
  private readonly language?: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly defaultHeaders: Record<string, string>;

  constructor(options: BexioHttpOptions) {
    if (!options.token) {
      throw new BexioConfigError(
        'A bexio API token is required. Create a Personal Access Token at https://developer.bexio.com/pat',
      );
    }
    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.language = options.language;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.defaultHeaders = options.defaultHeaders ?? {};
    if (typeof this.fetchImpl !== 'function') {
      throw new BexioConfigError('global fetch is not available; use Node.js >= 18 or pass options.fetch');
    }
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, options);
  }

  post<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, options);
  }

  put<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, options);
  }

  patch<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, options);
  }

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, options);
  }

  /**
   * Performs one API request, retrying rate-limited and transiently failed
   * idempotent calls, and maps failures to {@link BexioApiError} subclasses.
   *
   * @param path Absolute API path including version prefix, e.g. `/2.0/contact`.
   */
  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const url = `${this.baseUrl}${path}${buildQueryString(options.query)}`;
    const maxAttempts = this.maxRetries + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let response: Response;
      try {
        response = await this.send(method, url, options);
      } catch (error) {
        lastError = error;
        // Timeouts/network failures: retry only idempotent requests.
        if (method === 'GET' && attempt < maxAttempts) {
          await delay(Math.min(500 * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS), options.signal);
          continue;
        }
        throw this.toNetworkError(error, method, path);
      }

      if (response.status === 429) {
        const resetSeconds = this.parseResetSeconds(response);
        if (attempt < maxAttempts) {
          await this.discardBody(response);
          const waitMs = Math.min(((resetSeconds ?? 2 ** attempt) + Math.random()) * 1000, MAX_RETRY_DELAY_MS);
          await delay(waitMs, options.signal);
          continue;
        }
        throw new BexioRateLimitError(method, path, await this.safeReadBody(response), resetSeconds);
      }

      if (response.status >= 500 && method === 'GET' && attempt < maxAttempts) {
        await this.discardBody(response);
        await delay(Math.min(500 * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS), options.signal);
        continue;
      }

      if (!response.ok) {
        const body = await this.safeReadBody(response);
        const { errorCode, message } = parseErrorBody(body);
        throw new BexioApiError(
          `bexio API request failed: ${method} ${path} -> ${response.status}${message ? ` (${message})` : ''}`,
          response.status,
          method,
          path,
          body,
          errorCode,
        );
      }

      return (await this.readBody(response, options.responseType ?? 'json')) as T;
    }

    // Unreachable: every loop iteration either returns or throws.
    throw this.toNetworkError(lastError, method, path);
  }

  private async send(method: string, url: string, options: RequestOptions): Promise<Response> {
    if (options.signal?.aborted) {
      throw options.signal.reason instanceof Error ? options.signal.reason : new Error('Aborted');
    }
    const tokenValue = typeof this.token === 'function' ? await this.token() : this.token;
    if (!tokenValue) {
      throw new BexioConfigError('The bexio token provider returned an empty token');
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${tokenValue}`,
      ...this.defaultHeaders,
      ...options.headers,
    };
    if (this.language && !('Accept-Language' in headers)) headers['Accept-Language'] = this.language;

    let body: string | FormData | undefined;
    if (options.form !== undefined) {
      body = options.form; // fetch sets the multipart Content-Type with boundary
    } else if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new BexioNetworkError(`Request timed out after ${this.timeoutMs}ms`, method, url)),
      this.timeoutMs,
    );
    const onOuterAbort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', onOuterAbort, { once: true });

    try {
      return await this.fetchImpl(url, { method, headers, body, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onOuterAbort);
    }
  }

  private parseResetSeconds(response: Response): number | undefined {
    const raw =
      response.headers.get('RateLimit-Reset') ??
      response.headers.get('X-RateLimit-Reset') ??
      response.headers.get('Retry-After');
    if (!raw) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }

  private async readBody(response: Response, responseType: 'json' | 'binary' | 'text'): Promise<unknown> {
    if (response.status === 204) return undefined;
    if (responseType === 'binary') return new Uint8Array(await response.arrayBuffer());
    if (responseType === 'text') return await response.text();
    const text = await response.text();
    if (text.length === 0) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      // Content-Type occasionally lies (e.g. PDF exports); surface the raw text.
      return text;
    }
  }

  /** Releases a discarded response body so its keep-alive connection is returned to the pool. */
  private async discardBody(response: Response): Promise<void> {
    try {
      await response.body?.cancel();
    } catch {
      // Releasing the connection is best-effort.
    }
  }

  private async safeReadBody(response: Response): Promise<unknown> {
    try {
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    } catch {
      return undefined;
    }
  }

  private toNetworkError(error: unknown, method: string, path: string): BexioNetworkError {
    if (error instanceof BexioNetworkError) return error;
    const message = error instanceof Error ? error.message : String(error);
    return new BexioNetworkError(`bexio API request failed: ${method} ${path} (${message})`, method, path, {
      cause: error,
    });
  }
}
