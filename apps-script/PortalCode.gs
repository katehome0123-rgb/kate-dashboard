/**
 * ポータル管理スプレッドシート用のスクリプト(塩野さんと共有している「ポータル管理」のほう)。
 * ※ 経営ダッシュボード(統合マスター)のスクリプト Code.gs とは別のファイルです。貼り付ける場所も別です。
 *
 * できること
 *  1. 「ポータル」タブの「結果」を『キャンセル』にすると、その行が自動で「キャンセル」タブへ移る(日付つき)
 *  2. 「ポータル」タブに「紹介数」「番手」の列(プルダウンつき)を足す ← メニューの「初期設定」を1回押すだけ
 *
 * 列の位置は見出しの文字で探すので、列を足したり並べ替えたりしても動きます。
 */

const MAIN_TAB = 'ポータル';
const CANCEL_TAB = 'キャンセル';
const CANCEL_WORD = 'キャンセル';
const RESULT_HEADER = '結果';
const NEW_COLUMNS = ['紹介数', '番手'];
const NUM_CHOICES = ['1', '2', '3', '4', '5', '6', '7', '8'];

// ---- 純粋な計算(画面に依存しないのでテストできる) ----------------------
// mainHead: ポータルの見出し行 / rowVals: 移す行の値 / cancelHead: いまのキャンセルタブの見出し行(空なら [])
// 戻り値: { head: 書き込むべき見出し行, row: キャンセルタブに足す1行 }
function planMove_(mainHead, rowVals, cancelHead, today) {
  const head = (cancelHead || []).map(String);
  mainHead.concat(['キャンセル日']).forEach(function (h) {
    if (h !== '' && head.indexOf(h) < 0) head.push(h);
  });
  const row = head.map(function (h) {
    if (h === 'キャンセル日') return today;
    const i = mainHead.indexOf(h);
    return i < 0 ? '' : rowVals[i];
  });
  return { head: head, row: row };
}
function isCancelEdit_(sheetName, headers, col, row, value) {
  if (sheetName !== MAIN_TAB || row < 2) return false;
  if (headers.indexOf(RESULT_HEADER) + 1 !== col) return false;
  return String(value === undefined || value === null ? '' : value).trim() === CANCEL_WORD;
}

// ---- 編集されたときに自動で動く ------------------------------------------
function onEdit(e) {
  try {
    if (!e || !e.range || e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;
    const sh = e.range.getSheet();
    if (sh.getName() !== MAIN_TAB) return;
    const head = readHeaders_(sh);
    if (!isCancelEdit_(sh.getName(), head, e.range.getColumn(), e.range.getRow(), e.value)) return;
    moveToCancel_(sh, e.range.getRow(), head);
    e.source.toast('「キャンセル」タブへ移しました', 'ポータル管理', 5);
  } catch (err) {
    if (e && e.source) e.source.toast('キャンセルの移動に失敗しました: ' + err.message, 'ポータル管理', 10);
  }
}

function readHeaders_(sh) {
  const n = sh.getLastColumn();
  return n ? sh.getRange(1, 1, 1, n).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
}

function moveToCancel_(sh, row, head) {
  const ss = sh.getParent();
  let cancel = ss.getSheetByName(CANCEL_TAB);
  if (!cancel) { cancel = ss.insertSheet(CANCEL_TAB); cancel.setFrozenRows(1); }
  const today = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy/MM/dd');
  const vals = sh.getRange(row, 1, 1, head.length).getValues()[0];
  const plan = planMove_(head, vals, readHeaders_(cancel), today);
  cancel.getRange(1, 1, 1, plan.head.length).setValues([plan.head]).setFontWeight('bold');
  const target = cancel.getLastRow() + 1;
  cancel.getRange(target, 1, 1, plan.row.length).setValues([plan.row]);
  plan.row.forEach(function (v, i) {
    if (v instanceof Date) cancel.getRange(target, i + 1).setNumberFormat('yyyy/MM/dd');
  });
  // 元の行を消す。行数が減らないよう、いちばん下に空の行を足して見た目と入力規則をそろえる
  sh.deleteRow(row);
  const max = sh.getMaxRows(), cols = sh.getMaxColumns();
  sh.insertRowsAfter(max, 1);
  const from = sh.getRange(max, 1, 1, cols), to = sh.getRange(max + 1, 1, 1, cols);
  from.copyTo(to, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  from.copyTo(to, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
}

// ---- メニュー ------------------------------------------------------------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('ポータル管理')
    .addItem('初期設定(1回だけ押す)', 'setup')
    .addToUi();
}

// 初期設定: ①「結果」のプルダウンに『キャンセル』を足す ②「紹介数」「番手」の列とプルダウンを足す
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(MAIN_TAB);
  if (!sh) throw new Error('「' + MAIN_TAB + '」タブが見つかりません');
  const done = [];

  // ② 見出しと入力規則
  let head = readHeaders_(sh);
  NEW_COLUMNS.forEach(function (name) {
    let col = head.indexOf(name) + 1;
    if (!col) {
      col = head.length + 1;
      if (col > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), 1);
      sh.getRange(1, col).setValue(name);
      sh.getRange(1, head.length ? head.length : 1).copyTo(sh.getRange(1, col), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      head = readHeaders_(sh);
      done.push('「' + name + '」の列を足しました');
    }
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(NUM_CHOICES, true).setAllowInvalid(true).build();
    sh.getRange(2, col, sh.getMaxRows() - 1, 1).setDataValidation(rule).setHorizontalAlignment('center');
  });

  // ① 結果のプルダウンに「キャンセル」を足す(リストタブの結果の一覧の最後に足して、入力規則の範囲を広げる)
  const list = ss.getSheetByName('リスト');
  const resultCol = head.indexOf(RESULT_HEADER) + 1;
  if (list && resultCol) {
    const listHead = readHeaders_(list);
    const lc = listHead.indexOf('結果') + 1;
    if (lc) {
      const vals = list.getRange(2, lc, list.getMaxRows() - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); });
      let last = 0;
      vals.forEach(function (v, i) { if (v !== '') last = i + 1; });
      if (vals.indexOf(CANCEL_WORD) < 0) {
        list.getRange(last + 2, lc).setValue(CANCEL_WORD);
        last += 1;
        done.push('結果のプルダウンに「キャンセル」を足しました');
      } else {
        last = vals.indexOf(CANCEL_WORD) + 1 > last ? vals.indexOf(CANCEL_WORD) + 1 : last;
      }
      const src = list.getRange(2, lc, last, 1);
      const rule = SpreadsheetApp.newDataValidation().requireValueInRange(src, true).setAllowInvalid(true).build();
      sh.getRange(2, resultCol, sh.getMaxRows() - 1, 1).setDataValidation(rule);
    }
  }
  ss.toast(done.length ? done.join(' / ') : 'もう設定済みです', 'ポータル管理', 8);
}
