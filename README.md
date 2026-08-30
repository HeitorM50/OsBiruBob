# Hindsight

> Lê os exports de sessão do IBM Bob, mostra onde a configuração do agente está
> desperdiçando contexto e dinheiro, gera a configuração corrigida e **prova** a
> melhoria rodando a mesma tarefa de novo.

IBM TechXchange 2026 — Pre-conference Dev Day Hackathon.

**[Abrir a demo pública do Hindsight](https://heitorm50.github.io/OsBiruBob/)** —
clique em **"Ver exemplo"** para analisar o baseline sem instalar nada, sem conta
e sem API key.

---

## O problema

Um agente de código carrega uma janela de contexto montada de várias origens:
definições de ferramenta, Skills, prompts de sistema, regras base, regras do
projeto. O Bob expõe essa decomposição no export da sessão — mas **nenhuma
interface mostra esse número para quem está usando**.

Na nossa Rodada A — baseline real, versionada em [`benchmark/rodada-a.json`](benchmark/rodada-a.json) —
o overhead fixo foi de 10.439 tokens:

| Origem | Tokens | % |
|---|---:|---:|
| `toolDefinitions` | 5.403 | 51,8% |
| `toolSystemPrompts` | 2.470 | 23,7% |
| `skills` | 1.541 | 14,8% |
| `staticSections` | 563 | 5,4% |
| `baseRules` | 197 | 1,9% |
| `customInstructions` | 160 | 1,5% |
| `environment` | 71 | 0,7% |
| `roleDefinition` | 34 | 0,3% |
| **`projectRules`** | **0** | **0,0%** |
| `mcpToolDefinitions` | 0 | 0,0% |

Esse zero é o achado. `projectRules: 0` significa que **não existe `AGENTS.md`** no
repositório: o agente redescobre as mesmas coisas por tentativa e erro em toda
sessão nova — o mesmo build que quebra, a mesma dependência que falta, a mesma
correção que o humano precisa ditar de novo. O custo disso é real e ninguém
nunca o viu, porque o número fica escondido no export.

## A solução

O Hindsight fecha o ciclo em quatro passos:

1. **Observe** — faz o parse do export JSON do Bob: custo por turno, contexto por
   turno, sequência de tool calls, e a decomposição da janela de contexto.
2. **Diagnose** — detecta os padrões de desperdício: `projectRules` zerado,
   ferramenta carregada e nunca usada, Skill paga e não utilizada, releitura
   redundante do mesmo arquivo, retry depois de erro e intervenção humana no meio
   da conversa.
3. **Prescribe** — transforma cada achado numa recomendação concreta: o `AGENTS.md`
   que faltava, as ferramentas a desligar, as Skills que sobram ou que faltam, os
   servidores MCP que substituiriam chamadas de shell, e quando dividir a task em
   subagentes. Tudo determinístico, com a evidência ao lado.
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

O Hindsight é uma **aplicação web estática**. Não tem servidor, não tem banco, não
pede API key e não faz nenhuma requisição de rede em runtime.

**Pela URL publicada.** Abra
[`heitorm50.github.io/OsBiruBob`](https://heitorm50.github.io/OsBiruBob/), clique
em **"Ver exemplo"** e a ferramenta roda em cima do export real do baseline já
embutido. É o modo demo: máquina limpa, zero configuração.

**Rodando local.**

```bash
git clone https://github.com/HeitorM50/OsBiruBob.git
cd OsBiruBob
npm ci
npm run dev:web      # abre a aplicação com hot reload
```

Para gerar os arquivos estáticos:

```bash
npm run build:web    # saída em dist/web/ — pronto para hospedagem estática
npm run preview      # confere o build localmente
```

**Em cima de uma sessão sua.** No Bob IDE: `Tasks` → export JSON. Arraste o arquivo
para a página. Arraste **dois** arquivos (Rodada A e Rodada B) para ver a tabela de
delta.

**Pelo terminal**, para desenvolvimento:

```bash
npm run demo         # roda a CLI sobre fixtures/sample-export.json
```

A estrutura do export está documentada em [`docs/schema.md`](docs/schema.md).

## Privacidade

**O seu export nunca sai da sua máquina.** O arquivo é lido pelo navegador com
`FileReader` e processado na própria aba — não há upload, não há servidor, não há
telemetria.

Isso não é detalhe de implementação. Um export de sessão do Bob contém o seu
código-fonte, os caminhos absolutos da sua máquina e os comandos que você rodou.
Uma ferramenta de análise que exigisse enviar isso para um servidor seria
inutilizável em qualquer repositório privado.

Pelo mesmo motivo, o Hindsight **não chama nenhum modelo de linguagem**. Toda
recomendação vem de regra e catálogo versionado, e é rastreável até um campo do
export — o que também significa que ela sempre pode ser explicada.

## Estrutura do repositório

```
.bob/          modo mínimo e Skills compartilhadas para implementar as fases F2–F4
benchmark/     contrato de métricas, prompt da tarefa e os dois exports das rodadas
bob_sessions/  screenshots das sessões do Bob (entregável obrigatório)
fixtures/      export de exemplo para desenvolvimento e modo demo
data/          catálogos curados (MCP, ferramentas) — dado versionado, não código
scripts/       sanitização e extração segura de métricas dos exports
src/           implementação — core puro, mais a SPA em src/ui/
docs/          arquitetura, modelo de domínio, stack, schema do export e roadmap
```

Quem implementar as fases F2–F4 no Bob deve confiar no workspace e selecionar o
modo **Hindsight Implementation**. A configuração, as três Skills e a medição
self-hosting estão documentadas em
[`docs/configuracao-bob.md`](docs/configuracao-bob.md).

## Resultados

Tabela gerada pelo produto, não montada à mão:

```bash
npx tsx src/cli.ts --compare benchmark/rodada-a.json benchmark/rodada-b.json
```

Protocolo do experimento validado: `Comparison.valid === true`.

**Métrica principal: redução de 25,9% no overhead de contexto.** Apoio: custo, −19,7%.

Calculadas pelo Hindsight a partir dos exports:

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
| Duração | 566 s | 1.338 s | **+772 s (regressão)** |

Preenchidas à mão a partir do screenshot — **não são exportadas pelo Bob**:

| Métrica | Rodada A (baseline) | Rodada B (otimizada) | Delta |
|---|---|---|---|
| Tokens ↑ / ↓ | indisponível | indisponível | — |
| Cache ↑ / ↓ | indisponível | indisponível | — |
| Context Length % | 7% (18.4k / 270.0k) | 5% (13.6k / 270.0k) | −2 p.p. |
| Falhas de build | 0 | 0 | 0 |

### De onde veio a economia

`toolSystemPrompts` caiu **81,5%** (2.470 → 456) e responde sozinho por 75% da
redução. `projectRules` saiu de zero: o `AGENTS.md` gerado passou a ser carregado.

**`toolDefinitions` não se moveu** — 5.403 nas duas rodadas, apesar de o modo
customizado reduzir de 23 para 17 ferramentas. A hipótese registrada antes do
experimento previa o contrário, e foi refutada.

### O que regrediu

Turnos subiram de 5 para 6 e a duração mais que dobrou. **O custo caiu 19,7% mesmo
com um turno a mais**, ou seja, cada turno ficou substancialmente mais barato. A
duração inclui espera por aprovação humana e é a métrica menos confiável do conjunto.

Análise completa em [`docs/analise-rodada-b.md`](docs/analise-rodada-b.md).

## Segurança

Credencial de IBM Cloud detectada em repositório público suspende a conta na hora.
Antes de todo commit, a checklist de [`SECURITY.MD`](SECURITY.MD) vale — e o
`.gitignore` e o `.bobignore` deste repositório não devem ser afrouxados.
