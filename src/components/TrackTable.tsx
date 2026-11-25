import { useEffect, useRef, useState, type ReactNode } from "react"
import { Heart, Pause, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Cover } from "@/components/Cover"
import { folderName, formatTime, trackArtist, type Track } from "@/library"

const ROW_HEIGHT = 65
const OVERSCAN = 12
const VIRTUALIZE_THRESHOLD = 100

type Props = {
  tracks: Track[]
  currentId: string
  playing: boolean
  viewMode: "list" | "grid"
  likedIds: Set<string>
  selected: Set<string>
  onSelectionChange: (selected: Set<string>) => void
  onPlay: (id: string) => void
  onToggleLike: (id: string) => void
  // Album pages number rows by their tag instead of their position.
  albumNumbering?: boolean
  extraActions?: (track: Track) => ReactNode
}

export function TrackTable({ tracks, currentId, playing, viewMode, likedIds, selected, onSelectionChange, onPlay, onToggleLike, albumNumbering, extraActions }: Props) {
  // Anchor for Shift+click range selection.
  const anchor = useRef("")
  const tableRef = useRef<HTMLDivElement>(null)
  const virtualize = viewMode === "list" && tracks.length > VIRTUALIZE_THRESHOLD
  const [windowRange, setWindowRange] = useState<[number, number]>([0, VIRTUALIZE_THRESHOLD])

  useEffect(() => {
    if (!virtualize) return
    const table = tableRef.current
    const scroller = table?.closest<HTMLElement>(".content")
    if (!table || !scroller) return
    const update = () => {
      const tableTop = table.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      const relativeScroll = Math.max(0, scroller.scrollTop - tableTop)
      const start = Math.max(0, Math.floor(relativeScroll / ROW_HEIGHT) - OVERSCAN)
      const visibleCount = Math.ceil(scroller.clientHeight / ROW_HEIGHT) + OVERSCAN * 2
      const end = Math.min(tracks.length, start + visibleCount)
      setWindowRange((previous) => previous[0] === start && previous[1] === end ? previous : [start, end])
    }
    update()
    scroller.addEventListener("scroll", update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(scroller)
    return () => { scroller.removeEventListener("scroll", update); observer.disconnect() }
  }, [virtualize, tracks.length])

  const allSelected = tracks.length > 0 && tracks.every((track) => selected.has(track.id))
  const someSelected = !allSelected && tracks.some((track) => selected.has(track.id))

  const toggle = (id: string, checked: boolean, range: boolean) => {
    const next = new Set(selected)
    const from = tracks.findIndex((track) => track.id === anchor.current)
    const to = tracks.findIndex((track) => track.id === id)
    if (range && from !== -1 && to !== -1) {
      for (const track of tracks.slice(Math.min(from, to), Math.max(from, to) + 1)) checked ? next.add(track.id) : next.delete(track.id)
    } else checked ? next.add(id) : next.delete(id)
    anchor.current = id
    onSelectionChange(next)
  }
  const toggleAll = () => {
    const next = new Set(selected)
    for (const track of tracks) allSelected ? next.delete(track.id) : next.add(track.id)
    onSelectionChange(next)
  }

  const start = virtualize ? Math.min(windowRange[0], tracks.length) : 0
  const end = virtualize ? Math.min(windowRange[1], tracks.length) : tracks.length
  const visible = virtualize ? tracks.slice(start, end) : tracks

  return <div ref={tableRef} className={`track-table ${viewMode === "grid" ? "track-grid" : ""} ${selected.size ? "selecting" : ""}`} role="table" aria-label="Músicas" aria-rowcount={tracks.length + 1}>
    <div className="track-table-head" role="row" aria-rowindex={1}>
      <span role="columnheader" className="track-check"><input type="checkbox" aria-label="Selecionar todas as músicas" checked={allSelected} ref={(element) => { if (element) element.indeterminate = someSelected }} onChange={toggleAll} /></span>
      <span role="columnheader">#</span><span role="columnheader">Música</span><span role="columnheader">Álbum</span><span role="columnheader">Duração</span><span role="columnheader">Formato</span><span role="columnheader" className="sr-only">Ações</span>
    </div>
    {virtualize && start > 0 ? <div aria-hidden="true" style={{ height: start * ROW_HEIGHT }} /> : null}
    {visible.map((track, offset) => {
      const index = start + offset
      const isSelected = selected.has(track.id)
      const isPlaying = currentId === track.id && playing
      const artist = trackArtist(track)
      const number = albumNumbering && track.trackNo ? track.trackNo : index + 1
      return <div role="row" aria-rowindex={index + 2} key={track.id} className={`track-row ${currentId === track.id ? "current" : ""} ${isSelected ? "selected" : ""} ${track.missing ? "missing" : ""}`} aria-selected={isSelected}>
        <div role="cell" className="track-check"><input type="checkbox" aria-label={`Selecionar ${track.title}`} checked={isSelected} onChange={(event) => toggle(track.id, event.target.checked, (event.nativeEvent as MouseEvent).shiftKey)} /></div>
        <div role="cell" className="track-number">{String(number).padStart(2, "0")}</div>
        <div role="cell" className="track-name"><button className={`track-cover ${isPlaying ? "is-playing" : ""}`} aria-label={`${isPlaying ? "Pausar" : "Reproduzir"} ${track.title}`} onClick={() => onPlay(track.id)}><Cover cover={track.cover} size="small" /><span className="track-cover-overlay">{isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</span></button><div className="track-text"><button className="track-title" title={track.path} onClick={() => onPlay(track.id)}>{track.title}</button>{track.missing ? <span className="missing-badge" title={`Arquivo não encontrado: ${track.path}`}>Indisponível</span> : artist ? <span className="track-artist">{artist}</span> : null}</div></div>
        <span role="cell" className="track-folder" title={track.album ? track.album : track.folder}>{track.album || <span className="track-no-album">{folderName(track.folder)}</span>}</span>
        <span role="cell" className="track-duration">{track.duration ? formatTime(track.duration) : "—"}</span>
        <span role="cell" className="track-format">{track.format}</span>
        <div role="cell" className="track-actions">{extraActions?.(track)}<Button variant="ghost" size="icon" aria-label={`${likedIds.has(track.id) ? "Desfavoritar" : "Favoritar"} ${track.title}`} aria-pressed={likedIds.has(track.id)} className={likedIds.has(track.id) ? "accent" : ""} onClick={() => onToggleLike(track.id)}><Heart size={16} fill={likedIds.has(track.id) ? "currentColor" : "none"} /></Button></div>
      </div>
    })}
    {virtualize && end < tracks.length ? <div aria-hidden="true" style={{ height: (tracks.length - end) * ROW_HEIGHT }} /> : null}
  </div>
}
