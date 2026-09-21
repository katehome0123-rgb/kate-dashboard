import { h, segmented } from '../ui.js';
import * as E from '../engine.js';

// 年間収支: 年別シートの升目を、月ごとの表で見る。固定費・変動費・設備費は、行をタップすると項目が開く。
export function render(ctx) {
  const st = (ctx.state.annual ||= { year: 0, unit: 'man', open: {} });
  const years = Object.keys(ctx.data['年間収支'] || {}).map(Number).filter((y) => E.annualBook(ctx.data, ctx.custs, y)).sort((a, b) => b - a);
  const nowYear = new Date().getFullYear();
  if (!years.includes(st.year)) st.year = years.includes(nowYear) ? nowYear : (years[0] || 0);
  const head = (sub) => h('div', { class: 'head' }, h('div', null, h('h1', null, '年間収支'), h('div', { class: 'sub' }, sub)));
  if (!st.year) return h('div', null, head('年別シートがありません'), h('div', { class: 'card' }, h('p', { class: 'notice' }, 'スプレッドシートに「2026」のような名前の年別シートがあるか確認してください。')));

  const b = E.annualBook(ctx.data, ctx.custs, st.year);
  const today = E.todayStr();
  const curYm = today.slice(0, 7);
  const isCur = st.year === Number(today.slice(0, 4));
  const curM = isCur ? Number(today.slice(5, 7)) : 12; // 今月まで
  const unit = st.unit;
  const fmt = (v) => (Math.abs(v) < 0.5 ? '–' : unit === 'man' ? (v / 10000).toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : E.fmtInt(v));
  const cls = (v, extra = '') => `num ${extra} ${v < -0.5 ? 'negv' : ''}`;
  const futureCls = (m) => (isCur && m.ym > curYm ? ' futurecol' : '');
  const totalCols = isCur ? [{ label: `${curM}月まで`, upto: curM }, { label: '年間', upto: 12 }] : [{ label: '合計', upto: 12 }];

  const line = (label, key, opt = {}) => {
    const open = !!st.open[opt.toggle];
    const tr = h('tr', { class: `${opt.cls || ''} ${opt.toggle ? 'clickrow' : ''}`, tabindex: opt.toggle ? 0 : null, 'aria-expanded': opt.toggle ? String(open) : null,
      onclick: opt.toggle ? () => { st.open[opt.toggle] = !open; ctx.rerender(); } : null,
      onkeydown: opt.toggle ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); st.open[opt.toggle] = !open; ctx.rerender(); } } : null },
      h('td', { class: 'stick' }, (opt.toggle ? (open ? '▾ ' : '▸ ') : '') + label),
      b.months.map((m) => h('td', { class: cls(m[key], futureCls(m)) }, fmt(m[key]))),
      totalCols.map((t, i) => h('td', { class: cls(b.total(key, t.upto), i === 0 ? 'gstart' : '') + ' totcol' }, fmt(b.total(key, t.upto)))));
    return tr;
  };
  const itemLines = (list) => list.filter((it) => it.values.some((v) => Math.abs(v) > 0.5)).map((it) => {
    const tot = (upto) => it.values.slice(0, upto).reduce((s, v) => s + v, 0);
    return h('tr', { class: 'itemrow' },
      h('td', { class: 'stick sub' }, it.name),
      it.values.map((v, i) => h('td', { class: cls(v, futureCls(b.months[i])) }, fmt(v))),
      totalCols.map((t, i) => h('td', { class: cls(tot(t.upto), i === 0 ? 'gstart' : '') + ' totcol' }, fmt(tot(t.upto)))));
  });
  const group = (label, key, list, toggle) => [line(label, key, { toggle }), st.open[toggle] ? itemLines(list) : null];

  const body = [
    line('売上高', 'sales'),
    line('現場支払', 'paid'),
    line('入金', 'income'),
    line('粗利益', 'gross', { cls: 'sec' }),
    group('固定費', 'fixed', b.items.filter((i) => i.group === '固定'), 'fixed'),
    group('変動費', 'variable', b.items.filter((i) => i.group === '変動'), 'variable'),
    b.capex.length ? group('設備費', 'cap', b.capex, 'cap') : null,
    line('純利益', 'net', { cls: 'tot' }),
  ];
  const ledgerMonths = b.months.filter((m) => m.fromLedger);

  return h('div', null,
    head('売上高は契約月の合計(自動)。入金・現場支払は、切替月までは年別シートの入力値、切替月からは「入出金」シートです'),
    h('div', { class: 'controls' },
      segmented(years.map((y) => ({ value: y, label: `${y}年` })), st.year, (v) => { st.year = v; ctx.rerender(); }, '年'),
      segmented([{ value: 'man', label: '万円' }, { value: 'yen', label: '円' }], unit, (v) => { st.unit = v; ctx.rerender(); }, '単位')),
    h('div', { class: 'card' },
      h('div', { class: 'tablewrap salestable annual' }, h('table', null,
        h('thead', null, h('tr', null,
          h('th', { class: 'stick' }, `${st.year}年(${unit === 'man' ? '万円' : '円'})`),
          b.months.map((m) => h('th', { class: `num${futureCls(m)}` }, `${m.month}月`, m.fromLedger ? h('div', { class: 'tiny' }, '入出金') : null)),
          totalCols.map((t, i) => h('th', { class: `num totcol ${i === 0 ? 'gstart' : ''}` }, t.label)))),
        h('tbody', null, body.flat(Infinity)))),
      h('p', { class: 'small muted' },
        '売上高は契約月・税込です。固定費・変動費・設備費の行をタップすると、項目ごとの金額が開きます。粗利益 = 入金 − 現場支払、純利益 = 粗利益 − 固定費 − 変動費 − 設備費です。',
        isCur ? ` 薄い列は、まだ来ていない月です(固定費など、入力ずみの予定額は入っています)。「${curM}月まで」は今月までの合計、「年間」は予定額も含めた1年分です。` : ''),
      b.switchYm ? h('p', { class: 'small muted' }, ledgerMonths.length
        ? `入金・現場支払は ${b.switchYm.replace('-', '年')}月から「入出金」シートの日付ベースです(列に「入出金」と出ています)。`
        : `切替月は ${b.switchYm.replace('-', '年')}月です。この年は、年別シートの入力値のままです。`)
        : h('p', { class: 'small muted' }, '入金・現場支払は、すべて年別シートの入力値です。「入出金」シートに記録を始めたら、設定シートの「年間収支の切替月」に開始月(例 2026-11)を入れると、その月から入出金の記録で集計します。'),
      !b.standard ? h('p', { class: 'notice' }, 'この年は古い形式の年別シートです。純利益は、シートに入っている純利益の値をそのまま表示しています。') : null));
}
