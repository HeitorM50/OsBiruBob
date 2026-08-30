# Rodada B — registro de tentativas

Toda tentativa fica registrada, inclusive as inválidas. Sessão ruim é dado, e
omitir uma tentativa invalidaria o experimento tanto quanto quebrar uma regra.

---

## Tentativa 1 — 30/08/2026, ~02:46 — **INVÁLIDA**

### Motivo

`approvalConfig.allowed_permissions` divergiu da Rodada A:

```text
Rodada A:            ["read", "todo", "execute"]
Tentativa 1:         ["read", "skill", "execute", "todo"]
```

O auto-approve de `skill` ficou ligado no painel do Bob IDE. Isso é uma segunda
variável alterada, e a regra 4 do `benchmark/METRICS.md` exige configuração de
auto-approve idêntica entre as rodadas.

### Materialidade apurada

O desvio foi verificado e é **inerte**, mas a tentativa foi descartada mesmo assim:

| Verificação | Resultado |
|---|---|
| `use_skill` disponível na sessão | **Não** — o modo `hindsight-benchmark` não inclui o grupo `skill` |
| `use_skill` chamada | Não |
| `loadedSkills` | `[]` |

A permissão auto-aprovava uma ferramenta que não existia na sessão, então não havia
caminho pelo qual pudesse alterar o comportamento do agente. Ainda assim, a regra é
a regra: **a tentativa não foi aproveitada.**

A causa raiz é que o auto-approve do Bob IDE é uma configuração **global**,
independente dos grupos declarados no modo customizado. O
`.bob/custom_modes.yaml` estava correto — não declara `skill`.

### Validações que passaram nesta tentativa

Prompt idêntico (400 bytes, SHA-256 conferido), `projectRules > 0`, `stop: true`,
`modeId: hindsight-benchmark`, `loadedSkills: []`, `mcpToolDefinitions: 0`, commit
do benchmark inalterado, screenshot sem dado sensível.

### Evidências preservadas

```text
bob_sessions/Heitor/osbirubob_task02_rodada-b-tentativa-invalida.raw-export.json   (não versionado)
bob_sessions/Heitor/osbirubob_task02_rodada-b-tentativa-invalida_export.json       (sanitizado)
bob_sessions/Heitor/osbirubob_task02_rodada-b-tentativa-invalida_summary.png
```

### Correção aplicada

Somente correção de **aplicação da configuração**, permitida pelo plano. Nenhuma
configuração foi otimizada com base em números observados — os deltas não foram
analisados nesta tentativa, e continuam sendo escopo da issue #20.

Ação: desmarcar `skill` no painel Auto-approve do Bob IDE antes da tentativa 2.

### Reset executado antes da tentativa 2

| Ação | Resultado |
|---|---|
| `git checkout .` + `git clean -fd` no benchmark | removidos `.bob/`, `AGENTS.md` e o `Dockerfile` gerado |
| Commit do benchmark | `cb10cdfb809e52bde0b1ba176c327f9eec107cd9`, inalterado |
| Container `todo-api-modern` | removido |
| Imagem `todo-api-modern:latest` | removida |
| Cache global do Docker | **preservado** — contém dados de outros projetos. Reuso de camadas fica registrado como limitação |
| Config congelada reaplicada | SHA-256 conferido contra `round-b-config/` |

> **Nota de nomes.** O `MANIFEST.md` previa remover o container `todo-api` e a
> imagem `express-todo-api-modern:latest`. Os nomes reais criados pela rodada são
> `todo-api-modern` para ambos. Foram esses os removidos.

---

## Tentativa 2 — 30/08/2026, ~03:10 — **VÁLIDA**

Rodada B oficial. Única mudança em relação à tentativa 1: `skill` desmarcado no
painel Auto-approve do Bob IDE.

### Validação automática — 11 de 11 critérios

| Critério | Evidência |
|---|---|
| `allowed_permissions` igual à Rodada A | `["read","execute","todo"]` — mesmo conjunto de três permissões |
| Título da task com 400 bytes | 400 bytes |
| SHA-256 do prompt | `254e160afaa93d0e7be3cdfa4d60aee90e22c01f0257e5490d877eaef412c3fd` |
| Prompt byte a byte igual a `task.txt` | sim |
| `firstMessage` idêntico ao título | sim |
| `projectRules > 0` | **121 tokens** |
| Conclusão por `stop: true` | sim |
| Modo customizado ativo | `modeId: hindsight-benchmark` |
| Nenhuma Skill carregada | `loadedSkills: []` |
| Nenhum MCP | `mcpToolDefinitions: 0`, `taskAllowedMcpTools: []` |
| Nenhuma intervenção humana | 1 única mensagem `user`, o prompt |

Commit do benchmark na execução: `cb10cdfb809e52bde0b1ba176c327f9eec107cd9`.

> **Nota sobre a ordem das permissões.** A Rodada A serializou
> `["read","todo","execute"]` e a Rodada B `["read","execute","todo"]`. A comparação
> foi feita como **conjunto**, não como lista ordenada: são as mesmas três
> permissões, e a ordem do array é definida pela serialização da IDE, não pela
> configuração.

### Auditoria de segurança

| Item | Resultado |
|---|---|
| Screenshot | sem credencial, caminho absoluto, username, terminal ou editor |
| `task id` do print confere com o do export | `3f28ecb14253a7fc43125ee26e52bc2b` |
| Export sanitizado | 21.170 bytes; zero caminhos, usernames, e-mails ou tokens |
| Conteúdo de mensagens no sanitizado | 0 mensagens com `content` não redigido |
| Export bruto | não versionado (`.gitignore:137`, padrão `*.raw-export.json`) |

### Evidências

```text
bob_sessions/Heitor/osbirubob_task02_rodada-b-otimizada.raw-export.json   (não versionado)
bob_sessions/Heitor/osbirubob_task02_rodada-b-otimizada_export.json       (sanitizado)
bob_sessions/Heitor/osbirubob_task02_rodada-b-otimizada_summary.png
```

### Limitações registradas

- **Cache do Docker.** Só o container e a imagem `todo-api-modern` foram removidos
  antes da rodada. O cache global foi preservado por conter dados de outros
  projetos, então reuso de camadas de base é possível nas duas rodadas.
- **Métricas exclusivas do screenshot.** O summary desta versão do Bob exibe
  Context Length e Bobcoins, mas não Tokens ↑/↓ nem Cache ↑/↓. O print da Rodada A
  tem exatamente a mesma limitação, então as duas rodadas ficam sem essas métricas
  e a comparação permanece simétrica. Registrar como indisponível, nunca como zero.
- **`gitSha` vem `null`** no export. O commit foi conferido manualmente antes e
  depois da execução.

### Disciplina do experimento

Nenhum delta foi analisado nesta issue. Os únicos números observados fora do
escopo de validação foram Context Length e Bobcoins, vistos ao auditar o
screenshot em busca de dado sensível — auditoria obrigatória — e não usados para
nenhuma decisão. A configuração não foi refinada após a execução.

A análise dos deltas é escopo da issue #20.
