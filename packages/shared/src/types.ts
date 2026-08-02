/** Core shared types for Stick Royale */

export type Vec2 = { x: number; y: number };

/** classic = 48-player BR drop; vs_ai = lightweight Practice arena */
export type GameMode = "classic" | "vs_ai";
export type PartySize = "solo" | "duo" | "squad";
export type BotDifficulty = "easy" | "normal" | "hard";

export type AmmoType = "556" | "762" | "9mm" | "12g" | "45";
export type WeaponCategory = "ar" | "smg" | "sg" | "dmr" | "sr" | "pistol" | "melee" | "throwable";
export type AttachmentSlot = "mag" | "grip" | "muzzle" | "scope";
export type HealItemId = "bandage" | "medkit" | "energy_drink" | "painkiller";
export type ArmorSlot = "helmet" | "vest" | "backpack";

export interface WeaponDef {
  id: string;
  name: string;
  category: WeaponCategory;
  ammo: AmmoType | null;
  damage: number;
  headMultiplier: number;
  fireRate: number; // rounds per second
  magSize: number;
  reloadTime: number; // seconds
  range: number;
  spread: number; // radians base
  pelletCount: number;
  movePenalty: number;
  adsSpreadMul: number;
  bulletSpeed: number;
  slot: "primary" | "secondary" | "melee" | "throwable";
}

export interface AttachmentDef {
  id: string;
  name: string;
  slot: AttachmentSlot;
  compatible: WeaponCategory[];
  magBonus?: number;
  spreadMul?: number;
  recoilMul?: number;
  rangeMul?: number;
  zoom?: number;
}

export interface HealDef {
  id: HealItemId;
  name: string;
  heal: number;
  boost: number;
  useTime: number;
  maxStack: number;
}

export interface ArmorDef {
  id: string;
  name: string;
  slot: ArmorSlot;
  level: 1 | 2 | 3;
  reduction: number; // 0-1 damage reduction for helmet/vest
  capacity: number; // backpack extra slots
}

export interface ZonePhase {
  phase: number;
  waitTime: number; // seconds before shrink starts
  shrinkTime: number;
  radius: number; // target white circle radius
  damagePerSecond: number;
}

export interface PoiDef {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  tier: "hot" | "mid" | "quiet";
}

export interface LootTierWeights {
  weapon: number;
  ammo: number;
  heal: number;
  armor: number;
  attachment: number;
  throwable: number;
}

export const LOBBY_SIZE = 48;
/** Practice (VS AI) — far fewer bots so phones stay smooth */
export const PRACTICE_LOBBY_SIZE = 12;
export const TICK_RATE = 20;
export const MAP_SIZE = 2400;
export const PLAYER_RADIUS = 12;
export const PLAYER_SPEED = 165;
export const PLAYER_ADS_SPEED = 110;
export const MAX_HP = 100;
export const MAX_BOOST = 100;
export const CRAWL_SPEED = 55;
export const KNOCK_BLEED_DPS = 5;
export const REVIVE_RANGE = 52;
export const REVIVE_TIME = 5;
export const MATCHMAKE_WINDOW_MS = 12000;

export function partyCapacity(size: PartySize): number {
  if (size === "duo") return 2;
  if (size === "squad") return 4;
  return 1;
}

export const LOOT_WEIGHTS: Record<"hot" | "mid" | "quiet", LootTierWeights> = {
  hot: { weapon: 0.28, ammo: 0.22, heal: 0.16, armor: 0.14, attachment: 0.12, throwable: 0.08 },
  mid: { weapon: 0.2, ammo: 0.28, heal: 0.2, armor: 0.12, attachment: 0.1, throwable: 0.1 },
  quiet: { weapon: 0.14, ammo: 0.32, heal: 0.24, armor: 0.1, attachment: 0.08, throwable: 0.12 },
};
