import { h, alertSection } from '../ui.js';
import * as E from '../engine.js';

// ホーム = 案件アラート(ポータルの見積り忘れ・キャンセル期限)。メンテのアラートは「メンテ」タブ。
export function render(ctx) {
  const today = E.todayStr();
  ctx.state.alertAll ||= {};
  const l = E.buildLeadAlerts(ctx.data, today);
  const kpi = (cls, label, n) => h('div', { class: `card kpi alertkpi ${cls}` }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, n, h('small', null, '件')));
  const none = l.estimate.length + l.cancel.length === 0;

  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, 'ホーム'), h('div', { class: 'sub' }, `案件アラート(${today} 時点)`))),
    h('div', { class: 'grid' },
      kpi('urgent', '▲ 見積り忘れ(ポータル)', l.estimate.length),
      kpi('urgent', '▲ キャンセル期限が近い(ポータル)', l.cancel.length)),
    none ? h('div', { class: 'card' }, h('h2', null, '✓ いま対応が必要な案件はありません')) : null,

    l.estimate.length ? alertSection(ctx, 'estimate', {
      level: 'urgent', title: 'ポータルの現調から1週間たっても、見積りを出していない案件',
      lead: `ポータルの反響で、現調日から${l.estDays}日以上たっても見積日が空の案件です(直近${l.win}日以内の現調。結果が成約・不成約のものは除く)。見積りを出したら見積日を入れると消えます。`,
      columns: [{ label: '邸名' }, { label: '媒体' }, { label: '現調日' }, { label: '経過', num: true }, { label: '担当' }, { label: '結果' }],
      rows: l.estimate,
      rowCells: (r) => [h('td', null, r.name), h('td', null, r.media), h('td', { class: 'num' }, r.survey), h('td', { class: 'num' }, `${r.days}日`), h('td', null, r.person || '–'), h('td', null, r.result || '(空欄)')],
    }) : null,
    l.cancel.length ? alertSection(ctx, 'cancel', {
      level: 'urgent', title: 'ポータルのキャンセル期限が近い案件(結果が空欄のまま)',
      lead: `紹介から${l.deadline}日を過ぎると課金対象になります。紹介から${l.cancelDays}日たっても「結果」が空欄のままの案件です。キャンセルするなら申請し、結果を入力すると消えます(追客するなら結果に見積り待ちなどを入力)。`,
      columns: [{ label: '邸名' }, { label: '媒体' }, { label: '紹介日' }, { label: '経過', num: true }, { label: '課金になる日' }, { label: '残り', num: true }, { label: '担当' }],
      rows: l.cancel,
      rowCells: (r) => [h('td', null, r.name), h('td', null, r.media), h('td', { class: 'num' }, r.referred), h('td', { class: 'num' }, `${r.days}日`), h('td', { class: 'num' }, r.limit), h('td', { class: 'num' }, r.left <= 0 ? '今日まで' : `あと${r.left}日`), h('td', null, r.person || '–')],
    }) : null);
}
