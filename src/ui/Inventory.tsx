import { useEffect, useRef, useState } from "react";
import type { Game } from "../game/game";
import { HOTBAR, INV_SIZE } from "../game/game";
import { itemName, itemDef, STATION_NAMES, type Station } from "../game/defs";
import { ItemIcon, SlotView, useTick } from "./bits";
import { sfx } from "../game/audio";

const FILTERS: ("all" | Station)[] = ["all", "hand", "workbench", "furnace", "anvil"];

export function InventoryPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  useTick(18);
  const [hover, setHover] = useState<string | null>(null);
  const heldRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const el = heldRef.current;
      if (el) { el.style.left = e.clientX + "px"; el.style.top = e.clientY + "px"; }
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  useEffect(() => {
    const cv = mapRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    let alive = true;
    const draw = () => {
      if (!alive) return;
      game.drawMinimapInto(ctx, cv.width, cv.height);
      requestAnimationFrame(draw);
    };
    draw();
    return () => { alive = false; };
  }, [game]);

  const craft = game.craftList();
  const st = game.stationsHere();
  const held = game.held;

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-[#05070c]/62 p-3"
      onMouseDown={e => {
        if (e.target === e.currentTarget) { onClose(); }
      }}
      onContextMenu={e => e.preventDefault()}
    >
      <div className="pop flex max-h-full w-full max-w-[1080px] flex-col gap-3 lg:flex-row">
        {/* ---------- equipment & stats ---------- */}
        <div className="panel flex w-full shrink-0 flex-col gap-3 p-3 lg:w-[236px]">
          <SectionTitle>ARMOURY</SectionTitle>
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5">
              {(["helm", "chest", "legs"] as const).map(k => (
                <div key={k} className="group relative">
                  <SlotView
                    stack={game.equip[k]}
                    size={50}
                    onClick={() => game.unequip(k)}
                    ring="#2e3a52"
                  />
                  <span className="pointer-events-none absolute -bottom-[13px] left-0 right-0 text-center font-display text-[7px] uppercase text-slate-500">
                    {k}
                  </span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5 self-start">
              {game.equip.acc.map((a, i) => (
                <div key={i} className="group relative">
                  <SlotView stack={a} size={42} onClick={() => game.unequip(i)} ring="#2e3a52" />
                </div>
              ))}
              <span className="col-span-2 text-center font-display text-[7px] uppercase text-slate-500">accessories</span>
            </div>
          </div>

          <div className="mt-3">
            <SectionTitle>ATTRIBUTES</SectionTitle>
            <div className="mt-1.5 flex flex-col gap-1">
              <Line l="Defence" v={String(game.def)} c="#7ec95a" />
              <Line l="Max HP" v={String(game.player.maxHp)} c="#ff8f9f" />
              <Line l="Max mana" v={String(game.player.maxMana)} c="#8f9bff" />
              <Line l="Melee" v={`×${game.bonus.melee.toFixed(2)}`} c="#ffb648" />
              <Line l="Ranged" v={`×${game.bonus.ranged.toFixed(2)}`} c="#8fd0f5" />
              <Line l="Crit" v={`${Math.round(game.bonus.crit * 100)}%`} c="#ffe08a" />
              <Line l="Speed" v={`×${game.bonus.speed.toFixed(2)}`} c="#cfe0f5" />
              <Line l="Regen" v={game.bonus.regen > 0 ? "yes" : "—"} c="#a8e0a8" />
              <Line l="Fireproof" v={game.bonus.fire ? "yes" : "—"} c="#ff9b3d" />
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-1 text-[10px] text-slate-500">
            <span>Right-click an item to equip or drink it.</span>
            <span>Click a slot to pick the stack up, click again to set it down.</span>
          </div>
        </div>

        {/* ---------- inventory + chest ---------- */}
        <div className="panel flex min-w-0 flex-1 flex-col gap-2 p-3">
          {game.chestOpen && (
            <div className="border-2 border-[#4a3a1c] bg-[#1a1408]/70 p-2">
              <div className="mb-1.5 flex items-center justify-between">
                <SectionTitle>TREASURE CHEST</SectionTitle>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="btn px-2 py-1 font-display text-[9px]"
                    onClick={() => {
                      // move everything possible into the inventory
                      game.chestOpen?.forEach((s, i) => {
                        if (!s) return;
                        const left = game.addItem(s.id, s.n);
                        game.chestOpen![i] = left > 0 ? { id: s.id, n: left } : null;
                      });
                      sfx.play("chest");
                      game.bumpInv();
                    }}
                  >
                    LOOT ALL
                  </button>
                  <button type="button" className="btn btn-ghost px-2 py-1 font-display text-[9px]" onClick={() => game.closeChest()}>
                    CLOSE
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {game.chestOpen.map((s, i) => (
                  <SlotView
                    key={i}
                    stack={s}
                    index={i}
                    size={42}
                    onClick={(idx, r) => game.uiClick("chest", idx, r)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <SectionTitle>INVENTORY</SectionTitle>
            <span className="font-display text-[9px] text-slate-500">
              {game.inv.filter(Boolean).length}/{INV_SIZE} slots · hotbar row is numbered
            </span>
          </div>

          <div className="grid grid-cols-10 gap-1">
            {Array.from({ length: INV_SIZE }, (_, i) => {
              const s = game.inv[i];
              const isHot = i < HOTBAR;
              return (
                <div key={i} className="relative" onMouseEnter={() => setHover(s ? s.id : null)} onMouseLeave={() => setHover(null)}>
                  <SlotView
                    stack={s}
                    index={i}
                    size={46}
                    selected={isHot && game.sel === i}
                    ring={isHot ? "rgba(255,182,72,0.25)" : undefined}
                    onClick={(idx, right) => game.uiClick("inv", idx, right)}
                  />
                  {isHot && (
                    <span className="pointer-events-none absolute -top-[2px] left-[3px] font-display text-[7px] text-amber-300/70">
                      {i === 9 ? 0 : i + 1}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {hover && (
            <div className="inset mt-1 px-2.5 py-1.5 text-[11px]">
              <span className="font-display text-[11px] text-slate-100">{itemName(hover)}</span>
              <span className="ml-2 text-slate-400">{itemDef(hover).desc ?? ""}</span>
            </div>
          )}
        </div>

        {/* ---------- crafting + map ---------- */}
        <div className="panel flex w-full shrink-0 flex-col p-3 lg:w-[310px]">
          <div className="flex items-center justify-between">
            <SectionTitle>CRAFTING</SectionTitle>
            <button type="button" className="btn btn-ghost px-2 py-1 font-display text-[9px]" onClick={onClose}>
              ✕ ESC
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {FILTERS.map(f => (
              <button
                key={f}
                type="button"
                onClick={() => { game.craftFilter = f; game.bumpInv(); sfx.play("ui"); }}
                className={`chip px-1.5 py-1 uppercase transition ${game.craftFilter === f ? "text-amber-200" : "text-slate-500"} ${
                  f !== "hand" && f !== "all" && !st[f] ? "opacity-35" : ""
                }`}
                style={game.craftFilter === f ? { borderColor: "#ffb648", background: "#241a0c" } : undefined}
              >
                {f === "all" ? "all" : STATION_NAMES[f as Station]}
              </button>
            ))}
          </div>

          <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" style={{ maxHeight: "46vh" }}>
            {craft.length === 0 && (
              <div className="inset px-3 py-4 text-center text-[11px] text-slate-500">
                Nothing craftable here. Build a <span className="text-amber-200">Work Bench</span>, then a{" "}
                <span className="text-amber-200">Furnace</span> or <span className="text-amber-200">Anvil</span> and stand beside them.
              </div>
            )}
            {craft.map((entry, i) => (
              <button
                key={i}
                type="button"
                disabled={!entry.can}
                onClick={() => game.craftAt(i)}
                className={`flex w-full items-center gap-2 border-2 p-1.5 text-left transition ${
                  entry.can
                    ? "border-[#3b5a3a] bg-[#131d18] hover:border-moss hover:bg-[#17281d]"
                    : "border-[#28324a] bg-[#101623] opacity-70"
                }`}
              >
                <span className="inset flex h-9 w-9 shrink-0 items-center justify-center p-[3px]">
                  <ItemIcon id={entry.r.out} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[11px] text-slate-100">
                    {itemName(entry.r.out)}
                    {entry.r.count > 1 && <span className="text-amber-200"> ×{entry.r.count}</span>}
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {entry.r.need.map(([id, n], k) => (
                      <span
                        key={id}
                        className="chip px-1 py-[1px] text-[9px]"
                        style={{ color: entry.have[k] >= n ? "#8fe0a8" : "#ff9b9b" }}
                      >
                        {itemName(id)} {entry.have[k]}/{n}
                      </span>
                    ))}
                  </span>
                </span>
                <span className={`font-display text-[9px] ${entry.can ? "text-moss" : "text-slate-600"}`}>
                  {entry.can ? "CRAFT" : "—"}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-2">
            <SectionTitle>WORLD MAP</SectionTitle>
            <div className="inset mt-1 overflow-hidden p-1">
              <canvas ref={mapRef} width={276} height={124} className="pixelated w-full" />
            </div>
            <div className="mt-1 flex flex-wrap gap-2 font-display text-[8px] text-slate-500">
              <span><i className="mr-1 inline-block h-2 w-2 bg-[#ffd166]" />you</span>
              <span><i className="mr-1 inline-block h-2 w-2 bg-[#8cffb4]" />chests</span>
              <span><i className="mr-1 inline-block h-2 w-2 bg-[#ff6b6b]" />monsters</span>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- stack on the cursor ---------- */}
      {held && (
        <div
          ref={heldRef}
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2"
          style={{ left: -999, top: -999 }}
        >
          <div className="relative flex h-[46px] w-[46px] items-center justify-center border-2 border-amber bg-[#241a0c]/80 p-1">
            <ItemIcon id={held.id} />
            {held.n > 1 && <span className="absolute bottom-0 right-1 font-display text-[10px] text-white" style={{ textShadow: "1px 1px 0 #000" }}>{held.n}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-2">
    <span className="h-2 w-2 bg-copper" />
    <h3 className="font-display text-[11px] tracking-[0.18em] text-slate-300">{children}</h3>
    <span className="h-px flex-1 bg-[#26314a]" />
  </div>
);
const Line = ({ l, v, c }: { l: string; v: string; c: string }) => (
  <div className="flex items-baseline justify-between border-b border-[#1e2739] pb-0.5">
    <span className="text-[11px] text-slate-400">{l}</span>
    <span className="font-display text-[11px]" style={{ color: c }}>{v}</span>
  </div>
);
