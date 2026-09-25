import { h, segmented } from '../ui.js';
import * as E from '../engine.js';

const dl = (d) => { const s = String(d || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${Number(s.slice(0, 4))}/${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}` : '–'; };

// 案件: 反響のうち「連絡つかず」「成約」以外(まだ動いている、または結果待ちのもの)。自社・ポータル・訪販をタブで切り替え。
export function render(ctx) {
  const st = (ctx.state.deals ||= { section: '', all: false });
  const leads = ctx.data['反響'] || [];
  const counts = E.dealsCounts(leads);
  const total = counts['自社'] + counts['ポータル'] + counts['訪販'];
  const list = E.dealsList(leads, { section: st.section });
  const shown = st.all ? list : list.slice(0, 30);
  const tabs = [
    { value: '', label: `すべて(${total})` },
    { value: '自社', label: `自社(${counts['自社']})` },
    { value: 'ポータル', label: `ポータル(${counts['ポータル']})` },
    { value: '訪販', label: `訪販(${counts['訪販']})` },
  ];
  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, '案件'),
      h('div', { class: 'sub' }, '反響のうち、「連絡つかず」と「成約」を除いた、まだ動いている・結果待ちの案件です'))),
    h('div', { class: 'controls' },
      segmented(tabs, st.section, (v) => { st.section = v; st.all = false; ctx.rerender(); }, '区分')),
    h('div', { class: 'card' },
      h('h2', null, `案件の一覧(${list.length}件)`),
      h('p', { class: 'small muted', style: 'margin:0 0 8px' }, '反響日(訪販は見積日・現調日)の新しい順です。結果は反響シートの入力に合わせて表示します。'),
      list.length ? h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, '邸名'), h('th', null, '区分'), h('th', null, '媒体'), h('th', null, '結果'), h('th', null, '日付'), h('th', null, '担当'), h('th', null, '地域'))),
        h('tbody', null, shown.map((r) => h('tr', null,
          h('td', { class: 'nowrap' }, r.name || '(名前なし)'),
          h('td', null, r.section),
          h('td', null, r.media),
          h('td', null, r.result),
          h('td', null, dl(r.date)),
          h('td', null, r.person),
          h('td', null, r.region)))))) : h('p', { class: 'notice' }, 'この条件に当てはまる案件がありません。'),
      list.length > 30 ? h('div', { class: 'controls', style: 'margin:10px 0 0' }, h('button', { class: 'btn', type: 'button', onclick: () => { st.all = !st.all; ctx.rerender(); } }, st.all ? '先頭だけ表示' : `すべて表示(${list.length}件)`)) : null));
}
