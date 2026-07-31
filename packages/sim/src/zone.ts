import {
  INITIAL_ZONE_RADIUS,
  MAP_CENTER,
  MAP_SIZE,
  ZONE_PHASES,
  type Vec2,
} from "@stick-royale/shared";
import { lerp, pointInCircle } from "./math";

export type ZoneState = {
  phaseIndex: number;
  timer: number;
  shrinking: boolean;
  blue: { x: number; y: number; r: number };
  white: { x: number; y: number; r: number };
  startBlue: { x: number; y: number; r: number };
  damage: number;
  done: boolean;
};

export function createZone(rng: () => number): ZoneState {
  const first = ZONE_PHASES[0]!;
  const white = randomCircle(rng, first.radius, MAP_CENTER, INITIAL_ZONE_RADIUS * 0.55);
  return {
    phaseIndex: 0,
    timer: 0,
    shrinking: false,
    blue: { x: MAP_CENTER.x, y: MAP_CENTER.y, r: INITIAL_ZONE_RADIUS },
    white,
    startBlue: { x: MAP_CENTER.x, y: MAP_CENTER.y, r: INITIAL_ZONE_RADIUS },
    damage: first.damagePerSecond,
    done: false,
  };
}

function randomCircle(rng: () => number, radius: number, center: Vec2, maxOffset: number) {
  const ang = rng() * Math.PI * 2;
  const dist = rng() * maxOffset;
  return {
    x: clampMap(center.x + Math.cos(ang) * dist),
    y: clampMap(center.y + Math.sin(ang) * dist),
    r: radius,
  };
}

function clampMap(v: number): number {
  return Math.max(100, Math.min(MAP_SIZE - 100, v));
}

export function updateZone(zone: ZoneState, dt: number, rng: () => number): void {
  if (zone.done) return;
  const phase = ZONE_PHASES[zone.phaseIndex];
  if (!phase) {
    zone.done = true;
    return;
  }

  zone.timer += dt;
  zone.damage = phase.damagePerSecond;

  if (!zone.shrinking) {
    if (zone.timer >= phase.waitTime) {
      zone.shrinking = true;
      zone.timer = 0;
      zone.startBlue = { ...zone.blue };
    }
  } else {
    const t = Math.min(1, zone.timer / phase.shrinkTime);
    zone.blue.x = lerp(zone.startBlue.x, zone.white.x, t);
    zone.blue.y = lerp(zone.startBlue.y, zone.white.y, t);
    zone.blue.r = lerp(zone.startBlue.r, zone.white.r, t);

    if (t >= 1) {
      zone.blue = { ...zone.white };
      zone.phaseIndex += 1;
      zone.timer = 0;
      zone.shrinking = false;
      const next = ZONE_PHASES[zone.phaseIndex];
      if (next) {
        const maxOffset = Math.max(20, zone.blue.r - next.radius);
        zone.white = randomCircle(rng, next.radius, zone.blue, maxOffset * 0.7);
        // keep white inside blue
        const dx = zone.white.x - zone.blue.x;
        const dy = zone.white.y - zone.blue.y;
        const maxD = Math.max(0, zone.blue.r - next.radius - 4);
        const d = Math.hypot(dx, dy);
        if (d > maxD && d > 0) {
          zone.white.x = zone.blue.x + (dx / d) * maxD;
          zone.white.y = zone.blue.y + (dy / d) * maxD;
        }
      } else {
        zone.done = true;
      }
    }
  }
}

export function outsideBlue(zone: ZoneState, x: number, y: number): boolean {
  return !pointInCircle(x, y, zone.blue.x, zone.blue.y, zone.blue.r);
}

export function zonePhaseLabel(zone: ZoneState): string {
  const phase = ZONE_PHASES[zone.phaseIndex];
  if (!phase) return "FINAL";
  const remain = zone.shrinking
    ? Math.max(0, phase.shrinkTime - zone.timer)
    : Math.max(0, phase.waitTime - zone.timer);
  const mode = zone.shrinking ? "SHRINK" : "WAIT";
  return `P${phase.phase} ${mode} ${Math.ceil(remain)}s`;
}
