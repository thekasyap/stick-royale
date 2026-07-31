import type { BotDifficulty, GameMode, PartySize } from "@stick-royale/shared";

const HOST = import.meta.env.VITE_PARTY_HOST as string | undefined;

export type LobbyMember = { id: string; name: string; ready: boolean };

export type LobbySnapshot = {
  partyCode: string;
  members: LobbyMember[];
  matching: boolean;
  matchId: string | null;
  humans: number;
  capacity: number;
};

export function partyHostAvailable(): boolean {
  return Boolean(HOST && HOST.length > 0);
}

export async function createParty(host: string): Promise<{ code: string; matchId: string } | null> {
  if (!HOST) return null;
  try {
    const res = await fetch(`https://${HOST}/api/party`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create", host }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { code: string; matchId: string };
  } catch {
    return null;
  }
}

export async function joinParty(code: string): Promise<{ code: string; matchId: string } | null> {
  if (!HOST) return null;
  try {
    const res = await fetch(`https://${HOST}/api/party`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "join", code }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { code: string; matchId: string };
  } catch {
    return null;
  }
}

export function connectLobbyWs(
  partyCode: string,
  nickname: string,
  config: { mode: GameMode; partySize: PartySize; difficulty: BotDifficulty },
  onState: (s: LobbySnapshot) => void,
): WebSocket | null {
  if (!HOST) return null;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${HOST}/ws/lobby`);
  ws.onopen = () => {
    ws.send(
      JSON.stringify({
        type: "lobby_join",
        nickname,
        partyCode: partyCode || undefined,
        mode: config.mode,
        partySize: config.partySize,
        difficulty: config.difficulty,
      }),
    );
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(String(ev.data)) as { type: string } & LobbySnapshot;
      if (msg.type === "lobby_state") onState(msg);
    } catch {
      /* ignore */
    }
  };
  return ws;
}
