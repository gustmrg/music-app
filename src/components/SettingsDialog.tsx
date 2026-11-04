import { useState } from "react"
import { Dialog } from "@base-ui/react/dialog"
import { FolderOpen, Loader2, Settings2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { IndexerSettings } from "@/components/IndexerSettings"
import type { DiscoverSettings } from "@/library"

export type SettingsSection = "storage" | "indexer"

export function SettingsDialog({ open, onOpenChange, saveFolder, loaded, onChooseSaveFolder, section, onSectionChange, discover, onSaveDiscover }: {
  section: SettingsSection
  onSectionChange: (section: SettingsSection) => void
  discover: DiscoverSettings
  onSaveDiscover: (settings: DiscoverSettings) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  saveFolder: string
  loaded: boolean
  onChooseSaveFolder: () => Promise<string | null>
}) {
  const [choosing, setChoosing] = useState(false)
  const [error, setError] = useState("")
  const choose = async () => {
    setChoosing(true)
    setError("")
    try { await onChooseSaveFolder() }
    catch (error) { setError(error instanceof Error ? error.message : "Não foi possível usar esta pasta.") }
    finally { setChoosing(false) }
  }

  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="settings-backdrop" />
      <Dialog.Popup className="settings-dialog">
        <div className="settings-heading"><Dialog.Title>Configurações</Dialog.Title><Dialog.Close render={<Button variant="ghost" size="icon" aria-label="Fechar configurações" />}><X /></Dialog.Close></div>
        <Dialog.Description className="muted">Gerencie o armazenamento das músicas e a conexão com seu indexador.</Dialog.Description>
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Seções das configurações">
            <Button variant="ghost" className={section === "storage" ? "active" : ""} aria-current={section === "storage" ? "page" : undefined} aria-controls="settings-storage" onClick={() => onSectionChange("storage")}><FolderOpen size={16} />Armazenamento</Button>
            <Button variant="ghost" className={section === "indexer" ? "active" : ""} aria-current={section === "indexer" ? "page" : undefined} aria-controls="settings-indexer" onClick={() => onSectionChange("indexer")}><Settings2 size={16} />Indexador</Button>
          </nav>
          <div className="settings-panels">
        <section id="settings-storage" hidden={section !== "storage"} className="settings-section" aria-labelledby="storage-heading">
          <h2 id="storage-heading"><FolderOpen size={18} />Armazenamento</h2>
          <div className="save-folder"><span>Pasta das músicas salvas</span><code className="settings-path">{saveFolder || (window.desktop ? "Carregando…" : "Disponível no aplicativo desktop")}</code></div>
          <p className="muted">A alteração vale para novos downloads. As músicas já salvas ou importadas continuam nas pastas originais.</p>
          <Button variant="outline" disabled={!window.desktop || !loaded || choosing} onClick={() => void choose()}>{choosing ? <Loader2 className="spin" size={16} /> : <FolderOpen size={16} />}Escolher pasta</Button>
          {error ? <p className="discover-error" role="alert">{error}</p> : null}
          <p className="muted">A pasta escolhida é salva automaticamente neste computador.</p>
        </section>
        <section id="settings-indexer" hidden={section !== "indexer"} className="settings-section" aria-labelledby="indexer-heading">
          <h2 id="indexer-heading"><Settings2 size={18} />Indexador de torrents</h2>
          {loaded ? <IndexerSettings settings={discover} onSave={onSaveDiscover} loaded={loaded} /> : <p className="muted">Carregando configurações…</p>}
        </section>
          </div>
        </div>
        <div className="settings-footer"><Dialog.Close render={<Button />}>Concluir</Dialog.Close></div>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
}
