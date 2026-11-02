# Local Music

[English](README.md) | **Português (Brasil)**

Um player de música para o desktop que toca o que já é seu: os arquivos do seu computador e os links do YouTube que você colar. Sem conta, sem assinatura, sem recomendações e sem catálogo de terceiros. Sua biblioteca começa vazia e só tem o que você escolher adicionar.

> [!NOTE]
> Projeto pessoal em desenvolvimento inicial (versões 0.x). Funciona, mas ainda muda bastante.

## O que ele faz

- **Biblioteca local:** adicione arquivos ou pastas inteiras (MP3, FLAC, WAV, OGG, Opus, M4A, AAC e WebM) e navegue por Biblioteca, Pastas, Favoritos e Recentes.
- **Playlists suas:** crie, reordene e exporte em M3U8; importe M3U/M3U8 que você já tem.
- **Fila e player completos:** busca na faixa, volume, repetição, aleatório e uma fila temporária que você pode salvar como playlist.
- **YouTube sem download:** cole links de vídeos ou playlists e ouça por streaming, resolvido no momento em que a faixa toca.
- **Seus arquivos intactos:** nada é copiado, movido, editado nem excluído.
- **Privado por padrão:** tudo fica em um arquivo local, sem serviço remoto nem telemetria.

## Instalação

Baixe o instalador da página de [Releases](https://github.com/gustmrg/music-app/releases) (macOS arm64, Windows x64 e Linux x64).

> [!IMPORTANT]
> Os aplicativos **não são assinados**. O macOS e o Windows mostram um aviso na primeira abertura; veja como liberar em [Installation](docs/installation.md#unsigned-app) (em inglês).

## Rodando a partir do código

```bash
npm install
npm run dev          # Vite + Electron
npm test
```

Requer Node.js 22 ou superior. As mudanças entram por pull request.

## Direção

O foco é ser um player local simples e rápido. Ficaram de fora da primeira versão, e são os candidatos naturais para as próximas: leitura de tags de artista e álbum, capas embutidas, monitoramento automático de pastas, equalizador e letras. O escopo completo está no [SPEC](SPEC.md) (em inglês).

## Documentação

A documentação está em inglês. Apenas o README tem versão em português.

- [Installation](docs/installation.md): downloads, aplicativo sem assinatura, atualizações e YouTube.
- [Usage](docs/usage.md): biblioteca, playlists, fila, YouTube e limites desta versão.
- [Development](docs/development.md): scripts, estrutura do projeto e segurança.
- [Releases](docs/releasing.md): como publicar uma versão.
- [SPEC](SPEC.md): escopo da interface e do comportamento.
