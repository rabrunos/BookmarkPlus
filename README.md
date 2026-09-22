# Favoritos+ para Edge — v0.3

## Novidades

- ícone da extensão trocado pela estrela contornada usada pelo próprio gerenciador de Favoritos do Edge;
- a área central agora mostra **todos os favoritos de todos os níveis ao mesmo tempo**;
- cada pasta vira uma seção contínua no conteúdo;
- a barra lateral funciona como **índice de navegação**;
- clicar numa pasta na lateral apenas rola a página até aquela seção;
- ao rolar a área central, a pasta correspondente é destacada na lateral;
- busca continua funcionando globalmente;
- adicionar favorito/pasta usa a pasta atualmente selecionada no índice;
- Copiar HTML continua copiando a pasta selecionada;
- importar/mesclar/backups continuam disponíveis em `⋯`.

## Instalação

1. Extraia o ZIP.
2. Abra `edge://extensions/`.
3. Remova/desative a versão anterior.
4. Ative **Modo de desenvolvedor**.
5. Clique em **Carregar sem compactação**.
6. Selecione a pasta `FavoritosPlus_Edge_v0.3`.
7. Abra `edge://favorites/?id=1`.

## Observação

A visão contínua não altera a estrutura real dos favoritos. É apenas uma forma diferente de visualizar e navegar pelos mesmos dados da API `chrome.bookmarks`.

## Compatibilidade com ExtNest

Esta versão inclui suporte ao ExtNest Bridge v1.

- `.extnest.json` identifica o repositório como uma extensão compatível com ExtNest;
- `manifest.json` possui `key` fixa para manter o mesmo ID entre computadores;
- `extnest/bridge.js` permite ping, backup/restauração de configuração e reload;
- o backup do ExtNest inclui apenas `favoritosPlusExpanded` (estado visual das pastas expandidas);
- os favoritos e os backups internos de favoritos não são enviados pelo Config Bridge.

O repositório deve manter `manifest.json` e `.extnest.json` na raiz.
