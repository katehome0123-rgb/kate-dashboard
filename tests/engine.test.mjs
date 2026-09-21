// 計算ロジックの確認(架空のデータだけを使う)。
// 使い方: node --test tests/engine.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../js/engine.js';

const sample = JSON.parse(fs.readFileSync(new URL('../data/sample.json', import.meta.url)));

test('分類: 追加・下請け・媒体グループ', () => {
  assert.equal(E.isAdd({ 集客経路: '追加' }), true);
  assert.equal(E.isAdd({ 集客経路: '訪問', 顧客名: '山田　太郎邸追' }), true);
  assert.equal(E.isSub({ 集客経路: 'MIRAI' }), true);
  assert.equal(E.isCountable({ 集客経路: 'ヌリカエ', 顧客名: '佐藤　花子' }), true);
  assert.equal(E.mediaGroup('足場'), '訪問');
  assert.equal(E.mediaGroup('ヌリカエ'), 'ポータル');
  assert.equal(E.mediaGroup('リショップ(再)'), 'ポータル');
  assert.equal(E.mediaGroup('チラシ'), 'チラシ');
});

test('着地利益 = 契約金額×10000/1.1 − 経費', () => {
  const c = E.enrichCustomer({ 契約日: '2026-01-10', '契約金額(万円)': 110 });
  assert.equal(Math.round(c._taxEx), 1000000);
  const d = E.enrichCustomer({ 契約日: '2026-01-10', '契約金額(万円)': 110, 材料費: 100000, 足場発注: 150000, '職人①発注': 400000, 駐車場代: 5000 });
  assert.equal(Math.round(d._landing), 1000000 - 655000);
});

test('成約率: 成約÷(成約+不成約)。結果待ちは分母に入れない', () => {
  const leads = [
    { 反響日: '2026-01-01', 担当: 'A', 区分: '自社', 媒体: 'チラシ', 結果: '成約' },
    { 反響日: '2026-01-02', 担当: 'A', 区分: '自社', 媒体: 'チラシ', 結果: '不成約' },
    { 反響日: '2026-01-03', 担当: 'A', 区分: '自社', 媒体: 'チラシ', 結果: '見積り待ち' },
    { 反響日: '2025-01-03', 担当: 'B', 区分: 'ポータル', 媒体: 'ヌリカエ', 結果: '成約' },
  ];
  assert.equal(E.closingTable(leads).total.rate, 2 / 3);
  assert.equal(E.closingTable(leads, { year: 2026 }).total.rate, 0.5);
  assert.equal(E.closingTable(leads, { person: 'B' }).total.rate, 1);
});

test('完工日が空の案件は利益率から外す(件数には数える)', () => {
  const mk = (extra) => E.enrichCustomer({ 契約日: '2026-01-10', '契約金額(万円)': 110, 集客経路: '訪問', 顧客名: 'A', 材料費: 100000, ...extra });
  const done = mk({ 完工日: '2026-03-01' }); // 着地 1,000,000-100,000 → 90%
  const wip = mk({ 材料費: 0 }); // 完工日なし(経費未確定)→ 100%になってしまうので除外
  const pm = E.profitByMedia([done, wip]);
  const r = pm.rows[0].byYear[2026];
  assert.equal(r.count, 2);
  assert.equal(r.doneCount, 1);
  assert.ok(Math.abs(r.rate - 0.9) < 1e-9);
  assert.equal(E.profitByMedia([wip]).rows[0].byYear[2026].rate, null);
});

test('サンプルデータでも動く', () => {
  const custs = E.enrichAll(sample);
  assert.ok(custs.length > 50);
  const pm = E.profitByMedia(custs);
  assert.ok(pm.rows.length >= 5);
});



test('担当別の月次: 按分(C40:A60)と本数(共同担当は二人とも1本、追加・下請けは数えない)', () => {
  const mk = (o) => E.enrichCustomer({ 契約日: '2026-03-10', '契約金額(万円)': 100, '粗利(万円・手入力)': 30, 集客経路: '訪問', 顧客名: 'X', ...o });
  const pm = E.personMonthly([mk({ 担当C: '甲' }), mk({ 担当C: '甲', 担当A: '乙' }), mk({ 担当C: '甲', 集客経路: 'MIRAI' })], 2026);
  const m = pm.rows[2];
  assert.equal(m.all.sales, 300); assert.equal(m.all.count, 2);
  assert.equal(m.by['甲'].sales, 100 + 40 + 100); assert.equal(m.by['甲'].count, 2);
  assert.equal(m.by['乙'].sales, 60); assert.equal(m.by['乙'].count, 1);
  assert.deepEqual(E.personMonthly([mk({ 担当A: '乙' }), mk({})], 2026).persons.sort(), ['乙', E.NO_PERSON].sort());
});

test('担当Aだけの案件は60%分だけ担当者に入り、全体には100%入る', () => {
  const c = E.enrichCustomer({ 契約日: '2026-08-13', '契約金額(万円)': 125, '粗利(万円・手入力)': 35, 集客経路: 'HP', 顧客名: 'Y', 担当A: '乙' });
  const pm = E.personMonthly([c], 2026);
  assert.equal(pm.rows[7].by['乙'].sales, 75);
  assert.equal(pm.rows[7].all.sales, 125);
  assert.equal(pm.rows[7].by['乙'].gross, 21);
});

test('メンテ: 予定日の計算と、1案件1行・3回の進み具合・開始日・追加案件の扱い', () => {
  assert.equal(E.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(E.dueDate('2026-08-15', '5年'), '2031-08-15');
  assert.equal(E.dueDate('2026-08-15', '10年'), '2036-08-15');
  const mk = (id, name, extra) => E.enrichCustomer({ 顧客ID: id, 契約日: '2026-05-01', 顧客名: name, 完工日: '2026-06-10', '契約金額(万円)': 100, 住所: '江戸川区A1-1', ...extra });
  const c1 = mk('C1', '甲　太郎'); // 1か月後=7/10 → 超過
  const c2 = mk('C2', '乙　太郎', { メンテ1か月: '2026-07-15' }); // 実施済み
  const c3 = mk('C3', '丙　太郎邸追'); // 追加は対象外
  const c4 = mk('C4', '丁　太郎', { 完工日: '2026-09-01' }); // 1か月後=10/1 → 予告
  const c5 = mk('C5', '戊　太郎', { 完工日: '2021-09-05' }); // 5年後=2026-09-05 も超過。1か月・5年の両方が超過 → 1行にまとめる
  const data = { 設定: [] };
  const a = E.buildMaintAlerts(data, [c1, c2, c3, c4, c5], '2026-09-20');
  assert.deepEqual(a.urgent.map((x) => x.custId).sort(), ['C1', 'C5']);
  const r5 = a.urgent.find((x) => x.custId === 'C5');
  assert.equal(r5.kind, '1か月'); assert.equal(r5.others, 1); assert.equal(r5.steps.length, 3);
  assert.equal(a.urgent.find((x) => x.custId === 'C1').days, 72);
  assert.deepEqual(a.notice.map((x) => x.custId), ['C4']);
  assert.equal(a.urgent.filter((x) => x.custId === 'C5').length, 1); // 3回分でも案件は1行だけ
  data.設定 = [{ 項目: 'メンテ確認の開始日', '値(入力)': '2026-08-01' }]; // 7/10予定のC1は開始日より前なので出さない
  assert.deepEqual(E.buildMaintAlerts(data, [c1], '2026-09-20').urgent, []);
  assert.ok(E.mapHref('江戸川区南篠崎町4-15-10').startsWith('https://www.google.com/maps/dir/?api=1'));
  assert.ok(E.mapHref('江戸川区南篠崎町4-15-10').endsWith(encodeURIComponent('江戸川区南篠崎町4-15-10')));
});

test('メンテ: 日付でも記号(○)でも、何か入っていれば対応済みになる', () => {
  const mk = (extra) => E.enrichCustomer({ 顧客ID: 'C1', 契約日: '2026-05-01', 顧客名: '甲　太郎', 完工日: '2026-06-10', '契約金額(万円)': 100, ...extra });
  const q = (c) => E.buildMaintAlerts({ 設定: [] }, [c], '2026-09-20').urgent.length;
  assert.equal(q(mk({})), 1);
  assert.equal(q(mk({ メンテ1か月: '2026-07-15' })), 0);
  assert.equal(q(mk({ メンテ1か月: '○' })), 0);
});

test('案件アラート(ポータルのみ): キャンセル忘れ=紹介6〜7日で結果が空欄、見積り忘れ=現調から7日で見積日が空', () => {
  const L = (o) => ({ 反響ID: 'R', 反響日: '2026-08-01', 邸名: 'A邸', 担当: '乙', 区分: 'ポータル', 媒体: 'ヌリカエ', ...o });
  const data = { 設定: [], 顧客: [{ 顧客名: '契約済み\u3000太郎', 契約日: '2026-09-16' }], 反響: [
    L({ 反響ID: 'c7', 邸名: '契約済み邸', 反響日: '2026-09-14' }), // 同じ苗字で反響日以後に契約済み(IDが無くても分かる)
    L({ 反響ID: 'c1', 反響日: '2026-09-14' }), // 紹介から6日・結果空 → 緊急(残り1日)
    L({ 反響ID: 'c2', 反響日: '2026-09-13' }), // 7日 → 今日まで
    L({ 反響ID: 'c3', 反響日: '2026-09-12' }), // 8日 → 課金対象になったので出さない
    L({ 反響ID: 'c4', 反響日: '2026-09-17' }), // 3日 → まだ
    L({ 反響ID: 'c5', 反響日: '2026-09-14', 結果: '見積り待ち' }), // 結果が入っている
    L({ 反響ID: 'c6', 反響日: '2026-09-14', 区分: '自社', 媒体: 'チラシ' }), // 自社は対象外
    L({ 反響ID: 'e1', 現調日: '2026-09-10' }), // 現調から10日・見積日なし → 見積り忘れ
    L({ 反響ID: 'e2', 現調日: '2026-09-15' }), // 5日 → まだ
    L({ 反響ID: 'e3', 現調日: '2026-09-10', 見積日: '2026-09-12' }), // 見積り済み
    L({ 反響ID: 'e4', 現調日: '2026-09-10', 区分: '自社', 媒体: 'HP' }), // 自社は対象外
    L({ 反響ID: 'e5', 現調日: '2026-09-10', 結果: '不成約' }), // 結論が出ている
    L({ 反響ID: 'e6', 現調日: '2026-05-01' }), // 対象期間(60日)より古い
  ] };
  const a = E.buildLeadAlerts(data, '2026-09-20');
  assert.deepEqual(a.cancel.map((x) => x.id), ['c2', 'c1']); // 経過の長い順
  assert.deepEqual(a.cancel.map((x) => x.left), [0, 1]); 
  assert.equal(a.cancel[0].limit, '2026-09-20');
  assert.deepEqual(a.estimate.map((x) => x.id), ['e1']);
});


test('訪販は反響日・現調日がなく見積日だけ: 成約率の年は見積日の年で数える', () => {
  const leads = [
    { 区分: '訪販', 担当: 'A', 媒体: '訪問', 見積日: '2026-03-01', 結果: '成約' },
    { 区分: '訪販', 担当: 'A', 媒体: '訪問', 見積日: '2025-03-01', 結果: '不成約' },
    { 区分: '自社', 担当: 'A', 媒体: 'HP', 反響日: '2026-04-01', 結果: '成約' },
  ];
  assert.deepEqual(E.leadYears(leads), [2026, 2025]);
  assert.equal(E.closingTable(leads, 2026).total.win, 2);
  assert.equal(E.closingTable(leads, 2025).total.lose, 1);
});

test('入出金: 入金日が空の案件だけが対象。同じ苗字は名前つき。入金・出金の残りと地域', () => {
  const data = {
    顧客: [
      { 契約日: '2026-05-01', 顧客名: '山田　太郎', '契約金額(万円)': 145, 住所: '江戸川区江戸川9-9-9', 足場発注: 200000, '職人①発注': 450000, 入金日: null },
      { 契約日: '2026-06-01', 顧客名: '佐藤　一郎', '契約金額(万円)': 100, 住所: '足立区新田3-1', 入金日: null },
      { 契約日: '2026-06-10', 顧客名: '佐藤　二郎', '契約金額(万円)': 80, 住所: '埼玉県川口市栄町1-1', 入金日: null },
      { 契約日: '2025-01-10', 顧客名: '済藤　三郎', '契約金額(万円)': 90, 住所: '江戸川区一之江1-1', 入金日: '2025-02-01' },
    ],
    入出金: [
      { 日付: null, 種別: '入金', 顧客名: '山田邸', '金額(円)': 870000 },
      { 日付: '2026-05-20', 種別: '出金', 顧客名: '山田邸', '金額(円)': 500000 },
      { 日付: '2024-01-01', 種別: '入金', 顧客名: '山田邸', '金額(円)': 999999 }, // 契約日より前 = 別の案件の入金(数えない)
      { 日付: '2026-06-05', 種別: '入金', 顧客名: '佐藤邸(一郎)', '金額(円)': 300000 },
      { 日付: '2025-02-01', 種別: '入金', 顧客名: '済藤邸', '金額(円)': 900000 },
      { 日付: '2026-07-01', 種別: '入金', 顧客名: '見本違い邸', '金額(円)': 1000 }, // 打ち間違い
    ],
  };
  const cb = E.cashBook(data);
  assert.deepEqual(cb.cases.map((c) => c.name), ['山田邸', '佐藤邸(一郎)', '佐藤邸(二郎)']);
  const m = cb.cases[0];
  assert.equal(m.region, '江戸川');
  assert.equal(m.unpaidIn, 1450000 - 870000);
  assert.equal(m.ordered, 650000);
  assert.equal(m.unpaidOut, 150000);
  assert.equal(cb.cases[1].unpaidIn, 1000000 - 300000);
  assert.equal(cb.cases[2].region, '川口市栄町');
  assert.equal(E.regionOf('埼玉県川口市栄町1-1'), '川口市栄町');
  assert.equal(cb.totalUnpaidIn, 580000 + 700000 + 800000);
  assert.deepEqual(cb.unknown, ['見本違い邸']); // 入金日が入った済藤邸は間違いではない
});


// ---- インセン(架空の数字) ----
const incCase = (o) => ({ 契約日: '2026-01-10', '契約金額(万円)': 110, 材料費: 200000, 顧客名: '見本　一郎', 担当C: 'ア', 入金日: '2026-03-31', 集客経路: '訪問', ...o });
const incRun = (cases, adj = [], settings = []) => {
  const data = { 顧客: cases, インセン調整: adj, 設定: settings };
  return E.incentiveLines(data, E.enrichAll(data));
};

test('インセン: 着地利益×20%。クロだけなら100%。計上月は入金日の翌月', () => {
  const [l] = incRun([incCase({})]);
  assert.equal(l.landing, 800000);      // 100万 − 20万
  assert.equal(l.amount, 160000);       // 80万 × 20%
  assert.equal(l.role, 'クロ');
  assert.equal(l.month, '2026-04');
});
test('インセン: ポータルは10%。月末の入金日でも翌月末を越えない', () => {
  const [l] = incRun([incCase({ 集客経路: 'ヌリカエ', 入金日: '2026-01-31' })]);
  assert.equal(l.rate, 0.1);
  assert.equal(l.amount, 80000);
  assert.equal(l.month, '2026-02');
});
test('インセン: クロとアポがいれば 40%:60%。アポだけなら60%。入金日がなければ対象外', () => {
  const ls = incRun([incCase({ 担当A: 'イ' }), incCase({ 顧客名: '見本　二郎', 担当C: '', 担当A: 'イ' }), incCase({ 顧客名: '見本　三郎', 入金日: '' })]);
  assert.equal(ls.length, 3);
  assert.deepEqual(ls.slice(0, 2).map((l) => [l.person, l.amount]), [['ア', 64000], ['イ', 96000]]);
  assert.equal(ls[2].amount, 96000); // アポだけ = 160000 × 60%
});
test('インセン: 調整シートの金額を優先する(対象ごと・案件全体)', () => {
  const two = incCase({ 担当A: 'イ' });
  const a = incRun([two], [{ 顧客名: '見本　一郎', '対象(クロ/アポ)': 'クロ', '上書きする金額(円)': 100000, 理由: '特別' }]);
  assert.deepEqual(a.map((l) => [l.person, l.amount, l.adjusted, l.reason]), [['ア', 100000, true, '特別'], ['イ', 96000, false, '']]);
  const b = incRun([two], [{ 顧客名: '見本　一郎', '対象(クロ/アポ)': '', '上書きする金額(円)': 200000, 理由: '' }]);
  assert.deepEqual(b.map((l) => l.amount), [80000, 120000]);
  assert.equal(b[0].adjusted, true);
  assert.equal(b[0].calc, 64000); // 計算上の金額も残す
});
test('インセン: 経費未入力・マイナスに注意を付ける。担当者の選択肢と月別合計', () => {
  const ls = incRun([incCase({ 材料費: 0 }), incCase({ 顧客名: '見本　四郎', 材料費: 1500000 })], [], [{ 項目: 'インセン対象外の担当', '値(入力)': 'ウ' }]);
  assert.deepEqual(ls.map((l) => l.warn), [['経費が未入力'], ['着地利益がマイナス']]);
  const ls2 = incRun([incCase({ 担当C: 'ウ' }), incCase({ 顧客名: '見本　五郎' })]);
  const data = { 設定: [{ 項目: 'インセン対象外の担当', '値(入力)': 'ウ' }] };
  assert.deepEqual(E.incentivePersons(data, ls2), ['ア']);
  assert.deepEqual(E.incentiveMonths(ls2, 'ア'), [{ month: '2026-04', count: 1, amount: 160000, adjusted: 0 }]);
});

test('利益率の担当別: クロ40%:アポ60%の重みで数え、件数は共同でも1件。タブの人は最新年の契約者', () => {
  const base = { 契約日: '2026-02-01', '契約金額(万円)': 110, 完工日: '2026-03-01', 集客経路: '訪問' };
  const data = { 顧客: [
    { ...base, 顧客名: 'a', 担当C: 'ア', 材料費: 200000 },                    // 着地 80万 / 税抜 100万
    { ...base, 顧客名: 'b', 担当C: 'ア', 担当A: 'イ', 材料費: 500000 },       // 着地 50万 / 税抜 100万
    { ...base, 契約日: '2024-02-01', 顧客名: 'c', 担当C: 'ウ' },
  ], 設定: [] };
  const cu = E.enrichAll(data);
  assert.deepEqual(E.profitPersons(data, cu), ['ア', 'イ']);
  const a = E.profitByMedia(E.forPerson(cu, 'ア')).all.byYear[2026];
  assert.equal(a.count, 2);
  assert.equal(Math.round(a.rate * 1000) / 1000, Math.round(((800000 + 500000 * 0.4) / (1000000 + 1000000 * 0.4)) * 1000) / 1000);
  const i = E.profitByMedia(E.forPerson(cu, 'イ')).all.byYear[2026];
  assert.equal(i.count, 1);
  assert.equal(Math.round(i.rate * 100), 50);
});

// ---- 年間収支(架空の数字) ----
const gridRow = (a, b, vals) => [a, b, null, ...vals, null];
const pad12 = (first) => [...first, ...Array(12 - first.length).fill(null)];
const annualData = (extra = {}) => ({
  顧客: [{ 契約日: '2026-01-10', '契約金額(万円)': 110, 顧客名: 'a', 担当C: 'ア', 集客経路: '訪問' }],
  年間収支: { 2026: [
    ['2026年', null, null, '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '合計'],
    gridRow('売上高', null, pad12([999])), gridRow('現場支払', null, pad12([300, 400])), gridRow('入金', null, pad12([1000, 900])),
    gridRow('粗利益', null, pad12([700, 500])),
    gridRow('固定', '家賃', pad12([100, 100])), gridRow(null, '広告', pad12([50, 50])),
    gridRow('変動', 'ガソリン', pad12([10, 20])), gridRow(null, '合計', pad12([160, 170])),
    gridRow('純利益', null, pad12([540, 330])),
    gridRow('設備費', '事務所', pad12([20])), gridRow(null, '合計', pad12([20])),
  ] },
  入出金: [{ 日付: '2026-02-05', 種別: '入金', 金額: 0, '金額(円)': 5000 }, { 日付: '2026-02-20', 種別: '出金', '金額(円)': 1200 }],
  設定: [], ...extra,
});
test('年間収支: 売上高は契約月の自動集計。粗利益 = 入金 − 現場支払、純利益 = 粗利益 − 固定 − 変動 − 設備費', () => {
  const d = annualData();
  const b = E.annualBook(d, E.enrichAll(d), 2026);
  assert.equal(b.standard, true);
  assert.equal(b.months[0].sales, 1100000);           // シートの 999 ではなく顧客シートから
  assert.equal(b.months[0].gross, 700);
  assert.equal(b.months[0].fixed, 150);
  assert.equal(b.months[0].variable, 10);
  assert.equal(b.months[0].net, 700 - 150 - 10 - 20);
  assert.equal(b.months[1].net, 500 - 150 - 20);
  assert.deepEqual(b.items.map((i) => [i.group, i.name]), [['固定', '家賃'], ['固定', '広告'], ['変動', 'ガソリン']]);
  assert.equal(b.total('net', 2), 520 + 330);
});
test('年間収支: 切替月からは入出金シートの日付ベース', () => {
  const d = annualData({ 設定: [{ 項目: '年間収支の切替月', '値(入力)': '2026-02' }] });
  const b = E.annualBook(d, E.enrichAll(d), 2026);
  assert.equal(b.months[0].income, 1000);              // 1月は年別シートの入力値
  assert.equal(b.months[1].income, 5000);              // 2月は入出金シート
  assert.equal(b.months[1].paid, 1200);
  assert.equal(b.months[1].fromLedger, true);
  assert.equal(b.months[2].income, 0);                 // 3月以降も入出金(記録なし=0)
});
test('年間収支: 合計の行が項目の合計と合わない古い形式は、シートの純利益をそのまま使う', () => {
  const d = annualData();
  d.年間収支[2026][8] = gridRow(null, '合計', pad12([0, 0]));
  const b = E.annualBook(d, E.enrichAll(d), 2026);
  assert.equal(b.standard, false);
  assert.equal(b.months[0].net, 540);
  assert.equal(E.annualBook(d, E.enrichAll(d), 2030), null);
});

// ---- 経費の見直し(架空の数字) ----
const spendData = () => {
  const mk = (y, gas, food) => [
    ['x', null, null, '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '合計'].map((v, i) => (i === 0 ? `${y}年` : v)),
    gridRow('売上高', null, pad12([0])), gridRow('現場支払', null, pad12([0])), gridRow('入金', null, pad12([0])), gridRow('粗利益', null, pad12([0])),
    gridRow('固定', '家賃', pad12(Array(12).fill(100))), gridRow('変動', 'ガソリン代', pad12(gas)), gridRow(null, '飲食費', pad12(food)),
    gridRow(null, '合計', Array.from({ length: 12 }, (_, m) => 100 + (gas[m] || 0) + (food[m] || 0))),
    gridRow('純利益', null, pad12([0])),
  ];
  return { 顧客: [], 設定: [], 入出金: [], 年間収支: { 2025: mk(2025, [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]), 2026: mk(2026, [20, 10, 30, 10, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) } };
};
test('経費の見直し: 終わった月の数(今年は先月まで、1月だけ今月)', () => {
  assert.equal(E.completedMonths(2026, '2026-09-21'), 8);
  assert.equal(E.completedMonths(2026, '2026-01-15'), 1);
  assert.equal(E.completedMonths(2025, '2026-09-21'), 12);
});
test('経費の見直し: 項目ごとの合計・構成比・前年同期との差', () => {
  const d = spendData();
  const S = E.expenseSummary(d, [], 2026, 4);
  const gas = S.rows.find((r) => r.name === 'ガソリン代');
  assert.equal(gas.total, 70);
  assert.equal(gas.prev, 40);
  assert.equal(gas.diff, 30);
  assert.equal(S.rows.find((r) => r.name === '飲食費'), undefined);   // 今年の金額が0の項目は一覧に出さない
  assert.equal(S.total, 400 + 70);
  assert.equal(S.fixed, 400);
  assert.equal(S.variable, 70);
  assert.equal(Math.round(gas.share * 1000), Math.round((70 / 470) * 1000));
});
test('経費の見直し: 月の平均・多い月・少ない月・前年の平均', () => {
  const x = E.expenseSeries(spendData(), [], 2026, 'ガソリン代', 4);
  assert.equal(x.avg, 17.5);
  assert.deepEqual([x.max.month, x.max.value, x.min.month, x.min.value], [3, 30, 2, 10]);   // 同じ最少 10 は最初の月(2月)
  assert.equal(x.prevAvg, 10);
  assert.deepEqual(E.expenseNames(spendData(), [], 2025), ['家賃', 'ガソリン代', '飲食費']);
});

test('経費の見直し: 前年にない項目は比べない(前年・差は null)。固定↔変動を移した項目は比べる', () => {
  const d = spendData();
  d.年間収支[2026].splice(8, 0, gridRow(null, 'チラシ', pad12([50, 50, 50, 50])));        // 前年にない項目(変動)
  d.年間収支[2026][6][0] = null;                                                          // 2026年はガソリン代が「固定」の下に入る(前年は変動)
  const S = E.expenseSummary(d, [], 2026, 4);
  const flyer = S.rows.find((r) => r.name === 'チラシ');
  assert.equal(flyer.total, 200);
  assert.equal(flyer.prev, null);
  assert.equal(flyer.diff, null);
  assert.equal(S.newCount >= 1, true);
  assert.equal(S.cmpTotal, S.rows.filter((r) => r.prev !== null).reduce((t, r) => t + r.total, 0));
  assert.equal(S.cmpTotal + 200 <= S.total, true);
  const gas = S.rows.find((r) => r.name === 'ガソリン代');
  assert.equal(gas.group, '固定');
  assert.equal(gas.prev, 40);                 // 前年は変動だったが、名前が同じなので比べる
});
test('着工: 着工月ごとの担当別集計と、着工予定・着工日なしの拾い出し', () => {
  const mk = (o) => ({ 契約日: '2026-01-10', '契約金額(万円)': 110, '粗利(万円・手入力)': 40, 担当C: 'ア', 集客経路: '訪問', ...o });
  const data = { 顧客: [mk({ 顧客名: 'a', 着工日: '2026-02-05' }), mk({ 顧客名: 'b', 着工日: '2026-02-20', 集客経路: '追加' }), mk({ 顧客名: 'c', 着工日: '2026-10-05' }), mk({ 顧客名: 'd' }), mk({ 顧客名: 'e', 契約日: '2025-12-01', 着工日: '2026-01-15' })] };
  const cu = E.enrichAll(data);
  const pm = E.personMonthly(cu, 2026, '着工日');
  assert.equal(pm.rows[1].all.sales, 220);       // 2月着工の売上(追加も売上には入る)
  assert.equal(pm.rows[1].all.count, 1);         // 追加は本数に数えない
  assert.equal(pm.rows[0].all.count, 1);         // 契約は2025年でも、着工が2026年1月なら1月
  assert.equal(pm.total.all.gross, 40 * 4);      // 着工日のある4件(dは着工日なし)
  const bl = E.startBacklog(cu, '2026-09-21');
  assert.deepEqual(bl.scheduled.map((r) => r.name), ['c']);
  assert.deepEqual(bl.none.map((r) => r.name), ['d']);
  assert.equal(bl.scheduledSales, 110);
  assert.deepEqual(E.startYears(cu), [2026]);
});

test('粗利の列: 見出しが「予想粗利」などに変わっていても拾う。「56万」のような文字も数える', () => {
  assert.equal(E.enrichCustomer({ 契約日: '2026-01-10', '契約金額(万円)': 100, '粗利(万円・手入力)': 30 })._gross, 30);
  assert.equal(E.enrichCustomer({ 契約日: '2026-01-10', '契約金額(万円)': 100, 予想粗利: '56万' })._gross, 56);
  assert.equal(E.enrichCustomer({ 契約日: '2026-01-10', '契約金額(万円)': 100, '予想粗利(万円)': '1,200' })._gross, 1200);
  assert.equal(E.enrichCustomer({ 契約日: '2026-01-10', '契約金額(万円)': 100 })._gross, 0);
});

test('今いる担当者: 最新の契約年に契約がある人だけ。設定で上書きできる。集客分析・インセンの選択肢に使う', () => {
  const custs = E.enrichAll({
    顧客: [
      { 契約日: '2025-03-01', '契約金額(万円)': 100, 担当C: '辞めた', 入金日: '2025-05-01' },
      { 契約日: '2026-02-01', '契約金額(万円)': 100, 担当C: '甲', 入金日: '2026-03-10' },
      { 契約日: '2026-02-11', '契約金額(万円)': 200, 担当C: '乙', 担当A: '甲', 入金日: '2026-03-15' },
    ],
  });
  assert.deepEqual(E.activePersons({}, custs).sort(), ['乙', '甲']);
  assert.deepEqual(E.activePersons({ 設定: [{ 項目: '現役の担当', '値(入力)': '乙' }] }, custs), ['乙']);
  const lines = E.incentiveLines({}, custs.map((c) => ({ ...c, 顧客名: 'x' + c['契約日'] })));
  assert.deepEqual(E.incentivePersons({}, lines, custs).sort(), ['乙', '甲']); // 辞めた人は出ない
  assert.deepEqual(E.incentivePersons({ 設定: [{ 項目: 'インセン対象', '値(入力)': '乙' }] }, lines, custs), ['乙']);
  assert.deepEqual(E.incentivePersons({ 設定: [{ 項目: 'インセン対象外の担当', '値(入力)': '甲' }] }, lines, custs), ['乙']);
});

test('売上ボード: 累計・本数・PH(月平均)。月数は今月まで、担当の入った月から', () => {
  const mk = (d, sales, gross, C, A, extra = {}) => ({ 契約日: d, 顧客名: d + C, '契約金額(万円)': sales, '粗利(万円・手入力)': gross, 担当C: C, 担当A: A, ...extra });
  const data = { 顧客: [
    mk('2025-04-10', 100, 30, '甲'), mk('2025-05-10', 200, 60, '甲'),
    mk('2026-01-10', 100, 30, '甲'), mk('2026-02-10', 200, 60, '甲'), mk('2026-02-20', 50, 10, '乙'), mk('2026-03-05', 40, 8, '乙', undefined, { 集客経路: '追加' }),
  ] };
  const custs = E.enrichAll(data);
  const b = E.salesBoard(data, custs, 2026, { today: '2026-04-15', persons: ['甲', '乙'] });
  const kou = b.blocks.find((x) => x.name === '甲'), otsu = b.blocks.find((x) => x.name === '乙'), all = b.blocks.find((x) => x.name === null);
  assert.equal(b.endM, 4);
  assert.deepEqual(kou.months.slice(0, 4).map((m) => m.cumSales), [100, 300, 300, 300]);
  assert.deepEqual(kou.months.slice(0, 4).map((m) => m.count), [1, 1, 0, 0]);
  assert.equal(kou.months[4].future, true);
  assert.equal(kou.months[4].cumSales, null);
  assert.equal(kou.total.sales, 300);
  assert.equal(kou.ph.months, 4); assert.equal(kou.ph.sales, 75); // 甲は前の年からいるので1月から4か月
  assert.equal(otsu.ph.months, 3); // 乙の最初の契約は2026-02 → 2〜4月の3か月
  assert.equal(otsu.total.sales, 90); assert.equal(otsu.total.count, 1); // 追加工事は売上には入るが本数に数えない
  assert.equal(otsu.ph.sales, 30);
  assert.equal(all.ph.months, 4); // 全体は会社の最初の契約(2025-04)から → 2026年は1月から
  assert.equal(all.total.sales, 390); assert.equal(all.total.count, 3);
  assert.equal(all.months[2].cumCount, 3); // 3月までの累計本数(1月1・2月2。3月は追加工事なので数えない)
  // 担当の開始月を設定で決める
  const d2 = { ...data, 設定: [{ 項目: '担当の開始月', '値(入力)': '乙=2026-01' }] };
  assert.equal(E.salesBoard(d2, custs, 2026, { today: '2026-04-15', persons: ['乙'] }).blocks[0].ph.months, 4);
  // 前の年: 甲は4月から、12月まで(2025年は4〜12月の9か月)
  const y25 = E.salesBoard(data, custs, 2025, { today: '2026-04-15', persons: ['甲'] }).blocks[0];
  assert.equal(y25.ph.months, 9); assert.equal(y25.total.sales, 300);
});

test('ポータル: 番手×紹介数の成約率(結果待ちは分母に入れない・空欄は数えない)', () => {
  const P = (n, k, r, extra = {}) => ({ 区分: 'ポータル', 反響日: '2026-03-01', 担当: 'A', 紹介数: n, 番手: k, 結果: r, ...extra });
  const leads = [
    P(3, 1, '成約'), P(3, 1, '不成約'), P(3, 1, '成約'), P(3, 2, '不成約'), P(3, 2, '見積り待ち'), P('3社', '1番手', '成約'),
    P(2, 1, '成約'), P(2, 2, '不成約'),
    P(null, null, '成約'), // 空欄
    { 区分: '自社', 反響日: '2026-03-01', 紹介数: 3, 番手: 1, 結果: '成約' }, // ポータル以外は見ない
    P(3, 1, '成約', { 反響日: '2025-03-01' }),
  ];
  const ps = E.portalSlots(leads, { year: 2026 });
  assert.deepEqual(ps.counts, [2, 3]); assert.deepEqual(ps.ranks, [1, 2]);
  assert.equal(ps.missing, 1); assert.equal(ps.entered, 8);
  const g1 = ps.grid[0]; // 1番手
  assert.equal(g1.cells[1].win, 3); assert.equal(g1.cells[1].lose, 1); assert.equal(g1.cells[1].rate, 0.75);
  const g2 = ps.grid[1];
  assert.equal(g2.cells[1].rate, 0); assert.equal(g2.cells[1].pending, 1); // 見積り待ちは分母に入れない
  assert.equal(g1.total.rate, 4 / 5);
  assert.equal(ps.byCount[0].rate, 0.5);
  assert.equal(E.portalSlots(leads, { year: 2025 }).all.win, 1);
  assert.equal(E.portalSlots(leads, { year: 2026, person: 'B' }).entered, 0);
});

test('インセンの担当: config の既定(塩野だけ)。設定シートが優先。該当者がいなければ全員', () => {
  const custs = E.enrichAll({ 顧客: [
    { 契約日: '2026-02-01', '契約金額(万円)': 100, 担当C: '甲', 入金日: '2026-03-10', 顧客名: 'a' },
    { 契約日: '2026-02-11', '契約金額(万円)': 200, 担当C: '甲', 担当A: '乙', 入金日: '2026-03-15', 顧客名: 'b' },
  ] });
  const lines = E.incentiveLines({}, custs);
  assert.deepEqual(E.incentivePersons({}, lines, custs, ['乙']), ['乙']);
  assert.deepEqual(E.incentivePersons({ 設定: [{ 項目: 'インセン対象', '値(入力)': '甲' }] }, lines, custs, ['乙']), ['甲']);
  assert.deepEqual(E.incentivePersons({}, lines, custs, ['丙']).sort(), ['乙', '甲']);
  assert.deepEqual(E.incentivePersons({}, lines, custs, []).sort(), ['乙', '甲']);
});

test('割合: 追加・下請けを除いた契約件数のシェア(累計・年・まとめ)', () => {
  const mk = (d, route, sales, name = d + route) => ({ 契約日: d, 顧客名: name, 集客経路: route, '契約金額(万円)': sales });
  const custs = E.enrichAll({ 顧客: [
    mk('2025-01-01', 'ヌリカエ', 100), mk('2025-02-01', 'ヌリカエ', 100, 'b'), mk('2025-03-01', '訪問', 200),
    mk('2026-01-01', '訪問', 300), mk('2026-02-01', '追加', 500), mk('2026-03-01', 'MIRAI', 50), mk('2026-04-01', '窓口', 100, 'c'),
  ] });
  const all = E.routeShare(custs);
  assert.equal(all.total.count, 5);
  assert.deepEqual(all.rows.map((r) => [r.name, r.count]), [['訪問', 2], ['ヌリカエ', 2], ['窓口', 1]]);
  assert.equal(all.rows[0].shareCount, 0.4);
  assert.equal(all.total.sales, 800);
  assert.equal(all.total.doneCount, 0); assert.equal(all.rows[0].rate, null); // 完工日がないので利益率は出さない
  const y26 = E.routeShare(custs, { year: 2026 });
  assert.equal(y26.total.count, 2);
  const g = E.routeShare(custs, { by: 'group' });
  assert.equal(g.rows.find((r) => r.name === 'ポータル').count, 3); // ヌリカエ2+窓口1
});

test('割合: 利益・利益率は完工日がある案件だけで計算(着地利益 ÷ 税抜売上)', () => {
  const mk = (route, sales, extra) => ({ 契約日: '2026-01-10', 顧客名: route + sales, 集客経路: route, '契約金額(万円)': sales, ...extra });
  const custs = E.enrichAll({ 顧客: [
    mk('訪問', 110, { 完工日: '2026-03-01', 材料費: 300000 }), // 税抜100万 − 経費30万 = 利益70万
    mk('訪問', 220, { 完工日: '2026-03-02', 材料費: 500000 }), // 税抜200万 − 50万 = 150万
    mk('訪問', 330), // 完工日なし → 利益率の計算に入れない(件数には数える)
    mk('追加', 110, { 完工日: '2026-03-01' }),
  ] });
  const r = E.routeShare(custs);
  const h = r.rows[0];
  assert.equal(h.count, 3); assert.equal(h.doneCount, 2);
  assert.equal(Math.round(h.profit), 220);
  assert.ok(Math.abs(h.rate - 220 / 300) < 1e-9);
  assert.equal(r.total.count, 3);
});

test('施工地図: 住所を区市・町名・丁目に分ける(全角・「丁目」表記も読む)', () => {
  assert.deepEqual(E.parseAddress('江戸川区東小岩3-12-4'), { city: '江戸川区', town: '東小岩', chome: 3, key: '江戸川区東小岩3-12-4' });
  const b = E.parseAddress('東京都江戸川区南篠崎町4丁目15-10');
  assert.equal(b.city, '江戸川区'); assert.equal(b.town, '南篠崎町'); assert.equal(b.chome, 4);
  const c = E.parseAddress('江戸川区西一之江２－９－１２');
  assert.equal(c.town, '西一之江'); assert.equal(c.chome, 2);
  assert.equal(E.parseAddress('埼玉県新座市野火止5-1-1').city, '新座市');
  assert.equal(E.parseAddress('江戸川区役所').town, '役所');
  assert.equal(E.parseAddress('江戸川区西小松川町28-3').chome, null); // 番地であって丁目ではない
  assert.equal(E.parseAddress('江戸川区東葛西6-1-1').chome, 6);
  assert.equal(E.parseAddress('江戸川区東葛西12丁目3').chome, 12);
  assert.equal(E.parseAddress('').city, '');
});

test('施工地図: 追加工事は同じ邸にまとめる。未完工の邸だけ色分け。丁目ごとに並べる', () => {
  const mk = (name, addr, extra = {}) => ({ 契約日: '2026-01-10', 顧客名: name, 住所: addr, '契約金額(万円)': 100, 集客経路: '訪問', ...extra });
  const custs = E.enrichAll({ 顧客: [
    mk('山田　太郎', '江戸川区東小岩3-1-1', { 完工日: '2026-03-01' }),
    mk('山田　太郎邸追', '江戸川区東小岩3-1-1', { 集客経路: '追加' }), // 追加は完工日なし → 山田邸は未完工
    mk('鈴木　花子', '江戸川区東小岩3-9-9', { 完工日: '2026-03-01' }),
    mk('佐藤　次郎', '江戸川区東小岩5-2-2'),
    mk('丙野　三郎', '江戸川区南小岩1-1-1', { 完工日: '2026-04-01' }),
    mk('下請　施主', '江戸川区南小岩2-2-2', { 集客経路: 'MIRAI' }),
    mk('丁野　一郎', '市川市八幡1-1-1', { 完工日: '2026-04-01' }),
    mk('田中　四郎', '江戸川区東小岩3-1-1', { 集客経路: '追加', 顧客名: '別の名前邸追' }), // 住所が同じなら同じ邸にまとめる
  ] });
  const houses = E.mapHouses(custs);
  assert.equal(houses.length, 5); // 山田(追加込み)・鈴木・佐藤・丙野・丁野(下請けは出さない)
  const y = houses.find((x) => x.name === '山田');
  assert.equal(y.members.length, 3); assert.equal(y.done, false); assert.equal(y.hasAdd, true);
  assert.deepEqual(E.mapCities(houses).map((x) => x.city), ['江戸川区', '市川市']);
  const blocks = E.mapBlocks(houses, { city: '江戸川区' });
  assert.deepEqual(blocks.map((b) => [b.town, b.count, b.open]), [['東小岩', 3, 2], ['南小岩', 1, 0]]);
  assert.deepEqual(blocks[0].chomes.map((c) => [c.label, c.items.length]), [['3丁目', 2], ['5丁目', 1]]);
  assert.equal(blocks[0].chomes[0].items[0].done, false); // 未完工が先
  assert.deepEqual(E.mapBlocks(houses, { city: '江戸川区', onlyOpen: true }).map((b) => [b.town, b.count]), [['東小岩', 2]]);
});

test('口コミ: 〇がある契約の割合と何人に1人(追加・下請けは数えない)。完工した契約だけにもできる', () => {
  const mk = (d, extra) => ({ 契約日: d, 顧客名: d + JSON.stringify(extra), 集客経路: '訪問', 担当C: '甲', '契約金額(万円)': 100, ...extra });
  const custs = E.enrichAll({ 顧客: [
    mk('2025-01-01', { 口コミ: '〇', 完工日: '2025-03-01' }),
    mk('2025-02-01', { 口コミ: '×', 完工日: '2025-03-01' }), // × は書いていない
    mk('2025-03-01', { 完工日: '2025-04-01' }),
    mk('2026-01-01', { 口コミ: '◯', 完工日: '2026-02-01' }),
    mk('2026-02-01', {}), // 工事中
    mk('2026-03-01', { 集客経路: '追加', 口コミ: '〇' }), // 追加は数えない
    mk('2026-04-01', { 集客経路: 'MIRAI', 口コミ: '〇' }), // 下請けも数えない
  ] });
  const r = E.reviewStats(custs);
  assert.equal(r.all.total, 5); assert.equal(r.all.wrote, 2);
  assert.equal(r.all.rate, 0.4); assert.equal(r.all.oneIn, 2.5);
  assert.deepEqual(r.byYear.map((x) => [x.name, x.total, x.wrote]), [[2026, 2, 1], [2025, 3, 1]]);
  const d = E.reviewStats(custs, { onlyDone: true });
  assert.equal(d.all.total, 4); assert.equal(d.all.wrote, 2);
  assert.equal(r.byPerson[0].name, '甲');
  const no = E.reviewList(custs, { filter: 'no', onlyDone: true, today: '2026-09-20' });
  assert.equal(no.length, 2); // 完工していて口コミ欄が空(× の1件と、空欄の1件)
  assert.equal(no[0].doneDate, '2025-04-01');
  assert.equal(E.reviewList(custs, { filter: 'yes' }).length, 2);
  assert.equal(E.reviewList(custs, { filter: 'no' }).length, 3); // 工事中の1件を含む
  assert.equal(E.reviewList(custs, { filter: 'all' }).length, 5);
  const nl = E.reviewList(custs, { filter: 'no' });
  assert.deepEqual(nl.map((x) => x.doneDate), ['2025-04-01', '2025-03-01', '']); // 完工日の新しい順。完工日が空のものは最後
  assert.ok(E.placeHref('江戸川区東小岩3-1-1').startsWith('https://www.google.com/maps/search/?api=1&query=%E6%B1%9F'));
  assert.equal(E.reviewStats([]).all.oneIn, null);
});
