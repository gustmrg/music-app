# Local Music

Player desktop de músicas e playlists locais, feito com Electron, React, TypeScript e Vite. Sem conta, recomendações, catálogo de demonstração ou áudio sintetizado. Também reproduz vídeos do YouTube via streaming, sem download.

## Uso

- **Abrir arquivos** seleciona músicas individuais.
- **Adicionar pasta** lê músicas da pasta e das subpastas. Use o botão novamente para encontrar arquivos adicionados depois; não há monitoramento automático.
- **Biblioteca**, **Pastas**, **Favoritos** e **Recentes** organizam os arquivos selecionados.
- **Playlists** permite criar, renomear, escolher/remover músicas, reordenar e excluir seleções. Também importa M3U/M3U8 em UTF-8 e exporta M3U8 com caminhos relativos.
- O player reproduz arquivos reais, com pausa/retomada, busca na faixa, volume, anterior/próxima, repetição e aleatório. Em ordem, a reprodução para no final da fila.
- A fila é temporária e independente das playlists. Use **Salvar playlist** para guardá-la.
- **YouTube** (desktop) importa vídeos e playlists do YouTube a partir de links colados, um por linha, e cria uma playlist quando o envio tem vários vídeos. Requer o [yt-dlp](https://github.com/yt-dlp/yt-dlp) instalado no sistema; nenhum vídeo é baixado — o áudio é resolvido via yt-dlp no momento em que a faixa começa a tocar, porque os endereços de stream expiram em poucas horas.

Os arquivos originais não são copiados, movidos, editados nem excluídos. Biblioteca, favoritos, recentes, playlists e volume ficam em `local-library.json`, no diretório `userData` do Electron. A reprodução não recomeça automaticamente ao abrir o app.

## Limites desta versão

- Os títulos vêm dos nomes dos arquivos; a pasta é exibida separadamente. Tags de artista/álbum e capas embutidas ainda não são lidas.
- Extensões selecionáveis: MP3, WAV, FLAC, OGG, Opus, M4A, AAC e WebM. A reprodução depende dos codecs presentes na versão do Electron e do conteúdo do arquivo; erros aparecem na interface.
- Arquivos movidos, apagados ou em discos desconectados permanecem referenciados e apresentam erro ao reproduzir. Readicione-os a partir da localização atual.
- Playlists importam apenas referências locais, sem URLs de streaming ou compartilhamentos de rede. M3U antigo com outra codificação deve ser convertido para UTF-8.
- A mesma música aparece uma vez por playlist. Links simbólicos de diretórios não são percorridos.
- A prévia web permite abrir arquivos/pastas somente durante a sessão; persistência e importação/exportação M3U são recursos do desktop.

## Desenvolvimento

Use Node.js 22 ou superior e npm. O projeto mantém apenas `package-lock.json` como lockfile.

```bash
npm install
npm run dev          # Vite + Electron
npm run dev:web      # prévia web em http://127.0.0.1:5173
npm run typecheck
npm test             # importação, playlists e persistência local
npm run build
npm run dist         # empacotamento em release/
```

Os alvos existentes de empacotamento foram preservados: DMG, NSIS, AppImage e deb. O identificador interno do aplicativo permanece o mesmo para manter seu diretório de dados.

## Estrutura

```text
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
src/
  App.tsx            biblioteca e gerenciamento de playlists
  library.ts         tipos e funções de apresentação
  components/Player.tsx  reprodução HTMLAudioElement
  components/ui/     componentes usados de Button, Input e Sheet
  index.css          tema escuro e layout local
```

A interface continua sem acesso ao Node.js, com isolamento de contexto e sandbox. O protocolo de áudio aceita apenas identificadores de músicas previamente selecionadas; não recebe caminhos arbitrários. Ele segue a [API de protocolos do Electron](https://www.electronjs.org/docs/latest/api/protocol/). As gravações normais ficam no arquivo de biblioteca; a exportação só grava a playlist no destino escolhido no seletor nativo.
