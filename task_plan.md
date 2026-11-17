# Task Plan: AYUTTHAYA KHON ADVENTURE (3D multiplayer edu game)

## Goal
Browser 3D third-person multiplayer treasure-hunt Khon quiz game for phones/PC, with teacher dashboard, server-authoritative scores.

## Next Step
Phase 3: worker/ (Cloudflare Worker + Durable Object room), net.js client; needs user's Cloudflare account/token. Preview artifact: https://claude.ai/artifact/4KYBysbEf5Yumh3S7G6dqj (rebuild: tools/build-artifact.sh). Pending polish: camera collision, bush tint, perf (1.1M tris).

## Current Phase
Phase 3

## Phases
### Phase 1: Research & Architecture
- Stack: Three.js + Vite (GitHub Pages) / Cloudflare Worker + Durable Object per room (SQLite) / WebSocket
- **Status:** complete (user approved: Three.js, Cloudflare, NEW repo, 45/room)

### Phase 2: Core Game (world, character, camera, controls)
- KayKit CC0 chibis + Quaternius CC0 props; Bruno-style terrain/grass/lighting
- **Status:** complete (awaiting user visual feedback)

### Phase 3: Multiplayer (rooms, sync, reconnect) — server in worker/
- **Status:** pending

### Phase 4: Treasure Hunt (chests, detector light+sound, interact)
- **Status:** pending

### Phase 5: Educational (quiz, scoring, question bank, leaderboard)
- **Status:** pending

### Phase 6: Teacher Dashboard (auth, start/pause/spawn/end, broadcast, map, questions)
- **Status:** pending

### Phase 7: Testing & Optimization (mobile emu, bot load test, deploy)
- **Status:** pending

## Decisions
| Decision | Rationale |
|----------|-----------|
| Three.js not Godot | Godot web iOS crash reports; JS smaller, testable here |
| Cloudflare DO | free tier 100k req/day, WS msgs 20:1; ~2 class periods/day free |
| Procedural low-poly Thai architecture | Sketchfab Thai models ~1M tris + CC BY-NC-ND |
| Teacher pw 310348 hashed PBKDF2 server-side | never in frontend |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| gltf prune dropped UVs | 1 | prune({keepAttributes:true}) |
| shader '#define' syntax error | 1 | WIND_GLSL needed trailing newline |
| river invisible | 1 | triangle winding faced down |
