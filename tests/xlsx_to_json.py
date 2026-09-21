# 手元のマスターxlsxをアプリと同じJSON形式に変換(テスト専用。出力は公開しないこと)
import sys, json, datetime, openpyxl
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
# 使い方: python xlsx_to_json.py マスター.xlsx 出力.json [ポータル管理.xlsx]
if len(sys.argv) > 3:
    _p = openpyxl.load_workbook(sys.argv[3], data_only=True)['ポータル']
else:
    _p = wb['ポータル'] if 'ポータル' in wb.sheetnames else None
out = {}
for n in ['ポータル','自社','訪販','顧客','入出金','経費データ','チラシ折込','職人マスター','設定','インセン調整']:
    ws = _p if n == 'ポータル' else wb[n]; rows = list(ws.iter_rows(values_only=True, max_col=8 if n == '入出金' else None))
    h = [str(x) if x is not None else None for x in rows[0]]
    res = []
    for r in rows[1:]:
        if all(v is None for v in r): continue
        d = {}
        for k, v in zip(h, r):
            if k is None: continue
            if isinstance(v, (datetime.datetime, datetime.date)): v = v.strftime('%Y-%m-%d')
            d[k] = v
        if n in ('ポータル','自社','訪販'): d['区分'] = n
        res.append(d)
    out[n] = res
out['反響'] = out.pop('ポータル') + out.pop('自社') + out.pop('訪販')
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
