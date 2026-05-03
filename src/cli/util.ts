import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { OTranslatorClient } from '../client.js';
import { OTranslatorError } from '../errors.js';
import { getStoredApiKey } from './config-store.js';

export interface GlobalOptions {
  apiKey?: string;
  baseUrl?: string;
  timeout?: string;
}

export const EXIT_SUCCESS = 0;
export const EXIT_RUNTIME_ERROR = 1;
export const EXIT_CONFIG_ERROR = 2;

/**
 * Build a client from CLI flags + env.
 *
 * `--api-key`/`OTRANSLATOR_API_KEY`, `--base-url`/`OTRANSLATOR_BASE_URL`,
 * `--timeout` (ms) / `OTRANSLATOR_TIMEOUT_MS`.
 */
export function buildClient(opts: GlobalOptions): OTranslatorClient {
  const client = tryBuildClient(opts);
  if (!client) {
    fail('Missing API key. Pass --api-key or set OTRANSLATOR_API_KEY.', EXIT_CONFIG_ERROR);
  }
  return client;
}

/**
 * Like `buildClient`, but returns `null` instead of exiting when the API key
 * is missing. Used by commands that should still produce useful output when
 * the user hasn't authenticated yet (e.g. `examples`).
 */
export function tryBuildClient(opts: GlobalOptions): OTranslatorClient | null {
  const { apiKey } = resolveApiKey(opts);
  if (!apiKey) return null;
  const baseUrl = opts.baseUrl ?? process.env.OTRANSLATOR_BASE_URL;
  const timeoutRaw = opts.timeout ?? process.env.OTRANSLATOR_TIMEOUT_MS;
  const timeoutMs = timeoutRaw !== undefined ? Number(timeoutRaw) : undefined;
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    fail(`Invalid timeout: ${timeoutRaw}`, EXIT_CONFIG_ERROR);
  }
  return new OTranslatorClient({
    apiKey,
    ...(baseUrl ? { baseUrl } : {}),
    ...(timeoutMs ? { timeoutMs } : {}),
  });
}

export type ApiKeySource = 'flag' | 'env' | 'config' | 'none';

/**
 * Resolve the API key in precedence order:
 *   1. `--api-key` flag
 *   2. `OTRANSLATOR_API_KEY` environment variable
 *   3. `~/.config/otranslator-cli/config.json` (written by `otcli login`)
 *
 * Returns the source so commands like `whoami` can show where the key came from.
 */
export function resolveApiKey(opts: GlobalOptions): { apiKey?: string; source: ApiKeySource } {
  if (opts.apiKey) return { apiKey: opts.apiKey, source: 'flag' };
  if (process.env.OTRANSLATOR_API_KEY) {
    return { apiKey: process.env.OTRANSLATOR_API_KEY, source: 'env' };
  }
  const stored = getStoredApiKey();
  if (stored) return { apiKey: stored, source: 'config' };
  return { source: 'none' };
}

/** Print a JSON value and exit 0. */
export function output(value: unknown): never {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
  process.exit(EXIT_SUCCESS);
}

/** Wrap an async handler so SDK errors map to clean CLI exits. */
export function run(handler: () => Promise<unknown>): void {
  handler().catch((err: unknown) => {
    if (err instanceof OTranslatorError) {
      const detail = {
        error: err.message,
        code: err.code,
        ...(err.status !== undefined ? { status: err.status } : {}),
        ...(err.data !== undefined ? { data: err.data } : {}),
      };
      process.stderr.write(JSON.stringify(detail, null, 2) + '\n');
    } else if (err instanceof Error) {
      process.stderr.write(`Error: ${err.message}\n`);
    } else {
      process.stderr.write(`Unknown error: ${String(err)}\n`);
    }
    process.exit(EXIT_RUNTIME_ERROR);
  });
}

function fail(message: string, code: number): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

/** Read a file from disk into a `File` suitable for `createTask({ file })`. */
export async function fileFromPath(path: string): Promise<File> {
  const buffer = await readFile(path);
  return new File([buffer], basename(path));
}

/** Parse a JSON string from a CLI option, with a friendly error. */
export function parseJson<T = unknown>(name: string, raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    fail(`--${name} must be valid JSON: ${(err as Error).message}`, EXIT_CONFIG_ERROR);
  }
}
