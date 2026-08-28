# Análise da Rodada A (baseline)

Leitura de [`benchmark/rodada-a.json`](../benchmark/rodada-a.json), o export real do
baseline. Escrita antes de qualquer detector existir, direto do arquivo.

---

## Números

| Métrica | Valor |
|---|---|
| Custo total | **US$ 0,336902** |
| Contexto final (`reportedTotal`) | **17.584 tokens** |
| Overhead fixo (`breakdown.total`) | **10.439 tokens** |
| Conversa (`reportedTotal − total`) | 7.145 tokens |
| Mensagens | 21 — 1 `system`, 1 `user`, 5 `assistant`, 14 `tool` |
| Turnos do assistente | **5** |
| Chamadas de ferramenta | **14** |
| Chamadas com erro (`isError: true`) | **0** |
| Intervenções humanas | **0** |
| Falhas de build | **0** |
| Duração | 1787957770244 → 1787958336489 ≈ **9 min 26 s** |

Sequência: um turno de 6 chamadas em paralelo para investigar (`list_files`,
`read_file` × 3, `update_todo_list`) → escreve o `Dockerfile` → `docker build` →
`docker run` → `curl -X POST /api/todos` → `stop`. Reto, sem volta.

## Decomposição da janela

| Origem | Tokens | % de 10.439 |
|---|---:|---:|
| `toolDefinitions` | 5403 | 51,8% |
| `toolSystemPrompts` | 2470 | 23,7% |
| `skills` | 1541 | 14,8% |
| `staticSections` | 563 | 5,4% |
| `baseRules` | 197 | 1,9% |
| `customInstructions` | 160 | 1,5% |
| `environment` | 71 | 0,7% |
| `roleDefinition` | 34 | 0,3% |
| **`projectRules`** | **0** | **0,0%** |
| `mcpToolDefinitions` | 0 | 0,0% |

---

## Detectores da Fase 3 contra este log

| Detector | Achados | Evidência |
|---|---|---|
| Releitura redundante | **0** | Cada `path` aparece uma vez só |
| Retry após falha | **0** | Nenhum `isError: true` no arquivo inteiro |
| Intervenção humana | **0** | Uma única mensagem `role: user`, a primeira |
| `projectRules` zerado | **1** | `breakdown.projectRules === 0` |

**Um de quatro detectores dispara.**

---

## O problema com este baseline

A hipótese do experimento era o atrito documentado pela IBM: `npm ci` falhando por
falta de `package-lock.json`. **Esse atrito não existe neste repositório.** O
`list_files` do primeiro turno mostra `package-lock.json` presente, e o Bob acertou
o Dockerfile de primeira.

O baseline saiu **limpo**: zero erro, zero retry, zero intervenção. Não há
desperdício de execução para o `AGENTS.md` remover.

Consequência direta: **na régua atual do `METRICS.md` — turnos, intervenções, falhas
de build — a Rodada B não tem de onde melhorar.** O delta daria zero, ou ruído.

## Desvio de protocolo

`approvalConfig.allowed_permissions` veio **`["read", "todo", "execute"]`**. A regra 4
do [`METRICS.md`](../benchmark/METRICS.md) manda deixar **só `read`** ligado nas duas
rodadas.

Não invalida o baseline sozinho — mas a Rodada B **precisa rodar com exatamente esta
mesma configuração**, `["read","todo","execute"]`, e não com `["read"]`. Se a
comparação mudar a permissão, muda mais de uma variável e o resultado não vale.
O mais barato é atualizar a regra 4 do `METRICS.md` para refletir o que de fato
rodou, em vez de tentar reproduzir o baseline.

Há também `taskCommandApprovals` com `docker build -t express-todo-api-modern .`
aprovado na task, e um `durationMs` de **128 s** num `update_todo_list` (ferramenta
instantânea) — tempo parado esperando aprovação humana. Isso é medível e some com
auto-approve, mas é atrito de UI, não de configuração do agente.

---

## Onde ainda existe delta real

O baseline não desperdiça **execução**, mas desperdiça **contexto**. Isso é medível e
é a tese original do projeto:

1. **`toolDefinitions` = 5.403 tokens, 51,8% do overhead.** `availableTools[]` na
   primeira mensagem `user` lista as ferramentas ligadas; `toolCalls[].name` lista as
   usadas. A diferença é imposto pago em toda sessão. **Cruzar as duas listas é o
   achado mais forte do log** e nenhum dos quatro detectores planejados o pega.
2. **`skills` = 1.541 tokens com `loadedSkills: []`.** 14,8% do overhead em Skill que
   a sessão não declarou ter usado.
3. **`projectRules` = 0.** O achado central continua de pé.

Somados, 1 e 2 são **6.944 tokens, 66,5% do overhead fixo** — pagos em toda sessão,
antes de o agente ler uma linha de código.

## Recomendação

Três caminhos, do mais barato ao mais caro:

1. **Mudar a métrica principal, manter o baseline.** O pitch vira redução de overhead
   de contexto (tokens de entrada, custo por turno, `%` de janela ocupada antes do
   primeiro token útil) em vez de turnos e intervenções. Aproveita 100% do que já
   está medido e o `rodada-a.json` continua válido. Exige um quinto detector —
   ferramenta ligada e não usada — que é trivial e sai dos campos que já temos.
2. **Trocar a tarefa-benchmark** por uma com atrito real e não documentado, como o
   próprio `METRICS.md` já previa na seção "Alternativa sem Docker". Custa uma
   Rodada A nova.
3. **Manter tudo** e aceitar que o delta de turnos/intervenções virá perto de zero.
   Não recomendo: é o número que iria para o vídeo.

O caminho 1 preserva a janela que está fechando. A decisão é do Heitor.
