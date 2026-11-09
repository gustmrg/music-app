// Interface text produced by both the main process and the renderer. This
// file must stay free of imports so the renderer and the main-process bundle
// can both include it.

// YouTube changes often and yt-dlp follows; an outdated yt-dlp is the usual
// cause when videos that used to play start failing (for example, stream URLs
// that stop after the first few hundred KiB). See docs/installation.md.
export const YT_DLP_UPDATE_HINT = "Se outros vídeos também falharem, atualize o yt-dlp (yt-dlp -U, pipx upgrade yt-dlp ou o gerenciador de pacotes que o instalou)."
