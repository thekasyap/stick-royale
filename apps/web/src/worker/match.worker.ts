import {
  MatchSim,
  inputFromSnapshot,
  type InputSnapshot,
  type MatchConfig,
} from "@stick-royale/sim";

export type RenderBundle = ReturnType<MatchSim["exportRenderBundle"]>;

let sim: MatchSim | null = null;

self.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as {
    type: string;
    config?: MatchConfig;
    dt?: number;
    input?: InputSnapshot;
    viewW?: number;
    viewH?: number;
  };

  try {
    if (msg.type === "init" && msg.config) {
      sim = new MatchSim(msg.config);
      self.postMessage({ type: "ready", bundle: sim.exportRenderBundle() });
      return;
    }

    if (msg.type === "tick" && sim && msg.input != null) {
      sim.tick(
        msg.dt ?? 1 / 60,
        inputFromSnapshot(msg.input),
        msg.viewW ?? 1280,
        msg.viewH ?? 720,
      );
      self.postMessage({ type: "frame", bundle: sim.exportRenderBundle() });
      return;
    }

    // Always acknowledge ticks so MatchHost never stays pending forever
    if (msg.type === "tick") {
      self.postMessage({
        type: "error",
        error: sim ? "tick missing input" : "tick before init",
      });
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: "error", error });
  }
};
