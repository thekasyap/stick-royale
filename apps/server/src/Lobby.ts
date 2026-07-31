import { LOBBY_SIZE, MATCHMAKE_WINDOW_MS, partyCapacity, TICK_RATE } from "@stick-royale/shared";
import type { PartySize } from "@stick-royale/shared";

type Member = {
  id: string;
  name: string;
  ready: boolean;
  ws: WebSocket;
};

type Party = {
  code: string;
  hostId: string;
  mode: string;
  partySize: PartySize;
  difficulty: string;
  members: Map<string, Member>;
  matching: boolean;
  matchStart: number | null;
};

/** Lobby Durable Object — party codes + short matchmaking window */
export class Lobby implements DurableObject {
  private parties = new Map<string, Party>();
  private memberParty = new Map<string, string>();

  constructor(private state: DurableObjectState, _env: unknown) {
    void this.state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      const id = crypto.randomUUID();
      server.serializeAttachment({ id });
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as {
        action?: string;
        code?: string;
        host?: string;
      };
      if (body.action === "create") {
        const code = randomCode();
        const party: Party = {
          code,
          hostId: body.host || "http",
          mode: "classic",
          partySize: "solo",
          difficulty: "easy",
          members: new Map(),
          matching: false,
          matchStart: null,
        };
        this.parties.set(code, party);
        return Response.json({ code, matchId: `match_${code}` });
      }
      if (body.action === "join" && body.code) {
        const code = body.code.toUpperCase();
        const party = this.parties.get(code);
        if (!party) return Response.json({ error: "not_found" }, { status: 404 });
        return Response.json({ code, matchId: `match_${code}` });
      }
    }

    if (url.pathname.endsWith("/status")) {
      return Response.json({ parties: this.parties.size });
    }

    return Response.json({ ok: true, parties: this.parties.size });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    const attachment = ws.deserializeAttachment() as { id: string } | null;
    const memberId = attachment?.id ?? crypto.randomUUID();

    try {
      const msg = JSON.parse(message) as {
        type?: string;
        nickname?: string;
        partyCode?: string;
        mode?: string;
        partySize?: PartySize;
        difficulty?: string;
        ready?: boolean;
      };

      if (msg.type === "lobby_join") {
        const name = (msg.nickname || "Guest").slice(0, 16);
        let code = msg.partyCode?.toUpperCase() || "";
        if (!code || !this.parties.has(code)) {
          code = randomCode();
          this.parties.set(code, {
            code,
            hostId: memberId,
            mode: msg.mode || "classic",
            partySize: (msg.partySize as PartySize) || "solo",
            difficulty: msg.difficulty || "easy",
            members: new Map(),
            matching: false,
            matchStart: null,
          });
        }
        const party = this.parties.get(code)!;
        const cap = partyCapacity(party.partySize);
        if (party.members.size >= cap) {
          ws.send(JSON.stringify({ type: "error", message: "party_full" }));
          return;
        }
        party.members.set(memberId, { id: memberId, name, ready: false, ws });
        this.memberParty.set(memberId, code);
        ws.serializeAttachment({ id: memberId });
        this.broadcastParty(party);
        return;
      }

      const code = this.memberParty.get(memberId);
      if (!code) return;
      const party = this.parties.get(code);
      if (!party) return;
      const member = party.members.get(memberId);
      if (!member) return;

      if (msg.type === "lobby_ready") {
        member.ready = Boolean(msg.ready);
        this.broadcastParty(party);
        if (party.members.size >= 1 && [...party.members.values()].every((m) => m.ready)) {
          party.matching = true;
          party.matchStart = Date.now() + MATCHMAKE_WINDOW_MS;
          this.broadcastParty(party);
        }
      }

      if (msg.type === "lobby_start" && memberId === party.hostId) {
        party.matching = true;
        party.matchStart = Date.now() + 2000;
        this.broadcastParty(party);
      }
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "bad_json" }));
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as { id: string } | null;
    if (!attachment) return;
    const code = this.memberParty.get(attachment.id);
    if (!code) return;
    const party = this.parties.get(code);
    if (!party) return;
    party.members.delete(attachment.id);
    this.memberParty.delete(attachment.id);
    if (party.members.size === 0) this.parties.delete(code);
    else this.broadcastParty(party);
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    for (const party of this.parties.values()) {
      if (party.matching && party.matchStart && now >= party.matchStart) {
        const matchId = `match_${party.code}`;
        for (const m of party.members.values()) {
          m.ws.send(
            JSON.stringify({
              type: "match_ready",
              matchId,
              wsPath: `/ws/match/${matchId}`,
            }),
          );
        }
        party.matching = false;
        party.matchStart = null;
      }
    }
    if (this.parties.size > 0) {
      await this.state.storage.setAlarm(now + 1000 / TICK_RATE);
    }
  }

  private broadcastParty(party: Party): void {
    const payload = JSON.stringify({
      type: "lobby_state",
      partyCode: party.code,
      members: [...party.members.values()].map((m) => ({
        id: m.id,
        name: m.name,
        ready: m.ready,
      })),
      matching: party.matching,
      matchId: party.matching ? `match_${party.code}` : null,
      humans: party.members.size,
      capacity: LOBBY_SIZE,
    });
    for (const m of party.members.values()) {
      try {
        m.ws.send(payload);
      } catch {
        /* closed */
      }
    }
    if (party.matching && party.matchStart) {
      void this.state.storage.setAlarm(party.matchStart);
    }
  }
}

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
