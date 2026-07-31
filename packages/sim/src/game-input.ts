/** Minimal input surface — implemented by DOM Input or worker-serialized state */

export interface GameInput {
  mouseX: number;
  mouseY: number;
  mouseDown: boolean;
  mouseRight: boolean;
  wheelDelta?: number;
  /** PUBG-style auto pickup when near loot (mobile on by default) */
  autoLoot?: boolean;
  pressed(key: string): boolean;
  down(key: string): boolean;
  moveVector(): { x: number; y: number };
}

export type InputSnapshot = {
  keys: string[];
  justPressed: string[];
  mouseX: number;
  mouseY: number;
  mouseDown: boolean;
  mouseRight: boolean;
  touchMoveX: number;
  touchMoveY: number;
  wheelDelta?: number;
  autoLoot?: boolean;
};

export function snapshotInput(input: GameInput): InputSnapshot {
  const keys: string[] = [];
  const justPressed: string[] = [];
  for (const k of [
    "w", "a", "s", "d", " ", "shift", "f", "e", "r", "g", "h", "v",
    "1", "2", "3", "4", "q", "c", "z", "x",
    "arrowup", "arrowdown", "arrowleft", "arrowright",
  ]) {
    if (input.down(k)) keys.push(k);
    if (input.pressed(k)) justPressed.push(k);
  }
  const mv = input.moveVector();
  return {
    keys,
    justPressed,
    mouseX: input.mouseX,
    mouseY: input.mouseY,
    mouseDown: input.mouseDown,
    mouseRight: input.mouseRight,
    touchMoveX: mv.x,
    touchMoveY: mv.y,
    wheelDelta: input.wheelDelta ?? 0,
    autoLoot: input.autoLoot ?? false,
  };
}

/** Merge edge presses so queued ticks never drop Jump / Loot / Reload taps */
export function mergeInputSnapshots(prev: InputSnapshot, next: InputSnapshot): InputSnapshot {
  const just = new Set([...prev.justPressed, ...next.justPressed]);
  return {
    ...next,
    justPressed: [...just],
    wheelDelta: (prev.wheelDelta ?? 0) + (next.wheelDelta ?? 0),
    autoLoot: next.autoLoot || prev.autoLoot,
  };
}

export function inputFromSnapshot(s: InputSnapshot): GameInput {
  const keys = new Set(s.keys);
  const just = new Set(s.justPressed);
  return {
    mouseX: s.mouseX,
    mouseY: s.mouseY,
    mouseDown: s.mouseDown,
    mouseRight: s.mouseRight,
    wheelDelta: s.wheelDelta ?? 0,
    autoLoot: s.autoLoot ?? false,
    pressed: (k) => just.has(k.toLowerCase()),
    down: (k) => keys.has(k.toLowerCase()),
    moveVector: () => {
      let x = 0;
      let y = 0;
      if (keys.has("w") || keys.has("arrowup")) y -= 1;
      if (keys.has("s") || keys.has("arrowdown")) y += 1;
      if (keys.has("a") || keys.has("arrowleft")) x -= 1;
      if (keys.has("d") || keys.has("arrowright")) x += 1;
      if (Math.abs(s.touchMoveX) > 0.05 || Math.abs(s.touchMoveY) > 0.05) {
        return { x: s.touchMoveX, y: s.touchMoveY };
      }
      const len = Math.hypot(x, y);
      return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
    },
  };
}
