# Domain Model — Hindsight

Contratos de dados estáveis entre o export bruto do Bob e as fases subsequentes:
**Observe (F2)**, **Diagnose (F3)**, **Prescribe (F4)**, **Verify (F5)** e **UI (F6)**.

O contrato central é o [**Modelo 6 — `ObserveReport`**](#modelo-6--observereport): é a
saída da F2 e a entrada de todo o resto. Depois da F2, nenhum módulo lê o export cru.

Toda representação abaixo usa pseudo-interfaces TypeScript. Campos marcados `?`
são **opcionais**; os sem `?` são **obrigatórios** e sua ausência deve ser tratada
como erro de parsing (ver [Políticas de exceção](#políticas-de-tratamento-de-exceções)).

> **Fonte de verdade:** [`benchmark/rodada-a.json`](../benchmark/rodada-a.json),
> documentado em [`docs/schema.md`](./schema.md). Onde este documento e o export
> divergirem, o export prevalece.

---

## Invariantes Globais

As regras abaixo se aplicam a **todos** os modelos. Qualquer camada que viole uma
delas produz resultado inválido.

| # | Invariante | Descrição |
|---|---|---|
| I-1 | **Timestamps são epoch em milissegundos** | Nenhum timestamp é ISO-8601 ou segundos Unix. Tipo: `number` (inteiro, 13 dígitos). Exemplo válido: `1787958446197`. Conversão para `Date`: `new Date(ts)`. |
| I-2 | **`contextTokens` é um valor acumulado, não somável** | O campo `contextTokens` presente em cada turno `assistant` representa o tamanho total da janela de contexto *naquele instante*, não o incremento daquele turno. Somar `contextTokens` de múltiplos turnos produz um número sem significado. Para calcular o incremento, use `turn[n].contextTokens − turn[n-1].contextTokens`. |
| I-3 | **Precisão monetária exata** | Valores financeiros (`cost`) são mantidos com a precisão original do export (`number` de ponto flutuante IEEE 754). Nenhuma camada do domínio aplica `Math.round`, `toFixed` ou truncamento. Arredondamento só ocorre na camada de apresentação. |
| I-4 | **Correlação de tool calls por ID único** | Um `ToolCall` e seu respectivo `ToolResult` são vinculados exclusivamente pelo campo `id` (prefixo `"tooluse_…"`). Correlação por posição, ordem de chegada ou nome da ferramenta é proibida — um único turno `assistant` pode emitir múltiplas chamadas em paralelo. |
| I-5 | **Subtasks não são agregadas duas vezes** | Tasks com `parentId !== null` são subtasks. Ao computar totais de custo, tokens ou contagens de turno para uma sessão, subtasks devem ser **excluídas** da agregação. Incluí-las junto com a task pai resulta em dupla contagem. |
| I-6 | **Estimativa nunca é apresentada como medição** | Campos derivados por rateio ou heurística — `ToolInventory.estimatedTokensPerTool`, `Finding.tokenImpact`, `Finding.costImpact`, `Prescription.estimatedTokenSaving`, `Prescription.estimatedCostSaving` — são **hipóteses**, não números medidos. O export expõe `toolDefinitions` apenas agregado; não há custo por ferramenta. A interface deve rotulá-los como estimativa, e a Rodada B (F5) é o único mecanismo que os confirma ou refuta. |

---

## Modelo 1 — `Session`

Representa a raiz de um export JSON do Bob. Contém metadados do arquivo e a lista
de tasks exportadas.

```typescript
interface Session {
  version:    number;
  exportedAt: number;
  workspace:  string;
  tasks:      Turn[];
}
```

### Notas

- `exportedAt` é o único timestamp confiável para identificar *quando* o arquivo
  foi gerado. **Não confundir com `task.createdAt`**, que é quando a task começou.
- O campo `version` deve ser verificado antes do parsing. Um valor ≠ `1` indica
  formato desconhecido — aplicar a política de campos futuros
  (ver [§ Forward compatibility](#3-campos-desconhecidos-ou-futuros-forward-compatibility)).

---

## Modelo 2 — `Turn`

Representa um par `{ task, messages }` dentro de `Session.tasks[]`. O nome "Turn"
aqui se refere à *task completa* exportada, não a um único par pergunta-resposta.
Cada entrada pode ser uma task principal ou uma subtask (quando `task.parentId !== null`).

```typescript
interface Turn {
  task:     TaskMeta;
  messages: Message[];
}

interface TaskMeta {
  id:             string;
  workspace:      string;
  taskType:       string;
  title:          string;
  status:         string;
  firstMessage:   string;
  isPinned:       boolean;
  createdAt:      number;
  updatedAt:      number;
  costs:          TaskCosts;
  env:            TaskEnv;
  approvalConfig: ApprovalConfig;

  parentId?:     string | null;
  version?:      null;
  gitSha?:       null;
  gitBranch?:    null;
  lastError?:    string | null;
  messageQueue?: null;
}
```

### `TaskCosts`

```typescript
interface TaskCosts {
  cost:                   number;
  contextTokens:          number;
  contextWindowBreakdown: ContextBreakdown;
}
```

### `TaskEnv`

```typescript
interface TaskEnv {
  workspace:     string;
  workspaceName: string;
  modeId:        string;
  staticEnvInfo: {
    primaryWorkspace: string;
    systemInfo: {
      platform: string;
      release:  string;
      arch:     string;
      shell:    string;
    };
  };

  task?:         Array<{ description: string; state: string }>;
  language?:     string;
  isPlayground?: boolean;
  costEffective?: boolean;
  _meta?:        { commandSecurityModel: string };
}
```

### `ApprovalConfig`

```typescript
interface ApprovalConfig {
  autoApprovalEnabled:     boolean;
  outsideWorkspaceAllowed: boolean;
  allowed_permissions:     Array<"read" | "edit" | "execute" | "todo">;
  editApprovalPreviewMode: string;

  allowedExecutors?: Array<{
    toolId:           string;
    approvedCommands: string[];
    deniedCommands:   string[];
  }>;
  taskCommandApprovals?: Array<{
    toolId:           string;
    approvedCommands: string[];
  }>;
  forbiddenApprovalGroups?: string[];
  taskAllowedMcpTools?:     string[];
}
```

### Notas

- `status === "active"` não indica conclusão. A conclusão é indicada por `stop: true`
  na última mensagem `assistant` (ver Modelo 3).
- `gitSha` e `gitBranch` são sempre `null` no formato v1. O commit de partida deve
  ser registrado externamente (screenshot, metadado separado).
- `durationMs` de uma task = `updatedAt − createdAt`. Inclui tempo de espera humana.
- **Subtask:** `parentId !== null`. Aplicar I-5 em toda agregação.

---

## Modelo 3 — `Message`

Representa uma única mensagem na conversa. Quatro roles possíveis: `system`,
`user`, `assistant`, `tool`.

```typescript
type MessageRole = "system" | "user" | "assistant" | "tool";

interface Message {
  id:        string;
  role:      MessageRole;
  data:      MessageData;

  createdAt?: number;
}
```

### `MessageData` — variantes por role

```typescript
interface MessageDataBase {
  id:      string;
  role:    MessageRole;
  content: string;
  _meta:   MessageMeta;
}

interface SystemMessageData extends MessageDataBase {
  role: "system";
}

interface UserMessageData extends MessageDataBase {
  role:             "user";
  envContext?:      string;
  availableTools?:  string[];
}

interface AssistantMessageData extends MessageDataBase {
  role:       "assistant";
  toolCalls?: ToolCall[];
  stop?:      true;
}

interface ToolMessageData extends MessageDataBase {
  role:      "tool";
  toolUsage: ToolUsage;
}
```

### `MessageMeta`

```typescript
interface MessageMeta {
  timestamp: number;

  spend?: {
    cost:            number;
    contextTokens:   number;
    reasoningTokens: number;
  };

  durationMs?: number;
}
```

### Notas

- `_meta.spend` **só existe em mensagens `assistant`**. Acessar sem guarda de tipo
  em mensagens `tool` ou `user` produz erro de runtime.
- `_meta.timestamp` é o único campo confiável para ordenação cronológica.
- `createdAt` no envelope é **igual em todas as mensagens** do export — não usar para ordenar.
- **Intervenção humana** = mensagem `role: "user"` após a primeira. Cada ocorrência
  é um sinal de diagnóstico (F3): indica regra ausente no `AGENTS.md`.
- `durationMs` alto numa ferramenta trivial indica espera por aprovação humana, não lentidão.

---

## Modelo 4 — `ContextBreakdown`

Decomposição da janela de contexto por origem. É o achado central do Hindsight.
Presente em `TaskCosts.contextWindowBreakdown`.

```typescript
interface ContextBreakdown {
  total:         number;
  reportedTotal: number;
  breakdown:     BreakdownDetail & Record<string, number>;
  key:           string;

  loadedSkills?: string[];
}

interface BreakdownDetail {
  roleDefinition:     number;
  staticSections:     number;
  skills:             number;
  baseRules:          number;
  projectRules:       number;
  customInstructions: number;
  environment:        number;
  toolSystemPrompts:  number;
  toolDefinitions:    number;
  mcpToolDefinitions: number;
}
```

### Relações e invariantes específicos

| Relação | Fórmula | Uso |
|---|---|---|
| Tokens de conversa | `max(reportedTotal − total, 0)` | Quanto a conversa ocupa além do overhead fixo |
| Pressão de contexto | `reportedTotal / maxContextWindow` | Acima de ~70%, qualidade e custo degradam |
| % de cada origem | `campo / total * 100` | Percentuais devem ser calculados sobre `total`, não `reportedTotal` |
| Ferramenta ociosa | `availableTools[] − toolCalls[].name` | Ferramenta habilitada e nunca chamada = imposto pago em toda sessão |

### Notas

- `total ≠ reportedTotal` **por construção**, não é bug. A diferença é a conversa.
- `projectRules === 0` significa que não existe `AGENTS.md`. É o achado central do F3.
- `skills > 0` com `loadedSkills: []` indica overhead de skill sem uso declarado.
- Percentuais calculados sobre `reportedTotal` são enganosos — usar `total`.

---

## Modelo 5 — `ToolCall` / `ToolResult`

`ToolCall` é a invocação emitida por uma mensagem `assistant`.
`ToolResult` é o retorno correspondente em uma mensagem `tool`.
Os dois são vinculados **exclusivamente** pelo campo `id`. (I-4)

```typescript
interface ToolCall {
  id:        string;
  name:      string;
  arguments: Record<string, unknown>;
}

interface ToolUsage {
  signature: {
    id:        string;
    name:      string;
    arguments: Record<string, unknown>;
    isError:   boolean;
  };
  permission:         "read" | "edit" | "execute" | "todo";
  isOutsideWorkspace: boolean;

  labels?: {
    displayName: string;
    running:     string;
    success:     string;
    error:       string;
  };
}
```

### Notas

- Um único turno `assistant` pode emitir **N chamadas em paralelo** (`toolCalls[]`
  com N elementos). O baseline (Rodada A) tem 6 chamadas no primeiro turno.
  Qualquer lógica que assuma uma chamada por turno está errada.
- `isError: true` no `ToolResult` sem nova chamada ao mesmo `id` = erro não recuperado.
- `permission: "todo"` é uma quarta permissão não prevista no briefing original.
  Usada por `update_todo_list`.
- `labels` contém strings de UI com placeholders como `{path}`. Não usar para lógica de domínio.

---

## Modelo 6 — `ObserveReport`

Saída da Fase 2 (Observe) e **entrada de Diagnose, Compare e da interface**. É o
tipo que mais cruza fronteiras no sistema: nenhum módulo depois da F2 lê o
`Session` cru.

Representa *o que aconteceu* na sessão, já normalizado e contado — **sem nenhum
diagnóstico embutido**. A distinção é rígida: `ObserveReport` responde "o quê";
`Finding` (Modelo 7) responde "isso é um problema".

```typescript
interface ObserveReport {
  sessionId:  string;
  exportedAt: EpochMs;
  workspace:  string;
  tasks:      TaskReport[];
  totals:     SessionTotals;

  unavailableMetrics: string[];
  anomalies:          ObserveAnomaly[];
}
```

### `TaskReport`

```typescript
interface TaskReport {
  taskId:     string;
  parentId:   string | null;
  isSubtask:  boolean;
  title:      string;
  modeId:     string;
  createdAt:  EpochMs;
  updatedAt:  EpochMs;
  durationMs: number;
  completed:  boolean;

  cost:          number;
  contextTokens: number;

  context:            ContextSummary;
  turns:              TurnMetrics[];
  toolCalls:          ToolCallRecord[];
  toolInventory:      ToolInventory;
  externalCommands:   ExternalCommandRecord[];
  humanInterventions: HumanIntervention[];
  approval:           ApprovalSummary;
}
```

- `isSubtask` = `parentId !== null`. Presente no relatório, **excluída** de
  `SessionTotals` (I-5).
- `completed` vem de `stop: true` na última mensagem `assistant`, **nunca** de
  `task.status`.
- `durationMs` = `updatedAt − createdAt`. Inclui espera humana.

### `ContextSummary`

```typescript
interface ContextSummary {
  fixedOverhead:      number;
  reportedTotal:      number;
  conversationTokens: number;
  reportedTotalInconsistent: boolean;
  breakdown:          BreakdownDetail;
  breakdownPct:       Record<keyof BreakdownDetail, number>;
  breakdownSumDelta:      number;
  breakdownSumConsistent: boolean;
  loadedSkills:       string[];

  maxContextWindow: number | null;
  pressure:         number | null;
}
```

- `fixedOverhead` = `contextWindowBreakdown.total`.
- `conversationTokens` = `max(reportedTotal − fixedOverhead, 0)`.
- `reportedTotalInconsistent` sinaliza `reportedTotal < fixedOverhead` sem atribuir
  causa ao dado inconsistente.
- `breakdownPct` é calculado sobre `fixedOverhead`, **nunca** sobre `reportedTotal`.
- `breakdownSumDelta` é a diferença absoluta entre a soma do breakdown e
  `fixedOverhead`; `breakdownSumConsistent` aplica a tolerância documentada pelo
  módulo Observe.
- **`maxContextWindow` não existe no export.** É conhecimento externo (a UI do Bob
  exibe `270.0k`). Deve ser um parâmetro configurável, com `null` como padrão
  honesto. Quando `null`, `pressure` também é `null` — e o detector de subagente
  não dispara por falta de dado, em vez de assumir um número.

### `TurnMetrics`

Um por mensagem `assistant`. É a série temporal da pressão de contexto.

```typescript
interface TurnMetrics {
  index:           number;
  messageId:       string;
  timestamp:       EpochMs;
  cost:            number;
  contextTokens:   number;
  contextDelta:    number | null;
  reasoningTokens: number;
  toolCallIds:     string[];
  stop:            boolean;
}
```

- `index` é 0-based **sobre mensagens `assistant`**, não sobre `messages[]`.
  É este índice que `Finding.turnIndices` referencia.
- `contextDelta` = `turns[n].contextTokens − turns[n-1].contextTokens`; `null` no
  primeiro turno. Nunca somar `contextTokens` entre turnos (I-2).

#### Nota de divergência de custo — baseline atual

No baseline (benchmark/rodada-a.json), a soma dos `cost` dos cinco turnos é
**0.16262400000000002**, enquanto `task.costs.cost` é **0.336902**. São medições
distintas (custo por mensagem assistant vs. custo total da task reportado pelo Bob)
e **não devem ser reconciliadas**: não distribuir nem fabricar o residual. Ambos os
valores devem ser preservados sem arredondamento (I-3).

### `ToolCallRecord`

Chamada e resultado já correlacionados pelo `id` (I-4), achatados e com o turno
de origem preservado.

```typescript
interface ToolCallRecord {
  callId:             string;
  name:               string;
  arguments:          Record<string, unknown>;
  turnIndex:          number;
  assistantMessageId: string;

  resultMessageId:    string | null;
  isError:            boolean | null;
  permission:         "read" | "edit" | "execute" | "todo" | null;
  durationMs:         number | null;
  isOutsideWorkspace: boolean | null;
}
```

- Campos do resultado são `null` quando a chamada não tem resultado correspondente
  (chamada órfã). `isError: null` **não é** `false` — é ausência de dado.
- `arguments` é `redactable`: pode conter caminho, comando ou código.

### `ToolInventory`

Base do detector de ferramenta ociosa (#14) e da prescrição de desligar ferramenta.

```typescript
interface ToolInventory {
  available: string[];
  used:      string[];
  idle:      string[];
  idleRatio: number;

  toolDefinitionTokens:   number;
  estimatedTokensPerTool: number | null;
}
```

- `available` vem de `availableTools[]` na primeira mensagem `user`; `used` vem de
  `toolCalls[].name`; `idle` é a diferença.
- **`estimatedTokensPerTool` é estimativa, não medição** (I-6): o export só expõe
  `toolDefinitions` agregado. Fórmula: `toolDefinitionTokens / available.length`.
  `null` quando `available` estiver vazio.

### `ExternalCommandRecord`

Base da recomendação de MCP. Um registro por `execute_command`.

```typescript
interface ExternalCommandRecord {
  callId:     string;
  turnIndex:  number;
  raw:        string;
  binaries:   string[];
  isHttp:     boolean;
  targetHost: string | null;
}
```

- `binaries` são os executáveis extraídos do comando (`["docker"]`, `["curl"]`).
  Um comando encadeado com `;` ou `&&` produz vários.
- `isHttp` marca chamadas HTTP (`curl`, `wget`, `http`), que sugerem MCP de API.
- `raw` é `redactable` — comando pode conter segredo em variável de ambiente.

### `HumanIntervention`

```typescript
interface HumanIntervention {
  messageId:      string;
  afterTurnIndex: number;
  timestamp:      EpochMs;
  content:        string;
}
```

- Uma por mensagem `role: "user"` **depois da primeira**. `content` é `redactable`
  e é o insumo direto do gerador de `AGENTS.md` (F4).

### `ApprovalSummary`

Usado pelo Compare para validar o protocolo do experimento.

```typescript
interface ApprovalSummary {
  autoApprovalEnabled: boolean;
  allowedPermissions:  Array<"read" | "edit" | "execute" | "todo">;
  approvedCommands:    string[];
}
```

### `SessionTotals`

```typescript
interface SessionTotals {
  taskCount:          number;
  subtaskCount:       number;
  cost:               number;
  assistantTurns:     number;
  toolCalls:          number;
  erroredToolCalls:   number;
  humanInterventions: number;
}
```

Agregado **apenas sobre tasks com `parentId === null`** (I-5).

### `ObserveAnomaly`

Problemas estruturais do export, detectados na normalização. Não são achados de
diagnóstico — são defeitos do dado.

```typescript
interface ObserveAnomaly {
  kind:      "unmatched-tool-call" | "orphan-tool-result" | "unknown-field" | "version-mismatch";
  taskId?:   string;
  messageId?: string;
  callId?:   string;
  fieldPath?: string;
  detail:    string;
}
```

### `unavailableMetrics`

Lista de métricas que o `METRICS.md` prevê mas o export **não fornece**. O
relatório as declara explicitamente em vez de preencher com `0`.

No formato v1, sempre contém no mínimo:

```
["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "buildFailures"]
```

- Tokens de entrada/saída e cache **não existem no export** — `_meta.spend` só traz
  `cost`, `contextTokens` e `reasoningTokens`. Só saem do screenshot do summary.
- `buildFailures` não é derivável automaticamente. Ver
  [Modelo 9 — `Comparison`](#modelo-9--comparison).

### Portão de conformidade

Para `benchmark/rodada-a.json`, o `ObserveReport` deve produzir exatamente:

| Campo | Valor |
|---|---:|
| `totals.cost` | 0.336902 |
| `tasks[0].context.reportedTotal` | 17.584 |
| `tasks[0].context.fixedOverhead` | 10.439 |
| `tasks[0].context.conversationTokens` | 7.145 |
| `totals.assistantTurns` | 5 |
| `totals.toolCalls` | 14 |
| `totals.erroredToolCalls` | 0 |
| `totals.humanInterventions` | 0 |
| `tasks[0].toolInventory.available.length` | 23 |
| `tasks[0].toolInventory.used.length` | 5 |
| `tasks[0].toolInventory.idle.length` | 18 |
| `tasks[0].externalCommands.length` | 3 |
| `tasks[0].context.pressure` | `null` (sem `maxContextWindow`) |

---

## Modelo 7 — `Finding`

Representa um diagnóstico produzido pela Fase 3 (Diagnose) a partir de padrões
detectados nas mensagens e no breakdown de contexto.

```typescript
type FindingKind =
  // execução
  | "redundant-read"
  | "retry-after-error"
  | "human-intervention"
  // configuração
  | "project-rules-absent"
  | "unused-tool"
  | "skill-overhead"
  // oportunidades de capacidade
  | "mcp-candidate"
  | "skill-candidate"
  | "subagent-candidate"
  // integridade do export
  | "unmatched-tool-call"
  | "orphan-tool-result"
  | string;

interface Finding {
  id:         string;
  sessionId:  string;
  taskId:     string;
  kind:       FindingKind;
  detectedAt: number;
  evidence:   FindingEvidence;
  confidence: ConfidenceLevel;

  prescription?: string;
  description?:  string;
  tokenImpact?:  number;
  costImpact?:   number;
}

type ConfidenceLevel = "high" | "medium" | "low";

interface FindingEvidence {
  type:       "message" | "breakdown" | "cross-reference" | "command";
  redactable: boolean;

  messageIds?:       string[];
  toolCallIds?:      string[];
  turnIndices?:      number[];
  fieldPath?:        string;
  breakdownField?:   keyof BreakdownDetail;
  breakdownValue?:   number;
  unusedTools?:      string[];
  externalCommands?: string[];
  rawValue?:         unknown;
}
```

### Notas

- `evidence` é obrigatório. Um `Finding` sem evidência não é auditável e não deve
  ser persistido.
- **`evidence.redactable` é obrigatório.** `true` quando a evidência carrega conteúdo
  de mensagem, argumento de ferramenta, caminho absoluto ou comando — ou seja, sempre
  que `messageIds`, `externalCommands` ou `rawValue` apontarem para dado do usuário.
  A camada de saída (CLI/UI) troca esses campos por `[REDACTED]` no modo padrão.
- `fieldPath` é o caminho JSON de origem, e.g.
  `"tasks[0].task.costs.contextWindowBreakdown.breakdown.projectRules"`. É o que permite
  a interface apontar para a linha exata do export.
- `turnIndices` é 0-based **sobre turnos `assistant`** (`TurnMetrics.index`), não sobre
  `messages[]`.
- `confidence` reflete a certeza do detector, não a gravidade do problema:
  - `"high"`: padrão determinístico (ex.: `isError: true` seguido da mesma tool).
  - `"medium"`: heurística com falso-positivo possível (ex.: `durationMs` alto).
  - `"low"`: correlação fraca ou sinal indireto.
- `prescription` é uma referência para frente — pode ser `undefined` quando o
  `Finding` é criado antes da prescrição ser gerada.
- `tokenImpact` e `costImpact` são estimativas, não compromissos. Nunca arredondar. (I-3)

---

## Modelo 8 — `Prescription`

Representa uma ação corretiva gerada pela Fase 4 (Prescribe) a partir de um ou
mais `Finding`s. É a saída que alimenta a geração do `AGENTS.md`, de modos
customizados e de Skills.

```typescript
type PrescriptionKind =
  // conhecimento do projeto
  | "agents-md-section"
  | "agents-md-file"
  // redução de overhead
  | "disable-tool"
  | "disable-skill"
  | "custom-mode"
  // ganho de capacidade
  | "enable-mcp"
  | "create-skill"
  | "split-subagent"
  | string;

type PrescriptionStatus = "pending" | "applied" | "rejected" | "superseded";

interface Prescription {
  id:         string;
  sessionId:  string;
  taskId:     string;
  findingIds: string[];
  kind:       PrescriptionKind;
  status:     PrescriptionStatus;
  createdAt:  number;

  content?:               string;
  targetFile?:            string;
  appliedAt?:             number;
  estimatedTokenSaving?:  number;
  estimatedCostSaving?:   number;
  rationale?:             string;
}
```

### Notas

- `findingIds` deve conter pelo menos um `Finding.id` válido. Uma `Prescription`
  sem origem em `Finding`s não é rastreável.
- `content` é opcional na criação (pode ser gerado de forma assíncrona), mas deve
  estar presente antes que `status` passe para `"applied"`.
- `status: "superseded"` indica que uma prescrição mais recente substitui esta.
  Preservar registros superseded para auditoria.

### Mapeamento achado → prescrição

O mapeamento é **explícito e determinístico**. Nenhum achado vira prescrição por
inferência, e nenhuma prescrição é gerada por modelo de linguagem
(ver [`architecture.md`](./architecture.md), seção "Nenhuma chamada a LLM").

| `FindingKind` | `PrescriptionKind` | Sinal de origem | Confiança |
|---|---|---|---|
| `project-rules-absent` | `agents-md-file` | `breakdown.projectRules === 0` | alta |
| `human-intervention` | `agents-md-section` | `HumanIntervention.content` | alta |
| `redundant-read` | `agents-md-section` | mesmo `path` em turnos distintos | alta |
| `retry-after-error` | `agents-md-section` | `isError` seguido da mesma ferramenta | alta |
| `unused-tool` | `disable-tool`, `custom-mode` | `ToolInventory.idle` | alta |
| `skill-overhead` | `disable-skill` | `skills > 0` com `loadedSkills: []` | alta |
| `mcp-candidate` | `enable-mcp` | `ExternalCommandRecord.binaries` × `McpCatalogEntry` | média |
| `skill-candidate` | `create-skill` | procedimento recorrente entre **N sessões** | baixa com 1 sessão |
| `subagent-candidate` | `split-subagent` | `ContextSummary.pressure` acima do limiar | não avaliável sem `maxContextWindow` |

- **`create-skill` exige mais de uma sessão.** Com um único export não há repetição
  observável; o gerador deve declarar confiança `"low"` ou não emitir a prescrição.
- **`split-subagent` depende de `maxContextWindow`**, que não vem no export. Com
  `pressure === null`, a prescrição não é emitida — ausência de dado não vira
  recomendação.

---

## Modelo 9 — `Comparison`

Representa a comparação entre Rodada A (baseline) e Rodada B (otimizada).
É a saída da Fase 5 (Verify) e o dado principal exibido pela UI (F6).

```typescript
interface Comparison {
  id:          string;
  sessionIdA:  string;
  sessionIdB:  string;
  taskIdA:     string;
  taskIdB:     string;
  createdAt:   number;
  metrics:     ComparisonMetrics;
  valid:       boolean;

  prescriptionIds?: string[];
  notes?:           string;
  invalidReason?:   string;
}

interface ComparisonMetrics {
  costA:              number;
  costB:              number;
  costDelta:          number;

  contextTokensA:     number;
  contextTokensB:     number;
  contextTokensDelta: number;

  fixedOverheadA:     number;
  fixedOverheadB:     number;
  fixedOverheadDelta: number;

  assistantTurnsA:     number;
  assistantTurnsB:     number;
  assistantTurnsDelta: number;

  humanInterventionsA:     number;
  humanInterventionsB:     number;
  humanInterventionsDelta: number;

  buildFailuresA?:     number;
  buildFailuresB?:     number;
  buildFailuresDelta?: number;

  durationMsA?:       number;
  durationMsB?:       number;
  durationMsDelta?:   number;

  projectRulesTokensA?: number;
  projectRulesTokensB?: number;

  breakdownA?: BreakdownDetail;
  breakdownB?: BreakdownDetail;
}
```

### Notas

- A `Comparison` só é `valid: true` se as regras do
  [`benchmark/METRICS.md`](../benchmark/METRICS.md) forem respeitadas:
  prompt idêntico, mesmo commit, mesma pessoa, mesma configuração de auto-approve.
- `costDelta` e `contextTokensDelta` negativos indicam melhora. Positivos indicam
  regressão. A UI deve comunicar o sinal de forma inequívoca.
- **Subtasks estão excluídas** de todas as métricas. (I-5)
- Deltas sobre valores financeiros mantêm precisão exata. (I-3)
- **`buildFailures*` é opcional porque não é derivável do export.** O `METRICS.md`
  o define como contagem manual. Quando preenchido automaticamente, a única origem
  aceitável é o proxy `execute_command` com `isError: true`, e isso deve ser declarado
  em `notes`. Sem origem, o campo fica ausente — nunca `0`.
- `fixedOverheadDelta` é a métrica que o baseline sustenta melhor: a Rodada A não teve
  retry, erro nem intervenção humana (ver [`analise-rodada-a.md`](./analise-rodada-a.md)),
  então o delta de execução tende a zero e o delta de overhead é o número honesto.

---

## Modelo 10 — Catálogos de recomendação

Dados curados à mão, versionados em `data/` e carregados como JSON estático. **São
dado, não código:** alterar um catálogo não exige alterar detector nem gerador.

Existem porque duas recomendações — MCP e agrupamento de ferramentas — dependem de
conhecimento externo que o export não carrega: o export diz que o agente rodou
`docker build`, mas não sabe que existe um servidor MCP de Docker.

### `McpCatalogEntry`

```typescript
interface McpCatalogEntry {
  id:          string;
  label:       string;
  binaries:    string[];
  matchesHttp: boolean;
  replaces:    string;
  rationale:   string;

  docsUrl?:  string;
  minHits?:  number;
}
```

- `binaries` são os executáveis que disparam a sugestão (`["docker", "docker-compose"]`).
  Casados contra `ExternalCommandRecord.binaries`.
- `matchesHttp` sugere o servidor quando há chamada HTTP (`ExternalCommandRecord.isHttp`).
- `replaces` descreve o que o MCP substitui, em uma frase — vai direto para a UI.
- `rationale` é o argumento: shell devolve texto não-estruturado que o agente precisa
  interpretar dentro do contexto; a ferramenta MCP devolve dado estruturado.
- `minHits` é o número mínimo de ocorrências para sugerir (padrão `1`). Evita
  recomendar um MCP por causa de um `curl` isolado.

Exemplo de casamento no baseline: `docker build` + `docker run` → 2 ocorrências de
`docker` → sugere o servidor MCP de Docker.

### `ToolCatalogEntry`

```typescript
interface ToolCatalogEntry {
  name:    string;
  group:   string;
  purpose: string;

  essential?: boolean;
}
```

- `group` agrupa as ferramentas ociosas por propósito na interface — sem isso a
  prescrição vira uma lista crua de 18 nomes, que ninguém lê.
- `essential: true` protege ferramentas que não devem ser sugeridas para desligar
  mesmo quando ociosas numa sessão específica.
- Ferramenta ausente do catálogo é exibida no grupo `"outros"`, **nunca omitida**.

### Regras comuns

- Catálogo ausente ou inválido **degrada, não quebra**: o detector correspondente
  não emite achado e o relatório registra o motivo.
- Nenhuma entrada de catálogo contém segredo, URL interna ou caminho de máquina.
- Catálogo é entrada confiável (versionada no repositório), ao contrário do export.

---

## Relações entre Modelos

```
Session                                    ← saída do parser
  └── Turn[]                          (1:N — uma por task/subtask no export)
        ├── TaskMeta
        │     └── ContextBreakdown    (1:1 — obrigatório em toda task)
        └── Message[]                 (1:N — ordenar por _meta.timestamp)
              ├── [assistant] → ToolCall[]    (0:N — paralelas no mesmo turno)
              └── [tool]      → ToolUsage     (1:1 — correlacionado por id) (I-4)

ObserveReport                              ← saída de observe; entrada de diagnose, compare e UI
  ├── sessionId  → derivado de Session
  ├── tasks[] → TaskReport             (1:N — uma por task; subtasks marcadas, não agregadas) (I-5)
  │     ├── context     → ContextSummary       (1:1)
  │     ├── turns[]     → TurnMetrics          (1:N — uma por mensagem assistant)
  │     ├── toolCalls[] → ToolCallRecord       (1:N — chamada e resultado já correlacionados) (I-4)
  │     ├── toolInventory      → ToolInventory       (1:1 — base de unused-tool)
  │     ├── externalCommands[] → ExternalCommandRecord (0:N — base de mcp-candidate)
  │     └── humanInterventions[] → HumanIntervention   (0:N — base de agents-md-section)
  └── totals → SessionTotals           (1:1 — agrega só tasks com parentId === null)

Finding
  ├── sessionId  → Session
  ├── taskId     → Turn.task.id
  ├── toolCallIds[] → ToolCall.id     (quando aplicável) (I-4)
  └── prescription? → Prescription.id (referência para frente)

Catálogos (data/)                          ← entrada confiável, versionada
  ├── McpCatalogEntry[]  ↔ ObserveReport…externalCommands[].binaries
  └── ToolCatalogEntry[] ↔ ObserveReport…toolInventory.idle[]

Prescription
  ├── sessionId  → Session
  ├── taskId     → Turn.task.id
  └── findingIds[] → Finding.id[]     (1:N — uma prescrição pode consolidar vários achados)

Comparison
  ├── sessionIdA / taskIdA → Session / Turn (Rodada A)
  └── sessionIdB / taskIdB → Session / Turn (Rodada B)
```

---

## Políticas de Tratamento de Exceções

### 1. Tool calls sem resultado

**Definição:** Um `ToolCall` presente em `AssistantMessageData.toolCalls[]` para
o qual não existe nenhuma mensagem `tool` com `toolUsage.signature.id` igual ao
`ToolCall.id`.

**Política:**
- Classificar como `ToolCall` **pendente/órfão**.
- **Não inferir** resultado, não assumir sucesso.
- Registrar um `Finding` com `kind: "unmatched-tool-call"` e `confidence: "high"`.
- Incluir o `ToolCall.id` em `evidence.toolCallIds`.
- A `Prescription` resultante deve alertar que a sessão pode estar incompleta.
- **Não propagar** o `ToolCall` sem resultado para cálculos de taxa de erro ou
  sequência de execução — tratá-lo como dado ausente, não como falha.

### 2. Resultados órfãos

**Definição:** Uma mensagem `tool` com `toolUsage.signature.id` para o qual não
existe `ToolCall` com o mesmo `id` em nenhuma mensagem `assistant` anterior.

**Política:**
- Classificar como `ToolUsage` **sem chamada de origem**.
- **Não descartar silenciosamente.** Emitir warning no log de parsing.
- Registrar um `Finding` com `kind: "orphan-tool-result"` e `confidence: "high"`.
- **Não incluir** o resultado órfão em sequências de execução, taxas de erro
  ou análise de retry — ele não tem origem rastreável.
- Preservar o dado bruto para inspeção manual.
- Possível causa: export parcial, mensagens reordenadas, ou bug no cliente Bob.

### 3. Campos desconhecidos ou futuros *(Forward Compatibility Policy)*

**Definição:** Campos presentes no JSON que não constam nos modelos acima, ou
valores de campos tipados como `string` que não pertencem ao conjunto de literais
conhecido (ex.: novo valor de `MessageRole`, novo `FindingKind`).

**Política:**
- **Nunca rejeitar** o documento inteiro por causa de um campo desconhecido.
- Campos desconhecidos devem ser **preservados sem modificação** em uma propriedade
  `_unknown?: Record<string, unknown>` do modelo mais próximo, ou descartados de
  forma documentada — nunca descartados silenciosamente.
- Valores de literais desconhecidos devem ser tratados como `string` genérica.
  O sistema deve continuar funcionando; apenas a lógica que depende do valor
  específico deve ser desativada para aquele item.
- A presença de campos desconhecidos deve ser reportada no log de parsing com
  nível `warn`, não `error`.
- **Nunca assumir** que um campo ausente equivale a `0`, `false` ou `""`. Ausência
  é ausência; falta de dado é distinto de dado zero.
- Quando `version` for diferente de `1`, aplicar esta política de forma mais
  conservadora: parsear apenas os campos documentados e emitir `warn` explícito
  indicando que o formato pode ter mudado estruturalmente.

---

## Glossário

| Termo | Definição |
|---|---|
| **Session** | Arquivo JSON completo exportado pelo Bob via `Tasks → export JSON`. |
| **Turn** (task) | Um par `{ task, messages }` dentro de `Session.tasks[]`. |
| **Assistant Turn** | Uma mensagem com `role: "assistant"`. A série de `contextTokens` dessas mensagens forma a curva de pressão de contexto. |
| **ToolCall** | Invocação de ferramenta emitida por um turno `assistant`. |
| **ToolResult** | Retorno de uma ferramenta, presente em mensagens `tool`. |
| **Fixed Overhead** | `ContextBreakdown.total` — tokens do system prompt, ferramentas e skills, sem contar a conversa. |
| **Context Pressure** | `ContextBreakdown.reportedTotal / maxContextWindow` — fração da janela ocupada. |
| **Human Intervention** | Mensagem `role: "user"` após a primeira. Indica redirecionamento manual. |
| **Subtask** | `Turn` com `task.parentId !== null`. Excluída de todas as agregações. (I-5) |
| **Epoch ms** | Timestamp como inteiro de 13 dígitos representando milissegundos desde Unix epoch. |
| **ObserveReport** | Saída da F2 e contrato central do sistema. Descreve *o que aconteceu* na sessão, já normalizado e contado, sem diagnóstico. Nenhum módulo depois da F2 lê o `Session` cru. |
| **Ferramenta ociosa** | Ferramenta presente em `availableTools[]` e ausente de `toolCalls[].name`. No baseline: 18 de 23 (78%). |
| **Comando externo** | Chamada de `execute_command`. Cada uma é candidata a virar ferramenta de MCP, porque o shell devolve texto não-estruturado que o agente precisa interpretar dentro do contexto. |
| **Catálogo** | Dado curado em `data/`, versionado, que traduz sinal do export em recomendação nomeada (Modelo 10). Entrada confiável, ao contrário do export. |
| **Estimativa** | Número derivado por rateio ou heurística, nunca medido. Deve ser rotulado como tal na saída e só é confirmado pela Rodada B. (I-6) |
