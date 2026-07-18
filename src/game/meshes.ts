// ============================================================================
// Procedural low-poly mesh builders. Everything is built from primitives with
// shared (cached) geometries & materials — zero external assets.
// ============================================================================

import * as THREE from 'three';
import { COLORS } from './constants';
import type { TouristState } from './types';

// ---- caches ----------------------------------------------------------------
const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.MeshStandardMaterial>();

function boxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const k = `b${w}|${h}|${d}`;
  let g = geoCache.get(k) as THREE.BoxGeometry | undefined;
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geoCache.set(k, g);
  }
  return g;
}
function sphGeo(r: number, w = 10, h = 8): THREE.SphereGeometry {
  const k = `s${r}|${w}|${h}`;
  let g = geoCache.get(k) as THREE.SphereGeometry | undefined;
  if (!g) {
    g = new THREE.SphereGeometry(r, w, h);
    geoCache.set(k, g);
  }
  return g;
}
function cylGeo(rt: number, rb: number, h: number, seg = 8): THREE.CylinderGeometry {
  const k = `c${rt}|${rb}|${h}|${seg}`;
  let g = geoCache.get(k) as THREE.CylinderGeometry | undefined;
  if (!g) {
    g = new THREE.CylinderGeometry(rt, rb, h, seg);
    geoCache.set(k, g);
  }
  return g;
}
function coneGeo(r: number, h: number, seg = 8): THREE.ConeGeometry {
  const k = `k${r}|${h}|${seg}`;
  let g = geoCache.get(k) as THREE.ConeGeometry | undefined;
  if (!g) {
    g = new THREE.ConeGeometry(r, h, seg);
    geoCache.set(k, g);
  }
  return g;
}

export interface MatOpts {
  emissive?: number;
  emissiveIntensity?: number;
  rough?: number;
  metal?: number;
  flat?: boolean;
  transparent?: boolean;
  opacity?: number;
}

export function mat(color: number, o: MatOpts = {}): THREE.MeshStandardMaterial {
  const k = `${color}|${o.emissive ?? 0}|${o.rough ?? 0.9}|${o.flat === false ? 0 : 1}|${o.transparent ? o.opacity ?? 1 : 0}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: o.rough ?? 0.9,
      metalness: o.metal ?? 0,
      flatShading: o.flat !== false,
      emissive: o.emissive ?? 0x000000,
      emissiveIntensity: o.emissiveIntensity ?? 1,
      transparent: o.transparent ?? false,
      opacity: o.opacity ?? 1,
    });
    matCache.set(k, m);
  }
  return m;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh {
  const me = new THREE.Mesh(g, m);
  me.position.set(x, y, z);
  me.castShadow = shadow;
  return me;
}

// ---- palettes ---------------------------------------------------------------
export const SKINS = [0xf2c89b, 0xd9a066, 0xa06a3b, 0x6e4a2a, 0xf7d7b5];
// bright tourist shirts, incl. loud hawaiian vibes
export const SHIRTS = [0xff5d8f, 0xffbe0b, 0x3a86ff, 0xfb5607, 0x8338ec, 0x06d6a0, 0xef476f, 0x118ab2, 0xffd60a, 0x70e000, 0x00bbf9, 0xff70a6];
export const PANTS = [0x3d405b, 0x5f6caf, 0x8d6e63, 0x2f4858, 0x6a4c93, 0x457b9d];
// 0 blonde (common), 1 light brown, 2 brown, 3 black, 4 red, 5 pink, 6 blue
export const HAIR_COLORS = [0xf2d15c, 0xb08850, 0x6e4a2a, 0x2b2320, 0xc1440e, 0xff8fb1, 0x5dade2];

// ============================================================================
// CAPYBARA — chunky grumpy boy
// ============================================================================
export interface CapybaraRig {
  group: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Group;
  lidL: THREE.Mesh;
  lidR: THREE.Mesh;
  earL: THREE.Mesh;
  earR: THREE.Mesh;
  legs: THREE.Mesh[];
  mud: THREE.Group;
  inner: THREE.Group; // squash & stretch target
}

export function buildCapybara(): CapybaraRig {
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);
  const brown = mat(COLORS.capybara);
  const dark = mat(COLORS.capybaraDark);

  const body = mesh(sphGeo(1, 12, 10), brown, 0, 0.95, 0);
  body.scale.set(0.95, 0.78, 1.35);
  inner.add(body);

  // haunches
  const rump = mesh(sphGeo(0.75, 10, 8), brown, 0, 0.85, -0.75);
  rump.scale.set(0.95, 0.8, 0.9);
  inner.add(rump);

  const head = new THREE.Group();
  head.position.set(0, 1.25, 1.15);
  inner.add(head);
  const skull = mesh(boxGeo(0.85, 0.72, 0.8), brown, 0, 0, 0);
  skull.geometry = boxGeo(0.85, 0.72, 0.8);
  head.add(skull);
  // big blocky snout
  const snout = mesh(boxGeo(0.62, 0.5, 0.55), dark, 0, -0.12, 0.55);
  head.add(snout);
  const nose = mesh(boxGeo(0.3, 0.16, 0.12), mat(0x3a2415), 0, 0.02, 0.86);
  head.add(nose);
  const teeth = mesh(boxGeo(0.16, 0.12, 0.05), mat(0xf5f0e0), 0, -0.4, 0.8, false);
  head.add(teeth);
  // grumpy half-closed eyes
  const eyeL = mesh(sphGeo(0.11, 8, 6), mat(0x1a120b, { flat: false }), -0.26, 0.16, 0.36, false);
  const eyeR = mesh(sphGeo(0.11, 8, 6), mat(0x1a120b, { flat: false }), 0.26, 0.16, 0.36, false);
  head.add(eyeL, eyeR);
  const lidL = mesh(boxGeo(0.26, 0.1, 0.14), brown, -0.26, 0.24, 0.38, false);
  const lidR = mesh(boxGeo(0.26, 0.1, 0.14), brown, 0.26, 0.24, 0.38, false);
  lidL.rotation.z = 0.15;
  lidR.rotation.z = -0.15;
  head.add(lidL, lidR);
  // grumpy brows
  const browL = mesh(boxGeo(0.24, 0.07, 0.1), dark, -0.26, 0.34, 0.38, false);
  const browR = mesh(boxGeo(0.24, 0.07, 0.1), dark, 0.26, 0.34, 0.38, false);
  browL.rotation.z = -0.3;
  browR.rotation.z = 0.3;
  head.add(browL, browR);
  // small rounded ears
  const earL = mesh(sphGeo(0.14, 8, 6), dark, -0.32, 0.42, -0.1, false);
  const earR = mesh(sphGeo(0.14, 8, 6), dark, 0.32, 0.42, -0.1, false);
  head.add(earL, earR);

  // stubby legs
  const legs: THREE.Mesh[] = [];
  const legPos: [number, number][] = [[-0.45, 0.6], [0.45, 0.6], [-0.5, -0.65], [0.5, -0.65]];
  for (const [lx, lz] of legPos) {
    const leg = mesh(cylGeo(0.16, 0.19, 0.6, 7), dark, lx, 0.3, lz, false);
    legs.push(leg);
    inner.add(leg);
  }

  // mud blobs (visible when muddy)
  const mud = new THREE.Group();
  const mudMat = mat(COLORS.mud, { rough: 1 });
  const b1 = mesh(sphGeo(0.35, 7, 5), mudMat, -0.4, 1.15, 0.2, false);
  const b2 = mesh(sphGeo(0.3, 7, 5), mudMat, 0.45, 0.9, -0.4, false);
  const b3 = mesh(sphGeo(0.28, 7, 5), mudMat, 0.1, 1.3, -0.7, false);
  b1.scale.set(1, 0.5, 1);
  b2.scale.set(1, 0.5, 1);
  b3.scale.set(1, 0.5, 1);
  mud.add(b1, b2, b3);
  mud.visible = false;
  inner.add(mud);

  return { group, body, head, lidL, lidR, earL, earR, legs, mud, inner };
}

// ============================================================================
// TOURIST — quirky, huge googly eyes, clashing clothes
// ============================================================================
export interface TouristRig {
  group: THREE.Group;
  inner: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Group;
  eyeL: THREE.Mesh;
  eyeR: THREE.Mesh;
  pupilL: THREE.Mesh;
  pupilR: THREE.Mesh;
  mouth: THREE.Mesh; // closed mouth (calm)
  mouthO: THREE.Mesh; // open "O" mouth (surprised / panic)
  browL: THREE.Mesh; // raised surprise brows
  browR: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  itemHolder: THREE.Group;
}

export function buildTourist(t: TouristState): TouristRig {
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);
  const skin = mat(t.vip ? 0xf2c89b : SKINS[t.skin % SKINS.length]);
  const shirt = mat(t.vip ? 0xffd700 : SHIRTS[t.shirt % SHIRTS.length]);
  const pants = mat(PANTS[t.pants % PANTS.length]);

  // cylinder-ish body
  const body = mesh(cylGeo(0.34, 0.42, 0.85, 10), shirt, 0, 0.95, 0);
  inner.add(body);
  // shorts/pants
  const hip = mesh(cylGeo(0.4, 0.36, 0.35, 10), pants, 0, 0.5, 0);
  inner.add(hip);
  // legs
  const legL = mesh(cylGeo(0.11, 0.13, 0.45, 7), pants, -0.18, 0.22, 0, false);
  const legR = mesh(cylGeo(0.11, 0.13, 0.45, 7), pants, 0.18, 0.22, 0, false);
  inner.add(legL, legR);
  // shoes
  const shoeL = mesh(boxGeo(0.2, 0.1, 0.3), mat(0xf5f0e0), -0.18, 0.05, 0.04, false);
  const shoeR = mesh(boxGeo(0.2, 0.1, 0.3), mat(0xf5f0e0), 0.18, 0.05, 0.04, false);
  inner.add(shoeL, shoeR);

  // head with HUGE googly eyes
  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  inner.add(head);
  const skull = mesh(sphGeo(0.34, 12, 10), skin, 0, 0, 0);
  head.add(skull);
  const eyeMat = mat(0xffffff, { flat: false, rough: 0.3 });
  const pupilMat = mat(0x14100c, { flat: false, rough: 0.3 });
  const eyeL = mesh(sphGeo(0.15, 10, 8), eyeMat, -0.15, 0.05, 0.26, false);
  const eyeR = mesh(sphGeo(0.15, 10, 8), eyeMat, 0.15, 0.05, 0.26, false);
  const pupilL = mesh(sphGeo(0.07, 8, 6), pupilMat, 0, 0, 0.1, false);
  const pupilR = mesh(sphGeo(0.07, 8, 6), pupilMat, 0, 0, 0.1, false);
  eyeL.add(pupilL);
  eyeR.add(pupilR);
  head.add(eyeL, eyeR);
  // mouth: closed line (calm) + open "O" (surprised/panic), toggled by expression
  const mouth = mesh(boxGeo(0.14, 0.06, 0.05), mat(0x7a4a35), 0, -0.16, 0.31, false);
  head.add(mouth);
  const mouthO = mesh(sphGeo(0.08, 8, 6), mat(0x51232b), 0, -0.18, 0.29, false);
  mouthO.scale.set(1, 1.3, 0.5);
  mouthO.visible = false;
  head.add(mouthO);
  // raised surprise eyebrows (hidden while calm)
  const browMat = mat(0x4a3220);
  const browL = mesh(boxGeo(0.16, 0.035, 0.05), browMat, -0.15, 0.24, 0.3, false);
  const browR = mesh(boxGeo(0.16, 0.035, 0.05), browMat, 0.15, 0.24, 0.3, false);
  browL.rotation.z = 0.18;
  browR.rotation.z = -0.18;
  browL.visible = false;
  browR.visible = false;
  head.add(browL, browR);
  // hair / hat variety (driven by sim-rolled t.hair / t.hairColor)
  const hairMat = mat(HAIR_COLORS[t.hairColor % HAIR_COLORS.length]);
  if (t.vip) {
    const hat = mesh(cylGeo(0.2, 0.22, 0.28, 10), mat(0x222222), 0, 0.42, 0);
    const brim = mesh(cylGeo(0.34, 0.34, 0.04, 12), mat(0x222222), 0, 0.3, 0);
    head.add(hat, brim);
  } else if (t.hair === 1) {
    // baseball cap, clashing with the shirt of course
    const cap = mesh(sphGeo(0.36, 10, 6), mat(SHIRTS[(t.shirt + 3) % SHIRTS.length]), 0, 0.12, 0);
    cap.scale.set(1, 0.55, 1);
    head.add(cap);
  } else if (t.hair === 2) {
    // flat mop
    const hair = mesh(boxGeo(0.5, 0.14, 0.5), hairMat, 0, 0.32, 0, false);
    head.add(hair);
  } else if (t.hair === 3) {
    // top bun
    const bun = mesh(sphGeo(0.16, 8, 6), hairMat, 0, 0.38, -0.05, false);
    head.add(bun);
  } else if (t.hair === 4) {
    // mohawk
    const hawk = mesh(boxGeo(0.09, 0.24, 0.52), hairMat, 0, 0.38, 0, false);
    head.add(hawk);
  } else if (t.hair === 5) {
    // pigtail buns x2
    const bunL = mesh(sphGeo(0.14, 8, 6), hairMat, -0.32, 0.2, -0.05, false);
    const bunR = mesh(sphGeo(0.14, 8, 6), hairMat, 0.32, 0.2, -0.05, false);
    head.add(bunL, bunR);
  } else if (t.hair === 6) {
    // flat cap
    const capTop = mesh(cylGeo(0.3, 0.33, 0.1, 10), mat(0x8d8a7a), 0, 0.32, 0, false);
    const capBrim = mesh(boxGeo(0.3, 0.04, 0.2), mat(0x8d8a7a), 0, 0.28, 0.32, false);
    head.add(capTop, capBrim);
  } else if (t.hair === 7) {
    // sun hat
    const brim = mesh(cylGeo(0.52, 0.52, 0.04, 12), mat(0xf0e3b2), 0, 0.26, 0, false);
    const dome = mesh(sphGeo(0.28, 10, 6), mat(0xf0e3b2), 0, 0.3, 0, false);
    dome.scale.set(1, 0.6, 1);
    head.add(brim, dome);
  }
  // sunglasses: ~1 in 4 tourists
  if (t.glasses && !t.vip) {
    const shades = mesh(boxGeo(0.46, 0.1, 0.06), mat(0x141414, { rough: 0.25 }), 0, 0.05, 0.3, false);
    head.add(shades);
  }

  // arms
  const armL = mesh(cylGeo(0.09, 0.1, 0.6, 7), shirt, -0.45, 1.1, 0, false);
  const armR = mesh(cylGeo(0.09, 0.1, 0.6, 7), shirt, 0.45, 1.1, 0, false);
  inner.add(armL, armR);

  // held item
  const itemHolder = new THREE.Group();
  itemHolder.position.set(0.5, 1.35, 0.15);
  inner.add(itemHolder);
  if (t.item === 'soda') {
    const cup = mesh(cylGeo(0.09, 0.07, 0.22, 8), mat(0xe63946), 0, 0, 0, false);
    const lid = mesh(cylGeo(0.095, 0.095, 0.04, 8), mat(0xf1faee), 0, 0.12, 0, false);
    const straw = mesh(cylGeo(0.015, 0.015, 0.18, 5), mat(0xf1faee), 0.03, 0.2, 0, false);
    itemHolder.add(cup, lid, straw);
  } else if (t.item === 'icecream') {
    const cone = mesh(coneGeo(0.08, 0.22, 7), mat(0xd9a066), 0, -0.05, 0, false);
    cone.rotation.x = Math.PI;
    const scoop = mesh(sphGeo(0.11, 8, 6), mat(0xffb3c6, { flat: false }), 0, 0.1, 0, false);
    itemHolder.add(cone, scoop);
  } else if (t.item === 'selfie') {
    const stick = mesh(cylGeo(0.02, 0.02, 0.7, 5), mat(0x333333), 0, 0.25, 0, false);
    stick.rotation.z = -0.5;
    const phone = mesh(boxGeo(0.16, 0.26, 0.04), mat(0x222831), 0.18, 0.55, 0, false);
    itemHolder.add(stick, phone);
  } else if (t.item === 'food') {
    const snack = mesh(sphGeo(0.1, 7, 5), mat(0xe9c46a), 0, 0, 0, false);
    itemHolder.add(snack);
  } else if (t.item === 'camera') {
    // photo tourist: chunky camera body + lens + flash bulb
    const camBody = mesh(boxGeo(0.24, 0.16, 0.1), mat(0x222831), 0, 0, 0, false);
    const lens = mesh(cylGeo(0.055, 0.065, 0.12, 8), mat(0x101418), 0, 0, 0.1, false);
    lens.rotation.x = Math.PI / 2;
    const glass = mesh(cylGeo(0.045, 0.045, 0.02, 8), mat(0x66ccff, { flat: false, rough: 0.2 }), 0, 0, 0.16, false);
    glass.rotation.x = Math.PI / 2;
    const flashBulb = mesh(boxGeo(0.07, 0.05, 0.04), mat(0xf5f0e0, { emissive: 0xffffff, emissiveIntensity: 0.6 }), -0.07, 0.1, 0.02, false);
    itemHolder.add(camBody, lens, glass, flashBulb);
  } else if (t.item === 'popcorn') {
    // striped red/white bucket with popcorn bumps
    const bucket = mesh(cylGeo(0.1, 0.075, 0.2, 10), mat(0xf5f0e0), 0, 0, 0, false);
    const stripe1 = mesh(cylGeo(0.102, 0.098, 0.045, 10), mat(0xe63946), 0, 0.05, 0, false);
    const stripe2 = mesh(cylGeo(0.09, 0.084, 0.045, 10), mat(0xe63946), 0, -0.05, 0, false);
    itemHolder.add(bucket, stripe1, stripe2);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      itemHolder.add(mesh(sphGeo(0.04, 6, 5), mat(0xfff3c4, { flat: false }), Math.sin(a) * 0.05, 0.11, Math.cos(a) * 0.05, false));
    }
  } else if (t.item === 'smoke') {
    // tiny cigarette held out + glowing ember
    const cig = mesh(cylGeo(0.014, 0.014, 0.13, 5), mat(0xf5f0e0), 0, 0, 0, false);
    cig.rotation.z = Math.PI / 2;
    const ember = mesh(sphGeo(0.02, 6, 5), mat(0xff6b35, { emissive: 0xff4400, emissiveIntensity: 1.6 }), 0.075, 0, 0, false);
    itemHolder.add(cig, ember);
  }

  group.scale.setScalar(t.scale);
  return { group, inner, body, head, eyeL, eyeR, pupilL, pupilR, mouth, mouthO, browL, browR, armL, armR, legL, legR, itemHolder };
}

// ============================================================================
// KEEPER / SECURITY
// ============================================================================
export interface KeeperRig {
  group: THREE.Group;
  inner: THREE.Group;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  gun: THREE.Group;
}

export function buildKeeper(elite: boolean): KeeperRig {
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);
  const uniform = mat(elite ? COLORS.keeperElite : COLORS.keeper);
  const skin = mat(SKINS[1]);

  const body = mesh(cylGeo(0.36, 0.44, 1.0, 10), uniform, 0, 1.1, 0);
  inner.add(body);
  const belt = mesh(cylGeo(0.45, 0.45, 0.12, 10), mat(0x222222), 0, 0.78, 0, false);
  inner.add(belt);
  const legL = mesh(cylGeo(0.13, 0.15, 0.6, 7), mat(0x2b2d42), -0.2, 0.3, 0, false);
  const legR = mesh(cylGeo(0.13, 0.15, 0.6, 7), mat(0x2b2d42), 0.2, 0.3, 0, false);
  inner.add(legL, legR);

  const head = new THREE.Group();
  head.position.set(0, 1.85, 0);
  inner.add(head);
  head.add(mesh(sphGeo(0.3, 10, 8), skin, 0, 0, 0));
  // cap
  const cap = mesh(cylGeo(0.32, 0.34, 0.16, 10), uniform, 0, 0.22, 0);
  const brim = mesh(boxGeo(0.4, 0.05, 0.3), uniform, 0, 0.16, 0.32, false);
  head.add(cap, brim);
  // sunglasses
  const shades = mesh(boxGeo(0.44, 0.12, 0.08), mat(0x111111, { rough: 0.3 }), 0, 0.02, 0.28, false);
  head.add(shades);
  if (elite) {
    const vest = mesh(boxGeo(0.7, 0.5, 0.5), mat(0x1a1a2e), 0, 1.2, 0, false);
    inner.add(vest);
  }

  const armL = mesh(cylGeo(0.1, 0.11, 0.65, 7), uniform, -0.5, 1.25, 0, false);
  const armR = mesh(cylGeo(0.1, 0.11, 0.65, 7), uniform, 0.5, 1.25, 0, false);
  inner.add(armL, armR);

  // tranq gun (raised while aiming)
  const gun = new THREE.Group();
  const barrel = mesh(boxGeo(0.08, 0.08, 0.5), mat(0x555555, { rough: 0.4, metal: 0.4 }), 0, 0, 0.2, false);
  const stock = mesh(boxGeo(0.1, 0.14, 0.2), mat(0x8b5e3c), 0, -0.05, -0.1, false);
  gun.add(barrel, stock);
  gun.position.set(0.5, 1.35, 0.3);
  gun.visible = false;
  inner.add(gun);

  return { group, inner, armL, armR, legL, legR, gun };
}

// ============================================================================
// DRONE with spotlight
// ============================================================================
export interface DroneRig {
  group: THREE.Group;
  rotors: THREE.Mesh[];
  cone: THREE.Mesh;
  spot: THREE.Mesh;
}

export function buildDrone(): DroneRig {
  const group = new THREE.Group();
  const body = mesh(boxGeo(0.7, 0.25, 0.7), mat(0x3a3f4a, { rough: 0.5, metal: 0.3 }), 0, 0, 0);
  const eye = mesh(sphGeo(0.16, 8, 6), mat(0xff3b3b, { emissive: 0xff3b3b, emissiveIntensity: 1.6 }), 0, -0.08, 0.3, false);
  group.add(body, eye);
  const rotors: THREE.Mesh[] = [];
  const rp: [number, number][] = [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]];
  for (const [rx, rz] of rp) {
    const arm = mesh(boxGeo(0.3, 0.06, 0.3), mat(0x2b2f38), rx, 0.08, rz, false);
    const rotor = mesh(boxGeo(0.7, 0.03, 0.1), mat(0x999da6), rx, 0.18, rz, false);
    rotors.push(rotor);
    group.add(arm, rotor);
  }
  // fake spotlight cone (additive, transparent)
  const coneGeoL = new THREE.ConeGeometry(2.6, 12, 16, 1, true);
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xfff2b0, transparent: true, opacity: 0.13,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
  });
  const cone = new THREE.Mesh(coneGeoL, coneMat);
  cone.position.y = -6;
  group.add(cone);
  // ground spot circle
  const spotGeoL = new THREE.CircleGeometry(2.6, 24);
  const spotMat = new THREE.MeshBasicMaterial({
    color: 0xfff2b0, transparent: true, opacity: 0.28,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const spot = new THREE.Mesh(spotGeoL, spotMat);
  spot.rotation.x = -Math.PI / 2;
  return { group, rotors, cone, spot };
}

// ============================================================================
// Small props
// ============================================================================
export function buildDart(): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(cylGeo(0.04, 0.04, 0.4, 6), mat(0xff8c42, { emissive: 0xff8c42, emissiveIntensity: 0.8 }), 0, 0, 0, false);
  body.rotation.x = Math.PI / 2;
  const tip = mesh(coneGeo(0.05, 0.15, 6), mat(0xd9d9d9), 0, 0, 0.26, false);
  tip.rotation.x = Math.PI / 2;
  g.add(body, tip);
  return g;
}

export function buildFoodMesh(kind: string): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'soda') {
    g.add(mesh(cylGeo(0.09, 0.07, 0.22, 8), mat(0xe63946), 0, 0.11, 0, false));
    g.add(mesh(cylGeo(0.095, 0.095, 0.04, 8), mat(0xf1faee), 0, 0.23, 0, false));
  } else if (kind === 'icecream') {
    const scoop = mesh(sphGeo(0.13, 8, 6), mat(0xffb3c6, { flat: false }), 0, 0.1, 0, false);
    g.add(scoop);
  } else {
    const snack = mesh(sphGeo(0.12, 7, 5), mat(0xe9c46a), 0, 0.08, 0, false);
    snack.scale.set(1, 0.7, 1);
    g.add(snack);
  }
  return g;
}

// ============================================================================
// EMERGENT CHAOS PROPS — fires, popcorn spills, seagulls, scorch marks
// ============================================================================
export interface FireRig {
  group: THREE.Group;
  flames: THREE.Mesh[];
  glow: THREE.Mesh;
  light: THREE.PointLight;
}

export function buildFire(): FireRig {
  const group = new THREE.Group();
  // charred base
  const base = mesh(cylGeo(0.42, 0.5, 0.08, 9), mat(0x241a12), 0, 0.04, 0, false);
  group.add(base);
  // flickering flame cones (outer → inner, animated in scene)
  const flames: THREE.Mesh[] = [];
  const defs: [number, number, number, number][] = [
    [0.42, 0.95, 0xff7b24, 0], // outer orange
    [0.3, 0.75, 0xffb020, 0.05], // mid amber
    [0.17, 0.5, 0xffe08a, -0.04], // inner yellow
  ];
  for (const [r, h, col, off] of defs) {
    const f = mesh(coneGeo(r, h, 7), mat(col, { emissive: col, emissiveIntensity: 1.5 }), off, 0.1 + h / 2, -off * 0.6, false);
    flames.push(f);
    group.add(f);
  }
  // warm additive ground glow
  const glowGeo = new THREE.CircleGeometry(1.7, 20);
  const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
    color: 0xff8c3a, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.06;
  group.add(glow);
  // real light so the fire actually lights the grass (few concurrent max)
  const light = new THREE.PointLight(0xff8c3a, 10, 8, 1.8);
  light.position.y = 0.9;
  group.add(light);
  return { group, flames, glow, light };
}

export function buildSpill(): THREE.Group {
  const g = new THREE.Group();
  // scattered popcorn pile
  const cols = [0xfff7e0, 0xffe9a8, 0xffffff];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + i;
    const r = i === 0 ? 0 : 0.16 + (i % 3) * 0.14;
    const k = mesh(sphGeo(0.075, 6, 5), mat(cols[i % cols.length], { flat: false }), Math.sin(a) * r, 0.05, Math.cos(a) * r, false);
    k.scale.y = 0.7;
    g.add(k);
  }
  // the fallen bucket, tipped on its side
  const bucket = new THREE.Group();
  const body = mesh(cylGeo(0.11, 0.085, 0.22, 10), mat(0xf5f0e0), 0, 0, 0, false);
  const stripe = mesh(cylGeo(0.113, 0.108, 0.05, 10), mat(0xe63946), 0, 0.05, 0, false);
  bucket.add(body, stripe);
  bucket.rotation.z = Math.PI / 2 - 0.25;
  bucket.position.set(0.42, 0.1, 0.18);
  g.add(bucket);
  return g;
}

export interface GullRig {
  group: THREE.Group;
  body: THREE.Group;
  wingL: THREE.Group;
  wingR: THREE.Group;
}

export function buildGull(): GullRig {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const white = mat(0xfdfdf8, { flat: false, rough: 0.7 });
  const gray = mat(0xb9c4c9);
  const b = mesh(sphGeo(0.24, 10, 8), white, 0, 0.24, 0, false);
  b.scale.set(0.85, 0.75, 1.25);
  body.add(b);
  const head = mesh(sphGeo(0.14, 8, 6), white, 0, 0.42, 0.24, false);
  body.add(head);
  const beak = mesh(coneGeo(0.04, 0.16, 6), mat(0xffa629), 0, 0.4, 0.42, false);
  beak.rotation.x = Math.PI / 2;
  body.add(beak);
  const eyeL = mesh(sphGeo(0.025, 6, 4), mat(0x14100c), -0.07, 0.46, 0.32, false);
  const eyeR = mesh(sphGeo(0.025, 6, 4), mat(0x14100c), 0.07, 0.46, 0.32, false);
  body.add(eyeL, eyeR);
  const tail = mesh(boxGeo(0.14, 0.03, 0.2), gray, 0, 0.26, -0.3, false);
  body.add(tail);
  // wings: pivot groups at the shoulders, flapped in scene
  const wingL = new THREE.Group();
  wingL.position.set(-0.12, 0.32, 0);
  const wl = mesh(boxGeo(0.52, 0.04, 0.24), gray, -0.26, 0, 0, false);
  wingL.add(wl);
  const wingR = new THREE.Group();
  wingR.position.set(0.12, 0.32, 0);
  const wr = mesh(boxGeo(0.52, 0.04, 0.24), gray, 0.26, 0, 0, false);
  wingR.add(wr);
  body.add(wingL, wingR);
  return { group, body, wingL, wingR };
}

export function buildScorch(): THREE.Mesh {
  const geo = new THREE.CircleGeometry(0.85, 14);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: 0x241a12, roughness: 1, transparent: true, opacity: 0.72,
  }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

// ============================================================================
// ENVIRONMENT — the picturesque zoo corner. Everything procedural.
// ============================================================================
import {
  ARENA, POND, MUD, PLATFORM, GATES, HIDING_SPOTS, BENCHES, PICNIC_TABLES,
  TRASH_CANS, LAMPS, TREES, CART_SPOT,
} from './constants';

// deterministic rng for stable decoration layout
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface EnvRefs {
  water: THREE.Mesh;
  waterBase: Float32Array;
  flags: THREE.Group[];
  clouds: THREE.Group[];
  cart: THREE.Group;
  cakeCart: THREE.Group;
  balloons: THREE.Group;
  tvCam: THREE.Group;
  trashCans: THREE.Group[];
  gateDoors: THREE.Group;
  doorL: THREE.Group;
  doorR: THREE.Group;
  platformY: number;
}

function bunting(x0: number, z0: number, x1: number, z1: number, y: number, sag: number): THREE.Group {
  const g = new THREE.Group();
  const cols = [0xff5d8f, 0xffbe0b, 0x3a86ff, 0x06d6a0, 0xfb5607, 0x8338ec];
  const n = 12;
  const triGeo = new THREE.BufferGeometry();
  triGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -0.22, 0, 0, 0.22, 0, 0, 0, -0.44, 0,
  ]), 3));
  triGeo.computeVertexNormals();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    const yy = y - Math.sin(t * Math.PI) * sag;
    if (i < n) {
      const seg = mesh(boxGeo(Math.hypot(x1 - x0, z1 - z0) / n, 0.03, 0.03), mat(0xeeeeee), 0, 0, 0, false);
      const t2 = (i + 0.5) / n;
      seg.position.set(x0 + (x1 - x0) * t2, y - Math.sin(t2 * Math.PI) * sag, z0 + (z1 - z0) * t2);
      seg.rotation.y = Math.atan2(z1 - z0, x1 - x0) * -1;
      seg.rotation.z = Math.cos(t2 * Math.PI) * sag * 0.4;
      g.add(seg);
    }
    const tri = new THREE.Mesh(triGeo, mat(cols[i % cols.length]));
    tri.position.set(x, yy, z);
    tri.rotation.y = Math.atan2(z1 - z0, x1 - x0) * -1 + Math.PI / 2;
    tri.castShadow = false;
    tri.userData.wavePhase = t * 6;
    g.add(tri);
  }
  return g;
}

// Instanced vegetation: trees, bushes and tall grass are collected as
// transform+color lists and rendered via a handful of InstancedMeshes to keep
// draw calls low.
interface Veg {
  trunks: THREE.Matrix4[];
  canopies: THREE.Matrix4[];
  canopyColors: THREE.Color[];
  bushBlobs: THREE.Matrix4[];
  bushColors: THREE.Color[];
  grassCones: THREE.Matrix4[];
  reeds: THREE.Matrix4[];
}

function vegCollector(): Veg {
  return { trunks: [], canopies: [], canopyColors: [], bushBlobs: [], bushColors: [], grassCones: [], reeds: [] };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

function pushTree(veg: Veg, x: number, z: number, s: number, rng: () => number): void {
  veg.trunks.push(new THREE.Matrix4().makeTranslation(x, 1.2 * s, z).scale(new THREE.Vector3(s, s, s)));
  const g1 = new THREE.Color(rng() > 0.5 ? 0x4f9d3a : 0x5fb347);
  const g2 = new THREE.Color(rng() > 0.5 ? 0x67bd4e : 0x4f9d3a);
  _q.identity();
  veg.canopies.push(_m.compose(_v.set(x, 3.1 * s, z), _q, _s.set(1.6 * s, 1.35 * s, 1.6 * s)).clone());
  veg.canopyColors.push(g1);
  veg.canopies.push(_m.compose(_v.set(x + 0.7 * s, 3.9 * s, z + 0.3 * s), _q, _s.set(1.1 * s, 1.0 * s, 1.1 * s)).clone());
  veg.canopyColors.push(g2);
  veg.canopies.push(_m.compose(_v.set(x - 0.8 * s, 3.7 * s, z - 0.4 * s), _q, _s.set(0.9 * s, 0.85 * s, 0.9 * s)).clone());
  veg.canopyColors.push(g1);
}

function pushBush(veg: Veg, x: number, z: number, r: number, tall: boolean, rng: () => number): void {
  _q.identity();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.6;
    const rr = r * 0.45;
    const sc = r * (0.45 + (i % 2) * 0.18);
    veg.bushBlobs.push(_m.compose(_v.set(x + Math.sin(a) * rr, r * 0.32, z + Math.cos(a) * rr), _q, _s.set(sc, sc * 0.72, sc)).clone());
    veg.bushColors.push(new THREE.Color(i % 2 ? 0x3f8f33 : 0x55aa3f));
  }
  if (tall) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      _e.set(0, rng() * 3, (rng() - 0.5) * 0.35);
      _q.setFromEuler(_e);
      veg.grassCones.push(_m.compose(_v.set(x + Math.sin(a) * r * 0.5, 0.65, z + Math.cos(a) * r * 0.5), _q, _s.set(1, 1, 1)).clone());
    }
    _q.identity();
  }
}

function fenceSegment(x0: number, z0: number, x1: number, z1: number, posts: THREE.Matrix4[]): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ang = Math.atan2(z1 - z0, x1 - x0);
  const cream = mat(COLORS.fence);
  for (const hy of [0.55, 1.0]) {
    const rail = mesh(boxGeo(len, 0.1, 0.07), cream, (x0 + x1) / 2, hy, (z0 + z1) / 2);
    rail.rotation.y = -ang;
    rail.castShadow = false;
    fenceGroup.add(rail);
  }
  const n = Math.max(2, Math.round(len / 2.6));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const m = new THREE.Matrix4().makeTranslation(x0 + (x1 - x0) * t, 0.55, z0 + (z1 - z0) * t);
    posts.push(m);
  }
}

const fenceGroup = new THREE.Group();

export function buildEnvironment(scene: THREE.Scene): EnvRefs {
  fenceGroup.clear();
  const rng = mulberry32(1337);
  const H = ARENA.half;
  const veg = vegCollector();

  // ---- outer ground (sand) ----
  const outer = new THREE.Mesh(new THREE.CircleGeometry(90, 40), mat(COLORS.sand));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.06;
  outer.receiveShadow = true;
  scene.add(outer);

  // ---- inner grass with vertex color variation ----
  const grassGeo = new THREE.PlaneGeometry(H * 2 + 1, H * 2 + 1, 40, 40);
  grassGeo.rotateX(-Math.PI / 2);
  const pos = grassGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cA = new THREE.Color(COLORS.grass);
  const cB = new THREE.Color(COLORS.grassDark);
  const cC = new THREE.Color(0x7cc24f);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const n = Math.sin(x * 0.35 + 5) * Math.cos(z * 0.3) + Math.sin(x * 0.12) * Math.sin(z * 0.17 + 2);
    tmp.copy(n > 0 ? cA : cB).lerp(cC, Math.abs(n) * 0.35 + rng() * 0.08);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
    pos.setY(i, rng() * 0.05);
  }
  grassGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  grassGeo.computeVertexNormals();
  const grass = new THREE.Mesh(grassGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  grass.receiveShadow = true;
  scene.add(grass);

  // ---- tourist path beyond south fence ----
  const path = mesh(boxGeo(96, 0.1, ARENA.pathZ1 - ARENA.pathZ0 + 3), mat(COLORS.path), 0, -0.04, (ARENA.pathZ0 + ARENA.pathZ1) / 2 + 1, false);
  path.receiveShadow = true;
  scene.add(path);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(9, 24), mat(COLORS.path), );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.005, 33);
  plaza.receiveShadow = true;
  scene.add(plaza);
  // interior sandy patches
  for (const [px, pz, pr] of [[0, 26, 4.5], [2, 0, 3.5], [10, -12, 2.6]] as const) {
    const patch = new THREE.Mesh(new THREE.CircleGeometry(pr, 20), mat(0xe0cd9a));
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(px, 0.02, pz);
    patch.receiveShadow = true;
    scene.add(patch);
  }

  // ---- pond ----
  const rim = new THREE.Mesh(new THREE.CircleGeometry(1, 36), mat(0xe0cd9a));
  rim.rotation.x = -Math.PI / 2;
  rim.scale.set(POND.rx + 1.6, POND.rz + 1.6, 1);
  rim.position.set(POND.cx, 0.015, POND.cz);
  rim.receiveShadow = true;
  scene.add(rim);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(1, 30), mat(0x1f6f78));
  bottom.rotation.x = -Math.PI / 2;
  bottom.scale.set(POND.rx, POND.rz, 1);
  bottom.position.set(POND.cx, -0.25, POND.cz);
  scene.add(bottom);
  const waterGeo = new THREE.CircleGeometry(1, 36, );
  const water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({
    color: COLORS.water, transparent: true, opacity: 0.78, roughness: 0.25, metalness: 0.05,
  }));
  waterGeo.rotateX(-Math.PI / 2);
  water.scale.set(POND.rx, 1, POND.rz);
  water.position.set(POND.cx, 0.12, POND.cz);
  water.receiveShadow = true;
  scene.add(water);
  const waterBase = new Float32Array((waterGeo.attributes.position as THREE.BufferAttribute).array);
  // lily pads + reeds
  for (let i = 0; i < 5; i++) {
    const a = rng() * Math.PI * 2;
    const rr = rng() * 0.55;
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.45 + rng() * 0.25, 10), mat(0x2e8b57));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(POND.cx + Math.sin(a) * POND.rx * rr, 0.16, POND.cz + Math.cos(a) * POND.rz * rr);
    scene.add(pad);
  }
  for (let i = 0; i < 12; i++) {
    const a = rng() * Math.PI * 2;
    const sc = 0.9 + rng() * 0.5;
    veg.reeds.push(new THREE.Matrix4().makeTranslation(
      POND.cx + Math.sin(a) * (POND.rx + 0.7), 0.6 * sc, POND.cz + Math.cos(a) * (POND.rz + 0.7),
    ).scale(new THREE.Vector3(1, sc, 1)));
  }

  // ---- mud patch ----
  const mudPatch = new THREE.Mesh(new THREE.CircleGeometry(MUD.r, 20), mat(COLORS.mud, { rough: 1 }));
  mudPatch.rotation.x = -Math.PI / 2;
  mudPatch.position.set(MUD.cx, 0.03, MUD.cz);
  mudPatch.receiveShadow = true;
  scene.add(mudPatch);

  // ---- perimeter fence ----
  scene.add(fenceGroup);
  const postMatrices: THREE.Matrix4[] = [];
  const gap = GATES.fenceGap;
  fenceSegment(-H, -H, H, -H, postMatrices); // north
  fenceSegment(H, -H, H, H, postMatrices); // east
  fenceSegment(-H, H, gap.x0 - 0.8, H, postMatrices); // south-left of gate
  fenceSegment(gap.x1 + 0.8, H, H, H, postMatrices); // south-right of gate
  fenceSegment(-H, -H, -H, -2, postMatrices); // west lower
  fenceSegment(-H, 2, -H, H, postMatrices); // west upper (keeper gate gap)
  const postGeo = boxGeo(0.16, 1.15, 0.16);
  const postInst = new THREE.InstancedMesh(postGeo, mat(COLORS.fence), postMatrices.length);
  postMatrices.forEach((m, i) => postInst.setMatrixAt(i, m));
  postInst.castShadow = false;
  postInst.receiveShadow = true;
  scene.add(postInst);

  // ---- main gate (south): posts, arch, sign, double doors ----
  const gateG = new THREE.Group();
  const postMat = mat(0x8b6b4a);
  const gpL = mesh(cylGeo(0.22, 0.26, 3.2, 8), postMat, gap.x0 - 0.4, 1.6, H);
  const gpR = mesh(cylGeo(0.22, 0.26, 3.2, 8), postMat, gap.x1 + 0.4, 1.6, H);
  const arch = mesh(boxGeo(gap.x1 - gap.x0 + 2.2, 0.5, 0.4), postMat, (gap.x0 + gap.x1) / 2, 3.3, H);
  gateG.add(gpL, gpR, arch);
  // sign board with painted capybara silhouette
  const sign = mesh(boxGeo(4.6, 1.0, 0.15), mat(0x6ab04c), (gap.x0 + gap.x1) / 2, 2.6, H + 0.1);
  const signTrim = mesh(boxGeo(4.8, 0.12, 0.18), mat(0xf3ead3), (gap.x0 + gap.x1) / 2, 3.12, H + 0.1, false);
  const capyIcon = mesh(boxGeo(1.4, 0.5, 0.06), mat(COLORS.capybara), (gap.x0 + gap.x1) / 2 - 0.9, 2.55, H + 0.2, false);
  const capyHead = mesh(boxGeo(0.4, 0.4, 0.06), mat(COLORS.capybaraDark), (gap.x0 + gap.x1) / 2 - 0.15, 2.6, H + 0.2, false);
  gateG.add(sign, signTrim, capyIcon, capyHead);
  scene.add(gateG);
  // doors (closed by default; open for event / smashed by upgrade)
  const gateDoors = new THREE.Group();
  const doorL = new THREE.Group();
  const doorR = new THREE.Group();
  const doorMat = mat(0xa9744f);
  const dl = mesh(boxGeo((gap.x1 - gap.x0) / 2 - 0.1, 1.5, 0.12), doorMat, (gap.x1 - gap.x0) / 4, 0.85, 0);
  const dr = mesh(boxGeo((gap.x1 - gap.x0) / 2 - 0.1, 1.5, 0.12), doorMat, -(gap.x1 - gap.x0) / 4, 0.85, 0);
  doorL.add(dl);
  doorR.add(dr);
  doorL.position.set(gap.x0, 0, H);
  doorR.position.set(gap.x1, 0, H);
  gateDoors.add(doorL, doorR);
  scene.add(gateDoors);

  // keeper gate frame (west)
  const kgL = mesh(cylGeo(0.18, 0.22, 2.2, 8), postMat, -H, 1.1, -2);
  const kgR = mesh(cylGeo(0.18, 0.22, 2.2, 8), postMat, -H, 1.1, 2);
  const kgTop = mesh(boxGeo(0.3, 0.3, 4.6), postMat, -H, 2.3, 0);
  scene.add(kgL, kgR, kgTop);

  // ---- viewing platform / boardwalk ----
  const plat = new THREE.Group();
  const deckW = PLATFORM.x1 - PLATFORM.x0;
  const deckD = PLATFORM.z1 - PLATFORM.z0;
  const deck = mesh(boxGeo(deckW, 0.5, deckD), mat(COLORS.wood), (PLATFORM.x0 + PLATFORM.x1) / 2, 0.28, (PLATFORM.z0 + PLATFORM.z1) / 2);
  deck.receiveShadow = true;
  plat.add(deck);
  // plank lines
  for (let i = 0; i < deckW / 1.4; i++) {
    const line = mesh(boxGeo(0.06, 0.02, deckD), mat(COLORS.woodDark), PLATFORM.x0 + 0.7 + i * 1.4, 0.54, (PLATFORM.z0 + PLATFORM.z1) / 2, false);
    plat.add(line);
  }
  // railing on the enclosure side
  const railMat = mat(COLORS.woodDark);
  const topRail = mesh(boxGeo(deckW, 0.09, 0.09), railMat, (PLATFORM.x0 + PLATFORM.x1) / 2, 1.35, PLATFORM.z0 + 0.1, false);
  plat.add(topRail);
  for (let i = 0; i <= deckW / 2.2; i++) {
    plat.add(mesh(boxGeo(0.09, 0.85, 0.09), railMat, PLATFORM.x0 + 0.2 + i * 2.2, 0.95, PLATFORM.z0 + 0.1, false));
  }
  // steps at east end
  for (let i = 0; i < 3; i++) {
    plat.add(mesh(boxGeo(1.6, 0.18, 0.5), mat(COLORS.wood), PLATFORM.x1 + 0.4, 0.12 + i * 0.14, PLATFORM.z1 - 0.6 - i * 0.45, false));
  }
  scene.add(plat);

  // ---- benches / picnic tables ----
  for (const b of BENCHES) {
    const g = new THREE.Group();
    const seat = mesh(boxGeo(2.0, 0.12, 0.6), mat(COLORS.wood), 0, 0.55, 0);
    const back = mesh(boxGeo(2.0, 0.5, 0.1), mat(COLORS.wood), 0, 0.95, -0.28);
    const legL = mesh(boxGeo(0.12, 0.55, 0.5), mat(COLORS.woodDark), -0.8, 0.28, 0);
    const legR = mesh(boxGeo(0.12, 0.55, 0.5), mat(COLORS.woodDark), 0.8, 0.28, 0);
    g.add(seat, back, legL, legR);
    g.position.set(b.x, 0, b.z);
    g.rotation.y = b.rot;
    scene.add(g);
  }
  for (const t of PICNIC_TABLES) {
    const g = new THREE.Group();
    const top = mesh(boxGeo(2.2, 0.12, 1.0), mat(COLORS.wood), 0, 0.8, 0);
    const bL = mesh(boxGeo(2.2, 0.1, 0.35), mat(COLORS.wood), 0, 0.5, -0.85);
    const bR = mesh(boxGeo(2.2, 0.1, 0.35), mat(COLORS.wood), 0, 0.5, 0.85);
    const legA = mesh(boxGeo(0.12, 0.8, 1.6), mat(COLORS.woodDark), -0.9, 0.4, 0);
    const legB = mesh(boxGeo(0.12, 0.8, 1.6), mat(COLORS.woodDark), 0.9, 0.4, 0);
    g.add(top, bL, bR, legA, legB);
    g.position.set(t.x, 0, t.z);
    g.rotation.y = t.rot;
    scene.add(g);
  }

  // ---- trash cans (tippable) ----
  const trashCans: THREE.Group[] = [];
  for (const tc of TRASH_CANS) {
    const g = new THREE.Group();
    const body = mesh(cylGeo(0.42, 0.36, 0.95, 10), mat(0x4a7c59), 0, 0.48, 0);
    const lid = mesh(cylGeo(0.46, 0.46, 0.1, 10), mat(0x3a6247), 0, 1.0, 0);
    g.add(body, lid);
    g.position.set(tc.x, 0, tc.z);
    trashCans.push(g);
    scene.add(g);
  }

  // ---- lamp posts ----
  for (const l of LAMPS) {
    const g = new THREE.Group();
    g.add(mesh(cylGeo(0.09, 0.13, 3.4, 7), mat(0x3a3f4a), 0, 1.7, 0));
    g.add(mesh(boxGeo(0.5, 0.3, 0.5), mat(0x3a3f4a), 0, 3.5, 0));
    g.add(mesh(sphGeo(0.18, 8, 6), mat(0xfff2b0, { emissive: 0xffdf80, emissiveIntensity: 1.2 }), 0, 3.38, 0, false));
    g.position.set(l.x, 0, l.z);
    scene.add(g);
  }

  // ---- hiding bushes + decorative bushes (instanced) ----
  for (const s of HIDING_SPOTS) pushBush(veg, s.x, s.z, s.r * 0.8, true, rng);
  for (let i = 0; i < 8; i++) {
    const bx = (rng() * 2 - 1) * (H - 3);
    const bz = (rng() * 2 - 1) * (H - 3);
    if (Math.abs(bx - POND.cx) < 10 && Math.abs(bz - POND.cz) < 8) continue;
    pushBush(veg, bx, bz, 0.9 + rng() * 0.5, false, rng);
  }

  // ---- trees inside + forest beyond the fence (instanced) ----
  for (const t of TREES) pushTree(veg, t.x, t.z, t.s, rng);
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const rr = 42 + rng() * 30;
    const tx = Math.sin(a) * rr;
    const tz = Math.cos(a) * rr;
    if (tz > ARENA.pathZ0 - 2 && tz < ARENA.pathZ1 + 2 && Math.abs(tx) < 46) continue; // keep path clear
    pushTree(veg, tx, tz, 0.9 + rng() * 0.9, rng);
  }

  // ---- flowers & rocks (instanced) ----
  const flowerGeo = sphGeo(0.1, 6, 5);
  const flowerCols = [0xffffff, 0xffd93d, 0xff8fb1];
  for (let c = 0; c < 3; c++) {
    const inst = new THREE.InstancedMesh(flowerGeo, mat(flowerCols[c], { rough: 0.7 }), 40);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 40; i++) {
      const fx = (rng() * 2 - 1) * (H - 1.5);
      const fz = (rng() * 2 - 1) * (H - 1.5);
      m.makeTranslation(fx, 0.12, fz);
      inst.setMatrixAt(i, m);
    }
    inst.castShadow = false;
    scene.add(inst);
  }
  const rockGeo = new THREE.DodecahedronGeometry(0.45);
  const rockInst = new THREE.InstancedMesh(rockGeo, mat(0x9b9b93), 16);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < 16; i++) {
      e.set(rng() * 3, rng() * 3, rng() * 3);
      q.setFromEuler(e);
      const s = 0.5 + rng();
      m.compose(new THREE.Vector3((rng() * 2 - 1) * (H - 2), 0.15, (rng() * 2 - 1) * (H - 2)), q, new THREE.Vector3(s, s * 0.7, s));
      rockInst.setMatrixAt(i, m);
    }
  }
  rockInst.castShadow = true;
  rockInst.receiveShadow = true;
  scene.add(rockInst);

  // ---- commit instanced vegetation ----
  {
    const trunkInst = new THREE.InstancedMesh(cylGeo(0.25, 0.38, 2.4, 7), mat(0x7a5230), veg.trunks.length);
    veg.trunks.forEach((m, i) => trunkInst.setMatrixAt(i, m));
    trunkInst.castShadow = true;
    scene.add(trunkInst);

    const canopyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
    const canopyInst = new THREE.InstancedMesh(sphGeo(1, 9, 7), canopyMat, veg.canopies.length);
    veg.canopies.forEach((m, i) => canopyInst.setMatrixAt(i, m));
    veg.canopyColors.forEach((c, i) => canopyInst.setColorAt(i, c));
    canopyInst.castShadow = true;
    scene.add(canopyInst);

    const bushMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
    const bushInst = new THREE.InstancedMesh(sphGeo(1, 8, 6), bushMat, veg.bushBlobs.length);
    veg.bushBlobs.forEach((m, i) => bushInst.setMatrixAt(i, m));
    veg.bushColors.forEach((c, i) => bushInst.setColorAt(i, c));
    bushInst.castShadow = true;
    scene.add(bushInst);

    const grassInst = new THREE.InstancedMesh(coneGeo(0.16, 1.4, 5), mat(0x7cc24f), veg.grassCones.length);
    veg.grassCones.forEach((m, i) => grassInst.setMatrixAt(i, m));
    grassInst.castShadow = false;
    scene.add(grassInst);

    const reedInst = new THREE.InstancedMesh(coneGeo(0.06, 1.5, 5), mat(0x3e7d44), veg.reeds.length);
    veg.reeds.forEach((m, i) => reedInst.setMatrixAt(i, m));
    reedInst.castShadow = false;
    scene.add(reedInst);
  }

  // ---- bunting flags ----
  const flags: THREE.Group[] = [];
  flags.push(bunting(gap.x0 - 0.4, H, gap.x0 - 14, H, 3.1, 0.7));
  flags.push(bunting(gap.x1 + 0.4, H, gap.x1 + 14, H, 3.1, 0.7));
  flags.push(bunting(-H + 2, -H, H - 2, -H, 2.6, 1.2));
  flags.push(bunting(-H, 2.4, -H, 18, 2.6, 1.0));
  for (const f of flags) scene.add(f);

  // ---- clouds ----
  const clouds: THREE.Group[] = [];
  const cloudMat = mat(0xffffff, { flat: false, rough: 1 });
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const n = 2 + Math.floor(rng() * 2);
    for (let j = 0; j < n; j++) {
      const s = mesh(sphGeo(2 + rng() * 1.5, 8, 6), cloudMat, j * 2.2 - n, rng() * 0.6, rng() * 1.5 - 0.75, false);
      s.scale.y = 0.55;
      g.add(s);
    }
    g.position.set((rng() * 2 - 1) * 70, 24 + rng() * 10, (rng() * 2 - 1) * 70);
    clouds.push(g);
    scene.add(g);
  }

  // ---- food cart / cake cart (event props, hidden by default) ----
  const cart = new THREE.Group();
  {
    const body = mesh(boxGeo(2.2, 1.2, 1.2), mat(0xe63946), 0, 0.9, 0);
    const counter = mesh(boxGeo(2.4, 0.1, 1.4), mat(0xf1faee), 0, 1.55, 0);
    const wL = mesh(cylGeo(0.3, 0.3, 0.15, 10), mat(0x333333), -0.8, 0.3, 0.65);
    const wR = mesh(cylGeo(0.3, 0.3, 0.15, 10), mat(0x333333), 0.8, 0.3, 0.65);
    wL.rotation.x = Math.PI / 2;
    wR.rotation.x = Math.PI / 2;
    const pole = mesh(cylGeo(0.05, 0.05, 1.6, 6), mat(0xdddddd), 0, 2.3, 0);
    const umb = mesh(coneGeo(1.5, 0.7, 10), mat(0xffbe0b), 0, 3.2, 0);
    cart.add(body, counter, wL, wR, pole, umb);
    for (let i = 0; i < 4; i++) {
      cart.add(mesh(boxGeo(0.3, 0.25, 0.3), mat(SHIRTS[i % SHIRTS.length]), -0.7 + i * 0.45, 1.75, 0, false));
    }
    cart.position.set(CART_SPOT.x, 0, CART_SPOT.z);
    cart.visible = false;
    scene.add(cart);
  }
  const cakeCart = new THREE.Group();
  {
    const body = mesh(boxGeo(2.2, 1.2, 1.2), mat(0xff8fb1), 0, 0.9, 0);
    const counter = mesh(boxGeo(2.4, 0.1, 1.4), mat(0xfff0f5), 0, 1.55, 0);
    const wL = mesh(cylGeo(0.3, 0.3, 0.15, 10), mat(0x333333), -0.8, 0.3, 0.65);
    const wR = mesh(cylGeo(0.3, 0.3, 0.15, 10), mat(0x333333), 0.8, 0.3, 0.65);
    wL.rotation.x = Math.PI / 2;
    wR.rotation.x = Math.PI / 2;
    const cakeB = mesh(cylGeo(0.55, 0.6, 0.35, 12), mat(0xfff0f5), 0, 1.8, 0);
    const cakeT = mesh(cylGeo(0.38, 0.42, 0.3, 12), mat(0xffb3c6), 0, 2.1, 0);
    const cherry = mesh(sphGeo(0.1, 8, 6), mat(0xe63946), 0, 2.32, 0, false);
    cakeCart.add(body, counter, wL, wR, cakeB, cakeT, cherry);
    cakeCart.position.set(CART_SPOT.x, 0, CART_SPOT.z);
    cakeCart.visible = false;
    scene.add(cakeCart);
  }
  // balloons
  const balloons = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const bg = new THREE.Group();
    const b = mesh(sphGeo(0.32, 10, 8), mat(SHIRTS[(i * 3) % SHIRTS.length], { flat: false, rough: 0.4 }), 0, 0, 0, false);
    const str = mesh(cylGeo(0.01, 0.01, 2.2, 4), mat(0xdddddd), 0, -1.2, 0, false);
    bg.add(b, str);
    bg.position.set(CART_SPOT.x - 3 + i * 1.2, 3 + (i % 2) * 0.5, CART_SPOT.z - 2.5);
    bg.userData.bob = i * 1.1;
    balloons.add(bg);
  }
  balloons.visible = false;
  scene.add(balloons);

  // ---- TV camera prop ----
  const tvCam = new THREE.Group();
  {
    const legMat = mat(0x333333);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = mesh(cylGeo(0.04, 0.04, 1.6, 5), legMat, Math.sin(a) * 0.4, 0.8, Math.cos(a) * 0.4, false);
      leg.rotation.x = Math.cos(a) * 0.35;
      leg.rotation.z = -Math.sin(a) * 0.35;
      tvCam.add(leg);
    }
    tvCam.add(mesh(boxGeo(0.6, 0.4, 0.9), mat(0x222831), 0, 1.75, 0));
    tvCam.add(mesh(cylGeo(0.15, 0.18, 0.4, 8), mat(0x111111), 0, 1.75, 0.6, false));
    const light = mesh(boxGeo(0.2, 0.2, 0.1), mat(0xff3b3b, { emissive: 0xff3b3b, emissiveIntensity: 2 }), 0.25, 2.05, 0, false);
    tvCam.add(light);
    tvCam.position.set(-8, 0, 21);
    tvCam.rotation.y = 0.6;
    tvCam.visible = false;
    scene.add(tvCam);
  }

  return {
    water, waterBase, flags, clouds, cart, cakeCart, balloons, tvCam, trashCans, gateDoors, doorL, doorR,
    platformY: PLATFORM.y,
  };
}
