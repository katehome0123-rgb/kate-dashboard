import { h, segmented, barCell } from '../ui.js';
import * as E from '../engine.js';

// 集客分析: 成約率 = 成約 ÷ (成約+不成約)
export function render(ctx) {
  const st = ctx.state;
  const years = E.leadYears(ctx.data['反響']);
  const persons = E.leadPersons(ctx.data['反響']);
  if (st.aYear !== 0 && !years.includes(st.aYear)) st.aYear = 0;
  const t = E.closingTable(ctx.data['反響'], { year: st.aYear || null, person: st.person });

  const sel = h('select', { 'aria-label': '担当', onchange: (e) => { st.person = e.target.value; ctx.rerender(); } },
    h('option', { value: '' }, '全体'), persons.map((p) => h('option', { value: p, selected: p === st.person }, p)));

  const rowEl = (label, x, cls, sub) => h('tr', { class: cls },
    h('td', { class: sub ? 'sub' : '' }, label),
    h('td', { class: 'num' }, x.leads),
    h('td', { class: 'num' }, x.win),
    h('td', { class: 'num' }, x.lose),
    h('td', { class: 'num muted' }, x.pending),
    h('td', null, barCell(x.rate, E.fmtPct(x.rate, 0), 1)));

  const body = [];
  for (const sec of t.sections) {
    body.push(rowEl(sec.section, sec.total, 'sec'));
    for (const r of sec.rows) body.push(rowEl(r.media, r, '', true));
  }
  body.push(rowEl(st.person ? `${st.person} 合計` : '全体 合計', t.total, 'tot'));

  const scope = `${st.aYear ? st.aYear + '年' : '累計'}・${st.person || '全体'}`;
  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, '集客分析'),
      h('div', { class: 'sub' }, '成約率 = 成約 ÷ (成約 + 不成約)。年は反響日の年です(訪販は見積日の年)'))),
    h('div', { class: 'controls' },
      segmented([{ value: 0, label: '累計' }, ...years.map((y) => ({ value: y, label: `${y}年` }))], st.aYear, (v) => { st.aYear = v; ctx.rerender(); }, '期間'),
      sel),
    h('div', { class: 'card' },
      h('h2', null, `成約率(${scope})`),
      h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, '区分 / 媒体'), h('th', { class: 'num' }, '反響'), h('th', { class: 'num' }, '成約'),
          h('th', { class: 'num' }, '不成約'), h('th', { class: 'num' }, '結果待ち'), h('th', { class: 'num' }, '成約率'))),
        h('tbody', null, body))),
      h('p', { class: 'small muted' }, '「結果待ち」は見積り待ち・長期追客・時期・任せたい・連絡つかず等で、成約率の分母には入れていません。契約後にキャンセルになった案件は成約として数えています。'),
      t.total.leads === 0 ? h('p', { class: 'notice' }, 'この条件に当てはまる反響がありません。') : null));
}
