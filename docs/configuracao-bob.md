# Configuração do IBM Bob para implementar o Hindsight

Procedimento reproduzível para reduzir o overhead fixo das sessões de implementação
das fases F2 a F4. Esta medição é separada das Rodadas A/B do benchmark em
`benchmark/`: não substitua `rodada-a.json` nem `rodada-b.json` com estes exports.

## Estado da evidência

Medição executada em 29/08/2026. Os números abaixo vêm dos exports sanitizados em
`bob_sessions/Heitor/`; não são valores do baseline do repositório `IBM/bob-demo`,
que não tinha o `AGENTS.md` deste projeto e responde a outro experimento.

| Critério | Estado | Evidência |
|---|---|---|
| Modo customizado | configurado | `.bob/custom_modes.yaml` |
| Skills recorrentes | configuradas | `.bob/skills/*/SKILL.md` |
| AGENTS.md carregado | confirmado | `projectRules = 2.092` nos dois exports |
| Modo usado | confirmado | `modeId = "hindsight-implementation"` no “depois” |
| Skill usada | confirmado | `implement-pipeline-module`, 276 tokens carregados |
| Ferramentas disponíveis | melhorou | 23 → 18 (`−5`; `−21,7%`) |
| `toolDefinitions` | regrediu | 5.347 → 5.445 (`+98`; `+1,8%`) |
| Overhead fixo total | melhorou | 12.471 → 10.062 (`−2.409`; `−19,3%`) |
| Export e summary “antes” | concluído | JSON sanitizado + PNG em `bob_sessions/Heitor/` |
| Export e summary “depois” | concluído | JSON sanitizado + PNG em `bob_sessions/Heitor/` |

Artefatos versionados:

- [`osbirubob_task00_selfhost-before_export.json`](../bob_sessions/Heitor/osbirubob_task00_selfhost-before_export.json)
- [`osbirubob_task04_selfhost-before_summary.png`](../bob_sessions/Heitor/osbirubob_task04_selfhost-before_summary.png)
- [`osbirubob_task00_selfhost-after_export.json`](../bob_sessions/Heitor/osbirubob_task00_selfhost-after_export.json)
- [`osbirubob_task05_selfhost-after_summary.png`](../bob_sessions/Heitor/osbirubob_task05_selfhost-after_summary.png)

## Configuração aplicada

O modo de projeto `hindsight-implementation` está em
`.bob/custom_modes.yaml`. Ele habilita somente os grupos necessários:

- `read`: leitura, listagem e busca no repositório;
- `edit`: criação e alteração de código, testes e fixtures;
- `execute`: `npm test` e `npm run typecheck`;
- `todo`: acompanhamento de issues com várias etapas;
- `skill`: carregamento sob demanda das Skills do projeto.

Ficam omitidos `mcp`, `workflow`, `mode`, `subtask` e `subagent`. O baseline de
`benchmark/rodada-a.json` já registra `mcpToolDefinitions: 0`; omitir `mcp` evita que
uma configuração pessoal conectada entre depois no experimento.

O Bob configura ferramentas por **grupo**, não por nome. Por isso, `read` também
pode expor helpers de símbolos e `edit` pode expor `search_and_replace`, mesmo que
não sejam chamados. A medição confirmou essa limitação: cinco ferramentas saíram,
mas 18 continuaram disponíveis e 13 delas ficaram ociosas. Não declare uma
ferramenta desligada apenas porque seu nome não aparece no YAML.

As Skills são carregadas uma vez por conversa, sob demanda:

| Skill | Quando usar |
|---|---|
| `implement-pipeline-module` | toda issue de parser, observe, diagnose ou prescribe |
| `create-synthetic-fixture` | detectores cujo sinal não existe no baseline real |
| `close-issue-with-evidence` | verificação final e relato do Definition of Done |

No Bob IDE, confie explicitamente no workspace. Um workspace não confiável ignora
o `AGENTS.md`, os modos e as Skills de projeto. Em **Settings → Skills**, mantenha
“Allow Bob to use this skill” ligado para estas três Skills e desligue Skills globais
ou instaladas que não serão usadas. Em **Settings → MCP**, desligue todos os
servidores para esta medição. Não altere auto-approve entre as duas sessões.

Referências de formato: [Custom modes](https://bob.ibm.com/docs/ide/configuration/custom-modes),
[Skills](https://bob.ibm.com/docs/ide/features/skills),
[Custom rules](https://bob.ibm.com/docs/ide/configuration/rules) e
[Workspace trust](https://bob.ibm.com/docs/ide/security/workspace-trust).

## Protocolo antes/depois

Use a mesma pessoa, o mesmo estado dos arquivos de produto, uma conversa nova e o
prompt abaixo, caractere por caractere. A alteração pedida é um teste de contrato F0;
ela não implementa nenhuma linha das fases F2 a F6.

```text
Em src/domain/types.test.ts, importe o tipo EpochMs e adicione um teste de tipo que aceite um timestamp numérico e rejeite uma string com @ts-expect-error. Não altere código de produção. Rode npm test e npm run typecheck.
```

### 1. Antes

1. Abra no Bob IDE o commit que contém o `AGENTS.md`, mas ainda não contém `.bob/`
   (neste histórico: `be55758`). Confirme que o workspace está confiável.
2. Use o modo Agent padrão. Comece uma conversa nova e envie o prompt canônico.
3. Exporte a task JSON e capture o summary completo.
4. Salve o export bruto localmente como
   `osbirubob_taskNN_selfhost-before.raw-export.json`. O padrão `*.raw-export.json`
   está ignorado pelo Git.
5. Desfaça somente a alteração produzida pela task antes da sessão seguinte.

O primeiro gate é obrigatório: no export, confira
`tasks[0].task.costs.contextWindowBreakdown.breakdown.projectRules > 0`. Se for
zero, pare. Confirme a confiança do workspace e que a configuração
`bob-code.useAgentRules` não foi desligada; não existe comparação válida ainda.

### 2. Depois

1. Abra o commit com `.bob/custom_modes.yaml` e `.bob/skills/`, com os mesmos arquivos
   de produto do passo anterior.
2. Em **Settings → Modes**, confirme que `Hindsight Implementation` aparece. Em
   **Settings → Skills**, confirme as três Skills de projeto e desligue as demais.
3. Selecione `Hindsight Implementation`, comece uma conversa nova, ative
   `/implement-pipeline-module` e envie exatamente o prompt canônico.
4. Exporte a task, capture o summary e desfaça somente a alteração da task.

Se o orçamento permitir uma terceira sessão, meça o modo customizado antes de
adicionar/ativar as Skills. Assim, o delta “antes → modo” isola ferramentas e o
delta “modo → depois” isola Skills. Sem essa sessão intermediária, registre que o
delta combina as duas mudanças.

### Protocolo efetivamente executado

- Mesma pessoa, duas conversas novas e o mesmo corpo do prompt canônico.
- O “antes” rodou no commit `be55758`, em modo `agent`; o “depois” rodou com os
  artefatos `.bob/`, em modo `hindsight-implementation`.
- O prompt “depois” contém o prefixo `/implement-pipeline-module`; o corpo canônico
  é idêntico, mas as strings completas têm 224 e 251 caracteres.
- Auto-approve ficou ligado nas duas sessões. As permissões passaram de
  `read/edit/execute` para `read/skill/edit/execute`, mudança necessária para ativar
  a Skill.
- Modo e Skill foram medidos juntos; não houve terceira sessão intermediária para
  isolar o efeito de cada um.

Essas diferenças não alteram a leitura do **overhead fixo**, que é exatamente a
configuração medida, mas impedem tratar custo, turnos e contexto de conversa como
um A/B estritamente controlado. Esses números aparecem abaixo como observação, não
como prova de economia de execução.

## Sanitização e nomes dos artefatos

Nunca versione o export bruto. Sanitize-o preservando custos, breakdown, nomes de
ferramentas, `loadedSkills`, `modeId`, timestamps, IDs e indicadores de erro. O
filtro usa allowlist em `data._meta`, pois campos não documentados como `changes`,
`cwd` e `fileMtimes` também podem conter código ou caminhos:

```bash
jq -f scripts/sanitize-bob-export.jq \
  bob_sessions/osbirubob_taskNN_selfhost-before.raw-export.json \
  > bob_sessions/osbirubob_taskNN_selfhost-before_export.json
```

Repita para `after`. Os quatro nomes finais são:

```text
osbirubob_taskNN_selfhost-before_export.json
osbirubob_taskNN_selfhost-before_summary.png
osbirubob_taskNN_selfhost-after_export.json
osbirubob_taskNN_selfhost-after_summary.png
```

Nesta execução, os exports legados da calibração self-hosting ainda usam `task00`.
Os screenshots estão nomeados `task04` para `selfhost-before` e `task05` para
`selfhost-after`, sob `bob_sessions/Heitor/`. Esses números só podem ser tratados
como finais depois de conferidos na lista de tasks do Bob; ordem de commit ou mtime
não prova o ordinal da task. Exports brutos e screenshots originais usam os sufixos
`.raw-export.json` e `.raw-summary.png`; permanecem locais e ignorados pelo Git.

Antes de commitar, o comando abaixo deve terminar com status zero. Ele verifica a
redação obrigatória e não imprime o valor encontrado:

```bash
jq -e '
  .workspace == "file:/[REDACTED]" and
  all(.tasks[];
    .task.title == "[REDACTED]" and
    .task.firstMessage == "[REDACTED]" and
    .task.env.staticEnvInfo.primaryWorkspace == "[REDACTED]" and
    all(.messages[];
      .data.content == "[REDACTED]" and
      ((.data.toolCalls? // []) | all(.arguments == {})) and
      ((if .data.toolUsage? then .data.toolUsage.signature.arguments else {} end) == {})
    )
  )
' bob_sessions/osbirubob_taskNN_selfhost-before_export.json > /dev/null
```

Abra cada PNG antes do commit. O recorte deve mostrar somente o summary, sem
editor, terminal, username, caminho ou prompt. Nesta versão do Bob, o summary
capturado exibiu Context Length e Bobcoins, mas não exibiu Tokens ↑/↓ ou Cache ↑/↓;
essas duas métricas ficam registradas como indisponíveis, nunca como zero.

## Registro dos resultados

Preencha somente com números dos dois exports desta medição. `total` é o overhead
fixo; “Ferramentas disponíveis” é o tamanho de `availableTools[]`; custo vem de
`task.costs.cost`.

Extraia somente esses campos seguros, sem abrir transcript ou argumentos:

```bash
jq -f scripts/extract-bob-overhead.jq \
  bob_sessions/osbirubob_taskNN_selfhost-before_export.json
jq -f scripts/extract-bob-overhead.jq \
  bob_sessions/osbirubob_taskNN_selfhost-after_export.json
```

| Origem | Antes | Depois | Delta (`depois - antes`) |
|---|---:|---:|---:|
| `toolDefinitions` | 5.347 | 5.445 | **+98 (+1,8%)** |
| `toolSystemPrompts` | 2.470 | 456 | **−2.014 (−81,5%)** |
| `skills` | 1.541 | 1.117 | **−424 (−27,5%)** |
| `projectRules` | 2.092 | 2.092 | 0 |
| `total` (overhead fixo) | 12.471 | 10.062 | **−2.409 (−19,3%)** |
| Ferramentas disponíveis | 23 | 18 | **−5 (−21,7%)** |
| Custo da sessão | 0,257164 | 0,318508 | +0,061344 (+23,9%) |

Breakdown complementar: `roleDefinition` caiu 16 tokens,
`customInstructions` caiu 60, `environment` subiu 7 e as demais origens ficaram
iguais. `mcpToolDefinitions` permaneceu zero.

As cinco ferramentas removidas foram `create_html_artifact`, `switch_mode`,
`spawn_subagent`, `start_subtask` e `create_chart`. Nenhuma nova ferramenta apareceu.
Por outro lado, ferramentas esperadas como `read_xlsx`, `search_bob_docs` e
`start_workflow` continuaram em `availableTools[]` por causa da granularidade real
dos grupos do Bob.

## Interpretação e fechamento

A hipótese ampla foi confirmada: a configuração reduziu o overhead fixo em 2.409
tokens por sessão, ou 19,3%, mesmo depois de carregar uma Skill útil. A maior parte
do ganho veio de `toolSystemPrompts`, não de `toolDefinitions`.

A hipótese específica de que menos ferramentas disponíveis produziriam
`toolDefinitions` menor foi **refutada**: cinco ferramentas saíram, mas a categoria
subiu 98 tokens. O resultado negativo é mantido porque a issue exige registrar
regressões em vez de escolher apenas métricas favoráveis.

O custo total também subiu, assim como o contexto reportado (19.705 → 25.190),
porque a sessão “depois” carregou a Skill e teve sete turnos contra quatro. A sessão
“antes” teve duas tool calls com erro e a “depois” nenhuma; por isso esses números de
execução não são usados como prova causal.

Para a submissão: “Configuramos o Bob com a metodologia do próprio Hindsight,
confirmamos o carregamento das regras do projeto e reduzimos 19,3% do overhead fixo.
Também encontramos uma regressão em `toolDefinitions`, que foi preservada como
resultado experimental em vez de ocultada.”

### Checklist de fechamento

- [x] Export “antes” sanitizado e screenshot sem prompt versionados.
- [x] `projectRules > 0` confirmado.
- [x] Modo customizado criado e confirmado por `modeId`.
- [x] Três Skills recorrentes criadas; uma confirmada em `loadedSkills`.
- [x] MCPs ausentes (`mcpToolDefinitions = 0`) e cinco ferramentas removidas.
- [x] Export “depois” sanitizado e screenshot sem prompt versionados.
- [x] Tabela preenchida com números medidos.
- [x] `toolDefinitions` avaliado: regressão de 98 tokens registrada; hipótese
  específica refutada, conforme a regra de preservar resultados negativos.
- [x] Configuração e limitações documentadas para reprodução pelo time.
- [x] Exports sem transcript, argumentos, comandos aprovados ou caminhos privados.
- [x] Métricas ausentes no summary registradas como indisponíveis, não como zero.
