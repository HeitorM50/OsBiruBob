/**
 * Catalog loader — Hindsight
 *
 * Loads the curated recommendation catalogs from `data/` as static JSON imports.
 * Both catalogs are bundled at build time and require no network access.
 *
 * Rules (from docs/architecture.md "Catálogos de recomendação"):
 * - Trusted, versioned input — not detector logic.
 * - Static imports: synchronous, offline, bundler-safe.
 * - Adding a catalog entry requires no TypeScript changes.
 * - Missing or invalid catalogs degrade gracefully — consumers record the reason.
 * - Unknown tools are visible under group "outros", never omitted.
 * - No Node APIs (fs, path, process) — browser-safe module.
 */

import type { McpCatalogEntry, ToolCatalogEntry } from "../domain/types";

// Static JSON imports — resolved at build time, offline-safe, no fs/network.
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
import rawMcpCatalog from "../../data/mcp-catalog.json";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
import rawToolCatalog from "../../data/tool-catalog.json";

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(isNonEmptyString);
}

function isValidMcpEntry(entry: unknown): entry is McpCatalogEntry {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    return false;
  }
  const e = entry as Record<string, unknown>;
  return (
    isNonEmptyString(e.id) &&
    isNonEmptyString(e.label) &&
    isStringArray(e.binaries) &&
    typeof e.matchesHttp === "boolean" &&
    isNonEmptyString(e.replaces) &&
    isNonEmptyString(e.rationale) &&
    (e.docsUrl === undefined || isNonEmptyString(e.docsUrl)) &&
    (e.minHits === undefined ||
      (typeof e.minHits === "number" &&
        Number.isInteger(e.minHits) &&
        e.minHits > 0))
  );
}

function isValidToolEntry(entry: unknown): entry is ToolCatalogEntry {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    return false;
  }
  const e = entry as Record<string, unknown>;
  return (
    isNonEmptyString(e.name) &&
    isNonEmptyString(e.group) &&
    isNonEmptyString(e.purpose) &&
    (e.essential === undefined || typeof e.essential === "boolean")
  );
}

// ---------------------------------------------------------------------------
// Load result types
// ---------------------------------------------------------------------------

export type CatalogLoadResult<T> =
  | { ok: true; entries: T[] }
  | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// MCP catalog
// ---------------------------------------------------------------------------

/** Reason strings exposed so tests and consumers can assert on them. */
export const MCP_CATALOG_ABSENT = "catalog: data/mcp-catalog.json absent";
export const MCP_CATALOG_INVALID = "catalog: data/mcp-catalog.json invalid";

/**
 * Returns the validated MCP catalog entries.
 * Degrades gracefully: returns `ok: false` with a reason rather than throwing.
 */
export function loadMcpCatalog(
  ...override: [] | [unknown]
): CatalogLoadResult<McpCatalogEntry> {
  const raw: unknown = override.length === 0 ? rawMcpCatalog : override[0];

  if (raw === undefined || raw === null) {
    return { ok: false, reason: MCP_CATALOG_ABSENT };
  }

  if (!Array.isArray(raw)) {
    return { ok: false, reason: MCP_CATALOG_INVALID };
  }

  const ids = new Set<string>();
  for (const entry of raw) {
    if (!isValidMcpEntry(entry) || ids.has((entry as McpCatalogEntry).id)) {
      return { ok: false, reason: MCP_CATALOG_INVALID };
    }
    ids.add((entry as McpCatalogEntry).id);
  }

  return { ok: true, entries: raw as McpCatalogEntry[] };
}

// ---------------------------------------------------------------------------
// Tool catalog
// ---------------------------------------------------------------------------

/** Reason strings exposed so tests and consumers can assert on them. */
export const TOOL_CATALOG_ABSENT = "catalog: data/tool-catalog.json absent";
export const TOOL_CATALOG_INVALID = "catalog: data/tool-catalog.json invalid";

/** Fallback group for tools not listed in the catalog (Model 10 rule). */
export const UNKNOWN_TOOL_GROUP = "outros";

/**
 * Returns the validated tool catalog entries.
 * Degrades gracefully: returns `ok: false` with a reason rather than throwing.
 */
export function loadToolCatalog(
  ...override: [] | [unknown]
): CatalogLoadResult<ToolCatalogEntry> {
  const raw: unknown = override.length === 0 ? rawToolCatalog : override[0];

  if (raw === undefined || raw === null) {
    return { ok: false, reason: TOOL_CATALOG_ABSENT };
  }

  if (!Array.isArray(raw)) {
    return { ok: false, reason: TOOL_CATALOG_INVALID };
  }

  const names = new Set<string>();
  for (const entry of raw) {
    if (
      !isValidToolEntry(entry) ||
      names.has((entry as ToolCatalogEntry).name)
    ) {
      return { ok: false, reason: TOOL_CATALOG_INVALID };
    }
    names.add((entry as ToolCatalogEntry).name);
  }

  return { ok: true, entries: raw as ToolCatalogEntry[] };
}

/**
 * Resolves the group for a tool name.
 * Falls back to UNKNOWN_TOOL_GROUP when the tool is not in the catalog.
 * Never omits a tool — unknown tools are still visible, just grouped as "outros".
 */
export function resolveToolGroup(
  toolName: string,
  catalog: readonly ToolCatalogEntry[]
): string {
  const entry = catalog.find((e) => e.name === toolName);
  return entry?.group ?? UNKNOWN_TOOL_GROUP;
}
