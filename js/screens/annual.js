import { h, segmented, barChart, barCell } from '../ui.js';
import * as E from '../engine.js';

const FOCUS = ['ガソリン代', '駐車場代', '飲食費']; // 月ごとの上がり下がりを最初から出す項目
const yen = (n) => E.fmtInt(n);

// 年間収支: 年別シートの升目を、いじれない形で見る。(1)月別の表 (2)何にいくら使ったか (3)経費の推移
export function render(ctx) {
  const st = (ctx.state.annual ||= { year: 0, unit: 'man', tab: 'table', showZero: false, group: '', sort: 'amount', all: false, extra: '', open: {} });
  const years = Object.keys(ctx.data['年間収支'] || {}).map(Number).filter((y) => E.annualBook(ctx.data, ctx.custs, y)).sort((a, b) => b - a);
  const nowYear = new Date().getFullYear();
  if (!years.includes(st.year)) st.year = years.includes(nowYear) ? nowYear : (years[0] || 0);
  const head = (sub) => h('div', { class: 'head' }, h('div', null, h('h1', null, '年間収支'), h('div', { class: 'sub' }, sub)));
  if (!st.year) return h('div', null, head('年別シートがありません'), h('div', { class: 'card' }, h('p', { class: 'notice' }, 'スプレッドシートに「2026」のような名前の年別シートがあるか確認してください。')));

  const b = E.annualBook(ctx.data, ctx.custs, st.year);
  const today = E.todayStr();
  const isCur = st.year === Number(today.slice(0, 4));
  const through = E.completedMonths(st.year, today);
  const sub = { table: '売上高は契約月の合計(自動)。入金・現場支払は、切替月までは年別シートの入力値、切替月からは「入出金」シートです',
    rank: '固定費・変動費の全項目を、使った金額の順に見られます。前年の同じ期間と比べて、増えた項目もわかります',
    trend: 'ガソリン代・駐車場代・飲食費などの、月ごとの上がり下がりと平均です。いつ多く、いつ少ないかを見つけます' }[st.tab];

  const controls = h('div', { class: 'controls' },
    segmented(years.map((y) => ({ value: y, label: `${y}年` })), st.year, (v) => { st.year = v; ctx.rerender(); }, '年'),
    segmented([{ value: 'table', label: '月別の表' }, { value: 'rank', label: '何にいくら使った' }, { value: 'trend', label: '経費の推移' }], st.tab, (v) => { st.tab = v; ctx.rerender(); }, '見方'),
    st.tab === 'trend' ? null : segmented([{ value: 'man', label: '万円' }, { value: 'yen', label: '円' }], st.unit, (v) => { st.unit = v; ctx.rerender(); }, '単位'));

  const body = st.tab === 'rank' ? rank(ctx, st, through, isCur, today) : st.tab === 'trend' ? trend(ctx, st, through, isCur, today) : table(ctx, st, b, isCur, today);
  return h('div', null, head(sub), controls, body);
}

// ---- (1) 月別の表 ------------------------------------------------
function table(ctx, st, b, isCur, today) {
  const curYm = today.slice(0, 7);
  const curM = isCur ? Number(today.slice(5, 7)) : 12; // 今月まで
  const unit = st.unit;
  const fmt = (v) => (Math.abs(v) < 0.5 ? '–' : unit === 'man' ? (v / 10000).toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : E.fmtInt(v));
  const cls = (v, extra = '') => `num ${extra} ${v < -0.5 ? 'negv' : ''}`;
  const futureCls = (m) => (isCur && m.ym > curYm ? ' futurecol' : '');
  const totalCols = isCur ? [{ label: `${curM}月まで`, upto: curM }, { label: '年間', upto: 12 }] : [{ label: '合計', upto: 12 }];
  const open = (k) => st.open[k] !== false; // 初めから全部ひらく
  const KEYS = ['fixed', 'variable', 'cap'];

  const line = (label, key, opt = {}) => {
    const isOpen = open(opt.toggle);
    const flip = () => { st.open[opt.toggle] = !isOpen; ctx.rerender(); };
    return h('tr', { class: `${opt.cls || ''} ${opt.toggle ? 'clickrow' : ''}`, tabindex: opt.toggle ? 0 : null, 'aria-expanded': opt.toggle ? String(isOpen) : null,
      onclick: opt.toggle ? flip : null, onkeydown: opt.toggle ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } } : null },
      h('td', { class: 'stick' }, (opt.toggle ? (isOpen ? '▾ ' : '▸ ') : '') + label),
      b.months.map((m) => h('td', { class: cls(m[key], futureCls(m)) }, fmt(m[key]))),
      totalCols.map((t, i) => h('td', { class: cls(b.total(key, t.upto), i === 0 ? 'gstart' : '') + ' totcol' }, fmt(b.total(key, t.upto)))));
  };
  const itemLines = (list) => list.filter((it) => st.showZero || it.values.some((v) => Math.abs(v) > 0.5)).map((it) => {
    const tot = (upto) => it.values.slice(0, upto).reduce((s, v) => s + v, 0);
    return h('tr', { class: 'itemrow' },
      h('td', { class: 'stick sub' }, it.name),
      it.values.map((v, i) => h('td', { class: cls(v, futureCls(b.months[i])) }, fmt(v))),
      totalCols.map((t, i) => h('td', { class: cls(tot(t.upto), i === 0 ? 'gstart' : '') + ' totcol' }, fmt(tot(t.upto)))));
  });
  const group = (label, key, list, toggle) => [line(label, key, { toggle }), open(toggle) ? itemLines(list) : null];
  const rows = [
    line('売上高', 'sales'), line('現場支払', 'paid'), line('入金', 'income'), line('粗利益', 'gross', { cls: 'sec' }),
    group('固定費', 'fixed', b.items.filter((i) => i.group === '固定'), 'fixed'),
    group('変動費', 'variable', b.items.filter((i) => i.group === '変動'), 'variable'),
    b.capex.length ? group('設備費', 'cap', b.capex, 'cap') : null,
    line('純利益', 'net', { cls: 'tot' }),
  ];
  const ledgerMonths = b.months.filter((m) => m.fromLedger);
  const allOpen = KEYS.every(open);
  return h('div', { class: 'card' },
    h('div', { class: 'tablewrap salestable annual' }, h('table', null,
      h('thead', null, h('tr', null,
        h('th', { class: 'stick' }, `${st.year}年(${unit === 'man' ? '万円' : '円'})`),
        b.months.map((m) => h('th', { class: `num${futureCls(m)}` }, `${m.month}月`, m.fromLedger ? h('div', { class: 'tiny' }, '入出金') : null)),
        totalCols.map((t, i) => h('th', { class: `num totcol ${i === 0 ? 'gstart' : ''}` }, t.label)))),
      h('tbody', null, rows.flat(Infinity)))),
    h('div', { class: 'controls', style: 'margin:10px 0 0' },
      h('button', { class: 'btn', type: 'button', onclick: () => { st.showZero = !st.showZero; ctx.rerender(); } }, st.showZero ? '0円の項目をかくす' : '0円の項目も出す'),
      h('button', { class: 'btn', type: 'button', onclick: () => { KEYS.forEach((k) => { st.open[k] = !allOpen; }); ctx.rerender(); } }, allOpen ? '項目をたたむ' : '項目をすべてひらく')),
    h('p', { class: 'small muted' },
      '売上高は契約月・税込です。粗利益 = 入金 − 現場支払、純利益 = 粗利益 − 固定費 − 変動費 − 設備費です。固定費・変動費・設備費の行をタップすると、項目を閉じたり開いたりできます。',
      isCur ? ` 薄い列は、まだ来ていない月です(固定費など、入力ずみの予定額は入っています)。「${curM}月まで」は今月までの合計、「年間」は予定額も含めた1年分です。` : ''),
    b.switchYm ? h('p', { class: 'small muted' }, ledgerMonths.length
      ? `入金・現場支払は ${b.switchYm.replace('-', '年')}月から「入出金」シートの日付ベースです(列に「入出金」と出ています)。`
      : `切替月は ${b.switchYm.replace('-', '年')}月です。この年は、年別シートの入力値のままです。`)
      : h('p', { class: 'small muted' }, '入金・現場支払は、すべて年別シートの入力値です。「入出金」シートに記録を始めたら、設定シートの「年間収支の切替月」に開始月(例 2026-11)を入れると、その月から入出金の記録で集計します。'),
    !b.standard ? h('p', { class: 'notice' }, 'この年は古い形式の年別シートです。純利益は、シートに入っている純利益の値をそのまま表示しています。') : null);
}

// ---- (2) 何にいくら使ったか ---------------------------------------
function rank(ctx, st, through, isCur, today) {
  const S = E.expenseSummary(ctx.data, ctx.custs, st.year, through);
  const unit = st.unit;
  const fmt = (v) => (Math.abs(v) < 0.5 ? '–' : unit === 'man' ? (v / 10000).toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : yen(v));
  const u = unit === 'man' ? '万円' : '円';
  const partial = isCur && through < Number(today.slice(5, 7));
  const span = `${st.year}年 1〜${through}月${partial ? '(今月は途中なので入れていません)' : ''}`;
  let rows = S.rows.filter((r) => !st.group || r.group === st.group);
  rows = [...rows].sort(st.sort === 'up' ? (a, c) => (c.diff ?? -Infinity) - (a.diff ?? -Infinity) : (a, c) => c.total - a.total);
  const shown = st.all ? rows : rows.slice(0, 15);
  const maxShare = Math.max(0.0001, ...rows.map((r) => r.share || 0));
  const diffEl = (d) => (d === null ? '–' : Math.abs(d) < 0.5 ? h('span', { class: 'muted' }, '±0')
    : h('span', { class: d > 0 ? 'negv strong' : 'okgreen strong' }, `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}`));
  const kpi = (label, v, note) => h('div', { class: 'card kpi' }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, fmt(v), h('small', null, u)), note ? h('div', { class: 'note' }, note) : null);
  const cmpDiff = S.hasPrev && S.cmpPrev ? S.cmpTotal - S.cmpPrev : null;

  return h('div', null,
    h('div', { class: 'grid' },
      kpi('経費の合計', S.total, cmpDiff === null ? span : h('span', null, `前年にもあった項目だけで比べると、前年同期 ${fmt(S.cmpPrev)}${u} → 今年 ${fmt(S.cmpTotal)}${u} (`, diffEl(cmpDiff), ')')),
      kpi('うち固定費', S.fixed), kpi('うち変動費', S.variable)),
    h('div', { class: 'controls', style: 'margin-top:16px' },
      segmented([{ value: '', label: '全部' }, { value: '固定', label: '固定費' }, { value: '変動', label: '変動費' }], st.group, (v) => { st.group = v; ctx.rerender(); }, '区分'),
      segmented([{ value: 'amount', label: '金額の多い順' }, { value: 'up', label: '前年より増えた順' }], st.sort, (v) => { st.sort = v; ctx.rerender(); }, '並べ方')),
    h('div', { class: 'card' },
      h('h2', null, `何にいくら使ったか(${span})`),
      h('div', { class: 'tablewrap' }, h('table', { class: 'ranktable' },
        h('thead', null, h('tr', null, h('th', { class: 'stick' }, '項目'), h('th', { class: 'num' }, `金額(${u})`), h('th', { class: 'num' }, '構成比'), h('th', { class: 'num' }, '前年同期'), h('th', { class: 'num' }, '前年との差'))),
        h('tbody', null, shown.map((r) => h('tr', null,
          h('td', { class: 'stick' }, r.name, h('span', { class: 'gtag' }, r.group)),
          h('td', { class: 'num' }, fmt(r.total)),
          h('td', null, barCell((r.share || 0) / maxShare, E.fmtPct(r.share, 1), r.group === '固定' ? 1 : 2)),
          h('td', { class: 'num muted' }, r.prev === null ? '–' : fmt(r.prev)),
          h('td', { class: 'num' }, diffEl(r.diff))))))),
      rows.length > 15 ? h('div', { class: 'controls', style: 'margin:10px 0 0' },
        h('button', { class: 'btn', type: 'button', onclick: () => { st.all = !st.all; ctx.rerender(); } }, st.all ? '上位15件だけ表示' : `すべて表示(${rows.length}件)`)) : null,
      h('p', { class: 'small muted' }, '構成比は、表示している経費の合計に対する割合です(青は固定費、オレンジは変動費)。前年との差の赤は前年より増えた額、緑は減った額です。前年のシートに同じ名前の項目がない場合(今年から始めた項目など)は、前年との比較は出しません(「–」)。' + (S.newCount ? ` 今年から出てきた項目が${S.newCount}件あります。` : ''))));
}

// ---- (3) 経費の推移(月ごとの上がり下がり) --------------------------
function trend(ctx, st, through, isCur, today) {
  const names = E.expenseNames(ctx.data, ctx.custs, st.year);
  const focus = FOCUS.filter((n) => names.includes(n));
  const others = names.filter((n) => !focus.includes(n));
  if (st.extra && !others.includes(st.extra)) st.extra = '';
  const shownNames = [...focus, ...(st.extra ? [st.extra] : [])];
  const monthsShown = isCur ? Number(today.slice(5, 7)) : 12;
  const pick = h('select', { 'aria-label': 'ほかの項目', onchange: (e) => { st.extra = e.target.value; ctx.rerender(); } },
    h('option', { value: '' }, 'ほかの項目も見る…'), others.map((n) => h('option', { value: n, selected: n === st.extra }, n)));

  const card = (name) => {
    const x = E.expenseSeries(ctx.data, ctx.custs, st.year, name, through);
    const over = x.values.map((v, i) => (i < x.through && v > x.avg ? i + 1 : 0)).filter(Boolean);
    const pct = x.prevAvg ? ((x.avg - x.prevAvg) / x.prevAvg) * 100 : null;
    const stat = (label, value, note) => h('div', { class: 'stat' }, h('div', { class: 'label' }, label), h('div', { class: 'v' }, value), note ? h('div', { class: 'note' }, note) : null);
    const chart = barChart({
      labels: Array.from({ length: monthsShown }, (_, i) => `${i + 1}月`), unit: '円', height: 200,
      series: [{ name, slot: 1, values: x.values.slice(0, monthsShown) }],
      refLine: { value: x.avg, label: `平均 ${yen(x.avg)}` },
      tooltip: (i) => ({ title: `${st.year}年${i + 1}月${isCur && i + 1 === monthsShown && through < monthsShown ? '(途中)' : ''}`,
        rows: [[name, `${yen(x.values[i])} 円`], ['平均との差', `${x.values[i] - x.avg >= 0 ? '+' : '−'}${yen(Math.abs(x.values[i] - x.avg))} 円`], ...(x.prevValues ? [['前年の同じ月', `${yen(x.prevValues[i])} 円`]] : [])] }),
    });
    return h('div', { class: 'card' },
      h('h2', null, name),
      h('div', { class: 'statgrid' },
        stat('月の平均', `${yen(x.avg)} 円`, `1〜${x.through}月`),
        stat('いちばん多い月', `${x.max.month}月`, `${yen(x.max.value)} 円`),
        stat('いちばん少ない月', `${x.min.month}月`, `${yen(x.min.value)} 円`),
        stat('前年の月平均', x.prevAvg === null ? '–' : `${yen(x.prevAvg)} 円`, pct === null ? null : h('span', { class: pct > 0 ? 'negv strong' : 'okgreen strong' }, `今年は ${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(0)}%`))),
      chart,
      h('p', { class: 'small muted' }, over.length ? `平均より多かった月: ${over.map((m) => `${m}月`).join('・')}` : '平均を上回った月はありません',
        `。合計は1〜${x.through}月で ${yen(x.total)} 円です。`));
  };
  return h('div', null,
    h('div', { class: 'controls' }, pick),
    shownNames.length ? shownNames.map(card) : h('div', { class: 'card' }, h('p', { class: 'notice' }, 'ガソリン代・駐車場代・飲食費の項目がこの年にありません。「ほかの項目も見る」から選んでください。')),
    h('p', { class: 'small muted' }, `平均は${st.year}年の1〜${through}月の平均です${isCur && through < monthsShown ? '(今月は途中なので、平均には入れていません。グラフには今月の途中の金額を出しています)' : ''}。日々の経費は「経費データ」シートの入力から自動で集計されています。`));
}
