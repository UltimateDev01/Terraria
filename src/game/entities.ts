/* ============================================================
   Entities: physics bodies, player controller, enemy AI,
   projectiles, particles. All original creatures.
   ============================================================ */
import { TL, T, TILE, ENEMIES, type EnemyDef } from "./defs";
import type { World } from "./world";
import type { Game } from "./game";

export const GRAV = 0.52;
export const MAX_FALL = 13.5;

export interface Body {
  x: number; y: number; vx: number; vy: number; w: number; h: number; onGround: boolean;
}

export interface Player extends Body {
  face: number;
  hp: number; maxHp: number; mana: number; maxMana: number;
  jumps: number; maxJumps: number;
  inv: number;      // invincibility frames
  hurt: number;      // flash timer
  regen: number;
  swing: number;     // melee swing timer
  swingAng: number;
  useT: number;      // reuse cooldown
  anim: number; animT: number;
  dead: boolean; deadT: number;
  inLiquid: number;
  glow: number;
  stepT: number;
  manaAcc?: number;
  swingDir?: number;
}

export interface Enemy extends Body {
  uid: number;
  kind: string; def: EnemyDef;
  hp: number; maxHp: number;
  hurt: number; t: number; dir: number;
  shootT: number; jumpT: number; anim: number;
  boss: boolean; phase: number; burn: number; slow: number;
  homeX: number; homeY: number;
  groundedT: number;
  dead: boolean;
  glow: string;
}

export interface Proj extends Body {
  dmg: number; life: number; kind: string; fromPlayer: boolean;
  g: number; rot: number; glow: number; pierce: number; hit: number[];
  light: number; drag: number;
}

export interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; max: number;
  col: string; size: number; grav: number; glow: number; fade: number;
}

export interface Floater { x: number; y: number; vy: number; life: number; text: string; col: string; big: number }

export interface Drop extends Body {
  id: string; n: number; t: number; pick: number; bob: number;
}

/* ---------------- collision helpers ---------------- */
export function boxHits(world: World, x: number, y: number, w: number, h: number): boolean {
  const x0 = Math.floor(x / TILE), y0 = Math.floor(y / TILE);
  const x1 = Math.floor((x + w - 0.001) / TILE), y1 = Math.floor((y + h - 0.001) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (TL.solid[world.get(tx, ty)] === 1) return true;
    }
  }
  return false;
}

/** integrate one body with per-axis tile resolution */
export function moveBody(world: World, b: Body, gravity = true, friction = -1): { hitX: boolean; hitY: boolean; ground: boolean } {
  let hitX = false, hitY = false, ground = false;
  if (gravity) {
    b.vy += GRAV;
    if (b.vy > MAX_FALL) b.vy = MAX_FALL;
  }
  if (b.vx > 15) b.vx = 15; else if (b.vx < -15) b.vx = -15;
  // X axis
  b.x += b.vx;
  if (boxHits(world, b.x, b.y, b.w, b.h)) {
    if (b.vx > 0) b.x = Math.floor((b.x + b.w) / TILE) * TILE - b.w - 0.01;
    else if (b.vx < 0) b.x = (Math.floor(b.x / TILE) + 1) * TILE + 0.01;
    hitX = true;
    b.vx = 0;
  }
  // Y axis
  b.y += b.vy;
  if (boxHits(world, b.x, b.y, b.w, b.h)) {
    if (b.vy > 0) {
      b.y = Math.floor((b.y + b.h) / TILE) * TILE - b.h - 0.01;
      ground = true;
      b.onGround = true;
    } else if (b.vy < 0) {
      b.y = (Math.floor(b.y / TILE) + 1) * TILE + 0.01;
    }
    hitY = true;
    b.vy = 0;
  } else {
    b.onGround = false;
  }
  if (ground) {
    const f = friction >= 0 ? friction : 0.82;
    b.vx *= f;
    if (Math.abs(b.vx) < 0.02) b.vx = 0;
  }
  return { hitX, hitY, ground };
}

export function liquidDepth(world: World, b: Body): number {
  const feet = world.get(Math.floor((b.x + b.w / 2) / TILE), Math.floor((b.y + b.h - 2) / TILE));
  const head = world.get(Math.floor((b.x + b.w / 2) / TILE), Math.floor((b.y + 4) / TILE));
  if (feet === T.LAVA) return 2;
  if (feet === T.WATER) return head === T.WATER ? 3 : 1;
  return 0;
}

export function lineClear(world: World, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const steps = Math.max(1, Math.max(dx, dy) / (TILE * 0.75)) | 0;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (TL.opaque[world.get((x0 + (x1 - x0) * t) / TILE | 0, (y0 + (y1 - y0) * t) / TILE | 0)]) return false;
  }
  return true;
}

/* ---------------- enemy factory ---------------- */
let uid = 1;
export function makeEnemy(kind: string, x: number, y: number, scale = 1): Enemy {
  const def = ENEMIES[kind];
  const hp = Math.round(def.hp * scale);
  return {
    uid: uid++, kind, def, x, y, w: def.w, h: def.h, vx: 0, vy: 0, onGround: false,
    hp, maxHp: hp, hurt: 0, t: Math.random() * 100, dir: Math.random() < 0.5 ? -1 : 1,
    shootT: 30 + Math.random() * 40, jumpT: Math.random() * 40, anim: Math.random() * 6,
    boss: !!def.boss, phase: 0, burn: 0, slow: 0, homeX: x, homeY: y, groundedT: 0,
    dead: false, glow: def.glow ?? "#ffffff",
  };
}

/* ---------------- enemy AI ---------------- */
export function updateEnemy(e: Enemy, game: Game) {
  const world = game.world;
  const p = game.player;
  const ai = e.def.ai;
  const speed = e.def.speed * (e.slow > 0 ? 0.45 : 1);
  e.t++;
  e.anim += 0.16;
  if (e.hurt > 0) e.hurt--;
  if (e.slow > 0) e.slow--;
  if (e.burn > 0) {
    e.burn--;
    if (e.burn % 12 === 0) {
      e.hp -= 3;
      game.particle(e.x + Math.random() * e.w, e.y + Math.random() * e.h, (Math.random() - 0.5) * 0.6, -1 - Math.random(), 22, "#ff9b3d", 2, -0.02, 1);
    }
  }
  const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
  const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
  const dx = pcx - ecx, dy = pcy - ecy;
  const dist = Math.hypot(dx, dy) || 1;
  e.dir = dx > 0 ? 1 : -1;
  const los = lineClear(world, ecx, ecy, pcx, pcy);

  if (ai === "fly" || ai === "hover_shooter") {
    const want = ai === "fly" ? 1 : (dist < 90 ? -0.6 : dist > 190 ? 1 : 0.05);
    const nx = dx / dist, ny = dy / dist;
    e.vx += nx * speed * 0.12 * (want > 0 ? 1 : want < 0 ? -1 : 0);
    e.vy += ny * speed * 0.1 * (want > 0 ? 1 : want < 0 ? -1 : 0);
    if (ai === "fly") {
      e.vx += Math.cos(e.t * 0.07) * 0.12;
      e.vy += Math.sin(e.t * 0.09) * 0.16 - 0.02;
    }
    if (ai === "hover_shooter" && e.def.ranged && los) {
      e.shootT--;
      if (e.shootT <= 0 && dist < 300) {
        e.shootT = e.def.ranged.cd + ((Math.random() * 20) | 0);
        const r = e.def.ranged;
        const a2 = Math.atan2(dy, dx);
        game.spawnProj({
          x: ecx, y: ecy, vx: Math.cos(a2) * r.speed, vy: Math.sin(a2) * r.speed,
          dmg: r.dmg, kind: r.proj, fromPlayer: false, g: 0.02, life: 190, w: 8, h: 8, light: 80,
        });
      }
    }
    const maxS = speed * 1.4;
    e.vx = Math.max(-maxS, Math.min(maxS, e.vx * 0.965));
    e.vy = Math.max(-maxS, Math.min(maxS, e.vy * 0.965));
    // fly through solids a bit, but resolve so they don't sit inside blocks
    e.x += e.vx;
    if (boxHits(world, e.x, e.y, e.w, e.h)) { e.x -= e.vx; e.vx *= -0.4; }
    e.y += e.vy;
    if (boxHits(world, e.x, e.y, e.w, e.h)) { e.y -= e.vy; e.vy *= -0.4; }
    e.onGround = false;
  } else if (ai === "hop") {
    e.jumpT--;
    if (e.onGround) {
      e.vx *= 0.78;
      if (e.jumpT <= 0) {
        const range = Math.min(1, dist / 260);
        e.vy = -4.6 - range * 1.4;
        e.vx = e.dir * (1.6 + range * 2.4);
        e.jumpT = 46 + Math.random() * 46;
        game.particle(e.x + e.w / 2, e.y + e.h, 0, 0.4, 12, "#9ab6d8", 2, 0.05, 0);
      }
    } else if (e.vy > 0 && boxHits(world, e.x, e.y + e.vy, e.w, e.h) === false) {
      // in air
    }
    moveBody(world, e, true, 0.9);
  } else {
    // ground walkers / shooters
    const wantDist = ai === "shooter" ? 120 : 0;
    let move = 0;
    if (dist > wantDist + 24 || !los) move = e.dir;
    else if (ai === "shooter" && dist < wantDist - 30) move = -e.dir;
    if (e.boss) move = e.dir;
    e.vx += move * speed * 0.13;
    const maxS = speed * (e.boss ? 1.3 : 1.05);
    if (e.vx > maxS) e.vx = maxS;
    if (e.vx < -maxS) e.vx = -maxS;
    const res = moveBody(world, e, true, e.boss ? 0.86 : 0.8);
    if (res.hitX && e.onGround) {
      // step up obstacles
      e.vy = -5.4;
      e.jumpT = 0;
    }
    if (ai === "shooter" && e.onGround && Math.random() < 0.008) e.vy = -4.2;
    // shooting
    if (e.def.ranged && los) {
      e.shootT--;
      if (e.shootT <= 0 && dist < 380) {
        e.shootT = e.def.ranged.cd + ((Math.random() * 24) | 0);
        const r = e.def.ranged;
        const a = Math.atan2(pcy - ecy, pcx - ecx);
        game.spawnProj({
          x: ecx, y: ecy, vx: Math.cos(a) * r.speed, vy: Math.sin(a) * r.speed - 0.4,
          dmg: r.dmg + (e.boss ? 8 : 0), kind: r.proj, fromPlayer: false, g: 0.05,
          life: 200, w: 8, h: 8, light: 90,
        });
      }
    }
  }

  if (e.boss) bossBrain(e, game, dist, los);

  // burn in daylight (surface zombies)
  if (e.def.fleeDay && game.dayFactor() > 0.55) {
    const ty = Math.floor(e.y / TILE);
    let openSky = true;
    for (let y = 0; y < ty; y++) if (TL.opaque[world.get(Math.floor(e.x / TILE), y)]) { openSky = false; break; }
    if (openSky) {
      e.burn = 6;
      e.hp -= 1.6;
      if (Math.random() < 0.4) game.particle(e.x + Math.random() * e.w, e.y + Math.random() * e.h, 0, -0.8, 20, "#ffb03a", 2, -0.02, 1);
      // seek shade
      e.vx += (Math.random() - 0.5) * 0.6;
    }
  }

  // contact damage
  if (!p.dead && p.inv <= 0 && e.hp > 0) {
    if (e.x < p.x + p.w && e.x + e.w > p.x && e.y < p.y + p.h && e.y + e.h > p.y) {
      game.hurtPlayer(e.def.dmg, e.x + e.w / 2, 5.2);
    }
  }
  // world bounds / fell out
  if (e.y > world.h * TILE + 200 || e.x < -100 || e.x > world.w * TILE + 100) e.hp = -1;
}

function bossBrain(e: Enemy, game: Game, dist: number, los: boolean) {
  const p = game.player;
  const frac = e.hp / e.maxHp;
  if (frac < 0.6 && e.phase === 0) { e.phase = 1; game.toast("The Mossborn King awakens fully!", "#ffd166"); }
  if (frac < 0.3 && e.phase === 1) { e.phase = 2; game.toast("It calls upon the deep!", "#ff8f6b"); }
  e.shootT--;
  if (e.shootT <= 0 && los) {
    const cx = e.x + e.w / 2, cy = e.y + e.h * 0.35;
    const a = Math.atan2(p.y + p.h / 2 - cy, p.x + p.w / 2 - cx);
    if (e.phase === 0) {
      e.shootT = 78;
      game.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 4.6, vy: Math.sin(a) * 4.6 - 1.2, dmg: 26, kind: "rock", fromPlayer: false, g: 0.09, life: 240, w: 12, h: 12, light: 0 });
    } else if (e.phase === 1) {
      e.shootT = 60;
      for (let i = -1; i <= 1; i++) {
        game.spawnProj({ x: cx, y: cy, vx: Math.cos(a + i * 0.28) * 5.2, vy: Math.sin(a + i * 0.28) * 5.2 - 1, dmg: 24, kind: "shard", fromPlayer: false, g: 0.03, life: 260, w: 10, h: 10, light: 110 });
      }
    } else {
      e.shootT = 48;
      for (let i = 0; i < 6; i++) {
        const aa = a + (i - 2.5) * 0.22;
        game.spawnProj({ x: cx, y: cy, vx: Math.cos(aa) * 5.6, vy: Math.sin(aa) * 5.6, dmg: 22, kind: "shard", fromPlayer: false, g: 0.02, life: 240, w: 10, h: 10, light: 110 });
      }
      if (Math.random() < 0.5) game.spawnBossMinion(e.x + e.w / 2, e.y);
    }
  }
  // ground slam when close
  if (dist < 90 && e.onGround && Math.random() < 0.02) {
    e.vy = -7.5;
    game.bossSlam(e.x + e.w / 2, e.y + e.h);
  }
}

/* ---------------- projectile types ---------------- */
export const PROJ_ART: Record<string, { col: string; glow: string; w: number; h: number }> = {
  arrow: { col: "#c9a06a", glow: "#ffe0b0", w: 12, h: 3 },
  bone_arrow: { col: "#e9e6dc", glow: "#ffffff", w: 11, h: 3 },
  ember: { col: "#ff7a2e", glow: "#ffd166", w: 8, h: 8 },
  frost: { col: "#8fd3ff", glow: "#e0f6ff", w: 8, h: 8 },
  crystal: { col: "#8ef0ff", glow: "#d8fbff", w: 9, h: 9 },
  stinger_dart: { col: "#d6f05a", glow: "#f6ffb0", w: 8, h: 4 },
  icicle: { col: "#a8e6ff", glow: "#e6fbff", w: 8, h: 10 },
  fireball: { col: "#ff6b2c", glow: "#ffd166", w: 10, h: 10 },
  rock: { col: "#8a8172", glow: "#c9bda6", w: 11, h: 11 },
  shard: { col: "#9ce86a", glow: "#e0ff9a", w: 9, h: 9 },
  stardust: { col: "#c8a8ff", glow: "#f0e0ff", w: 7, h: 7 },
};

export function updateProj(pr: Proj, game: Game) {
  pr.vy += pr.g;
  pr.vx *= pr.drag;
  pr.vy *= pr.drag;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(pr.vx), Math.abs(pr.vy)) / 8));
  for (let s = 0; s < steps; s++) {
    pr.x += pr.vx / steps;
    pr.y += pr.vy / steps;
    const tx = (pr.x / TILE) | 0, ty = (pr.y / TILE) | 0;
    const t = game.world.get(tx, ty);
    if (TL.solid[t] === 1) {
      pr.life = 0;
      game.impact(pr.x, pr.y, pr.kind, true);
      if (pr.kind !== "rock" && pr.kind !== "shard" && Math.random() < 0.5) game.settleChip(tx, ty);
      return;
    }
    if (t === T.LAVA || t === T.WATER) {
      pr.vx *= 0.7; pr.vy *= 0.7;
    }
  }
  pr.rot = Math.atan2(pr.vy, pr.vx);
  pr.life--;
  if (pr.kind === "ember" || pr.kind === "fireball" || pr.kind === "shard" || pr.kind === "crystal" || pr.kind === "frost" || pr.kind === "icicle") {
    if (game.frame % 2 === 0) {
      const a = PROJ_ART[pr.kind];
      game.particle(pr.x, pr.y, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, 16, a.glow, 2, -0.03, 1);
    }
  }
}
