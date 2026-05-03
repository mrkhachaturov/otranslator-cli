import { readFileSync } from 'node:fs';
import { chmod, mkdir, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_FILE = 'config.json';
const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

export interface StoredConfig {
  apiKey?: string;
}

/**
 * Resolve the config directory.
 *
 * Order:
 *   1. `OTRANSLATOR_CONFIG_DIR` (escape hatch — used by tests)
 *   2. `$XDG_CONFIG_HOME/otranslator-cli` if set
 *   3. `%APPDATA%\otranslator-cli` on Windows
 *   4. `$HOME/.config/otranslator-cli` everywhere else
 */
export function configDir(): string {
  if (process.env.OTRANSLATOR_CONFIG_DIR) return process.env.OTRANSLATOR_CONFIG_DIR;
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, 'otranslator-cli');
  if (process.platform === 'win32' && process.env.APPDATA) {
    return join(process.env.APPDATA, 'otranslator-cli');
  }
  return join(homedir(), '.config', 'otranslator-cli');
}

export function configPath(): string {
  return join(configDir(), CONFIG_FILE);
}

/** Read the stored API key. Synchronous because every command needs it before doing anything. */
export function getStoredApiKey(): string | undefined {
  try {
    const raw = readFileSync(configPath(), 'utf-8');
    const config = JSON.parse(raw) as StoredConfig;
    return config.apiKey;
  } catch {
    return undefined;
  }
}

/** Write `{ apiKey }` to the config file with directory 0700 / file 0600 perms. */
export async function writeStoredConfig(config: StoredConfig): Promise<void> {
  const dir = configDir();
  await mkdir(dir, { recursive: true, mode: DIR_MODE });
  await writeFile(configPath(), JSON.stringify(config, null, 2) + '\n', { mode: FILE_MODE });
  // Re-chmod in case the file already existed with different perms.
  await chmod(configPath(), FILE_MODE);
}

/** Remove the config file. Returns `true` if a file was deleted, `false` if it was already absent. */
export async function deleteStoredConfig(): Promise<boolean> {
  try {
    await unlink(configPath());
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}
