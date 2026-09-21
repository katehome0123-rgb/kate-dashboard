import { CONFIG } from './config.js';
import { h, initTheme, setTheme, hideTip } from './ui.js';
import { loadDemo, loadLive, AuthError } from './api.js';
import { hasValidToken, getToken, renderSignIn, signOut } from './auth.js';
import { enrichAll } from './engine.js';
import * as home from './screens/home.js';
import * as sales from './screens/sales.js';
import * as analysis from './screens/analysis.js';
import * as profit from './screens/profit.js';
import * as cash from './screens/cash.js';
import * as maint from './screens/maint.js';
import * as incentive from './screens/incentive.js';
import * as annual from './screens/annual.js';
import * as start from './screens/start.js';

const DEMO = new URLSearchParams(location.search).has('demo');
const ICON = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  sales: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  analysis: 'M12 3a9 9 0 1 0 9 9h-9zM15 3.5A9 9 0 0 1 20.5 9H15z',
  profit: 'M3 17l6-6 4 4 8-9m0 0h-5m5 0v5',
  maint: 'M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.5 2.5-2.2-.6-.6-2.2z',
  incentive: 'M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.6 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3',
  annual: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4M8 14h3m2 0h3m-8 3h3',
  start: 'M3 21h18M6 21V9l6-5 6 5v12M10 21v-6h4v6',
  cash: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 10v4m12-4v4',
};
const ROUTES = [
  { id: 'home', label: 'ホーム', mod: home },
  { id: 'maint', label: 'メンテ', mod: maint },
  { id: 'sales', label: '売上', mod: sales },
  { id: 'start', label: '着工粗利', mod: start },
  { id: 'analysis', label: '集客分析', mod: analysis },
  { id: 'profit', label: '利益率', mod: profit },
  { id: 'cash', label: '入出金', mod: cash },
  { id: 'incentive', label: 'インセン', mod: incentive },
  { id: 'annual', label: '年間収支', mod: annual },
];
const root = document.getElementById('root');
const ctx = { data: null, custs: [], state: { year: null, aYear: 0, person: '', alertAll: {} }, loadedAt: null, rerender: () => draw() };

function icon(d) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.append(p);
  return s;
}
const message = (title, body, ...extra) => root.replaceChildren(h('div', { class: 'center' }, h('div', { class: 'box' }, h('h1', null, title), h('p', null, body), ...extra)));

function draw() {
  hideTip();
  const id = (location.hash.replace('#/', '') || 'home');
  const route = ROUTES.find((r) => r.id === id) || ROUTES[0];
  const nav = h('nav', { class: 'nav', 'aria-label': 'メニュー' },
    h('div', { class: 'brand' }, 'ケイトホーム', h('small', null, '経営ダッシュボード')),
    ROUTES.map((r) => h('a', { href: `#/${r.id}`, 'aria-current': r.id === route.id ? 'page' : null }, icon(ICON[r.id]), r.label)));
  const bar = h('div', { class: 'controls', style: 'justify-content:flex-end;margin-bottom:4px' },
    DEMO ? h('span', { class: 'small muted' }, '練習用データを表示中') : h('span', { class: 'small muted' }, ctx.loadedAt ? `更新 ${ctx.loadedAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}` : ''),
    DEMO ? null : h('button', { class: 'btn', type: 'button', onclick: () => boot(true) }, '最新に更新'),
    h('button', { class: 'btn', type: 'button', onclick: () => { const dark = matchMedia('(prefers-color-scheme: dark)').matches; const cur = document.documentElement.getAttribute('data-theme') || (dark ? 'dark' : 'light'); setTheme(cur === 'dark' ? 'light' : 'dark'); }, 'aria-label': '明るさを切り替え' }, '明/暗'),
    DEMO ? null : h('button', { class: 'btn', type: 'button', onclick: () => { signOut(); location.reload(); } }, 'ログアウト'));
  const banner = DEMO ? h('div', { class: 'notice noprint', style: 'margin-bottom:12px' }, 'これは練習用の架空データです。実際の売上や案件の数字ではありません。') : null;
  const main = h('main', { class: 'main', id: 'main' }, bar, banner, route.mod.render(ctx));
  root.replaceChildren(h('div', { class: 'app' }, nav, main));
  document.title = `${route.label} | ケイトホーム`;
}

function setData(data) {
  ctx.data = data;
  ctx.custs = enrichAll(data);
  ctx.loadedAt = new Date();
  draw();
}

async function boot(force = false) {
  try {
    if (DEMO) return setData(await loadDemo());
    if (!CONFIG.APPS_SCRIPT_URL || !CONFIG.GOOGLE_CLIENT_ID) {
      return message('設定がまだです', 'js/config.js に Apps Script の URL と Google のクライアント ID を入れてください(README の手順 2〜4)。画面だけ試すなら、アドレスの最後に ?demo=1 を付けてください。');
    }
    if (hasValidToken()) {
      message('読み込み中…', 'スプレッドシートからデータを取得しています');
      try { return setData(await loadLive(getToken())); } catch (e) { if (!(e instanceof AuthError)) throw e; signOut(); }
    }
    const holder = h('div', { style: 'display:flex;justify-content:center;margin-top:16px;min-height:44px' });
    message('ログイン', 'オーナーのGoogleアカウントでログインしてください。', holder);
    await renderSignIn(holder, async () => { await boot(); });
  } catch (e) {
    message('読み込めませんでした', e.message || String(e), h('p', null, h('button', { class: 'btn primary', type: 'button', onclick: () => boot(true) }, 'もう一度')));
  }
}

initTheme();
addEventListener('hashchange', () => { if (ctx.data) draw(); });
boot();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
