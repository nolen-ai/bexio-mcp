/**
 * OAuth 2.0 / OpenID Connect support for the bexio "app" authentication workflow
 * (https://docs.bexio.com/#section/Authentication/Authorization-Code-Flow).
 *
 * Apps are registered at https://developer.bexio.com (client id/secret + allowed
 * redirect URLs). This module is transport-agnostic: it builds authorization URLs,
 * exchanges codes, refreshes tokens (bexio rotates refresh tokens on every
 * refresh) and exposes {@link OAuthTokenProvider}, which plugs directly into
 * `BexioClient({ token: provider.accessTokenProvider() })`.
 *
 * Uses only `fetch` and `node:crypto` — no MCP dependencies.
 */
import { createHash, randomBytes } from 'node:crypto';
import { BexioError } from './errors.js';

/** bexio identity provider (Keycloak) endpoints. */
export const BEXIO_OIDC = {
  issuer: 'https://auth.bexio.com/realms/bexio',
  authorizationEndpoint: 'https://auth.bexio.com/realms/bexio/protocol/openid-connect/auth',
  tokenEndpoint: 'https://auth.bexio.com/realms/bexio/protocol/openid-connect/token',
  revocationEndpoint: 'https://auth.bexio.com/realms/bexio/protocol/openid-connect/revoke',
} as const;

/** OIDC base scopes every login should request (offline_access enables refresh tokens). */
export const BASE_OIDC_SCOPES = ['openid', 'profile', 'email', 'offline_access'] as const;

/** Failure of an OAuth endpoint (invalid grant, bad client credentials, …). */
export class BexioOAuthError extends BexioError {
  private readonly reauth: boolean;

  constructor(
    message: string,
    /** OAuth error code, e.g. `invalid_grant`. */
    readonly code?: string,
    readonly status?: number,
    options?: { needsReauthorization?: boolean },
  ) {
    super(message);
    this.reauth = options?.needsReauthorization ?? false;
  }

  /** True when the stored grant is unusable and a new login is required. */
  get needsReauthorization(): boolean {
    return this.reauth || this.code === 'invalid_grant';
  }
}

export interface BexioOAuthConfig {
  /** Client ID from the developer portal app. */
  clientId: string;
  /** Client secret from the developer portal app. */
  clientSecret: string;
  /** Override the authorization endpoint (tests / future IdP changes). */
  authorizationEndpoint?: string;
  /** Override the token endpoint. */
  tokenEndpoint?: string;
  /** Override the revocation endpoint. */
  revocationEndpoint?: string;
  /** Custom fetch implementation (dependency injection for tests). */
  fetch?: typeof globalThis.fetch;
}

/** Tokens as returned by the token endpoint, with an absolute expiry timestamp. */
export interface OAuthTokens {
  accessToken: string;
  /** Rotated on every refresh — always persist the newest one. */
  refreshToken?: string;
  /** Absolute expiry of the access token in epoch milliseconds. */
  expiresAt: number;
  /** Space-separated scopes actually granted. */
  scope?: string;
  idToken?: string;
}

/** PKCE verifier/challenge pair (S256). */
export interface PkcePair {
  verifier: string;
  challenge: string;
  method: 'S256';
}

/** Generates a PKCE S256 verifier/challenge pair. */
export function generatePkce(): PkcePair {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge, method: 'S256' };
}

/** Generates a cryptographically random `state` value. */
export function generateState(): string {
  return randomBytes(24).toString('base64url');
}

export interface AuthorizationUrlParams {
  redirectUri: string;
  /** Scopes to request; include API scopes plus {@link BASE_OIDC_SCOPES}. */
  scopes: readonly string[];
  /** CSRF token; verify it on the redirect. Use {@link generateState}. */
  state: string;
  /** PKCE challenge from {@link generatePkce} (recommended). */
  pkce?: PkcePair;
}

export class BexioOAuth {
  private readonly config: Required<Pick<BexioOAuthConfig, 'clientId' | 'clientSecret'>> &
    Pick<BexioOAuthConfig, 'fetch'> & {
      authorizationEndpoint: string;
      tokenEndpoint: string;
      revocationEndpoint: string;
    };

  constructor(config: BexioOAuthConfig) {
    if (!config.clientId || !config.clientSecret) {
      throw new BexioOAuthError('clientId and clientSecret are required (create an app at https://developer.bexio.com)');
    }
    this.config = {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      authorizationEndpoint: config.authorizationEndpoint ?? BEXIO_OIDC.authorizationEndpoint,
      tokenEndpoint: config.tokenEndpoint ?? BEXIO_OIDC.tokenEndpoint,
      revocationEndpoint: config.revocationEndpoint ?? BEXIO_OIDC.revocationEndpoint,
      fetch: config.fetch,
    };
  }

  /** Builds the browser URL that starts the authorization code flow. */
  buildAuthorizationUrl(params: AuthorizationUrlParams): string {
    const url = new URL(this.config.authorizationEndpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('scope', params.scopes.join(' '));
    url.searchParams.set('state', params.state);
    if (params.pkce) {
      url.searchParams.set('code_challenge', params.pkce.challenge);
      url.searchParams.set('code_challenge_method', params.pkce.method);
    }
    return url.toString();
  }

  /** Exchanges an authorization code for tokens. */
  exchangeCode(params: { code: string; redirectUri: string; codeVerifier?: string }): Promise<OAuthTokens> {
    return this.tokenRequest({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
      ...(params.codeVerifier !== undefined ? { code_verifier: params.codeVerifier } : {}),
    });
  }

  /**
   * Redeems a refresh token. bexio ROTATES refresh tokens: the returned
   * `refreshToken` replaces the old one and must be persisted immediately.
   */
  refresh(refreshToken: string): Promise<OAuthTokens> {
    return this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  /** Best-effort revocation of a refresh (or access) token. */
  async revoke(token: string, tokenTypeHint: 'refresh_token' | 'access_token' = 'refresh_token'): Promise<void> {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      token,
      token_type_hint: tokenTypeHint,
    });
    const fetchImpl = this.config.fetch ?? globalThis.fetch;
    try {
      await fetchImpl(this.config.revocationEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    } catch {
      // Revocation is best-effort; local token deletion is the primary logout.
    }
  }

  /** All parameters go in the request body — the bexio IdP does not accept them as query params. */
  private async tokenRequest(params: Record<string, string>): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      ...params,
    });
    const fetchImpl = this.config.fetch ?? globalThis.fetch;
    let response: Response;
    try {
      response = await fetchImpl(this.config.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: body.toString(),
      });
    } catch (error) {
      throw new BexioOAuthError(
        `Could not reach the bexio token endpoint (${error instanceof Error ? error.message : String(error)})`,
      );
    }

    const text = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // Non-JSON error body; handled below.
    }

    if (!response.ok) {
      const code = typeof payload.error === 'string' ? payload.error : undefined;
      const description = typeof payload.error_description === 'string' ? payload.error_description : text.slice(0, 300);
      throw new BexioOAuthError(
        `bexio token request failed (${response.status}${code ? ` ${code}` : ''}): ${description}` +
          (code === 'invalid_grant' ? ' — run "bexio-mcp login" again to re-authorize.' : ''),
        code,
        response.status,
      );
    }

    const accessToken = payload.access_token;
    const expiresIn = payload.expires_in;
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new BexioOAuthError('The token endpoint returned no access_token');
    }
    return {
      accessToken,
      refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : undefined,
      expiresAt: Date.now() + (typeof expiresIn === 'number' ? expiresIn : 300) * 1000,
      scope: typeof payload.scope === 'string' ? payload.scope : undefined,
      idToken: typeof payload.id_token === 'string' ? payload.id_token : undefined,
    };
  }
}

/** Persistence interface for OAuth tokens (see FileTokenStore in `bexio-mcp`). */
export interface TokenStore {
  load(): Promise<OAuthTokens | undefined>;
  save(tokens: OAuthTokens): Promise<void>;
  clear(): Promise<void>;
}

/** Refresh this many milliseconds before the reported expiry. */
const EXPIRY_MARGIN_MS = 60_000;

/**
 * Turns stored OAuth tokens into an auto-refreshing access-token source.
 *
 * - refreshes single-flight (concurrent callers share one refresh request)
 * - persists rotated refresh tokens to the {@link TokenStore} before returning
 * - surfaces `invalid_grant` as a clear "re-run login" error
 *
 * ```ts
 * const provider = new OAuthTokenProvider(oauth, store);
 * const bexio = new BexioClient({ token: provider.accessTokenProvider() });
 * ```
 */
export class OAuthTokenProvider {
  private tokens?: OAuthTokens;
  private refreshing?: Promise<OAuthTokens>;
  /** True when the last rotated tokens could not be persisted yet. */
  private savePending = false;

  constructor(
    private readonly oauth: BexioOAuth,
    private readonly store: TokenStore,
    initialTokens?: OAuthTokens,
  ) {
    this.tokens = initialTokens;
  }

  /** Returns a currently-valid access token, refreshing if necessary. */
  async getAccessToken(): Promise<string> {
    if (this.tokens === undefined) {
      this.tokens = await this.store.load();
    }
    if (this.tokens === undefined) {
      throw new BexioOAuthError('No stored bexio OAuth tokens. Run "bexio-mcp login" first.', undefined, undefined, {
        needsReauthorization: true,
      });
    }
    if (this.savePending) await this.persist(this.tokens);
    if (Date.now() < this.tokens.expiresAt - EXPIRY_MARGIN_MS) {
      return this.tokens.accessToken;
    }
    const refreshed = await this.refreshSingleFlight();
    return refreshed.accessToken;
  }

  /** Bound provider function for `BexioClientOptions.token`. */
  accessTokenProvider(): () => Promise<string> {
    return () => this.getAccessToken();
  }

  private refreshSingleFlight(): Promise<OAuthTokens> {
    if (this.refreshing === undefined) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = undefined;
      });
    }
    return this.refreshing;
  }

  private async doRefresh(): Promise<OAuthTokens> {
    // Another process sharing the store may have refreshed already (bexio
    // ROTATES refresh tokens, invalidating ours). Adopt the stored tokens
    // when they are fresher than the cached ones — often no network call at all.
    const current = await this.adoptStoredIfFresher();
    if (current.expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
      return current;
    }
    if (current.refreshToken === undefined) {
      throw new BexioOAuthError(
        'The stored bexio tokens have no refresh token (was offline_access granted?). Run "bexio-mcp login" again.',
        undefined,
        undefined,
        { needsReauthorization: true },
      );
    }
    let next: OAuthTokens;
    try {
      next = await this.oauth.refresh(current.refreshToken);
    } catch (error) {
      // invalid_grant can mean "another process rotated the token after our
      // adopt-check": re-read the store once and retry with its token.
      if (error instanceof BexioOAuthError && error.code === 'invalid_grant') {
        const stored = await this.store.load();
        if (stored?.refreshToken !== undefined && stored.refreshToken !== current.refreshToken) {
          next = await this.oauth.refresh(stored.refreshToken);
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }
    // bexio rotates refresh tokens; keep the old one only if none was returned.
    if (next.refreshToken === undefined) next.refreshToken = current.refreshToken;
    this.tokens = next;
    // Persist BEFORE handing the token out: losing a rotated refresh token
    // strands the session at the next refresh. A failed write must not fail
    // the request though — retry on the next call instead.
    await this.persist(next);
    return next;
  }

  private async adoptStoredIfFresher(): Promise<OAuthTokens> {
    const cached = this.tokens;
    let stored: OAuthTokens | undefined;
    try {
      stored = await this.store.load();
    } catch {
      stored = undefined;
    }
    if (stored !== undefined && (cached === undefined || stored.expiresAt > cached.expiresAt)) {
      this.tokens = stored;
      return stored;
    }
    if (cached === undefined) {
      throw new BexioOAuthError('No stored bexio OAuth tokens. Run "bexio-mcp login" first.', undefined, undefined, {
        needsReauthorization: true,
      });
    }
    return cached;
  }

  private async persist(tokens: OAuthTokens): Promise<void> {
    try {
      await this.store.save(tokens);
      this.savePending = false;
    } catch {
      // Disk hiccup: keep serving from memory and retry on the next call.
      this.savePending = true;
    }
  }
}
