// 計算ロジック(画面に依存しない純粋な関数だけ)。Node からもテストできます。
// データは { 反響:[...], 顧客:[...], ... } の形。日付は 'YYYY-MM-DD' の文字列。

export const COST_COLS = ['材料費', '足場発注', '職人①発注', '職人②発注', '職人③発注', '職人④発注', '駐車場代', '道路使用', '道路占用', '塗板', 'その他'];
export const SETTLED = ['成約', '不成約']; // 成約率の分母に入る結果

export const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,，円万\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
export const yearOf = (d) => (d ? Number(String(d).slice(0, 4)) : null);
export const monthOf = (d) => (d ? Number(String(d).slice(5, 7)) : null);
export const ymOf = (d) => (d ? String(d).slice(0, 7) : null);

// ---- 顧客の分類 -------------------------------------------------
export const isAdd = (c) => c['集客経路'] === '追加' || /邸追/.test(String(c['顧客名'] || ''));
export const isSub = (c) => c['集客経路'] === 'MIRAI'; // 下請け(ソーラー業者の案件)
export const isCountable = (c) => !isAdd(c) && !isSub(c); // 契約本数に数える

// 媒体グループ(既存の「利益率」シートと同じまとめ方)
export function mediaGroup(route) {
  const r = String(route || '').trim();
  if (r === '訪問' || r === '足場') return '訪問';
  if (/^(ヌリカエ|窓口|リショップ)/.test(r)) return 'ポータル';
  return r || '(不明)';
}

// ---- 顧客ごとの数字 ---------------------------------------------
// 予想粗利(万円)の列。見出しが『粗利(万円・手入力)』でも『予想粗利』などに書き換えられていても拾う('粗利'を含む見出しを探す)
export function grossOf(c) {
  for (const k of ['粗利(万円・手入力)', '予想粗利', '粗利']) if (k in c) return num(c[k]);
  const k = Object.keys(c).find((x) => x.includes('粗利') && !x.startsWith('_'));
  return k ? num(c[k]) : 0;
}
export function enrichCustomer(c) {
  const sales = num(c['契約金額(万円)']); // 税込・万円
  const gross = grossOf(c); // 予想粗利・万円
  const costs = COST_COLS.reduce((s, k) => s + num(c[k]), 0); // 円
  const taxEx = (sales * 10000) / 1.1; // 円
  return {
    ...c,
    _sales: sales,
    _gross: gross,
    _costs: costs,
    _taxEx: taxEx,
    _landing: taxEx - costs, // 着地利益(円)
    _costEntered: costs > 0,
    _done: !!c['完工日'], // 完工日が入っていない案件は経費が未確定なので、利益率には入れない
    _year: yearOf(c['契約日']),
    _ym: ymOf(c['契約日']),
    _add: isAdd(c),
    _sub: isSub(c),
    _count: isCountable(c),
    _group: mediaGroup(c['集客経路']),
  };
}
export const enrichAll = (data) => (data['顧客'] || []).filter((c) => c['契約日']).map(enrichCustomer);

// ---- 契約月ごとの集計 -------------------------------------------
export function monthlySummary(custs, year) {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, sales: 0, gross: 0, count: 0, add: 0, sub: 0, landing: 0, noCost: 0, notDone: 0,
  }));
  for (const c of custs) {
    if (c._year !== year) continue;
    const r = rows[monthOf(c['契約日']) - 1];
    r.sales += c._sales;
    r.gross += c._gross;
    r.landing += c._landing;
    if (c._add) r.add += 1;
    else if (c._sub) r.sub += 1;
    else r.count += 1;
    if (!c._costEntered) r.noCost += 1;
    if (!c._done) r.notDone += 1;
  }
  return rows;
}
export function sumRows(rows) {
  return rows.reduce((t, r) => {
    for (const k of ['sales', 'gross', 'count', 'add', 'sub', 'landing', 'noCost', 'notDone']) t[k] += r[k];
    return t;
  }, { sales: 0, gross: 0, count: 0, add: 0, sub: 0, landing: 0, noCost: 0, notDone: 0 });
}
export const yearsOfCustomers = (custs) => [...new Set(custs.map((c) => c._year).filter(Boolean))].sort((a, b) => b - a);

// ---- 担当者別の月次(売上・粗利・契約本数) -----------------------
// 売上・粗利は按分: 担当Cのみ→100%、担当Cとアポ(担当A)がいる→C 40% : A 60%、担当Aだけ→A 60%(既存の売上シートと同じ)。
// 契約本数は既存シートと同じく、共同担当の案件は二人とも1本と数える(全体は重複なし)。追加・下請けは本数に数えない。
export const NO_PERSON = '(担当なし)';
export function personMonthly(custs, year, by = '契約日') {
  const blank = () => ({ sales: 0, gross: 0, count: 0 });
  const rows = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, all: blank(), by: {} }));
  const total = { all: blank(), by: {} };
  const totals = new Map();
  const put = (bucket, name, sales, gross, count) => {
    const b = (bucket.by[name] ||= blank());
    b.sales += sales; b.gross += gross; b.count += count;
  };
  for (const c of custs) {
    if (!c[by] || yearOf(c[by]) !== year) continue;
    const C = c['担当C'] || '', A = c['担当A'] || '';
    const shares = [];
    if (C && A) shares.push([C, 0.4], [A, 0.6]);
    else if (A) shares.push([A, 0.6]); // クロ(担当C)が空: アポの60%分だけ。残り40%は全体にだけ入る(既存の売上シートと同じ)
    else shares.push([C || NO_PERSON, 1]);
    const r = rows[monthOf(c[by]) - 1];
    const n = c._count ? 1 : 0;
    r.all.sales += c._sales; r.all.gross += c._gross; r.all.count += n;
    total.all.sales += c._sales; total.all.gross += c._gross; total.all.count += n;
    for (const [name, share] of shares) {
      put(r, name, c._sales * share, c._gross * share, n);
      put(total, name, c._sales * share, c._gross * share, n);
      totals.set(name, (totals.get(name) || 0) + c._sales * share);
    }
  }
  const persons = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  return { persons, rows, total };
}

// ---- 利益率(媒体グループ × 年) ----------------------------------
// 利益率 = 着地利益の合計 ÷ 税抜売上の合計(既存の「利益率」シートと同じ式)。
// 予想粗利率(手入力の粗利 ÷ 売上)も参考に持つ。年は契約年。
// 媒体の行は追加・下請けを除く。追加・下請けは参考行に分け、「全体」には含める。
// 完工日が入っていない案件は、件数(count)には数えるが利益率の計算(rate)からは外す(onlyDone=true)。
export function profitByMedia(custs, { onlyDone = true } = {}) {
  const years = yearsOfCustomers(custs).sort((a, b) => a - b);
  const cell = (list, countAll = false) => {
    const rated = onlyDone ? list.filter((c) => c._done) : list; // 利益率の計算に使う案件
    const taxEx = rated.reduce((s, c) => s + c._taxEx, 0);
    const landing = rated.reduce((s, c) => s + c._landing, 0);
    const sales = rated.reduce((s, c) => s + c._sales, 0);
    const gross = rated.reduce((s, c) => s + c._gross, 0);
    const counted = countAll ? list : list.filter((c) => c._count);
    return {
      count: counted.length,
      doneCount: countAll ? rated.length : rated.filter((c) => c._count).length,
      sales, taxEx, landing, gross,
      rate: taxEx ? landing / taxEx : null,
      grossRate: sales ? gross / sales : null,
    };
  };
  const build = (label, list, countAll = false) => {
    const byYear = {};
    for (const y of years) byYear[y] = cell(list.filter((c) => c._year === y), countAll);
    return { group: label, byYear, total: cell(list, countAll) };
  };
  const main = custs.filter((c) => c._count);
  const groups = [...new Set(main.map((c) => c._group))];
  const rows = groups.map((g) => build(g, main.filter((c) => c._group === g))).sort((a, b) => b.total.count - a.total.count || b.total.sales - a.total.sales);
  const extra = [];
  const adds = custs.filter((c) => c._add);
  const subs = custs.filter((c) => c._sub && !c._add);
  if (adds.length) extra.push(build('追加工事', adds, true));
  if (subs.length) extra.push(build('下請け(MIRAI)', subs, true));
  return { years, rows, extra, all: build('全体', custs) };
}
// 担当者ごとの利益率: その人がクロ(担当C)かアポ(担当A)の案件を、売上の按分と同じ割合(C40%:A60%、Aだけ60%、Cだけ100%)で数字に入れる。
// 件数は共同担当でも1件と数える。割合は分子・分母に同じ重みが掛かるので、その人の加重平均になる。
export function forPerson(custs, person) {
  const out = [];
  for (const c of custs) {
    const C = c['担当C'] || '', A = c['担当A'] || '';
    let w = 0;
    if (C === person) w = A ? 0.4 : 1;
    else if (A === person) w = 0.6;
    if (!w) continue;
    out.push({ ...c, _sales: c._sales * w, _gross: c._gross * w, _taxEx: c._taxEx * w, _landing: c._landing * w, _costs: c._costs * w });
  }
  return out;
}
// 今いる担当者: 最新の契約年に契約(担当C・担当A)がある人。設定シートの「現役の担当」にカンマ区切りで書けば、その名前を優先
export function activePersons(data, custs) {
  const set = settingValue(data, '現役の担当').split(/[,、，\s]+/).filter(Boolean);
  if (set.length) return set;
  const y = Math.max(0, ...custs.map((c) => c._year || 0));
  const m = new Map();
  for (const c of custs) {
    if (c._year !== y) continue;
    for (const p of [c['担当C'], c['担当A']]) if (p) m.set(p, (m.get(p) || 0) + c._sales);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
}
// 利益率のタブに出す担当者: 最新の契約年に契約がある人(設定シートの「利益率のタブ」にカンマ区切りで書けば、その名前を優先)
export function profitPersons(data, custs) {
  const set = settingValue(data, '利益率のタブ').split(/[,、，\s]+/).filter(Boolean);
  if (set.length) return set;
  const y = Math.max(0, ...custs.map((c) => c._year || 0));
  const m = new Map();
  for (const c of custs) {
    if (c._year !== y) continue;
    for (const p of [c['担当C'], c['担当A']]) if (p) m.set(p, (m.get(p) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
}
// 前の年との差(ポイント)。前の年に件数が無ければ null
export function trend(byYear, years, y) {
  const i = years.indexOf(y);
  if (i <= 0) return null;
  const a = byYear[years[i - 1]];
  if (!a || a.count === 0) return null;
  const b = byYear[y];
  if (!a || !b || a.rate === null || b.rate === null) return null;
  return (b.rate - a.rate) * 100;
}

// ---- 成約率 -----------------------------------------------------
// 成約率 = 成約 ÷ (成約 + 不成約)。年は反響日の年(訪販は反響日・現調日がないので見積日の年)。person が空なら全体。
const leadDate = (l) => l['反響日'] || l['見積日'] || l['現調日'] || null;
export function closingTable(leads, { year = null, person = '' } = {}) {
  const pool = leads.filter((l) => leadDate(l) && (!year || yearOf(leadDate(l)) === year) && (!person || l['担当'] === person));
  const tally = (list) => {
    const win = list.filter((l) => l['結果'] === '成約').length;
    const lose = list.filter((l) => l['結果'] === '不成約').length;
    const pending = list.length - win - lose;
    return { leads: list.length, win, lose, pending, rate: win + lose ? win / (win + lose) : null };
  };
  const order = ['自社', '訪販', 'ポータル'];
  const sections = order.map((sec) => {
    const inSec = pool.filter((l) => l['区分'] === sec);
    const medias = [...new Set(inSec.map((l) => l['媒体'] || '(不明)'))];
    const rows = medias
      .map((m) => ({ media: m, ...tally(inSec.filter((l) => (l['媒体'] || '(不明)') === m)) }))
      .sort((a, b) => b.leads - a.leads);
    return { section: sec, total: tally(inSec), rows };
  }).filter((s) => s.total.leads > 0);
  return { total: tally(pool), sections };
}
export const leadYears = (leads) => [...new Set(leads.map((l) => yearOf(leadDate(l))).filter(Boolean))].sort((a, b) => b - a);
export const leadPersons = (leads) => {
  const m = new Map();
  for (const l of leads) if (l['担当']) m.set(l['担当'], (m.get(l['担当']) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
};

// ---- アラート: アフターメンテ / 案件 ---------------------------------
// 完工日の 1か月後 / 5年後 / 10年後 が点検の予定日(1件の案件に3回)。
// 実施日は顧客の行の「メンテ1か月」「メンテ5年」「メンテ10年」列に入れる。
export const MAINT_KINDS = ['1か月', '5年', '10年'];
export const maintCol = (kind) => `メンテ${kind}`;
const pad = (n) => String(n).padStart(2, '0');
export function addMonths(dateStr, n) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ty = Math.floor(idx / 12), tm = (idx % 12) + 1;
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${ty}-${pad(tm)}-${pad(Math.min(d, last))}`;
}
export const dueDate = (doneDate, kind) => addMonths(doneDate, kind === '1か月' ? 1 : kind === '5年' ? 60 : 120);
const utc = (d) => { const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, dd); };
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 86400000); // a→b の日数
export const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Googleマップのルート案内(目的地=住所)。スマホではマップアプリが開く
export const mapHref = (address) => `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(address)}`;

// 住所をGoogleマップで開く(その場所を表示)。ルート案内は上の mapHref
export const placeHref = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

export function settingValue(data, key) {
  const row = (data['設定'] || []).find((r) => r['項目'] === key);
  const v = row ? row['値(入力)'] : null;
  return v === null || v === undefined || v === '' ? '' : String(v);
}
const settingNum = (data, key, fallback) => { const n = Number(settingValue(data, key)); return Number.isFinite(n) && settingValue(data, key) !== '' ? n : fallback; };

// メンテ: 案件(顧客)ごとに1行。いちばん先の期限超過(なければ予告)の点検を代表にして、3回分の進み具合(steps)も持つ。
export function buildMaintAlerts(data, custs, today, { soonDays = 30 } = {}) {
  const since = settingValue(data, 'メンテ確認の開始日').slice(0, 10);
  const urgent = [], notice = [];
  for (const c of custs) {
    if (c._add || c._sub || !c['完工日']) continue;
    const steps = MAINT_KINDS.map((kind) => {
      const due = dueDate(c['完工日'], kind);
      const doneOn = c[maintCol(kind)] || null;
      const over = daysBetween(due, today); // 正=予定日を過ぎた日数
      let state = 'later';
      if (doneOn) state = 'done';
      else if (since && due < since) state = 'skip';
      else if (over > 0) state = 'overdue';
      else if (-over <= soonDays) state = 'soon';
      return { kind, due, doneOn, state, days: over };
    });
    const base = { custId: c['顧客ID'] || `${c['顧客名']}|${c['契約日']}`, name: String(c['顧客名'] || '').split(/[\s\u3000]/)[0] + '邸', phone: c['電話番号①'] || '', address: c['住所'] || '', finish: c['完工日'], steps };
    const od = steps.filter((x) => x.state === 'overdue');
    if (od.length) urgent.push({ ...base, kind: od[0].kind, due: od[0].due, days: od[0].days, others: od.length - 1 });
    else {
      const sn = steps.find((x) => x.state === 'soon');
      if (sn) notice.push({ ...base, kind: sn.kind, due: sn.due, days: sn.days });
    }
  }
  urgent.sort((a, b) => b.days - a.days);
  notice.sort((a, b) => a.due.localeCompare(b.due));
  return { urgent, notice };
}

// 案件アラート(ポータルの反響のみ。自社は現調時に見積日を決めるので対象外)
//  ・キャンセル忘れ: 紹介日から6日目〜期限(7日)までの間、結果が空欄(何も入力していない)の案件
//  ・見積り忘れ: 現調日から7日たっても見積日が空の案件(結果が成約・不成約のものは除く)
export function buildLeadAlerts(data, today) {
  const win = settingNum(data, '案件アラートの対象期間', 60);
  const cancelDays = settingNum(data, 'ポータルのキャンセル確認日数', 6);
  const deadline = settingNum(data, 'ポータルのキャンセル期限日数', 7);
  const estDays = settingNum(data, '見積り忘れの確認日数', 7);
  const estimate = [], cancel = [];
  // 反響がすでに契約になっているか: IDではなく、同じ苗字で、反響日以後に契約した顧客がいるかで見る
  const sur = (t) => String(t || '').replace(/邸$|様$/, '').split(/[\s\u3000]/)[0];
  const contracts = new Map();
  for (const c of data['顧客'] || []) {
    const k = sur(c['顧客名']); if (!k || !c['契約日']) continue;
    if (!contracts.has(k)) contracts.set(k, []);
    contracts.get(k).push(c['契約日']);
  }
  const converted = (l) => (contracts.get(sur(l['邸名'])) || []).some((d) => d >= l['反響日']);
  for (const l of data['反響'] || []) {
    if (l['区分'] !== 'ポータル') continue;
    const res = l['結果'] || '';
    const base = { id: l['反響ID'] || `${l['邸名']}|${l['反響日']}`, name: String(l['邸名'] || ''), media: l['媒体'] || '', person: l['担当'] || '', result: res };
    if (l['現調日'] && !l['見積日'] && res !== '成約' && res !== '不成約') {
      const d = daysBetween(l['現調日'], today);
      if (d >= estDays && d <= win) estimate.push({ ...base, survey: l['現調日'], days: d });
    }
    if (l['反響日'] && !res && !converted(l)) {
      const d = daysBetween(l['反響日'], today);
      if (d >= cancelDays && d <= deadline) cancel.push({ ...base, referred: l['反響日'], days: d, limit: E_addDays(l['反響日'], deadline), left: deadline - d });
    }
  }
  estimate.sort((a, b) => b.days - a.days);
  cancel.sort((a, b) => b.days - a.days);
  return { estimate, cancel, cancelDays, deadline, estDays, win };
}
const E_addDays = (dateStr, n) => { const t = new Date(utc(dateStr) + n * 86400000); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };

// ---- 表示用 -----------------------------------------------------
export const fmtInt = (n) => Math.round(n).toLocaleString('ja-JP');
export const fmtMan = (n, d = 0) => (n === null || n === undefined ? '–' : n.toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const fmtPct = (r, d = 1) => (r === null || r === undefined ? '–' : (r * 100).toFixed(d) + '%');
export const yenToMan = (yen) => yen / 10000;

// ---- 入出金(総未入金・総未出金・案件ごとの残り) ----------------------
// 対象 = 顧客シートで「入金日」が空の案件(工事が終わっていない・入金が済んでいない案件)。
// 入出金シートの「顧客名」は 苗字+邸(同じ苗字の対象が2件あるときだけ 山田邸(太郎) のように名前つき)。
const splitName = (full) => String(full || '').replace(/　/g, ' ').trim().split(/\s+/);
export function leadingName(full) { // 苗字+邸(すでに邸が付いていればそのまま)
  const first = splitName(full)[0] || '';
  return first ? (first.includes('邸') ? first : first + '邸') : '';
}
// 住所から地域を出す: 「江戸川区東サンプル町5-1-1」→「東サンプル町」(区の後ろ〜最初の数字まで)。区がなければ 県の後ろ(市名から)。
export function regionOf(addr) {
  const a = String(addr || '').trim();
  if (!a) return '';
  let rest;
  if (a.includes('区')) rest = a.slice(a.indexOf('区') + 1);
  else if (a.includes('県') && a.indexOf('県') < 4) rest = a.slice(a.indexOf('県') + 1);
  else rest = a.replace('東京都', '');
  const m = rest.search(/[0-9０-９]/);
  return (m >= 0 ? rest.slice(0, m) : rest).trim();
}
export function cashBook(data) {
  const ledger = (data['入出金'] || []).filter((r) => r['顧客名'] || num(r['金額(円)']));
  const targets = (data['顧客'] || []).filter((c) => c['顧客名'] && !c['入金日']).map((c) => ({ c, key: leadingName(c['顧客名']) }));
  const dup = {};
  targets.forEach((t) => { dup[t.key] = (dup[t.key] || 0) + 1; });
  const cases = targets.map(({ c, key }) => {
    const rest = splitName(c['顧客名']).slice(1).join(' ');
    const name = dup[key] > 1 && rest ? `${key}(${rest})` : key;
    const mine = ledger.filter((r) => r['顧客名'] === name && (!r['日付'] || !c['契約日'] || String(r['日付']) >= String(c['契約日'])));
    const sum = (kind) => mine.filter((r) => r['種別'] === kind).reduce((s, r) => s + num(r['金額(円)']), 0);
    const contract = num(c['契約金額(万円)']) * 10000;
    const ordered = ['足場発注', '職人①発注', '職人②発注', '職人③発注', '職人④発注'].reduce((s, k) => s + num(c[k]), 0);
    const paidIn = sum('入金'), paidOut = sum('出金');
    return {
      name, region: regionOf(c['住所']), contractDate: c['契約日'] || null, start: c['着工日'] || null, done: c['完工日'] || null,
      contract, paidIn, unpaidIn: contract - paidIn, ordered, paidOut, unpaidOut: ordered - paidOut,
      entries: mine,
      settled: contract - paidIn <= 0 && ordered - paidOut <= 0, // 入金も出金も残りなし
    };
  }).sort((a, b) => String(a.contractDate).localeCompare(String(b.contractDate)));
  // 顧客シートにない名前(打ち間違い)を見つける。入金日が入って対象から外れた案件の名前は、間違いではない。
  const known = new Set();
  (data['顧客'] || []).forEach((c) => { const k = leadingName(c['顧客名']); if (k) { known.add(k); const r = splitName(c['顧客名']).slice(1).join(' '); if (r) known.add(`${k}(${r})`); } });
  const unknown = [...new Set(ledger.map((r) => r['顧客名'] || '(顧客名なし)').filter((n) => n === '(顧客名なし)' || !known.has(n)))];
  return {
    cases,
    totalUnpaidIn: cases.reduce((s, c) => s + c.unpaidIn, 0),
    totalUnpaidOut: cases.reduce((s, c) => s + c.unpaidOut, 0),
    ledger, unknown,
  };
}

// ---- インセン ----------------------------------------------------
// インセン = 着地利益 × 歩合率(通常20%、ポータル・リショップ・ヌリカエ・窓口は10%)。
// 配分: 担当C(クロ)と担当A(アポ)がいれば C 40% : A 60%。Cだけなら100%。Aだけなら60%(売上の按分と同じ)。
// 計上月 = 入金日の翌月。予想粗利(手入力)は使わない。「インセン調整」シートの金額はアプリの計算より優先する。
export const INCENTIVE_RATE = 0.2;
export const INCENTIVE_RATE_PORTAL = 0.1;
export const incentiveRate = (c) => (c._group === 'ポータル' || c['集客経路'] === 'ポータル' ? INCENTIVE_RATE_PORTAL : INCENTIVE_RATE);

export function incentiveLines(data, custs) {
  const adj = (data['インセン調整'] || []).filter((r) => r['顧客名'] && String(r['上書きする金額(円)'] ?? '') !== '');
  const lines = [];
  for (const c of custs) {
    if (!c['入金日'] || !c['顧客名']) continue;
    const C = c['担当C'] || '', A = c['担当A'] || '';
    const parts = [];
    if (C && A) parts.push({ who: C, role: 'クロ', share: 0.4 }, { who: A, role: 'アポ', share: 0.6 });
    else if (A) parts.push({ who: A, role: 'アポ', share: 0.6 });
    else if (C) parts.push({ who: C, role: 'クロ', share: 1 });
    if (!parts.length) continue;
    const rate = incentiveRate(c);
    const mine = adj.filter((r) => r['顧客名'] === c['顧客名']);
    const whole = mine.find((r) => !String(r['対象(クロ/アポ)'] || '').trim()); // 対象が空 = 案件全体の金額を上書き
    const base = whole ? num(whole['上書きする金額(円)']) : c._landing * rate; // 配分する前の金額
    for (const p of parts) {
      const own = mine.find((r) => String(r['対象(クロ/アポ)'] || '').trim() === p.role);
      const calc = Math.round(c._landing * rate * p.share);
      const amount = own ? Math.round(num(own['上書きする金額(円)'])) : Math.round(base * p.share);
      const hit = own || whole;
      const warn = [];
      if (!c._costEntered) warn.push('経費が未入力');
      if (!hit && c._landing < 0) warn.push('着地利益がマイナス');
      lines.push({
        person: p.who, role: p.role, share: p.share, rate, name: c['顧客名'], route: c['集客経路'] || '', contractDate: c['契約日'] || '', payDate: c['入金日'],
        month: ymOf(addMonths(c['入金日'], 1)), taxEx: Math.round(c._taxEx), costs: c._costs, landing: Math.round(c._landing),
        calc, amount, adjusted: !!hit, reason: hit ? String(hit['理由'] || '') : '', warn,
      });
    }
  }
  return lines;
}
// インセンの担当者の選択肢: 今いる担当者のうち、設定シートの「インセン対象」(カンマ区切り)があればその人だけ。
// 「インセン対象外の担当」(カンマ区切り)に書いた名前は外す。
export function incentivePersons(data, lines, custs = null, fallbackOnly = []) {
  const list = (k) => settingValue(data, k).split(/[,、，\s]+/).filter(Boolean);
  const skip = new Set(list('インセン対象外の担当'));
  const active = custs ? new Set(activePersons(data, custs)) : null;
  const pick = (only) => {
    const m = new Map();
    for (const l of lines) {
      if (skip.has(l.person)) continue;
      if (only.length ? !only.includes(l.person) : (active && !active.has(l.person))) continue;
      m.set(l.person, (m.get(l.person) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
  };
  const explicit = list('インセン対象'); // 設定シートに書いてあれば、それを必ず優先
  if (explicit.length) return pick(explicit);
  const r = pick(fallbackOnly); // アプリ側の既定(config.js)。該当する人がいなければ、今いる担当者を全員出す
  return r.length || !fallbackOnly.length ? r : pick([]);
}
// 担当者ごとの月別の合計(新しい月が先)
export function incentiveMonths(lines, person) {
  const m = new Map();
  for (const l of lines) {
    if (l.person !== person) continue;
    const x = m.get(l.month) || { month: l.month, count: 0, amount: 0, adjusted: 0 };
    x.count += 1; x.amount += l.amount; if (l.adjusted) x.adjusted += 1;
    m.set(l.month, x);
  }
  return [...m.values()].sort((a, b) => b.month.localeCompare(a.month));
}

// ---- 年間収支 ----------------------------------------------------
// 年別シート(2024・2025…)の升目を、行の見出し(A列・B列)で読む。年によって行の位置が違うため、位置ではなく名前で探す。
//   売上高 / 現場支払 / 入金 / 粗利益 / 固定(項目…) / 変動(項目…) / 合計 / 純利益 / 設備費(項目…) / 合計
// 売上高 = 契約月の合計(顧客シートから自動・税込)。
// 入金・現場支払 = 切替月より前は年別シートの入力値(通帳ベース)、切替月以降は「入出金」シートの日付ベース。切替月が空欄なら全期間、入力値。
// 粗利益 = 入金 − 現場支払。純利益 = 粗利益 − 固定・変動の合計 − 設備費の合計。
// 古い形式の年(合計の行が項目の合計と合わない)は、シートの「純利益」の行の値をそのまま出す。
const monthIndexOf = (grid) => {
  const i = (grid[0] || []).findIndex((v) => String(v).trim() === '1月');
  return i >= 0 ? i : 3;
};
export function annualBook(data, custs, year) {
  const grid = (data['年間収支'] || {})[String(year)];
  if (!Array.isArray(grid) || !grid.length) return null;
  const c0 = monthIndexOf(grid);
  const A = (r) => String((grid[r] || [])[0] ?? '').trim();
  const B = (r) => String((grid[r] || [])[1] ?? '').trim();
  const vals = (r) => Array.from({ length: 12 }, (_, m) => num((grid[r] || [])[c0 + m]));
  const has = (r) => Array.from({ length: 12 }, (_, m) => (grid[r] || [])[c0 + m]).some((v) => v !== null && v !== undefined && v !== '' && num(v) !== 0);
  const rowA = (name) => grid.findIndex((_, r) => r > 0 && A(r) === name);
  const rPaid = rowA('現場支払'), rIn = rowA('入金'), rNet = rowA('純利益'), rCap = rowA('設備費');

  // 固定・変動の項目
  const items = [];
  let group = '', totalRow = -1;
  const startRow = Math.max(rowA('粗利益'), rIn) + 1;
  for (let r = startRow; r < grid.length && r !== rNet; r++) {
    if (A(r) === '固定' || A(r) === '変動') group = A(r);
    if (!group) continue;
    const name = B(r);
    if (name === '合計') { totalRow = r; continue; }
    if (name || has(r)) items.push({ group, name: name || group, values: vals(r) });
  }
  // 設備費の項目
  const capex = [];
  if (rCap >= 0) {
    for (let r = rCap; r < grid.length; r++) {
      if (B(r) === '合計') break;
      const nm = B(r);
      if (nm || has(r)) capex.push({ group: '設備費', name: nm || '設備費', values: vals(r) });
    }
  }
  const sumItems = (list, m) => list.reduce((s, it) => s + it.values[m], 0);
  const sheetTotal = totalRow >= 0 ? vals(totalRow) : null;
  const standard = !!sheetTotal && sheetTotal.every((t, m) => Math.abs(t - sumItems(items, m)) < 2);

  // 売上高(契約月・税込・円)
  const sales = monthlySummary(custs, year).map((r) => r.sales * 10000);
  // 入出金シートの月別
  const ledgerIn = Array(12).fill(0), ledgerOut = Array(12).fill(0);
  for (const r of data['入出金'] || []) {
    const d = String(r['日付'] || '');
    if (!d || Number(d.slice(0, 4)) !== year) continue;
    const m = Number(d.slice(5, 7)) - 1;
    if (r['種別'] === '入金') ledgerIn[m] += num(r['金額(円)']);
    else if (r['種別'] === '出金') ledgerOut[m] += num(r['金額(円)']);
  }
  const switchYm = settingValue(data, '年間収支の切替月').slice(0, 7);
  const typedIn = vals(rIn), typedPaid = vals(rPaid), typedNet = rNet >= 0 ? vals(rNet) : null;
  const pad2 = (n) => String(n).padStart(2, '0');
  const months = Array.from({ length: 12 }, (_, m) => {
    const ym = `${year}-${pad2(m + 1)}`;
    const fromLedger = !!switchYm && ym >= switchYm;
    const income = fromLedger ? ledgerIn[m] : typedIn[m];
    const paid = fromLedger ? ledgerOut[m] : typedPaid[m];
    const gross = income - paid;
    const fixed = sumItems(items.filter((i) => i.group === '固定'), m);
    const variable = sumItems(items.filter((i) => i.group === '変動'), m);
    const cap = sumItems(capex, m);
    const net = standard || !typedNet ? gross - fixed - variable - cap : typedNet[m];
    return { month: m + 1, ym, fromLedger, sales: sales[m], income, paid, gross, fixed, variable, cap, net };
  });
  const total = (key, upto = 12) => months.slice(0, upto).reduce((s, x) => s + x[key], 0);
  return { year, months, items, capex, standard, switchYm, total };
}

// ---- 経費の見直し(何にいくら使ったか / 月ごとの上がり下がり) -----------------
// 今年が途中のとき、今月はまだ途中なので「終わった月」(1月〜先月)で比べる。1月だけは今月を使う。
export function completedMonths(year, today = todayStr()) {
  const ty = Number(today.slice(0, 4)), tm = Number(today.slice(5, 7));
  if (year < ty) return 12;
  if (year > ty) return 0;
  return tm > 1 ? tm - 1 : 1;
}
const sumTo = (values, n) => values.slice(0, n).reduce((s, v) => s + v, 0);
// 固定費・変動費の項目ごとに、期間(1月〜through月)の合計・構成比・前年同期との差を出す。
// 前年のシートにその項目の名前がない場合は、比べない(prev・diff は null)。名前が同じなら、固定・変動が前年と違っても同じ項目として比べる。
export function expenseSummary(data, custs, year, through) {
  const cur = annualBook(data, custs, year);
  if (!cur) return null;
  const prev = annualBook(data, custs, year - 1);
  const prevByKey = new Map(), prevByName = new Map();
  if (prev) for (const it of prev.items) {
    const v = sumTo(it.values, through);
    prevByKey.set(`${it.group}|${it.name}`, (prevByKey.get(`${it.group}|${it.name}`) || 0) + v);
    const n = prevByName.get(it.name) || { sum: 0, groups: new Set() };
    n.sum += v; n.groups.add(it.group); prevByName.set(it.name, n);
  }
  const curNames = new Map();
  cur.items.forEach((it) => curNames.set(it.name, (curNames.get(it.name) || 0) + 1));
  const rows = cur.items.map((it) => {
    const key = `${it.group}|${it.name}`;
    let prevVal = null;
    if (prevByKey.has(key)) prevVal = prevByKey.get(key);
    else if (curNames.get(it.name) === 1 && prevByName.has(it.name) && prevByName.get(it.name).groups.size === 1) prevVal = prevByName.get(it.name).sum; // 固定↔変動を移した項目
    const total = sumTo(it.values, through);
    return { group: it.group, name: it.name, total, prev: prevVal, values: it.values, diff: prevVal === null ? null : total - prevVal };
  }).filter((r) => r.total !== 0);
  const total = rows.reduce((s, r) => s + r.total, 0);
  rows.forEach((r) => { r.share = total ? r.total / total : null; });
  const by = (g) => rows.filter((r) => r.group === g).reduce((s, r) => s + r.total, 0);
  const comparable = rows.filter((r) => r.prev !== null);
  return {
    year, through, hasPrev: !!prev, rows, total, fixed: by('固定'), variable: by('変動'),
    // 前年にもあった項目だけの、今年と前年の合計(合計の比較に使う)
    cmpTotal: comparable.reduce((s, r) => s + r.total, 0), cmpPrev: comparable.reduce((s, r) => s + r.prev, 0), newCount: rows.length - comparable.length,
  };
}
// 1つの項目(名前で探す。固定・変動の両方にあれば合算)の月別・平均・多い月/少ない月・前年の平均
export function expenseSeries(data, custs, year, name, through) {
  const cur = annualBook(data, custs, year);
  if (!cur) return null;
  const pick = (b) => (b ? b.items.filter((i) => i.name === name).reduce((v, it) => v.map((x, m) => x + it.values[m]), Array(12).fill(0)) : null);
  const values = pick(cur);
  const prevBook = annualBook(data, custs, year - 1);
  const prevValues = prevBook && prevBook.items.some((i) => i.name === name) ? pick(prevBook) : null;
  const n = Math.max(1, through);
  const span = values.slice(0, n);
  let max = { month: 1, value: -Infinity }, min = { month: 1, value: Infinity };
  span.forEach((v, i) => { if (v > max.value) max = { month: i + 1, value: v }; if (v < min.value) min = { month: i + 1, value: v }; });
  const avg = span.reduce((s, v) => s + v, 0) / n;
  const prevAvg = prevValues ? prevValues.reduce((s, v) => s + v, 0) / 12 : null;
  return { name, values, prevValues, through: n, avg, max, min, prevAvg, total: sumTo(values, n) };
}
// 項目の名前の一覧(選択肢用)
export const expenseNames = (data, custs, year) => {
  const b = annualBook(data, custs, year);
  return b ? [...new Set(b.items.filter((i) => i.values.some((v) => Math.abs(v) > 0.5)).map((i) => i.name))] : [];
};

// ---- 着工 ---------------------------------------------------------
// 着工月ごとの粗利は personMonthly(custs, 年, '着工日') で出す。ここでは「まだ着工していない契約」を拾う。
//   scheduled = 着工日が今日より後(着工予定)、none = 着工日が入っていない契約
export function startBacklog(custs, today = todayStr()) {
  const row = (c) => ({ name: c['顧客名'], contractDate: c['契約日'], startDate: c['着工日'] || null, sales: c._sales, gross: c._gross, add: c._add, sub: c._sub });
  const scheduled = custs.filter((c) => c['着工日'] && String(c['着工日']).slice(0, 10) > today).map(row).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const none = custs.filter((c) => !c['着工日']).map(row).sort((a, b) => a.contractDate.localeCompare(b.contractDate));
  const sum = (list, k) => list.reduce((t, r) => t + r[k], 0);
  return { scheduled, none, scheduledSales: sum(scheduled, 'sales'), scheduledGross: sum(scheduled, 'gross'), noneSales: sum(none, 'sales'), noneGross: sum(none, 'gross') };
}
export const startYears = (custs) => [...new Set(custs.map((c) => yearOf(c['着工日'])).filter(Boolean))].sort((a, b) => b - a);


// ---- 売上ボード(年ごとの 担当 × 月。前のマスターシートと同じ見た目用) ----------------
// PH(パーヘッド)= 年間合計 ÷ 月数。月数は、その年の1月(その担当が入った月がそれより後ならその月)から
// 今月まで(過ぎた年は12月まで)。担当の開始月は、いちばん古い契約の月。設定シートの「担当の開始月」に
// 「塩野=2024-08,…」のように書けば、その月から数える。全体は、会社でいちばん古い契約の月から。
const idxOf = (ym) => { const [y, m] = String(ym).slice(0, 7).split('-').map(Number); return y * 12 + (m - 1); };
export function salesBoard(data, custs, year, { today = todayStr(), persons = null } = {}) {
  const names = persons || activePersons(data, custs);
  const pm = personMonthly(custs, year);
  const nowY = Number(today.slice(0, 4)), nowM = Number(today.slice(5, 7));
  const endM = year < nowY ? 12 : year === nowY ? nowM : 0;
  const blank = { sales: 0, gross: 0, count: 0 };
  const startSet = new Map();
  for (const part of settingValue(data, '担当の開始月').split(/[,、，\s]+/)) {
    const [n, ym] = part.split(/[=＝:：]/);
    if (n && /^\d{4}-\d{1,2}$/.test(ym || '')) startSet.set(n, idxOf(ym.replace(/-(\d)$/, '-0$1')));
  }
  const firstIdx = (pred) => custs.filter((c) => c['契約日'] && pred(c)).reduce((m, c) => Math.min(m, idxOf(c['契約日'])), Infinity);
  const blocks = [...names, null].map((name) => {
    const get = (r) => (name === null ? r.all : r.by[name]) || blank;
    let cumS = 0, cumC = 0;
    const months = pm.rows.map((r) => {
      const x = get(r);
      const future = r.month > endM;
      if (!future) { cumS += x.sales; cumC += x.count; }
      return { month: r.month, sales: x.sales, gross: x.gross, count: x.count, future, cumSales: future ? null : cumS, cumCount: future ? null : cumC };
    });
    const total = (name === null ? pm.total.all : pm.total.by[name]) || blank;
    const start = startSet.get(name) ?? (name === null ? firstIdx(() => true) : firstIdx((c) => c['担当C'] === name || c['担当A'] === name));
    const startM = !Number.isFinite(start) ? 13 : Math.floor(start / 12) < year ? 1 : Math.floor(start / 12) === year ? (start % 12) + 1 : 13;
    const n = Math.max(0, endM - startM + 1);
    return { name, label: name === null ? '全体' : name, months, total, ph: n ? { sales: total.sales / n, gross: total.gross / n, count: total.count / n, months: n } : null };
  });
  return { year, endM, blocks, hidden: pm.persons.filter((p) => !names.includes(p) && p !== NO_PERSON) };
}

// ---- ポータル: 何社紹介の何番手が決まりやすいか ------------------------------------
// 反響(区分=ポータル)の「紹介数」(何社に紹介されたか)と「番手」(何番目に見積りを出したか)を数字で読み、
// 結果が 成約/不成約 のものから 番手×紹介数 の成約率を出す(結果待ちは分母に入れない)。
const digit = (v) => { const m = String(v ?? '').match(/\d+/); return m ? Number(m[0]) : null; };
export function portalSlots(leads, { year = null, person = '' } = {}) {
  const pool = leads.filter((l) => l['区分'] === 'ポータル' && leadDate(l) && (!year || yearOf(leadDate(l)) === year) && (!person || l['担当'] === person));
  const rows = [];
  let missing = 0;
  for (const l of pool) {
    const n = digit(l['紹介数']), k = digit(l['番手']);
    if (n === null && k === null) { missing++; continue; }
    rows.push({ n, k, win: l['結果'] === '成約', lose: l['結果'] === '不成約' });
  }
  const tally = (list) => {
    const win = list.filter((r) => r.win).length, lose = list.filter((r) => r.lose).length;
    return { win, lose, total: list.length, pending: list.length - win - lose, rate: win + lose ? win / (win + lose) : null };
  };
  const uniq = (key) => [...new Set(rows.map((r) => r[key]).filter((v) => v !== null))].sort((a, b) => a - b);
  const counts = uniq('n'), ranks = uniq('k');
  const cell = (n, k) => tally(rows.filter((r) => (n === undefined || r.n === n) && (k === undefined || r.k === k)));
  return {
    counts, ranks, entered: rows.length, missing, all: tally(rows),
    grid: ranks.map((k) => ({ rank: k, cells: counts.map((n) => cell(n, k)), total: cell(undefined, k) })),
    byCount: counts.map((n) => ({ n, ...cell(n, undefined) })),
  };
}


// ---- 割合(集客経路ごとの契約件数・売上・利益・利益率) ----------------------------------
// 追加工事と下請け(MIRAI)は集客ではないので入れない。year=null は累計。
// 利益 = 着地利益(税抜売上 − 実際の経費)、利益率 = 利益 ÷ 税抜売上。どちらも完工日が入っている案件だけで計算する(経費が確定していないため)。
// by='route' は集客経路そのまま、by='group' は媒体グループ(訪問・ポータル・チラシ…)にまとめる。
export function routeShare(custs, { year = null, by = 'route' } = {}) {
  const pool = custs.filter((c) => c._count && c['契約日'] && (!year || c._year === year));
  const m = new Map();
  const blank = (name) => ({ name, count: 0, sales: 0, doneCount: 0, taxEx: 0, landing: 0 });
  const add = (x, c) => {
    x.count += 1; x.sales += c._sales;
    if (c._done) { x.doneCount += 1; x.taxEx += c._taxEx; x.landing += c._landing; }
  };
  const total = blank('合計');
  for (const c of pool) {
    const key = by === 'group' ? mediaGroup(c['集客経路']) : (String(c['集客経路'] || '').trim() || '(不明)');
    if (!m.has(key)) m.set(key, blank(key));
    add(m.get(key), c); add(total, c);
  }
  const fin = (x, all) => ({ ...x, profit: x.landing / 10000, rate: x.taxEx ? x.landing / x.taxEx : null, shareCount: all.count ? x.count / all.count : 0, shareSales: all.sales ? x.sales / all.sales : 0 });
  const rows = [...m.values()].sort((a, b) => b.count - a.count || b.sales - a.sales).map((r) => fin(r, total));
  return { rows, total: fin(total, total) };
}


// ---- 施工地図(住所を 区市 → 町名 → 丁目 に分けて、邸ごとに完工したかを見る) ---------------
// 住所の書き方: 「江戸川区東小岩3-12-4」「東京都江戸川区南篠崎町4丁目15-10」など。全角の数字・ハイフンも読む。
const PREF = /^(北海道|東京都|(?:京都|大阪)府|[^\d\s]{2,3}県)/;
export function parseAddress(addr) {
  let t = String(addr || '').normalize('NFKC').replace(/[\s　]/g, '').replace(/[‐‑–—−ー]/g, '-');
  t = t.replace(PREF, '');
  const cm = t.match(/^(.+?[区市])(.*)$/);
  if (!cm) return { city: '', town: '', chome: null, key: t };
  const rest = cm[2];
  const tm = rest.match(/^([^\d]+?)(\d+)(丁目|-|$|番|号)?/);
  const town = tm ? tm[1] : rest.replace(/\d.*$/, '');
  // 「西小松川町28-3」のように町名の次が番地のときは丁目ではない(丁目は9まで。「丁目」と書いてあればそのまま)
  const chome = tm && (tm[3] === '丁目' || Number(tm[2]) <= 9) ? Number(tm[2]) : null;
  return { city: cm[1], town, chome, key: cm[1] + rest };
}
const surname = (name) => String(name || '').normalize('NFKC').replace(/邸追?$/, '').split(/[\s　]+/)[0];
// 施工地図の1件 = 1つの邸(住所)。追加工事は同じ住所・同じ名前の邸にまとめる(重複して出さない)。下請け(MIRAI)は出さない。
// 完工(done) = その邸のすべての工事に完工日が入っている(追加工事の完工日が空欄なら未完工)。
export function mapHouses(custs) {
  const houses = [];
  const byKey = new Map();
  const list = custs.filter((c) => !c._sub && c['住所']).sort((a, b) => Number(a._add) - Number(b._add) || String(a['契約日']).localeCompare(String(b['契約日'])));
  for (const c of list) {
    const a = parseAddress(c['住所']);
    const name = surname(c['顧客名']);
    let hs = byKey.get(a.key + '|' + name) || byKey.get(a.key);
    if (c._add && !hs) hs = houses.find((x) => x.name === name && x.city === a.city);
    if (!hs) {
      hs = { name, label: `${name}邸`, city: a.city, town: a.town, chome: a.chome, address: String(c['住所']), members: [], done: true, startDate: null, doneDate: null, hasAdd: false };
      houses.push(hs); byKey.set(a.key + '|' + name, hs); if (!byKey.has(a.key)) byKey.set(a.key, hs);
    }
    hs.members.push(c);
    if (c._add) hs.hasAdd = true;
    if (!c['完工日']) hs.done = false;
    else if (!hs.doneDate || c['完工日'] > hs.doneDate) hs.doneDate = c['完工日'];
    if (c['着工日'] && (!hs.startDate || c['着工日'] > hs.startDate)) hs.startDate = c['着工日'];
  }
  return houses;
}
export function mapCities(houses) {
  const m = new Map();
  for (const x of houses) if (x.city) m.set(x.city, (m.get(x.city) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([city, count]) => ({ city, count }));
}
// city の邸を 町名ごとのかたまり(地域)にする。onlyOpen=true なら未完工の邸だけ。
export function mapBlocks(houses, { city = '江戸川区', onlyOpen = false } = {}) {
  const pool = houses.filter((x) => x.city === city && (!onlyOpen || !x.done));
  const towns = new Map();
  for (const x of pool) {
    const t = x.town || '(町名なし)';
    if (!towns.has(t)) towns.set(t, new Map());
    const cm = towns.get(t);
    const k = x.chome === null ? 0 : x.chome;
    if (!cm.has(k)) cm.set(k, []);
    cm.get(k).push(x);
  }
  const blocks = [...towns.entries()].map(([town, cm]) => {
    const chomes = [...cm.entries()].sort((a, b) => (a[0] || 99) - (b[0] || 99)).map(([chome, items]) => ({
      chome: chome || null, label: chome ? `${chome}丁目` : '丁目なし', items: items.sort((a, b) => Number(a.done) - Number(b.done) || a.label.localeCompare(b.label, 'ja')),
    }));
    const all = chomes.flatMap((c) => c.items);
    return { town, count: all.length, open: all.filter((x) => !x.done).length, chomes };
  });
  return blocks.sort((a, b) => b.count - a.count || a.town.localeCompare(b.town, 'ja'));
}


// ---- 口コミ(何人に1人が書いてくれるか) -------------------------------------------
// 顧客シートの「口コミ」欄に〇(何か入っていれば。×・なし・- は除く)がある契約。追加工事と下請け(MIRAI)は数えない。
const NOT_REVIEW = /^(×|✕|✗|x|-|ー|なし|無|未)$/i;
export const hasReview = (c) => {
  const v = String(c['口コミ'] ?? '').normalize('NFKC').trim();
  return v !== '' && !NOT_REVIEW.test(v);
};
const reviewTally = (list) => {
  const wrote = list.filter(hasReview).length;
  return { total: list.length, wrote, rate: list.length ? wrote / list.length : null, oneIn: wrote ? list.length / wrote : null };
};
// onlyDone=true なら、完工日が入っている契約だけ(まだ工事中の契約は、頼めていないので外す)
export function reviewStats(custs, { onlyDone = false, persons = null } = {}) {
  const pool = custs.filter((c) => c._count && c['契約日'] && (!onlyDone || c._done));
  const group = (keyFn) => {
    const m = new Map();
    for (const c of pool) for (const k of keyFn(c)) { if (!m.has(k)) m.set(k, []); m.get(k).push(c); }
    return m;
  };
  const rows = (m, sort) => [...m.entries()].map(([name, list]) => ({ name, ...reviewTally(list) })).sort(sort);
  const byYear = rows(group((c) => [c._year]), (a, b) => b.name - a.name);
  const byRoute = rows(group((c) => [String(c['集客経路'] || '').trim() || '(不明)']), (a, b) => b.total - a.total);
  const byPerson = rows(group((c) => [c['担当C'], c['担当A']].filter(Boolean)), (a, b) => b.total - a.total).filter((r) => !persons || persons.includes(r.name));
  return { all: reviewTally(pool), byYear, byRoute, byPerson };
}
// 口コミの契約一覧。filter: 'yes'=〇あり / 'no'=〇なし / 'all'。onlyDone=true なら完工した契約だけ。
// 並びは完工日の新しい順(完工日が空のものは後ろで、契約日の新しい順)。追加・下請けは入れない。
export function reviewList(custs, { filter = 'all', onlyDone = false, today = todayStr() } = {}) {
  return custs
    .filter((c) => c._count && c['契約日'] && (!onlyDone || c._done) && (filter === 'all' || (filter === 'yes') === hasReview(c)))
    .sort((a, b) => String(b['完工日'] || '').localeCompare(String(a['完工日'] || '')) || String(b['契約日']).localeCompare(String(a['契約日'])))
    .map((c) => ({
      name: c['顧客名'], contractDate: String(c['契約日']).slice(0, 10), doneDate: c['完工日'] ? String(c['完工日']).slice(0, 10) : '',
      days: c['完工日'] ? daysBetween(String(c['完工日']).slice(0, 10), today) : null, wrote: hasReview(c),
      route: c['集客経路'] || '', person: [c['担当C'], c['担当A']].filter(Boolean).join('・'), address: c['住所'] || '',
    }));
}
