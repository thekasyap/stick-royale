import type { BotDifficulty, GameMode, PartySize } from "@stick-royale/shared";
import type { GameInput } from "./game-input.js";
import { World, type MatchConfig, type MatchResult } from "./world.js";

export type { MatchConfig, MatchResult };
export type { GameInput, InputSnapshot } from "./game-input.js";
export { snapshotInput, inputFromSnapshot } from "./game-input.js";

/** Authoritative 20 Hz match simulation — used by Web Worker and MatchRoom DO */
export class MatchSim extends World {
  constructor(config: MatchConfig, nowMs = Date.now()) {
    super(config, undefined, nowMs);
  }

  tick(dt: number, input: GameInput, viewW: number, viewH: number): void {
    this.update(dt, input, viewW, viewH);
  }

  exportState() {
    return {
      tick: Math.floor(this.time * 20),
      time: this.time,
      matchOver: this.matchOver,
      result: this.result,
      alive: this.aliveCount(),
      phase: this.phaseLabel(),
      player: {
        id: this.player.id,
        x: this.player.x,
        y: this.player.y,
        hp: this.player.hp,
        boost: this.player.boost,
        state: this.player.state,
      },
      killFeed: this.killFeed.slice(0, 6),
      prompt: this.prompt,
      weaponHud: this.weaponHud(),
    };
  }
}

export type SimMatchConfig = {
  nickname: string;
  mode: GameMode;
  partySize: PartySize;
  difficulty: BotDifficulty;
  seed?: number;
};
