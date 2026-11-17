#!/bin/sh
# Build a single-host preview (artifact host can't serve .glb): models inlined as base64 into the JS bundle.
set -e
cd "$(dirname "$0")/.."
node -e "
const fs=require('fs'),d='client/public/models',o={};
for(const f of fs.readdirSync(d)) if(f.endsWith('.glb')) o[f.slice(0,-4)]=fs.readFileSync(d+'/'+f).toString('base64');
fs.writeFileSync('client/src/models-inline.js','export default '+JSON.stringify(o)+';\n');"
cd client && VITE_INLINE_MODELS=1 npx vite build --outDir ../dist-artifact --emptyOutDir
rm -f ../dist-artifact/models/*.glb
echo 'export default {};' > src/models-inline.js
