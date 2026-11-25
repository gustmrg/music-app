import { useState } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { filterTracks, type Playlist, type Track } from "@/library"

type Props = {
  playlist: Playlist | null
  isExisting: boolean
  tracks: Track[]
  onChange: (playlist: Playlist) => void
  onSave: () => void
  onDelete: (id: string) => void
  onClose: () => void
}

export function PlaylistEditorSheet({ playlist, isExisting, tracks, onChange, onSave, onDelete, onClose }: Props) {
  const [search, setSearch] = useState("")

  return <Sheet open={!!playlist} onOpenChange={(open) => { if (!open) { setSearch(""); onClose() } }}>
    <SheetContent className="local-sheet">
      <SheetHeader>
        <SheetTitle>{isExisting ? "Editar playlist" : "Nova playlist"}</SheetTitle>
        <SheetDescription>Escolha músicas da sua biblioteca. Nenhum arquivo será copiado.</SheetDescription>
      </SheetHeader>
      {playlist ? <form className="playlist-form" onSubmit={(event) => { event.preventDefault(); setSearch(""); onSave() }}>
        <label>
          Nome
          <Input autoFocus required maxLength={120} value={playlist.name} onChange={(event) => onChange({ ...playlist, name: event.target.value })} placeholder="Minha playlist" />
        </label>
        <Input aria-label="Filtrar músicas da playlist" placeholder="Filtrar músicas…" value={search} onChange={(event) => setSearch(event.target.value)} />
        <span className="muted">{playlist.trackIds.length} selecionada(s)</span>
        <div className="playlist-choices">
          {filterTracks(tracks, search).map((track) => (
            <label key={track.id}>
              <input
                type="checkbox"
                checked={playlist.trackIds.includes(track.id)}
                onChange={(event) => onChange({
                  ...playlist,
                  trackIds: event.target.checked ? [...playlist.trackIds, track.id] : playlist.trackIds.filter((id) => id !== track.id),
                })}
              />
              <span>{track.title}</span>
            </label>
          ))}
          {!tracks.length ? <p className="muted">Adicione músicas à biblioteca para preencher sua playlist.</p> : null}
        </div>
        <div className="sheet-actions">
          <Button type="submit" disabled={!playlist.name.trim()}>Salvar playlist</Button>
          <Button type="button" variant="ghost" onClick={() => { setSearch(""); onClose() }}>Cancelar</Button>
        </div>
        {isExisting ? <Button type="button" variant="destructive" onClick={() => { setSearch(""); onDelete(playlist.id) }}><Trash2 />Excluir playlist</Button> : null}
      </form> : null}
    </SheetContent>
  </Sheet>
}
