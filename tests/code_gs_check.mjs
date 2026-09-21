// Code.gs を Google の部品を模したものの上で動かして、認証と読み出しの動きを確かめる
import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
function run(tokeninfo, body, extra = {}) {
  const props = { CLIENT_ID: 'cid', ALLOWED_EMAILS: 'Owner@example.com, other@example.com', ...(extra.props || {}) };
  const sheet = (rows) => ({ getDataRange: () => ({ getValues: () => rows }) });
  const sheets = { 2026: Object.assign(sheet([['2026年', '1月'], ['売上高', 5]]), { getName: () => '2026' }), 年間収支: Object.assign(sheet([['x']]), { getName: () => '年間収支' }), 入出金: sheet([['日付', '種別', '顧客名', '地域', '区分', '支払先', '金額(円)', 'メモ', '', '総未入金'], ['', '入金', '山田邸', '江戸川', '', '', 100, '', '', 999], ['', '', '', '', '', '', '', '', '', 5]]), 顧客: sheet([['顧客ID', '契約日', '', '金額'], ['C1', new Date('2026-04-01T00:00:00+09:00'), 'x', 10], ['', '', '', '']]), ポータル: sheet([['反響ID', '邸名'], ['R1', 'a邸']]), 訪販: sheet([['反響ID', '邸名'], ['R2', 'b邸']]) };
  const ctx = {
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] }) },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => (tokeninfo ? 200 : 400), getContentText: () => JSON.stringify(tokeninfo || {}) }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n) => sheets[n] || null, getSheets: () => Object.values(sheets).map((x, i) => (x.getName ? x : Object.assign(x, { getName: () => Object.keys(sheets)[i] }))) }), openById: (id) => { if (id !== 'PID') throw new Error('no'); return { getSheetByName: (n) => (n === 'ポータル' ? sheet([['反響ID', '邸名'], ['P1', 'p邸']]) : null) }; } },
    Utilities: { formatDate: (d) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10) }, JSON, Date, Number, String, Error, Object, encodeURIComponent,
  };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const out = ctx.doPost({ postData: { contents: JSON.stringify(body) } });
  return JSON.parse(out.t);
}
const ok = { aud: 'cid', email: 'owner@example.com', email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 600) };
let r = run(ok, { idToken: 't' });
assert.equal(r.ok, true); assert.deepEqual(r.data['顧客'], [{ 顧客ID: 'C1', 契約日: '2026-04-01', 金額: 10 }]); assert.deepEqual(r.data['反響'], [{ 反響ID: 'R1', 邸名: 'a邸', 区分: 'ポータル' }, { 反響ID: 'R2', 邸名: 'b邸', 区分: '訪販' }]); // 3タブを「反響」にまとめ、区分はタブ名から assert.deepEqual(r.data['入出金'], [{ 日付: null, 種別: '入金', 顧客名: '山田邸', 地域: '江戸川', 区分: null, 支払先: null, '金額(円)': 100, メモ: null }]); // 右側の自動表示(J列より右)は読まない assert.deepEqual(r.data['年間収支'], { 2026: [['2026年', '1月'], ['売上高', 5]] }); // 年別シートだけを、升目のまま年ごとに渡す(表示用の年間収支は読まない)
// ポータル専用ファイルを指定したときは、そちらのポータルを読む(このファイルのタブは読まない)
r = run(ok, { idToken: 't' }, { props: { PORTAL_SHEET_ID: 'PID' } });
assert.deepEqual(r.data['反響'].map((x) => x['反響ID'] + x['区分']), ['P1ポータル', 'R2訪販']);
r = run(ok, { idToken: 't' }, { props: { PORTAL_SHEET_ID: 'BAD' } }); assert.equal(r.ok, false); assert.match(r.error, /PORTAL_SHEET_ID/);
r = run(ok, {}); assert.equal(r.code, 'auth');
r = run({ ...ok, aud: 'other' }, { idToken: 't' }); assert.equal(r.code, 'auth');
r = run({ ...ok, email: 'stranger@example.com' }, { idToken: 't' }); assert.equal(r.code, 'auth');
r = run({ ...ok, email_verified: 'false' }, { idToken: 't' }); assert.equal(r.code, 'auth');
r = run(null, { idToken: 't' }); assert.equal(r.code, 'auth');
console.log('Code.gs: 認証(許可外・別アプリ・期限切れ・未確認は拒否)と読み出しOK');

// ---- 経費データの日付の自動入力(onEdit) ----
{
  const rows = [['日付', '曜日', 'ガソリン代', '駐車場代'], [new Date(), '', 1000, ''], ['', '', '', ''], ['', '', 500, '']];
  const cells = {}; rows.forEach((r, i) => r.forEach((v, j) => { cells[`${i + 1},${j + 1}`] = v; }));
  const sh = { getName: () => '経費データ', getRange: (r, c, n = 1, m = 1) => ({
    getValue: () => cells[`${r},${c}`] ?? '', setValue: (v) => { cells[`${r},${c}`] = v; }, setNumberFormat: () => {},
    getValues: () => [Array.from({ length: m }, (_, k) => cells[`${r},${c + k}`] ?? '')] }) };
  const ctx = { String, Number, Date, Utilities: { formatDate: () => '2026-9-20' }, TZ: 'Asia/Tokyo' };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const ev = (row, last, c1 = 3, c2 = 3) => ctx.onEdit({ range: { getSheet: () => sh, getRow: () => row, getLastRow: () => last, getColumn: () => c1, getLastColumn: () => c2 } });
  ev(2, 4);   // 3行分を一度に貼り付け
  assert.equal(cells['2,1'] instanceof Date, true);              // すでに日付がある行は変えない
  assert.equal(cells['3,1'], '');                                // 金額が空の行には入れない
  assert.equal(cells['4,1'].getFullYear(), 2026); assert.equal(cells['4,1'].getMonth(), 8); assert.equal(cells['4,1'].getDate(), 20); assert.equal(cells['4,1'].getHours(), 0);
  cells['4,1'] = ''; ev(4, 4, 1, 1); assert.equal(cells['4,1'], ''); // 日付欄を消しただけでは入れ直さない(費目の列を触ったときだけ)
  // 入出金: 金額(G列)を入れたときだけ、日付が空なら今日の日付
  const rows2 = [['日付', '種別', '顧客名', '地域', '区分', '支払先', '金額(円)'], ['', '入金', 'a', '江戸川', '', '', 1000], ['', '出金', 'b', '江戸川', '', '', '']];
  const c2 = {}; rows2.forEach((r, i) => r.forEach((v, j) => { c2[`${i + 1},${j + 1}`] = v; }));
  const sh2 = { getName: () => '入出金', getRange: (r, c, n = 1, m = 1) => ({ getValue: () => c2[`${r},${c}`] ?? '', setValue: (v) => { c2[`${r},${c}`] = v; }, setNumberFormat: () => {}, getValues: () => [Array.from({ length: m }, (_, k) => c2[`${r},${c + k}`] ?? '')] }) };
  ctx.onEdit({ range: { getSheet: () => sh2, getRow: () => 2, getLastRow: () => 3, getColumn: () => 7, getLastColumn: () => 7 } });
  assert.equal(c2['2,1'].getDate(), 20); assert.equal(c2['3,1'], '');   // 金額が空の行には入れない
  ctx.onEdit({ range: { getSheet: () => sh2, getRow: () => 3, getLastRow: () => 3, getColumn: () => 3, getLastColumn: () => 3 } });
  assert.equal(c2['3,1'], '');                                          // 顧客名などを触っただけでは入れない
  console.log('Code.gs: 経費データ・入出金の日付の自動入力OK');
}
