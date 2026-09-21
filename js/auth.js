// Google ログイン(Google Identity Services)。ID トークンは画面を閉じたら消える sessionStorage にだけ置く。
import { CONFIG } from './config.js';

const KEY = 'kate-idtoken';
export const getToken = () => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } };
export const setToken = (t) => { try { t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY); } catch { /* noop */ } };

function tokenExpired(t) {
  try {
    const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return p.exp * 1000 < Date.now() + 30000;
  } catch { return true; }
}
export const hasValidToken = () => { const t = getToken(); return !!t && !tokenExpired(t); };

let gsiPromise;
function loadGsi() {
  gsiPromise ||= new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = 'https://accounts.google.com/gsi/client';
    sc.async = true;
    sc.onload = resolve;
    sc.onerror = () => reject(new Error('Google のログイン部品を読み込めませんでした(ネットワークを確認)'));
    document.head.append(sc);
  });
  return gsiPromise;
}

// ボタンを parent に描画。ログインできたら onToken(idToken) を呼ぶ。
export async function renderSignIn(parent, onToken) {
  if (!CONFIG.GOOGLE_CLIENT_ID) throw new Error('config.js の GOOGLE_CLIENT_ID がまだ空です');
  await loadGsi();
  window.google.accounts.id.initialize({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    callback: (r) => { setToken(r.credential); onToken(r.credential); },
    auto_select: true,
  });
  window.google.accounts.id.renderButton(parent, { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'ja' });
}
export function signOut() {
  setToken('');
  try { window.google?.accounts.id.disableAutoSelect(); } catch { /* noop */ }
}
