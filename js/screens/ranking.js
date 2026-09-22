import { h, segmented, barCell } from '../ui.js';
import * as E from '../engine.js';

const man = (n) => (n / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 1 });
const pct = (x) => `${(x * 100).toFixed(1)}%`;

// ランキング: 職人(塗装職人への発注額)と、カラー(外壁・屋根・カバー)。年は契約年
export function render(ctx) {
  const st = (ctx.state.rank ||= { tab: 'craft', year: 0, open: {} });
  const years = E.craftsmanYears(ctx.custs);
  if (st.year !== 0 && !years.includes(st.year)) st.year = 0;
  const year = st.year || null;
  const scope = st.year ? `${st.year}年` : '累計';
  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, 'ランキング'),
      h('div', { class: 'sub' }, '職人への発注額と、人気の色。年は契約日の年です'))),
    h('div', { class: 'controls' },
      segmented([{ value: 'craft', label: '職人ランキング' }, { value: 'color', label: 'カラーランキング' }], st.tab, (v) => { st.tab = v; ctx.rerender(); }, '種類'),
      segmented([{ value: 0, label: '累計' }, ...years.map((y) => ({ value: y, label: `${y}年` }))], st.year, (v) => { st.year = v; ctx.rerender(); }, '期間')),
    st.tab === 'craft' ? craft(ctx, year, scope) : color(ctx, st, year, scope));
}

function craft(ctx, year, scope) {
  const r = E.craftsmanRanking(ctx.data, ctx.custs, { year });
  const max = r.rows[0] ? r.rows[0].amount : 0;
  return h('div', { class: 'card' },
    h('h2', null, `職人ランキング(${scope}・発注額の多い順)`),
    r.rows.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'rankt' },
      h('thead', null, h('tr', null, h('th', { class: 'num' }, '順位'), h('th', null, '職人(会社名)'), h('th', { class: 'num' }, '発注額(万円)'), h('th', { class: 'num' }, '割合'), h('th', { class: 'num' }, '件数'), h('th', { class: 'num' }, '1件平均(万円)'))),
      h('tbody', null, r.rows.map((x) => h('tr', null,
        h('td', { class: 'num' }, x.rank), h('td', { class: 'nowrap strongv' }, x.name),
        h('td', { class: 'num' }, barCell(max ? x.amount / max : 0, man(x.amount))), h('td', { class: 'num' }, pct(x.share)),
        h('td', { class: 'num' }, x.jobs), h('td', { class: 'num' }, man(x.avg)))),
        h('tr', { class: 'tot' }, h('td', null), h('td', null, '合計'), h('td', { class: 'num' }, man(r.total)), h('td', { class: 'num' }, '100%'), h('td', null), h('td', null))))) : h('p', { class: 'notice' }, 'この期間の発注がありません。'),
    r.unregistered.length ? h('p', { class: 'notice' }, `職人マスターにない名前があります(塗装として数えています): ${r.unregistered.join('、')}。職人マスターのシートに種別つきで足してください。`) : null,
    h('p', { class: 'small muted' }, '顧客シートの「職人①〜④」と「発注」の金額から、職人マスターで種別が「塗装」の会社だけを数えています(足場屋・塗装以外の業者は除く)。名前の書き方が違うものは、マスターの「正しい名前」にまとめます。件数は、その職人に発注した契約の数です。年は契約日の年です。'));
}

function color(ctx, st, year, scope) {
  const r = E.colorRanking(ctx.custs, { year });
  const card = (key, title, note) => {
    const g = r[key];
    const shown = st.open[key] ? g.rows : g.rows.slice(0, 10);
    const max = g.rows[0] ? g.rows[0].count : 0;
    return h('div', { class: 'card' },
      h('h2', null, `${title}(${scope})`),
      g.rows.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'rankt' },
        h('thead', null, h('tr', null, h('th', { class: 'num' }, '順位'), h('th', null, '色'), h('th', { class: 'num' }, '件数'), h('th', { class: 'num' }, '割合'))),
        h('tbody', null, shown.map((x) => h('tr', null, h('td', { class: 'num' }, x.rank), h('td', { class: 'nowrap strongv' }, x.name),
          h('td', { class: 'num' }, barCell(max ? x.count / max : 0, x.count)), h('td', { class: 'num' }, pct(x.share))))))) : h('p', { class: 'notice' }, 'この期間のデータがありません。'),
      g.rows.length > 10 ? h('div', { class: 'controls', style: 'margin:10px 0 0' }, h('button', { class: 'btn', type: 'button', onclick: () => { st.open[key] = !st.open[key]; ctx.rerender(); } }, st.open[key] ? '上位10だけ表示' : `すべて表示(${g.rows.length}色)`)) : null,
      note ? h('p', { class: 'small muted' }, note) : null);
  };
  return h('div', null,
    card('wall', '外壁色', '外壁①〜④に入っている品番・色名です。艶の指定((艶消)・(3分艶)など)は除いて数えています。1つの契約で同じ色が2か所に入っていても1件です。割合は、使われた色の延べ数に対する割合です。'),
    card('roof', '屋根色', '屋根色の列です。屋根材がカバー材でない契約だけ。'),
    card('cover', 'カバー色', '屋根材が スーパーガルテクト / フックシングル / エコグラーニ(カバー材)の契約の屋根色です。'));
}
