# Domain Model — Hindsight

Contratos de dados estáveis entre o export bruto do Bob e as fases subsequentes:
**Observe (F2)**, **Diagnose (F3)**, **Prescribe (F4)**, **Verify (F5)** e **UI (F6)**.

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
  breakdown:     BreakdownDetail;
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
| Tokens de conversa | `reportedTotal − total` | Quanto a conversa ocupa além do overhead fixo |
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

## Modelo 6 — `Finding`

Representa um diagnóstico produzido pela Fase 3 (Diagnose) a partir de padrões
detectados nas mensagens e no breakdown de contexto.

```typescript
type FindingKind =
  | "redundant-read"
  | "retry-after-error"
  | "human-intervention"
  | "project-rules-absent"
  | "unused-tool"
  | "skill-overhead"
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
  type:            "message" | "breakdown" | "cross-reference";
  messageIds?:     string[];
  toolCallIds?:    string[];
  breakdownField?: keyof BreakdownDetail;
  breakdownValue?: number;
  unusedTools?:    string[];
  rawValue?:       unknown;
}
```

### Notas

- `evidence` é obrigatório. Um `Finding` sem evidência não é auditável e não deve
  ser persistido.
- `confidence` reflete a certeza do detector, não a gravidade do problema:
  - `"high"`: padrão determinístico (ex.: `isError: true` seguido da mesma tool).
  - `"medium"`: heurística com falso-positivo possível (ex.: `durationMs` alto).
  - `"low"`: correlação fraca ou sinal indireto.
- `prescription` é uma referência para frente — pode ser `undefined` quando o
  `Finding` é criado antes da prescrição ser gerada.
- `tokenImpact` e `costImpact` são estimativas, não compromissos. Nunca arredondar. (I-3)

---

## Modelo 7 — `Prescription`

Representa uma ação corretiva gerada pela Fase 4 (Prescribe) a partir de um ou
mais `Finding`s. É a saída que alimenta a geração do `AGENTS.md`, de modos
customizados e de Skills.

```typescript
type PrescriptionKind =
  | "agents-md-section"
  | "agents-md-file"
  | "disable-tool"
  | "disable-skill"
  | "custom-mode"
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

---

## Modelo 8 — `Comparison`

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

  buildFailuresA:     number;
  buildFailuresB:     number;
  buildFailuresDelta: number;

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

---

## Relações entre Modelos

```
Session
  └── Turn[]                          (1:N — uma por task/subtask no export)
        ├── TaskMeta
        │     └── ContextBreakdown    (1:1 — obrigatório em toda task)
        └── Message[]                 (1:N — ordenar por _meta.timestamp)
              ├── [assistant] → ToolCall[]    (0:N — paralelas no mesmo turno)
              └── [tool]      → ToolUsage     (1:1 — correlacionado por id) (I-4)

Finding
  ├── sessionId  → Session
  ├── taskId     → Turn.task.id
  ├── toolCallIds[] → ToolCall.id     (quando aplicável) (I-4)
  └── prescription? → Prescription.id (referência para frente)

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
