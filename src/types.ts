/**
 * Type definitions for the OTranslator API.
 *
 * Hand-written to mirror https://otranslator.com/en/developer (v1) and verified
 * against live API responses for every endpoint we exercise in `test/e2e/`.
 */

export type TaskStatus = 'Waiting' | 'Processing' | 'Completed' | 'Terminated' | 'Cancelled';

// ---------------------------------------------------------------------------
// Translation tasks
// ---------------------------------------------------------------------------

export interface CreateTaskInput {
  /** File to translate. Use a `File` (Node 20+ / browser) or a `Blob`. */
  file: Blob;
  /** Override the filename sent to the API. Defaults to `file.name` when present. */
  filename?: string;
  /** Source language. Use one of the values returned by `languages()`. */
  fromLang: string;
  /** Target language. Must differ from `fromLang`. */
  toLang: string;
  /** AI translation model — see `models()`. Optional. */
  model?: string;
  /** Background context to improve translation quality. */
  fileDescription?: string;
  /** Glossary name (created via `createGlossary`). */
  glossary?: string;
  /**
   * Generate a preview only. The preview translates ~the first 2,000 words and
   * is normally free — every account gets a pool of free preview credits good
   * for 8–10 documents, which is restored whenever you complete a full
   * translation. If that pool is exhausted, the docs say a preview costs 2
   * credits. Default: `false`.
   */
  preview?: boolean;
  /** Translate images embedded in PDF/DOCX/PPTX/EPUB/ODS/ODT/ODF. Default: `false`. */
  shouldTranslateImage?: boolean;
  /** Translate the file name itself. Default: `true`. */
  shouldTranslateFileName?: boolean;
  /** Password for encrypted PDFs. */
  password?: string;
  ignoreComments?: boolean;
  /** Ignore PPTX speaker notes. */
  ignoreNotes?: boolean;
  /** Ignore DOCX headers/footers. */
  ignoreHeadersAndFooters?: boolean;
  /** Ignore hidden PPTX slides. */
  ignoreHidden?: boolean;
  /** Ignore PPTX master slide text. */
  ignoreMasters?: boolean;
  /** Skip translating XLSX sheet names. */
  ignoreSheetNames?: boolean;
  /** Only translate content matching this regex (txmsg only). */
  extractTextRegExpPattern?: string;
  /** Flags for `extractTextRegExpPattern`. */
  extractTextRegExpFlags?: string;
  /** Webhook URL — receives `{ taskId, progress, status }` on updates. */
  webhookUrl?: string;
}

export interface CreateTaskResponse {
  taskId: string;
}

export interface TranslationTask {
  taskId: string;
  /** Model the server actually used. May fall back to an internal default
   *  (e.g. `gpt-4.1-mini`) when no `model` is specified on `createTask`. */
  model?: string;
  fromLang?: string;
  toLang?: string;
  status?: TaskStatus;
  /** Progress percentage, 0–100. */
  progress?: number;
  /** Error message when `status` is `Terminated`. `null` on a healthy task. */
  errorMsg?: string | null;
  /** Display title (typically the original filename). */
  fileTitle?: string;
  /** Pre-signed URL to the original uploaded file. */
  fileUrl?: string;
  /** Pre-signed URL to the translated file. */
  translatedFileUrl?: string;
  /**
   * Pre-signed URL to a bilingual side-by-side rendering. Only emitted for
   * PDF/DOCX/PPTX/XLSX/EPUB/CSV/SRT/TXT/HTML/ODF; skipped for very large files
   * or on translation errors.
   */
  translatedBilingualFileUrl?: string;
  /** Token count for translatable text. PDF image translation = 1,200 tokens/page. */
  tokenCount?: number;
  /** Word count of the source document. */
  wordNums?: number;
  /** Total credits required to convert a preview into a full translation. */
  price?: number;
  /** Credits actually consumed so far (preview costs 2 credits). */
  usedCredits?: number;
  glossary?: string[];
  shouldTranslateImage?: boolean;
  /** Whether OCR was forced for the document. */
  forceOCR?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface RestartTaskInput {
  taskId: string;
  /** Pay credits to translate an unpaid (preview-only) document. */
  payWithCredits?: boolean;
  /** Model used for the paid full translation, when `payWithCredits` is true. */
  model?: string;
}

export interface SuccessResponse {
  success: boolean;
}

export interface QueryTextsResponse {
  taskId: string;
  /**
   * Mapping of source text segment to its current translation. The system
   * extracts these segments at translation time. Special internal keys (e.g.
   * `##EXTRACT_TERMS_KEY##`) may also appear — keep them around if you intend
   * to round-trip via `updateTexts`.
   */
  texts: Record<string, string>;
  /** Mapping of source text segment to a user-supplied revision, if any. */
  revisedTexts: Record<string, string>;
}

export interface ReviseTranslationInput {
  taskId: string;
  /**
   * Mapping of source text segment to revised translation. Use the source
   * strings returned by `queryTexts` as keys. The official examples send this
   * as a JSON-encoded string; the client accepts either form and encodes a
   * plain object for you.
   */
  revisedTexts: Record<string, string> | string;
}

// ---------------------------------------------------------------------------
// Synchronous text translation
// ---------------------------------------------------------------------------

export interface TranslateTextsInput {
  texts: string[];
  fromLang: string;
  toLang: string;
  model?: string;
  fileDescription?: string;
}

export interface TranslateTextsResponse {
  taskId?: string;
  translatedTexts: string[];
  price?: number;
  usedCredits?: number;
}

// ---------------------------------------------------------------------------
// Glossaries
// ---------------------------------------------------------------------------

export interface CreateGlossaryInput {
  name: string;
  desc?: string;
  /** Target language this glossary applies to. */
  targetLang: string;
  /**
   * Source terminology list. Sent as a native array on the wire — do not
   * pre-encode as a JSON string (the official API examples are misleading on
   * this point; an encoded string corrupts the web UI editor).
   */
  keys: string[];
  /** Term-to-translation mapping. Sent as a native object on the wire. */
  translated: Record<string, string>;
}

export interface CreateGlossaryResponse {
  glossaryId: string;
}

export interface UpdateGlossaryInput {
  glossaryId: string;
  name?: string;
  desc?: string;
  targetLang?: string;
  keys?: string[];
  translated?: Record<string, string>;
}

export interface Glossary {
  glossaryId: string;
  name?: string;
  desc?: string;
  targetLang?: string;
  keys?: string[];
  translated?: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Metadata + account
// ---------------------------------------------------------------------------

export interface FileTypesResponse {
  types: string[];
}

export interface LanguagesResponse {
  languages: string[];
}

export interface ModelsResponse {
  /**
   * Model identifiers. Verified against the live API on 2026-05-03 — currently
   * includes `gpt-5-mini`, `gpt-5.4`, `gpt-5.4-thinking`, `claude-4.5-haiku`,
   * `claude-4.6-sonnet`, `claude-4.6-sonnet-thinking`, `gemini-3.1-flash`,
   * `gemini-3.1-pro`, `gemini-3.1-thinking`, `deepseek-3.2`, `deepseek-3.2-thinking`.
   */
  models: string[];
}

export interface AccountResponse {
  /** Remaining credit balance. */
  balance: number;
}

// ---------------------------------------------------------------------------
// Client config
// ---------------------------------------------------------------------------

export interface OTranslatorClientOptions {
  /** Secret key issued by OTranslator. Sent as the `Authorization` header. */
  apiKey: string;
  /** Base URL. Default: `https://otranslator.com/api`. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Default: 60000. */
  timeoutMs?: number;
  /** Custom fetch implementation. Default: `globalThis.fetch`. */
  fetch?: typeof globalThis.fetch;
}

// ---------------------------------------------------------------------------
// SDK helpers (composed on top of the raw 15 endpoints)
// ---------------------------------------------------------------------------

export interface WaitForTaskOptions {
  /** How long to sleep between polls. Default: 5000. */
  intervalMs?: number;
  /** Total time budget. Default: 240000. */
  maxMs?: number;
}

export interface DownloadOptions {
  /** Download the bilingual side-by-side rendering instead of the translated file. */
  bilingual?: boolean;
}

export interface DownloadResult {
  /** File contents. Returned as a `Blob` so it works in browsers and Node alike. */
  blob: Blob;
  /**
   * Suggested filename derived from the task: `task.fileTitle` for the
   * translated file, or `<basename>.bilingual.<ext>` when `bilingual` was
   * requested.
   */
  filename: string;
  /** Value of the response's `Content-Type` header, when the storage bucket sets it. */
  contentType: string | null;
  /** The task object the URL came from — handy for logging. */
  task: TranslationTask;
}
