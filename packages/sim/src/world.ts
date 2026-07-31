import {
  CRAWL_SPEED,
  LOBBY_SIZE,
  MAP_SIZE,
  PLAYER_ADS_SPEED,
  PLAYER_SPEED,
  REVIVE_RANGE,
  WEAPONS,
  type BotDifficulty,
  type GameMode,
  type PartySize,
} from "@stick-royale/shared";
import type { GameInput } from "./game-input.js";
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
  crawlSpeed,
  startHeal,
  teamSizeCapacity,
  tickBoost,
  tickDowned,
  tickHeal,
  tickRevive,
  tryPickup,
  type Fighter,
} from "./fighter";
import { generateMap, lootLabel, type IslandMap, type LootKind, type LootPile } from "./mapgen";
import {
  carePackageLoot,
  spawnVehicles,
  tickCarePackages,
  tickRedZone,
  tickVehicle,
  tryEnterVehicle,
  type CarePackage,
  type MapPing,
  type RedZone,
  type Vehicle,
} from "./midgame";
import { angleTo, clamp, createRng, dist } from "./math";
import { createZone, outsideBlue, updateZone, zonePhaseLabel, type ZoneState } from "./zone";
import { tickReload } from "./combat";

export type KillFeedEntry = { killer: string; victim: string; weapon: string; t: number; knocked?: boolean };
export type HitMarker = { x: number; y: number; text: string; life: number; crit: boolean };

export type MatchConfig = {
  nickname: string;
  mode: GameMode;
  partySize: PartySize;
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
  vehicles: Vehicle[] = [];
  carePackages: CarePackage[] = [];
  redZone: RedZone | null = null;
  pings: MapPing[] = [];
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
  partySize: PartySize;
  camera = { x: 0, y: 0, zoom: 1 };
  prompt = "";
  private deathOrder: string[] = [];
  private startedAt = 0;
  private nowMs: () => number;
  private nextCare = 75;
  private nextRed = 60;
  private lastZonePhase = 0;
  private allowKnock: boolean;
  private pingSeq = 0;

  constructor(config: MatchConfig, _audio?: unknown, startedAtMs?: number) {
    this.nowMs = () => Date.now();
    this.seed = config.seed ?? (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    this.rng = createRng(this.seed);
    this.difficulty = config.difficulty;
    this.mode = config.mode;
    this.partySize = config.partySize;
    this.allowKnock = config.partySize !== "solo";
    this.map = generateMap(this.seed);
    this.zone = createZone(this.rng);
    this.vehicles = spawnVehicles(this.rng);
    this.setupPlane();
    this.spawnFighters(config.nickname);
    this.startedAt = startedAtMs ?? this.nowMs();
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
    const cap = teamSizeCapacity(this.partySize);
    const humanTeams = Math.floor(LOBBY_SIZE / cap);
    void humanTeams;
    const botCount = LOBBY_SIZE - 1;
    const names = assignBotNames(botCount, this.seed);

    this.player = createFighter("player", nickname || "StickHero", this.plane.x, this.plane.y, false);
    this.player.teamId = 0;
    this.fighters.push(this.player);

    let allyBots = 0;
    if (this.partySize !== "solo") {
      allyBots = cap - 1;
      for (let i = 0; i < allyBots; i++) {
        const ally = createFighter(
          `ally_${i}`,
          `${nickname.slice(0, 8)}+${i + 1}`,
          this.plane.x,
          this.plane.y,
          true,
          this.difficulty,
        );
        ally.teamId = 0;
        ally.botTimer = this.rng() * 2;
        this.fighters.push(ally);
      }
    }

    const enemyStart = this.mode === "vs_ai" ? 100 : 1;
    for (let i = 0; i < botCount - allyBots; i++) {
      const teamId =
        this.partySize === "solo"
          ? i + 1
          : enemyStart + Math.floor(i / cap);
      const bot = createFighter(
        `bot_${i}`,
        names[i]!,
        this.plane.x,
        this.plane.y,
        true,
        this.difficulty,
      );
      bot.teamId = teamId;
      bot.botTimer = this.rng() * 2;
      this.fighters.push(bot);
    }
  }

  update(dt: number, input: GameInput, viewW: number, viewH: number): void {
    if (this.matchOver) return;
    this.time += dt;

    const pathLen = dist(
      { x: this.planePath.x1, y: this.planePath.y1 },
      { x: this.planePath.x2, y: this.planePath.y2 },
    );
    this.plane.pathT += (this.plane.speed * dt) / pathLen;
    this.plane.x = this.planePath.x1 + (this.planePath.x2 - this.planePath.x1) * Math.min(1, this.plane.pathT);
    this.plane.y = this.planePath.y1 + (this.planePath.y2 - this.planePath.y1) * Math.min(1, this.plane.pathT);

    this.updatePlayer(dt, input, viewW, viewH);
    this.tickMidgame(dt);

    const botStride = 2;
    const frame = Math.floor(this.time * 60);
    for (let i = 0; i < this.fighters.length; i++) {
      const f = this.fighters[i]!;
      f.animPhase = (f.animPhase ?? 0) + dt * 8;

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

      if (f.state === "alive" || f.state === "downed") {
        if (!f.vehicleId) {
          f.x = clamp(f.x, 40, MAP_SIZE - 40);
          f.y = clamp(f.y, 40, MAP_SIZE - 40);
          resolveCollision(f, this.map.buildings, this.map.cover);
        }
        if (f.state === "alive") {
          tickReload(f, dt);
          tickHeal(f, dt);
          tickBoost(f, dt);
        }
        if (f.fireCooldown > 0) f.fireCooldown -= dt;
        if (f.invuln > 0) f.invuln -= dt;

        if (f.state === "downed") {
          if (tickDowned(f, dt, this.fighters) && !this.deathOrder.includes(f.id)) {
            this.killFighter(f, null, "bleed");
          }
        }

        if (outsideBlue(this.zone, f.x, f.y)) {
          f.hp -= this.zone.damage * dt;
          if (f.hp <= 0) {
            f.hp = 0;
            if (f.state === "downed" || !this.allowKnock) {
              this.killFighter(f, null, "zone");
            } else {
              f.state = "downed";
              f.hp = 20;
            }
          }
        }
      }
    }

    for (const v of this.vehicles) {
      if (!v.driverId) continue;
      const driver = this.fighters.find((f) => f.id === v.driverId);
      if (driver?.id === this.player.id) {
        const move = input.moveVector();
        tickVehicle(v, driver, move.x, move.y, dt, (dmg) => {
          driver.hp = Math.max(0, driver.hp - dmg);
        });
      } else if (driver) {
        tickVehicle(v, driver, Math.cos(driver.aim), Math.sin(driver.aim), dt * 0.5, () => {});
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
        if (attacker.id === this.player.id) { /* audio handled by client */ }
      }
      if (victim.state === "downed" && !this.deathOrder.includes(victim.id)) {
        this.pushFeed(attacker, victim, weaponId, true);
      }
      if (victim.state === "dead" && !this.deathOrder.includes(victim.id)) {
        this.handleKill(attacker, victim, weaponId);
      }
    };

    const knock = this.allowKnock;
    updateBullets(this.bullets, this.fighters, this.map.buildings, this.map.cover, dt, (a, v, d, w) => {
      onHit(a, v, d, w);
      if (v.state === "dead") this.handleKill(a, v, w);
    }, knock);
    updateMelees(this.melees, this.fighters, dt, (a, v, d, w) => {
      onHit(a, v, d, w);
      if (v.state === "dead") this.handleKill(a, v, w);
    }, knock);
    updateFrags(this.frags, this.fighters, dt, (a, v, d, w) => {
      onHit(a, v, d, w);
      if (v.state === "dead") this.handleKill(a, v, w);
    }, knock);
    updateSmokes(this.smokes, dt);

    for (let i = this.hitMarkers.length - 1; i >= 0; i--) {
      const m = this.hitMarkers[i]!;
      m.life -= dt;
      m.y -= 28 * dt;
      if (m.life <= 0) this.hitMarkers.splice(i, 1);
    }

    for (const f of this.fighters) {
      if (f.state === "dead" && !this.deathOrder.includes(f.id)) {
        this.killFighter(f, null, "unknown");
      }
    }

    const prevPhase = this.zone.phaseIndex;
    updateZone(this.zone, dt, this.rng);
    if (this.zone.phaseIndex > prevPhase) { /* zone warning — client */ }

    this.pings = this.pings.filter((p) => p.until > this.time);
    this.updateCamera(viewW, viewH);
    this.cleanupLoot();
    this.checkMatchEnd();
    this.killFeed = this.killFeed.filter((k) => this.time - k.t < 5);
  }

  private tickMidgame(dt: number): void {
    this.nextCare -= dt;
    if (this.nextCare <= 0 && this.time > 50) {
      this.nextCare = 90;
      const ang = this.rng() * Math.PI * 2;
      const rad = this.zone.white.r * (0.3 + this.rng() * 0.5);
      this.carePackages.push({
        id: `care_${this.time}`,
        x: this.zone.white.x + Math.cos(ang) * rad,
        y: this.zone.white.y + Math.sin(ang) * rad,
        height: 320,
        landed: false,
        items: carePackageLoot(),
      });
    }
    tickCarePackages(this.carePackages, dt);

    this.nextRed -= dt;
    if (this.nextRed <= 0 && this.zone.phaseIndex >= 1) {
      this.nextRed = 75;
      const ang = this.rng() * Math.PI * 2;
      const rad = this.zone.blue.r * this.rng() * 0.65;
      this.redZone = {
        x: this.zone.blue.x + Math.cos(ang) * rad,
        y: this.zone.blue.y + Math.sin(ang) * rad,
        r: 140 + this.rng() * 80,
        telegraphUntil: this.time + 5,
        activeUntil: this.time + 9,
        active: false,
      };
      /* red zone sfx — client */
    }
    this.redZone = tickRedZone(this.redZone, this.fighters, this.time, dt, (f, dmg) => {
      f.hp -= dmg;
      if (f.hp <= 0) this.killFighter(f, null, "redzone");
    });
  }

  private updatePlayer(dt: number, input: GameInput, viewW: number, viewH: number): void {
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
        /* jump sfx — client */
      }
      if (this.plane.pathT > 0.85) p.state = "parachute";
      return;
    }

    if (p.state === "parachute") {
      const worldMx = this.camera.x + (input.mouseX - viewW / 2) / this.camera.zoom;
      const worldMy = this.camera.y + (input.mouseY - viewH / 2) / this.camera.zoom;
      const move = input.moveVector();
      p.x += move.x * 150 * dt;
      p.y += move.y * 150 * dt;
      p.x += Math.cos(angleTo(p, { x: worldMx, y: worldMy })) * 40 * dt;
      p.y += Math.sin(angleTo(p, { x: worldMx, y: worldMy })) * 40 * dt;
      p.aim = angleTo(p, { x: worldMx, y: worldMy });
      p.botTimer = (p.botTimer ?? 0) + dt;
      if (input.pressed(" ") || input.pressed("f") || (p.botTimer ?? 0) > 3.5) {
        p.state = "alive";
        p.invuln = 0.4;
      }
      return;
    }

    if (p.state === "downed") {
      const move = input.moveVector();
      const spd = crawlSpeed(p) || CRAWL_SPEED;
      p.x += move.x * spd * dt;
      p.y += move.y * spd * dt;
      this.prompt = "Knocked — crawl to cover";
      const medic = this.fighters.find(
        (o) => o.teamId === p.teamId && o.state === "alive" && o.id !== p.id && dist(o, p) <= REVIVE_RANGE,
      );
      if (medic) this.prompt = "Teammate nearby — hold H to revive you";
      return;
    }

    if (p.state !== "alive") return;

    const worldMx = this.camera.x + (input.mouseX - viewW / 2) / this.camera.zoom;
    const worldMy = this.camera.y + (input.mouseY - viewH / 2) / this.camera.zoom;
    p.aim = angleTo(p, { x: worldMx, y: worldMy });

    if (p.vehicleId) {
      if (input.pressed("v") || input.pressed("f")) {
        tryEnterVehicle(p, this.vehicles);
        this.prompt = "Exited vehicle";
      } else {
        this.prompt = "Driving — WASD steer · V exit";
      }
      if (input.pressed("g")) this.addPing(worldMx, worldMy, "move");
      if (input.mouseDown && !p.vehicleId) {
        /* fire disabled in vehicle for v1 */
      }
      const revived = tickRevive(p, this.fighters, dt, input.down("h"));
      if (revived) { /* revive sfx */ }
      return;
    }

    const ads = input.mouseRight || input.down("shift");
    const move = input.moveVector();
    const speed = (ads ? PLAYER_ADS_SPEED : PLAYER_SPEED) * (p.healTimer > 0 ? 0.45 : 1);
    p.x += move.x * speed * dt;
    p.y += move.y * speed * dt;

    if (input.pressed("1")) p.activeSlot = 0;
    if (input.pressed("2")) p.activeSlot = 1;
    if (input.pressed("3")) p.activeSlot = 2;
    if (input.pressed("4")) p.activeSlot = 3;
    if (input.pressed("r")) startReload(p);
    if (input.pressed("q")) startHeal(p, "bandage");
    if (input.pressed("c")) startHeal(p, "medkit");
    if (input.pressed("z")) startHeal(p, "energy_drink");
    if (input.pressed("x")) startHeal(p, "painkiller");
    if (input.pressed("v")) tryEnterVehicle(p, this.vehicles);
    if (input.pressed("g")) this.addPing(worldMx, worldMy, input.down("shift") ? "enemy" : "move");

    const downedMate = this.fighters.find(
      (o) => o.teamId === p.teamId && o.state === "downed" && dist(p, o) <= REVIVE_RANGE,
    );
    if (downedMate) this.prompt = "H — revive teammate";
    const revived = tickRevive(p, this.fighters, dt, input.down("h"));
    if (revived) { /* loot sfx */ }

    const near = this.nearestLoot(p.x, p.y, 48);
    const nearCare = this.carePackages.find((c) => c.landed && dist(p, c) < 52);
    if (nearCare && !downedMate) {
      this.prompt = "F — Care Package";
      if (input.down("f") || input.pressed("f")) {
        for (const item of nearCare.items) tryPickup(p, item);
        nearCare.items = [];
        this.carePackages = this.carePackages.filter((c) => c.items.length > 0 || !c.landed);
        /* care package loot */
      }
    } else if (near && !downedMate) {
      const labels = near.items.map(lootLabel).slice(0, 3).join(", ");
      this.prompt = `F — ${labels}`;
      if (input.down("f") || input.down("e") || input.pressed("f") || input.pressed("e")) {
        const before = near.items.length;
        this.pickupLoot(p, near);
        for (const pile of this.map.loot) {
          if (pile === near || pile.items.length === 0) continue;
          if (dist(p, pile) < 48) this.pickupLoot(p, pile);
        }
        if (near.items.length < before) { /* loot sfx */ }
      }
    }

    const nearVeh = this.vehicles.find((v) => !v.driverId && dist(p, v) < 44);
    if (nearVeh && !near && !downedMate) this.prompt = "V — enter vehicle";

    if (input.mouseDown) {
      const gun = activeWeapon(p);
      const cat = gun ? WEAPONS[gun.weaponId]?.category : "ar";
      if (tryFire(p, ads, move.x !== 0 || move.y !== 0, this.bullets, this.melees, this.frags, this.smokes, this.rng)) {
        /* shoot sfx — client */
      }
    }

    if (p.fireCooldown > 0) p.fireCooldown -= dt;
  }

  private addPing(x: number, y: number, kind: "move" | "enemy" | "loot"): void {
    this.pings.push({
      id: `ping_${++this.pingSeq}`,
      teamId: this.player.teamId,
      x,
      y,
      kind,
      until: this.time + 8,
    });
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

  private pushFeed(attacker: Fighter, victim: Fighter, weaponId: string, knocked: boolean): void {
    this.killFeed.unshift({
      killer: attacker.name,
      victim: victim.name,
      weapon: WEAPONS[weaponId]?.name ?? weaponId,
      t: this.time,
      knocked,
    });
    if (this.killFeed.length > 6) this.killFeed.length = 6;
  }

  private handleKill(attacker: Fighter, victim: Fighter, weaponId: string): void {
    if (this.deathOrder.includes(victim.id)) return;
    this.deathOrder.push(victim.id);
    attacker.kills += 1;
    this.pushFeed(attacker, victim, weaponId, false);
    this.spawnDeathCrate(victim);
    if (victim.vehicleId) {
      const v = this.vehicles.find((x) => x.id === victim.vehicleId);
      if (v) v.driverId = null;
      victim.vehicleId = null;
    }
  }

  private killFighter(victim: Fighter, attacker: Fighter | null, weaponId: string): void {
    if (this.deathOrder.includes(victim.id)) return;
    victim.state = "dead";
    victim.hp = 0;
    this.deathOrder.push(victim.id);
    if (attacker) {
      attacker.kills += 1;
      this.pushFeed(attacker, victim, weaponId, false);
    } else {
      this.killFeed.unshift({
        killer: weaponId === "zone" ? "Blue Zone" : weaponId === "redzone" ? "Red Zone" : "World",
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
      if (amount > 0) {
        items.push({
          type: "ammo",
          ammo: ammo as "556",
          amount: Math.min(60, amount),
        });
      }
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
    this.carePackages = this.carePackages.filter((c) => c.items.length > 0 || !c.landed);
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

  private teamAlive(teamId: number): Fighter[] {
    return this.fighters.filter(
      (f) => f.teamId === teamId && (f.state === "alive" || f.state === "downed"),
    );
  }

  private checkMatchEnd(): void {
    const playerTeamAlive = this.teamAlive(this.player.teamId);
    const playerEliminated =
      this.player.state === "dead" ||
      (this.player.state === "downed" && !playerTeamAlive.some((f) => f.state === "alive"));

    if (playerEliminated && !this.matchOver) {
      const aliveFighters = this.fighters.filter((f) => f.state !== "dead");
      this.matchOver = true;
      this.result = {
        placement: Math.max(1, aliveFighters.length + 1),
        kills: this.player.kills,
        damage: this.player.damageDealt,
        winner: false,
        aliveTime: (this.nowMs() - this.startedAt) / 1000,
      };
      /* eliminated sfx — client */
      return;
    }

    const livingTeams = new Set(
      this.fighters
        .filter((f) => f.state === "alive" || f.state === "downed")
        .map((f) => f.teamId),
    );
    if (livingTeams.size <= 1 && !playerEliminated) {
      this.matchOver = true;
      this.result = {
        placement: 1,
        kills: this.player.kills,
        damage: this.player.damageDealt,
        winner: true,
        aliveTime: (this.nowMs() - this.startedAt) / 1000,
      };
      /* chicken dinner sfx — client */
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

  teammates(): Fighter[] {
    return this.fighters.filter((f) => f.teamId === this.player.teamId && f.id !== this.player.id);
  }

  /** Serializable render state for Web Worker → main thread */
  exportRenderBundle() {
    return {
      map: this.map,
      fighters: this.fighters,
      player: this.player,
      zone: this.zone,
      bullets: this.bullets,
      melees: this.melees,
      frags: this.frags,
      smokes: this.smokes,
      vehicles: this.vehicles,
      carePackages: this.carePackages,
      redZone: this.redZone,
      pings: this.pings,
      killFeed: this.killFeed,
      hitMarkers: this.hitMarkers,
      time: this.time,
      plane: this.plane,
      planePath: this.planePath,
      matchOver: this.matchOver,
      result: this.result,
      camera: this.camera,
      prompt: this.prompt,
    };
  }
}
