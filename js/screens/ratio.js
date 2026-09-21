import { h, segmented } from '../ui.js';
import * as E from '../engine.js';

const man = (n) => Math.round(n).toLocaleString('ja-JP');
const pct = (x, d = 1) => (x === null || x === undefined ? '–' : `${(x * 100).toFixed(d)}%`);

// 割合: 集客経路ごとの 契約件数・割合・売上・利益・利益率。追加工事と下請けは入れない
export function render(ctx) {
  const st = (ctx.state.ratio ||= { year: 0, by: 'route' });
  const years = E.yearsOfCustomers(ctx.custs);
  if (st.year !== 0 && !years.includes(st.year)) st.year = 0;
  const cur = E.routeShare(ctx.custs, { year: st.year || null, by: st.by });
  const scope = st.year ? `${st.year}年` : '累計';
  const rowEl = (r, cls) => h('tr', { class: cls },
    h('td', { class: 'nowrap' }, r.name),
    h('td', { class: 'num' }, r.count),
    h('td', { class: 'num' }, pct(r.shareCount)),
    h('td', { class: 'num' }, man(r.sales)),
    h('td', { class: `num ${r.profit < 0 ? 'negv' : ''}` }, r.doneCount ? man(r.profit) : '–'),
    h('td', { class: `num strongv ${r.rate !== null && r.rate < 0 ? 'negv' : ''}` }, pct(r.rate),
      r.count ? h('div', { class: 'tiny muted' }, `完工${r.doneCount}/${r.count}`) : null));
  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, '割合'),
      h('div', { class: 'sub' }, '集客経路ごとの、契約件数・割合・売上・利益・利益率。年は契約日の年です'))),
    h('div', { class: 'controls' },
      segmented([{ value: 0, label: '累計' }, ...years.map((y) => ({ value: y, label: `${y}年` }))], st.year, (v) => { st.year = v; ctx.rerender(); }, '期間'),
      segmented([{ value: 'route', label: '集客経路ごと' }, { value: 'group', label: 'まとめて' }], st.by, (v) => { st.by = v; ctx.rerender(); }, '分け方')),
    h('div', { class: 'card' },
      h('h2', null, `${scope}の集客経路ごとの成績`),
      cur.total.count === 0 ? h('p', { class: 'notice' }, 'この期間の契約がありません。') : h('div', { class: 'tablewrap' }, h('table', { class: 'ratiotable' },
        h('thead', null, h('tr', null, h('th', null, st.by === 'group' ? '媒体' : '集客経路'), h('th', { class: 'num' }, '契約件数'), h('th', { class: 'num' }, '割合'),
          h('th', { class: 'num' }, '売上(万円)'), h('th', { class: 'num' }, '利益(万円)'), h('th', { class: 'num' }, '利益率'))),
        h('tbody', null, cur.rows.map((r) => rowEl(r)), rowEl(cur.total, 'tot')))),
      h('p', { class: 'small muted' }, '売上は税込です。利益は 税抜売上 − 実際の経費(着地利益)、利益率は 利益 ÷ 税抜売上 で、完工日が入っている案件だけで計算しています(下の「完工◯/◯」は、その件数 / 契約件数)。割合は契約件数の割合です。追加工事(集客経路が「追加」・顧客名に「邸追」)と下請け(MIRAI)は、集客ではないので入れていません。')));
}
