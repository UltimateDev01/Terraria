/* ============================================================
   TERRAFORGE engine: game loop, player controller, mining,
   building, combat, crafting, spawns, rendering, persistence.
   ============================================================ */
import {
  T, TILE, TL, ITEMS, itemDef, itemName, RECIPES, ENEMIES, TOOL_AXE, type Recipe,
} from "./defs";
import {
  World, WORLD_SIZES, rle, unrle, CH, LW, LH,
  BIOME_NAMES, DEEP_NAMES, B_DESERT, B_JUNGLE, B_SNOW,
  D_FROZEN, D_SCORCHED, type SizeKey, type ItemStack,
} from "./world";
import { getAtlas, buildAtlas } from "./textures";
import { drawDrop, drawEnemy, drawHero, shadeHex, type Look } from "./draw";
import { sfx } from "./audio";
import {
  boxHits, liquidDepth, makeEnemy, moveBody, updateEnemy, updateProj,
  PROJ_ART, MAX_FALL, type Drop, type Enemy, type Floater, type Particle, type Player, type Proj,
} from "./entities";
import { fbm1 } from "./noise";

export const HOTBAR = 10;
export const INV_SIZE = 50;
export const REACH = 6.4 * TILE;
export const DAY_FRAMES = 60 * 60 * 3.5;   // 3.5 real minutes per full cycle

export type Slot = ItemStack | null;

export interface Settings {
  zoom: number; particles: number; lighting: boolean; shake: boolean;
  sfx: number; music: number; autosave: boolean; showGrid: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  zoom: 2, particles: 1, lighting: true, shake: true, sfx: 0.6, music: 0.4, autosave: true, showGrid: false,
};

export interface WorldSummary {
  name: string; seed: number; size: SizeKey; difficulty: number;
  created: number; modified: number; playtime: number; kills: number; depthBest: number;
}

const INDEX_KEY = "terrafoge:index";
const worldKey = (n: string) => "terrafoge:w:" + n;

export function listWorlds(): WorldSummary[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as WorldSummary[];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
export function deleteWorld(name: string) {
  try {
    localStorage.removeItem(worldKey(name));
    localStorage.setItem(INDEX_KEY, JSON.stringify(listWorlds().filter(w => w.name !== name)));
  } catch { /* ignore */ }
}
function putSummary(s: WorldSummary) {
  const all = listWorlds().filter(w => w.name !== s.name);
  all.unshift(s);
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(all.slice(0, 12))); } catch { /* ignore */ }
}

export interface NewWorldOpts { name: string; seedText: string; size: SizeKey; difficulty: number }

export function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  const str = (s || "").trim() || String(Date.now());
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Stepped generation so the loading screen stays animated */
export async function generateWorld(
  opts: NewWorldOpts,
  onProgress: (p: number, label: string) => void
): Promise<Game> {
  buildAtlas();
  const cfg = WORLD_SIZES[opts.size];
  const seed = seedFromString(opts.seedText);
  const world = new World(cfg.w, cfg.h, seed);
  const it = world.generate();
  const labels = ["Raising hills", "Layering soil", "Carving caverns", "Weaving background walls",
    "Flooding the depths", "Growing forests", "Sowing ore", "Burying treasure", "Sealing the vaults", "Placing spawn"];
  let p = 0;
  await new Promise<void>(resolve => {
    const tick = () => {
      const t0 = performance.now();
      let r = it.next();
      while (!r.done && performance.now() - t0 < 15) { p = r.value as number; r = it.next(); }
      onProgress(Math.min(0.999, p), labels[Math.min(labels.length - 1, Math.floor(p * labels.length))]);
      if (r.done) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const game = new Game(world, opts);
  game.freshStart();
  return game;
}

/* ============================================================
   GAME
   ============================================================ */
export class Game {
  world: World;
  canvas: HTMLCanvasElement | null = null;
  ctx: CanvasRenderingContext2D | null = null;
  name: string; seed: number; difficulty: number; sizeKey: SizeKey;

  player: Player;
  enemies: Enemy[] = [];
  projs: Proj[] = [];
  parts: Particle[] = [];
  floaters: Floater[] = [];
  drops: Drop[] = [];

  inv: Slot[] = new Array(INV_SIZE).fill(null);
  equip: { helm: Slot; chest: Slot; legs: Slot; acc: Slot[] } = { helm: null, chest: null, legs: null, acc: [null, null, null, null] };
  sel = 0;
  held: Slot = null;
  chestOpen: Slot[] | null = null;
  chestKey = -1;
  chestPos: [number, number] = [0, 0];

  /** store chest contents back into the world and close the container UI */
  closeChest() {
    if (!this.chestOpen) return;
    const items: ItemStack[] = [];
    for (const s of this.chestOpen) {
      if (!s) continue;
      const ex = items.find(o => o.id === s.id);
      if (ex) ex.n += s.n; else items.push({ id: s.id, n: s.n });
    }
    const world = this.world;
    if (items.length) world.chests.set(this.chestKey, items);
    else if (world.chests.has(this.chestKey)) {
      const t = world.get(this.chestPos[0], this.chestPos[1]);
      if (t === T.CHEST) world.chests.set(this.chestKey, []);
    }
    // drop anything still held back into the world
    this.chestOpen = null;
    this.chestKey = -1;
    this.bumpInv();
  }

  cam = { x: 0, y: 0 };
  zoom = 2;
  time = 0.24;
  day = 1;
  frame = 0;
  running = false;
  paused = false;
  uiMode: "none" | "inv" = "none";
  dead = false;
  respawnT = 0;
  settings: Settings = { ...DEFAULT_SETTINGS };
  stats = { kills: 0, coins: 0, mined: 0, depthBest: 0, playtime: 0, crafted: 0 };
  boss: Enemy | null = null;
  toasts: { text: string; col: string; life: number }[] = [];
  invVersion = 0;
  modified = 0;
  created = Date.now();
  saveState: "idle" | "saved" | "error" = "idle";
  craftFilter: "all" | "hand" | "workbench" | "furnace" | "anvil" = "all";
  def = 0;
  bonus = { speed: 1, melee: 1, ranged: 1, crit: 0.04, regen: 0, fire: false, wings: false };
  minimap: HTMLCanvasElement | null = null;

  private keys = new Set<string>();
  private mouse = { x: 0, y: 0, left: false, right: false, inside: false };
  private mining: { x: number; y: number; prog: number; max: number } | null = null;
  private raf = 0;
  private acc = 0;
  private last = 0;
  private fpsAvg = 60;
  private stars: { x: number; y: number; s: number; t: number }[] = [];
  private clouds: { x: number; y: number; w: number; h: number; s: number }[] = [];
  private glowCache = new Map<string, HTMLCanvasElement>();
  private shakeT = 0; private shakeMag = 0;
  private fallStart = 0; private falling = false;
  private autoSaveT = 0;
  private jumpBuffer = 0;
  private mineWarn = 0;
  private placeWarn = 0;
  private spawnTimer = 120;
  private sources: number[] = [];
  private lastLX = -999; private lastLY = -999;
  private detach: (() => void)[] = [];

  constructor(world: World, opts: { name: string; difficulty: number; size: SizeKey }) {
    this.world = world;
    this.name = opts.name;
    this.difficulty = opts.difficulty;
    this.sizeKey = opts.size;
    this.seed = world.seed;
    this.zoom = this.settings.zoom;
    this.player = {
      x: world.spawnX * TILE, y: world.spawnY * TILE, vx: 0, vy: 0, w: 20, h: 42, onGround: false,
      face: 1, hp: 100, maxHp: 100, mana: 60, maxMana: 60, jumps: 0, maxJumps: 1,
      inv: 0, hurt: 0, regen: 0, swing: 0, swingAng: 0, useT: 0, anim: 0, animT: 0,
      dead: false, deadT: 0, inLiquid: 0, glow: 0, stepT: 0,
    };
    this.cam.x = this.player.x - 200;
    this.cam.y = this.player.y - 140;
    for (let i = 0; i < 110; i++) {
      this.stars.push({ x: Math.random(), y: Math.random() * 0.6, s: 1 + (Math.random() < 0.14 ? 1 : 0), t: Math.random() * 6.28 });
    }
    for (let i = 0; i < 16; i++) {
      this.clouds.push({ x: Math.random() * 4000, y: 30 + Math.random() * 220, w: 70 + Math.random() * 150, h: 16 + Math.random() * 26, s: 0.05 + Math.random() * 0.16 });
    }
  }

  freshStart() {
    this.addItem("copper_pickaxe", 1);
    this.addItem("copper_axe", 1);
    this.addItem("copper_shortsword", 1);
    this.addItem("torch", 30);
    this.addItem("wood", 25);
    this.addItem("stone", 20);
    this.addItem("healing_potion", 3);
    this.recalcStats();
    this.buildMinimap();
    this.toast("Welcome to Terraforge — mine with LMB, build with RMB, E for inventory.", "#ffd166");
    this.save();
  }

  /* ---------------- lifecycle ---------------- */
  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    const on = (target: EventTarget, key: string, fn: (e: any) => void, capture?: boolean | AddEventListenerOptions) => {
      target.addEventListener(key, fn, capture);
      this.detach.push(() => target.removeEventListener(key, fn, capture));
    };
    on(window, "keydown", (e: KeyboardEvent) => this.onKeyDown(e));
    on(window, "keyup", (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase()));
    on(window, "blur", () => { this.keys.clear(); this.mouse.left = false; this.mouse.right = false; });
    on(canvas, "mousemove", (e: MouseEvent) => this.onMouseMove(e));
    on(canvas, "mousedown", (e: MouseEvent) => this.onMouseDown(e));
    on(window, "mouseup", (e: MouseEvent) => this.onMouseUp(e));
    on(canvas, "contextmenu", (e: Event) => e.preventDefault());
    on(canvas, "wheel", (e: WheelEvent) => this.onWheel(e), { passive: false });
    on(window, "resize", () => this.resize());
    on(window, "pointerdown", () => sfx.resume(), true);
    this.resize();
    this.applySettings();
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (ts: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(120, ts - this.last);
      this.last = ts;
      this.fpsAvg += (1000 / Math.max(1, dt) - this.fpsAvg) * 0.05;
      const scale = this.uiMode === "inv" ? 0.3 : this.paused ? 0 : 1;
      this.acc += dt * scale;
      let steps = 0;
      while (this.acc >= 16.6667 && steps < 4) { this.step(); this.acc -= 16.6667; steps++; }
      if (this.acc > 120) this.acc = 0;
      this.render();
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const d of this.detach) d();
    this.detach = [];
  }
  destroy() { this.save(); this.stop(); }

  resize() {
    const c = this.canvas;
    if (!c) return;
    const host = c.parentElement;
    const w = Math.max(320, (host?.clientWidth || window.innerWidth));
    const h = Math.max(240, (host?.clientHeight || window.innerHeight));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }

  /* ---------------- input ---------------- */
  private onKeyDown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const k = e.key.toLowerCase();
    if ([" ", "tab", "arrowleft", "arrowright", "arrowup", "arrowdown"].includes(k)) e.preventDefault();
    this.keys.add(k);
    if (/^[0-9]$/.test(k)) {
      const n = k === "0" ? 9 : parseInt(k) - 1;
      if (n < HOTBAR) { this.sel = n; this.bumpInv(); sfx.play("ui"); }
    }
    if (k === "e" || k === "i") this.toggleInv();
    if (k === "escape") {
      if (this.held) this.returnHeld();
      else if (this.chestOpen) { this.closeChest(); }
      else if (this.uiMode === "inv") { this.uiMode = "none"; this.craftFilter = "all"; this.bumpInv(); }
      else { this.paused = !this.paused; sfx.play("ui"); }
    }
    if (k === "f") this.quickHeal();
    if (k === "q") this.dropSelected();
    if (k === " ") this.jumpBuffer = 7;
  }
  private onMouseMove(e: MouseEvent) {
    const c = this.canvas!;
    const r = c.getBoundingClientRect();
    this.mouse.x = e.clientX - r.left;
    this.mouse.y = e.clientY - r.top;
    this.mouse.inside = this.mouse.x >= 0 && this.mouse.y >= 0 && this.mouse.x < r.width && this.mouse.y < r.height;
  }
  private onMouseDown(e: MouseEvent) {
    if (this.uiMode === "inv" || this.paused || this.dead) return;
    if (e.button === 0) { this.mouse.left = true; this.tryAttack(); }
    if (e.button === 2) { this.mouse.right = true; this.tryInteract(); }
  }
  private onMouseUp(e: MouseEvent) {
    if (e.button === 0) { this.mouse.left = false; this.mining = null; }
    if (e.button === 2) this.mouse.right = false;
  }
  private onWheel(e: WheelEvent) {
    if (this.uiMode !== "none" || this.paused) return;
    e.preventDefault();
    this.sel = (this.sel + (e.deltaY > 0 ? 1 : -1) + HOTBAR) % HOTBAR;
    this.bumpInv();
  }

  /* ---------------- small helpers ---------------- */
  bumpInv() { this.invVersion++; }
  toast(text: string, col = "#eaf4ff") {
    this.toasts.push({ text, col, life: 300 });
    if (this.toasts.length > 4) this.toasts.shift();
  }
  toggleInv() {
    this.uiMode = this.uiMode === "inv" ? "none" : "inv";
    if (this.uiMode === "inv" && !this.chestOpen) this.craftFilter = "all";
    if (this.uiMode === "none") {
      this.closeChest();
      this.craftFilter = "all";
      if (this.held) this.returnHeld();
    }
    sfx.play("ui");
    this.bumpInv();
  }
  dayFactor() {
    const s = Math.sin((this.time - 0.25) * Math.PI * 2);
    return Math.max(0, Math.min(1, (s + 0.32) / 1.32));
  }
  night() { return this.dayFactor() < 0.18; }

  /* ============================================================
     INVENTORY
     ============================================================ */
  addItem(id: string, n: number): number {
    if (!ITEMS[id]) return 0;
    const stack = itemDef(id).stack ?? 1;
    if (stack > 1) {
      for (let i = 0; i < INV_SIZE && n > 0; i++) {
        const s = this.inv[i];
        if (s && s.id === id && s.n < stack) { const add = Math.min(stack - s.n, n); s.n += add; n -= add; }
      }
    }
    for (let i = 0; i < INV_SIZE && n > 0; i++) {
      if (!this.inv[i]) { const put = Math.min(stack, n); this.inv[i] = { id, n: put }; n -= put; }
    }
    this.bumpInv();
    return n;
  }
  countItem(id: string): number {
    let c = 0;
    for (const s of this.inv) if (s && s.id === id) c += s.n;
    return c;
  }
  takeItem(id: string, n: number): boolean {
    if (this.countItem(id) < n) return false;
    for (let i = 0; i < INV_SIZE && n > 0; i++) {
      const s = this.inv[i];
      if (s && s.id === id) {
        const take = Math.min(s.n, n);
        s.n -= take; n -= take;
        if (s.n <= 0) this.inv[i] = null;
      }
    }
    this.bumpInv();
    return true;
  }
  removeAt(i: number, n = 1) {
    const s = this.inv[i];
    if (!s) return;
    s.n -= n;
    if (s.n <= 0) this.inv[i] = null;
    this.bumpInv();
  }
  selected(): Slot { return this.inv[this.sel]; }
  selectedItemDef() { const s = this.selected(); return s ? itemDef(s.id) : null; }
  dropSelected() {
    const s = this.selected();
    if (!s) return;
    this.spawnDrop(this.player.x + this.player.w / 2, this.player.y + 6, s.id, 1, this.player.face * 2.4, -2.4);
    this.removeAt(this.sel, 1);
    sfx.play("place", 0.8);
  }

  /** inventory / chest grid click */
  uiClick(list: "inv" | "chest", i: number, right: boolean) {
    const arr = list === "inv" ? this.inv : this.chestOpen!;
    const cur = this.held;
    const slot = arr[i] ?? null;
    if (right && !cur && slot) {
      const it = itemDef(slot.id);
      if (it.kind === "consumable") { this.consume(slot.id, i, arr); return; }
      if (it.kind === "armor" || it.kind === "accessory") { this.equipItem(i, arr); return; }
      if (list === "inv" && (it.kind === "tool" || it.kind === "sword" || it.kind === "bow" || it.kind === "magic")) {
        this.sel = Math.min(i, HOTBAR - 1);
        if (i >= HOTBAR) this.swapSlots(i, this.sel);
        sfx.play("ui");
        this.bumpInv();
        return;
      }
      if (it.kind === "block") { this.swapSlots(i, this.sel); sfx.play("ui"); return; }
      return;
    }
    if (cur && slot && slot.id === cur.id && (itemDef(cur.id).stack ?? 1) > 1) {
      const stack = itemDef(cur.id).stack ?? 1;
      const move = Math.min(stack - slot.n, cur.n);
      slot.n += move; cur.n -= move;
      if (cur.n <= 0) this.held = null;
      sfx.play("ui");
      this.bumpInv();
      return;
    }
    arr[i] = cur ?? null;
    this.held = slot;
    if (cur) sfx.play("ui");
    this.bumpInv();
  }
  swapSlots(a: number, b: number) {
    if (a === b) return;
    const t = this.inv[a];
    this.inv[a] = this.inv[b];
    this.inv[b] = t;
    this.bumpInv();
  }
  private returnHeld() {
    if (!this.held) return;
    const left = this.addItem(this.held.id, this.held.n);
    if (left > 0) this.spawnDrop(this.player.x, this.player.y, this.held.id, left);
    this.held = null;
    this.bumpInv();
  }
  equipItem(i: number, arr: Slot[]) {
    const s = arr[i];
    if (!s) return;
    const it = itemDef(s.id);
    if (it.kind === "armor" && it.equipSlot) {
      const key = it.equipSlot as "helm" | "chest" | "legs";
      const old = this.equip[key];
      arr[i] = old ?? null;
      this.equip[key] = { id: s.id, n: 1 };
      sfx.play("place", 1.4);
      this.recalcStats(); this.bumpInv();
      this.toast(`Equipped ${it.name}`, "#a8e0ff");
      return;
    }
    if (it.kind === "accessory") {
      const idx = this.equip.acc.findIndex(a => !a);
      if (idx < 0) { this.toast("All accessory slots are full", "#ff9b9b"); return; }
      const old = this.equip.acc[idx];
      arr[i] = old ?? null;
      this.equip.acc[idx] = { id: s.id, n: 1 };
      sfx.play("place", 1.5);
      this.recalcStats(); this.bumpInv();
      this.toast(`Equipped ${it.name}`, "#a8e0ff");
      return;
    }
    if (it.kind === "consumable") { this.consume(s.id, i, arr); return; }
  }
  unequip(kind: "helm" | "chest" | "legs" | number) {
    const cur = typeof kind === "number" ? this.equip.acc[kind] : this.equip[kind];
    if (!cur) return;
    const free = this.inv.findIndex(s => !s);
    if (free < 0) { this.toast("Inventory full", "#ff9b9b"); return; }
    this.inv[free] = cur;
    if (typeof kind === "number") this.equip.acc[kind] = null;
    else this.equip[kind] = null;
    this.recalcStats(); this.bumpInv();
  }
  consume(id: string, i: number, arr: Slot[]) {
    const it = itemDef(id);
    const p = this.player;
    if (it.heal && p.hp >= p.maxHp && !it.give) { this.toast("Already at full health", "#a8e0ff"); return; }
    if (it.heal) { p.hp = Math.min(p.maxHp, p.hp + it.heal); this.floatText(p.x + p.w / 2, p.y - 6, "+" + it.heal, "#7ee06a"); }
    if (it.give) { p.mana = Math.min(p.maxMana, p.mana + it.give); this.floatText(p.x + p.w / 2 + 8, p.y - 6, "+" + it.give + " MP", "#8f9bff"); }
    for (let k = 0; k < 10; k++) {
      this.particle(p.x + p.w / 2, p.y + p.h / 2, (Math.random() - 0.5) * 2, -Math.random() * 2, 26,
        it.heal ? "#ff6b8a" : "#8f9bff", 2, 0.06, 1);
    }
    const s = arr[i];
    if (s) arr[i] = s.n > 1 ? { id: s.id, n: s.n - 1 } : null;
    sfx.play("pickup", 1.6);
    this.bumpInv();
  }
  quickHeal() {
    if (this.player.hp >= this.player.maxHp) { this.toast("Already at full health", "#a8e0ff"); return; }
    const i = this.inv.findIndex(s => s && itemDef(s.id).heal);
    if (i < 0) { this.toast("No healing potions", "#ff9b9b"); sfx.play("error"); return; }
    this.consume(this.inv[i]!.id, i, this.inv);
  }

  /* ---------------- equipment stats ---------------- */
  recalcStats() {
    const p = this.player;
    let d = 0, maxHp = 100;
    const b = { speed: 1, melee: 1, ranged: 1, crit: 0.04, regen: 0, fire: false, wings: false };
    const parts: Slot[] = [this.equip.helm, this.equip.chest, this.equip.legs, ...this.equip.acc];
    for (const s of parts) {
      if (!s) continue;
      const it = itemDef(s.id);
      d += it.defense ?? 0;
      switch (it.acc) {
        case "speed": b.speed *= 1.35; break;
        case "melee": b.melee *= 1.15; break;
        case "ranged": b.ranged *= 1.15; break;
        case "crit": b.crit += 0.1; break;
        case "regen": b.regen += 0.9; break;
        case "fireproof": b.fire = true; break;
        case "wings": b.wings = true; break;
        case "heart": maxHp += 40; d += 8; b.regen += 1.2; break;
        default: break;
      }
    }
    for (const m of ["copper", "iron", "silver", "gold", "obsidian"]) {
      const has = (sub: string) => [this.equip.helm, this.equip.chest, this.equip.legs]
        .some(s => !!s && s.id.startsWith(m + "_") && s.id.includes(sub));
      if (has("helm") && has("chest") && has("greaves")) {
        b.melee *= 1.08; b.ranged *= 1.08; b.regen += 0.4; d += 3;
      }
    }
    this.def = d;
    this.bonus = b;
    if (p.maxHp !== maxHp) {
      const diff = maxHp - p.maxHp;
      p.maxHp = maxHp;
      p.hp = Math.max(1, Math.min(maxHp, p.hp + Math.max(0, diff)));
    }
    p.maxJumps = b.wings ? 2 : 1;
  }

  /* ---------------- fx ---------------- */
  particle(x: number, y: number, vx: number, vy: number, life: number, col: string, size = 2, grav = 0.14, glow = 0) {
    if (this.settings.particles <= 0) return;
    if (this.parts.length > 1500 * this.settings.particles) return;
    this.parts.push({ x, y, vx, vy, life, max: life, col, size, grav, glow, fade: 1 });
  }
  burst(x: number, y: number, n: number, col: string, spd = 2.2, glow = 0) {
    const cnt = Math.max(1, Math.round(n * this.settings.particles));
    for (let i = 0; i < cnt; i++) {
      const a = Math.random() * 6.283, s = spd * (0.35 + Math.random());
      this.particle(x, y, Math.cos(a) * s, Math.sin(a) * s - 0.6, 20 + Math.random() * 26, col, 1 + ((Math.random() * 2) | 0), 0.16, glow);
    }
  }
  floatText(x: number, y: number, text: string, col: string, big = 0) {
    if (this.floaters.length > 44) this.floaters.shift();
    this.floaters.push({ x, y, vy: -0.85, life: 54, text, col, big });
  }
  screenShake(mag: number) {
    if (!this.settings.shake) return;
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = Math.max(this.shakeT, 14);
  }
  impact(x: number, y: number, kind: string, solid: boolean) {
    const a = PROJ_ART[kind];
    this.burst(x, y, solid ? 6 : 4, a ? a.glow : "#ffffff", 1.9, 1);
    if (kind === "fireball" || kind === "ember") sfx.play("hit");
  }

  spawnDrop(x: number, y: number, id: string, n: number, vx?: number, vy?: number) {
    if (!ITEMS[id] || n <= 0) return;
    this.drops.push({
      id, n, x, y, w: 12, h: 12, vx: vx ?? (Math.random() - 0.5) * 1.8, vy: vy ?? -1.6 - Math.random(),
      onGround: false, t: 0, pick: 16, bob: Math.random() * 6,
    });
    if (this.drops.length > 300) this.drops.shift();
  }
  spawnProj(o: Partial<Proj> & { x: number; y: number; vx: number; vy: number; dmg: number; kind: string; fromPlayer: boolean }) {
    const pr: Proj = {
      x: o.x, y: o.y, vx: o.vx, vy: o.vy, w: o.w ?? 8, h: o.h ?? 8, onGround: false,
      dmg: o.dmg, kind: o.kind, fromPlayer: o.fromPlayer, g: o.g ?? 0.06, life: o.life ?? 200,
      rot: Math.atan2(o.vy, o.vx), glow: 1, pierce: o.pierce ?? 0, hit: [], light: o.light ?? 0,
      drag: o.drag ?? 1,
    };
    this.projs.push(pr);
    if (this.projs.length > 160) this.projs.shift();
  }

  /* ============================================================
     STEP
     ============================================================ */
  step() {
    this.frame++;
    this.time += 1 / DAY_FRAMES;
    if (this.time >= 1) { this.time -= 1; this.day++; this.toast(`Day ${this.day} begins`, "#ffd166"); }
    this.stats.playtime += 1 / 60;
    const tilesChanged = this.world.lightDirty || this.world.dirty.size > 0;
    this.updatePlayer();
    this.updateActions();
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      updateEnemy(e, this);
      if (e.hp <= 0) this.killEnemy(e, i);
    }
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const pr = this.projs[i];
      updateProj(pr, this);
      this.projHits(pr);
      if (pr.life <= 0) this.projs.splice(i, 1);
    }
    this.updateDrops();
    this.updateParticles();
    this.ambient();
    this.updateSpawns();
    this.updateCamera();
    const ltx = Math.floor(this.cam.x / TILE), lty = Math.floor(this.cam.y / TILE);
    if (this.world.lightReady === false || ltx !== this.lastLX || lty !== this.lastLY || tilesChanged || this.frame % 4 === 0) {
      this.lastLX = ltx; this.lastLY = lty;
      this.updateLighting();
    }
    for (let i = this.toasts.length - 1; i >= 0; i--) if (--this.toasts[i].life <= 0) this.toasts.splice(i, 1);
    if (this.shakeT > 0) { this.shakeT--; this.shakeMag *= 0.86; }
    if (this.dead && --this.respawnT <= 0) this.respawn();
    if (this.settings.autosave && ++this.autoSaveT > 60 * 60) { this.autoSaveT = 0; this.save(true); }
  }

  /* ---------------- player ---------------- */
  private updatePlayer() {
    const p = this.player, world = this.world;
    if (p.dead) { p.deadT++; return; }
    const left = this.keys.has("a") || this.keys.has("arrowleft");
    const right = this.keys.has("d") || this.keys.has("arrowright");
    const down = this.keys.has("s") || this.keys.has("arrowdown");
    const liq = liquidDepth(world, p);
    p.inLiquid = liq;
    const swim = liq > 0;
    const onIce = world.get((p.x + p.w / 2) / TILE | 0, (p.y + p.h + 1) / TILE | 0) === T.ICE;
    const speed = 3.0 * this.bonus.speed * (swim ? 0.62 : 1);
    const accel = p.onGround ? (onIce ? 0.16 : 0.5) : 0.24;
    if (left && !right) { p.vx -= accel; p.face = -1; }
    else if (right && !left) { p.vx += accel; p.face = 1; }
    else if (p.onGround) p.vx *= onIce ? 0.965 : 0.78;
    else p.vx *= 0.97;
    p.vx = Math.max(-speed, Math.min(speed, p.vx));

    if (this.jumpBuffer > 0) this.jumpBuffer--;
    const wantJump = this.keys.has(" ") || this.keys.has("w") || this.keys.has("arrowup");
    if (wantJump) {
      if (swim) {
        p.vy -= 0.44; p.jumps = 0; this.jumpBuffer = 0;
        if (Math.random() < 0.2) this.burst(p.x + p.w / 2, p.y + p.h, 2, "#8fd0ff", 1, 0);
      } else if (p.onGround) {
        p.vy = -8.4; p.jumps = p.maxJumps - 1; this.jumpBuffer = 0;
        sfx.play("jump");
        this.burst(p.x + p.w / 2, p.y + p.h, 3, "#c8b090", 0.8, 0);
      } else if (p.jumps > 0 && p.vy > -1.5) {
        p.vy = -7.4; p.jumps--; this.jumpBuffer = 0;
        sfx.play("jump", 1.25);
        for (let i = 0; i < 9; i++) {
          this.particle(p.x + p.w / 2 + (Math.random() - 0.5) * 16, p.y + p.h, (Math.random() - 0.5) * 1.6, 0.6 + Math.random(),
            22, this.bonus.wings ? "#eef5ff" : "#cfe0f5", 2, 0.04, this.bonus.wings ? 1 : 0);
        }
      }
    }
    if (this.bonus.wings && !p.onGround && p.vy > 1.2 && !down) p.vy = 1.2;
    if (down && p.vy < 2) p.vy += 0.2;

    const wasAir = !p.onGround;
    moveBody(world, p, true, 0.86);
    if (!wasAir && p.onGround && this.falling) {
      const d = (p.y - this.fallStart) / TILE;
      if (d > 27 && !this.bonus.fire) {
        this.hurtPlayer(Math.floor((d - 27) * 4.4), p.x, 0, true);
        this.burst(p.x + p.w / 2, p.y + p.h, 12, "#c8b090", 2.4, 0);
        this.screenShake(6);
      }
      this.falling = false;
    }
    if (!p.onGround && p.vy > 0) { if (!this.falling) { this.fallStart = p.y; this.falling = true; } }
    else if (p.onGround) this.falling = false;
    if (swim) { p.vy *= 0.86; if (p.vy > 3) p.vy = 3; p.vx *= 0.955; }
    p.vy = Math.min(p.vy, MAX_FALL * (swim ? 0.4 : 1));

    if (liq === 2 && !this.bonus.fire) {
      if (this.frame % 12 === 0) this.hurtPlayer(24 + this.difficulty * 8, p.x, 1.5, true);
      if (this.frame % 3 === 0) {
        this.particle(p.x + Math.random() * p.w, p.y + p.h - Math.random() * 14, 0, -1 - Math.random(), 22, "#ff9b3d", 2, -0.02, 1);
      }
    }
    if (liq === 1 && this.frame % 300 === 0) this.particle(p.x + p.w / 2, p.y, 0, -0.6, 26, "#8fd0ff", 2, -0.02, 0);

    p.anim += Math.abs(p.vx) * 0.42 + 0.02;
    if (p.swing > 0) p.swing--;
    if (p.useT > 0) p.useT--;
    if (p.inv > 0) p.inv--;
    if (p.hurt > 0) p.hurt--;
    p.regen += 1.4 + this.bonus.regen * 2.4 + (p.hp < p.maxHp * 0.4 ? 0.5 : 0);
    if (p.regen >= 60) { p.regen = 0; if (p.hp < p.maxHp) p.hp++; }
    if (p.mana < p.maxMana) {
      p.manaAcc = (p.manaAcc ?? 0) + 1;
      if (p.manaAcc >= 13) { p.manaAcc = 0; p.mana = Math.min(p.maxMana, p.mana + 1); }
    }
    const maxX = world.w * TILE - p.w - 2;
    if (p.x < 2) { p.x = 2; p.vx = 0; }
    if (p.x > maxX) { p.x = maxX; p.vx = 0; }
    if (p.y < -500) { p.y = -500; p.vy = 0; }
    if (p.y > world.h * TILE + 100) this.hurtPlayer(9999, p.x, 0, true);
    const dep = Math.max(0, world.depth(p.x / TILE | 0, p.y / TILE | 0));
    if (dep > this.stats.depthBest) this.stats.depthBest = dep;
    if (p.onGround && Math.abs(p.vx) > 1 && ++p.stepT % 13 === 0) {
      this.particle(p.x + p.w / 2 - p.face * 4, p.y + p.h - 1, -p.face * 0.4, -0.3 - Math.random() * 0.4, 18, "#a08a6c", 1, 0.1, 0);
    }
  }

  /* ---------------- mouse actions ---------------- */
  private targetTile() {
    const S = this.zoom;
    const wx = this.cam.x + this.mouse.x / S;
    const wy = this.cam.y + this.mouse.y / S;
    return { tx: Math.floor(wx / TILE), ty: Math.floor(wy / TILE), wx, wy };
  }
  private inReach(tx: number, ty: number) {
    const p = this.player;
    const dx = (tx + 0.5) * TILE - (p.x + p.w / 2);
    const dy = (ty + 0.5) * TILE - (p.y + p.h / 2);
    return dx * dx + dy * dy < REACH * REACH;
  }
  private updateActions() {
    if (this.player.dead) return;
    if (this.mouse.right) this.tryPlace();
    if (this.mouse.left) {
      const it = this.selectedItemDef();
      const weapon = !!it && (it.kind === "sword" || it.kind === "bow" || it.kind === "magic");
      if (weapon) { if (this.player.useT <= 0) this.tryAttack(); }
      else this.updateMining();
    } else this.mining = null;
  }

  private updateMining() {
    const { tx, ty } = this.targetTile();
    const world = this.world;
    if (!world.inB(tx, ty) || !this.inReach(tx, ty)) { this.mining = null; return; }
    const t = world.get(tx, ty);
    if (t === T.AIR || TL.liquid[t]) { this.mining = null; return; }
    const sel = this.selectedItemDef();
    const need = TL.tool[t];
    const bareHand = !sel || sel.kind === "block" || sel.kind === "material" || sel.kind === "consumable" || sel.kind === "ammo";
    const power = need === TOOL_AXE ? (sel?.axe ?? (sel?.pick ? 0.5 : 1)) : (sel?.pick ?? 1);
    const speed = bareHand ? 0.42 : need === TOOL_AXE ? 0.5 + (sel!.axe ?? 0) * 0.3 : (sel!.pickSpeed ?? 0.5);
    if (power < TL.minPower[t]) {
      if (this.frame - this.mineWarn > 90) {
        this.mineWarn = this.frame;
        this.toast(`Needs a stronger ${need === TOOL_AXE ? "axe" : "pickaxe"}`, "#ff9b9b");
        sfx.play("error");
      }
      return;
    }
    if (!this.mining || this.mining.x !== tx || this.mining.y !== ty) this.mining = { x: tx, y: ty, prog: 0, max: TL.hp[t] };
    const m = this.mining;
    m.prog += speed * (1 + power * 0.42);
    if (this.frame % 7 === 0) {
      sfx.play(need === TOOL_AXE ? "digsoft" : "dig");
      const col = tileColor(t);
      for (let i = 0; i < 2; i++) {
        this.particle(tx * TILE + Math.random() * TILE, ty * TILE + Math.random() * TILE,
          (Math.random() - 0.5) * 1.6, -Math.random() * 1.4, 22, col, 2, 0.2, 0);
      }
    }
    if (m.prog >= m.max) this.breakTile(tx, ty);
  }

  breakTile(tx: number, ty: number) {
    const world = this.world;
    const t = world.get(tx, ty);
    if (t === T.AIR) return;
    const dropId = TL.drop[t];
    const n = TL.dropCount[t] || 1;
    const key = ty * world.w + tx;
    if (t === T.CHEST) {
      const loot = world.chests.get(key);
      for (const it of loot ?? []) this.spawnDrop(tx * TILE + 2, ty * TILE - 4, it.id, it.n, (Math.random() - 0.5) * 3, -2.6 - Math.random());
      world.chests.delete(key);
      if (this.chestKey === key) this.chestOpen = null;
      this.spawnDrop(tx * TILE + 2, ty * TILE, "chest", 1);
      sfx.play("chest");
    } else if (dropId && ITEMS[dropId]) {
      this.spawnDrop(tx * TILE + 2, ty * TILE, dropId, n);
    }
    if (t === T.SAND || t === T.GRAVEL) this.dirtyMinimap(tx, ty);
    world.setTile(tx, ty, T.AIR);
    if (t === T.SEAL) this.summonBoss(tx, ty);
    if (t === T.TRUNK) {
      let y = ty - 1;
      while (y > 0 && world.get(tx, y) === T.TRUNK) {
        world.setTile(tx, y, T.AIR);
        this.spawnDrop(tx * TILE + 2, y * TILE, "wood", 2, (Math.random() - 0.5) * 2, -1.6);
        y--;
      }
      this.pruneLeaves(tx, y);
    }
    this.settleColumn(tx, ty - 1);
    this.burst(tx * TILE + 8, ty * TILE + 8, 8, tileColor(t), 1.9, 0);
    this.stats.mined++;
    this.mining = null;
    sfx.play("break");
    this.markWorld();
    if (this.frame % 40 === 0) this.buildMinimap();
  }
  private pruneLeaves(cx: number, cy: number) {
    const world = this.world;
    for (let x = cx - 5; x <= cx + 5; x++) for (let y = cy - 7; y <= cy + 3; y++) {
      const t = world.get(x, y);
      if (t !== T.LEAF && t !== T.JLEAF) continue;
      let support = false;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]] as [number, number][]) {
        const nt = world.get(x + dx, y + dy);
        if (nt === T.TRUNK) { support = true; break; }
        if ((nt === T.LEAF || nt === T.JLEAF) && !(dx === 0 && dy === 0)) {
          if (world.get(x + dx, y + dy + 1) === T.TRUNK) { support = true; break; }
        }
      }
      if (!support) {
        world.setTile(x, y, T.AIR);
        if (Math.random() < 0.35) this.spawnDrop(x * TILE + 2, y * TILE, "wood", 1, (Math.random() - 0.5) * 1.5, -1);
        this.burst(x * TILE + 8, y * TILE + 8, 4, "#57b04a", 1.4, 0);
      }
    }
  }
  settleColumn(tx: number, ty: number) {
    const world = this.world;
    for (let y = ty; y > Math.max(0, ty - 42); y--) {
      const t = world.get(tx, y);
      if (t !== T.SAND && t !== T.GRAVEL) continue;
      let d = 0;
      while (world.get(tx, y + d + 1) === T.AIR && d < 70) d++;
      if (d > 0) {
        world.setTile(tx, y, T.AIR);
        world.setTile(tx, y + d, t);
        for (let i = 0; i < 4; i++) {
          this.particle(tx * TILE + Math.random() * 12, (y + d) * TILE, (Math.random() - 0.5) * 0.8, -0.4, 18, tileColor(t), 1, 0.2, 0);
        }
      }
    }
  }
  settleChip(tx: number, ty: number) { this.settleColumn(tx, ty); }

  private tryPlace() {
    const s = this.selected();
    if (!s) return;
    const it = itemDef(s.id);
    if (it.kind === "consumable" || it.kind === "armor" || it.kind === "accessory") return;
    const { tx, ty } = this.targetTile();
    const world = this.world;
    if (!this.inReach(tx, ty) || !world.inB(tx, ty)) return;
    if (it.tile === undefined) {
      if (this.frame - this.placeWarn > 90) { this.placeWarn = this.frame; this.toast("Select a block to place", "#a8e0ff"); }
      return;
    }
    const cur = world.get(tx, ty);
    const replaceable = cur === T.AIR || TL.liquid[cur] === 1 || cur === T.LEAF || cur === T.JLEAF || cur === T.GLOWSHROOM;
    if (!replaceable) return;
    const tile = it.tile;
    const touching = world.solid(tx - 1, ty) || world.solid(tx + 1, ty) || world.solid(tx, ty - 1) || world.solid(tx, ty + 1)
      || world.getWall(tx, ty) > 0 || TL.solid[tile] === 0;
    if (!touching) return;
    if (TL.solid[tile]) {
      const p = this.player;
      const bx = tx * TILE, by = ty * TILE;
      if (bx < p.x + p.w && bx + TILE > p.x && by < p.y + p.h && by + TILE > p.y) return;
      for (const e of this.enemies) {
        if (bx < e.x + e.w && bx + TILE > e.x && by < e.y + e.h && by + TILE > e.y) return;
      }
    }
    world.setTile(tx, ty, tile);
    this.removeAt(this.sel, 1);
    this.burst(tx * TILE + 8, ty * TILE + 8, 4, tileColor(tile), 1.1, 0);
    sfx.play("place");
    this.markWorld();
  }

  private tryInteract() {
    const { tx, ty } = this.targetTile();
    const world = this.world;
    if (!this.inReach(tx, ty) || !world.inB(tx, ty)) return;
    const t = world.get(tx, ty);
    if (t === T.CHEST) {
      const key = ty * world.w + tx;
      if (!world.chests.has(key)) world.chests.set(key, []);
      if (this.chestOpen && this.chestKey !== key) this.closeChest();
      const loot = world.chests.get(key)!;
      const chest = new Array(20).fill(null) as Slot[];
      loot.forEach((it, i) => { if (i < 20) chest[i] = { id: it.id, n: it.n }; });
      this.chestOpen = chest;
      this.chestKey = key;
      this.chestPos = [tx, ty];
      this.uiMode = "inv";
      sfx.play("chest");
      this.bumpInv();
      return;
    }
    const s = this.selected();
    const it = s ? itemDef(s.id) : null;
    if (it && (it.kind === "consumable" || it.kind === "armor" || it.kind === "accessory")) {
      if (it.kind === "consumable") this.consume(s!.id, this.sel, this.inv);
      else this.equipItem(this.sel, this.inv);
      return;
    }
    if (t === T.WORKBENCH || t === T.FURNACE || t === T.ANVIL) {
      this.uiMode = "inv";
      this.craftFilter = t === T.FURNACE ? "furnace" : t === T.ANVIL ? "anvil" : "workbench";
      this.bumpInv();
      sfx.play("ui");
      return;
    }
    this.tryPlace();
  }

  /* ============================================================
     COMBAT
     ============================================================ */
  private tryAttack() {
    const s = this.selected();
    if (!s) return;
    const it = itemDef(s.id);
    const p = this.player;
    if (p.useT > 0) return;
    if (it.kind === "sword") {
      p.swing = 16;
      p.useT = it.speed ?? 22;
      sfx.play("swing");
      const reach = (it.reach ?? 36) + 8;
      const cx = p.x + p.w / 2, cy = p.y + p.h * 0.42;
      const dmg = (it.damage ?? 10) * this.bonus.melee * (1 + this.difficulty * 0.05);
      let hitAny = false;
      for (const e of this.enemies) {
        const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
        const dx = ex - cx, dy = ey - cy;
        const d = Math.hypot(dx, dy);
        if (d > reach + Math.max(e.w, e.h) * 0.4) continue;
        const ang = Math.atan2(dy, dx);
        const facing = p.face > 0 ? ang > -1.5 && ang < 1.5 : ang > 1.64 || ang < -1.64;
        if (!facing) continue;
        const crit = Math.random() < this.bonus.crit + 0.02;
        this.damageEnemy(e, dmg * (crit ? 2 : 1), p.face * 4.5, crit);
        hitAny = true;
      }
      if (hitAny) this.screenShake(3);
      return;
    }
    if (it.kind === "bow") {
      const ammoIdx = this.inv.findIndex(sl => sl && itemDef(sl.id).ammo === "arrow");
      if (ammoIdx < 0) { this.toast("No arrows — craft some at a Work Bench", "#ff9b9b"); sfx.play("error"); p.useT = 20; return; }
      const a = this.inv[ammoIdx]!;
      const ad = itemDef(a.id);
      p.useT = it.speed ?? 26;
      const { wx, wy } = this.targetTile();
      const ang = Math.atan2(wy - (p.y + p.h * 0.42), wx - (p.x + p.w / 2));
      const spd = 7.6;
      this.removeAt(ammoIdx, 1);
      this.spawnProj({
        x: p.x + p.w / 2 + Math.cos(ang) * 10, y: p.y + p.h * 0.42 + Math.sin(ang) * 10,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        dmg: ((it.damage ?? 5) + (ad.damage ?? 3)) * this.bonus.ranged,
        kind: a.id === "wooden_arrow" ? "arrow" : a.id, fromPlayer: true,
        g: 0.055, life: 300, w: 12, h: 4, pierce: a.id === "frost_arrow" ? 1 : 0,
        light: a.id === "flaming_arrow" ? 100 : 0,
      });
      sfx.play("bow");
      p.vx -= Math.cos(ang) * 0.35;
      return;
    }
    if (it.kind === "magic") {
      const cost = it.mana ?? 8;
      if (p.mana < cost) { this.toast("Not enough mana", "#8f9bff"); sfx.play("error"); p.useT = 18; return; }
      p.mana -= cost;
      p.useT = it.speed ?? 24;
      const { wx, wy } = this.targetTile();
      const ang = Math.atan2(wy - (p.y + p.h * 0.42), wx - (p.x + p.w / 2));
      this.spawnProj({
        x: p.x + p.w / 2 + Math.cos(ang) * 12, y: p.y + p.h * 0.42 + Math.sin(ang) * 12,
        vx: Math.cos(ang) * 6.4, vy: Math.sin(ang) * 6.4,
        dmg: (it.damage ?? 12) * (1 + this.difficulty * 0.06),
        kind: it.projectile ?? "ember", fromPlayer: true, g: 0.012, life: 150, w: 9, h: 9,
        drag: 0.996, light: 110, pierce: it.projectile === "crystal" ? 1 : 0,
      });
      sfx.play("magic", 0.9 + Math.random() * 0.3);
      for (let i = 0; i < 4; i++) {
        this.particle(p.x + p.w / 2 + Math.cos(ang) * 12, p.y + p.h * 0.42, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, 16, "#c8a8ff", 2, 0.01, 1);
      }
      return;
    }
  }

  private projHits(pr: Proj) {
    if (pr.life <= 0) return;
    if (pr.fromPlayer) {
      for (const e of this.enemies) {
        if (e.dead || pr.hit.includes(e.uid)) continue;
        if (pr.x > e.x - pr.w / 2 && pr.x < e.x + e.w + pr.w / 2 && pr.y > e.y - pr.h / 2 && pr.y < e.y + e.h + pr.h / 2) {
          const crit = Math.random() < this.bonus.crit + 0.03;
          this.damageEnemy(e, pr.dmg * (crit ? 2 : 1), Math.sign(pr.vx) * 3.2, crit);
          if (pr.kind === "flaming_arrow") e.burn = 70;
          if (pr.kind === "frost_arrow") e.slow = 110;
          if (pr.pierce > 0) { pr.pierce--; pr.hit.push(e.uid); }
          else { pr.life = 0; this.impact(pr.x, pr.y, pr.kind, false); }
          break;
        }
      }
    } else {
      const p = this.player;
      if (!p.dead && pr.x > p.x - 2 && pr.x < p.x + p.w + 2 && pr.y > p.y - 2 && pr.y < p.y + p.h + 2) {
        this.hurtPlayer(pr.dmg, pr.x, 3.4);
        pr.life = 0;
        this.impact(pr.x, pr.y, pr.kind, false);
      }
    }
  }

  damageEnemy(e: Enemy, raw: number, kb: number, crit = false) {
    const dmg = Math.max(1, Math.round(raw - e.def.def * 0.5));
    e.hp -= dmg;
    e.hurt = 10;
    e.vx += kb * (1 - (e.def.kbResist ?? 0)) * 0.9;
    if (e.onGround) e.vy -= 1.2 * (1 - (e.def.kbResist ?? 0));
    this.floatText(e.x + e.w / 2, e.y - 2, String(dmg), crit ? "#ffd166" : "#fff3f3", crit ? 1 : 0);
    this.burst(e.x + e.w / 2, e.y + e.h / 2, crit ? 10 : 5, crit ? "#ffd166" : "#ff8f8f", 2, 0);
    sfx.play(crit ? "crit" : "hit");
    if (e.hp <= 0) this.killEnemy(e, this.enemies.indexOf(e));
  }

  private killEnemy(e: Enemy, i: number) {
    if (e.dead) return;
    e.dead = true;
    if (i >= 0) this.enemies.splice(i, 1);
    if (this.boss === e) this.boss = null;
    this.stats.kills++;
    const scale = 1 + this.difficulty * 0.25;
    for (const [id, amount, chance] of e.def.drops) {
      if (chance < 1 && Math.random() > chance) continue;
      this.spawnDrop(e.x + e.w / 2, e.y + e.h / 2, id, Math.max(1, Math.round(amount * (0.8 + Math.random() * 0.6))));
    }
    const coins = e.def.coins;
    if (coins[1] > 0) {
      this.spawnDrop(e.x + e.w / 2, e.y + e.h / 2, "coin", Math.max(1, Math.round((coins[0] + Math.random() * (coins[1] - coins[0])) * scale)));
    }
    this.burst(e.x + e.w / 2, e.y + e.h / 2, 16, e.def.color, 2.6, 0);
    this.particle(e.x + e.w / 2, e.y + e.h / 2, 0, 0, 26, e.def.glow ?? "#ffffff", 6, 0, 1);
    sfx.play("die", e.boss ? 0.55 : 1);
    if (e.boss) {
      this.toast(`${e.def.name} falls! The deep falls silent.`, "#a8e0ff");
      this.screenShake(14);
      for (let k = 0; k < 46; k++) {
        this.particle(e.x + e.w / 2 + (Math.random() - 0.5) * 70, e.y + e.h / 2 + (Math.random() - 0.5) * 70,
          (Math.random() - 0.5) * 5, -Math.random() * 4, 60, "#c9ff9a", 3, 0.14, 1);
      }
      for (let k = 0; k < 3; k++) this.spawnDrop(e.x + e.w / 2 + (k - 1) * 22, e.y, "ancient_core", 1, (k - 1) * 1.4, -3.6);
    }
  }

  hurtPlayer(raw: number, fromX: number, kb: number, ignoreInv = false) {
    const p = this.player;
    if (p.dead) return;
    if (p.inv > 0 && !ignoreInv) return;
    const dmg = Math.max(1, Math.round(raw * (0.85 + this.difficulty * 0.15) - this.def * 0.75));
    p.hp -= dmg;
    p.inv = 46;
    p.hurt = 14;
    p.vx += (p.x + p.w / 2 < fromX ? -1 : 1) * kb;
    p.vy = Math.min(p.vy, -3);
    this.floatText(p.x + p.w / 2, p.y - 4, "-" + dmg, "#ff7a7a");
    this.burst(p.x + p.w / 2, p.y + p.h / 2, 7, "#ff5a6a", 2, 0);
    this.screenShake(5);
    sfx.play("hurt");
    if (p.hp <= 0) this.die();
  }
  private die() {
    const p = this.player;
    p.hp = 0; p.dead = true; p.deadT = 0;
    this.dead = true;
    this.respawnT = 170;
    this.burst(p.x + p.w / 2, p.y + p.h / 2, 30, "#ff5a6a", 3.4, 0);
    sfx.play("die");
    this.screenShake(11);
    const lost = Math.floor(this.stats.coins * 0.25);
    if (lost > 0) { this.spawnDrop(p.x, p.y, "coin", lost, 0, -2); this.stats.coins -= lost; }
    this.save(true);
  }
  respawn() {
    const p = this.player, world = this.world;
    p.dead = false; p.deadT = 0;
    this.dead = false;
    p.hp = p.maxHp; p.mana = p.maxMana;
    p.vx = 0; p.vy = 0; p.inv = 90;
    p.x = world.spawnX * TILE; p.y = (world.spawnY - 1) * TILE;
    let guard = 0;
    while (boxHits(world, p.x, p.y, p.w, p.h) && guard++ < 80) p.y -= TILE;
    this.cam.x = p.x - 200; this.cam.y = p.y - 140;
    this.toast("You awaken at your spawn point", "#a8e0ff");
    this.burst(p.x + p.w / 2, p.y + p.h / 2, 18, "#a8e0ff", 2.4, 1);
  }

  spawnBossMinion(x: number, y: number) {
    if (this.enemies.length > 20) return;
    const kinds = ["magma_slime", "slime_gold", "bat", "crawler"];
    const e = makeEnemy(kinds[(Math.random() * kinds.length) | 0], x + (Math.random() - 0.5) * 70, y - 12, 1 + this.difficulty * 0.15);
    this.enemies.push(e);
    this.burst(x, y, 12, "#c9ff9a", 2.2, 1);
  }
  bossSlam(x: number, y: number) {
    this.screenShake(12);
    sfx.play("slam");
    for (const dx of [-1, 1]) {
      for (let i = 1; i <= 4; i++) {
        this.spawnProj({
          x: x + dx * i * 15, y: y - 8, vx: dx * (1.7 + i * 0.55), vy: -4.4, dmg: 20, kind: "rock",
          fromPlayer: false, g: 0.26, life: 170, w: 10, h: 10,
        });
      }
    }
    this.burst(x, y, 24, "#c9bda6", 3.2, 0);
  }
  private summonBoss(tx: number, ty: number) {
    this.toast("The Ancient Seal shatters — something enormous stirs!", "#ff8f6b");
    sfx.play("roar");
    this.screenShake(18);
    const e = makeEnemy("golem_king", tx * TILE - 20, ty * TILE - 70, 1 + this.difficulty * 0.2);
    this.enemies.push(e);
    this.boss = e;
    this.world.bossSummoned = true;
  }

  /* ---------------- drops / particles ---------------- */
  private updateDrops() {
    const p = this.player, world = this.world;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t++;
      const dx = p.x + p.w / 2 - (d.x + d.w / 2), dy = p.y + p.h / 2 - (d.y + d.h / 2);
      const dist = Math.hypot(dx, dy) || 1;
      if (d.t > d.pick) {
        if (dist < 74 && !p.dead) { d.vx += (dx / dist) * 1.05; d.vy += (dy / dist) * 1.05; }
        else if (dist > 420 && d.t > 900) { this.drops.splice(i, 1); continue; }
      }
      d.vy = Math.min(d.vy + 0.45, 11);
      d.vx *= 0.94;
      moveBody(world, d, true, 0.8);
      if (d.y > world.h * TILE) { this.drops.splice(i, 1); continue; }
      if (!p.dead && d.t > 12 && d.x < p.x + p.w && d.x + d.w > p.x && d.y < p.y + p.h && d.y + d.h > p.y) {
        const left = this.addItem(d.id, d.n);
        if (left === 0) {
          if (d.id === "coin") this.stats.coins += d.n;
          this.floatText(p.x + p.w / 2, p.y - 8, "+" + d.n + " " + itemName(d.id), "#dff0ff");
          sfx.play("pickup", 1 + Math.random() * 0.2);
          this.drops.splice(i, 1);
        } else d.n = left;
      }
    }
  }
  private updateParticles() {
    const world = this.world;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i];
      q.life--;
      if (q.life <= 0) { this.parts.splice(i, 1); continue; }
      q.vy += q.grav;
      q.vx *= 0.99;
      q.x += q.vx; q.y += q.vy;
      if (TL.solid[world.get(q.x / TILE | 0, q.y / TILE | 0)] === 1) {
        if (q.grav > 0) { q.vy = -q.vy * 0.22; q.vx *= 0.6; q.y -= 1; }
        q.grav *= 0.55;
      }
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life--; f.y += f.vy; f.vy *= 0.94;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }
  }

  /* ---------------- ambient life ---------------- */
  private ambientT = 0;
  private ambient() {
    const c = this.canvas;
    if (!c || this.settings.particles <= 0) return;
    if (++this.ambientT % 5 !== 0) return;
    const S = this.zoom;
    const x = this.cam.x + Math.random() * (c.width / S);
    const y = this.cam.y + Math.random() * (c.height / S);
    const tx = x / TILE | 0, ty = y / TILE | 0;
    const world = this.world;
    if (world.get(tx, ty) !== T.AIR) return;
    const layer = world.layer(tx, ty);
    const roll = Math.random();
    if (layer === 0) {
      const b = world.biome[tx];
      if (this.night() && roll < 0.55) {
        this.particle(x, y, (Math.random() - 0.5) * 0.35, -0.1 - Math.random() * 0.2, 150, "#c8ff8a", 2, -0.004, 1);
      } else if (b === B_SNOW && roll < 0.9) {
        this.particle(x, y, (Math.random() - 0.5) * 0.5, 0.5 + Math.random() * 0.5, 200, "#eef8ff", 1, 0.004, 0);
      } else if (b === B_JUNGLE && roll < 0.5) {
        this.particle(x, y, 0.25 + Math.random() * 0.3, 0.12, 150, "#d8ff8a", 1, 0.002, 0);
      } else if (b === B_DESERT && roll < 0.35) {
        this.particle(x, y, 0.5 + Math.random() * 0.6, -0.05, 110, "#e8d5a0", 1, 0.002, 0);
      }
    } else if (roll < 0.7) {
      const frozen = world.deep[tx] === D_FROZEN;
      const hot = world.deep[tx] === D_SCORCHED;
      if (hot) this.particle(x, y, (Math.random() - 0.5) * 0.2, -0.35 - Math.random() * 0.4, 130, "#ff9b4a", 1, -0.003, 1);
      else this.particle(x, y, (Math.random() - 0.5) * 0.1, frozen ? -0.18 : 0.22, 220, frozen ? "#bfe6ff" : "#7f8598", 1, 0.002, 0);
    }
  }

  /* ---------------- enemy spawning ---------------- */
  private updateSpawns() {
    const world = this.world, p = this.player;
    const cap = 8 + this.difficulty * 4 + (world.layer(p.x / TILE | 0, p.y / TILE | 0) === 2 ? 3 : 0);
    if (--this.spawnTimer <= 0 && this.enemies.length < cap) {
      this.spawnTimer = 34 + Math.random() * 46;
      const under = world.underground(p.x / TILE | 0, p.y / TILE | 0);
      const night = this.night();
      const px = p.x / TILE | 0, py = p.y / TILE | 0;
      for (let tries = 0; tries < 16; tries++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const tx = px + side * (24 + ((Math.random() * 22) | 0));
        if (tx < 3 || tx > world.w - 3) continue;
        let ty = under ? py + ((Math.random() * 30) | 0) - 15 : world.surf[tx] - 3;
        ty = Math.max(2, Math.min(world.h - 6, ty | 0));
        if (world.get(tx, ty) !== T.AIR || !world.solid(tx, ty + 1)) continue;
        if (Math.abs(ty - py) > 40) continue;
        const spawnLayer = world.layer(tx, ty);
        const db = world.deep[tx];
        const sb = world.biome[tx];
        const biomeKey = spawnLayer === 0 ? sb : db === D_FROZEN ? B_SNOW : db === D_SCORCHED ? B_DESERT : -1;
        const pool: string[] = [];
        for (const key in ENEMIES) {
          const d = ENEMIES[key];
          if (d.boss) continue;
          if (!d.spawnLayers.includes(spawnLayer)) continue;
          if (d.biomes && !d.biomes.includes(biomeKey < 0 ? 0 : biomeKey === B_JUNGLE ? 2 : biomeKey === B_SNOW ? 3 : biomeKey === B_DESERT ? 4 : 0)) continue;
          if (spawnLayer === 0) {
            if (d.id === "zombie" && !night) continue;
            if (!night && Math.random() < 0.6) continue;
            if (night && Math.random() < 0.25) continue;
          }
          pool.push(key);
        }
        if (!pool.length) continue;
        const kind = pool[(Math.random() * pool.length) | 0];
        const scale = 1 + spawnLayer * 0.2 + this.difficulty * 0.22;
        this.enemies.push(makeEnemy(kind, tx * TILE, ty * TILE, scale));
        break;
      }
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.boss) continue;
      const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
      if (d > 150 * TILE) this.enemies.splice(i, 1);
      else if (d > 66 * TILE && e.hp > 0 && !e.boss) { e.hp = -1; this.killEnemy(e, i); }
    }
  }

  /* ---------------- camera / lighting ---------------- */
  private updateCamera() {
    const p = this.player, c = this.canvas;
    if (!c) return;
    const S = this.zoom;
    const vw = c.width / S, vh = c.height / S;
    let tx = p.x + p.w / 2 - vw / 2, ty = p.y + p.h / 2 - vh / 2;
    if (this.mouse.inside && !this.paused && this.uiMode === "none") {
      tx += (this.mouse.x / S - vw / 2) * 0.13;
      ty += (this.mouse.y / S - vh / 2) * 0.13;
    }
    this.cam.x += (tx - this.cam.x) * 0.15;
    this.cam.y += (ty - this.cam.y) * 0.15;
    this.cam.x = Math.max(0, Math.min(Math.max(0, worldPx(this.world.w, TILE) - vw), this.cam.x));
    this.cam.y = Math.max(-140, Math.min(worldPx(this.world.h, TILE) - vh + 8, this.cam.y));
  }
  private updateLighting() {
    const c = this.canvas;
    if (!c || !this.settings.lighting) return;
    const df = this.dayFactor();
    const dl = 0.2 + 0.8 * df;
    const tint = skyTint(this.time);
    this.sources.length = 0;
    for (const pr of this.projs) if (pr.light) this.sources.push(pr.x / TILE | 0, pr.y / TILE | 0, pr.light);
    const it = this.selectedItemDef();
    const p = this.player;
    if (it?.light) this.sources.push((p.x + p.w / 2) / TILE | 0, (p.y + p.h / 2) / TILE | 0, it.light);
    for (const q of this.parts) if (q.glow > 0 && q.life > q.max - 5) this.sources.push(q.x / TILE | 0, q.y / TILE | 0, 50);
    const ccx = Math.floor((this.cam.x + (c.width / this.zoom) / 2) / TILE);
    const ccy = Math.floor((this.cam.y + (c.height / this.zoom) / 2) / TILE);
    this.world.updateLight(ccx, ccy, dl, tint, this.sources);
  }

  markWorld() { this.modified = Date.now(); }

  /* ============================================================
     RENDER
     ============================================================ */
  render() {
    const ctx = this.ctx, c = this.canvas;
    if (!ctx || !c) return;
    const S = this.zoom;
    const Wpx = c.width, Hpx = c.height;
    const camx = Math.round(this.cam.x * S) / S, camy = Math.round(this.cam.y * S) / S;
    let shx = 0, shy = 0;
    if (this.shakeT > 0) { shx = (Math.random() - 0.5) * this.shakeMag / S; shy = (Math.random() - 0.5) * this.shakeMag / S; }
    const t = this.time;
    const df = this.dayFactor();
    const p = this.player;
    const world = this.world;
    const dep = world.depth(p.x / TILE | 0, p.y / TILE | 0);
    const skyFade = Math.max(0, Math.min(1, 1 - (dep - 3) / 8));
    const sky = skyColors(t);

    /* ---- sky & backdrop ---- */
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (skyFade <= 0.02) {
      ctx.fillStyle = "#05060a";
      ctx.fillRect(0, 0, Wpx, Hpx);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, Hpx);
      g.addColorStop(0, mixHex(sky.top, "#05060a", 1 - skyFade));
      g.addColorStop(0.6, mixHex(sky.bot, "#05060a", 1 - skyFade));
      g.addColorStop(1, mixHex(sky.hor, "#05060a", 1 - skyFade));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, Wpx, Hpx);
    }
    ctx.save();
    ctx.globalAlpha = skyFade;
    if (df < 0.55) {
      const a = (0.55 - df) / 0.55;
      for (const st of this.stars) {
        const x = mod(st.x * Wpx * 1.4 - camx * 0.06 * S, Wpx * 1.4);
        const y = st.y * Hpx - camy * S * 0.008;
        if (y < -2 || y > Hpx * 0.8) continue;
        const tw = 0.5 + 0.5 * Math.sin(this.frame * 0.045 + st.t);
        ctx.fillStyle = `rgba(255,255,255,${(a * tw).toFixed(3)})`;
        ctx.fillRect(x, y, st.s, st.s);
      }
    }
    // sun & moon
    const ang = (t - 0.25) * Math.PI * 2;
    const sunX = Wpx * 0.5 + Math.cos(ang - Math.PI / 2) * Wpx * 0.44;
    const sunY = Hpx * 0.66 - Math.sin(ang - Math.PI / 2) * Hpx * 0.58;
    const isDay = df > 0.38;
    ctx.globalAlpha = skyFade;
    if (isDay) {
      ctx.globalAlpha = skyFade * 0.16;
      ctx.fillStyle = "#fff0b8";
      ctx.beginPath(); ctx.arc(sunX, sunY, 54, 0, 6.283); ctx.fill();
      ctx.globalAlpha = skyFade;
      ctx.fillStyle = "#fff6cf";
    } else {
      ctx.fillStyle = "#e6ecff";
    }
    ctx.beginPath(); ctx.arc(sunX, sunY, isDay ? 20 : 14, 0, 6.283); ctx.fill();
    if (!isDay) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath(); ctx.arc(sunX - 6, sunY - 4, 12, 0, 6.283); ctx.fill();
      ctx.restore();
    }
    // clouds
    ctx.globalAlpha = skyFade * (0.42 + df * 0.4);
    for (const cl of this.clouds) {
      cl.x += cl.s;
      const x = mod(cl.x - camx * S * 0.16, Wpx + 600) - 300;
      const y = cl.y - mod(camy * S * 0.06, 300);
      if (y < -80 || y > Hpx * 0.6) continue;
      ctx.fillStyle = mixHex("#f6faff", sky.bot, 0.3);
      ctx.beginPath();
      ctx.ellipse(x, y, cl.w * 0.5, cl.h * 0.5, 0, 0, 6.283);
      ctx.ellipse(x + cl.w * 0.3, y + 4, cl.w * 0.3, cl.h * 0.4, 0, 0, 6.283);
      ctx.ellipse(x - cl.w * 0.3, y + 5, cl.w * 0.26, cl.h * 0.33, 0, 0, 6.283);
      ctx.fill();
    }
    // parallax ridges
    ctx.globalAlpha = 1;
    if (skyFade > 0.05) {
      for (let layer = 0; layer < 2; layer++) {
        const amp = layer === 0 ? 46 : 32;
        const baseY = Hpx * (layer === 0 ? 0.62 : 0.72) - camy * S * (layer === 0 ? 0.006 : 0.012);
        ctx.fillStyle = mixHex(layer === 0 ? "#2b4256" : "#1d2f3f", sky.bot, layer === 0 ? 0.45 : 0.25);
        ctx.globalAlpha = skyFade * (layer === 0 ? 0.5 : 0.8);
        ctx.beginPath();
        ctx.moveTo(0, Hpx);
        for (let sx = 0; sx <= Wpx + 8; sx += 8) {
          const n = fbm1((camx * S + sx) / (layer === 0 ? 220 : 140), 3, 1337 + layer * 7);
          ctx.lineTo(sx, baseY - n * amp);
        }
        ctx.lineTo(Wpx, Hpx);
        ctx.closePath();
        ctx.fill();
        if (layer === 1) {
          for (let sx = 0; sx <= Wpx; sx += 22) {
            const n = fbm1((camx * S + sx) / 140, 3, 1344);
            if (n > 0.56) {
              const ty2 = baseY - n * amp;
              ctx.fillRect(sx, ty2 - 8, 2, 9);
              ctx.beginPath(); ctx.arc(sx + 1, ty2 - 10, 4.5, 0, 6.283); ctx.fill();
            }
          }
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    /* ---- world ---- */
    ctx.save();
    ctx.scale(S, S);
    ctx.translate(-camx + shx, -camy + shy);
    const vx0 = camx, vy0 = camy, vx1 = camx + Wpx / S, vy1 = camy + Hpx / S;
    const tx0 = Math.max(0, Math.floor(vx0 / TILE)), ty0 = Math.max(0, Math.floor(vy0 / TILE));
    const tx1 = Math.min(world.w - 1, Math.ceil(vx1 / TILE)), ty1 = Math.min(world.h - 1, Math.ceil(vy1 / TILE));
    ctx.imageSmoothingEnabled = false;
    const cx0 = Math.floor(tx0 / CH), cx1 = Math.floor(tx1 / CH);
    const cy0 = Math.floor(ty0 / CH), cy1 = Math.floor(ty1 / CH);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (cx < 0 || cy < 0) continue;
        ctx.drawImage(world.getChunk(cx, cy), cx * CH * TILE, cy * CH * TILE);
      }
    }
    this.drawLiquids(ctx, tx0, ty0, tx1, ty1);
    if (this.settings.showGrid) {
      ctx.strokeStyle = "rgba(255,255,255,0.055)";
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      for (let x = tx0; x <= tx1; x++) { ctx.moveTo(x * TILE, ty0 * TILE); ctx.lineTo(x * TILE, (ty1 + 1) * TILE); }
      for (let y = ty0; y <= ty1; y++) { ctx.moveTo(tx0 * TILE, y * TILE); ctx.lineTo((tx1 + 1) * TILE, y * TILE); }
      ctx.stroke();
    }
    for (const d of this.drops) {
      if (d.x < vx0 - 24 || d.x > vx1 + 24 || d.y < vy0 - 24 || d.y > vy1 + 24) continue;
      drawDrop(ctx, d as never, this.frame);
    }
    for (const e of this.enemies) {
      if (e.x + e.w < vx0 - 48 || e.x > vx1 + 48 || e.y + e.h < vy0 - 48 || e.y > vy1 + 48) continue;
      drawEnemy(ctx, e, this.frame);
    }
    ctx.globalAlpha = p.dead ? 0.45 : 1;
    drawHero(ctx, p, this.look(), this.heldItem(), this.frame);
    ctx.globalAlpha = 1;
    for (const pr of this.projs) this.drawProj(ctx, pr);
    for (const q of this.parts) {
      const a = Math.max(0, Math.min(1, q.life / q.max));
      ctx.globalAlpha = a * (q.glow ? 0.95 : 0.8);
      ctx.fillStyle = q.col;
      ctx.fillRect(q.x, q.y, q.size, q.size);
    }
    ctx.globalAlpha = 1;
    this.drawCursor(ctx);
    ctx.restore();

    /* ---- lighting ---- */
    if (this.settings.lighting && world.lightReady) {
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(world.lightCanvas,
        (world.lx0 * TILE - camx) * S, (world.ly0 * TILE - camy) * S,
        LW * TILE * S, LH * TILE * S);
      ctx.restore();
    } else if (!this.settings.lighting) {
      // keep the light region fresh anyway so toggling works instantly
      world.lightReady = true;
    }

    /* ---- glow ---- */
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.scale(S, S);
    ctx.translate(-camx + shx, -camy + shy);
    this.drawGlow(ctx, tx0, ty0, tx1, ty1);
    ctx.restore();

    /* ---- screen overlays ---- */
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textAlign = "center";
    for (const f of this.floaters) {
      const sx = (f.x - camx) * S, sy = (f.y - camy) * S;
      ctx.globalAlpha = Math.min(1, f.life / 26);
      ctx.font = f.big ? "700 15px 'Silkscreen', monospace" : "700 11px 'Silkscreen', monospace";
      ctx.fillStyle = "rgba(6,9,16,0.85)";
      ctx.fillText(f.text, sx + 1, sy + 1);
      ctx.fillStyle = f.col;
      ctx.fillText(f.text, sx, sy);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
    if (p.hurt > 0) {
      ctx.globalAlpha = Math.min(0.55, p.hurt / 24);
      const g = ctx.createRadialGradient(Wpx / 2, Hpx / 2, Hpx * 0.2, Wpx / 2, Hpx / 2, Hpx * 0.8);
      g.addColorStop(0, "rgba(190,20,40,0)");
      g.addColorStop(1, "rgba(170,8,28,0.9)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, Wpx, Hpx);
      ctx.globalAlpha = 1;
    }
    const grade = this.biomeGrade();
    if (grade.a > 0.01) {
      ctx.globalAlpha = grade.a;
      ctx.fillStyle = grade.col;
      ctx.fillRect(0, 0, Wpx, Hpx);
      ctx.globalAlpha = 1;
    }
    const vg = ctx.createRadialGradient(Wpx / 2, Hpx / 2, Math.min(Wpx, Hpx) * 0.4, Wpx / 2, Hpx / 2, Math.max(Wpx, Hpx) * 0.8);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(2,4,10,0.7)");
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, Wpx, Hpx);
    ctx.globalAlpha = 1;
  }

  private biomeGrade() {
    const p = this.player;
    const tx = Math.max(0, Math.min(this.world.w - 1, p.x / TILE | 0));
    const layer = this.world.layer(tx, p.y / TILE | 0);
    const db = this.world.deep[tx];
    const sb = this.world.biome[tx];
    let col = "#000000", a = 0;
    if (layer === 2) { a = 0.15; col = db === D_SCORCHED ? "#ff5a2a" : db === D_FROZEN ? "#4aa8ff" : "#3a2a55"; }
    else if (layer === 1) { a = 0.09; col = db === D_FROZEN ? "#6ac9ff" : db === D_SCORCHED ? "#ff7a3a" : "#2a3550"; }
    else if (sb === B_SNOW) { a = 0.09; col = "#9fd8ff"; }
    else if (sb === B_DESERT) { a = 0.08; col = "#ffcf8a"; }
    else if (sb === B_JUNGLE) { a = 0.08; col = "#6ad86a"; }
    return { col, a };
  }
  look(): Look {
    return {
      skin: "#e8b48c", hair: "#6b3a22",
      helm: this.equip.helm ? metalOfItem(this.equip.helm.id) : null,
      chest: this.equip.chest ? metalOfItem(this.equip.chest.id) : null,
      legs: this.equip.legs ? metalOfItem(this.equip.legs.id) : null,
      wing: this.bonus.wings, fireproof: this.bonus.fire,
    };
  }
  heldItem(): string | null {
    const s = this.selected();
    if (!s) return null;
    const it = itemDef(s.id);
    return it.kind === "sword" || it.kind === "magic" || it.kind === "tool" || it.kind === "bow" ? s.id : null;
  }

  private drawLiquids(ctx: CanvasRenderingContext2D, tx0: number, ty0: number, tx1: number, ty1: number) {
    const world = this.world;
    const f = this.frame * 0.06;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = world.get(tx, ty);
        if (t !== T.WATER && t !== T.LAVA) continue;
        const above = world.get(tx, ty - 1);
        const isLava = t === T.LAVA;
        const x = tx * TILE, y = ty * TILE;
        ctx.fillStyle = isLava ? "rgba(214,74,26,0.94)" : "rgba(38,102,196,0.6)";
        ctx.fillRect(x, y, TILE, TILE);
        if (above !== T.WATER && above !== T.LAVA) {
          const w1 = Math.sin(f + tx * 0.7) * 1.6;
          ctx.fillStyle = isLava ? "rgba(255,176,58,0.95)" : "rgba(120,196,255,0.55)";
          ctx.fillRect(x, y + 2 + w1, TILE, 2);
          ctx.fillStyle = isLava ? "rgba(255,224,138,0.75)" : "rgba(200,236,255,0.4)";
          ctx.fillRect(x, y + w1, TILE, 2);
        }
        if (isLava && ((tx * 3 + ty) % 7) === (this.frame >> 4) % 7) {
          ctx.fillStyle = "rgba(255,224,138,0.55)";
          ctx.fillRect(x + 4, y + 4 + Math.sin(f + tx) * 2, 3, 2);
        }
        if (!isLava && Math.random() < 0.0016) {
          this.particle(x + 2 + Math.random() * 12, y, 0, -0.35, 30, "#8fd0ff", 1, 0.01, 0);
        }
      }
    }
  }

  private drawProj(ctx: CanvasRenderingContext2D, pr: Proj) {
    const a = PROJ_ART[pr.kind] ?? PROJ_ART.arrow;
    ctx.save();
    ctx.translate(pr.x, pr.y);
    ctx.rotate(pr.rot);
    if (pr.kind === "arrow" || pr.kind === "bone_arrow") {
      ctx.fillStyle = a.col;
      ctx.fillRect(-a.w / 2, -1.5, a.w, 3);
      ctx.fillStyle = "#e8e8e8";
      ctx.fillRect(a.w / 2 - 3, -2, 3, 4);
      ctx.fillStyle = "#c9c9c9";
      ctx.fillRect(-a.w / 2, -2, 3, 4);
    } else {
      ctx.fillStyle = a.col;
      ctx.fillRect(-a.w / 2, -a.h / 2, a.w, a.h);
      ctx.fillStyle = a.glow;
      ctx.fillRect(-a.w / 2 + 1, -a.h / 2 + 1, Math.max(1, a.w / 2), Math.max(1, a.h / 2));
    }
    ctx.restore();
  }

  private glowSprite(col: string): HTMLCanvasElement {
    let cv = this.glowCache.get(col);
    if (cv) return cv;
    cv = document.createElement("canvas");
    cv.width = 64; cv.height = 64;
    const g = cv.getContext("2d")!;
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, col);
    rg.addColorStop(0.3, shadeHex(col, 0.9));
    rg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, 64, 64);
    this.glowCache.set(col, cv);
    return cv;
  }

  private drawGlow(ctx: CanvasRenderingContext2D, tx0: number, ty0: number, tx1: number, ty1: number) {
    const world = this.world;
    let n = 0;
    const maxGlow = 90;
    for (let ty = ty0; ty <= ty1 && n < maxGlow; ty++) {
      for (let tx = tx0; tx <= tx1 && n < maxGlow; tx++) {
        const em = TL.light[world.get(tx, ty)];
        if (em <= 0) continue;
        const t = world.get(tx, ty);
        n++;
        const size = (t === T.LAVA ? 1.7 : 3.6) * TILE;
        const col = t === T.LAVA || t === T.FURNACE || t === T.TORCH ? "#ff9b3d"
          : t === T.CRYSTAL ? "#8ef0ff" : t === T.RUBY ? "#ff6a8a" : t === T.AMBER ? "#ffc266"
            : t === T.SEAL ? "#ffb648" : t === T.GLOWSHROOM ? "#63e0ff" : "#ffb04a";
        ctx.globalAlpha = Math.min(0.5, (em / 255) * (t === T.LAVA ? 0.34 : 0.6)) * (0.85 + Math.sin(this.frame * 0.09 + tx * 1.7 + ty) * 0.15);
        ctx.drawImage(this.glowSprite(col), tx * TILE + TILE / 2 - size / 2, ty * TILE + TILE / 2 - size / 2, size, size);
        if (t === T.TORCH) {
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = "#ffe08a";
          const fl = Math.sin(this.frame * 0.3 + tx * 2) * 0.8;
          ctx.fillRect(tx * TILE + 6.5, ty * TILE + 2 + fl, 3, 3.5);
        }
      }
    }
    for (const q of this.parts) {
      if (!q.glow) continue;
      ctx.globalAlpha = (q.life / q.max) * 0.45;
      ctx.fillStyle = q.col;
      ctx.fillRect(q.x - q.size, q.y - q.size, q.size * 2.2, q.size * 2.2);
    }
    for (const pr of this.projs) {
      const a = PROJ_ART[pr.kind];
      if (!a) continue;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(this.glowSprite(a.glow), pr.x - 10, pr.y - 10, 20, 20);
    }
    const it = this.selectedItemDef();
    if (it?.light) {
      const p = this.player;
      ctx.globalAlpha = 0.35;
      const s = TILE * 3.4;
      ctx.drawImage(this.glowSprite("#ffd166"), p.x + p.w / 2 - s / 2, p.y + p.h / 2 - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  private drawCursor(ctx: CanvasRenderingContext2D) {
    if (this.uiMode !== "none" || this.paused || !this.mouse.inside || this.dead) return;
    const { tx, ty } = this.targetTile();
    const world = this.world;
    if (!world.inB(tx, ty)) return;
    const ok = this.inReach(tx, ty);
    const t = world.get(tx, ty);
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = ok ? "rgba(255,255,255,0.9)" : "rgba(255,120,120,0.45)";
    ctx.strokeRect(tx * TILE + 0.5, ty * TILE + 0.5, TILE - 1, TILE - 1);
    const s = this.selected();
    if (s && ok) {
      const it = itemDef(s.id);
      if (it.tile !== undefined && (t === T.AIR || TL.liquid[t] === 1)) {
        ctx.globalAlpha = 0.42;
        ctx.drawImage(getAtlas(), 0, it.tile * TILE, TILE, TILE, tx * TILE, ty * TILE, TILE, TILE);
        ctx.globalAlpha = 1;
      }
    }
    if (this.mining && ok) {
      const m = this.mining;
      const k = Math.max(0, Math.min(1, m.prog / m.max));
      ctx.fillStyle = `rgba(0,0,0,${(0.08 + k * 0.28).toFixed(2)})`;
      ctx.fillRect(m.x * TILE, m.y * TILE, TILE, TILE);
      ctx.strokeStyle = "rgba(8,10,16,0.8)";
      ctx.lineWidth = 0.6;
      const cracks = Math.ceil(k * 4);
      for (let i = 0; i < cracks; i++) {
        const sx = m.x * TILE + 2 + ((i * 5) % 11), sy = m.y * TILE + 3 + ((i * 7) % 9);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 4 - i, sy + 5);
        ctx.lineTo(sx + 7, sy + 9 - i);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(4,6,12,0.75)";
      ctx.fillRect(m.x * TILE - 0.5, m.y * TILE - 4, TILE + 1, 2.5);
      ctx.fillStyle = k > 0.75 ? "#8fe0a8" : "#ffd166";
      ctx.fillRect(m.x * TILE, m.y * TILE - 3.5, (TILE - 1) * k, 1.5);
    }
  }

  /* ---------------- crafting ---------------- */
  stationsHere(): Record<string, boolean> {
    const p = this.player;
    return this.world.stationsNear(p.x / TILE | 0, p.y / TILE | 0);
  }
  craftList(): { r: Recipe; can: boolean; have: number[]; idx: number }[] {
    const st = this.stationsHere();
    const out: { r: Recipe; can: boolean; have: number[]; idx: number }[] = [];
    RECIPES.forEach((r, idx) => {
      if (r.at !== "hand" && !st[r.at]) return;
      if (this.craftFilter !== "all" && r.at !== this.craftFilter) return;
      const have = r.need.map(([id]) => this.countItem(id));
      const can = r.need.every(([, n], i) => have[i] >= n);
      out.push({ r, can, have, idx });
    });
    out.sort((a, b) => (b.can ? 1 : 0) - (a.can ? 1 : 0));
    return out;
  }
  craftAt(i: number) {
    const entry = this.craftList()[i];
    if (!entry) return;
    if (!entry.can) { sfx.play("error"); this.toast("Missing materials", "#ff9b9b"); return; }
    for (const [id, n] of entry.r.need) this.takeItem(id, n);
    const left = this.addItem(entry.r.out, entry.r.count);
    if (left > 0) this.spawnDrop(this.player.x, this.player.y - 10, entry.r.out, left);
    this.stats.crafted++;
    sfx.play("craft");
    this.toast(`Crafted ${itemName(entry.r.out)} ×${entry.r.count}`, "#a8e0ff");
    this.burst(this.player.x + this.player.w / 2, this.player.y + 10, 10, "#ffd166", 1.6, 1);
    this.markWorld();
    this.bumpInv();
  }

  /* ---------------- minimap ---------------- */
  buildMinimap() {
    const world = this.world;
    const sc = 8;
    const mw = Math.ceil(world.w / sc), mh = Math.ceil(world.h / sc);
    if (!this.minimap) {
      const cv = document.createElement("canvas");
      cv.width = mw; cv.height = mh;
      this.minimap = cv;
    }
    const ctx = this.minimap.getContext("2d")!;
    const img = ctx.createImageData(mw, mh);
    const d = img.data;
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        const tx = x * sc, ty = y * sc;
        let col = "#05070c";
        let found = false;
        for (let k = 0; k < sc && !found; k++) {
          const t = world.get(tx, ty + k);
          if (t !== T.AIR) { col = tileColor(t); found = true; }
        }
        if (!found) col = ty < world.surf[Math.min(world.w - 1, tx)] ? "#1a2a44" : "#0a0d16";
        const [r, g, b] = hexRgb(col);
        const o = (y * mw + x) * 4;
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  dirtyMinimap(_tx: number, _ty: number) { if (this.frame % 30 === 0) this.buildMinimap(); }
  drawMinimapInto(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (!this.minimap) this.buildMinimap();
    const world = this.world;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.minimap!, 0, 0, w, h);
    // viewport box
    const sx = w / (world.w * TILE), sy = h / (world.h * TILE);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    const c = this.canvas;
    if (c) ctx.strokeRect(this.cam.x * sx, this.cam.y * sy, (c.width / this.zoom) * sx, (c.height / this.zoom) * sy);
    // player
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(this.player.x * sx - 1.5, this.player.y * sy - 1.5, 3, 3);
    ctx.fillStyle = "#ff6b6b";
    for (const e of this.enemies) {
      if (e.y < world.surf[e.x / TILE | 0] * TILE) continue;
      ctx.fillRect(e.x * sx - 1, e.y * sy - 1, 2, 2);
    }
    ctx.fillStyle = "rgba(140,255,180,0.9)";
    for (const key of world.chests.keys()) {
      const x = key % world.w, y = (key / world.w) | 0;
      ctx.fillRect(x * sx, y * sy, 2, 2);
    }
  }

  /* ---------------- persistence ---------------- */
  serialize() {
    const w = this.world;
    return {
      v: 2, name: this.name, seed: this.seed, w: w.w, h: w.h, size: this.sizeKey,
      difficulty: this.difficulty, created: this.created, modified: Date.now(),
      time: this.time, day: this.day, spawnX: w.spawnX, spawnY: w.spawnY, bossSummoned: w.bossSummoned,
      tiles: rle(w.tiles), walls: rle(w.walls),
      chests: Array.from(w.chests.entries()),
      player: {
        x: this.player.x, y: this.player.y, hp: this.player.hp, maxHp: this.player.maxHp,
        mana: this.player.mana, maxMana: this.player.maxMana, face: this.player.face,
      },
      inv: this.inv, equip: this.equip, sel: this.sel, stats: this.stats, settings: this.settings,
    };
  }
  save(auto = false) {
    try {
      if (this.chestOpen) this.closeChest();
      this.buildMinimap();
      const data = this.serialize();
      localStorage.setItem(worldKey(this.name), JSON.stringify(data));
      putSummary({
        name: this.name, seed: this.seed, size: this.sizeKey, difficulty: this.difficulty,
        created: this.created, modified: data.modified, playtime: this.stats.playtime,
        kills: this.stats.kills, depthBest: this.stats.depthBest,
      });
      this.saveState = "saved";
      this.modified = data.modified;
      if (!auto) this.toast("World saved", "#8fe0a8");
    } catch (err) {
      this.saveState = "error";
      this.toast("Save failed — browser storage full", "#ff9b9b");
      console.error(err);
    }
  }
  applySettings() {
    this.zoom = Math.max(1, Math.min(4, Math.round(this.settings.zoom)));
    sfx.setVolumes(this.settings.sfx, this.settings.music);
  }
  setSetting<K extends keyof Settings>(k: K, v: Settings[K]) {
    this.settings[k] = v;
    this.applySettings();
    this.bumpInv();
  }

  hud() {
    const p = this.player;
    const tx = p.x / TILE | 0, ty = p.y / TILE | 0;
    const layer = this.world.layer(tx, ty);
    return {
      hp: p.hp, maxHp: p.maxHp, mana: p.mana, maxMana: p.maxMana, def: this.def,
      time: this.time, day: this.day, night: this.night(),
      fps: Math.round(this.fpsAvg), kills: this.stats.kills, coins: this.stats.coins,
      mined: this.stats.mined, crafted: this.stats.crafted,
      depth: Math.max(0, this.world.depth(tx, ty)), layer,
      biome: BIOME_NAMES[this.world.biome[tx] ?? 0],
      deep: layer === 0 ? "Open Sky" : DEEP_NAMES[this.world.deep[tx] ?? 0],
      enemies: this.enemies.length,
      boss: this.boss ? { name: this.boss.def.name, hp: Math.max(0, this.boss.hp), max: this.boss.maxHp } : null,
      dead: this.dead, respawnIn: Math.max(0, Math.ceil(this.respawnT / 60)),
      saveState: this.saveState, modified: this.modified,
      toasts: this.toasts.slice(),
    };
  }
}

function worldPx(n: number, t: number) { return n * t; }
function metalOfItem(id: string): string {
  if (id.includes("copper")) return "#c9743a";
  if (id.includes("iron")) return "#b6a89d";
  if (id.includes("silver")) return "#dbe6f2";
  if (id.includes("gold")) return "#f0c33c";
  if (id.includes("obsidian")) return "#6a55a0";
  if (id.includes("crystal")) return "#74e8ff";
  return "#c9ccd4";
}
function mod(a: number, b: number) { return ((a % b) + b) % b; }
const rgbCache: Record<string, [number, number, number]> = {};
function hexRgb(hex: string): [number, number, number] {
  let v = rgbCache[hex];
  if (!v) {
    const s = hex.replace("#", "");
    v = [parseInt(s.slice(0, 2), 16) || 0, parseInt(s.slice(2, 4), 16) || 0, parseInt(s.slice(4, 6), 16) || 0];
    rgbCache[hex] = v;
  }
  return v;
}

export function tileColor(t: number): string {
  switch (t) {
    case T.DIRT: return "#6b4630";
    case T.GRASS: return "#4f9c3d";
    case T.STONE: case T.BRICK: return "#7a7f8c";
    case T.SAND: return "#dcc588";
    case T.SNOW: return "#e9f3ff";
    case T.ICE: return "#a9dcf4";
    case T.MUD: return "#4a3626";
    case T.ASH: return "#544c52";
    case T.OBSIDIAN: return "#3a2f52";
    case T.WOOD: return "#9a6b3d";
    case T.TRUNK: return "#5c3f27";
    case T.LEAF: case T.JLEAF: return "#3f8f3a";
    case T.LAVA: return "#ff7a2e";
    case T.WATER: return "#3d78c8";
    case T.COAL: return "#2a2b31";
    case T.COPPER: return "#c9743a";
    case T.IRON: return "#bfa795";
    case T.SILVER: return "#dbe6f2";
    case T.GOLD: return "#f0c33c";
    case T.CRYSTAL: return "#74e8ff";
    case T.RUBY: return "#ff4f75";
    case T.AMBER: return "#ffb03a";
    case T.CLAY: return "#9c6048";
    case T.GRAVEL: return "#7b746c";
    case T.CHEST: return "#8b5a2b";
    case T.TORCH: return "#ff9b3d";
    case T.GLOWSHROOM: return "#63e0ff";
    case T.SEAL: return "#ffb648";
    case T.GLASS: return "#bfe8f5";
    case T.BRICK: return "#6e7079";
    default: return "#8b90a0";
  }
}

/* ---------- sky palettes ---------- */
function skyColors(t: number) {
  const keys = [
    { at: 0.0, top: "#050a1e", bot: "#0b1230", hor: "#141d3f" },
    { at: 0.19, top: "#161d44", bot: "#4d3160", hor: "#c9695a" },
    { at: 0.27, top: "#3f6fae", bot: "#f2a06a", hor: "#ffd9a0" },
    { at: 0.45, top: "#3b8fd4", bot: "#8fd0f5", hor: "#cdeaff" },
    { at: 0.63, top: "#3b8fd4", bot: "#8fd0f5", hor: "#cdeaff" },
    { at: 0.73, top: "#2f5f9c", bot: "#f08a5a", hor: "#ffcf9a" },
    { at: 0.81, top: "#141c42", bot: "#3b2a58", hor: "#7a4a6a" },
    { at: 1.0, top: "#050a1e", bot: "#0b1230", hor: "#141d3f" },
  ];
  let a = keys[0], b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (t >= keys[i].at && t <= keys[i + 1].at) { a = keys[i]; b = keys[i + 1]; break; }
  }
  const k = (t - a.at) / Math.max(0.0001, b.at - a.at);
  return { top: mixHex(a.top, b.top, k), bot: mixHex(a.bot, b.bot, k), hor: mixHex(a.hor, b.hor, k) };
}
function skyTint(t: number): number[] {
  const keys = [
    { at: 0.0, c: [44, 56, 104] },
    { at: 0.22, c: [126, 100, 132] },
    { at: 0.3, c: [214, 204, 198] },
    { at: 0.5, c: [255, 253, 246] },
    { at: 0.7, c: [255, 245, 226] },
    { at: 0.78, c: [228, 152, 112] },
    { at: 0.86, c: [74, 82, 136] },
    { at: 1.0, c: [44, 56, 104] },
  ];
  let a = keys[0], b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (t >= keys[i].at && t <= keys[i + 1].at) { a = keys[i]; b = keys[i + 1]; break; }
  }
  const k = (t - a.at) / Math.max(0.0001, b.at - a.at);
  return [a.c[0] + (b.c[0] - a.c[0]) * k, a.c[1] + (b.c[1] - a.c[1]) * k, a.c[2] + (b.c[2] - a.c[2]) * k];
}
export function mixHex(h1: string, h2: string, t: number): string {
  const a = hexRgb(h1), b = hexRgb(h2);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

/* ---------------- load an existing world ---------------- */
export function loadGame(name: string): Game | null {
  try {
    const raw = localStorage.getItem(worldKey(name));
    if (!raw) return null;
    const d = JSON.parse(raw);
    const world = new World(d.w, d.h, d.seed);
    world.tiles = unrle(d.tiles, d.w * d.h);
    world.walls = unrle(d.walls, d.w * d.h);
    world.chests = new Map<number, ItemStack[]>(d.chests ?? []);
    for (let x = 0; x < world.w; x++) {
      let y = 0;
      while (y < world.h - 1 && world.get(x, y) === T.AIR) y++;
      world.surf[x] = Math.max(2, y);
      const s2 = (world.seed >> 3) & 0xffff, s3 = (world.seed >> 7) & 0xffff;
      const bt = fbm1(x * 0.0032 + 40, 3, s2);
      let b = 0;
      if (bt > 0.615) b = 1; else if (bt < 0.375) b = 2;
      const edge = Math.min(x, world.w - x) / world.w;
      if (edge < 0.17 && fbm1(x * 0.02, 2, s2 + 5) > 0.34) b = 3;
      world.biome[x] = b;
      const dt = fbm1(x * 0.0026 + 90, 3, s3);
      world.deep[x] = dt > 0.585 ? D_SCORCHED : dt < 0.36 ? D_FROZEN : 0;
    }
    world.spawnX = d.spawnX; world.spawnY = d.spawnY;
    world.bossSummoned = !!d.bossSummoned;
    world.invalidateAll();
    const g = new Game(world, { name: d.name, difficulty: d.difficulty, size: d.size });
    g.created = d.created ?? Date.now();
    g.modified = d.modified ?? Date.now();
    g.time = d.time ?? 0.24;
    g.day = d.day ?? 1;
    Object.assign(g.player, d.player);
    g.inv = (d.inv ?? []).slice(0, INV_SIZE);
    while (g.inv.length < INV_SIZE) g.inv.push(null);
    if (d.equip) {
      g.equip.helm = d.equip.helm ?? null;
      g.equip.chest = d.equip.chest ?? null;
      g.equip.legs = d.equip.legs ?? null;
      g.equip.acc = (d.equip.acc ?? []).slice(0, 4);
      while (g.equip.acc.length < 4) g.equip.acc.push(null);
    }
    g.sel = d.sel ?? 0;
    g.stats = { ...g.stats, ...(d.stats ?? {}) };
    g.settings = { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) };
    g.applySettings();
    g.recalcStats();
    g.buildMinimap();
    g.toast("World loaded", "#8fe0a8");
    return g;
  } catch (err) {
    console.error("load failed", err);
    return null;
  }
}
