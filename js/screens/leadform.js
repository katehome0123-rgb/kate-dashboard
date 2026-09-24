import { h } from '../ui.js';
import * as E from '../engine.js';
import { addLead } from '../api.js';
import { getToken } from '../auth.js';

// 反響を1件、その場で登録する(区分=ポータル/自社/訪販は同じ列構成なので、1つのフォームでどれにでも書き込める)
const MEDIA = {
  ポータル: ['窓口', 'ヌリカエ', 'リショップ', 'ぬりマッチ', 'プレマスタイル'],
  自社: ['自社', 'HP', 'MAP', 'チラシ', '紹介', 'YouTube', '折込'],
  訪販: ['訪問', '足場'],
};
const CONTACTS = ['TEL', 'SNS', 'TEL＆SNS', 'MAIL', 'LINE'];
const blank = (kind, person) => ({ 区分: kind, 媒体: '', 邸名: '', 地域: '', 担当: person || '', 連絡方法: '', 内容: '', 反響日: E.todayStr() });

export function render(ctx) {
  const DEMO = new URLSearchParams(location.search).has('demo');
  const persons = E.activePersons(ctx.data, ctx.custs);
  const st = (ctx.state.leadform ||= { lead: blank('自社', persons[0] || ''), sending: false, done: false, error: '', lastName: '' });
  if (!st.lead.担当 && persons[0]) st.lead.担当 = persons[0];
  const mediaOpts = MEDIA[st.lead.区分] || [];
  if (mediaOpts.length && !mediaOpts.includes(st.lead.媒体)) st.lead.媒体 = '';

  const set = (k) => (e) => { st.lead[k] = e.target.value; ctx.rerender(); };
  const field = (label, input, required) => h('label', null, h('span', { class: required ? 'req' : null }, label), input);
  const canSubmit = !!(st.lead.媒体 && st.lead.邸名.trim() && st.lead.担当) && !st.sending;

  const submit = async () => {
    if (!canSubmit) return;
    st.sending = true; st.error = ''; ctx.rerender();
    try {
      const lead = { ...st.lead };
      if (lead.区分 === '訪販') delete lead.反響日; // 訪販は反響日を使わない運用のため送らない
      for (const k of ['地域', '連絡方法', '内容']) if (!lead[k]) delete lead[k];
      await addLead(getToken(), lead);
      st.lastName = st.lead.邸名;
      st.done = true;
    } catch (e) {
      st.error = e.message || String(e);
    } finally {
      st.sending = false; ctx.rerender();
    }
  };

  const head = h('div', { class: 'head' }, h('div', null, h('h1', null, '反響を登録'),
    h('div', { class: 'sub' }, '新しい反響を1件、その場でスプレッドシートに書き込みます')));

  if (DEMO) {
    return h('div', null, head,
      h('p', { class: 'notice' }, '練習用データでは登録できません(スプレッドシートに書き込む機能のため、本番でログインしたときだけ使えます)。'));
  }

  if (st.done) {
    return h('div', null, head,
      h('div', { class: 'card' },
        h('p', { class: 'formok' }, `「${st.lastName}」を登録しました。`),
        h('div', { class: 'controls' },
          h('button', { class: 'btn primary', type: 'button', onclick: () => { st.done = false; st.lead = blank(st.lead.区分, st.lead.担当); ctx.rerender(); } }, '続けて登録する'),
          h('button', { class: 'btn', type: 'button', onclick: () => { location.hash = '#/home'; } }, 'ホームに戻る'))));
  }

  return h('div', null, head,
    st.error ? h('p', { class: 'formerr' }, st.error) : null,
    h('div', { class: 'card formcard' },
      field('区分', h('select', { onchange: set('区分') }, ['ポータル', '自社', '訪販'].map((k) => h('option', { value: k, selected: k === st.lead.区分 }, k))), true),
      field('媒体', h('select', { onchange: set('媒体') }, h('option', { value: '' }, '選んでください'), mediaOpts.map((m) => h('option', { value: m, selected: m === st.lead.媒体 }, m))), true),
      field('邸名', h('input', { class: 'finput', value: st.lead.邸名, placeholder: '例: 丙野様', oninput: set('邸名') }), true),
      field('担当', h('select', { onchange: set('担当') }, persons.map((p) => h('option', { value: p, selected: p === st.lead.担当 }, p))), true),
      field('地域', h('input', { class: 'finput', value: st.lead.地域, placeholder: '例: 江戸川', oninput: set('地域') })),
      st.lead.区分 !== '訪販' ? field('反響日', h('input', { class: 'finput', type: 'date', value: st.lead.反響日, onchange: set('反響日') })) : null,
      field('連絡方法', h('select', { onchange: set('連絡方法') }, h('option', { value: '' }, '未選択'), CONTACTS.map((c) => h('option', { value: c, selected: c === st.lead.連絡方法 }, c)))),
      field('内容', h('textarea', { oninput: set('内容') }, st.lead.内容)),
      h('div', { class: 'controls', style: 'margin-top:16px' },
        h('button', { class: 'btn primary', type: 'button', disabled: !canSubmit, onclick: submit }, st.sending ? '登録中…' : '登録する')),
      h('p', { class: 'small muted', style: 'margin-top:10px' }, '＊は必須です。現調日・見積り・結果などは、話が進んでからこれまで通りスプシに入力してください。ここで登録した内容が他の画面に反映されるのは、次に「最新に更新」を押したときです。')));
}
