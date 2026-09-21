# 練習用の1ファイル版(ダブルクリックで開ける)を作る。架空データを埋め込み。
import re, json, sys
order = ['config','engine','ui','api','auth','screens/sales','screens/analysis','screens/profit','screens/cash','screens/maint','screens/incentive','screens/home','main']
name = lambda m: 'M_' + m.replace('/', '_')
out = []
for m in order:
    src = open(f'js/{m}.js', encoding='utf-8').read()
    exports = re.findall(r'^export (?:async )?(?:const|let|function|class) (\w+)', src, re.M)
    src = re.sub(r'^export (async )?(const|let|function|class) ', lambda x: (x.group(1) or '') + x.group(2) + ' ', src, flags=re.M)
    def imp(mm):
        names, path = mm.group(1), mm.group(2)
        target = name(re.sub(r'^(\./|\.\./|\./screens/)', '', path[:-3]).replace('screens/', 'screens/') if False else path)
        mod = path.replace('../', '').replace('./', '')[:-3]
        if mod in ('sales','analysis','profit','cash','maint','incentive','home'): mod = 'screens/' + mod
        t = name(mod)
        if names.startswith('* as'): return f'const {names[5:]} = {t};'
        return f'const {names} = {t};'
    src = re.sub(r"^import (.+?) from '([^']+)';?$", imp, src, flags=re.M)
    out.append(f"const {name(m)} = (() => {{\n{src}\nreturn {{ {', '.join(exports)} }};\n}})();")
js = '\n'.join(out)
js = js.replace("const DEMO = new URLSearchParams(location.search).has('demo');", "const DEMO = true;")
js = re.sub(r"if \('serviceWorker' in navigator\).*\n", "", js)
js = re.sub(r"async function loadDemo\(\) \{.*?\n\}\n", "async function loadDemo() { return window.__SAMPLE; }\n", js, flags=re.S)
css = open('css/app.css', encoding='utf-8').read()
sample = open('data/sample.json', encoding='utf-8').read()
html = f'''<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>ケイトホーム 経営ダッシュボード(練習用データ)</title><style>{css}</style></head>
<body><div id="root"></div>
<script>window.__SAMPLE = {sample};</script>
<script>
{js}
</script></body></html>'''
open(sys.argv[1], 'w', encoding='utf-8').write(html)
print(len(html))
