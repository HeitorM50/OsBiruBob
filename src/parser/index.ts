/**
 * Parser — Hindsight (stub)
 *
 * Responsibility: receive raw export bytes and return a validated Session or
 * a ParseError. Treats input as untrusted.
 *
 * Implemented in F2 (#5–#9). Do not add parsing logic here before those issues.
 *
 * Allowed imports: src/domain/types.ts only.
 * Forbidden imports: observe, diagnose, prescribe, compare, CLI/UI.
 */

export interface ParseError {
  message: string;
  path?: string;
  received?: unknown;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: ParseError };

// F2 implementation goes here.
