# Stick Royale

Lightweight **stick-figure battle royale** for the browser — BGMI/PUBG-inspired systems, original names only, muted tan/olive art. **Under 3 MB** client payload — no Unity, no downloads.

**Play Offline instantly** (48-player bot-fill). Cloudflare Durable Objects power online party codes and future authoritative matches.

## Quick start

```bash
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

1. Enter a nickname  
2. Pick **Classic** or **VS AI**, **Solo / Duo / Squad**, and **Easy / Normal / Hard**  
3. **DROP IN** → jump from the plane → loot → fight bots → survive the blue zone → **Chicken Dinner**

## Controls

| Action | Key |
|--------|-----|
| Move | WASD (virtual stick on mobile) |
| Aim | Mouse / touch drag (right side) |
| Shoot | LMB / touch fire |
| ADS | RMB / Shift |
| Reload | R |
| Loot / Interact | F or E |
| Jump / Deploy chute | Space / F |
| Map ping | G (Shift+G = enemy) |
| Revive teammate | Hold H (Duo/Squad) |
| Vehicle enter/exit | V |
| Weapon slots | 1 Primary · 2 Sidearm · 3 Melee · 4 Throwables |
| Heals | Q bandage · C medkit · Z energy · X painkiller |

## Features

- **48-player lobbies** with bot-fill (Classic) or all-bot VS AI practice  
- **Plane drop** + parachute glide toward cursor  
- **Hand-authored island** with POIs: Pine Town, School Yard, Dockside, Farm, Ruins, Lumber Mill  
- **Loot tiers** (hot / mid / quiet), death crates, **care packages**, **red zone**  
- **Blue zone** 7 phases with white circle preview  
- **Weapons** (original names): Sparkwave, Ironclad, Buzzsaw, Rattler, Thumper, Longreach, Skyline, Sidekick, Pan  
- **Armor / helmet / backpack** Lv1–3, attachments, throwables  
- **Duo/Squad**: knockdown, crawl, revive, team pings, ally markers  
- **Vehicles**: buggy + boat  
- **Bot AI** Easy / Normal / Hard (aim, reaction, loot, zone rotate)  
- **Web Audio** synth SFX — no asset downloads  
- **Chicken Dinner** results screen with K/D, damage, survival time  

## Monorepo

```
apps/web/          Vite + TypeScript + Canvas 2D (offline sim + UI)
apps/server/       Cloudflare Worker + Lobby / MatchRoom Durable Objects
packages/shared/   Weapons, zone phases, POIs, protocol types
```

| Script | What |
|--------|------|
| `npm run dev` | Web client |
| `npm run build` | Production web build |
| `npm run dev:server` | Wrangler local DO server |
| `npm run typecheck` | TypeScript check |

## Deploy

### Web (Vercel)

Connect the repo. `vercel.json` builds `apps/web` and publishes `apps/web/dist`.

Optional env:

```bash
VITE_PARTY_HOST=your-worker.your-subdomain.workers.dev
```

### Server (Cloudflare)

```bash
cd apps/server
npx wrangler deploy
```

Routes:

- `GET /health` — status  
- `POST /api/party` — create/join party code  
- `WS /ws/lobby` — lobby matchmaking  
- `WS /ws/match/:id` — match room (scaffold; offline sim is fully playable today)

## Design notes

- Guest UUID in `localStorage`  
- Offline sim runs entirely client-side — no server required to play  
- Online DO multiplayer shares protocol types in `packages/shared`  
- Target: mid laptop **50+ FPS** with 48 entities  

## License

MIT — original work; no official BGMI/PUBG assets or trademarks.
