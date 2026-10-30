import { h, segmented, kpi } from '../ui.js';
import * as E from '../engine.js';

const yen = (n) => E.fmtInt(n);

// 年収: 「給与データ」シートに入れた実際の基本給・歩合を、年タブで切り替えて見る。計算式はなく、入力した金額そのまま。
export function render(ctx) {
  const persons = E.salaryPersons(ctx.data);
  const st = (ctx.state.salary ||= { person: '', year: 0 });
  if (!persons.includes(st.person)) st.person = persons[0] || '';
  const person = st.person;

  const head = (sub) => h('div', { class: 'head' }, h('div', null, h('h1', null, '年収'), h('div', { class: 'sub' }, sub)));

  if (!person) {
    return h('div', null, head('月ごとの基本給・歩合の実績'),
      h('div', { class: 'card' }, h('p', { class: 'notice' }, 'スプレッドシートに「給与データ」シートがまだありません(対象者・年・月・基本給・歩合の列)。')));
  }

  const years = E.salaryYears(ctx.data, person);
  const nowYear = new Date().getFullYear();
  if (!years.includes(st.year)) st.year = years.includes(nowYear) ? nowYear : (years[0] || 0);
  const y = E.salaryYear(ctx.data, person, st.year);

  const personSel = persons.length > 1
    ? segmented(persons.map((p) => ({ value: p, label: p })), person, (v) => { st.person = v; st.year = 0; ctx.rerender(); }, '対象者')
    : null;
  const yearSel = years.length
    ? segmented(years.map((yy) => ({ value: yy, label: `${yy}年` })), st.year, (v) => { st.year = v; ctx.rerender(); }, '年')
    : null;

  const body = !years.length
    ? h('div', { class: 'card' }, h('p', { class: 'notice' }, `${person}さんの給与データがまだありません。`))
    : h('div', null,
      h('div', { class: 'grid' },
        kpi(`${st.year}年の年収`, yen(y.total), '円', `基本給 ${yen(y.totalBase)}円 ＋ 歩合 ${yen(y.totalCommission)}円`),
        kpi('基本給の合計', yen(y.totalBase), '円'),
        kpi('歩合の合計', yen(y.totalCommission), '円')),
      h('div', { class: 'card' },
        h('h2', null, `${st.year}年の月別`),
        h('div', { class: 'tablewrap' }, h('table', null,
          h('thead', null, h('tr', null, h('th', null, '月'), h('th', { class: 'num' }, '基本給'), h('th', { class: 'num' }, '歩合'), h('th', { class: 'num' }, '月合計'))),
          h('tbody', null,
            y.rows.map((r) => h('tr', null,
              h('td', null, `${r.month}月`),
              h('td', { class: 'num' }, yen(r.base)),
              h('td', { class: 'num' }, yen(r.commission)),
              h('td', { class: 'num strong' }, yen(r.base + r.commission)))),
            h('tr', { class: 'tot' },
              h('td', null, '合計'),
              h('td', { class: 'num' }, yen(y.totalBase)),
              h('td', { class: 'num' }, yen(y.totalCommission)),
              h('td', { class: 'num' }, yen(y.total))))))));

  return h('div', null,
    head(`${person}さんの月ごとの基本給・歩合の実績です(給料は前月分を当月20日に支給)`),
    h('div', { class: 'controls' }, personSel, yearSel),
    body,
    h('p', { class: 'small muted' }, '基本給・歩合は、スプレッドシートの「給与データ」シートに入力した実際の金額です。自動計算ではありません(表の月は対象の月です)。'));
}
