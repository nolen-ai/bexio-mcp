/**
 * File-based persistence for bexio OAuth tokens.
 *
 * Default location: `~/.bexio-mcp/tokens.json`. The file contains the
 * (rotating) refresh token — treat it like a password. Permissions are
 * restricted to the owner where the platform supports it.
 */
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { OAuthTokens, TokenStore } from '../client/oauth.js';

export function defaultTokenStorePath(): string {
  return join(homedir(), '.bexio-mcp', 'tokens.json');
}

interface StoredFile {
  /** Format marker for forward compatibility. */
  version: 1;
  /** Client id the tokens belong to — prevents cross-app token reuse. */
  client_id?: string;
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope?: string;
}

export class FileTokenStore implements TokenStore {
  constructor(
    private readonly path: string = defaultTokenStorePath(),
    /** When set, load() rejects tokens stored for a different client id. */
    private readonly clientId?: string,
  ) {}

  get location(): string {
    return this.path;
  }

  async load(): Promise<OAuthTokens | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.path, 'utf8');
    } catch {
      return undefined;
    }
    let parsed: StoredFile;
    try {
      parsed = JSON.parse(raw) as StoredFile;
    } catch {
      return undefined;
    }
    if (typeof parsed.access_token !== 'string' || typeof parsed.expires_at !== 'number') return undefined;
    // Tokens for a different (or unknown) app must not be reused with this client id.
    if (this.clientId && parsed.client_id !== this.clientId) return undefined;
    return {
      accessToken: parsed.access_token,
      refreshToken: parsed.refresh_token,
      expiresAt: parsed.expires_at,
      scope: parsed.scope,
    };
  }

  async save(tokens: OAuthTokens): Promise<void> {
    const payload: StoredFile = {
      version: 1,
      client_id: this.clientId,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt,
      scope: tokens.scope,
    };
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    // Atomic replace so a crash never leaves a torn file (and the rotated
    // refresh token is either fully written or the old file survives).
    const tmp = `${this.path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
    try {
      await rename(tmp, this.path);
    } catch (error) {
      await unlink(tmp).catch(() => undefined);
      throw error;
    }
    try {
      await chmod(this.path, 0o600);
    } catch {
      // Windows has no POSIX modes; ACLs already restrict %USERPROFILE%.
    }
  }

  async clear(): Promise<void> {
    try {
      await unlink(this.path);
    } catch {
      // Already gone.
    }
  }
}
