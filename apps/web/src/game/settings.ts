export type Settings = {
  audio: boolean;
  haptics: boolean;
  autoLoot: boolean;
  /** Mini Militia Fire+: shooting while holding aim stick (off = aim only) */
  fireOnAim: boolean;
  sensitivity: number;
  lowPower: boolean;
};

const KEY = "stick-royale-settings-v3";
const LEGACY_KEYS = ["stick-royale-settings-v2", "stick-royale-settings-v1"];

const DEFAULTS: Settings = {
  audio: true,
  haptics: true,
  autoLoot: true,
  fireOnAim: false,
  sensitivity: 1,
  lowPower: false,
};

export function loadSettings(): Settings {
  try {
    let raw = localStorage.getItem(KEY);
    if (!raw) {
      for (const k of LEGACY_KEYS) {
        raw = localStorage.getItem(k);
        if (raw) break;
      }
    }
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    // v3 defaults Fire+ off even if an older save had it on accidentally
    const fromV3 = !!localStorage.getItem(KEY);
    return {
      audio: parsed.audio ?? DEFAULTS.audio,
      haptics: parsed.haptics ?? DEFAULTS.haptics,
      autoLoot: parsed.autoLoot ?? DEFAULTS.autoLoot,
      fireOnAim: fromV3 ? (parsed.fireOnAim ?? DEFAULTS.fireOnAim) : DEFAULTS.fireOnAim,
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
