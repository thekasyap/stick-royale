# Build Stick Royale — full BGMI-inspired browser battle royale

Build **Stick Royale** end-to-end in this repository. Mythic quality, playable in browser, deployable to Vercel (+ Cloudflare Durable Objects for multiplayer).

## Product
- Top-down 2D stick-figure battle royale (Stick War *visuals*, NOT Stick War RTS). Camera/feel like surviv.io + BGMI systems.
- Inspired by BGMI/PUBG Classic — original names only (no official trademarks/assets). POIs: Pine Town, School Yard, Dockside, Farm, Ruins, etc.
- Lobby size: **48 players**
- Modes: **Classic** Solo/Duo/Squad with **bot-fill**; **VS AI** Easy/Normal/Hard
- Guest nicknames (localStorage UUID)

## Stack / layout
```
apps/web/          Vite + TypeScript + Canvas 2D (Vercel)
apps/server/       Cloudflare Worker + Durable Objects (authoritative 20Hz)
packages/shared/   protocol, weapons, zone tables, types
```
Use npm or pnpm workspaces. Root scripts: `dev`, `build`. Include `vercel.json`, `wrangler.toml`, excellent README.

**Critical:** Implement **Offline Solo+Bots** first (same sim client-side or Web Worker) so the game is playable without Cloudflare. Then wire DO multiplayer.

## Ship this playable loop
1. Lobby: brand-first **STICK ROYALE** title, nickname, mode, difficulty, Start
2. Plane path + parachute drop
3. Hand-authored island map with buildings/cover/loot by hot/mid/quiet tiers
4. Inventory: 2 guns + melee + throwables + heals + ammo; armor/helmet Lv1–3; backpack tiers
5. Weapons (original names): AR, SMG, SG, DMR/SR, Pistol, Pan; ammo 5.56/7.62/9mm/12g/.45
6. Attachments lite (mag/grip/muzzle/scope) as stat mods
7. Blue zone 6–7 phases + white circle + damage ramp
8. Shoot, loot death crates, kill feed, alive count, minimap, Chicken Dinner / placement results
9. Bot FSM Drop→Loot→Rotate→Engage→Heal→Flee→Endgame with Easy/Normal/Hard profiles (aim error, reaction delay, loot priority, zone behavior like BGMI fillers)
10. Classic bot-fill to 48; VS AI = party vs all bots

## Then (if time)
- MatchRoom DO + Lobby DO matchmaking + party codes
- Squad knockdown/revive/markers
- Vehicles (buggy+boat), care packages, red zone
- Audio, stick anims, mobile touch controls

## Art
Muted greens/tans; expressive fonts (not Inter/Roboto/Arial); NO purple-gradient AI cliché; BGMI-like HUD.

## Done when
- `npm install && npm run dev` works
- Offline Classic Solo Easy is fun within ~30s of opening the page
- README documents run + Vercel/Cloudflare deploy
- Multiple clear commits on the PR branch
