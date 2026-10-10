/* ============================================================
   Entity rendering: animated pixel-art hero & original creatures.
   All drawn procedurally into the game canvas.
   ============================================================ */
import type { Enemy, Player } from "./entities";
import { drawItemOnCanvas, itemIcon, itemCanvas } from "./textures";

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(x | 0, y | 0, Math.ceil(w), Math.ceil(h));
}

export interface Look {
  skin: string; hair: string;
  helm: string | null; chest: string | null; legs: string | null;
  wing: boolean; fireproof: boolean;
}

/* ---------------- hero ---------------- */
export function drawHero(ctx: CanvasRenderingContext2D, p: Player, look: Look, heldId: string | null, frame: number) {
  const x = p.x, y = p.y, w = p.w, h = p.h;
  const f = p.face;
  const t = p.anim;
  const moving = Math.abs(p.vx) > 0.35 && p.onGround;
  const step = moving ? Math.sin(t * 0.42) : 0;
  const airPose = !p.onGround;

  // shadow
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "#05070c";
  ctx.fillRect(x + 2, y + h - 1, w - 4, 2);
  ctx.globalAlpha = 1;

  const skin = look.skin, skinD = "#b8865f";
  const bodyC = look.chest ?? "#3f5f8f", bodyD = look.chest ? shadeHex(look.chest, 0.7) : "#2c4368";
  const legC = look.legs ?? "#4a3a55";

  // legs
  const l1 = airPose ? 2 : step * 2.4, l2 = airPose ? -1 : -step * 2.4;
  rr(ctx, x + 4 + l1, y + 27, 5, 14 - Math.abs(l1) * 0.4, legC);
  rr(ctx, x + 11 + l2, y + 27, 5, 14 - Math.abs(l2) * 0.4, legC);
  rr(ctx, x + 4 + l1, y + 38, 6, 3, "#2b2018");
  rr(ctx, x + 11 + l2, y + 38, 6, 3, "#2b2018");
  if (look.legs) { rr(ctx, x + 4 + l1, y + 27, 5, 5, shadeHex(look.legs, 1.15)); rr(ctx, x + 11 + l2, y + 27, 5, 5, shadeHex(look.legs, 1.15)); }

  // torso
  rr(ctx, x + 4, y + 15, 12, 13, bodyC);
  rr(ctx, x + 4, y + 15, 12, 3, shadeHex(bodyC, 1.16));
  rr(ctx, x + 4, y + 25, 12, 3, bodyD);
  if (look.chest) {
    rr(ctx, x + 2, y + 15, 4, 8, shadeHex(look.chest, 1.1));
    rr(ctx, x + 14, y + 15, 4, 8, look.chest);
    rr(ctx, x + 9, y + 17, 2, 9, shadeHex(look.chest, 0.55));
  }
  // belt
  rr(ctx, x + 4, y + 26, 12, 2, "#6b4a22");
  rr(ctx, x + 9, y + 26, 2, 2, "#e8b93c");

  // head
  rr(ctx, x + 4, y + 4, 12, 12, skin);
  rr(ctx, x + 4, y + 4, 12, 2, shadeHex(skin, 1.08));
  rr(ctx, x + (f > 0 ? 12 : 4), y + 12, 4, 4, skinD);
  // hair
  if (!look.helm) {
    rr(ctx, x + 3, y + 2, 14, 5, look.hair);
    rr(ctx, x + (f > 0 ? 3 : 14), y + 4, 3, 8, look.hair);
    rr(ctx, x + 4, y + 2, 12, 1, shadeHex(look.hair, 1.25));
  } else {
    rr(ctx, x + 3, y + 1, 14, 9, look.helm);
    rr(ctx, x + 3, y + 1, 14, 2, shadeHex(look.helm, 1.25));
    rr(ctx, x + 4, y + 8, 12, 3, look.helm);
    rr(ctx, x + (f > 0 ? 10 : 5), y + 8, 5, 2, "#10141c");
    rr(ctx, x + (f > 0 ? 11 : 6), y + 8, 2, 1, "#8fd3ff");
    rr(ctx, x + 8, y - 2, 4, 4, shadeHex(look.helm, 0.8));
  }
  // eyes
  const blink = (frame % 260) < 5;
  rr(ctx, x + (f > 0 ? 11 : 6), y + 10, 3, blink ? 1 : 2, "#1b2130");

  // wings
  if (look.wing) {
    const flap = p.onGround ? 0 : Math.sin(frame * 0.28) * 4;
    ctx.globalAlpha = 0.92;
    for (let i = 0; i < 4; i++) {
      rr(ctx, x + (f > 0 ? -2 - i * 2 : w - 2 + i * 2), y + 17 + i * 2 - flap * 0.4, 4, 8 - i, "#eef5ff");
      rr(ctx, x + (f > 0 ? -1 - i * 2 : w - 1 + i * 2), y + 17 + i * 2 - flap * 0.4, 3, 6 - i, "#b9d6f2");
    }
    ctx.globalAlpha = 1;
  }

  // arm + held item (swing animation)
  const sx = x + (f > 0 ? 14 : 4);
  const sy = y + 18;
  let ang = f > 0 ? -0.35 : Math.PI + 0.35;
  if (p.swing > 0) {
    const k = 1 - p.swing / 16;
    const arc = 2.2;
    ang = (f > 0 ? -1.1 : Math.PI + 1.1) + f * arc * (1 - Math.cos(k * Math.PI)) * 0.5 + f * arc * 0.5 * k;
  } else if (moving) {
    ang += Math.sin(t * 0.42) * 0.4 * f;
  }
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(ang);
  rr(ctx, -2, -2, 5, 10, skin);
  if (look.chest) rr(ctx, -2, -2, 5, 4, look.chest);
  if (heldId) {
    ctx.save();
    ctx.translate(0, 6);
    ctx.rotate(-0.5);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(itemCanvas(heldId), -8, -8, 18, 18);
    ctx.restore();
  }
  ctx.restore();

  // back arm
  rr(ctx, x + (f > 0 ? 4 : 14), y + 18, 4, 9, shadeHex(skin, 0.85));

  if (p.hurt > 0 && p.hurt % 4 < 2) {
    ctx.globalAlpha = 0.6;
    rr(ctx, x, y, w, h, "#ffffff");
    ctx.globalAlpha = 1;
  }
  if (look.fireproof && frame % 6 < 3) {
    ctx.globalAlpha = 0.25;
    rr(ctx, x - 1, y - 1, w + 2, h + 2, "#ff8f2e");
    ctx.globalAlpha = 1;
  }
}

/* ---------------- enemies ---------------- */
export function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, frame: number) {
  const x = e.x, y = e.y, w = e.w, h = e.h;
  const def = e.def;
  const base = def.color, dark = shadeHex(base, 0.62), light = shadeHex(base, 1.35);
  const hurt = e.hurt > 0 && e.hurt % 6 < 3;
  const c = (col: string) => (hurt ? "#ffffff" : col);
  ctx.imageSmoothingEnabled = false;

  switch (def.ai) {
    case "hop": {
      const squash = e.onGround ? 1 + Math.sin(frame * 0.1) * 0.03 : (e.vy < 0 ? 1.16 : 0.9);
      const hh = h * squash, ww = w * (2 - squash);
      const bx = x + (w - ww) / 2, by = y + (h - hh);
      // blob body
      for (let i = 0; i < 8; i++) {
        const t = i / 8;
        const rw = ww * (0.55 + Math.sin(t * Math.PI) * 0.5);
        rr(ctx, bx + (ww - rw) / 2, by + hh * t, rw, hh / 8 + 1, c(t > 0.75 ? dark : base));
      }
      rr(ctx, bx + ww * 0.16, by + hh * 0.15, ww * 0.3, hh * 0.16, hurt ? "#fff" : "rgba(255,255,255,0.45)");
      // slime core
      rr(ctx, bx + ww * 0.6, by + hh * 0.55, ww * 0.2, hh * 0.2, c(light));
      // eyes
      rr(ctx, bx + ww * 0.26, by + hh * 0.4, 3, 3, "#10141c");
      rr(ctx, bx + ww * 0.62, by + hh * 0.4, 3, 3, "#10141c");
      rr(ctx, bx + ww * 0.28, by + hh * 0.42, 1, 1, "#e8f6ff");
      rr(ctx, bx + ww * 0.64, by + hh * 0.42, 1, 1, "#e8f6ff");
      rr(ctx, bx + ww * 0.4, by + hh * 0.62, ww * 0.22, 2, "#10141c");
      if (def.glow) {
        ctx.globalAlpha = 0.18;
        rr(ctx, bx - 3, by - 3, ww + 6, hh + 6, def.glow);
        ctx.globalAlpha = 1;
      }
      break;
    }
    case "fly": {
      const flap = Math.sin(frame * 0.55) * 3;
      rr(ctx, x - 9, y + 2 - flap, 10, 6, c(shadeHex(base, 0.8)));
      rr(ctx, x + w - 1, y + 2 - flap, 10, 6, c(shadeHex(base, 0.8)));
      rr(ctx, x - 7, y + 3 - flap, 8, 3, c(light));
      rr(ctx, x + w - 1, y + 3 - flap, 8, 3, c(light));
      rr(ctx, x + 3, y + 2, w - 6, h - 3, c(base));
      rr(ctx, x + 3, y + 2, w - 6, 2, c(dark));
      rr(ctx, x + 5, y - 1, 3, 4, c(base));
      rr(ctx, x + w - 8, y - 1, 3, 4, c(base));
      rr(ctx, x + 5, y + 6, 2, 2, "#ff5a5a");
      rr(ctx, x + w - 7, y + 6, 2, 2, "#ff5a5a");
      rr(ctx, x + 4, y + h - 2, 3, 3, c(dark));
      rr(ctx, x + w - 7, y + h - 2, 3, 3, c(dark));
      break;
    }
    case "shooter":
    case "walk": {
      if (e.kind === "skeleton" || e.kind.includes("golem") || e.kind === "stone_guardian" || e.kind === "fire_wraith") {
        const isBone = e.kind === "skeleton";
        const big = e.boss;
        const legSw = Math.sin(frame * 0.2) * (Math.abs(e.vx) > 0.2 ? 2.5 : 0);
        // legs
        rr(ctx, x + w * 0.2, y + h * 0.62, w * 0.22, h * 0.4 - legSw, c(dark));
        rr(ctx, x + w * 0.58, y + h * 0.62, w * 0.22, h * 0.4 + legSw, c(dark));
        // torso
        rr(ctx, x + w * 0.14, y + h * 0.26, w * 0.72, h * 0.42, c(base));
        rr(ctx, x + w * 0.14, y + h * 0.26, w * 0.72, 3, c(light));
        if (isBone) {
          for (let i = 0; i < 4; i++) rr(ctx, x + w * 0.24, y + h * (0.32 + i * 0.07), w * 0.52, 2, c(dark));
        } else {
          // rocky cracks / moss
          rr(ctx, x + w * 0.2, y + h * 0.36, w * 0.16, h * 0.2, c(dark));
          rr(ctx, x + w * 0.62, y + h * 0.5, w * 0.14, h * 0.14, c(dark));
          if (def.glow) rr(ctx, x + w * 0.38, y + h * 0.36, w * 0.24, h * 0.16, hurt ? "#fff" : def.glow);
        }
        // head
        rr(ctx, x + w * 0.24, y + h * 0.04, w * 0.52, h * 0.24, c(base));
        rr(ctx, x + w * 0.24, y + h * 0.04, w * 0.52, 2, c(light));
        const eye = e.kind === "fire_wraith" || big ? (def.glow ?? "#ffdd88") : "#ff5a5a";
        rr(ctx, x + w * 0.31, y + h * 0.12, w * 0.13, h * 0.06, eye);
        rr(ctx, x + w * 0.56, y + h * 0.12, w * 0.13, h * 0.06, eye);
        // arms
        const reach = e.def.ranged ? -1 : 1;
        rr(ctx, x + (e.dir > 0 ? w * 0.82 : -w * 0.2), y + h * 0.3, w * 0.38, h * 0.12, c(shadeHex(base, 0.85)));
        if (e.def.ranged && !isBone === false) { /* skeleton bow below */ }
        if (isBone) {
          ctx.save();
          ctx.translate(x + w * 0.5 + e.dir * w * 0.5, y + h * 0.34);
          ctx.strokeStyle = "#c9a06a";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 8, e.dir > 0 ? -1.1 : Math.PI - 1.1, e.dir > 0 ? 1.1 : Math.PI + 1.1, e.dir < 0);
          ctx.stroke();
          ctx.restore();
        }
        void reach;
        if (e.kind === "stone_guardian" || big) {
          rr(ctx, x + w * 0.1, y + h * 0.0, w * 0.16, h * 0.12, c(light));
          rr(ctx, x + w * 0.74, y + h * 0.0, w * 0.16, h * 0.12, c(light));
        }
        break;
      }
      // generic humanoid (zombie / crawler style)
      const legSw = Math.sin(frame * 0.16) * (Math.abs(e.vx) > 0.2 ? 3 : 0);
      rr(ctx, x + 3, y + h * 0.66, 5, h * 0.34 - legSw, c(dark));
      rr(ctx, x + w - 8, y + h * 0.66, 5, h * 0.34 + legSw, c(dark));
      rr(ctx, x + 2, y + h * 0.22, w - 4, h * 0.48, c(base));
      rr(ctx, x + 2, y + h * 0.22, w - 4, 3, c(light));
      rr(ctx, x + 3, y + h * 0.9, w - 6, 3, "#2b2018");
      rr(ctx, x + 3, y + 2, w - 6, h * 0.22, c(shadeHex(base, 1.1)));
      rr(ctx, x + (e.dir > 0 ? w - 8 : 4), y + h * 0.07, 3, 3, "#ffe66b");
      rr(ctx, x + (e.dir > 0 ? w - 12 : 8), y + h * 0.07, 2, 2, "#ffe66b");
      rr(ctx, x + 3, y + h * 0.19, w - 6, 2, c(dark));
      // outstretched arms
      rr(ctx, x + (e.dir > 0 ? w - 3 : -6), y + h * 0.28, 8, 4, c(shadeHex(base, 0.9)));
      break;
    }
    default: {
      if (def.ai === "hover_shooter") {
        if (e.kind === "stinger") {
          const flap = Math.sin(frame * 0.5) * 3;
          ctx.globalAlpha = 0.72;
          rr(ctx, x - 7, y - 4 - flap, 13, 5, "#dff0ff");
          rr(ctx, x + w - 6, y - 4 - flap, 13, 5, "#dff0ff");
          ctx.globalAlpha = 1;
          rr(ctx, x + 1, y + 3, w - 2, h - 5, c(base));
          for (let i = 0; i < 3; i++) rr(ctx, x + 2 + i * 6, y + 4, 3, h - 7, "#2a2418");
          rr(ctx, x + w - 2, y + h * 0.45, 6, 2, c("#e8e0c0"));
          rr(ctx, x + w * 0.58, y + 3, w * 0.36, h * 0.42, c(light));
          rr(ctx, x + w * 0.68, y + h * 0.22, 3, 3, "#10141c");
        } else {
          for (let i = 0; i < 6; i++) {
            const tt = i / 6;
            const wid = w * (0.98 - tt * 0.42);
            const off = Math.sin(frame * 0.12 + i) * 1.7;
            rr(ctx, x + (w - wid) / 2 + off * 0.5, y + h * tt, wid, h / 6 + 1, c(tt < 0.5 ? light : base));
          }
          ctx.globalAlpha = 0.5;
          rr(ctx, x - 3, y - 5, w + 6, h + 6, def.glow ?? "#ffb03a");
          ctx.globalAlpha = 1;
          rr(ctx, x + w * 0.22, y + h * 0.18, w * 0.56, h * 0.3, "#150a12");
          rr(ctx, x + w * 0.3, y + h * 0.25, 3, 3, "#fff0a8");
          rr(ctx, x + w * 0.62, y + h * 0.25, 3, 3, "#fff0a8");
          rr(ctx, x + w * 0.4, y + h * 0.62, w * 0.2, h * 0.16, c("#ffe08a"));
        }
        break;
      }
      rr(ctx, x + 2, y + 2, w - 4, h - 4, c(base));
      rr(ctx, x + 2, y + 2, w - 4, 3, c(light));
      rr(ctx, x + 5, y + h * 0.35, 3, 3, "#10141c");
      rr(ctx, x + w - 8, y + h * 0.35, 3, 3, "#10141c");
    }
  }

  if (e.burn > 0) {
    ctx.globalAlpha = 0.4 + Math.sin(frame * 0.4) * 0.1;
    rr(ctx, x - 2, y - 4, w + 4, h + 4, "#ff8f2e");
    ctx.globalAlpha = 1;
  }
  // hp pip bar when damaged
  if (!e.boss && e.hp < e.maxHp && e.hp > 0) {
    const bw = Math.max(14, w);
    rr(ctx, x + (w - bw) / 2 - 1, y - 8, bw + 2, 4, "rgba(6,8,14,0.75)");
    rr(ctx, x + (w - bw) / 2, y - 7, (bw * Math.max(0, e.hp)) / e.maxHp, 2, e.hp / e.maxHp > 0.4 ? "#7ee06a" : "#ff6a6a");
  }
}

/* ---------------- held item / drops ---------------- */
export function drawDrop(ctx: CanvasRenderingContext2D, d: { x: number; y: number; w: number; h: number; id: string; bob: number }, frame: number) {
  const s = Math.max(10, Math.min(16, d.w + 4));
  const by = Math.sin(frame * 0.06 + d.bob) * 1.6;
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#000";
  ctx.fillRect(d.x, d.y + d.h + 1, s, 2);
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = false;
  drawItemOnCanvas(ctx, d.id, d.x - (s - d.w) / 2, d.y + by - 2, s);
}

export function iconFor(id: string) { return itemIcon(id); }

/* ---------------- colour utils ---------------- */
export function shadeHex(hex: string, f: number): string {
  const key = hex + "|" + f;
  const cached = colorCache.get(key);
  if (cached) return cached;
  let h = hex.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) * f)) | 0;
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) * f)) | 0;
  const b = Math.max(0, Math.min(255, (n & 255) * f)) | 0;
  const out = "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  colorCache.set(key, out);
  return out;
}
const colorCache = new Map<string, string>();
