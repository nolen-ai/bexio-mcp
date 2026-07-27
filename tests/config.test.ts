import { describe, expect, it } from 'vitest';
import { parseCliConfig } from '../src/config.js';

const noEnv = {} as NodeJS.ProcessEnv;

describe('parseCliConfig', () => {
  it('reads configuration from environment variables', () => {
    const parsed = parseCliConfig([], {
      BEXIO_API_TOKEN: 'tok',
      BEXIO_TOOL_GROUPS: 'contacts, sales',
      BEXIO_READ_ONLY: 'true',
      BEXIO_LANGUAGE: 'de',
      BEXIO_TIMEOUT_MS: '5000',
    } as NodeJS.ProcessEnv);
    expect(parsed.error).toBeUndefined();
    expect(parsed.config).toMatchObject({
      token: 'tok',
      groups: ['contacts', 'sales'],
      writeMode: 'read-only',
      readOnly: true,
      language: 'de',
      timeoutMs: 5000,
    });
  });

  it('lets CLI flags override the environment', () => {
    const parsed = parseCliConfig(['--token', 'cli-tok', '--groups=banking', '--read-only'], {
      BEXIO_API_TOKEN: 'env-tok',
    } as NodeJS.ProcessEnv);
    expect(parsed.config).toMatchObject({
      token: 'cli-tok',
      groups: ['banking'],
      writeMode: 'read-only',
      readOnly: true,
    });
  });

  it('parses write modes and keeps --read-only as a compatibility override', () => {
    expect(parseCliConfig([], { BEXIO_WRITE_MODE: 'drafts' } as NodeJS.ProcessEnv).config).toMatchObject({
      writeMode: 'drafts',
      readOnly: false,
    });
    expect(parseCliConfig(['--write-mode', 'full'], { BEXIO_WRITE_MODE: 'drafts' } as NodeJS.ProcessEnv).config)
      .toMatchObject({ writeMode: 'full', readOnly: false });
    expect(parseCliConfig(['--write-mode', 'full', '--read-only'], noEnv).config).toMatchObject({
      writeMode: 'read-only',
      readOnly: true,
    });
    expect(parseCliConfig(['--write-mode', 'unsafe'], noEnv).error).toContain('read-only, drafts, full');
  });

  it('rejects unknown groups with a helpful message', () => {
    const parsed = parseCliConfig(['--groups', 'contacts,nope'], noEnv);
    expect(parsed.error).toContain('nope');
    expect(parsed.error).toContain('contacts');
  });

  it('rejects unknown flags and invalid timeouts', () => {
    expect(parseCliConfig(['--wat'], noEnv).error).toContain('--wat');
    expect(parseCliConfig(['--timeout-ms', 'abc'], noEnv).error).toContain('abc');
  });

  it('handles help/version/list-tools switches, including inline false values', () => {
    expect(parseCliConfig(['--help'], noEnv).help).toBe(true);
    expect(parseCliConfig(['-v'], noEnv).version).toBe(true);
    expect(parseCliConfig(['--list-tools'], { BEXIO_API_TOKEN: 't' } as NodeJS.ProcessEnv).listTools).toBe(true);
    expect(parseCliConfig(['--list-tools=false'], { BEXIO_API_TOKEN: 't' } as NodeJS.ProcessEnv).listTools).toBe(false);
    expect(parseCliConfig(['--help=false'], noEnv).help).toBeUndefined();
  });

  it('parses subcommands and OAuth options', () => {
    const parsed = parseCliConfig(
      ['login', '--client-id', 'cid', '--client-secret', 'sec', '--scopes', 'openid contact_show', '--no-browser'],
      noEnv,
    );
    expect(parsed.command).toBe('login');
    expect(parsed.config).toMatchObject({
      clientId: 'cid',
      clientSecret: 'sec',
      scopes: ['openid', 'contact_show'],
      noBrowser: true,
    });
    expect(parseCliConfig([], noEnv).command).toBe('serve');
    expect(parseCliConfig(['--no-browser=false'], { BEXIO_NO_BROWSER: 'true' } as NodeJS.ProcessEnv).config?.noBrowser).toBe(false);
    expect(parseCliConfig([], { BEXIO_NO_BROWSER: '1' } as NodeJS.ProcessEnv).config?.noBrowser).toBe(true);
    expect(parseCliConfig(['frobnicate'], noEnv).error).toContain('frobnicate');
  });
});
