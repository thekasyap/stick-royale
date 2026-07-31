import {
  LOBBY_SIZE,
  TICK_RATE,
  type BotDifficulty,
  type GameMode,
  type PartySize,
} from "@stick-royale/shared";
import {
  MatchSim,
  inputFromSnapshot,
  type InputSnapshot,
  type MatchConfig,
} from "@stick-royale/sim";

type Session = {
  id: string;
  nickname: string;
  input: InputSnapshot;
};

/**
 * Authoritative match room — runs shared MatchSim at 20 Hz.
 */
export class MatchRoom implements DurableObject {
  private sessions = new Map<WebSocket, Session>();
  private sim: MatchSim | null = null;
  private tick = 0;
  private running = false;
  private config: MatchConfig = {
    nickname: "Guest",
    mode: "classic",
    partySize: "solo",
    difficulty: "easy",
  };

  constructor(private state: DurableObjectState, _env: unknown) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      const id = crypto.randomUUID();
      this.sessions.set(server, {
        id,
        nickname: "Guest",
        input: emptyInput(),
      });

      if (!this.sim) {
        this.sim = new MatchSim(this.config, Date.now());
      }

      server.send(
        JSON.stringify({
          type: "welcome",
          playerId: id,
          seed: this.sim.seed,
          tick: this.tick,
        }),
      );

      if (!this.running) {
        this.running = true;
        await this.state.storage.setAlarm(Date.now() + 1000 / TICK_RATE);
      }
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname.endsWith("/status")) {
      return Response.json({
        players: this.sessions.size,
        capacity: LOBBY_SIZE,
        tick: this.tick,
        running: this.running,
        alive: this.sim?.aliveCount() ?? 0,
      });
    }

    return new Response("MatchRoom DO", { status: 200 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || !this.sim) return;
    try {
      const msg = JSON.parse(message) as {
        type?: string;
        nickname?: string;
        t?: number;
        mode?: GameMode;
        partySize?: PartySize;
        difficulty?: BotDifficulty;
        moveX?: number;
        moveY?: number;
        aim?: number;
        fire?: boolean;
        ads?: boolean;
        reload?: boolean;
        interact?: boolean;
        slot?: number;
        keys?: string[];
        justPressed?: string[];
        mouseX?: number;
        mouseY?: number;
        mouseDown?: boolean;
        mouseRight?: boolean;
      };
      const session = this.sessions.get(ws);
      if (!session) return;

      if (msg.type === "join") {
        if (msg.nickname) session.nickname = msg.nickname.slice(0, 16);
        if (msg.mode) this.config.mode = msg.mode;
        if (msg.partySize) this.config.partySize = msg.partySize;
        if (msg.difficulty) this.config.difficulty = msg.difficulty;
        return;
      }

      if (msg.type === "ping" && typeof msg.t === "number") {
        ws.send(JSON.stringify({ type: "pong", t: msg.t }));
        return;
      }

      if (msg.type === "input") {
        session.input = {
          keys: msg.keys ?? [],
          justPressed: msg.justPressed ?? [],
          mouseX: msg.mouseX ?? 0,
          mouseY: msg.mouseY ?? 0,
          mouseDown: Boolean(msg.mouseDown),
          mouseRight: Boolean(msg.mouseRight),
          touchMoveX: msg.moveX ?? 0,
          touchMoveY: msg.moveY ?? 0,
        };
      }
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "bad_json" }));
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.sessions.delete(ws);
    if (this.sessions.size === 0) this.running = false;
  }

  async alarm(): Promise<void> {
    if (!this.sim || !this.running) return;
    this.tick += 1;
    const dt = 1 / TICK_RATE;

    const human = [...this.sessions.values()][0];
    if (human) {
      this.sim.tick(dt, inputFromSnapshot(human.input), 1280, 720);
    } else {
      this.sim.tick(dt, inputFromSnapshot(emptyInput()), 1280, 720);
    }

    const bundle = this.sim.exportRenderBundle();
    const payload = JSON.stringify({
      type: "snapshot",
      tick: this.tick,
      alive: bundle.fighters.filter((f) => f.state !== "dead").length,
      zone: bundle.zone,
      killFeed: bundle.killFeed,
      matchOver: bundle.matchOver,
      result: bundle.result,
      you: bundle.player,
      entities: bundle.fighters.slice(0, 32).map((f) => ({
        id: f.id,
        kind: f.isBot ? "bot" : "player",
        x: Math.round(f.x),
        y: Math.round(f.y),
        hp: Math.round(f.hp),
        state: f.state,
        label: f.name,
      })),
    });

    for (const [ws, session] of this.sessions) {
      try {
        ws.send(payload);
        if (bundle.matchOver && bundle.result) {
          ws.send(
            JSON.stringify({
              type: "match_end",
              ...bundle.result,
            }),
          );
        }
      } catch {
        this.sessions.delete(ws);
      }
      void session;
    }

    if (this.sessions.size > 0 && !bundle.matchOver) {
      await this.state.storage.setAlarm(Date.now() + 1000 / TICK_RATE);
    } else {
      this.running = false;
    }
  }
}

function emptyInput(): InputSnapshot {
  return {
    keys: [],
    justPressed: [],
    mouseX: 640,
    mouseY: 360,
    mouseDown: false,
    mouseRight: false,
    touchMoveX: 0,
    touchMoveY: 0,
  };
}
