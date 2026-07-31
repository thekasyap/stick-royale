import { MAP_SIZE } from "@stick-royale/shared";
import { dist } from "./math";
import type { Fighter } from "./fighter";
import type { LootKind } from "./mapgen";

export type Vehicle = {
  id: string;
  kind: "buggy" | "boat";
  x: number;
  y: number;
  angle: number;
  hp: number;
  driverId: string | null;
};

export type CarePackage = {
  id: string;
  x: number;
  y: number;
  height: number;
  landed: boolean;
  items: LootKind[];
};

export type RedZone = {
  x: number;
  y: number;
  r: number;
  telegraphUntil: number;
  activeUntil: number;
  active: boolean;
};

export type MapPing = {
  id: string;
  teamId: number;
  x: number;
  y: number;
  kind: "move" | "enemy" | "loot";
  until: number;
};

const VEHICLE_SPEED = { buggy: 310, boat: 260 };
const VEHICLE_HP = 100;

export function spawnVehicles(rng: () => number): Vehicle[] {
  const spots = [
    { kind: "buggy" as const, x: 680, y: 820 },
    { kind: "buggy" as const, x: 1320, y: 640 },
    { kind: "buggy" as const, x: 560, y: 1520 },
    { kind: "buggy" as const, x: 1680, y: 980 },
    { kind: "boat" as const, x: 1880, y: 1560 },
    { kind: "boat" as const, x: 320, y: 1180 },
    { kind: "boat" as const, x: 1180, y: 1980 },
  ];
  return spots.map((s, i) => ({
    id: `veh_${i}`,
    kind: s.kind,
    x: s.x + (rng() - 0.5) * 40,
    y: s.y + (rng() - 0.5) * 40,
    angle: rng() * Math.PI * 2,
    hp: VEHICLE_HP,
    driverId: null,
  }));
}

export function carePackageLoot(): LootKind[] {
  return [
    { type: "weapon", weaponId: "skyline" },
    { type: "armor", armorId: "vest_3" },
    { type: "armor", armorId: "helmet_3" },
    { type: "ammo", ammo: "762", amount: 40 },
    { type: "heal", healId: "medkit", amount: 1 },
    { type: "attachment", attachmentId: "quad_scope" },
  ];
}

export function tickVehicle(
  v: Vehicle,
  driver: Fighter | undefined,
  moveX: number,
  moveY: number,
  dt: number,
  onLandCrash: (dmg: number) => void,
): void {
  if (!driver || driver.state !== "alive") {
    v.driverId = null;
    return;
  }
  const len = Math.hypot(moveX, moveY);
  if (len > 0.1) {
    const speed = VEHICLE_SPEED[v.kind];
    v.angle = Math.atan2(moveY, moveX);
    v.x += (moveX / len) * speed * dt;
    v.y += (moveY / len) * speed * dt;
    v.x = Math.max(60, Math.min(MAP_SIZE - 60, v.x));
    v.y = Math.max(60, Math.min(MAP_SIZE - 60, v.y));
    if (v.kind === "buggy") v.hp -= 2 * dt;
  }
  driver.x = v.x;
  driver.y = v.y;
  driver.aim = v.angle;
  if (v.hp <= 0) {
    v.driverId = null;
    driver.vehicleId = null;
    onLandCrash(30);
    v.hp = VEHICLE_HP;
  }
}

export function tryEnterVehicle(f: Fighter, vehicles: Vehicle[]): boolean {
  if (f.vehicleId) {
    const v = vehicles.find((x) => x.id === f.vehicleId);
    if (v) {
      v.driverId = null;
      f.x = v.x + 28;
      f.y = v.y;
    }
    f.vehicleId = null;
    return true;
  }
  for (const v of vehicles) {
    if (v.driverId) continue;
    if (dist(f, v) < 44) {
      v.driverId = f.id;
      f.vehicleId = v.id;
      return true;
    }
  }
  return false;
}

export function tickCarePackages(packages: CarePackage[], dt: number): void {
  for (const cp of packages) {
    if (!cp.landed) {
      cp.height -= 120 * dt;
      if (cp.height <= 0) {
        cp.height = 0;
        cp.landed = true;
      }
    }
  }
}

export function tickRedZone(
  zone: RedZone | null,
  fighters: Fighter[],
  time: number,
  dt: number,
  onDamage: (f: Fighter, dmg: number) => void,
): RedZone | null {
  if (!zone) return null;
  if (!zone.active && time >= zone.telegraphUntil) zone.active = true;
  if (zone.active && time >= zone.activeUntil) return null;
  if (zone.active) {
    for (const f of fighters) {
      if (f.state !== "alive" && f.state !== "downed") continue;
      if (dist(f, zone) < zone.r) onDamage(f, 38 * dt);
    }
  }
  return zone;
}
