import sys, asyncio
from playwright.async_api import async_playwright
url = sys.argv[1]; out = sys.argv[2]; mobile = len(sys.argv) > 3 and sys.argv[3] == 'mobile'
actions = sys.argv[4] if len(sys.argv) > 4 else ''
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width':844,'height':390} if mobile else {'width':1280,'height':720}, has_touch=mobile, is_mobile=mobile, device_scale_factor=1)
        pg = await ctx.new_page()
        logs=[]
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
        pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        await pg.goto(url); await pg.wait_for_function("document.getElementById('hud') && !document.getElementById('hud').classList.contains('hidden')", timeout=90000); await pg.wait_for_timeout(2500)
        for a in actions.split(';'):
            if not a: continue
            if a.startswith('eval:'): await pg.evaluate(a[5:])
            elif a.startswith('key:'):
                k, ms = a[4:].split(':'); await pg.keyboard.down(k); await pg.wait_for_timeout(int(ms)); await pg.keyboard.up(k)
            elif a.startswith('wait:'): await pg.wait_for_timeout(int(a[5:]))
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path=out, timeout=180000)
        print('\n'.join([l for l in logs if 'WebGLProgram' in l or 'ERROR' in l][:6] or logs[-15:]))
        await b.close()
asyncio.run(main())
