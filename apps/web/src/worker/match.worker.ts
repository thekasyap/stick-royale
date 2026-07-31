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
  }
};
