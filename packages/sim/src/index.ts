export { MatchSim, type SimMatchConfig } from "./match-sim.js";
export { World, type MatchConfig, type MatchResult, type KillFeedEntry, type HitMarker } from "./world.js";
export type RenderBundle = ReturnType<import("./world.js").World["exportRenderBundle"]>;
export {
  type GameInput,
  type InputSnapshot,
  snapshotInput,
  inputFromSnapshot,
  mergeInputSnapshots,
} from "./game-input.js";
export { createFighter, activeWeapon, type Fighter } from "./fighter.js";
export type { IslandMap, LootPile } from "./mapgen.js";
