// PDFファイルを画面の中で作って、そのままダウンロードさせる(印刷画面は使わない)。
// 表をキャンバスに描き、JPEG にして、A4横の PDF に貼る。外部のライブラリは使わず、通信もしない。

const enc = new TextEncoder();
export const A4L = { w: 841.89, h: 595.28 }; // A4横(pt)

// pages = [{ w, h, jpeg: Uint8Array }] → PDF のバイト列(1ページ=画像1枚)
export function buildPdf(pages, size = A4L) {
  const parts = [];
  let len = 0;
  const offsets = [];
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n${body}\nendobj\n`); };
  push('%PDF-1.4\n%âãÏÓ\n');
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  pages.forEach((p, i) => {
    const page = 3 + i * 3, cont = page + 1, img = page + 2;
    obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size.w} ${size.h}] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${cont} 0 R >>`);
    const draw = `q ${size.w} 0 0 ${size.h} 0 0 cm /Im0 Do Q`;
    obj(cont, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
    offsets[img] = len;
    push(`${img} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
    push(p.jpeg);
    push('\nendstream\nendobj\n');
  });
  const total = 3 + pages.length * 3;
  const xref = len;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let n = 1; n < total; n++) x += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(x + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len);
  let at = 0;
  for (const b of parts) { out.set(b, at); at += b.length; }
  return out;
}

const FONT = '"Noto Sans JP","Noto Sans CJK JP","Hiragino Sans","Yu Gothic UI","Yu Gothic","Meiryo",system-ui,sans-serif';
const yen = (n) => Math.round(n).toLocaleString('ja-JP');

// 文字を幅で折り返す(日本語は1文字ずつ)
function wrap(ctx, text, maxW) {
  const lines = [];
  let cur = '';
  for (const ch of String(text)) {
    if (cur && ctx.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

// model = { title, sub, who, issued, rows:[{name,route,payDate,taxEx,costs,landing,rate,role,amount,adjusted,reason,calc}], total, count }
// 戻り値: キャンバスの配列(A4横を1ページ1枚)
export function drawIncentivePages(model, { scale = 2.2 } = {}) {
  const W = 1123, H = 794, M = 38; // 96dpi でのA4横
  const tableW = W - M * 2;
  const measure = document.createElement('canvas').getContext('2d');
  const cols = [
    { h: '顧客名', get: (r) => r.name },
    { h: '集客経路', get: (r) => r.route },
    { h: '入金日', get: (r) => (r.payDate ? `${Number(r.payDate.slice(5, 7))}/${Number(r.payDate.slice(8, 10))}` : '') },
    { h: '税抜売上', num: true, get: (r) => yen(r.taxEx) },
    { h: '経費', num: true, get: (r) => yen(r.costs) },
    { h: '着地利益', num: true, get: (r) => yen(r.landing) },
    { h: '歩合率', num: true, get: (r) => `${Math.round(r.rate * 100)}%` },
    { h: '役割・配分', get: (r) => `${r.role}${Math.round(r.share * 100)}%` },
    { h: 'インセン(円)', num: true, bold: true, get: (r) => yen(r.amount) },
  ];
  // 文字の大きさを、備考の欄が十分に残るところまで小さくして決める
  let fs = 15, widths = [];
  for (const size of [15, 14, 13, 12.5, 12, 11.5, 11, 10.5, 10]) {
    fs = size;
    measure.font = `${fs}px ${FONT}`;
    widths = cols.map((c) => Math.max(measure.measureText(c.h).width, ...model.rows.map((r) => measure.measureText(c.get(r)).width), measure.measureText(c.h === '顧客名' ? `合計(${model.count}件)` : '').width) + 18);
    if (tableW - widths.reduce((a, b) => a + b, 0) >= 190) break;
  }
  const noteW = Math.max(120, tableW - widths.reduce((a, b) => a + b, 0));
  widths.push(noteW);
  measure.font = `${fs}px ${FONT}`;
  const lh = fs + 5;
  const noteLines = (r) => {
    if (!r.adjusted) return [];
    const t = `${r.reason ? r.reason + ' ' : ''}(計算上は ${yen(r.calc)}円)`;
    return wrap(measure, t, noteW - 12);
  };
  const rowH = (r) => Math.max(fs + 17, 10 + lh * (1 + noteLines(r).length) + (r.adjusted ? 0 : -lh));
  const headH = fs + 17, totalH = fs + 19;
  const bodyTop = M + 74 + headH; // 見出しブロックのあとに表の見出し
  const bodyBottom = H - M - 8;

  // ページに分ける
  const pages = [[]];
  let used = 0;
  for (const r of model.rows) {
    const hgt = rowH(r);
    if (used + hgt > bodyBottom - bodyTop && pages[pages.length - 1].length) { pages.push([]); used = 0; }
    pages[pages.length - 1].push(r); used += hgt;
  }
  if (used + totalH > bodyBottom - bodyTop) pages.push([]);

  const canvases = pages.map((rows, pi) => {
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * scale); cv.height = Math.round(H * scale);
    const c = cv.getContext('2d');
    c.scale(scale, scale);
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    c.textBaseline = 'alphabetic';
    // 見出し
    c.fillStyle = '#111'; c.font = `700 22px ${FONT}`; c.fillText(model.title, M, M + 20);
    c.fillStyle = '#444'; c.font = `13px ${FONT}`; c.fillText(model.sub, M, M + 44);
    c.textAlign = 'right';
    c.fillStyle = '#111'; c.font = `700 18px ${FONT}`; c.fillText(`${model.who} 様`, W - M, M + 20);
    c.fillStyle = '#444'; c.font = `13px ${FONT}`; c.fillText(`発行日 ${model.issued}`, W - M, M + 44);
    if (pages.length > 1) c.fillText(`${pi + 1} / ${pages.length}`, W - M, H - M + 6);
    c.textAlign = 'left';
    // 表の見出し
    let y = M + 74;
    const xs = [];
    widths.reduce((x, w) => { xs.push(x); return x + w; }, M);
    c.font = `${fs}px ${FONT}`;
    c.fillStyle = '#555';
    const cell = (i, text, yy, opt = {}) => {
      c.textAlign = opt.num ? 'right' : 'left';
      c.fillText(text, opt.num ? xs[i] + widths[i] - 9 : xs[i] + 9, yy);
    };
    cols.forEach((col, i) => cell(i, col.h, y + fs + 4, { num: col.num }));
    cell(cols.length, '備考', y + fs + 4);
    y += headH;
    c.strokeStyle = '#777'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(M, y - 0.5); c.lineTo(W - M, y - 0.5); c.stroke();
    // 行
    for (const r of rows) {
      const hgt = rowH(r);
      c.fillStyle = '#111';
      c.font = `${fs}px ${FONT}`;
      const base = y + 8 + fs;
      cols.forEach((col, i) => {
        c.font = `${col.bold ? '700 ' : ''}${fs}px ${FONT}`;
        cell(i, col.get(r), base, { num: col.num });
      });
      if (r.adjusted) {
        const nx = xs[cols.length] + 9;
        c.font = `700 ${fs - 1}px ${FONT}`;
        const tag = '調整あり';
        const tw = c.measureText(tag).width + 14;
        c.fillStyle = '#fbe9b7'; c.strokeStyle = '#d99a00';
        c.beginPath();
        if (c.roundRect) c.roundRect(nx, base - fs + 1, tw, fs + 3, (fs + 3) / 2); else c.rect(nx, base - fs + 1, tw, fs + 3);
        c.fill(); c.stroke();
        c.fillStyle = '#111'; c.textAlign = 'left'; c.fillText(tag, nx + 7, base);
        c.font = `${fs - 1}px ${FONT}`;
        noteLines(r).forEach((line, li) => c.fillText(line, nx, base + lh * (li + 1)));
      }
      y += hgt;
      c.strokeStyle = '#ccc'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(M, y - 0.5); c.lineTo(W - M, y - 0.5); c.stroke();
    }
    // 合計(最後のページ)
    if (pi === pages.length - 1) {
      c.strokeStyle = '#555'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(M, y + 0.5); c.lineTo(W - M, y + 0.5); c.stroke();
      c.fillStyle = '#111';
      c.font = `700 ${fs}px ${FONT}`;
      cell(0, `合計(${model.count}件)`, y + 8 + fs);
      cell(8, yen(model.total), y + 8 + fs, { num: true });
    }
    return cv;
  });
  return canvases;
}

export async function incentivePdfBlob(model) {
  const canvases = drawIncentivePages(model);
  const pages = [];
  for (const cv of canvases) {
    const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.92));
    pages.push({ w: cv.width, h: cv.height, jpeg: new Uint8Array(await blob.arrayBuffer()) });
  }
  return new Blob([buildPdf(pages)], { type: 'application/pdf' });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
