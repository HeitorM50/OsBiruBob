import { readFileSync } from 'fs';
import { parseSession } from '../../src/parser/index.ts';
import { observe } from '../../src/observe/index.ts';
import { diagnoseWithCatalogs } from '../../src/diagnose/index.ts';
import { prescribeAgentsMd, renderAgentsMd, prescribeOverheadReduction } from '../../src/prescribe/index.ts';

const EXPORT_PATH = './bob-task-57be89793cb4c5e6f36bc32b5458d7b8-2026-08-29.json';
const raw = readFileSync(EXPORT_PATH, 'utf-8');
const parsed = parseSession(raw);
if (!parsed.ok) {
  console.error('PARSE ERROR:', parsed.error.message);
  process.exit(1);
}

const report = observe(parsed.value);
const t = report.tasks[0];
const ctx = t.context;
const inv = t.toolInventory;

console.log('=== OBSERVE REPORT — VALIDATION SESSION ===');
console.log('sessionId:', report.sessionId);
console.log('taskId:', t.taskId);
console.log('completed:', t.completed);
console.log('');
console.log('Context breakdown:');
console.log('  fixedOverhead   :', ctx.fixedOverhead);
console.log('  reportedTotal   :', ctx.reportedTotal);
console.log('  projectRules    :', ctx.breakdown.projectRules);
console.log('  toolDefinitions :', ctx.breakdown.toolDefinitions);
console.log('  skills          :', ctx.breakdown.skills);
console.log('  loadedSkills    :', JSON.stringify(ctx.loadedSkills));
console.log('');
console.log('Tool inventory:');
if (inv) {
  console.log('  available count :', inv.available.length);
  console.log('  used count      :', inv.used.length, '->', inv.used.join(', '));
  console.log('  idle count      :', inv.idle.length);
  console.log('  idleRatio       :', inv.idleRatio);
  console.log('  toolDefTokens   :', inv.toolDefinitionTokens);
} else {
  console.log('  toolInventory: null');
}
console.log('');
const { findings, unavailableMetrics } = diagnoseWithCatalogs(report);
console.log('Findings:');
for (const f of findings) {
  console.log(' ', f.kind, '(' + f.confidence + ')');
}
console.log('unavailableMetrics:', unavailableMetrics);
