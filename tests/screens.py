import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium' if False else None)
        for name, vp, scheme in [('desk', (1280, 900), 'light'), ('desk_dark', (1280, 900), 'dark'), ('phone', (390, 844), 'light'), ('fold', (720, 900), 'light')]:
            ctx = await b.new_context(viewport={'width': vp[0], 'height': vp[1]}, color_scheme=scheme, locale='ja-JP')
            page = await ctx.new_page()
            errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            await page.route('**/accounts.google.com/**', lambda r: r.abort())
            for route in ['home', 'sales', 'analysis', 'profit', 'cash', 'maint', 'incentive']:
                await page.goto(f'http://localhost:8765/?demo=1#/{route}')
                await page.wait_for_selector('.main')
                await page.wait_for_timeout(500)
                await page.screenshot(path=f'{OUT}/{name}_{route}.png', full_page=True)
            print(name, 'errors:', errs)
            await ctx.close()
        await b.close()
asyncio.run(main())
