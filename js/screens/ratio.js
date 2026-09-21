import { h, segmented, donut } from '../ui.js';
import * as E from '../engine.js';

const man = (n) => Math.round(n).toLocaleString('ja-JP');
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const OTHER = '#9c9b95'; // 「その他」は灰色

// 割合: 集客経路ごとの契約件数(または売上)のシェア。追加工事と下請けは入れない
export function render(ctx) {
  const st = (ctx.state.ratio ||= { year: 0, metric: 'count', by: 'route' });
  const years = E.yearsOfCustomers(ctx.custs);
  if (st.year !== 0 && !years.includes(st.year)) st.year = 0;
  const cnt = st.metric === 'count';
  const cur = E.routeShare(ctx.custs, { year: st.year || null, by: st.by });
  // 色は名前ごとに固定(累計の件数の多い順に上位7つへ割り当て。年や指標を切り替えても同じ名前は同じ色)
  const base = E.routeShare(ctx.custs, { by: st.by }).rows;
  const slotOf = new Map(base.slice(0, 7).map((r, i) => [r.name, i + 1]));
  const color = (name) => (slotOf.has(name) ? `var(--s${slotOf.get(name)})` : OTHER);

  const val = (r) => (cnt ? r.count : r.sales);
  const share = (r) => (cnt ? r.shareCount : r.shareSales);
  const totalVal = cnt ? cur.total.count : cur.total.sales;
  const items = [];
  let other = null;
  for (const r of cur.rows) {
    if (slotOf.has(r.name)) items.push({ name: r.name, value: val(r), color: color(r.name), tip: [['契約件数', `${r.count}件`], ['売上', `${man(r.sales)}万円`], ['割合', pct(share(r))]] });
    else { other ||= { name: 'その他', value: 0, count: 0, sales: 0, color: OTHER }; other.value += val(r); other.count += r.count; other.sales += r.sales; }
  }
  if (other) items.push({ ...other, tip: [['契約件数', `${other.count}件`], ['売上', `${man(other.sales)}万円`], ['割合', pct(totalVal ? other.value / totalVal : 0)]] });

  const scope = st.year ? `${st.year}年` : '累計';
  const rows = cur.rows.map((r) => h('tr', null,
    h('td', { class: 'nowrap' }, h('i', { class: 'dot', style: `background:${color(r.name)}` }), r.name),
    h('td', { class: 'num' }, r.count),
    h('td', { class: 'num' }, man(r.sales)),
    h('td', { class: 'num strongv' }, pct(share(r)))));

  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, '割合'),
      h('div', { class: 'sub' }, '集客経路ごとの契約件数のシェア。年は契約日の年です'))),
    h('div', { class: 'controls' },
      segmented([{ value: 0, label: '累計' }, ...years.map((y) => ({ value: y, label: `${y}年` }))], st.year, (v) => { st.year = v; ctx.rerender(); }, '期間'),
      segmented([{ value: 'count', label: '契約件数' }, { value: 'sales', label: '売上' }], st.metric, (v) => { st.metric = v; ctx.rerender(); }, '指標'),
      segmented([{ value: 'route', label: '集客経路ごと' }, { value: 'group', label: 'まとめて' }], st.by, (v) => { st.by = v; ctx.rerender(); }, '分け方')),
    h('div', { class: 'card' },
      h('h2', null, `${scope}の${cnt ? '契約件数' : '売上'}の割合`),
      cur.total.count === 0 ? h('p', { class: 'notice' }, 'この期間の契約がありません。') : h('div', { class: 'ratiobox' },
        h('div', { class: 'donutwrap' }, donut({ items, centerTop: cnt ? `${cur.total.count}件` : `${man(cur.total.sales)}万円`, centerBottom: cnt ? '契約' : '売上' })),
        h('div', { class: 'tablewrap' }, h('table', null,
          h('thead', null, h('tr', null, h('th', null, st.by === 'group' ? '媒体' : '集客経路'), h('th', { class: 'num' }, '件数'), h('th', { class: 'num' }, '売上(万円)'), h('th', { class: 'num' }, '割合'))),
          h('tbody', null, rows,
            h('tr', { class: 'tot' }, h('td', null, '合計'), h('td', { class: 'num' }, cur.total.count), h('td', { class: 'num' }, man(cur.total.sales)), h('td', { class: 'num' }, '100%')))))),
      h('p', { class: 'small muted' }, `表の「割合」は${cnt ? '契約件数' : '売上'}の割合です。追加工事(集客経路が「追加」・顧客名に「邸追」)と下請け(MIRAI)は、集客ではないので件数にも売上にも入れていません。円グラフの色は、累計で件数の多い上位7つに固定で、それ以外は「その他」(灰色)にまとめています。表にはすべて出ています。`)));
}
