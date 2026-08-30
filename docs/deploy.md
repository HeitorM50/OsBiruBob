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

## Privacidade do artefato

O fixture público é o mesmo arquivo já versionado em
`fixtures/sample-export.json`. Antes de publicar, o bundle deve ser verificado
contra credenciais e caminhos absolutos adicionais. Conteúdo do usuário nunca é
persistido e nunca é enviado para fora da aba.
