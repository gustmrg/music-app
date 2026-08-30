# 云音乐 — Music App Recreation

A from-scratch web recreation of the NetEase Music macOS desktop app's look and feel,
built by observing the running app with computer automation (CUA), then testing this
web version with browser automation (BUA) and polishing until the two feel the same.

**Everything in this project is original work**: all cover/banner artwork is drawn
procedurally on `<canvas>` at runtime, all playlist/track/artist names are fictional,
and playback audio is synthesized live with the Web Audio API. No copyrighted
artwork, music, or text from the reference app is included.

## Run

```bash
cd music-app
python3 -m http.server 4173
# open http://127.0.0.1:4173/
```

Best viewed at 1440×800 (the reference window size). No build step, no dependencies.

## What matches the reference

| Area | Details |
| --- | --- |
| Shell | 202px sidebar + main column, near-black theme `#131316`/`#16161a`, red accent `#ec4141`, PingFang SC |
| Sidebar | Red-gradient active pill, nav groups (Featured/Radio/Following, Liked Music/Recently Played/Downloads), Created Playlists + button, sign-in promo card with rotating sub-line |
| Top bar | Back/forward circles, search pill with 🔥 + rotating "Trending: …" hint, identify-song mic, Sign In + 👑VIP chip, mail/settings/theme(+red dot)/minimize icons |
| Tabs | 10 tabs + More∨, active = bold white with 3px red underline |
| Featured | Auto-advancing 2-banner carousel with dots & slide animation, Official Playlists 6-card grid (play counts, hover shade + play button, dominant-color tinted title blocks), New Music 2-col rows (Hi-Res/PREVIEW badges, hover actions), Featured Shows circular radio cards |
| Playlists | Filter chips (active red pill) + two card sections |
| Other views | Charts (top-3 red indices, Play All), Artists (circular artist grid), liked/recent/download sidebar views, per-tab genre grids |
| Player bar | Hidden until first play, slides up; thin red progress line on top (click to seek, hover knob + time tip); circular thumb, title/artist, ♥100k+ / 💬999+; sequential/loop/shuffle modes with toasts; red 40px play/pause; ULTRA badge, EQ/lyrics/volume(hover slider)/more |
| Queue drawer | 372px right panel below top bar, Play Queue header, Save All/Clear actions, click-to-play rows, red highlight + pause overlay on the playing track |
| Behaviors | Real-time progress + auto-advance at track end, prev/next, like sync between rows and player, toast feedback, card/row hover states everywhere |

## Structure

```
index.html      markup shell
css/styles.css  full theme + layout
js/data.js      seeded fictional data (tracks, playlists, banners, radios…)
js/art.js       canvas artwork generator (covers, banners, vinyl thumb)
js/app.js       rendering, player, queue, Web Audio synth
SPEC.md         design spec captured from the reference app
```

## How it was validated

- Reference app explored via CUA: screenshots + zooms of every surface (featured,
  歌单广场, queue drawer, player bar, sidebar).
- This app tested via BUA: played/paused, seeked, switched tracks (incl. auto-advance
  at end of track), cycled play modes, liked songs (sync check), opened/cleared the
  queue, switched all 10 tabs + 5 sidebar views (all render, zero console errors),
  verified hover states and the carousel mid-slide clipping.
- Side-by-side screenshot comparison against the reference at 1440×800, with fixes
  applied each round (banner headline duplication, wave rendering, search pill order,
  card title blocks, drawer position, artist tint, static player thumb).
