# Favoritos+ para Edge — v0.4.0

## Novidades

- a área central mostra somente a raiz selecionada na barra lateral;
- Barra de Favoritos, Outros Favoritos, Favoritos do celular e Espaços de trabalho ficam separados;
- pastas na área principal podem ser recolhidas e expandidas;
- corrigido o botão de recolher/expandir da pasta selecionada na barra lateral;
- favoritos podem ser arrastados para reordenar;
- favoritos podem ser movidos para dentro ou para fora de pastas;
- pastas também podem ser reorganizadas;
- itens podem ser arrastados diretamente para pastas e raízes da barra lateral;
- a ordem exibida segue a estrutura real da API de favoritos do Edge;
- busca continua global;
- importar/mesclar/backups continuam disponíveis em `⋯`.

## Compatibilidade com ExtNest

O repositório é compatível com ExtNest:

- `.extnest.json` obrigatório na raiz;
- `manifest.json` possui `key` fixa;
- ExtNest Bridge v1 integrado;
- backup de configuração inclui:
  - `favoritosPlusExpanded`;
  - `favoritosPlusContentCollapsed`;
- favoritos reais e backups internos de favoritos não são enviados ao backup do ExtNest.

## Atualização via ExtNest

O ExtNest compara a versão local com `manifest.version`.

Versão atual:

```text
0.4.0
```

Ao detectar uma instalação anterior, o ExtNest deve oferecer a atualização e baixar o ZIP da branch quando você clicar em atualizar.
