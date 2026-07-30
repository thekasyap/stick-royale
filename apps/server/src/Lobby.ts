/** Simple lobby / party-code Durable Object scaffold */
export class Lobby implements DurableObject {
  private parties = new Map<string, { host: string; created: number }>();

  constructor(private state: DurableObjectState, _env: unknown) {
    void this.state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as { action?: string; code?: string; host?: string };
      if (body.action === "create") {
        const code = randomCode();
        this.parties.set(code, { host: body.host || "host", created: Date.now() });
        return Response.json({ code, matchId: `party_${code}` });
      }
      if (body.action === "join" && body.code) {
        const party = this.parties.get(body.code.toUpperCase());
        if (!party) return Response.json({ error: "not_found" }, { status: 404 });
        return Response.json({ code: body.code.toUpperCase(), matchId: `party_${body.code.toUpperCase()}` });
      }
    }
    return Response.json({ parties: this.parties.size, note: "Lobby scaffold — offline play does not need this." });
  }
}

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
