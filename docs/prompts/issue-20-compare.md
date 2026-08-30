# Prompt para a sessão do Bob — issue #20, módulo `src/compare/`

Cole o bloco abaixo numa **conversa nova** do Bob IDE, no workspace do Hindsight,
com o modo de implementação. Não edite o texto.

---

Implemente `src/compare/index.ts`, o módulo da Fase 5 do Hindsight.

## Contrato

Assinatura: recebe dois `ObserveReport` (Rodada A e Rodada B) e devolve um `Comparison`.
Os tipos `Comparison` e `ComparisonMetrics` já existem em `src/domain/types.ts`.

**Duas correções necessárias no `types.ts` antes de implementar:**

1. `buildFailuresA`, `buildFailuresB` e `buildFailuresDelta` estão declarados como
   obrigatórios (`number`), mas `docs/domain-model.md` os define como **opcionais**.
   Torne os três opcionais (`?`). O motivo está no próprio documento: falhas de build
   não são deriváveis do export, e um campo obrigatório forçaria preencher com `0`,
   violando a regra de que ausência de dado nunca é zero.
2. O comentário de seção diz `Model 8 — Comparison`; no `domain-model.md` o
   `Comparison` é o **Modelo 9**. Corrija o comentário.

Fora essas duas, use os tipos como estão e não redefina nada.

Leia antes de implementar:
- `docs/domain-model.md`, Modelo 9 (`Comparison`) e as invariantes I-1 a I-6
- `docs/architecture.md`, seção `src/compare/`
- `AGENTS.md` na raiz

## Regras

- Função **pura**: sem `fs`, sem `path`, sem `process`, sem rede. O módulo roda no navegador.
- Importa apenas de `src/domain/types.ts`. **Não** importa `diagnose`, `prescribe` nem UI.
- **Sem arredondamento.** Custos mantêm a precisão do IEEE 754. Arredondar é papel da apresentação.
- Delta é sempre `B − A`. Negativo indica melhora em custo e tokens; positivo indica regressão.
- Métricas ausentes no export ficam **ausentes ou `null`**, nunca `0`.
  `buildFailuresA/B/Delta` são opcionais e não devem ser preenchidos automaticamente.
- `valid` é `false` quando o protocolo do experimento foi quebrado. Verifique e
  preencha `invalidReason` quando falhar:
  - conjunto de `approval.allowedPermissions` diferente entre as rodadas (comparar como
    **conjunto**, não como lista ordenada — a IDE serializa em ordem variável);
  - número de tasks principais diferente.
- Subtasks (`parentId !== null`) são excluídas de qualquer agregação (I-5).
- Divisão por zero no cálculo percentual precisa ser tratada; nunca emitir `Infinity` ou `NaN`.

## Valores esperados

Para `benchmark/rodada-a.json` (A) e `benchmark/rodada-b.json` (B), o `Comparison`
deve produzir exatamente:

| Campo | A | B | Delta |
|---|---:|---:|---:|
| `cost` | 0.336902 | 0.270606 | -0.066296 |
| `fixedOverhead` | 10439 | 7740 | -2699 |
| `contextTokens` | 17584 | 13551 | -4033 |
| `assistantTurns` | 5 | 6 | +1 |
| `humanInterventions` | 0 | 0 | 0 |
| `projectRulesTokens` | 0 | 121 | — |

E `valid === true`.

## Testes obrigatórios

Crie `src/compare/index.test.ts` com Vitest. A issue não pode ser fechada sem eles.

Casos mínimos:

1. **Caracterização** — carregar `benchmark/rodada-a.json` e `benchmark/rodada-b.json`,
   rodar `parseSession` → `observe` → `compare`, e conferir todos os valores da tabela acima.
2. **`valid: false` por permissão** — dois relatórios com conjuntos de
   `allowedPermissions` diferentes produzem `valid: false` com `invalidReason` preenchido.
3. **Ordem de permissão não invalida** — `["read","todo","execute"]` e
   `["read","execute","todo"]` são o mesmo conjunto e mantêm `valid: true`.
4. **Sem arredondamento** — o delta de custo preserva a precisão original.
5. **Regressão é reportada** — delta positivo em turnos aparece no resultado, não é omitido.
6. **`buildFailures` ausente** — permanece ausente, nunca `0`.
7. **Denominador zero** — percentual sobre valor `0` não produz `Infinity` nem `NaN`.

## Saída na CLI

Acrescente ao `src/cli.ts` a flag `--compare <arquivoA> <arquivoB>`, que imprime a
tabela de delta em formato legível. `src/cli.ts` é o único arquivo autorizado a usar `fs`.

A tabela impressa deve separar:
- métricas calculadas pelo produto;
- métricas indisponíveis no export, marcadas como indisponíveis e nunca como zero.

## Definition of Done

- `npm test` passa
- `npm run typecheck` passa
- `src/boundaries.test.ts` continua passando (a regra de imports não pode ser violada)
- nenhum dado sensível impresso por padrão
