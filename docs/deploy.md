# Deploy estático

O Hindsight é publicado em:

**https://heitorm50.github.io/OsBiruBob/**

O GitHub Pages recebe exatamente o conteúdo de `dist/web/` produzido por
`npm run build:web`. Não existe runtime de servidor, variável de ambiente,
credencial ou etapa de upload de sessão.

## Como reproduzir em máquina limpa

```bash
git clone https://github.com/HeitorM50/OsBiruBob.git
cd OsBiruBob
npm ci
npm run build:web
```

O build deve gerar apenas `dist/web/index.html`. O HTML contém o JavaScript, o
CSS, o fixture do modo demo e os catálogos por import estático. Por isso, o mesmo
arquivo funciona hospedado ou aberto diretamente com `file://`.

## Verificação do deploy

1. Abra a URL em uma janela anônima, sem login.
2. Abra DevTools → **Network**, limpe a lista e recarregue a página.
3. Confirme que só existe o documento da própria URL, sem origem externa e sem
   resposta `404`.
4. Limpe a lista novamente e clique em **Ver exemplo**.
5. Confirme que a análise da Rodada A aparece e que nenhuma nova requisição foi
   criada.
6. Recarregue a página e confirme que a análise anterior não foi persistida.

Os checks do CI também bloqueiam referências a scripts ou folhas de estilo
externos e APIs de rede (`fetch`, `XMLHttpRequest` e `WebSocket`) no artefato.

### Registro de 30 de agosto de 2026

O commit da issue foi clonado em um diretório temporário e verificado sem usar o
`node_modules` do ambiente de desenvolvimento:

| Verificação | Resultado |
|---|---|
| `npm ci` | concluído em clone limpo |
| `npm run build:web` | concluído; 1 arquivo, 321.057 bytes (90,14 kB gzip) |
| abertura direta por `file://` | Rodada A carregada pelo modo demo |
| Chromium 151 em sessão anônima | 0 requisições após clicar em **Ver exemplo**; 0 erros de console |
| APIs de rede no bundle | nenhuma ocorrência de `fetch`, `XMLHttpRequest` ou `WebSocket` |
| credenciais de alta confiança | 0 ocorrências |
| caminhos absolutos adicionais | 0; os 15 encontrados já pertencem ao fixture versionado |

A confirmação visual da aba Network da URL publicada fica anexada à issue de
deploy, para que a evidência não dependa apenas dos checks automatizados.

## Privacidade do artefato

O fixture público é o mesmo arquivo já versionado em
`fixtures/sample-export.json`. Antes de publicar, o bundle deve ser verificado
contra credenciais e caminhos absolutos adicionais. Conteúdo do usuário nunca é
persistido e nunca é enviado para fora da aba.
