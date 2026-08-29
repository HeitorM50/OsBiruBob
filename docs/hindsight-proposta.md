# Hindsight

**Proposta de projeto — IBM TechXchange 2026 Pre-conference Dev Day Hackathon**

Tema: *Build with purpose using IBM Bob 2.0* — criar uma solução que melhore um workflow de desenvolvimento específico.

---

## O problema

Times estão adotando agentes de código numa velocidade enorme, mas ninguém tem ideia de **por que uma sessão foi cara ou ruim**. O desenvolvedor termina uma task, vê "API Cost 0.093" e não aprende nada com aquilo.

Enquanto isso, a configuração que governa o agente — o `AGENTS.md`, os modos customizados, as regras de projeto — é escrita uma vez, no feeling, e nunca mais revisada. Não existe nenhum laço de retorno entre **como o agente se comportou** e **como o agente está configurado**.

Resultado: o time paga pelo mesmo erro repetidamente. O agente relê os mesmos arquivos toda sessão porque ninguém colocou aquele contexto no AGENTS.md. O humano corrige a mesma coisa toda vez porque aquela correção nunca virou regra. E o custo sobe sem que ninguém saiba onde.

**O workflow de desenvolvimento que a gente melhora é o de trabalhar com um agente de código.** Hoje ele não tem retrospectiva.

---

## O que é

Uma ferramenta que analisa as sessões do IBM Bob, identifica onde a configuração do agente está causando desperdício, **gera a configuração corrigida**, e depois **prova a melhoria** rodando a mesma tarefa de novo.

Não é um dashboard. É um otimizador com laço fechado.

---

## Como funciona — os quatro estágios

| Estágio | O que acontece |
|---|---|
| **1. Observe** | Coleta os dados da sessão: custo e contexto por turno, sequência de tool calls, ferramentas disponíveis vs. usadas, comandos externos e a decomposição da janela de contexto por origem |
| **2. Diagnose** | Identifica os antipadrões — `projectRules` zerado, ferramenta carregada e nunca chamada, Skill paga sem uso, releitura redundante, retry após erro, intervenção humana |
| **3. Prescribe** | Gera os artefatos corrigidos: `AGENTS.md` reescrito com diff, ferramentas a desligar, Skills a desligar ou criar, **servidores MCP que substituiriam chamadas de shell**, e proposta de decomposição em subagentes |
| **4. Verify** | Roda a **mesma tarefa** com a config nova e mede o delta |

O estágio 4 é o que ninguém mais vai ter. Todo mundo constrói ferramenta que *sugere*; a nossa **prova**.

---

## Dois sinais concretos que a gente detecta

Os dois saem do export real da nossa Rodada A, documentado em
[`analise-rodada-a.md`](./analise-rodada-a.md).

**`projectRules: 0`.** O Bob expõe a decomposição da própria janela de contexto por
origem, e a fatia que carregaria o conhecimento do projeto — o `AGENTS.md` — veio
**zerada**. Significa que o agente redescobre tudo por tentativa e erro em cada
sessão nova. Ninguém nunca viu esse número, porque nenhuma interface mostra.

**78% das ferramentas nunca são chamadas.** A sessão carregou **23 ferramentas e usou
5**. `toolDefinitions` sozinho é 5.403 tokens, 51,8% do overhead fixo; somado às
Skills (1.541 tokens, com `loadedSkills: []`), são **6.944 tokens — 66,5% do overhead
pago em toda sessão**, antes de o agente ler uma linha de código. Numa task de Docker
e Node, o agente estava carregando ferramenta de ler planilha Excel e de gerar
gráfico.

> A razão de cache e os tokens de entrada/saída **não são exportados pelo Bob** — só
> aparecem no screenshot do summary. Continuam na régua como preenchimento manual
> (ver [`METRICS.md`](../benchmark/METRICS.md)), mas não são o que a ferramenta
> detecta.

---

## O que é, na prática

Uma **aplicação web estática**. O usuário exporta a sessão do Bob
(`Tasks → export JSON`), arrasta o arquivo para a página, e recebe o diagnóstico e as
prescrições. **Nada é enviado para lugar nenhum** — o arquivo é lido e processado no
próprio navegador.

Isso não é detalhe de implementação. Um export de sessão contém código-fonte,
caminhos absolutos e os comandos que a pessoa rodou. Uma ferramenta que exigisse
subir isso para um servidor seria inutilizável em qualquer repositório privado de
empresa.

Pelo mesmo motivo, **o Hindsight não chama nenhum modelo de linguagem.** Toda
recomendação vem de regra e catálogo versionado, rastreável até um campo do export.
Roda offline, sem API key, e sempre consegue responder *"por que essa recomendação?"*.

## A demo (2 minutos)

1. Abrir a aplicação e clicar em **"Ver exemplo"** — carrega o export real da nossa
   Rodada A, sem instalar nada.
2. A decomposição do contexto na tela, com `projectRules` em **zero** e 18 de 23
   ferramentas marcadas como nunca usadas.
3. Abrir um achado: o turno exato, o campo exato do JSON que o comprova.
4. A aba de prescrições: o `AGENTS.md` com diff, as ferramentas a desligar, o
   servidor MCP de Docker sugerido a partir dos comandos de shell que o agente rodou.
5. Arrastar a Rodada B. **A tabela de delta na tela.**

**O golpe final:** os dados que usamos na demo são das nossas próprias sessões
construindo o Hindsight. A ferramenta analisa as sessões que a construíram — e o
`AGENTS.md` deste repositório é ela mesma aplicada em si própria.

---

## Por que isso ganha

| Critério (5 pts cada) | Como a gente pontua |
|---|---|
| **Completeness e feasibility** | "Clareza na aplicação da tecnologia IBM" é automática — o produto só existe por causa das primitivas do Bob (AGENTS.md, modos, Skills, subagentes, sessões) |
| **Effectiveness e efficiency** | Impacto mensurável não é promessa, é o estágio 4. Temos número |
| **Creativity e innovation** | O Apêndice do guia lista cinco casos de uso, e a maioria dos times vai sair desse cardápio. O nosso não está lá |
| **Design e usability** | Onde a gente precisa investir de propósito. Não é grátis |

No hackathon anterior do Bob, os projetos mais votados pela comunidade — onboarding copilot, mapa de codebase, modernização de legado — **não ganharam nada**. O júri premiou execução documentada e prova, não popularidade da ideia.

---

## O que já sabemos (resolvido)

A dúvida original era **quanto detalhe o Bob expõe de cada sessão**. Está respondida:
o export estruturado existe, e é rico. Está documentado campo a campo em
[`schema.md`](./schema.md), a partir de um export real.

O que ele **dá**: custo e contexto por turno, sequência completa de tool calls com
erro e duração, ferramentas disponíveis, comandos executados, configuração de
aprovação, e a decomposição da janela de contexto em dez origens.

O que ele **não dá**, e que por isso não pode ser prometido: tokens de entrada/saída,
métricas de cache, tamanho máximo da janela e `gitSha` (vem `null`). Essas ficam como
preenchimento manual a partir do screenshot.

## O que ainda é risco

**A recomendação de Skill nova precisa de mais de uma sessão.** Uma Skill se
justifica por procedimento recorrente; com um único export não há repetição
observável. Com uma sessão só, a ferramenta declara confiança baixa ou não recomenda
— o que é a postura certa, mas enfraquece essa aba da demo.

**A recomendação de subagente não dispara no baseline.** A sessão usou 6,5% da janela.
Uma ferramenta que sabe dizer *"aqui não precisa"* é mais confiável que uma que
recomenda tudo para todo mundo — mas para mostrar o detector aceso no vídeo é preciso
uma sessão com contexto alto.

---

## O que decidir na reunião

1. **Qual tarefa-benchmark** — repo pequeno, com uma pegadinha real de build ou setup, recuperável com `git checkout`
2. **Divisão dos Bobcoins** — são 40 por pessoa, não por time. Trabalho paralelo em workspaces separados multiplica o orçamento
3. **Quem cuida da submissão desde já** — vídeo tem limite de 3 minutos, statement tem 500 palavras, e cada membro precisa dos próprios screenshots no `bob_sessions`
4. **Quem faz a interface** — vale 5 dos 20 pontos e é o que mais se perde em ferramenta de análise

---

## Prazos

| Quando | O quê |
|---|---|
| Domingo, 30/08, 11:00 (Brasília) | Deadline final de submissão |
| Sábado à noite | Submeter um rascunho para receber o feedback automático do AI Submission Advisor e ter tempo de corrigir |
| 01/09 | Acesso ao Bob e à conta IBM Cloud encerram — salvar tudo antes |

---

> Todo mundo vai construir uma ferramenta usando o Bob. A gente vai construir a ferramenta que torna o Bob melhor, e vai provar com número.
