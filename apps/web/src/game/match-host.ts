import {
  MatchSim,
  mergeInputSnapshots,
  snapshotInput,
  type InputSnapshot,
  type MatchConfig,
  type RenderBundle,
} from "@stick-royale/sim";
import type { GameInput } from "@stick-royale/sim";
import type { IslandMap } from "@stick-royale/sim";

const PENDING_WATCHDOG_MS = 450;
const MAX_STALLS_BEFORE_FALLBACK = 3;

type FrameMsg = {
  type: string;
  bundle?: RenderBundle;
  error?: string;
  /** When false, reuse cached static map on the main thread */
  hasMap?: boolean;
};

/**
 * Runs MatchSim in a Web Worker when available; falls back to main thread
 * on mobile/low-power, worker crash, or repeated stalls (anti-freeze).
 */
export class MatchHost {
  private worker: Worker | null = null;
  private sim: MatchSim | null = null;
  private pending = false;
  private pendingSince = 0;
  private stallCount = 0;
  private config: MatchConfig | null = null;
  /** Static island — sent once from worker, reused every frame */
  private cachedMap: IslandMap | null = null;
  private queued: {
    dt: number;
    input: InputSnapshot;
    viewW: number;
    viewH: number;
  } | null = null;
  bundle: RenderBundle | null = null;
  useWorker = false;
  /** True when we abandoned the worker for main-thread sim */
  fellBack = false;

  constructor(
    private onFrame: (bundle: RenderBundle) => void,
    private opts: { preferMainThread?: boolean } = {},
  ) {}

  start(config: MatchConfig): void {
    this.config = config;
    this.stallCount = 0;
    this.fellBack = false;
    this.cachedMap = null;
    const wantWorker = typeof Worker !== "undefined" && !this.opts.preferMainThread;
    if (wantWorker) {
      this.useWorker = true;
      this.startWorker(config);
    } else {
      this.useWorker = false;
      this.startMain(config);
    }
  }

  private startMain(config: MatchConfig): void {
    this.sim = new MatchSim(config);
    this.bundle = this.sim.exportRenderBundle(true);
    this.cachedMap = this.bundle.map;
    this.onFrame(this.bundle);
  }

  private startWorker(config: MatchConfig): void {
    this.worker = new Worker(new URL("../worker/match.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (ev) => {
      const msg = ev.data as FrameMsg;
      if (msg.type === "error") {
        console.error("[MatchHost] worker error:", msg.error);
        this.clearPending();
        this.flushQueue();
        return;
      }
        if ((msg.type === "ready" || msg.type === "frame") && msg.bundle) {
          this.stallCount = 0;
          const b = msg.bundle as RenderBundle & { loot?: IslandMap["loot"] };
          if (msg.hasMap !== false && b.map) {
            this.cachedMap = b.map;
          }
          if (this.cachedMap) {
            if (b.loot) this.cachedMap.loot = b.loot;
            b.map = this.cachedMap;
          }
          this.bundle = b;
          this.clearPending();
          this.onFrame(b);
          this.flushQueue();
        }
    };
    this.worker.onerror = (err) => {
      console.error("[MatchHost] worker crashed:", err.message);
      this.fallbackToMain("crash");
    };
    this.worker.onmessageerror = () => {
      console.error("[MatchHost] worker message error");
      this.clearPending();
      this.flushQueue();
    };
    this.markPending();
    this.worker.postMessage({ type: "init", config });
  }

  /** Kill hung/dead worker and continue on main thread with a fresh match */
  private fallbackToMain(reason: string): void {
    if (!this.config || this.sim) return;
    console.warn(`[MatchHost] falling back to main-thread sim (${reason})`);
    try {
      this.worker?.terminate();
    } catch {
      /* */
    }
    this.worker = null;
    this.queued = null;
    this.clearPending();
    this.useWorker = false;
    this.fellBack = true;
    this.stallCount = 0;
    // Fresh match on main — better than a permanently frozen canvas
    this.startMain(this.config);
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
    this.stallCount += 1;
    console.warn(`[MatchHost] pending watchdog #${this.stallCount}`);
    this.clearPending();
    if (this.stallCount >= MAX_STALLS_BEFORE_FALLBACK) {
      this.fallbackToMain("stall");
      return;
    }
    this.flushQueue();
  }

  tick(dt: number, input: GameInput, viewW: number, viewH: number): void {
    if (this.sim) {
      this.sim.tick(dt, input, viewW, viewH);
      // Main thread: skip re-cloning the static map every frame
      this.bundle = this.sim.exportRenderBundle(false);
      if (this.cachedMap) this.bundle.map = this.cachedMap;
      else this.cachedMap = this.bundle.map;
      // Keep loot piles live — map.loot mutates; use same map reference
      this.onFrame(this.bundle);
      return;
    }
    if (!this.worker) return;
    this.recoverIfStalled();
    if (!this.worker) {
      // Fell back mid-tick
      if (this.sim) this.tick(dt, input, viewW, viewH);
      return;
    }
    const snap = snapshotInput(input);
    if (this.pending) {
      if (this.queued) {
        this.queued.dt = Math.min(0.08, this.queued.dt + dt);
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
    this.cachedMap = null;
    this.config = null;
    this.clearPending();
  }

  get matchOver(): boolean {
    return this.bundle?.matchOver ?? false;
  }

  get result() {
    return this.bundle?.result ?? null;
  }
}
