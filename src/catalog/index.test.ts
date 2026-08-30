/**
 * Tests for src/catalog/index.ts
 *
 * Covers all requirements from the issue:
 * - Both catalog files validate against Model 10 array schemas
 * - tool-catalog.json covers all 23 tools from benchmark/rodada-a.json
 * - Docker matches both baseline commands (docker build + docker run)
 * - Broken/invalid catalog input produces a handled error, no uncaught exception
 * - Unknown tool resolves to "outros"
 * - Both catalogs pass a scan for secrets, internal URLs, tokens, keys, absolute paths
 * - Loading is synchronous, static, and offline
 * - Adding a new catalog entry requires no TypeScript modification
 *
 * All fixtures are deterministic and local — no network, no API keys.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseSession } from "../parser";
import { observe } from "../observe";

// The module under test — loaded as a static import (synchronous, offline).
// If the import itself throws, the entire test file fails with a clear error.
import {
  loadMcpCatalog,
  loadToolCatalog,
  resolveToolGroup,
  UNKNOWN_TOOL_GROUP,
  MCP_CATALOG_ABSENT,
  MCP_CATALOG_INVALID,
  TOOL_CATALOG_ABSENT,
  TOOL_CATALOG_INVALID,
} from "./index";
import { detectMcpCandidates } from "../diagnose/mcp-candidate";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadBaselineReport() {
  const raw = readFileSync(
    resolve(__dirname, "../../benchmark/rodada-a.json"),
    "utf-8"
  );
  const parsed = parseSession(raw);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return observe(parsed.value);
}

const BASELINE_REPORT = loadBaselineReport();
const BASELINE_TOOLS =
  BASELINE_REPORT.tasks[0].toolInventory?.available ?? [];

/** Scan text for patterns that indicate secrets, credentials, or machine paths */
function containsSensitivePattern(text: string): boolean {
  const credentialPatterns = [
    /sk-[a-zA-Z0-9]{20,}/, // OpenAI-style secret keys
    /ghp_[a-zA-Z0-9]{20,}/, // GitHub PAT
    /ghs_[a-zA-Z0-9]{20,}/, // GitHub server token
    /AKIA[A-Z0-9]{16}/, // AWS access key prefix
    /password\s*[:=]\s*\S+/i, // password=...
    /(?:access[_-]?)?token\s*[:=]\s*\S{8,}/i, // token=...
    /api[_-]?key\s*[:=]\s*\S{8,}/i, // api_key=...
    /client[_-]?secret\s*[:=]\s*\S{8,}/i,
  ];
  if (credentialPatterns.some((pattern) => pattern.test(text))) return true;

  const urls = text.match(/https?:\/\/[^\s`"')]+/g) ?? [];
  const hasInternalUrl = urls.some((value) => {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".lan") ||
      /^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname)
    );
  });
  if (hasInternalUrl) return true;

  const textWithoutUrls = urls.reduce(
    (remaining, url) => remaining.replace(url, ""),
    text
  );
  const machinePatterns = [
    /(?<![/\w])[A-Za-z0-9+/]{40,}={0,2}(?!\w)/,
    /(^|[\s("'`])\/(?:home|Users|tmp|var|opt|workspace|mnt)\//,
    /(^|[\s("'`])[A-Za-z]:\\(?:Users|Windows|Temp)\\/,
    /(^|[\s("'`])\\\\[^\\\s]+\\/,
    /127\.0\.0\.1/,
    /192\.168\.\d+\.\d+/,
    /10\.\d+\.\d+\.\d+/,
  ];
  return machinePatterns.some((pattern) => pattern.test(textWithoutUrls));
}

// ---------------------------------------------------------------------------
// 1. MCP catalog — schema validation
// ---------------------------------------------------------------------------

describe("mcp-catalog.json — schema validation", () => {
  const result = loadMcpCatalog();

  it("loads successfully", () => {
    expect(result.ok).toBe(true);
  });

  it("returns an array of entries", () => {
    if (!result.ok) throw new Error(result.reason);
    expect(Array.isArray(result.entries)).toBe(true);
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it("every entry has required fields with correct types", () => {
    if (!result.ok) throw new Error(result.reason);
    for (const entry of result.entries) {
      expect(typeof entry.id).toBe("string");
      expect(entry.id.length).toBeGreaterThan(0);
      expect(typeof entry.label).toBe("string");
      expect(entry.label.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.binaries)).toBe(true);
      expect(typeof entry.matchesHttp).toBe("boolean");
      expect(typeof entry.replaces).toBe("string");
      expect(entry.replaces.length).toBeGreaterThan(0);
      expect(typeof entry.rationale).toBe("string");
      expect(entry.rationale.length).toBeGreaterThan(0);
    }
  });

  it("all IDs are unique", () => {
    if (!result.ok) throw new Error(result.reason);
    const ids = result.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("optional fields have correct types when present", () => {
    if (!result.ok) throw new Error(result.reason);
    for (const entry of result.entries) {
      if (entry.docsUrl !== undefined) {
        expect(typeof entry.docsUrl).toBe("string");
        expect(entry.docsUrl.length).toBeGreaterThan(0);
      }
      if (entry.minHits !== undefined) {
        expect(typeof entry.minHits).toBe("number");
        expect(Number.isInteger(entry.minHits)).toBe(true);
        expect(entry.minHits).toBeGreaterThan(0);
      }
    }
  });

  it("covers docker entry with id 'docker-mcp'", () => {
    if (!result.ok) throw new Error(result.reason);
    const docker = result.entries.find((e) => e.id === "docker-mcp");
    expect(docker).toBeDefined();
  });

  it("covers git, gh, kubectl, database, aws, npm, and http entries", () => {
    if (!result.ok) throw new Error(result.reason);
    const ids = new Set(result.entries.map((e) => e.id));
    for (const expected of [
      "git-mcp",
      "gh-mcp",
      "kubectl-mcp",
      "database-mcp",
      "aws-mcp",
      "npm-mcp",
      "http-mcp",
    ]) {
      expect(ids.has(expected), `Missing entry: ${expected}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Docker matches both baseline commands
// ---------------------------------------------------------------------------

describe("mcp-catalog.json — Docker matches baseline commands", () => {
  const result = loadMcpCatalog();

  it("docker-mcp produces a finding from both observed baseline commands", () => {
    if (!result.ok) throw new Error(result.reason);
    const diagnosis = detectMcpCandidates(BASELINE_REPORT, result.entries);
    const dockerFinding = diagnosis.findings.find(
      (finding) => finding.metric.serverId === "docker-mcp"
    );

    expect(dockerFinding).toBeDefined();
    expect(dockerFinding?.metric.hitCount).toBe(2);
    expect(dockerFinding?.evidence.externalCommands).toHaveLength(2);
  });

  it("docker-mcp includes 'docker' binary", () => {
    if (!result.ok) throw new Error(result.reason);
    const dockerEntry = result.entries.find((e) => e.id === "docker-mcp");
    expect(dockerEntry!.binaries).toContain("docker");
  });

  it("docker-mcp has minHits >= 2 to avoid single-incidental-call recommendations", () => {
    if (!result.ok) throw new Error(result.reason);
    const dockerEntry = result.entries.find((e) => e.id === "docker-mcp");
    const minHits = dockerEntry!.minHits ?? 1;
    expect(minHits).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// 3. Tool catalog — schema validation
// ---------------------------------------------------------------------------

describe("tool-catalog.json — schema validation", () => {
  const result = loadToolCatalog();

  it("loads successfully", () => {
    expect(result.ok).toBe(true);
  });

  it("returns an array of entries", () => {
    if (!result.ok) throw new Error(result.reason);
    expect(Array.isArray(result.entries)).toBe(true);
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it("every entry has required fields with correct types", () => {
    if (!result.ok) throw new Error(result.reason);
    for (const entry of result.entries) {
      expect(typeof entry.name).toBe("string");
      expect(entry.name.length).toBeGreaterThan(0);
      expect(typeof entry.group).toBe("string");
      expect(entry.group.length).toBeGreaterThan(0);
      expect(typeof entry.purpose).toBe("string");
      expect(entry.purpose.length).toBeGreaterThan(0);
    }
  });

  it("all tool names are unique", () => {
    if (!result.ok) throw new Error(result.reason);
    const names = result.entries.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("essential field is boolean when present", () => {
    if (!result.ok) throw new Error(result.reason);
    for (const entry of result.entries) {
      if (entry.essential !== undefined) {
        expect(typeof entry.essential).toBe("boolean");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Tool catalog covers all 23 baseline tools
// ---------------------------------------------------------------------------

describe("tool-catalog.json — covers all 23 baseline tools", () => {
  const result = loadToolCatalog();

  it("tool count is at least 23", () => {
    if (!result.ok) throw new Error(result.reason);
    expect(BASELINE_TOOLS).toHaveLength(23);
    expect(result.entries.length).toBeGreaterThanOrEqual(BASELINE_TOOLS.length);
  });

  it("contains all 23 tools from fixtures/sample-export.json availableTools", () => {
    if (!result.ok) throw new Error(result.reason);
    const catalogNames = new Set(result.entries.map((e) => e.name));
    for (const tool of BASELINE_TOOLS) {
      expect(
        catalogNames.has(tool),
        `tool-catalog.json is missing baseline tool: ${tool}`
      ).toBe(true);
    }
  });

  for (const toolName of BASELINE_TOOLS) {
    it(`covers tool "${toolName}"`, () => {
      if (!result.ok) throw new Error(result.reason);
      const entry = result.entries.find((e) => e.name === toolName);
      expect(entry).toBeDefined();
      expect(typeof entry!.group).toBe("string");
      expect(entry!.group.length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// 5. Graceful degradation for broken/invalid input
// ---------------------------------------------------------------------------

describe("catalog loader — graceful degradation for invalid input", () => {
  it("loadMcpCatalog returns ok:true for the real catalog (sanity)", () => {
    expect(loadMcpCatalog().ok).toBe(true);
  });

  it("loadToolCatalog returns ok:true for the real catalog (sanity)", () => {
    expect(loadToolCatalog().ok).toBe(true);
  });

  it("MCP_CATALOG_ABSENT constant is a non-empty string", () => {
    expect(typeof MCP_CATALOG_ABSENT).toBe("string");
    expect(MCP_CATALOG_ABSENT.length).toBeGreaterThan(0);
  });

  it("MCP_CATALOG_INVALID constant is a non-empty string", () => {
    expect(typeof MCP_CATALOG_INVALID).toBe("string");
    expect(MCP_CATALOG_INVALID.length).toBeGreaterThan(0);
  });

  it("TOOL_CATALOG_ABSENT constant is a non-empty string", () => {
    expect(typeof TOOL_CATALOG_ABSENT).toBe("string");
    expect(TOOL_CATALOG_ABSENT.length).toBeGreaterThan(0);
  });

  it("TOOL_CATALOG_INVALID constant is a non-empty string", () => {
    expect(typeof TOOL_CATALOG_INVALID).toBe("string");
    expect(TOOL_CATALOG_INVALID.length).toBeGreaterThan(0);
  });

  it("loading the module does not throw (static import succeeds)", () => {
    // The fact that this test file loaded means the static import succeeded.
    // Verify the exports are callable without throwing.
    expect(() => loadMcpCatalog()).not.toThrow();
    expect(() => loadToolCatalog()).not.toThrow();
  });

  it("returns handled absent results for missing catalog values", () => {
    expect(loadMcpCatalog(undefined)).toEqual({
      ok: false,
      reason: MCP_CATALOG_ABSENT,
    });
    expect(loadToolCatalog(null)).toEqual({
      ok: false,
      reason: TOOL_CATALOG_ABSENT,
    });
  });

  it("returns handled invalid results for malformed catalog values", () => {
    expect(() => loadMcpCatalog("{ broken json")).not.toThrow();
    expect(loadMcpCatalog("{ broken json")).toEqual({
      ok: false,
      reason: MCP_CATALOG_INVALID,
    });
    expect(loadToolCatalog([{ name: "missing-fields" }])).toEqual({
      ok: false,
      reason: TOOL_CATALOG_INVALID,
    });
  });

  it("detectMcpCandidates degrades to unavailableMetrics when catalog is null", () => {
    // Consumers of catalog data must handle ok:false without throwing
    // (tested via the mcp-candidate detector which accepts unknown catalog input)
    expect(() => detectMcpCandidates({} as never, null)).not.toThrow();
    const result = detectMcpCandidates(
      {
        sessionId: "s",
        exportedAt: 0,
        workspace: "",
        tasks: [],
        totals: {
          taskCount: 0,
          subtaskCount: 0,
          cost: 0,
          assistantTurns: 0,
          toolCalls: 0,
          erroredToolCalls: 0,
          humanInterventions: 0,
        },
        unavailableMetrics: [],
        anomalies: [],
      },
      null
    );
    expect(result.findings).toEqual([]);
    expect(result.unavailableMetrics.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Unknown tool resolves to "outros"
// ---------------------------------------------------------------------------

describe("resolveToolGroup — unknown tool fallback", () => {
  const catalogResult = loadToolCatalog();

  it("returns 'outros' for a tool not in the catalog", () => {
    if (!catalogResult.ok) throw new Error(catalogResult.reason);
    const group = resolveToolGroup("completelY_unknown_tool_xyz", catalogResult.entries);
    expect(group).toBe(UNKNOWN_TOOL_GROUP);
    expect(group).toBe("outros");
  });

  it("returns the correct group for a known tool", () => {
    if (!catalogResult.ok) throw new Error(catalogResult.reason);
    const group = resolveToolGroup("execute_command", catalogResult.entries);
    expect(group).toBe("execution");
  });

  it("returns 'outros' with an empty catalog", () => {
    const group = resolveToolGroup("execute_command", []);
    expect(group).toBe("outros");
  });

  it("does NOT return undefined for any tool — always a string", () => {
    if (!catalogResult.ok) throw new Error(catalogResult.reason);
    expect(typeof resolveToolGroup("foo_unknown", catalogResult.entries)).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// 7. Secrets scan — no credentials, keys, internal URLs, or absolute paths
// ---------------------------------------------------------------------------

describe("catalog data — secrets and sensitive content scan", () => {
  it("detects secrets, internal URLs, and machine-specific paths", () => {
    for (const unsafe of [
      "https://github.com/example/repo?token=abcdefgh12345678",
      "https://docs.example.internal/catalog",
      "Read /home/developer/private/file.json",
      "Read C:\\Users\\developer\\private.json",
    ]) {
      expect(containsSensitivePattern(unsafe), unsafe).toBe(true);
    }
  });

  it("mcp-catalog.json contains no secrets or sensitive patterns", () => {
    const abs = resolve(__dirname, "../../data/mcp-catalog.json");
    const raw = readFileSync(abs, "utf-8");
    const entries = JSON.parse(raw) as Array<Record<string, unknown>>;

    for (const entry of entries) {
      const textFields = [
        entry.id,
        entry.label,
        entry.replaces,
        entry.rationale,
        entry.docsUrl,
      ].filter((v): v is string => typeof v === "string");

      for (const text of textFields) {
        expect(
          containsSensitivePattern(text),
          `Sensitive pattern found in mcp-catalog.json field: "${text.slice(0, 80)}"`
        ).toBe(false);
      }
    }
  });

  it("tool-catalog.json contains no secrets or sensitive patterns", () => {
    const abs = resolve(__dirname, "../../data/tool-catalog.json");
    const raw = readFileSync(abs, "utf-8");
    const entries = JSON.parse(raw) as Array<Record<string, unknown>>;

    for (const entry of entries) {
      const textFields = [entry.name, entry.group, entry.purpose].filter(
        (v): v is string => typeof v === "string"
      );

      for (const text of textFields) {
        expect(
          containsSensitivePattern(text),
          `Sensitive pattern found in tool-catalog.json field: "${text.slice(0, 80)}"`
        ).toBe(false);
      }
    }
  });

  it("mcp-catalog.json binaries arrays contain no sensitive content", () => {
    const abs = resolve(__dirname, "../../data/mcp-catalog.json");
    const raw = readFileSync(abs, "utf-8");
    const entries = JSON.parse(raw) as Array<{ binaries: string[] }>;

    for (const entry of entries) {
      for (const binary of entry.binaries ?? []) {
        expect(
          containsSensitivePattern(binary),
          `Sensitive pattern found in binaries: "${binary}"`
        ).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Static, synchronous, offline loading
// ---------------------------------------------------------------------------

describe("catalog loading — static, synchronous, offline", () => {
  it("uses static JSON imports that are reachable from the CLI pipeline", () => {
    const catalogSource = readFileSync(resolve(__dirname, "./index.ts"), "utf-8");
    const diagnoseSource = readFileSync(
      resolve(__dirname, "../diagnose/index.ts"),
      "utf-8"
    );
    const cliSource = readFileSync(resolve(__dirname, "../cli.ts"), "utf-8");

    expect(catalogSource).toContain(
      'import rawMcpCatalog from "../../data/mcp-catalog.json"'
    );
    expect(catalogSource).toContain(
      'import rawToolCatalog from "../../data/tool-catalog.json"'
    );
    expect(diagnoseSource).toContain(
      'import { loadMcpCatalog, loadToolCatalog } from "../catalog"'
    );
    expect(cliSource).toContain('import { diagnose } from "./diagnose/index"');
  });

  it("loadMcpCatalog() is synchronous (returns a plain object, not a Promise)", () => {
    const result = loadMcpCatalog();
    // A Promise would have a `.then` method; a plain object won't.
    expect(typeof (result as unknown as { then?: unknown }).then).not.toBe("function");
  });

  it("loadToolCatalog() is synchronous (returns a plain object, not a Promise)", () => {
    const result = loadToolCatalog();
    expect(typeof (result as unknown as { then?: unknown }).then).not.toBe("function");
  });

  it("catalog data is available immediately without any await or callback", () => {
    // Both must be truthy synchronously at module load time
    const mcpResult = loadMcpCatalog();
    const toolResult = loadToolCatalog();
    expect(mcpResult.ok).toBe(true);
    expect(toolResult.ok).toBe(true);
  });

  it("module has no Node or network APIs (browser-safe and offline)", () => {
    // Validate by reading the source file — if any Node-only import appeared,
    // typecheck would also fail, but this makes the policy explicit.
    const abs = resolve(__dirname, "./index.ts");
    const src = readFileSync(abs, "utf-8");
    const forbidden = [
      /from\s+["'](?:node:)?(?:fs|path|os)["']/,
      /\bprocess\./,
      /\bfetch\s*\(/,
      /\bXMLHttpRequest\b/,
      /\bWebSocket\b/,
    ];
    for (const pattern of forbidden) {
      expect(src).not.toMatch(pattern);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Adding a new catalog entry requires no TypeScript modification
// ---------------------------------------------------------------------------

describe("catalog extensibility — adding an entry requires no .ts changes", () => {
  it("the JSON files are the only authoritative source — no hardcoded list in .ts", () => {
    const abs = resolve(__dirname, "./index.ts");
    const src = readFileSync(abs, "utf-8");

    // The loader must NOT hardcode any specific tool name or MCP id.
    // If it did, adding an entry would require a .ts change.
    for (const toolName of BASELINE_TOOLS) {
      // Tool names should not appear as string literals in the loader
      expect(
        src.includes(`"${toolName}"`),
        `Loader hardcodes tool name "${toolName}" — adding entries would require .ts changes`
      ).toBe(false);
    }
  });

  it("the tool groups are resolved dynamically from catalog data, not hardcoded", () => {
    const abs = resolve(__dirname, "./index.ts");
    const src = readFileSync(abs, "utf-8");

    // "code-navigation" or "execution" should not be hardcoded in the loader
    const knownGroups = [
      "code-navigation",
      "editing",
      "execution",
      "planning",
      "documentation",
      "delegation",
      "presentation",
    ];
    // The only group that may be hardcoded is UNKNOWN_TOOL_GROUP ("outros")
    for (const group of knownGroups) {
      expect(
        src.includes(`"${group}"`),
        `Loader hardcodes group "${group}" — adding entries would require .ts changes`
      ).toBe(false);
    }
  });
});
