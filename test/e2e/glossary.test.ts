import { afterAll, describe, expect, it } from 'vitest';
import { client, hasApiKey } from './_helpers.js';

describe.skipIf(!hasApiKey())('e2e: glossary lifecycle', () => {
  const c = hasApiKey() ? client() : null!;
  const name = `otranslator-cli-e2e-${Date.now()}`;
  let glossaryId: string | undefined;

  it('creates a glossary', async () => {
    const res = await c.createGlossary({
      name,
      desc: 'Created by otranslator-cli e2e suite — safe to delete',
      targetLang: 'English',
      keys: ['otranslator', '术语'],
      translated: { otranslator: 'OTranslator', 术语: 'terminology' },
    });

    console.log('[e2e] /v1/glossary/create response:', JSON.stringify(res, null, 2));
    expect(res.glossaryId).toBeTypeOf('string');
    expect(res.glossaryId!.length).toBeGreaterThan(0);
    glossaryId = res.glossaryId;
  });

  it('queries the glossary by id and parses keys/translated to native types', async () => {
    expect(glossaryId).toBeDefined();
    const res = await c.queryGlossary(glossaryId!);

    console.log('[e2e] /v1/glossary/query parsed response:', JSON.stringify(res, null, 2));
    expect(res.glossaryId).toBe(glossaryId);
    expect(Array.isArray(res.keys)).toBe(true);
    expect(res.keys).toEqual(['otranslator', '术语']);
    expect(res.translated).toEqual({ otranslator: 'OTranslator', 术语: 'terminology' });
  });

  it('updates the glossary description', async () => {
    expect(glossaryId).toBeDefined();
    const res = await c.updateGlossary({
      glossaryId: glossaryId!,
      desc: 'Updated by e2e suite',
    });

    console.log('[e2e] /v1/glossary/update parsed response:', JSON.stringify(res, null, 2));
    expect(res.glossaryId).toBe(glossaryId);
    expect(res.desc).toBe('Updated by e2e suite');
  });

  afterAll(async () => {
    if (!glossaryId || !hasApiKey()) return;
    try {
      const res = await c.deleteGlossary(glossaryId);

      console.log('[e2e] /v1/glossary/delete response:', JSON.stringify(res, null, 2));
    } catch (err) {
      console.warn(`[e2e] failed to delete glossary ${glossaryId}:`, err);
    }
  });
});
