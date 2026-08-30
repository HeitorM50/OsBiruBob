// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { readFileText } from "./file-reader";

describe("readFileText", () => {
  it("reads a local browser File without a network API", async () => {
    const file = new File(["local-only"], "session.json", { type: "application/json" });
    await expect(readFileText(file)).resolves.toBe("local-only");
  });
});
