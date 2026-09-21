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
      { 日付: '2026-07-01', 種別: '入金', 顧客名: '松居邸', '金額(円)': 1000 }, // 打ち間違い
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
  assert.deepEqual(cb.unknown, ['松居邸']); // 入金日が入った済藤邸は間違いではない
});

