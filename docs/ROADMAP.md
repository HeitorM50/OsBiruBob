# Roadmap — Hindsight

Roadmap de execução do Hindsight para o IBM TechXchange 2026 Pre-conference
Dev Day Hackathon.

O objetivo é entregar um laço fechado demonstrável:

```text
export do Bob → Observe → Diagnose → Prescribe → Verify → interface/demo
```

O projeto só avança de fase quando o respectivo portão estiver comprovado. Uma
funcionalidade sem evidência verificável não conta como concluída.

## Princípios de execução

1. **O número vem antes da interface.** O comparativo A/B é o produto central.
2. **Bobcoins são orçamento de validação.** Usar o Bob onde seu uso é parte do
   experimento ou exigência da submissão; usar fixtures e testes locais no restante.
3. **Implementação guiada por contratos.** Schema, arquitetura, tipos, comandos e
   critérios de aceite devem existir antes de pedir código ao Bob.
4. **Uma variável no experimento.** Entre as rodadas A e B, apenas a configuração
   gerada pode mudar.
5. **Toda recomendação precisa de evidência.** Achado, turno, trecho de origem e
   regra proposta devem permanecer rastreáveis.
6. **O modo demo não depende de IBM Cloud, API key ou sessão ativa.**

## Caminho crítico

```text
F0 Decisões
  ↓
F1 Baseline concluído
  ↓
F2 Parser
  ↓
F3 Detectores mínimos
  ↓
F4 Configuração gerada
  ↓
F5 Rodada B e delta
  ↓
F6 Demo mínima
  ↓
F7 Submissão
```

F6 pode começar em paralelo depois que o contrato de saída da F2 estiver estável.
O acabamento visual não pode atrasar F5.

---

## Fase 0 — Fundação técnica e contratos

**Objetivo:** dar ao Bob contexto suficiente para implementar tarefas pequenas sem
redescobrir arquitetura, stack ou regras do projeto em cada prompt.

### Entregáveis

- `docs/architecture.md`
  - componentes e responsabilidades;
  - fluxo dos dados;
  - fronteiras entre parser, análise, prescrição, comparação e interface;
  - política de erros e validação;
  - rastreabilidade entre evidência, achado e recomendação.
- `docs/technology-stack.md`
  - linguagem, runtime e versões;
  - gerenciador de pacotes;
  - biblioteca de validação;
  - framework de testes;
  - estratégia de CLI e interface;
  - comandos oficiais de instalação, desenvolvimento, teste, build e demo.
- `docs/domain-model.md`
  - tipos mínimos do export;
  - modelos normalizados (`Session`, `Turn`, `ToolCall`, `ContextBreakdown`,
    `Finding`, `Prescription`, `Comparison`);
  - invariantes e campos opcionais.
- `AGENTS.md`
  - mapa curto do repositório;
  - comandos canônicos;
  - convenções de código e testes;
  - armadilhas confirmadas do schema;
  - regra de não ler nem imprimir dados sensíveis desnecessariamente.
- esqueleto executável do projeto, com teste mínimo passando.

### Decisões que a documentação precisa fechar

- aplicação local, sem backend e sem banco de dados no MVP;
- parser e domínio independentes da interface;
- JSON do Bob tratado como entrada não confiável;
- tipos modelados progressivamente, sem reproduzir campos que não são usados;
- valores monetários preservados sem arredondamento durante os cálculos;
- timestamps interpretados como epoch em milissegundos;
- apresentação pode arredondar, domínio não;
- argumentos e conteúdo de mensagens devem ser redigíveis na interface;
- fixtures sintéticas cobrem casos que não aparecem no baseline real.

### Portão F0

- uma pessoa nova consegue clonar, instalar e executar um teste usando apenas a
  documentação;
- o Bob consegue apontar onde implementar uma transformação sem precisar propor
  nova arquitetura;
- nenhuma decisão essencial de stack ficou implícita.

---

## Fase 1 — Baseline do experimento

**Status:** concluída — issues #1 a #4.

### Evidências produzidas

- `benchmark/rodada-a.json`;
- `fixtures/sample-export.json`;
- screenshot da sessão;
- `docs/schema.md`;
- `docs/analise-rodada-a.md`;
- SHA e configuração efetiva de aprovação registrados.

### Resultado relevante

O baseline não apresentou retry, erro ou intervenção humana. O desperdício mais
forte está no overhead de contexto e nas ferramentas carregadas sem uso. Isso deve
orientar o pitch e o escopo dos detectores.

---

## Fase 2 — Observe: parser e modelo normalizado

**Objetivo:** transformar o export bruto em dados estáveis e testáveis para as
fases seguintes.

### Sequência de tarefas

1. **#5 — Carregar export e listar tasks**
   - validar raiz e `tasks[]`;
   - ignorar metadados de raiz prefixados por `_`;
   - preservar múltiplas tasks e relações `parentId`.
2. **#6 — Extrair métricas por turno**
   - considerar somente mensagens `assistant` com `_meta.spend`;
   - ordenar por `data._meta.timestamp`;
   - conferir soma do custo com o total da task.
3. **#7 — Extrair tool calls**
   - achatar chamadas preservando o turno de origem;
   - correlacionar chamada e resultado pelo ID;
   - aceitar chamadas paralelas e permissão `todo`.
4. **#8 — Extrair decomposição de contexto**
   - calcular percentuais sobre `total`;
   - separar overhead, contexto reportado e conversa;
   - sinalizar `projectRules === 0` sem convertê-lo ainda em diagnóstico.
5. **#9 — Integrar o relatório Observe**
   - executar sobre baseline e fixture sem alteração de código;
   - emitir JSON normalizado e uma representação legível para humanos.

### Testes obrigatórios

- baseline real como teste de caracterização;
- export com chave `_metadata` na raiz;
- mensagem sem `_meta.spend`;
- várias tool calls no mesmo turno;
- resultado de ferramenta fora de ordem;
- tool call sem resultado e resultado órfão;
- breakdown com campo zero;
- export inválido com erro compreensível;
- duas tasks, incluindo uma subtask, sem dupla contagem.

### Portão F2

Para `benchmark/rodada-a.json`:

| Métrica | Esperado |
|---|---:|
| Custo | 0.336902 |
| Contexto reportado | 17.584 |
| Overhead fixo | 10.439 |
| Tokens de conversa | 7.145 |
| Turnos do assistente | 5 |
| Tool calls | 14 |
| Tool calls com erro | 0 |
| Intervenções humanas | 0 |

> Tokens de entrada/saída, cache e métricas exclusivas do screenshot não devem ser
> inventados pelo parser. O relatório deve marcá-los como indisponíveis quando não
> constarem no export.

---

## Fase 3 — Diagnose: detectores com evidência

**Objetivo:** converter sinais normalizados em achados explicáveis, sem falsos
positivos no baseline.

### Prioridade P0 — necessária para o produto

1. **#13 — `projectRules` zerado**
2. **#14 — ferramenta carregada e nunca usada**
3. **#12 — intervenção humana**

Esses três detectores alimentam prescrições diretas e sustentam a narrativa da
demo. O #14 é o achado quantitativo mais forte do baseline.

### Prioridade P1 — importante, validada com fixture sintética

4. **#10 — releitura redundante**
5. **#11 — retry após falha**

### Contrato comum de um achado

Cada detector deve retornar, no mínimo:

- código e título estáveis;
- severidade e confiança;
- task e turno(s) envolvidos;
- evidência redigível;
- métrica observada;
- explicação curta;
- tipo de prescrição possível.

### Portão F3 — #15

- três achados verdadeiros, em export real ou fixtures adequadas;
- pelo menos um achado vindo de `rodada-a.json`;
- nenhum falso positivo conhecido no baseline;
- todo achado aponta para a evidência que o originou.

---

## Fase 4 — Prescribe: configuração revisável

**Objetivo:** transformar achados em mudanças pequenas, rastreáveis e aprováveis.

### Tarefas

1. **#16 — Gerar proposta de `AGENTS.md`**
   - gerar conteúdo determinístico;
   - indicar quais achados originaram cada seção;
   - evitar incluir transcript bruto, segredos ou a solução completa do benchmark;
   - apresentar diff antes de gravar.
2. **#17 — Gerar modo customizado/Skill**, somente se necessário.
   - tratar como P1;
   - priorizar modo com conjunto reduzido de ferramentas se o formato estiver
     confirmado e o ganho puder ser medido.
3. **#18 — Validar no Bob**
   - `projectRules` deve sair de zero;
   - uma mudança observável precisa aparecer no novo export.

### Portão F4

- artefato aceito pelo Bob;
- conteúdo curto e revisável;
- cada regra rastreável até um achado;
- nenhum dado privado copiado para o artefato;
- hipótese mensurável da Rodada B registrada antes de executá-la.

---

## Fase 5 — Verify: experimento A/B

**Objetivo:** provar ou refutar que a configuração prescrita melhora a sessão.

### Tarefas

1. **#19 — Executar Rodada B**
   - mesmo commit, prompt, pessoa e permissões;
   - nova conversa;
   - somente a configuração gerada muda.
2. **#20 — Exportar e comparar**
   - salvar `benchmark/rodada-b.json` e screenshot;
   - rodar o mesmo pipeline da F2/F3;
   - calcular deltas absolutos e percentuais;
   - registrar também regressões e métricas sem mudança.

### Métricas candidatas ao pitch

1. redução de overhead/contexto;
2. redução de custo;
3. redução de turnos;
4. redução de ferramentas disponíveis sem uso;
5. redução de intervenções, retries ou releituras, se houver.

A métrica principal só é escolhida depois da Rodada B. Não selecionar previamente
apenas a métrica que favorece a hipótese.

### Portão F5

- protocolo A/B auditável;
- `projectRules > 0` na Rodada B;
- tabela de delta gerada pelo produto;
- resultado honesto e explicável em dez segundos;
- se não houver melhoria, hipótese e prescrição são revisadas antes de investir na UI.

---

## Fase 6 — Interface e modo demo

**Objetivo:** permitir que um jurado entenda problema, evidência, prescrição e
resultado sem conhecer o schema do Bob.

### Ordem de implementação

1. **#24 — Modo demo sem API key** — P0.
2. **#21 — Decomposição do contexto** — P0.
3. **#22 — Achados com evidência** — P0.
4. **#23 — Comparativo antes/depois** — P0 depois da F5.

### Fluxo mínimo da demo

```text
Selecionar export → ver decomposição → abrir achado → revisar prescrição
→ comparar Rodada A e Rodada B
```

### Portão F6

- funciona em clone limpo com um comando documentado;
- não requer credenciais nem serviços externos;
- estados de carregamento, erro e ausência de Rodada B são compreensíveis;
- nenhuma informação sensível aparece por padrão;
- percurso principal cabe nos 90 segundos centrais do vídeo.

---

## Fase 7 — Submissão

**Objetivo:** transformar o produto comprovado em uma submissão clara e auditável.

### Tarefas

- **#25:** roteiro do vídeo, máximo de 3 minutos e pelo menos 90 segundos de demo;
- **#26:** problem and solution statement em inglês, até 500 palavras;
- **#27:** statement específico sobre o uso do IBM Bob;
- **#28:** submissão antecipada para receber feedback;
- **#29:** screenshot de sessão de cada integrante;
- **#30:** auditoria de segredos no working tree, exports, imagens e histórico.

### Portão F7

- vídeo reproduzível e dentro do limite;
- statements dentro dos limites e consistentes com o produto entregue;
- links e comandos testados em clone limpo;
- screenshots obrigatórios presentes;
- nenhuma credencial, caminho privado ou dado pessoal exposto;
- cópia local de todos os artefatos antes do encerramento do acesso IBM.

---

## Estratégia de Bobcoins

Com orçamento de 40 Bobcoins por pessoa, o Bob não deve ser usado para explorar
decisões que podem ser resolvidas por documentação e fixtures.

### Uso prioritário

| Uso | Prioridade | Estratégia |
|---|---|---|
| Documentar arquitetura/stack e gerar `AGENTS.md` | P0 | Uma sessão bem preparada |
| Implementar/revisar issues `bob-required` | P0 | Uma issue por prompt, retomando a mesma task quando útil |
| Validar artefato da F4 | P0 | Sessão mínima e exportada |
| Rodada B oficial | P0 | Reservar orçamento antes de qualquer refinamento |
| Screenshots obrigatórios dos membros | P0 | Sessões curtas e objetivas |
| Exploração visual e brainstorming | P2 | Fazer fora do Bob |

### Reserva recomendada por pessoa

- até 10%: documentação de arquitetura/stack e contexto persistente;
- até 25%: implementação assistida e correções das fases 2–4;
- pelo menos 35%: validações, Rodada B e eventual repetição controlada;
- pelo menos 10%: screenshots e contingência de submissão;
- 20%: reserva não comprometida para falhas ou regressões.

Esses percentuais são tetos de planejamento, não metas de consumo.

### Como reduzir consumo

- usar `fixtures/sample-export.json` e fixtures sintéticas em todos os testes;
- colocar caminho dos arquivos e critério de aceite no prompt;
- pedir uma única issue por vez;
- evitar pedir ao Bob para reler exports grandes quando um resumo tipado basta;
- manter `AGENTS.md` curto e estável;
- executar lint, testes e revisão mecânica localmente;
- só abrir sessão oficial quando houver hipótese e saída esperada registradas.

---

## Política de corte de escopo

Se o prazo ou Bobcoins apertarem, cortar nesta ordem:

1. gerador de Skill;
2. modo customizado automático;
3. estimativa por ferramenta individual;
4. navegação avançada pelo transcript;
5. animações e acabamento visual;
6. detectores que só disparam em fixtures sintéticas.

Não cortar:

- parser do export real;
- decomposição do contexto;
- pelo menos dois achados explicáveis;
- proposta revisável de configuração;
- Rodada B e tabela de delta;
- modo demo sem API key;
- auditoria de segurança e entregáveis obrigatórios.

## Definition of Done geral

Uma task só está concluída quando:

- critérios de aceite estão cobertos por teste ou evidência registrada;
- testes relevantes passam;
- entradas inválidas falham com mensagem compreensível;
- não há segredo ou conteúdo privado na saída;
- documentação e comando de execução continuam corretos;
- o resultado foi conferido contra o export real quando aplicável;
- a issue pode ser fechada sem depender de conhecimento que ficou apenas no chat.
