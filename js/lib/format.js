// 포맷 / 유틸
export const won = (n) => (n == null || n === '' ? '' : '₩' + Number(n).toLocaleString('ko-KR'));
export const num = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString('ko-KR'));
export const fmtDate = (s) => (s ? String(s).slice(0, 10) : '');
export const todayStr = () => new Date().toISOString().slice(0, 10);

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 다음 채번 (접두어 + YYMM + 일련번호). 데모/간편용
export function nextDocNo(prefix, existingNos = []) {
  const ym = new Date().toISOString().slice(2, 7).replace('-', '');
  const base = `${prefix}-${ym}-`;
  let max = 0;
  for (const no of existingNos) {
    if (typeof no === 'string' && no.startsWith(base)) {
      const n = parseInt(no.slice(base.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return base + String(max + 1).padStart(3, '0');
}

// CSV 다운로드 (엑셀에서 한글 깨짐 방지 BOM 포함)
export function downloadCSV(filename, columns, rows) {
  const head = columns.map(c => `"${c.label}"`).join(',');
  const body = rows.map(r => columns.map(c => {
    let v = typeof c.csv === 'function' ? c.csv(r) : r[c.key];
    v = v == null ? '' : String(v).replace(/"/g, '""');
    return `"${v}"`;
  }).join(',')).join('\n');
  const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const debounce = (fn, ms = 280) => {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};
