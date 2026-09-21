# 練習用の架空データを作る(実データは一切使わない)
import json, random, datetime
random.seed(7)
routes = [('訪問','訪販',30),('足場','訪販',8),('ヌリカエ','ポータル',22),('窓口','ポータル',8),('リショップ','ポータル',5),('チラシ','自社',9),('紹介','自社',9),('HP','自社',5),('YouTube','自社',3),('追加',None,4),('MIRAI',None,2)]
people = ['田中','鈴木']
custs = []; leads = []
def rnd_date(y):
    return datetime.date(y, random.randint(1,12), random.randint(1,28))
n = 0
for y, cnt in [(2024,22),(2025,34),(2026,26)]:
    for i in range(cnt):
        n += 1
        r = random.choices(routes, weights=[w for _,_,w in routes])[0]
        d = rnd_date(y)
        if y == 2026 and d.month > 9: d = d.replace(month=random.randint(1,9))
        sales = random.choice([65,80,95,110,120,135,150,168,185,210,250])
        gross = round(sales * random.uniform(0.25,0.45))
        mat = round(sales*10000/1.1*random.uniform(0.10,0.17))
        sc = random.choice([120000,150000,180000,200000]); w1 = round(sales*10000/1.1*random.uniform(0.18,0.30),-4)
        c = {'顧客ID': f'C{n:04d}', '契約日': d.isoformat(), '顧客名': f'サンプル　{n:02d}' + ('邸追' if r[0]=='追加' else ''), '契約金額(万円)': sales, '粗利(万円・手入力)': gross,
             '担当C': random.choice(people), '担当A': None, '集客経路': r[0], '着工日': (d+datetime.timedelta(days=35)).isoformat(),
             '材料費': mat, '足場発注': sc, '職人①': 'サンプル塗装', '職人①発注': w1, '電話番号①': f'03-0000-{n:04d}', '住所': f'江戸川区サンプル町{n%9+1}-{n%7+1}-{n%5+1}'}
        if random.random() < 0.15: c['担当A'] = [p for p in people if p != c['担当C']][0]
        start = d+datetime.timedelta(days=35)
        if start + datetime.timedelta(days=20) < datetime.date(2026,9,1): c['完工日'] = (start+datetime.timedelta(days=random.randint(12,25))).isoformat()
        custs.append(c)
        if r[1]:
            leads.append({'反響ID': f'R{len(leads)+1:04d}', '反響日': (d-datetime.timedelta(days=random.randint(10,40))).isoformat(), '邸名': f'サンプル{n:02d}邸', '担当': c['担当C'], '区分': r[1], '媒体': r[0], '結果': '成約', '顧客ID': c['顧客ID']})
# 契約に至らなかった反響
for y, cnt in [(2024,40),(2025,50),(2026,40)]:
    for i in range(cnt):
        r = random.choices([x for x in routes if x[1]], weights=[w for _,_,w in routes if _ ])[0] if False else random.choice([x for x in routes if x[1]])
        res = random.choices(['不成約','見積り待ち','長期追客','時期','連絡つかず'], weights=[55,15,15,8,7])[0]
        leads.append({'反響ID': f'R{len(leads)+1:04d}', '反響日': rnd_date(y).isoformat() if not (y==2026) else datetime.date(2026,random.randint(1,9),random.randint(1,28)).isoformat(), '邸名': f'見込み{len(leads)}邸', '担当': random.choice(people), '区分': r[1], '媒体': r[0], '結果': res})
leads.sort(key=lambda x: x['反響日'])
for c in custs:
    if c.get('完工日') and random.random() < 0.7:
        c['メンテ1か月'] = (datetime.date.fromisoformat(c['完工日'])+datetime.timedelta(days=32)).isoformat()
# 案件アラートの見本(今日を基準にした最近の反響)
today = datetime.date.today()
def add_lead(days_ago, sec, media, result, survey_ago=None, quote=False):
    L = {'反響ID': f'R{len(leads)+1:04d}', '反響日': (today-datetime.timedelta(days=days_ago)).isoformat(), '邸名': f'見本{len(leads)}邸', '担当': random.choice(people), '区分': sec, '媒体': media}
    if result: L['結果'] = result
    if survey_ago is not None: L['現調日'] = (today-datetime.timedelta(days=survey_ago)).isoformat()
    if quote: L['見積日'] = (today-datetime.timedelta(days=max(0,(survey_ago or 0)-1))).isoformat(); L['見積額(万円)'] = 120
    leads.append(L)
add_lead(6, 'ポータル', 'ヌリカエ', None); add_lead(7, 'ポータル', '窓口', None); add_lead(3, 'ポータル', 'ヌリカエ', None)   # 結果が空欄 → 6日・7日がキャンセル確認
add_lead(6, 'ポータル', 'リショップ', '見積り待ち'); add_lead(9, 'ポータル', 'ヌリカエ', None)                                   # 結果あり / 期限(7日)を過ぎたもの
add_lead(14, 'ポータル', 'ヌリカエ', '見積り待ち', survey_ago=9); add_lead(16, 'ポータル', '窓口', '見積り待ち', survey_ago=8)   # 現調から7日以上・見積日なし → 見積り忘れ
add_lead(12, 'ポータル', 'ヌリカエ', '見積り待ち', survey_ago=5); add_lead(15, 'ポータル', '窓口', '見積り待ち', survey_ago=9, quote=True)
add_lead(9, '自社', 'チラシ', '見積り待ち', survey_ago=8)   # 自社は対象外
leads.sort(key=lambda x: x['反響日'])
for l in leads:   # 訪販は反響日・現調日がなく、日付は見積日だけ
    if l['区分'] == '訪販':
        l['見積日'] = l['反響日']; l['反響日'] = None; l['現調日'] = None
# 入出金の見本: 完工して日数がたった案件は入金日つき(=入出金の対象外)。最近の案件は、入金と出金が途中まで入っている状態にする。
rng = random.Random(7)
ledger = []
def surname(c):   # 見本は苗字がすべて同じなので、入出金の顧客名は「サンプル邸(63)」のように名前つき
    a, b = c['顧客名'].split('\u3000'); return a + '邸(' + b.replace('邸追', '') + ')'
for c in custs:
    if c.get('完工日') and c['完工日'] < '2026-08-01':
        c['入金日'] = c['完工日']
recent = [c for c in custs if not c.get('入金日') and '2026-05-01' <= c['契約日'] <= '2026-08-15' and not c['顧客名'].endswith('邸追')][:8]
for c in recent:
    total = int(c['契約金額(万円)'] * 10000)
    ledger.append({'日付': (datetime.date.fromisoformat(c['契約日'])+datetime.timedelta(days=rng.randint(3,10))).isoformat(), '種別': '入金', '顧客名': surname(c), '区分': '入金①', '金額(円)': total // 3})
    if rng.random() < 0.6:
        ledger.append({'日付': (datetime.date.fromisoformat(c['契約日'])+datetime.timedelta(days=rng.randint(40,60))).isoformat(), '種別': '出金', '顧客名': surname(c), '区分': '足場', '支払先': 'サンプル足場', '金額(円)': int(c.get('足場発注') or 0)})
ledger.sort(key=lambda r: r['日付'])
# インセン調整の見本: 直近に入金があった案件の担当Cの金額を上書きする
paid = sorted([c for c in custs if c.get('入金日') and c.get('担当C')], key=lambda c: c['入金日'])
adj = [{'顧客名': paid[-1]['顧客名'], '対象(クロ/アポ)': 'クロ', '上書きする金額(円)': 50000, '理由': '特別対応のため'}] if paid else []
# 年間収支の見本(年別シートと同じ升目。金額はすべて架空)
def year_grid(y):
    rg = random.Random(y)
    months = list(range(1, 13))
    hdr = [f'{y}年', None, None] + [f'{m}月' for m in months] + ['合計']
    def row(a, b, vals): return [a, b, None] + vals + [None]
    sales = [round(sum(c['契約金額(万円)'] for c in custs if c['契約日'].startswith(f'{y}-{m:02d}')) * 10000, -4) or None for m in months]
    paid = [round(rg.uniform(1.0, 4.5), 1) * 1000000 if sales[m-1] else None for m in months]
    inc = [round(rg.uniform(2.0, 9.0), 1) * 1000000 if sales[m-1] else None for m in months]
    g = [[hdr], [row('売上高', None, sales)], [row('現場支払', None, paid)], [row('入金', None, inc)],
         [row('粗利益', None, [((inc[i] or 0) - (paid[i] or 0)) for i in range(12)])]]
    fixed = [('役員報酬', 600000), ('人件費', 300000), ('家賃', 90000), ('保険・年金', 250000), ('広告費A', 120000), ('広告費B', 60000), ('ソフト利用料', 9000)]
    var = [('ガソリン代', 30000), ('駐車場代', 20000), ('備品代', 35000), ('その他', 15000)]
    rows = [row('固定' if i == 0 else None, n, [v if (y < 2026 or m <= 12) else None for m in months]) for i, (n, v) in enumerate(fixed)]
    rows += [row('変動' if i == 0 else None, n, [round(v * rg.uniform(0.6, 1.4), -2) if (y < 2026 or m <= 9) else 0 for m in months]) for i, (n, v) in enumerate(var)]
    tot = [sum((r[3 + i] or 0) for r in rows) for i in range(12)]
    rows.append(row(None, '合計', tot))
    net = [g[4][0][3 + i] - tot[i] for i in range(12)]
    rows.append(row('純利益', None, net))
    return [r for grp in g for r in grp] + rows
year_sheets = {'2025': year_grid(2025), '2026': year_grid(2026)}
json.dump({'反響': leads, '顧客': custs, '入出金': ledger, '年間収支': year_sheets, '経費データ': [], 'チラシ折込': [], '職人マスター': [], '設定': [{'項目': '年間収支の切替月', '値(入力)': '2026-08'}, {'項目': 'メンテ確認の開始日', '値(入力)': '2026-01-01'}, {'項目': '案件アラートの対象期間', '値(入力)': 60}, {'項目': 'ポータルのキャンセル確認日数', '値(入力)': 6}, {'項目': 'ポータルのキャンセル期限日数', '値(入力)': 7}, {'項目': '見積り忘れの確認日数', '値(入力)': 7}], 'インセン調整': adj}, open('data/sample.json','w',encoding='utf-8'), ensure_ascii=False)
print(len(leads), len(custs))
