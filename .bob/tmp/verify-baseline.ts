import { parseSession } from "../../src/parser/index.js";
import { observe } from "../../src/observe/index.js";
import { detectRedundantReads } from "../../src/diagnose/redundant-read.js";
import { readFileSync } from "fs";

const raw = readFileSync("benchmark/rodada-a.json", "utf-8");
const parseResult = parseSession(raw);
if (!parseResult.ok) {
  console.error("Parse error:", parseResult.error);
  process.exit(1);
}
const report = observe(parseResult.value);
const findings = detectRedundantReads(report);

const readCalls = report.tasks.reduce(
  (s, t) =>
    s +
    t.toolCalls.filter(
      (c) => c.name === "read_file" || c.name === "list_files"
    ).length,
  0
);

console.log("Tasks in baseline:", report.tasks.length);
console.log("Read/list calls:", readCalls);
console.log("redundant-read findings:", findings.length);
