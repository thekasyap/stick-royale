/** Wire protocol for future Durable Object multiplayer */

export type ClientMessage =
  | { type: "join"; nickname: string; mode: string; party: string; difficulty: string }
  | { type: "input"; seq: number; moveX: number; moveY: number; aim: number; fire: boolean; ads: boolean; reload: boolean; interact: boolean; slot: number; useHeal: string | null }
  | { type: "ping"; t: number }
  | { type: "chat"; text: string };

export type ServerMessage =
  | { type: "welcome"; playerId: string; seed: number; tick: number }
  | { type: "snapshot"; tick: number; you: PlayerSnapshot; entities: EntitySnapshot[]; zone: ZoneSnapshot; alive: number; killFeed: KillFeedEntry[] }
  | { type: "match_end"; placement: number; kills: number; damage: number; winner: boolean }
  | { type: "pong"; t: number }
  | { type: "error"; message: string };

export interface PlayerSnapshot {
  id: string;
  x: number;
  y: number;
  aim: number;
  hp: number;
  boost: number;
  armor: { helmet: number; vest: number; backpack: number };
  weapon: string | null;
  state: "plane" | "parachute" | "alive" | "downed" | "dead";
  kills: number;
}

export interface EntitySnapshot {
  id: string;
  kind: "player" | "bot" | "loot" | "crate" | "bullet" | "smoke";
  x: number;
  y: number;
  aim?: number;
  hp?: number;
  label?: string;
}

export interface ZoneSnapshot {
  phase: number;
  blueX: number;
  blueY: number;
  blueR: number;
  whiteX: number;
  whiteY: number;
  whiteR: number;
  shrinking: boolean;
  timeInPhase: number;
  damage: number;
}

export interface KillFeedEntry {
  killer: string;
  victim: string;
  weapon: string;
  t: number;
}
