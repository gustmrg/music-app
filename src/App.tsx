import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { ArrowDown, ArrowUp, Clock3, Compass, Disc3, FileAudio, Folder, FolderPlus, Heart, Library as LibraryIcon, ListMusic, ListPlus, Maximize2, Minus, Music2, Pencil, Play, Plus, Search, Tags, Trash2, Upload, X, Youtube } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Player, type PlayMode } from "@/components/Player"
import { Discover } from "@/components/Discover"
import { Cover } from "@/components/Cover"
import { TrackTable } from "@/components/TrackTable"
import { LibraryFilters, applyFilters, emptyFilters, type Filters } from "@/components/LibraryFilters"
import { TagEditor } from "@/components/TagEditor"
import { albumKey, applyTagEdit, audioExtensions, buildAlbums, emptyLibrary, errorMessage, filterTracks, folderName, normalize, type ImportResult, type Library, type Playlist, type TagEdit, type TorrentProgress, type TorrentSaved, type Track } from "@/library"

type View = "library" | "albums" | "folders" | "playlists" | "liked" | "recent" | "discover"
const navigationGroups = [
  { label: "OUVIR", items: [
    { id: "library", label: "Biblioteca", icon: LibraryIcon },
    { id: "albums", label: "Álbuns", icon: Disc3 },
    { id: "recent", label: "Recentes", icon: Clock3 },
    { id: "liked", label: "Favoritos", icon: Heart },
    { id: "discover", label: "Descobrir", icon: Compass },
  ] },
  { label: "ORGANIZAR", items: [
    { id: "playlists", label: "Playlists", icon: ListMusic },
    { id: "folders", label: "Pastas", icon: Folder },
  ] },
] as const
const navigation: readonly { id: View; label: string }[] = navigationGroups.flatMap((group): readonly { id: View; label: string }[] => group.items)

export default function App() {
  const [library, setLibrary] = useState<Library>(emptyLibrary)
  const [loaded, setLoaded] = useState(!window.desktop)
  const [view, setView] = useState<View>("library")
  const [folder, setFolder] = useState<string | null>(null)
  const [playlistId, setPlaylistId] = useState("")
  const [albumId, setAlbumId] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [tagEditorOpen, setTagEditorOpen] = useState(false)
  const [search, setSearch] = useState("")
  const query = useDeferredValue(search)
  const [queue, setQueue] = useState<string[]>([])
  const [selection, setSelection] = useState({ id: "", request: 0 })
  const [mode, setMode] = useState<PlayMode>("order")
  const [queueOpen, setQueueOpen] = useState(false)
  const [editor, setEditor] = useState<Playlist | null>(null)
  const [editorSearch, setEditorSearch] = useState("")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [youtubeOpen, setYoutubeOpen] = useState(false)
  const [youtubeText, setYoutubeText] = useState("")
  const [youtubeName, setYoutubeName] = useState("")
  const filesInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const browserTracks = useRef(new Map<string, Track>())
  const notify = useCallback((message: string) => setNotice(message), [])

  useEffect(() => {
    let active = true
    if (window.desktop) void window.desktop.loadLibrary().then((value) => { if (active) { setLibrary(value); setLoaded(true) } }).catch(() => notify("Não foi possível carregar a biblioteca. Os dados salvos foram preservados; reabra o aplicativo para tentar novamente."))
    return () => { active = false }
  }, [notify])

  const { liked, recent, playlists, volume, discover, tagEdits } = library
  useEffect(() => {
    if (loaded && window.desktop) void window.desktop.savePreferences({ liked, recent, playlists, volume, discover, tagEdits }).catch(() => notify("Não foi possível salvar as alterações da biblioteca neste computador."))
  }, [loaded, liked, recent, playlists, volume, discover, tagEdits, notify])

  // Tags of older libraries are read in the background after loading.
  useEffect(() => {
    const subscribe = window.desktop?.onLibraryTracks
    if (!subscribe) return
    return subscribe((tracks) => setLibrary((value) => ({ ...value, tracks })))
  }, [])

  useEffect(() => () => { for (const track of browserTracks.current.values()) if (track.url) URL.revokeObjectURL(track.url) }, [])

  // Torrent tracks exist only for this session: they are registered here when
  // prepared and resolved through the same trackMap as library tracks.
  const [discoverTracks, setDiscoverTracks] = useState<Track[]>([])
  const discoverTracksRef = useRef(discoverTracks)
  discoverTracksRef.current = discoverTracks
  const registerDiscoverTracks = useCallback((tracks: Track[]) => {
    setDiscoverTracks((existing) => {
      const merged = new Map(existing.map((track) => [track.id, track]))
      for (const track of tracks) merged.set(track.id, track)
      return [...merged.values()]
    })
  }, [])

  // Library tracks with the user's in-app tag edits applied.
  const tracks = useMemo(() => library.tracks.map((track) => applyTagEdit(track, tagEdits[track.id])), [library.tracks, tagEdits])
  const albums = useMemo(() => buildAlbums(tracks), [tracks])
  const selectedAlbum = view === "albums" ? albums.find((album) => album.key === albumId) : undefined
  const trackMap = useMemo(() => {
    const map = new Map(tracks.map((track) => [track.id, track]))
    for (const track of discoverTracks) map.set(track.id, track)
    return map
  }, [tracks, discoverTracks])
  const likedIds = useMemo(() => new Set(liked), [liked])
  const selectedPlaylist = playlists.find((playlist) => playlist.id === playlistId)
  const fromIds = (ids: string[]) => ids.flatMap((id) => { const track = trackMap.get(id); return track ? [track] : [] })
  const visibleTracks = useMemo(() => {
    let items = tracks
    if (view === "library") items = applyFilters(items, filters, likedIds)
    else if (view === "albums") items = selectedAlbum ? selectedAlbum.trackIds.flatMap((id) => trackMap.get(id) ? [trackMap.get(id)!] : []) : []
    else if (view === "liked") items = items.filter((track) => likedIds.has(track.id))
    else if (view === "recent") items = recent.flatMap((id) => trackMap.get(id) ? [trackMap.get(id)!] : [])
    else if (view === "folders" && folder !== null) items = items.filter((track) => track.folder === folder)
    else if (view === "playlists" && selectedPlaylist) items = selectedPlaylist.trackIds.flatMap((id) => trackMap.get(id) ? [trackMap.get(id)!] : [])
    return filterTracks(items, query)
  }, [tracks, view, filters, likedIds, recent, trackMap, folder, selectedPlaylist, selectedAlbum, query])
  const folders = useMemo(() => {
    const counts = new Map<string, number>()
    for (const track of tracks) counts.set(track.folder, (counts.get(track.folder) ?? 0) + 1)
    return [...counts].sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
  }, [tracks])

  const navigate = (next: View) => { setView(next); setFolder(null); setPlaylistId(""); setAlbumId(""); setSearch(""); setSelected(new Set()) }
  const play = (id: string, ids?: string[]) => {
    if (ids) setQueue(ids)
    setSelection((previous) => ({ id, request: previous.request + 1 }))
  }
  const toggleLike = (id: string) => setLibrary((value) => ({ ...value, liked: value.liked.includes(id) ? value.liked.filter((item) => item !== id) : [...value.liked, id] }))
  const started = useCallback((id: string) => setLibrary((value) => value.recent[0] === id ? value : { ...value, recent: [id, ...value.recent.filter((item) => item !== id)].slice(0, 100) }), [])

  // Engine progress pushes (peers/percent) keyed by info hash for the UI.
  const [torrentProgress, setTorrentProgress] = useState<Map<string, TorrentProgress>>(new Map())
  useEffect(() => {
    const subscribe = window.desktop?.onTorrentProgress
    if (!subscribe) return
    return subscribe((snapshot) => setTorrentProgress(new Map(snapshot.map((item) => [item.infoHash, item]))))
  }, [])

  // Finished saves arrive from the main process with the updated library.
  useEffect(() => {
    const subscribe = window.desktop?.onTorrentSaved
    if (!subscribe) return
    return subscribe((outcome: TorrentSaved) => {
      const tracks = outcome.result?.tracks
      if (tracks) setLibrary((value) => ({ ...value, tracks }))
      notify(outcome.error ? `Não foi possível adicionar “${outcome.name}” à biblioteca: ${outcome.error}`
        : outcome.saved ? `${outcome.saved} música(s) de “${outcome.name}” salva(s) na biblioteca.${outcome.failed ? ` ${outcome.failed} não puderam ser salvas.` : ""}`
          : outcome.cancelled ? `Download de “${outcome.name}” cancelado; nada foi salvo.`
            : `Não foi possível salvar “${outcome.name}”. Verifique o espaço em disco e a pasta escolhida.`)
    })
  }, [notify])

  const saveCurrentTorrentTrack = async () => {
    const track = trackMap.get(selection.id)
    if (!window.desktop || track?.source !== "torrent") return
    try {
      const started = await window.desktop.saveTorrentTrack(track.id)
      notify(started.queued ? `Salvando “${track.title}” em ${library.saveFolder}. Ela entra na biblioteca quando o download terminar.` : `“${track.title}” já está sendo salva.`)
    } catch (error) {
      notify(errorMessage(error, "Não foi possível salvar esta música na biblioteca."))
    }
  }

  const chooseSaveFolder = async () => {
    try {
      const folder = await window.desktop?.chooseSaveFolder()
      if (folder) setLibrary((value) => ({ ...value, saveFolder: folder }))
    } catch (error) {
      notify(errorMessage(error, "Não foi possível usar esta pasta."))
    }
  }

  // Stream-only playback policy: leaving a torrent track releases it, and
  // moving to a non-torrent track stops and wipes every active torrent.
  const previousSelection = useRef("")
  useEffect(() => {
    const desktop = window.desktop
    const previous = previousSelection.current
    previousSelection.current = selection.id
    if (!desktop || previous === selection.id) return
    const wasTorrent = discoverTracksRef.current.some((track) => track.id === previous)
    if (!wasTorrent) return
    void desktop.releaseTorrent(previous)
    if (!discoverTracksRef.current.some((track) => track.id === selection.id)) void desktop.stopTorrents()
  }, [selection.id])

  const next = (ended = false) => {
    if (!queue.length) return
    const index = queue.indexOf(selection.id)
    if (mode === "order" && ended && index === queue.length - 1) return
    let target = (index + 1) % queue.length
    if (mode === "shuffle" && queue.length > 1) target = (index + 1 + Math.floor(Math.random() * (queue.length - 1))) % queue.length
    play(queue[target])
  }

  const acceptImport = (result: ImportResult) => {
    setLibrary((value) => ({ ...value, tracks: result.tracks, playlists: result.playlist ? [...value.playlists, result.playlist] : value.playlists }))
    if (result.playlist) { setView("playlists"); setPlaylistId(result.playlist.id); setSearch("") }
    notify(`${result.imported.length} música(s) lida(s).${result.skipped ? ` ${result.skipped} item(ns) indisponível(is) ou não local(is) ignorado(s).` : ""}`)
  }
  const importLocal = async (kind: "files" | "folder" | "playlist") => {
    if (!window.desktop) { if (kind === "files") filesInput.current?.click(); else if (kind === "folder") folderInput.current?.click(); return }
    setBusy(true)
    try {
      const result = await (kind === "files" ? window.desktop.openFiles() : kind === "folder" ? window.desktop.openFolder() : window.desktop.importPlaylist())
      if (result) acceptImport(result)
    } catch { notify("Não foi possível ler a seleção. Verifique as permissões e tente novamente.") }
    finally { setBusy(false) }
  }
  const addYoutube = async () => {
    if (!window.desktop || !youtubeText.trim()) return
    setBusy(true)
    try {
      const result = await window.desktop.addYoutube(youtubeText, youtubeName)
      acceptImport(result)
      setYoutubeOpen(false); setYoutubeText(""); setYoutubeName("")
    } catch (error) {
      notify(errorMessage(error, "Não foi possível ler os links do YouTube."))
    } finally { setBusy(false) }
  }
  const importBrowserFiles = (files: FileList | null) => {
    if (!files) return
    let count = 0
    for (const file of Array.from(files)) {
      if (!audioExtensions.test(file.name)) continue
      const location = file.webkitRelativePath || file.name
      const id = `${location}:${file.size}:${file.lastModified}`
      if (!browserTracks.current.has(id)) browserTracks.current.set(id, { id, path: location, title: file.name.replace(audioExtensions, ""), folder: location.includes("/") ? location.slice(0, location.lastIndexOf("/")) : "", format: file.name.split(".").pop()!.toUpperCase(), url: URL.createObjectURL(file) })
      count++
    }
    setLibrary((value) => ({ ...value, tracks: [...browserTracks.current.values()] }))
    notify(`${count} música(s) disponível(is) nesta sessão. Use o aplicativo desktop para manter a biblioteca salva.`)
  }
  const openEditor = (playlist?: Playlist, ids: string[] = []) => {
    setEditorSearch("")
    setEditor(playlist ? { ...playlist, trackIds: [...playlist.trackIds] } : { id: crypto.randomUUID(), name: "", trackIds: [...ids] })
  }
  const savePlaylist = () => {
    if (!editor?.name.trim()) return
    const edited = { ...editor, name: editor.name.trim() }
    setLibrary((value) => ({ ...value, playlists: value.playlists.some((item) => item.id === edited.id) ? value.playlists.map((item) => item.id === edited.id ? edited : item) : [...value.playlists, edited] }))
    setView("playlists"); setPlaylistId(edited.id); setSearch(""); setEditor(null)
  }
  const reorder = (id: string, step: number) => {
    if (!selectedPlaylist) return
    const ids = [...selectedPlaylist.trackIds]
    const index = ids.indexOf(id)
    const target = index + step
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    setLibrary((value) => ({ ...value, playlists: value.playlists.map((item) => item.id === selectedPlaylist.id ? { ...item, trackIds: ids } : item) }))
  }
  // Bulk actions on the selected tracks, kept in the order they are shown.
  const selectedIds = visibleTracks.filter((track) => selected.has(track.id)).map((track) => track.id)
  const selectedTracks = selectedIds.flatMap((id) => trackMap.get(id) ? [trackMap.get(id)!] : [])
  const addToPlaylist = (id: string) => {
    const target = playlists.find((item) => item.id === id)
    if (!target) return
    const added = selectedIds.filter((trackId) => !target.trackIds.includes(trackId))
    setLibrary((value) => ({ ...value, playlists: value.playlists.map((item) => item.id === id ? { ...item, trackIds: [...item.trackIds, ...added] } : item) }))
    notify(added.length ? `${added.length} música(s) adicionada(s) a “${target.name}”.` : `As músicas selecionadas já estão em “${target.name}”.`)
    setSelected(new Set())
  }
  const likeSelected = () => {
    const allLiked = selectedIds.every((id) => likedIds.has(id))
    setLibrary((value) => ({ ...value, liked: allLiked ? value.liked.filter((id) => !selected.has(id)) : [...new Set([...value.liked, ...selectedIds])] }))
  }
  const saveTagEdit = (edit: TagEdit) => {
    setLibrary((value) => {
      const next = { ...value.tagEdits }
      for (const id of selectedIds) next[id] = { ...next[id], ...edit }
      return { ...value, tagEdits: next }
    })
    setTagEditorOpen(false)
    setSelected(new Set())
    // Opening the album right away confirms the grouping worked.
    const first = selectedTracks[0] && applyTagEdit(selectedTracks[0], edit)
    if (edit.album && first) { setView("albums"); setFolder(null); setPlaylistId(""); setSearch(""); setAlbumId(albumKey(first)) }
    notify(edit.album ? `Álbum “${edit.album}” atualizado com ${selectedIds.length} faixa(s).` : `Informações de ${selectedIds.length} faixa(s) atualizadas.`)
  }
  const restoreTags = () => {
    setLibrary((value) => ({ ...value, tagEdits: Object.fromEntries(Object.entries(value.tagEdits).filter(([id]) => !selected.has(id))) }))
    setTagEditorOpen(false)
    setSelected(new Set())
    notify("Tags originais dos arquivos restauradas.")
  }
  useEffect(() => {
    if (!selected.size) return
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.querySelector("[data-slot='sheet-content']")) setSelected(new Set()) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selected.size])

  const exportPlaylist = async () => {
    if (!window.desktop || !selectedPlaylist) return
    setBusy(true)
    try { if (await window.desktop.exportPlaylist(selectedPlaylist.trackIds)) notify("Playlist exportada. Nenhum arquivo de música foi copiado.") }
    catch { notify("Não foi possível exportar. Escolha um arquivo .m3u8 em uma pasta gravável.") }
    finally { setBusy(false) }
  }

  const visibleFolders = folders.filter(([name]) => name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const visiblePlaylists = playlists.filter((item) => item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const showFolders = view === "folders" && folder === null
  const showPlaylists = view === "playlists" && !selectedPlaylist
  const showAlbums = view === "albums" && !selectedAlbum
  const visibleAlbums = albums.filter((album) => normalize(`${album.title} ${album.artist}`).includes(normalize(query.trim())))
  const showCollection = showFolders || showPlaylists || showAlbums
  const title = selectedPlaylist && view === "playlists" ? selectedPlaylist.name : selectedAlbum ? selectedAlbum.title : folder !== null && view === "folders" ? folderName(folder) : navigation.find((item) => item.id === view)!.label
  const albumDuration = selectedAlbum ? Math.round(visibleTracks.reduce((total, track) => total + (track.duration ?? 0), 0) / 60) : 0

  return <div className="app-shell">
    <input ref={filesInput} type="file" accept=".mp3,.wav,.flac,.ogg,.opus,.m4a,.aac,.webm" multiple hidden onChange={(event) => { importBrowserFiles(event.target.files); event.target.value = "" }} />
    <input ref={folderInput} type="file" multiple hidden {...{ webkitdirectory: "" }} onChange={(event) => { importBrowserFiles(event.target.files); event.target.value = "" }} />
    <aside className="sidebar">
      <div className="brand window-drag"><span className="brand-icon"><Music2 size={20} /></span>Local Music</div>
      <nav aria-label="Navegação principal">{navigationGroups.map((group) => <div key={group.label} className="nav-group" role="group" aria-labelledby={`nav-${group.label}`}><div id={`nav-${group.label}`} className="sidebar-label">{group.label}</div>{group.items.map(({ id, label, icon: Icon }) => <Button key={id} variant="ghost" className={`nav-item ${view === id ? "active" : ""}`} aria-current={view === id ? "page" : undefined} onClick={() => navigate(id)}><Icon size={18} />{label}{id === "library" ? <span className="nav-count">{library.tracks.length}</span> : null}</Button>)}</div>)}</nav>
      <div className="sidebar-label playlist-label"><span>SUAS PLAYLISTS</span><Button variant="ghost" size="icon-xs" aria-label="Criar playlist" disabled={!loaded} onClick={() => openEditor()}><Plus size={15} /></Button></div>
      <div className="sidebar-playlists">{playlists.length ? playlists.map((playlist) => <button key={playlist.id} className={`sidebar-playlist ${playlistId === playlist.id ? "selected" : ""}`} onClick={() => { navigate("playlists"); setPlaylistId(playlist.id) }}><ListMusic size={16} /><span>{playlist.name}</span></button>) : <p className="sidebar-hint">Suas seleções, do seu jeito.</p>}</div>
      <div className="sidebar-bottom"><span className="status-dot" />{window.desktop ? "Biblioteca local" : "Prévia no navegador"}<small>Sem conta. Sem telemetria.</small></div>
    </aside>
    <main className="main">
      <header className="topbar window-drag" onDoubleClick={() => window.desktop?.toggleMaximize()}>
        <label className="search-box"><Search size={17} /><Input aria-label="Buscar músicas" placeholder="Buscar por música, arquivo ou pasta" value={search} onChange={(event) => setSearch(event.target.value)} />{search ? <Button variant="ghost" size="icon-xs" aria-label="Limpar busca" onClick={() => setSearch("")}><X size={14} /></Button> : null}</label>
        <div className="topbar-actions">{window.desktop ? <Button variant="outline" disabled={busy || !loaded} onClick={() => setYoutubeOpen(true)}><Youtube size={16} />YouTube</Button> : null}<Button variant="outline" disabled={busy || !loaded} onClick={() => void importLocal("files")}><FileAudio size={16} />Abrir arquivos</Button><Button disabled={busy || !loaded} onClick={() => void importLocal("folder")}><FolderPlus size={16} />Adicionar pasta</Button></div>
        {window.desktop ? <div className="window-controls"><Button variant="ghost" size="icon-xs" aria-label="Minimizar" onClick={() => window.desktop?.minimize()}><Minus /></Button><Button variant="ghost" size="icon-xs" aria-label="Maximizar" onClick={() => window.desktop?.toggleMaximize()}><Maximize2 /></Button><Button variant="ghost" size="icon-xs" aria-label="Fechar janela" onClick={() => window.desktop?.close()}><X /></Button></div> : null}
      </header>
      <section className="content" aria-busy={busy || !loaded}>
        {!window.desktop ? <p className="browser-notice">No navegador, os arquivos ficam disponíveis apenas nesta sessão. No desktop, sua biblioteca e playlists ficam salvas.</p> : null}
        {notice ? <div className="notice" role="status"><span>{notice}</span><Button variant="ghost" size="icon-xs" aria-label="Fechar aviso" onClick={() => setNotice("")}><X /></Button></div> : null}
        {/* Keep discovery mounted so navigation preserves searches and metadata. */}
        <div hidden={view !== "discover"}><Discover settings={discover} progress={torrentProgress} saveFolder={library.saveFolder} onChooseSaveFolder={() => void chooseSaveFolder()} onSaveSettings={(next) => setLibrary((value) => ({ ...value, discover: next }))} onPlay={(tracks, index) => { registerDiscoverTracks(tracks); play(tracks[index].id, tracks.map((track) => track.id)) }} onStopped={(infoHash) => {
          const stopped = new Set(discoverTracks.filter((track) => !infoHash || track.infoHash === infoHash).map((track) => track.id))
          setDiscoverTracks((tracks) => tracks.filter((track) => !stopped.has(track.id)))
          setQueue((ids) => ids.filter((id) => !stopped.has(id)))
          setSelection((value) => stopped.has(value.id) ? { id: "", request: value.request + 1 } : value)
          setTorrentProgress((items) => new Map([...items].filter(([key]) => infoHash && key !== infoHash)))
        }} notify={notify} /></div>{view !== "discover" ? <>
        <div className="page-heading">{selectedAlbum ? <Cover cover={selectedAlbum.cover} size="large" album /> : null}<div><p className="eyebrow">{selectedPlaylist ? "PLAYLIST LOCAL" : selectedAlbum ? "ÁLBUM" : "DO SEU COMPUTADOR"}</p><h1>{title}</h1><p className="page-subtitle">{busy ? "Lendo arquivos…" : !loaded ? "Carregando biblioteca…" : showFolders ? `${folders.length} pasta(s) com músicas` : showPlaylists ? `${playlists.length} playlist(s) salvas` : showAlbums ? `${albums.length} álbum(ns)` : selectedAlbum ? [selectedAlbum.artist, selectedAlbum.year, `${visibleTracks.length} música(s)`, albumDuration ? `${albumDuration} min` : ""].filter(Boolean).join(" · ") : `${visibleTracks.length} música(s)`}</p></div>
          <div className="page-actions">{showPlaylists ? <><Button disabled={!loaded} onClick={() => openEditor()}><Plus />Nova playlist</Button>{window.desktop ? <Button variant="outline" disabled={busy || !loaded} onClick={() => void importLocal("playlist")}><Upload />Importar M3U</Button> : null}</> : !showCollection ? <><Button disabled={!visibleTracks.length} onClick={() => play(visibleTracks[0].id, visibleTracks.map((track) => track.id))}><Play fill="currentColor" />Reproduzir</Button>{selectedPlaylist ? <><Button variant="outline" onClick={() => openEditor(selectedPlaylist)}><Pencil />Editar</Button>{window.desktop ? <Button variant="outline" disabled={busy} onClick={() => void exportPlaylist()}><Upload />Exportar</Button> : null}</> : <Button variant="outline" disabled={!visibleTracks.length} onClick={() => openEditor(undefined, visibleTracks.map((track) => track.id))}><Plus />Salvar playlist</Button>}</> : null}</div>
        </div>
        {view === "library" && tracks.length ? <LibraryFilters tracks={tracks} filters={filters} onChange={setFilters} /> : null}
        {showFolders ? <div className="collection-grid">{visibleFolders.map(([name, count]) => <button className="collection-card" key={name} onClick={() => { setFolder(name); setSearch("") }}><Folder size={30} /><strong>{folderName(name)}</strong><span title={name}>{name || "Arquivos avulsos"}</span><small>{count} música(s)</small></button>)}</div> : showPlaylists ? <div className="collection-grid">{visiblePlaylists.map((playlist) => <button className="collection-card" key={playlist.id} onClick={() => { setPlaylistId(playlist.id); setSearch("") }}><ListMusic size={30} /><strong>{playlist.name}</strong><small>{playlist.trackIds.length} música(s)</small></button>)}</div> : showAlbums ? <div className="collection-grid album-grid">{visibleAlbums.map((album) => <button className="collection-card album-card" key={album.key} onClick={() => { setAlbumId(album.key); setSearch(""); setSelected(new Set()) }}><Cover cover={album.cover} size="large" album /><strong title={album.title}>{album.title}</strong><span>{album.artist || "Artista desconhecido"}</span><small>{[album.year, `${album.trackIds.length} música(s)`].filter(Boolean).join(" · ")}</small></button>)}</div> : visibleTracks.length ? <TrackTable tracks={visibleTracks} currentId={selection.id} likedIds={likedIds} selected={selected} onSelectionChange={setSelected} onPlay={(id) => play(id, visibleTracks.map((item) => item.id))} onToggleLike={toggleLike} albumNumbering={!!selectedAlbum} extraActions={selectedPlaylist ? (track) => <><Button variant="ghost" size="icon-xs" disabled={selectedPlaylist.trackIds.indexOf(track.id) === 0} aria-label={`Mover ${track.title} para cima`} onClick={() => reorder(track.id, -1)}><ArrowUp /></Button><Button variant="ghost" size="icon-xs" disabled={selectedPlaylist.trackIds.indexOf(track.id) === selectedPlaylist.trackIds.length - 1} aria-label={`Mover ${track.title} para baixo`} onClick={() => reorder(track.id, 1)}><ArrowDown /></Button></> : undefined} /> : null}
        {selectedIds.length ? <div className="selection-bar" role="toolbar" aria-label="Ações para as músicas selecionadas">
          <strong>{selectedIds.length} selecionada(s)</strong>
          <Button size="sm" onClick={() => play(selectedIds[0], selectedIds)}><Play fill="currentColor" />Tocar</Button>
          <Button size="sm" variant="outline" onClick={() => { setQueue((ids) => [...ids, ...selectedIds.filter((id) => !ids.includes(id))]); notify(`${selectedIds.length} música(s) na fila.`) }}><ListPlus />Adicionar à fila</Button>
          <Button size="sm" variant="outline" onClick={() => { openEditor(undefined, selectedIds); setSelected(new Set()) }}><Plus />Criar playlist</Button>
          {playlists.length ? <select className="selection-select" aria-label="Adicionar à playlist" value="" onChange={(event) => addToPlaylist(event.target.value)}><option value="" disabled>Adicionar à playlist…</option>{playlists.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : null}
          <Button size="sm" variant="outline" onClick={likeSelected}><Heart fill={selectedIds.every((id) => likedIds.has(id)) ? "currentColor" : "none"} />{selectedIds.every((id) => likedIds.has(id)) ? "Desfavoritar" : "Favoritar"}</Button>
          {selectedTracks.some((track) => track.source !== "torrent") ? <Button size="sm" variant="outline" onClick={() => setTagEditorOpen(true)}><Tags />Editar álbum e tags</Button> : null}
          <Button size="icon-sm" variant="ghost" aria-label="Limpar seleção" onClick={() => setSelected(new Set())}><X /></Button>
        </div> : null}
        {((showFolders && !visibleFolders.length) || (showPlaylists && !visiblePlaylists.length) || (showAlbums && !visibleAlbums.length) || (!showCollection && !visibleTracks.length)) ? <div className="empty-state"><div className="empty-icon">{view === "liked" ? <Heart /> : view === "playlists" ? <ListMusic /> : view === "albums" ? <Disc3 /> : <Music2 />}</div><h2>{query ? "Nenhum resultado encontrado" : view === "library" && tracks.length ? "Nenhuma música com esses filtros" : showAlbums ? "Nenhum álbum ainda" : view === "liked" ? "Guarde suas favoritas aqui" : view === "recent" ? "Sua próxima música começa aqui" : showPlaylists ? "Uma playlist para cada momento" : selectedPlaylist ? "Essa playlist ainda está vazia" : "Sua música, no seu espaço"}</h2><p>{query ? "Tente outro nome de música ou pasta." : view === "library" && tracks.length ? "Ajuste ou limpe os filtros para ver mais músicas." : showAlbums ? "Os álbuns vêm das tags dos arquivos. Selecione faixas na Biblioteca e use “Editar álbum e tags” para agrupá-las." : view === "liked" ? "Use o coração ao lado de uma música para adicioná-la." : view === "recent" ? "As músicas que você ouvir aparecerão aqui." : showPlaylists ? "Crie uma seleção ou importe uma playlist local no aplicativo desktop." : selectedPlaylist ? "Clique em Editar para escolher músicas da biblioteca." : "Adicione uma pasta ou abra seus arquivos para começar. Seus arquivos continuam onde estão."}</p>{view === "library" && !query && !tracks.length ? <Button disabled={busy || !loaded} onClick={() => void importLocal("folder")}><FolderPlus />Adicionar sua primeira pasta</Button> : null}</div> : null}
        </> : null}
      </section>
    </main>
    <Player track={trackMap.get(selection.id)} request={selection.request} liked={likedIds.has(selection.id)} volume={volume} mode={mode} torrentStatus={(() => { const track = trackMap.get(selection.id); return track?.source === "torrent" && track.infoHash ? torrentProgress.get(track.infoHash) : undefined })()} onVolume={(value) => setLibrary((previous) => ({ ...previous, volume: value }))} onMode={setMode} onLike={() => toggleLike(selection.id)} onNext={next} onPrevious={() => { if (queue.length) play(queue[(queue.indexOf(selection.id) - 1 + queue.length) % queue.length]) }} onQueue={() => setQueueOpen(true)} onStarted={started} onError={notify} onSave={() => void saveCurrentTorrentTrack()} />
    <Sheet open={queueOpen} onOpenChange={setQueueOpen}><SheetContent className="local-sheet"><SheetHeader><SheetTitle>Fila de reprodução</SheetTitle><SheetDescription>{queue.length} música(s) · independente das playlists salvas</SheetDescription></SheetHeader><div className="sheet-actions"><Button variant="outline" disabled={!queue.length} onClick={() => { setQueueOpen(false); openEditor(undefined, queue) }}><Plus />Salvar playlist</Button><Button variant="ghost" disabled={!queue.length} onClick={() => { setQueue([]); setSelection((value) => ({ id: "", request: value.request + 1 })) }}><Trash2 />Limpar fila</Button></div><div className="sheet-list">{fromIds(queue).map((track) => <div key={track.id} className="queue-row"><button className={selection.id === track.id ? "accent" : ""} onClick={() => play(track.id)}><Music2 size={16} /><span>{track.title}</span></button><Button variant="ghost" size="icon-xs" aria-label={`Remover ${track.title} da fila`} onClick={() => { setQueue((ids) => ids.filter((id) => id !== track.id)); if (selection.id === track.id) setSelection((value) => ({ id: "", request: value.request + 1 })) }}><X /></Button></div>)}{!queue.length ? <p className="muted">Reproduza uma música para começar uma fila.</p> : null}</div></SheetContent></Sheet>
    <Sheet open={youtubeOpen} onOpenChange={setYoutubeOpen}><SheetContent className="local-sheet"><SheetHeader><SheetTitle>Adicionar do YouTube</SheetTitle><SheetDescription>Cole links de vídeos, playlists ou transmissões ao vivo do YouTube, um por linha. O yt-dlp lê os metadados; nenhum vídeo é baixado e o áudio é transmitido na hora da reprodução.</SheetDescription></SheetHeader>{youtubeOpen ? <form className="playlist-form" onSubmit={(event) => { event.preventDefault(); void addYoutube() }}><label>Nome da playlist (opcional)<Input maxLength={120} value={youtubeName} onChange={(event) => setYoutubeName(event.target.value)} placeholder="Usado quando o envio tem vários vídeos" /></label><label>Links<textarea required rows={8} className="youtube-links" aria-label="Links do YouTube" value={youtubeText} onChange={(event) => setYoutubeText(event.target.value)} placeholder={"https://www.youtube.com/watch?v=…\nhttps://youtu.be/…\nhttps://www.youtube.com/playlist?list=…\nhttps://www.youtube.com/@canal/live"} /></label><p className="muted">Requer o yt-dlp instalado no sistema. Transmissões ao vivo também precisam do ffmpeg.</p><div className="sheet-actions"><Button type="submit" disabled={busy || !youtubeText.trim()}>Adicionar</Button><Button type="button" variant="ghost" onClick={() => setYoutubeOpen(false)}>Cancelar</Button></div></form> : null}</SheetContent></Sheet>
    <Sheet open={!!editor} onOpenChange={(open) => { if (!open) setEditor(null) }}><SheetContent className="local-sheet"><SheetHeader><SheetTitle>{playlists.some((item) => item.id === editor?.id) ? "Editar playlist" : "Nova playlist"}</SheetTitle><SheetDescription>Escolha músicas da sua biblioteca. Nenhum arquivo será copiado.</SheetDescription></SheetHeader>{editor ? <form className="playlist-form" onSubmit={(event) => { event.preventDefault(); savePlaylist() }}><label>Nome<Input autoFocus required maxLength={120} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder="Minha playlist" /></label><Input aria-label="Filtrar músicas da playlist" placeholder="Filtrar músicas…" value={editorSearch} onChange={(event) => setEditorSearch(event.target.value)} /><span className="muted">{editor.trackIds.length} selecionada(s)</span><div className="playlist-choices">{filterTracks(tracks, editorSearch).map((track) => <label key={track.id}><input type="checkbox" checked={editor.trackIds.includes(track.id)} onChange={(event) => setEditor({ ...editor, trackIds: event.target.checked ? [...editor.trackIds, track.id] : editor.trackIds.filter((id) => id !== track.id) })} /><span>{track.title}</span></label>)}{!library.tracks.length ? <p className="muted">Adicione músicas à biblioteca para preencher sua playlist.</p> : null}</div><div className="sheet-actions"><Button type="submit" disabled={!editor.name.trim()}>Salvar playlist</Button><Button type="button" variant="ghost" onClick={() => setEditor(null)}>Cancelar</Button></div>{playlists.some((item) => item.id === editor.id) ? <Button type="button" variant="destructive" onClick={() => { setLibrary((value) => ({ ...value, playlists: value.playlists.filter((item) => item.id !== editor.id) })); setEditor(null); setPlaylistId(""); notify("Playlist removida. Os arquivos de música foram mantidos.") }}><Trash2 />Excluir playlist</Button> : null}</form> : null}</SheetContent></Sheet>
    {tagEditorOpen && selectedTracks.length ? <TagEditor tracks={selectedTracks} hasEdits={selectedIds.some((id) => tagEdits[id])} onSave={saveTagEdit} onRestore={restoreTags} onClose={() => setTagEditorOpen(false)} /> : null}
  </div>
}
