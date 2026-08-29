# Technology Stack — Hindsight

Stack definitiva. Toda nova dependência deve ser justificada contra estes princípios
antes de ser adicionada: **velocidade de entrega** e **baixo consumo de Bobcoins**.
O modo demo deve funcionar 100% local, sem chaves de API e sem rede.

---

## 1. Definição da Stack

### 1.1 Linguagem e Runtime

| Decisão | Valor |
|---|---|
| Linguagem | TypeScript |
| Runtime | Node.js |
| Versão mínima | **Node.js 20 LTS** (20.x) |
| Versão de TypeScript | **5.x** (`strict: true`) |

O target de compilação é `ES2022`. O `tsconfig.json` da raiz é a única fonte de
configuração de compilação — nenhum override por pacote.

### 1.2 Gerenciador de Pacotes

| Decisão | Valor |
|---|---|
| Ferramenta | **npm** (bundled com Node 20 LTS) |
| Arquivo de lock | `package-lock.json` — **deve ser comitado** |
| Estratégia de install | `npm ci` em CI; `npm install` em desenvolvimento |

### 1.3 Validação de JSON

| Decisão | Valor |
|---|---|
| Biblioteca | **[Zod](https://zod.dev/)** `^3` |
| Estratégia | Schemas Zod espelham as interfaces de [`docs/domain-model.md`](./domain-model.md); o parse retorna tipos inferidos. `z.object({ ... }).strict()` rejeita campos extras em modo estrito; `.passthrough()` em modo de forward compatibility. |

### 1.4 Testes

| Decisão | Valor |
|---|---|
| Framework | **[Vitest](https://vitest.dev/)** `^1` |
| Cobertura | `@vitest/coverage-v8` (built-in, sem configuração extra) |
| Convenção de arquivos | `src/**/*.test.ts` |

### 1.5 Interface, CLI e Build

O produto entregue é uma **SPA estática**. A CLI continua existindo como
ferramenta de desenvolvimento sobre o mesmo core.

| Camada | Decisão | Ferramenta |
|---|---|---|
| UI | Biblioteca de componentes | **[React](https://react.dev/)** `^18` |
| UI | Bundler e dev server | **[Vite](https://vite.dev/)** `^5` + `@vitejs/plugin-react` |
| UI | Estilo | CSS Modules — nativo do Vite, zero dependência |
| CLI | Parsing de argumentos | `process.argv` manual — a CLI tem poucas flags |
| CLI | Bundler | **[tsup](https://tsup.egoist.dev/)** `^8` |
| CLI | Output de terminal | **[chalk](https://github.com/chalk/chalk)** `^5` |
| Modo demo | Entrada fixa | `fixtures/sample-export.json` **embutido no bundle** via `import` — zero rede, zero `fs` |

### Dois alvos de build

| Alvo | Comando | Saída | Papel |
|---|---|---|---|
| **Web** | `npm run build:web` | `dist/web/` — HTML, JS, CSS estáticos | O produto |
| **CLI** | `npm run build` | `dist/cli.js` — bundle CJS | Desenvolvimento e CI |

Entry points: `src/ui/main.tsx` para a web, `src/cli.ts` para o terminal.
**Nenhuma funcionalidade pode existir em apenas um dos dois** — os dois são
adaptadores finos sobre o mesmo core.

### 1.6 Catálogos de recomendação

`data/mcp-catalog.json` e `data/tool-catalog.json` são **dado versionado**, não
código. Importados como JSON estático (Vite e tsup resolvem `import` de JSON
nativamente), portanto entram no bundle e funcionam offline.

Tipos em [`domain-model.md`](./domain-model.md), Modelo 10.

---

## 2. Justificativas e Alternativas Descartadas

### 2.1 Runtime — Node.js 20 LTS vs. alternativas

**Justificativa:** Node 20 LTS é o runtime que o ambiente de desenvolvimento já
possui (evidenciado pelo `package-lock.json` do repositório-benchmark). Zero
custo de instalação, zero risco de incompatibilidade com dependências do npm.

| Alternativa | Motivo do descarte |
|---|---|
| **Bun** | Runtime mais rápido em benchmarks, mas sem garantia de compatibilidade total com o ecossistema npm existente; adicionaria risco sem retorno mensurável no escopo atual. |
| **Deno** | Requer adaptação de imports e gestão de permissões — overhead de aprendizado desnecessário para uma CLI de análise de JSON. |

### 2.2 Gerenciador de Pacotes — npm vs. alternativas

**Justificativa:** npm 10 vem embutido no Node 20 LTS — nenhuma instalação adicional,
nenhum Bobcoin gasto em setup. `package-lock.json` já é o artefato esperado pelo
repositório-benchmark da IBM.

| Alternativa | Motivo do descarte |
|---|---|
| **pnpm** | Excelente, mas exige instalação separada e `pnpm-lock.yaml`; adiciona uma etapa de onboarding sem ganho real no tamanho deste projeto. |
| **yarn** | Mesmo argumento do pnpm; o formato `yarn.lock` introduz divergência com o baseline documentado. |

### 2.3 Validação de JSON — Zod vs. alternativas

**Justificativa:** Zod infere tipos TypeScript diretamente dos schemas — um schema
define tanto a validação runtime quanto o tipo estático, eliminando duplicação.
Integração com o `domain-model.md` é imediata.

| Alternativa | Motivo do descarte |
|---|---|
| **AJV** | Mais rápido para schemas JSON Schema puros, mas requer manter schemas em JSON separados dos tipos TypeScript — duplicação de contrato. |
| **Validação manual** | Viável para estruturas simples, mas o export do Bob tem ≥ 8 modelos com variantes por role; manutenção se torna inviável rapidamente. |

### 2.4 Testes — Vitest vs. alternativas

**Justificativa:** Vitest usa a mesma sintaxe do Jest (`describe`/`it`/`expect`),
tem suporte nativo a TypeScript sem configuração extra, e é significativamente
mais rápido em repos TypeScript puros.

| Alternativa | Motivo do descarte |
|---|---|
| **Jest** | Requer `ts-jest` ou `babel-jest` para TypeScript — configuração adicional e transformação mais lenta. Para o escopo deste projeto, o overhead não se justifica. |
| **Mocha + Chai** | Ecossistema fragmentado (assertion lib separada, type definitions separadas); mais boilerplate de configuração. |

### 2.5 Interface — React + Vite vs. alternativas

**Justificativa:** o produto precisa de quatro telas com abas, tabelas, diff e
lista de achados expansível — estado de UI o suficiente para que manipular DOM na
mão custe mais tempo do que o projeto tem. React resolve isso com o modelo que
todo mundo do time já conhece, e Vite entrega dev server instantâneo e build
estático sem configuração.

Design e usabilidade valem 5 dos 20 pontos da avaliação. É a área onde ferramenta
de análise normalmente perde ponto, e não é lugar para economizar.

| Alternativa | Motivo do descarte |
|---|---|
| **TypeScript puro + DOM** | Menos dependência e bundle menor, mas montar abas, diff e listas expansíveis à mão consome justamente o recurso mais escasso — tempo. |
| **Preact** | API praticamente idêntica com bundle menor, mas o ganho é irrelevante num app estático aberto localmente, e o alias de compatibilidade adiciona um ponto de configuração a mais. |
| **Next.js** | Traz SSR, roteamento de servidor e um runtime que **quebraria a premissa de deploy estático sem backend**. Resolve problemas que não temos. |
| **Svelte / Vue** | Tecnicamente adequados; descartados por familiaridade do time, não por mérito. |

### 2.6 Build — tsup vs. alternativas

**Justificativa:** `tsup` é configurável em zero linhas para o caso mais comum
(`tsup src/cli.ts --format cjs`). Baseado em esbuild internamente — build em
milissegundos. Uma linha no `package.json` é suficiente.

| Alternativa | Motivo do descarte |
|---|---|
| **tsc direto** | Não faz bundle; produz múltiplos arquivos `.js` que exigem gestão manual de caminhos no binário distribuído. |
| **Webpack / Rollup** | Configuração verbosa para uma CLI simples; tempo de setup desproporcional ao ganho. |

---

## 3. Comandos Canônicos

Todos os comandos abaixo são executados a partir da **raiz do repositório**.
Estes são os únicos comandos válidos — variações não documentadas aqui não são suportadas.

### Instalação de dependências

```bash
npm ci
```

> Use `npm install` apenas ao adicionar uma nova dependência. Commitar o
> `package-lock.json` atualizado junto com a mudança.

### Execução em desenvolvimento

```bash
npm run dev
```

> Equivale a `ts-node --esm src/cli.ts` (ou `tsx src/cli.ts`). Recarrega
> automaticamente com `--watch` se configurado no `package.json`.

### Suíte de testes

```bash
npm test
```

> Executa `vitest run`. Para modo watch durante desenvolvimento:

```bash
npm run test:watch
```

### Aplicação web — desenvolvimento

```bash
npm run dev:web
```

> Equivale a `vite`. Abre a SPA com hot reload. **É o produto.**

### Aplicação web — build estático

```bash
npm run build:web
```

> Equivale a `vite build`. Saída em `dist/web/`: HTML, JS e CSS estáticos, sem
> runtime de servidor e sem variável de ambiente. É o que vai para o deploy.

```bash
npm run preview
```

> Equivale a `vite preview`. Serve `dist/web/` localmente para conferir o build
> antes de publicar.

### Build da CLI

```bash
npm run build
```

> Equivale a `tsup src/cli.ts --format cjs --dts --clean`. Saída em `dist/`.

### Modo demo (local, sem chaves de API)

O modo demo do **produto** é o botão "Ver exemplo" na própria SPA: carrega
`fixtures/sample-export.json` embutido no bundle. Funciona em máquina limpa, sem
arquivo, sem credencial e sem rede.

No terminal, o equivalente é:

```bash
npm run demo
```

> Equivale a `npm run build && node dist/cli.js --input fixtures/sample-export.json --demo`.
> **O build faz parte do comando de propósito:** sem ele, `node dist/cli.js` falha
> com `MODULE_NOT_FOUND` num clone limpo.
> Entrada: [`fixtures/sample-export.json`](../fixtures/sample-export.json)
> (cópia fiel do export real da Rodada A). Saída: análise completa no terminal.

---

## 4. Estrutura esperada de `package.json` (scripts)

> **Estado atual:** o `package.json` ainda tem apenas os scripts da CLI
> (`dev`, `build`, `test`, `test:watch`, `test:cov`, `demo`, `typecheck`).
> `dev:web`, `build:web` e `preview` entram junto com as dependências de UI, no
> início da F6 — adicioná-los antes criaria comandos que falham. A correção do
> `demo` (prefixar com `npm run build`) entra na mesma mudança.

```json
{
  "scripts": {
    "dev":        "tsx src/cli.ts",
    "dev:web":    "vite",
    "build":      "tsup src/cli.ts --format cjs --dts --clean",
    "build:web":  "vite build",
    "preview":    "vite preview",
    "test":       "vitest run",
    "test:watch": "vitest",
    "test:cov":   "vitest run --coverage",
    "demo":       "npm run build && node dist/cli.js --input fixtures/sample-export.json --demo",
    "typecheck":  "tsc --noEmit"
  }
}
```

> `demo` depende de `build` de propósito — ver [Modo demo](#modo-demo-local-sem-chaves-de-api).

---

## 5. Dependências de produção e desenvolvimento esperadas

| Pacote | Tipo | Versão | Papel |
|---|---|---|---|
| `zod` | prod | `^3` | Validação e tipagem do contrato de domínio |
| `react` | prod | `^18` | Biblioteca de UI da SPA |
| `react-dom` | prod | `^18` | Renderização da SPA no browser |
| `chalk` | prod | `^5` | Output colorido no terminal (só CLI) |
| `vite` | dev | `^5` | Dev server e build estático da web |
| `@vitejs/plugin-react` | dev | `^4` | Suporte a React no Vite |
| `@types/react` | dev | `^18` | Tipos do React |
| `@types/react-dom` | dev | `^18` | Tipos do React DOM |
| `tsup` | dev | `^8` | Build da CLI |
| `typescript` | dev | `^5` | Compilador |
| `tsx` | dev | `^4` | Execução TypeScript em desenvolvimento sem build |
| `vitest` | dev | `^1` | Framework de testes |
| `@vitest/coverage-v8` | dev | `^1` | Cobertura de código |
| `@types/node` | dev | `^20` | Tipos do Node.js |

---

## 6. Restrições do alvo web

O core (`parser`, `observe`, `diagnose`, `prescribe`, `compare`) é compilado para o
browser sem alteração. Para que continue assim:

- **Nenhuma API de Node fora de `src/cli.ts`.** Sem `fs`, `path`, `process`, `os`.
  O arquivo de entrada é lido com `FileReader`; o fixture e os catálogos entram por
  `import` estático.
- **Nenhuma requisição de rede em runtime.** Sem `fetch`, `XMLHttpRequest`,
  WebSocket ou telemetria. O bundle é autocontido.
- **Conteúdo do export nunca vira HTML.** Sem `dangerouslySetInnerHTML`,
  `innerHTML` ou `eval` — o export é entrada não-confiável também no navegador.
- **Sem persistência.** Nada de `localStorage` com dado de sessão alheia. Recarregar
  perde o estado, e isso é preferível.

## 7. Proibições

Estas dependências **não entram**, em nenhuma fase, e a proibição é arquitetural
(ver [`architecture.md`](./architecture.md), seção "Nenhuma chamada a LLM"):

| Categoria | Exemplos | Por quê |
|---|---|---|
| SDK de LLM | `@anthropic-ai/sdk`, `openai`, `@ibm-cloud/watsonx-ai` | Quebra o modo demo sem API key, o deploy estático, a privacidade e a explicabilidade |
| Cliente HTTP | `axios`, `node-fetch`, `got` | Não há nada para buscar — o dado vem do arquivo do usuário |
| Framework de backend | Express, Fastify, Next.js | Não há servidor, e não pode haver: o export não sai da máquina |
| Banco de dados / ORM | qualquer | Não há estado persistido |
| Telemetria / analytics | qualquer | Enviaria dado de sessão privada |

Toda recomendação do Hindsight é **regra + catálogo**, determinística e rastreável
até um campo do export.
