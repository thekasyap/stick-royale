import { MAP_SIZE, WEAPONS } from "@stick-royale/shared";
import { activeWeapon, type Fighter } from "./fighter";
import type { IslandMap } from "./mapgen";
import type { World } from "./world";

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

  draw(world: World, w: number, h: number): void {
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
    this.drawLoot(world.map);
    this.drawSmokes(world);
    this.drawFighters(world);
    this.drawBullets(world);
    this.drawFrags(world);
    this.drawPlane(world);

    ctx.restore();
    this.drawMinimap(world);
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

  private drawZone(world: World): void {
    const { ctx } = this;
    const z = world.zone;
    // darken outside blue
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

  private drawLoot(map: IslandMap): void {
    const { ctx } = this;
    for (const pile of map.loot) {
      if (pile.items.length === 0) continue;
      ctx.fillStyle = pile.fromCrate ? "#d4a04a" : "#f0e8d8";
      ctx.beginPath();
      ctx.arc(pile.x, pile.y, pile.fromCrate ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  private drawFighters(world: World): void {
    for (const f of world.fighters) {
      if (f.state === "dead") continue;
      if (f.state === "plane") continue;
      this.drawStick(f, f.id === world.player.id);
    }
  }

  private drawStick(f: Fighter, isPlayer: boolean): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(f.x, f.y);

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(0, 8, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(f.aim);

    const body = isPlayer ? "#f0e8d8" : "#c4b59a";
    const accent = isPlayer ? "#d4a04a" : "#6a6254";

    // legs
    ctx.strokeStyle = body;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-5, 12);
    ctx.moveTo(0, 0);
    ctx.lineTo(5, 12);
    ctx.stroke();

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

    ctx.restore();

    // name / hp
    ctx.save();
    ctx.font = "600 11px 'IBM Plex Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = isPlayer ? "#d4a04a" : "rgba(240,232,216,0.75)";
    ctx.fillText(f.name, f.x, f.y - 34);
    if (f.state === "alive") {
      const hw = 28;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(f.x - hw / 2, f.y - 30, hw, 3);
      ctx.fillStyle = f.hp > 40 ? "#3d9e5a" : "#c45c2a";
      ctx.fillRect(f.x - hw / 2, f.y - 30, hw * (f.hp / 100), 3);
    }
    if (f.healTimer > 0) {
      ctx.fillStyle = "#d4a04a";
      ctx.font = "10px 'IBM Plex Sans'";
      ctx.fillText("Healing…", f.x, f.y + 22);
    }
    ctx.restore();
  }

  private drawBullets(world: World): void {
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

  private drawFrags(world: World): void {
    const { ctx } = this;
    for (const g of world.frags) {
      ctx.fillStyle = "#3a3a30";
      ctx.beginPath();
      ctx.arc(g.x, g.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawSmokes(world: World): void {
    const { ctx } = this;
    for (const s of world.smokes) {
      const alpha = Math.min(0.55, s.life / 4);
      ctx.fillStyle = `rgba(160,160,150,${alpha})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawPlane(world: World): void {
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

  private drawMinimap(world: World): void {
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
      ctx.fillStyle = isP ? "#d4a04a" : "#c45c2a";
      ctx.fillRect(f.x * scale - 1.5, f.y * scale - 1.5, isP ? 4 : 3, isP ? 4 : 3);
    }
  }
}
