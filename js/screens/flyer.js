import { h, segmented, kpi } from '../ui.js';
import * as E from '../engine.js';

const pct = (x, d = 1) => (x === null || x === undefined ? '–' : `${(x * 100).toFixed(d)}%`);
const man = (n) => (n === null || n === undefined ? '–' : E.fmtMan(E.yenToMan(n), 1));
const yen = (n) => (n === null || n === undefined ? '–' : `${E.fmtInt(n)}円`);
const num0 = (n) => (n === null || n === undefined ? '–' : E.fmtInt(n));
const ym = (r) => `${r.year}/${r.month}`;

// 黒字・赤字がひと目で分かる表示(マイナスは赤字色+「赤字」、プラスは「黒字」)。値が未入力ならnullのまま「–」。
const negClass = (n) => (n !== null && n !== undefined && n < 0 ? 'negv' : '');
const profitText = (n) => (n === null || n === undefined ? '–' : `${n < 0 ? '−' : '+'}${man(Math.abs(n))}万円`);
const profitStatus = (n) => (n === null || n === undefined ? '' : n < 0 ? '赤字' : '黒字');
const profitEl = (n) => h('span', { class: negClass(n) }, profitText(n));

// チラシ・折込: 予算・枚数から単価、反響・成約から成約率、利益から予算に対するROIと利益率(利益÷売上)を見る。
// 黒字/赤字は「正味(利益−予算)」で判定する。利益だけでは配布にかけた広告費がまだ引かれていないため。
export function render(ctx) {
  const st = (ctx.state.flyer ||= { year: 0, shown: 20, tab: '' });
  const allRows = E.flyerRows(ctx.data);
  const years = E.flyerYears(allRows);
  if (st.year !== 0 && !years.includes(st.year)) st.year = 0;
  const sum = E.flyerSummary(allRows, { year: st.year });
  const rows = st.year ? allRows.filter((r) => r.year === st.year) : allRows;
  const scope = st.year ? `${st.year}年` : '累計';

  // 配布の一覧のタブ(媒体=チラシ/折込。データにある媒体だけをタブにする)
  const mediaList = [...new Set(rows.map((r) => r.media).filter(Boolean))];
  if (!mediaList.includes(st.tab)) st.tab = mediaList[0] || '';
  const tabRows = st.tab ? rows.filter((r) => r.media === st.tab) : rows;
  const shown = tabRows.slice(0, st.shown);

  if (!allRows.length) {
    return h('div', null,
      h('div', { class: 'head' }, h('div', null, h('h1', null, 'チラシ・折込'), h('div', { class: 'sub' }, '配布ごとの予算・枚数・反響・成約'))),
      h('p', { class: 'notice' }, 'チラシ・折込シートにまだデータがありません。予算(円)・枚数・媒体などを入力すると、ここに集計が出ます。'));
  }

  const sumRow = (r, cls) => h('tr', { class: cls },
    h('td', { class: 'nowrap' }, r.name),
    h('td', { class: 'num' }, r.n),
    h('td', { class: 'num' }, man(r.budget)),
    h('td', { class: 'num' }, num0(r.count)),
    h('td', { class: 'num' }, r.unit === null ? '–' : `${r.unit.toFixed(1)}円`),
    h('td', { class: 'num' }, r.leads === null ? '–' : r.leads),
    h('td', { class: 'num' }, r.deals === null ? '–' : r.deals),
    h('td', { class: 'num' }, pct(r.rate)),
    h('td', { class: 'num' }, profitEl(r.profit)),
    h('td', { class: 'num strongv' }, profitEl(r.net)),
    h('td', { class: `num ${negClass(r.marginRate)}` }, pct(r.marginRate)),
    h('td', { class: `num ${r.roi !== null && r.roi < 0 ? 'negv' : ''}` }, pct(r.roi)));

  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, 'チラシ・折込'),
      h('div', { class: 'sub' }, '媒体ごとの予算・枚数・反響・成約率と、正味(黒字/赤字)・利益率・ROI'))),
    h('div', { class: 'controls' },
      segmented([{ value: 0, label: '累計' }, ...years.map((y) => ({ value: y, label: `${y}年` }))], st.year, (v) => { st.year = v; st.shown = 20; ctx.rerender(); }, '期間')),
    h('div', { class: 'grid' },
      kpi('予算合計', man(sum.total.budget), '万円', `${scope}・${sum.total.n}回配布`),
      kpi('利益', profitEl(sum.total.profit), '', sum.total.profit === null ? '利益の入力がありません' : '配布から生まれた契約の利益(広告費はまだ含みません)'),
      kpi('正味利益', profitEl(sum.total.net), '', sum.total.net === null ? '利益の入力がありません' : `${scope}は${profitStatus(sum.total.net)}です(利益 − 予算)`),
      kpi('利益率', pct(sum.total.marginRate), '', '利益 ÷ 売上'),
      kpi('反響', sum.total.leads === null ? '–' : `${sum.total.leads}`, '件', ''),
      kpi('成約率', pct(sum.total.rate), '', sum.total.leads === null ? '反響件数の入力がありません' : `反響${sum.total.leads}件のうち成約${sum.total.deals}件`),
      kpi('ROI', pct(sum.total.roi), '', sum.total.roi === null ? '利益の入力がありません' : '利益 ÷ 予算')),
    h('div', { class: 'card' },
      h('h2', null, `${scope}の媒体ごとの成績`),
      h('div', { class: 'tablewrap' }, h('table', { class: 'ratiotable' },
        h('thead', null, h('tr', null, h('th', null, '媒体'), h('th', { class: 'num' }, '回数'), h('th', { class: 'num' }, '予算(万円)'),
          h('th', { class: 'num' }, '枚数'), h('th', { class: 'num' }, '単価'), h('th', { class: 'num' }, '反響'), h('th', { class: 'num' }, '成約'),
          h('th', { class: 'num' }, '成約率'), h('th', { class: 'num' }, '利益'), h('th', { class: 'num' }, '正味'), h('th', { class: 'num' }, '利益率'), h('th', { class: 'num' }, 'ROI'))),
        h('tbody', null, sum.rows.map((r) => sumRow(r)), sumRow(sum.total, 'tot')))),
      h('p', { class: 'small muted' }, '単価は 予算 ÷ 枚数。反響・成約・売上・利益は、まだ結果が出ていない配布(空欄)を除いた回だけで合計しています。利益は配布から生まれた契約の利益で、広告費(予算)はまだ含んでいません。正味は 利益 − 予算 で、広告費を払った後に実際に残った金額です。黒字/赤字は正味で判断し、マイナスの場合は赤字(赤字色)で表示しています。利益率は 利益 ÷ 売上、ROIは 利益 ÷ 予算 です。')),
    h('div', { class: 'card' },
      h('h2', null, `配布の一覧(${tabRows.length}件)`),
      mediaList.length > 1 ? h('div', { class: 'controls', style: 'margin-bottom:8px' },
        segmented(mediaList.map((m) => ({ value: m, label: m })), st.tab, (v) => { st.tab = v; st.shown = 20; ctx.rerender(); }, '媒体')) : null,
      tabRows.length ? h('div', { class: 'custlist' }, shown.map((r) => h('div', { class: 'flyerrow' },
        h('div', { class: 'cr-top' },
          h('span', { class: 'cr-name' }, `${ym(r)}　${r.media}`),
          h('span', { class: 'cr-amt' }, `${man(r.budget)}万円`)),
        h('div', { class: 'cr-addr' }, [r.agency, r.area].filter(Boolean).join(' / ') || h('span', { class: 'muted' }, '委託業者・反響エリアの入力なし')),
        h('div', { class: 'cr-meta' },
          h('span', null, `${num0(r.count)}枚`),
          h('span', null, r.unit === null ? '単価–' : `単価${r.unit.toFixed(1)}円`),
          h('span', null, r.leads === null ? '反響–' : `反響${r.leads}件`),
          h('span', null, r.deals === null ? '成約–' : `成約${r.deals}件(${pct(r.rate)})`),
          h('span', null, r.sales === null ? '売上–' : `売上${man(r.sales)}万円`),
          h('span', null, r.profit === null ? '利益–' : [`利益`, profitEl(r.profit)]),
          h('span', null, r.net === null ? '正味–' : [`正味`, profitEl(r.net), `(${profitStatus(r.net)})`]),
          h('span', null, r.marginRate === null ? '利益率–' : `利益率${pct(r.marginRate)}`),
          h('span', null, r.roi === null ? 'ROI–' : `ROI${pct(r.roi)}`))))) : h('p', { class: 'notice' }, 'この媒体の配布がありません。'),
      tabRows.length > st.shown ? h('div', { class: 'controls', style: 'margin:10px 0 0' }, h('button', { class: 'btn', type: 'button', onclick: () => { st.shown += 20; ctx.rerender(); } }, `もっと見る(あと${tabRows.length - st.shown}件)`)) : null));
}
