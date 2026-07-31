import { MAP_SIZE, WEAPONS } from "@stick-royale/shared";
import type { RenderBundle } from "@stick-royale/sim";
import { activeWeapon, type Fighter } from "@stick-royale/sim";
import type { IslandMap } from "@stick-royale/sim";

const GRASS_A = "#3d4f32";
const GRASS_B = "#455836";
const SAND = "#c4b59a";
const WATER = "#3a5a6a";
const ROAD = "#5a5348";

export class Renderer {
  private grassPattern: CanvasPattern | null = null;

  constructor(
    private ctx: CanvasRenderingContext2D,
    private minimap: CanvasRenderingContext2D,
  ) {
    this.grassPattern = this.makeGrassPattern();
  }

  private makeGrassPattern(): CanvasPattern | null {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = GRASS_A;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = GRASS_B;
    for (let i = 0; i < 40; i++) {
      g.fillRect((i * 17) % 64, (i * 29) % 64, 2, 2);
    }
    g.fillStyle = "rgba(90,107,69,0.35)";
    g.fillRect(10, 20, 8, 3);
    g.fillRect(40, 45, 10, 2);
    return this.ctx.createPattern(c, "repeat");
  }

  draw(world: RenderBundle, w: number, h: number, mouseX = w / 2, mouseY = h / 2): void {
    const { ctx } = this;
    const cam = world.camera;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#1a2218";
    ctx.fillRect(0, 0, w, h);

    ctx.translate(w / 2, h / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    this.drawTerrain(world.map);
    this.drawZone(world);
    this.drawRedZone(world);
    this.drawLoot(world.map);
    this.drawCarePackages(world);
    this.drawVehicles(world);
    this.drawSmokes(world);
    this.drawFighters(world);
    this.drawBullets(world);
    this.drawFrags(world);
    this.drawPings(world);
    this.drawPlane(world);
    this.drawHitMarkers(world);

    ctx.restore();
    this.drawCrosshair(mouseX, mouseY, world);
    this.drawDamageChevron(world, w, h);
    this.drawCompass(world, w);
    this.drawKillToast(world, w);
    this.drawMinimap(world);
  }

  private drawDamageChevron(world: RenderBundle, viewW: number, viewH: number): void {
    if ((world.player.hitFlash ?? 0) <= 0 && (world.sfx?.damaged ?? 0) <= 0) return;
    // Show while player is flashing from damage
    if ((world.player.hitFlash ?? 0) <= 0) return;
    const { ctx } = this;
    const dir = world.damageDir ?? 0;
    const cx = viewW / 2;
    const cy = viewH / 2;
    const r = Math.min(viewW, viewH) * 0.28;
    const x = cx + Math.cos(dir) * r;
    const y = cy + Math.sin(dir) * r;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (world.player.hitFlash ?? 0) * 8);
    ctx.translate(x, y);
    ctx.rotate(dir);
    ctx.fillStyle = "rgba(200, 50, 40, 0.85)";
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-8, -10);
    ctx.lineTo(-8, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawCompass(world: RenderBundle, viewW: number): void {
    if (world.player.state === "plane") return;
    const { ctx } = this;
    const cx = viewW / 2;
    const y = 28;
    const facing = world.player.aim;
    const labels = ["N", "E", "S", "W"];
    ctx.save();
    ctx.font = "700 11px 'IBM Plex Sans'";
    ctx.textAlign = "center";
    for (let i = 0; i < 4; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 2 - facing;
      const x = cx + Math.sin(ang) * 70;
      const alpha = 0.35 + 0.55 * Math.max(0, Math.cos(ang));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = i === 0 ? "#d4a04a" : "#f0e8d8";
      ctx.fillText(labels[i]!, x, y);
    }
    // Zone bearing tick
    const zx = world.zone.white.x - world.player.x;
    const zy = world.zone.white.y - world.player.y;
    const zAng = Math.atan2(zy, zx) - facing;
    const zxScreen = cx + Math.sin(zAng) * 70;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#6a9ecf";
    ctx.fillRect(zxScreen - 2, y + 6, 4, 4);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawKillToast(world: RenderBundle, viewW: number): void {
    const toast = world.killToast;
    if (!toast) return;
    const { ctx } = this;
    ctx.save();
    ctx.font = "700 22px 'Bebas Neue', sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(212, 160, 74, 0.95)";
    ctx.fillText(`ELIMINATED  ${toast.name.toUpperCase()}`, viewW / 2, 72);
    ctx.restore();
  }

  private drawHitMarkers(world: RenderBundle): void {
    const { ctx } = this;
    for (const m of world.hitMarkers) {
      ctx.globalAlpha = Math.min(1, m.life * 2);
      ctx.fillStyle = m.headshot ? "#ffd27a" : m.crit ? "#d4a04a" : "#f0e8d8";
      ctx.font = m.headshot || m.crit ? "700 16px 'IBM Plex Sans'" : "600 13px 'IBM Plex Sans'";
      ctx.textAlign = "center";
      ctx.fillText(m.text, m.x, m.y);
      if (m.headshot) {
        ctx.font = "700 10px 'IBM Plex Sans'";
        ctx.fillText("HEAD", m.x, m.y - 14);
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawCrosshair(mx: number, my: number, world: RenderBundle): void {
    if (world.player.state === "plane" || world.player.state === "dead") return;
    const { ctx } = this;
    const punch = world.player.aimPunch ?? 0;
    const reloading = world.player.reloadTimer > 0;
    const recentHit = world.hitMarkers.some((m) => m.life > 0.55);
    const gap = world.player.state === "parachute" ? 10 : 5 + punch * 40 + (reloading ? 8 : 0);
    const len = 7;
    ctx.save();
    ctx.strokeStyle = recentHit
      ? "rgba(220, 70, 50, 0.95)"
      : reloading
        ? "rgba(212, 160, 74, 0.85)"
        : "rgba(240, 232, 216, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mx - gap - len, my);
    ctx.lineTo(mx - gap, my);
    ctx.moveTo(mx + gap, my);
    ctx.lineTo(mx + gap + len, my);
    ctx.moveTo(mx, my - gap - len);
    ctx.lineTo(mx, my - gap);
    ctx.moveTo(mx, my + gap);
    ctx.lineTo(mx, my + gap + len);
    ctx.stroke();
    if (recentHit) {
      // PUBG-style hit confirm X
      ctx.beginPath();
      ctx.moveTo(mx - 4, my - 4);
      ctx.lineTo(mx + 4, my + 4);
      ctx.moveTo(mx + 4, my - 4);
      ctx.lineTo(mx - 4, my + 4);
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(212, 160, 74, 0.9)";
      ctx.fillRect(mx - 1, my - 1, 2, 2);
    }
    ctx.restore();
  }

  private drawTerrain(map: IslandMap): void {
    const { ctx } = this;
    ctx.fillStyle = this.grassPattern ?? GRASS_A;
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

    // soft hills
    for (const poi of map.pois) {
      const grd = ctx.createRadialGradient(poi.x, poi.y, 10, poi.x, poi.y, poi.radius * 1.4);
      grd.addColorStop(0, "rgba(70, 90, 50, 0.25)");
      grd.addColorStop(1, "transparent");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(poi.x, poi.y, poi.radius * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const water of map.water) {
      ctx.fillStyle = WATER;
      ctx.fillRect(water.x, water.y, water.w, water.h);
      ctx.fillStyle = "rgba(180, 200, 210, 0.12)";
      ctx.fillRect(water.x, water.y, water.w, 6);
    }

    for (const road of map.roads) {
      ctx.strokeStyle = ROAD;
      ctx.lineWidth = road.w;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(road.x1, road.y1);
      ctx.lineTo(road.x2, road.y2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(196,181,154,0.25)";
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 16]);
      ctx.beginPath();
      ctx.moveTo(road.x1, road.y1);
      ctx.lineTo(road.x2, road.y2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const b of map.buildings) {
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      // roof hatch
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(b.x, b.y, b.w, 6);
    }

    for (const c of map.cover) {
      if (c.kind === "tree") {
        ctx.fillStyle = "#2f4a28";
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#5a4028";
        ctx.fillRect(c.x - 3, c.y, 6, c.r);
      } else if (c.kind === "bush") {
        ctx.fillStyle = "rgba(50, 80, 40, 0.55)";
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fill();
      } else if (c.kind === "rock") {
        ctx.fillStyle = "#6a6860";
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "#8a6a3a";
        ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
      }
    }

    // POI labels
    ctx.font = "600 14px 'IBM Plex Sans', sans-serif";
    ctx.textAlign = "center";
    for (const poi of map.pois) {
      ctx.fillStyle = "rgba(240,232,216,0.55)";
      ctx.fillText(poi.name, poi.x, poi.y - poi.radius - 8);
    }
  }

  private drawZone(world: RenderBundle): void {
    const { ctx } = this;
    const z = world.zone;
    ctx.save();
    ctx.fillStyle = "rgba(40, 60, 140, 0.28)";
    ctx.beginPath();
    ctx.rect(-200, -200, MAP_SIZE + 400, MAP_SIZE + 400);
    ctx.arc(z.blue.x, z.blue.y, z.blue.r, 0, Math.PI * 2, true);
    ctx.fill("evenodd");

    ctx.strokeStyle = "rgba(80, 120, 220, 0.85)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(z.blue.x, z.blue.y, z.blue.r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(240, 240, 240, 0.9)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.arc(z.white.x, z.white.y, z.white.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawRedZone(world: RenderBundle): void {
    const rz = world.redZone;
    if (!rz) return;
    const { ctx } = this;
    const alpha = rz.active ? 0.35 : 0.18;
    ctx.fillStyle = `rgba(180, 50, 40, ${alpha})`;
    ctx.beginPath();
    ctx.arc(rz.x, rz.y, rz.r, 0, Math.PI * 2);
    ctx.fill();
    if (!rz.active) {
      ctx.strokeStyle = "rgba(220, 80, 60, 0.7)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawCarePackages(world: RenderBundle): void {
    const { ctx } = this;
    for (const cp of world.carePackages) {
      const y = cp.landed ? cp.y : cp.y - cp.height;
      ctx.fillStyle = "#2a4a6a";
      ctx.fillRect(cp.x - 14, y - 10, 28, 20);
      ctx.fillStyle = "#d4a04a";
      ctx.fillRect(cp.x - 10, y - 14, 20, 6);
      if (!cp.landed) {
        ctx.strokeStyle = "rgba(240,232,216,0.4)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(cp.x, y);
        ctx.lineTo(cp.x, cp.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  private drawVehicles(world: RenderBundle): void {
    const { ctx } = this;
    for (const v of world.vehicles) {
      ctx.save();
      ctx.translate(v.x, v.y);
      ctx.rotate(v.angle);
      if (v.kind === "buggy") {
        ctx.fillStyle = "#8a5030";
        ctx.fillRect(-16, -10, 32, 20);
        ctx.fillStyle = "#222";
        ctx.beginPath();
        ctx.arc(-10, 10, 5, 0, Math.PI * 2);
        ctx.arc(10, 10, 5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "#4a6a7a";
        ctx.beginPath();
        ctx.ellipse(0, 0, 22, 12, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawPings(world: RenderBundle): void {
    const { ctx } = this;
    for (const ping of world.pings) {
      if (ping.teamId !== world.player.teamId) continue;
      const col =
        ping.kind === "enemy" ? "#c43a2a" : ping.kind === "loot" ? "#d4a04a" : "#6a9ecf";
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ping.x, ping.y, 18 + Math.sin(world.time * 4) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawLoot(map: IslandMap): void {
    const { ctx } = this;
    for (const pile of map.loot) {
      if (pile.items.length === 0) continue;
      if (pile.fromCrate) {
        // Death crate — readable square + skull mark (Surviv.io-style)
        ctx.fillStyle = "#3a3228";
        ctx.fillRect(pile.x - 8, pile.y - 8, 16, 16);
        ctx.strokeStyle = "#d4a04a";
        ctx.lineWidth = 2;
        ctx.strokeRect(pile.x - 8, pile.y - 8, 16, 16);
        ctx.fillStyle = "#d4a04a";
        ctx.font = "700 10px 'IBM Plex Sans'";
        ctx.textAlign = "center";
        ctx.fillText("☠", pile.x, pile.y + 3);
        continue;
      }
      ctx.fillStyle = "#f0e8d8";
      ctx.beginPath();
      ctx.arc(pile.x, pile.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  private drawFighters(world: RenderBundle): void {
    for (const f of world.fighters) {
      if (f.state === "dead") continue;
      if (f.state === "plane") continue;
      const isPlayer = f.id === world.player.id;
      const isAlly = !isPlayer && f.teamId === world.player.teamId;
      this.drawStick(f, isPlayer, isAlly, world.time);
    }
  }

  private drawStick(f: Fighter, isPlayer: boolean, isAlly: boolean, _time: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(f.x, f.y);

    if (f.state === "parachute") {
      ctx.fillStyle = "rgba(240,232,216,0.35)";
      ctx.beginPath();
      ctx.arc(0, -36, 22, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = "rgba(240,232,216,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-18, -30);
      ctx.lineTo(0, -8);
      ctx.lineTo(18, -30);
      ctx.stroke();
    }

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(0, 8, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(f.aim);

    // Surviv.io-style: enemies must read clearly on olive ground
    const flashing = (f.hitFlash ?? 0) > 0;
    const body = flashing
      ? "#fff4e0"
      : isPlayer
        ? "#f0e8d8"
        : isAlly
          ? "#a8d4a0"
          : "#8b3a2a";
    const accent = isPlayer ? "#d4a04a" : isAlly ? "#4a8f5a" : "#e07040";
    const moving = Math.hypot(f.vx, f.vy) > 5 || f.state === "parachute";
    const legSwing = f.state === "alive" && moving ? Math.sin(f.animPhase ?? 0) * 4 : 0;

    // legs
    ctx.strokeStyle = body;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-5 + legSwing, 12);
    ctx.moveTo(0, 0);
    ctx.lineTo(5 - legSwing, 12);
    ctx.stroke();

    if (f.state === "downed") {
      ctx.rotate(-Math.PI / 2.2);
    }

    // torso
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -14);
    ctx.stroke();

    // arms + weapon
    const gun = activeWeapon(f);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(10, -6);
    ctx.moveTo(0, -10);
    ctx.lineTo(-8, -4);
    ctx.stroke();

    if (gun && WEAPONS[gun.weaponId]?.category !== "melee") {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(8, -6);
      ctx.lineTo(22, -6);
      ctx.stroke();
    } else {
      // pan
      ctx.strokeStyle = "#888";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(8, -6);
      ctx.lineTo(16, -6);
      ctx.stroke();
      ctx.fillStyle = "#aaa";
      ctx.beginPath();
      ctx.arc(18, -6, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // head
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, -20, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // helmet hint
    if (f.helmet > 0) {
      ctx.strokeStyle = f.helmet >= 3 ? "#d4a04a" : f.helmet === 2 ? "#a0a0b0" : "#8a7a60";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -20, 7, Math.PI, 0);
      ctx.stroke();
    }
    // vest thickness by level
    if (f.vest > 0) {
      ctx.strokeStyle = f.vest >= 3 ? "#d4a04a" : f.vest === 2 ? "#a0a0b0" : "#8a7a60";
      ctx.lineWidth = 1 + f.vest;
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.lineTo(0, -12);
      ctx.stroke();
    }

    ctx.restore();

    // Surviv.io readability: ALWAYS show name + HP for anyone on screen
    ctx.save();
    ctx.font = "600 11px 'IBM Plex Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = isPlayer ? "#d4a04a" : isAlly ? "#8fd49a" : "#f0c8b0";
    ctx.fillText(f.name, f.x, f.y - 38);
    if (f.state === "alive" || f.state === "downed") {
      const hw = 32;
      const hpRatio = Math.max(0, Math.min(1, f.hp / 100));
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(f.x - hw / 2, f.y - 34, hw, 4);
      ctx.fillStyle =
        f.state === "downed"
          ? "#c45c2a"
          : hpRatio > 0.5
            ? "#3d9e5a"
            : hpRatio > 0.25
              ? "#d4a04a"
              : "#c45c2a";
      ctx.fillRect(f.x - hw / 2, f.y - 34, hw * hpRatio, 4);
      if (f.helmet > 0 || f.vest > 0) {
        ctx.fillStyle = "rgba(240,232,216,0.7)";
        ctx.font = "9px 'IBM Plex Sans'";
        ctx.fillText(`H${f.helmet} V${f.vest}`, f.x, f.y - 42);
      }
    }
    if (f.state === "downed") {
      ctx.fillStyle = "#c45c2a";
      ctx.font = "700 10px 'IBM Plex Sans'";
      ctx.fillText("DOWNED", f.x, f.y + 22);
    }
    if (f.healTimer > 0) {
      ctx.fillStyle = "#d4a04a";
      ctx.font = "10px 'IBM Plex Sans'";
      ctx.fillText("Healing…", f.x, f.y + 22);
    }
    if (f.reloadTimer > 0 && (isPlayer || isAlly)) {
      ctx.fillStyle = "#d4a04a";
      ctx.font = "10px 'IBM Plex Sans'";
      ctx.fillText("Reloading…", f.x, f.y + 22);
    }
    ctx.restore();
  }

  private drawBullets(world: RenderBundle): void {
    const { ctx } = this;
    ctx.strokeStyle = "#f5e6c8";
    ctx.lineWidth = 2;
    for (const b of world.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.015, b.y - b.vy * 0.015);
      ctx.stroke();
    }
  }

  private drawFrags(world: RenderBundle): void {
    const { ctx } = this;
    for (const g of world.frags) {
      ctx.fillStyle = "#3a3a30";
      ctx.beginPath();
      ctx.arc(g.x, g.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawSmokes(world: RenderBundle): void {
    const { ctx } = this;
    for (const s of world.smokes) {
      const alpha = Math.min(0.55, s.life / 4);
      ctx.fillStyle = `rgba(160,160,150,${alpha})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawPlane(world: RenderBundle): void {
    const { ctx } = this;
    const anyOnPlane = world.fighters.some((f) => f.state === "plane");
    if (!anyOnPlane && world.plane.pathT > 1.1) return;
    const p = world.plane;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = SAND;
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.lineTo(-18, -10);
    ctx.lineTo(-12, 0);
    ctx.lineTo(-18, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#6a6254";
    ctx.fillRect(-8, -14, 6, 28);
    ctx.restore();

    // path hint
    if (anyOnPlane) {
      ctx.strokeStyle = "rgba(240,232,216,0.25)";
      ctx.setLineDash([10, 10]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(world.planePath.x1, world.planePath.y1);
      ctx.lineTo(world.planePath.x2, world.planePath.y2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawMinimap(world: RenderBundle): void {
    const ctx = this.minimap;
    const size = 160;
    const scale = size / MAP_SIZE;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#2a3526";
    ctx.fillRect(0, 0, size, size);

    for (const poi of world.map.pois) {
      ctx.fillStyle = poi.tier === "hot" ? "#8a6a40" : "#4a5a40";
      ctx.beginPath();
      ctx.arc(poi.x * scale, poi.y * scale, Math.max(2, poi.radius * scale * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }

    const z = world.zone;
    ctx.strokeStyle = "rgba(80,120,220,0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(z.blue.x * scale, z.blue.y * scale, z.blue.r * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(z.white.x * scale, z.white.y * scale, z.white.r * scale, 0, Math.PI * 2);
    ctx.stroke();

    for (const f of world.fighters) {
      if (f.state === "dead" || f.state === "plane") continue;
      const isP = f.id === world.player.id;
      const isAlly = f.teamId === world.player.teamId && !isP;
      // Fog of war — no enemy blips on minimap (BR awareness)
      if (!isP && !isAlly) continue;
      ctx.fillStyle = isP ? "#d4a04a" : "#4a8f5a";
      ctx.fillRect(f.x * scale - 1.5, f.y * scale - 1.5, isP ? 4 : 3, isP ? 4 : 3);
    }

    for (const ping of world.pings) {
      if (ping.teamId !== world.player.teamId) continue;
      ctx.fillStyle = ping.kind === "enemy" ? "#c43a2a" : "#6a9ecf";
      ctx.fillRect(ping.x * scale - 2, ping.y * scale - 2, 4, 4);
    }

    if (world.redZone) {
      ctx.fillStyle = "rgba(180,50,40,0.5)";
      ctx.beginPath();
      ctx.arc(world.redZone.x * scale, world.redZone.y * scale, world.redZone.r * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
