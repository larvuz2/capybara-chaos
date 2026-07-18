// ============================================================================
// GameScene: Three.js renderer bound to the World simulation.
// Owns renderer/lights/camera/environment, character rigs keyed by entity id,
// particles, screen shake, water ripple, and 3D→2D popup projection.
// ============================================================================

import * as THREE from 'three';
import { PLATFORM, STAGES, ARENA } from './constants';
import type { World } from './world';
import type { TouristState, KeeperState } from './types';
import {
  buildCapybara, buildTourist, buildKeeper, buildDrone, buildDart, buildFoodMesh,
  buildEnvironment,
} from './meshes';
import type { CapybaraRig, TouristRig, KeeperRig, DroneRig, EnvRefs } from './meshes';
import { ParticleSystem } from './particles';
import { audio } from './audio';

export interface UiPopup {
  sx: number;
  sy: number;
  text: string;
  cls: string;
}
export interface UiNotice {
  type: 'stage' | 'banner' | 'gameover';
  title: string;
  sub: string;
  result?: 'win' | 'caught';
  stageIndex?: number;
}

const CAM_OFF = new THREE.Vector3(0, 16.5, 12);

export class GameScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private env: EnvRefs;
  private particles: ParticleSystem;
  private capy: CapybaraRig;
  private droneRig: DroneRig;
  private touristRigs = new Map<number, TouristRig>();
  private keeperRigs = new Map<number, KeeperRig>();
  private dartMeshes = new Map<number, THREE.Group>();
  private foodMeshes = new Map<number, THREE.Group>();
  private aimLines: THREE.Line[] = [];
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private shake = 0;
  private time = 0;
  private camTarget = new THREE.Vector3(6, 0, -8);
  private eventId = '';
  private weatherRain = false;
  private blinkT = 2;
  private _pv = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd7f2);
    this.scene.fog = new THREE.Fog(0xaadcf5, 60, 150);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 300);
    this.camera.position.copy(CAM_OFF).add(new THREE.Vector3(6, 0, -8));
    this.camera.lookAt(6, 0, -8);

    // ---- lighting: warm afternoon ----
    this.sun = new THREE.DirectionalLight(0xffe0b0, 2.6);
    this.sun.position.set(28, 42, 18);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -48;
    this.sun.shadow.camera.right = 48;
    this.sun.shadow.camera.top = 48;
    this.sun.shadow.camera.bottom = -48;
    this.sun.shadow.camera.far = 120;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.hemi = new THREE.HemisphereLight(0x9ecbff, 0x8fae62, 0.85);
    this.scene.add(this.hemi);

    this.env = buildEnvironment(this.scene);

    this.particles = new ParticleSystem();
    this.scene.add(this.particles.points);

    this.capy = buildCapybara();
    this.scene.add(this.capy.group);

    this.droneRig = buildDrone();
    this.droneRig.group.visible = false;
    this.droneRig.spot.visible = false;
    this.scene.add(this.droneRig.group);
    this.scene.add(this.droneRig.spot);

    // aim telegraph lines (pool of 4)
    for (let i = 0; i < 4; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.7 }));
      line.visible = false;
      line.frustumCulled = false;
      this.aimLines.push(line);
      this.scene.add(line);
    }

    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Clear all dynamic rigs & reset prop state. Call whenever World resets. */
  resetDynamic(): void {
    for (const rig of this.touristRigs.values()) this.scene.remove(rig.group);
    this.touristRigs.clear();
    for (const rig of this.keeperRigs.values()) this.scene.remove(rig.group);
    this.keeperRigs.clear();
    for (const m of this.dartMeshes.values()) this.scene.remove(m);
    this.dartMeshes.clear();
    for (const m of this.foodMeshes.values()) this.scene.remove(m);
    this.foodMeshes.clear();
    for (const line of this.aimLines) line.visible = false;
    this.eventId = '';
    this.shake = 0;
    // reset props
    this.env.doorL.rotation.set(0, 0, 0);
    this.env.doorR.rotation.set(0, 0, 0);
    for (const g of this.env.trashCans) {
      g.rotation.x = 0;
      g.position.y = 0;
    }
    this.env.cart.rotation.z = 0;
    this.env.cart.position.y = 0;
    this.env.cakeCart.rotation.z = 0;
    this.env.cakeCart.position.y = 0;
    // reset capybara pose
    this.capy.inner.rotation.set(0, 0, 0);
    this.capy.inner.scale.set(1, 1, 1);
    this.capy.inner.visible = true;
    this.capy.mud.visible = false;
  }

  dispose(): void {
    this.renderer.dispose();
    this.particles.dispose();
  }

  // ===========================================================================
  // Event props + weather by rolled event
  // ===========================================================================
  private applyEventProps(world: World): void {
    const ev = world.config.event;
    if (ev === this.eventId) return;
    this.eventId = ev;
    this.env.cart.visible = ev === 'foodcart';
    this.env.cakeCart.visible = ev === 'birthday';
    this.env.balloons.visible = ev === 'birthday';
    this.env.tvCam.visible = ev === 'tvcrew';
    this.weatherRain = ev === 'rain';
    if (this.weatherRain) {
      this.scene.background = new THREE.Color(0x7d93a8);
      this.scene.fog = new THREE.Fog(0x8aa0b2, 45, 120);
      this.sun.intensity = 1.5;
      this.hemi.intensity = 0.6;
    } else {
      this.scene.background = new THREE.Color(0x9fd7f2);
      this.scene.fog = new THREE.Fog(0xaadcf5, 60, 150);
      this.sun.intensity = 2.6;
      this.hemi.intensity = 0.85;
    }
  }

  // ===========================================================================
  // Consume world events: FX internally, UI notices returned to React.
  // ===========================================================================
  consumeEvents(world: World): { popups: UiPopup[]; notices: UiNotice[] } {
    const popups: UiPopup[] = [];
    const notices: UiNotice[] = [];
    for (const e of world.events) {
      switch (e.kind) {
        case 'sfx':
          audio.play(e.name);
          break;
        case 'particles':
          this.particles.spawn(e.preset, e.x, e.z, e.count ?? 8);
          break;
        case 'shake':
          this.shake = Math.min(1.2, this.shake + e.mag);
          break;
        case 'popup': {
          const s = this.project(e.x, 2.2, e.z);
          if (s) popups.push({ sx: s.x, sy: s.y, text: e.text, cls: e.cls });
          break;
        }
        case 'stage':
          notices.push({ type: 'stage', title: STAGES[e.index].name, sub: 'Escalation rising…', stageIndex: e.index });
          audio.setIntensity(e.index);
          break;
        case 'banner':
          notices.push({ type: 'banner', title: e.title, sub: e.sub });
          break;
        case 'gameover':
          notices.push({ type: 'gameover', title: e.result === 'win' ? 'ZOO SHUT DOWN!' : 'CAUGHT!', sub: '', result: e.result });
          break;
      }
    }
    world.events.length = 0;
    return { popups, notices };
  }

  project(x: number, y: number, z: number): { x: number; y: number } | null {
    this._pv.set(x, y, z).project(this.camera);
    if (this._pv.z > 1) return null;
    return {
      x: (this._pv.x * 0.5 + 0.5) * window.innerWidth,
      y: (-this._pv.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  // ===========================================================================
  // Per-frame sync: World state → meshes
  // ===========================================================================
  sync(world: World, dt: number): void {
    this.time += dt;
    this.applyEventProps(world);
    const p = world.player;

    // ---------------- capybara ----------------
    const c = this.capy;
    c.group.position.set(p.x, 0, p.z);
    c.group.rotation.y = p.facing;
    const speed = Math.hypot(p.vx, p.vz);
    // squash & stretch
    let sx = 1;
    let sy = 1;
    let sz = 1;
    if (p.charging && speed > 6) {
      sz = 1.18;
      sy = 0.82;
      sx = 0.9;
    }
    const sq = p.squish;
    sy = Math.max(0.6, sy - sq * 0.28);
    sx += sq * 0.16;
    sz += sq * 0.1;
    if (p.hidden) {
      sy *= 0.62;
      sx *= 1.15;
      sz *= 1.05;
    }
    c.inner.scale.set(sx, sy, sz);
    // bobbing & leg walk
    const bobA = Math.min(speed / 6, 1.6);
    c.body.position.y = 0.95 + Math.abs(Math.sin(this.time * (p.charging ? 16 : 10))) * 0.07 * bobA;
    c.legs.forEach((leg, i) => {
      leg.rotation.x = Math.sin(this.time * (p.charging ? 18 : 11) + (i % 2) * Math.PI) * 0.75 * bobA;
    });
    // idle breathing
    if (speed < 0.5) c.body.scale.setScalar(1).set(0.95 + Math.sin(this.time * 2.2) * 0.012, 0.78 + Math.sin(this.time * 2.2) * 0.015, 1.35);
    // bite lunge / headbutt dip / roll
    const biteK = p.animAttack > 0 ? p.animAttack / 0.22 : 0;
    c.head.position.z = 1.15 + biteK * 0.45;
    const hbK = p.animHeadbutt > 0 ? p.animHeadbutt / 0.35 : 0;
    c.inner.rotation.x = hbK * 0.45 * Math.sin(hbK * Math.PI);
    if (p.animRoll > 0) {
      const k = 1 - p.animRoll / 0.5;
      c.inner.rotation.x = k * Math.PI * 2;
    }
    // grumpy blink
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12;
    if (this.blinkT <= 0) this.blinkT = 2 + Math.random() * 3;
    c.lidL.scale.y = blink ? 3.2 : 1;
    c.lidR.scale.y = blink ? 3.2 : 1;
    // mud + iframes blink + dead
    c.mud.visible = p.muddy > 0;
    c.inner.visible = p.iframes <= 0 || Math.floor(this.time * 14) % 2 === 0;
    if (p.dead) {
      c.inner.visible = true;
      c.inner.rotation.z = Math.min(Math.PI / 2, c.inner.rotation.z + dt * 6);
    } else {
      c.inner.rotation.z = 0;
    }
    // splash pose: rear up
    if (p.animSplash > 0) {
      const k = p.animSplash / 0.5;
      c.inner.rotation.x = -Math.sin(k * Math.PI) * 0.5;
    }

    // ---------------- tourists ----------------
    const seen = new Set<number>();
    for (const t of world.tourists.values()) {
      seen.add(t.id);
      let rig = this.touristRigs.get(t.id);
      if (!rig) {
        rig = buildTourist(t);
        this.touristRigs.set(t.id, rig);
        this.scene.add(rig.group);
      }
      this.syncTourist(rig, t, world, dt);
    }
    for (const [id, rig] of this.touristRigs) {
      if (!seen.has(id)) {
        this.scene.remove(rig.group);
        this.touristRigs.delete(id);
      }
    }

    // ---------------- keepers ----------------
    const seenK = new Set<number>();
    for (const k of world.keepers.values()) {
      seenK.add(k.id);
      let rig = this.keeperRigs.get(k.id);
      if (!rig) {
        rig = buildKeeper(k.elite);
        this.keeperRigs.set(k.id, rig);
        this.scene.add(rig.group);
      }
      this.syncKeeper(rig, k, world);
    }
    for (const [id, rig] of this.keeperRigs) {
      if (!seenK.has(id)) {
        this.scene.remove(rig.group);
        this.keeperRigs.delete(id);
      }
    }

    // ---------------- darts ----------------
    const seenD = new Set<number>();
    for (const d of world.darts.values()) {
      seenD.add(d.id);
      let m = this.dartMeshes.get(d.id);
      if (!m) {
        m = buildDart();
        this.dartMeshes.set(d.id, m);
        this.scene.add(m);
      }
      m.position.set(d.x, 1.2, d.z);
      m.rotation.y = Math.atan2(d.vx, d.vz);
    }
    for (const [id, m] of this.dartMeshes) {
      if (!seenD.has(id)) {
        this.scene.remove(m);
        this.dartMeshes.delete(id);
      }
    }

    // ---------------- dropped food/items ----------------
    const seenF = new Set<number>();
    for (const f of world.foods.values()) {
      seenF.add(f.id);
      let m = this.foodMeshes.get(f.id);
      if (!m) {
        m = buildFoodMesh(f.kind);
        this.foodMeshes.set(f.id, m);
        this.scene.add(m);
      }
      m.position.set(f.x, 0.05 + Math.sin(this.time * 3 + f.id) * 0.04, f.z);
      m.rotation.y = this.time * 1.5 + f.id;
    }
    for (const [id, m] of this.foodMeshes) {
      if (!seenF.has(id)) {
        this.scene.remove(m);
        this.foodMeshes.delete(id);
      }
    }

    // ---------------- props state ----------------
    world.trashCans.forEach((tc, i) => {
      const g = this.env.trashCans[i];
      if (tc.toppled && g.rotation.x > -1.4) {
        g.rotation.x = Math.max(-1.5, g.rotation.x - dt * 8);
        g.position.y = 0.42 * -g.rotation.x / 1.5;
      }
    });
    const cartMesh = world.cart?.kind === 'cake' ? this.env.cakeCart : this.env.cart;
    if (world.cart && cartMesh.visible) {
      const target = world.cart.toppled ? 1.35 : 0;
      cartMesh.rotation.z += (target - cartMesh.rotation.z) * Math.min(dt * 8, 1);
      cartMesh.position.y = world.cart.toppled ? 0.35 : 0;
    }
    // gate doors
    if (world.gateIsBroken) {
      this.env.doorL.rotation.x = Math.min(1.5, this.env.doorL.rotation.x + dt * 7);
      this.env.doorR.rotation.x = Math.min(1.5, this.env.doorR.rotation.x + dt * 7);
    } else if (world.gateIsOpen) {
      this.env.doorL.rotation.y += (-1.9 - this.env.doorL.rotation.y) * Math.min(dt * 4, 1);
      this.env.doorR.rotation.y += (1.9 - this.env.doorR.rotation.y) * Math.min(dt * 4, 1);
    }

    // ---------------- drone ----------------
    const dr = world.drone;
    this.droneRig.group.visible = dr.active;
    this.droneRig.spot.visible = dr.active;
    if (dr.active) {
      this.droneRig.group.position.set(dr.x, 12 + Math.sin(this.time * 2) * 0.4, dr.z);
      this.droneRig.group.lookAt(dr.spotX, 0, dr.spotZ);
      this.droneRig.rotors.forEach((r, i) => {
        r.rotation.y = this.time * 40 * (i % 2 ? 1 : -1);
      });
      this.droneRig.spot.position.set(dr.spotX, 0.08, dr.spotZ);
      const spotMat = this.droneRig.spot.material as THREE.MeshBasicMaterial;
      spotMat.opacity = 0.22 + Math.sin(this.time * 6) * 0.08;
    }

    // ---------------- aim telegraphs ----------------
    let li = 0;
    for (const k of world.keepers.values()) {
      if (k.mood !== 'aim' || li >= this.aimLines.length) continue;
      const line = this.aimLines[li++];
      const attr = line.geometry.attributes.position as THREE.BufferAttribute;
      attr.setXYZ(0, k.x, 1.4, k.z);
      attr.setXYZ(1, p.x, 0.9, p.z);
      attr.needsUpdate = true;
      line.visible = true;
      (line.material as THREE.LineBasicMaterial).opacity = 0.4 + Math.sin(this.time * 20) * 0.3;
    }
    for (; li < this.aimLines.length; li++) this.aimLines[li].visible = false;

    // ---------------- ambient animation ----------------
    this.animateEnv(world, dt);

    // rain
    if (this.weatherRain && Math.random() < dt * 40) {
      this.particles.spawn('rain', p.x + (Math.random() - 0.5) * 30, p.z + (Math.random() - 0.5) * 30, 2, 12);
    }

    // ---------------- camera ----------------
    const px = p.x;
    const pz = p.z;
    this.camTarget.x += (px - this.camTarget.x) * Math.min(dt * 5, 1);
    this.camTarget.z += (pz - this.camTarget.z) * Math.min(dt * 5, 1);
    this.camTarget.x = THREE.MathUtils.clamp(this.camTarget.x, -ARENA.half + 4, ARENA.half - 4);
    this.camTarget.z = THREE.MathUtils.clamp(this.camTarget.z, -ARENA.half + 2, ARENA.pathZ1 - 6);
    const orbit = world.config.attract ? Math.sin(this.time * 0.15) * 4 : 0;
    this.camera.position.set(
      this.camTarget.x + CAM_OFF.x + orbit,
      CAM_OFF.y,
      this.camTarget.z + CAM_OFF.z,
    );
    // screen shake
    if (dt > 0 && this.shake > 0.001) {
      this.shake *= Math.pow(0.0015, dt);
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.9;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.7;
      this.camera.position.z += (Math.random() - 0.5) * this.shake * 0.9;
    }
    this.camera.lookAt(this.camTarget.x, 0.5, this.camTarget.z - 1.5);

    this.particles.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  // ===========================================================================
  private syncTourist(rig: TouristRig, t: TouristState, world: World, dt: number): void {
    const onPlat = t.onPlatform && t.mood !== 'pond';
    const tumbling = t.tumble > 0;
    const dazed = t.dazed > 0;
    let y = onPlat ? PLATFORM.y : 0;
    const panicking = t.mood === 'panic' || t.mood === 'flee';

    if (t.mood === 'pond') {
      y = -0.55 + Math.sin(this.time * 5 + t.id) * 0.1;
    }
    if (tumbling) {
      // ballistic arc: fly, flip, bounce
      y = (onPlat ? PLATFORM.y : 0) + t.tumbleY;
    }
    rig.group.position.set(t.x, y, t.z);
    rig.group.rotation.y = t.facing;

    const spd = Math.hypot(t.vx, t.vz);
    if (tumbling) {
      // flip head over heels around local X, stretched along the body axis
      rig.inner.rotation.x = t.tumbleRot;
      rig.inner.rotation.z = 0;
      rig.inner.position.y = 0.25;
      const v = Math.hypot(spd, t.tumbleVY);
      const s = Math.min(v / 18, 0.35);
      rig.inner.scale.set(1 - s * 0.35, 1 + s * 0.6, 1 - s * 0.35);
      // limbs splayed
      rig.armL.rotation.z = -2.6;
      rig.armR.rotation.z = 2.6;
      rig.armL.rotation.x = 0.4;
      rig.armR.rotation.x = -0.4;
      rig.legL.rotation.x = 0.5;
      rig.legR.rotation.x = -0.4;
    } else {
      // ease squash & stretch back to normal
      const sk = Math.min(dt * 10, 1);
      rig.inner.scale.x += (1 - rig.inner.scale.x) * sk;
      rig.inner.scale.y += (1 - rig.inner.scale.y) * sk;
      rig.inner.scale.z += (1 - rig.inner.scale.z) * sk;
      if (dazed || t.slip > 0) {
        // lying flat on the ground (dazed stars emitted by the world)
        rig.inner.rotation.x = -Math.PI / 2 * 0.92;
        rig.inner.position.y = 0;
        rig.group.position.y = (onPlat ? PLATFORM.y : 0) + 0.22;
        if (dazed && Math.random() < dt * 2.5) {
          this.particles.spawn('stars', t.x, t.z, 1, 0.55);
        }
      } else {
        rig.inner.rotation.x = 0;
        if (t.mood !== 'pond') {
          // waddle walk
          rig.inner.rotation.z = Math.sin(t.bob) * 0.09 * Math.min(spd / 2, 1.5);
          rig.inner.position.y = Math.abs(Math.sin(t.bob)) * 0.06 * Math.min(spd / 2, 1.5);
          rig.legL.rotation.x = Math.sin(t.bob) * 0.7 * Math.min(spd / 2, 1.5);
          rig.legR.rotation.x = -Math.sin(t.bob) * 0.7 * Math.min(spd / 2, 1.5);
        } else {
          rig.inner.rotation.z = 0;
          rig.inner.position.y = 0;
        }
      }
    }

    // arms: up in panic, out when feeding, down otherwise
    const armTarget = panicking ? 2.7 : t.mood === 'feed' ? 1.2 : 0.15;
    if (!tumbling) {
      rig.armL.rotation.z += (-armTarget - rig.armL.rotation.z) * Math.min(dt * 8, 1);
      rig.armR.rotation.z += (armTarget - rig.armR.rotation.z) * Math.min(dt * 8, 1);
    }
    if (panicking && !tumbling) {
      rig.armL.rotation.x = Math.sin(this.time * 18 + t.id) * 0.5;
      rig.armR.rotation.x = -Math.sin(this.time * 18 + t.id) * 0.5;
    }
    // photo tourist: raise the camera to eye level while lining up the shot
    const aiming = t.mood === 'photo' && t.photoT > 0 && !panicking;
    if (aiming) {
      const ak = Math.min(dt * 9, 1);
      rig.armR.rotation.x += (-2.35 - rig.armR.rotation.x) * ak;
      rig.armL.rotation.x += (-2.1 - rig.armL.rotation.x) * ak;
      rig.armL.rotation.z += (-0.5 - rig.armL.rotation.z) * ak;
      rig.armR.rotation.z += (0.35 - rig.armR.rotation.z) * ak;
      rig.itemHolder.position.x += (0.28 - rig.itemHolder.position.x) * ak;
      rig.itemHolder.position.y += (1.6 - rig.itemHolder.position.y) * ak;
      rig.itemHolder.position.z += (0.42 - rig.itemHolder.position.z) * ak;
    } else {
      const ak = Math.min(dt * 8, 1);
      if (!panicking && !tumbling) {
        rig.armL.rotation.x += (0 - rig.armL.rotation.x) * ak;
        rig.armR.rotation.x += (0 - rig.armR.rotation.x) * ak;
      }
      rig.itemHolder.position.x += (0.5 - rig.itemHolder.position.x) * ak;
      rig.itemHolder.position.y += (1.35 - rig.itemHolder.position.y) * ak;
      rig.itemHolder.position.z += (0.15 - rig.itemHolder.position.z) * ak;
    }

    // ---- facial expressions ----
    const expr = t.expression;
    const eyeT = expr === 'surprised' ? 1.5 : expr === 'panic' ? 1.35 : 1;
    const pupT = expr === 'surprised' ? 0.55 : expr === 'panic' ? 0.85 : 1;
    const ek = Math.min(dt * 14, 1);
    const es = rig.eyeL.scale.x + (eyeT - rig.eyeL.scale.x) * ek;
    rig.eyeL.scale.setScalar(es);
    rig.eyeR.scale.setScalar(es);
    // pupils are children of the eyeballs → divide by eye scale for absolute size
    const psT = pupT / eyeT;
    const ps = rig.pupilL.scale.x + (psT - rig.pupilL.scale.x) * ek;
    rig.pupilL.scale.setScalar(ps);
    rig.pupilR.scale.setScalar(ps);
    rig.mouth.visible = expr === 'calm';
    rig.mouthO.visible = expr !== 'calm';
    rig.browL.visible = expr !== 'calm';
    rig.browR.visible = expr !== 'calm';

    // googly pupils: track player when gawking/suspicious/photographing, dart otherwise
    const look = t.mood === 'gawk' || t.mood === 'suspicious' || t.mood === 'photo' || panicking;
    let px = t.pupilX * 0.045;
    let py = t.pupilY * 0.03;
    if (look) {
      const p = world.player;
      const ang = Math.atan2(p.x - t.x, p.z - t.z) - t.facing;
      px = Math.sin(ang) * 0.055;
      py = Math.cos(ang) * 0.02 - 0.01;
    }
    // keep pupils riding the eyeball surface as eyes/pupils scale (es/ps above)
    const pz = 0.15 + (0.01 - 0.07 * es * ps) / es;
    rig.pupilL.position.set(px, py, pz);
    rig.pupilR.position.set(px, py, pz);
    // fear shake
    if (t.mood === 'suspicious') {
      rig.head.rotation.z = Math.sin(this.time * 10 + t.id) * 0.06;
    } else {
      rig.head.rotation.z = 0;
    }
    // soaked: drip particles occasionally
    if (t.soak > 0 && Math.random() < dt * 3) {
      this.particles.spawn('splash', t.x, t.z, 1, 1.2);
    }
    // item hidden once dropped
    rig.itemHolder.visible = t.item !== 'none';
    // VIP sparkle
    if (t.vip && Math.random() < dt * 2) {
      this.particles.spawn('spark', t.x, t.z, 1, 1.8);
    }
  }

  private syncKeeper(rig: KeeperRig, k: KeeperState, world: World): void {
    rig.group.position.set(k.x, 0, k.z);
    rig.group.rotation.y = k.facing;
    const spd = Math.hypot(k.vx, k.vz);
    const wob = Math.min(spd / 3, 1.6);
    rig.legL.rotation.x = Math.sin(k.bob) * 0.8 * wob;
    rig.legR.rotation.x = -Math.sin(k.bob) * 0.8 * wob;
    rig.armL.rotation.x = -Math.sin(k.bob) * 0.6 * wob;
    rig.armR.rotation.x = Math.sin(k.bob) * 0.6 * wob;
    rig.inner.position.y = Math.abs(Math.sin(k.bob)) * 0.05 * wob;
    if (k.mood === 'stunned') {
      rig.inner.rotation.z = Math.sin(this.time * 3 + k.id) * 0.18;
      if (Math.random() < 0.05) this.particles.spawn('stars', k.x, k.z, 1, 2.2);
    } else {
      rig.inner.rotation.z = 0;
    }
    // raise tranq gun while aiming
    rig.gun.visible = k.mood === 'aim';
    if (k.mood === 'aim') {
      rig.armR.rotation.x = -1.4;
      const p = world.player;
      rig.gun.lookAt(p.x, 0.9, p.z);
    }
  }

  // ===========================================================================
  private animateEnv(world: World, dt: number): void {
    // water ripple
    const attr = this.env.water.geometry.attributes.position as THREE.BufferAttribute;
    const base = this.env.waterBase;
    for (let i = 0; i < attr.count; i++) {
      const bx = base[i * 3];
      const bz = base[i * 3 + 2];
      attr.setY(i, Math.sin(this.time * 2.2 + bx * 4 + bz * 3) * 0.05 + Math.cos(this.time * 1.6 + bz * 5) * 0.04);
    }
    attr.needsUpdate = true;
    // flags wave
    for (const f of this.env.flags) {
      for (const child of f.children) {
        const wp = child.userData.wavePhase as number | undefined;
        if (wp !== undefined) {
          child.rotation.x = Math.sin(this.time * 3 + wp) * 0.25;
        }
      }
    }
    // clouds drift
    for (const cl of this.env.clouds) {
      cl.position.x += dt * 0.5;
      if (cl.position.x > 90) cl.position.x = -90;
    }
    // balloons bob
    if (this.env.balloons.visible) {
      for (const b of this.env.balloons.children) {
        const ph = (b.userData.bob as number) ?? 0;
        b.position.y = 3 + Math.sin(this.time * 1.5 + ph) * 0.3;
        b.rotation.z = Math.sin(this.time + ph) * 0.12;
      }
    }
    // hidden indicator: leaves rustle over hidden player
    const p = world.player;
    if (p.hidden && Math.random() < dt * 5) {
      this.particles.spawn('leaves', p.x, p.z, 1, 1.2);
    }
    // charging dust is emitted by the world
  }
}
