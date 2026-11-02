# Uso

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
