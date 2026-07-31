/** Lightweight Web Audio synth — no asset downloads */

export class GameAudio {
  private ctx: AudioContext | null = null;
  private enabled = true;

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
}
