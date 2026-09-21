import { h } from '../ui.js';
import * as E from '../engine.js';
import { incentivePdfBlob, downloadBlob } from '../pdf.js';

const yen = (n) => E.fmtInt(n);
const ymLabel = (ym) => `${ym.slice(0, 4)}年${Number(ym.slice(5, 7))}月`;
const dateLabel = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '');

// インセン: 担当者ごと・計上月(=入金日の翌月)ごとの明細。「PDFにする」で A4 横の印刷画面が開く。
export function render(ctx) {
  const st = (ctx.state.inc ||= { person: '', month: '' });
  const lines = E.incentiveLines(ctx.data, ctx.custs);
  const persons = E.incentivePersons(ctx.data, lines);
  if (!persons.includes(st.person)) { st.person = persons[0] || ''; st.month = ''; }
  const months = E.incentiveMonths(lines, st.person);
  if (!months.some((m) => m.month === st.month)) st.month = months[0] ? months[0].month : '';

  if (!persons.length) {
    return h('div', null, h('div', { class: 'head' }, h('div', null, h('h1', null, 'インセン'))),
      h('div', { class: 'card' }, h('p', { class: 'notice' }, '入金日が入っていて、担当(クロ・アポ)がいる案件がまだありません。')));
  }

  const rows = lines.filter((l) => l.person === st.person && l.month === st.month).sort((a, b) => a.payDate.localeCompare(b.payDate));
  const total = rows.reduce((s, l) => s + l.amount, 0);
  const warnRows = rows.filter((l) => l.warn.length);
  const adjRows = rows.filter((l) => l.adjusted);

  const personSel = h('select', { 'aria-label': '担当者', onchange: (e) => { st.person = e.target.value; st.month = ''; ctx.rerender(); } },
    persons.map((p) => h('option', { value: p, selected: p === st.person }, p)));
  const monthSel = h('select', { 'aria-label': '計上月', onchange: (e) => { st.month = e.target.value; ctx.rerender(); } },
    months.map((m) => h('option', { value: m.month, selected: m.month === st.month }, `${ymLabel(m.month)}分`)));

  const note = (l) => {
    const t = [];
    if (l.adjusted) t.push(h('span', { class: 'adjmark' }, '調整あり'), l.reason ? ` ${l.reason}` : '', ` (計算上は ${yen(l.calc)}円)`);
    if (l.warn.length) t.push(h('span', { class: 'noprint warnv' }, ` ※${l.warn.join('・')}`));
    return t;
  };
  const sheet = h('div', { class: 'card incsheet' },
    h('div', { class: 'inchead' },
      h('div', null, h('h2', null, 'インセン明細'), h('div', { class: 'small muted' }, `${ymLabel(st.month)}分(前月に入金があった案件)`)),
      h('div', { class: 'incwho' }, h('b', null, `${st.person} 様`), h('div', { class: 'small muted' }, `発行日 ${E.todayStr().replaceAll('-', '/')}`))),
    h('div', { class: 'tablewrap' }, h('table', { class: 'inctable' },
      h('thead', null, h('tr', null,
        h('th', { class: 'stick' }, '顧客名'), h('th', { class: 'hide-sm' }, '集客経路'), h('th', null, '入金日'),
        h('th', { class: 'num hide-sm' }, '税抜売上'), h('th', { class: 'num hide-sm' }, '経費'), h('th', { class: 'num hide-sm' }, '着地利益'),
        h('th', { class: 'num hide-sm' }, '歩合率'), h('th', null, '役割・配分'), h('th', { class: 'num' }, 'インセン(円)'), h('th', null, '備考'))),
      h('tbody', null,
        rows.map((l) => h('tr', null,
          h('td', { class: 'stick' }, l.name), h('td', { class: 'hide-sm' }, l.route), h('td', null, dateLabel(l.payDate)),
          h('td', { class: 'num hide-sm' }, yen(l.taxEx)), h('td', { class: 'num hide-sm' }, yen(l.costs)), h('td', { class: 'num hide-sm' }, yen(l.landing)),
          h('td', { class: 'num hide-sm' }, `${Math.round(l.rate * 100)}%`), h('td', null, `${l.role}${Math.round(l.share * 100)}%`),
          h('td', { class: 'num strong' }, yen(l.amount)), h('td', { class: 'notecol' }, note(l)))),
        h('tr', { class: 'tot' }, h('td', { class: 'stick' }, `合計(${rows.length}件)`), h('td', { class: 'hide-sm' }), h('td', null), h('td', { class: 'hide-sm' }), h('td', { class: 'hide-sm' }), h('td', { class: 'hide-sm' }), h('td', { class: 'hide-sm' }), h('td', null), h('td', { class: 'num' }, yen(total)), h('td', null))))),
    h('p', { class: 'small muted incfoot' }, '計算式: 着地利益(税抜売上 − 経費)× 歩合率 × 配分。歩合率は通常20%、ポータル・リショップ・ヌリカエ・窓口は10%。配分はクロとアポがいる案件でクロ40%・アポ60%(アポのみは60%、クロのみは100%)。入金日の翌月に計上。'));

  const monthTable = h('div', { class: 'card noprint' },
    h('h2', null, `${st.person} さんの月別合計`),
    h('div', { class: 'tablewrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, '計上月'), h('th', { class: 'num' }, '件数'), h('th', { class: 'num' }, 'インセン(円)'), h('th', null, ''))),
      h('tbody', null, months.slice(0, 24).map((m) => h('tr', { class: 'clickrow', tabindex: 0, 'aria-current': m.month === st.month ? 'true' : null,
        onclick: () => { st.month = m.month; ctx.rerender(); scrollTo({ top: 0 }); },
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); st.month = m.month; ctx.rerender(); } } },
        h('td', null, ymLabel(m.month)), h('td', { class: 'num' }, m.count), h('td', { class: 'num' }, yen(m.amount)),
        h('td', null, m.adjusted ? h('span', { class: 'adjmark' }, '調整あり') : null)))))),
    h('p', { class: 'small muted' }, '行をタップすると、その月の明細を表示します。'));

  return h('div', null,
    h('div', { class: 'head noprint' }, h('div', null, h('h1', null, 'インセン'),
      h('div', { class: 'sub' }, '担当者と月を選んで、明細を確認し、PDFをダウンロードできます。金額を変えたいときは、スプレッドシートの「インセン調整」に入れてください'))),
    h('div', { class: 'controls noprint' }, personSel, monthSel,
      h('button', { class: 'btn primary', type: 'button', onclick: async (e) => {
        const btn = e.currentTarget, label = btn.textContent;
        btn.disabled = true; btn.textContent = 'PDFを作っています…';
        try {
          const model = { title: 'インセン明細', sub: `${ymLabel(st.month)}分(前月に入金があった案件)`, who: st.person, issued: E.todayStr().replaceAll('-', '/'), rows, total, count: rows.length };
          downloadBlob(await incentivePdfBlob(model), `インセン明細_${st.person}_${st.month}.pdf`);
        } catch (err) { alert('PDFを作れませんでした: ' + (err.message || err)); }
        btn.disabled = false; btn.textContent = label;
      } }, 'PDFをダウンロード')),
    warnRows.length ? h('p', { class: 'notice noprint', style: 'margin-bottom:12px' }, `経費が入っていない、または着地利益がマイナスの案件が${warnRows.length}件あります(備考の「※」)。金額が正しいか確認してください。`) : null,
    adjRows.length ? h('p', { class: 'small muted noprint' }, `この月は調整ありが${adjRows.length}件あります。PDFにも「調整あり」と表示されます。`) : null,
    sheet, monthTable);
}
