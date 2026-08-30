# Music App Recreation — Design Spec (captured via CUA from reference app)

Reference: NetEase Music macOS desktop, window 1440×~800, dark theme, red accent.
This recreation is an original implementation: procedurally generated artwork and
fictional content; only the layout/interaction *feel* is matched.

## Global
- Canvas 1440×~800. Base bg near-black `#131316`, sidebar `#16161a`, elevated `#1f2126`, hairline `#2a2b30`.
- Accent red `#ec4141`; active nav pill = gradient(90deg,#e5484a → #b93c3e), radius 8.
- Text: primary #fff, secondary #9a9ba1, tertiary #6c6e74. Font: PingFang SC / system.
- Radius: cards/rows 8px; inputs/pills fully rounded; small badges 3px.

## Layout skeleton
- Sidebar 202px, full height, right hairline.
- Main column: top bar (~76px) → tab row (~48px) → scrollable content (pad 40px sides).
- Player bar ~84px pinned bottom (hidden until first play), slides up on play.
- Queue drawer 371px, right side, above player bar, rounded left corners.

## Sidebar
- Logo row: red rounded-square glyph + white bold name, 17px.
- Nav group 1: 精选 (active red pill w/ white icon+text), 排客, 关注.
- Group 2 (heart/clock/download icons): 我喜欢的音乐 (+ small chevron badge), 最近播放, 下载管理.
- Row 创建的歌单 N + circular + button.
- Bottom login card: bordered rounded rect, "立即登录云音乐 ›" + rotating second line (gray, small icon).

## Top bar
- Circle buttons: back (enabled) / forward (dimmed).
- Search pill (≈270×38, bg #232429): magnifier, 🔥 red flame glyph, rotating gray hint "大家都在搜 <word>". Separate circular mic button.
- Right: avatar circle icon + 未登录 + crown badge pill + chevron; mail, gear, shirt (red dot badge), minimize icons.

## Tab row
精选 歌单广场 排行榜 歌手 VIP 经典 欧美 运动 粤语 驾车 更多∨ — active = white bold + 3px red rounded underline; inactive #9a9ba1.

## Featured view
- Carousel: full-width strip, 2 banners per page (each ≈568×209, radius 8, gap 18),
  slides advance every ~5s with slide animation; dot pagination centered below (active dot white, others dim).
- Corner tag on banners: "新歌首发" translucent dark pill (right-bottom).
- Section header: bold 16px + small red chevron ›.
- 官方歌单 grid: 6 columns × 152px, gap 16, left-aligned. Card: cover 152×155 (radius 8, overflow hidden);
  play count top-left (headphone glyph + "1163.4万", white, drop shadow);
  hover → cover darkens + white play circle fades in bottom-right;
  title block below cover ≈56px, two 13px lines, white on darkened dominant color of artwork.
- 最新音乐: 2-col rows (565×74, radius 8, bg #1e2025): cover 50 (radius 6; hover overlay play triangle),
  title 14px + badges (Hi-Res gold-outline, 试听 red-outline), artist 12px gray; right icons
  download / heart / ⋯ appear on hover or when playing.
- Below (partially below fold): 推荐节目 — 6 circular podcast covers with count + titles.

## 歌单广场 view
- Chip row: 推荐 (red filled pill) 官方 华语 摇滚 民谣 电子 轻音乐 (outline pills, bg #1e2025) + 更多分类∨.
- Sections 你的专属歌单 / 每日新鲜推荐: same 6-col card grid.

## Player bar
- Top: full-width 3px progress (track #3a3b40, fill #ec4141, knob on hover + time labels).
- Left: circular album 56px, title 14 semibold, artist 12 gray; heart 10w+ and comment 999+ with counts.
- Center: loop-mode icon, prev, red circle 40px play/pause, next, queue-list icon.
- Right: 极清 quality badge (outlined), sound-effect icon, 词 lyrics icon, volume icon (hover slider), ⋯.

## Queue drawer
- Header: "播放列表" bold + count; right actions 收藏全部 · 清空 (gray 12px).
- Rows: 44px cover (red pause overlay when playing), title red when playing else white, Hi-Res badge, artist 12, right duration gray.

## Behaviors / feel
- Search hint rotates ~4s fade; sidebar login second-line rotates.
- Carousel auto-advance ~5s; dots clickable.
- Play → bar slides up; progress advances in real time; click/drag seeks; prev/next cycle queue; loop icon cycles order→loop→shuffle.
- Heart toggles red; queue rows click-to-play; 收藏全部/清空 act; card & row hover states everywhere.
- Audio: WebAudio-generated ambient pad+pluck per track (original, synthesized).
