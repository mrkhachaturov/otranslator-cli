import { afterAll, describe, expect, it } from 'vitest';
import {
  client,
  fixtureFile,
  fixturePath,
  hasApiKey,
  paidEnabled,
  pollUntilDone,
} from './_helpers.js';

// Paid suite — requires both an API key AND opt-in via OTRANSLATOR_E2E_PAID=1.
// `translateTexts` consumes a few credits per call. `createTask` in preview
// mode costs 2 credits per the docs and downloads no real translation —
// preview mode is the cheapest way to exercise the file-upload path end to end.
const enabled = hasApiKey() && paidEnabled();

describe.skipIf(!enabled)('e2e: paid endpoints', () => {
  const c = enabled ? client() : null!;

  it('translateTexts translates a short string', async () => {
    const res = await c.translateTexts({
      texts: ['Hello, world.'],
      fromLang: 'English',
      toLang: 'Spanish',
    });

    console.log('[e2e] /v1/translation/translateTexts response:', JSON.stringify(res, null, 2));
    expect(Array.isArray(res.translatedTexts)).toBe(true);
    expect(res.translatedTexts.length).toBe(1);
    expect(res.translatedTexts[0]!.length).toBeGreaterThan(0);
  });

  describe('document task lifecycle (preview mode)', () => {
    let taskId: string | undefined;

    it('createTask submits the fixture in preview mode', async () => {
      const file = await fixtureFile();

      console.log(`[e2e] uploading fixture: ${fixturePath()} (${file.size} bytes)`);
      const res = await c.createTask({
        file,
        fromLang: 'English',
        toLang: 'Spanish',
        preview: true,
      });

      console.log('[e2e] /v1/translation/create response:', JSON.stringify(res, null, 2));
      expect(res.taskId).toBeTypeOf('string');
      taskId = res.taskId;
    });

    it('polls the task to completion', async () => {
      expect(taskId).toBeDefined();
      const final = await pollUntilDone(c, taskId!, { intervalMs: 5_000, maxMs: 240_000 });

      console.log('[e2e] terminal task state:', JSON.stringify(final, null, 2));
      expect(final.status).toBeDefined();
      expect(['Completed', 'Terminated', 'Cancelled']).toContain(final.status!);
      expect(final.fileTitle).toBeTypeOf('string');
      expect(final.fileUrl).toMatch(/^https:\/\//);
      expect(typeof final.wordNums === 'number' || final.wordNums === undefined).toBe(true);
      expect(typeof final.usedCredits).toBe('number');
    });

    it('downloadTranslated returns a non-empty Blob with the original filename', async () => {
      expect(taskId).toBeDefined();
      const result = await c.downloadTranslated(taskId!);
      expect(result.filename).toBeTypeOf('string');
      expect(result.filename.length).toBeGreaterThan(0);
      expect(result.blob.size).toBeGreaterThan(0);

      console.log(
        `[e2e] downloadTranslated → ${result.filename} (${result.blob.size} bytes, ${result.contentType ?? 'no content-type'})`,
      );
      const preview = (await result.blob.text()).slice(0, 80);

      console.log(`[e2e] download preview: ${preview.replace(/\n/g, '⏎')}`);
    });

    it('queryTexts returns the source/translation segments', async () => {
      expect(taskId).toBeDefined();
      const res = await c.queryTexts(taskId!);

      console.log('[e2e] /v1/translation/queryTexts response:', JSON.stringify(res, null, 2));
      expect(res).toBeTypeOf('object');
    });

    it('updateTexts accepts a revision payload', async () => {
      expect(taskId).toBeDefined();
      // Use a synthetic key so we don't conflict with real segment IDs.
      const res = await c.updateTexts({
        taskId: taskId!,
        revisedTexts: { __e2e_synthetic_key__: 'Hola, mundo (revisado).' },
      });

      console.log('[e2e] /v1/translation/updateTexts response:', JSON.stringify(res, null, 2));
      expect(res).toBeTypeOf('object');
    });

    it('restartTask converts the preview to a paid full translation', async () => {
      expect(taskId).toBeDefined();
      // For the tiny fixture, `price` is 0 so this costs no additional credits.
      const res = await c.restartTask({ taskId: taskId!, payWithCredits: true });

      console.log('[e2e] /v1/translation/start response:', JSON.stringify(res, null, 2));
      expect(res).toBeTypeOf('object');
    });

    afterAll(async () => {
      if (!taskId || !enabled) return;
      try {
        const res = await c.deleteTask(taskId);

        console.log('[e2e] /v1/translation/delete response:', JSON.stringify(res, null, 2));
      } catch (err) {
        console.warn(`[e2e] failed to delete task ${taskId}:`, err);
      }
    });
  });
});
