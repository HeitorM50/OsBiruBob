# Schema do export de sessão do IBM Bob

Estrutura do JSON que o Bob produz em `Tasks → export JSON`. É a entrada do
Hindsight. Serve para o time trabalhar sem gastar Bobcoin gerando sessão nova só
para inspecionar um campo.

**Documentado a partir de um export real**, não da documentação: [`fixtures/sample-export.json`](../fixtures/sample-export.json)
é a versão **redigida** de [`benchmark/rodada-a.json`](../benchmark/rodada-a.json), o baseline
do experimento. `version: 1`.

> **A árvore do briefing estava aproximada.** Onde a realidade diverge, este
> documento segue o arquivo. As divergências estão listadas em
> [Diferenças em relação ao briefing](#diferenças-em-relação-ao-briefing).

---

## Visão geral

```
root
├── version (number), exportedAt (epoch ms), workspace ("file:/caminho")
└── tasks[]
    ├── task
    │   ├── id, workspace, parentId, taskType, title, status
    │   ├── firstMessage, version, gitSha, gitBranch
    │   ├── isPinned, lastError, messageQueue
    │   ├── createdAt, updatedAt            (epoch ms)
    │   ├── env { workspace, workspaceName, modeId, staticEnvInfo, task[] }
    │   ├── approvalConfig
    │   │   ├── autoApprovalEnabled, outsideWorkspaceAllowed
    │   │   ├── allowed_permissions[]
    │   │   ├── allowedExecutors[], taskCommandApprovals[]
    │   │   └── editApprovalPreviewMode, forbiddenApprovalGroups[], taskAllowedMcpTools[]
    │   └── costs
    │       ├── cost, contextTokens
    │       └── contextWindowBreakdown
    │           ├── total, reportedTotal, loadedSkills[], key
    │           └── breakdown
    │               ├── roleDefinition, staticSections, skills
    │               ├── baseRules, projectRules, customInstructions
    │               ├── environment, toolSystemPrompts
    │               └── toolDefinitions, mcpToolDefinitions
    └── messages[]
        ├── id, role (system|user|assistant|tool), createdAt (epoch ms)
        └── data
            ├── id, role                    (duplicados do envelope)
            ├── content
            ├── _meta.timestamp             (epoch ms)
            ├── _meta.spend { cost, contextTokens, reasoningTokens }   ← só em assistant
            ├── _meta.durationMs                                       ← só em tool
            ├── envContext, availableTools[]                           ← só na 1ª user
            ├── stop (true)                                            ← só na última assistant
            ├── toolCalls[] { id, name, arguments }                    ← só em assistant
            └── toolUsage                                              ← só em tool
                ├── signature { id, name, arguments, isError }
                ├── labels { displayName, running, success, error }
                ├── permission (read|edit|execute|todo)
                └── isOutsideWorkspace
```

---

## Raiz

| Campo | Tipo | Valor no export real |
|---|---|---|
| `version` | number | `1` — **número, não string** |
| `exportedAt` | number | Epoch em **milissegundos** (`1787958446197`) |
| `workspace` | string | URI com esquema: `"file:/home/…/bob-demo"` |
| `tasks[]` | array | Uma entrada por task; cada entrada é `{ task, messages }` |

**Todo timestamp deste formato é epoch em milissegundos.** Nada é ISO-8601.

---

## `tasks[].task`

| Campo | Tipo | Observação |
|---|---|---|
| `id` | string | Hash hex de 32 chars |
| `workspace` | string | URI `file:…` |
| `parentId` | string \| null | Não-nulo indica subtask — não somar as métricas dela duas vezes |
| `taskType` | string | `"normal"` no baseline |
| `title` | string | **É o prompt inteiro**, não um resumo |
| `status` | string | `"active"` mesmo com a task concluída. Não confie neste campo para saber se terminou — use `stop: true` na última mensagem |
| `firstMessage` | string | Idêntico ao `content` da primeira mensagem `user`. **É daqui que sai o `benchmark/task.txt`** |
| `version` | null | Não populado |
| `gitSha` / `gitBranch` | null | **Vêm nulos.** O commit de partida precisa ser registrado à mão |
| `isPinned` | boolean | |
| `lastError` | null | Erro fatal da task, quando houver |
| `messageQueue` | null | |
| `createdAt` / `updatedAt` | number | Epoch ms. A diferença dá a duração da task |

### `task.env`

Contexto de execução. Útil para provar que as duas rodadas rodaram na mesma máquina.

| Campo | Observação |
|---|---|
| `workspace`, `workspaceName`, `scheme`, `query` | Identificação do workspace |
| `language`, `isPlayground`, `costEffective` | Flags da sessão |
| `modeId` | Modo do Bob (`"agent"`). **Muda quando um modo customizado é usado — evidência da Fase 4** |
| `_meta.commandSecurityModel` | Modelo que aprova comandos (`"openai/gpt-oss-20b"`) |
| `staticEnvInfo.primaryWorkspace` | Caminho absoluto |
| `staticEnvInfo.systemInfo` | `platform`, `release`, `arch`, `shell` |
| `task[]` | Snapshot final da todo list: `{ description, state }` |

### `task.approvalConfig`

Prova que a regra 4 do experimento foi cumprida.

| Campo | Observação |
|---|---|
| `autoApprovalEnabled` | boolean |
| `allowed_permissions[]` | Permissões auto-aprovadas. **No baseline veio `["read","todo","execute"]`** |
| `allowedExecutors[]` | `{ toolId, approvedCommands[], deniedCommands[] }` — allowlist persistente de comandos |
| `taskCommandApprovals[]` | Comandos aprovados só nesta task |
| `editApprovalPreviewMode` | `"editor"` |
| `forbiddenApprovalGroups[]`, `taskAllowedMcpTools[]` | Vazios no baseline |

### `task.costs`

| Campo | Valor no baseline | Observação |
|---|---|---|
| `cost` | `0.336902` | Custo total em dólares |
| `contextTokens` | `17584` | Tokens de contexto no fim da task |

### `task.costs.contextWindowBreakdown`

O campo que dá nome ao projeto.

| Campo | Valor no baseline | Observação |
|---|---|---|
| `total` | `10439` | Soma do `breakdown` — só o **overhead fixo** (system prompt, ferramentas, skills) |
| `reportedTotal` | `17584` | Contexto real no fim, **incluindo a conversa**. Igual a `costs.contextTokens` |
| `loadedSkills[]` | `[]` | Skills carregadas |
| `key` | string | Chave de cache interna: `id|modo|…` |

**`total` e `reportedTotal` não são a mesma coisa e a diferença não é bug.**
`reportedTotal − total` = `17584 − 10439` = **7145 tokens de conversa**. Percentuais
do breakdown devem ser calculados sobre `total`; pressão de contexto, sobre
`reportedTotal`.

#### `breakdown` — os 10 campos, com os valores reais da Rodada A

| Campo | Tokens | % de `total` | O que ocupa |
|---|---:|---:|---|
| `toolDefinitions` | 5403 | 51,8% | Schemas das ferramentas. Maior bloco. Ferramenta ligada e não usada custa em toda sessão |
| `toolSystemPrompts` | 2470 | 23,7% | Prompts de sistema das ferramentas |
| `skills` | 1541 | 14,8% | Skills carregadas — mesmo com `loadedSkills: []` |
| `staticSections` | 563 | 5,4% | Seções estáticas do system prompt |
| `baseRules` | 197 | 1,9% | Regras base do Bob |
| `customInstructions` | 160 | 1,5% | Instruções do usuário/modo |
| `environment` | 71 | 0,7% | SO, shell, cwd |
| `roleDefinition` | 34 | 0,3% | Definição do papel do agente |
| **`projectRules`** | **0** | **0,0%** | **Regras vindas do `AGENTS.md`. Zero = não existe `AGENTS.md`** |
| `mcpToolDefinitions` | 0 | 0,0% | Schemas vindos de servidores MCP |

`projectRules: 0` é o achado central: **76% do overhead é ferramenta e skill, e a
única fatia que carregaria conhecimento do projeto está zerada.**

---

## `tasks[].messages[]`

Conversa em ordem cronológica. No baseline: 21 mensagens — 1 `system`, 1 `user`,
5 `assistant`, 14 `tool`.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | string | Hash hex |
| `role` | `system` \| `user` \| `assistant` \| `tool` | |
| `createdAt` | number | Epoch ms. **É o mesmo valor para todas as mensagens** (carimbo do export). Para ordenar no tempo use `data._meta.timestamp` |
| `data` | object | Conteúdo e telemetria; repete `id` e `role` |

### Formato de `data` por role

| role | Campos de `data` |
|---|---|
| `system` | `content`, `_meta` |
| `user` | `content`, `envContext`, `availableTools[]`, `_meta` |
| `assistant` | `content`, `_meta` (com `spend`), e **ou** `toolCalls[]` **ou** `stop: true` |
| `tool` | `content`, `toolUsage`, `_meta` (com `durationMs`, sem `spend`) |

### `_meta`

| Campo | Onde aparece | Observação |
|---|---|---|
| `timestamp` | todas | Epoch ms. **Este é o relógio confiável** |
| `spend.cost` | só `assistant` | Custo do turno |
| `spend.contextTokens` | só `assistant` | Contexto acumulado naquele turno — a série temporal da pressão de contexto |
| `spend.reasoningTokens` | só `assistant` | `0` no baseline |
| `durationMs` | só `tool` | Duração da ferramenta. **Duração absurda numa ferramenta trivial = espera por aprovação humana**, não lentidão |

### `data.envContext` e `data.availableTools[]`

Só na primeira mensagem `user`. `envContext` traz um `<git_status_snapshot>` do
início da conversa. `availableTools[]` lista os nomes das ferramentas ligadas —
**é o que permite cruzar `toolDefinitions` com ferramentas que nunca foram usadas.**

### `data.toolCalls[]`

Presente em mensagens `assistant`.

| Campo | Observação |
|---|---|
| `id` | `"tooluse_…"`. Correlaciona com `toolUsage.signature.id` |
| `name` | `list_files`, `read_file`, `write_file`, `apply_diff`, `execute_command`, `update_todo_list`, `use_skill`, … |
| `arguments` | Objeto. Ferramentas de arquivo trazem `path`; `execute_command` traz `command` e `cwd` |

**Um turno `assistant` pode conter vários `toolCalls` em paralelo** — no baseline, o
primeiro turno tem 6. Detector que assume uma chamada por turno erra a conta.

### `data.toolUsage`

Presente em mensagens `tool`.

| Campo | Observação |
|---|---|
| `signature.id` | Mesmo `id` do `toolCall` |
| `signature.name` / `signature.arguments` | Ferramenta e argumentos efetivos |
| `signature.isError` | **`true` = falhou.** Base do detector de retry |
| `labels` | `displayName`, `running`, `success`, `error` — strings de UI com placeholders `{path}` |
| `permission` | `read` \| `edit` \| `execute` \| **`todo`** |
| `isOutsideWorkspace` | boolean |

> `todo` é uma quarta permissão, não prevista no briefing. `update_todo_list` a usa,
> e responde por 6 das 14 chamadas de ferramenta do baseline.

---

## Mapa: campo → o que o Hindsight faz com ele

| Fase | Campo de origem | Uso |
|---|---|---|
| F2 · Observe | `data._meta.spend.cost` | Custo por turno (só `assistant`) |
| F2 · Observe | `data._meta.spend.contextTokens` | Curva de crescimento do contexto |
| F2 · Observe | `data._meta.timestamp` | Duração e latência entre turnos |
| F2 · Observe | `messages[].role` | Contagem de turnos |
| F2 · Observe | `toolCalls[].name` / `.arguments` | Sequência de tool calls |
| F2 · Observe | `toolUsage.signature.isError` | Taxa de erro por ferramenta |
| F2 · Observe | `costs.contextWindowBreakdown.breakdown` | Tabela de decomposição, % sobre `total` |
| F3 · Diagnose | `toolCalls[].arguments.path` repetido | Releitura redundante |
| F3 · Diagnose | `isError: true` seguido da mesma ferramenta | Retry após falha |
| F3 · Diagnose | `role: user` depois da primeira | Intervenção humana = regra faltando |
| F3 · Diagnose | `breakdown.projectRules === 0` | Ausência de `AGENTS.md` |
| F4 · Prescribe | achados acima | Seções do `AGENTS.md` gerado |
| F5 · Verify | `costs` das duas rodadas | Tabela de delta |

### Sinais extras que o export oferece de graça

Não estavam no plano e saem sem esforço:

- **`availableTools[]` × `toolCalls[].name`** — ferramenta ligada e nunca usada.
  `toolDefinitions` é 51,8% do overhead; cada ferramenta desligada é ganho direto.
- **`skills: 1541` com `loadedSkills: []`** — 14,8% do overhead em Skill que a sessão
  não declarou ter usado.
- **`durationMs` alto em ferramenta trivial** — tempo parado esperando aprovação humana.
- **`env.task[]`** — a todo list que o agente montou sozinho; comparar com a da
  Rodada B mostra mudança de plano, não só de custo.

---

## Sessões com subtask — array de mensagens aninhado

Descoberto ao rodar uma sessão com `start_subtask` (não aparece no baseline).

Quando o agente delega com `start_subtask`, o transcript da subtask é embutido
**dentro da mensagem pai**, num array aninhado:

```
tasks[].messages[].data.messages[]        ← transcript da subtask
tasks[].messages[].data.messages[]._meta.fileMtimes   ← caminhos absolutos nas CHAVES
```

Três consequências:

1. **A subtask não vira uma task separada.** O export continua com uma única entrada
   em `tasks[]`, com `parentId: null`. A invariante I-5 (excluir subtasks da
   agregação) **nunca dispara com dado real** no formato v1.
2. **Qualquer redação que só varra `tasks[].messages[]` tem ponto cego.** O
   `scripts/redact-demo-fixture.jq` precisou de uma passada final com `walk` para
   alcançar esse nível.
3. `_meta.fileMtimes` guarda caminhos absolutos nas **chaves** do objeto, que um
   `gsub` sobre valores não alcança.

## Armadilhas conhecidas

- **Timestamps são epoch ms.** Não são ISO-8601.
- **`messages[].createdAt` é inútil para ordenar** — vem igual em todas. Use `data._meta.timestamp`.
- **`gitSha` e `gitBranch` vêm nulos.** O "mesmo commit nas duas rodadas" não é
  auditável pelo export; registre o SHA à mão junto do screenshot.
- **`status` fica `"active"` mesmo em task concluída.** Use `stop: true` na última
  mensagem `assistant`.
- **Um turno `assistant` carrega vários `toolCalls`.** Correlacione pelo `id`, nunca
  pela ordem.
- **`_meta.spend` só existe em `assistant`.** `tool` e `user` não têm `spend`;
  código que faz `data._meta.spend.cost` sem guarda quebra.
- **`total` ≠ `reportedTotal` e isso é esperado** (overhead fixo vs. contexto total).
- **`title` é o prompt inteiro**, com quebras de linha. Truncar para exibir.

---

## Diferenças em relação ao briefing

| Briefing | Realidade |
|---|---|
| Timestamps ISO-8601 | Epoch em milissegundos |
| `task.gitSha`, `task.gitBranch` populados | Vêm `null` |
| `permission` ∈ {read, edit, execute} | Existe também `todo` |
| `task` sem mais campos | Tem `firstMessage`, `env`, `messageQueue`, `lastError`, `isPinned`, `version` |
| `contextWindowBreakdown` sem mais campos | Tem `key`; `loadedSkills` fica ao lado de `total`/`reportedTotal` |
| `messages[].data` só com os campos listados | Tem também `id`, `role`, `envContext`, `availableTools[]`, `stop` |
| `toolUsage` só com `signature` e `permission` | Tem também `labels` e `isOutsideWorkspace` |
| `total` ≈ `reportedTotal` | Diferem por construção: `10439` vs `17584` |
