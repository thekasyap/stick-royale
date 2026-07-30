import { LOBBY_SIZE, TICK_RATE } from "@stick-royale/shared";

/**
 * Authoritative match room (scaffold).
 * Offline Solo+Bots runs fully client-side; this DO will host online matches.
 */
export class MatchRoom implements DurableObject {
  private sessions = new Map<WebSocket, { id: string; nickname: string }>();
  private tick = 0;
  private running = false;

  constructor(private state: DurableObjectState, _env: unknown) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      const id = crypto.randomUUID();
      this.sessions.set(server, { id, nickname: "Guest" });
      server.send(JSON.stringify({
        type: "welcome",
        playerId: id,
        seed: Date.now(),
        tick: this.tick,
        note: "Online authoritative sim coming soon — play Offline Solo+Bots in the web client.",
      }));
      if (!this.running) {
        this.running = true;
        this.state.storage.setAlarm(Date.now() + 1000 / TICK_RATE);
      }
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname.endsWith("/status")) {
      return Response.json({
        players: this.sessions.size,
        capacity: LOBBY_SIZE,
        tick: this.tick,
        running: this.running,
      });
    }

    return new Response("MatchRoom DO", { status: 200 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    try {
      const msg = JSON.parse(message) as { type?: string; nickname?: string; t?: number };
      const session = this.sessions.get(ws);
      if (!session) return;
      if (msg.type === "join" && msg.nickname) {
        session.nickname = msg.nickname.slice(0, 16);
      }
      if (msg.type === "ping" && typeof msg.t === "number") {
        ws.send(JSON.stringify({ type: "pong", t: msg.t }));
      }
      // input messages accepted but not yet simulated server-side
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "bad_json" }));
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.sessions.delete(ws);
  }

  async alarm(): Promise<void> {
    this.tick += 1;
    // heartbeat scaffold — full 20Hz snapshot loop lands with online multiplayer
    if (this.sessions.size > 0) {
      this.state.storage.setAlarm(Date.now() + 1000 / TICK_RATE);
    } else {
      this.running = false;
    }
  }
}
