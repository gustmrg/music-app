/* ── App logic: rendering, player, queue, audio synth ── */
"use strict";

const $ = (s) => document.querySelector(s);
const content = $("#content");
const state = {
  view: "featured",
  tab: "Featured",
  chip: "For You",
  queue: [],
  current: null,     // track object
  playing: false,
  mode: "order",     // order | loop | shuffle
  liked: new Set(),
  progress: 0,       // seconds
  volume: 0.7,
  slide: 0,
};

/* ═══════════ Tabs ═══════════ */
function renderTabs() {
  const tabs = $("#tabs");
  tabs.innerHTML = "";
  TABS.forEach((t) => {
    const el = document.createElement("a");
    el.className = "tab" + (state.tab === t ? " active" : "");
    el.textContent = t;
    el.onclick = () => { state.tab = t; state.view = t === "Featured" ? "featured" : t; renderTabs(); renderView(); };
    tabs.appendChild(el);
  });
  const more = document.createElement("a");
  more.className = "tab";
  more.innerHTML = `More <svg class="chev" viewBox="0 0 24 24" width="11" height="11"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="m6 9 6 6 6-6"/></svg>`;
  more.onclick = () => toast("More categories coming soon");
  tabs.appendChild(more);
}

/* ═══════════ Views ═══════════ */
function renderView() {
  stopCarousel();
  content.scrollTop = 0;
  const v = state.view;
  if (v === "featured") return renderFeatured();
  if (v === "Playlists") return renderSquare();
  if (v === "Charts") return renderChart();
  if (v === "Artists") return renderArtists();
  if (v === "liked") return renderLiked();
  if (v === "recent") return renderRecent();
  if (v === "download") return renderDownloads();
  if (v === "radio" || v === "follow") return renderRadioLike(v);
  // genre-ish tabs: VIP/Classics/Western/Workout/Cantonese/Driving → square-like grid
  return renderGenre(v);
}

function sectionHead(text) {
  return `<div class="section-head">${text}
    <svg class="chev" viewBox="0 0 24 24" width="13" height="13"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" d="m9 6 6 6-6 6"/></svg></div>`;
}

function plCard(c, words) {
  return `<div class="pl-card" data-pl="${c.id}">
    <div class="cover-wrap">
      <img src="${coverArt(c.seed, c.pal, { text: words })}" alt="">
      <div class="shade"></div>
      <span class="play-count"><svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M4 10v4h3l4.5 4V6L7 10H4zm12.5 2a3.7 3.7 0 0 0-2-3.3v6.6a3.7 3.7 0 0 0 2-3.3zm-2-8v2.1a6 6 0 0 1 0 11.8V20a8 8 0 0 0 0-16z"/></svg>${fmtCount(c.count)}</span>
      <span class="hover-play"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M8 5.5v13l11-6.5z"/></svg></span>
    </div>
    <div class="title-block" style="background:${palOf(c.pal).tint}"><span>${c.title}</span></div>
  </div>`;
}

/* ── Featured ── */
let carouselTimer = null;
function renderFeatured() {
  content.innerHTML = `
    <div class="carousel" id="carousel"><div class="carousel-track" id="carouselTrack"></div></div>
    <div class="carousel-dots" id="carouselDots"></div>
    ${sectionHead("Official Playlists")}
    <div class="card-grid">${OFFICIAL_PLAYLISTS.map((c) => plCard(c, c.words)).join("")}</div>
    ${sectionHead("New Music")}
    <div class="track-grid">${NEW_TRACK_IDS.map((id) => trackRow(TRACKS.find((t) => t.id === id))).join("")}</div>
    ${sectionHead("Featured Shows")}
    <div class="radio-grid">${RADIOS.map(radioCard).join("")}</div>
  `;
  buildCarousel();
  bindTrackRows();
}

function buildCarousel() {
  const track = $("#carouselTrack"), dots = $("#carouselDots");
  track.innerHTML = BANNERS.map((pair) => `
    <div class="banner-pair">${pair.map((b) => `
      <div class="banner" data-banner="${b.id}">
        <img src="${coverArt(b.seed, b.pal, { banner: true, text: [b.title], sub: b.sub, cta: b.cta })}" alt="">
        <span class="banner-tag">${b.tag}</span>
      </div>`).join("")}
    </div>`).join("");
  dots.innerHTML = BANNERS.map((_, i) => `<i class="${i === state.slide ? "on" : ""}" data-slide="${i}"></i>`).join("");
  dots.querySelectorAll("i").forEach((d) => d.onclick = () => { state.slide = +d.dataset.slide; updateSlide(); });
  updateSlide();
  carouselTimer = setInterval(() => { state.slide = (state.slide + 1) % BANNERS.length; updateSlide(); }, 5000);
}
function updateSlide() {
  const track = $("#carouselTrack"); if (!track) return;
  track.style.transform = `translateX(-${state.slide * 100}%)`;
  $("#carouselDots")?.querySelectorAll("i").forEach((d, i) => d.classList.toggle("on", i === state.slide));
}
function stopCarousel() { if (carouselTimer) { clearInterval(carouselTimer); carouselTimer = null; } }

function trackRow(t) {
  const playingRow = state.current?.id === t.id;
  const coverIcon = playingRow
    ? '<svg viewBox="0 0 24 24" width="17" height="17"><path fill="currentColor" d="M7 5.5h3.4v13H7zM13.6 5.5H17v13h-3.4z"/></svg>'
    : '<svg viewBox="0 0 24 24" width="17" height="17"><path fill="currentColor" d="M8 5.5v13l11-6.5z"/></svg>';
  return `<div class="track-row ${playingRow ? "playing-row" : ""}" data-track="${t.id}">
    <div class="t-cover"><img src="${coverArt(t.seed ?? t.id * 13, t.pal)}" alt=""><div class="cover-play">${coverIcon}</div></div>
    <div class="t-meta">
      <div class="t-title-row">
        <span class="t-title">${t.title}</span>
        ${t.hires ? '<span class="badge hires">Hi-Res</span>' : ""}
        ${t.trial ? '<span class="badge trial">PREVIEW</span>' : ""}
      </div>
      <div class="t-artist">${t.artists.join(" / ")}</div>
    </div>
    <div class="t-actions">
      <button title="Download"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M11 3h2v8.2l2.6-2.6 1.4 1.4-5 5-5-5 1.4-1.4L11 11.2zM4 19h16v2H4z"/></svg></button>
      <button title="Like" class="act-like ${state.liked.has(t.id) ? "liked" : ""}"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="${state.liked.has(t.id) ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" d="M12 20s-6.8-4.3-8.8-8.2A5 5 0 0 1 12 6.6 5 5 0 0 1 20.8 11.8C18.8 15.7 12 20 12 20z"/></svg></button>
      <button title="More"><svg viewBox="0 0 24 24" width="16" height="16"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg></button>
    </div>
  </div>`;
}
function bindTrackRows() {
  content.querySelectorAll(".track-row").forEach((row) => {
    row.onclick = (e) => {
      const likeBtn = e.target.closest(".act-like");
      const id = +row.dataset.track;
      if (likeBtn) { toggleLike(id, likeBtn); e.stopPropagation(); return; }
      const t = TRACKS.find((x) => x.id === id);
      playTrack(t, NEW_TRACK_IDS.map((i) => TRACKS.find((x) => x.id === i)));
    };
  });
}

function radioCard(r) {
  return `<div class="radio-card">
    <div class="r-cover"><img src="${coverArt(r.seed, r.pal)}" alt=""></div>
    <div class="r-name">${r.name}</div>
    <div class="r-sub">${r.host} · ${fmtCount(r.count * 10)} plays</div>
  </div>`;
}

/* ── Playlists square ── */
function renderSquare() {
  const chips = ["For You", "Official", "Mandarin", "Rock", "Folk", "EDM", "Easy Listening"];
  content.innerHTML = `
    <div class="chip-row">
      ${chips.map((c) => `<a class="chip ${state.chip === c ? "active" : ""}" data-chip="${c}">${c}</a>`).join("")}
      <a class="chip">More categories <svg class="chev" viewBox="0 0 24 24" width="10" height="10"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="m6 9 6 6 6-6"/></svg></a>
    </div>
    ${sectionHead("Made For You")}
    <div class="card-grid">${SQUARE_RECOMMEND.map((c) => plCard(c)).join("")}</div>
    ${sectionHead("Fresh Daily Picks")}
    <div class="card-grid">${SQUARE_DAILY.map((c) => plCard(c)).join("")}</div>
  `;
  content.querySelectorAll(".chip[data-chip]").forEach((ch) => {
    ch.onclick = () => { state.chip = ch.dataset.chip; renderSquare(); };
  });
}

/* ── Charts ── */
function renderChart() {
  content.innerHTML = `
    ${sectionHead("Top Rising")}
    <div class="chart-wrap">
      <div class="chart-side">
        <div class="chart-cover"><img src="${coverArt(71, 6)}" alt=""></div>
        <div class="play-all"><svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M8 5.5v13l11-6.5z"/></svg> Play All</div>
        <div class="chart-up">Updated daily · Sorted by live popularity<br>${CHART.length} songs</div>
      </div>
      <div class="chart-list">
        ${CHART.map((t) => `
          <div class="chart-item" data-track="${t.id}">
            <span class="idx ${t.rank <= 3 ? "top" : ""}">${String(t.rank).padStart(2, "0")}</span>
            <span class="c-title">${t.title}</span>
            <span class="c-artist">${t.artists.join(" / ")}</span>
          </div>`).join("")}
      </div>
    </div>`;
  content.querySelectorAll(".chart-item").forEach((row) => {
    row.onclick = () => {
      const t = TRACKS.find((x) => x.id === +row.dataset.track);
      playTrack(t, CHART);
    };
  });
  content.querySelector(".play-all").onclick = () => playTrack(CHART[0], CHART);
}

/* ── Artists ── */
function renderArtists() {
  content.innerHTML = `
    ${sectionHead("Top Artists")}
    <div class="artist-grid">${ARTISTS.map((a) => `
      <div class="artist-card">
        <div class="a-cover"><img src="${coverArt(a.seed, a.pal)}" alt=""></div>
        <div class="a-name">${a.name}</div>
        <div class="a-sub">${a.fans} fans</div>
      </div>`).join("")}
    </div>`;
}

/* ── Sidebar views ── */
function renderLiked() {
  const liked = TRACKS.filter((t) => state.liked.has(t.id));
  content.innerHTML = `
    <div class="list-view">
      <div class="list-head"><h2>Liked Music</h2><span class="sub">${liked.length} songs</span></div>
      ${liked.length ? `<div class="track-grid" style="grid-template-columns:1fr">${liked.map((t) => trackRow(t)).join("")}</div>`
        : `<div class="empty-hint">Nothing here yet — explore the Featured tab</div>`}
    </div>`;
  bindTrackRows();
}
function renderRecent() {
  const recent = [...state.history ?? []];
  const list = recent.length ? recent : TRACKS.slice(0, 4);
  content.innerHTML = `
    <div class="list-view">
      <div class="list-head"><h2>Recently Played</h2><span class="sub">${list.length} songs</span></div>
      <div class="track-grid" style="grid-template-columns:1fr">${list.map((t) => trackRow(t)).join("")}</div>
    </div>`;
  bindTrackRows();
}
function renderDownloads() {
  content.innerHTML = `
    <div class="list-view">
      <div class="list-head"><h2>Downloads</h2><span class="sub">Sign in to download songs</span></div>
      <div class="empty-hint">No downloads yet</div>
    </div>`;
}
function renderRadioLike(v) {
  content.innerHTML = `
    ${sectionHead(v === "radio" ? "Popular Radio" : "Artists I Follow")}
    <div class="radio-grid">${RADIOS.map(radioCard).join("")}</div>`;
}

/* ── Genre tabs ── */
function renderGenre(tab) {
  const list = genrePlaylists(tab);
  content.innerHTML = `
    ${sectionHead(`${tab} Essentials`)}
    <div class="card-grid">${list.map((c) => plCard(c)).join("")}</div>`;
}

/* ═══════════ Player ═══════════ */
const playerBar = $("#playerBar");
const progressFill = $("#progressFill"), progressKnob = $("#progressKnob"), progressTip = $("#progressTip"), progressLine = $("#progressLine");
const playIcon = $("#playIcon"), modeIcon = $("#modeIcon");

const ICON_PLAY = '<path fill="currentColor" d="M8 5.5v13l11-6.5z"/>';
const ICON_PAUSE = '<path fill="currentColor" d="M7 5.5h3.4v13H7zM13.6 5.5H17v13h-3.4z"/>';

function setPlayIcon() {
  playIcon.innerHTML = state.playing ? ICON_PAUSE : ICON_PLAY;
}
function setModeIcon() {
  if (state.mode === "order") modeIcon.innerHTML = '<path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" d="M4 8h12a4 4 0 0 1 0 8H8m0 0 3 3M8 16l3-3"/><path fill="currentColor" d="m15 5 3 3-3 3z" opacity="0"/><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" d="M20 8.5 17.5 6M20 8.5 17.5 11"/>';
  else if (state.mode === "loop") modeIcon.innerHTML = '<path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" d="M4 9h13a3.5 3.5 0 0 1 0 7H9m0 0 3-3.2M9 16l3 3.2"/><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" d="M20 15.5 17.5 13M20 15.5 17.5 18"/>';
  else modeIcon.innerHTML = '<path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" d="M5 7h4l7 10h3M19 17l-2.6 0M19 17l-2.4-2.4M5 17h4l2.2-3.1M19 7h-3l-2.2 3.1"/><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" d="M16.4 4.6 19 7l-2.6 2.4M16.4 14.6 19 17l-2.6 2.4"/>';
}

function playTrack(t, queue) {
  if (queue) {
    state.queue = queue.slice();
    renderQueue();
  } else if (!state.queue.find((q) => q.id === t.id)) {
    state.queue = [t, ...state.queue];
    renderQueue();
  }
  if (!state.queue.find((q) => q.id === t.id)) state.queue.unshift(t);
  state.current = t;
  state.progress = 0;
  state.playing = true;
  (state.history ??= []).unshift(t);
  state.history = state.history.filter((x, i, arr) => arr.findIndex((y) => y.id === x.id) === i).slice(0, 20);

  playerBar.classList.add("show");
  $("#playerTitle").textContent = t.title;
  $("#playerArtist").textContent = t.artists.join(" / ");
  $("#playerCover").style.backgroundImage = `url(${coverArt((t.seed ?? t.id * 13), t.pal, { vinyl: true })})`;
  setPlayIcon(); setModeIcon();
  highlightRows();
  startAudio(t);
}

function highlightRows() {
  content.querySelectorAll(".track-row").forEach((r) => {
    r.classList.toggle("playing-row", state.current && +r.dataset.track === state.current.id);
  });
}

function togglePlay() {
  if (!state.current) return;
  state.playing = !state.playing;
  setPlayIcon();
  if (state.playing) resumeAudio(); else pauseAudio();
}

function nextTrack(step = 1) {
  if (!state.queue.length || !state.current) return;
  let i = state.queue.findIndex((q) => q.id === state.current.id);
  if (state.mode === "shuffle") {
    let r; do { r = Math.floor(Math.random() * state.queue.length); } while (state.queue.length > 1 && r === i);
    i = r;
  } else {
    i = (i + step + state.queue.length) % state.queue.length;
  }
  playTrack(state.queue[i]);
}

/* Progress ticks with real time */
setInterval(() => {
  if (state.playing && state.current) {
    state.progress += 1;
    if (state.progress >= state.current.dur) {
      if (state.mode === "loop") { state.progress = 0; startAudio(state.current); }
      else nextTrack(1);
      return;
    }
  }
  const pct = state.current ? (state.progress / state.current.dur) * 100 : 0;
  progressFill.style.width = pct + "%";
  progressKnob.style.left = pct + "%";
}, 1000);

/* Seek */
function seekAt(clientX) {
  if (!state.current) return;
  const rect = progressLine.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  state.progress = Math.round(ratio * state.current.dur);
  progressFill.style.width = ratio * 100 + "%";
  progressKnob.style.left = ratio * 100 + "%";
}
progressLine.onmousemove = (e) => {
  const rect = progressLine.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  progressTip.style.left = ratio * 100 + "%";
  progressTip.textContent = fmtDur(Math.round((state.current?.dur ?? 0) * ratio));
};
progressLine.onmousedown = (e) => seekAt(e.clientX);

/* ═══════════ Queue ═══════════ */
function renderQueue() {
  const list = $("#queueList");
  $("#queueCount").textContent = state.queue.length;
  if (!state.queue.length) { list.innerHTML = `<div class="queue-empty">Your queue is empty</div>`; return; }
  list.innerHTML = state.queue.map((t) => `
    <div class="queue-item ${state.current?.id === t.id ? "playing" : ""}" data-q="${t.id}">
      <div class="q-cover"><img src="${coverArt(t.seed ?? t.id * 13, t.pal)}" alt="">
        <div class="q-state"><svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M7 5.5h3.4v13H7zM13.6 5.5H17v13h-3.4z"/></svg></div>
      </div>
      <div class="q-meta">
        <div class="q-title-row"><span class="q-title">${t.title}</span>${t.hires ? '<span class="badge hires">Hi-Res</span>' : ""}</div>
        <div class="q-artist">${t.artists.join(" / ")}</div>
      </div>
      <span class="q-dur">${fmtDur(t.dur)}</span>
    </div>`).join("");
  list.querySelectorAll(".queue-item").forEach((item) => {
    item.onclick = () => playTrack(state.queue.find((t) => t.id === +item.dataset.q));
  });
}
$("#btnQueue").onclick = () => $("#queueDrawer").classList.toggle("open");
$("#favAll").onclick = () => { toast(state.queue.length ? `Saved ${state.queue.length} songs` : "Queue is empty"); };
$("#clearQueue").onclick = () => {
  state.queue = []; renderQueue(); toast("Queue cleared");
  if (state.current) { pauseAudio(); state.playing = false; setPlayIcon(); state.current = null; }
};

/* ═══════════ Likes ═══════════ */
function toggleLike(id, btn) {
  if (state.liked.has(id)) { state.liked.delete(id); toast("Removed from Liked Music"); }
  else { state.liked.add(id); toast("Added to Liked Music"); }
  document.querySelectorAll(`.act-like`).forEach((b) => {
    const rid = +b.closest(".track-row").dataset.track;
    const on = state.liked.has(rid);
    b.classList.toggle("liked", on);
    b.querySelector("path").setAttribute("fill", on ? "currentColor" : "none");
  });
  $("#btnLike").classList.toggle("liked", state.liked.has(id));
  $("#btnLike").querySelector("path").setAttribute("fill", state.liked.has(id) ? "currentColor" : "none");
}
$("#btnLike").onclick = () => { if (state.current) toggleLike(state.current.id); };
$("#btnComment").onclick = () => toast(`999+ hot comments on "${state.current?.title ?? ""}"`);

/* ═══════════ Controls ═══════════ */
$("#btnPlay").onclick = () => { if (!state.current) { playTrack(TRACKS[0], NEW_TRACK_IDS.map((i) => TRACKS.find((x) => x.id === i))); } else togglePlay(); };
$("#btnNext").onclick = () => nextTrack(1);
$("#btnPrev").onclick = () => nextTrack(-1);
$("#btnMode").onclick = () => {
  state.mode = state.mode === "order" ? "loop" : state.mode === "loop" ? "shuffle" : "order";
  setModeIcon();
  toast(state.mode === "order" ? "Sequential play" : state.mode === "loop" ? "Loop one" : "Shuffle play");
};
$("#playerCover").onclick = () => toast("Sign in to view track details");

/* Volume */
$("#volumeWrap").addEventListener("click", (e) => {
  const slider = e.currentTarget.querySelector(".volume-slider");
  const rect = slider.getBoundingClientRect();
  if (e.clientX - rect.left >= -4 && rect.width) {
    state.volume = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    $("#volumeFill").style.width = state.volume * 100 + "%";
    setVolume(state.volume);
  }
});

/* Search */
const searchInput = $("#searchInput"), searchHint = $("#searchHint"), searchPill = document.querySelector(".search-pill");
let hintIdx = 0;
setInterval(() => {
  if (document.activeElement === searchInput || searchPill.classList.contains("has-text")) return;
  searchHint.style.opacity = 0;
  setTimeout(() => {
    hintIdx = (hintIdx + 1) % SEARCH_HINTS.length;
    searchHint.textContent = `Trending: ${SEARCH_HINTS[hintIdx]}`;
    searchHint.style.opacity = 1;
  }, 380);
}, 4200);
searchInput.addEventListener("input", () => searchPill.classList.toggle("has-text", !!searchInput.value));
searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && searchInput.value.trim()) toast(`Sign in to search "${searchInput.value.trim()}"`); });

/* Sidebar login card rotation */
let loginIdx = 0;
setInterval(() => {
  const el = $("#loginSubText");
  el.style.opacity = 0;
  setTimeout(() => { loginIdx = (loginIdx + 1) % LOGIN_SUBS.length; el.textContent = LOGIN_SUBS[loginIdx]; el.style.opacity = 1; }, 300);
}, 5000);
$("#loginSubText").style.transition = "opacity .3s";

/* Sidebar nav */
document.querySelectorAll(".nav-item").forEach((item) => {
  item.onclick = (e) => {
    e.preventDefault();
    document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
    item.classList.add("active");
    state.view = item.dataset.view;
    renderView();
  };
});
$("#myFirstPlaylist").onclick = () => {
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
  playTrack(TRACKS[2], TRACKS.slice(0, 6));
  toast(`Now playing "My Music Pocket"`);
};

/* Back/forward */
$("#btnBack").onclick = () => { document.querySelector('.nav-item[data-view="featured"]').click(); };
$("#btnFwd").onclick = () => toast("No more history");

/* Toast */
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}

/* ═══════════ WebAudio synth (original generated ambience per track) ═══════════ */
let AC = null, masterGain = null, schedTimer = null, activeVoices = [];
const SCALES = [
  [0, 3, 5, 7, 10],       // minor pentatonic
  [0, 2, 4, 7, 9],        // major pentatonic
  [0, 2, 3, 7, 8],        // hirajoshi-ish
];
function ensureAudio() {
  if (AC) return;
  AC = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = AC.createGain();
  masterGain.gain.value = state.volume * 0.5;
  masterGain.connect(AC.destination);
}
function setVolume(v) { if (masterGain) masterGain.gain.value = v * 0.5; }

function noteFreq(root, semis) { return 220 * Math.pow(2, (root + semis) / 12); }
function pluck(freq, when, dur, gainV) {
  const osc = AC.createOscillator(), g = AC.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gainV, when + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(g).connect(masterGain);
  osc.start(when); osc.stop(when + dur + 0.05);
  activeVoices.push(osc);
}
function pad(freq, when, dur, gainV) {
  const osc = AC.createOscillator(), g = AC.createGain(), lp = AC.createBiquadFilter();
  osc.type = "triangle";
  osc.frequency.value = freq;
  lp.type = "lowpass"; lp.frequency.value = 900;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gainV, when + 0.8);
  g.gain.linearRampToValueAtTime(0.0001, when + dur);
  osc.connect(lp).connect(g).connect(masterGain);
  osc.start(when); osc.stop(when + dur + 0.1);
  activeVoices.push(osc);
}
function startAudio(t) {
  ensureAudio();
  if (AC.state === "suspended") AC.resume();
  stopScheduler();
  const rnd = mulberry32(t.id * 977 + 41);
  const scale = SCALES[t.id % SCALES.length];
  const root = 3 + (t.id % 5);
  let step = 0;
  const beat = 0.42;
  function schedule() {
    const t0 = AC.currentTime + 0.08;
    // bass pad every 8 steps
    if (step % 8 === 0) pad(noteFreq(root - 12, 0), t0, beat * 8.2, 0.16);
    // pad fifth
    if (step % 16 === 8) pad(noteFreq(root - 12, scale[2]), t0, beat * 8, 0.10);
    // melody pluck
    const semis = scale[Math.floor(rnd() * scale.length)] + (rnd() > 0.8 ? 12 : 0);
    pluck(noteFreq(root, semis), t0, 1.6 + rnd(), 0.14 + rnd() * 0.08);
    if (rnd() > 0.72) pluck(noteFreq(root + 12, scale[Math.floor(rnd() * scale.length)]), t0 + beat / 2, 1.2, 0.07);
    step++;
  }
  schedule();
  schedTimer = setInterval(schedule, beat * 1000);
}
function stopScheduler() { if (schedTimer) { clearInterval(schedTimer); schedTimer = null; } }
function pauseAudio() {
  stopScheduler();
  activeVoices.forEach((o) => { try { o.stop(AC.currentTime + 0.05); } catch {} });
  activeVoices = [];
}
function resumeAudio() { if (state.current) startAudio(state.current); }

/* ═══════════ Boot ═══════════ */
renderTabs();
renderView();
renderQueue();
setPlayIcon();
setModeIcon();
$("#volumeFill").style.width = state.volume * 100 + "%";
