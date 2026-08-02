import {
  INITIAL_ZONE_RADIUS,
  MAP_CENTER,
  MAP_SIZE,
  PRACTICE_INITIAL_ZONE_RADIUS,
  PRACTICE_ZONE_PHASES,
  ZONE_PHASES,
  type Vec2,
  type ZonePhase,
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
  phases: ZonePhase[];
};

export type ZoneOptions = {
  phases?: ZonePhase[];
  center?: Vec2;
  initialR?: number;
};

export function createZone(rng: () => number, opts: ZoneOptions = {}): ZoneState {
  const phases = opts.phases ?? ZONE_PHASES;
  const first = phases[0]!;
  const center = opts.center ?? MAP_CENTER;
  const initialR = opts.initialR ?? INITIAL_ZONE_RADIUS;
  const white = randomCircle(rng, first.radius, center, Math.min(initialR * 0.35, 180));
  return {
    phaseIndex: 0,
    timer: 0,
    shrinking: false,
    blue: { x: center.x, y: center.y, r: initialR },
    white,
    startBlue: { x: center.x, y: center.y, r: initialR },
    damage: first.damagePerSecond,
    done: false,
    phases,
  };
}

/** Practice arena zone centered on a fight POI */
export function createPracticeZone(rng: () => number, center: Vec2): ZoneState {
  return createZone(rng, {
    phases: PRACTICE_ZONE_PHASES,
    center,
    initialR: PRACTICE_INITIAL_ZONE_RADIUS,
  });
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
  const phase = zone.phases[zone.phaseIndex];
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
      const next = zone.phases[zone.phaseIndex];
      if (next) {
        const maxOffset = Math.max(20, zone.blue.r - next.radius);
        zone.white = randomCircle(rng, next.radius, zone.blue, maxOffset * 0.7);
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
  const phase = zone.phases[zone.phaseIndex];
  if (!phase) return "FINAL";
  const remain = zone.shrinking
    ? Math.max(0, phase.shrinkTime - zone.timer)
    : Math.max(0, phase.waitTime - zone.timer);
  const mode = zone.shrinking ? "SHRINK" : "WAIT";
  return `P${phase.phase} ${mode} ${Math.ceil(remain)}s`;
}
