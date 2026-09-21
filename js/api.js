// データ取得。本番は Apps Script に ID トークンを送って JSON をもらう。?demo=1 は練習用データ。
import { CONFIG } from './config.js';

export class AuthError extends Error {}

export async function loadDemo() {
  const res = await fetch('./data/sample.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('サンプルデータを読み込めませんでした');
  return res.json();
}

export async function loadLive(idToken) {
  if (!CONFIG.APPS_SCRIPT_URL) throw new Error('config.js の APPS_SCRIPT_URL がまだ空です');
  // Content-Type を text/plain にすると「事前確認(preflight)」が起きず、Apps Script でそのまま受け取れる
  const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ idToken }),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`サーバーの応答が正しくありません (${res.status})`);
  const json = await res.json();
  if (!json.ok) {
    if (json.code === 'auth') throw new AuthError(json.error);
    throw new Error(json.error || '読み込みに失敗しました');
  }
  return json.data;
}
