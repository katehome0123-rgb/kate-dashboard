import { h } from '../ui.js';
import * as E from '../engine.js';
import { setTask, AuthError } from '../api.js';
import { getToken, hasValidToken } from '../auth.js';

const dl = (d) => { const s = String(d || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${Number(s.slice(0, 4))}/${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}` : String(d || ''); };

// 発注タスク: 入金がまだの案件ごとに、発注・準備の項目(タスク)を一覧してタップで完了・未完了を切り替える
export function render(ctx) {
  const DEMO = new URLSearchParams(location.search).has('demo');
  const st = (ctx.state.tasks ||= { open: {}, busy: {}, error: '' });
  const today = E.todayStr();
  const board = E.taskBoard(ctx.data, { today });

  const toggleCard = (key) => { st.open[key] = !st.open[key]; ctx.rerender(); };

  const toggleItem = async (job, it) => {
    if (DEMO) return; // 練習用データは見るだけ
    const key = `${job.name}|${job.contractDate}|${it.item}`;
    if (st.busy[key]) return;
    // ログインが切れていると、通信してから失敗が分かるまで待たされた上に元に戻って見える。先に分かっているなら先に伝える
    if (!hasValidToken()) {
      st.error = 'ログインが切れています。画面を再読み込みしてログインし直してください。';
      ctx.rerender();
      return;
    }
    const next = !it.done;
    const raw = (ctx.data['タスク'] || []).find((r) => r['顧客名'] === job.name && String(r['契約日']).slice(0, 10) === job.contractDate && r['項目'] === it.item);
    it.done = next; if (raw) raw['完了日'] = next ? today : null; // 先に画面だけ切り替える(楽観的更新)
    st.busy[key] = true; st.error = ''; ctx.rerender();
    try {
      await setTask(getToken(), { 顧客名: job.name, 契約日: job.contractDate, 項目: it.item, done: next });
    } catch (e) {
      it.done = !next; if (raw) raw['完了日'] = !next ? today : null; // 失敗したら元に戻す
      st.error = e instanceof AuthError
        ? 'ログインが切れたため、この変更は保存されていません。画面を再読み込みしてログインし直し、もう一度チェックしてください。'
        : `保存できませんでした(この項目は元に戻しました):${e.message || String(e)}`;
    } finally {
      st.busy[key] = false; ctx.rerender();
    }
  };

  const card = (job) => {
    const key = `${job.name}|${job.contractDate}`;
    const opened = !!st.open[key];
    const remain = job.total - job.doneCount;
    return h('div', { class: 'card taskcard' },
      h('div', { class: 'tc-head', onclick: () => toggleCard(key) },
        h('div', null, h('div', { class: 'tc-name' }, job.name), h('div', { class: 'tc-sub' }, `契約 ${dl(job.contractDate)}`)),
        h('div', { class: 'tc-right' },
          job.total ? h('span', { class: `tc-badge ${remain === 0 ? 'tc-done' : ''}` }, remain === 0 ? '完了' : `残り${remain}`) : h('span', { class: 'tc-badge tc-empty' }, '未作成'),
          h('span', { class: 'tc-arrow' }, opened ? '▲' : '▼'))),
      opened ? (job.total ? h('div', { class: 'tc-list' }, job.items.map((it) => {
        const k = `${job.name}|${job.contractDate}|${it.item}`;
        return h('label', { class: `tc-item ${it.done ? 'tc-checked' : ''} ${st.busy[k] ? 'tc-busy' : ''}` },
          h('input', { type: 'checkbox', checked: it.done, disabled: DEMO || st.busy[k], onchange: () => toggleItem(job, it) }),
          h('span', null, it.item));
      })) : h('p', { class: 'small muted', style: 'margin:0 16px 14px' }, 'この案件のタスクはまだ作られていません。スプレッドシートの「ケイトホーム」メニュー→「未入金案件のタスクを作る(足りない分だけ)」を押すと作れます。')) : null);
  };

  return h('div', null,
    h('div', { class: 'head' }, h('div', null, h('h1', null, '発注タスク'),
      h('div', { class: 'sub' }, '入金がまだの案件ごとに、発注・準備の抜け漏れをチェックします(完工していても入金前は表示されたままです)'))),
    DEMO ? h('p', { class: 'notice' }, '練習用データではチェックできません(スプレッドシートに書き込む機能のため、本番でログインしたときだけ使えます)。') : null,
    st.error ? h('p', { class: 'formerr' }, st.error) : null,
    board.length ? h('div', null, board.map(card)) : h('div', { class: 'card' }, h('p', { class: 'notice' }, '入金がまだの案件はありません。')));
}
