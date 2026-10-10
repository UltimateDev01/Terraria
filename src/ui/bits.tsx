import { useEffect, useId, useState } from "react";
import { RARITY_COLORS, RARITY_NAMES, itemDef, itemName } from "../game/defs";
import { itemIcon } from "../game/textures";
import type { Slot } from "../game/game";

/** re-render at a fixed rate while mounted */
export function useTick(hz: number, active = true) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => force(n => n + 1), Math.max(16, 1000 / hz));
    return () => window.clearInterval(id);
  }, [hz, active]);
}

export function ItemIcon({ id, size = 34 }: { id: string; size?: number }) {
  const url = itemIcon(id);
  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className="pixelated select-none pointer-events-none"
      style={{ width: "100%", height: "100%", objectFit: "contain" }}
    />
  );
}

export function ItemTip({ id }: { id: string }) {
  const it = itemDef(id);
  const rare = it.rare ?? 0;
  return (
    <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-50 hidden w-max max-w-[260px] -translate-x-1/2 group-hover:block">
      <div className="panel px-3 py-2 text-left" style={{ borderColor: RARITY_COLORS[rare] }}>
        <div className="font-display text-[12px]" style={{ color: RARITY_COLORS[rare] }}>
          {itemName(id)}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
          <span className="chip px-1.5 py-0.5" style={{ color: RARITY_COLORS[rare] }}>
            {RARITY_NAMES[rare]}
          </span>
          <span className="chip px-1.5 py-0.5 uppercase">{it.kind}</span>
          {it.damage !== undefined && <span className="chip px-1.5 py-0.5 text-red-300">{it.damage} DMG</span>}
          {it.defense !== undefined && <span className="chip px-1.5 py-0.5 text-sky-300">{it.defense} DEF</span>}
          {it.pick ? <span className="chip px-1.5 py-0.5 text-amber-200">Power {it.pick}</span> : null}
          {it.axe ? <span className="chip px-1.5 py-0.5 text-amber-200">Chop {it.axe}</span> : null}
          {it.mana ? <span className="chip px-1.5 py-0.5 text-violet-300">{it.mana} Mana</span> : null}
          {it.speed ? <span className="chip px-1.5 py-0.5">{(it.speed / 60).toFixed(2)}s use</span> : null}
        </div>
        {it.desc && <div className="mt-1.5 max-w-[240px] text-[11px] leading-snug text-slate-300">{it.desc}</div>}
        {it.kind === "block" && <div className="mt-1 text-[10px] text-emerald-300/80">Right-click in world to place</div>}
      </div>
    </div>
  );
}

export function SlotView(props: {
  stack: Slot;
  index?: number;
  selected?: boolean;
  onClick?: (i: number, right: boolean) => void;
  size?: number;
  label?: string;
  dim?: boolean;
  ring?: string;
}) {
  const { stack, index = 0, selected, onClick, size = 46, label, dim, ring } = props;
  return (
    <button
      type="button"
      className={`group slot relative flex items-center justify-center ${selected ? "sel" : ""} ${dim ? "opacity-45" : ""}`}
      style={{ width: size, height: size, boxShadow: ring ? `0 0 0 1px ${ring}` : undefined }}
      onMouseDown={e => {
        e.preventDefault();
        onClick?.(index, e.button === 2);
      }}
      onContextMenu={e => e.preventDefault()}
    >
      {stack ? (
        <>
          <div className="flex h-full w-full items-center justify-center p-[3px]">
            <ItemIcon id={stack.id} />
          </div>
          {stack.n > 1 && (
            <span
              className="pointer-events-none absolute right-[2px] bottom-[1px] font-display text-[10px] leading-none text-white"
              style={{ textShadow: "1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000" }}
            >
              {stack.n}
            </span>
          )}
          <ItemTip id={stack.id} />
        </>
      ) : (
        label && <span className="font-display text-[9px] text-slate-500">{label}</span>
      )}
      {label && stack && (
        <span className="pointer-events-none absolute left-[2px] top-[1px] font-display text-[8px] text-slate-400/80">
          {label}
        </span>
      )}
    </button>
  );
}

export function Heart({ fill }: { fill: number }) {
  const id = useId().replace(/:/g, "");
  const path =
    "M8 14.5S1 10.2 1 5.9C1 3.2 3 1.5 5 1.5c1.5 0 2.5.8 3 1.7.5-.9 1.5-1.7 3-1.7 2 0 4 1.7 4 4.4 0 4.3-7 8.6-7 8.6z";
  const f = Math.max(0, Math.min(1, fill));
  return (
    <svg viewBox="0 0 16 16" className="heart h-[15px] w-[15px]" aria-hidden>
      <defs>
        <clipPath id={`h${id}`}>
          <rect x="0" y={16 * (1 - f)} width="16" height={16 * f} />
        </clipPath>
      </defs>
      <path d={path} fill="#2a1420" stroke="#12080d" strokeWidth="1.2" />
      {f > 0.01 && (
        <g clipPath={`url(#h${id})`}>
          <path d={path} fill="#e83a52" />
          <path d={path} fill="#ff98a8" transform="translate(0.6 0.6) scale(0.92)" opacity="0.35" />
        </g>
      )}
    </svg>
  );
}

export function Star({ fill }: { fill: number }) {
  return (
    <svg viewBox="0 0 16 16" className="h-[14px] w-[14px]" aria-hidden>
      <path
        d="M8 1.2l1.9 4.3 4.6.5-3.4 3.1.9 4.6L8 11.6l-4 2.1.9-4.6L1.5 6l4.6-.5z"
        fill={fill > 0.05 ? "#5a6ae0" : "#1b2233"}
        stroke={fill > 0.05 ? "#a8b6ff" : "#2a3450"}
        strokeWidth="1"
        opacity={0.35 + 0.65 * fill}
      />
    </svg>
  );
}

export function Stat({ label, value, color = "#dfe8f5", icon }: { label: string; value: string | number; color?: string; icon?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {icon && <span className="text-[11px] opacity-80">{icon}</span>}
      <span className="font-display text-[9px] uppercase tracking-wider text-slate-400">{label}</span>
      <span className="font-display text-[11px]" style={{ color }}>
        {value}
      </span>
    </div>
  );
}


