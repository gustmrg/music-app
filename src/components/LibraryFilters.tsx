import { useMemo } from "react"
import { Heart, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { trackArtist, type Track } from "@/library"

export type SortKey = "default" | "title" | "artist" | "album" | "added" | "duration"
export type Filters = { artist: string; genre: string; format: string; source: "" | "local" | "youtube"; liked: boolean; sort: SortKey }
export const emptyFilters: Filters = { artist: "", genre: "", format: "", source: "", liked: false, sort: "default" }

const sortLabels: Record<SortKey, string> = { default: "Ordem de importação", title: "Título", artist: "Artista", album: "Álbum", added: "Adicionadas recentemente", duration: "Duração" }
const compareText = (a = "", b = "") => (!a ? 1 : 0) - (!b ? 1 : 0) || a.localeCompare(b, "pt-BR", { numeric: true })

export function applyFilters(tracks: Track[], filters: Filters, likedIds: Set<string>) {
  const items = tracks.filter((track) =>
    (!filters.artist || trackArtist(track) === filters.artist || track.albumArtist === filters.artist)
    && (!filters.genre || track.genre === filters.genre)
    && (!filters.format || track.format === filters.format)
    && (!filters.source || (filters.source === "youtube") === (track.source === "youtube"))
    && (!filters.liked || likedIds.has(track.id)))
  const byAlbum = (a: Track, b: Track) => compareText(a.album, b.album) || (a.discNo ?? 0) - (b.discNo ?? 0) || (a.trackNo ?? 0) - (b.trackNo ?? 0)
  switch (filters.sort) {
    case "title": return items.sort((a, b) => compareText(a.title, b.title))
    case "artist": return items.sort((a, b) => compareText(trackArtist(a), trackArtist(b)) || byAlbum(a, b))
    case "album": return items.sort(byAlbum)
    case "added": return items.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
    case "duration": return items.sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))
    default: return items
  }
}

const options = (values: (string | undefined)[]) => [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "pt-BR"))

export function LibraryFilters({ tracks, filters, onChange }: { tracks: Track[]; filters: Filters; onChange: (filters: Filters) => void }) {
  const artists = useMemo(() => options(tracks.flatMap((track) => [trackArtist(track), track.albumArtist])), [tracks])
  const genres = useMemo(() => options(tracks.map((track) => track.genre)), [tracks])
  const formats = useMemo(() => options(tracks.map((track) => track.format)), [tracks])
  const hasYoutube = useMemo(() => tracks.some((track) => track.source === "youtube"), [tracks])
  const active = filters.artist || filters.genre || filters.format || filters.source || filters.liked
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })

  return <div className="library-filters" role="group" aria-label="Filtros da biblioteca">
    {artists.length ? <select aria-label="Filtrar por artista" className={filters.artist ? "active" : ""} value={filters.artist} onChange={(event) => set({ artist: event.target.value })}><option value="">Todos os artistas</option>{artists.map((value) => <option key={value} value={value}>{value}</option>)}</select> : null}
    {genres.length ? <select aria-label="Filtrar por gênero" className={filters.genre ? "active" : ""} value={filters.genre} onChange={(event) => set({ genre: event.target.value })}><option value="">Todos os gêneros</option>{genres.map((value) => <option key={value} value={value}>{value}</option>)}</select> : null}
    {formats.length > 1 ? <select aria-label="Filtrar por formato" className={filters.format ? "active" : ""} value={filters.format} onChange={(event) => set({ format: event.target.value })}><option value="">Todos os formatos</option>{formats.map((value) => <option key={value} value={value}>{value}</option>)}</select> : null}
    {hasYoutube ? <select aria-label="Filtrar por origem" className={filters.source ? "active" : ""} value={filters.source} onChange={(event) => set({ source: event.target.value as Filters["source"] })}><option value="">Todas as origens</option><option value="local">Arquivos locais</option><option value="youtube">YouTube</option></select> : null}
    <Button variant={filters.liked ? "default" : "outline"} size="sm" aria-pressed={filters.liked} onClick={() => set({ liked: !filters.liked })}><Heart size={14} fill={filters.liked ? "currentColor" : "none"} />Favoritas</Button>
    {active ? <Button variant="ghost" size="sm" onClick={() => onChange({ ...emptyFilters, sort: filters.sort })}><X size={14} />Limpar filtros</Button> : null}
    <label className="library-sort">Ordenar<select value={filters.sort} onChange={(event) => set({ sort: event.target.value as SortKey })}>{(Object.keys(sortLabels) as SortKey[]).map((key) => <option key={key} value={key}>{sortLabels[key]}</option>)}</select></label>
  </div>
}
