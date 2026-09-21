import { h, segmented } from '../ui.js';
import * as E from '../engine.js';

const yen = (n) => E.fmtInt(n);
const man = (n) => (Math.round(n / 1000) / 10).toLocaleString('ja-JP', { maximumFractionDigits: 1 }); // 円 → 万円(小数1桁)

// 入出金: 総未入金・総未出金と、入金日が入っていない案件ごとの残り。案件をタップすると入出金の明細が開く。
export function render(ctx) {
  const st = (ctx.state.cash ||= { hideDone: true, kind: '', open: {}, more: false });
  const cb = E.cashBook(ctx.data);
  const shown = st.hideDone ? cb.cases.filter((c) => !c.settled) : cb.cases;

  const kpi = (label, value, note) => h('div', { class: 'card kpi' },
    h('div', { class: 'label' }, label), h('div', { class: 'value' }, man(value), h('small', null, '万円')), h('div', { class: 'note' }, note));

  const rows = shown.flatMap((c) => {
    const open = !!st.open[c.name];
    const main = h('tr', { class: 'clickrow', tabindex: 0, 'aria-expanded': String(open), onclick: () => { st.open[c.name] = !open; ctx.rerender(); },
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); st.open[c.name] = !open; ctx.rerender(); } } },
      h('td', { class: 'stick' }, (open ? '▾ ' : '▸ ') + c.name, c.region ? h('div', { class: 'small muted' }, c.region) : null),
      h('td', { class: 'num' }, yen(c.contract)),
      h('td', { class: 'num' }, yen(c.paidIn)),
      h('td', { class: `num ${c.unpaidIn > 0 ? 'warnv' : 'okv'}` }, yen(c.unpaidIn)),
      h('td', { class: 'num gstart' }, yen(c.ordered)),
      h('td', { class: 'num' }, yen(c.paidOut)),
      h('td', { class: `num ${c.unpaidOut > 0 ? 'warnv' : 'okv'}` }, yen(c.unpaidOut)));
    if (!open) return [main];
    const detail = h('tr', { class: 'detail' }, h('td', { colspan: 7 },
      c.entries.length
        ? h('table', { class: 'inner' }, h('tbody', null, c.entries.map((r) => h('tr', null,
          h('td', null, r['日付'] || '–'), h('td', null, r['種別']), h('td', null, r['区分'] || ''), h('td', null, r['支払先'] || ''),
          h('td', { class: 'num' }, yen(E.num(r['金額(円)']))), h('td', { class: 'muted' }, r['メモ'] || '')))))
        : h('div', { class: 'small muted' }, 'この案件の入金・出金はまだ入っていません')));
    return [main, detail];
  });

  const kindOpts = [{ value: '', label: 'すべて' }, { value: '入金', label: '入金' }, { value: '出金', label: '出金' }];
  const led = cb.ledger.map((r, i) => ({ r, i })).filter((x) => !st.kind || x.r['種別'] === st.kind)
    .sort((a, b) => (String(b.r['日付'] || '').localeCompare(String(a.r['日付'] || ''))) || (b.i - a.i)); // 新しい順(日付なしは末尾)
  const ledShown = st.more ? led : led.slice(0, 20);

  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, '入出金'),
      h('div', { class: 'sub' }, '顧客シートで入金日がまだ入っていない案件の、入金と出金の残り(金額は円)'))),
    h('div', { class: 'grid' },
      kpi('総未入金', cb.totalUnpaidIn, `${yen(cb.totalUnpaidIn)}円 / ${cb.cases.length}件`),
      kpi('総未出金', cb.totalUnpaidOut, `${yen(cb.totalUnpaidOut)}円`)),
    cb.unknown.length ? h('div', { class: 'notice', style: 'margin-top:16px' }, `顧客シートにない名前があります: ${cb.unknown.join('、')}(打ち間違いの可能性)`) : null,
    h('div', { class: 'card' },
      h('div', { class: 'controls', style: 'margin-bottom:8px' },
        h('h2', { style: 'margin:0;font-size:16px' }, '案件ごとの残り'),
        segmented([{ value: true, label: '残りがある案件だけ' }, { value: false, label: 'すべて' }], st.hideDone, (v) => { st.hideDone = v; ctx.rerender(); }, '表示する案件')),
      h('div', { class: 'tablewrap' }, h('table', { class: 'cashtable' },
        h('thead', null, h('tr', null, h('th', { class: 'stick' }, '案件'), h('th', { class: 'num' }, '契約金額'), h('th', { class: 'num' }, '入金済'), h('th', { class: 'num' }, '未入金'),
          h('th', { class: 'num gstart' }, '発注額'), h('th', { class: 'num' }, '出金済'), h('th', { class: 'num' }, '未出金'))),
        h('tbody', null, rows.length ? rows : h('tr', null, h('td', { colspan: 7, class: 'muted' }, '残りがある案件はありません')),
          rows.length ? h('tr', { class: 'tot' }, h('td', { class: 'stick' }, '合計'), h('td', { colspan: 2 }), h('td', { class: 'num' }, yen(shown.reduce((s, c) => s + c.unpaidIn, 0))),
            h('td', { colspan: 2 }), h('td', { class: 'num' }, yen(shown.reduce((s, c) => s + c.unpaidOut, 0)))) : null))),
      h('p', { class: 'small muted' }, '未入金 = 契約金額 − 入金済み、未出金 = 発注額(足場・職人①〜④) − 出金済み。契約日より前の日付の入出金は、同じ苗字の別の案件のものとして数えません。')),
    h('div', { class: 'card' },
      h('div', { class: 'controls', style: 'margin-bottom:8px' },
        h('h2', { style: 'margin:0;font-size:16px' }, '入出金の記録'),
        segmented(kindOpts, st.kind, (v) => { st.kind = v; st.more = false; ctx.rerender(); }, '種別')),
      h('div', { class: 'tablewrap' }, h('table', { class: 'cashtable' },
        h('thead', null, h('tr', null, ['日付', '種別', '顧客名', '区分', '支払先'].map((t) => h('th', null, t)), h('th', { class: 'num' }, '金額(円)'))),
        h('tbody', null, ledShown.map(({ r }) => h('tr', null, h('td', null, r['日付'] || '–'), h('td', null, r['種別']), h('td', null, r['顧客名'] || ''),
          h('td', null, r['区分'] || ''), h('td', null, r['支払先'] || ''), h('td', { class: 'num' }, yen(E.num(r['金額(円)']))))),
          led.length ? null : h('tr', null, h('td', { colspan: 6, class: 'muted' }, '記録がありません'))))),
      !st.more && led.length > 20 ? h('p', null, h('button', { class: 'btn', type: 'button', onclick: () => { st.more = true; ctx.rerender(); } }, `残り${led.length - 20}件も表示`)) : null));
}
