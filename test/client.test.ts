import { describe, expect, it, vi } from 'vitest';
import { OTranslatorClient } from '../src/client.js';
import { OTranslatorError } from '../src/errors.js';

function makeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    return handler(url, init ?? {});
  }) as unknown as typeof fetch;
}

const apiKey = 'test-key';

describe('OTranslatorClient', () => {
  it('throws when apiKey is missing', () => {
    expect(() => new OTranslatorClient({} as never)).toThrow(OTranslatorError);
  });

  it('sends Authorization header without Bearer prefix', async () => {
    const fetchMock = makeFetch((_url, init) => {
      const auth = (init.headers as Record<string, string>)['Authorization'];
      expect(auth).toBe(apiKey);
      return new Response(JSON.stringify({ languages: ['English'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const client = new OTranslatorClient({ apiKey, fetch: fetchMock });
    const res = await client.languages();
    expect(res.languages).toEqual(['English']);
  });

  it('hits the documented path for queryTask with JSON body', async () => {
    const fetchMock = makeFetch((url, init) => {
      expect(url).toBe('https://otranslator.com/api/v1/translation/query');
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify({ taskId: 't_123' }));
      return new Response(JSON.stringify({ taskId: 't_123', status: 'Completed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const client = new OTranslatorClient({ apiKey, fetch: fetchMock });
    const task = await client.queryTask('t_123');
    expect(task.status).toBe('Completed');
  });

  it('JSON-encodes glossary keys and translated', async () => {
    const fetchMock = makeFetch((_url, init) => {
      const body = JSON.parse(init.body as string);
      expect(body.keys).toBe(JSON.stringify(['term']));
      expect(body.translated).toBe(JSON.stringify({ term: 'translation' }));
      return new Response(JSON.stringify({ glossaryId: 'g_1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const client = new OTranslatorClient({ apiKey, fetch: fetchMock });
    const res = await client.createGlossary({
      name: 'test',
      targetLang: 'English',
      keys: ['term'],
      translated: { term: 'translation' },
    });
    expect(res.glossaryId).toBe('g_1');
  });

  it('rejects same-language translation requests', async () => {
    const client = new OTranslatorClient({ apiKey, fetch: makeFetch(() => new Response('{}')) });
    await expect(
      client.translateTexts({ texts: ['hi'], fromLang: 'English', toLang: 'English' }),
    ).rejects.toThrow(/must differ/);
  });

  it('maps HTTP errors to OTranslatorError with status', async () => {
    const fetchMock = makeFetch(
      () =>
        new Response(JSON.stringify({ message: 'invalid key' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const client = new OTranslatorClient({ apiKey, fetch: fetchMock });
    await expect(client.me()).rejects.toMatchObject({
      code: 'HTTP_ERROR',
      status: 401,
      message: 'invalid key',
    });
  });

  it('waitForTask polls until status is terminal', async () => {
    const statuses = ['Waiting', 'Processing', 'Completed'];
    let call = 0;
    const fetchMock = makeFetch(() => {
      const status = statuses[call++] ?? 'Completed';
      return new Response(JSON.stringify({ taskId: 't_1', status }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const client = new OTranslatorClient({ apiKey, fetch: fetchMock });
    const final = await client.waitForTask('t_1', { intervalMs: 1, maxMs: 5_000 });
    expect(final.status).toBe('Completed');
    expect(call).toBe(3);
  });

  it('waitForTask throws TIMEOUT after the budget elapses', async () => {
    const fetchMock = makeFetch(
      () =>
        new Response(JSON.stringify({ taskId: 't_1', status: 'Processing' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const client = new OTranslatorClient({ apiKey, fetch: fetchMock });
    await expect(client.waitForTask('t_1', { intervalMs: 1, maxMs: 50 })).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('downloadTranslated fetches the URL and returns a Blob with a derived filename', async () => {
    const downloadUrl = 'https://storage.googleapis.com/otranslator/production/abc.md?Signature=x';
    const fetchMock = makeFetch((url) => {
      if (url.endsWith('/v1/translation/query')) {
        return new Response(
          JSON.stringify({
            taskId: 't_1',
            status: 'Completed',
            fileTitle: 'sample.md',
            translatedFileUrl: downloadUrl,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url === downloadUrl) {
        return new Response('# translated content\n', {
          status: 200,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
        });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const client = new OTranslatorClient({ apiKey, fetch: fetchMock });
    const result = await client.downloadTranslated('t_1');
    expect(result.filename).toBe('sample.md');
    expect(result.contentType).toBe('text/markdown; charset=utf-8');
    expect(await result.blob.text()).toBe('# translated content\n');
  });

  it('downloadTranslated --bilingual inserts the suffix and uses the bilingual url', async () => {
    const bilingualUrl = 'https://storage.googleapis.com/otranslator/production/abc-bi.md?Sig=y';
    const fetchMock = makeFetch((url) => {
      if (url.endsWith('/v1/translation/query')) {
        return new Response(
          JSON.stringify({
            taskId: 't_1',
            status: 'Completed',
            fileTitle: 'report.md',
            translatedFileUrl: 'https://example.test/translated.md',
            translatedBilingualFileUrl: bilingualUrl,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url === bilingualUrl) {
        return new Response('bilingual content', {
          status: 200,
          headers: { 'Content-Type': 'text/markdown' },
        });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const client = new OTranslatorClient({ apiKey, fetch: fetchMock });
    const result = await client.downloadTranslated('t_1', { bilingual: true });
    expect(result.filename).toBe('report.bilingual.md');
    expect(await result.blob.text()).toBe('bilingual content');
  });

  it('downloadTranslated rejects when the task is not Completed', async () => {
    const fetchMock = makeFetch(
      () =>
        new Response(JSON.stringify({ taskId: 't_1', status: 'Processing' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const client = new OTranslatorClient({ apiKey, fetch: fetchMock });
    await expect(client.downloadTranslated('t_1')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('downloadTranslated rejects when the bilingual URL is missing', async () => {
    const fetchMock = makeFetch(
      () =>
        new Response(
          JSON.stringify({
            taskId: 't_1',
            status: 'Completed',
            translatedFileUrl: 'https://example.test/translated.md',
            // translatedBilingualFileUrl is intentionally absent
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    const client = new OTranslatorClient({ apiKey, fetch: fetchMock });
    await expect(client.downloadTranslated('t_1', { bilingual: true })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});
