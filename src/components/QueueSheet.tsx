import { Music2, Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { Track } from "@/library"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tracks: Track[]
  currentId: string
  onPlay: (id: string) => void
  onRemove: (id: string) => void
  onClear: () => void
  onSaveAsPlaylist: () => void
}

export function QueueSheet({ open, onOpenChange, tracks, currentId, onPlay, onRemove, onClear, onSaveAsPlaylist }: Props) {
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className="local-sheet">
      <SheetHeader>
        <SheetTitle>Fila de reprodução</SheetTitle>
        <SheetDescription>{tracks.length} música(s) · independente das playlists salvas</SheetDescription>
      </SheetHeader>
      <div className="sheet-actions">
        <Button variant="outline" disabled={!tracks.length} onClick={onSaveAsPlaylist}><Plus />Salvar playlist</Button>
        <Button variant="ghost" disabled={!tracks.length} onClick={onClear}><Trash2 />Limpar fila</Button>
      </div>
      <div className="sheet-list">
        {tracks.map((track) => (
          <div key={track.id} className="queue-row">
            <button className={currentId === track.id ? "accent" : ""} onClick={() => onPlay(track.id)}>
              <Music2 size={16} />
              <span>{track.title}</span>
            </button>
            <Button variant="ghost" size="icon-xs" aria-label={`Remover ${track.title} da fila`} onClick={() => onRemove(track.id)}>
              <X />
            </Button>
          </div>
        ))}
        {!tracks.length ? <p className="muted">Reproduza uma música para começar uma fila.</p> : null}
      </div>
    </SheetContent>
  </Sheet>
}
