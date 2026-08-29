# Contrato de métricas — Hindsight

O que medimos, de onde vem, e o que significa. As duas rodadas usam esta régua.

---

## Métricas coletadas

A régua tem duas famílias, e a diferença importa: **o que o export JSON entrega** é
calculado pela ferramenta e é auditável; **o que só existe no screenshot** é
preenchido à mão e não pode ser derivado.

### Do export — calculadas pelo Hindsight

| # | Métrica | Campo de origem | Interpretação |
|---|---|---|---|
| 1 | **API Cost** | `task.costs.cost` | Custo direto da tarefa. Menor é melhor |
| 2 | **Overhead fixo** | `contextWindowBreakdown.total` | Tokens de system prompt, ferramentas e skills, **pagos antes de ler uma linha de código**. Menor é melhor |
| 3 | **Tokens de conversa** | `reportedTotal − total` | O que a conversa em si ocupou |
| 4 | **Contexto reportado** | `contextTokens` / `reportedTotal` | Contexto total no fim da task |
| 5 | **Ferramentas disponíveis vs. usadas** | `availableTools[]` × `toolCalls[].name` | **Ferramenta ligada e nunca chamada é imposto pago em toda sessão.** No baseline: 18 de 23 ociosas (78%) |
| 6 | **Skill paga sem uso** | `breakdown.skills` com `loadedSkills: []` | Overhead de Skill que a sessão não declarou usar |
| 7 | **`projectRules`** | `breakdown.projectRules` | Zero significa que não existe `AGENTS.md` |
| 8 | **Turnos** | mensagens `role: assistant` | Idas e vindas até concluir. Menor é melhor |
| 9 | **Intervenções humanas** | mensagens `role: user` após a primeira | **Cada uma é uma regra faltando no AGENTS.md** |
| 10 | **Tool calls com erro** | `toolUsage.signature.isError` | Tentativa e erro |
| 11 | **Comandos externos** | `execute_command` | Cada um é candidato a virar ferramenta de MCP |

### Só do screenshot — preenchimento manual

| # | Métrica | Origem | Por que não sai do export |
|---|---|---|---|
| 12 | **Tokens ↑ / ↓** | Screenshot do summary | **Não existem no export.** `_meta.spend` só traz `cost`, `contextTokens` e `reasoningTokens` |
| 13 | **Cache ↑ / ↓** | Screenshot do summary | **Não existem no export.** Nenhum campo de cache é exportado |
| 14 | **Context Length %** | Screenshot do summary | O export não traz o tamanho máximo da janela; o screenshot mostra `x / 270.0k` |
| 15 | **Falhas de build** | Contagem manual | Não derivável. O proxy possível é `execute_command` com `isError: true`, e usá-lo precisa ser declarado |

> **Regra:** métrica indisponível é registrada como **indisponível**, nunca como `0`.
> O `ObserveReport` as declara em `unavailableMetrics`
> (ver [`docs/domain-model.md`](../docs/domain-model.md), Modelo 6).

### Métrica principal do pitch

**Redução de overhead de contexto — métricas 2, 5 e 6.**

A escolha não é preferência, é o que o baseline permite. A Rodada A terminou com
**zero retries, zero erros e zero intervenções humanas**
(ver [`docs/analise-rodada-a.md`](../docs/analise-rodada-a.md)): o atrito de execução
que o experimento esperava — `npm ci` sem `package-lock.json` — não existe neste
repositório. Não há delta de turnos ou de intervenções a extrair, porque não houve
desperdício de execução para remover.

O desperdício que **existe** é de contexto: `toolDefinitions` + `skills` somam
**6.944 tokens, 66,5% do overhead fixo**, pagos em toda sessão, com 78% das
ferramentas nunca chamadas e `projectRules` em zero.

As métricas 8 a 10 continuam medidas e reportadas — inclusive se derem zero. Delta
que não apareceu também é resultado, e escondê-lo invalidaria o experimento.

---

## Regras do experimento

Quebrar qualquer uma destas invalida a comparação.

1. **Prompt idêntico** nas duas rodadas — caractere por caractere, copiado de `task.txt`
2. **Mesmo commit de partida** — resetar com `git checkout .` e remover arquivos não rastreados, nunca "desfazer na mão"
3. **Mesma pessoa** executando as duas rodadas
4. **Mesma configuração de auto-approve** — a Rodada A rodou com
   `allowed_permissions: ["read", "todo", "execute"]`, registrado em
   `rodada-a.json`. **A Rodada B precisa repetir exatamente isso.** Reproduzir a
   intenção original (`["read"]`) mudaria uma segunda variável e invalidaria a
   comparação: o baseline é o que aconteceu, não o que estava planejado
5. **Nova conversa** no início de cada rodada, para limpar a janela de contexto
6. **Screenshot de toda rodada**, inclusive as que derem errado — sessão ruim é dado

---

## Rodada A — baseline

Estado do repositório: **virgem**.

- Sem `AGENTS.md` na raiz
- Sem pasta `.bob`
- Sem modo customizado
- Sem Skill

**Não rodar `/init` antes desta rodada.** Uma vez rodado, o baseline não volta.

**Executada.** Resultado em [`docs/analise-rodada-a.md`](../docs/analise-rodada-a.md).

Atrito esperado (documentado pela IBM no quickstart do Bob):
- o build falharia porque não existe `package-lock.json`, e o `npm ci` do Dockerfile
  precisaria virar `npm install`

**Esse atrito não se materializou.** O `package-lock.json` existe neste repositório,
o Bob acertou o Dockerfile de primeira, e a rodada terminou com 5 turnos, 0 erros,
0 retries e 0 intervenções humanas.

O baseline, portanto, não desperdiça **execução** — desperdiça **contexto**:
10.439 tokens de overhead fixo, 78% das ferramentas nunca chamadas, 1.541 tokens de
Skill sem uso declarado e `projectRules` em zero. É esse o desperdício que a Rodada B
precisa reduzir.

---

## Rodada B — com a config gerada pelo Hindsight

Mesmo commit, mesmo prompt, mesma pessoa. A única variável que muda é a configuração gerada pela ferramenta:

- `AGENTS.md` na raiz, com o contexto que faltava
- Regras por modo, se aplicável
- Modo customizado ou Skill, se aplicável

**Hipótese registrada antes da execução** (exigência do portão F4):

| Métrica | Esperado na Rodada B |
|---|---|
| `projectRules` | sai de `0` — o `AGENTS.md` passa a ser carregado |
| Overhead fixo | **cai**, se as ferramentas ociosas forem desligadas |
| Ferramentas ociosas | cai de 18 para perto de zero |
| Skill paga sem uso | cai, se a Skill for desligada |
| Turnos, erros, intervenções | **permanecem em 5 / 0 / 0** — não há o que melhorar |

Registrar a hipótese antes evita escolher a métrica depois de ver o número que
favorece. Se o overhead **não** cair, isso entra no resultado do mesmo jeito.

---

## Tabela de resultado

Preencher e commitar. É esta tabela que vai para o vídeo.

### Do export — preenchida pelo Hindsight

| Métrica | Rodada A (baseline) | Rodada B (otimizada) | Delta |
|---|---|---|---|
| API Cost | 0.336902 | | |
| **Overhead fixo** | **10.439** | | |
| Tokens de conversa | 7.145 | | |
| Contexto reportado | 17.584 | | |
| **Ferramentas ociosas** | **18 de 23 (78%)** | | |
| Skill paga sem uso | 1.541 | | |
| `projectRules` | 0 | | |
| Turnos | 5 | | |
| Intervenções humanas | 0 | | |
| Tool calls com erro | 0 | | |
| Comandos externos | 3 | | |

### Só do screenshot — preenchimento manual

| Métrica | Rodada A (baseline) | Rodada B (otimizada) | Delta |
|---|---|---|---|
| Tokens ↑ | | | |
| Tokens ↓ | | | |
| Cache ↓/↑ (razão) | | | |
| Context Length % | 7% (18.4k / 270.0k) | | |
| Falhas de build | 0 | | |

As linhas em negrito são as candidatas ao pitch. A escolha final só é feita depois
de ver os números da Rodada B — mas as métricas de execução (turnos, intervenções,
erros) já vieram zeradas no baseline, então o delta honesto e compreensível em dez
segundos deve sair do overhead de contexto.

**Reportar também o que não melhorou.** Uma métrica que ficou igual, ou que
regrediu, entra na tabela do mesmo jeito.

---

## Repositório-benchmark

- Clone: `https://github.com/IBM/bob-demo.git`
- Projeto: `bob-get-started/express-todo-api-modern`
- Requer Docker (ou Podman) instalado

**Alternativa sem Docker:** se o Docker for um problema no ambiente de alguém, trocar a tarefa por uma que force o mesmo tipo de descoberta — por exemplo, pedir para rodar a suíte de testes e corrigir a primeira falha. O importante é existir um atrito não documentado que o AGENTS.md consiga eliminar.
