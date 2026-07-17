// ============================================================================
// Roguelite meta progression: Chaos Points + upgrade tiers in localStorage.
// ============================================================================

import { UPGRADES } from './constants';

export interface MetaState {
  chaosPoints: number;
  upgrades: Record<string, number>; // upgrade id -> owned tier
  bestScore: number;
  runs: number;
  wins: number;
  muted: boolean;
}

const KEY = 'capybara-chaos-meta-v1';

export function loadMeta(): MetaState {
  const def: MetaState = { chaosPoints: 0, upgrades: {}, bestScore: 0, runs: 0, wins: 0, muted: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return def;
    const parsed = JSON.parse(raw) as Partial<MetaState>;
    return { ...def, ...parsed, upgrades: { ...(parsed.upgrades ?? {}) } };
  } catch {
    return def;
  }
}

export function saveMeta(m: MetaState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* storage unavailable — play session-only */
  }
}

export function upgradeCost(id: string, ownedTier: number): number | null {
  const def = UPGRADES.find((u) => u.id === id);
  if (!def) return null;
  if (ownedTier >= def.tiers.length) return null; // maxed
  return def.tiers[ownedTier];
}

export function tryPurchase(m: MetaState, id: string): MetaState {
  const cost = upgradeCost(id, m.upgrades[id] ?? 0);
  if (cost === null || m.chaosPoints < cost) return m;
  const next: MetaState = {
    ...m,
    chaosPoints: m.chaosPoints - cost,
    upgrades: { ...m.upgrades, [id]: (m.upgrades[id] ?? 0) + 1 },
  };
  saveMeta(next);
  return next;
}
