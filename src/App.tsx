import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Download,
  Grid2X2,
  Heart,
  ListMusic,
  Mail,
  Maximize2,
  MessageCircle,
  Mic2,
  Minus,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  Repeat2,
  Search,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
  UserRound,
  UsersRound,
  Volume2,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Slider } from "@/components/ui/slider"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  ARTISTS,
  BANNERS,
  CHART,
  LOGIN_SUBS,
  NEW_TRACK_IDS,
  OFFICIAL_PLAYLISTS,
  RADIOS,
  SEARCH_HINTS,
  SQUARE_DAILY,
  SQUARE_RECOMMEND,
  TABS,
  TRACKS,
  fmtCount,
  fmtDur,
  genrePlaylists,
} from "../js/data.js"
import { coverArt, palOf } from "../js/art.js"
import { playAudio, setAudioVolume, stopAudio } from "./audio"

type Track = {
  id: number
  title: string
  artists: string[]
  dur: number
  pal: number
  seed?: number
  hires?: boolean
  trial?: boolean
  rank?: number
}

type Playlist = { id: string; seed: number; count: number; title: string; pal: number; words?: string[] }
type Mode = "order" | "loop" | "shuffle"

const tracks = TRACKS as Track[]
const newTracks = NEW_TRACK_IDS.map((id: number) => tracks.find((track) => track.id === id)!)

const navItems = [
  { view: "featured", label: "Featured", icon: Grid2X2 },
  { view: "radio", label: "Radio", icon: Radio },
  { view: "follow", label: "Following", icon: UsersRound },
  { view: "liked", label: "Liked Music", icon: Heart },
  { view: "recent", label: "Recently Played", icon: Clock3 },
  { view: "download", label: "Downloads", icon: Download },
]

function IconButton({ label, children, onClick, className = "" }: { label: string; children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label={label} onClick={onClick} className={className} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="section-head">{children}<ChevronRight size={14} className="chev" /></div>
}

function PlaylistCard({ playlist, onPlay }: { playlist: Playlist; onPlay: () => void }) {
  return (
    <button className="pl-card text-left" onClick={onPlay}>
      <span className="cover-wrap">
        <img src={coverArt(playlist.seed, playlist.pal, { text: playlist.words })} alt="" />
        <span className="shade" />
        <span className="play-count"><Volume2 size={13} />{fmtCount(playlist.count)}</span>
        <span className="hover-play"><Play size={14} fill="currentColor" /></span>
      </span>
      <span className="title-block" style={{ background: palOf(playlist.pal).tint }}><span>{playlist.title}</span></span>
    </button>
  )
}

function TrackRow({ track, current, liked, onPlay, onLike }: { track: Track; current: boolean; liked: boolean; onPlay: () => void; onLike: () => void }) {
  return (
    <div className={`track-row text-left ${current ? "playing-row" : ""}`} role="button" tabIndex={0} onClick={onPlay} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onPlay() }}>
      <span className="t-cover">
        <img src={coverArt(track.seed ?? track.id * 13, track.pal)} alt="" />
        <span className="cover-play">{current ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</span>
      </span>
      <span className="t-meta">
        <span className="t-title-row">
          <span className="t-title">{track.title}</span>
          {track.hires ? <Badge variant="outline" className="badge hires">Hi-Res</Badge> : null}
          {track.trial ? <Badge variant="outline" className="badge trial">PREVIEW</Badge> : null}
        </span>
        <span className="t-artist">{track.artists.join(" / ")}</span>
      </span>
      <span className="t-actions">
        <Download size={16} />
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={liked ? "Unlike" : "Like"}
          className={liked ? "liked" : ""}
          onClick={(event) => { event.stopPropagation(); onLike() }}
        >
          <Heart size={16} fill={liked ? "currentColor" : "none"} />
        </Button>
        <MoreHorizontal size={16} />
      </span>
    </div>
  )
}

function RadioGrid() {
  return (
    <div className="radio-grid">
      {RADIOS.map((item: { id: string; seed: number; pal: number; count: number; name: string; host: string }) => (
        <button className="radio-card text-left" key={item.id}>
          <span className="r-cover"><img src={coverArt(item.seed, item.pal)} alt="" /></span>
          <span className="r-name">{item.name}</span>
          <span className="r-sub">{item.host} · {fmtCount(item.count * 10)} plays</span>
        </button>
      ))}
    </div>
  )
}

export default function App() {
  const [view, setView] = useState("featured")
  const [tab, setTab] = useState("Featured")
  const [chip, setChip] = useState("For You")
  const [slide, setSlide] = useState(0)
  const [queue, setQueue] = useState<Track[]>([])
  const [current, setCurrent] = useState<Track | null>(null)
  const [playing, setPlaying] = useState(false)
  const [mode, setMode] = useState<Mode>("order")
  const [liked, setLiked] = useState<Set<number>>(() => new Set())
  const [history, setHistory] = useState<Track[]>([])
  const [progress, setProgress] = useState(0)
  const [volume, setVolume] = useState(0.7)
  const [queueOpen, setQueueOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [hintIndex, setHintIndex] = useState(0)
  const [loginIndex, setLoginIndex] = useState(0)
  const [toast, setToast] = useState("")
  const toastTimer = useRef<number | null>(null)
  const contentRef = useRef<HTMLElement>(null)

  const notify = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(""), 1900)
  }, [])

  const playTrack = useCallback((track: Track, nextQueue?: Track[]) => {
    setQueue((existing) => nextQueue ? [...nextQueue] : existing.some((item) => item.id === track.id) ? existing : [track, ...existing])
    setCurrent(track)
    setProgress(0)
    setPlaying(true)
    setHistory((existing) => [track, ...existing.filter((item) => item.id !== track.id)].slice(0, 20))
    playAudio(track)
  }, [])

  const toggleLike = useCallback((id: number) => {
    setLiked((existing) => {
      const next = new Set(existing)
      const wasLiked = next.delete(id)
      if (!wasLiked) next.add(id)
      notify(wasLiked ? "Removed from Liked Music" : "Added to Liked Music")
      return next
    })
  }, [notify])

  const nextTrack = useCallback((step = 1) => {
    if (!current || queue.length === 0) return
    let index = queue.findIndex((track) => track.id === current.id)
    if (mode === "shuffle") {
      let next = index
      while (queue.length > 1 && next === index) next = Math.floor(Math.random() * queue.length)
      index = next
    } else {
      index = (index + step + queue.length) % queue.length
    }
    playTrack(queue[index])
  }, [current, mode, playTrack, queue])

  useEffect(() => {
    const carousel = window.setInterval(() => setSlide((value) => (value + 1) % BANNERS.length), 5000)
    const hints = window.setInterval(() => setHintIndex((value) => (value + 1) % SEARCH_HINTS.length), 4200)
    const login = window.setInterval(() => setLoginIndex((value) => (value + 1) % LOGIN_SUBS.length), 5000)
    return () => { window.clearInterval(carousel); window.clearInterval(hints); window.clearInterval(login) }
  }, [])

  useEffect(() => {
    if (!playing || !current) return
    const timer = window.setInterval(() => {
      setProgress((value) => {
        if (value + 1 < current.dur) return value + 1
        if (mode === "loop") { playAudio(current); return 0 }
        nextTrack(1)
        return 0
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [current, mode, nextTrack, playing])

  useEffect(() => () => stopAudio(), [])

  const selectView = (nextView: string, nextTab?: string) => {
    setView(nextView)
    if (nextTab) setTab(nextTab)
    contentRef.current?.scrollTo({ top: 0 })
  }

  const likedTracks = useMemo(() => tracks.filter((track) => liked.has(track.id)), [liked])

  const content = (() => {
    const rows = (items: Track[], single = false) => (
      <div className="track-grid" style={single ? { gridTemplateColumns: "1fr" } : undefined}>
        {items.map((track) => <TrackRow key={track.id} track={track} current={current?.id === track.id} liked={liked.has(track.id)} onPlay={() => playTrack(track, items)} onLike={() => toggleLike(track.id)} />)}
      </div>
    )
    const cards = (items: Playlist[]) => <div className="card-grid">{items.map((playlist) => <PlaylistCard key={playlist.id} playlist={playlist} onPlay={() => playTrack(newTracks[playlist.seed % newTracks.length], newTracks)} />)}</div>

    if (view === "featured") return <>
      <div className="carousel">
        <div className="carousel-track" style={{ transform: `translateX(-${slide * 100}%)` }}>
          {BANNERS.map((pair: Array<{ id: string; seed: number; pal: number; title: string; sub: string; cta: string | null; tag: string }>) => (
            <div className="banner-pair" key={pair[0].id}>{pair.map((banner) => <button className="banner" key={banner.id} onClick={() => notify(`${banner.title} is ready to play`)}><img src={coverArt(banner.seed, banner.pal, { banner: true, text: [banner.title], sub: banner.sub, cta: banner.cta })} alt={banner.title} /><span className="banner-tag">{banner.tag}</span></button>)}</div>
          ))}
        </div>
      </div>
      <div className="carousel-dots">{BANNERS.map((_: unknown, index: number) => <button aria-label={`Show banner ${index + 1}`} className={index === slide ? "on" : ""} key={index} onClick={() => setSlide(index)} />)}</div>
      <SectionTitle>Official Playlists</SectionTitle>{cards(OFFICIAL_PLAYLISTS as Playlist[])}
      <SectionTitle>New Music</SectionTitle>{rows(newTracks)}
      <SectionTitle>Featured Shows</SectionTitle><RadioGrid />
    </>

    if (view === "Playlists") {
      const chips = ["For You", "Official", "Mandarin", "Rock", "Folk", "EDM", "Easy Listening"]
      return <>
        <div className="chip-row">{chips.map((item) => <Button key={item} variant={chip === item ? "default" : "secondary"} size="sm" className={`chip ${chip === item ? "active" : ""}`} onClick={() => setChip(item)}>{item}</Button>)}<Button variant="secondary" size="sm" className="chip">More categories <ChevronDown size={12} /></Button></div>
        <SectionTitle>Made For You</SectionTitle>{cards(SQUARE_RECOMMEND as Playlist[])}
        <SectionTitle>Fresh Daily Picks</SectionTitle>{cards(SQUARE_DAILY as Playlist[])}
      </>
    }
    if (view === "Charts") return <>
      <SectionTitle>Top Rising</SectionTitle>
      <div className="chart-wrap">
        <div className="chart-side"><div className="chart-cover"><img src={coverArt(71, 6)} alt="Top Rising" /></div><Button className="play-all" onClick={() => playTrack((CHART as Track[])[0], CHART as Track[])}><Play size={15} fill="currentColor" /> Play All</Button><div className="chart-up">Updated daily · Sorted by live popularity<br />{CHART.length} songs</div></div>
        <div className="chart-list">{(CHART as Track[]).map((track, index) => <button className="chart-item" key={track.id} onClick={() => playTrack(track, CHART as Track[])}><span className={`idx ${index < 3 ? "top" : ""}`}>{String(index + 1).padStart(2, "0")}</span><span className="c-title">{track.title}</span><span className="c-artist">{track.artists.join(" / ")}</span></button>)}</div>
      </div>
    </>
    if (view === "Artists") return <><SectionTitle>Top Artists</SectionTitle><div className="artist-grid">{ARTISTS.map((artist: { id: string; seed: number; pal: number; name: string; fans: string }) => <button className="artist-card" key={artist.id}><span className="a-cover"><img src={coverArt(artist.seed, artist.pal)} alt="" /></span><span className="a-name">{artist.name}</span><span className="a-sub">{artist.fans} fans</span></button>)}</div></>
    if (view === "radio" || view === "follow") return <><SectionTitle>{view === "radio" ? "Popular Radio" : "Artists I Follow"}</SectionTitle><RadioGrid /></>
    if (view === "liked" || view === "recent") {
      const items = view === "liked" ? likedTracks : history.length ? history : tracks.slice(0, 4)
      return <div className="list-view"><div className="list-head"><h2>{view === "liked" ? "Liked Music" : "Recently Played"}</h2><span className="sub">{items.length} songs</span></div>{items.length ? rows(items, true) : <div className="empty-hint">Nothing here yet — explore the Featured tab</div>}</div>
    }
    if (view === "download") return <div className="list-view"><div className="list-head"><h2>Downloads</h2><span className="sub">Sign in to download songs</span></div><div className="empty-hint">No downloads yet</div></div>
    return <><SectionTitle>{view} Essentials</SectionTitle>{cards(genrePlaylists(view) as Playlist[])}</>
  })()

  const togglePlaying = () => {
    if (!current) return playTrack(newTracks[0], newTracks)
    setPlaying((value) => {
      if (value) stopAudio(); else playAudio(current)
      return !value
    })
  }

  return (
    <TooltipProvider>
      <div id="app">
        <aside className="sidebar">
          <div className="logo-row window-drag"><span className="logo-glyph"><Music2 size={15} fill="currentColor" /></span><span className="logo-text">Cloud Music</span></div>
          <nav className="side-nav">
            {navItems.map((item, index) => {
              const Icon = item.icon
              return <Button key={item.view} variant="ghost" className={`nav-item ${view === item.view ? "active" : ""} ${index === 3 ? "nav-group-start" : ""}`} onClick={() => selectView(item.view)}><Icon size={17} /><span>{item.label}</span>{item.view === "liked" ? <ChevronRight size={12} className="nav-badge" /> : null}</Button>
            })}
          </nav>
          <div className="side-playlists"><div className="side-playlists-head"><span className="muted">Created Playlists <em>1</em></span><IconButton label="New playlist" className="icon-round"><Plus size={12} /></IconButton></div><button className="side-pl-item" onClick={() => { playTrack(tracks[2], tracks.slice(0, 6)); notify('Now playing "My Music Pocket"') }}><span className="side-pl-cover" /><span className="side-pl-name">My Music Pocket</span></button></div>
          <button className="login-card text-left" onClick={() => notify("Account sign-in is coming next")}><span className="login-main">Sign in to Cloud Music <ChevronRight size={11} /></span><span className="login-sub"><Clock3 size={12} /><span>{LOGIN_SUBS[loginIndex]}</span></span></button>
        </aside>

        <main className="main">
          <header className="topbar window-drag" onDoubleClick={() => window.desktop?.toggleMaximize()}>
            <div className="topbar-left">
              <IconButton label="Back" className="icon-circle" onClick={() => selectView("featured", "Featured")}><ArrowLeft size={14} /></IconButton>
              <IconButton label="Forward" className="icon-circle dim" onClick={() => notify("No more history")}><ArrowRight size={14} /></IconButton>
              <div className={`search-pill ${search ? "has-text" : ""}`}><Search size={15} className="search-ico" /><span className="search-flame">🔥</span><Input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && search.trim()) notify(`Sign in to search "${search.trim()}"`) }} /><span className="search-hint">Trending: {SEARCH_HINTS[hintIndex]}</span></div>
              <IconButton label="Identify song" className="icon-circle"><Mic2 size={15} /></IconButton>
            </div>
            <div className="topbar-right">
              <button className="user-chip" onClick={() => notify("Account sign-in is coming next")}><span className="avatar-circle"><CircleUserRound size={20} /></span><span className="user-name">Sign In</span><Badge variant="secondary" className="crown-badge"><Sparkles size={11} />VIP</Badge><ChevronDown size={12} /></button>
              <IconButton label="Messages" className="icon-plain"><Mail size={17} /></IconButton>
              <IconButton label="Settings" className="icon-plain"><Settings size={17} /></IconButton>
              <IconButton label="Theme" className="icon-plain"><Sparkles size={17} /></IconButton>
              {window.desktop ? <div className="window-controls"><IconButton label="Minimize" className="icon-plain" onClick={() => window.desktop?.minimize()}><Minus size={17} /></IconButton><IconButton label="Maximize" className="icon-plain" onClick={() => window.desktop?.toggleMaximize()}><Maximize2 size={15} /></IconButton><IconButton label="Close" className="icon-plain close" onClick={() => window.desktop?.close()}><X size={17} /></IconButton></div> : null}
            </div>
          </header>
          <nav className="tabs">{TABS.map((item: string) => <button key={item} className={`tab ${tab === item ? "active" : ""}`} onClick={() => selectView(item === "Featured" ? "featured" : item, item)}>{item}</button>)}<button className="tab" onClick={() => notify("More categories coming soon")}>More <ChevronDown size={11} /></button></nav>
          <section className="content" ref={contentRef}>{content}</section>
        </main>

        <Sheet open={queueOpen} onOpenChange={setQueueOpen}>
          <SheetContent side="right" className="queue-sheet" showCloseButton={false}>
            <SheetHeader className="queue-head"><div><SheetTitle>Play Queue <em>{queue.length}</em></SheetTitle><SheetDescription className="sr-only">Songs queued for playback</SheetDescription></div><span className="queue-actions"><Button variant="ghost" size="sm" onClick={() => notify(queue.length ? `Saved ${queue.length} songs` : "Queue is empty")}><Heart size={13} /> Save All</Button><Button variant="ghost" size="sm" onClick={() => { setQueue([]); setCurrent(null); setPlaying(false); stopAudio(); notify("Queue cleared") }}><Trash2 size={13} /> Clear</Button></span></SheetHeader>
            <div className="queue-list">{queue.length ? queue.map((track) => <button className={`queue-item ${current?.id === track.id ? "playing" : ""}`} key={track.id} onClick={() => playTrack(track)}><span className="q-cover"><img src={coverArt(track.seed ?? track.id * 13, track.pal)} alt="" /><span className="q-state"><Pause size={15} fill="currentColor" /></span></span><span className="q-meta"><span className="q-title-row"><span className="q-title">{track.title}</span>{track.hires ? <Badge variant="outline" className="badge hires">Hi-Res</Badge> : null}</span><span className="q-artist">{track.artists.join(" / ")}</span></span><span className="q-dur">{fmtDur(track.dur)}</span></button>) : <div className="queue-empty">Your queue is empty</div>}</div>
          </SheetContent>
        </Sheet>

        <footer className={`player-bar ${current ? "show" : ""}`}>
          <Slider className="progress-slider" min={0} max={current?.dur ?? 1} step={1} value={[progress]} onValueChange={(value) => setProgress(Array.isArray(value) ? value[0] : value)} aria-label="Track progress" />
          <div className="player-left"><button className={`player-cover ${playing ? "spin" : ""}`} style={{ backgroundImage: current ? `url(${coverArt(current.seed ?? current.id * 13, current.pal, { vinyl: true })})` : undefined }} onClick={() => notify("Track details are coming next")} /><div className="player-meta"><span className="player-title">{current?.title ?? "—"}</span><span className="player-artist">{current?.artists.join(" / ")}</span></div><Button variant="ghost" size="sm" className={`pl-mini ${current && liked.has(current.id) ? "liked" : ""}`} onClick={() => current && toggleLike(current.id)}><Heart size={16} fill={current && liked.has(current.id) ? "currentColor" : "none"} /><em>100k+</em></Button><Button variant="ghost" size="sm" className="pl-mini" onClick={() => notify(`999+ hot comments on "${current?.title ?? ""}"`)}><MessageCircle size={16} /><em>999+</em></Button></div>
          <div className="player-center"><IconButton label="Play mode" className="pl-ctl" onClick={() => { const next = mode === "order" ? "loop" : mode === "loop" ? "shuffle" : "order"; setMode(next); notify(next === "order" ? "Sequential play" : next === "loop" ? "Loop one" : "Shuffle play") }}>{mode === "shuffle" ? <Shuffle size={18} /> : <Repeat2 size={18} />}</IconButton><IconButton label="Previous" className="pl-ctl" onClick={() => nextTrack(-1)}><SkipBack size={20} fill="currentColor" /></IconButton><IconButton label={playing ? "Pause" : "Play"} className="play-toggle" onClick={togglePlaying}>{playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</IconButton><IconButton label="Next" className="pl-ctl" onClick={() => nextTrack(1)}><SkipForward size={20} fill="currentColor" /></IconButton><IconButton label="Play queue" className="pl-ctl" onClick={() => setQueueOpen(true)}><ListMusic size={18} /></IconButton></div>
          <div className="player-right"><Badge variant="outline" className="quality-badge">ULTRA</Badge><BarChart3 size={17} /><span className="volume-wrap"><Volume2 size={17} /><Slider className="volume-control" min={0} max={1} step={0.01} value={[volume]} onValueChange={(value) => { const next = Array.isArray(value) ? value[0] : value; setVolume(next); setAudioVolume(next) }} aria-label="Volume" /></span><MoreHorizontal size={17} /></div>
        </footer>
        <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
      </div>
    </TooltipProvider>
  )
}
