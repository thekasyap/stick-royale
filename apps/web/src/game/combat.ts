import { WEAPONS, type Vec2 } from "@stick-royale/shared";
import {
  activeWeapon,
  applyDamage,
  magCapacity,
  weaponSpread,
  type Fighter,
  type WeaponInstance,
} from "./fighter";
import { angleTo, chance, dist, lineHitsCircle } from "./math";
import type { Building, Cover } from "./mapgen";

export type Bullet = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  headMul: number;
  ownerId: string;
  rangeLeft: number;
  life: number;
};

export type MeleeSwing = {
  ownerId: string;
  x: number;
  y: number;
  aim: number;
  range: number;
  damage: number;
  life: number;
  hit: Set<string>;
};

export type FragNade = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fuse: number;
  ownerId: string;
};

export type SmokeCloud = {
  id: string;
  x: number;
  y: number;
  r: number;
  life: number;
};

let bulletSeq = 0;

export function tryFire(
  f: Fighter,
  ads: boolean,
  moving: boolean,
  bullets: Bullet[],
  melees: MeleeSwing[],
  frags: FragNade[],
  smokes: SmokeCloud[],
  rng: () => number,
): boolean {
  if (f.state !== "alive" || f.reloadTimer > 0 || f.healTimer > 0 || f.vehicleId) return false;
  if (f.fireCooldown > 0) return false;

  // throwable slot
  if (f.activeSlot === 3) {
    if (f.frags > 0) {
      f.frags -= 1;
      f.fireCooldown = 0.8;
      const speed = 280;
      frags.push({
        id: `frag_${++bulletSeq}`,
        x: f.x + Math.cos(f.aim) * 20,
        y: f.y + Math.sin(f.aim) * 20,
        vx: Math.cos(f.aim) * speed,
        vy: Math.sin(f.aim) * speed,
        fuse: 2.2,
        ownerId: f.id,
      });
      return true;
    }
    if (f.smokes > 0) {
      f.smokes -= 1;
      f.fireCooldown = 0.8;
      smokes.push({
        id: `smoke_${++bulletSeq}`,
        x: f.x + Math.cos(f.aim) * 80,
        y: f.y + Math.sin(f.aim) * 80,
        r: 70,
        life: 12,
      });
      return true;
    }
    return false;
  }

  const inst = activeWeapon(f);
  if (!inst) return false;
  const def = WEAPONS[inst.weaponId];
  if (!def) return false;

  if (def.category === "melee") {
    f.fireCooldown = 1 / def.fireRate;
    melees.push({
      ownerId: f.id,
      x: f.x,
      y: f.y,
      aim: f.aim,
      range: def.range,
      damage: def.damage,
      life: 0.18,
      hit: new Set(),
    });
    return true;
  }

  if (inst.ammoInMag <= 0) return false;

  f.fireCooldown = 1 / def.fireRate;
  inst.ammoInMag -= 1;

  const spread = weaponSpread(inst, moving, ads);
  for (let i = 0; i < def.pelletCount; i++) {
    const ang = f.aim + (rng() - 0.5) * 2 * spread;
    const spd = def.bulletSpeed;
    bullets.push({
      id: `b_${++bulletSeq}`,
      x: f.x + Math.cos(ang) * (f.radius + 4),
      y: f.y + Math.sin(ang) * (f.radius + 4),
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      damage: def.damage,
      headMul: def.headMultiplier,
      ownerId: f.id,
      rangeLeft: def.range,
      life: def.range / spd + 0.05,
    });
  }
  return true;
}

export function startReload(f: Fighter): boolean {
  if (f.state !== "alive" || f.reloadTimer > 0) return false;
  const inst = activeWeapon(f);
  if (!inst) return false;
  const def = WEAPONS[inst.weaponId];
  if (!def || !def.ammo) return false;
  const cap = magCapacity(inst);
  if (inst.ammoInMag >= cap) return false;
  const reserve = f.ammo[def.ammo] ?? 0;
  if (reserve <= 0) return false;
  f.reloadTimer = def.reloadTime;
  f.healTimer = 0;
  f.healItem = null;
  return true;
}

export function tickReload(f: Fighter, dt: number): void {
  if (f.reloadTimer <= 0) return;
  f.reloadTimer -= dt;
  if (f.reloadTimer > 0) return;
  f.reloadTimer = 0;
  const inst = activeWeapon(f);
  if (!inst) return;
  const def = WEAPONS[inst.weaponId];
  if (!def?.ammo) return;
  const cap = magCapacity(inst);
  const need = cap - inst.ammoInMag;
  const take = Math.min(need, f.ammo[def.ammo] ?? 0);
  f.ammo[def.ammo]! -= take;
  inst.ammoInMag += take;
}

export function updateBullets(
  bullets: Bullet[],
  fighters: Fighter[],
  buildings: Building[],
  cover: Cover[],
  dt: number,
  onHit: (attacker: Fighter, victim: Fighter, dmg: number, weaponId: string) => void,
  allowKnock = false,
): void {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]!;
    const ox = b.x;
    const oy = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    const traveled = Math.hypot(b.vx, b.vy) * dt;
    b.rangeLeft -= traveled;
    b.life -= dt;

    let blocked = false;
    for (const build of buildings) {
      if (
        b.x >= build.x && b.x <= build.x + build.w &&
        b.y >= build.y && b.y <= build.y + build.h
      ) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      for (const c of cover) {
        if (c.kind === "bush") continue;
        if (lineHitsCircle(ox, oy, b.x, b.y, c.x, c.y, c.r * 0.85)) {
          blocked = true;
          break;
        }
      }
    }

    if (blocked || b.life <= 0 || b.rangeLeft <= 0) {
      bullets.splice(i, 1);
      continue;
    }

    const owner = fighters.find((f) => f.id === b.ownerId);
    for (const victim of fighters) {
      if (victim.id === b.ownerId) continue;
      if (victim.state !== "alive" && victim.state !== "downed") continue;
      if (owner && victim.teamId === owner.teamId && owner.id !== victim.id) continue;
      if (!circleRay(ox, oy, b.x, b.y, victim.x, victim.y, victim.radius)) continue;
      const headshot =
        Math.abs(b.y - (victim.y - victim.radius * 0.55)) < victim.radius * 0.45 &&
        chance(() => Math.random(), 0.25);
      const raw = headshot ? b.damage * b.headMul : b.damage;
      const dealt = applyDamage(victim, raw, headshot, {
        allowKnock,
        teammates: fighters,
      });
      if (owner && dealt > 0) {
        owner.damageDealt += dealt;
        const gun = activeWeapon(owner);
        onHit(owner, victim, dealt, gun?.weaponId ?? "gun");
      }
      bullets.splice(i, 1);
      break;
    }
  }
}

function circleRay(
  x1: number, y1: number, x2: number, y2: number,
  cx: number, cy: number, r: number,
): boolean {
  return lineHitsCircle(x1, y1, x2, y2, cx, cy, r);
}

export function updateMelees(
  melees: MeleeSwing[],
  fighters: Fighter[],
  dt: number,
  onHit: (attacker: Fighter, victim: Fighter, dmg: number, weaponId: string) => void,
  allowKnock = false,
): void {
  for (let i = melees.length - 1; i >= 0; i--) {
    const m = melees[i]!;
    m.life -= dt;
    const owner = fighters.find((f) => f.id === m.ownerId);
    for (const victim of fighters) {
      if (victim.id === m.ownerId || (victim.state !== "alive" && victim.state !== "downed")) continue;
      if (m.hit.has(victim.id)) continue;
      const hx = m.x + Math.cos(m.aim) * (m.range * 0.6);
      const hy = m.y + Math.sin(m.aim) * (m.range * 0.6);
      if (dist({ x: hx, y: hy }, victim) < victim.radius + 16) {
        m.hit.add(victim.id);
        const dealt = applyDamage(victim, m.damage, false, { allowKnock, teammates: fighters });
        if (owner && dealt > 0) {
          owner.damageDealt += dealt;
          onHit(owner, victim, dealt, "pan");
        }
      }
    }
    if (m.life <= 0) melees.splice(i, 1);
  }
}

export function updateFrags(
  frags: FragNade[],
  fighters: Fighter[],
  dt: number,
  onHit: (attacker: Fighter, victim: Fighter, dmg: number, weaponId: string) => void,
  allowKnock = false,
): void {
  for (let i = frags.length - 1; i >= 0; i--) {
    const g = frags[i]!;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.vx *= 0.98;
    g.vy *= 0.98;
    g.fuse -= dt;
    if (g.fuse > 0) continue;
    const owner = fighters.find((f) => f.id === g.ownerId);
    for (const victim of fighters) {
      if (victim.state !== "alive") continue;
      const d = dist(g, victim);
      if (d < 110) {
        const falloff = 1 - d / 110;
        const raw = 100 * falloff;
        const dealt = applyDamage(victim, raw, false, { allowKnock, teammates: fighters });
        if (owner && dealt > 0 && victim.id !== owner.id) {
          owner.damageDealt += dealt;
          onHit(owner, victim, dealt, "frag");
        }
      }
    }
    frags.splice(i, 1);
  }
}

export function updateSmokes(smokes: SmokeCloud[], dt: number): void {
  for (let i = smokes.length - 1; i >= 0; i--) {
    smokes[i]!.life -= dt;
    if (smokes[i]!.life <= 0) smokes.splice(i, 1);
  }
}

export function resolveCollision(
  f: Fighter,
  buildings: Building[],
  cover: Cover[],
): void {
  for (const b of buildings) {
    const nearestX = Math.max(b.x, Math.min(f.x, b.x + b.w));
    const nearestY = Math.max(b.y, Math.min(f.y, b.y + b.h));
    const dx = f.x - nearestX;
    const dy = f.y - nearestY;
    const d2 = dx * dx + dy * dy;
    if (d2 < f.radius * f.radius && d2 > 0) {
      const d = Math.sqrt(d2);
      const push = (f.radius - d) / d;
      f.x += dx * push;
      f.y += dy * push;
    } else if (d2 === 0) {
      f.x = b.x - f.radius - 1;
    }
  }
  for (const c of cover) {
    if (c.kind === "bush") continue;
    const dx = f.x - c.x;
    const dy = f.y - c.y;
    const d = Math.hypot(dx, dy);
    const minD = f.radius + c.r * 0.7;
    if (d < minD && d > 0) {
      const push = (minD - d) / d;
      f.x += dx * push;
      f.y += dy * push;
    }
  }
}

export function hasLos(
  from: Vec2,
  to: Vec2,
  buildings: Building[],
  cover: Cover[],
): boolean {
  for (const b of buildings) {
    // coarse AABB segment test
    if (segmentHitsAabb(from.x, from.y, to.x, to.y, b.x, b.y, b.w, b.h)) return false;
  }
  for (const c of cover) {
    if (c.kind === "bush" || c.kind === "tree") continue;
    if (lineHitsCircle(from.x, from.y, to.x, to.y, c.x, c.y, c.r * 0.8)) return false;
  }
  return true;
}

function segmentHitsAabb(
  x1: number, y1: number, x2: number, y2: number,
  rx: number, ry: number, rw: number, rh: number,
): boolean {
  // Liang-Barsky style quick reject via midpoint samples
  const steps = 8;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) return true;
  }
  return false;
}

export type { WeaponInstance };
