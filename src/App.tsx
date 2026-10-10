import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS, deleteWorld, generateWorld, listWorlds, loadGame,
  type Game, type Settings, type WorldSummary,
} from "./game/game";
import type { SizeKey } from "./game/world";
import { CreateScreen, LoadingScreen, TitleScreen } from "./ui/Title";
import { Hud } from "./ui/Hud";
import { InventoryPanel } from "./ui/Inventory";
import { DeathOverlay, GameToasts, PauseMenu } from "./ui/Menus";
import { useTick } from "./ui/bits";
import { sfx } from "./game/audio";

const SETTINGS_KEY = "terrafoge:settings";
function storedSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") as Partial<Settings>) };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

type Screen = "title" | "create" | "loading" | "play";

export default function App() {
  const [screen, setScreen] = useState<Screen>("title");
  const [game, setGame] = useState<Game | null>(null);
  const [worlds, setWorlds] = useState<WorldSummary[]>(() => listWorlds());
  const [settings, setSettings] = useState<Settings>(() => storedSettings());
  const [prog, setProg] = useState({ p: 0, label: "Warming up the forge" });
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);

  useTick(14, screen === "play");

  const persistSettings = useCallback((patch: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    if (gameRef.current) {
      for (const [k, v] of Object.entries(patch)) (gameRef.current.settings as never as Record<string, unknown>)[k] = v;
      gameRef.current.applySettings();
    }
  }, []);

  const createWorld = useCallback(async (o: { name: string; seedText: string; size: SizeKey; difficulty: number }) => {
    if (busy) return;
    setBusy(true);
    setProg({ p: 0, label: "Warming up the forge" });
    setScreen("loading");
    sfx.resume();
    // let the loading paint at least once
    await new Promise(r => setTimeout(r, 60));
    try {
      const g = await generateWorld(o, (p, label) => setProg({ p, label }));
      g.settings = { ...g.settings, ...settings };
      g.applySettings();
      g.recalcStats();
      gameRef.current = g;
      setGame(g);
      setWorlds(listWorlds());
      setScreen("play");
    } catch (err) {
      console.error(err);
      alert("World generation failed: " + (err as Error).message);
      setScreen("title");
    } finally {
      setBusy(false);
    }
  }, [busy, settings]);

  const loadWorld = useCallback((name: string) => {
    const g = loadGame(name);
    if (!g) { alert("That save could not be read."); setWorlds(listWorlds()); return; }
    gameRef.current = g;
    setGame(g);
    setScreen("play");
    sfx.resume();
  }, []);

  const quickPlay = useCallback(() => {
    const list = listWorlds();
    if (list.length) loadWorld(list[0].name);
    else void createWorld({
      name: "Adventurer",
      seedText: String(Math.floor(Math.random() * 99999)),
      size: "medium",
      difficulty: 1,
    });
  }, [createWorld, loadWorld]);

  const quit = useCallback(() => {
    const g = gameRef.current;
    if (g) { g.paused = false; g.destroy(); }
    gameRef.current = null;
    setGame(null);
    setWorlds(listWorlds());
    setScreen("title");
  }, []);

  /* attach / detach the engine on the canvas */
  useEffect(() => {
    if (screen !== "play" || !game) return;
    const cv = canvasRef.current;
    if (!cv) return;
    game.attach(cv);
    game.start();
    const onHide = () => { if (document.hidden) game.save(true); };
    const onUnload = () => game.save(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
      game.save(true);
      game.stop();
    };
  }, [screen, game]);

  if (screen === "title") {
    return (
      <Shell>
        <TitleScreen
          worlds={worlds}
          settings={settings}
          onSettings={persistSettings}
          onQuickPlay={quickPlay}
          onNew={() => setScreen("create")}
          onLoad={loadWorld}
          onDelete={n => { deleteWorld(n); setWorlds(listWorlds()); }}
        />
      </Shell>
    );
  }
  if (screen === "create") {
    return (
      <Shell>
        <CreateScreen onCancel={() => { setWorlds(listWorlds()); setScreen("title"); }} onCreate={o => void createWorld(o)} />
      </Shell>
    );
  }
  if (screen === "loading" || !game) {
    return (
      <Shell>
        <LoadingScreen progress={prog.p} label={prog.label} />
      </Shell>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#05070c]" onContextMenu={e => e.preventDefault()}>
      <canvas ref={canvasRef} className="block h-full w-full" style={{ cursor: "crosshair" }} />
      <Hud game={game} />
      <GameToasts game={game} />
      {game.uiMode === "inv" && !game.paused && <InventoryPanel game={game} onClose={() => game.toggleInv()} />}
      {game.paused && (
        <PauseMenu
          game={game}
          onResume={() => { game.paused = false; }}
          onSaveQuit={quit}
          onSettingsChange={persistSettings}
        />
      )}
      {game.dead && <DeathOverlay game={game} onRespawn={() => { game.respawnT = 1; }} />}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="h-full w-full overflow-hidden bg-[#05070c]">{children}</div>;
}
