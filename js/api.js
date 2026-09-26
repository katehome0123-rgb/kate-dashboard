// データ取得。本番は Apps Script に ID トークンを送って JSON をもらう。?demo=1 は練習用データ。
import { CONFIG } from './config.js';

export class AuthError extends Error {}

export async function loadDemo() {
  const res = await fetch('./data/sample.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('サンプルデータを読み込めませんでした');
  return res.json();
}

export async function loadLive(idToken) {
  const json = await post_({ idToken });
  return json.data;
}

// 反響を1件、区分(ポータル/自社/訪販)に合うタブへ追加する(「反響を登録」画面から呼ぶ)
export async function addLead(idToken, lead) {
  await post_({ idToken, action: 'addLead', lead });
}

// 発注チェックの1項目を完了・未完了に切り替える(「発注タスク」画面から呼ぶ)
export async function setTask(idToken, task) {
  await post_({ idToken, action: 'setTask', task });
}

// 経費を1件、経費データシートの空いている行に書き込む(「経費入力」画面から呼ぶ)
export async function addExpense(idToken, expense) {
  await post_({ idToken, action: 'addExpense', expense });
}

// 顧客を1件、契約日順を保って顧客シートに書き込む(「顧客登録」画面から呼ぶ)
export async function addCustomer(idToken, customer) {
  await post_({ idToken, action: 'addCustomer', customer });
}

// Apps Script は混み合う・スリープからの目覚めなどで時間がかかることがあるが、
// いつまでも待たせて「反応が無い」ように見えるのを防ぐため、一定時間で打ち切ってはっきりしたエラーにする。
const TIMEOUT_MS = 25000;

async function post_(body) {
  if (!CONFIG.APPS_SCRIPT_URL) throw new Error('config.js の APPS_SCRIPT_URL がまだ空です');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    // Content-Type を text/plain にすると「事前確認(preflight)」が起きず、Apps Script でそのまま受け取れる
    res = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('サーバーの応答がありません(時間切れ)。電波を確認して、もう一度お試しください。');
    throw new Error('通信できませんでした。電波を確認して、もう一度お試しください。');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`サーバーの応答が正しくありません (${res.status})`);
  const json = await res.json();
  if (!json.ok) {
    if (json.code === 'auth') throw new AuthError(json.error);
    throw new Error(json.error || '通信に失敗しました');
  }
  return json;
}
