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
| **1. Observe** | Coleta os dados das sessões do Bob: tokens de entrada e saída, razão de cache, ocupação da janela de contexto, custo, workspace |
| **2. Diagnose** | Identifica os antipadrões — contexto estourando, cache sendo invalidado, tarefa que deveria ter virado subagente, contexto faltando no AGENTS.md |
| **3. Prescribe** | Gera os artefatos corrigidos: `AGENTS.md` reescrito, um modo customizado, uma Skill, uma proposta de decomposição em subagentes |
| **4. Verify** | Roda a **mesma tarefa** com a config nova e mede o delta |

O estágio 4 é o que ninguém mais vai ter. Todo mundo constrói ferramenta que *sugere*; a nossa **prova**.

---

## Dois sinais concretos que a gente detecta

**Razão de cache.** Muita escrita de cache e pouca leitura significa que o prefixo do contexto está sendo invalidado a cada turno — você está pagando de novo por contexto que já tinha. A correção é estabilizar o começo do AGENTS.md. Ninguém olha essa métrica.

**Ocupação da janela de contexto.** Task que sobe para 70-80% produz saída pior e custa mais. A prescrição é uma regra: acima de N%, força nova task ou delega a um subagente.

---

## A demo (2 minutos)

1. Tarefa real num repo com uma pegadinha não-documentada. Config padrão. O Bob queima turnos descobrindo na tentativa e erro.
2. Jogamos os dados da sessão no Hindsight. Ele devolve os achados e o `AGENTS.md` corrigido.
3. `git checkout` no estado inicial. **Mesma tarefa, config nova.** Menos turnos, menos tokens, menos custo.
4. O número na tela.

**O golpe final:** os dados que usamos na demo são das nossas próprias sessões construindo o Hindsight. A ferramenta analisa as sessões que a construíram.

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

## O que ainda não sabemos

Sendo honesto: falta descobrir **quanto detalhe o Bob expõe de cada sessão**. O screenshot obrigatório traz seis campos agregados (contexto, tokens, cache, custo, task id, workspace).

- **Se existir export estruturado:** diagnóstico automático rico, com detecção turno a turno
- **Se não existir:** o diagnóstico é delegado ao próprio Bob (Ask mode + uma Skill que a gente escreve) e a medição usa os seis campos

**Em nenhum dos dois casos o projeto morre**, porque os seis campos já bastam para medir antes/depois. É teste de 5 minutos e custa zero Bobcoin.

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
