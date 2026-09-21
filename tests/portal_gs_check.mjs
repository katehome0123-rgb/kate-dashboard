// PortalCode.gs の計算部分(移す行の組み立て・キャンセル判定)の確認。Apps Script の外で動かす。
// 使い方: node tests/portal_gs_check.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../apps-script/PortalCode.gs', import.meta.url), 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src + '\nthis.planMove_ = planMove_; this.isCancelEdit_ = isCancelEdit_;', ctx);

const head = ['反響日', '邸名', '担当', '結果', '紹介数', '番手'];
// 1) はじめて: キャンセルタブが空
let p = ctx.planMove_(head, ['2026-09-01', '見本邸', '塩野', 'キャンセル', 3, 2], [], '2026/09/21');
assert.deepEqual(p.head, [...head, 'キャンセル日']);
assert.deepEqual(p.row, ['2026-09-01', '見本邸', '塩野', 'キャンセル', 3, 2, '2026/09/21']);
// 2) 古いキャンセルタブ(紹介数・番手が無かった時の見出し)→ 新しい列は末尾に足し、キャンセル日の位置は変えない
const old = ['反響日', '邸名', '担当', '結果', 'キャンセル日'];
p = ctx.planMove_(head, ['2026-09-01', '見本邸', '塩野', 'キャンセル', 3, 2], old, '2026/09/21');
assert.deepEqual(p.head, ['反響日', '邸名', '担当', '結果', 'キャンセル日', '紹介数', '番手']);
assert.deepEqual(p.row, ['2026-09-01', '見本邸', '塩野', 'キャンセル', '2026/09/21', 3, 2]);
// 3) ポータルの列の順番が入れ替わっても、見出しの名前で正しい列に入る
p = ctx.planMove_(['邸名', '反響日', '結果'], ['乙邸', '2026-01-02', 'キャンセル'], ['反響日', '邸名', '結果', 'キャンセル日'], 'T');
assert.deepEqual(p.row, ['2026-01-02', '乙邸', 'キャンセル', 'T']);
// 判定: 結果の列を『キャンセル』にしたときだけ
assert.equal(ctx.isCancelEdit_('ポータル', head, 4, 5, 'キャンセル'), true);
assert.equal(ctx.isCancelEdit_('ポータル', head, 4, 5, ' キャンセル '), true);
assert.equal(ctx.isCancelEdit_('ポータル', head, 4, 5, '成約'), false);
assert.equal(ctx.isCancelEdit_('ポータル', head, 3, 5, 'キャンセル'), false); // 別の列
assert.equal(ctx.isCancelEdit_('ポータル', head, 4, 1, 'キャンセル'), false); // 見出し行
assert.equal(ctx.isCancelEdit_('キャンセル', head, 4, 5, 'キャンセル'), false); // 別のタブ
assert.equal(ctx.isCancelEdit_('ポータル', head, 4, 5, undefined), false);
console.log('PortalCode.gs: ok');
