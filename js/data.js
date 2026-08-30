/* ── Data layer: all-fictional content, deterministic seeded generation ── */
"use strict";

// Mulberry32 seeded PRNG so the app renders identically every load.
export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Palettes used by both the art generator and the card title-block tint. */
export const PALETTES = [
  { bg: ["#f6e2c8", "#d9a06b"], shapes: ["#8a4b2a", "#f0c088"], tint: "#3a2c1e" },   // warm sepia
  { bg: ["#2b1e4d", "#7a3f9d"], shapes: ["#ff7ab8", "#4de3d0"], tint: "#241a3d" },  // neon violet
  { bg: ["#0d1b2a", "#1b4965"], shapes: ["#63b3ed", "#f4d35e"], tint: "#12212f" },  // deep sea
  { bg: ["#fdf0f3", "#e88ba0"], shapes: ["#b23a5c", "#ffd9e2"], tint: "#43222d" },  // rose
  { bg: ["#101014", "#3a2f4d"], shapes: ["#9d8cff", "#4affe0"], tint: "#18161f" },  // midnight synth
  { bg: ["#e4f2ea", "#7fb8a4"], shapes: ["#2f6d5a", "#f2c94c"], tint: "#1e352d" },  // mint field
  { bg: ["#1c1230", "#411d63"], shapes: ["#e05fa0", "#38b6ff"], tint: "#201430" },  // cyber dusk
  { bg: ["#3d2417", "#8c5a2b"], shapes: ["#ffb95e", "#5e3312"], tint: "#2e1d10" },  // amber wood
  { bg: ["#0f2027", "#2c5364"], shapes: ["#9ff0e4", "#f38ba0"], tint: "#0e1e24" },  // aurora teal
  { bg: ["#26221f", "#6e5c48"], shapes: ["#e8c9a0", "#a4785a"], tint: "#2b2620" },  // café noir
  { bg: ["#17202a", "#3e5c76"], shapes: ["#f0a202", "#9ad1d4"], tint: "#151d26" },  // harbor
  { bg: ["#2d1b33", "#9a4c74"], shapes: ["#ffd166", "#c46a9e"], tint: "#2a1a2c" },  // plum pop
];

export const TRACKS = [
  { id: 1,  title: "Evening Breeze Letter",  artists: ["Coastline Project", "Chen Yu"],   dur: 213, pal: 3,  hires: true },
  { id: 2,  title: "Marks of Youth",         artists: ["Air Piano", "Lin Wanfeng"],       dur: 226, pal: 8,  hires: true, trial: true },
  { id: 3,  title: "Tidal Signal",           artists: ["NEON Harbour"],                   dur: 198, pal: 2 },
  { id: 4,  title: "After the Rain",         artists: ["Su Li"],                          dur: 241, pal: 4,  hires: true },
  { id: 5,  title: "City Fireflies",         artists: ["Island Mood Club"],               dur: 187, pal: 5 },
  { id: 6,  title: "Midsummer Farewell",     artists: ["White Gull Band", "Zhou Ci"],     dur: 254, pal: 9,  hires: true },
  { id: 7,  title: "Neon Slow Train",        artists: ["Midnight Ferry"],                 dur: 205, pal: 6,  trial: true },
  { id: 8,  title: "Distant Mountains",      artists: ["Cloud Herder"],                   dur: 262, pal: 10, hires: true },
  { id: 9,  title: "Back to That Afternoon", artists: ["Orange Isle Radio", "He Yi"],     dur: 219, pal: 0 },
  { id: 10, title: "Midnight Corner Store",  artists: ["Liu Shisi"],                      dur: 232, pal: 7,  hires: true },
  { id: 11, title: "Stellar Post Office",    artists: ["Mist Isle Radio"],                dur: 246, pal: 11 },
  { id: 12, title: "Serial No. Ocean",       artists: ["Deep Blue Lab"],                  dur: 208, pal: 2,  hires: true },
];
export const NEW_TRACK_IDS = [1, 2, 3, 4, 5, 6, 7, 8];

export const OFFICIAL_PLAYLISTS = [
  { id: "o1", seed: 11, count: 1163.4, title: "Late Night R&B | Slow Heartbeats",     pal: 0,  words: ["NEW", "MUSIC"] },
  { id: "o2", seed: 12, count: 592.3,  title: "New Music Radar | K-Pop First",        pal: 3,  words: ["NEW", "MUSIC"] },
  { id: "o3", seed: 13, count: 536.3,  title: "Game Time | Cyber Rush Mix",           pal: 6,  words: ["GAMING", "Phonk"] },
  { id: "o4", seed: 14, count: 281.9,  title: "Folk Monsoon | Letters from the South", pal: 5, words: ["Folk", "TREND"] },
  { id: "o5", seed: 15, count: 2795.7, title: "Mandarin Hits | City Night Guide",     pal: 11, words: ["Pop", "TREND"] },
  { id: "o6", seed: 16, count: 696.8,  title: "Rock Live | The Wall Never Sleeps",    pal: 7,  words: ["Rock", "TREND"] },
];

export const SQUARE_RECOMMEND = [
  { id: "r1", seed: 21, count: 550.7,  title: "Late Night Loop | Every track feels like someone else's life", pal: 9 },
  { id: "r2", seed: 22, count: 1713.2, title: "Classic melodies you'll replay forever",       pal: 3 },
  { id: "r3", seed: 23, count: 195.4,  title: "Songs full of city blues — you'll feel a little better", pal: 1 },
  { id: "r4", seed: 24, count: 384.7,  title: "Easy, healing songs for shower time",          pal: 2 },
  { id: "r5", seed: 25, count: 129.2,  title: "300 hottest tracks everyone is playing",       pal: 4 },
  { id: "r6", seed: 26, count: 99.1,   title: "Western EDM | For clutch competitive moments", pal: 10 },
];
export const SQUARE_DAILY = [
  { id: "d1", seed: 31, count: 62.7,   title: "R&B Guide | Heavy grooves for your ears",      pal: 3 },
  { id: "d2", seed: 32, count: 322.2,  title: "Hidden Gems | Textured, aesthetic art pop",    pal: 7 },
  { id: "d3", seed: 33, count: 9436.6, title: "Healing | Music is medicine for the mood",     pal: 4 },
  { id: "d4", seed: 34, count: 157.5,  title: "Western Classics | Old songs age like wine",   pal: 10 },
  { id: "d5", seed: 35, count: 84.7,   title: "Epic Game Anthems | Must-have focus BGM",      pal: 6 },
  { id: "d6", seed: 36, count: 1887.3, title: "High-energy Funk | Gaming picks",              pal: 11 },
];

export const BANNERS = [
  [
    { id: "b1", seed: 41, pal: 4,  title: "Night Tide",   sub: "MIDNIGHT TIDE · New Album",      cta: null,         tag: "New Album" },
    { id: "b2", seed: 42, pal: 2,  title: "Starisle",     sub: "STARISLE · New Single Out Now",  cta: "Listen Now",  tag: "Digital Single" },
  ],
  [
    { id: "b3", seed: 43, pal: 9,  title: "Long Street",  sub: "LONG STREET · Latest Single",    cta: null,         tag: "New Release" },
    { id: "b4", seed: 44, pal: 1,  title: "Refract",      sub: "REFRACT · New EP Out Now",       cta: null,         tag: "New Release" },
  ],
  [
    { id: "b5", seed: 45, pal: 5,  title: "Wildfield",    sub: "WILDFIELD · A Tribute to Classics", cta: null,       tag: "New Release" },
    { id: "b6", seed: 46, pal: 7,  title: "Morning Sail", sub: "MORNING SAIL · New Album",       cta: "Support Now", tag: "New Album" },
  ],
  [
    { id: "b7", seed: 47, pal: 11, title: "Far Light",    sub: "FAR LIGHT · New Single",         cta: null,         tag: "New Release" },
    { id: "b8", seed: 48, pal: 0,  title: "Mist Tower",   sub: "MIST TOWER · EP Out Now",        cta: null,         tag: "Digital Album" },
  ],
];

export const RADIOS = [
  { id: "rd1", seed: 51, pal: 0,  count: 1.2,  name: "Goodnight Radio | Talk Me to Sleep",      host: "A-He" },
  { id: "rd2", seed: 52, pal: 8,  count: 3.4,  name: "Midnight Requests | City Wandering",      host: "Old Cat" },
  { id: "rd3", seed: 53, pal: 5,  count: 0.8,  name: "Music Underground | Hidden Gems",         host: "Xiaoman" },
  { id: "rd4", seed: 54, pal: 2,  count: 2.1,  name: "Share My Headphones | Feelings Shelter",  host: "Nanqi" },
  { id: "rd5", seed: 55, pal: 6,  count: 1.5,  name: "8AM Boost | Commute Energy",              host: "Dawn Isle" },
  { id: "rd6", seed: 56, pal: 11, count: 4.2,  name: "Story Vending Machine | A Bedtime Story", host: "Yu Sheng" },
];

export const ARTISTS = [
  { id: "a1", seed: 61, pal: 3,  name: "Coastline Project", fans: "1.3M" },
  { id: "a2", seed: 62, pal: 4,  name: "Su Li",             fans: "962k" },
  { id: "a3", seed: 63, pal: 6,  name: "NEON Harbour",      fans: "548k" },
  { id: "a4", seed: 64, pal: 9,  name: "White Gull Band",   fans: "431k" },
  { id: "a5", seed: 65, pal: 0,  name: "Cloud Herder",      fans: "317k" },
  { id: "a6", seed: 66, pal: 2,  name: "Deep Blue Lab",     fans: "284k" },
];

export const SEARCH_HINTS = ["Insomnia", "Morning", "Commute", "Rain", "Focus", "Night Run"];
export const LOGIN_SUBS = ["Full tracks free in every section", "Join the membership rewards event", "A more immersive way to listen"];

export const TABS = ["Featured", "Playlists", "Charts", "Artists", "VIP", "Classics", "Western", "Workout", "Cantonese", "Driving"];

export const CHART = TRACKS.slice(0, 10).map((t, i) => ({ ...t, rank: i + 1 }));

/* Genres for extra tabs: each gets a regenerated grid so tabs feel alive. */
export function genrePlaylists(tab, n = 6) {
  const idx = Math.max(0, TABS.indexOf(tab)) + 3;
  const out = [];
  for (let i = 0; i < n; i++) {
    const rnd = mulberry32(idx * 100 + i * 7 + 5);
    out.push({
      id: `${tab}-${i}`,
      seed: idx * 100 + i * 7 + 5,
      count: Math.round((50 + rnd() * 2500) * 10) / 10,
      title: `${tab} Essentials · ${["Late Night", "Energy Boost", "Scenery", "Old Echoes", "Upbeat", "Endless Summer"][i % 6]}`,
      pal: Math.floor(rnd() * PALETTES.length),
    });
  }
  return out;
}

/* counts are stored in "wans" (10k); format for English readers */
export function fmtCount(w) {
  if (w >= 100) return `${(w / 100).toFixed(1).replace(/\.0$/, "")}M`;
  return `${Math.round(w * 10)}k`;
}
export function fmtDur(s) { const m = Math.floor(s / 60), r = s % 60; return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`; }
