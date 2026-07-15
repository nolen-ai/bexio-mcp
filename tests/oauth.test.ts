import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BexioOAuth,
  BexioOAuthError,
  OAuthTokenProvider,
  generatePkce,
  generateState,
  type OAuthTokens,
  type TokenStore,
} from '../src/client/oauth.js';
import { FileTokenStore } from '../src/auth/token-store.js';
import { runLoginFlow } from '../src/auth/login.js';
import { scopesForGroups } from '../src/mcp/scopes.js';

function tokenResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      access_token: 'at-1',
      refresh_token: 'rt-1',
      expires_in: 300,
      token_type: 'Bearer',
      scope: 'openid contact_show',
      ...overrides,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

class MemoryStore implements TokenStore {
  tokens?: OAuthTokens;
  saves = 0;
  async load() {
    return this.tokens;
  }
  async save(tokens: OAuthTokens) {
    this.saves += 1;
    this.tokens = tokens;
  }
  async clear() {
    this.tokens = undefined;
  }
}

describe('BexioOAuth', () => {
  it('builds an authorization URL with PKCE and state', () => {
    const oauth = new BexioOAuth({ clientId: 'cid', clientSecret: 'sec' });
    const pkce = generatePkce();
    const state = generateState();
    const url = new URL(
      oauth.buildAuthorizationUrl({
        redirectUri: 'http://127.0.0.1:33771/callback',
        scopes: ['openid', 'offline_access', 'contact_show'],
        state,
        pkce,
      }),
    );
    expect(url.origin + url.pathname).toBe('https://auth.bexio.com/realms/bexio/protocol/openid-connect/auth');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('scope')).toBe('openid offline_access contact_show');
    expect(url.searchParams.get('state')).toBe(state);
    expect(url.searchParams.get('code_challenge')).toBe(pkce.challenge);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    // The secret must never leak into the browser URL.
    expect(url.toString()).not.toContain('sec');
  });

  it('exchanges a code with all parameters in the form body', async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://auth.bexio.com/realms/bexio/protocol/openid-connect/token');
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('the-code');
      expect(body.get('client_id')).toBe('cid');
      expect(body.get('client_secret')).toBe('sec');
      expect(body.get('redirect_uri')).toBe('http://127.0.0.1:33771/callback');
      expect(body.get('code_verifier')).toBe('verifier');
      return tokenResponse();
    });
    const oauth = new BexioOAuth({ clientId: 'cid', clientSecret: 'sec', fetch: fetchMock as typeof fetch });
    const tokens = await oauth.exchangeCode({
      code: 'the-code',
      redirectUri: 'http://127.0.0.1:33771/callback',
      codeVerifier: 'verifier',
    });
    expect(tokens.accessToken).toBe('at-1');
    expect(tokens.refreshToken).toBe('rt-1');
    expect(tokens.expiresAt).toBeGreaterThan(Date.now());
  });

  it('maps invalid_grant to a re-authorization error', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Token is not active' }), {
        status: 400,
      }),
    );
    const oauth = new BexioOAuth({ clientId: 'cid', clientSecret: 'sec', fetch: fetchMock as typeof fetch });
    const error = await oauth.refresh('stale').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BexioOAuthError);
    expect((error as BexioOAuthError).needsReauthorization).toBe(true);
    expect((error as BexioOAuthError).message).toContain('login');
  });
});

describe('OAuthTokenProvider', () => {
  const oauthWith = (fetchMock: typeof fetch) =>
    new BexioOAuth({ clientId: 'cid', clientSecret: 'sec', fetch: fetchMock });

  it('returns the cached token while valid and refreshes when expired', async () => {
    const fetchMock = vi.fn(async () => tokenResponse({ access_token: 'at-2', refresh_token: 'rt-2' }));
    const store = new MemoryStore();
    store.tokens = { accessToken: 'at-1', refreshToken: 'rt-1', expiresAt: Date.now() + 3_600_000 };
    const provider = new OAuthTokenProvider(oauthWith(fetchMock as typeof fetch), store);
    expect(await provider.getAccessToken()).toBe('at-1');
    expect(fetchMock).not.toHaveBeenCalled();

    store.tokens!.expiresAt = Date.now() + 10_000; // inside the 60s margin
    const provider2 = new OAuthTokenProvider(oauthWith(fetchMock as typeof fetch), store);
    expect(await provider2.getAccessToken()).toBe('at-2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('persists rotated refresh tokens and single-flights concurrent refreshes', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      calls += 1;
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('refresh_token')).toBe('rt-old');
      return tokenResponse({ access_token: 'at-new', refresh_token: 'rt-new' });
    });
    const store = new MemoryStore();
    store.tokens = { accessToken: 'at-old', refreshToken: 'rt-old', expiresAt: Date.now() - 1000 };
    const provider = new OAuthTokenProvider(oauthWith(fetchMock as typeof fetch), store);

    const [a, b, c] = await Promise.all([
      provider.getAccessToken(),
      provider.getAccessToken(),
      provider.getAccessToken(),
    ]);
    expect([a, b, c]).toEqual(['at-new', 'at-new', 'at-new']);
    expect(calls).toBe(1); // single-flight
    expect(store.tokens?.refreshToken).toBe('rt-new'); // rotation persisted
    expect(store.saves).toBe(1);
  });

  it('demands a login when no tokens are stored', async () => {
    const provider = new OAuthTokenProvider(oauthWith(vi.fn() as typeof fetch), new MemoryStore());
    const error = await provider.getAccessToken().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BexioOAuthError);
    expect((error as BexioOAuthError).needsReauthorization).toBe(true);
  });

  it('adopts fresher tokens written by another process instead of refreshing', async () => {
    const fetchMock = vi.fn();
    const store = new MemoryStore();
    const provider = new OAuthTokenProvider(oauthWith(fetchMock as typeof fetch), store, {
      accessToken: 'at-stale',
      refreshToken: 'rt-stale',
      expiresAt: Date.now() - 1000,
    });
    // Another process refreshed meanwhile and stored fresh tokens.
    store.tokens = { accessToken: 'at-other', refreshToken: 'rt-other', expiresAt: Date.now() + 3_600_000 };
    expect(await provider.getAccessToken()).toBe('at-other');
    expect(fetchMock).not.toHaveBeenCalled(); // no network round-trip needed
  });

  it('retries with the stored refresh token after invalid_grant (rotation race)', async () => {
    let call = 0;
    const store = new MemoryStore();
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      call += 1;
      const body = new URLSearchParams(String(init?.body));
      if (call === 1) {
        expect(body.get('refresh_token')).toBe('rt-mine');
        // Simulate the other process rotating our token away *after* the adopt check.
        store.tokens = { accessToken: 'at-x', refreshToken: 'rt-theirs', expiresAt: Date.now() - 1 };
        return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
      }
      expect(body.get('refresh_token')).toBe('rt-theirs');
      return tokenResponse({ access_token: 'at-recovered', refresh_token: 'rt-next' });
    });
    const provider = new OAuthTokenProvider(oauthWith(fetchMock as typeof fetch), store, {
      accessToken: 'at-old',
      refreshToken: 'rt-mine',
      expiresAt: Date.now() - 1000,
    });
    expect(await provider.getAccessToken()).toBe('at-recovered');
    expect(store.tokens?.refreshToken).toBe('rt-next');
  });

  it('clears the single-flight promise after a failed refresh so the next call retries', async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) return new Response('<html>Bad Gateway</html>', { status: 502 });
      return tokenResponse({ access_token: 'at-2' });
    });
    const store = new MemoryStore();
    store.tokens = { accessToken: 'at-1', refreshToken: 'rt-1', expiresAt: Date.now() - 1000 };
    const provider = new OAuthTokenProvider(oauthWith(fetchMock as typeof fetch), store);
    const first = await provider.getAccessToken().catch((e: unknown) => e);
    expect(first).toBeInstanceOf(BexioOAuthError);
    expect((first as BexioOAuthError).status).toBe(502);
    expect((first as BexioOAuthError).needsReauthorization).toBe(false);
    expect(await provider.getAccessToken()).toBe('at-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps serving when persisting rotated tokens fails, and retries the save', async () => {
    const fetchMock = vi.fn(async () => tokenResponse({ access_token: 'at-2', refresh_token: 'rt-2' }));
    const store = new MemoryStore();
    store.tokens = { accessToken: 'at-1', refreshToken: 'rt-1', expiresAt: Date.now() - 1000 };
    let failSaves = true;
    const flakyStore: TokenStore = {
      load: () => store.load(),
      save: async (t) => {
        if (failSaves) throw new Error('disk full');
        await store.save(t);
      },
      clear: () => store.clear(),
    };
    const provider = new OAuthTokenProvider(oauthWith(fetchMock as typeof fetch), flakyStore);
    expect(await provider.getAccessToken()).toBe('at-2'); // request survives the failed save
    failSaves = false;
    expect(await provider.getAccessToken()).toBe('at-2'); // pending save retried
    expect(store.tokens?.refreshToken).toBe('rt-2');
  });
});

describe('FileTokenStore', () => {
  it('round-trips tokens and enforces the client id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bexio-mcp-test-'));
    const path = join(dir, 'nested', 'tokens.json');
    const store = new FileTokenStore(path, 'cid');
    const tokens: OAuthTokens = {
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: 1234567890,
      scope: 'openid',
    };
    await store.save(tokens);
    expect(await store.load()).toEqual(tokens);

    // A different app must not pick up these tokens.
    const otherApp = new FileTokenStore(path, 'other-cid');
    expect(await otherApp.load()).toBeUndefined();

    await store.clear();
    expect(await store.load()).toBeUndefined();
    await store.clear(); // idempotent
  });
});

/** Reserves an OS-assigned free port and releases it for immediate reuse. */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = (probe.address() as { port: number }).port;
      probe.close(() => resolve(port));
    });
  });
}

describe('runLoginFlow', () => {
  it('completes the loopback flow: forged state rejected, real callback accepted, replay ignored', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('cb-code');
      expect(body.get('code_verifier')).toBeTruthy();
      return tokenResponse();
    });
    const oauth = new BexioOAuth({ clientId: 'cid', clientSecret: 'sec', fetch: fetchMock as typeof fetch });
    const store = new MemoryStore();
    const messages: string[] = [];

    const redirectUri = `http://127.0.0.1:${await freePort()}/callback`;
    const flow = runLoginFlow({
      oauth,
      store,
      scopes: ['openid', 'contact_show'],
      redirectUri,
      openBrowser: false,
      timeoutMs: 15_000,
      onMessage: (m) => messages.push(m),
    });

    // Wait for the listener, then pull the real state out of the printed URL.
    await vi.waitFor(
      () => {
        if (!messages.some((m) => m.includes('code_challenge'))) throw new Error('auth URL not printed yet');
      },
      { timeout: 5000, interval: 25 },
    );
    const authUrl = new URL(messages.join('\n').match(/https:\/\/auth\.bexio\.com\S+/)![0]);
    const state = authUrl.searchParams.get('state')!;

    // Forged state: page reports failure, flow keeps waiting.
    const forged = await fetch(`${redirectUri}?code=evil&state=wrong`);
    expect(forged.status).toBe(400);

    // Error callback WITHOUT our state must not settle the flow either.
    const forgedError = await fetch(`${redirectUri}?error=access_denied&state=wrong`);
    expect(forgedError.status).toBe(400);

    // Real callback resolves the flow and persists tokens.
    const genuine = await fetch(`${redirectUri}?code=cb-code&state=${encodeURIComponent(state)}`);
    expect(genuine.status).toBe(200);
    const tokens = await flow;
    expect(tokens.accessToken).toBe('at-1');
    expect(store.tokens?.accessToken).toBe('at-1');
    expect(fetchMock).toHaveBeenCalledTimes(1); // forged code never exchanged

    // Replaying the genuine callback (browser refresh) must NOT re-exchange the
    // single-use code — the IdP would treat reuse as an attack.
    const replay = await fetch(`${redirectUri}?code=cb-code&state=${encodeURIComponent(state)}`).catch(() => undefined);
    if (replay) expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('times out cleanly and releases the port', async () => {
    const oauth = new BexioOAuth({ clientId: 'cid', clientSecret: 'sec', fetch: vi.fn() as typeof fetch });
    const port = await freePort();
    const redirectUri = `http://127.0.0.1:${port}/callback`;
    await expect(
      runLoginFlow({ oauth, store: new MemoryStore(), scopes: [], redirectUri, openBrowser: false, timeoutMs: 100 }),
    ).rejects.toThrow(/timed out/);
    // Port must be reusable immediately.
    const again = runLoginFlow({
      oauth,
      store: new MemoryStore(),
      scopes: [],
      redirectUri,
      openBrowser: false,
      timeoutMs: 100,
    });
    await expect(again).rejects.toThrow(/timed out/);
  });

  it('rejects non-loopback redirect URIs', () => {
    const oauth = new BexioOAuth({ clientId: 'cid', clientSecret: 'sec', fetch: vi.fn() as typeof fetch });
    expect(() =>
      runLoginFlow({ oauth, store: new MemoryStore(), scopes: [], redirectUri: 'http://evil.example/callback' }),
    ).toThrow(/loopback/);
  });
});

describe('scopesForGroups', () => {
  it('derives scopes from groups, honouring read-only mode', () => {
    const banking = scopesForGroups(['banking']);
    expect(banking).toEqual(['bank_account_show', 'bank_payment_edit', 'bank_payment_show']);
    const bankingRead = scopesForGroups(['banking'], true);
    expect(bankingRead).toEqual(['bank_account_show', 'bank_payment_show']);
    // Spec quirk: stock reads require stock_edit even in read-only mode.
    expect(scopesForGroups(['items'], true)).toContain('stock_edit');
    // Default = all groups; never contains the implicit pseudo-scope.
    expect(scopesForGroups(undefined)).not.toContain('general');
    expect(scopesForGroups(undefined).length).toBeGreaterThan(15);
  });
});
