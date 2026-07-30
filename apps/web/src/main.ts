import type { BotDifficulty, GameMode } from "@stick-royale/shared";
import { Input } from "./game/input";
import { Renderer } from "./game/renderer";
import { World } from "./game/world";

const GUEST_KEY = "stick_royale_guest";
const NICK_KEY = "stick_royale_nick";

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
  private world: World | null = null;
  private raf = 0;
  private last = 0;
  private running = false;

  constructor() {
    ensureGuestId();
    this.bindLobby();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    $("play-again").addEventListener("click", () => this.backToLobby());
  }

  private bindLobby(): void {
    const nick = $("nickname") as HTMLInputElement;
    nick.value = localStorage.getItem(NICK_KEY) || randomNick();
    $("lobby-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const nickname = nick.value.trim().slice(0, 16) || "StickHero";
      localStorage.setItem(NICK_KEY, nickname);
      const mode = ($("mode") as HTMLSelectElement).value as GameMode;
      const difficulty = ($("difficulty") as HTMLSelectElement).value as BotDifficulty;
      this.startMatch({ nickname, mode, difficulty });
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

  private startMatch(config: { nickname: string; mode: GameMode; difficulty: BotDifficulty }): void {
    $("lobby").classList.add("hidden");
    $("results").classList.add("hidden");
    $("hud").classList.remove("hidden");
    this.world = new World(config);
    this.running = true;
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.loop(this.last);
  }

  private backToLobby(): void {
    this.running = false;
    this.world = null;
    cancelAnimationFrame(this.raf);
    $("results").classList.add("hidden");
    $("hud").classList.add("hidden");
    $("lobby").classList.remove("hidden");
  }

  private loop = (now: number): void => {
    if (!this.running || !this.world) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    this.world.update(dt, this.input, viewW, viewH);
    this.renderer.draw(this.world, viewW, viewH);
    this.syncHud(this.world);
    this.input.endFrame();

    if (this.world.matchOver && this.world.result) {
      this.showResults(this.world);
      return;
    }

    this.raf = requestAnimationFrame(this.loop);
  };

  private syncHud(world: World): void {
    $("alive-count").textContent = String(world.aliveCount());
    $("phase-info").textContent = world.phaseLabel();
    const p = world.player;
    const hpFill = $("hp-fill") as HTMLDivElement;
    const boostFill = $("boost-fill") as HTMLDivElement;
    hpFill.style.width = `${Math.max(0, p.hp)}%`;
    boostFill.style.width = `${Math.max(0, p.boost)}%`;
    $("hp-text").textContent = String(Math.ceil(Math.max(0, p.hp)));
    $("helmet-lvl").textContent = `H${p.helmet}`;
    $("vest-lvl").textContent = `V${p.vest}`;
    $("bag-lvl").textContent = `B${p.backpack}`;

    const wh = world.weaponHud();
    $("weapon-name").textContent = wh.name;
    $("ammo-text").textContent = wh.ammo;
    $("prompt").textContent = world.prompt;

    const drop = $("drop-banner");
    if (p.state === "plane") drop.classList.remove("hidden");
    else drop.classList.add("hidden");

    const feed = $("kill-feed");
    feed.innerHTML = world.killFeed
      .slice(0, 5)
      .map((k) => `<div class="entry">${escapeHtml(k.killer)} [${escapeHtml(k.weapon)}] ${escapeHtml(k.victim)}</div>`)
      .join("");
  }

  private showResults(world: World): void {
    const r = world.result!;
    $("hud").classList.add("hidden");
    $("results").classList.remove("hidden");
    $("results-title").textContent = r.winner ? "CHICKEN DINNER" : "ELIMINATED";
    $("results-place").textContent = `#${r.placement} / 48`;
    $("stat-kills").textContent = String(r.kills);
    $("stat-damage").textContent = String(Math.round(r.damage));
    $("stat-alive").textContent = `${Math.floor(r.aliveTime)}s`;
    // keep last frame visible — freeze loop
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
