import { h } from '../ui.js';
import * as E from '../engine.js';
import { addExpense } from '../api.js';
import { getToken } from '../auth.js';

// 経費を1件、その場でスプレッドシート(経費データ)に書き込む。法人税・設立費はここには出さない(手入力のみ)
const ITEMS = ['ガソリン代', '駐車場代', '高速代', '備品代', '飲食費', '租税公課', '交通費', 'プリント代', '車両代', '消耗品費', '福利厚生費', '印紙代', '携帯代', '交際費', '宿泊費', '車両費', 'その他'];
const blank = () => ({ 費目: '', 金額: '', 日付: E.todayStr() });

export function render(ctx) {
  const DEMO = new URLSearchParams(location.search).has('demo');
  const st = (ctx.state.expense ||= { ex: blank(), sending: false, done: false, error: '', last: null });

  const setAmount = (e) => { st.ex.金額 = e.target.value; ctx.rerender(); };
  const setDate = (e) => { st.ex.日付 = e.target.value; ctx.rerender(); };
  const pick = (item) => () => { st.ex.費目 = item; ctx.rerender(); };
  const amountNum = Number(st.ex.金額);
  const canSubmit = !!(st.ex.費目 && st.ex.金額 !== '' && isFinite(amountNum) && amountNum > 0 && st.ex.日付) && !st.sending;

  const submit = async () => {
    if (!canSubmit) return;
    st.sending = true; st.error = ''; ctx.rerender();
    try {
      await addExpense(getToken(), { 費目: st.ex.費目, 金額: amountNum, 日付: st.ex.日付 });
      st.last = { item: st.ex.費目, amount: amountNum };
      st.done = true;
    } catch (e) {
      st.error = e.message || String(e);
    } finally {
      st.sending = false; ctx.rerender();
    }
  };

  const head = h('div', { class: 'head' }, h('div', null, h('h1', null, '経費入力'),
    h('div', { class: 'sub' }, '費目を選んで金額と日付を入れると、その場で経費データに書き込みます')));

  if (DEMO) {
    return h('div', null, head,
      h('p', { class: 'notice' }, '練習用データでは登録できません(スプレッドシートに書き込む機能のため、本番でログインしたときだけ使えます)。'));
  }

  if (st.done) {
    return h('div', null, head,
      h('div', { class: 'card' },
        h('p', { class: 'formok' }, `「${st.last.item}」${st.last.amount.toLocaleString()}円を登録しました。`),
        h('div', { class: 'controls' },
          h('button', { class: 'btn primary', type: 'button', onclick: () => { st.done = false; st.ex = blank(); ctx.rerender(); } }, '続けて入力する'),
          h('button', { class: 'btn', type: 'button', onclick: () => { location.hash = '#/home'; } }, 'ホームに戻る'))));
  }

  return h('div', null, head,
    st.error ? h('p', { class: 'formerr' }, st.error) : null,
    h('div', { class: 'card formcard' },
      h('label', null, h('span', { class: 'req' }, '費目'),
        h('div', { class: 'tabrow' }, ITEMS.map((it) => h('button', {
          type: 'button', class: `taboption ${st.ex.費目 === it ? 'selected' : ''}`, onclick: pick(it),
        }, it)))),
      h('label', null, h('span', { class: 'req' }, '金額(円)'),
        h('input', { class: 'finput', type: 'number', inputmode: 'numeric', min: '1', step: '1', value: st.ex.金額, placeholder: '例: 3000', oninput: setAmount })),
      h('label', null, h('span', { class: 'req' }, '日付'),
        h('input', { class: 'finput', type: 'date', value: st.ex.日付, onchange: setDate })),
      h('div', { class: 'controls', style: 'margin-top:16px' },
        h('button', { class: 'btn primary', type: 'button', disabled: !canSubmit, onclick: submit }, st.sending ? '登録中…' : '登録する')),
      h('p', { class: 'small muted', style: 'margin-top:10px' }, '＊は必須です。法人税・設立費はここでは入力できません(これまで通りスプシへ)。ここで登録した内容が他の画面に反映されるのは、次に「最新に更新」を押したときです。')));
}
