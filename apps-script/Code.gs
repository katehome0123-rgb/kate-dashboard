/**
 * ケイトホーム 経営ダッシュボード用 データ受け渡しスクリプト
 *
 * やること: アプリから届いた Google ログインの証明(IDトークン)を確かめ、
 *           許可したメールアドレスの本人だったときだけ、スプレッドシートの中身を JSON で返す。
 * 読むだけで、スプレッドシートには一切書き込みません。
 *
 * 設定(プロジェクトの設定 → スクリプト プロパティ):
 *   CLIENT_ID       … Google Cloud で作った OAuth クライアント ID
 *   ALLOWED_EMAILS  … 見てよい人のメールアドレス(複数ならカンマ区切り)
 *   PORTAL_SHEET_ID … (任意)ポータル専用スプレッドシートのID。入れると、ポータルの反響はそこから読みます。
 *                     空なら、このスプレッドシート内の「ポータル」タブから読みます。
 */

// アプリに渡してよいシート(これ以外は返しません)
// 反響は「ポータル」「自社」「訪販」の3タブに分かれています(区分はタブ名で決まる)。アプリには「反響」1つにまとめて渡します。
const LEAD_TABS = ['ポータル', '自社', '訪販'];
const SHEETS = ['顧客', '入出金', '経費データ', 'チラシ折込', '職人マスター', '設定', 'インセン調整'];
const TZ = 'Asia/Tokyo';
// 入出金は、右側(J列より右)に総未入金などの自動表示があるので、左の8列(A〜H)だけを読む
const READ_COLS = { '入出金': 8 };

function doGet() {
  return ContentService.createTextOutput('OK(データはアプリからログインしたときだけ返します)');
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    verifyToken_(body.idToken);
    return json_({ ok: true, data: readAll_() });
  } catch (err) {
    const isAuth = err && err.isAuth;
    return json_({ ok: false, code: isAuth ? 'auth' : 'error', error: String((err && err.message) || err) });
  }
}

function verifyToken_(idToken) {
  if (!idToken) throw authError_('ログインが必要です');
  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty('CLIENT_ID');
  const allowed = (props.getProperty('ALLOWED_EMAILS') || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(String);
  if (!clientId || !allowed.length) throw new Error('スクリプト プロパティ(CLIENT_ID / ALLOWED_EMAILS)が未設定です');

  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw authError_('ログインの有効期限が切れました。もう一度ログインしてください');
  const t = JSON.parse(res.getContentText());
  if (t.aud !== clientId) throw authError_('このアプリ用のログインではありません');
  if (String(t.email_verified) !== 'true') throw authError_('メールアドレスが確認できません');
  if (Number(t.exp) * 1000 < Date.now()) throw authError_('ログインの有効期限が切れました');
  if (allowed.indexOf(String(t.email).toLowerCase()) < 0) throw authError_('このアカウントには閲覧権限がありません');
  return t.email;
}

function authError_(msg) { const e = new Error(msg); e.isAuth = true; return e; }

function readAll_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const portalId = PropertiesService.getScriptProperties().getProperty('PORTAL_SHEET_ID');
  let portalSs = ss;
  if (portalId) {
    try { portalSs = SpreadsheetApp.openById(portalId.trim()); }
    catch (err) { throw new Error('ポータル用スプレッドシートを開けません(スクリプト プロパティ PORTAL_SHEET_ID を確認してください)'); }
  }
  const out = { '反響': [] };
  LEAD_TABS.forEach(function (tab) {
    const sh = (tab === 'ポータル' ? portalSs : ss).getSheetByName(tab);
    if (!sh) return;
    readSheet_(sh).forEach(function (row) { row['区分'] = tab; out['反響'].push(row); });
  });
  SHEETS.forEach(function (name) {
    const sh = ss.getSheetByName(name);
    out[name] = sh ? readSheet_(sh, READ_COLS[name]) : [];
  });
  // 年間収支: 入力は「2024」「2025」…という名前の年別シート(非表示)にあります。見出し行つきの表ではなく、
  // 前のスプレッドシートと同じ升目(二次元の配列)のまま、年ごとに渡します。(表示用の「年間収支」シートは読みません)
  out['年間収支'] = {};
  ss.getSheets().forEach(function (sh) {
    if (/^\d{4}$/.test(sh.getName())) out['年間収支'][sh.getName()] = readGrid_(sh);
  });
  return out;
}

function readSheet_(sh, maxCols) {
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const head = values[0].slice(0, maxCols || values[0].length).map(function (h) { return String(h).trim(); });
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    let any = false;
    const obj = {};
    for (let j = 0; j < head.length; j++) {
      if (!head[j]) continue;
      let v = row[j];
      if (v instanceof Date) v = Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
      else if (v === '') v = null;
      if (v !== null) any = true;
      obj[head[j]] = v;
    }
    if (any) rows.push(obj);
  }
  return rows;
}

function readGrid_(sh) {
  return sh.getDataRange().getValues().map(function (row) {
    return row.map(function (v) {
      if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
      return v === '' ? null : v;
    });
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 日付の自動入力(入力すると自動で動きます。設定は不要)
 *  ・経費データ: 費目の金額(C〜U列)を入れたとき、その行の日付(A列)が空なら、今日の日付を入れます。
 *  ・入出金: 金額(G列)を入れたとき、その行の日付(A列)が空なら、今日の日付を入れます。
 * 日付を変えたいときは、A列を直接書き換えてください。時刻なしの日付だけを入れます(月ごとの集計が正しくなるように)。
 */
const AUTO_DATE = { '経費データ': { from: 3, to: 21 }, '入出金': { from: 7, to: 7 } };

function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sh = e.range.getSheet();
    const cfg = AUTO_DATE[sh.getName()];
    if (!cfg) return;
    const c1 = e.range.getColumn(), c2 = e.range.getLastColumn();
    if (c2 < cfg.from || c1 > cfg.to) return;      // 金額の列を触ったときだけ
    const first = Math.max(2, e.range.getRow());
    const last = e.range.getLastRow();
    const p = Utilities.formatDate(new Date(), TZ, 'yyyy-M-d').split('-').map(Number);
    const today = new Date(p[0], p[1] - 1, p[2]);
    for (let r = first; r <= last; r++) {
      const dateCell = sh.getRange(r, 1);
      if (String(dateCell.getValue()) !== '') continue;
      const amounts = sh.getRange(r, cfg.from, 1, cfg.to - cfg.from + 1).getValues()[0];
      if (amounts.every(function (v) { return v === '' || v === null; })) continue;
      dateCell.setValue(today);
      dateCell.setNumberFormat('yyyy/mm/dd');
    }
  } catch (err) { /* 入力の邪魔をしない */ }
}

/**
 * プルダウンの設定(1回だけ実行すれば OK)
 *  スプレッドシートを開き直すと、上のメニューに「ケイトホーム」が出ます。
 *  「ケイトホーム」→「顧客名のプルダウンを設定」を押すと、次の2つを自動で作ります。
 *   ・入出金の顧客名(C列): 顧客シートで入金日が入っていない案件(候補は「入出金候補」シートのJ列)
 *   ・インセン調整の顧客名(A列): 顧客シートの顧客名
 *  手作業で「データの入力規則」を作る必要はありません。
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('ケイトホーム').addItem('顧客名のプルダウンを設定', 'setupDropdowns').addToUi();
  } catch (err) { /* メニューが作れなくても他には影響しない */ }
}

function setupDropdowns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const jobs = [
    { sheet: '入出金', col: 'C2:C2000', from: '入出金候補', src: 'J2:J301' },
    { sheet: 'インセン調整', col: 'A2:A2000', from: '顧客', src: 'B2:B2000' },
  ];
  const done = [];
  jobs.forEach(function (j) {
    const target = ss.getSheetByName(j.sheet), source = ss.getSheetByName(j.from);
    if (!target || !source) return;
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInRange(source.getRange(j.src), true)
      .setAllowInvalid(true)   // 入金が済んだ案件の過去の行が、エラー表示にならないように「警告のみ」にする
      .build();
    target.getRange(j.col).setDataValidation(rule);
    done.push(j.sheet);
  });
  SpreadsheetApp.getActiveSpreadsheet().toast(done.length ? done.join('・') + ' のプルダウンを設定しました' : '対象のシートが見つかりませんでした', 'ケイトホーム', 5);
}
