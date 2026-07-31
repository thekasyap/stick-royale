import type { BotDifficulty, GameMode, PartySize } from "@stick-royale/shared";
import type { MatchConfig, RenderBundle } from "@stick-royale/sim";
import { WEAPONS } from "@stick-royale/shared";
import { GameAudio } from "./game/audio";
import { Input } from "./game/input";
import { MatchHost } from "./game/match-host";
import { Renderer } from "./game/renderer";
import { createParty, partyHostAvailable } from "./net/lobbyClient";

const GUEST_KEY = "stick_royale_guest";
const NICK_KEY = "stick_royale_nick";
const AUDIO_KEY = "stick_royale_audio";

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

class GameApp {
  private canvas = $("game") as HTMLCanvasElement;
  private minimapCanvas = $("minimap") as HTMLCanvasElement;
  private ctx = this.canvas.getContext("2d")!;
  private miniCtx = this.minimapCanvas.getContext("2d")!;
  private input = new Input(this.canvas);
  private renderer = new Renderer(this.ctx, this.miniCtx);
  private audio = new GameAudio();
  private host: MatchHost | null = null;
  private bundle: RenderBundle | null = null;
  private raf = 0;
  private last = 0;
  private running = false;
  private lastSfx = {
    shots: 0, hits: 0, crits: 0, loots: 0, jumps: 0,
    zoneWarns: 0, redZones: 0, dryFires: 0, reloads: 0, damaged: 0,
  };
  private damageFlash = 0;

  constructor() {
    ensureGuestId();
    this.bindLobby();
    this.bindMobileControls();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    $("play-again").addEventListener("click", () => this.backToLobby());
    this.audio.setEnabled(localStorage.getItem(AUDIO_KEY) !== "0");
  }

  private bindMobileControls(): void {
    const root = $("mobile-controls");
    root.querySelectorAll("[data-key]").forEach((btn) => {
      const key = (btn as HTMLElement).dataset.key!;
      const press = (e: Event) => {
        e.preventDefault();
        this.input.injectPress(key);
      };
      const release = () => this.input.injectRelease(key);
      btn.addEventListener("touchstart", press, { passive: false });
      btn.addEventListener("touchend", release);
      btn.addEventListener("mousedown", press);
      btn.addEventListener("mouseup", release);
    });
    const ads = root.querySelector("[data-ads]");
    if (ads) {
      const down = (e: Event) => {
        e.preventDefault();
        this.input.mouseRight = true;
        ads.classList.add("active");
      };
      const up = () => {
        this.input.mouseRight = false;
        ads.classList.remove("active");
      };
      ads.addEventListener("touchstart", down, { passive: false });
      ads.addEventListener("touchend", up);
      ads.addEventListener("mousedown", down);
      ads.addEventListener("mouseup", up);
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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private startMatch(config: MatchConfig): void {
    $("lobby").classList.add("hidden");
    $("results").classList.add("hidden");
    $("hud").classList.remove("hidden");
    this.lastSfx = {
      shots: 0, hits: 0, crits: 0, loots: 0, jumps: 0,
      zoneWarns: 0, redZones: 0, dryFires: 0, reloads: 0, damaged: 0,
    };
    this.damageFlash = 0;
    this.host = new MatchHost((bundle) => {
      this.playSfxDiff(bundle);
      this.bundle = bundle;
    });
    this.host.start(config);
    this.running = true;
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.loop(this.last);
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
    if (s.damaged > this.lastSfx.damaged) {
      this.audio.damaged();
      this.damageFlash = 0.35;
    }
    this.lastSfx = { ...s };
  }

  private backToLobby(): void {
    this.running = false;
    this.host?.destroy();
    this.host = null;
    this.bundle = null;
    cancelAnimationFrame(this.raf);
    $("results").classList.add("hidden");
    $("hud").classList.add("hidden");
    $("lobby").classList.remove("hidden");
  }

  private loop = (now: number): void => {
    if (!this.running || !this.host) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    this.host.tick(dt, this.input, viewW, viewH);
    if (this.bundle) {
      this.renderer.draw(this.bundle, viewW, viewH, this.input.mouseX, this.input.mouseY);
      this.syncHud(this.bundle);
      this.drawDamageVignette(viewW, viewH, dt);
    }
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

  private syncHud(bundle: RenderBundle): void {
    $("alive-count").textContent = String(
      bundle.fighters.filter((f) => f.state !== "dead").length,
    );
    $("phase-info").textContent = bundle.phaseLabel ?? `PHASE ${bundle.zone.phaseIndex + 1}`;
    const p = bundle.player;
    ($("hp-fill") as HTMLDivElement).style.width = `${Math.max(0, p.hp)}%`;
    ($("boost-fill") as HTMLDivElement).style.width = `${Math.max(0, p.boost)}%`;
    $("hp-text").textContent = String(Math.ceil(Math.max(0, p.hp)));
    $("helmet-lvl").textContent = `H${p.helmet}`;
    $("vest-lvl").textContent = `V${p.vest}`;
    $("bag-lvl").textContent = `B${p.backpack}`;

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
    $("prompt").textContent = bundle.prompt;

    const drop = $("drop-banner");
    if (p.state === "plane") {
      drop.classList.remove("hidden");
      drop.textContent = "JUMP · SPACE / F";
    } else if (p.state === "parachute") {
      drop.classList.remove("hidden");
      const alt = Math.ceil((p.chuteAlt ?? 0) * 100);
      drop.textContent = `CUT CHUTE · SPACE  ·  ALT ${alt}%`;
    } else {
      drop.classList.add("hidden");
    }

    $("kill-feed").innerHTML = bundle.killFeed
      .slice(0, 5)
      .map((k) => {
        const tag = k.knocked ? " knocked " : " ";
        const you = k.killer === p.name || k.victim === p.name ? " you" : "";
        return `<div class="entry${you}">${escapeHtml(k.killer)} [${escapeHtml(k.weapon)}]${tag}${escapeHtml(k.victim)}</div>`;
      })
      .join("");
  }

  private showResults(r: NonNullable<RenderBundle["result"]>): void {
    $("hud").classList.add("hidden");
    $("results").classList.remove("hidden");
    const title = $("results-title");
    title.textContent = r.winner ? "CHICKEN DINNER" : "ELIMINATED";
    title.classList.toggle("winner", r.winner);
    $("results-place").textContent = `#${r.placement} / 48`;
    $("stat-kills").textContent = String(r.kills);
    $("stat-damage").textContent = String(Math.round(r.damage));
    $("stat-alive").textContent = `${Math.floor(r.aliveTime)}s`;
    if (r.winner) this.audio.chickenDinner();
    else this.audio.eliminated();
    this.running = false;
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
