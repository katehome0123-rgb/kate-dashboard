import { h, segmented } from '../ui.js';
import * as E from '../engine.js';

// 黒字赤字: 営業担当ごとの収支。「引き継ぎ」の計算ルールのとおり。年は契約日の年。
// 着地(黒字/赤字) = 取り分の粗利 − (歩合＋固定給＋紹介料)。塩野のみ歩合・固定給あり。佳人は紹介料だけ引く。
export function render(ctx) {
  const persons = E.PL_PERSONS;
  const st = (ctx.state.plPerson ||= persons[0]);
  const person = persons.includes(st) ? st : persons[0];
  const rep = E.plPersonReport(ctx.data, ctx.custs, person);
  const isFixed = person === E.PL_FIXED_PERSON;
  const man = (n) => E.fmtMan(n, 1);
  const sign = (n) => (n > 0 ? '+' : '') + man(n);

  const cntCell = (r) => h('td', { class: 'num' }, r.count, r.unDone ? h('div', { class: 'small muted' }, `うち未完工${r.unDone}`) : null);
  const grossCell = (r) => h('td', { class: 'num' }, man(r.gross), h('div', { class: 'small muted' }, `ポータル${man(r.grossPortal)}／以外${man(r.grossOther)}`));
  const referralCell = (r) => h('td', { class: 'num' }, man(r.referral), h('div', { class: 'small muted' }, `${r.leadCount}件`));
  const landingCell = (r) => h('td', { class: 'num', style: `font-weight:700;color:${r.landing >= 0 ? '#15803d' : '#dc2626'}` }, sign(r.landing), h('div', { class: 'small muted' }, r.landing >= 0 ? '黒字' : '赤字'));

  const line = (r, cls) => h('tr', { class: cls || '' },
    h('td', null, r.year === null ? '合計' : `${r.year}年`),
    cntCell(r),
    grossCell(r),
    isFixed ? h('td', { class: 'num' }, man(r.commission)) : null,
    isFixed ? h('td', { class: 'num' }, man(r.fixedSalary), r.months ? h('div', { class: 'small muted' }, `${r.months}か月`) : null) : null,
    referralCell(r),
    landingCell(r));

  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, '黒字赤字'),
      h('div', { class: 'sub' }, '営業担当ごとの収支(黒字/赤字)。取り分の粗利から歩合・固定給・紹介料を引いた「着地」がプラスなら黒字、マイナスなら赤字。年は契約日の年')))
    ,
    h('div', { class: 'controls' },
      segmented(persons.map((p) => ({ value: p, label: p })), person, (v) => { ctx.state.plPerson = v; ctx.rerender(); }, '表示する人')),
    h('div', { class: 'card' },
      h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null,
          h('th', null, '年'), h('th', { class: 'num' }, '件数'), h('th', { class: 'num' }, '取り分粗利(万円)'),
          isFixed ? h('th', { class: 'num' }, '歩合') : null,
          isFixed ? h('th', { class: 'num' }, '固定給') : null,
          h('th', { class: 'num' }, '紹介料'), h('th', { class: 'num' }, '着地'))),
        h('tbody', null,
          rep.rows.map((r) => line(r)),
          line(rep.total, 'tot')))),
      h('p', { class: 'small muted' },
        '取り分の粗利 = 粗利(万円・完工前は入力中の予想粗利をそのまま使用) × 取り分の割合(クロのみ100%、クロとアポがいればクロ40%・アポ60%、アポのみ60%)。ポータルは集客経路がヌリカエ・窓口・リショップ・ぬりマッチ・プレマスタイルの案件です。'
        + (isFixed ? '歩合はポータル案件10%・ポータル以外20%(担当がクロでもアポでも媒体で決まります)。固定給は30万円×月数(2024年10月から今月まで、今月も1か月として数えます)。' : `${person}さんは歩合・固定給の対象外です。`)
        + '紹介料はポータル管理シートで担当になっている行数×2万円(反響日の年で数えます、ざっくりの金額です)。完工日が入っていない案件も粗利はそのまま含めて計算し、件数の下に「うち未完工」として件数だけ表示しています。'),
      h('p', { class: 'small muted' },
        '※ 顧客シートの粗利にポータルの紹介料がすでに引かれているかどうかは未確認です。引かれていた場合、この表の紹介料と二重に引いていることになります。担当Cが塩野で担当Aに誰か入っている案件が今後出てきた場合は、自動でクロ40%のルールが使われます。')));
}
