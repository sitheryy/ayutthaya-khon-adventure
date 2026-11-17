# Findings
- Shell network: only GitHub (via add_repo read) + npm/pypi. kenney/quaternius/sketchfab blocked.
- CC0 sources on GitHub: KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 (chibi chars, 76 anims, palette texture 8x4 cells); trebeljahr/quaternius-showcase public/glb (CC0 packs per LICENSES.md).
- KayKit Rogue cells: (1,0) hair, (0,1) tunic, (1,1) trim, (3,2) boots, (7,1) pants?, (0,0) skin. Scale 0.87 => ~1.7m.
- gltf-transform: prune({keepAttributes:true}) else UVs dropped; dispose animation samplers then drop orphan accessors.
- Bruno folio-2025 (MIT): lambert-like: mix(base*light*1.2, base*shadowColor(#6d3fff), max(core,drop)); fog radial cyan->lavender; grass 1-tri blades camera-facing, color = terrain color, base in shadow (tipness).
- Bruno site preset day: light #ffd2c2, shadow #6d3fff, fog #00ffff/#9b89ff.
