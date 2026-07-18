// ============================================================================
// World: the authoritative simulation. Pure TypeScript, no Three.js.
// Every entity is plain data keyed by numeric id; World.step(dt, inputs) is
// the single place state changes (multiplayer-ready: an authoritative server
// could run exactly this and broadcast snapshots/events).
// ============================================================================

import {
  ARENA, POND, MUD, PLATFORM, GATES, HIDING_SPOTS, TRASH_CANS, CART_SPOT,
  PLAYER, TOURIST, KEEPER, STAGES, CHAOS, SCORE, COMBO, ECONOMY, TUMBLE, PHOTO, FLEE,
} from './constants';
import type {
  PlayerState, TouristState, KeeperState, DartState, FoodState, TrashCanState,
  CartState, DroneState, GameEvent, InputState, RunConfig, RunStats, HudSnapshot,
  ItemKind,
} from './types';
import { emptyInput } from './types';

const TAU = Math.PI * 2;
const rand = (a: number, b: number): number => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const dist2 = (ax: number, az: number, bx: number, bz: number): number => {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
};
const angleLerp = (a: number, b: number, t: number): number => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * clamp(t, 0, 1);
};

export class World {
  player!: PlayerState;
  tourists = new Map<number, TouristState>();
  keepers = new Map<number, KeeperState>();
  darts = new Map<number, DartState>();
  foods = new Map<number, FoodState>();
  trashCans: TrashCanState[] = [];
  cart: CartState | null = null;
  drone: DroneState = { active: false, angle: 0, x: 0, z: 0, spotX: 0, spotZ: 0 };

  chaos = 0;
  score = 0;
  combo = 0;
  comboT = 0; // seconds left in combo window
  stageIndex = 0;
  time = 0;
  over = false;
  result: 'win' | 'caught' | null = null;
  stats!: RunStats;

  config: RunConfig = { upgrades: {}, event: 'feeding', attract: false };
  events: GameEvent[] = [];

  private nextId = 1;
  private spawnT = 0;
  private vipT = 8;
  private stampedeCd = 0;
  private platformPrimed = false;
  private platformAwarded = false;
  private gapOpen = false; // south fence gap (event or broken)
  private fenceBroken = false;
  private chargeHitT = 0;
  lastAttackTime = -999; // world time of last player attack (photogs need calm)
  private chainSeq = 0; // bowling-chain id source (one attack = one chain)
  private chargeChainId = 0; // chain id shared by all hits of one charge
  private chains = new Map<number, { n: number; t: number }>(); // chainId -> tumble count

  // ---- derived upgrade values -------------------------------------------
  private up(id: string): number {
    return this.config.upgrades[id] ?? 0;
  }
  get chargeSpeed(): number {
    return PLAYER.chargeSpeed * (1 + 0.09 * this.up('sprint'));
  }
  get headbuttForce(): number {
    return PLAYER.headbuttForce * (1 + 0.22 * this.up('headbutt'));
  }
  get scareRadius(): number {
    return TOURIST.scareRadiusBase * (1 + 0.18 * this.up('intimidate'));
  }
  get staminaRegen(): number {
    return PLAYER.staminaRegen * (1 + 0.25 * this.up('stamina'));
  }
  get memoryFactor(): number {
    return 1 / (1 + 0.3 * this.up('hiding'));
  }
  get growlRadius(): number {
    const t = this.up('growl');
    return t === 0 ? 0 : 2.5 + 1.2 * t;
  }
  get splashRadius(): number {
    return PLAYER.splashRange * (1 + 0.2 * this.up('splash'));
  }
  get scoreMult(): number {
    return this.config.event === 'tvcrew' ? 1.5 : 1;
  }
  get gateIsOpen(): boolean {
    return this.gapOpen;
  }
  get gateIsBroken(): boolean {
    return this.fenceBroken;
  }
  get slippery(): boolean {
    return this.config.event === 'rain';
  }

  // =========================================================================
  reset(config: RunConfig): void {
    this.config = config;
    this.events.length = 0;
    this.tourists.clear();
    this.keepers.clear();
    this.darts.clear();
    this.foods.clear();
    this.nextId = 1;
    this.chaos = 0;
    this.score = 0;
    this.combo = 0;
    this.comboT = 0;
    this.stageIndex = 0;
    this.time = 0;
    this.over = false;
    this.result = null;
    this.spawnT = 0;
    this.vipT = 6;
    this.stampedeCd = 0;
    this.platformPrimed = false;
    this.platformAwarded = false;
    this.gapOpen = config.event === 'gateopen';
    this.fenceBroken = false;
    this.chargeHitT = 0;
    this.lastAttackTime = -999;
    this.chainSeq = 0;
    this.chargeChainId = 0;
    this.chains.clear();
    this.stats = { scared: 0, pond: 0, icecream: 0, stampede: 0, selfie: 0, trash: 0, platform: 0, cart: 0, vip: 0, bowling: 0, strikes: 0, photos: 0, bestCombo: 0 };
    this.drone = { active: false, angle: 0, x: 0, z: 0, spotX: 0, spotZ: 0 };

    this.player = {
      id: 0, x: 6, z: -8, vx: 0, vz: 0, facing: Math.PI,
      stamina: PLAYER.staminaMax, lives: PLAYER.lives,
      charging: false, hidden: false, muddy: 0, iframes: 0, slow: 0,
      biteCd: 0, headbuttCd: 0, splashCd: 0, regenWait: 0,
      animAttack: 0, animHeadbutt: 0, animSplash: 0, animRoll: 0, squish: 0,
      dead: false,
    };

    this.trashCans = TRASH_CANS.map((t, i) => ({ id: i, x: t.x, z: t.z, toppled: false }));

    this.cart = null;
    if (config.event === 'foodcart') this.cart = { x: CART_SPOT.x, z: CART_SPOT.z, kind: 'food', toppled: false };
    if (config.event === 'birthday') this.cart = { x: CART_SPOT.x, z: CART_SPOT.z, kind: 'cake', toppled: false };

    // initial tourists
    const n = config.attract ? 9 : 7;
    for (let i = 0; i < n; i++) this.spawnTourist(true);
    if (config.event === 'vip') this.spawnTourist(true, true);
    if (config.event === 'feeding') {
      for (let i = 0; i < 6; i++) {
        const id = this.nextId++;
        this.foods.set(id, { id, x: rand(-8, 8), z: rand(-4, 8), kind: 'snack', ttl: 40 });
      }
    }
  }

  // =========================================================================
  // Main step
  // =========================================================================
  step(dt: number, inputs: Map<number, InputState>): void {
    if (this.over) return;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const input = inputs.get(0) ?? emptyInput();

    this.updatePlayer(dt, input);
    this.updateTourists(dt);
    if (!this.config.attract) {
      this.updateKeepers(dt);
      this.updateDarts(dt);
      this.updateDrone(dt);
      this.updateSpawning(dt);
    }
    this.updateFoods(dt);
    this.updateStage();

    // combo decay
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
    this.stampedeCd = Math.max(0, this.stampedeCd - dt);
    this.chargeHitT = Math.max(0, this.chargeHitT - dt);
    // retire stale bowling chains
    for (const [id, c] of this.chains) {
      if (this.time - c.t > 5) this.chains.delete(id);
    }

    // platform emptied check
    if (!this.platformAwarded) {
      let onP = 0;
      for (const t of this.tourists.values()) {
        if (t.onPlatform && t.mood !== 'flee' && t.mood !== 'gone') onP++;
      }
      if (onP >= 3) this.platformPrimed = true;
      if (this.platformPrimed && onP === 0 && !this.config.attract) {
        this.platformAwarded = true;
        this.stats.platform++;
        this.addScore(SCORE.platform, 0, 26, 'PLATFORM EMPTIED!', 'gold', CHAOS.platform);
        this.emit({ kind: 'sfx', name: 'coin' });
      }
    }
  }

  // =========================================================================
  // Player
  // =========================================================================
  private updatePlayer(dt: number, input: InputState): void {
    const p = this.player;
    if (p.dead) return;

    // timers
    p.biteCd = Math.max(0, p.biteCd - dt);
    p.headbuttCd = Math.max(0, p.headbuttCd - dt);
    p.splashCd = Math.max(0, p.splashCd - dt);
    p.iframes = Math.max(0, p.iframes - dt);
    p.slow = Math.max(0, p.slow - dt);
    p.muddy = Math.max(0, p.muddy - dt);
    p.animAttack = Math.max(0, p.animAttack - dt);
    p.animHeadbutt = Math.max(0, p.animHeadbutt - dt);
    p.animSplash = Math.max(0, p.animSplash - dt);
    p.animRoll = Math.max(0, p.animRoll - dt);
    p.squish = Math.max(0, p.squish - dt * 4);

    // --- movement ---
    let mx = input.moveX;
    let mz = input.moveZ;
    const mlen = Math.hypot(mx, mz);
    if (mlen > 1) {
      mx /= mlen;
      mz /= mlen;
    }
    const moving = mlen > 0.1;

    // charge (Shift, drains stamina)
    const wantCharge = input.charge && moving && p.stamina > 1;
    if (wantCharge && !p.charging) {
      p.charging = true;
      this.chargeChainId = ++this.chainSeq; // one charge = one bowling chain
      this.emit({ kind: 'sfx', name: 'charge' });
      this.emit({ kind: 'particles', preset: 'dash', x: p.x, z: p.z });
    }
    if (!wantCharge) p.charging = false;
    if (p.charging) {
      p.stamina -= 30 * dt;
      p.regenWait = PLAYER.regenDelay;
      if (p.stamina <= 0) {
        p.stamina = 0;
        p.charging = false;
      }
    } else {
      p.regenWait -= dt;
      if (p.regenWait <= 0) p.stamina = Math.min(PLAYER.staminaMax, p.stamina + this.staminaRegen * dt);
    }

    let speed = p.charging ? this.chargeSpeed : PLAYER.walkSpeed;
    if (p.slow > 0) speed *= PLAYER.slowFactor;
    if (p.muddy > 0) speed *= PLAYER.mudBoost;
    if (this.inPond(p.x, p.z, -0.5)) speed *= 0.85;

    const accel = PLAYER.accel * (this.slippery ? 0.55 : 1);
    const fric = PLAYER.friction * (this.slippery ? 0.35 : 1);
    p.vx += (mx * speed - p.vx) * clamp(accel * dt / Math.max(speed, 1), 0, 1);
    p.vz += (mz * speed - p.vz) * clamp(accel * dt / Math.max(speed, 1), 0, 1);
    if (!moving) {
      p.vx -= p.vx * clamp(fric * dt, 0, 1);
      p.vz -= p.vz * clamp(fric * dt, 0, 1);
    }

    p.x += p.vx * dt;
    p.z += p.vz * dt;

    // Charge Breaks Fences upgrade: smash the gate doors (checked BEFORE clamping)
    if (p.charging && this.up('fences') > 0 && !this.gapOpen) {
      if (p.vz > 4 && p.z > GATES.fenceGap.z - 2.5 && p.x > GATES.fenceGap.x0 && p.x < GATES.fenceGap.x1) {
        this.gapOpen = true;
        this.fenceBroken = true;
        this.emit({ kind: 'sfx', name: 'fence' });
        this.emit({ kind: 'particles', preset: 'wood', x: p.x, z: GATES.fenceGap.z, count: 26 });
        this.emit({ kind: 'shake', mag: 0.6 });
        this.emit({ kind: 'popup', x: p.x, z: p.z, text: 'FENCE SMASHED!', cls: 'gold' });
        this.addChaos(CHAOS.trash, p.x, p.z);
      }
    }
    this.clampPlayer(p);

    if (moving) p.facing = angleLerp(p.facing, Math.atan2(mx, mz), 12 * dt);

    // hidden state: must be inside a hiding spot and slow
    const inSpot = HIDING_SPOTS.some((s) => dist2(p.x, p.z, s.x, s.z) < s.r * s.r);
    const speedNow = Math.hypot(p.vx, p.vz);
    p.hidden = inSpot && speedNow < 2.5;

    // --- actions ---
    if (input.bite && p.biteCd <= 0) this.doBite();
    if (input.headbutt && p.headbuttCd <= 0) this.doHeadbutt();
    if (input.hide) this.doHideRoll();
    if (input.splash && p.splashCd <= 0) this.doSplash();

    // charge collisions: bowl through tourists → low fast tumble
    if (p.charging && speedNow > 7) {
      for (const t of this.tourists.values()) {
        if (t.hitCd > 0 || t.tumble > 0 || t.dazed > 0 || t.mood === 'gone' || t.mood === 'pond') continue;
        const rr = 1.6 * t.scale + 0.4;
        if (dist2(p.x, p.z, t.x, t.z) < rr * rr) {
          const ang = Math.atan2(t.x - p.x, t.z - p.z);
          const f = TUMBLE.chargeForce * rand(0.9, 1.15);
          this.scareTourist(t, 'charge');
          this.startTumble(t, Math.sin(ang) * f, Math.cos(ang) * f, rand(TUMBLE.chargeVYMin, TUMBLE.chargeVYMax), rand(TUMBLE.spinMin, TUMBLE.spinMax), this.chargeChainId);
          this.lastAttackTime = this.time;
          this.emit({ kind: 'particles', preset: 'hit', x: t.x, z: t.z });
          this.emit({ kind: 'shake', mag: 0.25 });
          p.squish = 1;
          this.chargeHitT = 0.1;
        }
      }
      this.tryToppleProps(true);
    }

    // eat snacks
    for (const f of this.foods.values()) {
      if (f.kind !== 'snack') continue;
      if (dist2(p.x, p.z, f.x, f.z) < 1.2) {
        this.foods.delete(f.id);
        p.stamina = Math.min(PLAYER.staminaMax, p.stamina + 30);
        this.emit({ kind: 'sfx', name: 'eat' });
        this.emit({ kind: 'particles', preset: 'munch', x: f.x, z: f.z });
        this.emit({ kind: 'popup', x: f.x, z: f.z, text: '+STAMINA', cls: 'stamina' });
      }
    }

    // charge dust trail
    if (p.charging && Math.random() < dt * 20) {
      this.emit({ kind: 'particles', preset: 'dust', x: p.x, z: p.z, count: 1 });
    }
  }

  private clampPlayer(p: PlayerState): void {
    const r = PLAYER.radius;
    const h = ARENA.half - r;
    const canPassGap = this.gapOpen && p.x > GATES.fenceGap.x0 + 0.4 && p.x < GATES.fenceGap.x1 - 0.4;
    p.x = clamp(p.x, -ARENA.outerHalf + r, ARENA.outerHalf - r);
    if (p.z > h) {
      if (canPassGap) {
        p.z = clamp(p.z, -h, ARENA.pathZ1 - r);
      } else {
        p.z = h;
        p.vz = Math.min(p.vz, 0);
      }
    }
    p.z = clamp(p.z, -h, ARENA.pathZ1 - r);
    // stay out of deep pond center? capybaras swim — allowed.
  }

  private doBite(): void {
    const p = this.player;
    p.biteCd = PLAYER.biteCd;
    p.animAttack = 0.22;
    p.squish = 0.8;
    this.lastAttackTime = this.time;
    this.emit({ kind: 'sfx', name: 'bite' });
    const target = this.closestTourist(p.x, p.z, PLAYER.biteRange, p.facing, PLAYER.biteArc);
    if (target) {
      p.facing = Math.atan2(target.x - p.x, target.z - p.z);
      this.scareTourist(target, 'bite');
      // bite with force: comedic hop-tumble away from Munch
      const ang = Math.atan2(target.x - p.x, target.z - p.z);
      this.startTumble(target, Math.sin(ang) * TUMBLE.biteForce, Math.cos(ang) * TUMBLE.biteForce, rand(TUMBLE.biteVYMin, TUMBLE.biteVYMax), rand(TUMBLE.spinMin, TUMBLE.spinMax) * 0.7, ++this.chainSeq);
      if (target.item === 'selfie') this.destroySelfie(target);
      this.emit({ kind: 'particles', preset: 'hit', x: target.x, z: target.z });
      this.emit({ kind: 'shake', mag: 0.15 });
    }
    // Louder Growl upgrade: AoE scare around the bite
    const gr = this.growlRadius;
    if (gr > 0) {
      this.emit({ kind: 'sfx', name: 'growl' });
      this.emit({ kind: 'particles', preset: 'growl', x: p.x, z: p.z });
      for (const t of this.tourists.values()) {
        if (t === target || t.mood === 'gone' || t.mood === 'panic' || t.mood === 'flee') continue;
        if (dist2(p.x, p.z, t.x, t.z) < gr * gr) {
          t.fear += 0.8;
          this.facePlayer(t);
        }
      }
    }
  }

  private doHeadbutt(): void {
    const p = this.player;
    p.headbuttCd = PLAYER.headbuttCd;
    p.animHeadbutt = 0.35;
    p.squish = 1;
    this.lastAttackTime = this.time;
    this.emit({ kind: 'sfx', name: 'headbutt' });
    this.emit({ kind: 'shake', mag: 0.3 });
    let hitAny = false;
    const chainId = ++this.chainSeq; // one swing = one bowling chain
    for (const t of this.tourists.values()) {
      if (t.mood === 'gone' || t.mood === 'pond') continue;
      const d2 = dist2(p.x, p.z, t.x, t.z);
      const range = PLAYER.headbuttRange * t.scale + 0.6;
      if (d2 > range * range) continue;
      const ang = Math.atan2(t.x - p.x, t.z - p.z);
      let d = ang - p.facing;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      if (Math.abs(d) > PLAYER.headbuttArc / 2) continue;
      hitAny = true;
      this.scareTourist(t, 'headbutt');
      // high-arc launch: tourists flip head over heels
      this.startTumble(t, Math.sin(ang) * this.headbuttForce, Math.cos(ang) * this.headbuttForce, rand(TUMBLE.headbuttVYMin, TUMBLE.headbuttVYMax), rand(TUMBLE.spinMin, TUMBLE.spinMax), chainId);
      if (t.item === 'selfie') this.destroySelfie(t);
      else this.dropItem(t, true);
      this.emit({ kind: 'particles', preset: 'hit', x: t.x, z: t.z });
    }
    if (hitAny) p.squish = 1.2;
    this.tryToppleProps(false);
  }

  private doHideRoll(): void {
    const p = this.player;
    const inMud = dist2(p.x, p.z, MUD.cx, MUD.cz) < MUD.r * MUD.r;
    const inSpot = HIDING_SPOTS.some((s) => dist2(p.x, p.z, s.x, s.z) < (s.r + 1) * (s.r + 1));
    p.animRoll = 0.5;
    p.squish = 1;
    if (inMud) {
      p.muddy = PLAYER.mudTime;
      this.emit({ kind: 'sfx', name: 'roll' });
      this.emit({ kind: 'particles', preset: 'mud', x: p.x, z: p.z, count: 16 });
      this.emit({ kind: 'popup', x: p.x, z: p.z, text: 'MUDD!', cls: 'info' });
    } else if (inSpot) {
      this.emit({ kind: 'sfx', name: 'hide' });
      this.emit({ kind: 'particles', preset: 'leaves', x: p.x, z: p.z, count: 12 });
      p.vx *= 0.2;
      p.vz *= 0.2;
    } else {
      // little roll forward for flavor
      p.vx += Math.sin(p.facing) * 4;
      p.vz += Math.cos(p.facing) * 4;
      this.emit({ kind: 'sfx', name: 'roll' });
      this.emit({ kind: 'particles', preset: 'dust', x: p.x, z: p.z, count: 6 });
    }
  }

  private doSplash(): void {
    const p = this.player;
    if (!this.inPond(p.x, p.z, 2.5)) return; // only near/in the pond
    p.splashCd = PLAYER.splashCd;
    p.animSplash = 0.5;
    p.squish = 1.2;
    this.lastAttackTime = this.time;
    const r = this.splashRadius;
    this.emit({ kind: 'sfx', name: 'splash' });
    this.emit({ kind: 'particles', preset: 'splash', x: p.x, z: p.z, count: 30 });
    this.emit({ kind: 'shake', mag: 0.35 });
    for (const t of this.tourists.values()) {
      if (t.mood === 'gone') continue;
      if (dist2(p.x, p.z, t.x, t.z) < r * r) {
        t.soak = 5;
        this.dropItem(t, true);
        this.scareTourist(t, 'splash');
      }
    }
  }

  private tryToppleProps(fromCharge: boolean): void {
    const p = this.player;
    const reach = fromCharge ? 1.5 : PLAYER.headbuttRange;
    for (const c of this.trashCans) {
      if (c.toppled) continue;
      if (dist2(p.x, p.z, c.x, c.z) < reach * reach) this.toppleTrashCan(c);
    }
    if (this.cart && !this.cart.toppled) {
      const cr = 2.1;
      if (dist2(p.x, p.z, this.cart.x, this.cart.z) < (reach + cr) * (reach + cr) * 0.5) this.toppleCart();
    }
  }

  private toppleTrashCan(c: TrashCanState): void {
    c.toppled = true;
    this.stats.trash++;
    this.addScore(SCORE.trash, c.x, c.z, '+TRASH CAN', 'normal', CHAOS.trash);
    this.emit({ kind: 'sfx', name: 'clatter' });
    this.emit({ kind: 'particles', preset: 'trash', x: c.x, z: c.z, count: 14 });
    this.emit({ kind: 'shake', mag: 0.2 });
    this.scareArea(c.x, c.z, 5, 0.5);
  }

  private toppleCart(): void {
    if (!this.cart || this.cart.toppled) return;
    this.cart.toppled = true;
    this.stats.cart++;
    const label = this.cart.kind === 'cake' ? 'CAKE CATASTROPHE! +40' : 'FOOD CART TOPPLED! +40';
    this.addScore(SCORE.cart, this.cart.x, this.cart.z, label, 'gold', CHAOS.cart);
    this.emit({ kind: 'sfx', name: 'clatter' });
    this.emit({ kind: 'sfx', name: 'splat' });
    this.emit({ kind: 'particles', preset: this.cart.kind === 'cake' ? 'cake' : 'food', x: this.cart.x, z: this.cart.z, count: 30 });
    this.emit({ kind: 'shake', mag: 0.5 });
    // item shower: scattered snacks & splats
    for (let i = 0; i < 7; i++) {
      const id = this.nextId++;
      const kind: 'soda' | 'icecream' | 'snack' = i % 3 === 0 ? 'soda' : i % 3 === 1 ? 'icecream' : 'snack';
      this.foods.set(id, { id, x: this.cart.x + rand(-3, 3), z: this.cart.z + rand(-3, 3), kind, ttl: 14 });
    }
    this.scareArea(this.cart.x, this.cart.z, 8, 1);
  }

  /** A tumbling body crashing into props knocks them over. */
  private tumbleProps(t: TouristState): void {
    for (const c of this.trashCans) {
      if (c.toppled) continue;
      if (dist2(t.x, t.z, c.x, c.z) < TUMBLE.propRadius * TUMBLE.propRadius) this.toppleTrashCan(c);
    }
    if (this.cart && !this.cart.toppled) {
      const cr = 2.1;
      if (dist2(t.x, t.z, this.cart.x, this.cart.z) < cr * cr) this.toppleCart();
    }
  }

  // =========================================================================
  // Scoring / chaos
  // =========================================================================
  private addScore(base: number, x: number, z: number, label: string, cls: string, chaos: number): void {
    if (this.config.attract) return;
    this.combo = Math.min(this.combo + 1, COMBO.max);
    this.comboT = COMBO.window;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, this.combo);
    const mult = Math.max(1, this.combo) * this.scoreMult;
    const pts = Math.round(base * mult);
    this.score += pts;
    const comboTag = this.combo > 1 ? ` x${this.combo}` : '';
    this.emit({ kind: 'popup', x, z, text: `${label} +${pts}${comboTag}`, cls });
    this.addChaos(chaos, x, z);
    this.emit({ kind: 'sfx', name: 'pop' });
  }

  private addChaos(amount: number, x: number, z: number): void {
    if (this.config.attract) return;
    this.chaos = clamp(this.chaos + amount, 0, CHAOS.win);
    // keepers hear it
    for (const k of this.keepers.values()) {
      if (k.mood === 'patrol' || k.mood === 'investigate') {
        if (dist2(k.x, k.z, x, z) < 32 * 32) {
          k.mood = 'investigate';
          k.tx = x + rand(-2, 2);
          k.tz = z + rand(-2, 2);
          k.t = 0;
        }
      }
    }
    if (this.chaos >= CHAOS.win && !this.over) {
      this.endRun('win');
    }
  }

  private updateStage(): void {
    let idx = 0;
    for (let i = 0; i < STAGES.length; i++) if (this.chaos >= STAGES[i].at) idx = i;
    if (idx !== this.stageIndex) {
      this.stageIndex = idx;
      const st = STAGES[idx];
      this.emit({ kind: 'stage', index: idx, name: st.name });
      this.emit({ kind: 'sfx', name: idx >= 3 ? 'alarm' : 'stageup' });
      // spawn keepers to reach stage count
      const want = st.keepers + (this.config.event === 'vip' ? 1 : 0);
      let have = this.keepers.size;
      while (have < want) {
        this.spawnKeeper(idx >= 5 && have >= 2);
        have++;
      }
      if (st.drone && !this.drone.active) {
        this.drone.active = true;
        this.emit({ kind: 'sfx', name: 'drone' });
        this.emit({ kind: 'banner', title: 'DRONE DEPLOYED', sub: 'Stay out of the spotlight!' });
      }
    }
  }

  private endRun(result: 'win' | 'caught'): void {
    if (this.over) return;
    this.over = true;
    this.result = result;
    if (result === 'caught') this.player.dead = true;
    if (result === 'win') {
      // confetti celebration around Munch
      this.emit({ kind: 'particles', preset: 'cake', x: this.player.x, z: this.player.z, count: 40 });
      this.emit({ kind: 'particles', preset: 'hearts', x: this.player.x, z: this.player.z, count: 16 });
      this.emit({ kind: 'particles', preset: 'spark', x: this.player.x, z: this.player.z, count: 24 });
      this.emit({ kind: 'shake', mag: 0.5 });
    }
    this.emit({ kind: 'gameover', result });
    this.emit({ kind: 'sfx', name: result === 'win' ? 'win' : 'lose' });
  }

  chaosPointsEarned(): number {
    return Math.round(this.score * ECONOMY.cpPerScore + this.chaos * ECONOMY.cpPerChaos + (this.result === 'win' ? ECONOMY.cpWinBonus : 0));
  }

  // =========================================================================
  // Spatial helpers
  // =========================================================================
  inPond(x: number, z: number, margin: number): boolean {
    const dx = (x - POND.cx) / (POND.rx + margin);
    const dz = (z - POND.cz) / (POND.rz + margin);
    return dx * dx + dz * dz < 1;
  }

  onPlatformRect(x: number, z: number): boolean {
    return x > PLATFORM.x0 && x < PLATFORM.x1 && z > PLATFORM.z0 && z < PLATFORM.z1;
  }

  private randomSpotInEnclosure(margin: number): { x: number; z: number } {
    for (let i = 0; i < 12; i++) {
      const x = rand(-ARENA.half + margin, ARENA.half - margin);
      const z = rand(-ARENA.half + margin, ARENA.half - margin);
      if (!this.inPond(x, z, 1.5)) return { x, z };
    }
    return { x: 0, z: 0 };
  }

  private closestTourist(x: number, z: number, range: number, facing: number, arc: number): TouristState | null {
    let best: TouristState | null = null;
    let bestD = range * range;
    for (const t of this.tourists.values()) {
      if (t.mood === 'gone' || t.mood === 'pond') continue;
      const d2 = dist2(x, z, t.x, t.z);
      if (d2 > bestD) continue;
      const ang = Math.atan2(t.x - x, t.z - z);
      let d = ang - facing;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      if (Math.abs(d) > arc / 2) continue;
      best = t;
      bestD = d2;
    }
    return best;
  }

  private facePlayer(t: TouristState): void {
    t.facing = Math.atan2(this.player.x - t.x, this.player.z - t.z);
  }

  private emit(e: GameEvent): void {
    this.events.push(e);
  }

  // =========================================================================
  // Tourists
  // =========================================================================
  private spawnTourist(scatter: boolean, vip = false): void {
    const id = this.nextId++;
    const fieldTrip = this.config.event === 'fieldtrip';
    const scale = vip ? 1.15 : fieldTrip ? rand(0.62, 0.75) : rand(0.9, 1.08);
    let x: number;
    let z: number;
    if (scatter) {
      const s = this.randomSpotInEnclosure(3);
      x = s.x;
      z = s.z;
    } else {
      x = GATES.tourist.x + rand(-2, 2);
      z = GATES.tourist.z - 1.5;
    }
    // platform cluster: some tourists head to the boardwalk; when the gate is
    // open some stroll out onto the tourist path (rampage targets!)
    const roll0 = Math.random();
    const onPlatform = !scatter && roll0 < 0.4;
    let tx = x;
    let tz = z;
    if (this.gapOpen && roll0 < 0.38) {
      tx = rand(-36, 36);
      tz = rand(ARENA.pathZ0 + 1, ARENA.pathZ1 - 1.5);
    } else if (onPlatform) {
      tx = rand(PLATFORM.x0 + 1, PLATFORM.x1 - 1);
      tz = rand(PLATFORM.z0 + 0.8, PLATFORM.z1 - 0.8);
    } else {
      const s = this.randomSpotInEnclosure(3);
      tx = s.x;
      tz = s.z;
    }
    const itemRoll = Math.random();
    const photog = !vip && Math.random() < PHOTO.chance;
    let item: ItemKind = 'none';
    if (vip) item = 'selfie';
    else if (photog) item = 'camera';
    else if (this.config.event === 'feeding' && itemRoll < 0.45) item = 'food';
    else if (itemRoll < 0.28) item = 'soda';
    else if (itemRoll < 0.45) item = 'icecream';
    else if (itemRoll < 0.6) item = 'selfie';

    const t: TouristState = {
      id, x, z, vx: 0, vz: 0, facing: rand(0, TAU),
      mood: scatter ? 'wander' : 'arrive', t: rand(0, 3), tx, tz,
      bravery: vip ? 0.85 : fieldTrip ? rand(0.05, 0.35) : rand(0.15, 0.75),
      clumsy: rand(0, 1),
      scale, vip, item, dropped: false, onPlatform: false,
      fear: 0, slip: 0, soak: 0, bob: rand(0, TAU), screamed: false,
      eyeDart: rand(0, 2), pupilX: 0, pupilY: 0,
      skin: Math.floor(rand(0, 5)), shirt: Math.floor(rand(0, 8)), pants: Math.floor(rand(0, 6)),
      hitCd: 0,
      tumble: 0, tumbleVX: 0, tumbleVZ: 0, tumbleVY: 0, tumbleY: 0,
      tumbleRot: 0, spin: 0, dazed: 0, chainId: 0,
      expression: 'calm', surprised: 0,
      photog, photoT: 0, photoCd: rand(1, 5), photoTaken: false,
      shoved: 0, fleeT: 0,
    };
    this.tourists.set(id, t);
  }

  private scareTourist(t: TouristState, cause: string): void {
    if (t.mood === 'gone' || t.mood === 'pond') return;
    if (t.tumble > 0 || t.dazed > 0) return; // already flying/dazed: can't be re-scared
    const wasCalm = t.mood !== 'panic' && t.mood !== 'flee';
    t.fear = 1;
    t.fleeT = 0;
    t.surprised = TOURIST.surprisedTime; // deer-in-headlights beat
    if (wasCalm) {
      this.stats.scared++;
      this.emit({ kind: 'popup', x: t.x, z: t.z, text: '!', cls: 'info' });
      if (t.vip) {
        this.stats.vip++;
        this.addScore(SCORE.vip, t.x, t.z, 'VIP TERRIFIED!', 'gold', CHAOS.vip);
      } else {
        this.addScore(SCORE.scare, t.x, t.z, '+SCARED', 'normal', CHAOS.scare);
      }
      this.dropItem(t, cause === 'headbutt' || cause === 'splash');
    }
    if (t.mood !== 'panic' && t.mood !== 'flee') {
      t.mood = 'panic';
      t.t = 0;
      t.screamed = false;
    }
  }

  private dropItem(t: TouristState, force: boolean): void {
    if (t.dropped || t.item === 'none' || t.item === 'food' || t.item === 'camera') return;
    const chance = TOURIST.dropChance + (this.slippery ? 0.25 : 0);
    if (!force && Math.random() > chance) return;
    t.dropped = true;
    const item = t.item;
    t.item = 'none';
    const id = this.nextId++;
    this.foods.set(id, {
      id, x: t.x + rand(-0.8, 0.8), z: t.z + rand(-0.8, 0.8),
      kind: item === 'soda' ? 'soda' : item === 'icecream' ? 'icecream' : 'snack',
      ttl: 12,
    });
    if (item === 'icecream') {
      this.stats.icecream++;
      this.addScore(SCORE.iceCream, t.x, t.z, '+ICE CREAM DOWN', 'normal', CHAOS.iceCream);
      this.emit({ kind: 'sfx', name: 'splat' });
      this.emit({ kind: 'particles', preset: 'splat', x: t.x, z: t.z });
    } else if (item === 'soda') {
      this.emit({ kind: 'sfx', name: 'drop' });
      this.emit({ kind: 'particles', preset: 'splat', x: t.x, z: t.z, count: 6 });
    }
  }

  private destroySelfie(t: TouristState): void {
    if (t.item !== 'selfie') return;
    t.item = 'none';
    t.dropped = true;
    this.stats.selfie++;
    this.addScore(SCORE.selfie, t.x, t.z, '+SELFIE STICK WRECKED', 'gold', CHAOS.selfie);
    this.emit({ kind: 'sfx', name: 'clatter' });
    this.emit({ kind: 'particles', preset: 'spark', x: t.x, z: t.z, count: 10 });
  }

  /** AoE fear around a point (topples, cart, etc). */
  private scareArea(x: number, z: number, r: number, amount: number): void {
    for (const t of this.tourists.values()) {
      if (t.mood === 'gone' || t.mood === 'panic' || t.mood === 'flee' || t.mood === 'pond') continue;
      if (dist2(x, z, t.x, t.z) < r * r) {
        if (amount >= 1) this.scareTourist(t, 'boom');
        else {
          t.fear += amount * (1 - t.bravery * 0.5);
          this.facePlayer(t);
        }
      }
    }
  }

  private updateTourists(dt: number): void {
    const p = this.player;
    const fieldTrip = this.config.event === 'fieldtrip';
    let fleeing = 0;

    for (const t of this.tourists.values()) {
      t.t += dt;
      t.hitCd = Math.max(0, t.hitCd - dt);
      t.soak = Math.max(0, t.soak - dt);
      t.bob += dt * (Math.hypot(t.vx, t.vz) > 3 ? 11 : 7);
      // pupils dart around
      t.eyeDart -= dt;
      if (t.eyeDart <= 0) {
        t.eyeDart = t.mood === 'panic' || t.mood === 'flee' ? rand(0.08, 0.2) : rand(0.5, 1.6);
        t.pupilX = rand(-1, 1);
        t.pupilY = rand(-0.6, 0.6);
      }

      // ---- expression + freeze timers ----
      t.surprised = Math.max(0, t.surprised - dt);
      t.shoved = Math.max(0, t.shoved - dt);
      t.photoCd = Math.max(0, t.photoCd - dt);
      if (t.mood === 'panic' || t.mood === 'flee') t.fleeT += dt;
      else t.fleeT = 0;
      if (t.mood === 'panic' || t.mood === 'flee' || t.mood === 'pond') {
        t.expression = t.surprised > 0 ? 'surprised' : 'panic';
      } else {
        t.expression = t.surprised > 0 ? 'surprised' : 'calm';
      }

      // ---- dazed: lying on the ground seeing stars, then gets up and flees ----
      if (t.dazed > 0) {
        t.dazed -= dt;
        t.vx = 0;
        t.vz = 0;
        if (Math.random() < dt * 2.5) {
          this.emit({ kind: 'particles', preset: 'stars', x: t.x, z: t.z, count: 1 });
        }
        if (t.dazed <= 0) {
          t.dazed = 0;
          t.mood = 'flee';
          t.t = 0;
        }
        t.onPlatform = this.onPlatformRect(t.x, t.z);
        continue;
      }

      // ---- tumbling: ballistic flight, bounces, skid, chain reactions ----
      if (t.tumble > 0) {
        this.updateTumble(t, dt);
        continue;
      }

      if (t.slip > 0) {
        t.slip -= dt;
        t.vx *= 1 - clamp(4 * dt, 0, 1);
        t.vz *= 1 - clamp(4 * dt, 0, 1);
        t.x += t.vx * dt;
        t.z += t.vz * dt;
        continue;
      }

      const panicSpeed = TOURIST.fleeSpeed * (fieldTrip ? 1.3 : 1) * (this.slippery ? 1.05 : 1);
      const walkSpeed = TOURIST.walkSpeed * (fieldTrip ? 1.35 : 1) * (t.vip ? 0.8 : 1);
      let desiredX = 0;
      let desiredZ = 0;
      let desiredSpeed = 0;

      // photo tourists: Munch looks calm → sneak over for a picture
      if (
        t.photog && t.photoCd <= 0 && !p.dead &&
        (t.mood === 'wander' || t.mood === 'gawk' || t.mood === 'arrive' || t.mood === 'feed') &&
        !p.charging && this.time - this.lastAttackTime > PHOTO.calmTime &&
        dist2(t.x, t.z, p.x, p.z) < PHOTO.range * PHOTO.range
      ) {
        t.mood = 'photo';
        t.t = 0;
        t.photoT = 0;
        t.photoTaken = false;
      }

      switch (t.mood) {
        case 'arrive': {
          desiredSpeed = walkSpeed;
          desiredX = t.tx - t.x;
          desiredZ = t.tz - t.z;
          if (dist2(t.x, t.z, t.tx, t.tz) < 2 || t.t > 12) {
            t.mood = 'wander';
            t.t = 0;
          }
          break;
        }
        case 'wander': {
          desiredSpeed = walkSpeed;
          desiredX = t.tx - t.x;
          desiredZ = t.tz - t.z;
          if (dist2(t.x, t.z, t.tx, t.tz) < 2.5 || t.t > 14) {
            // choose next behavior
            const nearPlayer = dist2(t.x, t.z, p.x, p.z) < 100;
            const roll = Math.random();
            t.t = 0;
            if (nearPlayer && roll < 0.4) {
              t.mood = 'gawk';
            } else if ((t.item === 'food' || this.config.event === 'feeding') && roll < 0.62) {
              t.mood = 'feed';
            } else {
              const s = Math.random() < 0.22
                ? { x: rand(PLATFORM.x0 + 1, PLATFORM.x1 - 1), z: rand(PLATFORM.z0 + 0.8, PLATFORM.z1 - 0.8) }
                : this.randomSpotInEnclosure(3);
              t.tx = s.x;
              t.tz = s.z;
            }
          }
          break;
        }
        case 'gawk': {
          desiredSpeed = 0;
          this.facePlayer(t);
          if (t.item === 'selfie' && Math.random() < dt * 0.7) {
            this.emit({ kind: 'sfx', name: 'selfie' });
            this.emit({ kind: 'particles', preset: 'flash', x: t.x, z: t.z, count: 3 });
          }
          if (dist2(t.x, t.z, p.x, p.z) > 144 || t.t > rand(4, 7)) {
            t.mood = 'wander';
            t.t = 0;
          }
          break;
        }
        case 'feed': {
          desiredSpeed = 0;
          if (t.t > 1.2 && t.item === 'food') {
            // toss a snack toward the capybara (risk/reward stamina)
            t.item = 'none';
            t.dropped = true;
            const id = this.nextId++;
            const ang = Math.atan2(p.x - t.x, p.z - t.z) + rand(-0.5, 0.5);
            const d = rand(1.5, 3.5);
            this.foods.set(id, {
              id,
              x: clamp(t.x + Math.sin(ang) * d, -ARENA.half + 1, ARENA.half - 1),
              z: clamp(t.z + Math.cos(ang) * d, -ARENA.half + 1, ARENA.half - 1),
              kind: 'snack', ttl: 15,
            });
            this.emit({ kind: 'particles', preset: 'toss', x: t.x, z: t.z, count: 4 });
          }
          if (t.t > 3.2) {
            t.mood = 'wander';
            t.t = 0;
          }
          break;
        }
        case 'suspicious': {
          desiredSpeed = walkSpeed * 0.5;
          this.facePlayer(t);
          if (t.t > 3) {
            t.mood = 'wander';
            t.t = 0;
          }
          break;
        }
        case 'photo': {
          // approach Munch for a picture; abort if he turns violent
          this.facePlayer(t);
          const d2p = dist2(t.x, t.z, p.x, p.z);
          if (p.dead || this.time - this.lastAttackTime < PHOTO.abortTime) {
            // Munch just attacked someone nearby — spook and run
            t.mood = 'wander';
            t.t = 0;
            t.photoCd = rand(PHOTO.cdMin, PHOTO.cdMax);
            t.fear += 0.9;
            this.facePlayer(t);
            break;
          }
          if (p.charging && d2p < 81) {
            t.mood = 'wander';
            t.t = 0;
            t.photoCd = rand(3, 6);
            t.fear += 0.4;
            break;
          }
          const stop = PHOTO.stopMin + ((t.id * 37) % 10) * (PHOTO.stopVar / 10);
          if (d2p > stop * stop) {
            desiredSpeed = walkSpeed * 1.2;
            desiredX = p.x - t.x;
            desiredZ = p.z - t.z;
            t.photoT = 0;
            if (t.t > 10) {
              // lost interest (Munch moved too far away)
              t.mood = 'wander';
              t.t = 0;
              t.photoCd = rand(5, 9);
            }
          } else {
            // in position: raise the camera, wait a beat, SNAP
            desiredSpeed = 0;
            t.photoT += dt;
            if (!t.photoTaken && t.photoT >= PHOTO.aimTime) {
              t.photoTaken = true;
              this.stats.photos++;
              this.addScore(SCORE.photo, t.x, t.z, '📸', 'info', CHAOS.photo);
              this.emit({ kind: 'sfx', name: 'shutter' });
              this.emit({ kind: 'particles', preset: 'flash', x: t.x, z: t.z, count: 6 });
            }
            if (t.photoT >= PHOTO.aimTime + PHOTO.linger) {
              t.mood = 'wander';
              t.t = 0;
              t.photoCd = rand(PHOTO.cdMin, PHOTO.cdMax);
              this.emit({ kind: 'particles', preset: 'hearts', x: t.x, z: t.z, count: 2 });
            }
          }
          break;
        }
        case 'panic': {
          // run away from player in blind panic
          if (!t.screamed) {
            t.screamed = true;
            this.emit({ kind: 'sfx', name: 'scream', x: t.x, z: t.z });
            this.emit({ kind: 'particles', preset: 'panic', x: t.x, z: t.z, count: 3 });
          }
          const dir = this.fleeDirection(t);
          desiredX = dir.x;
          desiredZ = dir.z;
          desiredSpeed = panicSpeed;
          if (t.t > rand(1.2, 2.2)) {
            t.mood = 'flee';
            t.t = 0;
          }
          break;
        }
        case 'flee': {
          fleeing++;
          // run directly away from Munch first, then blend toward the gate
          const dir = this.fleeDirection(t);
          desiredX = dir.x;
          desiredZ = dir.z;
          desiredSpeed = panicSpeed;
          // slipping
          const slipChance = (TOURIST.slipBase + t.clumsy * 0.12 + (this.slippery ? 0.12 : 0)) * dt;
          if (Math.random() < slipChance && Math.hypot(t.vx, t.vz) > 3) {
            t.slip = 0.8;
            this.emit({ kind: 'sfx', name: 'slip' });
            this.emit({ kind: 'particles', preset: 'dust', x: t.x, z: t.z, count: 5 });
            this.dropItem(t, true);
          }
          if (dist2(t.x, t.z, GATES.tourist.x, GATES.tourist.z) < 4) {
            t.mood = 'gone';
          }
          break;
        }
        case 'pond': {
          // splashing in the pond, then climbs out and flees
          desiredSpeed = 0;
          if (Math.random() < dt * 6) {
            this.emit({ kind: 'particles', preset: 'splash', x: t.x + rand(-0.5, 0.5), z: t.z + rand(-0.5, 0.5), count: 3 });
          }
          if (t.t > 1.4) {
            t.mood = 'flee';
            t.t = 0;
            // climb out toward gate
            const ang = Math.atan2(GATES.tourist.x - t.x, GATES.tourist.z - t.z);
            t.x += Math.sin(ang) * 2;
            t.z += Math.cos(ang) * 2;
          }
          break;
        }
        case 'gone':
          break;
      }

      // deer-in-headlights: barely move during the surprise beat
      if (t.surprised > 0) desiredSpeed *= TOURIST.surprisedSpeed;

      // --- steering / integration ---
      const dl = Math.hypot(desiredX, desiredZ);
      if (dl > 0.01 && desiredSpeed > 0) {
        desiredX /= dl;
        desiredZ /= dl;
        const accel = 10 * (this.slippery ? 0.5 : 1);
        t.vx += (desiredX * desiredSpeed - t.vx) * clamp(accel * dt / Math.max(desiredSpeed, 1), 0, 1);
        t.vz += (desiredZ * desiredSpeed - t.vz) * clamp(accel * dt / Math.max(desiredSpeed, 1), 0, 1);
        t.facing = angleLerp(t.facing, Math.atan2(t.vx, t.vz), 8 * dt);
      } else {
        const fric = 6 * (this.slippery ? 0.3 : 1);
        t.vx -= t.vx * clamp(fric * dt, 0, 1);
        t.vz -= t.vz * clamp(fric * dt, 0, 1);
      }

      t.x += t.vx * dt;
      t.z += t.vz * dt;

      // fell in the pond?
      if (t.mood !== 'pond' && t.mood !== 'gone' && this.inPond(t.x, t.z, -0.8)) {
        this.pondPlunge(t);
      }

      // bounds: tourists stay inside enclosure; fleeing ones exit through gate;
      // when the gate is open, tourists may stroll on the outer path strip
      const h = ARENA.half - 0.6;
      if (t.mood === 'flee' || t.mood === 'gone' || t.tz > 30) {
        if (t.z > ARENA.pathZ0 - 0.5) {
          // on the outer path: free strip movement
          t.x = clamp(t.x, -40, 40);
          t.z = clamp(t.z, h, ARENA.pathZ1 - 1);
        } else if (t.z > h && (t.x < GATES.fenceGap.x0 || t.x > GATES.fenceGap.x1)) {
          t.z = h; // fence blocks outside the gate mouth
        }
      } else {
        t.x = clamp(t.x, -h, h);
        t.z = clamp(t.z, -h, h);
        // wander tourists avoid the pond
        if (t.mood !== 'panic' && this.inPond(t.x, t.z, 0.5)) {
          const ang = Math.atan2(t.x - POND.cx, t.z - POND.cz);
          t.x += Math.sin(ang) * 3 * dt * 10;
          t.z += Math.cos(ang) * 3 * dt * 10;
        }
      }

      // platform flag
      t.onPlatform = this.onPlatformRect(t.x, t.z);

      // --- fear accumulation ---
      if (t.mood !== 'panic' && t.mood !== 'flee' && t.mood !== 'pond' && t.mood !== 'gone') {
        // intimidation aura
        const sr = this.scareRadius * t.scale + 0.8;
        if (!this.config.attract && dist2(t.x, t.z, p.x, p.z) < sr * sr) {
          t.fear += dt * 0.55 * (1 - t.bravery * 0.6) * (p.charging ? 2.2 : 1);
        }
        // chain panic: nearby panicking tourists are contagious
        for (const o of this.tourists.values()) {
          if (o === t) continue;
          if ((o.mood === 'panic' || o.mood === 'flee') && dist2(t.x, t.z, o.x, o.z) < TOURIST.panicSpreadRadius * TOURIST.panicSpreadRadius) {
            t.fear += dt * 1.1 * (1 - t.bravery * 0.5);
            break;
          }
        }
        t.fear = Math.max(0, t.fear - dt * 0.06); // slow cool down
        const threshold = 1 - t.bravery * 0.45;
        if (t.fear >= threshold) {
          this.scareTourist(t, 'fear');
        } else if (t.fear > threshold * 0.5 && t.mood !== 'suspicious' && t.mood !== 'gawk') {
          t.mood = 'suspicious';
          t.t = 0;
        }
      }

      // bump into others while panicking -> chain fear + a gentle shove (pileups!)
      if (t.mood === 'panic' || t.mood === 'flee') {
        for (const o of this.tourists.values()) {
          if (o === t || o.mood === 'panic' || o.mood === 'flee' || o.mood === 'gone' || o.mood === 'pond') continue;
          if (o.tumble > 0 || o.dazed > 0) continue;
          if (dist2(t.x, t.z, o.x, o.z) < 1.1) {
            o.fear += 0.65;
            if (o.shoved <= 0) {
              o.shoved = FLEE.shoveCd;
              const a = Math.atan2(o.x - t.x, o.z - t.z);
              o.vx += Math.sin(a) * FLEE.shoveForce;
              o.vz += Math.cos(a) * FLEE.shoveForce;
            }
          }
        }
      }
    }

    // despawn gone tourists
    for (const t of [...this.tourists.values()]) {
      if (t.mood === 'gone') this.tourists.delete(t.id);
    }

    // stampede detection
    if (fleeing >= 4 && this.stampedeCd <= 0 && !this.config.attract) {
      this.stampedeCd = 10;
      this.stats.stampede++;
      this.addScore(SCORE.stampede, p.x, p.z, 'STAMPEDE!!', 'gold', CHAOS.stampede);
      this.emit({ kind: 'sfx', name: 'stampede' });
      this.emit({ kind: 'shake', mag: 0.55 });
    }
  }

  // =========================================================================
  // Tumble physics: launch → ballistic flip → bounce → skid → dazed → flee
  // =========================================================================
  private startTumble(t: TouristState, vx: number, vz: number, vy: number, spin: number, chainId: number): void {
    const relaunch = t.tumble > 0 || t.dazed > 0; // juggled again: keep old chain
    t.tumble = TUMBLE.maxTime;
    t.tumbleVX = vx;
    t.tumbleVZ = vz;
    t.tumbleVY = vy;
    t.tumbleY = Math.max(t.tumbleY, 0);
    t.tumbleRot = relaunch ? t.tumbleRot : 0;
    t.spin = spin * (Math.random() < 0.5 ? -1 : 1);
    t.dazed = 0;
    t.slip = 0;
    t.vx = vx;
    t.vz = vz;
    t.hitCd = Math.max(t.hitCd, TUMBLE.hitCd);
    if (!relaunch) {
      t.chainId = chainId;
      this.registerChainTumble(chainId, t);
    }
    this.emit({ kind: 'shake', mag: 0.12 });
  }

  /** Bowling scoring: count tumbles per attack chain, award at 2 and 3. */
  private registerChainTumble(chainId: number, t: TouristState): void {
    if (chainId <= 0 || this.config.attract) return;
    const c = this.chains.get(chainId) ?? { n: 0, t: this.time };
    c.n++;
    c.t = this.time;
    this.chains.set(chainId, c);
    if (c.n === 2) {
      this.stats.bowling++;
      this.addScore(SCORE.bowling, t.x, t.z, 'TOURIST BOWLING', 'gold', CHAOS.bowling);
      this.emit({ kind: 'shake', mag: 0.3 });
    } else if (c.n === 3) {
      this.stats.strikes++;
      this.addScore(SCORE.strike, t.x, t.z, 'STRIKE!!', 'gold', CHAOS.strike);
      this.emit({ kind: 'sfx', name: 'coin' });
      this.emit({ kind: 'shake', mag: 0.5 });
    }
  }

  private updateTumble(t: TouristState, dt: number): void {
    t.tumble -= dt;
    // ballistic flight
    t.tumbleVY -= TUMBLE.gravity * dt;
    t.tumbleY += t.tumbleVY * dt;
    if (t.tumbleY > TUMBLE.maxY) {
      // ceiling: relaunches can juggle, never orbit
      t.tumbleY = TUMBLE.maxY;
      t.tumbleVY = Math.min(t.tumbleVY, 0);
    }
    t.tumbleRot += t.spin * dt;
    if (t.tumbleY <= 0 && t.tumbleVY < 0) {
      t.tumbleY = 0;
      if (t.tumbleVY < -TUMBLE.minBounceVY) {
        // boing! bounce with energy loss
        t.tumbleVY = -t.tumbleVY * TUMBLE.restitution;
        t.tumbleVX *= TUMBLE.bounceFric;
        t.tumbleVZ *= TUMBLE.bounceFric;
        t.spin *= 0.55;
        this.emit({ kind: 'sfx', name: 'boing', x: t.x, z: t.z });
        this.emit({ kind: 'particles', preset: 'dust', x: t.x, z: t.z, count: 5 });
      } else {
        // final touchdown → skid flat on their back
        t.tumbleVY = 0;
        t.spin = 0;
        t.tumbleRot = -Math.PI / 2 * 0.92;
        this.emit({ kind: 'particles', preset: 'dust', x: t.x, z: t.z, count: 6 });
      }
    }
    const grounded = t.tumbleY <= 0 && t.tumbleVY === 0;
    if (grounded) {
      const f = clamp(TUMBLE.skidFric * dt, 0, 1);
      t.tumbleVX -= t.tumbleVX * f;
      t.tumbleVZ -= t.tumbleVZ * f;
      if (Math.hypot(t.tumbleVX, t.tumbleVZ) > 2 && Math.random() < dt * 14) {
        this.emit({ kind: 'particles', preset: 'dust', x: t.x, z: t.z, count: 2 });
      }
    }
    t.x += t.tumbleVX * dt;
    t.z += t.tumbleVZ * dt;
    t.vx = t.tumbleVX;
    t.vz = t.tumbleVZ;
    const speed = Math.hypot(t.tumbleVX, t.tumbleVZ);
    if (speed > 0.6) t.facing = Math.atan2(t.tumbleVX, t.tumbleVZ);

    // splash! tumbled straight into the pond
    if (this.inPond(t.x, t.z, -0.8)) {
      this.pondPlunge(t);
      return;
    }
    // crash into props
    this.tumbleProps(t);
    // bowling-pin chain reaction: knock bystanders into tumbles of their own
    if (speed > 2 && t.tumbleY < 1.2) {
      for (const o of this.tourists.values()) {
        if (o === t || o.tumble > 0 || o.dazed > 0 || o.hitCd > 0) continue;
        if (o.mood === 'gone' || o.mood === 'pond') continue;
        const rr = TUMBLE.chainRadius * (0.6 + o.scale * 0.5);
        if (dist2(t.x, t.z, o.x, o.z) < rr * rr) {
          const a = Math.atan2(o.x - t.x, o.z - t.z);
          const sp = Math.max(speed * TUMBLE.chainFactor, TUMBLE.chainMinSpeed);
          this.scareTourist(o, 'chain');
          this.startTumble(o, Math.sin(a) * sp, Math.cos(a) * sp, rand(TUMBLE.chainVYMin, TUMBLE.chainVYMax), rand(TUMBLE.spinMin, TUMBLE.spinMax), t.chainId);
          t.tumbleVX *= 0.7;
          t.tumbleVZ *= 0.7;
          this.emit({ kind: 'particles', preset: 'hit', x: o.x, z: o.z });
          this.emit({ kind: 'sfx', name: 'boing', x: o.x, z: o.z });
        }
      }
    }
    // bounds: fence stops the slide unless they fly through the gate mouth
    const h = ARENA.half - 0.6;
    const inGapX = t.x > GATES.fenceGap.x0 && t.x < GATES.fenceGap.x1;
    const onPath = t.z > h && (inGapX || this.gapOpen);
    t.x = clamp(t.x, onPath ? -40 : -h, onPath ? 40 : h);
    if (t.z > h && !onPath) t.z = h;
    t.z = clamp(t.z, -h, ARENA.pathZ1 - 1);
    t.onPlatform = this.onPlatformRect(t.x, t.z);

    // skid ran out of steam → dazed on the ground
    if (grounded && Math.hypot(t.tumbleVX, t.tumbleVZ) < TUMBLE.skidStop) {
      t.tumble = 0;
      t.tumbleVX = 0;
      t.tumbleVZ = 0;
      t.vx = 0;
      t.vz = 0;
      t.dazed = rand(TUMBLE.dazeMin, TUMBLE.dazeMax);
      this.emit({ kind: 'particles', preset: 'stars', x: t.x, z: t.z, count: 5 });
      this.emit({ kind: 'sfx', name: 'tweet', x: t.x, z: t.z });
      return;
    }
    // safety: never tumble forever
    if (t.tumble <= 0) {
      t.tumble = 0;
      t.tumbleY = 0;
      t.tumbleVY = 0;
      t.spin = 0;
      t.tumbleRot = -Math.PI / 2 * 0.92;
      t.dazed = rand(TUMBLE.dazeMin, TUMBLE.dazeMax);
    }
  }

  /** Tourist falls in the pond (walked, slipped or tumbled in). */
  private pondPlunge(t: TouristState): void {
    t.mood = 'pond';
    t.t = 0;
    t.soak = 8;
    t.vx = 0;
    t.vz = 0;
    t.tumble = 0;
    t.tumbleVX = 0;
    t.tumbleVZ = 0;
    t.tumbleVY = 0;
    t.tumbleY = 0;
    t.spin = 0;
    t.tumbleRot = 0;
    t.dazed = 0;
    this.stats.pond++;
    this.addScore(SCORE.pondFall, t.x, t.z, '+POND PLUNGE', 'gold', CHAOS.pondFall);
    this.emit({ kind: 'sfx', name: 'plop' });
    this.emit({ kind: 'particles', preset: 'splash', x: t.x, z: t.z, count: 18 });
    this.emit({ kind: 'shake', mag: 0.2 });
  }

  /**
   * Flee steering: for the first FLEE.repelTime seconds run on a pure
   * repulsion vector directly away from the player (with per-tourist jitter),
   * then blend toward the tourist gate over FLEE.blendTime seconds.
   */
  private fleeDirection(t: TouristState): { x: number; z: number } {
    const p = this.player;
    const w = clamp((t.fleeT - FLEE.repelTime) / FLEE.blendTime, 0, 1);
    const jitter = Math.sin(t.id * 2.3) * 0.35;
    const awayA = Math.atan2(t.x - p.x, t.z - p.z) + jitter + Math.sin(t.t * 7 + t.id) * 0.3 * (1 - w);
    let dx = Math.sin(awayA) * (1 - w);
    let dz = Math.cos(awayA) * (1 - w);
    const gx = GATES.tourist.x - t.x;
    const gz = GATES.tourist.z - t.z;
    const gl = Math.hypot(gx, gz) || 1;
    dx += (gx / gl) * w;
    dz += (gz / gl) * w;
    const l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  }

  // =========================================================================
  // Keepers
  // =========================================================================
  private spawnKeeper(elite: boolean): void {
    const id = this.nextId++;
    const k: KeeperState = {
      id,
      x: GATES.keeper.x + 1.5,
      z: GATES.keeper.z + rand(-4, 4),
      vx: 0, vz: 0, facing: Math.PI / 2,
      mood: 'patrol', t: 0,
      tx: rand(-15, 15), tz: rand(-15, 15),
      elite, memory: 0, dartCd: rand(1, 3), bob: rand(0, TAU),
    };
    this.keepers.set(id, k);
    this.emit({ kind: 'sfx', name: 'alarm' });
  }

  private updateKeepers(dt: number): void {
    const p = this.player;
    const st = STAGES[this.stageIndex];
    const sight = KEEPER.sightRadius * (this.config.event === 'tvcrew' ? 1.45 : 1);
    const spotlightBoost = this.drone.active && dist2(p.x, p.z, this.drone.spotX, this.drone.spotZ) < 7 && !p.hidden;

    for (const k of this.keepers.values()) {
      k.t += dt;
      k.dartCd = Math.max(0, k.dartCd - dt);
      k.bob += dt * 9;

      const dToP = Math.hypot(p.x - k.x, p.z - k.z);
      let canSee = false;
      if (!p.dead) {
        if (p.hidden) canSee = dToP < KEEPER.sightHiddenRadius;
        else canSee = dToP < sight || spotlightBoost === true;
      }

      if (k.mood === 'stunned') {
        if (k.t > KEEPER.stunTime) {
          k.mood = 'patrol';
          k.t = 0;
          const s = this.randomSpotInEnclosure(4);
          k.tx = s.x;
          k.tz = s.z;
        }
        k.vx = 0;
        k.vz = 0;
        continue;
      }

      if (canSee) {
        if (k.mood !== 'chase' && k.mood !== 'aim') {
          k.mood = 'chase';
          k.t = 0;
        }
        k.memory = KEEPER.memoryTime * this.memoryFactor;
      } else if (k.mood === 'chase' || k.mood === 'aim') {
        k.memory -= dt;
        if (k.memory <= 0) {
          k.mood = 'investigate';
          k.tx = p.x + rand(-2, 2);
          k.tz = p.z + rand(-2, 2);
          k.t = 0;
        }
      }

      let speed = 0;
      let tx = k.tx;
      let tz = k.tz;

      switch (k.mood) {
        case 'patrol': {
          speed = KEEPER.walkSpeed;
          if (dist2(k.x, k.z, k.tx, k.tz) < 3 || k.t > 10) {
            const s = this.randomSpotInEnclosure(4);
            k.tx = s.x;
            k.tz = s.z;
            k.t = 0;
          }
          break;
        }
        case 'investigate': {
          speed = Math.max(KEEPER.walkSpeed, st.keeperSpeed * 0.8);
          if (dist2(k.x, k.z, k.tx, k.tz) < 2.5 || k.t > 8) {
            k.mood = 'patrol';
            k.t = 0;
            const s = this.randomSpotInEnclosure(4);
            k.tx = s.x;
            k.tz = s.z;
          }
          break;
        }
        case 'chase': {
          speed = Math.max(k.elite ? KEEPER.eliteSpeed : st.keeperSpeed, KEEPER.chaseSpeed);
          if (spotlightBoost) speed *= 1.25;
          tx = p.x;
          tz = p.z;
          // tranq darts at high chaos
          if (st.darts && k.dartCd <= 0 && dToP > KEEPER.dartRangeMin && dToP < KEEPER.dartRangeMax) {
            k.mood = 'aim';
            k.t = 0;
          }
          // grab attempt
          if (dToP < KEEPER.grabRadius && p.iframes <= 0 && !p.dead) {
            this.grabAttempt(k);
          }
          break;
        }
        case 'aim': {
          speed = 0;
          k.facing = Math.atan2(p.x - k.x, p.z - k.z);
          if (k.t >= KEEPER.dartAimTime) {
            k.mood = 'chase';
            k.t = 0;
            k.dartCd = KEEPER.dartCd;
            this.fireDart(k);
          }
          break;
        }
      }

      // integrate
      if (speed > 0) {
        const dx = tx - k.x;
        const dz = tz - k.z;
        const dl = Math.hypot(dx, dz);
        if (dl > 0.05) {
          const accel = 12;
          k.vx += ((dx / dl) * speed - k.vx) * clamp(accel * dt / Math.max(speed, 1), 0, 1);
          k.vz += ((dz / dl) * speed - k.vz) * clamp(accel * dt / Math.max(speed, 1), 0, 1);
          k.facing = angleLerp(k.facing, Math.atan2(k.vx, k.vz), 10 * dt);
        }
      } else {
        k.vx -= k.vx * clamp(8 * dt, 0, 1);
        k.vz -= k.vz * clamp(8 * dt, 0, 1);
      }
      k.x += k.vx * dt;
      k.z += k.vz * dt;

      // professionals avoid the pond
      if (this.inPond(k.x, k.z, 1)) {
        const ang = Math.atan2(k.x - POND.cx, k.z - POND.cz);
        k.x += Math.sin(ang) * 4 * dt;
        k.z += Math.cos(ang) * 4 * dt;
      }
      const h = ARENA.half - 0.6;
      k.x = clamp(k.x, -h, h);
      k.z = clamp(k.z, -h, h);
    }
  }

  private grabAttempt(k: KeeperState): void {
    const p = this.player;
    p.lives--;
    this.emit({ kind: 'shake', mag: 0.8 });
    if (p.lives <= 0) {
      this.emit({ kind: 'sfx', name: 'grab' });
      this.endRun('caught');
      return;
    }
    // wriggle free!
    p.iframes = PLAYER.iframesTime;
    p.squish = 1.5;
    const away = Math.atan2(p.x - k.x, p.z - k.z);
    p.vx += Math.sin(away) * 12;
    p.vz += Math.cos(away) * 12;
    this.emit({ kind: 'sfx', name: 'wriggle' });
    this.emit({ kind: 'particles', preset: 'stars', x: p.x, z: p.z, count: 12 });
    this.emit({ kind: 'popup', x: p.x, z: p.z, text: 'WRIGGLED FREE!', cls: 'info' });
    for (const o of this.keepers.values()) {
      if (dist2(o.x, o.z, p.x, p.z) < 25) {
        o.mood = 'stunned';
        o.t = 0;
      }
    }
  }

  private fireDart(k: KeeperState): void {
    const p = this.player;
    if (p.dead) return;
    const d = Math.hypot(p.x - k.x, p.z - k.z);
    if (d > KEEPER.dartRangeMax + 2) return;
    // lead the player slightly
    const lead = 0.35;
    const aimX = p.x + p.vx * lead - k.x;
    const aimZ = p.z + p.vz * lead - k.z;
    const al = Math.hypot(aimX, aimZ) || 1;
    const id = this.nextId++;
    this.darts.set(id, {
      id, x: k.x, z: k.z,
      vx: (aimX / al) * KEEPER.dartSpeed,
      vz: (aimZ / al) * KEEPER.dartSpeed,
      life: 1.6,
    });
    this.emit({ kind: 'sfx', name: 'dart' });
  }

  private updateDarts(dt: number): void {
    const p = this.player;
    for (const d of [...this.darts.values()]) {
      d.life -= dt;
      d.x += d.vx * dt;
      d.z += d.vz * dt;
      if (d.life <= 0 || Math.abs(d.x) > ARENA.half || Math.abs(d.z) > ARENA.half) {
        this.darts.delete(d.id);
        continue;
      }
      if (!p.dead && p.iframes <= 0 && dist2(d.x, d.z, p.x, p.z) < 0.85) {
        this.darts.delete(d.id);
        p.slow = PLAYER.slowTime;
        this.emit({ kind: 'sfx', name: 'dartHit' });
        this.emit({ kind: 'particles', preset: 'stars', x: p.x, z: p.z, count: 6 });
        this.emit({ kind: 'popup', x: p.x, z: p.z, text: 'TRANQ GRAZE!', cls: 'bad' });
        this.emit({ kind: 'shake', mag: 0.3 });
      }
    }
  }

  // =========================================================================
  // Drone
  // =========================================================================
  private updateDrone(dt: number): void {
    if (!this.drone.active) return;
    const dr = this.drone;
    dr.angle += dt * 0.4;
    dr.x = Math.sin(dr.angle) * 15;
    dr.z = Math.cos(dr.angle) * 15;
    // spotlight lazily hunts the capybara when visible
    const p = this.player;
    const tx = p.hidden ? dr.spotX + Math.sin(this.time * 0.7) * 3 : p.x;
    const tz = p.hidden ? dr.spotZ + Math.cos(this.time * 0.9) * 3 : p.z;
    const hunt = p.hidden ? 1.2 : 4.5;
    dr.spotX += (tx - dr.spotX) * clamp(hunt * dt, 0, 1);
    dr.spotZ += (tz - dr.spotZ) * clamp(hunt * dt, 0, 1);
    dr.spotX = clamp(dr.spotX, -ARENA.half + 2, ARENA.half - 2);
    dr.spotZ = clamp(dr.spotZ, -ARENA.half + 2, ARENA.half - 2);
  }

  // =========================================================================
  // Spawning & pickups
  // =========================================================================
  private updateSpawning(dt: number): void {
    const st = STAGES[this.stageIndex];
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      let cap: number = st.touristCap;
      let every: number = st.spawnEvery;
      if (this.config.event === 'fieldtrip') {
        cap = Math.round(cap * 1.5);
        every *= 0.6;
      }
      this.spawnT = every * rand(0.8, 1.2);
      if (this.tourists.size < cap) this.spawnTourist(false);
    }
    // VIP event: keep one VIP around
    if (this.config.event === 'vip') {
      this.vipT -= dt;
      if (this.vipT <= 0) {
        this.vipT = 18;
        let hasVip = false;
        for (const t of this.tourists.values()) if (t.vip) hasVip = true;
        if (!hasVip) {
          this.spawnTourist(false, true);
          this.emit({ kind: 'banner', title: 'VIP ARRIVING', sub: 'Scare the VIP for +50!' });
        }
      }
    }
  }

  private updateFoods(dt: number): void {
    for (const f of [...this.foods.values()]) {
      f.ttl -= dt;
      if (f.ttl <= 0) this.foods.delete(f.id);
    }
  }

  // =========================================================================
  // HUD snapshot
  // =========================================================================
  snapshot(): HudSnapshot {
    const st = STAGES[this.stageIndex];
    return {
      chaos: this.chaos,
      stageIndex: this.stageIndex,
      stageName: st.name,
      stageColor: st.color,
      score: this.score,
      combo: this.combo,
      comboT: this.comboT / COMBO.window,
      stamina: this.player.stamina,
      staminaMax: PLAYER.staminaMax,
      lives: this.player.lives,
      hidden: this.player.hidden,
      charging: this.player.charging,
      objective: this.config.attract ? '' : this.chaos >= 90 ? 'FINISH IT! SHUT THE ZOO DOWN!' : `Cause chaos! ${Math.floor(this.chaos)}/100`,
      time: this.time,
      eventId: this.config.event,
      over: this.over,
      result: this.result,
      scoreMult: this.scoreMult,
      nearPond: this.inPond(this.player.x, this.player.z, 2.5),
    };
  }
}
