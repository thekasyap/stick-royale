import type { ArmorDef, HealDef, PoiDef, ZonePhase } from "./types.js";
import { MAP_SIZE } from "./types.js";

/** Blue zone — 7 phases; paced for ~8–12 min classic matches */
/** Paced for ~10–14 min Classic — phase 1 gives real loot time after drop */
export const ZONE_PHASES: ZonePhase[] = [
  { phase: 1, waitTime: 55, shrinkTime: 35, radius: 980, damagePerSecond: 1 },
  { phase: 2, waitTime: 28, shrinkTime: 28, radius: 680, damagePerSecond: 2 },
  { phase: 3, waitTime: 22, shrinkTime: 24, radius: 430, damagePerSecond: 4 },
  { phase: 4, waitTime: 18, shrinkTime: 20, radius: 260, damagePerSecond: 7 },
  { phase: 5, waitTime: 14, shrinkTime: 16, radius: 140, damagePerSecond: 11 },
  { phase: 6, waitTime: 12, shrinkTime: 14, radius: 70, damagePerSecond: 15 },
  { phase: 7, waitTime: 10, shrinkTime: 12, radius: 22, damagePerSecond: 22 },
];

/** Hand-authored POIs on the island */
export const POIS: PoiDef[] = [
  { id: "pine_town", name: "Pine Town", x: 620, y: 720, radius: 160, tier: "hot" },
  { id: "school_yard", name: "School Yard", x: 1280, y: 580, radius: 140, tier: "hot" },
  { id: "dockside", name: "Dockside", x: 1780, y: 1480, radius: 150, tier: "hot" },
  { id: "farm", name: "Farm", x: 520, y: 1500, radius: 170, tier: "mid" },
  { id: "ruins", name: "Ruins", x: 1500, y: 1080, radius: 130, tier: "mid" },
  { id: "lumber_mill", name: "Lumber Mill", x: 980, y: 1680, radius: 120, tier: "mid" },
  { id: "hilltop", name: "Hilltop", x: 1680, y: 420, radius: 110, tier: "quiet" },
  { id: "marsh", name: "Marsh", x: 380, y: 1080, radius: 130, tier: "quiet" },
  { id: "quarry", name: "Quarry", x: 1100, y: 980, radius: 100, tier: "mid" },
  { id: "outpost", name: "Outpost", x: 1900, y: 900, radius: 90, tier: "quiet" },
  { id: "crossroads", name: "Crossroads", x: 1200, y: 1200, radius: 80, tier: "quiet" },
  { id: "shore_camp", name: "Shore Camp", x: 720, y: 1900, radius: 100, tier: "quiet" },
];

export const HEALS: Record<string, HealDef> = {
  bandage: { id: "bandage", name: "Bandage", heal: 15, boost: 0, useTime: 2.5, maxStack: 10 },
  medkit: { id: "medkit", name: "Medkit", heal: 100, boost: 0, useTime: 6, maxStack: 3 },
  energy_drink: { id: "energy_drink", name: "Energy Drink", heal: 0, boost: 40, useTime: 3, maxStack: 5 },
  painkiller: { id: "painkiller", name: "Painkiller", heal: 0, boost: 60, useTime: 4, maxStack: 5 },
};

export const ARMOR: Record<string, ArmorDef> = {
  helmet_1: { id: "helmet_1", name: "Helmet Lv.1", slot: "helmet", level: 1, reduction: 0.2, capacity: 0 },
  helmet_2: { id: "helmet_2", name: "Helmet Lv.2", slot: "helmet", level: 2, reduction: 0.35, capacity: 0 },
  helmet_3: { id: "helmet_3", name: "Helmet Lv.3", slot: "helmet", level: 3, reduction: 0.5, capacity: 0 },
  vest_1: { id: "vest_1", name: "Vest Lv.1", slot: "vest", level: 1, reduction: 0.25, capacity: 0 },
  vest_2: { id: "vest_2", name: "Vest Lv.2", slot: "vest", level: 2, reduction: 0.4, capacity: 0 },
  vest_3: { id: "vest_3", name: "Vest Lv.3", slot: "vest", level: 3, reduction: 0.55, capacity: 0 },
  backpack_1: { id: "backpack_1", name: "Backpack Lv.1", slot: "backpack", level: 1, reduction: 0, capacity: 50 },
  backpack_2: { id: "backpack_2", name: "Backpack Lv.2", slot: "backpack", level: 2, reduction: 0, capacity: 100 },
  backpack_3: { id: "backpack_3", name: "Backpack Lv.3", slot: "backpack", level: 3, reduction: 0, capacity: 160 },
};

export const MAP_CENTER = { x: MAP_SIZE / 2, y: MAP_SIZE / 2 };
export const INITIAL_ZONE_RADIUS = MAP_SIZE * 0.72;

/** Bot nicknames — original, no trademarks */
export const BOT_NAMES = [
  "AshStick", "PineRunner", "DockRat", "FarmHand", "RuinSeeker",
  "BuzzCut", "PanSlayer", "QuietShot", "MarshFox", "HillScout",
  "LootGoblin", "BlueWalker", "CrateKing", "ZoneZombie", "StickGhost",
  "CampCleaner", "RoofCamper", "BushDweller", "SprayLord", "TapFire",
  "DropKing", "HotDrop", "LateRotate", "ThirdParty", "ChickenChaser",
  "MedAddict", "ScopeHunter", "ShellShock", "NineNine", "SevenSix",
  "FenceHugger", "BridgeBlock", "BoatBoy", "BuggyBandit", "SmokeScreen",
  "FragNade", "HealBot", "RotateEarly", "EndgameAce", "LastCircle",
  "StickStorm", "TanTrail", "GreenGhost", "DustDevil", "PineNeedle",
  "SchoolBully", "DockDiver", "QuarryQ", "OutpostOwl",
];
