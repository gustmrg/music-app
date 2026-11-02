# Desenvolvimento

Use Node.js 22 ou superior e npm. O projeto mantém apenas `package-lock.json` como lockfile.

```bash
npm install
npm run dev          # Vite + Electron
npm run dev:web      # prévia web em http://127.0.0.1:5173
npm run typecheck
npm test             # importação, playlists, YouTube e persistência local
npm run build
npm run dist         # empacotamento em release/
```

Os alvos de empacotamento são DMG, NSIS, AppImage e deb. O identificador interno do aplicativo (`appId`) permanece o mesmo para manter o diretório de dados. As mudanças entram por pull request e o [CI](../.github/workflows/ci.yml) roda `typecheck`, `test` e `build`. Para publicar uma versão, veja [Releases](releasing.md).

## Estrutura

```text
.github/workflows/
  ci.yml             typecheck, testes e build em PRs e na main
  release.yml        versão, empacotamento e publicação da release
docs/                documentação detalhada
electron/
  main.cjs           janela, seletores nativos, IPC e protocolo de áudio
  preload.cjs        API restrita exposta à interface
  library.cjs        arquivos, playlists e persistência JSON
  youtube.cjs        links do YouTube, metadados e resolução de stream via yt-dlp
  audio.cjs          streaming de áudio com suporte a intervalos de bytes
  library.test.cjs   testes com arquivos temporários
  youtube.test.cjs   testes de análise de links e metadados
build/
  icon.png           ícone do aplicativo usado pelo electron-builder
public/
  icon.png           favicon da interface
scripts/
  checksums.mjs      gera o SHA256SUMS.txt da release
src/
  App.tsx            biblioteca e gerenciamento de playlists
  library.ts         tipos e funções de apresentação
  components/Player.tsx  reprodução HTMLAudioElement
  components/ui/     componentes usados de Button, Input e Sheet
  index.css          tema escuro e layout local
```

## Segurança

A interface não tem acesso ao Node.js e roda com isolamento de contexto e sandbox. O protocolo de áudio aceita apenas identificadores de músicas previamente selecionadas; não recebe caminhos arbitrários. Ele segue a [API de protocolos do Electron](https://www.electronjs.org/docs/latest/api/protocol/). As gravações normais ficam no arquivo de biblioteca; a exportação só grava a playlist no destino escolhido no seletor nativo.
