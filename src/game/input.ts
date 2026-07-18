// ============================================================================
// LocalInput: keyboard implementation of InputSource.
// (Gamepad mapping noted: Left stick = WASD, A = bite, X = headbutt,
//  RT = charge, B = hide/roll, Y = splash, RB = spin — a GamepadInput would
//  implement the same InputSource interface.)
// ============================================================================

import type { InputSource, InputState } from './types';
import { emptyInput } from './types';

export class LocalInput implements InputSource {
  private keys = new Set<string>();
  /** Edge-triggered latches: set on keydown, consumed by poll(). */
  private latched = new Set<string>();
  /** Fired for UI-level keys (pause). */
  onPause: (() => void) | null = null;

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const c = e.code;
    if (c === 'Escape' || c === 'KeyP') {
      if (!e.repeat) this.onPause?.();
      e.preventDefault();
      return;
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c)) e.preventDefault();
    if (!e.repeat) {
      this.keys.add(c);
      this.latched.add(c);
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onBlur = (): void => {
    this.keys.clear();
    this.latched.clear();
  };

  poll(): InputState {
    const k = this.keys;
    const s = emptyInput();
    const left = k.has('KeyA') || k.has('ArrowLeft');
    const right = k.has('KeyD') || k.has('ArrowRight');
    const up = k.has('KeyW') || k.has('ArrowUp');
    const down = k.has('KeyS') || k.has('ArrowDown');
    s.moveX = (right ? 1 : 0) - (left ? 1 : 0);
    s.moveZ = (down ? 1 : 0) - (up ? 1 : 0);
    s.charge = k.has('ShiftLeft') || k.has('ShiftRight');
    s.bite = this.consume('KeyJ') || this.consume('KeyZ');
    s.headbutt = this.consume('KeyK') || this.consume('KeyX');
    s.hide = this.consume('KeyL') || this.consume('KeyC');
    s.splash = this.consume('Space');
    s.spin = this.consume('KeyU') || this.consume('KeyE');
    return s;
  }

  private consume(code: string): boolean {
    if (this.latched.has(code)) {
      this.latched.delete(code);
      return true;
    }
    return false;
  }
}
