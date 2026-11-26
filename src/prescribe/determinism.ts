/** Deterministic helpers shared by prescription families. */

import { stableHash } from "../domain/hash";
import type { Prescription } from "../domain/types";

export { stableHash };

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
