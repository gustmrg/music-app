# Releases

As releases são geradas pelo workflow [Desktop release](../.github/workflows/release.yml), disparado manualmente. Os instaladores não são assinados; veja [Instalação](installation.md#aplicativo-sem-assinatura).

## Publicar uma versão

1. Confirme que o CI da `main` está verde.
2. Em **Actions → Desktop release → Run workflow**, escolha a branch `main` e informe a versão: `patch`, `minor`, `major` ou uma versão exata como `0.3.0`.
3. Aguarde os jobs terminarem. A release aparece em **Releases**.

O `package.json` fica em `0.0.0` até a primeira release, e depois sempre na última versão publicada, porque o workflow commita o bump. A primeira release é a `0.1.0`: informe `minor`. Depois dela, `patch` gera `0.1.1`, `minor` gera `0.2.0` e `major` gera `1.0.0`.

## O que o workflow faz

1. **version** resolve a versão a partir de `package.json`, recusa tag já existente e prerelease, e descobre a tag anterior para as notas.
2. **verify** (`typecheck`, `test`, `build`) e **package** rodam em paralelo. O `package` gera DMG (macOS arm64), NSIS (Windows x64) e AppImage e deb (Linux x64).
3. **release** só roda se os dois passarem. Ele commita o bump de versão (`chore(release): prepare v<versão>`) na `main`, cria a tag `v<versão>`, gera o `SHA256SUMS.txt`, cria a release como rascunho com as notas automáticas, envia os arquivos e só então a publica.

Se qualquer etapa falhar antes do job `release`, nada é commitado nem tagueado.

## Proteção da main

O job `release` envia o commit de versão e a tag diretamente para a `main` com o `GITHUB_TOKEN`. Se a `main` tiver um ruleset exigindo pull request, esse push é recusado. Nesse caso, crie uma deploy key com escrita, adicione-a como *bypass actor* do ruleset, guarde a chave privada no secret `RELEASE_DEPLOY_KEY` e passe `ssh-key: ${{ secrets.RELEASE_DEPLOY_KEY }}` no `actions/checkout` do job `release`.
