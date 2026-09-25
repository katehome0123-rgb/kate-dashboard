import { h } from '../ui.js';
import * as E from '../engine.js';
import { addCustomer } from '../api.js';
import { getToken } from '../auth.js';

// 顧客を1件、その場で顧客シートに書き込む(契約日順を保って挿入)。
// ここで入れるのは契約したてに分かる項目だけ。材料費・職人発注・色・完工日・入金日などは、これまで通り進みながらスプシへ
const ROUTES = ['窓口', 'ヌリカエ', 'リショップ', 'ぬりマッチ', 'プレマスタイル', '自社', 'HP', 'MAP', 'チラシ', '紹介', 'YouTube', '折込', '訪問', '足場'];
const blank = (person) => ({ 契約日: E.todayStr(), 顧客名: '', 住所: '', '電話番号①': '', '契約金額(万円)': '', 集客経路: '', 担当C: person || '' });

export function render(ctx) {
  const DEMO = new URLSearchParams(location.search).has('demo');
  const persons = E.activePersons(ctx.data, ctx.custs);
  const st = (ctx.state.customerform ||= { cu: blank(persons[0] || ''), sending: false, done: false, error: '', lastName: '' });
  if (!st.cu.担当C && persons[0]) st.cu.担当C = persons[0];

  const set = (k) => (e) => { st.cu[k] = e.target.value; ctx.rerender(); };
  const field = (label, input, required) => h('label', null, h('span', { class: required ? 'req' : null }, label), input);
  const canSubmit = !!(st.cu.契約日 && st.cu.顧客名.trim() && st.cu.集客経路 && st.cu.担当C) && !st.sending;

  const submit = async () => {
    if (!canSubmit) return;
    st.sending = true; st.error = ''; ctx.rerender();
    try {
      const cu = { ...st.cu };
      for (const k of ['住所', '電話番号①', '契約金額(万円)']) if (!cu[k]) delete cu[k];
      await addCustomer(getToken(), cu);
      st.lastName = st.cu.顧客名;
      st.done = true;
    } catch (e) {
      st.error = e.message || String(e);
    } finally {
      st.sending = false; ctx.rerender();
    }
  };

  const head = h('div', { class: 'head' }, h('div', null, h('h1', null, '顧客登録'),
    h('div', { class: 'sub' }, '契約が決まった案件を1件、その場で顧客シートに書き込みます(契約日順に並びます)')));

  if (DEMO) {
    return h('div', null, head,
      h('p', { class: 'notice' }, '練習用データでは登録できません(スプレッドシートに書き込む機能のため、本番でログインしたときだけ使えます)。'));
  }

  if (st.done) {
    return h('div', null, head,
      h('div', { class: 'card' },
        h('p', { class: 'formok' }, `「${st.lastName}」を登録しました。`),
        h('div', { class: 'controls' },
          h('button', { class: 'btn primary', type: 'button', onclick: () => { st.done = false; st.cu = blank(st.cu.担当C); ctx.rerender(); } }, '続けて登録する'),
          h('button', { class: 'btn', type: 'button', onclick: () => { location.hash = '#/home'; } }, 'ホームに戻る'))));
  }

  return h('div', null, head,
    st.error ? h('p', { class: 'formerr' }, st.error) : null,
    h('div', { class: 'card formcard' },
      field('契約日', h('input', { class: 'finput', type: 'date', value: st.cu.契約日, onchange: set('契約日') }), true),
      field('顧客名', h('input', { class: 'finput', value: st.cu.顧客名, placeholder: '例: 丙野　太郎', oninput: set('顧客名') }), true),
      field('契約金額(万円)', h('input', { class: 'finput', type: 'number', inputmode: 'numeric', min: '0', step: '1', value: st.cu['契約金額(万円)'], placeholder: '例: 120', oninput: set('契約金額(万円)') })),
      field('集客経路', h('select', { onchange: set('集客経路') }, h('option', { value: '' }, '選んでください'), ROUTES.map((r) => h('option', { value: r, selected: r === st.cu.集客経路 }, r))), true),
      field('担当', h('select', { onchange: set('担当C') }, persons.map((p) => h('option', { value: p, selected: p === st.cu.担当C }, p))), true),
      field('住所', h('input', { class: 'finput', value: st.cu.住所, placeholder: '例: 江戸川区東小岩1-1-1', oninput: set('住所') })),
      field('電話番号', h('input', { class: 'finput', type: 'tel', value: st.cu['電話番号①'], placeholder: '例: 03-0000-0000', oninput: set('電話番号①') })),
      h('div', { class: 'controls', style: 'margin-top:16px' },
        h('button', { class: 'btn primary', type: 'button', disabled: !canSubmit, onclick: submit }, st.sending ? '登録中…' : '登録する')),
      h('p', { class: 'small muted', style: 'margin-top:10px' }, '＊は必須です。材料費・職人発注・色・完工日・入金日などは、これまで通りスプシへ入力してください。契約日・顧客名がそろうので、発注チェックのタスクも自動で作られます。ここで登録した内容が他の画面に反映されるのは、次に「最新に更新」を押したときです。')));
}
