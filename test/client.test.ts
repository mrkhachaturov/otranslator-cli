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
});
