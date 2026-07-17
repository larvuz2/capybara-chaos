// ============================================================================
// CAPYBARA CHAOS — tuning constants & shared layout data (single source of truth)
// All distances in meters, times in seconds. Plain data only (serializable-ish)
// so a future NetAdapter can replicate the world without Three.js types.
// ============================================================================

export const ARENA = {
  half: 30, // enclosure extends -30..30 on x and z
  outerHalf: 44, // walkable absolute limit (tourist path, when open)
  pathZ0: 30.5, // tourist path strip beyond south fence
  pathZ1: 40,
};

export const POND = { cx: 19, cz: -19, rx: 7.2, rz: 5.2 };
export const MUD = { cx: 10.5, cz: -13.5, r: 3.2 }; // mud patch near pond

// Viewing boardwalk along the south fence (inside enclosure)
export const PLATFORM = { x0: -14, x1: 14, z0: 23.5, z1: 29, y: 0.55 };

export const GATES = {
  tourist: { x: 0, z: 30 }, // main south gate (tourists arrive here)
  keeper: { x: -30, z: 0 }, // west service gate (keepers enter)
  // breakable fence panel either side of the tourist gate (upgrade: Charge Breaks Fences)
  fenceGap: { x0: -5, x1: 5, z: 30 },
};

export const HIDING_SPOTS: { x: number; z: number; r: number }[] = [
  { x: -18, z: -12, r: 2.6 },
  { x: -8, z: -22, r: 2.4 },
  { x: 6, z: -8, r: 2.4 },
  { x: 24, z: 2, r: 2.6 },
  { x: -22, z: 10, r: 2.6 },
  { x: -4, z: 14, r: 2.4 },
  { x: 12, z: 12, r: 2.4 },
  { x: 26, z: -8, r: 2.4 },
];

export const BENCHES: { x: number; z: number; rot: number }[] = [
  { x: -10, z: 4, rot: Math.PI / 2 },
  { x: 10, z: 4, rot: -Math.PI / 2 },
  { x: -12, z: -4, rot: Math.PI / 2 },
  { x: 2, z: 18, rot: 0 },
];

export const PICNIC_TABLES: { x: number; z: number; rot: number }[] = [
  { x: -18, z: 18, rot: 0.3 },
  { x: 18, z: 16, rot: -0.5 },
];

export const TRASH_CANS: { x: number; z: number }[] = [
  { x: -6, z: 8 },
  { x: 8, z: -2 },
  { x: -14, z: -16 },
  { x: 16, z: 22 },
  { x: -24, z: 22 },
];

export const LAMPS: { x: number; z: number }[] = [
  { x: -12, z: 12 },
  { x: 12, z: 20 },
  { x: -20, z: -20 },
  { x: 24, z: 12 },
];

export const TREES: { x: number; z: number; s: number }[] = [
  { x: -24, z: -24, s: 1.2 },
  { x: -14, z: -26, s: 0.95 },
  { x: 26, z: 24, s: 1.1 },
  { x: -26, z: 26, s: 1.0 },
  { x: 4, z: -26, s: 0.9 },
  { x: 28, z: -14, s: 1.0 },
  { x: -28, z: -2, s: 0.9 },
];

export const CART_SPOT = { x: 8, z: 8 };

export const PLAYER = {
  radius: 0.9,
  walkSpeed: 6.2,
  chargeSpeed: 11.5,
  accel: 34,
  friction: 10,
  staminaMax: 100,
  staminaRegen: 20,
  regenDelay: 0.55,
  biteRange: 2.4,
  biteArc: 1.9, // radians
  biteCd: 0.38,
  headbuttRange: 2.8,
  headbuttArc: 2.2,
  headbuttCd: 0.75,
  headbuttForce: 10,
  splashRange: 6.5, // AoE radius
  splashCd: 1.4,
  iframesTime: 2.5,
  mudBoost: 1.28,
  mudTime: 6,
  slowTime: 2.2,
  slowFactor: 0.55,
  lives: 3,
};

export const TOURIST = {
  walkSpeed: 2.2,
  fleeSpeed: 5.2,
  panicSpreadRadius: 5.5,
  scareRadiusBase: 3.2, // intimidation aura of the capybara
  dropChance: 0.65,
  slipBase: 0.06,
};

export const KEEPER = {
  walkSpeed: 3.0,
  chaseSpeed: 5.0,
  sprintSpeed: 6.8,
  eliteSpeed: 7.6,
  sightRadius: 13,
  sightHiddenRadius: 3.2,
  memoryTime: 3.0,
  grabRadius: 1.5,
  stunTime: 2.6,
  dartRangeMin: 5,
  dartRangeMax: 15,
  dartAimTime: 0.7,
  dartSpeed: 19,
  dartCd: 3.2,
};

// Chaos stages — thresholds on the 0..100 chaos meter
export const STAGES = [
  { name: 'PEACEFUL', at: 0, color: '#7ed957', keepers: 0, keeperSpeed: 0, darts: false, drone: false, touristCap: 11, spawnEvery: 3.2 },
  { name: 'SUSPICIOUS', at: 20, color: '#ffd93d', keepers: 1, keeperSpeed: KEEPER.walkSpeed, darts: false, drone: false, touristCap: 14, spawnEvery: 2.7 },
  { name: 'ALARMED', at: 40, color: '#ff9f1c', keepers: 2, keeperSpeed: KEEPER.chaseSpeed, darts: false, drone: false, touristCap: 16, spawnEvery: 2.3 },
  { name: 'CODE BROWN', at: 60, color: '#ff6b35', keepers: 2, keeperSpeed: KEEPER.sprintSpeed, darts: true, drone: false, touristCap: 17, spawnEvery: 2.1 },
  { name: 'FULL ALERT', at: 75, color: '#e5383b', keepers: 3, keeperSpeed: KEEPER.sprintSpeed, darts: true, drone: true, touristCap: 17, spawnEvery: 2.0 },
  { name: 'ZOO SWAT', at: 90, color: '#b5179e', keepers: 4, keeperSpeed: KEEPER.eliteSpeed, darts: true, drone: true, touristCap: 15, spawnEvery: 1.9 },
] as const;

export const CHAOS = {
  scare: 5,
  pondFall: 8,
  iceCream: 4,
  stampede: 10,
  selfie: 5,
  trash: 5,
  platform: 14,
  cart: 12,
  vip: 12,
  win: 100,
};

export const SCORE = {
  scare: 10,
  pondFall: 25,
  iceCream: 15,
  stampede: 50,
  selfie: 20,
  trash: 10,
  platform: 100,
  cart: 40,
  vip: 50,
};

export const COMBO = { window: 4.0, max: 8 };

// ---------------------------------------------------------------------------
// Roguelite meta: Chaos Points shop upgrades
// ---------------------------------------------------------------------------
export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  icon: string; // lucide icon name resolved in App
  tiers: number[]; // cost per tier (length = max tier)
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'sprint', name: 'Faster Sprint', desc: '+9% charge speed per tier', icon: 'wind', tiers: [60, 120, 220] },
  { id: 'headbutt', name: 'Stronger Headbutt', desc: '+22% knockback per tier', icon: 'zap', tiers: [60, 120, 220] },
  { id: 'intimidate', name: 'Bigger Intimidation', desc: '+18% scare aura per tier', icon: 'megaphone', tiers: [70, 140, 240] },
  { id: 'stamina', name: 'Fast Recovery', desc: '+25% stamina regen per tier', icon: 'heart-pulse', tiers: [60, 120, 200] },
  { id: 'hiding', name: 'Better Hiding', desc: 'Keepers lose you 30% faster per tier', icon: 'eye-off', tiers: [70, 150, 260] },
  { id: 'growl', name: 'Louder Growl', desc: 'Bite scares nearby tourists too (bigger AoE per tier)', icon: 'volume-2', tiers: [90, 180, 300] },
  { id: 'fences', name: 'Charge Breaks Fences', desc: 'Smash the gate fence: rampage on the tourist path!', icon: 'hammer', tiers: [350] },
  { id: 'splash', name: 'Bigger Splash', desc: '+20% splash radius per tier', icon: 'waves', tiers: [60, 120, 220] },
];

// ---------------------------------------------------------------------------
// Random events (one rolled per run)
// ---------------------------------------------------------------------------
export type EventId = 'feeding' | 'fieldtrip' | 'rain' | 'vip' | 'birthday' | 'tvcrew' | 'gateopen' | 'foodcart';

export const EVENTS: { id: EventId; name: string; desc: string; icon: string }[] = [
  { id: 'feeding', name: 'FEEDING TIME', desc: 'Tourists cluster with snacks — eat tossed food to restore stamina!', icon: 'apple' },
  { id: 'fieldtrip', name: 'SCHOOL FIELD TRIP', desc: 'A horde of tiny, fast, easily-startled tourists!', icon: 'backpack' },
  { id: 'rain', name: 'RAIN SHOWER', desc: 'Slippery ground! Everyone slides, tourists drop more stuff.', icon: 'cloud-rain' },
  { id: 'vip', name: 'VIP TOUR', desc: 'A very important tourist is visiting (+50 scare). Extra security!', icon: 'crown' },
  { id: 'birthday', name: 'ZOO BIRTHDAY PARTY', desc: 'Cake cart in the plaza! Topple it for +40.', icon: 'cake' },
  { id: 'tvcrew', name: 'TV CREW', desc: 'Score x1.5, but the cameras make you easier to spot!', icon: 'video' },
  { id: 'gateopen', name: 'GATE LEFT OPEN', desc: 'The tourist path beyond the fence is wide open!', icon: 'door-open' },
  { id: 'foodcart', name: 'FOOD CART', desc: 'A delicious food cart appeared. Topple it for +40 & an item shower!', icon: 'shopping-cart' },
];

export const ECONOMY = {
  cpPerScore: 0.12, // chaos points = score * this
  cpPerChaos: 0.6, // plus chaos reached * this
  cpWinBonus: 60,
};

export const COLORS = {
  grass: 0x6ab04c,
  grassDark: 0x58a03e,
  path: 0xd9c28f,
  sand: 0xe8d8a8,
  water: 0x39a0a8,
  wood: 0xa9744f,
  woodDark: 0x8b5e3c,
  fence: 0xf3ead3,
  capybara: 0x8a5a33,
  capybaraDark: 0x6f4525,
  mud: 0x5d4023,
  keeper: 0x3d5a80,
  keeperElite: 0x2b2d42,
};
