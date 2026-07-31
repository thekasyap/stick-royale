import {
  MatchSim,
  mergeInputSnapshots,
  snapshotInput,
  type InputSnapshot,
  type MatchConfig,
  type RenderBundle,
} from "@stick-royale/sim";
import type { GameInput } from "@stick-royale/sim";

const PENDING_WATCHDOG_MS = 500;

/** Runs MatchSim in a Web Worker when available; falls back to main thread */
export class MatchHost {
  private worker: Worker | null = null;
  private sim: MatchSim | null = null;
  private pending = false;
  private pendingSince = 0;
  /** Latest input waiting to be sent — never drop player intent */
  private queued: {
    dt: number;
    input: InputSnapshot;
    viewW: number;
    viewH: number;
  } | null = null;
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
        const msg = ev.data as { type: string; bundle?: RenderBundle; error?: string };
        if (msg.type === "error") {
          console.error("[MatchHost] worker error:", msg.error);
          this.clearPending();
          this.flushQueue();
          return;
        }
        if ((msg.type === "ready" || msg.type === "frame") && msg.bundle) {
          this.bundle = msg.bundle;
          this.clearPending();
          this.onFrame(msg.bundle);
          this.flushQueue();
        }
      };
      this.worker.onerror = (err) => {
        console.error("[MatchHost] worker crashed:", err.message);
        this.clearPending();
        this.queued = null;
      };
      this.worker.onmessageerror = () => {
        console.error("[MatchHost] worker message deserialization failed");
        this.clearPending();
        this.flushQueue();
      };
      this.markPending();
      this.worker.postMessage({ type: "init", config });
    } else {
      this.sim = new MatchSim(config);
      this.bundle = this.sim.exportRenderBundle();
      this.onFrame(this.bundle);
    }
  }

  private markPending(): void {
    this.pending = true;
    this.pendingSince = performance.now();
  }

  private clearPending(): void {
    this.pending = false;
    this.pendingSince = 0;
  }

  private flushQueue(): void {
    if (!this.queued || !this.worker) return;
    const q = this.queued;
    this.queued = null;
    this.markPending();
    this.worker.postMessage({ type: "tick", ...q });
  }

  private recoverIfStalled(): void {
    if (!this.pending || !this.worker || this.pendingSince <= 0) return;
    if (performance.now() - this.pendingSince < PENDING_WATCHDOG_MS) return;
    console.warn("[MatchHost] pending watchdog — recovering stalled worker tick");
    this.clearPending();
    this.flushQueue();
  }

  tick(dt: number, input: GameInput, viewW: number, viewH: number): void {
    if (this.sim) {
      this.sim.tick(dt, input, viewW, viewH);
      this.bundle = this.sim.exportRenderBundle();
      this.onFrame(this.bundle);
      return;
    }
    if (!this.worker) return;
    this.recoverIfStalled();
    const snap = snapshotInput(input);
    if (this.pending) {
      if (this.queued) {
        this.queued.dt = Math.min(0.08, this.queued.dt + dt);
        // Merge justPressed so Jump / Loot / Reload taps survive pending ticks
        this.queued.input = mergeInputSnapshots(this.queued.input, snap);
        this.queued.viewW = viewW;
        this.queued.viewH = viewH;
      } else {
        this.queued = { dt, input: snap, viewW, viewH };
      }
      return;
    }
    this.markPending();
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
    this.queued = null;
    this.clearPending();
  }

  get matchOver(): boolean {
    return this.bundle?.matchOver ?? false;
  }

  get result() {
    return this.bundle?.result ?? null;
  }
}
