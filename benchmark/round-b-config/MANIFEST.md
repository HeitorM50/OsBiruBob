# Rodada B — configuração congelada

Esta pasta contém a configuração aplicada ao repositório `IBM/bob-demo` antes da
Rodada B. Não altere estes arquivos depois de iniciar a conversa oficial; qualquer
refinamento após observar os números invalidaria o experimento.

## Estado de partida

| Item | Valor congelado |
|---|---|
| Commit do benchmark | `cb10cdfb809e52bde0b1ba176c327f9eec107cd9` |
| Prompt | `benchmark/task.txt`, 400 bytes |
| SHA-256 do prompt | `254e160afaa93d0e7be3cdfa4d60aee90e22c01f0257e5490d877eaef412c3fd` |
| Executor | Heitor, o mesmo da Rodada A |
| Auto-approve | `read`, `todo`, `execute` |
| Conversa | nova, sem contexto herdado |
| SHA-256 de `AGENTS.md` | `875ba7550110f78d64ad0eadffa9a5d074d6ff651cc3441850459c2bf6b05b34` |
| SHA-256 de `custom_modes.yaml` | `afed6bf087e9684fe530a1e73c44a2b62579a254d4389cd28159f17daf5442f7` |

## Configuração aplicada

- `AGENTS.md` é a saída mínima do gerador determinístico para o achado
  `project-rules-absent` do baseline.
- `.bob/custom_modes.yaml` traduz as prescrições de redução para os grupos mínimos
  necessários à tarefa: `read`, `edit`, `execute` e `todo`.
- `edit` permanece disponível para criar o Dockerfile, mas não entra no
  auto-approve.
- O grupo `skill` é omitido e nenhuma Skill de projeto é instalada ou ativada.
- O grupo `mcp` é omitido; o baseline já registrou `mcpToolDefinitions === 0`.
- Skills globais não são desligadas por nome: o export da Rodada A não identifica
  uma Skill concreta como origem dos 1.541 tokens.

## Aplicação no benchmark

Copiar preservando os caminhos:

```text
round-b-config/AGENTS.md                  → <bob-demo>/AGENTS.md
round-b-config/.bob/custom_modes.yaml    → <bob-demo>/.bob/custom_modes.yaml
```

O repositório deve continuar no commit congelado. Os dois caminhos acima ficam
não rastreados no clone do benchmark e representam a única mudança de arquivos em
relação à Rodada A.

## Estado Docker

Antes da Rodada B, remover somente o container `todo-api` e a imagem
`express-todo-api-modern:latest` deixados pela Rodada A. O cache global do Docker
não é apagado porque contém dados de outros projetos; possível reutilização de
cache deve ser registrada como limitação experimental, não escondida.

## Evidência esperada, sem analisar deltas

- `approvalConfig.allowed_permissions` igual a `["read", "todo", "execute"]`;
- título da task byte a byte igual a `benchmark/task.txt`;
- `breakdown.projectRules > 0`;
- `loadedSkills` vazio;
- `mcpToolDefinitions === 0`;
- conclusão derivada de `stop: true`;
- export bruto e screenshot preservados mesmo se a rodada falhar.
