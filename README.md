# Stick Royale

Lightweight **stick-figure battle royale** for the browser — BGMI/PUBG-inspired systems, original names only, muted tan/olive art.

**Play Offline Solo + Bots first** (no server required). Cloudflare Durable Objects are scaffolded for future online matches.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

1. Enter a nickname  
2. Pick **Classic Solo** + **Easy**  
3. **DROP IN** → jump from the plane → loot → fight bots → survive the blue zone → Chicken Dinner  

### Controls

| Action | Key |
|--------|-----|
| Move | WASD |
| Aim | Mouse |
| Shoot | LMB |
| ADS | RMB / Shift |
| Reload | R |
| Loot / Interact | F or E |
| Jump (plane/chute) | Space / F |
| Weapon slots | 1 Primary · 2 Sidearm · 3 Melee · 4 Throwables |
| Bandage | Q |
| Energy / Painkiller | Z / X |

## Monorepo

```
apps/web/          Vite + TypeScript + Canvas 2D (offline sim)
apps/server/       Cloudflare Worker + MatchRoom / Lobby DOs (scaffold)
packages/shared/   Weapons, zone phases, POIs, protocol types
```

| Script | What |
|--------|------|
| `npm run dev` | Web client |
| `npm run build` | Production web build |
| `npm run dev:server` | Wrangler DO scaffold |
| `npm run typecheck` | TS check |

## Deploy

**Web (Vercel):** connect the repo; `vercel.json` builds `apps/web` and publishes `apps/web/dist`.

**Server (Cloudflare):**

```bash
cd apps/server
npx wrangler deploy
```

Online authoritative gameplay is not required for Offline Solo.

## Design notes

- Lobby size **48** with bot fill  
- Bot difficulties: Easy / Normal / Hard (aim error, reaction, loot priority, zone rotate)  
- Weapons: Sparkwave, Ironclad, Buzzsaw, Rattler, Thumper, Longreach, Skyline, Sidekick, Pan  
- POIs: Pine Town, School Yard, Dockside, Farm, Ruins, and more  
- Guest UUID stored in `localStorage`

## License

MIT — original work; no official BGMI/PUBG assets or trademarks.
