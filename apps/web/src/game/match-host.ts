import {
  MatchSim,
  snapshotInput,
  type InputSnapshot,
  type MatchConfig,
  type RenderBundle,
} from "@stick-royale/sim";
import type { GameInput } from "@stick-royale/sim";

/** Runs MatchSim in a Web Worker when available; falls back to main thread */
export class MatchHost {
  private worker: Worker | null = null;
  private sim: MatchSim | null = null;
  private pending = false;
  bundle: RenderBundle | null = null;
  readonly useWorker: boolean;

  constructor(private onFrame: (bundle: RenderBundle) => void) {
    this.useWorker = typeof Worker !== "undefined";
  }

  start(config: MatchConfig): void {
    if (this.useWorker) {
      this.worker = new Worker(new URL("../worker/match.worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.onmessage = (ev) => {
        const msg = ev.data as { type: string; bundle: RenderBundle };
        if (msg.type === "ready" || msg.type === "frame") {
          this.bundle = msg.bundle;
          this.pending = false;
          this.onFrame(msg.bundle);
        }
      };
      this.worker.postMessage({ type: "init", config });
    } else {
      this.sim = new MatchSim(config);
      this.bundle = this.sim.exportRenderBundle();
      this.onFrame(this.bundle);
    }
  }

  tick(dt: number, input: GameInput, viewW: number, viewH: number): void {
    if (this.sim) {
      this.sim.tick(dt, input, viewW, viewH);
      this.bundle = this.sim.exportRenderBundle();
      this.onFrame(this.bundle);
      return;
    }
    if (!this.worker || this.pending) return;
    this.pending = true;
    const snap = snapshotInput(input);
    this.worker.postMessage({
      type: "tick",
      dt,
      input: snap,
      viewW,
      viewH,
    } satisfies { type: "tick"; dt: number; input: InputSnapshot; viewW: number; viewH: number });
  }

  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
    this.sim = null;
  }

  get matchOver(): boolean {
    return this.bundle?.matchOver ?? false;
  }

  get result() {
    return this.bundle?.result ?? null;
  }
}
