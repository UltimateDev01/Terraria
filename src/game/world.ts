/* ============================================================
   World: tile storage, procedural generation, chunk cache,
   tile based lighting (sky light + block light propagation).
   ============================================================ */
import { T, TILE, TILE_COUNT, TL, W } from "./defs";
import { fbm, fbm1, hash2, mulberry32, ridge } from "./noise";
import { getAtlas, variantFor } from "./textures";

export const CH = 16;                 // tiles per chunk side
export const CHUNK_PX = CH * TILE;
export const LW = 176, LH = 132;      // lighting region size (tiles)

export interface ItemStack { id: string; n: number }

export const WORLD_SIZES = {
  small: { w: 520, h: 230, label: "Small", note: "Quick to explore" },
  medium: { w: 860, h: 280, label: "Medium", note: "Balanced world" },
  large: { w: 1280, h: 340, label: "Large", note: "Deep & endless" },
} as const;
export type SizeKey = keyof typeof WORLD_SIZES;

export const B_FOREST = 0, B_DESERT = 1, B_JUNGLE = 2, B_SNOW = 3;
export const D_NORMAL = 0, D_FROZEN = 1, D_SCORCHED = 2;
export const BIOME_NAMES = ["Meadow", "Ashen Sands", "Wild Jungle", "Frostfall"];
export const DEEP_NAMES = ["Caverns", "Frozen Depths", "Scorched Chasm"];

export class World {
  w: number; h: number; seed: number;
  tiles: Uint8Array;
  walls: Uint8Array;
  surf: Int16Array;
  biome: Uint8Array;
  deep: Uint8Array;
  chests = new Map<number, ItemStack[]>();
  bossSummoned = false;
  spawnX = 0;
  spawnY = 0;

  skyL: Uint8Array;
  blkL: Uint8Array;
  q: Int32Array;

  lx0 = 0; ly0 = 0;
  lightCanvas: HTMLCanvasElement;
  lightImg: ImageData;
  lightReady = false;

  chunks = new Map<number, HTMLCanvasElement>();
  chunkOrder: number[] = [];
  dirty = new Set<number>();
  lightDirty = true;

  constructor(w: number, h: number, seed: number) {
    this.w = w; this.h = h; this.seed = seed;
    this.tiles = new Uint8Array(w * h);
    this.walls = new Uint8Array(w * h);
    this.surf = new Int16Array(w);
    this.biome = new Uint8Array(w);
    this.deep = new Uint8Array(w);
    this.skyL = new Uint8Array(w * h);
    this.blkL = new Uint8Array(w * h);
    this.q = new Int32Array(LW * LH * 5);
    const cv = document.createElement("canvas");
    cv.width = LW; cv.height = LH;
    this.lightCanvas = cv;
    const ctx = cv.getContext("2d")!;
    this.lightImg = ctx.createImageData(LW, LH);
  }

  idx(x: number, y: number) { return (y | 0) * this.w + (x | 0); }
  inB(x: number, y: number) { x = x | 0; y = y | 0; return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x: number, y: number): number {
    const xi = x | 0, yi = y | 0;
    if (xi < 0 || yi < 0 || xi >= this.w) return T.AIR;
    if (yi >= this.h) return T.STONE;
    return this.tiles[yi * this.w + xi];
  }
  getWall(x: number, y: number): number {
    const xi = x | 0, yi = y | 0;
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return 0;
    return this.walls[yi * this.w + xi];
  }
  solid(x: number, y: number) { return TL.solid[this.get(x, y)] === 1; }
  liquid(x: number, y: number) { return TL.liquid[this.get(x, y)]; }
  blocksLight(x: number, y: number) { return TL.opaque[this.get(x, y)] === 1; }
  depth(x: number, y: number) {
    const cx = Math.max(0, Math.min(this.w - 1, x | 0));
    return y - this.surf[cx];
  }
  /** 0 = surface, 1 = caverns, 2 = the deep */
  layer(x: number, y: number) {
    if (this.depth(x, y) < 13) return 0;
    return y < this.h - 74 ? 1 : 2;
  }
  underground(x: number, y: number) { return this.depth(x, y) >= 8; }

  setTile(x: number, y: number, t: number, wall = -1) {
    if (!this.inB(x, y)) return;
    const i = y * this.w + x;
    this.tiles[i] = t;
    if (wall >= 0) this.walls[i] = wall;
    this.markDirty(x, y);
    this.lightDirty = true;
  }
  setWallAt(x: number, y: number, wv: number) {
    if (!this.inB(x, y)) return;
    this.walls[y * this.w + x] = wv;
    this.markDirty(x, y);
    this.lightDirty = true;
  }
  markDirty(x: number, y: number) {
    const cx = (x / CH) | 0, cy = (y / CH) | 0;
    const lx = x % CH, ly = y % CH;
    const cw = Math.ceil(this.w / CH), chh = Math.ceil(this.h / CH);
    const add = (a: number, b: number) => {
      if (a >= 0 && b >= 0 && a < cw && b < chh) this.dirty.add(b * 100000 + a);
    };
    add(cx, cy);
    if (lx === 0) add(cx - 1, cy);
    if (ly === 0) add(cx, cy - 1);
    if (lx === CH - 1) add(cx + 1, cy);
    if (ly === CH - 1) add(cx, cy + 1);
  }

  /* ============================================================
     GENERATION (stepped so the loading screen can animate)
     ============================================================ */
  *generate(): Generator<number> {
    const { w, h } = this;
    const rnd = mulberry32(this.seed);
    const s1 = this.seed & 0xffff, s2 = (this.seed >> 3) & 0xffff, s3 = (this.seed >> 7) & 0xffff;
    const base = Math.floor(h * 0.23);

    // --- heights & biomes ---
    for (let x = 0; x < w; x++) {
      const n = fbm1(x * 0.011, 4, s1) * 1.6 + fbm1(x * 0.043, 3, s1 + 11) * 0.6;
      let hh = base + Math.round((n - 1.1) * 30);
      hh = Math.max(10, Math.min(Math.floor(h * 0.42), hh));
      // flatten around spawn
      const dcx = Math.abs(x - w / 2);
      if (dcx < 26) hh = Math.round(hh * (1 - (26 - dcx) / 34) + this.surf[Math.max(0, x - 1)] * ((26 - dcx) / 34));
      this.surf[x] = hh;
      const bt = fbm1(x * 0.0032 + 40, 3, s2);
      let b = B_FOREST;
      if (bt > 0.615) b = B_DESERT;
      else if (bt < 0.375) b = B_JUNGLE;
      const edge = Math.min(x, w - x) / w;
      if (edge < 0.17 && fbm1(x * 0.02, 2, s2 + 5) > 0.34) b = B_SNOW;
      this.biome[x] = b;
      const dt = fbm1(x * 0.0026 + 90, 3, s3);
      this.deep[x] = dt > 0.585 ? D_SCORCHED : dt < 0.36 ? D_FROZEN : D_NORMAL;
      if ((x & 63) === 0) yield (x / w) * 0.16;
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let x = 1; x < w - 1; x++) {
        this.surf[x] = Math.round((this.surf[x - 1] + this.surf[x] * 2 + this.surf[x + 1]) / 4);
      }
    }
    yield 0.18;

    // --- material fill ---
    for (let x = 0; x < w; x++) {
      const top = this.surf[x];
      const b = this.biome[x], db = this.deep[x];
      const dirtDepth = 6 + Math.round(hash2(x, 1, s1) * 7);
      for (let y = top; y < h; y++) {
        const d = y - top;
        let t: number = T.AIR;
        if (d === 0) {
          t = b === B_DESERT ? T.SAND : b === B_JUNGLE ? T.GRASS : b === B_SNOW ? T.SNOW : T.GRASS;
        } else if (d < dirtDepth) {
          t = b === B_DESERT ? T.SAND : b === B_JUNGLE ? T.MUD : T.DIRT;
          if (b === B_SNOW && d < 3) t = T.SNOW;
          if (b === B_DESERT && hash2(x, y, s2) < 0.12) t = T.CLAY;
          if (db === D_FROZEN && d > dirtDepth - 3) t = T.DIRT;
        } else if (d < dirtDepth + 3 && hash2(x, y, 7) < 0.45) {
          t = b === B_DESERT ? T.SAND : T.CLAY;
        } else {
          t = T.STONE;
          if (db === D_FROZEN && y > h * 0.5 && hash2(x, y, 11) < 0.4) t = T.ICE;
          if (db === D_SCORCHED && y > h * 0.56 && hash2(x, y, 13) < 0.45) t = T.ASH;
          if (y > h * 0.94 && hash2(x, y, 17) < 0.35) t = T.OBSIDIAN;
          const r = hash2(x, y, 23);
          if (t === T.STONE || t === T.ICE || t === T.ASH) {
            const band = y / h;
            if (r < 0.012 + band * 0.012) t = T.COAL;
            else if (band > 0.16 && band < 0.62 && r > 0.3 && r < 0.336) t = T.COPPER;
            else if (band > 0.27 && band < 0.82 && r > 0.42 && r < 0.452) t = T.IRON;
            else if (band > 0.38 && r > 0.55 && r < 0.571) t = T.SILVER;
            else if (band > 0.48 && r > 0.66 && r < 0.679) t = T.GOLD;
            else if (band > 0.6 && r > 0.78 && r < 0.789) t = T.CRYSTAL;
            else if (band > 0.68 && r > 0.86 && r < 0.8675) t = T.RUBY;
            else if (band > 0.46 && db === D_SCORCHED && r > 0.9 && r < 0.909) t = T.AMBER;
            else if (band > 0.36 && b === B_JUNGLE && r > 0.82 && r < 0.832) t = T.AMBER;
          }
          if (y > h - 7 && hash2(x, y, 29) < 0.75) t = T.OBSIDIAN;
        }
        this.tiles[y * this.w + x] = t;
      }
      if ((x & 63) === 0) yield 0.18 + (x / w) * 0.2;
    }

    // --- caves ---
    for (let x = 0; x < w; x++) {
      const top = this.surf[x];
      for (let y = top + 8; y < h - 3; y++) {
        const i = y * this.w + x;
        if (this.tiles[i] === T.AIR) continue;
        const band = (y - top) / (h - top);
        const cave = fbm(x * 0.042, y * 0.072, 3, s1 + 101);
        const worm = ridge(x * 0.019, y * 0.031, s2 + 33, 2);
        const big = fbm(x * 0.02, y * 0.028, 2, s3 + 55);
        let carve = 0;
        if (band > 0.03 && cave > 0.652) carve = 1;
        if (band > 0.1 && worm > 0.775) carve = 1;
        if (band > 0.24 && big > 0.615) carve = 1;
        if (band > 0.52 && big > 0.53) carve = 1;
        if (band > 0.9) carve = 0;
        if (carve) {
          this.tiles[i] = T.AIR;
          if (this.deep[x] === D_SCORCHED && band > 0.6 && hash2(x, y, 41) < 0.45) this.tiles[i] = T.ASH;
          if (this.deep[x] === D_FROZEN && band > 0.45 && hash2(x, y, 43) < 0.3) this.tiles[i] = T.ICE;
        }
      }
      if ((x & 63) === 0) yield 0.38 + (x / w) * 0.2;
    }

    // --- background walls ---
    for (let x = 0; x < w; x++) {
      const top = this.surf[x];
      for (let y = 0; y < h; y++) {
        const i = y * this.w + x;
        if (y <= top) { this.walls[i] = W.NONE; continue; }
        const t = this.tiles[i];
        if (t !== T.AIR && !TL.liquid[t]) {
          this.walls[i] = y > this.h * 0.4 ? W.STONE : W.DIRT;
        } else {
          let near = 0;
          if (this.get(x - 2, y) !== T.AIR) near++;
          if (this.get(x + 2, y) !== T.AIR) near++;
          if (this.get(x, y - 2) !== T.AIR) near++;
          if (this.get(x, y + 2) !== T.AIR) near++;
          this.walls[i] = near >= 2 ? (y > this.h * 0.4 ? W.STONE : W.DIRT) : W.NONE;
        }
      }
      if ((x & 127) === 0) yield 0.58 + (x / w) * 0.07;
    }

    // --- liquids ---
    const waterTop = Math.floor(this.h * 0.48);
    for (let y = waterTop; y < this.h - 4; y++) {
      const band = (y - waterTop) / (this.h - waterTop);
      for (let x = 1; x < this.w - 1; x++) {
        const i = y * this.w + x;
        if (this.tiles[i] !== T.AIR || this.walls[i] === W.NONE) continue;
        if (!TL.solid[this.get(x, y + 1)]) continue;
        const deepLava = y > this.h - 34 || (this.deep[x] === D_SCORCHED && y > this.h * 0.64);
        if (deepLava) { if (hash2(x, y, 51) < 0.92) this.tiles[i] = T.LAVA; continue; }
        if (band < 0.42 && hash2(x, y, 53) < 0.5 - band) this.tiles[i] = T.WATER;
      }
      if ((y & 63) === 0) yield 0.65 + (y / this.h) * 0.05;
    }

    // --- trees & surface life ---
    for (let x = 3; x < w - 3; x++) {
      const b = this.biome[x];
      const top = this.surf[x];
      if (this.tiles[top * this.w + x] === T.AIR) continue;
      const r = hash2(x, 3, s1 + 71);
      const nearSpawn = Math.abs(x - (w >> 1)) < 7;
      if (!nearSpawn) {
        if (b === B_FOREST && r < 0.15) this.tree(x, top - 1, 5 + ((r * 400) | 0) % 4, false);
        else if (b === B_JUNGLE && r < 0.3) this.tree(x, top - 1, 8 + ((r * 600) | 0) % 6, true);
        else if (b === B_SNOW && r < 0.08) this.tree(x, top - 1, 4 + ((r * 300) | 0) % 3, false, true);
        else if (b === B_DESERT && r < 0.035) this.tree(x, top - 1, 3, false, false, true);
      }
      if ((x & 127) === 0) yield 0.7 + (x / w) * 0.07;
    }

    // --- underground decor & chests ---
    for (let x = 2; x < w - 2; x++) {
      const startY = this.surf[x] + 11;
      for (let y = startY; y < this.h - 6; y++) {
        const i = y * this.w + x;
        if (this.tiles[i] !== T.AIR) continue;
        if (!TL.solid[this.get(x, y + 1)]) continue;
        const r = hash2(x, y, s2 + 91);
        if (r < 0.007 && y < this.h - 44) this.tiles[i] = T.GLOWSHROOM;
        else if (r > 0.99885 && y > this.surf[x] + 26) this.placeChest(x, y, y / this.h);
      }
      if ((x & 63) === 0) yield 0.77 + (x / w) * 0.12;
    }

    // --- boss vaults ---
    const vaults = Math.max(2, Math.floor(w / 300));
    for (let v = 0; v < vaults; v++) {
      const vx = Math.floor((v + 0.5) * (w / vaults) + (rnd() - 0.5) * 50);
      const vy = Math.floor(this.h * (0.66 + rnd() * 0.16));
      this.vault(vx, vy);
    }
    yield 0.93;

    // --- spawn clearing ---
    this.spawnX = Math.floor(w / 2);
    const st = this.surf[this.spawnX];
    for (let x = this.spawnX - 5; x <= this.spawnX + 5; x++) {
      for (let y = this.surf[x] - 1; y >= this.surf[x] - 5; y--) {
        if (y >= 0 && this.tiles[y * this.w + x] !== T.AIR && y >= st - 4) this.tiles[y * this.w + x] = T.AIR;
      }
    }
    const sy = st - 1;
    this.tiles[sy * this.w + (this.spawnX - 3)] = T.WORKBENCH;
    this.tiles[sy * this.w + (this.spawnX + 3)] = T.TORCH;
    this.tiles[sy * this.w + (this.spawnX - 6)] = T.TORCH;
    this.spawnY = sy - 3;
    yield 1;
  }

  private tree(x: number, y: number, ht: number, jungle: boolean, snowy = false, cactus = false) {
    const leaf = jungle ? T.JLEAF : T.LEAF;
    for (let i = 0; i < ht; i++) {
      const ty = y - i;
      if (ty < 1) break;
      const i2 = ty * this.w + x;
      if (this.tiles[i2] === T.AIR) this.tiles[i2] = cactus ? T.LEAF : T.TRUNK;
      if (jungle && i > 1 && hash2(x, ty, 5) < 0.3) {
        const j = ty * this.w + x + 1;
        if (this.tiles[j] === T.AIR) this.tiles[j] = leaf;
      }
    }
    if (cactus) return;
    const cy = y - ht, rad = jungle ? 4 : 3;
    for (let dx = -rad; dx <= rad; dx++) for (let dy = -rad; dy <= rad; dy++) {
      if (dx * dx + dy * dy > rad * rad + 2) continue;
      const tx = x + dx, ty = cy + dy;
      if (!this.inB(tx, ty) || ty < 1) continue;
      const i = ty * this.w + tx;
      if (this.tiles[i] === T.AIR && (hash2(tx, ty, 9) > 0.14 || Math.abs(dx) + Math.abs(dy) < rad)) {
        this.tiles[i] = snowy && hash2(tx, ty, 13) < 0.45 ? T.SNOW : leaf;
      }
    }
  }

  placeChest(x: number, y: number, depthFrac: number) {
    const i = y * this.w + x;
    if (this.tiles[i] !== T.AIR || !TL.solid[this.get(x, y + 1)]) return;
    this.tiles[i] = T.CHEST;
    if (!this.walls[i]) this.walls[i] = W.STONE;
    this.chests.set(i, rollLoot(depthFrac, hash2(x, y, 77)));
  }

  private vault(cx: number, cy: number) {
    const rw = 9, rh = 7;
    for (let x = cx - rw; x <= cx + rw; x++) for (let y = cy - rh; y <= cy + rh; y++) {
      if (!this.inB(x, y)) continue;
      const i = y * this.w + x;
      const border = Math.abs(x - cx) === rw || Math.abs(y - cy) === rh;
      this.tiles[i] = border ? T.BRICK : T.AIR;
      this.walls[i] = W.STONE;
    }
    for (let x = cx - rw + 1; x <= cx + rw - 1; x++) this.tiles[(cy + rh - 1) * this.w + x] = T.BRICK;
    for (const px of [cx - 5, cx + 5]) {
      for (let y = cy + rh - 2; y > cy - rh + 2; y--) {
        if (!this.inB(px, y)) continue;
        this.tiles[y * this.w + px] = T.BRICK;
      }
    }
    const fy = cy + rh - 2;
    for (const dx of [-1, 0]) {
      this.tiles[fy * this.w + cx + dx] = T.SEAL;
    }
    this.tiles[(fy - 1) * this.w + cx] = T.CRYSTAL;
    this.tiles[(fy - 1) * this.w + cx - 1] = T.CRYSTAL;
    for (const [dx, d] of [[-3, 0.95], [3, 0.88]] as [number, number][]) {
      const i = fy * this.w + cx + dx;
      this.tiles[i] = T.CHEST;
      this.walls[i] = W.STONE;
      this.chests.set(i, rollLoot(d, hash2(cx + dx, cy, 31)));
    }
  }

  /* ============================================================
     LIGHTING
     ============================================================ */
  updateLight(camTx: number, camTy: number, dayLight: number, skyCol: number[], sources: number[]) {
    const ax0 = Math.max(0, Math.min(this.w - LW, camTx - (LW >> 1)));
    const ay0 = Math.max(0, Math.min(this.h - LH, camTy - (LH >> 1)));
    const ax1 = Math.min(this.w - 1, ax0 + LW - 1);
    const ay1 = Math.min(this.h - 1, ay0 + LH - 1);
    const w = this.w, tiles = this.tiles, walls = this.walls, skyL = this.skyL, blkL = this.blkL;

    // 1. sky light: column scan from just above the surface
    for (let x = ax0; x <= ax1; x++) {
      let y = Math.min(ay0, Math.max(0, this.surf[x] - 6));
      let v = 255;
      for (; y <= ay1; y++) {
        const i = y * w + x;
        const t = tiles[i];
        skyL[i] = v;
        if (TL.opaque[t]) {
          for (let y2 = y + 1; y2 <= ay1; y2++) skyL[y2 * w + x] = 0;
          break;
        }
        if (t === T.LEAF || t === T.JLEAF) v = Math.max(0, v - 24);
        else if (TL.liquid[t]) v = Math.max(0, v - 30);
        else if (walls[i] > 0) v = Math.max(0, v - 44);
        if (v <= 0) { for (let y2 = y + 1; y2 <= ay1; y2++) skyL[y2 * w + x] = 0; break; }
      }
    }
    // 2. propagate sky light
    const q = this.q;
    let tail = 0;
    for (let y = ay0; y <= ay1; y++) {
      const base = y * w;
      for (let x = ax0; x <= ax1; x++) if (skyL[base + x] > 1) q[tail++] = base + x;
    }
    this.propagate(skyL, q, tail, ax0, ay0, ax1, ay1, 2, 52);

    // 3. emitters
    for (let y = ay0; y <= ay1; y++) blkL.fill(0, y * w + ax0, y * w + ax1 + 1);
    tail = 0;
    for (let y = ay0; y <= ay1; y++) {
      const base = y * w;
      for (let x = ax0; x <= ax1; x++) {
        const em = TL.light[tiles[base + x]];
        if (em > 0) { blkL[base + x] = em; if (tail < q.length) q[tail++] = base + x; }
      }
    }
    for (let k = 0; k + 2 < sources.length; k += 3) {
      const ex = sources[k] | 0, ey = sources[k + 1] | 0, ev = sources[k + 2] | 0;
      if (ex < ax0 || ex > ax1 || ey < ay0 || ey > ay1) continue;
      const i = ey * w + ex;
      if (blkL[i] < ev) { blkL[i] = ev; if (tail < q.length) q[tail++] = i; }
    }
    this.propagate(blkL, q, tail, ax0, ay0, ax1, ay1, 8, 34);

    // 4. bake colours
    const d = this.lightImg.data;
    const sr = skyCol[0] * dayLight, sg = skyCol[1] * dayLight, sb = skyCol[2] * dayLight;
    const AMB = 22;
    for (let y = 0; y < LH; y++) {
      const gy = ay0 + y;
      const rowOff = y * LW;
      if (gy > ay1) { d.fill(AMB, rowOff * 4, (rowOff + LW) * 4); continue; }
      const base = gy * w + ax0;
      for (let x = 0; x < LW; x++) {
        const i = base + x;
        const s = skyL[i] * 0.00392, bl = blkL[i] * 0.00392;
        const o = (rowOff + x) * 4;
        let r = sr * s + 255 * bl;
        let g = sg * s + 178 * bl;
        let b2 = sb * s + 120 * bl;
        if (tiles[i] === T.WATER) { b2 += 26; r *= 0.72; g *= 0.86; }
        d[o] = r > 255 ? 255 : r + AMB;
        d[o + 1] = g > 255 ? 255 : g + AMB;
        d[o + 2] = b2 > 255 ? 255 : b2 + AMB;
        d[o + 3] = 255;
      }
    }
    this.lightCanvas.getContext("2d")!.putImageData(this.lightImg, 0, 0);
    this.lx0 = ax0; this.ly0 = ay0;
    this.lightReady = true;
    this.lightDirty = false;
  }

  private propagate(arr: Uint8Array, q: Int32Array, tail: number, x0: number, y0: number, x1: number, y1: number, costAir: number, costSolid: number) {
    const w = this.w, tiles = this.tiles, cap = q.length;
    let head = 0;
    while (head < tail) {
      const i = q[head++];
      const v = arr[i];
      if (v <= 1) continue;
      const x = i % w, y = (i / w) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? -1 : 1);
        const ny = k < 2 ? y : y + (k === 2 ? -1 : 1);
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
        const ni = ny * w + nx;
        const nt = tiles[ni];
        const c = TL.opaque[nt] ? costSolid : TL.liquid[nt] ? costAir + 6 : (nt === T.LEAF || nt === T.JLEAF) ? costAir + 10 : costAir;
        const nv = v - c;
        if (nv > arr[ni]) {
          arr[ni] = nv;
          if (tail < cap) q[tail++] = ni;
        }
      }
    }
  }

  /* ============================================================
     CHUNK RENDER CACHE
     ============================================================ */
  getChunk(cx: number, cy: number): HTMLCanvasElement {
    const key = cy * 100000 + cx;
    let cv = this.chunks.get(key);
    if (!cv) {
      cv = document.createElement("canvas");
      cv.width = CHUNK_PX; cv.height = CHUNK_PX;
      this.chunks.set(key, cv);
      this.chunkOrder.push(key);
      if (this.chunkOrder.length > 96) {
        const old = this.chunkOrder.shift()!;
        if (old !== key) this.chunks.delete(old);
      }
      this.dirty.add(key);
    }
    if (this.dirty.has(key)) {
      this.renderChunk(cx, cy, cv);
      this.dirty.delete(key);
    }
    return cv;
  }

  private renderChunk(cx: number, cy: number, cv: HTMLCanvasElement) {
    const ctx = cv.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, CHUNK_PX, CHUNK_PX);
    const atlas = getAtlas();
    const x0 = cx * CH, y0 = cy * CH;
    const { w, h } = this;

    // background walls
    for (let y = 0; y < CH; y++) {
      const gy = y0 + y;
      if (gy < 0 || gy >= h) continue;
      for (let x = 0; x < CH; x++) {
        const gx = x0 + x;
        if (gx < 0 || gx >= w) continue;
        const i = gy * w + gx;
        const wv = this.walls[i];
        if (!wv) continue;
        const t = this.tiles[i];
        if (TL.solid[t] === 1) continue;
        ctx.drawImage(atlas, variantFor(gx, gy) * TILE, (TILE_COUNT + wv) * TILE, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
      }
    }
    // darken walled areas a touch
    ctx.fillStyle = "rgba(6,8,14,0.34)";
    for (let y = 0; y < CH; y++) {
      const gy = y0 + y;
      if (gy < 0 || gy >= h) continue;
      for (let x = 0; x < CH; x++) {
        const gx = x0 + x;
        if (gx < 0 || gx >= w) continue;
        const i = gy * w + gx;
        const t = this.tiles[i];
        if (this.walls[i] && TL.solid[t] !== 1) ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
    // tiles
    for (let y = 0; y < CH; y++) {
      const gy = y0 + y;
      if (gy < 0 || gy >= h) continue;
      for (let x = 0; x < CH; x++) {
        const gx = x0 + x;
        if (gx < 0 || gx >= w) continue;
        let t = this.tiles[gy * w + gx];
        if (t === T.AIR || TL.liquid[t] === 1) continue;
        if ((t === T.GRASS || t === T.SNOW) && TL.solid[this.get(gx, gy - 1)] === 1) t = T.DIRT;
        ctx.drawImage(atlas, variantFor(gx, gy) * TILE, t * TILE, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
      }
    }
    // ambient occlusion + rim light
    const solidAt = (gx: number, gy: number) => this.blocksLight(gx, gy);
    for (let y = 0; y < CH; y++) {
      const gy = y0 + y;
      if (gy < 1 || gy >= h - 1) continue;
      for (let x = 0; x < CH; x++) {
        const gx = x0 + x;
        if (gx < 1 || gx >= w - 1) continue;
        const t = this.tiles[gy * w + gx];
        const px = x * TILE, py = y * TILE;
        if (TL.solid[t] === 1) {
          // top rim highlight for exposed tops
          if (this.get(gx, gy - 1) === T.AIR) {
            ctx.globalAlpha = 0.34;
            ctx.fillStyle = "#eaf4ff";
            ctx.fillRect(px, py, TILE, 1);
            ctx.globalAlpha = 0.1;
            ctx.fillStyle = "#05070c";
            ctx.fillRect(px, py + 1, TILE, 2);
            ctx.globalAlpha = 1;
          }
          continue;
        }
        if (TL.liquid[t]) continue;
        let any = 0;
        ctx.fillStyle = "#080b12";
        if (solidAt(gx - 1, gy)) { ctx.globalAlpha = 0.24; ctx.fillRect(px, py, 4, TILE); any = 1; }
        if (solidAt(gx + 1, gy)) { ctx.globalAlpha = 0.24; ctx.fillRect(px + TILE - 4, py, 4, TILE); any = 1; }
        if (solidAt(gx, gy - 1)) { ctx.globalAlpha = 0.2; ctx.fillRect(px, py, TILE, 4); any = 1; }
        if (solidAt(gx, gy + 1)) { ctx.globalAlpha = 0.3; ctx.fillRect(px, py + TILE - 4, TILE, 4); any = 1; }
        if (any) {
          ctx.globalAlpha = 0.1;
          if (solidAt(gx - 1, gy - 1)) ctx.fillRect(px, py, 4, 4);
          if (solidAt(gx + 1, gy - 1)) ctx.fillRect(px + TILE - 4, py, 4, 4);
          if (solidAt(gx - 1, gy + 1)) ctx.fillRect(px, py + TILE - 4, 4, 4);
          if (solidAt(gx + 1, gy + 1)) ctx.fillRect(px + TILE - 4, py + TILE - 4, 4, 4);
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  invalidateAll() {
    this.chunks.clear();
    this.chunkOrder.length = 0;
    this.dirty.clear();
  }

  stationsNear(x: number, y: number): Record<string, boolean> {
    const out: Record<string, boolean> = { hand: true };
    for (let dy = -4; dy <= 4; dy++) for (let dx = -6; dx <= 6; dx++) {
      const t = this.get(x + dx, y + dy);
      if (t === T.WORKBENCH) out.workbench = true;
      else if (t === T.FURNACE) out.furnace = true;
      else if (t === T.ANVIL) out.anvil = true;
    }
    return out;
  }
}

/* ---------- loot tables ---------- */
export function rollLoot(depth: number, r: number): ItemStack[] {
  const out: ItemStack[] = [];
  const d = Math.max(0, Math.min(0.999, depth));
  const poolA = ["copper_bar", "iron_bar", "wood", "stone", "gel", "torch", "healing_potion"];
  const poolB = ["iron_bar", "silver_bar", "gold_bar", "healing_potion", "mana_potion", "crystal", "flaming_arrow"];
  const poolC = ["gold_bar", "crystal", "ruby", "ember_core", "frost_shard", "ancient_core"];
  const pool = d < 0.4 ? poolA : d < 0.72 ? poolB : poolC;
  const n = 2 + ((r * 3) | 0);
  for (let i = 0; i < n; i++) {
    const id = pool[(hash2(i, (d * 100) | 0, 5) * pool.length) | 0];
    const bulk = id.includes("_bar") || id === "wood" || id === "stone" || id === "gel" || id === "torch";
    const cnt = bulk ? 5 + ((hash2(i, (d * 99) | 0, 3) * 22) | 0) : 1 + ((hash2(i, (d * 55) | 0, 4) * 4) | 0);
    const ex = out.find(o => o.id === id);
    if (ex) ex.n += cnt; else out.push({ id, n: cnt });
  }
  out.push({ id: "coin", n: 10 + ((r * 130 * (0.4 + d)) | 0) });
  if (hash2((d * 500) | 0, n, 19) > (d < 0.5 ? 0.66 : 0.42)) {
    const gear = d < 0.45
      ? ["copper_shortsword", "iron_broadsword", "copper_helmet", "copper_chest", "iron_helmet", "wooden_bow", "iron_pickaxe"]
      : d < 0.75
        ? ["silver_saber", "silver_pickaxe", "iron_chest", "gold_helmet", "iron_bow", "regen_band", "silver_chest"]
        : ["gold_flamberge", "crystal_pickaxe", "gold_chest", "gold_greaves", "crystal_bow", "ember_wand", "lava_ward", "obsidian_chest", "feather_wings"];
    out.push({ id: gear[((hash2((d * 1000) | 0, 7, 21) * gear.length) | 0) % gear.length], n: 1 });
  }
  return out;
}

/* ---------- save/load helpers (RLE + base64) ---------- */
export function rle(a: Uint8Array): string {
  let out = "";
  let i = 0;
  const n = a.length;
  while (i < n) {
    const v = a[i];
    let c = 1;
    while (i + c < n && a[i + c] === v && c < 65535) c++;
    out += String.fromCharCode(v, (c >> 8) & 255, c & 255);
    i += c;
  }
  return btoa(out);
}
export function unrle(s: string, len: number): Uint8Array {
  const bin = atob(s);
  const a = new Uint8Array(len);
  let p = 0, i = 0;
  while (i < bin.length) {
    const v = bin.charCodeAt(i++);
    const c = (bin.charCodeAt(i++) << 8) | bin.charCodeAt(i++);
    a.fill(v, p, Math.min(len, p + c));
    p += c;
    if (p >= len) break;
  }
  return a;
}
