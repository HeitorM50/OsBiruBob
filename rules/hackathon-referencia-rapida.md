# Hackathon IBM Bob — Referência Rápida

Documento de consulta durante o evento. Deixar aberto.

---

## 1. Datas

**Não existe entrega intermediária. Nada vence dia 29.**

| Quando | O quê |
|---|---|
| Sex 28/08, 11:00 (Brasília) | Hackathon aberto. Trabalho livre, sem horário fixo |
| Sáb 29/08 | Nada é devido. Dia inteiro de trabalho |
| **Dom 30/08, 11:00 (Brasília)** | **Deadline final. 10:00 ET** |
| 01/09 | Contas Bob e IBM Cloud encerram. Salvar tudo antes |

Depois do deadline, **não mexer em nada** — nem commit, nem ajuste no vídeo, nem README. Alterar entregável após o prazo pode desqualificar.

Dá para salvar múltiplos rascunhos até o prazo. **Submeter uma versão sábado à noite** para receber o feedback automático do AI Submission Advisor e ter tempo de corrigir.

Ao revisar, **reenviar todos os entregáveis**, não só o que mudou. A submissão mais recente é a oficial.

---

## 2. Os 4 entregáveis

Tudo em inglês. Submissão pela aba **Submissions** da página My Team.

### 1. Vídeo
- **Máximo 3 minutos.** Os jurados não assistem além disso
- Mínimo 90 segundos mostrando a solução rodando na tela
- Narração obrigatória
- Mostrar claramente como o Bob foi usado
- URL publicamente acessível
- **Hospedar no YouTube, Vimeo ou Google Drive** — só nessas o feedback automático funciona

### 2. Problem and solution statement
- **500 palavras ou menos**
- Problema específico, solução, usuários-alvo, como interagem
- Por que é criativo e único, "de um jeito que os jurados nunca viram"

### 3. Statement de uso do IBM Bob
- Onde e como o time usou o Bob. Ser específico
- Se usar watsonx.ai ou Orchestrate, descrever também

### 4. Repositório
- **Público.** Repo privado impede avaliação e derruba a nota
- Todo código e arquivos do projeto
- **Pasta `bob_sessions` com os screenshots de todos os membros**

---

## 3. Registro das sessões — procedimento exato

Obrigatório para **cada membro do time**, não só o líder.

1. Criar pasta `bob_sessions` na raiz do repositório
2. No chat do Bob IDE, clicar em **Tasks**
3. Selecionar uma task relacionada ao projeto. Conferir que está no workspace certo. Se houver tasks em vários workspaces, usar **All**
4. Clicar no **cabeçalho da task** — abre o resumo de consumo da sessão
5. **Screenshot** do resumo, salvo em **PNG**
6. Nome do arquivo: `time_taskNN_descricao_summary.png`
   Exemplo: `teamalpha_task01_login_flow_summary.png`
7. Repetir para todas as tasks do projeto
8. Subir tudo para `bob_sessions`

**Fazer conforme avança, não no domingo.** Cada pessoa tira os próprios.

Campos que aparecem no resumo: Context Length, Task Id, Workspace, Tokens, Cache, API Cost.

---

## 4. Uso do Bob

**Bob IDE é obrigatório.** Bob Shell é opcional.

### Antes do primeiro prompt
Settings → General, conferir:
- **Team:** `ibm-coding-challenge-uat (region: us-east)`
- **Plan:** enterprise plan
- **Budget:** 40.00

Se estiver em outro team (ex: `bob-001`), trocar. Senão você queima créditos da conta pessoal.

### Bobcoins
- **40 por pessoa**, não por time. Com N membros, N x 40
- Chegou a 100%, **não vem mais**. Dá para continuar trabalhando, mas sem IA do Bob
- Monitorar em Settings → General ou no Bobalytics
- Dividir tarefas entre os membros para usar o total. Trabalho paralelo em workspaces separados multiplica o orçamento
- **Não gastar coin em boilerplate** — UI, CSS e config na mão

### Features que o tema pede explicitamente
Agent mode, parallel tasks, subagents, document understanding. O enunciado diz para usá-las para **gerenciar múltiplas etapas, não apenas assistir na codificação**.

Outras primitivas úteis: Plan mode, custom modes, Skills, `/init` (gera AGENTS.md), custom rules, rollback, `.bobignore`, context mentions (`@`).

---

## 5. O que mais vale ponto

20 pontos totais, média dos jurados. **Mínimo 12,5 para concorrer a prêmio.**

| Critério | 5 pts | O que perguntam |
|---|---|---|
| **Completeness e feasibility** | 5 | Quão viável e completo é o PoC? **Quão clara é a aplicação da tecnologia IBM?** |
| **Effectiveness e efficiency** | 5 | Resolve problema relevante do tema? **Impacto mensurável?** Escala? |
| **Design e usability** | 5 | Qualidade de design e UX. Quão rápido dá para adotar no mundo real? |
| **Creativity e innovation** | 5 | Abordagem original? Diferenciado no mercado? |

### As três coisas que mais movem a nota
1. **Um número.** Antes/depois medido. Os três vencedores anteriores todos tinham um
2. **Bob como arquitetura, não como digitador.** Modo customizado, Skill, subagentes que fazem parte do produto
3. **Demo funcionando.** Deployada ou com modo offline que roda sem API key. Jurado não vai configurar seu ambiente

### Diferenciação nominal
Dizer contra o que vocês competem. "Diferente de X e Y porque..." Não deixar o jurado adivinhar.

---

## 6. Regras que desqualificam

- **Credencial IBM Cloud em repo público** → conta suspensa na hora. Usar `.gitignore` e `.bobignore`
- **Projeto desenvolvido antes do hackathon.** Pode trazer bibliotecas e tecnologia licenciada; o produto tem que nascer no evento
- **Alterar entregáveis após o prazo**
- Não completar o hackathon inteiro
- Conteúdo ofensivo, político/religioso sensível, malware, ou que fale mal dos patrocinadores
- Participar de mais de um time ou submeter mais de um projeto

Times vencedores podem passar por code review.

---

## 7. Restrições de dados e ferramentas

**Dados**
- Trazer os próprios datasets
- Dados de site público: só se os termos permitirem uso comercial, e **manter lista dos sites usados**
- Proibido: dados de cliente, dados confidenciais de empresa, informação pessoal (PI), dados de redes sociais

**Modelos watsonx.ai proibidos** (usar pode impactar negativamente o julgamento):
- `llama-3-405b-instruct`
- `mistral-medium-2505`
- `mistral-small-3-1-24b-instruct-2503`

**IBM Cloud (opcional)**
- $80 de crédito. Em 100% a conta é **suspensa**
- Alertas em 25%, 50%, 80% — mas saem só de hora em hora, dá para estourar antes do aviso
- Notebook Jupyter custa $1,02/CUH. Preferir API a deixar notebook rodando
- **Não suporta deploy.** Rodar local ou hospedar fora (Vercel etc.)
- Serviços disponíveis: NLU, Speech-to-Text, Text-to-Speech, Cloudant

---

## 8. Plano de trabalho

| Janela | Foco | Portão de saída |
|---|---|---|
| Sex tarde/noite | Núcleo funcionando | Fluxo principal roda ponta a ponta |
| Sáb até 20h | A medição antes/depois | **O número existe.** Se não existir, cortar features até existir |
| Sáb 20h–02h | Interface | Não parece um `cat` de terminal |
| **Sáb à noite** | **Submeter rascunho** | Feedback do Advisor recebido |
| Dom 02h | **Feature freeze** | Nada novo entra |
| Dom 02h–06h | Gravar demo, testar em ambiente limpo | Roda fora da máquina de quem construiu |
| Dom 06h–10h | Vídeo, statements, `bob_sessions`, repo limpo | Tudo commitado |
| Dom 10h–11h | Margem. Não usar | Submetido |

---

## 9. Checklist final

- [ ] Repositório público e acessível sem login
- [ ] Pasta `bob_sessions` com screenshots PNG de **todos** os membros
- [ ] Nenhuma credencial no repo ou no histórico
- [ ] Vídeo com menos de 3 min, público, no YouTube/Vimeo/Drive
- [ ] Statement de problema/solução com 500 palavras ou menos
- [ ] Statement de uso do Bob, específico
- [ ] Lista dos sites públicos usados, se houver
- [ ] E-mails do time conferidos na aba Team Members
- [ ] Todos os entregáveis reenviados na submissão final
- [ ] Trabalho salvo localmente antes de 01/09
