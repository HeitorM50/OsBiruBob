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

### 1.5 CLI, Build e Interface

| Camada | Decisão | Ferramenta |
|---|---|---|
| CLI | Parsing de argumentos | **[Cleye](https://github.com/privatenumber/cleye)** ou `process.argv` manual para CLIs simples |
| Build | Bundler | **[tsup](https://tsup.egoist.dev/)** `^8` |
| Output de terminal | Formatação e cores | **[chalk](https://github.com/chalk/chalk)** `^5` + tabelas via template literal simples |
| Modo demo | Entrada fixa | `fixtures/sample-export.json` carregado com `fs.readFileSync` — zero dependência de rede |

O build produz um único binário CJS em `dist/`. O entry point da CLI é `src/cli.ts`.

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

### 2.5 Build — tsup vs. alternativas

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

### Build

```bash
npm run build
```

> Equivale a `tsup src/cli.ts --format cjs --dts --clean`. Saída em `dist/`.

### Modo demo (local, sem chaves de API)

```bash
npm run demo
```

> Equivale a `node dist/cli.js --input fixtures/sample-export.json --demo`.
> Não faz chamadas de rede. Entrada: [`fixtures/sample-export.json`](../fixtures/sample-export.json)
> (cópia fiel do export real da Rodada A). Saída: análise completa no terminal.

---

## 4. Estrutura esperada de `package.json` (scripts)

```json
{
  "scripts": {
    "dev":        "tsx src/cli.ts",
    "build":      "tsup src/cli.ts --format cjs --dts --clean",
    "test":       "vitest run",
    "test:watch": "vitest",
    "test:cov":   "vitest run --coverage",
    "demo":       "node dist/cli.js --input fixtures/sample-export.json --demo",
    "typecheck":  "tsc --noEmit"
  }
}
```

---

## 5. Dependências de produção e desenvolvimento esperadas

| Pacote | Tipo | Versão | Papel |
|---|---|---|---|
| `zod` | prod | `^3` | Validação e tipagem do contrato de domínio |
| `chalk` | prod | `^5` | Output colorido no terminal |
| `tsup` | dev | `^8` | Build da CLI |
| `typescript` | dev | `^5` | Compilador |
| `tsx` | dev | `^4` | Execução TypeScript em desenvolvimento sem build |
| `vitest` | dev | `^1` | Framework de testes |
| `@vitest/coverage-v8` | dev | `^1` | Cobertura de código |
| `@types/node` | dev | `^20` | Tipos do Node.js |

> Nenhuma dependência de framework web (Express, Fastify, etc.) é adicionada nesta
> fase. O Hindsight é uma ferramenta CLI — output no terminal, não em browser.
