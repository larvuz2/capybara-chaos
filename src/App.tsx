// ============================================================================
// CAPYBARA CHAOS: Zoo Shutdown — app shell.
// React owns screens (title / howto / shop / HUD / pause / end) and DOM popups;
// GameScene + World own the 3D sim. UI reads a HUD snapshot each frame.
// ============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play, ShoppingBag, HelpCircle, X, Volume2, VolumeX, Pause, RotateCcw,
  Wind, Zap, Megaphone, HeartPulse, EyeOff, Hammer, Waves, Flame, PawPrint,
  Apple, Backpack, CloudRain, Crown, Cake, Video, DoorOpen, ShoppingCart, Trophy,
} from 'lucide-react';
import { World } from './game/world';
import { GameScene } from './game/scene';
import { LocalInput } from './game/input';
import { LocalLoopback } from './game/types';
import { EVENTS, UPGRADES, STAGES } from './game/constants';
import type { EventId } from './game/constants';
import { loadMeta, saveMeta, tryPurchase } from './game/meta';
import type { MetaState } from './game/meta';
import type { HudSnapshot } from './game/types';
import { audio } from './game/audio';

type Screen = 'title' | 'howto' | 'shop' | 'game';

interface Popup {
  id: number;
  x: number;
  y: number;
  text: string;
  cls: string;
}

const EVENT_ICONS: Record<EventId, typeof Apple> = {
  feeding: Apple,
  fieldtrip: Backpack,
  rain: CloudRain,
  vip: Crown,
  birthday: Cake,
  tvcrew: Video,
  gateopen: DoorOpen,
  foodcart: ShoppingCart,
};

const UPGRADE_ICONS: Record<string, typeof Wind> = {
  wind: Wind,
  zap: Zap,
  megaphone: Megaphone,
  'heart-pulse': HeartPulse,
  'eye-off': EyeOff,
  hammer: Hammer,
  waves: Waves,
  'volume-2': Volume2,
};

let popupId = 0;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<GameScene | null>(null);
  const worldRef = useRef<World | null>(null);
  const adapterRef = useRef<LocalLoopback | null>(null);
  const inputRef = useRef<LocalInput | null>(null);
  const rafRef = useRef(0);
  const lastTRef = useRef(0);
  const pausedRef = useRef(false);
  const screenRef = useRef<Screen>('title');
  const hudTimerRef = useRef(0);

  const [screen, setScreen] = useState<Screen>('title');
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [paused, setPaused] = useState(false);
  const [meta, setMeta] = useState<MetaState>(loadMeta);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [banner, setBanner] = useState<{ title: string; sub: string } | null>(null);
  const [endInfo, setEndInfo] = useState<{ result: 'win' | 'caught'; cp: number } | null>(null);
  const [currentEvent, setCurrentEvent] = useState<EventId | null>(null);

  screenRef.current = screen;
  pausedRef.current = paused;

  // ---- popup helper (3D -> DOM) -------------------------------------------
  const addPopup = useCallback((x: number, z: number, text: string, cls: string) => {
    const scene = sceneRef.current;
    if (!scene) return;
    const pt = scene.project(x, z);
    if (!pt.visible) return;
    const id = ++popupId;
    setPopups((ps) => [...ps.slice(-14), { id, x: pt.x + (Math.random() - 0.5) * 30, y: pt.y, text, cls }]);
    window.setTimeout(() => setPopups((ps) => ps.filter((p) => p.id !== id)), 1100);
  }, []);

  // ---- boot renderer once --------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const world = new World();
    const scene = new GameScene(canvas, addPopup);
    const input = new LocalInput();
    const adapter = new LocalLoopback(input);
    worldRef.current = world;
    sceneRef.current = scene;
    inputRef.current = input;
    adapterRef.current = adapter;
    input.onPause = () => {
      if (screenRef.current === 'game') setPaused((p) => !p);
    };

    // attract mode behind title
    world.reset({ upgrades: {}, event: 'feeding', attract: true });
    scene.resetForRun(world);

    lastTRef.current = performance.now();
    const loop = (t: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const dt = Math.min((t - lastTRef.current) / 1000, 0.1);
      lastTRef.current = t;
      const w = worldRef.current;
      const s = sceneRef.current;
      const a = adapterRef.current;
      if (!w || !s || !a) return;
      const isPaused = pausedRef.current;
      if (!isPaused) {
        const inputs = a.gatherInputs();
        w.step(dt, inputs);
        a.broadcast(w.events);
      }
      s.render(w, dt, isPaused);

      // consume world events for UI/audio
      for (const e of w.events.length ? [] : []) void e; // (events consumed in scene)

      // HUD sync at 12Hz (cheap React updates)
      hudTimerRef.current -= dt;
      if (hudTimerRef.current <= 0 && screenRef.current === 'game') {
        hudTimerRef.current = 1 / 12;
        const snap = w.snapshot();
        setHud((prev) => {
          if (prev && prev.score === snap.score && prev.chaos === snap.chaos && prev.stamina === snap.stamina && prev.combo === snap.combo && prev.lives === snap.lives && prev.over === snap.over && prev.hidden === snap.hidden && prev.stageIndex === snap.stageIndex && prev.nearPond === snap.nearPond) return prev;
          return snap;
        });
        audio.setIntensity(snap.stageIndex);
        if (snap.over && !endInfoRef.current) {
          const cp = w.chaosPointsEarned();
          endInfoRef.current = { result: snap.result ?? 'caught', cp };
          setEndInfo(endInfoRef.current);
          setMeta((m) => {
            const next: MetaState = {
              ...m,
              chaosPoints: m.chaosPoints + cp,
              bestScore: Math.max(m.bestScore, snap.score),
              runs: m.runs + 1,
              wins: m.wins + (snap.result === 'win' ? 1 : 0),
            };
            saveMeta(next);
            return next;
          });
        }
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      input.dispose();
      scene.dispose();
      audio.stopMusic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const endInfoRef = useRef<{ result: 'win' | 'caught'; cp: number } | null>(null);

  // ---- run control ----------------------------------------------------------
  const startRun = useCallback(() => {
    const w = worldRef.current;
    const s = sceneRef.current;
    const metaNow = loadMeta();
    if (!w || !s) return;
    const ev = EVENTS[Math.floor(Math.random() * EVENTS.length)];
    endInfoRef.current = null;
    setEndInfo(null);
    setBanner(null);
    setCurrentEvent(ev.id);
    w.reset({ upgrades: metaNow.upgrades, event: ev.id, attract: false });
    s.resetForRun(w);
    setPaused(false);
    setScreen('game');
    setHud(w.snapshot());
    audio.ensure();
    audio.startMusic();
    audio.setIntensity(0);
    audio.play('stageup');
    setBanner({ title: ev.name, sub: ev.desc });
    window.setTimeout(() => setBanner(null), 3200);
  }, []);

  const backToTitle = useCallback(() => {
    const w = worldRef.current;
    const s = sceneRef.current;
    if (!w || !s) return;
    w.reset({ upgrades: {}, event: 'feeding', attract: true });
    s.resetForRun(w);
    setScreen('title');
    setHud(null);
    setEndInfo(null);
    endInfoRef.current = null;
    audio.stopMusic();
  }, []);

  // world-level banner events (drone, vip)
  useEffect(() => {
    const id = window.setInterval(() => {
      const w = worldRef.current;
      if (!w || screenRef.current !== 'game') return;
      for (const e of w.events) {
        if (e.kind === 'banner') {
          setBanner({ title: e.title, sub: e.sub });
          window.setTimeout(() => setBanner(null), 2600);
        }
      }
    }, 120);
    return () => clearInterval(id);
  }, []);

  const toggleMute = useCallback(() => {
    setMeta((m) => {
      const next = { ...m, muted: !m.muted };
      saveMeta(next);
      audio.setMuted(next.muted);
      return next;
    });
  }, []);

  // first-gesture audio unlock
  useEffect(() => {
    const unlock = () => audio.ensure();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const EvIcon = currentEvent ? EVENT_ICONS[currentEvent] : null;
  const evDef = currentEvent ? EVENTS.find((e) => e.id === currentEvent) : null;

  // ==========================================================================
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0d1b12] font-game select-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* score popups (world-anchored) */}
      {screen === 'game' &&
        popups.map((p) => (
          <div key={p.id} className={`popup popup-${p.cls}`} style={{ left: p.x, top: p.y }}>
            {p.text}
          </div>
        ))}

      {/* ======================= TITLE ======================= */}
      {screen === 'title' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-black/55 via-black/25 to-black/60">
          <div className="animate-bounce-slow mb-2 text-7xl drop-shadow-[0_6px_0_rgba(0,0,0,0.45)]">🦫</div>
          <h1 className="title-logo">
            CAPYBARA
            <span className="title-logo-accent">CHAOS</span>
          </h1>
          <p className="mt-1 text-lg font-bold tracking-[0.35em] text-amber-200/90 drop-shadow">ZOO SHUTDOWN</p>
          <p className="mt-3 max-w-md px-4 text-center text-sm font-semibold text-white/80">
            You are Munch — the grumpiest capybara alive. Cause enough chaos and the zoo SHUTS DOWN for the day.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <button className="btn-primary" onClick={startRun}>
              <Play className="h-6 w-6" fill="currentColor" /> START RUN
            </button>
            <div className="flex gap-3">
              <button className="btn-secondary" onClick={() => setScreen('shop')}>
                <ShoppingBag className="h-5 w-5" /> UPGRADES
              </button>
              <button className="btn-secondary" onClick={() => setScreen('howto')}>
                <HelpCircle className="h-5 w-5" /> HOW TO PLAY
              </button>
            </div>
          </div>
          <div className="mt-6 flex items-center gap-4 text-sm font-bold text-amber-100/80">
            <span className="flex items-center gap-1.5"><Trophy className="h-4 w-4" /> Best: {meta.bestScore}</span>
            <span>🌀 Chaos Points: {meta.chaosPoints}</span>
          </div>
          <button className="absolute right-4 top-4 rounded-full bg-black/40 p-2.5 text-white hover:bg-black/60" onClick={toggleMute}>
            {meta.muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        </div>
      )}

      {/* ======================= HOW TO PLAY ======================= */}
      {screen === 'howto' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-4">
          <div className="panel max-w-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-extrabold text-amber-900">HOW TO PLAY</h2>
              <button className="rounded-full p-1.5 hover:bg-amber-100" onClick={() => setScreen('title')}><X className="h-6 w-6 text-amber-900" /></button>
            </div>
            <div className="space-y-2.5 text-sm font-semibold text-amber-950/90">
              <p>🎯 <b>Goal:</b> fill the CHAOS meter to 100% to shut the zoo down. Get grabbed 3 times and you're caught!</p>
              <p>⌨️ <b>WASD / Arrows</b> — waddle around</p>
              <p>🦷 <b>J or Z</b> — Bite (quick scare, wrecks selfie sticks)</p>
              <p>💥 <b>K or X</b> — Headbutt (big knockback — shove them into the pond!)</p>
              <p>💨 <b>Shift (hold)</b> — Charge! Bowls through crowds, drains stamina</p>
              <p>🌿 <b>L or C</b> — Hide in bushes / roll in the mud (mud = speed boost)</p>
              <p>💦 <b>Space</b> — Splash attack (near the pond)</p>
              <p>🍔 Eat food tourists toss to restore stamina. Combos multiply your score!</p>
              <p>🚨 More chaos = more security: keepers, tranq darts, drones… ZOO SWAT.</p>
            </div>
            <button className="btn-primary mt-5 w-full" onClick={startRun}>
              <Play className="h-5 w-5" fill="currentColor" /> GOT IT — START RUN
            </button>
          </div>
        </div>
      )}

      {/* ======================= SHOP ======================= */}
      {screen === 'shop' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-4">
          <div className="panel max-h-[88vh] w-full max-w-xl overflow-y-auto">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-2xl font-extrabold text-amber-900">CHAOS UPGRADES</h2>
              <button className="rounded-full p-1.5 hover:bg-amber-100" onClick={() => setScreen('title')}><X className="h-6 w-6 text-amber-900" /></button>
            </div>
            <p className="mb-4 text-sm font-bold text-amber-700">🌀 Chaos Points: <span className="text-lg">{meta.chaosPoints}</span></p>
            <div className="grid gap-2.5">
              {UPGRADES.map((u) => {
                const owned = meta.upgrades[u.id] ?? 0;
                const maxed = owned >= u.tiers.length;
                const cost = maxed ? null : u.tiers[owned];
                const afford = cost !== null && meta.chaosPoints >= cost;
                const Icon = UPGRADE_ICONS[u.icon] ?? Zap;
                return (
                  <div key={u.id} className="flex items-center gap-3 rounded-xl bg-amber-50 p-3 shadow-sm">
                    <div className="rounded-lg bg-amber-200 p-2"><Icon className="h-5 w-5 text-amber-800" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-amber-950">{u.name}</span>
                        <span className="flex gap-0.5">
                          {u.tiers.map((_, i) => (
                            <span key={i} className={`h-2 w-4 rounded-full ${i < owned ? 'bg-green-500' : 'bg-amber-200'}`} />
                          ))}
                        </span>
                      </div>
                      <p className="truncate text-xs font-semibold text-amber-800/80">{u.desc}</p>
                    </div>
                    <button
                      disabled={maxed || !afford}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-extrabold shadow ${
                        maxed ? 'bg-gray-300 text-gray-500' : afford ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-amber-200 text-amber-500'
                      }`}
                      onClick={() => {
                        const next = tryPurchase(meta, u.id);
                        if (next !== meta) {
                          setMeta(next);
                          audio.ensure();
                          audio.play('buy');
                        } else {
                          audio.play('denied');
                        }
                      }}
                    >
                      {maxed ? 'MAX' : `🌀${cost}`}
                    </button>
                  </div>
                );
              })}
            </div>
            <button className="btn-primary mt-5 w-full" onClick={startRun}>
              <Play className="h-5 w-5" fill="currentColor" /> START RUN
            </button>
          </div>
        </div>
      )}

      {/* ======================= HUD ======================= */}
      {screen === 'game' && hud && !endInfo && (
        <>
          {/* chaos meter */}
          <div className="absolute left-1/2 top-3 w-[min(520px,86vw)] -translate-x-1/2">
            <div className="mb-1 flex items-end justify-between px-1">
              <span className="rounded-md px-2 py-0.5 text-xs font-extrabold tracking-widest text-white shadow" style={{ background: hud.stageColor }}>
                {hud.stageName}
              </span>
              <span className="text-xs font-extrabold text-white drop-shadow">{hud.objective}</span>
            </div>
            <div className="h-5 overflow-hidden rounded-full border-2 border-white/70 bg-black/45 shadow-lg">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{ width: `${hud.chaos}%`, background: `linear-gradient(90deg,#7ed957,${hud.stageColor})` }}
              />
            </div>
            {/* stage ticks */}
            <div className="relative mt-0.5 h-2">
              {STAGES.slice(1).map((s) => (
                <span key={s.at} className="absolute h-2 w-0.5 bg-white/60" style={{ left: `${s.at}%` }} />
              ))}
            </div>
          </div>

          {/* score + combo */}
          <div className="absolute right-4 top-3 text-right">
            <div className="text-3xl font-extrabold text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.5)]">
              {hud.score.toLocaleString()}
              {hud.scoreMult > 1 && <span className="ml-1 text-sm text-yellow-300">x{hud.scoreMult} TV</span>}
            </div>
            {hud.combo > 1 && (
              <div className="mt-0.5 flex items-center justify-end gap-1 text-orange-300">
                <Flame className="h-5 w-5" fill="currentColor" />
                <span className="text-xl font-extrabold drop-shadow">COMBO x{hud.combo}</span>
                <span className="ml-1 h-1.5 w-14 overflow-hidden rounded bg-black/40">
                  <span className="block h-full bg-orange-400" style={{ width: `${hud.comboT * 100}%` }} />
                </span>
              </div>
            )}
          </div>

          {/* event chip */}
          {evDef && EvIcon && (
            <div className="absolute left-4 top-3 flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-extrabold text-amber-200 shadow">
              <EvIcon className="h-4 w-4" /> {evDef.name}
            </div>
          )}

          {/* bottom-left: stamina + lives */}
          <div className="absolute bottom-4 left-4 space-y-2">
            <div className="flex gap-1.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <PawPrint key={i} className={`h-7 w-7 drop-shadow ${i < hud.lives ? 'text-amber-400' : 'text-white/25'}`} fill="currentColor" />
              ))}
            </div>
            <div className="w-44">
              <div className="mb-0.5 text-[10px] font-extrabold tracking-widest text-white/80">STAMINA</div>
              <div className="h-3.5 overflow-hidden rounded-full border border-white/60 bg-black/45">
                <div
                  className={`h-full rounded-full transition-[width] duration-150 ${hud.stamina < 25 ? 'bg-red-400' : 'bg-emerald-400'}`}
                  style={{ width: `${(hud.stamina / hud.staminaMax) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* status badges */}
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
            {hud.hidden && <span className="rounded-full bg-green-700/90 px-3 py-1 text-xs font-extrabold text-white shadow">🌿 HIDDEN</span>}
            {hud.charging && <span className="rounded-full bg-orange-600/90 px-3 py-1 text-xs font-extrabold text-white shadow">💨 CHARGING</span>}
            {hud.nearPond && <span className="rounded-full bg-cyan-600/90 px-3 py-1 text-xs font-extrabold text-white shadow">SPACE = SPLASH!</span>}
          </div>

          {/* controls hint (bottom right) */}
          <div className="absolute bottom-4 right-4 hidden text-right text-[11px] font-bold leading-5 text-white/70 md:block">
            WASD move · J bite · K headbutt<br />Shift charge · L hide/mud · Space splash
          </div>

          {/* event banner */}
          {banner && (
            <div className="pointer-events-none absolute left-1/2 top-[22%] -translate-x-1/2 text-center">
              <div className="banner-title">{banner.title}</div>
              <div className="banner-sub">{banner.sub}</div>
            </div>
          )}

          {/* pause button */}
          <button
            className="absolute right-4 top-16 rounded-full bg-black/40 p-2.5 text-white hover:bg-black/60"
            onClick={() => setPaused(true)}
          >
            <Pause className="h-5 w-5" />
          </button>
          <button className="absolute right-4 top-[6.5rem] rounded-full bg-black/40 p-2.5 text-white hover:bg-black/60" onClick={toggleMute}>
            {meta.muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        </>
      )}

      {/* ======================= PAUSE ======================= */}
      {screen === 'game' && paused && !endInfo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="panel w-72 text-center">
            <h2 className="mb-4 text-2xl font-extrabold text-amber-900">PAUSED</h2>
            <div className="flex flex-col gap-2.5">
              <button className="btn-primary w-full" onClick={() => setPaused(false)}>
                <Play className="h-5 w-5" fill="currentColor" /> RESUME
              </button>
              <button className="btn-secondary w-full" onClick={startRun}>
                <RotateCcw className="h-5 w-5" /> RESTART RUN
              </button>
              <button className="btn-secondary w-full" onClick={backToTitle}>
                <X className="h-5 w-5" /> QUIT TO TITLE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================= END SCREEN ======================= */}
      {screen === 'game' && endInfo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/65 p-4">
          <div className="panel w-full max-w-md text-center">
            {endInfo.result === 'win' ? (
              <>
                <div className="mb-1 text-5xl">🎉</div>
                <h2 className="text-3xl font-extrabold text-green-600">ZOO SHUT DOWN!</h2>
                <p className="mt-1 text-sm font-bold text-amber-800">The zoo is CLOSED for the day. Munch wins.</p>
              </>
            ) : (
              <>
                <div className="mb-1 text-5xl">🚔</div>
                <h2 className="text-3xl font-extrabold text-red-500">CAUGHT!</h2>
                <p className="mt-1 text-sm font-bold text-amber-800">Munch has been relocated to a calmer enclosure…</p>
              </>
            )}
            {hud && (
              <div className="mt-4 grid grid-cols-2 gap-2 text-left text-sm font-bold text-amber-950">
                <div className="stat">Score<span>{hud.score.toLocaleString()}</span></div>
                <div className="stat">Chaos<span>{Math.floor(hud.chaos)}%</span></div>
                <div className="stat">Best combo<span>x{Math.max(1, worldRef.current?.stats.bestCombo ?? 1)}</span></div>
                <div className="stat">Tourists scared<span>{worldRef.current?.stats.scared ?? 0}</span></div>
                <div className="stat">Pond plunges<span>{worldRef.current?.stats.pond ?? 0}</span></div>
                <div className="stat">Stamedes<span>{worldRef.current?.stats.stampede ?? 0}</span></div>
              </div>
            )}
            <div className="mt-4 rounded-xl bg-amber-100 py-2 text-lg font-extrabold text-amber-800">
              +🌀 {endInfo.cp} Chaos Points
            </div>
            <div className="mt-4 flex flex-col gap-2.5">
              <button className="btn-primary w-full" onClick={() => setScreen('shop')}>
                <ShoppingBag className="h-5 w-5" /> SPEND POINTS
              </button>
              <button className="btn-primary w-full" onClick={startRun}>
                <RotateCcw className="h-5 w-5" /> NEXT RUN
              </button>
              <button className="btn-secondary w-full" onClick={backToTitle}>
                <X className="h-5 w-5" /> TITLE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
