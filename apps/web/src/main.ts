import type { BotDifficulty, GameMode, PartySize } from "@stick-royale/shared";
import { LOBBY_SIZE, PRACTICE_LOBBY_SIZE } from "@stick-royale/shared";
import type { MatchConfig, RenderBundle } from "@stick-royale/sim";
import { WEAPONS } from "@stick-royale/shared";
import { GameAudio } from "./game/audio";
import { Input } from "./game/input";
import { MatchHost } from "./game/match-host";
import { Renderer } from "./game/renderer";
import { loadSettings, saveSettings, type Settings } from "./game/settings";
import { createParty, partyHostAvailable } from "./net/lobbyClient";

const GUEST_KEY = "stick_royale_guest";
const NICK_KEY = "stick_royale_nick";
const MOBILE_TIP_KEY = "stick_royale_mobile_tip_v6";

function ensureGuestId(): string {
  let id = localStorage.getItem(GUEST_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(GUEST_KEY, id);
  }
  return id;
}

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

/** True phones/tablets — NOT laptops with a touchscreen (those keep mouse). */
function prefersTouchControls(): boolean {
  return matchMedia("(hover: none) and (pointer: coarse)").matches;
}

class GameApp {
  private canvas = $("game") as HTMLCanvasElement;
  private minimapCanvas = $("minimap") as HTMLCanvasElement;
  private ctx = this.canvas.getContext("2d")!;
  private miniCtx = this.minimapCanvas.getContext("2d")!;
  private input = new Input(this.canvas);
  private renderer = new Renderer(this.ctx, this.miniCtx);
  private audio = new GameAudio();
  private settings: Settings = loadSettings();
  private host: MatchHost | null = null;
  private bundle: RenderBundle | null = null;
  private raf = 0;
  private last = 0;
  private running = false;
  private paused = false;
  private touchMode = false;
  private matchSize = LOBBY_SIZE;
  private mobileTipShown = false;
  private lastKillFeed = "";
  private lastPrompt = "";
  private lastSfx = {
    shots: 0, hits: 0, crits: 0, loots: 0, jumps: 0,
    zoneWarns: 0, redZones: 0, dryFires: 0, reloads: 0, damaged: 0,
    kills: 0, nearbyShots: 0,
  };
  private damageFlash = 0;
  private aimStickEl = $("aim-stick");
  private moveStickEl = $("move-stick");

  constructor() {
    ensureGuestId();
    document.body.classList.add("lobby-open");
    this.applySettings();
    this.detectTouch();
    this.bindLobby();
    this.bindSettingsUi();
    this.bindTouchControls();
    this.bindVisibility();
    this.bindViewportLock();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    window.visualViewport?.addEventListener("resize", () => this.resize());
    window.visualViewport?.addEventListener("scroll", () => this.fixViewportScroll());
    $("play-again").addEventListener("click", () => this.backToLobby());
    $("pause-btn").addEventListener("click", () => this.openSettings(true));
  }

  /**
   * Hard-block browser zoom. Never CSS-transform #app — that desyncs touch
   * coords from the canvas and made zoom "recovery" worse than the zoom itself.
   */
  private bindViewportLock(): void {
    const blockGestures = (e: Event) => {
      if (!this.running) return;
      e.preventDefault();
    };
    for (const ev of ["gesturestart", "gesturechange", "gestureend"] as const) {
      document.addEventListener(ev, blockGestures as EventListener, { passive: false });
    }

    document.addEventListener(
      "touchstart",
      (e) => {
        if (!this.running) return;
        if (e.touches.length > 1) e.preventDefault();
      },
      { passive: false },
    );
    document.addEventListener(
      "touchmove",
      (e) => {
        if (!this.running) return;
        // Pinch / multi-touch zoom
        if (e.touches.length > 1) e.preventDefault();
        // iOS Safari exposes scale on some TouchEvents
        const te = e as TouchEvent & { scale?: number };
        if (typeof te.scale === "number" && te.scale !== 1) e.preventDefault();
      },
      { passive: false },
    );
    document.addEventListener(
      "wheel",
      (e) => {
        if (this.running && (e.ctrlKey || e.metaKey)) e.preventDefault();
      },
      { passive: false },
    );

    // Double-tap zoom — only block on game surface, never on buttons/inputs
    let lastTap = 0;
    document.addEventListener(
      "touchend",
      (e) => {
        if (!this.running) return;
        const t = e.target as HTMLElement | null;
        if (t?.closest?.("button, a, input, select, label, .mbtn, .heal-pill")) return;
        const now = performance.now();
        if (now - lastTap < 320) e.preventDefault();
        lastTap = now;
      },
      { passive: false },
    );

    window.visualViewport?.addEventListener("resize", () => {
      if (this.running) {
        this.clearAppZoomHacks();
        this.fixViewportScroll();
        this.resize();
      }
    });
  }

  /** Strip any leftover transform hacks from older builds */
  private clearAppZoomHacks(): void {
    const app = $("app");
    app.style.transform = "";
    app.style.transformOrigin = "";
    app.style.width = "";
    app.style.height = "";
    // Re-assert non-scalable viewport without fighting layout
    const meta = document.querySelector('meta[name="viewport"]');
    meta?.setAttribute(
      "content",
      "width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover, shrink-to-fit=no",
    );
  }

  private fixViewportScroll(): void {
    if (!this.running) return;
    window.scrollTo(0, 0);
    if (window.visualViewport && Math.abs(window.visualViewport.offsetTop) > 0.5) {
      window.scrollTo(0, 0);
    }
  }

  private async enterImmersive(): Promise<void> {
    try {
      const root = document.documentElement;
      if (!document.fullscreenElement && root.requestFullscreen) {
        await root.requestFullscreen();
      }
    } catch {
      /* browsers may deny — ignore */
    }
    try {
      const orient = screen.orientation as ScreenOrientation & { lock?: (t: string) => Promise<void> };
      await orient.lock?.("landscape");
    } catch {
      /* optional */
    }
  }

  private async exitImmersive(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      /* */
    }
    try {
      const orient = screen.orientation as ScreenOrientation & { unlock?: () => void };
      orient.unlock?.();
    } catch {
      /* */
    }
  }

  private applySettings(): void {
    this.audio.setEnabled(this.settings.audio);
    this.input.setSensitivity(this.settings.sensitivity);
    // Mobile always auto-loots essentials (PUBG); desktop respects setting
    this.input.autoLoot = this.touchMode ? true : this.settings.autoLoot;
  }

  private vibrate(ms: number): void {
    if (!this.settings.haptics) return;
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* ignore */
    }
  }

  private detectTouch(): void {
    if (prefersTouchControls()) {
      document.body.classList.add("touch-capable");
      this.touchMode = true;
      this.input.enableTouchMode(true, true);
      const hint = $("controls-hint");
      hint.textContent =
        "Touch: left MOVE · right AIM+SHOOT · essentials auto-loot · DROP/CUT when airborne";
    }
  }

  private bindSettingsUi(): void {
    const modal = $("settings-modal");
    const syncForm = () => {
      ($("set-audio") as HTMLInputElement).checked = this.settings.audio;
      ($("set-haptics") as HTMLInputElement).checked = this.settings.haptics;
      ($("set-autoloot") as HTMLInputElement).checked = this.settings.autoLoot;
      ($("set-lowpower") as HTMLInputElement).checked = this.settings.lowPower;
      const sens = $("set-sensitivity") as HTMLInputElement;
      sens.value = String(Math.round(this.settings.sensitivity * 100));
      $("sens-val").textContent = this.settings.sensitivity.toFixed(2);
    };
    $("open-settings").addEventListener("click", () => this.openSettings(false));
    $("close-settings").addEventListener("click", () => {
      this.settings = {
        audio: ($("set-audio") as HTMLInputElement).checked,
        haptics: ($("set-haptics") as HTMLInputElement).checked,
        autoLoot: ($("set-autoloot") as HTMLInputElement).checked,
        fireOnAim: true,
        lowPower: ($("set-lowpower") as HTMLInputElement).checked,
        sensitivity: Number(($("set-sensitivity") as HTMLInputElement).value) / 100,
      };
      saveSettings(this.settings);
      this.applySettings();
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
      if (this.running) {
        this.paused = false;
        this.last = performance.now();
        this.input.resetPointers();
      }
    });
    ($("set-sensitivity") as HTMLInputElement).addEventListener("input", () => {
      const v = Number(($("set-sensitivity") as HTMLInputElement).value) / 100;
      $("sens-val").textContent = v.toFixed(2);
    });
    // expose sync for open
    this.syncSettingsForm = syncForm;
  }

  private syncSettingsForm: () => void = () => undefined;

  private openSettings(fromMatch: boolean): void {
    this.syncSettingsForm();
    if (fromMatch && this.running) {
      this.paused = true;
      this.input.resetPointers();
    }
    const modal = $("settings-modal");
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  private bindVisibility(): void {
    document.addEventListener("visibilitychange", () => {
      if (!this.running) return;
      if (document.hidden) {
        this.paused = true;
        this.input.resetPointers();
      } else {
        this.paused = false;
        this.last = performance.now();
        this.input.resetPointers();
      }
    });
  }

  private bindBtn(el: Element, down: (e: PointerEvent) => void, up: () => void): void {
    const onDown = (e: Event) => {
      const pe = e as PointerEvent;
      e.preventDefault();
      e.stopPropagation();
      try { (el as HTMLElement).setPointerCapture(pe.pointerId); } catch { /* */ }
      down(pe);
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", up);
  }

  private bindTouchControls(): void {
    this.input.bindFloatingStick($("move-zone"), this.moveStickEl, "move");
    this.input.bindFloatingStick($("aim-zone"), this.aimStickEl, "aim");

    const root = $("touch-ui");
    root.querySelectorAll("[data-key]").forEach((btn) => {
      const key = (btn as HTMLElement).dataset.key!;
      this.bindBtn(btn, () => {
        this.audio.unlock();
        this.input.injectPress(key);
        (btn as HTMLElement).classList.add("active");
        if (key === " ") this.vibrate(12);
      }, () => {
        this.input.injectRelease(key);
        (btn as HTMLElement).classList.remove("active");
      });
    });

    const wpn = root.querySelector("[data-action=\"weapon\"]");
    if (wpn) {
      this.bindBtn(wpn, () => {
        this.audio.unlock();
        this.input.cycleWeapon();
        wpn.classList.add("active");
        this.vibrate(10);
      }, () => {
        wpn.classList.remove("active");
      });
    }

    const bomb = root.querySelector("[data-action=\"grenade\"]");
    if (bomb) {
      this.bindBtn(bomb, () => {
        this.audio.unlock();
        this.input.startGrenade();
        bomb.classList.add("active");
        this.vibrate(14);
      }, () => {
        this.input.endGrenade();
        bomb.classList.remove("active");
      });
    }

    const ads = root.querySelector("[data-ads]");
    if (ads) {
      this.bindBtn(ads, () => {
        this.audio.unlock();
        this.input.mouseRight = true;
        ads.classList.add("active");
      }, () => {
        this.input.mouseRight = false;
        ads.classList.remove("active");
      });
    }
  }

  private bindLobby(): void {
    const nick = $("nickname") as HTMLInputElement;
    nick.value = localStorage.getItem(NICK_KEY) || randomNick();
    const hint = $("party-hint");
    hint.textContent = partyHostAvailable()
      ? "Online party codes available — sim runs in Web Worker when supported."
      : "Offline 48-player bot-fill. Deploy Cloudflare Worker for online parties.";

    $("lobby-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      this.audio.unlock();
      const nickname = nick.value.trim().slice(0, 16) || "StickHero";
      localStorage.setItem(NICK_KEY, nickname);
      const mode = ($("mode") as HTMLSelectElement).value as GameMode;
      const partySize = ($("party-size") as HTMLSelectElement).value as PartySize;
      const difficulty = ($("difficulty") as HTMLSelectElement).value as BotDifficulty;
      const partyCode = ($("party-code") as HTMLInputElement).value.trim().toUpperCase();

      if (!partyCode && partyHostAvailable()) {
        const created = await createParty(nickname);
        if (created) {
          ($("party-code") as HTMLInputElement).value = created.code;
        }
      }

      this.startMatch({ nickname, mode, partySize, difficulty });
    });
  }

  private resize(): void {
    const maxDpr = this.settings.lowPower ? 1.25 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    // Layout viewport — NOT visualViewport (pinch zoom shrinks VV and desyncs the game)
    const w = Math.max(1, Math.floor(window.innerWidth));
    const h = Math.max(1, Math.floor(window.innerHeight));
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.input.setViewSize(w, h);
    this.fixViewportScroll();
  }

  private startMatch(config: MatchConfig): void {
    $("lobby").classList.add("hidden");
    $("results").classList.add("hidden");
    $("hud").classList.remove("hidden");
    document.documentElement.classList.add("playing");
    document.body.classList.add("playing");
    document.body.classList.remove("lobby-open");
    this.clearAppZoomHacks();
    this.matchSize = config.mode === "vs_ai" ? PRACTICE_LOBBY_SIZE : LOBBY_SIZE;
    if (this.touchMode) {
      document.body.classList.add("touch-mode");
      this.input.enableTouchMode(true, true);
      this.maybeShowMobileTip();
    }
    void this.enterImmersive();
    this.applySettings();
    this.lastSfx = {
      shots: 0, hits: 0, crits: 0, loots: 0, jumps: 0,
      zoneWarns: 0, redZones: 0, dryFires: 0, reloads: 0, damaged: 0,
      kills: 0, nearbyShots: 0,
    };
    this.damageFlash = 0;
    this.lastKillFeed = "";
    this.lastPrompt = "";
    this.host?.destroy();
    const preferMain = this.settings.lowPower || this.touchMode;
    this.host = new MatchHost((bundle) => {
      this.playSfxDiff(bundle);
      this.bundle = bundle;
    }, { preferMainThread: preferMain });
    this.host.start(config);
    this.running = true;
    this.paused = false;
    this.last = performance.now();
    this.resize();
    cancelAnimationFrame(this.raf);
    this.loop(this.last);
  }

  private maybeShowMobileTip(): void {
    const tip = $("mobile-tip");
    if (localStorage.getItem(MOBILE_TIP_KEY) === "1") {
      tip.classList.add("hidden");
      return;
    }
    tip.classList.remove("hidden");
    this.mobileTipShown = true;
  }

  private dismissMobileTip(): void {
    if (!this.mobileTipShown) return;
    this.mobileTipShown = false;
    $("mobile-tip").classList.add("hidden");
    localStorage.setItem(MOBILE_TIP_KEY, "1");
  }

  private playSfxDiff(bundle: RenderBundle): void {
    const s = bundle.sfx;
    if (!s) return;
    const gun = bundle.player.activeSlot === 0 ? bundle.player.primary
      : bundle.player.activeSlot === 1 ? bundle.player.secondary
      : bundle.player.melee;
    const cat = gun ? WEAPONS[gun.weaponId]?.category ?? "ar" : "ar";
    for (let i = this.lastSfx.shots; i < s.shots; i++) this.audio.shoot(cat);
    for (let i = this.lastSfx.hits; i < s.hits; i++) this.audio.hit(false);
    for (let i = this.lastSfx.crits; i < s.crits; i++) this.audio.hit(true);
    for (let i = this.lastSfx.loots; i < s.loots; i++) this.audio.loot();
    for (let i = this.lastSfx.jumps; i < s.jumps; i++) this.audio.jump();
    for (let i = this.lastSfx.zoneWarns; i < s.zoneWarns; i++) this.audio.zoneWarning();
    for (let i = this.lastSfx.redZones; i < s.redZones; i++) this.audio.redZone();
    for (let i = this.lastSfx.dryFires; i < s.dryFires; i++) this.audio.dryFire();
    for (let i = this.lastSfx.reloads; i < s.reloads; i++) this.audio.reload();
    for (let i = this.lastSfx.nearbyShots; i < (s.nearbyShots ?? 0); i++) this.audio.shoot("ar");
    for (let i = this.lastSfx.kills; i < (s.kills ?? 0); i++) {
      this.audio.hit(true);
      this.vibrate(40);
    }
    if (s.damaged > this.lastSfx.damaged) {
      this.audio.damaged();
      this.damageFlash = 0.35;
      this.vibrate(25);
    }
    this.lastSfx = {
      shots: s.shots, hits: s.hits, crits: s.crits, loots: s.loots, jumps: s.jumps,
      zoneWarns: s.zoneWarns, redZones: s.redZones, dryFires: s.dryFires, reloads: s.reloads,
      damaged: s.damaged, kills: s.kills ?? 0, nearbyShots: s.nearbyShots ?? 0,
    };
  }

  private syncTouchOverlay(): void {
    if (!this.touchMode) return;
    this.aimStickEl.classList.toggle("firing", this.input.aimFiring);

    const jump = $("jump-btn");
    const loot = $("loot-btn");
    const ride = $("ride-btn");
    const interact = this.bundle?.interact ?? null;
    const state = this.bundle?.player.state;

    // DROP / CUT only while airborne (PUBG) — hidden on ground
    const air = state === "plane" || state === "parachute";
    const grounded = state === "alive";
    jump.classList.toggle("hidden", !air);
    if (air) {
      jump.textContent = state === "plane" ? "DROP" : "CUT";
    }

    // Combat cluster only on foot
    const combat = document.querySelector(".combat-row") as HTMLElement | null;
    combat?.classList.toggle("hidden", !grounded);
    $("heal-rail").classList.toggle("hidden", !grounded);

    // LOOT only when something needs a tap (weapon swap) — essentials auto-grab
    const showLoot =
      grounded &&
      (interact?.kind === "loot" || interact?.kind === "care") &&
      !!interact.manual;
    loot.classList.toggle("hidden", !showLoot);
    loot.classList.toggle("pulse", showLoot);
    if (showLoot) loot.textContent = interact?.label ?? "LOOT";

    // Vehicle enter
    const showRide = grounded && interact?.kind === "vehicle";
    ride.classList.toggle("hidden", !showRide);
  }

  private backToLobby(): void {
    this.running = false;
    this.paused = false;
    this.host?.destroy();
    this.host = null;
    this.bundle = null;
    cancelAnimationFrame(this.raf);
    this.input.resetPointers();
    if (!this.touchMode) this.input.disableTouchMode();
    void this.exitImmersive();
    document.documentElement.classList.remove("playing");
    document.body.classList.remove("playing", "touch-mode");
    document.body.classList.add("lobby-open");
    this.clearAppZoomHacks();
    $("mobile-tip").classList.add("hidden");
    $("results").classList.add("hidden");
    $("hud").classList.add("hidden");
    $("settings-modal").classList.add("hidden");
    $("lobby").classList.remove("hidden");
  }

  private loop = (now: number): void => {
    if (!this.running || !this.host) return;

    if (this.paused || document.hidden) {
      this.audio.setMoving(false);
      this.last = now;
      this.raf = requestAnimationFrame(this.loop);
      return;
    }

    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const viewW = Math.max(1, Math.floor(window.innerWidth));
    const viewH = Math.max(1, Math.floor(window.innerHeight));
    this.host.tick(dt, this.input, viewW, viewH);
    if (this.bundle) {
      this.renderer.draw(this.bundle, viewW, viewH, this.input.mouseX, this.input.mouseY, {
        compactHud: this.touchMode,
      });
      this.syncHud(this.bundle);
      this.tickFootsteps(dt);
      this.drawDamageVignette(viewW, viewH, dt);
      if (
        this.mobileTipShown &&
        (this.bundle.player.state === "parachute" || this.bundle.player.state === "alive")
      ) {
        this.dismissMobileTip();
      }
    }
    this.syncTouchOverlay();
    // Sync WPN cycle to real sim slot
    if (this.bundle) this.input.syncWeaponSlot(this.bundle.player.activeSlot);
    this.input.endFrame();

    if (this.host.matchOver && this.host.result) {
      this.showResults(this.host.result);
      return;
    }

    this.raf = requestAnimationFrame(this.loop);
  };

  private drawDamageVignette(viewW: number, viewH: number, dt: number): void {
    if (this.damageFlash <= 0) return;
    this.damageFlash = Math.max(0, this.damageFlash - dt);
    const a = Math.min(0.45, this.damageFlash * 1.2);
    const ctx = this.ctx;
    ctx.save();
    const g = ctx.createRadialGradient(viewW / 2, viewH / 2, viewH * 0.25, viewW / 2, viewH / 2, viewH * 0.75);
    g.addColorStop(0, "transparent");
    g.addColorStop(1, `rgba(140, 30, 20, ${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.restore();
  }

  private tickFootsteps(dt: number): void {
    const p = this.bundle?.player;
    if (!p || p.state !== "alive" || p.healTimer > 0) {
      this.audio.setMoving(false);
      return;
    }
    const m = this.input.moveVector();
    const moving = Math.hypot(m.x, m.y) > 0.12;
    this.audio.setMoving(moving, this.input.mouseRight, dt);
  }

  private syncHud(bundle: RenderBundle): void {
    $("alive-count").textContent = String(
      bundle.fighters.filter((f) => f.state !== "dead").length,
    );
    const kc = $("kill-count");
    if (kc) kc.textContent = String(bundle.player.kills);
    $("phase-info").textContent = bundle.phaseLabel ?? `PHASE ${bundle.zone.phaseIndex + 1}`;
    const p = bundle.player;
    ($("hp-fill") as HTMLDivElement).style.width = `${Math.max(0, p.hp)}%`;
    ($("boost-fill") as HTMLDivElement).style.width = `${Math.max(0, p.boost)}%`;
    $("hp-text").textContent = String(Math.ceil(Math.max(0, p.hp)));
    $("helmet-lvl").textContent = `H${p.helmet}`;
    $("vest-lvl").textContent = `V${p.vest}`;
    $("bag-lvl").textContent = `B${p.backpack}`;

    const setHeal = (id: string, key: string, label: string) => {
      const el = $(id);
      const n = (p.heals as Record<string, number | undefined>)[key] ?? 0;
      el.textContent = `${label} ${n}`;
      el.classList.toggle("has", n > 0);
      el.classList.toggle("empty", n <= 0);
    };
    setHeal("heal-band", "bandage", "Q Band");
    setHeal("heal-med", "medkit", "C Med");
    setHeal("heal-drink", "energy_drink", "Z Drink");
    setHeal("heal-pain", "painkiller", "X Pain");

    const setOrb = (btnId: string, nId: string, key: string) => {
      const n = (p.heals as Record<string, number | undefined>)[key] ?? 0;
      const btn = document.getElementById(btnId);
      const num = document.getElementById(nId);
      if (btn) btn.classList.toggle("hidden", n <= 0 || !this.touchMode || p.state !== "alive");
      if (num) num.textContent = String(n);
    };
    setOrb("orb-band", "orb-band-n", "bandage");
    setOrb("orb-med", "orb-med-n", "medkit");
    setOrb("orb-drink", "orb-drink-n", "energy_drink");
    setOrb("orb-pain", "orb-pain-n", "painkiller");

    let wName = "—";
    let ammo = "";
    if (p.activeSlot === 3) {
      wName = "Throwables";
      ammo = `Frag ${p.frags} · Smoke ${p.smokes}`;
    } else {
      const gun =
        p.activeSlot === 0 ? p.primary : p.activeSlot === 1 ? p.secondary : p.melee;
      if (gun) {
        const def = WEAPONS[gun.weaponId];
        wName = def?.name ?? gun.weaponId;
        if (def?.ammo) {
          ammo = `${gun.ammoInMag} / ${p.ammo[def.ammo] ?? 0}`;
          if (p.reloadTimer > 0) ammo = `RELOADING…`;
        } else ammo = "∞";
      }
    }
    $("weapon-name").textContent = wName;
    $("ammo-text").textContent = ammo;
    if (bundle.prompt !== this.lastPrompt) {
      this.lastPrompt = bundle.prompt;
      $("prompt").textContent = bundle.prompt;
    }

    const drop = $("drop-banner");
    if (p.state === "plane") {
      drop.classList.remove("hidden");
      drop.textContent = this.touchMode ? "TAP DROP" : "JUMP · SPACE / F";
    } else if (p.state === "parachute") {
      drop.classList.remove("hidden");
      const alt = Math.ceil((p.chuteAlt ?? 0) * 100);
      drop.textContent = this.touchMode
        ? `TAP CUT  ·  ALT ${alt}%`
        : `CUT CHUTE · SPACE  ·  ALT ${alt}%`;
    } else {
      drop.classList.add("hidden");
    }

    const feedHtml = bundle.killFeed
      .slice(0, 5)
      .map((k) => {
        const tag = k.knocked ? " knocked " : " ";
        const you = k.killer === p.name || k.victim === p.name ? " you" : "";
        return `<div class="entry${you}">${escapeHtml(k.killer)} [${escapeHtml(k.weapon)}]${tag}${escapeHtml(k.victim)}</div>`;
      })
      .join("");
    if (feedHtml !== this.lastKillFeed) {
      this.lastKillFeed = feedHtml;
      $("kill-feed").innerHTML = feedHtml;
    }
  }

  private showResults(r: NonNullable<RenderBundle["result"]>): void {
    $("hud").classList.add("hidden");
    $("results").classList.remove("hidden");
    const title = $("results-title");
    title.textContent = r.winner ? "CHICKEN DINNER" : "ELIMINATED";
    title.classList.toggle("winner", r.winner);
    $("results-place").textContent = `#${r.placement} / ${this.matchSize}`;
    $("stat-kills").textContent = String(r.kills);
    $("stat-damage").textContent = String(Math.round(r.damage));
    $("stat-alive").textContent = `${Math.floor(r.aliveTime)}s`;
    if (r.winner) this.audio.chickenDinner();
    else this.audio.eliminated();
    this.running = false;
    this.paused = false;
    // Stop worker so results screen doesn't keep simulating
    this.host?.destroy();
    this.host = null;
    cancelAnimationFrame(this.raf);
    document.documentElement.classList.remove("playing");
    document.body.classList.remove("playing");
    this.clearAppZoomHacks();
  }
}

function randomNick(): string {
  const a = ["Stick", "Pine", "Tan", "Ash", "Dust", "Quiet", "Pan"];
  const b = ["Fox", "Scout", "Runner", "Ghost", "Ace", "Drop", "Wave"];
  return a[Math.floor(Math.random() * a.length)]! + b[Math.floor(Math.random() * b.length)]!;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

new GameApp();
