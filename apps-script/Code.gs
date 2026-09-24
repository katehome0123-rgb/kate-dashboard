/**
 * ケイトホーム 経営ダッシュボード用 データ受け渡しスクリプト
 *
 * やること: アプリから届いた Google ログインの証明(IDトークン)を確かめ、
 *           許可したメールアドレスの本人だったときだけ、スプレッドシートの中身を JSON で返す。
 * 基本は読むだけです。ただし次は書き込みます。
 *  ・誰がいつ見たか(メールアドレスと日時)を「アクセスログ」という隠しシートに自動で記録(シートが無ければ自動で作成)
 *  ・アプリの「反響を登録」画面から届いた新しい反響を、ポータル/自社/訪販のタブに1行追加
 *  ・顧客シートに契約日と顧客名がそろったら、「タスク」シートに発注チェックの項目一式を自動で追加
 *  ・アプリの「発注チェック」画面でタップしたら、「タスク」シートの完了日を付けたり消したりする
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
const SHEETS = ['顧客', '入出金', '経費データ', 'チラシ折込', '職人マスター', '設定', 'インセン調整', 'タスク'];
const TZ = 'Asia/Tokyo';
// 入出金は、右側(J列より右)に総未入金などの自動表示があるので、左の8列(A〜H)だけを読む
const READ_COLS = { '入出金': 8 };

// 発注チェックの項目(契約日と顧客名がそろったら、この並び順で「タスク」シートに1件ずつ追加する)。
// 左挨拶・右挨拶・裏挨拶・洗浄挨拶・養生説明は「挨拶」1つにまとめてある。この一覧にない項目は、必要な案件だけ手で1行足す。
const TASK_TEMPLATE = ['粗利予想', '顧客名簿', 'スキャン', '4分割', '職人発注', '足場発注', 'DropBox', '年賀状', '地図', 'マップ', 'ドライブ', '見本板発注', '見本板届け', '足場越境', '打ち合せ', '打ち合わせ書職人送信', '塗料発注', '足場現調', '車', '挨拶', 'フェンス', '着手', '完工', 'BeforeAfter'];

function doGet() {
  return ContentService.createTextOutput('OK(データはアプリからログインしたときだけ返します)');
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const email = verifyToken_(body.idToken);
    logAccess_(email);
    if (body.action === 'addLead') {
      addLead_(body.lead || {});
      return json_({ ok: true });
    }
    if (body.action === 'setTask') {
      setTask_(body.task || {});
      return json_({ ok: true });
    }
    return json_({ ok: true, data: readAll_() });
  } catch (err) {
    const isAuth = err && err.isAuth;
    return json_({ ok: false, code: isAuth ? 'auth' : 'error', error: String((err && err.message) || err) });
  }
}

// アプリの「反響を登録」画面から届いた1件を、区分(ポータル/自社/訪販)に合うタブへ1行追加する。
// 列はタブの見出し行(1行目)をそのまま使うので、見出しを増やしたり並べ替えたりしても、名前が合っていれば動く。
// 見出しの名前に「日」が付く列(反響日・現調日など)は、'YYYY-MM-DD' の文字列なら日付として書き込む。
function addLead_(lead) {
  if (LEAD_TABS.indexOf(lead['区分']) < 0) throw new Error('区分(ポータル/自社/訪販)が正しくありません');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh;
  if (lead['区分'] === 'ポータル') {
    const portalId = PropertiesService.getScriptProperties().getProperty('PORTAL_SHEET_ID');
    const target = portalId ? SpreadsheetApp.openById(portalId.trim()) : ss;
    sh = target.getSheetByName('ポータル');
  } else {
    sh = ss.getSheetByName(lead['区分']);
  }
  if (!sh) throw new Error('反響のタブ(' + lead['区分'] + ')が見つかりません');
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  if (!head.some(function (h) { return h; })) throw new Error('反響のタブ(' + lead['区分'] + ')に見出し行がありません');
  const row = head.map(function (h) {
    if (!h) return '';
    const v = lead[h];
    if (v === undefined || v === null || v === '') return '';
    if (/日$/.test(h) && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
      const p = String(v).split('-').map(Number);
      return new Date(p[0], p[1] - 1, p[2]);
    }
    return v;
  });
  sh.appendRow(row);
}

// ---- 発注チェック(タスク) ------------------------------------------------
// 「タスク」シートが無ければ、見出し行つきで自動で作る
function ensureTaskSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('タスク');
  if (!sh) {
    sh = ss.insertSheet('タスク');
    sh.appendRow(['顧客名', '契約日', '項目', '完了日']);
  }
  return sh;
}

function dateStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return String(v || '').slice(0, 10);
}

// name・契約日ですでにタスクの行があるか(1件でもあれば「作成済み」とみなす)
function hasTasks_(sh, name, dateStr) {
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(name) && dateStr_(values[i][1]) === dateStr) return true;
  }
  return false;
}

// name・契約日ぶんの、発注チェックの項目一式を追加する(すでにあれば何もしない)
function createTaskRows_(name, dateStr) {
  const sh = ensureTaskSheet_();
  if (hasTasks_(sh, name, dateStr)) return false;
  const p = dateStr.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  const rows = TASK_TEMPLATE.map(function (item) { return [name, d, item, '']; });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
  return true;
}

// 顧客シートに契約日と顧客名がそろった行を見つけて、タスクをまだ持っていなければ作る(onEditから呼ぶ)
function maybeCreateTasks_(sh, range) {
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  const nameCol = head.indexOf('顧客名') + 1;
  const dateCol = head.indexOf('契約日') + 1;
  if (!nameCol || !dateCol) return;
  const first = Math.max(2, range.getRow());
  const last = range.getLastRow();
  for (let r = first; r <= last; r++) {
    const name = sh.getRange(r, nameCol).getValue();
    const dateVal = sh.getRange(r, dateCol).getValue();
    if (!name || !dateVal) continue;
    createTaskRows_(String(name), dateStr_(dateVal));
  }
}

// アプリの「発注チェック」画面から、1つの項目の完了・未完了を切り替える
function setTask_(t) {
  const sh = ensureTaskSheet_();
  const values = sh.getDataRange().getValues();
  const dateStr = dateStr_(t['契約日']);
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(t['顧客名']) && dateStr_(values[i][1]) === dateStr && String(values[i][2]) === String(t['項目'])) {
      sh.getRange(i + 1, 4).setValue(t.done ? new Date() : '');
      return;
    }
  }
  throw new Error('該当するタスクが見つかりません(' + t['顧客名'] + '・' + t['項目'] + ')');
}

// メニューから1回押すと、今すでに未入金の案件のうち、タスクがまだ無いものだけ作る(Keepから移行するときなど)
function createMissingTasks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('顧客');
  if (!sh) return;
  const values = sh.getDataRange().getValues();
  const head = values[0].map(function (h) { return String(h).trim(); });
  const nameCol = head.indexOf('顧客名'), dateCol = head.indexOf('契約日'), paidCol = head.indexOf('入金日');
  let made = 0;
  for (let i = 1; i < values.length; i++) {
    const name = values[i][nameCol], dateVal = dateCol >= 0 ? values[i][dateCol] : null;
    if (!name || !dateVal) continue;
    if (paidCol >= 0 && values[i][paidCol]) continue; // 入金済みは対象外
    if (createTaskRows_(String(name), dateStr_(dateVal))) made++;
  }
  SpreadsheetApp.getActiveSpreadsheet().toast(made ? made + '件ぶんのタスクを作りました' : '足りないタスクはありませんでした', 'ケイトホーム', 5);
}

// 誰が・いつ見たか(ログインが通ってデータを渡したとき)を「アクセスログ」シートに記録する。
// シートが無ければ自動で作って隠す(準備は不要)。記録できなくても、閲覧そのものは止めない。
// 増えすぎないよう、直近2000件だけ残す。
function logAccess_(email) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName('アクセスログ');
    if (!sh) {
      sh = ss.insertSheet('アクセスログ');
      sh.appendRow(['日時', 'メールアドレス']);
      sh.hideSheet();
    }
    sh.appendRow([new Date(), email]);
    const last = sh.getLastRow();
    if (last > 2001) sh.deleteRows(2, last - 2001);
  } catch (err) { /* ログが失敗しても閲覧は止めない */ }
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
 *  ・顧客: 契約日と顧客名がそろった行に、「タスク」シートへ発注チェックの項目一式を自動で追加します(すでにあれば何もしません)。
 */
const AUTO_DATE = { '経費データ': { from: 3, to: 21 }, '入出金': { from: 7, to: 7 } };

function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sh = e.range.getSheet();
    if (sh.getName() === '顧客') { try { maybeCreateTasks_(sh, e.range); } catch (err2) { /* タスク作成に失敗しても入力は邪魔しない */ } }
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
    SpreadsheetApp.getUi().createMenu('ケイトホーム')
      .addItem('顧客名のプルダウンを設定', 'setupDropdowns')
      .addItem('未入金案件のタスクを作る(足りない分だけ)', 'createMissingTasks')
      .addToUi();
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
