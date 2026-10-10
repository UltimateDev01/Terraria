import { useRef, useState } from "react";
import type { Game, Settings } from "../game/game";
import { sfx } from "../game/audio";
import { useTick } from "./bits";

/* ============================================================
   Settings panel (shared by title screen & pause menu)
   ============================================================ */
export function SettingsPanel({
  settings,
  onChange,
  compact,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  compact?: boolean;
}) {
  const Row = ({ children }: { children: React.ReactNode }) => (
    <div className={`flex items-center justify-between gap-4 ${compact ? "py-1.5" : "py-2.5"} border-b border-[#212c40] last:border-0`}>
      {children}
    </div>
  );
  const Label = ({ t, hint }: { t: string; hint?: string }) => (
    <div>
      <div className="font-display text-[11px] text-slate-200">{t}</div>
      {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
  const Slider = (p: { k: keyof Settings; min: number; max: number; step: number; fmt?: (v: number) => string }) => (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={p.min}
        max={p.max}
        step={p.step}
        value={settings[p.k] as number}
        onChange={e => onChange({ [p.k]: parseFloat(e.target.value) } as Partial<Settings>)}
        className="h-1.5 w-32 cursor-pointer appearance-none rounded-full bg-[#2e3a52]"
      />
      <span className="w-10 text-right font-display text-[10px] text-amber-300">
        {p.fmt ? p.fmt(settings[p.k] as number) : (settings[p.k] as number).toFixed(2)}
      </span>
    </div>
  );
  const Toggle = (p: { k: keyof Settings; on: string; off: string }) => (
    <div className="flex overflow-hidden border-2 border-[#2e3a52]">
      {[true, false].map(v => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange({ [p.k]: v } as Partial<Settings>)}
          className={`px-2.5 py-1 font-display text-[9px] transition ${
            settings[p.k] === v ? "bg-[#b8752f] text-[#fff6e2]" : "bg-[#101724] text-slate-400 hover:bg-[#18202f]"
          }`}
        >
          {v ? p.on : p.off}
        </button>
      ))}
    </div>
  );

  return (
    <div className="panel px-4 py-2">
      <Row>
        <Label t="Pixel zoom" hint="Bigger tiles, closer camera" />
        <Slider k="zoom" min={1} max={4} step={1} fmt={v => `${v}x`} />
      </Row>
      <Row>
        <Label t="Dynamic lighting" hint="Torch glow, darkness in caves" />
        <Toggle k="lighting" on="ON" off="OFF" />
      </Row>
      <Row>
        <Label t="Particle density" hint="Lower this if the frame rate dips" />
        <Slider k="particles" min={0} max={1.6} step={0.2} fmt={v => `${Math.round(v * 100)}%`} />
      </Row>
      <Row>
        <Label t="Screen shake" />
        <Toggle k="shake" on="ON" off="OFF" />
      </Row>
      <Row>
        <Label t="Sound effects" />
        <Slider k="sfx" min={0} max={1} step={0.05} fmt={v => `${Math.round(v * 100)}`} />
      </Row>
      <Row>
        <Label t="Ambient music" />
        <Slider k="music" min={0} max={1} step={0.05} fmt={v => `${Math.round(v * 100)}`} />
      </Row>
      <Row>
        <Label t="Autosave" hint="Every 60 seconds + on quit" />
        <Toggle k="autosave" on="ON" off="OFF" />
      </Row>
      <Row>
        <Label t="Tile grid" hint="Shows the block grid overlay" />
        <Toggle k="showGrid" on="ON" off="OFF" />
      </Row>
    </div>
  );
}

/* ============================================================
   Controls reference
   ============================================================ */
export const CONTROLS: [string, string][] = [
  ["A / D  ←/→", "Walk left and right"],
  ["Space / W", "Jump — press again mid-air with wings"],
  ["S / ↓", "Sink in water, fast-fall in air"],
  ["Left Mouse", "Mine a block, or swing / fire the selected item"],
  ["Right Mouse", "Place block, open chests, use stations, equip"],
  ["1 … 0", "Select hotbar slot"],
  ["Mouse wheel", "Cycle hotbar"],
  ["E", "Open inventory, crafting & equipment"],
  ["F", "Drink the nearest healing potion"],
  ["Q", "Drop one of the selected item"],
  ["P", "Save world manually"],
  ["Esc", "Pause / close panels"],
];

export function ControlsPanel() {
  return (
    <div className="panel p-4">
      <h3 className="mb-3 font-display text-[13px] text-amber-300">CONTROLS</h3>
      <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {CONTROLS.map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-2">
            <kbd className="chip min-w-[92px] px-1.5 py-1 text-center text-amber-200">{k}</kbd>
            <span className="text-[12px] text-slate-300">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   Pause menu
   ============================================================ */
export function PauseMenu({
  game,
  onResume,
  onSaveQuit,
  onSettingsChange,
}: {
  game: Game;
  onResume: () => void;
  onSaveQuit: () => void;
  onSettingsChange: (p: Partial<Settings>) => void;
}) {
  const [tab, setTab] = useState<"menu" | "settings" | "controls">("menu");
  const hud = game.hud();
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#05070c]/72 p-4 backdrop-blur-[2px]">
      <div className="pop w-full max-w-[720px]">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="font-display text-[10px] tracking-[0.3em] text-copper">PAUSED</div>
            <h2 className="title-glow font-display text-3xl text-[#ffe6bd]">{game.name}</h2>
          </div>
          <div className="flex gap-1">
            {(["menu", "settings", "controls"] as const).map(t => (
              <button
                key={t}
                type="button"
                    onClick={() => { setTab(t); sfx.play("ui"); }}
                    className={`btn px-3 py-1.5 font-display text-[10px] uppercase ${tab === t ? "btn-primary" : "btn-ghost"}`}
                    style={tab === t ? { borderColor: "#e0a05a" } : undefined}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {tab === "menu" && (
          <div className="panel p-4">
            <div className="mb-4 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
              {[
                ["Days survived", String(hud.day)],
                ["Kills", String(hud.kills)],
                ["Blocks mined", String(hud.mined)],
                ["Deepest (ft)", String(Math.round(hud.depth * 2))],
                ["Coins", String(hud.coins)],
                ["Items crafted", String(hud.crafted)],
                ["Defense", String(hud.def)],
                ["Playtime", fmtTime(game.stats.playtime)],
              ].map(([l, v]) => (
                <div key={l} className="inset px-2.5 py-2">
                  <div className="font-display text-[8px] uppercase tracking-wider text-slate-500">{l}</div>
                  <div className="font-display text-[14px] text-amber-200">{v}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary px-5 py-2.5 text-[13px]" onClick={onResume}>
                ▶ RESUME
              </button>
              <button
                type="button"
                className="btn px-4 py-2.5 text-[12px]"
                onClick={() => { game.save(); sfx.play("craft"); onResume(); }}
              >
                SAVE WORLD
              </button>
              <button type="button" className="btn btn-danger px-4 py-2.5 text-[12px]" onClick={onSaveQuit}>
                SAVE &amp; QUIT
              </button>
            </div>
            <p className="mt-3 text-[11px] text-slate-500">
              Progress is stored in this browser (localStorage). Autosave runs every 60&nbsp;s while you play.
            </p>
          </div>
        )}
        {tab === "settings" && <SettingsPanel settings={game.settings} onChange={onSettingsChange} compact />}
        {tab === "controls" && <ControlsPanel />}
      </div>
    </div>
  );
}

export function fmtTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

/* ============================================================
   Death overlay
   ============================================================ */
export function DeathOverlay({ game, onRespawn }: { game: Game; onRespawn: () => void }) {
  useTick(10);
  const h = game.hud();
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[#38070f]/55 backdrop-blur-[1px]">
      <div className="pop text-center">
        <div className="font-display text-[10px] tracking-[0.4em] text-red-300/80">THE DEPTH CLAIMS YOU</div>
        <h2 className="title-glow mt-1 font-display text-5xl text-[#ffd8d8]">YOU DIED</h2>
        <p className="mt-3 text-sm text-red-100/80">A quarter of your coin purse spilled across the floor.</p>
      </div>
      <button type="button" className="btn btn-primary px-6 py-3 text-[14px]" onClick={onRespawn}>
        RESPAWN NOW {h.respawnIn > 0 ? `(${h.respawnIn})` : ""}
      </button>
    </div>
  );
}

/* ============================================================
   Floating toast queue (canvas messages also exist; these are UI)
   ============================================================ */
export function GameToasts({ game }: { game: Game }) {
  const ref = useRef<HTMLDivElement>(null);
  useTick(6);
  const toasts = game.hud().toasts;
  return (
    <div ref={ref} className="pointer-events-none absolute bottom-[112px] left-3 z-20 flex w-[min(420px,42vw)] flex-col gap-1.5">
      {toasts.map((t, i) => (
        <div
          key={i + t.text}
          className="rise panel px-3 py-1.5 text-[12px] leading-snug"
          style={{ borderColor: t.col, opacity: Math.min(1, t.life / 70) }}
        >
          <span style={{ color: t.col }}>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
