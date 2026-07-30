import { Lobby } from "./Lobby";
import { MatchRoom } from "./MatchRoom";

export { MatchRoom, Lobby };

export interface Env {
  MATCH_ROOM: DurableObjectNamespace;
  LOBBY: DurableObjectNamespace;
}

/** Cloudflare Worker entry — routes WS matchmaking to Durable Objects */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "stick-royale", mode: "scaffold" });
    }

    if (url.pathname === "/api/party" && request.method === "POST") {
      const id = env.LOBBY.idFromName("global");
      const stub = env.LOBBY.get(id);
      return stub.fetch(request);
    }

    if (url.pathname.startsWith("/ws/match/")) {
      const matchId = url.pathname.split("/").pop() || "default";
      const id = env.MATCH_ROOM.idFromName(matchId);
      const stub = env.MATCH_ROOM.get(id);
      return stub.fetch(request);
    }

    return new Response("Stick Royale server — use /health, /api/party, /ws/match/:id", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  },
};
