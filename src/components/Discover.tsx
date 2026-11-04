import { useState } from "react"
import { Compass, Download, FolderOpen, ListPlus, Loader2, Play, RefreshCw, Search, Settings2, ShieldAlert, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { InfoTip } from "@/components/ui/info-tip"
import { cleanTrackTitle, errorMessage, formatSize, type DiscoverConnection, type DiscoverProvider, type DiscoverResult, type DiscoverSettings, type TorrentExpansion, type TorrentProgress, type Track } from "@/library"

type Props = {
  settings: DiscoverSettings
  progress: Map<string, TorrentProgress>
  saveFolder: string
  onChooseSaveFolder: () => void
  onSaveSettings: (settings: DiscoverSettings) => void
  onPlay: (tracks: Track[], index: number) => void
  onStopped: (infoHash?: string) => void
  notify: (message: string) => void
}

const toTrack = (prepared: { id: string; infoHash: string; name: string; fileName: string; url: string }): Track => ({
  id: prepared.id,
  path: `${prepared.name}/${prepared.fileName}`,
  title: cleanTrackTitle(prepared.fileName),
  folder: prepared.name,
  format: prepared.fileName.split(".").pop()?.toUpperCase() ?? "AUDIO",
  source: "torrent",
  infoHash: prepared.infoHash,
  url: prepared.url,
})

export function Discover({ settings, progress, saveFolder, onChooseSaveFolder, onSaveSettings, onPlay, onStopped, notify }: Props) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<DiscoverResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, TorrentExpansion | "loading" | "error">>({})
  const [preparing, setPreparing] = useState("")
  const [requesting, setRequesting] = useState("")
  const [stopping, setStopping] = useState("")
  const [settingsOpen, setSettingsOpen] = useState(false)

  const search = async () => {
    if (!window.desktop || !query.trim() || searching) return
    setSearching(true)
    try {
      const { results } = await window.desktop.searchDiscover(query)
      setResults(results)
      setSearched(true)
      const sources = new Set(results.map((result) => result.source))
      setExpanded((value) => Object.fromEntries(Object.entries(value).filter(([source]) => sources.has(source))))
    } catch (error) {
      notify(errorMessage(error, "Não foi possível buscar no indexador."))
    } finally { setSearching(false) }
  }

  const expand = async (result: DiscoverResult) => {
    if (!window.desktop || (expanded[result.source] && expanded[result.source] !== "error")) return
    setExpanded((value) => ({ ...value, [result.source]: "loading" }))
    try {
      const expansion = await window.desktop.expandTorrent(result.source)
      setExpanded((value) => ({ ...value, [result.source]: expansion }))
    } catch (error) {
      setExpanded((value) => ({ ...value, [result.source]: "error" }))
      notify(errorMessage(error, "Não foi possível ler os metadados deste torrent."))
    }
  }

  // Registers every audio file of the torrent with the engine so switching
  // tracks inside the album never re-resolves metadata, then plays fileIndex.
  const play = async (result: DiscoverResult, fileIndex: number) => {
    if (!window.desktop) return
    const expansion = expanded[result.source]
    if (!expansion || expansion === "loading" || expansion === "error") return
    const audioFiles = expansion.files.filter((file) => file.isAudio)
    const queueIndex = audioFiles.findIndex((file) => file.index === fileIndex)
    if (queueIndex === -1) return
    setPreparing(result.source)
    try {
      const tracks: Track[] = []
      for (const file of audioFiles) {
        const prepared = await window.desktop.prepareTorrent(result.source, file.index)
        tracks.push(toTrack(prepared))
      }
      onPlay(tracks, queueIndex)
    } catch (error) {
      notify(errorMessage(error, "Não foi possível preparar este torrent para reprodução."))
    } finally { setPreparing("") }
  }

  // Saving keeps the torrent pinned until the files finish; the library is
  // updated by the torrent:saved event, so this only confirms the request.
  const save = async (result: DiscoverResult, fileIndexes: number[], label: string) => {
    if (!window.desktop || requesting) return
    setRequesting(result.source)
    try {
      const started = await window.desktop.saveTorrent(result.source, fileIndexes)
      notify(started.queued ? `Salvando ${label} em ${saveFolder}. As músicas entram na biblioteca quando o download terminar.` : `${label[0].toUpperCase()}${label.slice(1)} já está sendo salvo.`)
    } catch (error) {
      notify(errorMessage(error, "Não foi possível salvar este torrent na biblioteca."))
    } finally { setRequesting("") }
  }

  const stop = async (infoHash?: string) => {
    if (!window.desktop || stopping) return
    setStopping(infoHash ?? "all")
    try {
      if (infoHash) await window.desktop.stopTorrent(infoHash)
      else await window.desktop.stopTorrents(true)
      onStopped(infoHash)
      notify(infoHash ? "Download deste álbum interrompido. Músicas já salvas continuam na biblioteca." : "Todos os torrents e downloads foram interrompidos. Músicas já salvas continuam na biblioteca.")
    } catch (error) {
      notify(errorMessage(error, "Não foi possível interromper o download."))
    } finally { setStopping("") }
  }

  const configured = Boolean(settings.url && settings.apiKey)
  const active = [...progress.values()].filter((item) => item.progress < 1 || item.saving)

  return <div className="discover">
    {!settings.noticeAccepted && configured ? <div className="notice discover-notice" role="status"><ShieldAlert size={16} /><span>Streams por torrent baixam <strong>e enviam</strong> partes do arquivo com outras pessoas da rede. A legalidade varia por país e por conteúdo; use uma VPN se isso importa para você. Nada é mantido após a reprodução, a menos que você salve na biblioteca.</span><Button variant="ghost" size="icon-xs" aria-label="Entendi" onClick={() => onSaveSettings({ ...settings, noticeAccepted: true })}>✓</Button></div> : null}
    <div className="discover-bar">
      <form className="discover-search" onSubmit={(event) => { event.preventDefault(); void search() }}>
        <label className="search-box"><Search size={17} /><Input aria-label="Buscar torrents de música" placeholder={configured ? "Buscar artista, álbum ou música…" : "Configure um indexador para buscar"} value={query} disabled={!configured || searching} onChange={(event) => setQuery(event.target.value)} /></label>
        <Button type="submit" disabled={!configured || searching || !query.trim()}>{searching ? <Loader2 className="spin" size={16} /> : <Search size={16} />}Buscar</Button>
        <Button type="button" variant="outline" size="icon" aria-label="Atualizar resultados" title="Pesquisar novamente com o texto atual" disabled={!configured || searching || !query.trim()} onClick={() => void search()}><RefreshCw size={16} /></Button>
      </form>
      <div className="discover-actions">
        {active.length ? <span className="muted discover-live">{active.length} torrent(s) baixando · {Math.round(active[0].progress * 100)}%</span> : null}
        {active.length ? <Button variant="outline" disabled={!!stopping} onClick={() => void stop()}><Square size={14} />Parar todos os torrents</Button> : null}
        <Button variant="outline" onClick={() => setSettingsOpen(true)}><Settings2 size={16} />Indexador</Button>
      </div>
    </div>

    {!window.desktop ? <div className="empty-state"><div className="empty-icon"><Compass /></div><h2>Disponível no aplicativo desktop</h2><p>A descoberta por torrents funciona apenas no aplicativo instalado, não na prévia do navegador.</p></div>
      : !configured ? <div className="empty-state"><div className="empty-icon"><Compass /></div><h2>Conecte um indexador</h2><p>A busca usa o seu Prowlarr ou Jackett. O aplicativo não traz fontes embutidas; nada é buscado sem você configurar.</p><Button onClick={() => setSettingsOpen(true)}><Settings2 />Configurar indexador</Button></div>
        : searching ? <div className="empty-state"><Loader2 className="spin big" size={30} /><p>Buscando em {new URL(settings.url).host}…</p></div>
          : searched && !results.length ? <div className="empty-state"><div className="empty-icon"><Search /></div><h2>Nenhum resultado</h2><p>Nada encontrado com seeders ativos. Tente outro termo ou verifique as categorias nas configurações.</p></div>
            : !searched ? <div className="empty-state"><div className="empty-icon"><Compass /></div><h2>O que ouvir hoje?</h2><p>Busque um artista ou álbum; os resultados vêm do seu indexador e tocam por stream na hora. Salve na biblioteca o que quiser manter.</p></div>
              : <div className="discover-results" role="list" aria-label="Resultados da busca">
                {results.map((result) => {
                  const state = expanded[result.source]
                  const expansion = state && state !== "loading" && state !== "error" ? state : null
                  const torrentProgress = expansion ? progress.get(expansion.infoHash) : undefined
                  const audioFiles = expansion?.files.filter((file) => file.isAudio) ?? []
                  return <div key={result.source} className="discover-result" role="listitem">
                    <button className="discover-row" aria-expanded={!!expansion} onClick={() => void expand(result)}>
                      <span className="discover-format">{result.format || "AUDIO"}</span>
                      <span className="discover-meta">
                        <strong>{result.display}</strong>
                        <small>{[result.year, result.indexer, formatSize(result.size), result.seeders >= 0 ? `${result.seeders} seeder(s)` : "seeders desconhecidos"].filter(Boolean).join(" · ")}</small>
                      </span>
                    </button>
                    {state === "loading" ? <div className="discover-files muted"><Loader2 className="spin" size={14} /> Lendo metadados do torrent…</div> : null}
                    {state === "error" ? <div className="discover-files muted">Não foi possível ler os metadados. Tente novamente.</div> : null}
                    {expansion ? <div className="discover-files">
                      {torrentProgress ? <div className="discover-progress muted">{torrentProgress.peers} par(es) · {Math.round(torrentProgress.progress * 100)}% baixado{torrentProgress.saving ? ` · salvando ${torrentProgress.saving.done}/${torrentProgress.saving.files} (${Math.round(torrentProgress.saving.progress * 100)}%)` : ""}</div> : null}
                      {audioFiles.length ? <><div className="discover-file-actions"><Button variant="outline" size="sm" disabled={preparing === result.source} onClick={() => void play(result, audioFiles[0].index)}><ListPlus size={14} />Tocar álbum</Button><Button variant="outline" size="sm" disabled={requesting === result.source} onClick={() => void save(result, audioFiles.map((file) => file.index), "o álbum")}>{requesting === result.source ? <Loader2 className="spin" size={14} /> : <Download size={14} />}Salvar álbum</Button>{torrentProgress && (torrentProgress.progress < 1 || torrentProgress.saving) ? <Button className="discover-stop" variant="outline" size="sm" disabled={!!stopping || preparing === result.source || requesting === result.source} onClick={() => void stop(expansion.infoHash)}><Square size={14} />Parar download</Button> : null}</div>
                        {audioFiles.map((file) => <div key={file.index} className="discover-file">
                          <button className="discover-file-play" disabled={preparing === result.source} onClick={() => void play(result, file.index)} aria-label={`Reproduzir ${file.name}`}><Play size={13} fill="currentColor" /></button>
                          <span className="discover-file-name" title={file.name}>{cleanTrackTitle(file.name)}</span>
                          <span className="muted">{file.name.split(".").pop()?.toUpperCase()} · {formatSize(file.length)}</span>
                          <button className="discover-file-play" disabled={requesting === result.source} onClick={() => void save(result, [file.index], `“${cleanTrackTitle(file.name)}”`)} aria-label={`Salvar ${file.name} na biblioteca`} title="Salvar na biblioteca"><Download size={13} /></button>
                        </div>)}</>
                        : <p className="muted">Este torrent não contém arquivos de áudio compatíveis.</p>}
                    </div> : null}
                  </div>
                })}
              </div>}
    <DiscoverSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} onSave={onSaveSettings} saveFolder={saveFolder} onChooseSaveFolder={onChooseSaveFolder} />
  </div>
}

function DiscoverSettingsSheet({ open, onOpenChange, settings, onSave, saveFolder, onChooseSaveFolder }: { open: boolean; onOpenChange: (open: boolean) => void; settings: DiscoverSettings; onSave: (settings: DiscoverSettings) => void; saveFolder: string; onChooseSaveFolder: () => void }) {
  const [draft, setDraft] = useState(settings)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState("")

  const prowlarr = draft.provider === "prowlarr"
  const connection = (): DiscoverConnection => ({ url: draft.url.trim(), apiKey: draft.apiKey.trim(), categories: draft.categories.trim() || "3000" })
  const cleaned = (): DiscoverSettings => ({ ...draft, ...connection(), profiles: { ...draft.profiles, [draft.provider]: connection() } })
  // Each provider keeps its own address, key and categories in the draft.
  const switchProvider = (provider: DiscoverProvider) => {
    if (provider === draft.provider) return
    const profiles = { ...draft.profiles, [draft.provider]: { url: draft.url, apiKey: draft.apiKey, categories: draft.categories } }
    setDraft({ ...draft, ...(profiles[provider] ?? { url: "", apiKey: "", categories: "3000" }), provider, profiles })
    setTestResult("")
  }
  const save = () => {
    onSave(cleaned())
    onOpenChange(false)
  }

  const test = async () => {
    if (!window.desktop) return
    setTesting(true)
    setTestResult("")
    try {
      const { hint } = await window.desktop.testDiscover(cleaned())
      setTestResult(`Conexão OK — ${hint}.`)
    } catch (error) {
      setTestResult(errorMessage(error, "Falha ao conectar."))
    } finally { setTesting(false) }
  }

  return <Sheet open={open} onOpenChange={(next) => { if (next) { setDraft(settings); setTestResult("") } onOpenChange(next) }}><SheetContent className="local-sheet">
    <SheetHeader><SheetTitle>Indexador de torrents</SheetTitle><SheetDescription>Conecte o seu Prowlarr ou Jackett. Nada é buscado sem esta configuração.</SheetDescription></SheetHeader>
    <form className="playlist-form" onSubmit={(event) => { event.preventDefault(); save() }}>
      <div className="provider-toggle" role="group" aria-label="Tipo de indexador">
        <Button type="button" size="sm" variant={prowlarr ? "default" : "outline"} aria-pressed={prowlarr} onClick={() => switchProvider("prowlarr")}>Prowlarr</Button>
        <Button type="button" size="sm" variant={prowlarr ? "outline" : "default"} aria-pressed={!prowlarr} onClick={() => switchProvider("torznab")}>Torznab (Jackett)</Button>
      </div>
      <div className="form-field">
        <div className="field-label"><label htmlFor="indexer-url">{prowlarr ? "Endereço do Prowlarr" : "Endpoint Torznab"}</label><InfoTip label="Ajuda sobre o endereço">{prowlarr ? "Use o endereço base do Prowlarr. A busca usa a API do próprio Prowlarr e consulta todos os indexadores ativos de uma vez." : "Para buscar em todos os indexadores do Jackett: http://localhost:9117/api/v2.0/indexers/all/results/torznab/"}</InfoTip></div>
        <Input id="indexer-url" required value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder={prowlarr ? "http://localhost:9696" : "http://localhost:9117/api/v2.0/indexers/all/results/torznab/"} />
      </div>
      <div className="form-field">
        <div className="field-label"><label htmlFor="indexer-key">Chave de API</label><InfoTip label="Onde encontrar a chave de API">{prowlarr ? "No Prowlarr: Settings → General → Security → API Key." : "No Jackett: aparece no topo do painel."}</InfoTip></div>
        <Input id="indexer-key" required type="password" value={draft.apiKey} onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })} />
      </div>
      <div className="form-field">
        <div className="field-label"><label htmlFor="indexer-categories">Categorias</label><InfoTip label="Ajuda sobre categorias">Padrão 3000 (Música). Use 3000,3010,3040 para buscar só MP3 e FLAC.</InfoTip></div>
        <Input id="indexer-categories" value={draft.categories} onChange={(event) => setDraft({ ...draft, categories: event.target.value })} placeholder="3000" />
      </div>
      <div className="save-folder"><span>Pasta das músicas salvas</span><div><code title={saveFolder}>{saveFolder || "—"}</code><Button type="button" variant="outline" size="sm" onClick={onChooseSaveFolder}><FolderOpen size={14} />Alterar</Button></div></div>
      {testResult ? <p className={`muted ${testResult.startsWith("Conexão OK") ? "discover-ok" : "discover-error"}`} role="status">{testResult}</p> : null}
      <div className="sheet-actions">
        <Button type="submit" disabled={!draft.url.trim() || !draft.apiKey.trim()}>Salvar</Button>
        <Button type="button" variant="outline" disabled={testing || !draft.url.trim() || !draft.apiKey.trim()} onClick={() => void test()}>{testing ? <Loader2 className="spin" size={14} /> : null}Testar conexão</Button>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
      </div>
      <p className="muted">Streams por torrent participam da rede BitTorrent: seu IP é visto pelos pares. Nada é semeado depois de tocar ou salvar, e o cache é apagado.</p>
    </form>
  </SheetContent></Sheet>
}
