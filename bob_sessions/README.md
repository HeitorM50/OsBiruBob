# bob_sessions

Screenshots das sessões do IBM Bob. **Entregável obrigatório da submissão** — todo
membro do time precisa ter pelo menos um print aqui.

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

## Regras

- **Toda rodada vira print, inclusive as que derem errado.** Sessão ruim é dado.
- O print precisa mostrar o *summary* com API Cost, Tokens ↑/↓, Cache ↑/↓ e
  Context Length % — são as métricas 1 a 4 do [contrato de métricas](../benchmark/METRICS.md).
- Só PNG. Nada de foto de tela com celular.
- Confira antes de commitar que não há credencial, token ou caminho privado visível
  no print. Um screenshot também vaza segredo.
