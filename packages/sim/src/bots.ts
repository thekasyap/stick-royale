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
import type { IslandMap, LootKind, LootPile } from "./mapgen";
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
  /** Lead shots by predicting target motion (0 = none) */
  lead: number;
  /** Prefer closing the gap at full run speed */
  aggression: number;
  /** Fire cone (radians) — tighter = more deliberate */
  fireCone: number;
  /** Use boosts before mid/late game fights */
  useBoost: boolean;
  /** Throw frags when clustered */
  useNades: boolean;
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
    lead: 0,
    aggression: 0.25,
    fireCone: 0.4,
    useBoost: false,
    useNades: false,
  },
  // Medium — smarter fights, still beatable
  normal: {
    aimError: 0.12,
    turnRate: 5.2,
    reaction: 0.18,
    accuracy: 0.72,
    lootGreed: 0.5,
    healHp: 55,
    engageRange: 400,
    fleeHp: 38,
    dropDelay: 0.9,
    lead: 0.55,
    aggression: 0.7,
    fireCone: 0.2,
    useBoost: true,
    useNades: false,
  },
  // Hard — push, lead aim, boost, nades
  hard: {
    aimError: 0.045,
    turnRate: 7.8,
    reaction: 0.07,
    accuracy: 0.9,
    lootGreed: 0.28,
    healHp: 60,
    engageRange: 520,
    fleeHp: 42,
    dropDelay: 0.25,
    lead: 0.95,
    aggression: 1.15,
    fireCone: 0.11,
    useBoost: true,
    useNades: true,
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
): boolean {
  if (bot.state === "dead") return false;
  const diff = bot.difficulty ?? "easy";
  const profile = PROFILES[diff];

  bot.botTimer = (bot.botTimer ?? 0) + dt;

  if (bot.state === "plane") {
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
    return false;
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
    return false;
  }

  if (bot.state !== "alive") return false;

  const enemy = findThreat(bot, fighters, map, profile.engageRange * 1.25);
  const inBlueDanger = outsideBlue(zone, bot.x, bot.y);
  const nearEdge = dist(bot, zone.blue) > zone.blue.r - 80;

  // Cancel heal if threatened
  if (enemy && bot.healItem) {
    bot.healItem = null;
    bot.healTimer = 0;
  }

  // Pre-fight boost (medium/hard)
  if (
    profile.useBoost &&
    !enemy &&
    zone.phaseIndex >= 2 &&
    bot.boost < 40 &&
    !bot.healItem
  ) {
    if ((bot.heals.painkiller ?? 0) > 0) startHeal(bot, "painkiller");
    else if ((bot.heals.energy_drink ?? 0) > 0) startHeal(bot, "energy_drink");
  }

  if (!enemy && bot.hp < profile.healHp && (bot.heals.bandage || bot.heals.medkit)) {
    if (!bot.healItem) {
      if (bot.hp < 45 && (bot.heals.medkit ?? 0) > 0) startHeal(bot, "medkit");
      else if ((bot.heals.bandage ?? 0) > 0) startHeal(bot, "bandage");
    }
  }

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
      return botEngage(bot, enemy, map, profile, dt, time, bullets, melees, frags, smokes, rng);
    case "flee":
      botFlee(bot, enemy, zone, profile, dt, time, bullets, melees, frags, smokes, rng);
      break;
    default:
      botLoot(bot, map, zone, profile, dt, rng);
  }

  const gun = activeWeapon(bot);
  if (gun && gun.ammoInMag === 0) startReload(bot);

  if (bot.primary && bot.activeSlot === 1) bot.activeSlot = 0;
  return false;
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
    const dropped: LootKind[] = [];
    while (pile.items.length > 0) {
      const item = pile.items[0]!;
      const res = tryPickup(bot, item);
      if (res.ok) {
        pile.items.shift();
        if (res.dropped) dropped.push(res.dropped);
      } else break;
    }
    if (dropped.length > 0) {
      map.loot.push({
        id: `botdrop_${bot.id}_${Math.floor(bot.x)}_${Math.floor(bot.y)}_${dropped.length}`,
        x: bot.x + (rng() - 0.5) * 18,
        y: bot.y + (rng() - 0.5) * 18,
        items: dropped,
      });
    }
    if (pile.items.length === 0) bot.lootTargetId = null;
  }
}

function lootScore(bot: Fighter, pile: LootPile): number {
  let s = 1;
  for (const item of pile.items) {
    if (item.type === "weapon") {
      const def = WEAPONS[item.weaponId];
      const dmg = def?.damage ?? 20;
      if (!bot.primary) s += 6 + dmg * 0.05;
      else {
        const cur = WEAPONS[bot.primary.weaponId]?.damage ?? 20;
        s += dmg > cur ? 4 : 1;
      }
    }
    if (item.type === "armor") s += 3.5;
    if (item.type === "ammo") s += 1.5;
    if (item.type === "heal") s += item.healId === "medkit" ? 3 : 2;
    if (item.type === "throwable") s += 1.2;
  }
  return s;
}

function botRotate(bot: Fighter, zone: ZoneState, dt: number): void {
  const target = { x: zone.white.x, y: zone.white.y };
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

function predictAim(bot: Fighter, enemy: Fighter, lead: number): number {
  if (lead <= 0) return angleTo(bot, enemy);
  // Crude velocity from recent displacement isn't tracked — approximate with strafe noise
  // Lead toward enemy facing (they usually move that way when fighting)
  const gun = activeWeapon(bot);
  const def = gun ? WEAPONS[gun.weaponId] : null;
  const bulletSpeed = def?.bulletSpeed ?? 520;
  const d = dist(bot, enemy);
  const t = (d / Math.max(180, bulletSpeed)) * lead;
  const vx = Math.cos(enemy.aim) * PLAYER_SPEED * 0.55 * lead;
  const vy = Math.sin(enemy.aim) * PLAYER_SPEED * 0.55 * lead;
  return angleTo(bot, { x: enemy.x + vx * t, y: enemy.y + vy * t });
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
): boolean {
  if (!enemy) {
    bot.botState = "loot";
    return false;
  }

  const d = dist(bot, enemy);
  const desired = predictAim(bot, enemy, profile.lead);
  if (bot.botAimError === undefined || bot.botAimError === 0 || rng() < 0.08) {
    bot.botAimError = (rng() - 0.5) * profile.aimError * 2;
  }
  bot.aim = moveTowardAngle(bot.aim, desired + (bot.botAimError ?? 0), profile.turnRate * dt);

  // Push / strafe — hard bots close at near full speed
  const tang = desired + Math.PI / 2;
  const push = d > profile.engageRange * 0.5 ? profile.aggression : d < 85 ? -0.85 : 0.15;
  const dir = normalize({
    x: Math.cos(desired) * push + Math.cos(tang) * Math.sin(time * 2.4 + bot.x * 0.01) * 0.85,
    y: Math.sin(desired) * push + Math.sin(tang) * Math.sin(time * 2.4 + bot.x * 0.01) * 0.85,
  });
  const closing = push > 0.4;
  const speed = closing
    ? PLAYER_SPEED * (0.75 + profile.aggression * 0.2)
    : PLAYER_ADS_SPEED * (1 + profile.aggression * 0.15);
  bot.x += dir.x * speed * dt;
  bot.y += dir.y * speed * dt;
  bot.x = clamp(bot.x, 40, MAP_SIZE - 40);
  bot.y = clamp(bot.y, 40, MAP_SIZE - 40);

  // Frag when stacked close (hard)
  if (
    profile.useNades &&
    bot.frags > 0 &&
    d < 130 &&
    d > 55 &&
    time > (bot.botReactUntil ?? 0) &&
    rng() < dt * 0.35
  ) {
    bot.activeSlot = 3;
    const tossed = tryFire(bot, true, false, bullets, melees, frags, smokes, rng);
    bot.activeSlot = bot.primary ? 0 : 1;
    bot.botReactUntil = time + 0.9;
    if (tossed) return true;
  }

  if (time < (bot.botReactUntil ?? 0)) return false;
  if (Math.abs(angleDiff(bot.aim, desired)) > profile.fireCone) return false;

  const gun = activeWeapon(bot);
  if (gun && gun.ammoInMag === 0) startReload(bot);
  const def = gun ? WEAPONS[gun.weaponId] : null;
  const maxRange = def?.range ?? 200;
  if (d < maxRange * 0.98 && hasLos(bot, enemy, map.buildings, map.cover)) {
    const fireRate = 6 + profile.accuracy * 6;
    if (rng() < profile.accuracy * dt * fireRate) {
      const fired = tryFire(bot, true, false, bullets, melees, frags, smokes, rng);
      bot.botReactUntil = time + profile.reaction * (0.45 + rng() * 0.7);
      return fired;
    }
  }
  return false;
}

function botFlee(
  bot: Fighter,
  enemy: Fighter | null,
  zone: ZoneState,
  profile: BotProfile,
  dt: number,
  time: number,
  bullets: Bullet[],
  melees: MeleeSwing[],
  frags: FragNade[],
  smokes: SmokeCloud[],
  rng: () => number,
): void {
  let tx = zone.white.x;
  let ty = zone.white.y;
  if (enemy) {
    const away = normalize({ x: bot.x - enemy.x, y: bot.y - enemy.y });
    tx = bot.x + away.x * 220;
    ty = bot.y + away.y * 220;

    // Smoke on flee (hard)
    if (profile.useNades && bot.smokes > 0 && time > (bot.botReactUntil ?? 0) && rng() < dt * 0.8) {
      bot.activeSlot = 3;
      // Prefer smoke: temporarily zero frags so tryFire picks smoke path if needed
      // combat tries frags first — if frags>0 it throws frag. So only smoke when no frags or luck.
      if (bot.frags === 0) {
        tryFire(bot, true, false, bullets, melees, frags, smokes, rng);
        bot.botReactUntil = time + 1.2;
      }
      if (bot.primary) bot.activeSlot = 0;
    }
  }
  moveBot(bot, { x: tx, y: ty }, PLAYER_SPEED * 1.12, dt);
  if ((bot.heals.bandage ?? 0) > 0 && bot.hp < 55 && !bot.healItem && !enemy) {
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
