/**
 * Classic Solo must not Chicken Dinner on tick 1 (everyone still in plane).
 * pnpm smoke
 */
import { MatchSim, inputFromSnapshot } from "../src/index.ts";

function count(fighters: { state: string }[]) {
  const o: Record<string, number> = {};
  for (const f of fighters) o[f.state] = (o[f.state] ?? 0) + 1;
  return o;
}

const empty = inputFromSnapshot({
  keys: [],
  justPressed: [],
  mouseX: 400,
  mouseY: 300,
  mouseDown: false,
  mouseRight: false,
  touchMoveX: 0,
  touchMoveY: 0,
});

const sim = new MatchSim({
  nickname: "Tester",
  mode: "classic",
  partySize: "solo",
  difficulty: "normal",
});

const before = sim.exportRenderBundle();
if (before.fighters.length !== 48) {
  throw new Error(`expected 48 fighters, got ${before.fighters.length}`);
}

sim.tick(1 / 20, empty, 800, 600);
const after1 = sim.exportRenderBundle();
if (after1.matchOver) {
  throw new Error(`instant Chicken Dinner: ${JSON.stringify(after1.result)}`);
}

for (let i = 0; i < 20 * 45; i++) sim.tick(1 / 20, empty, 800, 600);
const mid = sim.exportRenderBundle();
if (mid.matchOver && mid.time < 10) {
  throw new Error(`match ended too early @ ${mid.time}s`);
}

console.log("SMOKE OK", {
  time: Math.round(mid.time),
  living: mid.fighters.filter((f) => f.state !== "dead").length,
  states: count(mid.fighters),
  matchOver: mid.matchOver,
});
