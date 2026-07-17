// ============================================================================
// Scene: owns the Three.js renderer, camera, lights and all meshes. Reads the
// World each frame and plays it back with juice: squash & stretch, waddles,
// particles, screen shake, animated water, pupil tracking.
// ============================================================================

import * as THREE from 'three';
import { World } from './world';
import { POND, MUD, GATES } from './constants';
import {
  buildCapybara, buildTourist, buildKeeper, buildDrone, buildDart, buildFoodMesh,
  buildEnvironment, mat,
} from './meshes';
import type { CapybaraRig, TouristRig, KeeperRig, DroneRig, EnvRefs } from './meshes';
import { ParticleSystem } from './particles';
import type { GameEvent } from './types';
import * as THREE_CORE from 'three';

const _v = new THREE.Vector3();

export class GameScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  private env: EnvRefs;
  private capy: CapybaraRig;
  private touristRigs = new Map<number, TouristRig>();
  private keeperRigs = new Map<number, KeeperRig>();
  private dartMeshes = new Map<number, THREE.Group>();
  private foodMeshes = new Map<number, THREE.Group>();
  private drone: DroneRig;
  private particles: ParticleSystem;
  private camTarget = new THREE.Vector3(6, 0, -8);
  private camPos = new THREE.Vector3(6, 14, 8);
  private shake = 0;
  private time = 0;
  private rainPoints: THREE.Points | null = null;
  private onPopup: (x: number, z: number, text: string, cls: string) => void;
  private sun: THREE.DirectionalLight;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, onPopup: (x: number, z: number, text: string, cls: string) => void) {
    this.onPopup = onPopup;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9ad6f0);
    this.scene.fog = new THREE.Fog(0xb7e3f4, 55, 130);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);

    // ---- lighting: warm afternoon sun + sky fill ----
    this.sun = new THREE.DirectionalLight(0xffe8c0, 2.6);
    this.sun.position.set(28, 38, 18);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -42;
    this.sun.shadow.camera.right = 42;
    this.sun.shadow.camera.top = 42;
    this.sun.shadow.camera.bottom = -42;
    this.sun.shadow.camera.near = 5;
    this.sun.shadow.camera.far = 100;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    const hemi = new THREE.HemisphereLight(0x9ecfff, 0x6ab04c, 0.85);
    this.scene.add(hemi);
    const warm = new THREE.AmbientLight(0xffe0b3, 0.25);
    this.scene.add(warm);

    // ---- environment ----
    this.env = buildEnvironment(this.scene);

    // ---- capybara ----
    this.capy = buildCapybara();
    this.scene.add(this.capy.group);

    // ---- drone ----
    this.drone = buildDrone();
    this.drone.group.visible = false;
    this.drone.spot.visible = false;
    this.scene.add(this.drone.group);
    this.scene.add(this.drone.spot);

    // ---- particles ----
    this.particles = new ParticleSystem();
    this.scene.add(this.particles.points);

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  private resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  dispose(): void {
    this.disposed = true;
    window.removeEventListener('resize', this.resize);
    this.particles.dispose();
    this.renderer.dispose();
  }

  /** Reset per-run visuals: clear dynamic rigs, set event props. */
  resetForRun(world: World): void {
    for (const [, r] of this.touristRigs) this.scene.remove(r.group);
    this.touristRigs.clear();
    for (const [, r] of this.keeperRigs) this.scene.remove(r.group);
    this.keeperRigs.clear();
    for (const [, m] of this.dartMeshes) this.scene.remove(m);
    this.dartMeshes.clear();
    for (const [, m] of this.foodMeshes) this.scene.remove(m);
    this.foodMeshes.clear();

    // event props
    this.env.cart.visible = world.config.event === 'foodcart';
    this.env.cakeCart.visible = world.config.event === 'birthday';
    this.env.balloons.visible = world.config.event === 'birthday';
    this.env.tvCam.visible = world.config.event === 'tvcrew';
    if (world.config.event === 'foodcart' && world.cart) {
      this.env.cart.position.set(world.cart.x, 0, world.cart.z);
    }
    if (world.config.event === 'birthday' && world.cart) {
      this.env.cakeCart.position.set(world.cart.x, 0, world.cart.z);
    }

    // rain
    if (this.rainPoints) {
      this.scene.remove(this.rainPoints);
      this.rainPoints = null;
    }
    if (world.config.event === 'rain') {
      const n = 400;
      const g = new THREE.BufferGeometry();
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = (Math.random() * 2 - 1) * 45;
        arr[i * 3 + 1] = Math.random() * 25;
        arr[i * 3 + 2] = (Math.random() * 2 - 1) * 45;
      }
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const m = new THREE.PointsMaterial({ color: 0xaccbe8, size: 0.14, transparent: true, opacity: 0.7 });
      this.rainPoints = new THREE.Points(g, m);
      this.rainPoints.frustumCulled = false;
      this.scene.add(this.rainPoints);
      // gloomier sky
      this.scene.background = new THREE.Color(0x8fb4c9);
      this.scene.fog = new THREE.Fog(0x9dbccb, 40, 100);
      this.sun.intensity = 1.6;
    } else {
      this.scene.background = new THREE.Color(0x9ad6f0);
      this.scene.fog = new THREE.Fog(0xb7e3f4, 55, 130);
      this.sun.intensity = 2.6;
    }

    this.camTarget.set(world.player.x, 0, world.player.z);
  }

  private ensureTouristRigs(world: World): void {
    for (const t of world.tourists.values()) {
      if (!this.touristRigs.has(t.id)) {
        const rig = buildTourist(t);
        this.touristRigs.set(t.id, rig);
        this.scene.add(rig.group);
      }
    }
    for (const [id, rig] of [...this.touristRigs]) {
      if (!world.tourists.has(id)) {
        this.scene.remove(rig.group);
        this.touristRigs.delete(id);
      }
    }
  }

  private ensureKeeperRigs(world: World): void {
    for (const k of world.keepers.values()) {
      if (!this.keeperRigs.has(k.id)) {
        const rig = buildKeeper(k.elite);
        this.keeperRigs.set(k.id, rig);
        this.scene.add(rig.group);
      }
    }
    for (const [id, rig] of [...this.keeperRigs]) {
      if (!world.keepers.has(id)) {
        this.scene.remove(rig.group);
        this.keeperRigs.delete(id);
      }
    }
  }

  private ensureItemMeshes(world: World): void {
    for (const d of world.darts.values()) {
      if (!this.dartMeshes.has(d.id)) {
        const m = buildDart();
        this.dartMeshes.set(d.id, m);
        this.scene.add(m);
      }
    }
    for (const [id, m] of [...this.dartMeshes]) {
      if (!world.darts.has(id)) {
        this.scene.remove(m);
        this.dartMeshes.delete(id);
      }
    }
    for (const f of world.foods.values()) {
      if (!this.foodMeshes.has(f.id)) {
        const m = buildFoodMesh(f.kind);
        m.position.set(f.x, 0.05, f.z);
        this.foodMeshes.set(f.id, m);
        this.scene.add(m);
      }
    }
    for (const [id, m] of [...this.foodMeshes]) {
      if (!world.foods.has(id)) {
        this.scene.remove(m);
        this.foodMeshes.delete(id);
      }
    }
  }

  private handleEvents(world: World): void {
    for (const e of world.events) {
      switch (e.kind) {
        case 'particles':
          this.particles.spawn(e.preset, e.x, e.z, e.count ?? 8);
          break;
        case 'popup':
          this.onPopup(e.x, e.z, e.text, e.cls);
          break;
        case 'shake':
          this.shake = Math.min(this.shake + e.mag, 1.4);
          break;
        default:
          break;
      }
    }
  }

  /** Project a world position to CSS pixels (for DOM score popups). */
  project(x: number, z: number, y = 1.5): { x: number; y: number; visible: boolean } {
    _v.set(x, y, z).project(this.camera);
    return {
      x: (_v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-_v.y * 0.5 + 0.5) * window.innerHeight,
      visible: _v.z < 1,
    };
  }

  render(world: World, dt: number, paused: boolean): void {
    if (this.disposed) return;
    this.time += dt;
    this.ensureTouristRigs(world);
    this.ensureKeeperRigs(world);
    this.ensureItemMeshes(world);
    this.handleEvents(world);
    world.events.length = 0;

    const p = world.player;

    // ---------------- capybara rig ----------------
    const capy = this.capy;
    capy.group.position.set(p.x, 0, p.z);
    capy.group.rotation.y = p.facing;
    const speed = Math.hypot(p.vx, p.vz);
    // squash & stretch
    const squish = p.squish;
    const stretch = p.charging ? 1.12 : 1;
    capy.inner.scale.set(
      (1 + squish * 0.18) / Math.sqrt(stretch),
      (1 - squish * 0.22) * (p.animSplash > 0 ? 0.85 : 1),
      (1 + squish * 0.1) * stretch,
    );
    // run bob & leg cycle
    const bobF = p.charging ? 16 : 10;
    capy.inner.position.y = Math.abs(Math.sin(this.time * bobF)) * Math.min(speed / 10, 1) * 0.22;
    capy.inner.rotation.x = p.charging ? -0.12 : 0;
    for (let i = 0; i < 4; i++) {
      const leg = capy.legs[i];
      leg.rotation.x = Math.sin(this.time * bobF + (i % 2) * Math.PI) * Math.min(speed / 8, 1) * 0.7;
    }
    // attack anims
    if (p.animAttack > 0) {
      capy.head.position.z = 1.15 + (0.22 - p.animAttack) * 2.2;
      capy.head.position.y = 1.25 - (0.22 - p.animAttack) * 0.8;
    } else {
      capy.head.position.z = 1.15;
      capy.head.position.y = 1.25;
    }
    if (p.animHeadbutt > 0) {
      capy.inner.rotation.x = -0.35 * (p.animHeadbutt / 0.35);
    }
    if (p.animRoll > 0) {
      capy.inner.rotation.z = (0.5 - p.animRoll) * Math.PI * 2;
    } else {
      capy.inner.rotation.z = 0;
    }
    // grumpy lids + ear wiggle
    const lidBase = 0.24;
    capy.lidL.position.y = lidBase + Math.sin(this.time * 0.7) * 0.01;
    capy.lidR.position.y = lidBase + Math.sin(this.time * 0.7 + 1) * 0.01;
    capy.earL.rotation.z = Math.sin(this.time * 2.1) * 0.12;
    capy.earR.rotation.z = -Math.sin(this.time * 2.3) * 0.12;
    // mud visibility + hidden transparency
    capy.mud.visible = p.muddy > 0;
    const targetOpacity = p.hidden ? 0.45 : 1;
    capy.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const mm = m.material as THREE.MeshStandardMaterial;
        if (mm.transparent !== true && targetOpacity < 1) {
          mm.transparent = true;
        }
        if (mm.transparent) mm.opacity = targetOpacity;
      }
    });
    // iframes blink
    capy.group.visible = p.iframes <= 0 || Math.floor(this.time * 12) % 2 === 0;

    // ---------------- tourist rigs ----------------
    for (const t of world.tourists.values()) {
      const rig = this.touristRigs.get(t.id);
      if (!rig) continue;
      const onPlat = t.onPlatform ? this.env.platformY : 0;
      rig.group.position.set(t.x, onPlat, t.z);
      rig.group.rotation.y = t.facing;
      const spd = Math.hypot(t.vx, t.vz);
      const panic = t.mood === 'panic' || t.mood === 'flee';
      // clumsy waddle
      rig.inner.rotation.z = Math.sin(t.bob) * (panic ? 0.18 : 0.08) * Math.min(spd / 3, 1);
      rig.inner.position.y = Math.abs(Math.sin(t.bob)) * Math.min(spd / 6, 1) * 0.12;
      // limbs
      const limbF = panic ? 14 : 8;
      rig.legL.rotation.x = Math.sin(this.time * limbF + t.id) * Math.min(spd / 4, 1) * 0.8;
      rig.legR.rotation.x = -Math.sin(this.time * limbF + t.id) * Math.min(spd / 4, 1) * 0.8;
      if (panic) {
        // arms up!
        rig.armL.rotation.z = 2.6 + Math.sin(this.time * 16 + t.id) * 0.3;
        rig.armR.rotation.z = -2.6 - Math.sin(this.time * 16 + t.id) * 0.3;
      } else if (t.mood === 'feed' || t.mood === 'gawk') {
        rig.armL.rotation.z = 0.4;
        rig.armR.rotation.z = -1.1; // holding item up
      } else {
        rig.armL.rotation.z = Math.sin(this.time * limbF + t.id) * Math.min(spd / 4, 1) * 0.5;
        rig.armR.rotation.z = -Math.sin(this.time * limbF + t.id) * Math.min(spd / 4, 1) * 0.5;
      }
      // pupils track: player if near, else dart around
      let px = t.pupilX;
      let py = t.pupilY;
      const dp2 = (p.x - t.x) * (p.x - t.x) + (p.z - t.z) * (p.z - t.z);
      if (dp2 < 90 && !panic) {
        const ang = Math.atan2(p.x - t.x, p.z - t.z) - t.facing;
        px = Math.sin(ang) * 1.4;
        py = 0;
      }
      rig.pupilL.position.set(px * 0.05, py * 0.05, 0.1);
      rig.pupilR.position.set(px * 0.05, py * 0.05, 0.1);
      // eyes go huge in panic
      const eyeScale = panic ? 1.35 : 1;
      (rig.pupilL.parent as THREE.Mesh).scale.setScalar(eyeScale);
      (rig.pupilR.parent as THREE.Mesh).scale.setScalar(eyeScale);
      // slipped: lying down
      if (t.slip > 0) {
        rig.inner.rotation.x = -Math.PI / 2 + 0.2;
        rig.inner.position.y = 0.15;
      } else if (t.mood === 'pond') {
        rig.inner.rotation.x = 0;
        rig.group.position.y = -0.55; // waist-deep
      } else {
        rig.inner.rotation.x = 0;
      }
      // soaked drip tint
      rig.body.material = t.soak > 0 ? mat(0x3a5a8c) : rig.body.material;
      // hide item when dropped
      rig.itemHolder.visible = t.item !== 'none';
    }

    // ---------------- keeper rigs ----------------
    for (const k of world.keepers.values()) {
      const rig = this.keeperRigs.get(k.id);
      if (!rig) continue;
      rig.group.position.set(k.x, 0, k.z);
      rig.group.rotation.y = k.facing;
      const spd = Math.hypot(k.vx, k.vz);
      const runF = spd > 5 ? 13 : 9;
      rig.legL.rotation.x = Math.sin(this.time * runF + k.id) * Math.min(spd / 5, 1) * 0.85;
      rig.legR.rotation.x = -Math.sin(this.time * runF + k.id) * Math.min(spd / 5, 1) * 0.85;
      rig.armL.rotation.x = -Math.sin(this.time * runF + k.id) * Math.min(spd / 5, 1) * 0.6;
      rig.armR.rotation.x = Math.sin(this.time * runF + k.id) * Math.min(spd / 5, 1) * 0.6;
      rig.inner.position.y = Math.abs(Math.sin(this.time * runF)) * Math.min(spd / 8, 1) * 0.1;
      // aiming: raise tranq gun + telegraph line
      rig.gun.visible = k.mood === 'aim';
      if (k.mood === 'stunned') {
        rig.inner.rotation.z = Math.sin(this.time * 3 + k.id) * 0.12;
        rig.inner.rotation.x = 0.25;
      } else {
        rig.inner.rotation.z = 0;
        rig.inner.rotation.x = 0;
      }
    }

    // ---------------- darts & food ----------------
    for (const d of world.darts.values()) {
      const m = this.dartMeshes.get(d.id);
      if (!m) continue;
      m.position.set(d.x, 1.1, d.z);
      m.rotation.y = Math.atan2(d.vx, d.vz);
    }
    for (const f of world.foods.values()) {
      const m = this.foodMeshes.get(f.id);
      if (!m) continue;
      m.position.y = 0.05 + Math.sin(this.time * 3 + f.id) * 0.05;
      m.rotation.y = this.time * 1.5 + f.id;
    }

    // ---------------- drone ----------------
    const dr = world.drone;
    this.drone.group.visible = dr.active;
    this.drone.spot.visible = dr.active;
    if (dr.active) {
      this.drone.group.position.set(dr.x, 12 + Math.sin(this.time * 2) * 0.4, dr.z);
      this.drone.group.lookAt(this.drone.spot.position);
      for (const r of this.drone.rotors) r.rotation.y = this.time * 40;
      this.drone.spot.position.set(dr.spotX, 0.1, dr.spotZ);
    }

    // ---------------- props state ----------------
    // trash cans
    for (let i = 0; i < world.trashCans.length; i++) {
      const c = world.trashCans[i];
      const g = this.env.trashCans[i];
      if (c.toppled && g.rotation.z < Math.PI / 2 - 0.05) {
        g.rotation.z = Math.min(g.rotation.z + dt * 5, Math.PI / 2);
        g.position.y = Math.sin(Math.min(g.rotation.z / (Math.PI / 2), 1) * Math.PI) * 0.3;
      }
    }
    // cart topple
    if (world.cart) {
      const cg = world.cart.kind === 'cake' ? this.env.cakeCart : this.env.cart;
      if (world.cart.toppled && cg.rotation.z < Math.PI / 2 - 0.1) {
        cg.rotation.z = Math.min(cg.rotation.z + dt * 4, Math.PI / 2 - 0.1);
      }
    }
    // gate doors
    const open = world.gateIsOpen;
    const target = open ? 1.9 : 0;
    this.env.doorL.rotation.y += (target - this.env.doorL.rotation.y) * Math.min(dt * 3, 1);
    this.env.doorR.rotation.y += (-target - this.env.doorR.rotation.y) * Math.min(dt * 3, 1);
    if (world.gateIsBroken) {
      this.env.doorL.rotation.z = 0.5;
      this.env.doorR.rotation.z = -0.5;
      this.env.doorL.position.y = -0.3;
      this.env.doorR.position.y = -0.3;
    }

    // ---------------- ambient animation ----------------
    if (!paused) {
      // water ripple
      const wp = this.env.water.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < wp.count; i++) {
        const bx = this.env.waterBase[i * 3];
        const bz = this.env.waterBase[i * 3 + 2];
        wp.setY(i, Math.sin(this.time * 2.2 + bx * 2 + bz * 3) * 0.05 + Math.cos(this.time * 1.4 + bz * 4) * 0.03);
      }
      wp.needsUpdate = true;
      // flags wave
      for (const f of this.env.flags) {
        for (const child of f.children) {
          if (child.userData.wavePhase !== undefined) {
            child.rotation.x = Math.sin(this.time * 2.5 + child.userData.wavePhase) * 0.25;
          }
        }
      }
      // clouds drift
      for (const c of this.env.clouds) {
        c.position.x += dt * 0.6;
        if (c.position.x > 90) c.position.x = -90;
      }
      // balloons bob
      if (this.env.balloons.visible) {
        for (const b of this.env.balloons.children) {
          b.position.y = 3 + (b.userData.bob % 1) + Math.sin(this.time * 1.5 + b.userData.bob) * 0.4;
        }
      }
      // rain fall
      if (this.rainPoints) {
        const rp = this.rainPoints.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < rp.count; i++) {
          let y = rp.getY(i) - dt * 22;
          if (y < 0) y = 25;
          rp.setY(i, y);
        }
        rp.needsUpdate = true;
      }
    }

    this.particles.update(paused ? 0 : dt);

    // ---------------- camera ----------------
    const camGoal = _v.set(p.x, 0, p.z);
    this.camTarget.lerp(camGoal, Math.min(dt * 4, 1));
    const camOffset = new THREE.Vector3(0, 15.5, 10.5);
    const goalPos = this.camTarget.clone().add(camOffset);
    this.camPos.lerp(goalPos, Math.min(dt * 4, 1));
    // screen shake
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sh = this.shake * this.shake;
    const sx = (Math.random() - 0.5) * sh * 0.9;
    const sy = (Math.random() - 0.5) * sh * 0.6;
    const sz = (Math.random() - 0.5) * sh * 0.9;
    this.camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z + sz);
    this.camera.lookAt(this.camTarget.x + sx * 0.5, 0.6, this.camTarget.z + sz * 0.5);

    this.renderer.render(this.scene, this.camera);
  }
}

// re-export for convenience in App
export { THREE_CORE };
