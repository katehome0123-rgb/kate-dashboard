import { h } from '../ui.js';
import { telHref } from '../ui.js';
import * as E from '../engine.js';

const dl = (d) => { const s = String(d || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${Number(s.slice(0, 4))}/${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}` : String(d || ''); };
const BADGE = { '未着工': 'b-plan', '施工中': 'b-work', '完工済み': 'b-done' };
const STATUS = ['', '未着工', '施工中', '完工済み', '入金待ち'];

// 詳細の1行分の値を、種類に合わせて見やすくする(電話→発信、住所→Googleマップ)
function valueEl(r) {
  const v = r.value;
  if (r.kind === 'tel') return h('a', { href: telHref(v), class: 'tel' }, String(v));
  if (r.kind === 'addr') return h('a', { href: E.placeHref(String(v)), target: '_blank', rel: 'noopener', class: 'tel', title: 'Googleマップで開く' }, String(v));
  if (r.kind === 'yen') return `${E.fmtInt(Number(v))}円`;
  if (r.kind === 'man') return `${E.fmtMan(Number(v), 1)}万円`;
  if (r.kind === 'date') return dl(v);
  return String(v);
}

function closeDetail() { document.getElementById('cust-detail')?.remove(); document.body.classList.remove('noscroll'); }

function openDetail(c, today) {
  closeDetail();
  const st = E.customerStatus(c, today);
  const secs = E.customerSections(c);
  const box = h('div', { class: 'cd-box', role: 'dialog', 'aria-modal': 'true', 'aria-label': '顧客情報' },
    h('div', { class: 'cd-head' },
      h('div', null, h('div', { class: 'cd-name' }, c['顧客名'] || '(名前なし)'), h('span', { class: `badge ${BADGE[st]}` }, st)),
      h('button', { class: 'btn', type: 'button', onclick: closeDetail }, '閉じる')),
    h('div', { class: 'cd-body' }, secs.map((s) => h('div', { class: 'cd-sec' },
      h('h3', null, s.title),
      h('dl', null, s.rows.map((r) => h('div', { class: 'cd-row' }, h('dt', null, r.label), h('dd', null, valueEl(r)))))))),
    h('div', { class: 'cd-foot small muted' }, '見るだけの画面です。内容を直すときは、これまで通り顧客シートで直してください。'));
  const back = h('div', { id: 'cust-detail', class: 'cd-back', onclick: (e) => { if (e.target === back) closeDetail(); } }, box);
  document.body.append(back);
  document.body.classList.add('noscroll');
  box.querySelector('.cd-body').scrollTop = 0;
}

if (typeof document !== 'undefined' && !window.__custKeys) {
  window.__custKeys = true;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDetail(); });
  window.addEventListener('hashchange', closeDetail);
}

// 顧客: 検索・絞り込み(江戸川区だけ等)して、押すと全部の情報が見られる
export function render(ctx) {
  const st = (ctx.state.customers ||= { q: '', city: '', route: '', person: '', year: 0, status: '', shown: 30, showPaid: false });
  const today = E.todayStr();
  const fac = E.customerFacets(ctx.custs);
  const listBox = h('div', { class: 'card' });

  const paint = () => {
    const all = E.customerSearch(ctx.custs, st, today);
    const paidCount = all.filter((c) => c['入金日']).length;
    const rows = st.showPaid ? all : all.filter((c) => !c['入金日']);
    const shown = rows.slice(0, st.shown);
    const money = rows.reduce((a, c) => a + (c._sales || 0), 0);
    listBox.replaceChildren(...[
      h('h2', null, `顧客の一覧(${rows.length}件)`),
      rows.length ? h('p', { class: 'small muted', style: 'margin:0 0 8px' }, `契約金額の合計 ${E.fmtMan(money, 0)}万円(税込)。押すと詳細が開きます。`) : null,
      rows.length ? h('div', { class: 'custlist' }, shown.map((c) => {
        const s = E.customerStatus(c, today);
        return h('button', { type: 'button', class: 'custrow', onclick: () => openDetail(c, today) },
          h('div', { class: 'cr-top' }, h('span', { class: 'cr-name' }, c['顧客名'] || '(名前なし)'), h('span', { class: `badge ${BADGE[s]}` }, s)),
          h('div', { class: 'cr-addr' }, c['住所'] || '住所なし'),
          h('div', { class: 'cr-meta' },
            h('span', null, dl(c['契約日'])),
            h('span', { class: 'cr-amt' }, `${E.fmtMan(c._sales, 0)}万円`),
            h('span', null, [c['集客経路'], [c['担当C'], c['担当A']].filter(Boolean).join('・')].filter(Boolean).join(' / '))));
      })) : h('p', { class: 'notice' }, st.showPaid ? 'この条件に当てはまる顧客がいません。' : 'この条件で入金がまだの顧客はいません。'),
      rows.length > st.shown ? h('div', { class: 'controls', style: 'margin:10px 0 0' }, h('button', { class: 'btn', type: 'button', onclick: () => { st.shown += 30; paint(); } }, `もっと見る(あと${rows.length - st.shown}件)`)) : null,
      !st.showPaid && paidCount ? h('div', { class: 'controls', style: 'margin:10px 0 0' }, h('button', { class: 'btn', type: 'button', onclick: () => { st.showPaid = true; st.shown = 30; paint(); } }, `入金済みの顧客も見る(${paidCount}件)`)) : null,
      st.showPaid && paidCount ? h('div', { class: 'controls', style: 'margin:10px 0 0' }, h('button', { class: 'btn', type: 'button', onclick: () => { st.showPaid = false; st.shown = 30; paint(); } }, '入金済みの顧客を隠す')) : null,
    ].filter(Boolean));
  };
  const change = (key, num) => (e) => { st[key] = num ? Number(e.target.value) : e.target.value; st.shown = 30; paint(); };
  const sel = (label, key, opts, num) => h('select', { 'aria-label': label, onchange: change(key, num) },
    h('option', { value: '' }, `${label}:すべて`), opts.map((o) => h('option', { value: o.v, selected: o.v === st[key] }, o.t)));
  const search = h('input', { type: 'search', class: 'custsearch', placeholder: '名前・住所・電話・工事内容など', value: st.q, 'aria-label': '検索',
    oninput: (e) => { st.q = e.target.value; st.shown = 30; paint(); } });
  const clear = h('button', { class: 'btn', type: 'button', onclick: () => { Object.assign(st, { q: '', city: '', route: '', person: '', year: 0, status: '', shown: 30, showPaid: false }); ctx.rerender(); } }, '条件をクリア');
  paint();
  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, '顧客'), h('div', { class: 'sub' }, 'はじめに入金がまだの顧客だけを表示します(入金済みは「もっと見る」)。検索・絞り込みをして、押すと顧客情報がすべて見られます'))),
    h('div', { class: 'card' },
      search,
      h('div', { class: 'controls', style: 'margin:10px 0 0' },
        sel('区・市', 'city', fac.cities.map((x) => ({ v: x.name, t: `${x.name}(${x.n})` }))),
        sel('状態', 'status', STATUS.filter(Boolean).map((x) => ({ v: x, t: x }))),
        sel('集客経路', 'route', fac.routes.map((x) => ({ v: x.name, t: `${x.name}(${x.n})` }))),
        sel('担当', 'person', fac.persons.map((x) => ({ v: x.name, t: `${x.name}(${x.n})` }))),
        sel('契約年', 'year', fac.years.map((y) => ({ v: y, t: `${y}年` })), true),
        clear)),
    listBox);
}
