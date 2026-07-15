import { describe, expect, it, vi } from 'vitest';
import { BexioHttp } from '../src/client/http.js';
import { BexioApiError, BexioConfigError, BexioRateLimitError } from '../src/client/errors.js';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('BexioHttp', () => {
  it('sends auth, accept and content headers and serializes the body', async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.bexio.com/2.0/contact?limit=10&order_by=id_desc');
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer test-token');
      expect(headers.Accept).toBe('application/json');
      expect(headers['Accept-Language']).toBe('de');
      expect(headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(String(init?.body))).toEqual([{ field: 'name_1', value: 'Muster' }]);
      return jsonResponse([{ id: 1 }]);
    });
    const http = new BexioHttp({ token: 'test-token', language: 'de', fetch: fetchMock as typeof fetch });
    const result = await http.post('/2.0/contact', {
      query: { limit: 10, offset: undefined, order_by: 'id_desc' },
      body: [{ field: 'name_1', value: 'Muster' }],
    });
    expect(result).toEqual([{ id: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('supports async token providers', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer fresh');
      return jsonResponse({ ok: true });
    });
    const http = new BexioHttp({ token: async () => 'fresh', fetch: fetchMock as typeof fetch });
    await http.get('/3.0/users/me');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps error bodies to BexioApiError', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error_code: 404, message: 'Page not found' }, { status: 404 }),
    );
    const http = new BexioHttp({ token: 't', fetch: fetchMock as typeof fetch });
    const error = await http.get('/2.0/contact/999').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BexioApiError);
    const apiError = error as BexioApiError;
    expect(apiError.status).toBe(404);
    expect(apiError.errorCode).toBe(404);
    expect(apiError.isNotFound).toBe(true);
    expect(apiError.message).toContain('Page not found');
  });

  it('retries 429 responses honouring RateLimit-Reset and succeeds', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse({ message: 'slow down' }, { status: 429, headers: { 'RateLimit-Reset': '0' } });
      }
      return jsonResponse({ id: 7 });
    });
    const http = new BexioHttp({ token: 't', fetch: fetchMock as typeof fetch, maxRetries: 2 });
    const result = await http.get<{ id: number }>('/2.0/contact/7');
    expect(result.id).toBe(7);
    expect(calls).toBe(2);
  });

  it('throws BexioRateLimitError when 429 persists across retries', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ message: 'slow down' }, { status: 429, headers: { 'RateLimit-Reset': '0' } }),
    );
    const http = new BexioHttp({ token: 't', fetch: fetchMock as typeof fetch, maxRetries: 1 });
    const error = await http.get('/2.0/contact').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BexioRateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries GET on 5xx but not POST', async () => {
    let getCalls = 0;
    const getFetch = vi.fn(async () => {
      getCalls += 1;
      return getCalls === 1 ? jsonResponse({}, { status: 502 }) : jsonResponse({ ok: true });
    });
    const httpGet = new BexioHttp({ token: 't', fetch: getFetch as typeof fetch, maxRetries: 1 });
    await expect(httpGet.get('/2.0/contact')).resolves.toEqual({ ok: true });

    const postFetch = vi.fn(async () => jsonResponse({}, { status: 502 }));
    const httpPost = new BexioHttp({ token: 't', fetch: postFetch as typeof fetch, maxRetries: 3 });
    await expect(httpPost.post('/2.0/contact', { body: {} })).rejects.toBeInstanceOf(BexioApiError);
    expect(postFetch).toHaveBeenCalledTimes(1);
  });

  it('returns binary payloads as Uint8Array', async () => {
    const bytes = new Uint8Array([37, 80, 68, 70]); // "%PDF"
    const fetchMock = vi.fn(async () => new Response(bytes, { status: 200 }));
    const http = new BexioHttp({ token: 't', fetch: fetchMock as typeof fetch });
    const result = await http.get<Uint8Array>('/3.0/files/1/download', { responseType: 'binary' });
    expect(result).toBeInstanceOf(Uint8Array);
    expect([...result]).toEqual([37, 80, 68, 70]);
  });

  it('serializes array query params as repeated keys (OpenAPI form/explode)', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      expect(String(url)).toBe(
        'https://api.bexio.com/4.0/purchase/bills?fields%5B%5D=document_no&fields%5B%5D=title&limit=10',
      );
      return jsonResponse([]);
    });
    const http = new BexioHttp({ token: 't', fetch: fetchMock as typeof fetch });
    await http.get('/4.0/purchase/bills', { query: { 'fields[]': ['document_no', 'title'], limit: 10 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('honours an already-aborted signal without issuing a request', async () => {
    const fetchMock = vi.fn();
    const http = new BexioHttp({ token: 't', fetch: fetchMock as typeof fetch });
    const controller = new AbortController();
    const reason = new Error('caller cancelled');
    controller.abort(reason);
    await expect(http.post('/2.0/contact', { body: {}, signal: controller.signal })).rejects.toThrow(
      /caller cancelled|Aborted/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects construction without token', () => {
    expect(() => new BexioHttp({ token: '' })).toThrow(BexioConfigError);
  });
});
