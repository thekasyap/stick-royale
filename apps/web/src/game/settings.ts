/** Persistent player preferences (localStorage) */

export type Settings = {
  audio: boolean;
  haptics: boolean;
  autoLoot: boolean;
  /** 0.5 – 2.0 stick / mouse aim scale */
  sensitivity: number;
  /** Prefer main-thread sim (more stable on phones) */
  lowPower: boolean;
};

const KEY = "stick_royale_settings";

const DEFAULTS: Settings = {
  audio: true,
  haptics: true,
  autoLoot: true,
  sensitivity: 1,
  lowPower: false,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      // migrate legacy audio key
      const legacy = localStorage.getItem("stick_royale_audio");
      return {
        ...DEFAULTS,
        audio: legacy !== "0",
        // Phones: default low-power (main-thread) for stability
        lowPower:
          typeof matchMedia === "function" &&
          (matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0),
      };
    }
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      audio: parsed.audio ?? DEFAULTS.audio,
      haptics: parsed.haptics ?? DEFAULTS.haptics,
      autoLoot: parsed.autoLoot ?? DEFAULTS.autoLoot,
      sensitivity: clampSens(parsed.sensitivity ?? DEFAULTS.sensitivity),
      lowPower: parsed.lowPower ?? DEFAULTS.lowPower,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
  localStorage.setItem("stick_royale_audio", s.audio ? "1" : "0");
}

function clampSens(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(0.5, Math.min(2, n));
}
