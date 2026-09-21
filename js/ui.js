// 画面部品(DOMを作る小さな関数と、SVGのグラフ)。データの文字は textContent で入れるので安全です。
export const SVGNS = 'http://www.w3.org/2000/svg';

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export function s(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  for (const kid of kids.flat()) if (kid) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

// ---- 切り替えボタン(年など) -------------------------------------
export function segmented(options, value, onChange, label) {
  const box = h('div', { class: 'seg', role: 'group', 'aria-label': label || '切り替え' });
  for (const o of options) {
    box.append(h('button', {
      type: 'button', 'aria-pressed': String(o.value === value),
      onclick: () => onChange(o.value),
    }, o.label));
  }
  return box;
}

// ---- ツールチップ(全グラフ共通) ---------------------------------
let tipEl;
export function showTip(evt, title, rows) {
  if (!tipEl) { tipEl = h('div', { class: 'tip', role: 'status' }); document.body.append(tipEl); }
  tipEl.replaceChildren(h('b', null, title), ...rows.map(([a, b]) => h('div', { class: 'r' }, h('span', null, a), h('span', null, b))));
  tipEl.style.display = 'block';
  const pad = 12;
  const w = tipEl.offsetWidth, hgt = tipEl.offsetHeight;
  let x = evt.clientX + pad, y = evt.clientY - hgt - pad;
  if (x + w > innerWidth - 8) x = evt.clientX - w - pad;
  if (y < 8) y = evt.clientY + pad;
  tipEl.style.left = Math.max(8, x) + 'px';
  tipEl.style.top = y + 'px';
}
export const hideTip = () => { if (tipEl) tipEl.style.display = 'none'; };

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const niceMax = (v) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
};

// 棒グラフ(縦・複数系列)。series=[{name, slot(1..8), values[]}]。幅に合わせて描き直す。
export function barChart({ labels, series, unit = '万円', height = 240, tooltip, refLine = null }) {
  const wrap = h('div', { class: 'chart' });
  const legend = series.length > 1
    ? h('div', { class: 'legend' }, series.map((se) => h('span', null, h('i', { style: `background:var(--s${se.slot})` }), se.name)))
    : null;
  const box = h('div');
  wrap.append(...(legend ? [legend] : []), box);
  const draw = () => {
    const W = Math.max(280, box.clientWidth || 640);
    const m = { l: 44, r: 8, t: 22, b: 26 };
    const iw = W - m.l - m.r, ih = height - m.t - m.b;
    const max = niceMax(Math.max(...series.flatMap((se) => se.values), refLine ? refLine.value : 0, 0));
    const y = (v) => m.t + ih - (v / max) * ih;
    const svg = s('svg', { viewBox: `0 0 ${W} ${height}`, role: 'img', 'aria-label': series.map((x) => x.name).join('・') + 'の月別グラフ' });
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = (max / ticks) * i;
      svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: cssVar('--grid'), 'stroke-width': 1 }));
      svg.append(s('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: cssVar('--ink2') }, Math.round(v).toLocaleString('ja-JP')));
    }
    const band = iw / labels.length;
    const n = series.length, gap = 2;
    const bw = Math.min(24, Math.max(4, (band * 0.7 - gap * (n - 1)) / n));
    labels.forEach((lb, i) => {
      const cx = m.l + band * i + band / 2;
      const gw = bw * n + gap * (n - 1);
      series.forEach((se, k) => {
        const v = se.values[i] || 0;
        const x = cx - gw / 2 + k * (bw + gap);
        const top = y(v), base = y(0), hh = base - top;
        if (hh > 0.5) {
          const r = Math.min(4, bw / 2, hh);
          svg.append(s('path', {
            d: `M${x},${base} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + bw - r},${top} Q${x + bw},${top} ${x + bw},${top + r} L${x + bw},${base} Z`,
            fill: cssVar(`--s${se.slot}`),
          }));
        }
      });
      svg.append(s('text', { x: cx, y: height - 8, 'text-anchor': 'middle', 'font-size': 11, fill: cssVar('--ink2') }, lb));
      const hit = s('rect', { x: m.l + band * i, y: m.t, width: band, height: ih + m.b, fill: 'transparent', tabindex: 0, 'aria-label': tooltip ? tooltip(i).title : lb });
      const show = (e) => { if (!tooltip) return; const t = tooltip(i); showTip(e, t.title, t.rows); };
      hit.addEventListener('pointermove', show);
      hit.addEventListener('pointerdown', show);
      hit.addEventListener('pointerleave', hideTip);
      hit.addEventListener('focus', () => { const b = hit.getBoundingClientRect(); show({ clientX: b.left + b.width / 2, clientY: b.top + 20 }); });
      hit.addEventListener('blur', hideTip);
      svg.append(hit);
    });
    if (refLine) { // 平均などの目安の線(点線)
      const yy = y(refLine.value);
      svg.append(s('line', { x1: m.l, x2: W - m.r, y1: yy, y2: yy, stroke: cssVar('--ink'), 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
      svg.append(s('text', { x: W - m.r, y: yy - 5, 'text-anchor': 'end', 'font-size': 11, 'font-weight': 700, fill: cssVar('--ink'), stroke: cssVar('--panel'), 'stroke-width': 3, 'paint-order': 'stroke' }, refLine.label));
    }
    svg.append(s('text', { x: 2, y: 10, 'font-size': 11, fill: cssVar('--ink2') }, `単位: ${unit}`));
    box.replaceChildren(svg);
  };
  wrap.__draw = draw;
  requestAnimationFrame(draw);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => draw()).observe(box);
  return wrap;
}

// 横棒つきの数字セル(成約率など)
export function barCell(ratio, text, slot = 1) {
  const track = h('span', { class: 'track' }, ratio === null ? null
    : h('span', { class: 'bar', style: `width:${Math.max(0, Math.min(1, ratio)) * 100}%;background:var(--s${slot})` }));
  return h('div', { class: 'barcell' }, track, h('span', { class: 'num' }, text));
}

export function kpi(label, value, unit, note) {
  return h('div', { class: 'card kpi' },
    h('div', { class: 'label' }, label),
    h('div', { class: 'value' }, value, unit ? h('small', null, unit) : null),
    note ? h('div', { class: 'note' }, note) : null);
}

export function trendEl(diff) {
  if (diff === null || diff === undefined) return h('span', { class: 'trend flat' }, '–');
  const abs = Math.abs(diff).toFixed(1);
  if (Math.abs(diff) < 0.05) return h('span', { class: 'trend flat' }, '→ 横ばい');
  return diff > 0
    ? h('span', { class: 'trend up' }, `▲ +${abs}pt 良化`)
    : h('span', { class: 'trend down' }, `▼ −${abs}pt 悪化`);
}

export function setTheme(mode) {
  if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', mode);
  try { localStorage.setItem('kate-theme', mode); } catch { /* 保存できなくても動く */ }
  document.querySelectorAll('.chart').forEach((c) => c.__draw && c.__draw());
}
export function initTheme() {
  let m = 'auto';
  try { m = localStorage.getItem('kate-theme') || 'auto'; } catch { /* noop */ }
  if (m !== 'auto') document.documentElement.setAttribute('data-theme', m);
}

// ---- アラートの表(ホームとメンテで共通) --------------------------
const ALERT_LIMIT = 15;
export const telHref = (p) => 'tel:' + String(p).replace(/[^\d+]/g, '');
export const STEP_TEXT = { done: '済', overdue: '超過', soon: 'まもなく', skip: '対象外' };

export function alertSection(ctx, key, { level, title, lead, columns, rows, rowCells }) {
  const all = !!ctx.state.alertAll[key];
  const shown = all ? rows : rows.slice(0, ALERT_LIMIT);
  return h('div', { class: `card alert ${level}` },
    h('div', { class: 'alerthead' },
      h('span', { class: `pill ${level}` }, level === 'urgent' ? '▲ 緊急' : '● 予告'),
      h('h2', null, `${title}(${rows.length}件)`)),
    lead ? h('p', { class: 'small muted', style: 'margin:4px 0 8px' }, lead) : null,
    h('div', { class: 'tablewrap' }, h('table', null,
      h('thead', null, h('tr', null, columns.map((c, i) => h('th', { class: (c.num ? 'num ' : '') + (i === 0 ? 'stick' : '') }, c.label)))),
      h('tbody', null, shown.map((r) => { const cells = rowCells(r); cells[0].classList.add('stick'); return h('tr', null, cells); })))),
    rows.length > ALERT_LIMIT ? h('div', { class: 'controls', style: 'margin:10px 0 0' },
      h('button', { class: 'btn', type: 'button', onclick: () => { ctx.state.alertAll[key] = !all; ctx.rerender(); } }, all ? '先頭だけ表示' : `すべて表示(${rows.length}件)`)) : null);
}

