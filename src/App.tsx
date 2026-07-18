// ============================================================================
// CAPYBARA CHAOS: Zoo Shutdown — React shell.
// Hosts the fullscreen Three.js canvas + all HTML/CSS HUD overlays & screens.
// ============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Wind, Zap, Megaphone, HeartPulse, EyeOff, Volume2, VolumeX, Hammer, Waves,
  Apple, Backpack, CloudRain, Crown, Cake, Video, DoorOpen, ShoppingCart,
  PawPrint, Flame, Play, Pause, RotateCcw, Home, ShoppingBag, HelpCircle, Trophy,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { World } from './game/world';
import { LocalInput } from './game/input';
import { LocalLoopback } from './game/types';
import { GameScene } from './game/scene';
import type { UiPopup, UiNotice } from './game/scene';
import { audio } from './game/audio';
import { loadMeta, saveMeta, tryPurchase, upgradeCost } from './game/meta';
import type { MetaState } from './game/meta';
import { EVENTS, UPGRADES, STAGES, SCORE } from './game/constants';
import type { HudSnapshot, RunStats } from './game/types';

type Screen = 'title' | 'howto' | 'shop' | 'playing' | 'paused' | 'end';

interface Popup {
  id: number;
  sx: number;
  sy: number;
  text: string;
  cls: string;
}
interface Banner {
  id: number;
  title: string;
  sub: string;
  color: string;
}
interface EndData {
  result: 'win' | 'caught';
  score: number;
  cp: number;
  chaos: number;
  bestCombo: number;
  stats: RunStats;
}
interface GameCtl {
  scene: GameScene;
  input: LocalInput;
  net: LocalLoopback;
  world: World;
}

const ICONS: Record<string, LucideIcon> = {
  wind: Wind, zap: Zap, megaphone: Megaphone, 'heart-pulse': HeartPulse,
  'eye-off': EyeOff, 'volume-2': Volume2, hammer: Hammer, waves: Waves,
  apple: Apple, backpack: Backpack, 'cloud-rain': CloudRain, crown: Crown,
  cake: Cake, video: Video, 'door-open': DoorOpen, 'shopping-cart': ShoppingCart,
};

const BREAKDOWN: { key: keyof RunStats; label: string; pts: number }[] = [
  { key: 'scared', label: 'Tourists scared', pts: SCORE.scare },
  { key: 'pond', label: 'Pond plunges', pts: SCORE.pondFall },
  { key: 'icecream', label: 'Ice creams downed', pts: SCORE.iceCream },
  { key: 'stampede', label: 'Stamedes triggered', pts: SCORE.stampede },
  { key: 'selfie', label: 'Selfie sticks wrecked', pts: SCORE.selfie },
  { key: 'trash', label: 'Trash cans toppled', pts: SCORE.trash },
  { key: 'platform', label: 'Platforms emptied', pts: SCORE.platform },
  { key: 'cart', label: 'Carts toppled', pts: SCORE.cart },
  { key: 'vip', label: 'VIPs terrified', pts: SCORE.vip },
  { key: 'bowling', label: 'Tourist bowling (2+ chain)', pts: SCORE.bowling },
  { key: 'strikes', label: 'STRIKES (3+ chain)', pts: SCORE.strike },
  { key: 'photos', label: 'Photos taken of Munch', pts: SCORE.photo },
  { key: 'fires', label: 'Grass fires ignited', pts: SCORE.fire },
  { key: 'gulls', label: 'Seagull swarms summoned', pts: SCORE.gulls },
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameCtl | null>(null);

  const [screen, setScreen] = useState<Screen>('title');
  const [meta, setMeta] = useState<MetaState>(() => loadMeta());
  const [popups, setPopups] = useState<Popup[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [endData, setEndData] = useState<EndData | null>(null);
  // rare-changing HUD states (bars are updated imperatively)
  const [stageName, setStageName] = useState('PEACEFUL');
  const [stageColor, setStageColor] = useState('#7ed957');
  const [lives, setLives] = useState(3);
  const [hidden, setHidden] = useState(false);
  const [eventId, setEventId] = useState<string>('feeding');
  const [scoreMult, setScoreMult] = useState(1);

  const screenRef = useRef<Screen>('title');
  const metaRef = useRef(meta);
  const awardedRef = useRef(false);
  const bannerQueueRef = useRef<Banner[]>([]);
  const bannerActiveRef = useRef(false);
  const bannerIdRef = useRef(1);
  const popupIdRef = useRef(1);

  // imperative HUD refs
  const chaosFillRef = useRef<HTMLDivElement>(null);
  const chaosNumRef = useRef<HTMLSpanElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const objectiveRef = useRef<HTMLDivElement>(null);
  const comboWrapRef = useRef<HTMLDivElement>(null);
  const comboValRef = useRef<HTMLSpanElement>(null);
  const comboFillRef = useRef<HTMLDivElement>(null);
  const staminaFillRef = useRef<HTMLDivElement>(null);
  const splashHintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);
  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  const pumpBanners = useCallback(() => {
    if (bannerActiveRef.current) return;
    const next = bannerQueueRef.current.shift();
    if (!next) return;
    bannerActiveRef.current = true;
    setBanner(next);
    window.setTimeout(() => {
      bannerActiveRef.current = false;
      setBanner(null);
      pumpBanners();
    }, 2700);
  }, []);

  const togglePause = useCallback(() => {
    if (screenRef.current === 'playing') {
      setScreen('paused');
      audio.play('ui');
    } else if (screenRef.current === 'paused') {
      setScreen('playing');
      audio.play('ui');
    }
  }, []);
  const pauseFnRef = useRef(togglePause);
  pauseFnRef.current = togglePause;

  // ===========================================================================
  // Game boot + main loop (mounted once)
  // ===========================================================================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new GameScene(canvas);
    const input = new LocalInput();
    const net = new LocalLoopback(input);
    const world = new World();
    world.reset({ upgrades: { ...metaRef.current.upgrades }, event: 'feeding', attract: true });
    gameRef.current = { scene, input, net, world };
    input.onPause = () => pauseFnRef.current();

    let lastStage = -1;
    let lastLives = -1;
    let lastHidden = false;
    let lastEvent = '';
    let lastMult = 1;

    const onPopups = (list: UiPopup[]): void => {
      const items: Popup[] = list.map((p) => ({ ...p, id: popupIdRef.current++ }));
      setPopups((prev) => [...prev.slice(-20), ...items]);
      const ids = new Set(items.map((i) => i.id));
      window.setTimeout(() => setPopups((prev) => prev.filter((p) => !ids.has(p.id))), 1200);
    };

    const onGameOver = (result: 'win' | 'caught'): void => {
      window.setTimeout(() => {
        if (awardedRef.current) return;
        awardedRef.current = true;
        const cp = world.chaosPointsEarned();
        const m: MetaState = { ...metaRef.current, upgrades: { ...metaRef.current.upgrades } };
        m.chaosPoints += cp;
        m.runs += 1;
        if (result === 'win') m.wins += 1;
        m.bestScore = Math.max(m.bestScore, world.score);
        saveMeta(m);
        metaRef.current = m;
        setMeta(m);
        setEndData({
          result, score: world.score, cp, chaos: Math.floor(world.chaos),
          bestCombo: world.stats.bestCombo, stats: { ...world.stats },
        });
        setScreen('end');
      }, result === 'win' ? 1900 : 1400);
    };

    const onNotice = (n: UiNotice): void => {
      if (n.type === 'gameover' && n.result) {
        onGameOver(n.result);
      } else if (n.type === 'stage') {
        const idx = n.stageIndex ?? 0;
        bannerQueueRef.current.push({
          id: bannerIdRef.current++,
          title: n.title,
          sub: idx >= 3 ? 'Security is escalating — stay frosty!' : 'The zoo is getting suspicious…',
          color: STAGES[idx].color,
        });
        pumpBanners();
      } else {
        bannerQueueRef.current.push({ id: bannerIdRef.current++, title: n.title, sub: n.sub, color: '#ffd93d' });
        pumpBanners();
      }
    };

    const updateHud = (s: HudSnapshot): void => {
      if (chaosFillRef.current) {
        chaosFillRef.current.style.width = `${s.chaos}%`;
        chaosFillRef.current.style.background = s.stageColor;
      }
      if (chaosNumRef.current) chaosNumRef.current.textContent = `${Math.floor(s.chaos)}%`;
      if (scoreRef.current) scoreRef.current.textContent = String(s.score);
      if (objectiveRef.current) objectiveRef.current.textContent = s.objective;
      if (staminaFillRef.current) {
        const pct = (s.stamina / s.staminaMax) * 100;
        staminaFillRef.current.style.width = `${pct}%`;
        staminaFillRef.current.style.backgroundColor = pct > 30 ? '#7ed957' : '#ff6b6b';
      }
      if (comboWrapRef.current) {
        comboWrapRef.current.style.display = s.combo >= 2 ? 'flex' : 'none';
      }
      if (s.combo >= 2) {
        if (comboValRef.current) comboValRef.current.textContent = `x${s.combo}`;
        if (comboFillRef.current) comboFillRef.current.style.width = `${s.comboT * 100}%`;
      }
      if (splashHintRef.current) {
        splashHintRef.current.style.opacity = s.nearPond && !s.over ? '1' : '0';
      }
      if (s.stageIndex !== lastStage) {
        lastStage = s.stageIndex;
        setStageName(s.stageName);
        setStageColor(s.stageColor);
      }
      if (s.lives !== lastLives) {
        lastLives = s.lives;
        setLives(s.lives);
      }
      if (s.hidden !== lastHidden) {
        lastHidden = s.hidden;
        setHidden(s.hidden);
      }
      if (s.eventId !== lastEvent) {
        lastEvent = s.eventId;
        setEventId(s.eventId);
      }
      if (s.scoreMult !== lastMult) {
        lastMult = s.scoreMult;
        setScoreMult(s.scoreMult);
      }
    };

    const onResize = (): void => scene.resize();
    window.addEventListener('resize', onResize);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const paused = screenRef.current === 'paused';
      if (!paused && !world.over) {
        world.step(dt, net.gatherInputs());
      }
      scene.sync(world, paused ? 0 : dt);
      const { popups: pp, notices } = scene.consumeEvents(world);
      if (pp.length) onPopups(pp);
      for (const n of notices) onNotice(n);
      updateHud(world.snapshot());
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      input.dispose();
      scene.dispose();
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===========================================================================
  // Actions
  // ===========================================================================
  const startRun = (): void => {
    const g = gameRef.current;
    if (!g) return;
    audio.ensure();
    audio.setMuted(metaRef.current.muted);
    audio.startMusic();
    audio.setIntensity(0);
    const ev = EVENTS[Math.floor(Math.random() * EVENTS.length)];
    g.world.reset({ upgrades: { ...metaRef.current.upgrades }, event: ev.id, attract: false });
    g.scene.resetDynamic();
    awardedRef.current = false;
    setEndData(null);
    bannerQueueRef.current.push({ id: bannerIdRef.current++, title: ev.name, sub: ev.desc, color: '#ffd93d' });
    pumpBanners();
    setScreen('playing');
    audio.play('ui');
  };

  const toTitle = (): void => {
    const g = gameRef.current;
    if (g) {
      g.world.reset({ upgrades: { ...metaRef.current.upgrades }, event: 'feeding', attract: true });
      g.scene.resetDynamic();
    }
    audio.setIntensity(0);
    setScreen('title');
    audio.play('ui');
  };

  const toggleMute = (): void => {
    audio.ensure();
    const m = { ...metaRef.current, muted: !metaRef.current.muted };
    saveMeta(m);
    setMeta(m);
    audio.setMuted(m.muted);
    audio.play('ui');
  };

  const buy = (id: string): void => {
    audio.ensure();
    const next = tryPurchase(metaRef.current, id);
    if (next !== metaRef.current) {
      setMeta(next);
      audio.play('buy');
    } else {
      audio.play('denied');
    }
  };

  const eventDef = EVENTS.find((e) => e.id === eventId);
  const EventIcon = eventDef ? ICONS[eventDef.icon] : Apple;

  // ===========================================================================
  // Render
  // ===========================================================================
  return (
    <div className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'block', zIndex: 1 }}
      />

      {/* world-space score popups */}
      <div className="pointer-events-none fixed inset-0 z-40">
        {popups.map((p) => (
          <div key={p.id} className={`popup ${p.cls}`} style={{ left: p.sx, top: p.sy }}>
            {p.text}
          </div>
        ))}
      </div>

      {/* ======================= HUD ======================= */}
      {(screen === 'playing' || screen === 'paused') && (
        <div className="pointer-events-none fixed inset-0 z-30">
          {/* chaos meter */}
          <div className="absolute left-1/2 top-3 w-[min(560px,72vw)] -translate-x-1/2">
            <div className="mb-1 flex items-end justify-between px-1">
              <span className="text-sm font-extrabold tracking-widest text-white drop-shadow-md" style={{ color: stageColor }}>
                {stageName}
              </span>
              <span ref={chaosNumRef} className="text-lg font-extrabold text-white drop-shadow-md">0%</span>
            </div>
            <div className={`relative h-5 overflow-hidden rounded-full border-2 border-white/60 bg-black/50 ${lastChaosDanger(stageName) ? 'chaos-danger' : ''}`}>
              <div ref={chaosFillRef} className="h-full rounded-full transition-[width] duration-150" style={{ width: '0%', background: stageColor }} />
              {[20, 40, 60, 75, 90].map((t) => (
                <div key={t} className="absolute top-0 h-full w-0.5 bg-white/50" style={{ left: `${t}%` }} />
              ))}
            </div>
            <div ref={objectiveRef} className="mt-1 text-center text-sm font-bold text-white/90 drop-shadow-md" />
          </div>

          {/* score + combo */}
          <div className="absolute right-4 top-3 flex flex-col items-end gap-1">
            <div className="hud-chip flex items-center gap-2 text-2xl font-extrabold">
              <Trophy size={22} className="text-yellow-300" />
              <span ref={scoreRef}>0</span>
              {scoreMult > 1 && <span className="rounded-lg bg-red-500 px-1.5 py-0.5 text-xs font-extrabold">TV x1.5</span>}
            </div>
            <div ref={comboWrapRef} className="hud-chip hidden items-center gap-2" style={{ display: 'none' }}>
              <span className="combo-flame inline-block">
                <Flame size={22} className="text-orange-400" fill="#fb5607" />
              </span>
              <span ref={comboValRef} className="text-xl font-extrabold text-orange-300">x2</span>
              <div className="h-2 w-20 overflow-hidden rounded-full bg-black/60">
                <div ref={comboFillRef} className="h-full bg-orange-400" style={{ width: '100%' }} />
              </div>
            </div>
          </div>

          {/* lives + event + status */}
          <div className="absolute left-4 top-3 flex flex-col gap-2">
            <div className="hud-chip flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <PawPrint key={i} size={24} className={i < lives ? 'text-amber-300' : 'text-white/25'} fill={i < lives ? '#fbbf24' : 'none'} />
              ))}
            </div>
            {eventDef && (
              <div className="hud-chip flex items-center gap-2 text-xs font-bold">
                <EventIcon size={16} className="text-yellow-300" />
                {eventDef.name}
              </div>
            )}
            {hidden && (
              <div className="hud-chip flex items-center gap-2 bg-green-900/70 text-sm font-extrabold text-green-200">
                <EyeOff size={16} /> HIDDEN
              </div>
            )}
          </div>

          {/* stamina */}
          <div className="absolute bottom-5 left-1/2 w-[min(380px,60vw)] -translate-x-1/2">
            <div className="mb-1 text-center text-xs font-extrabold tracking-widest text-white/85 drop-shadow">STAMINA — HOLD SHIFT TO CHARGE</div>
            <div className="h-4 overflow-hidden rounded-full border-2 border-white/60 bg-black/50">
              <div ref={staminaFillRef} className="h-full rounded-full" style={{ width: '100%', backgroundColor: '#7ed957' }} />
            </div>
          </div>

          {/* controls hint */}
          <div className="hud-chip absolute bottom-4 left-4 text-[11px] font-bold leading-5 text-white/80">
            WASD move · J bite · K headbutt · U/E spin<br />
            SHIFT charge · L hide/roll · SPACE splash
          </div>
          <div ref={splashHintRef} className="hud-chip absolute bottom-4 right-4 text-sm font-extrabold text-cyan-200 transition-opacity" style={{ opacity: 0 }}>
            SPACE — SPLASH ATTACK!
          </div>
        </div>
      )}

      {/* event / stage banner */}
      {banner && (screen === 'playing' || screen === 'paused') && (
        <div className="pointer-events-none fixed inset-x-0 top-[18%] z-40 flex justify-center">
          <div key={banner.id} className={`${banner.color === '#ffd93d' ? 'banner-card' : 'stage-banner'} rounded-3xl border-4 px-10 py-4 text-center shadow-2xl`}
            style={{ borderColor: banner.color, background: 'rgba(20,20,20,0.82)' }}>
            <div className="text-3xl font-extrabold tracking-wide" style={{ color: banner.color }}>{banner.title}</div>
            <div className="mt-1 text-sm font-bold text-white/90">{banner.sub}</div>
          </div>
        </div>
      )}

      {/* ======================= TITLE ======================= */}
      {screen === 'title' && (
        <div className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-gradient-to-b from-black/35 via-transparent to-black/55">
          <div className="logo-wobble mb-2 text-center">
            <div className="game-title text-6xl font-extrabold text-amber-300 md:text-7xl">CAPYBARA CHAOS</div>
            <div className="game-title mt-1 text-3xl font-extrabold text-lime-300 md:text-4xl">— ZOO SHUTDOWN —</div>
          </div>
          <div className="mb-8 rounded-full bg-black/45 px-5 py-1.5 text-sm font-bold text-white/90">
            Munch the capybara has had ENOUGH. Cause chaos. Shut it down.
          </div>
          <div className="flex flex-col items-center gap-3">
            <button className="btn-chunky w-72 border-green-700 bg-green-500 text-2xl" onClick={startRun}>
              <span className="inline-flex items-center gap-2"><Play size={24} /> START RUN</span>
            </button>
            <button className="btn-chunky w-72 border-amber-700 bg-amber-500" onClick={() => { audio.ensure(); audio.play('ui'); setScreen('shop'); }}>
              <span className="inline-flex items-center gap-2"><ShoppingBag size={22} /> UPGRADES</span>
            </button>
            <button className="btn-chunky w-72 border-sky-700 bg-sky-500" onClick={() => { audio.ensure(); audio.play('ui'); setScreen('howto'); }}>
              <span className="inline-flex items-center gap-2"><HelpCircle size={22} /> HOW TO PLAY</span>
            </button>
          </div>
          <div className="mt-8 flex items-center gap-6 text-sm font-bold text-white/80">
            <span className="inline-flex items-center gap-1.5"><Trophy size={16} className="text-yellow-300" /> Best: {meta.bestScore}</span>
            <span className="inline-flex items-center gap-1.5"><Zap size={16} className="text-amber-300" /> Chaos Points: {meta.chaosPoints}</span>
            <span>Runs: {meta.runs} · Wins: {meta.wins}</span>
          </div>
        </div>
      )}

      {/* ======================= SHOP ======================= */}
      {screen === 'shop' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4">
          <div className="card-3d max-h-[92vh] w-[min(880px,94vw)] overflow-y-auto p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-3xl font-extrabold text-amber-300">CHAOS SHOP</div>
              <div className="hud-chip flex items-center gap-2 text-xl font-extrabold">
                <Zap size={20} className="text-amber-300" /> {meta.chaosPoints} CP
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {UPGRADES.map((u) => {
                const owned = meta.upgrades[u.id] ?? 0;
                const cost = upgradeCost(u.id, owned);
                const Icon = ICONS[u.icon] ?? Zap;
                const affordable = cost !== null && meta.chaosPoints >= cost;
                return (
                  <div key={u.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="rounded-xl bg-black/40 p-2.5">
                      <Icon size={26} className="text-lime-300" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-base font-extrabold text-white">{u.name}</span>
                        <span className="flex gap-0.5">
                          {u.tiers.map((_, i) => (
                            <span key={i} className={`inline-block h-2 w-4 rounded-full ${i < owned ? 'bg-lime-400' : 'bg-white/20'}`} />
                          ))}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-white/70">{u.desc}</div>
                    </div>
                    <button
                      className={`rounded-xl border-b-4 px-3 py-2 text-sm font-extrabold text-white transition active:translate-y-0.5 ${
                        cost === null
                          ? 'cursor-default border-gray-600 bg-gray-500'
                          : affordable
                            ? 'border-green-700 bg-green-500 hover:scale-105'
                            : 'border-red-800 bg-red-500/70'
                      }`}
                      onClick={() => cost !== null && buy(u.id)}
                    >
                      {cost === null ? 'MAX' : `${cost} CP`}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 flex justify-center">
              <button className="btn-chunky border-sky-700 bg-sky-500" onClick={() => { setScreen(endData ? 'end' : 'title'); audio.play('ui'); }}>
                BACK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================= HOW TO PLAY ======================= */}
      {screen === 'howto' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4">
          <div className="card-3d max-h-[92vh] w-[min(760px,94vw)] overflow-y-auto p-6 text-white">
            <div className="mb-3 text-3xl font-extrabold text-amber-300">HOW TO PLAY</div>
            <div className="mb-4 text-sm font-semibold text-white/80">
              You are <b className="text-amber-300">Munch</b>, a grumpy capybara. Fill the CHAOS METER to 100% to shut the zoo down and win.
              Get grabbed 3 times by keepers and you're caught. Between runs, spend Chaos Points on permanent upgrades.
            </div>
            <div className="mb-4 grid grid-cols-2 gap-2 text-sm font-bold">
              {[
                ['WASD / Arrows', 'Waddle around'],
                ['J or Z', 'Bite — quick scare'],
                ['K or X', 'Headbutt — big knockback (into the pond!)'],
                ['U or E', 'Spin attack — 360° launch (costs 25 stamina)'],
                ['SHIFT (hold)', 'Charge — bowl through crowds'],
                ['L or C', 'Hide in bushes / roll in mud (speed boost)'],
                ['SPACE', 'Splash (near pond) — AoE scare + soak'],
                ['ESC / P', 'Pause'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                  <span className="rounded-lg bg-black/50 px-2 py-0.5 text-xs font-extrabold text-lime-300">{k}</span>
                  <span className="text-xs text-white/85">{v}</span>
                </div>
              ))}
            </div>
            <div className="mb-2 text-lg font-extrabold text-lime-300">SCORING</div>
            <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-semibold text-white/85">
              <span>Scare a tourist <b className="float-right text-amber-300">+{SCORE.scare}</b></span>
              <span>Pond plunge <b className="float-right text-amber-300">+{SCORE.pondFall}</b></span>
              <span>Ice cream dropped <b className="float-right text-amber-300">+{SCORE.iceCream}</b></span>
              <span>Stampede (4+ fleeing) <b className="float-right text-amber-300">+{SCORE.stampede}</b></span>
              <span>Selfie stick wrecked <b className="float-right text-amber-300">+{SCORE.selfie}</b></span>
              <span>Trash can toppled <b className="float-right text-amber-300">+{SCORE.trash}</b></span>
              <span>Platform emptied <b className="float-right text-amber-300">+{SCORE.platform}</b></span>
              <span>Cigarette fire <b className="float-right text-amber-300">+{SCORE.fire}</b></span>
              <span>Seagull swarm <b className="float-right text-amber-300">+{SCORE.gulls}</b></span>
              <span>Chain actions within 4s <b className="float-right text-orange-300">COMBO x2, x3…</b></span>
            </div>
            <div className="mb-2 text-lg font-extrabold text-red-300">ESCALATION</div>
            <div className="mb-4 space-y-1 text-xs font-semibold text-white/85">
              {STAGES.map((s) => (
                <div key={s.name} className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: s.color }} />
                  <b style={{ color: s.color }}>{s.at}% {s.name}</b>
                  <span className="text-white/60">
                    {s.name === 'PEACEFUL' && '— tourists wander, feed ducks, take selfies'}
                    {s.name === 'SUSPICIOUS' && '— a keeper starts patrolling'}
                    {s.name === 'ALARMED' && '— 2 keepers, faster'}
                    {s.name === 'CODE BROWN' && '— sprinting keepers with tranq darts!'}
                    {s.name === 'FULL ALERT' && '— drone spotlight hunts you'}
                    {s.name === 'ZOO SWAT' && '— elite response. Finish it!'}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-center">
              <button className="btn-chunky border-sky-700 bg-sky-500" onClick={() => { setScreen('title'); audio.play('ui'); }}>
                GOT IT!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================= PAUSE ======================= */}
      {screen === 'paused' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/55">
          <div className="card-3d flex w-[min(420px,90vw)] flex-col items-center gap-3 p-8">
            <div className="mb-2 flex items-center gap-2 text-4xl font-extrabold text-white">
              <Pause size={34} className="text-amber-300" /> PAUSED
            </div>
            <button className="btn-chunky w-64 border-green-700 bg-green-500" onClick={togglePause}>
              <span className="inline-flex items-center gap-2"><Play size={20} /> RESUME</span>
            </button>
            <button className="btn-chunky w-64 border-amber-700 bg-amber-500" onClick={startRun}>
              <span className="inline-flex items-center gap-2"><RotateCcw size={20} /> RESTART RUN</span>
            </button>
            <button className="btn-chunky w-64 border-rose-800 bg-rose-500" onClick={toTitle}>
              <span className="inline-flex items-center gap-2"><Home size={20} /> QUIT TO MENU</span>
            </button>
          </div>
        </div>
      )}

      {/* ======================= RUN END ======================= */}
      {screen === 'end' && endData && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/45 p-4">
          <div className="card-3d max-h-[92vh] w-[min(620px,94vw)] overflow-y-auto p-6 text-center">
            {endData.result === 'win' ? (
              <>
                <div className="game-title text-5xl font-extrabold text-lime-300">ZOO SHUT DOWN!</div>
                <div className="mt-1 text-lg font-bold text-white/85">The zoo closes for the day. Munch wins. GLORIOUS.</div>
              </>
            ) : (
              <>
                <div className="game-title text-5xl font-extrabold text-red-400">CAUGHT!</div>
                <div className="mt-1 text-lg font-bold text-white/85">Munch was gently escorted back to his habitat…</div>
              </>
            )}
            <div className="mx-auto mt-4 grid max-w-md grid-cols-2 gap-x-8 gap-y-1 text-left text-sm font-semibold text-white/85">
              {BREAKDOWN.filter((b) => endData.stats[b.key] > 0).map((b) => (
                <div key={b.key} className="flex justify-between gap-2">
                  <span>{b.label}</span>
                  <b className="text-amber-300">{endData.stats[b.key]} × {b.pts}</b>
                </div>
              ))}
              <div className="flex justify-between gap-2"><span>Best combo</span><b className="text-orange-300">x{endData.bestCombo}</b></div>
              <div className="flex justify-between gap-2"><span>Chaos reached</span><b className="text-red-300">{endData.chaos}%</b></div>
            </div>
            <div className="mx-auto mt-4 flex max-w-md items-center justify-between rounded-2xl bg-black/40 px-5 py-3">
              <span className="text-lg font-extrabold text-white">SCORE</span>
              <span className="text-3xl font-extrabold text-amber-300">{endData.score}</span>
            </div>
            <div className="mx-auto mt-2 flex max-w-md items-center justify-between rounded-2xl bg-black/40 px-5 py-2.5">
              <span className="text-sm font-extrabold text-white">CHAOS POINTS EARNED</span>
              <span className="inline-flex items-center gap-1.5 text-2xl font-extrabold text-lime-300"><Zap size={20} /> +{endData.cp}</span>
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button className="btn-chunky border-green-700 bg-green-500" onClick={startRun}>
                <span className="inline-flex items-center gap-2"><RotateCcw size={20} /> RUN IT BACK</span>
              </button>
              <button className="btn-chunky border-amber-700 bg-amber-500" onClick={() => { setScreen('shop'); audio.play('ui'); }}>
                <span className="inline-flex items-center gap-2"><ShoppingBag size={20} /> SHOP</span>
              </button>
              <button className="btn-chunky border-sky-700 bg-sky-500" onClick={toTitle}>
                <span className="inline-flex items-center gap-2"><Home size={20} /> MENU</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* global mute + pause buttons */}
      <div className="fixed right-3 top-1/2 z-50 flex -translate-y-1/2 flex-col gap-2">
        <button
          className="rounded-full border-2 border-white/30 bg-black/50 p-2.5 text-white shadow-lg transition hover:scale-110"
          onClick={toggleMute}
          title={meta.muted ? 'Unmute' : 'Mute'}
        >
          {meta.muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
        {(screen === 'playing' || screen === 'paused') && (
          <button
            className="rounded-full border-2 border-white/30 bg-black/50 p-2.5 text-white shadow-lg transition hover:scale-110"
            onClick={togglePause}
            title="Pause (Esc)"
          >
            {screen === 'paused' ? <Play size={20} /> : <Pause size={20} />}
          </button>
        )}
      </div>
    </div>
  );
}

function lastChaosDanger(stageName: string): boolean {
  return stageName === 'CODE BROWN' || stageName === 'FULL ALERT' || stageName === 'ZOO SWAT';
}
