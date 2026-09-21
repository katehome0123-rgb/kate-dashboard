import { h, segmented } from '../ui.js';
import * as E from '../engine.js';

// 集客分析: 成約率 = 成約 ÷ (成約+不成約)
export function render(ctx) {
  const st = ctx.state;
  const years = E.leadYears(ctx.data['反響']);
  const active = new Set(E.activePersons(ctx.data, ctx.custs));
  const persons = E.leadPersons(ctx.data['反響']).filter((p) => active.has(p));
  if (st.person && !persons.includes(st.person)) st.person = '';
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
    h('td', { class: 'num' }, E.fmtPct(x.rate, 0)));

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
      t.total.leads === 0 ? h('p', { class: 'notice' }, 'この条件に当てはまる反響がありません。') : null),
    portalCard(ctx, scope));
}

// ポータル: 何社紹介の何番手が決まりやすいか(番手 × 紹介数 の成約率)
function portalCard(ctx, scope) {
  const st = ctx.state;
  const ps = E.portalSlots(ctx.data['反響'], { year: st.aYear || null, person: st.person });
  const pct = (x) => (x.rate === null ? '–' : `${Math.round(x.rate * 100)}%`);
  const sub = (x) => (x.win + x.lose ? `${x.win}/${x.win + x.lose}` : '');
  // 判定に使える件数(成約+不成約)が3件以上あるマスの中で、成約率が最も高いところに色を付ける
  const cells = ps.grid.flatMap((g) => g.cells).filter((x) => x.win + x.lose >= 3 && x.rate !== null);
  const best = cells.length ? Math.max(...cells.map((x) => x.rate)) : null;
  const td = (x, extra = '') => h('td', { class: `num slot ${extra} ${best !== null && x.win + x.lose >= 3 && x.rate === best ? 'best' : ''}` },
    h('div', null, pct(x)), h('div', { class: 'tiny muted' }, sub(x)));
  const body = [
    h('h2', null, `ポータル: 何社紹介の何番手が決まりやすいか(${scope})`),
  ];
  if (!ps.entered) {
    body.push(h('p', { class: 'notice' }, 'ポータル管理シートの「紹介数」「番手」を入れ始めると、ここに 番手 × 紹介数 の成約率が出ます。'));
  } else {
    body.push(h('div', { class: 'tablewrap' }, h('table', { class: 'slottable' },
      h('thead', null, h('tr', null, h('th', null, '番手 \\ 紹介数'), ps.counts.map((n) => h('th', { class: 'num' }, `${n}社`)), h('th', { class: 'num' }, '番手ごとの合計'))),
      h('tbody', null,
        ps.grid.map((g) => h('tr', null, h('td', null, `${g.rank}番手`), g.cells.map((x) => td(x)), td(g.total, 'allcol'))),
        h('tr', { class: 'tot' }, h('td', null, '紹介数ごとの合計'), ps.byCount.map((x) => td(x)), td(ps.all, 'allcol'))))));
    body.push(h('p', { class: 'small muted' }, `各マスは 成約率(成約/成約+不成約)です。結果待ちは入れていません。緑の枠は、判定できる件数が3件以上あるマスのうち成約率がいちばん高いところです。件数が少ないうちは参考程度に見てください。入力済み ${ps.entered}件`
      + (ps.missing ? `、紹介数・番手が空欄のポータル案件 ${ps.missing}件は含めていません。` : '。')));
  }
  return h('div', { class: 'card' }, body);
}
