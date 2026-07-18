// ============================================================================
// Shared types: entity state (plain serializable data), input abstraction and
// networking stubs. MULTIPLAYER FOUNDATIONS:
//  - The whole simulation lives in World.step(dt, inputs) and operates on
//    entities keyed by numeric IDs. State below is plain data (no classes, no
//    Three.js types) so it can be snapshotted / diffed / replicated later.
//  - InputSource abstracts where commands come from: LocalInput (keyboard)
//    now, NetInput (remote players) later.
//  - NetAdapter is the transport seam: LocalLoopback today, WebRTC/WebSocket
//    authoritative server tomorrow — World does not care.
// ============================================================================

import type { EventId } from './constants';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
export interface InputState {
  moveX: number; // -1..1 (screen-aligned; A/D)
  moveZ: number; // -1..1 (screen-aligned; W/S)
  bite: boolean; // J / Z        (gamepad: A)
  headbutt: boolean; // K / X    (gamepad: X)
  charge: boolean; // Shift hold (gamepad: RT)
  hide: boolean; // L / C        (gamepad: B) — edge-triggered by World
  splash: boolean; // Space      (gamepad: Y) — edge-triggered by World
  spin: boolean; // U / E        (gamepad: RB) — edge-triggered by World
}

export interface InputSource {
  poll(): InputState;
}

export const emptyInput = (): InputState => ({
  moveX: 0,
  moveZ: 0,
  bite: false,
  headbutt: false,
  charge: false,
  hide: false,
  splash: false,
  spin: false,
});

/**
 * NetAdapter seam for future multiplayer.
 * - LocalLoopback (below) simply hands local input straight to World.
 * - A future ClientAdapter would serialize InputState per frame and send it
 *   to an authoritative server; a ServerAdapter would broadcast World
 *   snapshots (all interfaces here are JSON-serializable by design).
 */
export interface NetAdapter {
  /** Collect inputs for this tick: map of playerId -> InputState. */
  gatherInputs(): Map<number, InputState>;
  /** Called after World.step with events so remote clients can play FX. */
  broadcast(events: GameEvent[]): void;
}

export class LocalLoopback implements NetAdapter {
  private local: InputSource;
  constructor(local: InputSource) {
    this.local = local;
  }
  gatherInputs(): Map<number, InputState> {
    const m = new Map<number, InputState>();
    m.set(0, this.local.poll()); // player 0 = local capybara
    return m;
  }
  broadcast(): void {
    /* no-op locally; a networked adapter would ship events to peers */
  }
}

// ---------------------------------------------------------------------------
// Entities (plain data, keyed by id in World)
// ---------------------------------------------------------------------------
export interface PlayerState {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: number; // radians, y-rotation
  stamina: number;
  lives: number;
  charging: boolean;
  hidden: boolean;
  muddy: number; // seconds of mud boost remaining
  iframes: number;
  slow: number; // tranq slow remaining
  biteCd: number;
  headbuttCd: number;
  splashCd: number;
  spinCd: number;
  regenWait: number;
  // animation cues (consumed by renderer)
  animAttack: number; // >0 while bite lunge
  animHeadbutt: number;
  animSplash: number;
  animRoll: number;
  animSpin: number; // >0 while spinning (fast y-rotation tween)
  squish: number; // squash & stretch impulse
  dead: boolean;
}

export type TouristMood =
  | 'arrive'
  | 'wander'
  | 'gawk'
  | 'feed'
  | 'suspicious'
  | 'photo'
  | 'panic'
  | 'flee'
  | 'pond'
  | 'gone';

export type ItemKind = 'none' | 'soda' | 'icecream' | 'selfie' | 'food' | 'camera' | 'popcorn' | 'smoke';

export type TouristExpression = 'calm' | 'surprised' | 'panic';

export interface TouristState {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: number;
  mood: TouristMood;
  t: number; // seconds in current mood
  tx: number; // wander target
  tz: number;
  bravery: number; // 0..1 higher = slower to panic
  clumsy: number; // 0..1 higher = trips more
  scale: number; // field-trip kids are small
  vip: boolean;
  item: ItemKind;
  dropped: boolean;
  onPlatform: boolean;
  fear: number; // accumulated panic pressure 0..1
  slip: number; // >0 while slipped on the ground
  soak: number; // >0 while soaked
  bob: number; // walk cycle phase
  screamed: boolean; // scream sfx once per panic
  eyeDart: number; // pupil dart timer
  pupilX: number;
  pupilY: number;
  skin: number; // palette indices (renderer)
  shirt: number;
  pants: number;
  hair: number; // hairstyle index (0 = bald, hats included)
  hairColor: number; // HAIR_COLORS palette index (blonde is common)
  glasses: boolean; // sunglasses
  hitCd: number; // per-tourist charge-hit cooldown
  // ---- tumble physics (push → crumple → fly → bounce → skid → dazed) ----
  tumble: number; // seconds of tumble remaining (safety timeout), 0 = grounded
  tumbleVX: number; // launch velocity (integrated while tumbling)
  tumbleVZ: number;
  tumbleVY: number; // vertical launch velocity
  tumbleY: number; // height above ground while tumbling (rendered arc)
  tumbleRot: number; // accumulated flip angle, rad (renderer rotation.x)
  spin: number; // flip rate, rad/s
  dazed: number; // seconds lying dazed on the ground (stars, then flee)
  chainId: number; // bowling-chain grouping id (one attack = one chain)
  // ---- expressions ----
  expression: TouristExpression;
  surprised: number; // deer-in-headlights freeze timer (~0.7s after any scare)
  // ---- photo tourists ----
  photog: boolean; // approaches a calm Munch for pictures
  photoT: number; // aim timer while stopped in 'photo' mood
  photoCd: number; // cooldown before approaching again
  photoTaken: boolean; // shutter already fired this approach
  // ---- flee-away-from-player ----
  shoved: number; // cooldown for being shoved by panicked tourists
  fleeT: number; // time since panic started (repel → gate blend)
}

export type KeeperMood = 'patrol' | 'investigate' | 'chase' | 'aim' | 'stunned' | 'fire';

export interface KeeperState {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: number;
  mood: KeeperMood;
  t: number;
  tx: number; // investigation / patrol target
  tz: number;
  elite: boolean;
  memory: number; // seconds since last seen player
  dartCd: number;
  bob: number;
  fireId: number; // fire being extinguished (-1 = none)
}

export interface DartState {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
}

export interface FoodState {
  id: number;
  x: number;
  z: number;
  kind: 'snack' | 'icecream' | 'soda' | 'selfie';
  ttl: number;
}

export interface TrashCanState {
  id: number;
  x: number;
  z: number;
  toppled: boolean;
}

export interface CartState {
  x: number;
  z: number;
  kind: 'food' | 'cake';
  toppled: boolean;
}

export interface DroneState {
  active: boolean;
  angle: number; // orbit angle
  x: number;
  z: number;
  spotX: number; // spotlight ground target
  spotZ: number;
}

// ---------------------------------------------------------------------------
// Emergent chaos entities (plain data; meshes live in scene.ts)
// ---------------------------------------------------------------------------

/** Grass fire: ignited by a dropped cigarette, spreads, panics tourists,
 *  diverted keepers stomp it out. Burns out into a scorch decal. */
export interface FireState {
  id: number;
  x: number;
  z: number;
  t: number; // age
  ttl: number; // burn time remaining
  spreadT: number; // countdown to next spread roll
  outT: number; // extinguish progress (keeper standing on it)
  keeperId: number; // keeper currently claiming this fire (-1 = none)
}

/** Spilled popcorn on the ground; summons a gull flock after a short delay. */
export interface SpillState {
  id: number;
  x: number;
  z: number;
  t: number; // age
  ttl: number; // total lifetime (gone once the flock finished eating)
  flockSpawned: boolean;
}

export type GullPhase = 'in' | 'eat' | 'out';

/** A single seagull: swoops in from high altitude, hops & pecks at the
 *  spill, then flies away. On the ground it startles nearby tourists. */
export interface GullState {
  id: number;
  flock: number; // flock grouping id (one spill = one flock)
  x: number;
  y: number; // altitude (0 = on the ground)
  z: number;
  sx: number; // flight start point (swoop-in lerp)
  sy: number;
  sz: number;
  tx: number; // hop target around the spill
  tz: number;
  phase: GullPhase;
  t: number; // time in current phase
  hopT: number; // countdown to next hop
  seed: number; // per-bird animation phase
}

/** Burnt grass circle left after a fire goes out. */
export interface ScorchState {
  id: number;
  x: number;
  z: number;
}

// ---------------------------------------------------------------------------
// Events emitted by World.step — consumed by renderer/audio/UI each frame.
// ---------------------------------------------------------------------------
export type GameEvent =
  | { kind: 'sfx'; name: string; x?: number; z?: number }
  | { kind: 'particles'; preset: string; x: number; z: number; count?: number }
  | { kind: 'popup'; x: number; z: number; text: string; cls: string }
  | { kind: 'shake'; mag: number }
  | { kind: 'stage'; index: number; name: string }
  | { kind: 'gameover'; result: 'win' | 'caught' }
  | { kind: 'banner'; title: string; sub: string };

// ---------------------------------------------------------------------------
// Run configuration & stats
// ---------------------------------------------------------------------------
export interface RunConfig {
  upgrades: Record<string, number>; // upgrade id -> owned tier
  event: EventId;
  attract: boolean; // title-screen demo mode (AI only, no chaos/win)
}

export interface RunStats {
  scared: number;
  pond: number;
  icecream: number;
  stampede: number;
  selfie: number;
  trash: number;
  platform: number;
  cart: number;
  vip: number;
  bowling: number; // 2+ tourists tumbled in one chain
  strikes: number; // 3+ tourists tumbled in one chain
  photos: number; // photog pictures taken of a calm Munch
  fires: number; // grass fires ignited (dropped cigarettes + spread)
  gulls: number; // seagull swarms summoned by popcorn spills
  bestCombo: number;
}

export interface HudSnapshot {
  chaos: number;
  stageIndex: number;
  stageName: string;
  stageColor: string;
  score: number;
  combo: number;
  comboT: number; // 0..1 of combo window remaining
  stamina: number;
  staminaMax: number;
  lives: number;
  hidden: boolean;
  charging: boolean;
  objective: string;
  time: number;
  eventId: EventId;
  over: boolean;
  result: 'win' | 'caught' | null;
  scoreMult: number;
  nearPond: boolean;
}
