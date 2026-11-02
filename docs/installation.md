# Instalação

Os instaladores ficam na página de [Releases](https://github.com/gustmrg/music-app/releases). Cada release traz também o `SHA256SUMS.txt`.

| Sistema | Arquivo | Arquitetura |
| --- | --- | --- |
| macOS | `local-music-<versão>-mac-arm64.dmg` | Apple Silicon |
| Windows | `local-music-<versão>-win-x64.exe` | x64 |
| Linux | `local-music-<versão>-linux-<arch>.AppImage` ou `.deb` | x64 |

Para conferir um download, rode `sha256sum -c SHA256SUMS.txt --ignore-missing` (Linux), `shasum -a 256 -c SHA256SUMS.txt --ignore-missing` (macOS) ou compare com `Get-FileHash <arquivo>` (Windows).

## Aplicativo sem assinatura

Os instaladores **não são assinados** (sem certificado de desenvolvedor da Apple nem assinatura de código no Windows) e o app não é notarizado. Os sistemas operacionais mostram um aviso na primeira abertura. Isso não indica um problema no arquivo; instale apenas arquivos baixados da página de Releases deste repositório.

### macOS

O Gatekeeper bloqueia a primeira abertura. Depois de arrastar **Local Music** para Aplicativos, use uma das opções:

- Abra o app, feche o aviso, vá em **Ajustes do Sistema → Privacidade e Segurança** e clique em **Abrir mesmo assim**.
- Ou remova o atributo de quarentena pelo terminal:

  ```bash
  xattr -cr "/Applications/Local Music.app"
  ```

Se o macOS disser que o app "está danificado e não pode ser aberto", é o mesmo bloqueio; o comando acima resolve.

### Windows

O SmartScreen mostra "O Windows protegeu o computador". Clique em **Mais informações** e depois em **Executar assim mesmo**.

### Linux

- **AppImage:** torne o arquivo executável e abra-o.

  ```bash
  chmod +x local-music-*.AppImage
  ./local-music-*.AppImage
  ```

- **deb:** `sudo apt install ./local-music-*.deb`.

## Atualizações

O app não se atualiza sozinho. Para atualizar, instale a release mais recente por cima da anterior. A biblioteca fica em `local-library.json` no diretório de dados do usuário e é mantida.

## YouTube

Para importar links do YouTube é preciso ter o [yt-dlp](https://github.com/yt-dlp/yt-dlp) instalado no sistema e disponível no `PATH`. O restante do app funciona sem ele.
