import { readFileSync } from 'fs';
import { parseSession } from '../../src/parser/index.ts';
import { observe } from '../../src/observe/index.ts';
import { diagnoseWithCatalogs } from '../../src/diagnose/index.ts';
import { prescribeAgentsMd, renderAgentsMd, prescribeOverheadReduction } from '../../src/prescribe/index.ts';

const VALIDATION_PATH = './bob_sessions/Pedro/bob-task-568bec1892efb287107ee97c4498d19c-2026-08-30.json';
const BASELINE_PATH   = './benchmark/rodada-a.json';

function run(label, path) {
  const raw = readFileSync(path, 'utf-8');
  const parsed = parseSession(raw);
  if (!parsed.ok) { console.error(label + ' PARSE ERROR:', parsed.error.message); process.exit(1); }
  const report = observe(parsed.value);
  const t = report.tasks[0];
  const ctx = t.context;
  const inv = t.toolInventory;
  const { findings, unavailableMetrics } = diagnoseWithCatalogs(report);
  return { report, t, ctx, inv, findings, unavailableMetrics };
}

const A = run('BASELINE', BASELINE_PATH);
const B = run('VALIDATION', VALIDATION_PATH);

console.log('======================================');
console.log('  F4 GATE — PHASE 4 VALIDATION REPORT');
console.log('======================================');
console.log('');
console.log('BASELINE  (rodada-a.json)');
console.log('VALIDATION (bob-task-568bec…)');
console.log('');
console.log('┌────────────────────────┬───────────────┬───────────────┐');
console.log('│ Metric                 │ Baseline (A)  │ Validation    │');
console.log('├────────────────────────┼───────────────┼───────────────┤');
function row(label, a, b) {
  const la = String(a).padStart(13);
  const lb = String(b).padStart(13);
  console.log('│ ' + label.padEnd(22) + ' │ ' + la + ' │ ' + lb + ' │');
}
row('fixedOverhead',     A.ctx.fixedOverhead,           B.ctx.fixedOverhead);
row('reportedTotal',     A.ctx.reportedTotal,           B.ctx.reportedTotal);
row('projectRules',      A.ctx.breakdown.projectRules,  B.ctx.breakdown.projectRules);
row('toolDefinitions',   A.ctx.breakdown.toolDefinitions, B.ctx.breakdown.toolDefinitions);
row('skills',            A.ctx.breakdown.skills,        B.ctx.breakdown.skills);
row('available tools',   A.inv?.available.length ?? 'n/a', B.inv?.available.length ?? 'n/a');
row('idle tools',        A.inv?.idle.length ?? 'n/a',   B.inv?.idle.length ?? 'n/a');
row('used tools',        A.inv?.used.length ?? 'n/a',   B.inv?.used.length ?? 'n/a');
row('completed (stop)',  A.t.completed,                 B.t.completed);
console.log('└────────────────────────┴───────────────┴───────────────┘');
console.log('');
console.log('loadedSkills (baseline)   :', JSON.stringify(A.ctx.loadedSkills));
console.log('loadedSkills (validation) :', JSON.stringify(B.ctx.loadedSkills));
console.log('');
console.log('VALIDATION availableTools:');
console.log(' ', B.inv?.available.join(', '));
console.log('');
console.log('VALIDATION usedTools:');
console.log(' ', B.inv?.used.join(', '));
console.log('');
console.log('VALIDATION idleTools:');
console.log(' ', B.inv?.idle.join(', '));
console.log('');
console.log('--- FINDINGS (validation) ---');
for (const f of B.findings) {
  console.log('  kind=' + f.kind + ' confidence=' + f.confidence);
}
console.log('unavailableMetrics:', B.unavailableMetrics);
console.log('');
console.log('--- GATE RULES ---');
const pr = B.ctx.breakdown.projectRules;
console.log('R1 projectRules > 0 :', pr > 0 ? 'PASS (' + pr + ')' : 'FAIL (' + pr + ')');
const bTool = B.ctx.breakdown.toolDefinitions;
const aTool = A.ctx.breakdown.toolDefinitions;
console.log('R3 toolDefs trend   :', bTool < aTool ? 'DOWN (' + aTool + ' → ' + bTool + ')' : 'SAME/UP (' + aTool + ' → ' + bTool + ')');
console.log('R5 completed        :', B.t.completed ? 'PASS' : 'FAIL');
