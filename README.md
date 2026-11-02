# Local Music

Player desktop de músicas e playlists locais, feito com Electron, React, TypeScript e Vite. Sem conta, recomendações, catálogo de demonstração ou áudio sintetizado. Também reproduz vídeos do YouTube via streaming, sem download.

Os arquivos originais não são copiados, movidos, editados nem excluídos. Biblioteca, favoritos, recentes, playlists e volume ficam em `local-library.json`, no diretório de dados do usuário.

## Instalação

Baixe o instalador da página de [Releases](https://github.com/gustmrg/music-app/releases) (macOS arm64, Windows x64 e Linux x64).

> [!NOTE]
> Os aplicativos **não são assinados**. O macOS e o Windows mostram um aviso na primeira abertura; veja como liberar em [Instalação](docs/installation.md#aplicativo-sem-assinatura).

## Desenvolvimento

```bash
npm install
npm run dev          # Vite + Electron
npm test
```

Requer Node.js 22 ou superior. As mudanças entram por pull request.

## Documentação

- [Instalação](docs/installation.md): downloads, aplicativo sem assinatura, atualizações e YouTube.
- [Uso](docs/usage.md): biblioteca, playlists, fila, YouTube e limites desta versão.
- [Desenvolvimento](docs/development.md): scripts, estrutura do projeto e segurança.
- [Releases](docs/releasing.md): como publicar uma versão.
- [SPEC](SPEC.md): escopo da interface e do comportamento.
