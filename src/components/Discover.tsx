import { useState } from "react"
import { ChevronDown, Compass, Download, ListPlus, Loader2, Play, Search, ShieldAlert, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cleanTrackTitle, errorMessage, formatSize, type DiscoverResult, type DiscoverSettings, type TorrentExpansion, type TorrentProgress, type Track } from "@/library"

type Props = {
  settings: DiscoverSettings
  progress: Map<string, TorrentProgress>
  saveFolder: string
  onSaveSettings: (settings: DiscoverSettings) => void
  onPlay: (tracks: Track[], index: number) => void
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

export function Discover({ settings, progress, saveFolder, onSaveSettings, onPlay, notify }: Props) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<DiscoverResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, TorrentExpansion | "loading" | "error">>({})
  const [openResults, setOpenResults] = useState<Set<string>>(new Set())
  const [preparing, setPreparing] = useState("")
  const [requesting, setRequesting] = useState("")

  const search = async () => {
    if (!window.desktop || !query.trim() || searching) return
    setSearching(true)
    setSearched(false)
    try {
      const { results } = await window.desktop.searchDiscover(query)
      setResults(results)
      setSearched(true)
      setExpanded({})
      setOpenResults(new Set())
    } catch (error) {
      notify(errorMessage(error, "Não foi possível buscar no indexador."))
    } finally { setSearching(false) }
  }

  const expand = async (result: DiscoverResult) => {
    if (!window.desktop) return
    const source = result.source
    setOpenResults((value) => { const next = new Set(value); if (next.has(source)) next.delete(source); else next.add(source); return next })
    if (openResults.has(source) || (expanded[source] && expanded[source] !== "error")) return
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

  const configured = Boolean(settings.url && settings.apiKey)
  const active = [...progress.values()].filter((item) => item.progress < 1)

  return <div className="discover">
    {!settings.noticeAccepted && configured ? <div className="notice discover-notice" role="status"><ShieldAlert size={16} /><span>Streams por torrent baixam <strong>e enviam</strong> partes do arquivo com outras pessoas da rede. A legalidade varia por país e por conteúdo; use uma VPN se isso importa para você. Nada é mantido após a reprodução, a menos que você salve na biblioteca.</span><Button variant="ghost" size="icon-xs" aria-label="Entendi" onClick={() => onSaveSettings({ ...settings, noticeAccepted: true })}>✓</Button></div> : null}
    <div className="discover-bar">
      <form className="discover-search" onSubmit={(event) => { event.preventDefault(); void search() }}>
        <label className="search-box"><Search size={17} /><Input aria-label="Buscar torrents de música" placeholder={configured ? "Buscar artista, álbum ou música…" : "Configure um indexador para buscar"} value={query} disabled={!configured || searching} onChange={(event) => setQuery(event.target.value)} /></label>
        <Button type="submit" disabled={!configured || searching || !query.trim()}>{searching ? <Loader2 className="spin" size={16} /> : <Search size={16} />}Buscar</Button>
      </form>
      <div className="discover-actions">
        {active.length ? <span className="muted discover-live">{active.length} torrent(s) baixando · {Math.round(active[0].progress * 100)}%</span> : null}
        {active.length ? <Button variant="outline" onClick={() => { void window.desktop?.stopTorrents(true); notify("Torrents e downloads interrompidos; cache removido. Músicas já salvas continuam na biblioteca.") }}><Square size={14} />Parar torrents</Button> : null}
      </div>
    </div>

    {!window.desktop ? <div className="empty-state"><div className="empty-icon"><Compass /></div><h2>Disponível no aplicativo desktop</h2><p>A descoberta por torrents funciona apenas no aplicativo instalado, não na prévia do navegador.</p></div>
      : !configured ? <div className="empty-state"><div className="empty-icon"><Compass /></div><h2>Conecte um indexador</h2><p>A busca usa o seu Prowlarr ou Jackett. Configure a conexão em Configurações → Indexador para começar a buscar.</p></div>
        : searching ? <div className="empty-state"><Loader2 className="spin big" size={30} /><p>Buscando em {new URL(settings.url).host}…</p></div>
          : searched && !results.length ? <div className="empty-state"><div className="empty-icon"><Search /></div><h2>Nenhum resultado</h2><p>Nada encontrado com seeders ativos. Tente outro termo ou verifique as categorias nas configurações.</p></div>
            : !searched ? <div className="empty-state"><div className="empty-icon"><Compass /></div><h2>O que ouvir hoje?</h2><p>Busque um artista ou álbum; os resultados vêm do seu indexador e tocam por stream na hora. Salve na biblioteca o que quiser manter.</p></div>
              : <div className="discover-results" role="list" aria-label="Resultados da busca">
                {results.map((result) => {
                  const isOpen = openResults.has(result.source)
                  const state = isOpen ? expanded[result.source] : undefined
                  const expansion = state && state !== "loading" && state !== "error" ? state : null
                  const torrentProgress = expansion ? progress.get(expansion.infoHash) : undefined
                  const audioFiles = expansion?.files.filter((file) => file.isAudio) ?? []
                  return <div key={result.source} className="discover-result" role="listitem">
                    <button className="discover-row" aria-expanded={isOpen} onClick={() => void expand(result)}>
                      <span className="discover-format">{result.format || "AUDIO"}</span>
                      <span className="discover-meta">
                        <strong>{result.display}</strong>
                        <small>{[result.year, result.indexer, formatSize(result.size), result.seeders >= 0 ? `${result.seeders} seeder(s)` : "seeders desconhecidos"].filter(Boolean).join(" · ")}</small>
                      </span>
                      <ChevronDown className={`discover-chevron ${isOpen ? "expanded" : ""}`} size={16} />
                    </button>
                    {state === "loading" ? <div className="discover-files muted"><Loader2 className="spin" size={14} /> Lendo metadados do torrent…</div> : null}
                    {state === "error" ? <div className="discover-files muted">Não foi possível ler os metadados. Tente novamente.</div> : null}
                    {expansion ? <div className="discover-files">
                      {torrentProgress ? <div className="discover-progress muted">{torrentProgress.peers} par(es) · {Math.round(torrentProgress.progress * 100)}% baixado{torrentProgress.saving ? ` · salvando ${torrentProgress.saving.done}/${torrentProgress.saving.files} (${Math.round(torrentProgress.saving.progress * 100)}%)` : ""}</div> : null}
                      {audioFiles.length ? <><div className="discover-file-actions"><Button variant="outline" size="sm" disabled={preparing === result.source} onClick={() => void play(result, audioFiles[0].index)}><ListPlus size={14} />Tocar álbum</Button><Button variant="outline" size="sm" disabled={requesting === result.source} onClick={() => void save(result, audioFiles.map((file) => file.index), "o álbum")}>{requesting === result.source ? <Loader2 className="spin" size={14} /> : <Download size={14} />}Salvar álbum</Button></div>
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
  </div>
}
