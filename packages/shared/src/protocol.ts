/** Wire protocol for Durable Object multiplayer */

export type ClientMessage =
  | {
      type: "join";
      nickname: string;
      mode: string;
      party: string;
      partySize: string;
      difficulty: string;
      partyCode?: string;
    }
  | {
      type: "input";
      seq: number;
      moveX: number;
      moveY: number;
      aim: number;
      fire: boolean;
      ads: boolean;
      reload: boolean;
      interact: boolean;
      slot: number;
      useHeal: string | null;
      revive?: boolean;
      vehicle?: boolean;
      mapPing?: { x: number; y: number; kind: "move" | "enemy" | "loot" } | null;
    }
  | { type: "lobby_join"; nickname: string; partyCode?: string; mode: string; partySize: string; difficulty: string }
  | { type: "lobby_ready"; ready: boolean }
  | { type: "lobby_start" }
  | { type: "ping"; t: number }
  | { type: "chat"; text: string };

export type ServerMessage =
  | { type: "welcome"; playerId: string; seed: number; tick: number; matchId?: string }
  | { type: "snapshot"; tick: number; you: PlayerSnapshot; entities: EntitySnapshot[]; zone: ZoneSnapshot; alive: number; killFeed: KillFeedEntry[] }
  | { type: "match_end"; placement: number; kills: number; damage: number; winner: boolean }
  | {
      type: "lobby_state";
      partyCode: string;
      members: { id: string; name: string; ready: boolean }[];
      matching: boolean;
      matchId: string | null;
      humans: number;
      capacity: number;
    }
  | { type: "match_ready"; matchId: string; wsPath: string }
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
