import { h } from '../ui.js';
import * as E from '../engine.js';

const dl = (d) => { const s = String(d || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${Number(s.slice(0, 4))}/${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}` : String(d || ''); };

// 発注タスク: スプレッドシートの「現場タスク」シートをそのまま一覧表示する(邸ごとの発注・準備の進み具合)。
// チェックの付け外しはスプレッドシート側で行う運用のため、ここは見るだけ(アプリからは書き込まない)。
export function render(ctx) {
  const st = (ctx.state.tasks ||= { open: {} });
  const board = E.siteTaskBoard(ctx.data);

  const toggleCard = (key) => { st.open[key] = !st.open[key]; ctx.rerender(); };

  const card = (job) => {
    const key = `${job.name}|${job.orderDate}`;
    const opened = !!st.open[key];
    const remain = job.total - job.doneCount;
    return h('div', { class: 'card taskcard' },
      h('div', { class: 'tc-head', onclick: () => toggleCard(key) },
        h('div', null, h('div', { class: 'tc-name' }, job.name), h('div', { class: 'tc-sub' }, `発注日 ${dl(job.orderDate)}${job.person ? '　' + job.person : ''}`)),
        h('div', { class: 'tc-right' },
          h('span', { class: `tc-badge ${remain === 0 ? 'tc-done' : ''}` }, remain === 0 ? '完了' : `残り${remain}`),
          h('span', { class: 'tc-arrow' }, opened ? '▲' : '▼'))),
      opened ? h('div', { class: 'tc-list' }, job.items.map((it) =>
        h('label', { class: `tc-item ${it.done ? 'tc-checked' : ''}` },
          h('input', { type: 'checkbox', checked: it.done, disabled: true }),
          h('span', null, it.item)))) : null);
  };

  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, '発注タスク'),
      h('div', { class: 'sub' }, '邸ごとの発注・準備の進み具合です(スプレッドシートの「現場タスク」シートをそのまま表示。チェックはスプレッドシート側で行ってください)'))),
    board.length ? h('div', null, board.map(card)) : h('div', { class: 'card' }, h('p', { class: 'notice' }, '現場タスクはまだありません。')));
}
