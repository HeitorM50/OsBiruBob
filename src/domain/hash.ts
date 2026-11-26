/**
 * Browser-safe deterministic hashing helpers for domain identifiers.
 *
 * Pure function with no Node APIs. Used by diagnose and prescribe so raw file
 * paths or finding IDs never appear in public identifiers. This is an
 * identifier hash, not a cryptographic primitive.
 */

export function stableHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }

  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}
