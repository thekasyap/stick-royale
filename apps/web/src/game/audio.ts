/** Lightweight Web Audio synth — no asset downloads */

export class GameAudio {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private stepAcc = 0;
  private moving = false;
  private ads = false;

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        this.enabled = false;
        return null;
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  /** Call on first user gesture (iOS / Chrome autoplay unlock) */
  unlock(): void {
    this.ensure();
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain = 0.08, when = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain = 0.06): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0)!;
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buffer;
    g.gain.value = gain;
    src.connect(g);
    g.connect(ctx.destination);
    src.start();
  }

  shoot(category: string): void {
    if (category === "sg") {
      this.noise(0.12, 0.12);
      this.tone(80, 0.08, "sawtooth", 0.1);
    } else if (category === "sr" || category === "dmr") {
      this.noise(0.06, 0.09);
      this.tone(120, 0.05, "square", 0.07);
    } else if (category === "smg") {
      this.noise(0.04, 0.05);
      this.tone(200, 0.03, "square", 0.05);
    } else {
      this.noise(0.05, 0.06);
      this.tone(160, 0.04, "square", 0.05);
    }
  }

  hit(crit = false): void {
    this.tone(crit ? 520 : 380, 0.06, "sine", crit ? 0.1 : 0.06);
  }

  loot(): void {
    this.tone(640, 0.08, "sine", 0.05);
    this.tone(880, 0.06, "sine", 0.04, 0.04);
  }

  zoneWarning(): void {
    this.tone(220, 0.15, "sine", 0.06);
    this.tone(180, 0.2, "sine", 0.05, 0.12);
  }

  jump(): void {
    this.tone(300, 0.1, "sine", 0.05);
    this.tone(450, 0.12, "sine", 0.04, 0.06);
  }

  chickenDinner(): void {
    const notes = [392, 494, 587, 784];
    notes.forEach((n, i) => this.tone(n, 0.25, "triangle", 0.09, i * 0.18));
  }

  eliminated(): void {
    this.tone(180, 0.4, "sawtooth", 0.07);
    this.tone(120, 0.5, "sawtooth", 0.05, 0.15);
  }

  redZone(): void {
    this.noise(0.25, 0.14);
    this.tone(90, 0.3, "sawtooth", 0.08);
  }

  dryFire(): void {
    this.tone(90, 0.04, "square", 0.03);
  }

  reload(): void {
    this.tone(240, 0.05, "triangle", 0.04);
    this.tone(180, 0.08, "triangle", 0.03, 0.05);
  }

  damaged(): void {
    this.noise(0.08, 0.05);
    this.tone(140, 0.1, "sawtooth", 0.04);
  }

  /** Soft walking loop — call each frame with dt while alive */
  setMoving(moving: boolean, ads = false, dt = 0): void {
    this.moving = moving;
    this.ads = ads;
    if (!moving) {
      this.stepAcc = 0;
      return;
    }
    const interval = ads ? 0.42 : 0.3;
    this.stepAcc += dt;
    while (this.stepAcc >= interval) {
      this.stepAcc -= interval;
      this.footstep();
    }
  }

  private footstep(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    // Soft filtered thud — gravel/boot feel, stays under gunfire
    const dur = 0.05;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0)!;
    for (let i = 0; i < bufferSize; i++) {
      const env = 1 - i / bufferSize;
      data[i] = (Math.random() * 2 - 1) * env * env;
    }
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = 420 + Math.random() * 180;
    g.gain.value = this.ads ? 0.018 : 0.028;
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start();
  }
}
