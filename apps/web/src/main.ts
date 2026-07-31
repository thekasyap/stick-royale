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

  constructor() {
    ensureGuestId();
    this.bindLobby();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    $("play-again").addEventListener("click", () => this.backToLobby());
    this.audio.setEnabled(localStorage.getItem(AUDIO_KEY) !== "0");
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
      if (!($("party-code") as HTMLInputElement).value.trim() && partyHostAvailable()) {
        const created = await createParty(nickname);
        if (created) ($("party-code") as HTMLInputElement).value = created.code;
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
    this.host = new MatchHost((bundle) => {
      this.bundle = bundle;
    });
    this.host.start(config);
    this.running = true;
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.loop(this.last);
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
    }
    this.input.endFrame();

    if (this.host.matchOver && this.host.result) {
      this.showResults(this.host.result);
      return;
    }

    this.raf = requestAnimationFrame(this.loop);
  };

  private syncHud(bundle: RenderBundle): void {
    $("alive-count").textContent = String(
      bundle.fighters.filter((f) => f.state !== "dead").length,
    );
    $("phase-info").textContent = `PHASE ${bundle.zone.phaseIndex + 1}`;
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
        if (def?.ammo) ammo = `${gun.ammoInMag} / ${p.ammo[def.ammo] ?? 0}`;
        else ammo = "∞";
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
      drop.textContent = "DEPLOY · SPACE";
    } else drop.classList.add("hidden");

    $("kill-feed").innerHTML = bundle.killFeed
      .slice(0, 5)
      .map((k) => {
        const tag = k.knocked ? " knocked " : " ";
        return `<div class="entry">${escapeHtml(k.killer)} [${escapeHtml(k.weapon)}]${tag}${escapeHtml(k.victim)}</div>`;
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
