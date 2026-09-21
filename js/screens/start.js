import { h, segmented, kpi } from '../ui.js';
import * as E from '../engine.js';
import { personTable, noPersonNotice } from './persontable.js';

const man = (n) => n.toLocaleString('ja-JP', { maximumFractionDigits: 1 });
const dl = (d) => (d ? `${Number(d.slice(0, 4))}/${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '未定');

// 着工粗利: 着工月ごとの、担当別の売上・粗利・着工本数。あわせて、これから着工する契約(着工予定)と着工日が未入力の契約
export function render(ctx) {
  const st = (ctx.state.start ||= { year: 0, all: {} });
  const years = E.startYears(ctx.custs);
  const nowYear = new Date().getFullYear();
  if (!years.includes(st.year)) st.year = years.includes(nowYear) ? nowYear : (years[0] || 0);
  const today = E.todayStr();
  const bl = E.startBacklog(ctx.custs, today);
  const pm = E.personMonthly(ctx.custs, st.year, '着工日');

  const list = (key, title, note, rows, withStart) => {
    if (!rows.length) return null;
    const shown = st.all[key] ? rows : rows.slice(0, 10);
    return h('div', { class: 'card' },
      h('h2', null, `${title}(${rows.length}件)`),
      h('p', { class: 'small muted', style: 'margin:4px 0 8px' }, note),
      h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', { class: 'stick' }, '顧客名'), h('th', null, '契約日'), withStart ? h('th', null, '着工日') : null, h('th', { class: 'num' }, '契約金額(万円)'), h('th', { class: 'num' }, '予想粗利(万円)'))),
        h('tbody', null, shown.map((r) => h('tr', null,
          h('td', { class: 'stick' }, r.name, r.add ? h('span', { class: 'gtag' }, '追加') : null, r.sub ? h('span', { class: 'gtag' }, '下請け') : null),
          h('td', null, dl(r.contractDate)), withStart ? h('td', null, dl(r.startDate)) : null,
          h('td', { class: 'num' }, man(r.sales)), h('td', { class: 'num' }, man(r.gross))))))),
      rows.length > 10 ? h('div', { class: 'controls', style: 'margin:10px 0 0' },
        h('button', { class: 'btn', type: 'button', onclick: () => { st.all[key] = !st.all[key]; ctx.rerender(); } }, st.all[key] ? '先頭だけ表示' : `すべて表示(${rows.length}件)`)) : null);
  };

  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, '着工粗利'),
      h('div', { class: 'sub' }, '着工月ごとの、担当別の売上・粗利・着工本数(売上・粗利は万円)。契約月の見方は「売上」タブです'))),
    h('div', { class: 'grid' },
      kpi('これから着工する契約', bl.scheduled.length, '件', `契約金額 ${man(bl.scheduledSales)}万円 / 予想粗利 ${man(bl.scheduledGross)}万円`),
      kpi('着工日が未入力の契約', bl.none.length, '件', bl.none.length ? `契約金額 ${man(bl.noneSales)}万円 / 予想粗利 ${man(bl.noneGross)}万円` : 'なし')),
    h('div', { class: 'controls', style: 'margin-top:16px' },
      years.length ? segmented(years.map((y) => ({ value: y, label: `${y}年` })), st.year, (v) => { st.year = v; ctx.rerender(); }, '年') : null),
    years.length ? h('div', { class: 'card' }, personTable(pm, { monthLabel: '着工月', countLabel: '着工数' }),
      h('p', { class: 'small muted' }, '売上は税込、粗利は契約時に入れた予想粗利で、着工日の月に入れています(契約月ではありません)。担当が二人いる案件は クロ(担当C)40% : アポ(担当A)60% に分けています。着工数は共同担当の案件を二人とも1本と数え、「全体」は重複なしです。追加工事と下請け(MIRAI)は本数に数えませんが、売上・粗利には含みます。'),
      noPersonNotice(pm)) : h('div', { class: 'card' }, h('p', { class: 'notice' }, '着工日が入っている契約がまだありません。')),
    list('sched', 'これから着工する契約', `着工日が今日(${dl(today)})より後の契約です。着工日の早い順です。`, bl.scheduled, true),
    list('none', '着工日が未入力の契約', '契約日はあるのに着工日が入っていない契約です。まだ着工していないのか、入力もれか、キャンセルになったのかを確認してください。契約日の古い順です。', bl.none, false));
}
