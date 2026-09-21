import { h, trendEl, segmented } from '../ui.js';
import * as E from '../engine.js';

// 利益率 = 着地利益 ÷ 税抜売上。媒体 × 年、前の年との比較つき
export function render(ctx) {
  const st = (ctx.state.profitTab ||= '');
  const persons = E.profitPersons(ctx.data, ctx.custs);
  const tab = st === '' || persons.includes(st) ? st : '';
  const base = tab ? E.forPerson(ctx.custs, tab) : ctx.custs;
  const pm = E.profitByMedia(base);
  const { years } = pm;
  const cnt = (c) => (c.doneCount < c.count ? `${c.count}件(完工${c.doneCount})` : `${c.count}件`);
  const cellTd = (c) => h('td', { class: 'num' }, c.rate === null ? '–' : E.fmtPct(c.rate, 1), c.count ? h('div', { class: 'small muted' }, cnt(c)) : null);
  const trendTd = (r) => {
    const y = years[years.length - 1];
    const d = E.trend(r.byYear, years, y);
    return h('td', null, trendEl(d), d === null ? null : h('div', { class: 'small muted' }, `${years[years.length - 2]}年比`));
  };
  const line = (r, cls) => h('tr', { class: cls || '' },
    h('td', null, r.group),
    years.map((y) => cellTd(r.byYear[y])),
    h('td', { class: 'num' }, E.fmtPct(r.total.rate, 1), h('div', { class: 'small muted' }, cnt(r.total))),
    trendTd(r));
  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, '利益率'),
      h('div', { class: 'sub' }, '利益率 = 着地利益 ÷ 税抜売上。年は契約年。右端は最新年が前の年より良くなったか')))
    ,
    h('div', { class: 'controls' },
      segmented([...persons.map((p) => ({ value: p, label: p })), { value: '', label: '全体' }], tab, (v) => { ctx.state.profitTab = v; ctx.rerender(); }, '表示する人')),
    h('div', { class: 'card' },
      h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, '媒体'), years.map((y) => h('th', { class: 'num' }, `${y}年`)), h('th', { class: 'num' }, '累計'), h('th', null, '変化'))),
        h('tbody', null,
          pm.rows.map((r) => line(r)),
          line(pm.all, 'tot'),
          pm.extra.length ? h('tr', { class: 'sec' }, h('td', { colspan: years.length + 3 }, '参考(契約本数には数えない案件)')) : null,
          pm.extra.map((r) => line(r))))),
      h('p', { class: 'small muted' }, '訪問には足場、ポータルにはヌリカエ・窓口・リショップを含めています。「全体」は追加・下請けも含めた数字で、媒体の行は含めていません。完工日が入っていない案件は経費が確定していないため、件数には数えても利益率の計算には入れていません(表の「完工○」は計算に使った件数)。' + (tab ? `${tab}さんの表は、${tab}さんがクロ(担当C)またはアポ(担当A)の案件を、売上と同じ割合(クロ40%・アポ60%)で数えた利益率です。件数は共同担当でも1件と数えます。` : ''))));
}
