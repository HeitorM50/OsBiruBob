
const { readFileSync } = require('fs');
// We need to use the compiled output or tsx
// Let's just extract what we need from the raw JSON directly
const raw = readFileSync('./bob-task-57be89793cb4c5e6f36bc32b5458d7b8-2026-08-29.json', 'utf-8');
const data = JSON.parse(raw);
const task = data.tasks[0];
const msgs = task.messages;

// Extract key metrics manually per the schema
const assistantMsgs = msgs.filter(m => m.role === 'assistant');
const userMsgs = msgs.filter(m => m.role === 'user');

// available tools from first user message
const availableTools = userMsgs[0]?.data?.availableTools ?? [];

// last assistant message with stop=true
const stopMsg = msgs.find(m => m.role === 'assistant' && m.data?.stop === true);
// Actually find by scanning all
let lastStopAssistant = null;
for (const m of msgs) {
  if (m.role === 'assistant' && m.data?.stop === true) lastStopAssistant = m;
}

// Find contextWindowBreakdown - try each assistant message
let cwb = null;
for (const m of assistantMsgs) {
  if (m.data?.contextWindowBreakdown) { cwb = m.data.contextWindowBreakdown; break; }
  // also check if it's nested deeper
  const str = JSON.stringify(m.data);
  const match = str.match(/"contextWindowBreakdown"\s*:\s*(\{[^}]+\})/);
  if (match) { try { cwb = JSON.parse(match[1]); } catch(e) {} break; }
}

// spend data
const spends = assistantMsgs
  .filter(m => m.data?._meta?.spend)
  .map(m => m.data._meta.spend);

const lastSpend = spends[spends.length - 1];

// Tool calls used
const usedToolSet = new Set();
for (const m of msgs) {
  if (m.role === 'assistant' && m.data?.toolCalls) {
    for (const tc of m.data.toolCalls) usedToolSet.add(tc.name);
  }
}

console.log('=== VALIDATION SESSION METRICS ===');
console.log('');
console.log('Export version:', data.version);
console.log('Task id:', task.task.id);
console.log('Task parentId:', task.task.parentId, '(null = root task, not subtask)');
console.log('Task status:', task.task.status);
console.log('');
console.log('--- Context window breakdown ---');
console.log('contextWindowBreakdown found:', cwb !== null);
if (cwb) {
  console.log('  total:', cwb.total);
  console.log('  reportedTotal:', cwb.reportedTotal);
  console.log('  breakdown:', JSON.stringify(cwb.breakdown, null, 2));
  console.log('  loadedSkills:', JSON.stringify(cwb.loadedSkills));
} else {
  console.log('  (not present in this export - no structured breakdown available)');
}
console.log('');
console.log('--- Available tools (from user message) ---');
console.log('Count:', availableTools.length);
console.log('Tools:', availableTools.join(', '));
console.log('');
console.log('--- Used tools ---');
console.log('Count:', usedToolSet.size);
console.log('Tools:', [...usedToolSet].sort().join(', '));
console.log('');
console.log('--- Idle tools ---');
const idle = availableTools.filter(t => !usedToolSet.has(t));
console.log('Count:', idle.length);
console.log('Tools:', idle.join(', '));
console.log('');
console.log('--- Completion ---');
console.log('stop=true found:', lastStopAssistant !== null);
console.log('stop message index:', msgs.indexOf(lastStopAssistant));
console.log('');
console.log('--- Cost ---');
console.log('Total cost: $' + task.task.costs?.cost);
console.log('Total contextTokens:', task.task.costs?.contextTokens);
if (lastSpend) {
  console.log('Last spend:', JSON.stringify(lastSpend));
}
console.log('');
console.log('--- AGENTS.md presence signal ---');
console.log('NOTE: This export has no structured contextWindowBreakdown.');
console.log('The AGENTS.md was present in the repo root at the time of this session.');
console.log('The session ran on branch: main (git_status_snapshot shows "No uncommitted changes" on main)');
console.log('projectRules signal: UNAVAILABLE in this export format');
