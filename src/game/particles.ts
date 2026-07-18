// ============================================================================
// Pooled CPU particle system rendered as a single THREE.Points draw call.
// Presets define color/behavior; the world emits spawns, the scene updates.
// ============================================================================

import * as THREE from 'three';

const MAX = 900;

interface Particle {
  alive: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  size: number;
  r: number; g: number; b: number;
  gravity: number;
  drag: number;
}

interface Preset {
  colors: [number, number, number][];
  speed: [number, number];
  up: [number, number];
  size: [number, number];
  life: [number, number];
  gravity: number;
  drag: number;
  spread: number; // horizontal randomness
}

const PRESETS: Record<string, Preset> = {
  dust: { colors: [[0.85, 0.78, 0.6], [0.75, 0.68, 0.5]], speed: [0.5, 1.5], up: [0.5, 1.5], size: [0.25, 0.5], life: [0.4, 0.8], gravity: -0.5, drag: 3, spread: 1 },
  dash: { colors: [[0.95, 0.9, 0.75]], speed: [1, 3], up: [0.5, 2], size: [0.3, 0.6], life: [0.3, 0.6], gravity: 0, drag: 4, spread: 1 },
  hit: { colors: [[1, 0.9, 0.3], [1, 0.6, 0.2], [1, 1, 1]], speed: [2, 5], up: [2, 5], size: [0.25, 0.45], life: [0.3, 0.55], gravity: -6, drag: 2, spread: 1 },
  splash: { colors: [[0.35, 0.75, 0.85], [0.6, 0.9, 0.95], [0.9, 1, 1]], speed: [1.5, 4], up: [3, 7], size: [0.25, 0.5], life: [0.4, 0.9], gravity: -12, drag: 1, spread: 1 },
  mud: { colors: [[0.35, 0.24, 0.12], [0.45, 0.32, 0.18]], speed: [1, 3], up: [2, 5], size: [0.25, 0.5], life: [0.4, 0.8], gravity: -12, drag: 1, spread: 1 },
  leaves: { colors: [[0.35, 0.65, 0.25], [0.5, 0.75, 0.3], [0.25, 0.5, 0.2]], speed: [0.5, 2], up: [1, 3], size: [0.2, 0.4], life: [0.5, 1], gravity: -3, drag: 2, spread: 1 },
  panic: { colors: [[1, 0.85, 0.2], [1, 1, 1]], speed: [0.5, 1], up: [2.5, 4], size: [0.3, 0.5], life: [0.5, 0.8], gravity: 2, drag: 1, spread: 0.6 },
  splat: { colors: [[1, 0.75, 0.85], [0.95, 0.95, 0.9], [0.9, 0.4, 0.4]], speed: [1, 3], up: [1, 3], size: [0.2, 0.4], life: [0.3, 0.7], gravity: -10, drag: 1, spread: 1 },
  trash: { colors: [[0.6, 0.6, 0.6], [0.4, 0.45, 0.4], [0.8, 0.75, 0.6]], speed: [2, 5], up: [2, 5], size: [0.2, 0.45], life: [0.4, 0.9], gravity: -12, drag: 1.5, spread: 1 },
  wood: { colors: [[0.75, 0.6, 0.4], [0.6, 0.45, 0.3], [0.9, 0.85, 0.7]], speed: [3, 7], up: [2, 6], size: [0.25, 0.5], life: [0.5, 1], gravity: -14, drag: 1, spread: 1 },
  cake: { colors: [[1, 0.8, 0.9], [1, 1, 1], [0.9, 0.5, 0.7], [1, 0.9, 0.5]], speed: [2, 6], up: [3, 8], size: [0.25, 0.55], life: [0.5, 1.1], gravity: -12, drag: 1, spread: 1 },
  food: { colors: [[0.9, 0.5, 0.25], [0.95, 0.8, 0.3], [0.6, 0.8, 0.3], [1, 1, 1]], speed: [2, 6], up: [3, 8], size: [0.25, 0.5], life: [0.5, 1.1], gravity: -12, drag: 1, spread: 1 },
  spark: { colors: [[1, 0.95, 0.5], [1, 1, 1]], speed: [3, 7], up: [2, 6], size: [0.15, 0.3], life: [0.25, 0.5], gravity: -4, drag: 2, spread: 1 },
  flash: { colors: [[1, 1, 1]], speed: [0.2, 0.6], up: [0.5, 1], size: [0.4, 0.7], life: [0.15, 0.3], gravity: 0, drag: 1, spread: 0.5 },
  stars: { colors: [[1, 0.9, 0.3], [1, 1, 0.7]], speed: [1, 3], up: [2, 4], size: [0.25, 0.45], life: [0.5, 0.9], gravity: -2, drag: 2, spread: 1 },
  munch: { colors: [[0.6, 0.8, 0.3], [0.9, 0.8, 0.4]], speed: [0.5, 1.5], up: [1, 2.5], size: [0.2, 0.35], life: [0.3, 0.6], gravity: -6, drag: 1, spread: 0.8 },
  toss: { colors: [[0.9, 0.8, 0.4]], speed: [0.5, 1.5], up: [1.5, 3], size: [0.2, 0.35], life: [0.3, 0.6], gravity: -6, drag: 1, spread: 0.8 },
  growl: { colors: [[0.7, 0.4, 0.2], [1, 0.7, 0.3]], speed: [2, 4], up: [0.5, 1.5], size: [0.3, 0.6], life: [0.35, 0.6], gravity: 1, drag: 2, spread: 1 },
  hearts: { colors: [[1, 0.4, 0.6]], speed: [0.5, 1], up: [1, 2], size: [0.3, 0.5], life: [0.6, 1], gravity: 2, drag: 1, spread: 0.6 },
  rain: { colors: [[0.6, 0.75, 0.9]], speed: [0, 0.5], up: [-22, -18], size: [0.12, 0.2], life: [0.8, 1.2], gravity: 0, drag: 0, spread: 30 },
  smoke: { colors: [[0.55, 0.55, 0.55], [0.42, 0.42, 0.42], [0.68, 0.68, 0.68]], speed: [0.1, 0.5], up: [0.8, 1.7], size: [0.22, 0.5], life: [0.8, 1.6], gravity: 1.5, drag: 1, spread: 0.5 },
  steam: { colors: [[0.92, 0.95, 1], [1, 1, 1], [0.8, 0.86, 0.94]], speed: [0.4, 1], up: [2, 3.6], size: [0.3, 0.55], life: [0.4, 0.85], gravity: 2, drag: 1.5, spread: 0.8 },
  popcorn: { colors: [[1, 0.98, 0.85], [1, 0.9, 0.6], [1, 1, 1]], speed: [1, 3], up: [2, 5], size: [0.15, 0.3], life: [0.5, 0.9], gravity: -12, drag: 1, spread: 1 },
  flame: { colors: [[1, 0.6, 0.15], [1, 0.8, 0.25], [1, 0.4, 0.1], [1, 0.95, 0.5]], speed: [0.5, 1.5], up: [1.5, 3.5], size: [0.3, 0.55], life: [0.3, 0.7], gravity: 3, drag: 1.5, spread: 0.7 },
  spinring: { colors: [[0.85, 0.78, 0.6], [0.95, 0.9, 0.75], [0.75, 0.68, 0.5]], speed: [6, 9.5], up: [0.5, 2], size: [0.3, 0.6], life: [0.3, 0.6], gravity: -2, drag: 3.5, spread: 1 },
};

export class ParticleSystem {
  private particles: Particle[] = [];
  private geo: THREE.BufferGeometry;
  private posAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;
  readonly points: THREE.Points;
  private cursor = 0;

  constructor() {
    for (let i = 0; i < MAX; i++) {
      this.particles.push({ alive: false, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 1, r: 1, g: 1, b: 1, gravity: 0, drag: 0 });
    }
    this.geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(MAX * 3), 3);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(MAX * 3), 3);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(MAX), 1);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('color', this.colAttr);
    this.geo.setAttribute('psize', this.sizeAttr);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float psize;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * (240.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.25, d);
          gl_FragColor = vec4(vColor, a);
        }`,
      vertexColors: true,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  spawn(preset: string, x: number, z: number, count = 8, y = 0.8): void {
    const p = PRESETS[preset];
    if (!p) return;
    for (let n = 0; n < count; n++) {
      const pt = this.particles[this.cursor];
      this.cursor = (this.cursor + 1) % MAX;
      const ang = Math.random() * Math.PI * 2;
      const spd = p.speed[0] + Math.random() * (p.speed[1] - p.speed[0]);
      pt.alive = true;
      pt.x = x + (Math.random() - 0.5) * 0.4 * p.spread;
      pt.y = y + Math.random() * 0.4;
      pt.z = z + (Math.random() - 0.5) * 0.4 * p.spread;
      pt.vx = Math.sin(ang) * spd * p.spread;
      pt.vz = Math.cos(ang) * spd * p.spread;
      pt.vy = p.up[0] + Math.random() * (p.up[1] - p.up[0]);
      pt.maxLife = p.life[0] + Math.random() * (p.life[1] - p.life[0]);
      pt.life = pt.maxLife;
      pt.size = p.size[0] + Math.random() * (p.size[1] - p.size[0]);
      const c = p.colors[Math.floor(Math.random() * p.colors.length)];
      pt.r = c[0];
      pt.g = c[1];
      pt.b = c[2];
      pt.gravity = p.gravity;
      pt.drag = p.drag;
    }
  }

  update(dt: number): void {
    const pos = this.posAttr.array as Float32Array;
    const col = this.colAttr.array as Float32Array;
    const siz = this.sizeAttr.array as Float32Array;
    for (let i = 0; i < MAX; i++) {
      const pt = this.particles[i];
      if (pt.alive) {
        pt.life -= dt;
        if (pt.life <= 0) {
          pt.alive = false;
          pt.y = -100;
        } else {
          const dragF = 1 - Math.min(pt.drag * dt, 0.9);
          pt.vx *= dragF;
          pt.vz *= dragF;
          pt.vy += pt.gravity * dt;
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
          pt.z += pt.vz * dt;
          if (pt.y < 0.05 && pt.vy < 0) {
            pt.y = 0.05;
            pt.vy *= -0.3;
          }
        }
      }
      const fade = pt.alive ? Math.min(1, pt.life / (pt.maxLife * 0.4)) : 0;
      pos[i * 3] = pt.x;
      pos[i * 3 + 1] = pt.y;
      pos[i * 3 + 2] = pt.z;
      col[i * 3] = pt.r * fade;
      col[i * 3 + 1] = pt.g * fade;
      col[i * 3 + 2] = pt.b * fade;
      siz[i] = pt.alive ? pt.size * (0.5 + 0.5 * fade) : 0;
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
