import { describe, expect, it } from "vitest";
import { stableHash } from "./hash";
import { stableHash as reexportedStableHash } from "../prescribe/determinism";

describe("stableHash", () => {
  it("always returns a 16-character lowercase hex string across input shapes", () => {
    const samples = [
      "",
      "a",
      "src/index.ts",
      "/home/user/project/src/secret.ts",
      "unicode-café-日本語",
      "x".repeat(4096),
    ];

    for (const input of samples) {
      expect(stableHash(input)).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it("is deterministic for identical inputs", () => {
    const input = "prescription\u001fsession-1\u001ftask-1";
    expect(stableHash(input)).toBe(stableHash(input));
  });

  it("produces distinct digests for distinct inputs, including single-character variations", () => {
    const inputs = [
      "",
      "a",
      "b",
      "ab",
      "ba",
      "src/auth.ts",
      "src/auth.tsx",
      "src/billing.ts",
      "ab|c",
      "a|bc",
    ];

    const digests = inputs.map((input) => stableHash(input));
    expect(new Set(digests).size).toBe(inputs.length);
  });

  it("is re-exported identically from src/prescribe/determinism.ts", () => {
    expect(reexportedStableHash).toBe(stableHash);
    expect(reexportedStableHash("example-input")).toBe(
      stableHash("example-input")
    );
  });
});
