/* ============================================================
   Procedural pixel art: tile/wall atlas + item icons.
   Everything is generated at runtime — no external assets.
   ============================================================ */
import { T, TILE, TILE_COUNT, W, ITEMS, itemDef } from "./defs";
import { hash2, mulberry32 } from "./noise";

export const VARIANTS = 4;
export const WALL_ROWS = 5;
export const ATLAS_ROWS = TILE_COUNT + WALL_ROWS;
export const ICON = 32;

class Sheet {
  data: Uint8ClampedArray<ArrayBuffer>;
  _base!: number[]; _light!: number[]; _dark!: number[]; _extra?: number[];
  private cx0 = 0; private cy0 = 0; private cx1 = 1e9; private cy1 = 1e9;
  constructor(public w: number, public h: number) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  clip(x: number, y: number, w: number, h: number) {
    this.cx0 = x; this.cy0 = y; this.cx1 = x + w - 1; this.cy1 = y + h - 1;
  }
  px(x: number, y: number, c: number[], a = 255) {
    x = x | 0; y = y | 0;
    if (x < this.cx0 || y < this.cy0 || x > this.cx1 || y > this.cy1) return;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = a;
  }
  rect(x: number, y: number, w: number, h: number, c: number[], a = 255) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c, a);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number[], a = 255) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 4096; guard++) {
      this.px(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  blob(cx: number, cy: number, r: number, c: number[], a = 255, wob = 0.35, rnd: () => number = Math.random) {
    for (let ang = 0; ang < 360; ang += 10) {
      const rr = r * (1 - wob + rnd() * wob * 2);
      const x = cx + Math.cos(ang * 0.01745) * rr;
      const y = cy + Math.sin(ang * 0.01745) * rr * 0.85;
      this.px(x, y, c, a);
      if (rr > 1.2) this.line(cx, cy, x, y, c, a);
    }
  }
  disc(cx: number, cy: number, r: number, c: number[], a = 255) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) this.px(cx + x, cy + y, c, a);
    }
  }
  speckle(n: number, x: number, y: number, w: number, h: number, cols: number[][], rnd: () => number, a = 255) {
    for (let i = 0; i < n; i++) this.px(x + rnd() * w, y + rnd() * h, cols[(rnd() * cols.length) | 0], a);
  }
  toCanvas(): HTMLCanvasElement {
    const cv = document.createElement("canvas");
    cv.width = this.w; cv.height = this.h;
    const ctx = cv.getContext("2d")!;
    ctx.putImageData(new ImageData(this.data, this.w, this.h), 0, 0);
    return cv;
  }
}

const cache: Record<string, number[]> = {};
function C(hex: string): number[] {
  let v = cache[hex];
  if (!v) {
    const h = hex.replace("#", "");
    v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    cache[hex] = v;
  }
  return v;
}
const shade = (c: number[], f: number): number[] => [
  Math.max(0, Math.min(255, c[0] * f)) | 0,
  Math.max(0, Math.min(255, c[1] * f)) | 0,
  Math.max(0, Math.min(255, c[2] * f)) | 0,
];

interface Pal { base: string; light: string; dark: string; extra?: string; }
const PAL: Record<number, Pal> = {
  [T.DIRT]: { base: "#6b4630", light: "#84573b", dark: "#4b2f1f", extra: "#3b2517" },
  [T.GRASS]: { base: "#6b4630", light: "#84573b", dark: "#4b2f1f", extra: "#4fa63c" },
  [T.STONE]: { base: "#7a7f8c", light: "#989fae", dark: "#5a5f6b", extra: "#43474f" },
  [T.WOOD]: { base: "#9a6b3d", light: "#b3814d", dark: "#6f4a26", extra: "#5a3a1e" },
  [T.TRUNK]: { base: "#5c3f27", light: "#75512f", dark: "#3e291a", extra: "#2b1d12" },
  [T.LEAF]: { base: "#3f8f3a", light: "#57b04a", dark: "#2a6b2b", extra: "#79d166" },
  [T.JLEAF]: { base: "#2f7a3c", light: "#48a04a", dark: "#1e5527", extra: "#8acf4f" },
  [T.SAND]: { base: "#dcc588", light: "#eedaa5", dark: "#bc9f66", extra: "#a3894f" },
  [T.SNOW]: { base: "#e9f3ff", light: "#ffffff", dark: "#c3d6ea", extra: "#a7c0da" },
  [T.ICE]: { base: "#8fc8e8", light: "#c6ecff", dark: "#6ba4c9", extra: "#e8fbff" },
  [T.MUD]: { base: "#4a3626", light: "#5c4530", dark: "#33251a", extra: "#281c13" },
  [T.ASH]: { base: "#544c52", light: "#6d6369", dark: "#3b3439", extra: "#c76b3a" },
  [T.OBSIDIAN]: { base: "#2c2440", light: "#463a63", dark: "#1c1729", extra: "#8a63d2" },
  [T.CLAY]: { base: "#9c6048", light: "#b57459", dark: "#7a4834", extra: "#5f392a" },
  [T.GRAVEL]: { base: "#7b746c", light: "#98907f", dark: "#5b554e", extra: "#453f3a" },
  [T.BRICK]: { base: "#6e7079", light: "#8a8d97", dark: "#4e505a", extra: "#3a3c44" },
  [T.SEAL]: { base: "#241d33", light: "#3b3153", dark: "#15101f", extra: "#ffb648" },
  [T.GLASS]: { base: "#a9dcef", light: "#dff5ff", dark: "#7fb6cc", extra: "#ffffff" },
  [T.COAL]: { base: "#7a7f8c", light: "#989fae", dark: "#5a5f6b", extra: "#23242a" },
  [T.COPPER]: { base: "#7a7f8c", light: "#989fae", dark: "#5a5f6b", extra: "#c9743a" },
  [T.IRON]: { base: "#7a7f8c", light: "#989fae", dark: "#5a5f6b", extra: "#bfa795" },
  [T.SILVER]: { base: "#7a7f8c", light: "#989fae", dark: "#5a5f6b", extra: "#dbe6f2" },
  [T.GOLD]: { base: "#7a7f8c", light: "#989fae", dark: "#5a5f6b", extra: "#f0c33c" },
  [T.CRYSTAL]: { base: "#7a7f8c", light: "#989fae", dark: "#5a5f6b", extra: "#74e8ff" },
  [T.RUBY]: { base: "#7a7f8c", light: "#989fae", dark: "#5a5f6b", extra: "#ff4f75" },
  [T.AMBER]: { base: "#7a7f8c", light: "#989fae", dark: "#5a5f6b", extra: "#ffb03a" },
};

type Painter = (s: Sheet, ox: number, oy: number, v: number, rnd: () => number) => void;

const soilPaint: Painter = (s, ox, oy, _v, rnd) => {
  s.rect(ox, oy, 16, 16, s._base);
  s.speckle(46, ox, oy, 16, 16, [s._light, s._dark, s._dark], rnd, 190);
  for (let i = 0; i < 4; i++) {
    s.blob(ox + 2 + rnd() * 12, oy + 2 + rnd() * 12, 1.6 + rnd() * 1.8, s._dark, 140, 0.5, rnd);
  }
  s.px(ox + ((rnd() * 16) | 0), oy + ((rnd() * 16) | 0), s._extra ?? s._dark, 255);
  s.rect(ox, oy, 16, 1, s._light, 70);
};

function palOf(p: Partial<Pal>) {
  return {
    _base: C(p.base || "#6f7484"), _light: C(p.light || "#8b90a0"),
    _dark: C(p.dark || "#4a4f5a"), _extra: p.extra ? C(p.extra) : C("#3a3f48"),
  };
}

const rockPaint: Painter = (s, ox, oy, _v, rnd) => {
  s.rect(ox, oy, 16, 16, s._base);
  s.speckle(38, ox, oy, 16, 16, [s._light, s._light, s._dark], rnd, 170);
  for (let i = 0; i < 2; i++) {
    const x0 = ox + rnd() * 14, y0 = oy + rnd() * 12;
    s.line(x0, y0, x0 + (rnd() * 7 - 3), y0 + 3 + rnd() * 4, s._dark, 150);
  }
  s.rect(ox, oy + 15, 16, 1, s._dark, 80);
  s.rect(ox, oy, 16, 1, s._light, 60);
};

const orePaint: Painter = (s, ox, oy, _v, rnd) => {
  rockPaint(s, ox, oy, 0, rnd);
  const n = 3 + ((rnd() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const cx = ox + 3 + rnd() * 10, cy = oy + 3 + rnd() * 10;
    s.blob(cx, cy, 1.8 + rnd() * 1.5, s._extra!, 255, 0.4, rnd);
    s.px(cx - 1, cy - 1, shade(s._extra!, 1.55), 255);
    s.px(cx + 1, cy + 1, shade(s._extra!, 0.62), 255);
  }
};

const gemPaint: Painter = (s, ox, oy, _v, rnd) => {
  rockPaint(s, ox, oy, 0, rnd);
  for (let i = 0; i < 3; i++) {
    const cx = ox + 4 + rnd() * 8, cy = oy + 6 + rnd() * 6;
    const h = 3 + ((rnd() * 3) | 0), w = 2;
    s.line(cx, cy - h, cx + w, cy, s._extra!, 255);
    s.line(cx + w, cy, cx, cy + 1, s._extra!, 255);
    s.line(cx, cy + 1, cx - w, cy, s._extra!, 255);
    s.line(cx - w, cy, cx, cy - h, s._extra!, 255);
    s.rect(cx - w + 1, cy - h + 1, w * 2 - 1, h, shade(s._extra!, 0.8), 210);
    s.px(cx - 1, cy - h + 1, [255, 255, 255], 220);
  }
};

const grassPaint: Painter = (s, ox, oy, _v, rnd) => {
  soilPaint(s, ox, oy, 0, rnd);
  const g = C("#4fa63c"), gl = C("#69c94d"), gd = C("#2f7a2e");
  const top = 4 + ((rnd() * 2) | 0);
  s.rect(ox, oy, 16, top, g);
  s.rect(ox, oy, 16, 1, gl);
  for (let x = 0; x < 16; x++) {
    const d = top + ((rnd() * 3) | 0);
    s.rect(ox + x, oy + top, 1, d - top, gd, 120);
    if (rnd() < 0.3) s.px(ox + x, oy + 1, C("#8ae06a"), 255);
  }
  if (rnd() < 0.28) {
    const fx = ox + 2 + ((rnd() * 12) | 0);
    s.px(fx, oy + 1, C("#f2e05a"), 255);
    s.px(fx - 1, oy + 2, C("#f28cb1"), 255);
    s.px(fx + 1, oy + 2, C("#f28cb1"), 255);
  }
};

const leafPaint: Painter = (s, ox, oy, _v, rnd) => {
  for (let i = 0; i < 70; i++) {
    const x = (rnd() * 16) | 0, y = (rnd() * 16) | 0;
    const c = rnd() < 0.5 ? s._light : rnd() < 0.7 ? s._base : s._dark;
    s.px(ox + x, oy + y, c, rnd() < 0.07 ? 0 : 255);
  }
  for (let i = 0; i < 4; i++) s.blob(ox + rnd() * 16, oy + rnd() * 16, 2 + rnd() * 2, s._extra!, 110, 0.5, rnd);
};

const logPaint: Painter = (s, ox, oy, _v, rnd) => {
  s.rect(ox, oy, 16, 16, s._base);
  for (let x = 0; x < 16; x++) {
    const f = Math.sin(x * 0.9 + rnd() * 0.4);
    s.rect(ox + x, oy, 1, 16, f > 0.5 ? s._light : f < -0.5 ? s._dark : s._base);
  }
  s.speckle(20, ox, oy, 16, 16, [s._dark, s._extra ?? s._dark], rnd, 120);
  if (rnd() < 0.5) {
    const kx = ox + 3 + ((rnd() * 9) | 0), ky = oy + 4 + ((rnd() * 8) | 0);
    s.blob(kx, ky, 2.2, s._dark, 255, 0.2, rnd);
    s.px(kx, ky, s._extra ?? s._dark, 255);
  }
  s.rect(ox, oy, 1, 16, s._dark, 90);
  s.rect(ox + 15, oy, 1, 16, s._dark, 90);
};

const plankPaint: Painter = (s, ox, oy, v, rnd) => {
  s.rect(ox, oy, 16, 16, s._base);
  for (let y = 0; y < 16; y += 5) {
    s.rect(ox, oy + y, 16, 1, s._dark);
    s.rect(ox, oy + y + 1, 16, 1, shade(s._light, 1.02), 110);
  }
  s.rect(ox + ((v * 7) % 16), oy, 1, 16, s._dark, 140);
  s.speckle(16, ox, oy, 16, 16, [s._light, s._dark], rnd, 90);
  s.px(ox + 2, oy + 2, C("#d9d9d9"), 200);
  s.px(ox + 13, oy + 12, C("#d9d9d9"), 200);
};

const snowPaint: Painter = (s, ox, oy, _v, rnd) => {
  s.rect(ox, oy, 16, 16, s._base);
  s.speckle(30, ox, oy, 16, 16, [s._light, s._dark], rnd, 130);
  s.rect(ox, oy, 16, 2, s._light);
  s.rect(ox, oy + 13, 16, 3, s._extra!, 90);
};

const icePaint: Painter = (s, ox, oy, _v, rnd) => {
  s.rect(ox, oy, 16, 16, s._base);
  for (let i = 0; i < 5; i++) {
    const x = ox + rnd() * 16, y = oy + rnd() * 16;
    s.line(x, y, x + rnd() * 8 - 4, y + rnd() * 8, s._light, 200);
  }
  s.rect(ox, oy, 16, 1, s._extra!, 190);
  s.speckle(10, ox, oy, 16, 16, [s._extra!], rnd, 150);
  s.rect(ox, oy + 15, 16, 1, s._dark, 120);
};

const glassPaint: Painter = (s, ox, oy) => {
  s.rect(ox, oy, 16, 16, s._base, 66);
  s.rect(ox, oy, 16, 1, s._light, 210);
  s.rect(ox, oy + 15, 16, 1, s._dark, 180);
  s.rect(ox, oy, 1, 16, s._light, 160);
  s.rect(ox + 15, oy, 1, 16, s._dark, 160);
  s.line(ox + 3, oy + 11, ox + 11, oy + 3, [255, 255, 255], 110);
};

const obsidianPaint: Painter = (s, ox, oy, _v, rnd) => {
  s.rect(ox, oy, 16, 16, s._base);
  for (let i = 0; i < 8; i++) {
    const x = ox + rnd() * 14, y = oy + rnd() * 13;
    s.line(x, y, x + 2 + rnd() * 4, y + 2 + rnd() * 2, s._light, 140);
  }
  s.speckle(14, ox, oy, 16, 16, [s._extra!], rnd, 80);
};

const brickPaint: Painter = (s, ox, oy, v, rnd) => {
  s.rect(ox, oy, 16, 16, s._dark);
  const bh = 4;
  for (let row = 0, y = 0; y < 16; y += bh, row++) {
    const off = (row % 2) * 4 + ((v * 3) % 4);
    for (let x = -off; x < 16; x += 8) {
      const w = Math.min(7, 16 - x);
      if (w <= 0) continue;
      s.rect(ox + x, oy + y, w, bh - 1, rnd() < 0.3 ? s._light : s._base);
    }
  }
  s.speckle(12, ox, oy, 16, 16, [s._extra!], rnd, 80);
};

const shroomPaint: Painter = (s, ox, oy) => {
  const stem = C("#d9e8d0"), cap = C("#63e0ff"), capD = C("#2ba9d6");
  s.rect(ox + 6, oy + 9, 4, 7, stem);
  s.rect(ox + 8, oy + 9, 2, 7, shade(stem, 0.8));
  for (let x = -5; x <= 5; x++) {
    const h = Math.max(1, Math.round(Math.cos((x / 5) * 1.5) * 5));
    s.rect(ox + 8 + x, oy + 9 - h, 1, h, x < 0 ? cap : capD);
  }
  s.rect(ox + 5, oy + 5, 6, 1, [255, 255, 255], 190);
};

const torchPaint: Painter = (s, ox, oy) => {
  const wood = C("#8a5a2f"), woodD = C("#5e3c1e");
  s.rect(ox + 7, oy + 7, 2, 9, wood);
  s.rect(ox + 7, oy + 11, 1, 5, woodD);
  s.rect(ox + 6, oy + 4, 4, 4, C("#ff9b3d"));
  s.rect(ox + 6, oy + 2, 4, 2, C("#ffd76b"));
  s.px(ox + 7, oy + 1, C("#fff6d0"), 255);
  s.rect(ox + 5, oy + 6, 6, 1, C("#ff6b2c"), 200);
};

const benchPaint: Painter = (s, ox, oy) => {
  const w = C("#9a6b3d"), wd = C("#6b4726");
  s.rect(ox + 1, oy + 6, 14, 3, w);
  s.rect(ox + 1, oy + 8, 14, 1, wd);
  s.rect(ox + 2, oy + 9, 2, 7, wd);
  s.rect(ox + 12, oy + 9, 2, 7, wd);
  s.rect(ox + 4, oy + 12, 8, 2, wd);
  s.line(ox + 4, oy + 5, ox + 8, oy + 2, C("#c9ccd4"), 255);
  s.rect(ox + 9, oy + 2, 3, 2, C("#d98c3a"));
  s.rect(ox + 3, oy + 3, 3, 2, C("#e0e6ef"), 230);
};

const furnacePaint: Painter = (s, ox, oy) => {
  const st = C("#6f6a67"), sd = C("#4a4644"), sl = C("#8f8a86");
  s.rect(ox, oy + 1, 16, 15, st);
  s.rect(ox, oy + 1, 16, 1, sl);
  s.speckle(22, ox, oy + 1, 16, 15, [sd, sl], Math.random, 130);
  s.rect(ox + 4, oy + 8, 8, 7, C("#241c18"));
  s.rect(ox + 5, oy + 11, 6, 4, C("#ff7a2e"));
  s.rect(ox + 6, oy + 12, 4, 3, C("#ffd166"));
  s.rect(ox + 4, oy + 5, 8, 1, sd);
};

const chestPaint: Painter = (s, ox, oy) => {
  const w = C("#8b5a2b"), wd = C("#5e3a1b"), gold = C("#e8b93c");
  s.rect(ox + 1, oy + 3, 14, 12, w);
  s.rect(ox + 1, oy + 3, 14, 4, shade(w, 1.18));
  s.rect(ox + 1, oy + 12, 14, 3, wd);
  s.rect(ox + 1, oy + 3, 1, 12, wd);
  s.rect(ox + 14, oy + 3, 1, 12, wd);
  s.rect(ox + 1, oy + 8, 14, 1, gold);
  s.rect(ox + 7, oy + 6, 2, 5, gold);
  s.px(ox + 7, oy + 9, C("#3a2a10"), 255);
};

const anvilPaint: Painter = (s, ox, oy) => {
  const i1 = C("#565b66"), i2 = C("#33373f"), i3 = C("#7b8290");
  s.rect(ox + 2, oy + 6, 12, 3, i1);
  s.rect(ox + 3, oy + 5, 9, 1, i3);
  s.rect(ox + 12, oy + 6, 2, 3, i1);
  s.rect(ox + 6, oy + 9, 4, 4, i2);
  s.rect(ox + 3, oy + 13, 10, 2, i1);
  s.rect(ox + 2, oy + 6, 12, 1, i3, 200);
};

const sealPaint: Painter = (s, ox, oy) => {
  s.rect(ox, oy, 16, 16, C("#221b31"));
  s.rect(ox, oy, 16, 1, C("#3d3357"));
  const g = C("#ffb648");
  s.rect(ox + 3, oy + 3, 10, 10, shade(g, 0.35), 90);
  for (let i = 0; i < 4; i++) {
    const x = ox + 5 + ((i % 2) * 4), y = oy + 5 + ((i >> 1) * 4);
    s.rect(x, y, 2, 2, g, 255);
    s.px(x, y, C("#fff1cf"), 255);
  }
  s.line(ox + 8, oy + 2, ox + 8, oy + 14, g, 120);
  s.line(ox + 2, oy + 8, ox + 14, oy + 8, g, 120);
};

const wallDirt: Painter = (s, ox, oy) => {
  const r = Math.random;
  s.rect(ox, oy, 16, 16, C("#3d2c1e"));
  for (let y = 0; y < 16; y += 4) {
    s.rect(ox, oy + y, 16, 1, C("#2b1e14"));
    for (let x = ((y / 4) % 2) * 4 - 4; x < 16; x += 8) s.rect(ox + x, oy + y, 1, 4, C("#2b1e14"), 200);
  }
  s.speckle(26, ox, oy, 16, 16, [C("#4b3626"), C("#302116")], r, 150);
};
const wallStone: Painter = (s, ox, oy) => {
  const r = Math.random;
  s.rect(ox, oy, 16, 16, C("#3c4049"));
  for (let y = 0; y < 16; y += 5) {
    s.rect(ox, oy + y, 16, 1, C("#2b2e35"));
    for (let x = ((y / 5) % 2) * 5 - 5; x < 16; x += 10) s.rect(ox + x, oy + y, 1, 5, C("#2b2e35"), 220);
  }
  s.speckle(24, ox, oy, 16, 16, [C("#4a4f5a"), C("#31343b")], r, 150);
};
const wallWood: Painter = (s, ox, oy) => {
  const r = Math.random;
  s.rect(ox, oy, 16, 16, C("#4d3520"));
  for (let x = 0; x < 16; x += 4) s.rect(ox + x, oy, 1, 16, C("#3a2716"));
  s.speckle(20, ox, oy, 16, 16, [C("#5c4127"), C("#33200f")], r, 140);
};

/* ---------- atlas build ---------- */
let atlas: HTMLCanvasElement | null = null;

export function buildAtlas(): HTMLCanvasElement {
  if (atlas) return atlas;
  const s = new Sheet(TILE * VARIANTS, TILE * ATLAS_ROWS);
  const paint = (row: number, pal: Pal, fn: Painter) => {
    for (let v = 0; v < VARIANTS; v++) {
      const rnd = mulberry32(1000 + row * 37 + v * 7);
      Object.assign(s, palOf(pal));
      s.clip(v * TILE, row * TILE, TILE, TILE);
      fn(s, v * TILE, row * TILE, v, rnd);
    }
  };
  const P = (t: number) => PAL[t] ?? PAL[T.STONE];
  for (let t = 0; t < TILE_COUNT; t++) {
    switch (t) {
      case T.AIR: continue;
      case T.DIRT: case T.CLAY: case T.GRAVEL: case T.MUD: case T.ASH: case T.SAND:
        paint(t, P(t), soilPaint); break;
      case T.GRASS: paint(t, P(t), grassPaint); break;
      case T.STONE: paint(t, P(t), rockPaint); break;
      case T.SNOW: paint(t, P(t), snowPaint); break;
      case T.ICE: paint(t, P(t), icePaint); break;
      case T.WOOD: paint(t, P(t), plankPaint); break;
      case T.TRUNK: paint(t, P(t), logPaint); break;
      case T.LEAF: case T.JLEAF: paint(t, P(t), leafPaint); break;
      case T.OBSIDIAN: case T.SEAL: paint(t, P(t), t === T.SEAL ? sealPaint : obsidianPaint); break;
      case T.BRICK: paint(t, P(t), brickPaint); break;
      case T.GLASS: paint(t, P(t), glassPaint); break;
      case T.COAL: case T.COPPER: case T.IRON: case T.SILVER: case T.GOLD:
        paint(t, P(t), orePaint); break;
      case T.CRYSTAL: case T.RUBY: case T.AMBER: paint(t, P(t), gemPaint); break;
      case T.TORCH: paint(t, P(t), torchPaint); break;
      case T.CHEST: paint(t, P(t), chestPaint); break;
      case T.WORKBENCH: paint(t, P(t), benchPaint); break;
      case T.FURNACE: paint(t, P(t), furnacePaint); break;
      case T.ANVIL: paint(t, P(t), anvilPaint); break;
      case T.GLOWSHROOM: paint(t, P(T.STONE), shroomPaint); break;
      default: paint(t, P(t), rockPaint);
    }
  }
  paint(TILE_COUNT + W.DIRT, {} as Pal, wallDirt);
  paint(TILE_COUNT + W.STONE, {} as Pal, wallStone);
  paint(TILE_COUNT + W.WOOD, {} as Pal, wallWood);
  paint(TILE_COUNT + W.BRICK, {} as Pal, wallStone);
  atlas = s.toCanvas();
  return atlas;
}
export function getAtlas(): HTMLCanvasElement { return atlas ?? buildAtlas(); }
export function variantFor(x: number, y: number) { return (hash2(x, y, 4) * VARIANTS) | 0; }

/* ============================================================
   ITEM ICONS (32x32 pixel art, cached as data URLs)
   ============================================================ */
function metalOf(id: string): string {
  if (id.includes("copper")) return "#c9743a";
  if (id.includes("iron")) return "#b6a89d";
  if (id.includes("silver")) return "#dbe6f2";
  if (id.includes("gold")) return "#f0c33c";
  if (id.includes("obsidian")) return "#5b4a86";
  if (id.includes("crystal")) return "#74e8ff";
  if (id.includes("molten") || id.includes("ember")) return "#ff7a2e";
  if (id.includes("frost")) return "#8fd3ff";
  if (id.includes("ancient") || id.includes("golem")) return "#a8e06a";
  if (id.includes("wooden")) return "#9a6b3d";
  return "#c9ccd4";
}

function drawItemArt(id: string, s: Sheet) {
  const it = itemDef(id);
  const m = C(metalOf(id));
  const md = shade(m, 0.62), ml = shade(m, 1.32);
  const wood = C("#9a6b3d"), woodD = C("#6b4726");
  const k = it.kind;

  if (k === "sword") {
    s.line(8, 25, 23, 5, md);
    s.line(9, 26, 24, 6, m);
    s.line(10, 24, 22, 8, ml);
    s.line(22, 6, 25, 4, ml);
    s.rect(5, 22, 8, 3, shade(m, 0.85));
    s.rect(6, 23, 6, 1, C("#f6e05e"));
    s.line(4, 26, 2, 29, woodD);
    s.rect(1, 28, 3, 3, C("#e8b93c"));
    s.px(14, 16, C("#ffffff"), 200);
    if (it.light) s.rect(19, 8, 4, 4, C("#ffd08a"), 210);
    return;
  }
  if (it.pick) {
    s.line(4, 28, 15, 10, woodD);
    s.line(5, 28, 16, 11, wood);
    s.line(8, 12, 26, 21, md);
    s.line(7, 10, 25, 19, m);
    s.rect(6, 9, 4, 3, ml); s.rect(22, 18, 4, 3, ml);
    s.rect(14, 9, 4, 4, shade(m, 0.9));
    return;
  }
  if (it.axe) {
    s.line(6, 29, 17, 9, woodD);
    s.line(7, 29, 18, 10, wood);
    s.rect(15, 6, 10, 9, md);
    s.rect(16, 7, 8, 7, m);
    s.rect(16, 6, 8, 2, ml);
    s.rect(23, 8, 3, 6, shade(m, 0.75));
    s.rect(14, 8, 2, 5, shade(m, 0.5));
    return;
  }
  if (k === "bow") {
    for (let a = -75; a <= 75; a += 2) {
      const r = 12, x = 10 + Math.cos(a * 0.01745) * r, y = 16 + Math.sin(a * 0.01745) * r;
      s.px(x, y, m); s.px(x - 1, y, md);
    }
    s.line(10, 4, 10, 28, C("#e3e8ef"), 230);
    s.rect(11, 14, 4, 4, shade(m, 0.8));
    s.line(8, 16, 26, 16, wood);
    s.rect(24, 14, 4, 5, ml);
    s.line(26, 15, 29, 16, md);
    return;
  }
  if (k === "ammo") {
    s.line(6, 26, 21, 9, wood);
    s.line(5, 27, 20, 10, woodD);
    s.line(20, 8, 26, 5, m); s.rect(21, 6, 5, 4, shade(m, 0.9));
    s.px(24, 6, ml, 255);
    s.rect(3, 24, 5, 2, C("#e6e6e6")); s.rect(4, 26, 4, 2, C("#c9c9c9"));
    if (id.includes("flaming")) s.rect(19, 3, 8, 6, C("#ff8f2e"), 200);
    if (id.includes("frost")) s.rect(19, 3, 8, 6, C("#9fe4ff"), 190);
    return;
  }
  if (k === "magic") {
    s.line(4, 29, 18, 13, C("#4a3b57"));
    s.line(5, 29, 19, 14, C("#6b5578"));
    s.rect(2, 26, 5, 5, C("#c9a227"));
    s.disc(22, 10, 5, shade(m, 0.75));
    s.disc(22, 10, 4, m);
    s.disc(21, 9, 2, ml);
    s.px(20, 8, [255, 255, 255], 255);
    return;
  }
  if (k === "armor" && it.equipSlot) {
    const trim = shade(m, 0.75);
    if (it.equipSlot === "helm") {
      s.rect(9, 8, 14, 12, m);
      s.rect(9, 8, 14, 3, ml);
      s.rect(11, 14, 10, 4, C("#20232b"));
      s.rect(12, 15, 3, 2, C("#8fd3ff")); s.rect(17, 15, 3, 2, C("#8fd3ff"));
      s.rect(9, 19, 14, 3, trim);
      s.rect(14, 5, 4, 4, trim);
    } else if (it.equipSlot === "chest") {
      s.rect(8, 8, 16, 14, m);
      s.rect(8, 8, 16, 3, ml);
      s.rect(4, 9, 4, 9, trim); s.rect(24, 9, 4, 9, trim);
      s.rect(14, 12, 4, 8, shade(m, 0.55));
      s.rect(10, 20, 12, 2, trim);
    } else {
      s.rect(9, 7, 14, 4, ml);
      s.rect(9, 11, 6, 14, m); s.rect(17, 11, 6, 14, m);
      s.rect(8, 22, 7, 3, trim); s.rect(17, 22, 7, 3, trim);
      s.rect(9, 11, 1, 14, shade(m, 1.2)); s.rect(17, 11, 1, 14, shade(m, 1.2));
    }
    return;
  }
  if (k === "accessory") {
    switch (it.acc) {
      case "speed":
        s.rect(7, 9, 8, 10, C("#8b5a2b")); s.rect(7, 18, 16, 5, C("#6b4726"));
        s.rect(7, 7, 9, 3, C("#e8b93c")); s.line(18, 12, 27, 8, C("#ffe9a8"), 200);
        break;
      case "crit":
        s.disc(16, 16, 9, C("#c99a1c")); s.disc(16, 16, 8, C("#f0c33c"));
        s.disc(16, 16, 6, C("#ffe89a"));
        s.rect(15, 11, 3, 10, C("#b98a1c")); s.rect(11, 15, 11, 3, C("#b98a1c"));
        break;
      case "regen":
        s.rect(7, 13, 18, 6, C("#4b8f5a")); s.rect(7, 13, 18, 2, C("#79c98a"));
        s.rect(14, 10, 4, 12, C("#e05a7a")); s.rect(11, 14, 10, 4, C("#e05a7a"));
        break;
      case "melee": case "ranged":
        s.disc(16, 16, 10, it.acc === "melee" ? C("#c9553a") : C("#3a86c9"));
        s.disc(16, 16, 7, C("#f0e0b0"));
        if (it.acc === "melee") { s.line(11, 21, 21, 10, C("#c9ccd4")); s.line(11, 10, 21, 21, C("#c9ccd4")); }
        else { s.line(10, 22, 22, 10, C("#e3e8ef")); s.rect(20, 8, 4, 4, C("#8fd3ff")); }
        break;
      case "wings":
        s.rect(14, 9, 4, 14, C("#dfe4ea"));
        for (let i = 0; i < 7; i++) {
          s.line(14, 11 + i * 2, 10 - i, 7 + i * 3, C("#f4f7fb"));
          s.line(18, 11 + i * 2, 22 + i, 7 + i * 3, C("#f4f7fb"));
        }
        break;
      case "fireproof":
        s.disc(16, 18, 8, C("#ff7a2e")); s.disc(16, 18, 5, C("#ffd166"));
        s.rect(12, 5, 8, 4, C("#6b4726"));
        break;
      case "heart":
        s.rect(10, 10, 5, 5, C("#e0355a")); s.rect(17, 10, 5, 5, C("#e0355a"));
        s.rect(9, 13, 14, 5, C("#ff4d6a")); s.rect(11, 18, 10, 3, C("#e0355a"));
        s.rect(13, 21, 6, 2, C("#b02040")); s.rect(11, 11, 3, 2, C("#ff9fb0"));
        break;
      default:
        s.disc(16, 16, 8, m);
    }
    return;
  }
  if (k === "consumable") {
    if (id === "apple") {
      s.disc(16, 18, 8, C("#3fbf6a")); s.disc(15, 17, 5, C("#57e08a"));
      s.disc(13, 15, 2, C("#c8ffd8"));
      s.line(16, 10, 18, 5, C("#6b4726"));
      s.rect(19, 5, 5, 2, C("#4fa63c"));
      return;
    }
    s.rect(14, 4, 5, 3, C("#8fb8c9"));
    s.rect(12, 7, 9, 3, C("#b9d9e6"), 190);
    s.rect(9, 10, 15, 18, C("#cbe6f2"), 110);
    s.rect(10, 14, 13, 12, id === "mana_potion" ? C("#5a6ae0") : C("#e04b6a"));
    s.rect(10, 14, 13, 2, id === "mana_potion" ? C("#9aa6ff") : C("#ff8fa3"));
    s.rect(12, 18, 2, 4, [255, 255, 255], 150);
    return;
  }
  switch (id) {
    case "gel":
      s.disc(16, 20, 9, C("#3f8f6a")); s.disc(16, 19, 7, C("#7fe0b0"));
      s.rect(11, 14, 4, 2, [255, 255, 255], 190);
      return;
    case "bone":
      s.line(9, 24, 23, 9, C("#e9e6dc"));
      s.line(10, 25, 24, 10, C("#c6c1b2"));
      s.rect(6, 22, 5, 4, C("#f2efe6")); s.rect(21, 6, 5, 4, C("#f2efe6"));
      return;
    case "silk":
      for (let i = 0; i < 5; i++) s.line(6, 8 + i * 5, 26, 4 + i * 5, C("#e6ecf5"), 230);
      s.disc(16, 16, 8, C("#f7fbff"));
      s.disc(16, 16, 6, C("#dfe9f5"));
      return;
    case "coin":
      s.disc(16, 16, 10, C("#c99a1c")); s.disc(16, 16, 9, C("#f0c33c"));
      s.rect(15, 11, 3, 10, C("#b98a1c")); s.rect(11, 15, 11, 3, C("#b98a1c"));
      s.rect(12, 9, 4, 2, C("#fff3c4"));
      return;
    case "ember_core":
      s.disc(16, 16, 9, C("#a02c0d")); s.disc(16, 16, 6, C("#ff7a2e"));
      s.disc(15, 14, 2, C("#ffe08a"));
      return;
    case "frost_shard":
      s.line(16, 4, 22, 18, C("#8fd3ff")); s.line(16, 4, 10, 18, C("#8fd3ff"));
      s.line(10, 18, 16, 28, C("#4b96d0")); s.line(22, 18, 16, 28, C("#4b96d0"));
      s.rect(13, 10, 6, 12, C("#bfeaff"), 200);
      s.px(14, 9, [255, 255, 255], 240);
      return;
    case "ancient_core":
      s.disc(16, 16, 10, C("#2f4a2c")); s.disc(16, 16, 6, C("#7ec95a"));
      s.rect(14, 11, 4, 9, C("#d7ff9a"), 220);
      return;
    case "coal":
      s.disc(16, 17, 8, C("#1f2025")); s.disc(15, 15, 4, C("#4a4d59"));
      s.px(13, 13, C("#6f7484"), 255);
      return;
    case "copper_ore": case "iron_ore": case "silver_ore": case "gold_ore":
      s.disc(16, 17, 9, C("#6f7484")); s.disc(16, 17, 7, C("#565b66"));
      for (let i = 0; i < 4; i++) {
        const x = 10 + ((i * 7) % 11), y = 12 + ((i * 5) % 8);
        s.rect(x, y, 4, 3, m); s.px(x + 1, y, ml);
      }
      return;
    case "crystal": case "ruby": case "amber":
      s.line(16, 3, 24, 17, m); s.line(16, 3, 8, 17, m);
      s.line(8, 17, 16, 29, md); s.line(24, 17, 16, 29, md);
      s.rect(13, 8, 6, 14, m, 230);
      s.line(16, 5, 16, 27, ml, 200);
      s.px(14, 8, [255, 255, 255], 250);
      return;
    default: break;
  }
  if (id.endsWith("_bar")) {
    s.rect(8, 12, 16, 9, md);
    s.rect(6, 20, 20, 4, md);
    s.rect(9, 11, 14, 3, m);
    s.rect(10, 10, 12, 2, ml);
    s.rect(7, 23, 18, 1, shade(m, 0.45));
    s.line(11, 14, 20, 14, shade(m, 1.2), 110);
    return;
  }
  s.rect(9, 9, 14, 14, md);
  s.rect(10, 10, 12, 6, m);
  s.rect(10, 10, 12, 2, ml);
}

const iconCache = new Map<string, string>();
const artCache = new Map<string, HTMLCanvasElement>();

export function itemCanvas(id: string): HTMLCanvasElement {
  let cv = artCache.get(id);
  if (cv) return cv;
  const it = ITEMS[id];
  cv = document.createElement("canvas");
  cv.width = ICON; cv.height = ICON;
  if (it && it.kind === "block" && it.tile) {
    const ctx = cv.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(getAtlas(), 0, it.tile * TILE, TILE, TILE, 0, 0, ICON, ICON);
  } else {
    const sh = new Sheet(ICON, ICON);
    sh.clip(0, 0, ICON, ICON);
    drawItemArt(id, sh);
    cv = sh.toCanvas();
  }
  artCache.set(id, cv);
  return cv;
}

export function itemIcon(id: string): string {
  const hit = iconCache.get(id);
  if (hit !== undefined) return hit;
  const url = itemCanvas(id).toDataURL();
  iconCache.set(id, url);
  return url;
}

/** draw an item icon straight into a canvas (used for in-world drops) */
export function drawItemOnCanvas(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, size: number) {
  ctx.drawImage(itemCanvas(id), x, y, size, size);
}

/* liquid colours (drawn per-frame, no textures) */
export const WATER_TOP = C("#4b96f0");
export const WATER_BODY = C("#2a63c4");
export const LAVA_TOP = C("#ffb03a");
export const LAVA_BODY = C("#d4471a");
