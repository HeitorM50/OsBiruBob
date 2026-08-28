# Hindsight

> Lê os exports de sessão do IBM Bob, mostra onde a configuração do agente está
> desperdiçando contexto e dinheiro, gera a configuração corrigida e **prova** a
> melhoria rodando a mesma tarefa de novo.

IBM TechXchange 2026 — Pre-conference Dev Day Hackathon.

---

## O problema

Um agente de código carrega uma janela de contexto montada de várias origens:
definições de ferramenta, Skills, prompts de sistema, regras base, regras do
projeto. O Bob expõe essa decomposição no export da sessão — mas **nenhuma
interface mostra esse número para quem está usando**.

Numa sessão real nossa, de 8.772 tokens:

| Origem | Tokens |
|---|---|
| `toolDefinitions` | 5.447 |
| `skills` | 1.478 |
| `toolSystemPrompts` | 652 |
| `staticSections` | 563 |
| `customInstructions` | 318 |
| `baseRules` | 197 |
| **`projectRules`** | **0** |

Esse zero é o achado. `projectRules: 0` significa que **não existe `AGENTS.md`** no
repositório: o agente redescobre as mesmas coisas por tentativa e erro em toda
sessão nova — o mesmo build que quebra, a mesma dependência que falta, a mesma
correção que o humano precisa ditar de novo. O custo disso é real e ninguém
nunca o viu, porque o número fica escondido no export.

## A solução

O Hindsight fecha o ciclo em quatro passos:

1. **Observe** — faz o parse do export JSON do Bob: custo por turno, contexto por
   turno, sequência de tool calls, e a decomposição da janela de contexto.
2. **Diagnose** — detecta os padrões de desperdício: releitura redundante do mesmo
   arquivo, retry depois de erro, intervenção humana no meio da conversa, e
   `projectRules` zerado.
3. **Prescribe** — transforma cada achado numa regra e gera o `AGENTS.md` (e, quando
   couber, um modo customizado ou uma Skill).
4. **Verify** — roda a mesma tarefa de novo, no mesmo commit, com o mesmo prompt, e
   compara. O delta é o resultado.

## Metodologia

Duas rodadas da mesma tarefa-benchmark, mesma pessoa, mesmo commit, prompt idêntico
caractere por caractere:

- **Rodada A** — repositório virgem. Sem `AGENTS.md`, sem `.bob`, sem modo customizado,
  sem Skill. Sem rodar `/init`.
- **Rodada B** — tudo igual, exceto a configuração gerada pelo Hindsight.

O contrato completo — o que é medido, de onde vem cada número e as regras que
invalidam a comparação — está em [`benchmark/METRICS.md`](benchmark/METRICS.md).

Repositório-benchmark: [`IBM/bob-demo`](https://github.com/IBM/bob-demo),
projeto `bob-get-started/express-todo-api-modern`.

## Como rodar

> Em construção — a implementação vive nas issues das Fases 2 a 6.

**Modo demo (sem API key, sem configuração).** Roda em cima de um export de exemplo
já versionado, para a ferramenta poder ser avaliada numa máquina limpa:

```bash
git clone https://github.com/HeitorM50/OsBiruBob.git
cd OsBiruBob
# comando do modo demo — a definir na Fase 6
# entrada: fixtures/sample-export.json
```

**Em cima de uma sessão sua.** No Bob IDE: `Tasks` → export JSON. Aponte o Hindsight
para o arquivo exportado.

A estrutura do export está documentada em [`docs/schema.md`](docs/schema.md).

## Estrutura do repositório

```
benchmark/     contrato de métricas, prompt da tarefa e os dois exports das rodadas
bob_sessions/  screenshots das sessões do Bob (entregável obrigatório)
fixtures/      export de exemplo para desenvolvimento e modo demo
src/           implementação
docs/          documentação do schema do export e notas de projeto
```

## Resultados

Preenchido depois da Rodada B. É esta tabela que vai para o vídeo.

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

## Segurança

Credencial de IBM Cloud detectada em repositório público suspende a conta na hora.
Antes de todo commit, a checklist de [`SECURITY.MD`](SECURITY.MD) vale — e o
`.gitignore` e o `.bobignore` deste repositório não devem ser afrouxados.
