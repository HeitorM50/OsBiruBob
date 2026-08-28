# Contrato de métricas — Hindsight

O que medimos, de onde vem, e o que significa. As duas rodadas usam esta régua.

---

## Métricas coletadas

| # | Métrica | Origem | Interpretação |
|---|---|---|---|
| 1 | **API Cost** | Campo do task session summary | Custo direto da tarefa. Menor é melhor |
| 2 | **Tokens ↑ / ↓** | Campo do summary | Volume de entrada e saída. Entrada alta = contexto inflado |
| 3 | **Cache ↑ / ↓** | Campo do summary | Calcular a razão leitura/escrita. **Alta = contexto estável e reaproveitado. Baixa = pagando de novo pelo que já tinha** |
| 4 | **Context Length %** | Campo do summary | Pressão de contexto. Acima de ~70% a saída piora e o custo sobe |
| 5 | **Turnos** | Contagem manual na conversa | Idas e vindas até concluir. Menor é melhor |
| 6 | **Intervenções humanas** | Contagem manual | Vezes que o humano corrigiu ou redirecionou. **Cada uma é uma regra faltando no AGENTS.md** |
| 7 | **Falhas de build** | Contagem manual | Tentativas que quebraram antes de funcionar |

As métricas 1 a 4 saem de graça do screenshot obrigatório. As 5 a 7 são contadas na mão e são as mais eloquentes no vídeo.

---

## Regras do experimento

Quebrar qualquer uma destas invalida a comparação.

1. **Prompt idêntico** nas duas rodadas — caractere por caractere, copiado de `task.txt`
2. **Mesmo commit de partida** — resetar com `git checkout .` e remover arquivos não rastreados, nunca "desfazer na mão"
3. **Mesma pessoa** executando as duas rodadas
4. **Mesma configuração de auto-approve** — deixar apenas **Read** ligado nas duas
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

Atrito esperado (documentado pela própria IBM no quickstart do Bob):
- O build falha porque não existe `package-lock.json`, e o `npm ci` do Dockerfile precisa virar `npm install`

Esse é o desperdício que queremos medir: o Bob descobre isso por tentativa e erro, gastando turnos e tokens.

---

## Rodada B — com a config gerada pelo Hindsight

Mesmo commit, mesmo prompt, mesma pessoa. A única variável que muda é a configuração gerada pela ferramenta:

- `AGENTS.md` na raiz, com o contexto que faltava
- Regras por modo, se aplicável
- Modo customizado ou Skill, se aplicável

Hipótese: o Bob acerta o Dockerfile na primeira tentativa, gastando menos turnos, menos tokens e sem intervenção humana.

---

## Tabela de resultado

Preencher e commitar. É esta tabela que vai para o vídeo.

| Métrica | Rodada A (baseline) | Rodada B (otimizada) | Delta |
|---|---|---|---|
| API Cost | | | |
| Tokens ↑ | | | |
| Tokens ↓ | | | |
| Cache ↓/↑ (razão) | | | |
| Context Length % | | | |
| Turnos | | | |
| Intervenções humanas | | | |
| Falhas de build | | | |

**A métrica principal do pitch** deve ser escolhida depois de ver os números — a que tiver o delta mais honesto e mais compreensível para um jurado em 10 segundos. Provavelmente turnos ou intervenções.

---

## Repositório-benchmark

- Clone: `https://github.com/IBM/bob-demo.git`
- Projeto: `bob-get-started/express-todo-api-modern`
- Requer Docker (ou Podman) instalado

**Alternativa sem Docker:** se o Docker for um problema no ambiente de alguém, trocar a tarefa por uma que force o mesmo tipo de descoberta — por exemplo, pedir para rodar a suíte de testes e corrigir a primeira falha. O importante é existir um atrito não documentado que o AGENTS.md consiga eliminar.
