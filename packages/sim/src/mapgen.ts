import {
  ARMOR,
  ATTACHMENTS,
  HEALS,
  LOOT_WEIGHTS,
  MAP_SIZE,
  POIS,
  WEAPON_LOOT_POOL,
  ATTACHMENT_LOOT_POOL,
  WEAPONS,
  type AmmoType,
  type PoiDef,
} from "@stick-royale/shared";
import { chance, createRng, pick, randRange } from "./math";

export type Building = {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  wall: boolean;
};

export type Cover = {
  x: number;
  y: number;
  r: number;
  kind: "rock" | "crate" | "tree" | "bush";
};

export type LootKind =
  | { type: "weapon"; weaponId: string }
  | { type: "ammo"; ammo: AmmoType; amount: number }
  | { type: "heal"; healId: keyof typeof HEALS; amount: number }
  | { type: "armor"; armorId: keyof typeof ARMOR }
  | { type: "attachment"; attachmentId: string }
  | { type: "throwable"; weaponId: "frag" | "smoke"; amount: number };

export type LootPile = {
  id: string;
  x: number;
  y: number;
  items: LootKind[];
  fromCrate?: boolean;
  ownerName?: string;
};

export type IslandMap = {
  buildings: Building[];
  cover: Cover[];
  loot: LootPile[];
  pois: PoiDef[];
  water: { x: number; y: number; w: number; h: number }[];
  roads: { x1: number; y1: number; x2: number; y2: number; w: number }[];
};

let lootId = 0;

function nextLootId(): string {
  return `loot_${++lootId}`;
}

const AMMO_TYPES: AmmoType[] = ["556", "762", "9mm", "12g", "45"];
const HEAL_IDS = Object.keys(HEALS) as (keyof typeof HEALS)[];
const ARMOR_IDS = Object.keys(ARMOR) as (keyof typeof ARMOR)[];

function rollLootItem(rng: () => number, tier: "hot" | "mid" | "quiet"): LootKind {
  const w = LOOT_WEIGHTS[tier];
  const roll = rng();
  let acc = 0;
  const pickCat = (name: keyof typeof w): boolean => {
    acc += w[name];
    return roll < acc;
  };

  if (pickCat("weapon")) {
    return { type: "weapon", weaponId: pick(rng, WEAPON_LOOT_POOL) };
  }
  if (pickCat("ammo")) {
    const ammo = pick(rng, AMMO_TYPES);
    const amount =
      ammo === "12g" ? Math.floor(randRange(rng, 6, 14)) :
      ammo === "762" ? Math.floor(randRange(rng, 20, 40)) :
      Math.floor(randRange(rng, 30, 60));
    return { type: "ammo", ammo, amount };
  }
  if (pickCat("heal")) {
    const healId = pick(rng, HEAL_IDS);
    const amount = healId === "medkit" ? 1 : Math.floor(randRange(rng, 1, 4));
    return { type: "heal", healId, amount };
  }
  if (pickCat("armor")) {
    // Bias toward lower tiers
    const pool = ARMOR_IDS.filter((id) => {
      const lv = ARMOR[id]!.level;
      if (tier === "hot") return true;
      if (tier === "mid") return lv <= 2;
      return lv === 1;
    });
    return { type: "armor", armorId: pick(rng, pool) };
  }
  if (pickCat("attachment")) {
    return { type: "attachment", attachmentId: pick(rng, ATTACHMENT_LOOT_POOL) };
  }
  return {
    type: "throwable",
    weaponId: chance(rng, 0.55) ? "frag" : "smoke",
    amount: Math.floor(randRange(rng, 1, 3)),
  };
}

function spawnBuildingLoot(
  rng: () => number,
  b: Building,
  tier: "hot" | "mid" | "quiet",
  out: LootPile[],
): void {
  const count = tier === "hot" ? 3 + Math.floor(rng() * 3) : tier === "mid" ? 2 + Math.floor(rng() * 2) : 1 + Math.floor(rng() * 2);
  for (let i = 0; i < count; i++) {
    const items: LootKind[] = [rollLootItem(rng, tier)];
    if (chance(rng, 0.35)) items.push(rollLootItem(rng, tier));
    // Spawn on building perimeter so piles are reachable (buildings are solid AABBs)
    const side = Math.floor(rng() * 4);
    const pad = 18 + rng() * 10;
    let x = b.x + b.w / 2;
    let y = b.y + b.h / 2;
    if (side === 0) {
      x = b.x + rng() * b.w;
      y = b.y - pad;
    } else if (side === 1) {
      x = b.x + b.w + pad;
      y = b.y + rng() * b.h;
    } else if (side === 2) {
      x = b.x + rng() * b.w;
      y = b.y + b.h + pad;
    } else {
      x = b.x - pad;
      y = b.y + rng() * b.h;
    }
    out.push({ id: nextLootId(), x, y, items });
  }
}

export function generateMap(seed: number): IslandMap {
  lootId = 0;
  const rng = createRng(seed);
  const buildings: Building[] = [];
  const cover: Cover[] = [];
  const loot: LootPile[] = [];
  const water: IslandMap["water"] = [
    { x: 0, y: 0, w: MAP_SIZE, h: 80 },
    { x: 0, y: MAP_SIZE - 80, w: MAP_SIZE, h: 80 },
    { x: 0, y: 0, w: 80, h: MAP_SIZE },
    { x: MAP_SIZE - 80, y: 0, w: 80, h: MAP_SIZE },
    { x: 1600, y: 1600, w: 420, h: 280 },
  ];
  const roads: IslandMap["roads"] = [
    { x1: 200, y1: 1200, x2: 2200, y2: 1200, w: 28 },
    { x1: 1200, y1: 200, x2: 1200, y2: 2200, w: 28 },
    { x1: 500, y1: 700, x2: 1400, y2: 1100, w: 22 },
    { x1: 900, y1: 1600, x2: 1800, y2: 1500, w: 22 },
  ];

  const buildingColors = ["#5c5346", "#6a6254", "#4a453c", "#706656", "#585044"];

  for (const poi of POIS) {
    const count = poi.tier === "hot" ? 7 : poi.tier === "mid" ? 5 : 3;
    for (let i = 0; i < count; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = rng() * poi.radius * 0.75;
      const w = 36 + rng() * (poi.tier === "hot" ? 70 : 50);
      const h = 36 + rng() * (poi.tier === "hot" ? 60 : 45);
      const b: Building = {
        x: poi.x + Math.cos(angle) * dist - w / 2,
        y: poi.y + Math.sin(angle) * dist - h / 2,
        w,
        h,
        color: pick(rng, buildingColors),
        wall: true,
      };
      buildings.push(b);
      spawnBuildingLoot(rng, b, poi.tier, loot);
    }

    // Cover around POI
    const coverCount = poi.tier === "hot" ? 14 : 10;
    for (let i = 0; i < coverCount; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = poi.radius * (0.4 + rng() * 0.9);
      cover.push({
        x: poi.x + Math.cos(angle) * dist,
        y: poi.y + Math.sin(angle) * dist,
        r: 8 + rng() * 14,
        kind: pick(rng, ["rock", "crate", "tree", "bush"] as const),
      });
    }

    // Outdoor loot scatter — guaranteed ground weapon near hot/mid POIs
    const outdoor = poi.tier === "hot" ? 8 : poi.tier === "mid" ? 5 : 3;
    for (let i = 0; i < outdoor; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = rng() * poi.radius;
      loot.push({
        id: nextLootId(),
        x: poi.x + Math.cos(angle) * dist,
        y: poi.y + Math.sin(angle) * dist,
        items: [rollLootItem(rng, poi.tier)],
      });
    }
    if (poi.tier !== "quiet") {
      const ang = rng() * Math.PI * 2;
      const d = 40 + rng() * 50;
      loot.push({
        id: nextLootId(),
        x: poi.x + Math.cos(ang) * d,
        y: poi.y + Math.sin(ang) * d,
        items: [{ type: "weapon", weaponId: pick(rng, poi.tier === "hot" ? ["sparkwave", "ironclad", "buzzsaw", "rattler"] : ["rattler", "sidekick", "thumper"]) }],
      });
    }
  }

  // Scattered wilderness cover + light loot
  for (let i = 0; i < 120; i++) {
    const x = 120 + rng() * (MAP_SIZE - 240);
    const y = 120 + rng() * (MAP_SIZE - 240);
    cover.push({
      x, y,
      r: 6 + rng() * 12,
      kind: pick(rng, ["rock", "tree", "bush"] as const),
    });
    if (chance(rng, 0.18)) {
      loot.push({
        id: nextLootId(),
        x: x + randRange(rng, -20, 20),
        y: y + randRange(rng, -20, 20),
        items: [rollLootItem(rng, "quiet")],
      });
    }
  }

  return { buildings, cover, loot, pois: POIS, water, roads };
}

export function lootLabel(item: LootKind): string {
  switch (item.type) {
    case "weapon": return WEAPONS[item.weaponId]?.name ?? item.weaponId;
    case "ammo": return `${item.ammo} ×${item.amount}`;
    case "heal": return `${HEALS[item.healId].name} ×${item.amount}`;
    case "armor": return ARMOR[item.armorId].name;
    case "attachment": return ATTACHMENTS[item.attachmentId]?.name ?? item.attachmentId;
    case "throwable": return `${item.weaponId === "frag" ? "Frag" : "Smoke"} ×${item.amount}`;
  }
}
