import { describe, expect, it } from 'vitest';
import { client, hasApiKey } from './_helpers.js';

// Free-tier endpoints — auto-skip when no API key is available.
describe.skipIf(!hasApiKey())('e2e: free metadata + account', () => {
  it('languages() returns a non-empty list including English', async () => {
    const res = await client().languages();

    console.log('[e2e] /v1/languages response:', JSON.stringify(res, null, 2));
    expect(Array.isArray(res.languages)).toBe(true);
    expect(res.languages.length).toBeGreaterThan(50);
    expect(res.languages).toContain('English');
  });

  it('filetypes() returns a non-empty list including pdf', async () => {
    const res = await client().filetypes();

    console.log('[e2e] /v1/filetypes response:', JSON.stringify(res, null, 2));
    expect(Array.isArray(res.types)).toBe(true);
    expect(res.types.length).toBeGreaterThan(10);
    expect(res.types).toContain('pdf');
  });

  it('models() returns a list of model identifiers', async () => {
    const res = await client().models();

    console.log('[e2e] /v1/models response:', JSON.stringify(res, null, 2));
    expect(Array.isArray(res.models)).toBe(true);
    expect(res.models.length).toBeGreaterThan(0);
    for (const m of res.models) expect(typeof m).toBe('string');
  });

  it('me() returns the credit balance', async () => {
    const res = await client().me();

    console.log('[e2e] /v1/me response:', JSON.stringify(res, null, 2));
    expect(typeof res.balance).toBe('number');
    expect(res.balance).toBeGreaterThanOrEqual(0);
  });
});
