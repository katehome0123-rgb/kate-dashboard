import { h, alertSection, telHref, STEP_TEXT } from '../ui.js';
import * as E from '../engine.js';

// メンテ = 完工の1か月後・5年後・10年後の点検アラート。1案件につき1行。
export function render(ctx) {
  const today = E.todayStr();
  ctx.state.alertAll ||= {};
  const m = E.buildMaintAlerts(ctx.data, ctx.custs, today);
  const since = E.settingValue(ctx.data, 'メンテ確認の開始日');

  const phone = (r) => h('td', null, r.phone ? h('a', { href: telHref(r.phone), class: 'tel' }, r.phone) : '–');
  // 住所を押すとGoogleマップのルート案内が開く
  const addr = (r) => h('td', null, r.address
    ? h('a', { href: E.mapHref(r.address), target: '_blank', rel: 'noopener', class: 'tel', title: 'Googleマップでルート案内' }, r.address)
    : '–');
  const steps = (r) => h('td', { class: 'steps' }, r.steps.map((x) => h('span', { class: `step ${x.state}` }, `${x.kind} ${STEP_TEXT[x.state] || x.due.slice(0, 7)}`)));
  const kpi = (cls, label, n) => h('div', { class: `card kpi alertkpi ${cls}` }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, n, h('small', null, '件')));

  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, 'メンテ'), h('div', { class: 'sub' }, `完工の1か月後・5年後・10年後の点検(${today} 時点)`))),
    h('div', { class: 'grid' },
      kpi('urgent', '▲ 期限超過', m.urgent.length),
      kpi('watch', '● 30日以内に時期', m.notice.length)),
    m.urgent.length + m.notice.length === 0 ? h('div', { class: 'card' }, h('h2', null, '✓ いま対応が必要なメンテはありません')) : null,

    m.urgent.length ? alertSection(ctx, 'urgent', {
      level: 'urgent', title: 'メンテの期限を過ぎて、まだ対応していない案件',
      lead: '1件の案件につき1行です(点検は完工の1か月後・5年後・10年後の3回)。表には、いちばん先の未実施の点検を出し、右端に3回分の進み具合を出しています。点検したら、顧客の行の「メンテ1か月/5年/10年」列に実施日を入れると消えます。住所を押すとGoogleマップでルート案内が開きます。',
      columns: [{ label: '邸名' }, { label: '点検' }, { label: '予定日' }, { label: '超過', num: true }, { label: '電話' }, { label: '住所(ルート案内)' }, { label: '3回の進み具合' }],
      rows: m.urgent,
      rowCells: (r) => [h('td', null, r.name), h('td', null, r.kind, r.others ? h('div', { class: 'small muted' }, `ほか${r.others}回も超過`) : null), h('td', { class: 'num' }, r.due), h('td', { class: 'num' }, `${r.days}日`), phone(r), addr(r), steps(r)],
    }) : null,
    m.notice.length ? alertSection(ctx, 'notice', {
      level: 'watch', title: 'まもなく点検の時期(30日以内)',
      columns: [{ label: '邸名' }, { label: '点検' }, { label: '予定日' }, { label: 'あと', num: true }, { label: '電話' }, { label: '住所(ルート案内)' }, { label: '3回の進み具合' }],
      rows: m.notice,
      rowCells: (r) => [h('td', null, r.name), h('td', null, r.kind), h('td', { class: 'num' }, r.due), h('td', { class: 'num' }, r.days === 0 ? '今日' : `${-r.days}日`), phone(r), addr(r), steps(r)],
    }) : null,
    !since && m.urgent.length > 15 ? h('p', { class: 'notice' }, '古い案件で、点検済みかどうか分からないものが多く出ています。スプレッドシートの「設定」シートの『メンテ確認の開始日』に日付を入れると、それより前が予定日のものはアラートに出なくなります。') : null);
}
