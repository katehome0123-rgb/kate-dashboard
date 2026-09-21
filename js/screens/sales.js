import { h, segmented, barChart } from '../ui.js';
import * as E from '../engine.js';

const f = (n) => n.toLocaleString('ja-JP', { maximumFractionDigits: 1 });

// 売上: 月 × 担当 × (売上・粗利・契約本数) を一枚で
export function render(ctx) {
  const years = E.yearsOfCustomers(ctx.custs);
  const year = years.includes(ctx.state.year) ? ctx.state.year : (years.includes(new Date().getFullYear()) ? new Date().getFullYear() : years[0]);
  const pm = E.personMonthly(ctx.custs, year);
  const groups = [...pm.persons.map((p) => ({ key: p, label: p })), { key: null, label: '全体' }];
  const cell = (bucket, g) => (g.key === null ? bucket.all : bucket.by[g.key]) || { sales: 0, gross: 0, count: 0 };

  const chart = barChart({
    labels: pm.rows.map((r) => `${r.month}月`), unit: '万円', height: 220,
    series: [
      { name: '売上(税込)', slot: 1, values: pm.rows.map((r) => r.all.sales) },
      { name: '予想粗利', slot: 2, values: pm.rows.map((r) => r.all.gross) },
    ],
    tooltip: (i) => ({
      title: `${year}年${i + 1}月(契約月)`,
      rows: groups.flatMap((g) => { const c = cell(pm.rows[i], g); return [[`${g.label} 売上`, `${f(c.sales)} 万円`], [`${g.label} 粗利`, `${f(c.gross)} 万円`], [`${g.label} 本数`, `${c.count} 本`]]; }),
    }),
  });

  const tds = (bucket, cls, bold) => groups.flatMap((g, gi) => {
    const c = cell(bucket, g);
    const empty = !c.sales && !c.gross && !c.count;
    const cl = `num ${gi === 0 ? 'gstart' : ''} ${g.key === null ? 'allcol' : ''}`;
    return [
      h('td', { class: cl + ' gstart' }, empty ? '–' : f(c.sales)),
      h('td', { class: `num ${g.key === null ? 'allcol' : ''}` }, empty ? '–' : f(c.gross)),
      h('td', { class: `num ${g.key === null ? 'allcol' : ''}` }, empty ? '–' : c.count),
    ];
  });
  const head1 = h('tr', null, h('th', { rowspan: 2, class: 'stick' }, '契約月'), groups.map((g) => h('th', { colspan: 3, class: `gstart gh ${g.key === null ? 'allcol' : ''}` }, g.label)));
  const head2 = h('tr', null, groups.flatMap((g) => [
    h('th', { class: `num gstart ${g.key === null ? 'allcol' : ''}` }, '売上'), h('th', { class: `num ${g.key === null ? 'allcol' : ''}` }, '粗利'), h('th', { class: `num ${g.key === null ? 'allcol' : ''}` }, '本数')]));
  const body = pm.rows.map((r) => h('tr', null, h('td', { class: 'stick' }, `${r.month}月`), tds(r)));
  const foot = h('tr', { class: 'tot' }, h('td', { class: 'stick' }, '合計'), tds(pm.total));

  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, '売上'),
      h('div', { class: 'sub' }, '契約月ごとの、担当別の売上・粗利・契約本数(売上・粗利は万円)'))),
    h('div', { class: 'controls' }, segmented(years.map((y) => ({ value: y, label: `${y}年` })), year, (v) => { ctx.state.year = v; ctx.rerender(); }, '年')),
    h('div', { class: 'card' }, h('div', { class: 'tablewrap salestable' }, h('table', null, h('thead', null, head1, head2), h('tbody', null, body, foot))),
      h('p', { class: 'small muted' }, '売上は税込、粗利は契約時に入れた予想粗利です。担当が二人いる案件は クロ(担当C)40% : アポ(担当A)60% に分けています。契約本数は共同担当の案件を二人とも1本と数え、「全体」は重複なしです。追加工事と下請け(MIRAI)は本数に数えませんが、売上・粗利には含みます。'),
      pm.persons.includes(E.NO_PERSON) ? h('p', { class: 'notice' }, `担当が入っていない契約があります(「${E.NO_PERSON}」の列)。スプレッドシートの担当C・担当Aを確認してください。`) : null),
    h('div', { class: 'card' }, h('h2', null, `${year}年 月別の売上と予想粗利(全体)`), chart));
}
