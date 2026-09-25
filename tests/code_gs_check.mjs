// Code.gs を Google の部品を模したものの上で動かして、認証と読み出しの動きを確かめる
import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
function run(tokeninfo, body, extra = {}) {
  const props = { CLIENT_ID: 'cid', ALLOWED_EMAILS: 'Owner@example.com, other@example.com', ...(extra.props || {}) };
  const sheet = (rows) => ({ getDataRange: () => ({ getValues: () => rows }) });
  const sheets = { 2026: Object.assign(sheet([['2026年', '1月'], ['売上高', 5]]), { getName: () => '2026' }), 年間収支: Object.assign(sheet([['x']]), { getName: () => '年間収支' }), 入出金: sheet([['日付', '種別', '顧客名', '地域', '区分', '支払先', '金額(円)', 'メモ', '', '総未入金'], ['', '入金', 'サンプル邸', '江戸川', '', '', 100, '', '', 999], ['', '', '', '', '', '', '', '', '', 5]]), 顧客: sheet([['顧客ID', '契約日', '', '金額'], ['C1', new Date('2026-04-01T00:00:00+09:00'), 'x', 10], ['', '', '', '']]), ポータル: sheet([['反響ID', '邸名'], ['R1', 'a邸']]), 訪販: sheet([['反響ID', '邸名'], ['R2', 'b邸']]) };
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
assert.equal(r.ok, true); assert.deepEqual(r.data['顧客'], [{ 顧客ID: 'C1', 契約日: '2026-04-01', 金額: 10 }]); assert.deepEqual(r.data['反響'], [{ 反響ID: 'R1', 邸名: 'a邸', 区分: 'ポータル' }, { 反響ID: 'R2', 邸名: 'b邸', 区分: '訪販' }]); // 3タブを「反響」にまとめ、区分はタブ名から assert.deepEqual(r.data['入出金'], [{ 日付: null, 種別: '入金', 顧客名: 'サンプル邸', 地域: '江戸川', 区分: null, 支払先: null, '金額(円)': 100, メモ: null }]); // 右側の自動表示(J列より右)は読まない assert.deepEqual(r.data['年間収支'], { 2026: [['2026年', '1月'], ['売上高', 5]] }); // 年別シートだけを、升目のまま年ごとに渡す(表示用の年間収支は読まない)
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

// ---- アクセスログ(誰がいつ見たか) ----
{
  const logRows = []; const deleteCalls = []; let created = false, hidden = false;
  const logSheet = {
    appendRow: (r) => logRows.push(r),
    getLastRow: () => logRows.length,
    deleteRows: (start, count) => { deleteCalls.push([start, count]); logRows.splice(start - 1, count); },
    hideSheet: () => { hidden = true; },
  };
  const ss = {
    getSheetByName: (n) => (n === 'アクセスログ' && created ? logSheet : null),
    insertSheet: (n) => { created = true; return logSheet; },
  };
  const ctx = { SpreadsheetApp: { getActiveSpreadsheet: () => ss }, Date, String };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  ctx.logAccess_('owner@example.com');
  assert.equal(hidden, true); // 初回はシートを作って隠す
  assert.equal(Array.from(logRows[0]).join(','), '日時,メールアドレス');
  assert.equal(logRows[1][1], 'owner@example.com');
  assert.equal(logRows[1][0] instanceof Date, true);
  ctx.logAccess_('other@example.com');
  assert.equal(created, true); assert.equal(logRows.length, 3); // 2回目は作り直さず追記
  assert.equal(deleteCalls.length, 0); // まだ2000件を超えていない
  for (let i = 0; i < 2000; i++) logRows.push(['x', 'x']); // 2000件を超えた状態を作る
  ctx.logAccess_('owner@example.com');
  assert.equal(deleteCalls.length, 1); // 増えすぎたら古い記録を間引く
  console.log('Code.gs: アクセスログ(誰がいつ見たか)の記録・間引きOK');
}
// doPost が成功したとき、アクセスログにも記録される
{
  const logRows = []; let created = false;
  const logSheet = { appendRow: (r) => logRows.push(r), getLastRow: () => logRows.length, deleteRows: () => {}, hideSheet: () => {} };
  const sheet = (rows) => ({ getDataRange: () => ({ getValues: () => rows }) });
  const sheets = { 年間収支: Object.assign(sheet([['x']]), { getName: () => '年間収支' }) };
  const props = { CLIENT_ID: 'cid', ALLOWED_EMAILS: 'owner@example.com' };
  const ctx = {
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] }) },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ aud: 'cid', email: 'owner@example.com', email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 600) }) }) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (n) => (n === 'アクセスログ' ? (created ? logSheet : null) : (sheets[n] || null)),
        getSheets: () => Object.values(sheets),
        insertSheet: (n) => { created = true; return logSheet; },
      }),
    },
    Utilities: { formatDate: (d) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10) }, JSON, Date, Number, String, Error, Object, encodeURIComponent,
  };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const out = ctx.doPost({ postData: { contents: JSON.stringify({ idToken: 't' }) } });
  assert.equal(JSON.parse(out.t).ok, true);
  assert.equal(logRows.length, 2); // ヘッダー + 今回のアクセス1件
  assert.equal(logRows[1][1], 'owner@example.com');
  console.log('Code.gs: データを渡したときにアクセスログへ記録するOK');
}

// ---- 反響の登録(addLead_) ----
{
  const rows = []; // 追加された行を記録
  const headSheet = (head) => ({
    getLastColumn: () => head.length,
    getRange: (r, c, n, m) => ({ getValues: () => [head.slice(c - 1, c - 1 + m)] }),
    appendRow: (r) => rows.push(r),
  });
  const jisha = headSheet(['反響日', '邸名', '地域', '担当', '媒体', '内容', '連絡方法']);
  const houhan = headSheet(['反響日', '邸名', '地域', '担当', '媒体']);
  const ss = { getSheetByName: (n) => ({ 自社: jisha, 訪販: houhan }[n] || null) };
  const ctx = { SpreadsheetApp: { getActiveSpreadsheet: () => ss }, PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) }, String, Number, Date };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  ctx.addLead_({ 区分: '自社', 反響日: '2026-09-20', 邸名: '見本邸', 地域: '江戸川', 担当: '塩野', 媒体: 'チラシ' });
  assert.equal(rows.length, 1);
  const r = Array.from(rows[0]);
  assert.equal(r[0] instanceof Date, true); assert.equal(r[0].getFullYear(), 2026); assert.equal(r[0].getMonth(), 8); assert.equal(r[0].getDate(), 20);
  assert.equal(r[1], '見本邸'); assert.equal(r[2], '江戸川'); assert.equal(r[3], '塩野'); assert.equal(r[4], 'チラシ'); assert.equal(r[5], ''); assert.equal(r[6], ''); // 未入力は空欄
  ctx.addLead_({ 区分: '訪販', 邸名: '見本2邸', 地域: '足立', 担当: '佳人', 媒体: '訪問' }); // 訪販は反響日なしでもよい
  assert.equal(rows.length, 2); assert.equal(Array.from(rows[1])[0], ''); // 反響日は空欄のまま
  assert.throws(() => ctx.addLead_({ 区分: 'MIRAI', 邸名: 'x' }), /区分/); // 対象外の区分は拒否
  assert.throws(() => ctx.addLead_({ 区分: 'ポータル', 邸名: 'x' }), /見つかりません/); // ポータルのタブがない設定
  console.log('Code.gs: 反響の登録(addLead_)。見出し名で列を合わせ、日付は自動でDateにするOK');
}
// doPost({action:'addLead', ...}) 経由でも同じように書き込める
{
  const rows = [];
  const jisha = { getLastColumn: () => 4, getRange: (r, c, n, m) => ({ getValues: () => [['反響日', '邸名', '担当', '媒体'].slice(c - 1, c - 1 + m)] }), appendRow: (r) => rows.push(r) };
  const props = { CLIENT_ID: 'cid', ALLOWED_EMAILS: 'owner@example.com' };
  const logSheet = { appendRow: () => {}, getLastRow: () => 1, deleteRows: () => {}, hideSheet: () => {} };
  const ctx = {
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] }) },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ aud: 'cid', email: 'owner@example.com', email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 600) }) }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n) => (n === '自社' ? jisha : (n === 'アクセスログ' ? logSheet : null)) }) },
    JSON, Date, Number, String, Error, Object, encodeURIComponent,
  };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const out = ctx.doPost({ postData: { contents: JSON.stringify({ idToken: 't', action: 'addLead', lead: { 区分: '自社', 邸名: '見本邸', 担当: '佳人', 媒体: 'HP' } }) } });
  const r = JSON.parse(out.t);
  assert.equal(r.ok, true); assert.equal(r.data, undefined); // 一覧は返さない
  assert.equal(rows.length, 1); assert.equal(Array.from(rows[0])[1], '見本邸');
  console.log('Code.gs: doPost(action:addLead)で反響を1件追加できるOK');
}

// ---- 発注チェック(タスク)のための共通モック ----
function gridSheet(name, rows) {
  const grid = rows.map((r) => r.slice());
  return {
    getName: () => name,
    getDataRange: () => ({ getValues: () => grid.map((r) => r.slice()) }),
    getRange: (r, c, n = 1, m = 1) => {
      const self = {
        getValue: () => (grid[r - 1] || [])[c - 1] ?? '',
        setValue: (v) => { grid[r - 1] = grid[r - 1] || []; grid[r - 1][c - 1] = v; },
        getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => (grid[r - 1 + i] || [])[c - 1 + j] ?? '')),
        setValues: (vals) => { vals.forEach((row, i) => { grid[r - 1 + i] = grid[r - 1 + i] || []; row.forEach((v, j) => { grid[r - 1 + i][c - 1 + j] = v; }); }); },
        // 「=」で始まる文字列を数式に見立てる(このモックには本物の数式エンジンが無いため)
        getFormula: () => { const v = (grid[r - 1] || [])[c - 1]; return (typeof v === 'string' && v.charAt(0) === '=') ? v : ''; },
        copyTo: (target) => { target.setValues(self.getValues()); },
      };
      return self;
    },
    appendRow: (row) => grid.push(Array.from(row)),
    getLastRow: () => grid.length,
    getLastColumn: () => (grid[0] ? grid[0].length : 0),
    getMaxRows: () => Math.max(grid.length, 2000), // 本物のシートは下の方まで行が確保されている想定
    deleteRows: (start, count) => grid.splice(start - 1, count),
    insertRowBefore: (rowIndex) => { grid.splice(rowIndex - 1, 0, []); },
    hideSheet: () => {},
    _grid: grid,
  };
}
function makeSS(initial) {
  const sheets = {};
  for (const [name, rows] of Object.entries(initial)) sheets[name] = gridSheet(name, rows);
  return { getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => { sheets[n] = gridSheet(n, []); return sheets[n]; }, toast: () => {}, _sheets: sheets };
}
const fmtDate_ = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// 顧客に契約日・顧客名がそろったら、タスクの項目一式を自動で1回だけ作る(onEditから)
{
  const custRows = [['顧客名', '契約日', '入金日'], ['見本邸', new Date(2026, 8, 1), '']];
  const ss = makeSS({ 顧客: custRows });
  const ctx = { SpreadsheetApp: { getActiveSpreadsheet: () => ss }, Utilities: { formatDate: fmtDate_ }, Date, String, Number };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const sh = ss._sheets['顧客'];
  const range = { getSheet: () => sh, getRow: () => 2, getLastRow: () => 2, getColumn: () => 1, getLastColumn: () => 1 };
  ctx.onEdit({ range });
  const rows = ss._sheets['タスク']._grid;
  assert.equal(rows[0].join(','), '顧客名,契約日,項目,完了日');
  assert.equal(rows.length, 1 + 24); // ヘッダー + テンプレ24件
  assert.equal(rows[1][0], '見本邸'); assert.equal(rows[1][2], '粗利予想'); assert.equal(rows.at(-1)[2], 'BeforeAfter');
  ctx.onEdit({ range }); // 2回目の編集では増えない(すでにある)
  assert.equal(ss._sheets['タスク']._grid.length, 1 + 24);
  console.log('Code.gs: 顧客に契約日・顧客名がそろったら、タスクを自動で1回だけ作るOK');
}
// メニュー「未入金案件のタスクを作る」: 入金済み・契約日や顧客名が空の行は対象外
{
  const custRows = [
    ['顧客名', '契約日', '入金日'],
    ['未入金邸', new Date(2026, 5, 1), ''],
    ['入金済み邸', new Date(2026, 5, 2), new Date(2026, 6, 1)],
    ['', '', ''],
  ];
  const ss = makeSS({ 顧客: custRows });
  const ctx = { SpreadsheetApp: { getActiveSpreadsheet: () => ss }, Utilities: { formatDate: fmtDate_ }, Date, String, Number };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  ctx.createMissingTasks();
  const names = new Set(ss._sheets['タスク']._grid.slice(1).map((r) => r[0]));
  assert.deepEqual([...names], ['未入金邸']);
  console.log('Code.gs: 未入金案件のタスクをまとめて作る(足りない分だけ)OK');
}
// setTask_: 完了日を付けたり消したりする。見つからなければエラー
{
  const taskRows = [['顧客名', '契約日', '項目', '完了日'], ['見本邸', new Date(2026, 8, 1), '足場発注', ''], ['見本邸', new Date(2026, 8, 1), '塗料発注', new Date(2026, 8, 5)]];
  const ss = makeSS({ タスク: taskRows });
  const ctx = { SpreadsheetApp: { getActiveSpreadsheet: () => ss }, Utilities: { formatDate: fmtDate_ }, Date, String, Number };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  ctx.setTask_({ 顧客名: '見本邸', 契約日: '2026-09-01', 項目: '足場発注', done: true });
  assert.equal(ss._sheets['タスク']._grid[1][3] instanceof Date, true);
  ctx.setTask_({ 顧客名: '見本邸', 契約日: '2026-09-01', 項目: '塗料発注', done: false });
  assert.equal(ss._sheets['タスク']._grid[2][3], '');
  assert.throws(() => ctx.setTask_({ 顧客名: '存在しない', 契約日: '2026-09-01', 項目: 'x', done: true }), /見つかりません/);
  console.log('Code.gs: 発注チェックのタップ(setTask_)で完了日を付けたり消したりできるOK');
}
// doPost(action:'setTask') 経由でも同じように切り替えられる
{
  const taskRows = [['顧客名', '契約日', '項目', '完了日'], ['見本邸', new Date(2026, 8, 1), '足場発注', '']];
  const ss = makeSS({ タスク: taskRows });
  const props = { CLIENT_ID: 'cid', ALLOWED_EMAILS: 'owner@example.com' };
  const ctx = {
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] }) },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ aud: 'cid', email: 'owner@example.com', email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 600) }) }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    Utilities: { formatDate: fmtDate_ }, JSON, Date, Number, String, Error, Object, encodeURIComponent,
  };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const out = ctx.doPost({ postData: { contents: JSON.stringify({ idToken: 't', action: 'setTask', task: { 顧客名: '見本邸', 契約日: '2026-09-01', 項目: '足場発注', done: true } }) } });
  assert.equal(JSON.parse(out.t).ok, true);
  assert.equal(ss._sheets['タスク']._grid[1][3] instanceof Date, true);
  console.log('Code.gs: doPost(action:setTask)で完了・未完了を切り替えられるOK');
}

// ---- 経費入力(addExpense_) ----
// 日付の並び順を保ったまま挿入する。同じ日付の行がすでにあれば、その行の同じ費目セルに金額を足し込む。
// 曜日・合計など、隣の行にある「計算式」は新しい行にも引き継がれる(このモックでは「=」で始まる文字列を数式とみなす)
{
  const expRows = [
    ['日付', '曜日', 'ガソリン代', '駐車場代', '交通費', '法人税', '設立費', 'その他'],
    [new Date(2026, 8, 1), '=WD2', 3000, '', '', '', '', ''],
    [new Date(2026, 8, 3), '=WD3', '', 1500, '', '', '', ''],
  ];
  const ss = makeSS({ 経費データ: expRows });
  const ctx = { SpreadsheetApp: { getActiveSpreadsheet: () => ss }, Date, String, Number, isFinite, Error };
  vm.createContext(ctx); vm.runInContext(src, ctx);

  // 9/1と9/3の間に9/2を差し込む → 新しい行が間に入り、隣の行(9/3)の曜日の数式は引き継ぐが、値(駐車場代)は引き継がない
  ctx.addExpense_({ 費目: 'その他', 金額: 800, 日付: '2026-09-02' });
  let grid = ss._sheets['経費データ']._grid;
  assert.equal(grid.length, 4);
  assert.equal(grid[1][0].getDate(), 1); // 9/1のまま(動かない)
  assert.equal(grid[2][0].getDate(), 2); // 新しく差し込まれた9/2
  assert.equal(grid[2][1], '=WD3'); // 隣の行から曜日の数式を引き継ぐ
  assert.equal(grid[2][3], ''); // 駐車場代の値は引き継がない(空になる)
  assert.equal(grid[2][7], 800); // その他に金額が入る
  assert.equal(grid[3][0].getDate(), 3); // 9/3は1つ下にずれただけで中身はそのまま
  assert.equal(grid[3][3], 1500);

  // 同じ日付(9/1)に別の費目を入れると、新しい行を作らずその行に書き込む
  ctx.addExpense_({ 費目: '交通費', 金額: 500, 日付: '2026-09-01' });
  grid = ss._sheets['経費データ']._grid;
  assert.equal(grid.length, 4); // 行数は増えない
  assert.equal(grid[1][4], 500);

  // 同じ日付・同じ費目をもう一度入れると、上書きではなく合算される
  ctx.addExpense_({ 費目: 'ガソリン代', 金額: 1200, 日付: '2026-09-01' });
  grid = ss._sheets['経費データ']._grid;
  assert.equal(grid.length, 4);
  assert.equal(grid[1][2], 4200); // 3000 + 1200

  // 一番新しい日付を入れると、末尾に追加される
  ctx.addExpense_({ 費目: 'ガソリン代', 金額: 700, 日付: '2026-09-10' });
  grid = ss._sheets['経費データ']._grid;
  assert.equal(grid.length, 5);
  assert.equal(grid[4][0].getDate(), 10);
  assert.equal(grid[4][2], 700);

  assert.throws(() => ctx.addExpense_({ 費目: '法人税', 金額: 1000, 日付: '2026-09-06' }), /法人税/);
  assert.throws(() => ctx.addExpense_({ 費目: '存在しない費目', 金額: 1000, 日付: '2026-09-06' }), /見つかりません/);
  assert.throws(() => ctx.addExpense_({ 費目: '交通費', 金額: -100, 日付: '2026-09-06' }), /金額/);
  assert.throws(() => ctx.addExpense_({ 費目: '交通費', 金額: 100, 日付: '来週' }), /日付/);
  console.log('Code.gs: 経費入力(addExpense_)。日付順を保って挿入し、同じ日付は費目ごとに足し込む。法人税・設立費は拒否OK');
}
// doPost(action:'addExpense') 経由でも同じように書き込める
{
  const expRows = [['日付', '曜日', 'ガソリン代'], ['', '', '']];
  const ss = makeSS({ 経費データ: expRows });
  const props = { CLIENT_ID: 'cid', ALLOWED_EMAILS: 'owner@example.com' };
  const ctx = {
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] }) },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ aud: 'cid', email: 'owner@example.com', email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 600) }) }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    JSON, Date, Number, String, Error, Object, encodeURIComponent, isFinite,
  };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const out = ctx.doPost({ postData: { contents: JSON.stringify({ idToken: 't', action: 'addExpense', expense: { 費目: 'ガソリン代', 金額: 4500, 日付: '2026-09-10' } }) } });
  assert.equal(JSON.parse(out.t).ok, true);
  assert.equal(ss._sheets['経費データ']._grid[1][2], 4500);
  console.log('Code.gs: doPost(action:addExpense)で経費を1件追加できるOK');
}

// ---- 顧客登録(addCustomer_) ----
// 契約日順を保ったまま挿入し、対応する列に値を書き込む。契約日・顧客名がそろうので発注チェックのタスクも自動で作る
{
  const custRows = [
    ['契約日', '顧客名', '契約金額(万円)', '住所', '電話番号①', '集客経路', '担当C', '完工日'],
    [new Date(2026, 8, 1), '丙野邸', 120, '江戸川区東小岩1-1-1', '03-0000-0001', '訪問', '佳人', ''],
    [new Date(2026, 8, 5), '丁野邸', 95, '江戸川区南小岩2-2-2', '03-0000-0002', 'HP', '塩野', ''],
  ];
  const ss = makeSS({ 顧客: custRows });
  const ctx = { SpreadsheetApp: { getActiveSpreadsheet: () => ss }, Utilities: { formatDate: fmtDate_ }, Date, String, Number, isFinite, Error };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  ctx.addCustomer_({ 契約日: '2026-09-03', 顧客名: '柊木邸', 住所: '江戸川区西小岩3-3-3', '電話番号①': '03-0000-0003', '契約金額(万円)': 150, 集客経路: 'チラシ', 担当C: '佳人' });
  const grid = ss._sheets['顧客']._grid;
  assert.equal(grid.length, 4);
  assert.equal(grid[1][1], '丙野邸'); // 動かない
  assert.equal(grid[2][1], '柊木邸'); // 9/3で間に挿入
  assert.equal(grid[2][0].getDate(), 3);
  assert.equal(grid[2][2], 150);
  assert.equal(grid[2][3], '江戸川区西小岩3-3-3');
  assert.equal(grid[2][4], '03-0000-0003');
  assert.equal(grid[2][5], 'チラシ');
  assert.equal(grid[2][6], '佳人');
  assert.equal(grid[3][1], '丁野邸'); // ずれただけ

  // 発注チェックのタスクも自動で作られる(手でスプシに入力したときと同じ)
  const tasks = ss._sheets['タスク']._grid;
  assert.equal(tasks.length, 1 + 24);
  assert.equal(tasks[1][0], '柊木邸');

  assert.throws(() => ctx.addCustomer_({ 契約日: '2026-09-04', 顧客名: '', 集客経路: 'HP', 担当C: '佳人' }), /顧客名/);
  assert.throws(() => ctx.addCustomer_({ 契約日: '来週', 顧客名: 'x', 集客経路: 'HP', 担当C: '佳人' }), /契約日/);
  assert.throws(() => ctx.addCustomer_({ 契約日: '2026-09-04', 顧客名: 'x', 集客経路: '', 担当C: '佳人' }), /集客経路/);
  assert.throws(() => ctx.addCustomer_({ 契約日: '2026-09-04', 顧客名: 'x', 集客経路: 'HP', 担当C: '' }), /担当/);
  console.log('Code.gs: 顧客登録(addCustomer_)。契約日順を保って挿入し、発注チェックのタスクも自動で作るOK');
}
// doPost(action:'addCustomer') 経由でも同じように追加できる
{
  const custRows = [['契約日', '顧客名', '集客経路', '担当C'], ['', '', '', '']];
  const ss = makeSS({ 顧客: custRows });
  const props = { CLIENT_ID: 'cid', ALLOWED_EMAILS: 'owner@example.com' };
  const ctx = {
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] }) },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ aud: 'cid', email: 'owner@example.com', email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 600) }) }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    Utilities: { formatDate: fmtDate_ }, JSON, Date, Number, String, Error, Object, encodeURIComponent, isFinite,
  };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const out = ctx.doPost({ postData: { contents: JSON.stringify({ idToken: 't', action: 'addCustomer', customer: { 契約日: '2026-09-10', 顧客名: '梅沢邸', 集客経路: '紹介', 担当C: '塩野' } }) } });
  assert.equal(JSON.parse(out.t).ok, true);
  assert.equal(ss._sheets['顧客']._grid[1][1], '梅沢邸');
  console.log('Code.gs: doPost(action:addCustomer)で顧客を1件追加できるOK');
}
