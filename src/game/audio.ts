// ============================================================================
// Procedural WebAudio: chiptune-ish adaptive music loop + synthesized SFX.
// No external audio files. Everything is oscillators + filtered noise.
// ============================================================================

type Wave = OscillatorType;

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;
  private musicOn = false;
  private intensity = 0; // 0..5 (chaos stage)
  private step = 0;
  private nextStepTime = 0;
  private timer: number | null = null;

  /** Must be called from a user gesture (click/keydown) at least once. */
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.42;
    this.musicBus.connect(this.master);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);
    // white-noise buffer reused by percussive sfx
    const len = this.ctx.sampleRate * 1;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.linearRampToValueAtTime(m ? 0 : 0.8, this.ctx.currentTime + 0.1);
    }
  }

  // -------------------------------------------------------------------------
  // Music: 16-step loop, layers added with chaos intensity.
  // A minor-ish, jaunty. Bass always, kick from 1, hats from 2, lead from 3,
  // alarm arp from 4, driving double-time from 5.
  // -------------------------------------------------------------------------
  startMusic(): void {
    this.ensure();
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.nextStepTime = this.ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.scheduler(), 40);
  }

  stopMusic(): void {
    this.musicOn = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setIntensity(i: number): void {
    this.intensity = Math.max(0, Math.min(5, i));
  }

  private scheduler(): void {
    if (!this.ctx || !this.musicOn) return;
    const bpm = 118 + this.intensity * 10;
    const stepDur = 60 / bpm / 4;
    while (this.nextStepTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextStepTime, stepDur);
      this.step = (this.step + 1) % 64;
      this.nextStepTime += stepDur;
    }
  }

  private tone(t: number, freq: number, dur: number, type: Wave, vol: number, bus: GainNode | null, slideTo?: number): void {
    if (!this.ctx || !bus) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(t: number, dur: number, vol: number, filterFreq: number, bus: GainNode | null, type: BiquadFilterType = 'lowpass'): void {
    if (!this.ctx || !bus || !this.noiseBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private playStep(s: number, t: number, stepDur: number): void {
    const I = this.intensity;
    const bar = Math.floor(s / 16) % 4;
    const beat = s % 16;
    // chord roots: Am F C G (rough, cheerful-menacing)
    const roots = [110, 87.31, 130.81, 98];
    const root = roots[bar];
    // bass: jaunty eighth notes
    if (beat % 2 === 0) {
      const oct = beat % 8 === 6 ? 2 : 1;
      this.tone(t, root * oct, stepDur * 1.8, 'triangle', 0.34, this.musicBus);
    }
    // kick on quarters from intensity 1
    if (I >= 1 && beat % 4 === 0) {
      this.tone(t, 120, 0.12, 'sine', 0.5, this.musicBus, 40);
    }
    // hats on off-beats from intensity 2
    if (I >= 2 && beat % 4 === 2) {
      this.noise(t, 0.05, 0.12, 8000, this.musicBus, 'highpass');
    }
    // lead pluck melody from intensity 3 (little mischievous motif)
    if (I >= 3 && (beat === 0 || beat === 3 || beat === 6 || beat === 10 || beat === 12)) {
      const scale = [1, 1.2, 1.5, 2, 2.4];
      const n = scale[(s * 7 + bar * 3) % scale.length];
      this.tone(t, root * 4 * n, stepDur * 1.4, 'square', 0.06, this.musicBus);
    }
    // alarm arp from intensity 4
    if (I >= 4 && beat % 8 === 4) {
      this.tone(t, root * 8, stepDur * 3, 'sawtooth', 0.045, this.musicBus, root * 6);
    }
    // double-time drive at max
    if (I >= 5 && beat % 2 === 1) {
      this.noise(t, 0.04, 0.08, 6000, this.musicBus, 'highpass');
    }
  }

  // -------------------------------------------------------------------------
  // SFX
  // -------------------------------------------------------------------------
  play(name: string): void {
    if (!this.ctx || !this.sfxBus || this.muted) return;
    const t = this.ctx.currentTime;
    const B = this.sfxBus;
    switch (name) {
      case 'bite':
        this.tone(t, 700, 0.09, 'square', 0.25, B, 250);
        this.noise(t + 0.02, 0.08, 0.2, 2500, B);
        break;
      case 'growl':
        this.tone(t, 90, 0.35, 'sawtooth', 0.3, B, 60);
        this.tone(t, 140, 0.3, 'square', 0.12, B, 80);
        break;
      case 'headbutt':
        this.tone(t, 200, 0.14, 'sine', 0.6, B, 50);
        this.noise(t, 0.12, 0.35, 900, B);
        break;
      case 'charge':
        this.noise(t, 0.3, 0.22, 1200, B, 'bandpass');
        break;
      case 'scream': {
        const base = 800 + Math.random() * 500;
        this.tone(t, base, 0.28, 'square', 0.14, B, base * 1.8);
        this.tone(t + 0.05, base * 1.3, 0.22, 'square', 0.1, B, base * 2.2);
        break;
      }
      case 'splash':
        this.noise(t, 0.45, 0.4, 1800, B);
        this.tone(t, 300, 0.3, 'sine', 0.2, B, 90);
        break;
      case 'plop':
        this.tone(t, 400, 0.16, 'sine', 0.4, B, 120);
        this.noise(t + 0.03, 0.2, 0.25, 1400, B);
        break;
      case 'pop':
        this.tone(t, 900, 0.07, 'sine', 0.2, B, 1400);
        break;
      case 'coin':
        this.tone(t, 990, 0.07, 'square', 0.12, B);
        this.tone(t + 0.07, 1320, 0.14, 'square', 0.12, B);
        break;
      case 'drop':
        this.tone(t, 500, 0.12, 'triangle', 0.25, B, 180);
        break;
      case 'splat':
        this.noise(t, 0.18, 0.3, 700, B);
        this.tone(t, 220, 0.12, 'sine', 0.2, B, 70);
        break;
      case 'clatter':
        this.noise(t, 0.25, 0.35, 3200, B, 'bandpass');
        this.tone(t, 180, 0.15, 'square', 0.15, B, 90);
        break;
      case 'grab':
        this.tone(t, 500, 0.2, 'sawtooth', 0.3, B, 900);
        this.tone(t + 0.1, 500, 0.2, 'sawtooth', 0.3, B, 350);
        break;
      case 'wriggle':
        for (let i = 0; i < 4; i++) this.tone(t + i * 0.06, 300 + i * 120, 0.07, 'square', 0.18, B);
        break;
      case 'dart':
        this.tone(t, 1600, 0.14, 'sine', 0.2, B, 500);
        break;
      case 'dartHit':
        this.tone(t, 350, 0.2, 'triangle', 0.3, B, 100);
        break;
      case 'alarm':
        this.tone(t, 620, 0.22, 'square', 0.16, B, 880);
        this.tone(t + 0.25, 620, 0.22, 'square', 0.16, B, 880);
        break;
      case 'eat':
        this.noise(t, 0.08, 0.2, 2000, B);
        this.tone(t + 0.06, 600, 0.08, 'sine', 0.15, B, 900);
        break;
      case 'hide':
        this.noise(t, 0.2, 0.15, 500, B);
        break;
      case 'roll':
        this.noise(t, 0.25, 0.2, 800, B);
        break;
      case 'slip':
        this.tone(t, 900, 0.25, 'sine', 0.15, B, 300);
        break;
      case 'stampede':
        this.noise(t, 0.7, 0.35, 250, B);
        this.tone(t, 70, 0.6, 'sine', 0.35, B, 45);
        break;
      case 'selfie':
        this.tone(t, 2000, 0.05, 'square', 0.1, B);
        this.noise(t, 0.06, 0.12, 9000, B, 'highpass');
        break;
      case 'boing': {
        // tumble bounce: springy up-chirp with a wobble
        const f = 150 + Math.random() * 70;
        this.tone(t, f, 0.16, 'sine', 0.35, B, f * 2.6);
        this.tone(t + 0.03, f * 0.55, 0.14, 'triangle', 0.2, B, f * 1.4);
        break;
      }
      case 'shutter':
        // camera: click-clack
        this.noise(t, 0.04, 0.28, 6500, B, 'highpass');
        this.tone(t + 0.04, 2400, 0.05, 'square', 0.12, B, 1700);
        break;
      case 'tweet':
        // dazed birdies circling the head
        this.tone(t, 2300, 0.09, 'sine', 0.14, B, 2900);
        this.tone(t + 0.12, 2700, 0.09, 'sine', 0.12, B, 2100);
        this.tone(t + 0.24, 2500, 0.1, 'sine', 0.1, B, 3100);
        break;
      case 'drone':
        this.tone(t, 220, 0.4, 'sawtooth', 0.05, B, 260);
        break;
      case 'fence':
        this.noise(t, 0.3, 0.4, 1500, B);
        this.tone(t, 140, 0.3, 'square', 0.25, B, 60);
        break;
      case 'whoosh':
        // spin attack: big airy sweep + low whomp
        this.noise(t, 0.38, 0.4, 900, B, 'bandpass');
        this.noise(t + 0.05, 0.3, 0.25, 2400, B, 'bandpass');
        this.tone(t, 160, 0.3, 'sine', 0.35, B, 55);
        break;
      case 'fire': {
        // crackle: a scatter of tiny pops over a low rumble
        this.noise(t, 0.5, 0.12, 320, B);
        for (let i = 0; i < 6; i++) {
          this.noise(t + i * 0.05 + Math.random() * 0.04, 0.04, 0.2, 2200 + Math.random() * 2600, B, 'bandpass');
        }
        break;
      }
      case 'squawk':
        // seagull cry: two descending square-wave screeches
        this.tone(t, 1350, 0.16, 'square', 0.16, B, 720);
        this.tone(t + 0.13, 1180, 0.14, 'square', 0.13, B, 590);
        break;
      case 'sizzle':
        // extinguished: steam hiss
        this.noise(t, 0.45, 0.3, 6500, B, 'highpass');
        this.noise(t, 0.3, 0.18, 1800, B);
        break;
      case 'ui':
        this.tone(t, 660, 0.06, 'sine', 0.15, B, 880);
        break;
      case 'buy':
        this.tone(t, 520, 0.08, 'square', 0.15, B);
        this.tone(t + 0.08, 780, 0.08, 'square', 0.15, B);
        this.tone(t + 0.16, 1040, 0.14, 'square', 0.15, B);
        break;
      case 'denied':
        this.tone(t, 220, 0.15, 'square', 0.15, B, 160);
        break;
      case 'win': {
        const notes = [523, 659, 784, 1047, 784, 1047, 1319];
        notes.forEach((n, i) => this.tone(t + i * 0.13, n, 0.22, 'square', 0.16, B));
        break;
      }
      case 'lose': {
        const notes = [392, 370, 349, 311];
        notes.forEach((n, i) => this.tone(t + i * 0.22, n, 0.3, 'sawtooth', 0.14, B));
        break;
      }
      case 'stageup':
        this.tone(t, 440, 0.12, 'square', 0.18, B);
        this.tone(t + 0.12, 554, 0.12, 'square', 0.18, B);
        this.tone(t + 0.24, 659, 0.2, 'square', 0.18, B);
        break;
      default:
        break;
    }
  }
}

export const audio = new AudioEngine();
