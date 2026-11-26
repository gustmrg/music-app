import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { ArrowDown, ArrowUp, Clock3, Compass, Disc3, EyeOff, FileAudio, Folder, FolderPlus, FolderSync, Heart, Library as LibraryIcon, LayoutGrid, List, Settings2, ListMusic, ListPlus, Maximize2, Minus, Music2, Pencil, Play, Plus, Search, Tags, Trash2, Upload, X, Youtube } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Player, type PlayMode, type PlayerControls } from "@/components/Player"
import { Discover } from "@/components/Discover"
import { Cover } from "@/components/Cover"
import { TrackTable } from "@/components/TrackTable"
import { LibraryFilters, applyFilters, emptyFilters, type Filters } from "@/components/LibraryFilters"
import { SettingsDialog, type SettingsSection } from "@/components/SettingsDialog"
import { TagEditor } from "@/components/TagEditor"
import { QueueSheet } from "@/components/QueueSheet"
import { YoutubeImportSheet } from "@/components/YoutubeImportSheet"
import { PlaylistEditorSheet } from "@/components/PlaylistEditorSheet"
import { albumKey, applyTagEdit, audioAccept, audioExtensions, buildAlbums, emptyLibrary, errorMessage, filterTracks, folderName, normalize, remapTrackIds, type ImportResult, type Library, type Playlist, type Preferences, type TagEdit, type TorrentProgress, type TorrentSaved, type Track } from "@/library"

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
  const playerControls = useRef<PlayerControls>(null)
  const [playing, setPlaying] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("storage")
  const openSettings = (section: SettingsSection) => { setSettingsSection(section); setSettingsOpen(true) }
  const [queueOpen, setQueueOpen] = useState(false)
  const [editor, setEditor] = useState<Playlist | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [youtubeOpen, setYoutubeOpen] = useState(false)
  const filesInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const browserTracks = useRef(new Map<string, Track>())
  const notify = useCallback((message: string) => setNotice(message), [])

  useEffect(() => {
    let active = true
    if (window.desktop) void window.desktop.loadLibrary().then((value) => { if (active) { setLibrary(value); setLoaded(true) } }).catch(() => notify("Não foi possível carregar a biblioteca. Os dados salvos foram preservados; reabra o aplicativo para tentar novamente."))
    return () => { active = false }
  }, [notify])

  const { liked, recent, playlists, volume, discover, tagEdits, viewMode } = library
  // Debounce preference writes (e.g. dragging the volume slider) and flush on
  // unload so rapid edits do not rewrite the library JSON on every frame.
  const pendingPreferences = useRef<Preferences | null>(null)
  const savePreferencesTimer = useRef<number | undefined>(undefined)
  const skipInitialPreferencesSave = useRef(true)
  const flushPreferences = useCallback(() => {
    window.clearTimeout(savePreferencesTimer.current)
    savePreferencesTimer.current = undefined
    const next = pendingPreferences.current
    if (!next || !window.desktop) return
    pendingPreferences.current = null
    void window.desktop.savePreferences(next).catch(() => notify("Não foi possível salvar as alterações da biblioteca neste computador."))
  }, [notify])

  useEffect(() => {
    if (!loaded || !window.desktop) return
    if (skipInitialPreferencesSave.current) { skipInitialPreferencesSave.current = false; return }
    pendingPreferences.current = { liked, recent, playlists, volume, discover, tagEdits, viewMode }
    window.clearTimeout(savePreferencesTimer.current)
    savePreferencesTimer.current = window.setTimeout(flushPreferences, 300)
  }, [loaded, liked, recent, playlists, volume, discover, tagEdits, viewMode, flushPreferences])

  useEffect(() => {
    window.addEventListener("beforeunload", flushPreferences)
    return () => { window.removeEventListener("beforeunload", flushPreferences); flushPreferences() }
  }, [flushPreferences])

  // Tags of older libraries are read in the background after loading.
  useEffect(() => {
    const subscribe = window.desktop?.onLibraryTracks
    if (!subscribe) return
    return subscribe((tracks) => setLibrary((value) => ({ ...value, tracks })))
  }, [])

  // Files renamed or moved inside a watched folder get new ids; favorites,
  // playlists, and the queue follow them before the next preferences save.
  useEffect(() => {
    const subscribe = window.desktop?.onLibraryMoved
    if (!subscribe) return
    return subscribe((moved) => {
      setLibrary((value) => remapTrackIds(value, moved))
      setQueue((ids) => [...new Set(ids.map((id) => Object.hasOwn(moved, id) ? moved[id] : id))])
    })
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
  const selectedPlaylistPositions = useMemo(() => selectedPlaylist ? new Map(selectedPlaylist.trackIds.map((id, index) => [id, index])) : null, [selectedPlaylist])
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

  const missingCount = useMemo(() => tracks.filter((track) => track.missing).length, [tracks])
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
      return folder ?? null
    } catch (error) {
      throw new Error(errorMessage(error, "Não foi possível usar esta pasta."))
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
    setLibrary((value) => ({ ...value, tracks: result.tracks, playlists: result.playlist ? [...value.playlists, result.playlist] : value.playlists, watchedFolders: result.watchedFolders ?? value.watchedFolders }))
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
  const unwatchFolder = async (folder: string) => {
    try {
      const watchedFolders = await window.desktop?.unwatchFolder(folder)
      if (watchedFolders) setLibrary((value) => ({ ...value, watchedFolders }))
      notify(`“${folderName(folder)}” não é mais monitorada. As músicas dela continuam na biblioteca.`)
    } catch { notify("Não foi possível parar de monitorar a pasta.") }
  }
  const removeMissing = async () => {
    if (!window.desktop || !window.confirm(`Remover ${missingCount} música(s) indisponível(is) da biblioteca? Elas também saem das playlists e dos favoritos. Nenhum arquivo é apagado.`)) return
    try {
      const { tracks, removed } = await window.desktop.removeMissing()
      const gone = new Set(removed)
      const keep = (ids: string[]) => ids.filter((id) => !gone.has(id))
      setLibrary((value) => ({ ...value, tracks, liked: keep(value.liked), recent: keep(value.recent), playlists: value.playlists.map((playlist) => ({ ...playlist, trackIds: keep(playlist.trackIds) })), tagEdits: Object.fromEntries(Object.entries(value.tagEdits).filter(([id]) => !gone.has(id))) }))
      setQueue((ids) => keep(ids))
      notify(`${removed.length} música(s) indisponível(is) removida(s) da biblioteca. Nenhum arquivo foi apagado.`)
    } catch { notify("Não foi possível remover as músicas indisponíveis.") }
  }
  const addYoutube = async (text: string, name: string) => {
    if (!window.desktop || !text.trim()) return false
    setBusy(true)
    try {
      const result = await window.desktop.addYoutube(text, name)
      acceptImport(result)
      return true
    } catch (error) {
      notify(errorMessage(error, "Não foi possível ler os links do YouTube."))
      return false
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
    <input ref={filesInput} type="file" accept={audioAccept} multiple hidden onChange={(event) => { importBrowserFiles(event.target.files); event.target.value = "" }} />
    <input ref={folderInput} type="file" multiple hidden {...{ webkitdirectory: "" }} onChange={(event) => { importBrowserFiles(event.target.files); event.target.value = "" }} />
    <aside className="sidebar">
      <div className="brand window-drag"><span className="brand-icon"><Music2 size={20} /></span>Playmio</div>
      <nav aria-label="Navegação principal">{navigationGroups.map((group) => <div key={group.label} className="nav-group" role="group" aria-labelledby={`nav-${group.label}`}><div id={`nav-${group.label}`} className="sidebar-label">{group.label}</div>{group.items.map(({ id, label, icon: Icon }) => <Button key={id} variant="ghost" className={`nav-item ${view === id ? "active" : ""}`} aria-current={view === id ? "page" : undefined} onClick={() => navigate(id)}><Icon size={18} />{label}{id === "library" ? <span className="nav-count">{library.tracks.length}</span> : null}</Button>)}</div>)}</nav>
      <div className="sidebar-label playlist-label"><span>SUAS PLAYLISTS</span><Button variant="ghost" size="icon-xs" aria-label="Criar playlist" disabled={!loaded} onClick={() => openEditor()}><Plus size={15} /></Button></div>
      <div className="sidebar-playlists">{playlists.length ? playlists.map((playlist) => <button key={playlist.id} className={`sidebar-playlist ${playlistId === playlist.id ? "selected" : ""}`} onClick={() => { navigate("playlists"); setPlaylistId(playlist.id) }}><ListMusic size={16} /><span>{playlist.name}</span></button>) : <p className="sidebar-hint">Suas seleções, do seu jeito.</p>}</div>
      <div className="sidebar-bottom"><Button variant="ghost" className="nav-item" onClick={() => openSettings("storage")}><Settings2 size={18} />Configurações</Button></div>
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
        <div hidden={view !== "discover"}><Discover settings={discover} progress={torrentProgress} saveFolder={library.saveFolder} onSaveSettings={(next) => setLibrary((value) => ({ ...value, discover: next }))} onPlay={(tracks, index) => { registerDiscoverTracks(tracks); play(tracks[index].id, tracks.map((track) => track.id)) }} onStopped={(infoHash) => {
          const stopped = new Set(discoverTracks.filter((track) => !infoHash || track.infoHash === infoHash).map((track) => track.id))
          setDiscoverTracks((tracks) => tracks.filter((track) => !stopped.has(track.id)))
          setQueue((ids) => ids.filter((id) => !stopped.has(id)))
          setSelection((value) => stopped.has(value.id) ? { id: "", request: value.request + 1 } : value)
          setTorrentProgress((items) => new Map([...items].filter(([key]) => infoHash && key !== infoHash)))
        }} notify={notify} /></div>{view !== "discover" ? <>
        <div className="page-heading">{selectedAlbum ? <Cover cover={selectedAlbum.cover} size="large" album /> : null}<div><p className="eyebrow">{selectedPlaylist ? "PLAYLIST LOCAL" : selectedAlbum ? "ÁLBUM" : "DO SEU COMPUTADOR"}</p><h1>{title}</h1><p className="page-subtitle">{busy ? "Lendo arquivos…" : !loaded ? "Carregando biblioteca…" : showFolders ? `${folders.length} pasta(s) com músicas` : showPlaylists ? `${playlists.length} playlist(s) salvas` : showAlbums ? `${albums.length} álbum(ns)` : selectedAlbum ? [selectedAlbum.artist, selectedAlbum.year, `${visibleTracks.length} música(s)`, albumDuration ? `${albumDuration} min` : ""].filter(Boolean).join(" · ") : `${visibleTracks.length} música(s)`}</p></div>
          <div className="page-actions">{showPlaylists ? <><Button disabled={!loaded} onClick={() => openEditor()}><Plus />Nova playlist</Button>{window.desktop ? <Button variant="outline" disabled={busy || !loaded} onClick={() => void importLocal("playlist")}><Upload />Importar M3U</Button> : null}</> : !showCollection ? <><div className="view-toggle" role="group" aria-label="Visualização das músicas"><Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" aria-label="Visualização em lista" aria-pressed={viewMode === "list"} onClick={() => setLibrary((value) => ({ ...value, viewMode: "list" }))}><List /></Button><Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" aria-label="Visualização em grade" aria-pressed={viewMode === "grid"} onClick={() => setLibrary((value) => ({ ...value, viewMode: "grid" }))}><LayoutGrid /></Button></div><Button disabled={!visibleTracks.length} onClick={() => play(visibleTracks[0].id, visibleTracks.map((track) => track.id))}><Play fill="currentColor" />Reproduzir</Button>{selectedPlaylist ? <><Button variant="outline" onClick={() => openEditor(selectedPlaylist)}><Pencil />Editar</Button>{window.desktop ? <Button variant="outline" disabled={busy} onClick={() => void exportPlaylist()}><Upload />Exportar</Button> : null}</> : <Button variant="outline" disabled={!visibleTracks.length} onClick={() => openEditor(undefined, visibleTracks.map((track) => track.id))}><Plus />Salvar playlist</Button>}</> : showFolders && missingCount ? <Button variant="outline" disabled={busy} onClick={() => void removeMissing()}><Trash2 />Remover {missingCount} indisponível(is)</Button> : null}</div>
        </div>
        {view === "library" && tracks.length ? <LibraryFilters tracks={tracks} filters={filters} onChange={setFilters} /> : null}
        {showFolders && window.desktop && library.watchedFolders.length ? <section className="watched-folders" aria-labelledby="watched-folders-title">
          <h2 id="watched-folders-title"><FolderSync size={16} />Pastas monitoradas</h2>
          <p className="muted">Músicas adicionadas, alteradas ou removidas nestas pastas atualizam a biblioteca sozinhas. Arquivos removidos ficam marcados como indisponíveis.</p>
          <ul>{library.watchedFolders.map((watched) => <li key={watched}><span title={watched}>{watched}</span><Button variant="ghost" size="sm" aria-label={`Parar de monitorar ${watched}`} onClick={() => void unwatchFolder(watched)}><EyeOff />Parar de monitorar</Button></li>)}</ul>
        </section> : null}
        {showFolders ? <div className="collection-grid">{visibleFolders.map(([name, count]) => <button className="collection-card" key={name} onClick={() => { setFolder(name); setSearch("") }}><Folder size={30} /><strong>{folderName(name)}</strong><span title={name}>{name || "Arquivos avulsos"}</span><small>{count} música(s)</small></button>)}</div> : showPlaylists ? <div className="collection-grid">{visiblePlaylists.map((playlist) => <button className="collection-card" key={playlist.id} onClick={() => { setPlaylistId(playlist.id); setSearch("") }}><ListMusic size={30} /><strong>{playlist.name}</strong><small>{playlist.trackIds.length} música(s)</small></button>)}</div> : showAlbums ? <div className="collection-grid album-grid">{visibleAlbums.map((album) => <button className="collection-card album-card" key={album.key} onClick={() => { setAlbumId(album.key); setSearch(""); setSelected(new Set()) }}><Cover cover={album.cover} size="large" album /><strong title={album.title}>{album.title}</strong><span>{album.artist || "Artista desconhecido"}</span><small>{[album.year, `${album.trackIds.length} música(s)`].filter(Boolean).join(" · ")}</small></button>)}</div> : visibleTracks.length ? <TrackTable tracks={visibleTracks} currentId={selection.id} playing={playing} viewMode={viewMode} likedIds={likedIds} selected={selected} onSelectionChange={setSelected} onPlay={(id) => { if (id === selection.id) playerControls.current?.toggle(); else play(id, visibleTracks.map((item) => item.id)) }} onToggleLike={toggleLike} albumNumbering={!!selectedAlbum} extraActions={selectedPlaylist && selectedPlaylistPositions ? (track) => { const position = selectedPlaylistPositions.get(track.id) ?? -1; return <><Button variant="ghost" size="icon-xs" disabled={position <= 0} aria-label={`Mover ${track.title} para cima`} onClick={() => reorder(track.id, -1)}><ArrowUp /></Button><Button variant="ghost" size="icon-xs" disabled={position === -1 || position === selectedPlaylist.trackIds.length - 1} aria-label={`Mover ${track.title} para baixo`} onClick={() => reorder(track.id, 1)}><ArrowDown /></Button></> } : undefined} /> : null}
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
    {settingsOpen ? <SettingsDialog section={settingsSection} onSectionChange={setSettingsSection} discover={discover} onSaveDiscover={(discover) => setLibrary((value) => ({ ...value, discover }))} open={settingsOpen} onOpenChange={setSettingsOpen} saveFolder={library.saveFolder} loaded={loaded} onChooseSaveFolder={chooseSaveFolder} /> : null}
    <Player ref={playerControls} onPlayingChange={setPlaying} track={trackMap.get(selection.id)} request={selection.request} liked={likedIds.has(selection.id)} volume={volume} mode={mode} torrentStatus={(() => { const track = trackMap.get(selection.id); return track?.source === "torrent" && track.infoHash ? torrentProgress.get(track.infoHash) : undefined })()} onVolume={(value) => setLibrary((previous) => ({ ...previous, volume: value }))} onMode={setMode} onLike={() => toggleLike(selection.id)} onNext={next} onPrevious={() => { if (queue.length) play(queue[(queue.indexOf(selection.id) - 1 + queue.length) % queue.length]) }} onQueue={() => setQueueOpen(true)} onStarted={started} onError={notify} onSave={() => void saveCurrentTorrentTrack()} />
    <QueueSheet
      open={queueOpen}
      onOpenChange={setQueueOpen}
      tracks={fromIds(queue)}
      currentId={selection.id}
      onPlay={(id) => play(id)}
      onRemove={(id) => {
        setQueue((ids) => ids.filter((item) => item !== id))
        if (selection.id === id) setSelection((value) => ({ id: "", request: value.request + 1 }))
      }}
      onClear={() => { setQueue([]); setSelection((value) => ({ id: "", request: value.request + 1 })) }}
      onSaveAsPlaylist={() => { setQueueOpen(false); openEditor(undefined, queue) }}
    />
    <YoutubeImportSheet open={youtubeOpen} onOpenChange={setYoutubeOpen} busy={busy} onSubmit={addYoutube} />
    <PlaylistEditorSheet
      playlist={editor}
      isExisting={playlists.some((item) => item.id === editor?.id)}
      tracks={tracks}
      onChange={setEditor}
      onSave={savePlaylist}
      onDelete={(id) => {
        setLibrary((value) => ({ ...value, playlists: value.playlists.filter((item) => item.id !== id) }))
        setEditor(null)
        setPlaylistId("")
        notify("Playlist removida. Os arquivos de música foram mantidos.")
      }}
      onClose={() => setEditor(null)}
    />
    {tagEditorOpen && selectedTracks.length ? <TagEditor tracks={selectedTracks} hasEdits={selectedIds.some((id) => tagEdits[id])} onSave={saveTagEdit} onRestore={restoreTags} onClose={() => setTagEditorOpen(false)} /> : null}
  </div>
}
