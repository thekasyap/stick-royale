export type Settings = {
  audio: boolean;
  haptics: boolean;
  autoLoot: boolean;
  /** Mini Militia Fire+: shooting while holding aim stick */
  fireOnAim: boolean;
  sensitivity: number;
  lowPower: boolean;
};

const KEY = "stick-royale-settings-v2";

const DEFAULTS: Settings = {
  audio: true,
  haptics: true,
  autoLoot: true,
  fireOnAim: true,
  sensitivity: 1,
  lowPower: false,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      audio: parsed.audio ?? DEFAULTS.audio,
      haptics: parsed.haptics ?? DEFAULTS.haptics,
      autoLoot: parsed.autoLoot ?? DEFAULTS.autoLoot,
      fireOnAim: parsed.fireOnAim ?? DEFAULTS.fireOnAim,
      sensitivity: clampSens(parsed.sensitivity ?? DEFAULTS.sensitivity),
      lowPower: parsed.lowPower ?? DEFAULTS.lowPower,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode */
  }
}

function clampSens(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(1.6, Math.max(0.6, n));
}
