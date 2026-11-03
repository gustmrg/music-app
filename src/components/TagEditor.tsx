import { useState } from "react"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { TagEdit, Track } from "@/library"

type Field = keyof TagEdit
const fields: { key: Field; label: string; placeholder: string }[] = [
  { key: "album", label: "Álbum", placeholder: "Nome do álbum" },
  { key: "albumArtist", label: "Artista do álbum", placeholder: "Agrupa as faixas em um só álbum" },
  { key: "artist", label: "Artista", placeholder: "Artista da faixa" },
  { key: "year", label: "Ano", placeholder: "2024" },
  { key: "genre", label: "Gênero", placeholder: "Rock, MPB…" },
]

// Value shared by every track, or null when they differ ("vários valores").
const shared = (tracks: Track[], key: Field) => {
  const values = new Set(tracks.map((track) => String(track[key] ?? "")))
  return values.size === 1 ? [...values][0] : null
}

type Props = { tracks: Track[]; hasEdits: boolean; onSave: (edit: TagEdit) => void; onRestore: () => void; onClose: () => void }

// Edits apply to the selected tracks inside the app; audio files are never
// rewritten. Only fields the user touched are applied.
export function TagEditor({ tracks, hasEdits, onSave, onRestore, onClose }: Props) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(({ key }) => [key, shared(tracks, key) ?? ""])) as Record<Field, string>)
  const [touched, setTouched] = useState<Set<Field>>(new Set())
  const yearInvalid = touched.has("year") && values.year.trim() !== "" && !/^\d{1,4}$/.test(values.year.trim())

  const save = () => {
    if (yearInvalid) return
    const edit: TagEdit = {}
    for (const key of touched) {
      if (key === "year") edit.year = Number(values.year.trim()) || 0
      else edit[key] = values[key].trim()
    }
    onSave(edit)
  }

  return <Sheet open onOpenChange={(open) => { if (!open) onClose() }}><SheetContent className="local-sheet">
    <SheetHeader><SheetTitle>Editar informações</SheetTitle><SheetDescription>{tracks.length} faixa(s). As alterações ficam no aplicativo; os arquivos de música não são modificados.</SheetDescription></SheetHeader>
    <form className="playlist-form" onSubmit={(event) => { event.preventDefault(); save() }}>
      {fields.map(({ key, label, placeholder }) => {
        const mixed = shared(tracks, key) === null && !touched.has(key)
        return <label key={key}>{label}<Input value={values[key]} inputMode={key === "year" ? "numeric" : undefined} maxLength={key === "year" ? 4 : 200} aria-invalid={key === "year" && yearInvalid ? true : undefined} placeholder={mixed ? "Vários valores (mantidos)" : placeholder} autoFocus={key === "album"} onChange={(event) => { setValues({ ...values, [key]: event.target.value }); setTouched(new Set(touched).add(key)) }} /></label>
      })}
      {yearInvalid ? <p className="muted discover-error" role="alert">Use um ano com até 4 dígitos.</p> : null}
      <p className="muted">Para agrupar faixas de pastas diferentes em um álbum, preencha Álbum e Artista do álbum.</p>
      <div className="sheet-actions">
        <Button type="submit" disabled={!touched.size || yearInvalid}>Salvar</Button>
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
      </div>
      {hasEdits ? <Button type="button" variant="outline" onClick={onRestore}><RotateCcw />Restaurar tags dos arquivos</Button> : null}
    </form>
  </SheetContent></Sheet>
}
