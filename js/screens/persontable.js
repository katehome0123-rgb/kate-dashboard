import { h } from '../ui.js';
import * as E from '../engine.js';

const f = (n) => n.toLocaleString('ja-JP', { maximumFractionDigits: 1 });

// 月 × 担当 × (売上・粗利・本数) の表。売上タブ(契約月)と着工粗利タブ(着工月)で共通。pm = E.personMonthly(...) の結果
export function personTable(pm, { monthLabel, countLabel }) {
  const groups = [...pm.persons.map((p) => ({ key: p, label: p })), { key: null, label: '全体' }];
  const cell = (bucket, g) => (g.key === null ? bucket.all : bucket.by[g.key]) || { sales: 0, gross: 0, count: 0 };
  const tds = (bucket) => groups.flatMap((g, gi) => {
    const c = cell(bucket, g);
    const empty = !c.sales && !c.gross && !c.count;
    const cl = `num ${gi === 0 ? 'gstart' : ''} ${g.key === null ? 'allcol' : ''}`;
    return [
      h('td', { class: cl + ' gstart' }, empty ? '–' : f(c.sales)),
      h('td', { class: `num ${g.key === null ? 'allcol' : ''}` }, empty ? '–' : f(c.gross)),
      h('td', { class: `num ${g.key === null ? 'allcol' : ''}` }, empty ? '–' : c.count),
    ];
  });
  const head1 = h('tr', null, h('th', { rowspan: 2, class: 'stick' }, monthLabel), groups.map((g) => h('th', { colspan: 3, class: `gstart gh ${g.key === null ? 'allcol' : ''}` }, g.label)));
  const head2 = h('tr', null, groups.flatMap((g) => [
    h('th', { class: `num gstart ${g.key === null ? 'allcol' : ''}` }, '売上'), h('th', { class: `num ${g.key === null ? 'allcol' : ''}` }, '粗利'), h('th', { class: `num ${g.key === null ? 'allcol' : ''}` }, countLabel)]));
  const body = pm.rows.map((r) => h('tr', null, h('td', { class: 'stick' }, `${r.month}月`), tds(r)));
  const foot = h('tr', { class: 'tot' }, h('td', { class: 'stick' }, '合計'), tds(pm.total));
  return h('div', { class: 'tablewrap salestable' }, h('table', null, h('thead', null, head1, head2), h('tbody', null, body, foot)));
}
export const noPersonNotice = (pm) => (pm.persons.includes(E.NO_PERSON)
  ? h('p', { class: 'notice' }, `担当が入っていない契約があります(「${E.NO_PERSON}」の列)。スプレッドシートの担当C・担当Aを確認してください。`) : null);
