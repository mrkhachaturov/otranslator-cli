import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OTranslatorClient } from '../../src/client.js';
import type { TranslationTask } from '../../src/types.js';

const here = fileURLToPath(new URL('.', import.meta.url));

/** True when an API key is available — gates every e2e test file. */
export const hasApiKey = (): boolean => Boolean(process.env.OTRANSLATOR_API_KEY);

/** True when the user has opted into credit-spending tests. */
export const paidEnabled = (): boolean => process.env.OTRANSLATOR_E2E_PAID === '1';

/** Build a client from env. Throws if no key — gate tests with `hasApiKey()` first. */
export function client(): OTranslatorClient {
  const apiKey = process.env.OTRANSLATOR_API_KEY;
  if (!apiKey) throw new Error('OTRANSLATOR_API_KEY missing — should have been gated');
  const opts: ConstructorParameters<typeof OTranslatorClient>[0] = { apiKey };
  if (process.env.OTRANSLATOR_BASE_URL) opts.baseUrl = process.env.OTRANSLATOR_BASE_URL;
  return new OTranslatorClient(opts);
}

/** Resolve the fixture file path, honouring `OTRANSLATOR_E2E_FIXTURE`. */
export function fixturePath(): string {
  const override = process.env.OTRANSLATOR_E2E_FIXTURE;
  return override ? resolve(override) : resolve(here, '..', 'fixtures', 'sample.md');
}

/** Read the fixture into a `File` for upload. */
export async function fixtureFile(): Promise<File> {
  const path = fixturePath();
  const buffer = await readFile(path);
  return new File([buffer], basename(path));
}

/** Thin wrapper around `client.waitForTask` so test files keep their old import. */
export async function pollUntilDone(
  c: OTranslatorClient,
  taskId: string,
  options: { intervalMs?: number; maxMs?: number } = {},
): Promise<TranslationTask> {
  return c.waitForTask(taskId, options);
}
