import { h } from '../ui.js';
import * as E from '../engine.js';
import { noPersonNotice } from './persontable.js';

const int = (n) => Math.round(n).toLocaleString('ja-JP');
const one = (n) => n.toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// 1年ぶんの表: 担当ごとに 売上 / 粗利 / 累計売上 の3行、月が横。本数は ( ) で売上の右に。右端に 合計 と PH(月平均)。
function yearTable(board) {
  const cols = [];
  for (let m = 1; m <= 12; m++) cols.push(`${m}月`);
  const head = h('tr', null,
    h('th', { class: 'stick c1' }, '担当'), h('th', { class: 'stick c2' }, '項目'),
    cols.flatMap((c) => [h('th', { class: 'num' }, c), h('th', { class: 'cnt' }, '')]),
    h('th', { class: 'num gstart' }, '合計'), h('th', { class: 'cnt' }, ''),
    h('th', { class: 'num gstart' }, 'PH'), h('th', { class: 'cnt' }, ''));
  const rows = [];
  for (const b of board.blocks) {
    const all = b.name === null ? 'allrow' : '';
    const first = (cls) => `${cls} ${all} ${rows.length ? '' : ''}`;
    const cell = (v, future, cls = '') => h('td', { class: `num ${cls} ${all}` }, future || v === null ? '' : (v ? int(v) : '–'));
    const cnt = (v, future, span) => h('td', { class: `cnt ${all}`, rowspan: span }, future || v === null ? '' : `(${v})`);
    const ph = b.ph;
    // 売上の行
    rows.push(h('tr', { class: 'grp' },
      h('td', { class: `stick c1 person ${all}`, rowspan: 3 }, b.label),
      h('td', { class: `stick c2 ${all}` }, '売上'),
      b.months.flatMap((m) => [cell(m.sales, m.future), cnt(m.count, m.future, 2)]),
      cell(b.total.sales, false, 'gstart strongv'), cnt(b.total.count, false, 2),
      h('td', { class: `num gstart strongv ${all}` }, ph ? int(ph.sales) : '–'), h('td', { class: `cnt ${all}`, rowspan: 2 }, ph ? `(${one(ph.count)})` : '')));
    // 粗利の行
    rows.push(h('tr', null,
      h('td', { class: `stick c2 ${all}` }, '粗利'),
      b.months.map((m) => cell(m.gross, m.future)),
      cell(b.total.gross, false, 'gstart strongv'),
      h('td', { class: `num gstart strongv ${all}` }, ph ? int(ph.gross) : '–')));
    // 累計売上の行
    rows.push(h('tr', { class: 'cum' },
      h('td', { class: `stick c2 ${all}` }, '累計売上'),
      b.months.flatMap((m) => [cell(m.cumSales, m.future), h('td', { class: `cnt ${all}` }, m.future ? '' : `(${m.cumCount})`)]),
      h('td', { class: `${all}`, colspan: 4 }, '')));
  }
  return h('div', { class: 'tablewrap salesboard' }, h('table', null, h('thead', null, head), h('tbody', null, rows)));
}

// 年間の合計と月平均(PH)。スマホでも横にスクロールせず見られる小さな表
function summaryTable(board) {
  const rows = board.blocks.map((b) => {
    const all = b.name === null ? 'allrow' : '';
    const ph = b.ph;
    return h('tr', null,
      h('td', { class: `person ${all}` }, b.label),
      h('td', { class: `num ${all}` }, int(b.total.sales)), h('td', { class: `num strongv ${all}` }, ph ? int(ph.sales) : '–'),
      h('td', { class: `num ${all}` }, int(b.total.gross)), h('td', { class: `num strongv ${all}` }, ph ? int(ph.gross) : '–'),
      h('td', { class: `num ${all}` }, b.total.count), h('td', { class: `num ${all}` }, ph ? one(ph.count) : '–'));
  });
  return h('div', { class: 'tablewrap' }, h('table', { class: 'sumtable' },
    h('thead', null,
      h('tr', null, h('th', { rowspan: 2 }, '担当'), h('th', { colspan: 2, class: 'gh' }, '売上'), h('th', { colspan: 2, class: 'gh' }, '粗利'), h('th', { colspan: 2, class: 'gh' }, '契約本数')),
      h('tr', null, ['年間', '月平均', '年間', '月平均', '年間', '月平均'].map((t, i) => h('th', { class: `num ${i % 2 ? 'ph' : ''}` }, t)))),
    h('tbody', null, rows)));
}

// 売上: 年ごとに 担当 × 月(売上・粗利・累計売上。本数は括弧、右端に合計とPH)
export function render(ctx) {
  const years = E.yearsOfCustomers(ctx.custs);
  const boards = years.map((y) => ({ y, b: E.salesBoard(ctx.data, ctx.custs, y) }));
  const pmAll = E.personMonthly(ctx.custs, years[0] || new Date().getFullYear());
  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, '売上'),
      h('div', { class: 'sub' }, '契約月ごとの、担当別の売上・粗利(万円)。( )は契約本数'))),
    boards.map(({ y, b }) => h('div', { class: 'card' },
      h('h2', null, `${y}年`),
      summaryTable(b),
      h('h3', { class: 'sub2' }, '月ごと'),
      yearTable(b),
      b.hidden.length ? h('p', { class: 'small muted' }, `${b.hidden.join('・')} の分は、担当の行には出さず「全体」にだけ含めています。`) : null)),
    h('div', { class: 'card' },
      h('p', { class: 'small muted' }, '売上は税込、粗利は契約時に入れた予想粗利です。担当が二人いる案件は クロ(担当C)40% : アポ(担当A)60% に分けています。( )の契約本数は、共同担当の案件を二人とも1本と数え、「全体」は重複なしです。追加工事と下請け(MIRAI)は本数に数えませんが、売上・粗利には含みます。'),
      h('p', { class: 'small muted' }, 'PH(パーヘッド)は、年間の合計を月数で割った月平均です。月数は、その年の1月(担当が入った月がそれより後ならその月)から今月まで(過ぎた年は12月まで)で数えています。累計売上は、その月までの売上の合計です。'),
      noPersonNotice(pmAll)));
}
