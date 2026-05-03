import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  configDir,
  configPath,
  deleteStoredConfig,
  getStoredApiKey,
  writeStoredConfig,
} from '../src/cli/config-store.js';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'otcli-test-'));
  process.env.OTRANSLATOR_CONFIG_DIR = tmp;
});

afterEach(async () => {
  delete process.env.OTRANSLATOR_CONFIG_DIR;
  await rm(tmp, { recursive: true, force: true });
});

describe('config-store', () => {
  it('configDir respects OTRANSLATOR_CONFIG_DIR', () => {
    expect(configDir()).toBe(tmp);
    expect(configPath()).toBe(join(tmp, 'config.json'));
  });

  it('getStoredApiKey returns undefined when the file is absent', () => {
    expect(getStoredApiKey()).toBeUndefined();
  });

  it('writes, reads, and deletes a stored key', async () => {
    await writeStoredConfig({ apiKey: 'sk-test-123' });
    expect(getStoredApiKey()).toBe('sk-test-123');

    if (process.platform !== 'win32') {
      const info = await stat(configPath());
      // Mode 0600 — owner read/write only.
      expect((info.mode & 0o777).toString(8)).toBe('600');
    }

    expect(await deleteStoredConfig()).toBe(true);
    expect(getStoredApiKey()).toBeUndefined();
    expect(await deleteStoredConfig()).toBe(false); // already absent
  });

  it('overwrites an existing key', async () => {
    await writeStoredConfig({ apiKey: 'first' });
    await writeStoredConfig({ apiKey: 'second' });
    expect(getStoredApiKey()).toBe('second');
  });

  it('returns undefined on malformed JSON instead of throwing', async () => {
    await writeStoredConfig({ apiKey: 'ok' });
    // Corrupt the file
    const { writeFile } = await import('node:fs/promises');
    await writeFile(configPath(), '{ not json');
    expect(getStoredApiKey()).toBeUndefined();
  });
});
