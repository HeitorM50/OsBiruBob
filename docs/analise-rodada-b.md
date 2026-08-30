# Análise da Rodada B (otimizada)

Leitura de [`benchmark/rodada-b.json`](../benchmark/rodada-b.json) contra
[`benchmark/rodada-a.json`](../benchmark/rodada-a.json). Números produzidos pelo
próprio Hindsight (`parser` → `observe`), não medidos à mão.

Protocolo do experimento validado na issue #19: prompt byte a byte idêntico, mesmo
commit `cb10cdfb`, mesma pessoa, mesmo conjunto de permissões de auto-approve, nova
conversa. Registro das tentativas em
[`benchmark/round-b-config/TENTATIVAS.md`](../benchmark/round-b-config/TENTATIVAS.md).

---

## Resultado

| Métrica | Rodada A | Rodada B | Delta | % |
|---|---:|---:|---:|---:|
| **Overhead fixo** | 10.439 | 7.740 | **−2.699** | **−25,9%** |
| **API Cost (US$)** | 0,336902 | 0,270606 | **−0,066296** | **−19,7%** |
| Contexto reportado | 17.584 | 13.551 | −4.033 | −22,9% |
| Tokens de conversa | 7.145 | 5.811 | −1.334 | −18,7% |
| Ferramentas disponíveis | 23 | 17 | −6 | −26,1% |
| Ferramentas ociosas | 18 | 12 | −6 | −33,3% |
| Turnos do assistente | 5 | 6 | **+1** | **+20,0%** |
| Tool calls | 14 | 15 | **+1** | **+7,1%** |
| Tool calls com erro | 0 | 0 | 0 | — |
| Intervenções humanas | 0 | 0 | 0 | — |
| Duração (s) | 566 | 1.338 | **+772** | **+136,4%** |

Indisponíveis no export nas duas rodadas, registradas como tal e nunca como zero:
`inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `buildFailures`.

## Decomposição da janela — onde a economia veio

| Origem | A | B | Delta | % |
|---|---:|---:|---:|---:|
| `toolSystemPrompts` | 2.470 | 456 | **−2.014** | **−81,5%** |
| `skills` | 1.541 | 826 | −715 | −46,4% |
| `customInstructions` | 160 | 84 | −76 | −47,5% |
| `roleDefinition` | 34 | 19 | −15 | −44,1% |
| **`projectRules`** | **0** | **121** | **+121** | — |
| `toolDefinitions` | 5.403 | 5.403 | **0** | **0,0%** |
| `staticSections` | 563 | 563 | 0 | 0,0% |
| `baseRules` | 197 | 197 | 0 | 0,0% |
| `environment` | 71 | 71 | 0 | 0,0% |
| `mcpToolDefinitions` | 0 | 0 | 0 | — |

---

## A hipótese registrada errou, e isso é resultado

O portão da Fase 4 (issue #18) exigia registrar a hipótese **antes** de executar.
A hipótese era: desligar ferramentas faria `toolDefinitions` cair.

**`toolDefinitions` não se moveu.** Ficou em 5.403 tokens nas duas rodadas, mesmo com
o modo customizado reduzindo de 23 para 17 ferramentas disponíveis.

O que caiu foi **`toolSystemPrompts`, −81,5%** — responsável sozinho por 75% de toda
a economia de overhead.

### Consequência para o produto

> **Um modo customizado reduz os prompts de sistema das ferramentas, não os schemas
> delas.** A prescrição de desligar ferramenta deve prometer redução de
> `toolSystemPrompts`, e não de `toolDefinitions`.

Isso corrige uma afirmação que a documentação vinha fazendo com base no baseline
sozinho, e só pôde ser descoberto porque a Rodada B foi executada.

### A estimativa foi refutada, exatamente como previsto

O invariante **I-6** determina que `estimatedTokensPerTool` é hipótese, nunca medição.
A Rodada B provou o ponto:

| | Valor |
|---|---|
| Estimativa da Rodada A | 5.403 ÷ 23 ≈ **235 tokens por ferramenta** |
| Economia prevista ao remover 6 ferramentas | ≈ **1.410 tokens** |
| Economia real em `toolDefinitions` | **0 tokens** |
| Estimativa recalculada em B | 5.403 ÷ 17 ≈ **318 tokens por ferramenta** |

A estimativa **subiu** quando ferramentas foram removidas, porque o numerador não
mudou. É a demonstração prática de por que a interface precisa rotular estimativa
como estimativa — e de por que a Rodada B é o único mecanismo de confirmação.

---

## Regressões

Não escondidas. Fazem parte do resultado.

**Um turno e uma tool call a mais.** O agente levou 6 turnos em vez de 5. Ainda assim
o custo caiu 19,7%, o que significa que cada turno ficou substancialmente mais barato:
o contexto carregado por turno encolheu mais do que o número de turnos cresceu.

**Duração mais que dobrou** (566s → 1.338s). É a métrica menos confiável do conjunto:
`durationMs` inclui tempo parado esperando aprovação humana, e o grupo `edit` não
estava em auto-approve em nenhuma das rodadas. Não deve ser usada no pitch sem essa
ressalva.

## O que não mudou

As ferramentas efetivamente usadas foram **as mesmas cinco** nas duas rodadas:
`list_files`, `read_file`, `write_file`, `update_todo_list`, `execute_command`.

Confirma que o modo customizado removeu apenas ferramentas que a tarefa não usava —
a redução não alterou a capacidade do agente de concluir o trabalho. As duas rodadas
terminaram com `stop: true` e sem intervenção humana.

Ainda restam **12 ferramentas ociosas de 17** na Rodada B: o modo cortou 6, mas
poderia cortar mais.

---

## Métrica principal do pitch

**Redução de overhead de contexto: −25,9%.**

Escolhida por três razões, e não por ser a mais favorável:

1. **Delta grande e causa rastreável** — `projectRules` saiu de zero e
   `toolSystemPrompts` caiu 81,5%, ambos consequência direta da configuração gerada.
2. **Compreensível em dez segundos** — "o agente carregava 10.439 tokens antes de ler
   uma linha do seu código; agora carrega 7.740".
3. **É a tese do projeto** — o Hindsight sempre foi sobre desperdício de contexto.

**Métrica de apoio: custo, −19,7%**, porque é o que o jurado sente no bolso.

**Descartadas:** turnos e intervenções humanas. O baseline já tinha zero retry, zero
erro e zero intervenção — não havia desperdício de execução para remover, exatamente
como o [`analise-rodada-a.md`](./analise-rodada-a.md) antecipou. Turnos, aliás,
regrediram.

## Limitações

1. **Cache do Docker preservado** entre as rodadas — só o container e a imagem do
   benchmark foram removidos. Reuso de camadas base é possível nas duas.
2. **Tokens ↑/↓ e cache** não existem no export desta versão do Bob; o summary
   também não os exibe. Ausentes simetricamente nas duas rodadas.
3. **`gitSha` vem `null`**; o commit foi conferido manualmente antes e depois.
4. **Uma execução por braço.** Sem repetição, não há como separar o efeito da
   configuração de variação natural entre sessões.
