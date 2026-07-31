import {
  BOT_NAMES,
  MAP_SIZE,
  PLAYER_ADS_SPEED,
  PLAYER_SPEED,
  POIS,
  WEAPONS,
  type BotDifficulty,
} from "@stick-royale/shared";
import { activeWeapon, startHeal, tryPickup, type Fighter } from "./fighter";
import { hasLos, startReload, tryFire, type Bullet, type FragNade, type MeleeSwing, type SmokeCloud } from "./combat";
import type { IslandMap, LootPile } from "./mapgen";
import { angleDiff, angleTo, clamp, createRng, dist, moveTowardAngle, normalize, pick } from "./math";
import type { ZoneState } from "./zone";
import { outsideBlue } from "./zone";

type BotProfile = {
  aimError: number;
  turnRate: number;
  reaction: number;
  accuracy: number;
  lootGreed: number;
  healHp: number;
  engageRange: number;
  fleeHp: number;
  dropDelay: number;
};

const PROFILES: Record<BotDifficulty, BotProfile> = {
  easy: {
    aimError: 0.42,
    turnRate: 2.4,
    reaction: 0.7,
    accuracy: 0.28,
    lootGreed: 0.95,
    healHp: 50,
    engageRange: 240,
    fleeHp: 30,
    dropDelay: 4.5,
  },
  normal: {
    aimError: 0.18,
    turnRate: 4.2,
    reaction: 0.28,
    accuracy: 0.6,
    lootGreed: 0.65,
    healHp: 45,
    engageRange: 360,
    fleeHp: 30,
    dropDelay: 1.2,
  },
  hard: {
    aimError: 0.08,
    turnRate: 6.5,
    reaction: 0.12,
    accuracy: 0.82,
    lootGreed: 0.4,
    healHp: 40,
    engageRange: 480,
    fleeHp: 35,
    dropDelay: 0.4,
  },
};

export function updateBot(
  bot: Fighter,
  fighters: Fighter[],
  map: IslandMap,
  zone: ZoneState,
  dt: number,
  time: number,
  bullets: Bullet[],
  melees: MeleeSwing[],
  frags: FragNade[],
  smokes: SmokeCloud[],
  rng: () => number,
): void {
  if (bot.state === "dead") return;
  const diff = bot.difficulty ?? "easy";
  const profile = PROFILES[diff];

  bot.botTimer = (bot.botTimer ?? 0) + dt;

  if (bot.state === "plane") {
    // wait then jump toward drop target
    if (!bot.dropTarget) {
      const poi = pick(rng, POIS);
      bot.dropTarget = {
        x: poi.x + (rng() - 0.5) * poi.radius,
        y: poi.y + (rng() - 0.5) * poi.radius,
      };
    }
    if (bot.botTimer! > profile.dropDelay + rng() * 3) {
      bot.state = "parachute";
      bot.botTimer = 0;
      bot.botState = "drop";
    }
    return;
  }

  if (bot.state === "parachute") {
    const target = bot.dropTarget ?? { x: MAP_SIZE / 2, y: MAP_SIZE / 2 };
    const dir = normalize({ x: target.x - bot.x, y: target.y - bot.y });
    bot.x += dir.x * 140 * dt;
    bot.y += dir.y * 140 * dt;
    bot.aim = angleTo(bot, target);
    if (dist(bot, target) < 40 || bot.botTimer! > 8) {
      bot.state = "alive";
      bot.botState = "loot";
      bot.invuln = 0.5;
    }
    return;
  }

  if (bot.state !== "alive") return;

  // cancel heal if threatened later
  const enemy = findThreat(bot, fighters, map, profile.engageRange * 1.2);
  const inBlueDanger = outsideBlue(zone, bot.x, bot.y);
  const nearEdge = dist(bot, zone.blue) > zone.blue.r - 80;

  // heal
  if (!enemy && bot.hp < profile.healHp && (bot.heals.bandage || bot.heals.medkit)) {
    if (!bot.healItem) {
      if (bot.hp < 40 && (bot.heals.medkit ?? 0) > 0) startHeal(bot, "medkit");
      else if ((bot.heals.bandage ?? 0) > 0) startHeal(bot, "bandage");
    }
  }

  // flee low HP
  if (enemy && bot.hp < profile.fleeHp) {
    bot.botState = "flee";
  } else if (inBlueDanger || (nearEdge && zone.shrinking)) {
    bot.botState = "rotate";
  } else if (enemy) {
    bot.botState = "engage";
  } else if ((bot.botState === "engage" || bot.botState === "flee") && !enemy) {
    bot.botState = zone.phaseIndex >= 3 ? "endgame" : "loot";
  }

  const state = bot.botState ?? "loot";

  switch (state) {
    case "loot":
      botLoot(bot, map, zone, profile, dt, rng);
      break;
    case "rotate":
    case "endgame":
      botRotate(bot, zone, dt);
      break;
    case "engage":
      botEngage(bot, enemy, map, profile, dt, time, bullets, melees, frags, smokes, rng);
      break;
    case "flee":
      botFlee(bot, enemy, zone, dt);
      break;
    default:
      botLoot(bot, map, zone, profile, dt, rng);
  }

  // auto reload
  const gun = activeWeapon(bot);
  if (gun && gun.ammoInMag === 0) startReload(bot);

  // prefer primary if owned
  if (bot.primary && bot.activeSlot === 1) bot.activeSlot = 0;
}

function findThreat(
  bot: Fighter,
  fighters: Fighter[],
  map: IslandMap,
  range: number,
): Fighter | null {
  let best: Fighter | null = null;
  let bestD = range;
  const range2 = range * range;
  for (const f of fighters) {
    if (f.id === bot.id || f.state !== "alive") continue;
    if (f.teamId === bot.teamId) continue;
    const dx = bot.x - f.x;
    const dy = bot.y - f.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > range2) continue;
    const d = Math.sqrt(d2);
    // Always require LOS — no wallbangs at close range
    if (d < bestD && hasLos(bot, f, map.buildings, map.cover)) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

function botLoot(
  bot: Fighter,
  map: IslandMap,
  zone: ZoneState,
  profile: BotProfile,
  dt: number,
  rng: () => number,
): void {
  // pick nearest loot if needed
  if (!bot.lootTargetId || !map.loot.find((l) => l.id === bot.lootTargetId)) {
    let best: LootPile | null = null;
    let bestScore = -Infinity;
    for (const pile of map.loot) {
      if (pile.items.length === 0) continue;
      if (outsideBlue(zone, pile.x, pile.y) && zone.phaseIndex > 0) continue;
      const d = dist(bot, pile);
      if (d > 500) continue;
      const score = lootScore(bot, pile) / (d + 40) + rng() * profile.lootGreed;
      if (score > bestScore) {
        bestScore = score;
        best = pile;
      }
    }
    bot.lootTargetId = best?.id ?? null;
    if (!best) {
      // wander toward white zone / random poi
      if (!bot.rotateTarget || dist(bot, bot.rotateTarget) < 40) {
        const poi = pick(rng, POIS);
        bot.rotateTarget = {
          x: clamp(poi.x + (rng() - 0.5) * 120, 100, MAP_SIZE - 100),
          y: clamp(poi.y + (rng() - 0.5) * 120, 100, MAP_SIZE - 100),
        };
      }
      moveBot(bot, bot.rotateTarget!, PLAYER_SPEED * 0.85, dt);
      return;
    }
  }

  const pile = map.loot.find((l) => l.id === bot.lootTargetId);
  if (!pile) return;
  moveBot(bot, pile, PLAYER_SPEED, dt);
  bot.aim = angleTo(bot, pile);
  if (dist(bot, pile) < 36) {
    while (pile.items.length > 0) {
      const item = pile.items[0]!;
      const res = tryPickup(bot, item);
      if (res.ok) {
        pile.items.shift();
        if (res.dropped) pile.items.push(res.dropped);
      } else break;
    }
    if (pile.items.length === 0) bot.lootTargetId = null;
  }
}

function lootScore(bot: Fighter, pile: LootPile): number {
  let s = 1;
  for (const item of pile.items) {
    if (item.type === "weapon" && !bot.primary) s += 5;
    if (item.type === "weapon" && bot.primary) s += 2;
    if (item.type === "armor") s += 3;
    if (item.type === "ammo") s += 1.5;
    if (item.type === "heal") s += 2;
  }
  return s;
}

function botRotate(bot: Fighter, zone: ZoneState, dt: number): void {
  const target = { x: zone.white.x, y: zone.white.y };
  // bias toward center of white
  const ang = Math.atan2(bot.y - zone.white.y, bot.x - zone.white.x);
  const safeR = Math.max(20, zone.white.r * 0.6);
  target.x = zone.white.x + Math.cos(ang + Math.PI) * safeR * 0.3;
  target.y = zone.white.y + Math.sin(ang + Math.PI) * safeR * 0.3;
  if (outsideBlue(zone, bot.x, bot.y)) {
    target.x = zone.blue.x;
    target.y = zone.blue.y;
  }
  moveBot(bot, target, PLAYER_SPEED * 1.05, dt);
  bot.aim = angleTo(bot, target);
}

function botEngage(
  bot: Fighter,
  enemy: Fighter | null,
  map: IslandMap,
  profile: BotProfile,
  dt: number,
  time: number,
  bullets: Bullet[],
  melees: MeleeSwing[],
  frags: FragNade[],
  smokes: SmokeCloud[],
  rng: () => number,
): void {
  if (!enemy) {
    bot.botState = "loot";
    return;
  }

  const d = dist(bot, enemy);
  const desired = angleTo(bot, enemy);
  bot.aim = moveTowardAngle(bot.aim, desired + (bot.botAimError ?? 0), profile.turnRate * dt);

  // strafe
  const tang = desired + Math.PI / 2;
  const toward = d > profile.engageRange * 0.55 ? 1 : d < 90 ? -1 : 0;
  const dir = normalize({
    x: Math.cos(desired) * toward + Math.cos(tang) * Math.sin(time * 2 + bot.x * 0.01),
    y: Math.sin(desired) * toward + Math.sin(tang) * Math.sin(time * 2 + bot.x * 0.01),
  });
  const speed = PLAYER_ADS_SPEED;
  bot.x += dir.x * speed * dt;
  bot.y += dir.y * speed * dt;

  // reaction gate
  if (time < (bot.botReactUntil ?? 0)) return;
  if (Math.abs(angleDiff(bot.aim, desired)) > 0.35) return;

  // refresh aim error
  if (rng() < 0.05) bot.botAimError = (rng() - 0.5) * profile.aimError * 2;

  const gun = activeWeapon(bot);
  const def = gun ? WEAPONS[gun.weaponId] : null;
  const maxRange = def?.range ?? 200;
  if (d < maxRange * 0.95 && hasLos(bot, enemy, map.buildings, map.cover)) {
    if (rng() < profile.accuracy * dt * 8) {
      tryFire(bot, true, false, bullets, melees, frags, smokes, rng);
      bot.botReactUntil = time + profile.reaction * (0.5 + rng());
    }
  }
}

function botFlee(bot: Fighter, enemy: Fighter | null, zone: ZoneState, dt: number): void {
  let tx = zone.white.x;
  let ty = zone.white.y;
  if (enemy) {
    const away = normalize({ x: bot.x - enemy.x, y: bot.y - enemy.y });
    tx = bot.x + away.x * 200;
    ty = bot.y + away.y * 200;
  }
  moveBot(bot, { x: tx, y: ty }, PLAYER_SPEED * 1.1, dt);
  if ((bot.heals.bandage ?? 0) > 0 && bot.hp < 50 && !bot.healItem) {
    startHeal(bot, "bandage");
  }
}

function moveBot(bot: Fighter, target: { x: number; y: number }, speed: number, dt: number): void {
  const dir = normalize({ x: target.x - bot.x, y: target.y - bot.y });
  bot.x += dir.x * speed * dt;
  bot.y += dir.y * speed * dt;
  bot.x = clamp(bot.x, 40, MAP_SIZE - 40);
  bot.y = clamp(bot.y, 40, MAP_SIZE - 40);
}

export function botDropFinished(bot: Fighter): boolean {
  return bot.state === "alive" || bot.state === "dead";
}

/** Seeded name picker avoiding duplicates */
export function assignBotNames(count: number, seed: number): string[] {
  const rng = createRng(seed ^ 0xabc);
  const pool = [...BOT_NAMES];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    if (pool.length === 0) {
      out.push(`Stick${i + 1}`);
      continue;
    }
    const idx = Math.floor(rng() * pool.length);
    out.push(pool.splice(idx, 1)[0]!);
  }
  return out;
}
