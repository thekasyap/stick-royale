import {
  LOBBY_SIZE,
  MAP_SIZE,
  PLAYER_ADS_SPEED,
  PLAYER_SPEED,
  WEAPONS,
  type BotDifficulty,
  type GameMode,
} from "@stick-royale/shared";
import { assignBotNames, updateBot } from "./bots";
import {
  resolveCollision,
  startReload,
  tryFire,
  updateBullets,
  updateFrags,
  updateMelees,
  updateSmokes,
  type Bullet,
  type FragNade,
  type MeleeSwing,
  type SmokeCloud,
} from "./combat";
import {
  activeWeapon,
  createFighter,
  startHeal,
  tickBoost,
  tickHeal,
  tryPickup,
  type Fighter,
} from "./fighter";
import type { Input } from "./input";
import { generateMap, lootLabel, type IslandMap, type LootKind, type LootPile } from "./mapgen";
import { angleTo, clamp, createRng, dist } from "./math";
import { createZone, outsideBlue, updateZone, zonePhaseLabel, type ZoneState } from "./zone";
import { tickReload } from "./combat";

export type KillFeedEntry = { killer: string; victim: string; weapon: string; t: number };

export type HitMarker = { x: number; y: number; text: string; life: number; crit: boolean };

export type MatchConfig = {
  nickname: string;
  mode: GameMode;
  difficulty: BotDifficulty;
  seed?: number;
};

export type MatchResult = {
  placement: number;
  kills: number;
  damage: number;
  winner: boolean;
  aliveTime: number;
};

export class World {
  map: IslandMap;
  fighters: Fighter[] = [];
  player!: Fighter;
  zone: ZoneState;
  bullets: Bullet[] = [];
  melees: MeleeSwing[] = [];
  frags: FragNade[] = [];
  smokes: SmokeCloud[] = [];
  killFeed: KillFeedEntry[] = [];
  hitMarkers: HitMarker[] = [];
  time = 0;
  seed: number;
  rng: () => number;
  plane = { x: 0, y: 0, angle: 0, speed: 220, pathT: 0 };
  planePath = { x1: 0, y1: 0, x2: 0, y2: 0 };
  matchOver = false;
  result: MatchResult | null = null;
  difficulty: BotDifficulty;
  mode: GameMode;
  camera = { x: 0, y: 0, zoom: 1 };
  prompt = "";
  private deathOrder: string[] = [];
  private startedAt = 0;

  constructor(config: MatchConfig) {
    this.seed = config.seed ?? (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    this.rng = createRng(this.seed);
    this.difficulty = config.difficulty;
    this.mode = config.mode;
    this.map = generateMap(this.seed);
    this.zone = createZone(this.rng);
    this.setupPlane();
    this.spawnFighters(config.nickname);
    this.startedAt = performance.now();
  }

  private setupPlane(): void {
    const margin = 150;
    const edge = Math.floor(this.rng() * 4);
    let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
    if (edge === 0) {
      x1 = margin; y1 = margin + this.rng() * (MAP_SIZE - margin * 2);
      x2 = MAP_SIZE - margin; y2 = margin + this.rng() * (MAP_SIZE - margin * 2);
    } else if (edge === 1) {
      x1 = MAP_SIZE - margin; y1 = margin + this.rng() * (MAP_SIZE - margin * 2);
      x2 = margin; y2 = margin + this.rng() * (MAP_SIZE - margin * 2);
    } else if (edge === 2) {
      x1 = margin + this.rng() * (MAP_SIZE - margin * 2); y1 = margin;
      x2 = margin + this.rng() * (MAP_SIZE - margin * 2); y2 = MAP_SIZE - margin;
    } else {
      x1 = margin + this.rng() * (MAP_SIZE - margin * 2); y1 = MAP_SIZE - margin;
      x2 = margin + this.rng() * (MAP_SIZE - margin * 2); y2 = margin;
    }
    this.planePath = { x1, y1, x2, y2 };
    this.plane.x = x1;
    this.plane.y = y1;
    this.plane.angle = Math.atan2(y2 - y1, x2 - x1);
    this.plane.pathT = 0;
  }

  private spawnFighters(nickname: string): void {
    const botCount = LOBBY_SIZE - 1;
    const names = assignBotNames(botCount, this.seed);
    this.player = createFighter("player", nickname || "StickHero", this.plane.x, this.plane.y, false);
    this.player.teamId = 0;
    this.fighters.push(this.player);

    for (let i = 0; i < botCount; i++) {
      const bot = createFighter(
        `bot_${i}`,
        names[i]!,
        this.plane.x,
        this.plane.y,
        true,
        this.difficulty,
      );
      bot.teamId = i + 1; // FFA
      bot.botTimer = this.rng() * 2;
      this.fighters.push(bot);
    }
  }

  update(dt: number, input: Input, viewW: number, viewH: number): void {
    if (this.matchOver) return;
    this.time += dt;

    // plane movement
    const pathLen = dist(
      { x: this.planePath.x1, y: this.planePath.y1 },
      { x: this.planePath.x2, y: this.planePath.y2 },
    );
    this.plane.pathT += (this.plane.speed * dt) / pathLen;
    this.plane.x = this.planePath.x1 + (this.planePath.x2 - this.planePath.x1) * Math.min(1, this.plane.pathT);
    this.plane.y = this.planePath.y1 + (this.planePath.y2 - this.planePath.y1) * Math.min(1, this.plane.pathT);

    this.updatePlayer(dt, input, viewW, viewH);

    const botStride = 2; // update half the bots fully each frame for perf
    const frame = Math.floor(this.time * 60);
    for (let i = 0; i < this.fighters.length; i++) {
      const f = this.fighters[i]!;
      if (f.isBot) {
        if (f.state === "plane") {
          f.x = this.plane.x;
          f.y = this.plane.y;
        }
        const nearPlayer = dist(f, this.player) < 520;
        if (nearPlayer || (i + frame) % botStride === 0) {
          const botDt = nearPlayer ? dt : dt * botStride;
          updateBot(
            f, this.fighters, this.map, this.zone, botDt, this.time,
            this.bullets, this.melees, this.frags, this.smokes, this.rng,
          );
        }
      }
      if (f.state === "alive") {
        f.x = clamp(f.x, 40, MAP_SIZE - 40);
        f.y = clamp(f.y, 40, MAP_SIZE - 40);
        resolveCollision(f, this.map.buildings, this.map.cover);
        tickReload(f, dt);
        tickHeal(f, dt);
        tickBoost(f, dt);
        if (f.fireCooldown > 0) f.fireCooldown -= dt;
        if (f.invuln > 0) f.invuln -= dt;

        if (outsideBlue(this.zone, f.x, f.y)) {
          f.hp -= this.zone.damage * dt;
          if (f.hp <= 0) {
            f.hp = 0;
            this.killFighter(f, null, "zone");
          }
        }
      }
    }

    const onHit = (attacker: Fighter, victim: Fighter, dmg: number, weaponId: string) => {
      if (attacker.id === this.player.id || victim.id === this.player.id) {
        this.hitMarkers.push({
          x: victim.x + (this.rng() - 0.5) * 20,
          y: victim.y - 28,
          text: String(Math.round(dmg)),
          life: 0.7,
          crit: dmg >= 40,
        });
      }
      if (victim.state === "dead" && !this.deathOrder.includes(victim.id)) {
        this.handleKill(attacker, victim, weaponId);
      }
    };

    updateBullets(this.bullets, this.fighters, this.map.buildings, this.map.cover, dt, (a, v, d, w) => {
      onHit(a, v, d, w);
      if (v.state === "dead") this.handleKill(a, v, w);
    });
    updateMelees(this.melees, this.fighters, dt, (a, v, d, w) => {
      onHit(a, v, d, w);
      if (v.state === "dead") this.handleKill(a, v, w);
    });
    updateFrags(this.frags, this.fighters, dt, (a, v, d, w) => {
      onHit(a, v, d, w);
      if (v.state === "dead") this.handleKill(a, v, w);
    });
    updateSmokes(this.smokes, dt);

    for (let i = this.hitMarkers.length - 1; i >= 0; i--) {
      const m = this.hitMarkers[i]!;
      m.life -= dt;
      m.y -= 28 * dt;
      if (m.life <= 0) this.hitMarkers.splice(i, 1);
    }

    // detect deaths from bullets that set state
    for (const f of this.fighters) {
      if (f.state === "dead" && !this.deathOrder.includes(f.id)) {
        this.killFighter(f, null, "unknown");
      }
    }

    updateZone(this.zone, dt, this.rng);
    this.updateCamera(viewW, viewH);
    this.cleanupLoot();
    this.checkMatchEnd();

    // kill feed expiry
    this.killFeed = this.killFeed.filter((k) => this.time - k.t < 5);
  }

  private updatePlayer(dt: number, input: Input, viewW: number, viewH: number): void {
    const p = this.player;
    this.prompt = "";

    if (p.state === "plane") {
      p.x = this.plane.x;
      p.y = this.plane.y;
      if (input.pressed(" ") || input.pressed("f") || input.pressed("e")) {
        p.state = "parachute";
        p.dropTarget = {
          x: this.camera.x + (input.mouseX - viewW / 2) / this.camera.zoom,
          y: this.camera.y + (input.mouseY - viewH / 2) / this.camera.zoom,
        };
      }
      // auto jump near end of path
      if (this.plane.pathT > 0.85) {
        p.state = "parachute";
      }
      return;
    }

    if (p.state === "parachute") {
      const worldMx = this.camera.x + (input.mouseX - viewW / 2) / this.camera.zoom;
      const worldMy = this.camera.y + (input.mouseY - viewH / 2) / this.camera.zoom;
      const move = input.moveVector();
      p.x += move.x * 150 * dt;
      p.y += move.y * 150 * dt;
      // glide toward mouse slightly
      p.x += Math.cos(angleTo(p, { x: worldMx, y: worldMy })) * 40 * dt;
      p.y += Math.sin(angleTo(p, { x: worldMx, y: worldMy })) * 40 * dt;
      p.aim = angleTo(p, { x: worldMx, y: worldMy });
      // land after time or press
      p.botTimer = (p.botTimer ?? 0) + dt;
      if (input.pressed(" ") || input.pressed("f") || (p.botTimer ?? 0) > 3.5) {
        p.state = "alive";
        p.invuln = 0.4;
      }
      return;
    }

    if (p.state !== "alive") return;

    const worldMx = this.camera.x + (input.mouseX - viewW / 2) / this.camera.zoom;
    const worldMy = this.camera.y + (input.mouseY - viewH / 2) / this.camera.zoom;
    p.aim = angleTo(p, { x: worldMx, y: worldMy });

    const ads = input.mouseRight || input.down("shift");
    const move = input.moveVector();
    const speed = (ads ? PLAYER_ADS_SPEED : PLAYER_SPEED) * (p.healTimer > 0 ? 0.45 : 1);
    p.x += move.x * speed * dt;
    p.y += move.y * speed * dt;

    // slots
    if (input.pressed("1")) p.activeSlot = 0;
    if (input.pressed("2")) p.activeSlot = 1;
    if (input.pressed("3")) p.activeSlot = 2;
    if (input.pressed("4")) p.activeSlot = 3;

    if (input.pressed("r")) startReload(p);
    if (input.pressed("q")) startHeal(p, "bandage");
    if (input.pressed("c")) startHeal(p, "medkit");
    if (input.pressed("z")) startHeal(p, "energy_drink");
    if (input.pressed("x")) startHeal(p, "painkiller");

    // loot — hold F/E to vacuum nearby piles
    const near = this.nearestLoot(p.x, p.y, 48);
    if (near) {
      const labels = near.items.map(lootLabel).slice(0, 3).join(", ");
      this.prompt = `F — ${labels}`;
      if (input.down("f") || input.down("e") || input.pressed("f") || input.pressed("e")) {
        this.pickupLoot(p, near);
        // also grab other piles in range
        for (const pile of this.map.loot) {
          if (pile === near || pile.items.length === 0) continue;
          if (dist(p, pile) < 48) this.pickupLoot(p, pile);
        }
      }
    }

    if (input.mouseDown) {
      tryFire(p, ads, move.x !== 0 || move.y !== 0, this.bullets, this.melees, this.frags, this.smokes, this.rng);
    }

    if (p.fireCooldown > 0) p.fireCooldown -= dt;
  }

  private nearestLoot(x: number, y: number, radius: number): LootPile | null {
    let best: LootPile | null = null;
    let bestD = radius;
    for (const pile of this.map.loot) {
      if (pile.items.length === 0) continue;
      const d = dist({ x, y }, pile);
      if (d < bestD) {
        bestD = d;
        best = pile;
      }
    }
    return best;
  }

  private pickupLoot(f: Fighter, pile: LootPile): void {
    const remaining: LootKind[] = [];
    for (const item of pile.items) {
      if (!tryPickup(f, item)) remaining.push(item);
    }
    pile.items = remaining;
  }

  private handleKill(attacker: Fighter, victim: Fighter, weaponId: string): void {
    if (this.deathOrder.includes(victim.id)) return;
    this.deathOrder.push(victim.id);
    attacker.kills += 1;
    const wname = WEAPONS[weaponId]?.name ?? weaponId;
    this.killFeed.unshift({
      killer: attacker.name,
      victim: victim.name,
      weapon: wname,
      t: this.time,
    });
    if (this.killFeed.length > 6) this.killFeed.length = 6;
    this.spawnDeathCrate(victim);
  }

  private killFighter(victim: Fighter, attacker: Fighter | null, weaponId: string): void {
    if (this.deathOrder.includes(victim.id)) return;
    victim.state = "dead";
    victim.hp = 0;
    this.deathOrder.push(victim.id);
    if (attacker) {
      attacker.kills += 1;
      this.killFeed.unshift({
        killer: attacker.name,
        victim: victim.name,
        weapon: WEAPONS[weaponId]?.name ?? weaponId,
        t: this.time,
      });
    } else {
      this.killFeed.unshift({
        killer: weaponId === "zone" ? "Blue Zone" : "World",
        victim: victim.name,
        weapon: weaponId,
        t: this.time,
      });
    }
    if (this.killFeed.length > 6) this.killFeed.length = 6;
    this.spawnDeathCrate(victim);
  }

  private spawnDeathCrate(victim: Fighter): void {
    const items: LootKind[] = [];
    if (victim.primary) items.push({ type: "weapon", weaponId: victim.primary.weaponId });
    if (victim.secondary && victim.secondary.weaponId !== "sidekick") {
      items.push({ type: "weapon", weaponId: victim.secondary.weaponId });
    }
    for (const [ammo, amount] of Object.entries(victim.ammo)) {
      if (amount > 0) items.push({ type: "ammo", ammo: ammo as LootKind extends { ammo: infer A } ? A : never, amount: Math.min(60, amount) });
    }
    if (victim.helmet > 0) items.push({ type: "armor", armorId: `helmet_${victim.helmet}` as "helmet_1" });
    if (victim.vest > 0) items.push({ type: "armor", armorId: `vest_${victim.vest}` as "vest_1" });
    if (items.length === 0) return;
    this.map.loot.push({
      id: `crate_${victim.id}_${this.time}`,
      x: victim.x,
      y: victim.y,
      items,
      fromCrate: true,
    });
  }

  private cleanupLoot(): void {
    this.map.loot = this.map.loot.filter((l) => l.items.length > 0);
  }

  private updateCamera(viewW: number, viewH: number): void {
    const p = this.player;
    const targetZoom = p.state === "plane" ? 0.45 : p.state === "parachute" ? 0.7 : 1;
    this.camera.zoom += (targetZoom - this.camera.zoom) * 0.08;
    this.camera.x += (p.x - this.camera.x) * 0.15;
    this.camera.y += (p.y - this.camera.y) * 0.15;
    void viewW;
    void viewH;
  }

  private checkMatchEnd(): void {
    const alive = this.fighters.filter((f) => f.state !== "dead");
    if (this.player.state === "dead" && !this.matchOver) {
      const placement = alive.length + 1;
      this.matchOver = true;
      this.result = {
        placement,
        kills: this.player.kills,
        damage: this.player.damageDealt,
        winner: false,
        aliveTime: (performance.now() - this.startedAt) / 1000,
      };
      return;
    }
    if (alive.length <= 1 && this.player.state !== "dead") {
      this.matchOver = true;
      this.result = {
        placement: 1,
        kills: this.player.kills,
        damage: this.player.damageDealt,
        winner: true,
        aliveTime: (performance.now() - this.startedAt) / 1000,
      };
    }
  }

  aliveCount(): number {
    return this.fighters.filter((f) => f.state !== "dead").length;
  }

  phaseLabel(): string {
    return zonePhaseLabel(this.zone);
  }

  weaponHud(): { name: string; ammo: string } {
    const p = this.player;
    if (p.activeSlot === 3) {
      return { name: "Throwables", ammo: `Frag ${p.frags} · Smoke ${p.smokes}` };
    }
    const gun = activeWeapon(p);
    if (!gun) return { name: "—", ammo: "" };
    const def = WEAPONS[gun.weaponId]!;
    if (!def.ammo) return { name: def.name, ammo: "∞" };
    return {
      name: p.reloadTimer > 0 ? `${def.name}…` : def.name,
      ammo: `${gun.ammoInMag} / ${p.ammo[def.ammo] ?? 0}`,
    };
  }
}
