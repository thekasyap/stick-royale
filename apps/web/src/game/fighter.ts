import {
  ARMOR,
  ATTACHMENTS,
  HEALS,
  MAX_BOOST,
  MAX_HP,
  PLAYER_RADIUS,
  STARTER_MELEE,
  STARTER_WEAPON,
  WEAPONS,
  type AmmoType,
  type BotDifficulty,
  type Vec2,
} from "@stick-royale/shared";
import type { LootKind } from "./mapgen";

export type FighterState = "plane" | "parachute" | "alive" | "downed" | "dead";

export type WeaponInstance = {
  weaponId: string;
  ammoInMag: number;
  attachments: Partial<Record<"mag" | "grip" | "muzzle" | "scope", string>>;
};

export type Fighter = {
  id: string;
  name: string;
  isBot: boolean;
  difficulty?: BotDifficulty;
  x: number;
  y: number;
  vx: number;
  vy: number;
  aim: number;
  hp: number;
  boost: number;
  state: FighterState;
  radius: number;
  kills: number;
  damageDealt: number;
  helmet: number; // 0-3
  vest: number;
  backpack: number;
  primary: WeaponInstance | null;
  secondary: WeaponInstance | null;
  melee: WeaponInstance;
  activeSlot: 0 | 1 | 2 | 3; // primary, secondary, melee, throwable
  ammo: Record<AmmoType, number>;
  heals: Partial<Record<keyof typeof HEALS, number>>;
  frags: number;
  smokes: number;
  attachments: string[];
  reloadTimer: number;
  fireCooldown: number;
  healTimer: number;
  healItem: keyof typeof HEALS | null;
  invuln: number;
  teamId: number;
  // bot AI
  botState?: string;
  botTargetId?: string | null;
  botTimer?: number;
  botAimError?: number;
  botReactUntil?: number;
  lootTargetId?: string | null;
  rotateTarget?: Vec2 | null;
  dropTarget?: Vec2 | null;
};

export function createFighter(
  id: string,
  name: string,
  x: number,
  y: number,
  isBot: boolean,
  difficulty?: BotDifficulty,
): Fighter {
  const sidekick = WEAPONS[STARTER_WEAPON]!;
  return {
    id,
    name,
    isBot,
    difficulty,
    x,
    y,
    vx: 0,
    vy: 0,
    aim: 0,
    hp: MAX_HP,
    boost: 0,
    state: "plane",
    radius: PLAYER_RADIUS,
    kills: 0,
    damageDealt: 0,
    helmet: 0,
    vest: 0,
    backpack: 0,
    primary: null,
    secondary: {
      weaponId: STARTER_WEAPON,
      ammoInMag: sidekick.magSize,
      attachments: {},
    },
    melee: {
      weaponId: STARTER_MELEE,
      ammoInMag: 0,
      attachments: {},
    },
    activeSlot: 1,
    ammo: { "556": 60, "762": 0, "9mm": 45, "12g": 0, "45": 0 },
    heals: { bandage: 5 },
    frags: 0,
    smokes: 0,
    attachments: [],
    reloadTimer: 0,
    fireCooldown: 0,
    healTimer: 0,
    healItem: null,
    invuln: 0,
    teamId: isBot ? 1 : 0,
    botState: "drop",
    botTargetId: null,
    botTimer: 0,
    botAimError: 0,
    botReactUntil: 0,
    lootTargetId: null,
    rotateTarget: null,
    dropTarget: null,
  };
}

export function activeWeapon(f: Fighter): WeaponInstance | null {
  if (f.activeSlot === 0) return f.primary;
  if (f.activeSlot === 1) return f.secondary;
  if (f.activeSlot === 2) return f.melee;
  return null;
}

export function magCapacity(inst: WeaponInstance): number {
  const def = WEAPONS[inst.weaponId];
  if (!def) return 0;
  let size = def.magSize;
  const magId = inst.attachments.mag;
  if (magId && ATTACHMENTS[magId]?.magBonus) {
    size += ATTACHMENTS[magId]!.magBonus!;
  }
  return size;
}

export function weaponSpread(inst: WeaponInstance, moving: boolean, ads: boolean): number {
  const def = WEAPONS[inst.weaponId]!;
  let spread = def.spread;
  if (moving) spread *= def.movePenalty;
  if (ads) spread *= def.adsSpreadMul;
  for (const slot of ["grip", "muzzle"] as const) {
    const id = inst.attachments[slot];
    if (id && ATTACHMENTS[id]?.spreadMul) spread *= ATTACHMENTS[id]!.spreadMul!;
  }
  return spread;
}

export function armorReduction(f: Fighter, headshot: boolean): number {
  if (headshot) {
    if (f.helmet >= 3) return ARMOR.helmet_3.reduction;
    if (f.helmet >= 2) return ARMOR.helmet_2.reduction;
    if (f.helmet >= 1) return ARMOR.helmet_1.reduction;
    return 0;
  }
  if (f.vest >= 3) return ARMOR.vest_3.reduction;
  if (f.vest >= 2) return ARMOR.vest_2.reduction;
  if (f.vest >= 1) return ARMOR.vest_1.reduction;
  return 0;
}

export function applyDamage(f: Fighter, raw: number, headshot: boolean): number {
  if (f.state === "dead" || f.state === "plane") return 0;
  if (f.invuln > 0) return 0;
  const red = armorReduction(f, headshot);
  const dmg = Math.max(1, Math.round(raw * (1 - red)));
  f.hp -= dmg;
  if (f.healTimer > 0) {
    f.healTimer = 0;
    f.healItem = null;
  }
  if (f.hp <= 0) {
    f.hp = 0;
    f.state = "dead";
  }
  return dmg;
}

export function backpackCap(f: Fighter): number {
  if (f.backpack >= 3) return ARMOR.backpack_3.capacity;
  if (f.backpack >= 2) return ARMOR.backpack_2.capacity;
  if (f.backpack >= 1) return ARMOR.backpack_1.capacity;
  return 30;
}

export function tryPickup(f: Fighter, item: LootKind): boolean {
  switch (item.type) {
    case "weapon": {
      const def = WEAPONS[item.weaponId];
      if (!def) return false;
      const inst: WeaponInstance = {
        weaponId: item.weaponId,
        ammoInMag: def.magSize,
        attachments: {},
      };
      if (def.ammo) {
        f.ammo[def.ammo] = (f.ammo[def.ammo] ?? 0) + def.magSize;
      }
      if (def.slot === "secondary") {
        f.secondary = inst;
        f.activeSlot = 1;
      } else if (def.slot === "melee") {
        f.melee = inst;
      } else if (def.slot === "throwable") {
        if (item.weaponId === "frag") f.frags += 1;
        else f.smokes += 1;
      } else {
        f.primary = inst;
        f.activeSlot = 0;
      }
      return true;
    }
    case "ammo": {
      f.ammo[item.ammo] = (f.ammo[item.ammo] ?? 0) + item.amount;
      return true;
    }
    case "heal": {
      const cur = f.heals[item.healId] ?? 0;
      const max = HEALS[item.healId].maxStack;
      if (cur >= max) return false;
      f.heals[item.healId] = Math.min(max, cur + item.amount);
      return true;
    }
    case "armor": {
      const def = ARMOR[item.armorId];
      if (!def) return false;
      if (def.slot === "helmet" && def.level > f.helmet) {
        f.helmet = def.level;
        return true;
      }
      if (def.slot === "vest" && def.level > f.vest) {
        f.vest = def.level;
        return true;
      }
      if (def.slot === "backpack" && def.level > f.backpack) {
        f.backpack = def.level;
        return true;
      }
      return false;
    }
    case "attachment": {
      f.attachments.push(item.attachmentId);
      // auto-equip if compatible with active gun
      const att = ATTACHMENTS[item.attachmentId];
      const gun = activeWeapon(f);
      if (att && gun) {
        const wdef = WEAPONS[gun.weaponId];
        if (wdef && att.compatible.includes(wdef.category)) {
          gun.attachments[att.slot] = att.id;
        }
      }
      return true;
    }
    case "throwable": {
      if (item.weaponId === "frag") f.frags += item.amount;
      else f.smokes += item.amount;
      return true;
    }
  }
}

export function startHeal(f: Fighter, item: keyof typeof HEALS): boolean {
  if (f.state !== "alive") return false;
  const count = f.heals[item] ?? 0;
  if (count <= 0) return false;
  const def = HEALS[item];
  if (def.heal > 0 && f.hp >= MAX_HP) return false;
  if (def.boost > 0 && f.boost >= MAX_BOOST) return false;
  f.healItem = item;
  f.healTimer = def.useTime;
  return true;
}

export function tickHeal(f: Fighter, dt: number): void {
  if (!f.healItem || f.healTimer <= 0) return;
  f.healTimer -= dt;
  if (f.healTimer > 0) return;
  const item = f.healItem;
  const def = HEALS[item];
  f.heals[item] = Math.max(0, (f.heals[item] ?? 1) - 1);
  f.hp = Math.min(MAX_HP, f.hp + def.heal);
  f.boost = Math.min(MAX_BOOST, f.boost + def.boost);
  f.healItem = null;
  f.healTimer = 0;
}

export function tickBoost(f: Fighter, dt: number): void {
  if (f.boost <= 0 || f.state !== "alive") return;
  // boost regenerates HP slowly
  const rate = f.boost > 60 ? 4 : 2; // hp per second
  f.hp = Math.min(MAX_HP, f.hp + rate * dt);
  f.boost = Math.max(0, f.boost - 3 * dt);
}
