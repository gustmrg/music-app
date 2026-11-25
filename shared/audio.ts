// Supported audio extensions shared by the main process and the renderer.
// Kept free of imports so both bundles can include it directly.
export const AUDIO_EXTENSIONS = ["mp3", "wav", "flac", "ogg", "opus", "m4a", "aac", "webm"] as const
export const AUDIO_EXTENSION_PATTERN = /\.(mp3|wav|flac|ogg|opus|m4a|aac|webm)$/i
export const AUDIO_ACCEPT = AUDIO_EXTENSIONS.map((extension) => `.${extension}`).join(",")
