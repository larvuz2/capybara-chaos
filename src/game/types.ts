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
  regenWait: number;
  // animation cues (consumed by renderer)
  animAttack: number; // >0 while bite lunge
  animHeadbutt: number;
  animSplash: number;
  animRoll: number;
  squish: number; // squash & stretch impulse
  dead: boolean;
}

export type TouristMood =
  | 'arrive'
  | 'wander'
  | 'gawk'
  | 'feed'
  | 'suspicious'
  | 'panic'
  | 'flee'
  | 'pond'
  | 'gone';

export type ItemKind = 'none' | 'soda' | 'icecream' | 'selfie' | 'food';

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
  hitCd: number; // per-tourist charge-hit cooldown
}

export type KeeperMood = 'patrol' | 'investigate' | 'chase' | 'aim' | 'stunned';

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
