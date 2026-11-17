# Ayutthaya Khon Adventure
3D multiplayer classroom game (Three.js client + Cloudflare Worker/Durable Object server).
- `client/` Vite + three.js, `worker/` server, `tools/` asset pipeline, `tests/` protocol test.
- Deploy: push to `main` (needs secret `CLOUDFLARE_API_TOKEN`; Pages source "GitHub Actions").
- Change the default teacher password after first login (teacher panel).

## Credits
Rendering ideas ported from Bruno Simon folio-2025 (MIT). KayKit Adventurers (CC0), Quaternius packs (CC0), Thai houses pack (CGTrader, royalty-free). See assets-src/ licenses.
