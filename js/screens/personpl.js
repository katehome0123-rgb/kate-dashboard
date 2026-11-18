import { h, segmented, kpi } from '../ui.js';
import * as E from '../engine.js';
import { sabetsuPdfBlob, downloadBlob } from '../pdf.js';

// 担当別収支: 佳人・塩野それぞれが会社に残した利益(取り分の按分・ポータル紹介料差引後)と、
// もらった給料(佳人は役員報酬、塩野は基本給+歩合)を、累計/各年タブで見比べる。
const yen = (n) => E.fmtInt(n);
const sign = (n) => (n >= 0 ? '+' : '') + yen(n);
const CAT_LABEL = { own: '自社集客', portal: 'ポータル(紹介料差引後)', solar: 'ソーラー', add: '追加工事' };
const COLS_BY_PERSON = { 塩野: ['portal', 'own', 'solar', 'add'], 佳人: ['own', 'portal', 'solar', 'add'] };

export function render(ctx) {
  const persons = E.SABETSU_PERSONS;
  const st = (ctx.state.sabetsu ||= { person: persons[0], tab: 'total', year: 0, open: {} });
  const person = persons.includes(st.person) ? st.person : persons[0];
  const today = E.todayStr();
  const rep = E.sabetsuPersonReport(ctx.data, ctx.custs, person, today);
  const isDirector = person === E.SABETSU_DIRECTOR_PERSON;
  const payLabel = isDirector ? '役員報酬' : '給料・歩合';

  const head = (sub) => h('div', { class: 'head noprint' }, h('div', null, h('h1', null, '担当別収支'), h('div', { class: 'sub' }, sub)));

  if (!rep.years.length) {
    return h('div', null, head('営業担当ごとに、会社に残した利益と給料・役員報酬を比べます'),
      h('div', { class: 'card' }, h('p', { class: 'notice' }, `${person}さんが関わった契約がまだありません。`)));
  }

  if (st.tab === 'year' && !rep.years.includes(st.year)) st.year = rep.years[rep.years.length - 1];
  const viewYear = st.tab === 'year' ? st.year : null;
  const row = viewYear === null ? rep.total : rep.rows.find((r) => r.year === viewYear);
  const periodLabel = viewYear === null ? '累計' : `${viewYear}年`;

  // その人が一度も使わないカテゴリ(ソーラー・追加工事)は列ごと出さない
  const cats = (COLS_BY_PERSON[person] || ['own', 'portal', 'solar', 'add']).filter((cat) => {
    if (cat === 'own' || cat === 'portal') return true;
    if (cat === 'add') return rep.total.addCount > 0;
    if (cat === 'solar') return rep.total.solarCount > 0;
    return true;
  });

  const personSel = segmented(persons.map((p) => ({ value: p, label: p })), person, (v) => { st.person = v; st.year = 0; st.open = {}; ctx.rerender(); }, '対象者');
  const tabSel = segmented([{ value: 'total', label: '累計' }, { value: 'year', label: '各年' }], st.tab, (v) => { st.tab = v; ctx.rerender(); }, '見方');
  const yearSel = st.tab === 'year'
    ? segmented(rep.years.slice().reverse().map((y) => ({ value: y, label: `${y}年` })), st.year, (v) => { st.year = v; ctx.rerender(); }, '年')
    : null;

  const kpis = h('div', { class: 'grid' },
    kpi('会社に残した利益', yen(row.total), '円', periodLabel),
    kpi(payLabel, yen(row.pay), '円'),
    kpi('差し引き', sign(row.diff), '円', row.diff >= 0 ? '黒字' : '赤字'));

  const catNote = (cat) => {
    if (cat === 'portal' && row.referral) return `目安額 ${yen(row.portalBeforeReferral)}円 − 紹介料按分 ${yen(row.referral)}円`;
    if (cat === 'add') return `${row.addCount}件`;
    if (cat === 'solar') return `${row.solarCount}件`;
    return null;
  };
  const breakdown = h('div', { class: 'card' },
    h('h2', null, `${periodLabel}の内訳`),
    h('div', { class: 'tablewrap' }, h('table', null,
      h('tbody', null,
        cats.map((cat) => h('tr', null,
          h('td', null, CAT_LABEL[cat], catNote(cat) ? h('div', { class: 'small muted' }, catNote(cat)) : null),
          h('td', { class: 'num' }, yen(row[cat])))),
        h('tr', { class: 'tot' }, h('td', null, '利益合計'), h('td', { class: 'num' }, yen(row.total)))))));

  // 人ごとの参考表
  let extra = null;
  if (person === '塩野') {
    const portalOnlyDiff = row.portal - row.pay;
    extra = h('div', { class: 'card' },
      h('h2', null, 'ポータルだけで見ると'),
      h('p', { class: 'small muted' }, 'ポータル(紹介料差引後)だけを給料・歩合と比べるとどうなるか(自社集客・追加工事は除く)'),
      h('div', { class: 'tablewrap' }, h('table', null, h('tbody', null,
        h('tr', null, h('td', null, 'ポータル(紹介料差引後)'), h('td', { class: 'num' }, yen(row.portal))),
        h('tr', null, h('td', null, payLabel), h('td', { class: 'num' }, yen(row.pay))),
        h('tr', { class: 'tot' }, h('td', null, '差し引き'), h('td', { class: 'num' }, sign(portalOnlyDiff)))))));
  } else if (person === '佳人') {
    const flyer = E.sabetsuFlyerCostYen(ctx.data, viewYear);
    const afterFlyer = row.total - flyer;
    extra = h('div', { class: 'card' },
      h('h2', null, 'チラシ・折込の費用も引くと'),
      h('p', { class: 'small muted' }, 'チラシ・折込シートの予算の合計を、利益合計からさらに引くとどうなるか(会社全体のチラシ・折込費用です)'),
      h('div', { class: 'tablewrap' }, h('table', null, h('tbody', null,
        h('tr', null, h('td', null, '利益合計'), h('td', { class: 'num' }, yen(row.total))),
        h('tr', null, h('td', null, 'チラシ・折込の費用'), h('td', { class: 'num' }, yen(flyer))),
        h('tr', { class: 'tot' }, h('td', null, 'チラシ・折込を引いた後'), h('td', { class: 'num' }, yen(afterFlyer)))))));
  }

  // ドリルダウン(案件ごとの明細)
  const dealsOpen = !!st.open[`${person}:${st.tab}:${viewYear}`];
  const toggleDeals = () => { st.open[`${person}:${st.tab}:${viewYear}`] = !dealsOpen; ctx.rerender(); };
  const dealRows = row.deals.slice().sort((a, b) => String(b.contractDate).localeCompare(String(a.contractDate)));
  const drill = h('div', { class: 'card noprint' },
    h('div', { class: 'controls', style: 'justify-content:space-between;margin:0' },
      h('h2', { style: 'margin:0' }, `${periodLabel}の案件一覧(${dealRows.length}件)`),
      h('button', { class: 'btn', type: 'button', onclick: toggleDeals }, dealsOpen ? 'とじる' : 'ひらく')),
    dealsOpen ? h('div', { class: 'tablewrap', style: 'margin-top:10px' }, h('table', null,
      h('thead', null, h('tr', null,
        h('th', null, '邸名'), h('th', null, '契約日'), h('th', null, '経路'), h('th', { class: 'num' }, '按分'),
        h('th', { class: 'num' }, '利益(円)'), h('th', null, '備考'))),
      h('tbody', null, dealRows.map((d) => h('tr', null,
        h('td', null, d.name), h('td', null, String(d.contractDate).slice(0, 10)), h('td', null, CAT_LABEL[d.category] || d.route),
        h('td', { class: 'num' }, `${Math.round(d.share * 100)}%`), h('td', { class: 'num' }, yen(d.profit)),
        h('td', null,
          d.predicted ? h('span', { class: 'small muted' }, '予想') : null,
          d.missingCommission ? h('span', { class: 'small muted' }, ' 手数料未入力') : null))))))
      : null);

  // 成約手数料が未入力のポータル案件(会社全体)
  const missing = E.sabetsuMissingCommissionList(ctx.custs, today);
  const missingCard = missing.length ? h('div', { class: 'card noprint' },
    h('h2', null, `成約手数料が未入力のポータル案件(${missing.length}件)`),
    h('p', { class: 'small muted' }, 'ヌリカエ・リショップの契約で、経費の「その他」に入っている金額が目安額(契約金額の10%・5%)より大きくずれている案件です。経費を入力すると、上の利益から自動で外れます。'),
    h('div', { class: 'tablewrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, '邸名'), h('th', null, '契約日'), h('th', null, '経路'), h('th', null, '担当'), h('th', { class: 'num' }, '目安額'), h('th', { class: 'num' }, '入力済み'), h('th', { class: 'num' }, '差額'))),
      h('tbody', null, missing.map((m) => h('tr', null,
        h('td', null, m.name), h('td', null, String(m.contractDate).slice(0, 10)), h('td', null, m.route), h('td', null, m.person),
        h('td', { class: 'num' }, yen(m.estimate)), h('td', { class: 'num' }, yen(m.entered)), h('td', { class: 'num' }, yen(m.topup)))))))) : null;

  const pdfBtn = h('button', {
    class: 'btn primary', type: 'button', onclick: async (e) => {
      const btn = e.currentTarget, label = btn.textContent;
      btn.disabled = true; btn.textContent = 'PDFを作っています…';
      try {
        const kpiModel = [
          { label: '会社に残した利益', value: `${yen(row.total)}円` },
          { label: payLabel, value: `${yen(row.pay)}円` },
          { label: '差し引き', value: `${sign(row.diff)}円`, neg: row.diff < 0 },
        ];
        const rowsModel = cats.map((cat) => ({ label: CAT_LABEL[cat], value: `${yen(row[cat])}円`, note: catNote(cat) }));
        let extraModel = null;
        if (person === '塩野') {
          extraModel = { label: 'ポータルだけで見ると', lines: [
            { label: 'ポータル(紹介料差引後)', value: `${yen(row.portal)}円` },
            { label: payLabel, value: `${yen(row.pay)}円` },
            { label: '差し引き', value: `${sign(row.portal - row.pay)}円` },
          ] };
        } else {
          const flyer = E.sabetsuFlyerCostYen(ctx.data, viewYear);
          extraModel = { label: 'チラシ・折込の費用も引くと', lines: [
            { label: '利益合計', value: `${yen(row.total)}円` },
            { label: 'チラシ・折込の費用', value: `${yen(flyer)}円` },
            { label: 'チラシ・折込を引いた後', value: `${yen(row.total - flyer)}円` },
          ] };
        }
        const model = {
          title: '担当別収支', person, periodLabel, payLabel, issued: today.replaceAll('-', '/'),
          kpis: kpiModel, rows: rowsModel, total: `${yen(row.total)}円`, extra: extraModel,
          footnote: '利益は、契約ごとの着地利益(税抜売上−実際の経費)を取り分の割合で按分した金額です。ポータル(ヌリカエ・窓口・リショップ・ぬりマッチ・プレマスタイル)の案件は、成約手数料の目安額(経費の入力が目安額の90%未満の場合のみ上乗せ)と、紹介料(その年のポータル反響件数で按分)を差し引いています。追加工事は、顧客シートで「収支に含める」の印がある案件だけを数えています。',
        };
        downloadBlob(await sabetsuPdfBlob(model), `${person}収支_${viewYear === null ? '累計' : viewYear}.pdf`);
      } catch (err) { alert('PDFを作れませんでした: ' + (err.message || err)); }
      btn.disabled = false; btn.textContent = label;
    },
  }, 'PDFに保存');

  return h('div', null,
    head('営業担当ごとに、会社に残した利益と給料・役員報酬を比べます'),
    h('div', { class: 'controls noprint' }, personSel, tabSel, yearSel, pdfBtn),
    kpis, breakdown, extra, drill, missingCard,
    h('p', { class: 'small muted' },
      '利益 = 契約ごとの着地利益(税抜売上−実際の経費)を、取り分の割合(クロとアポがいる案件はクロ40%・アポ60%、どちらか一方だけなら100%)で按分した金額の合計です。'
      + 'ポータルの案件は、成約手数料の目安額(契約金額×ヌリカエ10%・リショップ5%。経費の「その他」が目安額の90%未満のときだけ、その差額を上乗せで差し引きます)と、'
      + '紹介料(年別シートの紹介料の合計を、その年のポータル反響件数の割合で按分)を差し引いています。'
      + '追加工事(集客経路が「追加」、または顧客名に「邸追」が入る案件)は、顧客シートの「収支に含める」の列に印がある案件だけを数えます。'
      + `${payLabel}は、` + (isDirector ? '年間収支シートの役員報酬の実額です(今年はまだ終わっていない月を除きます)。' : '給与データシートの基本給+歩合の実額です(今月分が未入力の場合は、直近の基本給だけを仮で1か月分足しています)。')));
}
