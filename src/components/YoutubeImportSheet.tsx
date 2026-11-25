import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  busy: boolean
  onSubmit: (text: string, name: string) => Promise<boolean>
}

export function YoutubeImportSheet({ open, onOpenChange, busy, onSubmit }: Props) {
  const [text, setText] = useState("")
  const [name, setName] = useState("")

  const submit = async () => {
    if (!text.trim()) return
    const ok = await onSubmit(text, name)
    if (ok) {
      setText("")
      setName("")
      onOpenChange(false)
    }
  }

  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className="local-sheet">
      <SheetHeader>
        <SheetTitle>Adicionar do YouTube</SheetTitle>
        <SheetDescription>Cole links de vídeos, playlists ou transmissões ao vivo do YouTube, um por linha. O yt-dlp lê os metadados; nenhum vídeo é baixado e o áudio é transmitido na hora da reprodução.</SheetDescription>
      </SheetHeader>
      {open ? <form className="playlist-form" onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <label>
          Nome da playlist (opcional)
          <Input maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Usado quando o envio tem vários vídeos" />
        </label>
        <label>
          Links
          <textarea
            required
            rows={8}
            className="youtube-links"
            aria-label="Links do YouTube"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={"https://www.youtube.com/watch?v=…\nhttps://youtu.be/…\nhttps://www.youtube.com/playlist?list=…\nhttps://www.youtube.com/@canal/live"}
          />
        </label>
        <p className="muted">Requer o yt-dlp instalado no sistema. Transmissões ao vivo também precisam do ffmpeg.</p>
        <div className="sheet-actions">
          <Button type="submit" disabled={busy || !text.trim()}>Adicionar</Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
        </div>
      </form> : null}
    </SheetContent>
  </Sheet>
}
