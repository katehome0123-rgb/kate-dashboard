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

// 発注チェックの1項目を完了・未完了に切り替える(「発注チェック」画面から呼ぶ)
export async function setTask(idToken, task) {
  await post_({ idToken, action: 'setTask', task });
}

async function post_(body) {
  if (!CONFIG.APPS_SCRIPT_URL) throw new Error('config.js の APPS_SCRIPT_URL がまだ空です');
  // Content-Type を text/plain にすると「事前確認(preflight)」が起きず、Apps Script でそのまま受け取れる
  const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`サーバーの応答が正しくありません (${res.status})`);
  const json = await res.json();
  if (!json.ok) {
    if (json.code === 'auth') throw new AuthError(json.error);
    throw new Error(json.error || '通信に失敗しました');
  }
  return json;
}
