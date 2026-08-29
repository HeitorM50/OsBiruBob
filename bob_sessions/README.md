# bob_sessions

Evidências sanitizadas das sessões do IBM Bob. **Entregável obrigatório da
submissão** — todo membro do time precisa ter pelo menos um print aqui.

## Padrão de nome

```
time_taskNN_descricao_summary.png
```

| Parte | Significado | Exemplo |
|---|---|---|
| `time` | identificador do time | `osbirubob` |
| `taskNN` | número da task, dois dígitos | `task01` |
| `descricao` | slug curto em minúsculas, separado por `-` | `rodada-a-baseline` |
| `summary` | sufixo fixo — o print é da tela de *summary* da sessão | `summary` |

Exemplos válidos:

```
osbirubob_task01_rodada-a-baseline_summary.png
osbirubob_task02_rodada-b-com-agentsmd_summary.png
```

Exports sanitizados usam o mesmo prefixo e o sufixo `_export.json`. Exports brutos
devem terminar em `.raw-export.json`, ficam ignorados pelo Git e nunca são
commitados. O procedimento completo de medição e sanitização está em
[`docs/configuracao-bob.md`](../docs/configuracao-bob.md).

## Regras

- **Toda rodada vira print, inclusive as que derem errado.** Sessão ruim é dado.
- O print precisa mostrar o *summary* com API Cost, Tokens ↑/↓, Cache ↑/↓ e
  Context Length % — são as métricas 1 a 4 do [contrato de métricas](../benchmark/METRICS.md).
  Quando a versão instalada do Bob não exibir alguma delas, registre-a como
  indisponível no documento da medição; nunca preencha com zero.
- Só PNG. Nada de foto de tela com celular.
- Confira antes de commitar que não há credencial, token ou caminho privado visível
  no print. Um screenshot também vaza segredo.
- Exports commitados não contêm transcript, argumentos de ferramenta, título da task,
  comandos aprovados nem caminhos privados. Preserve apenas a estrutura e as métricas
  necessárias para análise.
