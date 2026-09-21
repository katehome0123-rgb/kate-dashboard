import { h, segmented, kpi } from '../ui.js';
import * as E from '../engine.js';

const pct = (x) => (x === null ? '–' : `${(x * 100).toFixed(1)}%`);
const one = (r) => (r.oneIn ? `約${r.oneIn.toFixed(1)}人に1人` : '–');
const dl = (d) => `${Number(d.slice(0, 4))}/${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

// 口コミ: 契約した人のうち、何人に1人が書いてくれたか(追加・下請けを除く)
export function render(ctx) {
  const st = (ctx.state.review ||= { onlyDone: false, filter: 'no', all: false });
  const active = E.activePersons(ctx.data, ctx.custs);
  const rs = E.reviewStats(ctx.custs, { onlyDone: st.onlyDone, persons: active });
  const list = E.reviewList(ctx.custs, { filter: st.filter, onlyDone: st.onlyDone, today: E.todayStr() });
  const table = (title, first, rows, nameFn = (r) => r.name) => h('div', { class: 'card' },
    h('h2', null, title),
    h('div', { class: 'tablewrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, first), h('th', { class: 'num' }, '契約'), h('th', { class: 'num' }, '書いてくれた'), h('th', { class: 'num' }, '書いてくれた割合'), h('th', { class: 'num' }, '何人に1人'))),
      h('tbody', null, rows.map((r) => h('tr', null, h('td', { class: 'nowrap' }, nameFn(r)), h('td', { class: 'num' }, r.total), h('td', { class: 'num' }, r.wrote), h('td', { class: 'num strongv' }, pct(r.rate)), h('td', { class: 'num' }, one(r))))))));
  const shown = st.all ? list : list.slice(0, 15);
  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, '口コミ'),
      h('div', { class: 'sub' }, '契約した人のうち、口コミを書いてくれた人の割合と、何人に1人か'))),
    h('div', { class: 'controls' },
      segmented([{ value: false, label: 'すべての契約' }, { value: true, label: '完工した契約だけ' }], st.onlyDone, (v) => { st.onlyDone = v; ctx.rerender(); }, '対象')),
    h('div', { class: 'grid' },
      kpi('書いてくれた割合', pct(rs.all.rate), '', `${rs.all.total}件の契約のうち ${rs.all.wrote}件`),
      kpi('何人に1人', rs.all.oneIn ? rs.all.oneIn.toFixed(1) : '–', '人に1人', st.onlyDone ? '完工した契約だけで数えています' : 'まだ工事中の契約も含めて数えています')),
    h('div', { class: 'card' },
      h('h2', null, `契約の一覧(${list.length}件)`),
      h('div', { class: 'controls', style: 'margin:6px 0 8px' },
        segmented([{ value: 'yes', label: '〇あり' }, { value: 'no', label: '〇なし' }, { value: 'all', label: 'すべて' }], st.filter, (v) => { st.filter = v; st.all = false; ctx.rerender(); }, '口コミ')),
      h('p', { class: 'small muted', style: 'margin:0 0 8px' }, st.filter === 'no'
        ? '口コミ欄が空の契約です。上で「完工した契約だけ」にすると、口コミをお願いできる邸になります(完工日の新しい順)。お願いしたら、顧客シートの「口コミ」欄に〇を入れてください。住所を押すとGoogleマップが開きます。'
        : '完工日の新しい順です。住所を押すとGoogleマップが開きます。'),
      list.length ? h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, '顧客名'), h('th', { class: 'num' }, '口コミ'), h('th', null, '契約日'), h('th', null, '完工日'), h('th', null, '住所'), h('th', null, '集客経路'), h('th', null, '担当'))),
        h('tbody', null, shown.map((r) => h('tr', null,
          h('td', { class: 'nowrap' }, r.name),
          h('td', { class: `num ${r.wrote ? 'okgreen' : 'muted'}` }, r.wrote ? '〇' : '–'),
          h('td', null, dl(r.contractDate)),
          h('td', null, r.doneDate ? dl(r.doneDate) : h('span', { class: 'muted' }, '未完工')),
          h('td', null, r.address ? h('a', { href: E.placeHref(r.address), target: '_blank', rel: 'noopener', class: 'tel', title: 'Googleマップで開く' }, r.address) : ''),
          h('td', null, r.route), h('td', null, r.person)))))) : h('p', { class: 'notice' }, 'この条件に当てはまる契約がありません。'),
      list.length > 15 ? h('div', { class: 'controls', style: 'margin:10px 0 0' }, h('button', { class: 'btn', type: 'button', onclick: () => { st.all = !st.all; ctx.rerender(); } }, st.all ? '先頭だけ表示' : `すべて表示(${list.length}件)`)) : null),
    table('年ごと(契約日の年)', '年', rs.byYear, (r) => `${r.name}年`),
    table('集客経路ごと', '集客経路', rs.byRoute),
    table('担当ごと', '担当', rs.byPerson),
    h('p', { class: 'small muted' }, '口コミ欄に〇(×・なし・- 以外の何か)が入っている契約を「書いてくれた」と数えます。追加工事と下請け(MIRAI)は数えません。'));
}
