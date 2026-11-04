import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react"
import { Download, Heart, ListMusic, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react"
import { errorMessage, formatTime, trackArtist, type Track } from "@/library"
import { Button } from "@/components/ui/button"
import { Cover } from "@/components/Cover"

export type PlayMode = "order" | "repeat" | "one" | "shuffle"
const modes: PlayMode[] = ["order", "repeat", "one", "shuffle"]
const labels = { order: "Em ordem", repeat: "Repetir fila", one: "Repetir música", shuffle: "Aleatório" }
// A live that drops is reopened this many times before giving up.
const LIVE_RETRIES = 3

export type PlayerControls = { toggle: () => void }

type Props = {
  ref?: Ref<PlayerControls>; onPlayingChange: (playing: boolean) => void
  track: Track | undefined; request: number; liked: boolean; volume: number; mode: PlayMode; torrentStatus?: { progress: number; peers: number }
  onVolume: (value: number) => void; onMode: (mode: PlayMode) => void; onLike: () => void
  onNext: (ended?: boolean) => void; onPrevious: () => void; onQueue: () => void
  onStarted: (id: string) => void; onError: (message: string) => void; onSave?: () => void
}

export function Player({ ref, onPlayingChange, track, request, liked, volume, mode, torrentStatus, onVolume, onMode, onLike, onNext, onPrevious, onQueue, onStarted, onError, onSave }: Props) {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bufferedEnd, setBufferedEnd] = useState(0)
  const [resolving, setResolving] = useState(false)
  const [buffering, setBuffering] = useState(false)
  // Lives have no duration and never end; they stream from the main
  // process through ffmpeg at local-music://live/<id>.
  const [live, setLive] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const retries = useRef(0)
  const retryTimer = useRef<number | undefined>(undefined)
  const isYouTube = track?.source === "youtube"
  const isTorrent = track?.source === "torrent"
  const source = track && !isYouTube ? track.url ?? `local-music://track/${track.id}` : undefined
  const trackId = track?.id
  const subtitle = isTorrent
    ? buffering ? "Buscando na rede…" : `Torrent · ${Math.round((torrentStatus?.progress ?? 0) * 100)}% · ${torrentStatus?.peers ?? 0} par(es)`
    : [track && trackArtist(track), track?.album].filter(Boolean).join(" · ") || track?.format

  // Every (re)open is a new request, so playback starts at the live edge and
  // the main process replaces the previous ffmpeg.
  const openLive = (id: string) => {
    const element = audio.current
    if (!element) return
    window.clearTimeout(retryTimer.current)
    setConnecting(true)
    setProgress(0)
    setBufferedEnd(0)
    element.src = `local-music://live/${id}?session=${Date.now()}`
    element.load()
    void element.play().catch(() => { /* failures arrive as error events */ })
  }

  // Pausing a live drops the request, which stops ffmpeg; resuming reopens it.
  const stopLive = () => {
    const element = audio.current
    if (!element) return
    window.clearTimeout(retryTimer.current)
    setConnecting(false)
    // load() drops the queued "pause" event, so the state is set here.
    setPlaying(false)
    element.pause()
    element.removeAttribute("src")
    element.load()
  }

  const reconnectLive = () => {
    if (!trackId) return
    if (retries.current >= LIVE_RETRIES) {
      setConnecting(false)
      setPlaying(false)
      onError(`A transmissão de “${track?.title ?? "YouTube"}” caiu e não voltou. Ela pode ter terminado; toque de novo para tentar.`)
      return
    }
    retries.current++
    setConnecting(true)
    retryTimer.current = window.setTimeout(() => openLive(trackId), 1000 * retries.current)
  }

  const play = () => {
    const element = audio.current
    if (!element) return
    if (live && trackId && !element.getAttribute("src")) { retries.current = 0; openLive(trackId); return }
    void element.play().catch((error: DOMException) => {
      if (error.name !== "AbortError") onError(isYouTube ? "Não foi possível reproduzir o stream. Tente tocar novamente para atualizar o link." : "Não foi possível reproduzir. Verifique se o arquivo existe e se o formato é compatível.")
    })
  }

  const pause = () => {
    if (live) stopLive()
    else audio.current?.pause()
  }

  useImperativeHandle(ref, () => ({ toggle: () => { if (resolving) return; if (playing || connecting) pause(); else play() } }))
  useEffect(() => { onPlayingChange(playing || connecting) }, [playing, connecting, onPlayingChange])

  useEffect(() => {
    const element = audio.current
    if (!element) return
    setPlaying(false)
    setProgress(0)
    setDuration(0)
    setBufferedEnd(0)
    setLive(false)
    setConnecting(false)
    retries.current = 0
    window.clearTimeout(retryTimer.current)
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
      window.desktop?.resolveYoutube(trackId).then(({ url, isLive }) => {
        if (!active) return
        setResolving(false)
        setLive(isLive)
        if (isLive) openLive(trackId)
        else start(url)
      }).catch((error: unknown) => {
        if (!active) return
        setResolving(false)
        // The main process explains known cases: no ffmpeg, a scheduled or
        // ended live, private or region-blocked videos.
        onError(errorMessage(error, "Não foi possível obter o áudio deste vídeo do YouTube. Ele pode estar indisponível ou o yt-dlp não está instalado."))
      })
    } else if (source) start(source)
    return () => { active = false; window.clearTimeout(retryTimer.current); element.pause() }
    // openLive only touches refs and state setters, so it is not a dependency.
  }, [trackId, source, isYouTube, request, onError])

  useEffect(() => { if (audio.current) audio.current.volume = volume }, [volume])

  // Torrent streams stall while missing pieces download; waiting/playing
  // bracket those gaps so the UI can say what is happening.
  useEffect(() => { if (!isTorrent) setBuffering(false) }, [isTorrent, trackId])

  // A live has no total duration. Its timeline grows with the audio received
  // in this connection, rather than treating Infinity as a fixed duration.
  const liveEnd = Math.max(progress, bufferedEnd, 1)
  const updateLiveBuffer = (element: HTMLAudioElement) => {
    if (!live) return
    const ranges = element.buffered
    const end = ranges.length ? ranges.end(ranges.length - 1) : 0
    setBufferedEnd(Number.isFinite(end) ? end : 0)
  }

  const status = connecting ? "Conectando à transmissão…" : resolving ? "Buscando áudio…" : subtitle

  return <footer className="player-bar" aria-label="Player de música">
    <audio ref={audio} preload="metadata"
      onPlay={() => { setPlaying(true); if (track) onStarted(track.id) }}
      onPause={() => setPlaying(false)}
      onWaiting={() => { if (isTorrent) setBuffering(true) }}
      onStalled={() => { if (isTorrent) setBuffering(true) }}
      onPlaying={() => { setBuffering(false); if (live) { setConnecting(false); retries.current = 0 } }}
      onCanPlay={() => setBuffering(false)}
      onEmptied={() => { setProgress(0); setBufferedEnd(0) }}
      onProgress={(event) => updateLiveBuffer(event.currentTarget)}
      onTimeUpdate={(event) => { setBuffering(false); setProgress(event.currentTarget.currentTime); updateLiveBuffer(event.currentTarget) }}
      onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
      onError={(event) => {
        // A paused live has no src on purpose; only a live that was playing reconnects.
        if (live) { if (event.currentTarget.getAttribute("src")) reconnectLive(); return }
        setPlaying(false); setBuffering(false)
        if (track) onError(isYouTube ? `Não foi possível reproduzir o stream de “${track.title}”. O link pode ter expirado; toque novamente para atualizar.` : isTorrent ? `Não foi possível reproduzir “${track.title}” pelo torrent. Ele pode estar sem seeds; pare os torrents e tente outro resultado.` : `Não foi possível abrir “${track.title}”. O arquivo pode ter sido movido ou usar um formato não compatível.`)
      }}
      onEnded={() => {
        // A live never ends on its own: reconnect instead of moving on.
        if (live) reconnectLive()
        else if (mode === "one") { if (audio.current) audio.current.currentTime = 0; play() } else { setPlaying(false); onNext(true) }
      }}
    />
    <div className="player-track">
      <Cover cover={track?.cover} />
      <div className="truncate"><strong>{track?.title ?? "Nenhuma música selecionada"}</strong><span>{track ? status : "Abra arquivos ou adicione uma pasta"}</span></div>
      <Button variant="ghost" size="icon" disabled={!track} aria-label={liked ? "Remover dos favoritos" : "Favoritar música"} aria-pressed={liked} className={liked ? "accent" : ""} onClick={onLike}><Heart fill={liked ? "currentColor" : "none"} /></Button>
      {isTorrent && onSave ? <Button variant="ghost" size="icon" aria-label="Salvar na biblioteca" title="Salvar na biblioteca" onClick={onSave}><Download /></Button> : null}
    </div>
    <div className="player-center">
      <div className="playback-controls">
        <Button variant="ghost" size="icon" aria-label={`Modo: ${labels[mode]}`} title={labels[mode]} className={mode !== "order" ? "accent" : ""} onClick={() => onMode(modes[(modes.indexOf(mode) + 1) % modes.length])}>{mode === "shuffle" ? <Shuffle /> : mode === "one" ? <Repeat1 /> : <Repeat />}</Button>
        <Button variant="ghost" size="icon" aria-label="Música anterior" disabled={!track} onClick={onPrevious}><SkipBack /></Button>
        <Button size="icon" className="play-button" aria-label={playing || connecting ? "Pausar" : resolving ? "Buscando áudio" : "Reproduzir"} disabled={!track || resolving} onClick={() => { if (playing || connecting) pause(); else play() }}>{playing || connecting ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</Button>
        <Button variant="ghost" size="icon" aria-label="Próxima música" disabled={!track} onClick={() => onNext()}><SkipForward /></Button>
      </div>
      {live
        ? <div className="seek live">
          <span>{formatTime(progress)}</span>
          <div className="live-progress" role="progressbar" aria-label="Reprodução da transmissão ao vivo" aria-valuemin={0} aria-valuemax={liveEnd} aria-valuenow={progress} aria-valuetext={`${formatTime(progress)} reproduzidos nesta conexão`} title="Áudio reproduzido e carregado nesta conexão. Transmissões ao vivo não permitem avançar ou retroceder.">
            <i className="live-progress-buffer" style={{ width: `${bufferedEnd / liveEnd * 100}%` }} />
            <i className="live-progress-played" style={{ width: `${progress / liveEnd * 100}%` }} />
          </div>
          <span className="live-badge" title="Transmissão ao vivo">Ao vivo</span>
        </div>
        : <div className="seek"><span>{formatTime(progress)}</span><input type="range" min={0} max={duration || 1} step={0.1} value={Math.min(progress, duration || 1)} disabled={!track || !duration || resolving} aria-label="Posição da música" onChange={(event) => { const time = Number(event.target.value); if (audio.current) audio.current.currentTime = time; setProgress(time) }} /><span>{formatTime(duration)}</span></div>}
    </div>
    <div className="player-right">{volume === 0 ? <VolumeX size={18} aria-label="Sem som" /> : <Volume2 size={18} aria-label="Com som" />}<input type="range" min={0} max={1} step={0.01} value={volume} aria-label="Volume" onChange={(event) => onVolume(Number(event.target.value))} /><Button variant="ghost" size="icon" aria-label="Abrir fila de reprodução" onClick={onQueue}><ListMusic /></Button></div>
  </footer>
}
