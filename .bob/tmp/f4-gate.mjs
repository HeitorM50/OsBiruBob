import { readFileSync } from 'fs';
import { parseSession } from '../../src/parser/index.js';
import { observe } from '../../src/observe/index.js';
import { diagnoseWithCatalogs } from '../../src/diagnose/index.js';
import { prescribeAgentsMd, renderAgentsMd, prescribeOverheadReduction } from '../../src/prescribe/index.js';

const raw = readFileSync('./benchmark/rodada-a.json', 'utf-8');
const session = parseSession(raw);
if (!session.ok) { console.error('PARSE ERROR', session.error); process.exit(1); }
const report = observe(session.value);
const { findings, unavailableMetrics } = diagnoseWithCatalogs(report);

console.log('=== FINDINGS ===');
for (const f of findings) {
  console.log('  kind=' + f.kind + ' confidence=' + f.confidence + ' prescriptionHint=' + f.prescriptionHint);
  if (f.kind === 'unused-tool') {
    console.log('  idleCount=' + f.metric.idleCount + ' disableCandidateCount=' + f.metric.disableCandidateCount);
    console.log('  tokenImpact=' + f.tokenImpact + ' isEstimate=' + f.metric.tokenImpactIsEstimate);
    console.log('  unusedTools (candidates):', f.evidence.unusedTools?.join(', '));
  }
  if (f.kind === 'skill-overhead') {
    console.log('  skillTokens=' + f.metric.skillTokens + ' tokenImpact=' + f.tokenImpact);
  }
}
console.log('unavailableMetrics:', unavailableMetrics);

const agentsPrescriptions = prescribeAgentsMd(findings);
const agentsMd = renderAgentsMd(agentsPrescriptions);
console.log('\n=== AGENTS.md draft ===');
console.log(agentsMd);

const overheadPrescriptions = prescribeOverheadReduction(findings);
console.log('\n=== OVERHEAD PRESCRIPTIONS ===');
for (const p of overheadPrescriptions) {
  console.log('  kind=' + p.kind + ' estimatedTokenSaving=' + p.estimatedTokenSaving);
  console.log('  content: ' + p.content);
  console.log('  rationale: ' + p.rationale);
  console.log('---');
}

const inv = report.tasks[0].toolInventory;
console.log('\n=== TOOL INVENTORY ===');
console.log('  available:', inv?.available.length);
console.log('  used:', inv?.used.length, '(' + inv?.used.join(', ') + ')');
console.log('  idle:', inv?.idle.length);
console.log('  idleRatio:', inv?.idleRatio);
console.log('  toolDefinitionTokens:', inv?.toolDefinitionTokens);
console.log('  estimatedTokensPerTool:', inv?.estimatedTokensPerTool);
console.log('  idle list:', inv?.idle.join(', '));

const ctx = report.tasks[0].context;
console.log('\n=== CONTEXT BREAKDOWN (rodada-a) ===');
console.log('  fixedOverhead:', ctx.fixedOverhead);
console.log('  reportedTotal:', ctx.reportedTotal);
console.log('  projectRules:', ctx.breakdown.projectRules);
console.log('  toolDefinitions:', ctx.breakdown.toolDefinitions);
console.log('  skills:', ctx.breakdown.skills);
console.log('  loadedSkills:', report.tasks[0].context.loadedSkills);
console.log('  completed:', report.tasks[0].completed);
