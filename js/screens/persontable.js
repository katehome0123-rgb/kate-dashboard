import { h } from '../ui.js';
import * as E from '../engine.js';

const f = (n) => n.toLocaleString('ja-JP', { maximumFractionDigits: 1 });

// 月 × 担当 × (売上・粗利・本数) の表。売上タブ(契約月)と着工粗利タブ(着工月)で共通。pm = E.personMonthly(...) の結果
// detail/isOpen/onToggleを渡すと、月の行をタップ(クリック)して開閉できるようになり、detail(month)が返す
// 案件ごとの一覧(邸名・売上・粗利)を行の下に表示する(着工粗利タブで使用)。
export function personTable(pm, { monthLabel, countLabel, detail, isOpen, onToggle }) {
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
  const colCount = 1 + groups.length * 3;
  const monthRows = (r) => {
    if (!detail) return [h('tr', null, h('td', { class: 'stick' }, `${r.month}月`), tds(r))];
    const open = !!isOpen(r.month);
    const main = h('tr', { class: 'clickrow', tabindex: 0, 'aria-expanded': String(open), onclick: () => onToggle(r.month),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(r.month); } } },
      h('td', { class: 'stick' }, `${open ? '▾' : '▸'} ${r.month}月`), tds(r));
    if (!open) return [main];
    const items = detail(r.month);
    const inner = items.length
      ? h('table', { class: 'inner' }, h('tbody', null, items.map((it) => h('tr', null,
        h('td', null, it.name, it.add ? h('span', { class: 'gtag' }, '追加') : null, it.sub ? h('span', { class: 'gtag' }, '下請け') : null,
          it.person ? h('span', { class: 'small muted' }, ` ${it.person}`) : null),
        h('td', { class: 'num' }, f(it.sales)), h('td', { class: 'num' }, f(it.gross))))))
      : h('div', { class: 'small muted' }, 'この月に着工した案件はありません');
    return [main, h('tr', { class: 'detail' }, h('td', { colspan: colCount }, inner))];
  };
  const body = pm.rows.flatMap(monthRows);
  const foot = h('tr', { class: 'tot' }, h('td', { class: 'stick' }, '合計'), tds(pm.total));
  return h('div', { class: 'tablewrap salestable' }, h('table', null, h('thead', null, head1, head2), h('tbody', null, body, foot)));
}
export const noPersonNotice = (pm) => (pm.persons.includes(E.NO_PERSON)
  ? h('p', { class: 'notice' }, `担当が入っていない契約があります(「${E.NO_PERSON}」の列)。スプレッドシートの担当C・担当Aを確認してください。`) : null);
