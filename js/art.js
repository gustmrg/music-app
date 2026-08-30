/* ── Procedural artwork: abstract covers/banners drawn on canvas (all original) ── */
"use strict";

import { PALETTES, mulberry32 } from "./data.js";

const ART_CACHE = {};

export function palOf(i) { return PALETTES[(i ?? 0) % PALETTES.length]; }

/* Deterministic abstract cover art. */
/**
 * @param {number} seed
 * @param {number} palIdx
 * @param {{ big?: boolean, text?: string[] | null, banner?: boolean, cta?: string | null, sub?: string | null, vinyl?: boolean }} [options]
 */
export function coverArt(seed, palIdx, { big = false, text = null, banner = false, cta = null, sub = null, vinyl = false } = {}) {
  const key = `${seed}|${palIdx}|${big ? 1 : 0}|${text ? text.join("_") : ""}|${banner ? 1 : 0}|${cta || ""}|${sub || ""}|${vinyl ? 1 : 0}`;
  if (ART_CACHE[key]) return ART_CACHE[key];

  const W = banner ? 1136 : 460;
  const H = banner ? 416 : 470;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const rnd = mulberry32(seed * 7919 + 13);
  const pal = palOf(palIdx);

  // base vertical gradient
  const g = ctx.createLinearGradient(0, 0, W * (rnd() > .5 ? 0.3 : 1), H);
  g.addColorStop(0, pal.bg[0]);
  g.addColorStop(1, pal.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // soft radial glow
  const gx = W * (0.2 + rnd() * 0.6), gy = H * (0.15 + rnd() * 0.5);
  const rg = ctx.createRadialGradient(gx, gy, 10, gx, gy, W * 0.7);
  rg.addColorStop(0, hexA(pal.shapes[rnd() > .5 ? 0 : 1], .5));
  rg.addColorStop(1, hexA(pal.bg[1], 0));
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);

  // big translucent circles / rings
  for (let i = 0; i < 3; i++) {
    const cx = rnd() * W, cy = rnd() * H, r = (0.12 + rnd() * 0.3) * W;
    const shape = rnd();
    ctx.beginPath();
    if (shape > 0.66) {
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = hexA(pal.shapes[i % 2], 0.4 + rnd() * 0.25);
      ctx.lineWidth = banner ? 10 + rnd() * 18 : 5 + rnd() * 10;
      ctx.stroke();
    } else {
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = hexA(pal.shapes[i % 2], 0.18 + rnd() * 0.22);
      ctx.fill();
    }
  }

  // flowing wave band (fixed divisor so the curve stays smooth)
  ctx.beginPath();
  const baseY = H * (0.55 + rnd() * 0.3);
  const waveDiv = 90 + rnd() * 60, waveAmp = banner ? 42 : 26, phase = seed * 1.7;
  ctx.moveTo(0, baseY);
  for (let x = 0; x <= W; x += 24) {
    ctx.lineTo(x, baseY + Math.sin(x / waveDiv + phase) * waveAmp);
  }
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
  ctx.fillStyle = hexA(pal.shapes[seed % 2], 0.30);
  ctx.fill();

  // diagonal beam
  if (rnd() > 0.35) {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate((rnd() * 30 - 15) * Math.PI / 180);
    const bw = W * (0.5 + rnd() * 0.5);
    const bg2 = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    bg2.addColorStop(0, hexA(pal.shapes[1], 0));
    bg2.addColorStop(0.5, hexA(pal.shapes[1], 0.34));
    bg2.addColorStop(1, hexA(pal.shapes[1], 0));
    ctx.fillStyle = bg2;
    ctx.fillRect(-bw / 2, -H * (0.03 + rnd() * 0.05), bw, H * (0.06 + rnd() * 0.1));
    ctx.restore();
  }

  // vinyl-ish circle only when requested (player thumb)
  if (vinyl) {
    const cx = W / 2, cy = H / 2, r = W * 0.30;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = hexA("#0c0c10", 0.5); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    ctx.strokeStyle = hexA(pal.shapes[0], 0.75); ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = hexA(pal.shapes[1], 0.9); ctx.fill();
  }

  // stylized typographic overlay (our own words) on official cards; kept above the title block
  if (text && !banner) {
    ctx.save();
    const tx = W * 0.09, ty = H * 0.46;
    ctx.translate(tx, ty);
    ctx.rotate(-3 * Math.PI / 180);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "alphabetic";
    const size1 = 64;
    ctx.font = `900 italic ${size1}px "Avenir Next", "PingFang SC", sans-serif`;
    ctx.globalAlpha = 0.95;
    ctx.fillText(text[0], 0, 0);
    if (text[1]) {
      ctx.font = `300 italic ${size1 * 0.78}px "Avenir Next", "PingFang SC", sans-serif`;
      ctx.globalAlpha = 0.85;
      ctx.fillText(text[1], size1 * 0.12, size1 * 0.86);
    }
    ctx.restore();
  }

  // banner headline (fictional titles), no typographic duplicate
  if (banner) {
    ctx.save();
    const alignRight = seed % 2 === 0;
    ctx.textAlign = alignRight ? "right" : "left";
    const bx = alignRight ? W * 0.94 : W * 0.06;
    ctx.fillStyle = "rgba(255,255,255,.96)";
    ctx.font = `700 ${banner ? 58 : 40}px Georgia, "Times New Roman", serif`;
    ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 18;
    ctx.fillText(bigTitle(text?.[0] || "Nightfall"), bx, H * 0.42);
    ctx.font = `500 26px "Helvetica Neue", sans-serif`;
    ctx.globalAlpha = 0.92;
    const subText = sub || bannerSubFor(seed);
    ctx.fillText(subText, bx, H * 0.56);
    ctx.restore();
    if (cta) {
      ctx.save();
      const cx2 = alignRight ? W * 0.94 : W * 0.06;
      ctx.textAlign = alignRight ? "right" : "left";
      const bw2 = 150, bh2 = 42, by2 = H * 0.68;
      const bx2 = alignRight ? cx2 - bw2 : cx2;
      ctx.fillStyle = "rgba(250,250,252,.95)";
      roundRect(ctx, bx2, by2, bw2, bh2, 3); ctx.fill();
      ctx.fillStyle = "#26262b";
      ctx.font = `600 19px "Helvetica Neue", "PingFang SC", sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(cta, bx2 + bw2 / 2, by2 + 27);
      ctx.restore();
    }
  }

  // film grain
  const grainN = banner ? 2600 : 1500;
  for (let i = 0; i < grainN; i++) {
    ctx.fillStyle = `rgba(${rnd() > .5 ? "255,255,255" : "0,0,0"},${rnd() * 0.05})`;
    ctx.fillRect(rnd() * W, rnd() * H, 1.4, 1.4);
  }

  const url = canvas.toDataURL("image/jpeg", 0.9);
  ART_CACHE[key] = url;
  return url;
}

function bigTitle(t) { return t || ""; }
function bannerSubFor(seed) {
  const subs = ["New Album · Out Tonight", "New Single · Premiering Now", "New Single · A Tribute to Classics", "New EP · Out Now"];
  return subs[seed % subs.length];
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function hexA(hex, a) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
