# Progress
## 2026-11-17 session 1
- Phase 1 done; user approved Three.js + Cloudflare, NEW repo, 45/room.
- Phase 2: client/ Vite+three. world.js (procedural Thai architecture, 6 zones), terrain.js (baked height/grass mask texture, wind grass wrapping around player), style.js (Bruno Simon folio-2025 MIT lighting port: purple shadow color, warm light, radial gradient fog), models.js (KayKit Adventurers CC0 chibis recolored via palette cells + Quaternius CC0 props), controls.js, main.js.
- Assets: tools/prep-assets.mjs -> client/public/models (CC0). Sources in assets-src/ with licenses.
- Tests: tests/shot.py (playwright + /usr/bin/google-chrome swiftshader). eval actions use ',' not ';'.
- User requests: models from the net to match reference images; terrain/atmosphere like bruno-simon.com.
## v2 visuals (03:40)
- noise.js (tileable fbm + slab voronoi), foliage.js (Bruno-style leaf-card clusters, instanced), terrain.js: Bruno grass (1 tri camera-facing, noise wind), ground detail+slabs, water shader (depth tint, foam, glints). Bloom (desktop). Fog 160-620, sun disk.
- Fixed: river water was backface (winding), khon stage faced west (now +x), WIND_GLSL missing trailing newline broke shaders.
- Artifact v2 published (version 1794861638-30bb).
- TODO: Thai models need user download (sandbox can't reach sketchfab/cgtrader); camera collision; Phase 3.
## v3 (04:00) artifact 1794862845-17aa
- User's Thai house pack (CGTrader RF) -> tools/obj2glb.mjs -> thai_house1-4, thai_sala, thai_jar, thai_canoe; placed in market, spawn village, salas.
- Evening/golden hour: SUN_DIR (-0.72,0.32,-0.62), light #ffcf98, shadow #8a7ae0; sky shader with noise clouds + sun; torches (effects.js) replace lanterns; flying leaves, wind lines, tilt-shift DOF passes; water fresnel+sun spec; foliage denser (120 cards), grass 0.8 tall, wind 0.85.
- User asked: Buddha model from Roblox (pending: Roblox asset licensing - only if user-made).
## v4 (04:25) artifact 1794864293-7b50
- life.js: 28 path walkers, crowds (market/spawn/khon audience/wat), animals (Quaternius CC0 Bull=buffalo, Cow, Deer, Horse, ShibaInu), props (Cart, MarketStand, Barrel, Crate, Bags, Hay, Bench, Fence, Bamboo).
- Rice paddies (RICE rects, flattened, mud ground, instanced blades, dikes, paddy water).
- Surface textures in getMat: brick/plaster/tile/wood (world-space shader). Thai models DoubleSide (see-through fix). City gate blocked by altar -> moved.
- Palette brightened to match reference (light #fff0dc x1.06, shadow #9c90ec, sun higher SW, bloom thr 1.0).
## v5 (04:33) artifact 1794864751-d3d1 — evening palette restored (user prefers evening), thai_sala collides only at 4 posts, benches moved to plaza facing well (+PI: model front is -z).
## v6 (04:55) artifact 1794866059-09ae
- Layout rules (world.js): pathClear/offPath/nearestPath; houses face nearest road (front=+z stairs), jars beside houses, rice rects auto-shrink away from roads, stalls/props/crowds/torches/rocks/palms/NPCs never on roads. Audit script /tmp/audit.py -> 0 intrusions.
- Solid square colliders for prang/chedi/Buddha/garuda bases; PLATFORMS (vihara floor 0.8 m, jumpable; ledges >0.55 block).
- Compact map: HALF 140, SPAWN (0,20), zones moved closer, river riverX=124+5sin(z/24), WALL_Z 125, paths generated from zone entrances.
- Full city wall (cityWalls): W/N/S straight, E on far river bank; corner forts, towers every 50 m, water-gate towers. Minimap draws wall.
- shot.py screenshot timeout 180 s (scene heavy for swiftshader).
## v7 (05:30) artifact 1794868229-0560 (offline single-player preview)
- HUD: only score + chests. treasure.js: 12 chests (seeded), wand on KayKit handslotr, detector blink/beep by distance + arrow, chest glow/beam near, quiz modal; wrong = no points + chest relocates. public/questions.json (12 sample Khon Qs, teacher replaceable).
- Welcome arches with Thai destination signs at each road start (world.js welcomeArches). NPC 16 walkers, trees 380.
- cycle.js evening<->night (150s each, 20s fades, wall-clock synced): moonlight, stars, moon, fireflies, brighter torch pools, bloom up at night. ?night / ?evening to force.
- Multiplayer: worker/ (Cloudflare Worker + DO 'Room', single room 'main'): teacher PBKDF2 pw (seed 310348 via wrangler var), token login, phases lobby/playing/paused/ended, start with client spot pool, per-student chests, server-side questions/answers/scores, summon, broadcast, leaderboard, roster, clear, reconnect via sid or name+no+class. tests/server-test.mjs ALL PASS. Browser e2e (teacher controls student) PASS against wrangler dev.
- client: net.js (WS, reconnect, other players w/ interpolation), teacher.js panel (start/pause/resume/summon/end/fly/broadcast/roster/leaderboard/clear/password), app.js (no room code; teacher password form).
- Artifact CSP blocks WebSocket -> multiplayer only after deploy (GitHub Pages + Cloudflare). Pending: user's new repo + Cloudflare token.
