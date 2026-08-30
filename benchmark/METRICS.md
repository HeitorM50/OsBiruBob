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

### Do export — gerada pelo Hindsight

```bash
npx tsx src/cli.ts --compare benchmark/rodada-a.json benchmark/rodada-b.json
```

`Comparison.valid === true` — protocolo do experimento auditado.

| Métrica | Rodada A (baseline) | Rodada B (otimizada) | Delta |
|---|---:|---:|---:|
| API Cost | $0,336902 | $0,270606 | **−$0,066296 (−19,7%)** |
| **Overhead fixo** | **10.439** | **7.740** | **−2.699 (−25,9%)** |
| Tokens de conversa | 7.145 | 5.811 | −1.334 (−18,7%) |
| Contexto reportado | 17.584 | 13.551 | −4.033 (−22,9%) |
| **Ferramentas ociosas** | **18 de 23 (78%)** | **12 de 17 (71%)** | −6 ferramentas |
| Skill paga sem uso | 1.541 | 826 | −715 (−46,4%) |
| `projectRules` | **0** | **121** | +121 |
| Turnos | 5 | 6 | **+1 (regressão)** |
| Intervenções humanas | 0 | 0 | 0 |
| Tool calls com erro | 0 | 0 | 0 |
| Comandos externos | 3 | 4 | +1 |
| Duração | 566 s | 1.338 s | **+772 s (regressão)** |

### Só do screenshot — preenchimento manual

| Métrica | Rodada A (baseline) | Rodada B (otimizada) | Delta |
|---|---|---|---|
| Tokens ↑ | indisponível | indisponível | — |
| Tokens ↓ | indisponível | indisponível | — |
| Cache ↓/↑ (razão) | indisponível | indisponível | — |
| Context Length % | 7% (18.4k / 270.0k) | 5% (13.6k / 270.0k) | −2 p.p. |
| Falhas de build | 0 | 0 | 0 |

O summary desta versão do Bob não exibe Tokens ↑/↓ nem Cache ↑/↓. A limitação é
**simétrica** entre as rodadas, então não compromete a comparação — mas essas
métricas ficam registradas como indisponíveis, nunca como zero.

### Métrica principal escolhida

**Redução de overhead de contexto: −25,9%.** Apoio: custo, −19,7%.

Escolhida depois de ver os números, e não por ser a mais favorável: tem delta grande,
causa rastreável (`projectRules` saiu de zero, `toolSystemPrompts` caiu 81,5%) e
cabe em dez segundos — "o agente carregava 10.439 tokens antes de ler uma linha do
seu código; agora carrega 7.740".

Turnos e intervenções foram descartados: o baseline já tinha zero retry, zero erro e
zero intervenção, e turnos **regrediram**.

### A hipótese registrada errou

O portão da F4 exigia registrar a hipótese antes de executar. A previsão era que
desligar ferramentas derrubaria `toolDefinitions`. **Não derrubou** — ficou em 5.403
nas duas rodadas. Quem caiu foi `toolSystemPrompts`, −81,5%, responsável por 75% da
economia total.

A estimativa de 235 tokens por ferramenta previa 1.410 tokens de economia ao remover
6 ferramentas; a economia real em `toolDefinitions` foi **zero**. É a confirmação
prática do invariante I-6: estimativa é hipótese, e a Rodada B é o que a mede.

**O que não melhorou está na tabela.** Turnos e duração regrediram e continuam
reportados. Análise completa em [`docs/analise-rodada-b.md`](../docs/analise-rodada-b.md).

---

## Repositório-benchmark

- Clone: `https://github.com/IBM/bob-demo.git`
- Projeto: `bob-get-started/express-todo-api-modern`
- Requer Docker (ou Podman) instalado

**Alternativa sem Docker:** se o Docker for um problema no ambiente de alguém, trocar a tarefa por uma que force o mesmo tipo de descoberta — por exemplo, pedir para rodar a suíte de testes e corrigir a primeira falha. O importante é existir um atrito não documentado que o AGENTS.md consiga eliminar.
