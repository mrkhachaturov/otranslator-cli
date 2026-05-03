import { OTranslatorError } from './errors.js';
import type {
  AccountResponse,
  CreateGlossaryInput,
  CreateGlossaryResponse,
  CreateTaskInput,
  CreateTaskResponse,
  DownloadOptions,
  DownloadResult,
  FileTypesResponse,
  Glossary,
  LanguagesResponse,
  ModelsResponse,
  OTranslatorClientOptions,
  QueryTextsResponse,
  RestartTaskInput,
  ReviseTranslationInput,
  SuccessResponse,
  TaskStatus,
  TranslateTextsInput,
  TranslateTextsResponse,
  TranslationTask,
  UpdateGlossaryInput,
  WaitForTaskOptions,
} from './types.js';

const TERMINAL_STATUSES: readonly TaskStatus[] = ['Completed', 'Terminated', 'Cancelled'];

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const DEFAULT_BASE_URL = 'https://otranslator.com/api';
const DEFAULT_TIMEOUT_MS = 60_000;

interface RequestOptions {
  multipart?: boolean;
  signal?: AbortSignal;
}

/**
 * Hand-written client for the OTranslator API (v1).
 *
 * Every method maps 1:1 to a documented endpoint. The client uses the global
 * `fetch`, `FormData`, and `Blob`/`File` — it works in Node 20+ and modern
 * browsers without polyfills.
 *
 * @example
 * ```ts
 * import { OTranslatorClient } from 'otranslator-cli';
 *
 * const client = new OTranslatorClient({ apiKey: process.env.OTRANSLATOR_API_KEY! });
 * const langs = await client.languages();
 * ```
 */
export class OTranslatorClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: OTranslatorClientOptions) {
    if (!options?.apiKey) {
      throw new OTranslatorError('apiKey is required', { code: 'MISSING_API_KEY' });
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const f = options.fetch ?? globalThis.fetch;
    if (!f) {
      throw new OTranslatorError(
        'No fetch implementation found. Pass `fetch` in the client options or upgrade to Node 20+.',
        { code: 'INVALID_INPUT' },
      );
    }
    this.fetchImpl = f.bind(globalThis);
  }

  // -------------------------------------------------------------------------
  // Translation tasks
  // -------------------------------------------------------------------------

  /**
   * Create a new document translation task.
   * Endpoint: `POST /v1/translation/create`
   */
  async createTask(input: CreateTaskInput): Promise<CreateTaskResponse> {
    if (!input?.file) {
      throw new OTranslatorError('file is required', { code: 'INVALID_INPUT' });
    }
    if (!input.fromLang || !input.toLang) {
      throw new OTranslatorError('fromLang and toLang are required', { code: 'INVALID_INPUT' });
    }
    if (input.fromLang === input.toLang) {
      throw new OTranslatorError('fromLang and toLang must differ', { code: 'INVALID_INPUT' });
    }

    const form = new FormData();
    const filename = input.filename ?? (input.file as File).name ?? 'upload';
    form.append('file', input.file, filename);
    form.append('fromLang', input.fromLang);
    form.append('toLang', input.toLang);

    const optional: Array<keyof CreateTaskInput> = [
      'model',
      'fileDescription',
      'glossary',
      'preview',
      'shouldTranslateImage',
      'shouldTranslateFileName',
      'password',
      'ignoreComments',
      'ignoreNotes',
      'ignoreHeadersAndFooters',
      'ignoreHidden',
      'ignoreMasters',
      'ignoreSheetNames',
      'extractTextRegExpPattern',
      'extractTextRegExpFlags',
      'webhookUrl',
    ];
    for (const key of optional) {
      const value = input[key];
      if (value === undefined || value === null) continue;
      form.append(key, String(value));
    }

    return this.request<CreateTaskResponse>('/v1/translation/create', form, { multipart: true });
  }

  /**
   * Query the status, progress, and result URLs of a translation task.
   * Endpoint: `POST /v1/translation/query`
   */
  async queryTask(taskId: string): Promise<TranslationTask> {
    requireString('taskId', taskId);
    return this.request<TranslationTask>('/v1/translation/query', { taskId });
  }

  /**
   * Delete a translation task.
   * Endpoint: `POST /v1/translation/delete`
   */
  async deleteTask(taskId: string): Promise<SuccessResponse> {
    requireString('taskId', taskId);
    return this.request<SuccessResponse>('/v1/translation/delete', { taskId });
  }

  /**
   * Restart a terminated task or pay credits to convert a preview into a full
   * translation.
   * Endpoint: `POST /v1/translation/start`
   */
  async restartTask(input: RestartTaskInput): Promise<SuccessResponse> {
    requireString('taskId', input?.taskId);
    return this.request<SuccessResponse>('/v1/translation/start', {
      taskId: input.taskId,
      ...(input.payWithCredits !== undefined ? { payWithCredits: input.payWithCredits } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
    });
  }

  /**
   * Retrieve the system-extracted source/translation text pairs.
   * Endpoint: `POST /v1/translation/queryTexts`
   */
  async queryTexts(taskId: string): Promise<QueryTextsResponse> {
    requireString('taskId', taskId);
    return this.request<QueryTextsResponse>('/v1/translation/queryTexts', { taskId });
  }

  /**
   * Submit revised translations for specific text segments.
   * Endpoint: `POST /v1/translation/updateTexts`
   *
   * The official examples send `revisedTexts` as a JSON-encoded string; this
   * client accepts a plain object and encodes for you, or a pre-encoded string
   * if you prefer.
   */
  async updateTexts(input: ReviseTranslationInput): Promise<SuccessResponse> {
    requireString('taskId', input?.taskId);
    if (input.revisedTexts === undefined || input.revisedTexts === null) {
      throw new OTranslatorError('revisedTexts is required', { code: 'INVALID_INPUT' });
    }
    const revisedTexts =
      typeof input.revisedTexts === 'string'
        ? input.revisedTexts
        : JSON.stringify(input.revisedTexts);
    return this.request<SuccessResponse>('/v1/translation/updateTexts', {
      taskId: input.taskId,
      revisedTexts,
    });
  }

  // -------------------------------------------------------------------------
  // Synchronous text translation
  // -------------------------------------------------------------------------

  /**
   * Translate plain strings synchronously.
   * Endpoint: `POST /v1/translation/translateTexts`
   */
  async translateTexts(input: TranslateTextsInput): Promise<TranslateTextsResponse> {
    if (!Array.isArray(input?.texts) || input.texts.length === 0) {
      throw new OTranslatorError('texts must be a non-empty array', { code: 'INVALID_INPUT' });
    }
    requireString('fromLang', input.fromLang);
    requireString('toLang', input.toLang);
    if (input.fromLang === input.toLang) {
      throw new OTranslatorError('fromLang and toLang must differ', { code: 'INVALID_INPUT' });
    }
    return this.request<TranslateTextsResponse>('/v1/translation/translateTexts', {
      texts: input.texts,
      fromLang: input.fromLang,
      toLang: input.toLang,
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(input.fileDescription !== undefined ? { fileDescription: input.fileDescription } : {}),
    });
  }

  // -------------------------------------------------------------------------
  // Glossaries
  // -------------------------------------------------------------------------

  /**
   * Create a new glossary.
   * Endpoint: `POST /v1/glossary/create`
   *
   * `keys` and `translated` are sent as JSON-encoded strings, matching the
   * official examples.
   */
  async createGlossary(input: CreateGlossaryInput): Promise<CreateGlossaryResponse> {
    requireString('name', input?.name);
    requireString('targetLang', input?.targetLang);
    if (!Array.isArray(input?.keys)) {
      throw new OTranslatorError('keys must be an array of strings', { code: 'INVALID_INPUT' });
    }
    if (!input?.translated || typeof input.translated !== 'object') {
      throw new OTranslatorError('translated must be an object', { code: 'INVALID_INPUT' });
    }
    return this.request<CreateGlossaryResponse>('/v1/glossary/create', {
      name: input.name,
      ...(input.desc !== undefined ? { desc: input.desc } : {}),
      targetLang: input.targetLang,
      keys: JSON.stringify(input.keys),
      translated: JSON.stringify(input.translated),
    });
  }

  /**
   * Retrieve glossary details by ID.
   * Endpoint: `POST /v1/glossary/query`
   *
   * The API returns `keys` and `translated` as JSON-encoded strings; this
   * client parses them before returning so consumers see native types.
   */
  async queryGlossary(glossaryId: string): Promise<Glossary> {
    requireString('glossaryId', glossaryId);
    const raw = await this.request<Record<string, unknown>>('/v1/glossary/query', { glossaryId });
    return decodeGlossary(raw);
  }

  /**
   * Update glossary metadata or terminology.
   * Endpoint: `POST /v1/glossary/update`
   */
  async updateGlossary(input: UpdateGlossaryInput): Promise<Glossary> {
    requireString('glossaryId', input?.glossaryId);
    const body: Record<string, unknown> = { glossaryId: input.glossaryId };
    if (input.name !== undefined) body.name = input.name;
    if (input.desc !== undefined) body.desc = input.desc;
    if (input.targetLang !== undefined) body.targetLang = input.targetLang;
    if (input.keys !== undefined) body.keys = JSON.stringify(input.keys);
    if (input.translated !== undefined) body.translated = JSON.stringify(input.translated);
    const raw = await this.request<Record<string, unknown>>('/v1/glossary/update', body);
    return decodeGlossary(raw);
  }

  /**
   * Delete a glossary by ID.
   * Endpoint: `POST /v1/glossary/delete`
   */
  async deleteGlossary(glossaryId: string): Promise<SuccessResponse> {
    requireString('glossaryId', glossaryId);
    return this.request<SuccessResponse>('/v1/glossary/delete', { glossaryId });
  }

  // -------------------------------------------------------------------------
  // Metadata + account
  // -------------------------------------------------------------------------

  /** Endpoint: `POST /v1/filetypes` */
  async filetypes(): Promise<FileTypesResponse> {
    return this.request<FileTypesResponse>('/v1/filetypes', {});
  }

  /** Endpoint: `POST /v1/languages` */
  async languages(): Promise<LanguagesResponse> {
    return this.request<LanguagesResponse>('/v1/languages', {});
  }

  /** Endpoint: `POST /v1/models` */
  async models(): Promise<ModelsResponse> {
    return this.request<ModelsResponse>('/v1/models', {});
  }

  /** Endpoint: `POST /v1/me` */
  async me(): Promise<AccountResponse> {
    return this.request<AccountResponse>('/v1/me', {});
  }

  // -------------------------------------------------------------------------
  // Composed helpers (built on top of the raw endpoints)
  // -------------------------------------------------------------------------

  /**
   * Poll `queryTask` until the task reaches a terminal status (`Completed`,
   * `Terminated`, or `Cancelled`).
   *
   * @throws `OTranslatorError` with `code: 'TIMEOUT'` if `maxMs` elapses first.
   */
  async waitForTask(taskId: string, options: WaitForTaskOptions = {}): Promise<TranslationTask> {
    requireString('taskId', taskId);
    const intervalMs = options.intervalMs ?? 5_000;
    const maxMs = options.maxMs ?? 240_000;
    const start = Date.now();
    let last: TranslationTask | undefined;
    while (Date.now() - start < maxMs) {
      last = await this.queryTask(taskId);
      if (last.status && TERMINAL_STATUSES.includes(last.status)) return last;
      await sleep(intervalMs);
    }
    throw new OTranslatorError(
      `Task ${taskId} did not reach a terminal state within ${maxMs}ms (last status: ${last?.status ?? 'unknown'})`,
      { code: 'TIMEOUT', data: last },
    );
  }

  /**
   * Download the translated file for a `Completed` task.
   *
   * Queries the task, then fetches the pre-signed Google Cloud Storage URL
   * exposed via `task.translatedFileUrl` (or `translatedBilingualFileUrl` when
   * `bilingual: true`). Returns the raw `Blob`, a suggested filename derived
   * from `task.fileTitle`, and the response's content type.
   *
   * @throws `OTranslatorError` with `code: 'INVALID_INPUT'` if the task is not
   *         `Completed`, or `code: 'INVALID_RESPONSE'` if the URL is missing
   *         (e.g. requesting `bilingual` for an unsupported format).
   */
  async downloadTranslated(taskId: string, options: DownloadOptions = {}): Promise<DownloadResult> {
    requireString('taskId', taskId);
    const task = await this.queryTask(taskId);
    if (task.status !== 'Completed') {
      throw new OTranslatorError(
        `Task ${taskId} is not Completed (status: ${task.status ?? 'unknown'})`,
        { code: 'INVALID_INPUT', data: task },
      );
    }
    const url = options.bilingual ? task.translatedBilingualFileUrl : task.translatedFileUrl;
    if (!url) {
      throw new OTranslatorError(
        options.bilingual
          ? `translatedBilingualFileUrl missing — bilingual rendering is not available for this task's format`
          : `translatedFileUrl missing on a Completed task — this should not happen`,
        { code: 'INVALID_RESPONSE', data: task },
      );
    }

    const response = await this.fetchRaw(url);
    if (!response.ok) {
      throw new OTranslatorError(`Failed to download translated file: HTTP ${response.status}`, {
        code: 'HTTP_ERROR',
        status: response.status,
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const blob = new Blob([arrayBuffer], {
      ...(response.headers.get('content-type')
        ? { type: response.headers.get('content-type')! }
        : {}),
    });
    const contentType = response.headers.get('content-type');

    const baseName = task.fileTitle ?? taskId;
    const filename = options.bilingual ? insertSuffix(baseName, '.bilingual') : baseName;

    return { blob, filename, contentType, task };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Plain `fetch` with the configured timeout — no `Authorization` header,
   * no `baseUrl` prefix. Used to download from third-party hosts (the
   * pre-signed Google Cloud Storage URLs the API hands back).
   */
  private async fetchRaw(url: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('Request timeout')), this.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (cause) {
      const isAbort = (cause as { name?: string })?.name === 'AbortError';
      throw new OTranslatorError(
        isAbort
          ? `Download from ${url} timed out after ${this.timeoutMs}ms`
          : `Network error while downloading: ${(cause as Error).message}`,
        { code: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR', cause },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async request<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = { Authorization: this.apiKey };

    let payload: BodyInit;
    if (options.multipart) {
      payload = body as FormData;
    } else {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body ?? {});
    }

    const controller = new AbortController();
    const onAbort = () => controller.abort(options.signal?.reason);
    if (options.signal) {
      if (options.signal.aborted) controller.abort(options.signal.reason);
      else options.signal.addEventListener('abort', onAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(new Error('Request timeout')), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: payload,
        signal: controller.signal,
      });
    } catch (cause) {
      const isAbort = (cause as { name?: string })?.name === 'AbortError';
      throw new OTranslatorError(
        isAbort
          ? `Request to ${path} timed out after ${this.timeoutMs}ms`
          : `Network error: ${(cause as Error).message}`,
        { code: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR', cause },
      );
    } finally {
      clearTimeout(timer);
      if (options.signal) options.signal.removeEventListener('abort', onAbort);
    }

    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      const message =
        typeof data === 'object' &&
        data !== null &&
        'message' in data &&
        typeof (data as { message: unknown }).message === 'string'
          ? (data as { message: string }).message
          : `HTTP ${response.status} on ${path}`;
      throw new OTranslatorError(message, {
        code: 'HTTP_ERROR',
        status: response.status,
        data,
      });
    }

    if (data === null || typeof data !== 'object') {
      throw new OTranslatorError(`Unexpected non-JSON response from ${path}`, {
        code: 'INVALID_RESPONSE',
        status: response.status,
        data,
      });
    }

    return data as T;
  }
}

function requireString(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new OTranslatorError(`${name} is required`, { code: 'INVALID_INPUT' });
  }
}

/**
 * Insert a suffix before the file extension. Handles names without an
 * extension (`README` → `README.bilingual`) and dotfiles (`.env` → `.env.bilingual`).
 */
function insertSuffix(filename: string, suffix: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) return filename + suffix;
  return filename.slice(0, dot) + suffix + filename.slice(dot);
}

/**
 * Glossary responses arrive with `keys` and `translated` as JSON-encoded
 * strings. Parse them so consumers see native types. Falls back to the raw
 * value if parsing fails — better than throwing on a future server change.
 */
function decodeGlossary(raw: Record<string, unknown>): Glossary {
  const out: Glossary = {
    glossaryId: String(raw['glossaryId'] ?? ''),
  };
  if (typeof raw['name'] === 'string') out.name = raw['name'];
  if (typeof raw['desc'] === 'string') out.desc = raw['desc'];
  if (typeof raw['targetLang'] === 'string') out.targetLang = raw['targetLang'];
  if (typeof raw['createdAt'] === 'string') out.createdAt = raw['createdAt'];
  if (typeof raw['updatedAt'] === 'string') out.updatedAt = raw['updatedAt'];

  const keys = raw['keys'];
  if (Array.isArray(keys)) {
    out.keys = keys.filter((k): k is string => typeof k === 'string');
  } else if (typeof keys === 'string') {
    try {
      const parsed = JSON.parse(keys);
      if (Array.isArray(parsed))
        out.keys = parsed.filter((k): k is string => typeof k === 'string');
    } catch {
      /* leave undefined */
    }
  }

  const translated = raw['translated'];
  if (translated && typeof translated === 'object' && !Array.isArray(translated)) {
    out.translated = translated as Record<string, string>;
  } else if (typeof translated === 'string') {
    try {
      const parsed = JSON.parse(translated);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        out.translated = parsed as Record<string, string>;
      }
    } catch {
      /* leave undefined */
    }
  }

  return out;
}
