import { h, segmented, kpi } from '../ui.js';
import * as E from '../engine.js';
import { mapPdfBlob, downloadBlob } from '../pdf.js';

const dl = (d) => (d ? `${Number(d.slice(0, 4))}/${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '');

// 施工地図: 町名ごとのオレンジの枠に、丁目ごとに邸を並べる。未完工(完工日が空欄)の邸は青
export function render(ctx) {
  const st = (ctx.state.map ||= { city: '', onlyOpen: false, busy: false });
  const houses = E.mapHouses(ctx.custs);
  const cities = E.mapCities(houses);
  if (!cities.some((c) => c.city === st.city)) st.city = (cities.find((c) => c.city === '江戸川区') || cities[0] || { city: '' }).city;
  const blocks = E.mapBlocks(houses, { city: st.city, onlyOpen: st.onlyOpen });
  const inCity = houses.filter((x) => x.city === st.city);
  const open = inCity.filter((x) => !x.done).length;
  const today = E.todayStr();

  const chip = (x) => {
    const tip = [x.address, x.startDate ? `着工 ${dl(x.startDate)}` : '着工日 未入力', x.done ? `完工 ${dl(x.doneDate)}` : '完工日 未入力(未完工)', x.hasAdd ? '追加工事あり' : ''].filter(Boolean).join(' / ');
    return h('a', { class: `chip ${x.done ? 'done' : 'open'}`, title: tip, href: E.placeHref(x.address), target: '_blank', rel: 'noopener' }, x.label, x.hasAdd ? h('sup', null, '追') : null);
  };
  const block = (b) => h('div', { class: `mapblock ${b.open ? 'hasopen' : ''}` },
    h('div', { class: 'mbhead' }, h('b', null, b.town), h('span', { class: 'small muted' }, `${b.count}件`, b.open ? h('span', { class: 'openn' }, ` 未完工${b.open}`) : null)),
    b.chomes.map((c) => h('div', { class: 'mbrow' }, h('div', { class: 'chome' }, c.label), h('div', { class: 'chips' }, c.items.map(chip)))));

  const btn = h('button', { class: 'btn primary', type: 'button', disabled: st.busy || !blocks.length, onclick: async () => {
    btn.disabled = true; btn.textContent = 'PDFを作っています…';
    try {
      const blob = await mapPdfBlob({ title: `施工地図 ${st.city}${st.onlyOpen ? '(未完工のみ)' : ''}`, blocks });
      downloadBlob(blob, `施工地図_${st.city}${st.onlyOpen ? '_未完工' : ''}.pdf`);
    } catch (e) { alert('PDFを作れませんでした: ' + e.message); }
    btn.disabled = false; btn.textContent = 'PDFをダウンロード';
  } }, 'PDFをダウンロード');

  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, '施工地図'),
      h('div', { class: 'sub' }, '町名ごと・丁目ごとに、施工した邸を並べています。完工日が空欄の邸は青、その邸がある町名はオレンジの枠です'))),
    h('div', { class: 'controls' },
      h('select', { 'aria-label': '区・市', onchange: (e) => { st.city = e.target.value; ctx.rerender(); } },
        cities.map((c) => h('option', { value: c.city, selected: c.city === st.city }, `${c.city}(${c.count})`))),
      segmented([{ value: false, label: 'すべて' }, { value: true, label: '未完工だけ' }], st.onlyOpen, (v) => { st.onlyOpen = v; ctx.rerender(); }, '表示'),
      btn),
    h('div', { class: 'grid' }, kpi('施工した邸', inCity.length, '件', st.city), kpi('未完工(青)', open, '件', '完工日が空欄の邸')),
    h('div', { class: 'legend2' }, h('span', { class: 'chip open' }, '未完工'), h('span', { class: 'chip done' }, '完工'), h('span', { class: 'mapkey' }, 'オレンジの枠 = 未完工の邸がある町名'), h('span', { class: 'small muted' }, '「追」は追加工事つきの邸(同じ邸にまとめています)。邸を押すと、その住所がGoogleマップで開きます(カーソルを合わせると住所と日付が出ます)')),
    blocks.length ? h('div', { class: 'mapgrid' }, blocks.map(block)) : h('p', { class: 'notice' }, st.onlyOpen ? '未完工の邸はありません。' : 'この区・市の邸がありません。住所は顧客シートの「住所」列から読んでいます。'),
    h('p', { class: 'small muted' }, '住所の「町名」と「丁目」で分けています(例: 江戸川区東小岩3-12-4 → 東小岩・3丁目)。追加工事は元の邸にまとめて1つだけ出し、下請け(MIRAI)は出しません。'));
}
