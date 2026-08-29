# Roadmap — Hindsight

Roadmap de execução do Hindsight para o IBM TechXchange 2026 Pre-conference
Dev Day Hackathon.

O objetivo é entregar um laço fechado demonstrável:

```text
export do Bob → Observe → Diagnose → Prescribe → Verify → aplicação web
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
7. **O produto é uma aplicação web estática.** Roda no navegador, sem backend e sem
   rede. O export contém código e caminhos do usuário e não sai da máquina — isso é
   restrição de arquitetura e argumento de produto ao mesmo tempo.
8. **Nenhuma recomendação vem de modelo de linguagem.** Regra e catálogo, sempre
   rastreáveis até um campo do export.

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

O contrato de saída da F2 é o **`ObserveReport`**, definido em
[`domain-model.md`](./domain-model.md), Modelo 6. Ele já traz a tabela completa de
conformidade — incluindo inventário de ferramentas (23 / 5 / 18) e comandos
externos (3), que não constavam desta tabela.

Resumo, para `benchmark/rodada-a.json`:

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

### As cinco famílias de prescrição

Além do `AGENTS.md`, a F4 recomenda **ferramentas a desligar, Skills, MCPs e
subagentes**. Cada família tem um sinal de origem e uma prioridade honesta:

| Família | Sinal no baseline | Prioridade | Observação |
|---|---|---|---|
| `AGENTS.md` | `projectRules: 0` | **P0** | O achado central |
| Desligar ferramenta | **18 de 23 ociosas (78%)** | **P0** | Maior número quantitativo que temos |
| Desligar Skill | `skills: 1541` com `loadedSkills: []` | **P0** | Subtração direta |
| Habilitar MCP | 3 comandos externos (`docker` ×2, `curl`) | **P1** | Precisa de `data/mcp-catalog.json` |
| Criar Skill | — | **P2** | Exige N sessões; com uma só, confiança `"low"` ou não emite |
| Dividir em subagente | pressão 6,5% | **P2** | Não dispara no baseline, e está certo. `maxContextWindow` não vem no export |

Duas regras que impedem recomendação sem lastro:

- **Nada de LLM.** Toda prescrição é regra + catálogo. Ver
  [`architecture.md`](./architecture.md), seção "Nenhuma chamada a LLM".
- **Ausência de dado não vira recomendação.** Sem `maxContextWindow`, a prescrição
  de subagente simplesmente não é emitida.

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

## Fase 6 — Aplicação web

**Objetivo:** permitir que um jurado entenda problema, evidência, prescrição e
resultado sem conhecer o schema do Bob — e sem instalar nada.

O entregável é uma **SPA estática** em `src/ui/`, publicada como URL e também
executável a partir de um clone. A CLI continua existindo, mas **não é o produto**.

### Por que web, e não terminal

A submissão exige aplicação com deploy online ou execução local com interface.
Além disso, o core já é composto de funções puras sem I/O — roda no navegador sem
alteração. A interface é aditiva, não é reescrita.

### Ordem de implementação

1. **#24 — Modo demo** — P0. Botão "Ver exemplo" carrega
   `fixtures/sample-export.json` embutido no bundle. Sem arquivo, sem credencial,
   sem rede.
2. **#21 — Decomposição do contexto** — P0. Barra empilhada com `projectRules`
   destacado quando zero; overhead fixo, conversa e total separados.
3. **#22 — Achados com evidência** — P0. Cada achado com turno, `fieldPath` e o
   trecho que o comprova.
4. **Prescrições em abas** — P0 para `AGENTS.md` (com diff) e Ferramentas;
   P1 para MCPs; P2 para Skills e Subagentes.
5. **#23 — Comparativo antes/depois** — P0 depois da F5.

### Entrada

Arquivos entram por drag-and-drop, lidos com `FileReader`. A tela aceita **N
arquivos**: um basta para diagnóstico, dois habilitam o A/B, três ou mais tornam
a recomendação de Skill defensável.

### Fluxo da demo

```text
Abrir a URL → "Ver exemplo" (ou arrastar o JSON) → ver a decomposição
→ abrir um achado e sua evidência → revisar as prescrições
→ arrastar a Rodada B → tabela de delta
```

### Portão F6

- abre pela URL publicada **e** funciona em clone limpo com um comando documentado;
- **o JSON não sai do navegador** — sem upload, sem rede, sem telemetria;
- não requer credenciais, API key nem serviços externos;
- estados de carregamento, erro, export inválido e ausência de Rodada B são
  compreensíveis;
- nenhuma informação sensível aparece por padrão;
- estimativas estão rotuladas como estimativas (I-6);
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

Ordem de prioridade com o escopo web. Construir de cima para baixo; cortar de
baixo para cima.

### Essencial — sem isto não existe produto

| Ordem | Item | Por quê |
|---|---|---|
| 1 | `ObserveReport` + `parser` + `observe` | É o primeiro dominó: a UI e todos os detectores consomem esse contrato |
| 2 | Tela 1 — decomposição do contexto | É o "ninguém nunca viu esse número" |
| 3 | Tela 2 — achados com evidência | Sem evidência, é opinião |
| 4 | Detectores `projectRules: 0` e ferramenta ociosa | Os dois únicos que disparam no baseline |
| 5 | `AGENTS.md` gerado com diff | É a prescrição que fecha o laço |
| 6 | Build estático publicado | Exigência de submissão |

### Alto valor — cortar só se o relógio obrigar

| Ordem | Item |
|---|---|
| 7 | Recomendação de MCP via catálogo — barata, com evidência visível no log |
| 8 | Tela 4 — tabela de delta A/B (depende da F5) |
| 9 | Agrupamento das ferramentas ociosas por propósito (`tool-catalog.json`) |

### Cortar primeiro

| Ordem | Item | Por quê é o primeiro a cair |
|---|---|---|
| 10 | Recomendação de Skill nova | Precisa de N sessões; com uma só é palpite |
| 11 | Recomendação de subagente | Não dispara no baseline e depende de `maxContextWindow`, que não vem no export |
| 12 | Modo customizado automático | Formato ainda não confirmado |
| 13 | Estimativa por ferramenta individual | O export só dá o agregado (I-6) |
| 14 | Navegação avançada pelo transcript | Conveniência |
| 15 | Animações e acabamento visual | Último |

### Não cortar, em nenhuma hipótese

- parser do export real;
- decomposição do contexto;
- pelo menos dois achados explicáveis;
- proposta revisável de configuração;
- Rodada B e tabela de delta;
- modo demo sem API key, funcionando em máquina limpa;
- a garantia de que o export não sai do navegador;
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
