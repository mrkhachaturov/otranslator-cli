/**
 * Base error thrown by the OTranslator client.
 *
 * `code` distinguishes failure modes that callers may want to handle differently
 * (e.g. retry network errors, surface API errors to users).
 */
export type OTranslatorErrorCode =
  | 'MISSING_API_KEY'
  | 'INVALID_INPUT'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE';

export interface OTranslatorErrorOptions {
  code: OTranslatorErrorCode;
  status?: number;
  data?: unknown;
  cause?: unknown;
}

export class OTranslatorError extends Error {
  readonly code: OTranslatorErrorCode;
  readonly status?: number;
  readonly data?: unknown;

  constructor(message: string, options: OTranslatorErrorOptions) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'OTranslatorError';
    this.code = options.code;
    if (options.status !== undefined) this.status = options.status;
    if (options.data !== undefined) this.data = options.data;
  }
}
