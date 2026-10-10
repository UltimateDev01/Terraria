import { useEffect, useRef, useState } from "react";
import type { Settings, WorldSummary } from "../game/game";
import { WORLD_SIZES, type SizeKey } from "../game/world";
import { sfx } from "../game/audio";
import { SettingsPanel, ControlsPanel, fmtTime } from "./Menus";
import { fbm1 } from "../game/noise";

/* ============================================================
   Animated pixel backdrop for menus (self contained canvas)
   ============================================================ */
export function MenuBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    let raf = 0;
    let t = 0;
    const stars = Array.from({ length: 90 }, () => ({
      x: Math.random(), y: Math.random() * 0.55, s: Math.random() < 0.2 ? 2 : 1, p: Math.random() * 6.28,
    }));
    const motes = Array.from({ length: 26 }, () => ({
      x: Math.random(), y: Math.random(), s: 0.15 + Math.random() * 0.35, r: 1 + Math.random() * 2,
    }));
    const resize = () => {
      cv.width = cv.clientWidth; cv.height = cv.clientHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      t += 0.0022;
      const W = cv.width, H = cv.height;
      const cyc = (Math.sin(t * 2.2) + 1) / 2;
      const top = mixc([12, 18, 42], [58, 128, 196], cyc);
      const bot = mixc([28, 22, 54], [168, 216, 248], cyc);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, rgb(top));
      g.addColorStop(1, rgb(bot));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // stars
      const sa = 1 - cyc;
      if (sa > 0.05) {
        for (const st of stars) {
          ctx.fillStyle = `rgba(255,255,255,${(sa * (0.4 + 0.6 * Math.abs(Math.sin(t * 6 + st.p)))).toFixed(3)})`;
          ctx.fillRect(st.x * W, st.y * H, st.s, st.s);
        }
      }
      // sun / moon
      const sx = W * (0.62 + 0.2 * Math.sin(t * 2.2)), sy = H * (0.26 - 0.06 * Math.cos(t * 2.2));
      ctx.fillStyle = cyc > 0.5 ? "rgba(255,246,200,0.95)" : "rgba(226,236,255,0.9)";
      ctx.beginPath(); ctx.arc(sx, sy, cyc > 0.5 ? 18 : 12, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 0.14;
      ctx.beginPath(); ctx.arc(sx, sy, 52, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 1;
      // hills
      const layers = [
        { amp: 0.1, y: 0.6, col: mixc([16, 26, 38], [40, 74, 84], cyc), f: 260 },
        { amp: 0.13, y: 0.68, col: mixc([12, 20, 30], [30, 58, 52], cyc), f: 170 },
        { amp: 0.16, y: 0.78, col: mixc([8, 12, 20], [22, 40, 30], cyc), f: 110 },
      ];
      layers.forEach((L, i) => {
        ctx.fillStyle = rgb(L.col);
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let x = 0; x <= W + 6; x += 6) {
          const n = fbm1((x + t * 40 * (i + 1)) / L.f, 3, 77 + i * 13);
          ctx.lineTo(x, H * L.y - n * H * L.amp);
        }
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fill();
      });
      // floating dust
      ctx.fillStyle = `rgba(255,214,150,${0.16 + cyc * 0.1})`;
      for (const m of motes) {
        m.y -= m.s * 0.0016;
        if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
        ctx.fillRect(m.x * W + Math.sin(t * 3 + m.x * 10) * 6, m.y * H, m.r, m.r);
      }
      ctx.fillStyle = "rgba(5,7,12,0.42)";
      ctx.fillRect(0, 0, W, H);
    };
    loop();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}
const mixc = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c: number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;

/* ============================================================
   Title screen
   ============================================================ */
export function TitleScreen(props: {
  worlds: WorldSummary[];
  settings: Settings;
  onSettings: (p: Partial<Settings>) => void;
  onQuickPlay: () => void;
  onNew: () => void;
  onLoad: (name: string) => void;
  onDelete: (name: string) => void;
}) {
  const [tab, setTab] = useState<"worlds" | "settings" | "controls">("worlds");
  return (
    <div className="relative h-full w-full overflow-hidden">
      <MenuBackdrop />
      <div className="relative z-10 flex h-full w-full">
        <div className="flex min-w-0 flex-1 flex-col justify-between p-6 sm:p-10">
          <div className="rise">
            <div className="font-display text-[11px] tracking-[0.45em] text-amber-300/80">A BROWSER SANDBOX ADVENTURE</div>
            <h1 className="title-glow floaty mt-2 font-display text-[42px] leading-none text-[#ffe6bd] sm:text-[68px]">
              TERRA<span className="text-copper">FORGE</span>
            </h1>
            <p className="mt-3 max-w-[520px] text-[13px] leading-relaxed text-slate-300/90 sm:text-[15px]">
              Dig through procedurally forged biomes, light the dark with torches, smelt ore into
              armour, and survive creatures that crawl out of your own tunnels. Everything you break can be
              placed again. Every world saves inside your browser.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary px-7 py-3.5 text-[15px]" onClick={props.onQuickPlay}>
              ⛏ ENTER THE WORLD
            </button>
            <button type="button" className="btn px-4 py-3 text-[12px]" onClick={() => { setTab("worlds"); props.onNew(); }}>
              CREATE NEW WORLD
            </button>
            {(["worlds", "settings", "controls"] as const).map(t => (
              <button
                key={t}
                type="button"
                className={`btn px-4 py-3 text-[12px] uppercase ${tab === t ? "btn-primary" : "btn-ghost"}`}
                onClick={() => { setTab(t); sfx.play("ui"); }}
              >
                {t === "worlds" ? `saved (${props.worlds.length})` : t}
              </button>
            ))}
          </div>
        </div>

        <aside className="relative hidden w-[430px] shrink-0 flex-col p-4 pr-6 lg:flex">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 bg-moss" />
            <span className="font-display text-[10px] tracking-[0.25em] text-slate-400">
              {tab === "worlds" ? "SAVED WORLDS" : tab === "settings" ? "SETTINGS" : "HOW TO PLAY"}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {tab === "worlds" && (
              <div className="flex flex-col gap-2">
                {props.worlds.length === 0 && (
                  <div className="panel px-4 py-6 text-center text-[12px] text-slate-400">
                    No worlds forged yet.<br />
                    <span className="text-amber-200/80">Press “Enter the world” to jump straight in.</span>
                  </div>
                )}
                {props.worlds.map(w => (
                  <div key={w.name} className="panel group flex items-center gap-3 p-3">
                    <div className="inset flex h-12 w-12 shrink-0 items-center justify-center">
                      <span className="font-display text-[16px] text-amber-300">{w.name.slice(0, 1).toUpperCase()}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-[12px] text-slate-100">{w.name}</div>
                      <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-400">
                        <span className="chip px-1.5 py-0.5">{WORLD_SIZES[w.size]?.label ?? w.size}</span>
                        <span className="chip px-1.5 py-0.5">day {Math.max(1, Math.floor(w.playtime / 210) + 1)}</span>
                        <span className="chip px-1.5 py-0.5">{w.kills} kills</span>
                        <span className="chip px-1.5 py-0.5">{Math.round(w.depthBest * 2)}ft</span>
                        <span className="chip px-1.5 py-0.5">{fmtTime(w.playtime)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button type="button" className="btn btn-primary px-2.5 py-1.5 text-[10px]" onClick={() => props.onLoad(w.name)}>
                        LOAD
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost px-2.5 py-1.5 text-[10px]"
                        onClick={() => { if (confirm(`Delete "${w.name}"? This cannot be undone.`)) props.onDelete(w.name); }}
                      >
                        DELETE
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tab === "settings" && <SettingsPanel settings={props.settings} onChange={props.onSettings} />}
            {tab === "controls" && <ControlsPanel />}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ============================================================
   World creation
   ============================================================ */
export function CreateScreen({ onCancel, onCreate }: { onCancel: () => void; onCreate: (o: { name: string; seedText: string; size: SizeKey; difficulty: number }) => void }) {
  const [name, setName] = useState("My World");
  const [seedText, setSeedText] = useState(() => String(Math.floor(Math.random() * 99999)));
  const [size, setSize] = useState<SizeKey>("medium");
  const [diff, setDiff] = useState(1);
  const valid = name.trim().length > 0;
  return (
    <div className="relative h-full w-full overflow-y-auto">
      <MenuBackdrop />
      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-[860px] flex-col justify-center gap-4 p-5">
        <div className="flex items-end justify-between">
          <div>
            <div className="font-display text-[10px] tracking-[0.4em] text-amber-300/80">STEP 1 OF 1</div>
            <h2 className="title-glow font-display text-[28px] text-[#ffe6bd] sm:text-[38px]">FORGE A WORLD</h2>
          </div>
          <button type="button" className="btn btn-ghost px-3 py-2 text-[11px]" onClick={onCancel}>← BACK</button>
        </div>

        <div className="panel grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
          <label className="block">
            <span className="font-display text-[10px] uppercase tracking-wider text-slate-400">World name</span>
            <input
              className="mt-1.5 w-full px-3 py-2 text-[13px]"
              value={name}
              maxLength={22}
              onChange={e => setName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="font-display text-[10px] uppercase tracking-wider text-slate-400">Seed</span>
            <div className="mt-1.5 flex gap-2">
              <input className="w-full px-3 py-2 text-[13px]" value={seedText} maxLength={18} onChange={e => setSeedText(e.target.value)} />
              <button type="button" className="btn px-3 py-2 text-[11px]" onClick={() => setSeedText(String(Math.floor(Math.random() * 99999)))}>
                RANDOM
              </button>
            </div>
          </label>

          <div>
            <span className="font-display text-[10px] uppercase tracking-wider text-slate-400">World size</span>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {(Object.keys(WORLD_SIZES) as SizeKey[]).map(k => {
                const s = WORLD_SIZES[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSize(k)}
                    className={`panel flex flex-col items-start gap-0.5 p-2.5 text-left transition hover:brightness-125 ${size === k ? "" : "opacity-70"}`}
                    style={size === k ? { borderColor: "#ffb648", boxShadow: "0 0 16px rgba(255,182,72,0.25)" } : undefined}
                  >
                    <span className="font-display text-[12px] text-slate-100">{s.label}</span>
                    <span className="text-[10px] text-slate-400">{s.note}</span>
                    <span className="chip mt-1 px-1.5 py-0.5 text-[9px] text-amber-200">
                      {s.w}×{s.h}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="font-display text-[10px] uppercase tracking-wider text-slate-400">Difficulty</span>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {(
                <>
                  {[
                    { n: "Journey", d: 0, t: "Softer hits, more loot" },
                    { n: "Explorer", d: 1, t: "The intended ride" },
                    { n: "Reign", d: 2, t: "Meaner mobs, tougher ore gates" },
                  ].map(o => (
                    <button
                      key={o.n}
                      type="button"
                      onClick={() => setDiff(o.d)}
                  style={diff === o.d ? { borderColor: "#ffb648", boxShadow: "0 0 16px rgba(255,182,72,0.25)" } : undefined}
                      className={`panel flex flex-col items-start gap-0.5 p-2.5 text-left transition hover:brightness-125 ${diff === o.d ? "!border-amber" : "opacity-70"}`}
                    >
                      <span className="font-display text-[12px] text-slate-100">{o.n}</span>
                      <span className="text-[10px] text-slate-400">{o.t}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!valid}
            className="btn btn-primary px-7 py-3.5 text-[14px] disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => valid && onCreate({ name: name.trim(), seedText, size, difficulty: diff })}
          >
            ⚒ CREATE &amp; PLAY
          </button>
          <p className="text-[11px] text-slate-400">
            Seed <span className="text-amber-200">{seedText || "random"}</span> · {WORLD_SIZES[size].w * WORLD_SIZES[size].h} tiles ·
            saved locally
          </p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Loading / generation screen
   ============================================================ */
const TIPS = [
  "Torches keep the dark readable — and light is measured in tiles, so dig deep before you run out.",
  "Trees fall whole: chop the bottom trunk block to harvest the lot.",
  "Craft a Work Bench first, then a Furnace, then an Anvil — better gear needs the station nearby.",
  "Sand and gravel collapse when you dig them out from underneath.",
  "Bones in the caves remember how to shoot. Keep a block between you and a Bone Archer.",
  "Break an Ancient Seal in a deep vault to wake the Mossborn King.",
];

export function LoadingScreen({ progress, label }: { progress: number; label: string }) {
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  return (
    <div className="relative h-full w-full overflow-hidden">
      <MenuBackdrop />
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-6 p-6">
        <div className="text-center">
          <div className="font-display text-[10px] tracking-[0.4em] text-amber-300/80">GENERATING</div>
          <h2 className="title-glow mt-2 font-display text-[26px] text-[#ffe6bd] sm:text-[34px]">{label.toUpperCase()}</h2>
        </div>
        <div className="w-[min(560px,90vw)]">
          <div className="inset h-6 w-full overflow-hidden border-2 border-[#33405a] p-[3px]">
            <div
              className="h-full bg-gradient-to-b from-[#ffcf72] via-[#d98c3a] to-[#8a4f1c] transition-[width] duration-150"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between font-display text-[10px] text-slate-400">
            <span>{Math.round(progress * 100)}%</span>
            <span className="shimmer bg-clip-text text-transparent">FORGING TERRAIN…</span>
          </div>
        </div>
        <div className="block max-w-[520px] animate-pulse text-center text-[12px] text-slate-400">
          <span className="text-moss">TIP · </span>{tip}
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 9 }).map((_, i) => (
            <span
              key={i}
              className="h-4 w-4"
              style={{
                background: ["#6b4630", "#7a7f8c", "#c9743a", "#4fa63c", "#5c3f27", "#8fc8e8", "#f0c33c", "#2c2440", "#74e8ff"][i],
                transform: `translateY(${Math.sin(Date.now() / 220 + i) * 4}px)`,
                boxShadow: "inset 0 -3px 0 rgba(0,0,0,0.35)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
