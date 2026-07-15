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
      readOnly: true,
      language: 'de',
      timeoutMs: 5000,
    });
  });

  it('lets CLI flags override the environment', () => {
    const parsed = parseCliConfig(['--token', 'cli-tok', '--groups=banking', '--read-only'], {
      BEXIO_API_TOKEN: 'env-tok',
    } as NodeJS.ProcessEnv);
    expect(parsed.config).toMatchObject({ token: 'cli-tok', groups: ['banking'], readOnly: true });
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

  it('handles help/version/list-tools switches', () => {
    expect(parseCliConfig(['--help'], noEnv).help).toBe(true);
    expect(parseCliConfig(['-v'], noEnv).version).toBe(true);
    expect(parseCliConfig(['--list-tools'], { BEXIO_API_TOKEN: 't' } as NodeJS.ProcessEnv).listTools).toBe(true);
  });
});
