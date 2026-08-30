/** Deterministic helpers shared by prescription families. */

import type { Prescription } from "../domain/types";

/**
 * Small synchronous hash used to keep raw Finding IDs out of public
 * Prescription IDs. This is an identifier hash, not a security primitive.
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

export function prescriptionId(
  kind: Prescription["kind"],
  sessionId: string,
  taskId: string,
  findingIds: readonly string[],
  discriminator?: string
): string {
  return `prescription-${stableHash(
    [kind, sessionId, taskId, discriminator ?? "", ...findingIds].join("\u001f")
  )}`;
}
