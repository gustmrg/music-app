import { useEffect, useRef, useState } from "react"
import { Heart, ListMusic, Music2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2 } from "lucide-react"
import { formatTime, type Track } from "@/library"
import { Button } from "@/components/ui/button"

export type PlayMode = "order" | "repeat" | "one" | "shuffle"
const modes: PlayMode[] = ["order", "repeat", "one", "shuffle"]
const labels = { order: "Em ordem", repeat: "Repetir fila", one: "Repetir música", shuffle: "Aleatório" }

type Props = {
  track: Track | undefined; request: number; liked: boolean; volume: number; mode: PlayMode
  onVolume: (value: number) => void; onMode: (mode: PlayMode) => void; onLike: () => void
  onNext: (ended?: boolean) => void; onPrevious: () => void; onQueue: () => void
  onStarted: (id: string) => void; onError: (message: string) => void
}

export function Player({ track, request, liked, volume, mode, onVolume, onMode, onLike, onNext, onPrevious, onQueue, onStarted, onError }: Props) {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [resolving, setResolving] = useState(false)
  const isYouTube = track?.source === "youtube"
  const source = track && !isYouTube ? track.url ?? `local-music://track/${track.id}` : undefined
  const trackId = track?.id
  const play = () => {
    const element = audio.current
    if (!element) return
    void element.play().catch((error: DOMException) => {
      if (error.name !== "AbortError") onError(isYouTube ? "Não foi possível reproduzir o stream. Tente tocar novamente para atualizar o link." : "Não foi possível reproduzir. Verifique se o arquivo existe e se o formato é compatível.")
    })
  }

  useEffect(() => {
    const element = audio.current
    if (!element) return
    setProgress(0)
    setDuration(0)
    if (!trackId) { element.pause(); element.removeAttribute("src"); element.load(); return }
    let active = true
    const start = (src: string) => {
      element.src = src
      element.load()
      void element.play().catch((error: DOMException) => {
        if (active && error.name !== "AbortError") onError(isYouTube ? "Não foi possível reproduzir o stream deste vídeo. Ele pode estar indisponível." : "Não foi possível reproduzir. Verifique se o arquivo existe e se o formato é compatível.")
      })
    }
    if (isYouTube) {
      setResolving(true)
      window.desktop?.resolveYoutube(trackId).then(({ url }) => {
        if (!active) return
        setResolving(false)
        start(url)
      }).catch(() => {
        if (!active) return
        setResolving(false)
        onError("Não foi possível obter o áudio deste vídeo do YouTube. Ele pode estar indisponível ou o yt-dlp não está instalado.")
      })
    } else if (source) start(source)
    return () => { active = false; element.pause() }
  }, [trackId, source, isYouTube, request, onError])

  useEffect(() => { if (audio.current) audio.current.volume = volume }, [volume])

  return <footer className="player-bar" aria-label="Player de música">
    <audio ref={audio} preload="metadata"
      onPlay={() => { setPlaying(true); if (track) onStarted(track.id) }}
      onPause={() => setPlaying(false)}
      onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)}
      onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
      onError={() => { setPlaying(false); if (track) onError(isYouTube ? `Não foi possível reproduzir o stream de “${track.title}”. O link pode ter expirado; toque novamente para atualizar.` : `Não foi possível abrir “${track.title}”. O arquivo pode ter sido movido ou usar um formato não compatível.`) }}
      onEnded={() => { if (mode === "one") { if (audio.current) audio.current.currentTime = 0; play() } else onNext(true) }}
    />
    <div className="player-track">
      <div className="cover-placeholder"><Music2 size={23} /></div>
      <div className="truncate"><strong>{track?.title ?? "Nenhuma música selecionada"}</strong><span>{track ? resolving ? "Buscando áudio…" : track.format : "Abra arquivos ou adicione uma pasta"}</span></div>
      <Button variant="ghost" size="icon" disabled={!track} aria-label={liked ? "Remover dos favoritos" : "Favoritar música"} aria-pressed={liked} className={liked ? "accent" : ""} onClick={onLike}><Heart fill={liked ? "currentColor" : "none"} /></Button>
    </div>
    <div className="player-center">
      <div className="playback-controls">
        <Button variant="ghost" size="icon" aria-label={`Modo: ${labels[mode]}`} title={labels[mode]} className={mode !== "order" ? "accent" : ""} onClick={() => onMode(modes[(modes.indexOf(mode) + 1) % modes.length])}>{mode === "shuffle" ? <Shuffle /> : mode === "one" ? <Repeat1 /> : <Repeat />}</Button>
        <Button variant="ghost" size="icon" aria-label="Música anterior" disabled={!track} onClick={onPrevious}><SkipBack /></Button>
        <Button size="icon" className="play-button" aria-label={playing ? "Pausar" : resolving ? "Buscando áudio" : "Reproduzir"} disabled={!track || resolving} onClick={() => { if (playing) audio.current?.pause(); else play() }}>{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</Button>
        <Button variant="ghost" size="icon" aria-label="Próxima música" disabled={!track} onClick={() => onNext()}><SkipForward /></Button>
      </div>
      <div className="seek"><span>{formatTime(progress)}</span><input type="range" min={0} max={duration || 1} step={0.1} value={Math.min(progress, duration || 1)} disabled={!track || !duration || resolving} aria-label="Posição da música" onChange={(event) => { const time = Number(event.target.value); if (audio.current) audio.current.currentTime = time; setProgress(time) }} /><span>{formatTime(duration)}</span></div>
    </div>
    <div className="player-right"><Volume2 size={18} /><input type="range" min={0} max={1} step={0.01} value={volume} aria-label="Volume" onChange={(event) => onVolume(Number(event.target.value))} /><Button variant="ghost" size="icon" aria-label="Abrir fila de reprodução" onClick={onQueue}><ListMusic /></Button></div>
  </footer>
}
