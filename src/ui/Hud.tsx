import { HOTBAR } from "../game/game";
import type { Game } from "../game/game";
import { itemDef } from "../game/defs";
import { Heart, ItemIcon, Star, useTick } from "./bits";
import { sfx } from "../game/audio";

const hourOf = (t: number) => {
  const h = (t * 24 + 6) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

export function Hud({ game }: { game: Game }) {
  useTick(14);
  const h = game.hud();
  const hearts = Math.ceil(h.maxHp / 20);
  const heartsArr = Array.from({ length: hearts }, (_, i) => {
    const v = (h.hp - i * 20) / 20;
    return Math.max(0, Math.min(1, v));
  });
  const stars = Math.ceil(h.maxMana / 20);
  const starsArr = Array.from({ length: stars }, (_, i) => Math.max(0, Math.min(1, (h.mana - i * 20) / 20)));
  const layerName = ["Surface", "Caverns", "The Deep"][h.layer];

  return (
    <>
      {/* ---------- locator ---------- */}
      <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-col gap-2">
        <div className="panel pointer-events-auto flex items-stretch gap-3 py-2 pl-2 pr-3">
          <div className="inset flex h-[46px] w-[46px] items-center justify-center">
            <svg viewBox="0 0 40 40" className="h-[38px] w-[38px]">
              <circle cx="20" cy="20" r="17" fill="#0c1220" stroke="#33405a" strokeWidth="2" />
              {Array.from({ length: 8 }).map((_, i) => (
                <line
                  key={i}
                  x1={20 + Math.cos((i / 8) * 6.283) * 14}
                  y1={20 + Math.sin((i / 8) * 6.283) * 14}
                  x2={20 + Math.cos((i / 8) * 6.283) * 16.5}
                  y2={20 + Math.sin((i / 8) * 6.283) * 16.5}
                  stroke="#3d4d66"
                  strokeWidth="1.5"
                />
              ))}
              <line
                x1="20"
                y1="20"
                x2={20 + Math.cos(h.time * 6.283 - Math.PI / 2) * 12}
                y2={20 + Math.sin(h.time * 6.283 - Math.PI / 2) * 12}
                stroke="#ffb648"
                strokeWidth="2"
              />
              <circle cx={20 + Math.cos(h.time * 6.283 - Math.PI / 2) * 12} cy={20 + Math.sin(h.time * 6.283 - Math.PI / 2) * 12} r="2.6" fill={h.night ? "#cfe0ff" : "#ffe08a"} />
            </svg>
          </div>
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-2">
              <span className="font-display text-[13px] text-slate-100">{hourOf(h.time)}</span>
              <span className={`chip px-1.5 py-0.5 ${h.night ? "text-violet-300" : "text-amber-200"}`}>
                {h.night ? "☾ NIGHT" : "☀ DAY"}
              </span>
              <span className="chip px-1.5 py-0.5 text-slate-300">DAY {h.day}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
              <span className="text-moss">{h.biome}</span>
              <span className="text-slate-600">·</span>
              <span>{h.deep}</span>
              <span className="text-slate-600">·</span>
              <span className="text-sky-300">{layerName}</span>
            </div>
          </div>
        </div>

        <div className="panel flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
          <Badge label="DEPTH" value={`${Math.round(h.depth * 2)} ft`} col="#8fd0f5" />
          <Badge label="DEF" value={String(h.def)} col="#7ec95a" />
          <Badge label="KILLS" value={String(h.kills)} col="#ff8f8f" />
          <Badge label="COINS" value={String(h.coins)} col="#ffd166" />
          <Badge label="MINED" value={String(h.mined)} col="#cbb89a" />
          <Badge label="MOBS" value={String(h.enemies)} col="#b6a8ff" />
          <Badge label="FPS" value={String(h.fps)} col={h.fps > 45 ? "#7ec95a" : "#ff8f6b"} />
        </div>
      </div>

      {/* ---------- top right actions ---------- */}
      <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5">
        <div className="panel mr-1 hidden items-center gap-2 px-3 py-2 sm:flex">
          <span className="font-display text-[10px] text-slate-400">WORLD</span>
          <span className="font-display text-[11px] text-amber-200">{game.name}</span>
        </div>
        <IconBtn title="Inventory (E)" onClick={() => game.toggleInv()}>
          <BagIcon />
        </IconBtn>
        <IconBtn
          title="Save world (P)"
          onClick={() => { game.save(); }}
          flash={h.saveState === "saved" ? 1 : 0}
        >
          <SaveIcon />
        </IconBtn>
        <IconBtn title="Pause (Esc)" onClick={() => { game.paused = !game.paused; sfx.play("ui"); }}>
          <PauseIcon />
        </IconBtn>
      </div>

      {/* ---------- boss bar ---------- */}
      {h.boss && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 w-[min(520px,60vw)] -translate-x-1/2">
          <div className="panel px-3 py-2">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="font-display text-[12px] tracking-wider text-[#ffdede]">{h.boss.name.toUpperCase()}</span>
              <span className="font-display text-[10px] text-slate-400">
                {Math.max(0, Math.round((h.boss.hp / h.boss.max) * 100))}%
              </span>
            </div>
            <div className="inset h-3 w-full overflow-hidden p-[2px]">
              <div
                className="h-full bg-gradient-to-b from-[#ff8a5a] via-[#d63b4a] to-[#7c1424] transition-[width] duration-200"
                style={{ width: `${Math.max(0, (h.boss.hp / h.boss.max) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ---------- bottom: hearts, mana, hotbar ---------- */}
      <div className="absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1.5">
        <div className="flex items-end gap-3">
          <div className="flex flex-col items-center gap-1">
            <div className="flex flex-wrap justify-center gap-[2px]">
              {heartsArr.map((v, i) => <Heart key={i} fill={v} />)}
            </div>
            {starsArr.length > 0 && (
              <div className="flex flex-wrap justify-center gap-[2px] opacity-90">
                {starsArr.map((v, i) => <Star key={i} fill={v} />)}
              </div>
            )}
          </div>
        </div>
        <div className="panel flex items-end gap-1 p-1.5" onContextMenu={e => e.preventDefault()}>
          {Array.from({ length: HOTBAR }, (_, i) => {
            const s = game.inv[i];
            const it = s ? itemDef(s.id) : null;
            const isSel = game.sel === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => { game.sel = i; game.bumpInv(); sfx.play("ui"); }}
                className={`group slot relative flex h-[52px] w-[52px] items-center justify-center ${isSel ? "sel" : ""}`}
              >
                <span className={`absolute left-[3px] top-[1px] font-display text-[8px] ${isSel ? "text-amber-200" : "text-slate-500"}`}>
                  {i === 9 ? 0 : i + 1}
                </span>
                {s && (
                  <>
                    <div className="flex h-full w-full items-center justify-center p-[4px]"><ItemIcon id={s.id} /></div>
                    {s.n > 1 && (
                      <span
                        className="absolute bottom-[1px] right-[3px] font-display text-[10px] text-white"
                        style={{ textShadow: "1px 1px 0 #000,-1px 1px 0 #000,1px -1px 0 #000,-1px -1px 0 #000" }}
                      >
                        {s.n}
                      </span>
                    )}
                    {it?.kind === "sword" && <span className="absolute bottom-[1px] left-[3px] font-display text-[8px] text-red-300">{it.damage}</span>}
                    {it?.kind === "tool" && it.pick ? <span className="absolute bottom-[1px] left-[3px] font-display text-[8px] text-amber-200">P{it.pick}</span> : null}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------- hints ---------- */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 hidden text-right font-display text-[9px] leading-relaxed text-slate-500 md:block">
        <div>LMB MINE / ATTACK · RMB PLACE</div>
        <div>E INVENTORY · F POTION · ESC PAUSE</div>
      </div>

      {h.night && h.layer === 0 && (
        <div className="pointer-events-none absolute left-1/2 top-[86px] z-10 -translate-x-1/2">
          <div className="blink panel px-3 py-1 font-display text-[10px] tracking-[0.2em] text-red-300">
            NIGHTFALL — SOMETHING IS COMING
          </div>
        </div>
      )}
    </>
  );
}

function Badge({ label, value, col }: { label: string; value: string; col: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="font-display text-[8px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className="font-display text-[11px]" style={{ color: col }}>{value}</span>
    </span>
  );
}

function IconBtn({ children, onClick, title, flash = 0 }: { children: React.ReactNode; onClick: () => void; title: string; flash?: number }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="btn relative flex h-[38px] w-[38px] items-center justify-center"
      style={flash ? { borderColor: "#7ec95a" } : undefined}
    >
      {children}
      {flash > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 bg-moss" />}
    </button>
  );
}
const BagIcon = () => (
  <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="#dfe8f5" strokeWidth="1.6">
    <path d="M4 7h12l-1 10H5L4 7z" />
    <path d="M7 7V5a3 3 0 016 0v2" />
  </svg>
);
const SaveIcon = () => (
  <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="#dfe8f5" strokeWidth="1.6">
    <path d="M4 4h9l3 3v9H4z" />
    <path d="M7 4v5h6V4" />
  </svg>
);
const PauseIcon = () => (
  <svg viewBox="0 0 20 20" className="h-5 w-5" fill="#dfe8f5">
    <rect x="6" y="5" width="3" height="10" />
    <rect x="11" y="5" width="3" height="10" />
  </svg>
);
