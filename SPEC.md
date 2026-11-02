# Local Music — escopo da interface

## Objetivo

Acessar músicas e playlists do próprio computador. Sem serviço remoto, conta, assinatura, anúncios, feed social ou catálogo fictício.

## Layout

- Tema escuro com destaque vermelho, preservando a identidade visual do protótipo.
- Barra lateral: Biblioteca, Pastas, Playlists, Favoritos e Recentes; playlists pessoais abaixo.
- Topo: busca por nome de música, arquivo ou pasta; abrir arquivos; adicionar pasta; controles de janela no desktop.
- Conteúdo: listas de arquivos ou coleções de pastas/playlists. Sem conteúdo inventado quando a biblioteca está vazia.
- Player fixo no rodapé: faixa atual, favorito, volume, progresso real, reprodução/pausa, anterior/próxima, modos de reprodução e fila.
- Painéis laterais para fila e edição de playlists, com rótulos acessíveis e navegação por teclado.

## Comportamento

A biblioteca começa vazia. Apenas seleções explícitas de arquivos/pastas/playlists locais adicionam músicas. Adicionar a mesma pasta não duplica referências. Pastas são agrupadas pela localização real dos arquivos.

Favoritos, recentes, volume e playlists persistem no desktop. A fila é temporária. Playlists salvas podem ser reordenadas sem alterar a fila em execução. Excluir uma playlist ou limpar a fila nunca exclui arquivos de música.

Reprodução em ordem para no fim da fila; repetir fila retorna ao começo; repetir música reinicia a faixa; aleatório escolhe outra faixa quando há mais de uma disponível. Pausar preserva a posição. O progresso e a duração vêm do áudio real.

Arquivos inacessíveis e formatos incompatíveis geram mensagens, sem áudio de demonstração como substituto. Importação ignora referências remotas e informa itens ignorados. Na prévia web, a interface informa que os arquivos duram apenas durante a sessão.

Leitura de tags, capas embutidas, monitoramento de pastas, equalizador e letras ficam fora desta primeira versão. O protótipo anterior está preservado no histórico Git.
