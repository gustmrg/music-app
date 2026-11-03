# Local Music

[English](README.md) | **Português (Brasil)**

Um player de música para o desktop construído em torno da sua própria biblioteca. Adicione os arquivos de áudio que já estão no seu computador, encontre e baixe álbuns pelo seu indexador de torrents ou ouça do YouTube por streaming. Sem conta, sem assinatura e sem catálogo embutido: a biblioteca começa vazia e só tem o que você adicionar.

> [!NOTE]
> Projeto pessoal em desenvolvimento inicial (versões 0.x). Funciona, mas ainda muda bastante.

## O que ele faz

- **Biblioteca local:** adicione arquivos ou pastas inteiras (MP3, FLAC, WAV, OGG, Opus, M4A, AAC e WebM). Tags e capas embutidas são lidas na importação, para navegar por Álbuns, Biblioteca, Pastas, Favoritos e Recentes, com filtros por artista, gênero, formato e origem.
- **Torrents pelo seu indexador:** o **Descobrir** busca no seu Prowlarr ou Jackett, toca na hora qualquer faixa de um resultado e salva na biblioteca os álbuns ou faixas que você quiser manter.
- **YouTube:** cole links de vídeos, playlists ou transmissões ao vivo e ouça por streaming, resolvido pelo yt-dlp no momento em que a faixa toca. As transmissões ao vivo também precisam do ffmpeg.
- **Playlists e fila:** crie playlists a partir de faixas selecionadas, reordene, importe e exporte M3U/M3U8 e salve a fila atual.
- **Seus arquivos intactos:** arquivos importados nunca são movidos, editados nem excluídos; edições de álbum e tags ficam só no aplicativo.
- **Sem telemetria:** a biblioteca fica em um arquivo local. O acesso à rede acontece só para o YouTube e para o indexador e os torrents que você configurar.

## Instalação

Baixe o instalador na página de [Releases](https://github.com/gustmrg/music-app/releases) (macOS arm64, Windows x64 e Linux x64). O YouTube exige o [yt-dlp](https://github.com/yt-dlp/yt-dlp) instalado no sistema, e o Descobrir exige uma instância do Prowlarr ou do Jackett.

> [!IMPORTANT]
> Os aplicativos **não são assinados**. macOS e Windows mostram um aviso na primeira abertura; veja como liberar em [Installation](docs/installation.md#unsigned-app).

> [!WARNING]
> Streams por torrent baixam **e enviam** partes dos arquivos para outras pessoas da rede, que veem o seu IP. A legalidade depende do país e do conteúdo. Você é responsável pelo que busca, toca e salva.

## Próximos passos

- Salvar na biblioteca o áudio de faixas e livestreams do YouTube.
- Monitoramento automático de pastas.

## Rodando a partir do código

```bash
npm install
npm run dev          # Vite + Electron
npm test
```

Requer Node.js 22.18 ou mais recente (o CI usa o 24, a versão embutida no Electron). Veja [Development](docs/development.md) para a estrutura do projeto.

## Documentação

- [Installation](docs/installation.md): downloads, app sem assinatura, atualizações e YouTube.
- [Usage](docs/usage.md): biblioteca, álbuns, playlists, Descobrir, YouTube e limites atuais.
- [Development](docs/development.md): scripts, estrutura do projeto e segurança.
- [Releases](docs/releasing.md): como publicar uma versão.
- [Decisions](docs/adr/README.md): registros de decisões de arquitetura.

A documentação está em inglês. Só o README também está em português.

## Licença

[MIT](LICENSE)
