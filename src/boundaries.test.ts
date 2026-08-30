/**
 * Boundary test: verifies that production source files respect the project's
 * architectural constraints without launching a server or spawning Vitest.
 *
 * Rules checked:
 *   1. No Node API imports (fs, path, process, os) outside src/cli.ts
 *   2. No network calls (fetch(, new XMLHttpRequest, new WebSocket)
 *   3. No unsafe HTML rendering (dangerouslySetInnerHTML, innerHTML, eval()
 *   4. No forbidden packages in package.json (HTTP clients, LLM SDKs, telemetry)
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ── helpers ────────────────────────────────────────────────────────────────

// __dirname is the src/ directory (this file lives at src/boundaries.test.ts).
// We need the repository root, which is one level up.
const ROOT = path.resolve(__dirname, "..");

function srcFiles(): string[] {
  const result: string[] = [];
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
      ) {
        result.push(full);
      }
    }
  }
  walk(path.join(ROOT, "src"));
  return result;
}

function productionFiles(): string[] {
  return srcFiles().filter(
    (f) =>
      !f.endsWith(".test.ts") &&
      !f.endsWith(".test.tsx")
  );
}

function relPath(abs: string): string {
  return path.relative(ROOT, abs);
}

// ── tests ──────────────────────────────────────────────────────────────────

describe("boundaries", () => {
  it("no Node API imports outside src/cli.ts", () => {
    const nodeApis = ["from 'fs'", 'from "fs"', "from 'path'", 'from "path"', "from 'os'", 'from "os"'];
    const processRe = /\bprocess\.(env|exit|argv|cwd|platform|stdout|stderr)\b/;
    const nodeRequireRe = /require\(['"](?:fs|path|os)['"]\)/;

    const violations: string[] = [];

    for (const f of productionFiles()) {
      const rel = relPath(f);
      if (rel === "src/cli.ts") continue;

      const content = fs.readFileSync(f, "utf8");

      for (const api of nodeApis) {
        if (content.includes(api)) {
          violations.push(`${rel}: forbidden Node import '${api}'`);
        }
      }
      if (nodeRequireRe.test(content)) {
        violations.push(`${rel}: forbidden Node require()`);
      }
      if (processRe.test(content)) {
        violations.push(`${rel}: forbidden Node process API`);
      }
    }

    expect(violations, violations.join("\n")).toHaveLength(0);
  });

  it("no network calls in production source", () => {
    const patterns = [
      "fetch(",
      "new XMLHttpRequest",
      "new WebSocket",
    ];

    const violations: string[] = [];

    for (const f of productionFiles()) {
      const rel = relPath(f);
      const content = fs.readFileSync(f, "utf8");

      for (const p of patterns) {
        if (content.includes(p)) {
          violations.push(`${rel}: forbidden network call '${p}'`);
        }
      }
    }

    expect(violations, violations.join("\n")).toHaveLength(0);
  });

  it("no unsafe HTML rendering in production source", () => {
    const patterns = [
      "dangerouslySetInnerHTML",
      "innerHTML",
      "eval(",
    ];

    const violations: string[] = [];

    for (const f of productionFiles()) {
      const rel = relPath(f);
      const content = fs.readFileSync(f, "utf8");

      for (const p of patterns) {
        if (content.includes(p)) {
          violations.push(`${rel}: forbidden unsafe rendering '${p}'`);
        }
      }
    }

    expect(violations, violations.join("\n")).toHaveLength(0);
  });

  it("no forbidden packages in package.json", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, "package.json"), "utf8")
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const allDeps = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];

    const forbiddenPatterns = [
      // LLM SDKs
      "@anthropic-ai/",
      "openai",
      "@ibm-cloud/watsonx",
      "langchain",
      // HTTP clients
      "axios",
      "node-fetch",
      "got",
      "superagent",
      "ky",
      // Telemetry / analytics
      "segment",
      "mixpanel",
      "amplitude",
      "datadog",
      "@sentry/",
      // Backend frameworks
      "express",
      "fastify",
      "next",
      "nuxt",
    ];

    const violations: string[] = [];
    for (const dep of allDeps) {
      for (const pattern of forbiddenPatterns) {
        if (dep === pattern || dep.startsWith(pattern)) {
          violations.push(`package.json: forbidden dependency '${dep}'`);
        }
      }
    }

    expect(violations, violations.join("\n")).toHaveLength(0);
  });
});
