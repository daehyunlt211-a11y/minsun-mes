// Code39 바코드 SVG 생성 + 작업지시서/공정이동전표 인쇄
// 스캐너 호환성이 좋은 Code39 (숫자·영대문자·-. 지원, 라이브러리 불필요)
const C39 = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  'A': 'wnnnnwnnw', 'B': 'nnwnnwnnw', 'C': 'wnwnnwnnn', 'D': 'nnnnwwnnw', 'E': 'wnnnwwnnn',
  'F': 'nnwnwwnnn', 'G': 'nnnnnwwnw', 'H': 'wnnnnwwnn', 'I': 'nnwnnwwnn', 'J': 'nnnnwwwnn',
  'K': 'wnnnnnnww', 'L': 'nnwnnnnww', 'M': 'wnwnnnnwn', 'N': 'nnnnwnnww', 'O': 'wnnnwnnwn',
  'P': 'nnwnwnnwn', 'Q': 'nnnnnnwww', 'R': 'wnnnnnwwn', 'S': 'nnwnnnwwn', 'T': 'nnnnwnwwn',
  'U': 'wwnnnnnnw', 'V': 'nwwnnnnnw', 'W': 'wwwnnnnnn', 'X': 'nwnnwnnnw', 'Y': 'wwnnwnnnn',
  'Z': 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn',
};

// 텍스트 → Code39 SVG 문자열
export function barcodeSVG(text, { height = 48, narrow = 2, showText = true } = {}) {
  const value = ('*' + String(text).toUpperCase().replace(/[^0-9A-Z\-. ]/g, '-') + '*');
  let x = 0; const bars = [];
  for (const ch of value) {
    const pat = C39[ch] || C39['-'];
    for (let i = 0; i < 9; i++) {
      const w = pat[i] === 'w' ? narrow * 3 : narrow;
      if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${w}" height="${height}"/>`);
      x += w;
    }
    x += narrow; // 문자 간 간격
  }
  const totalW = x;
  const textH = showText ? 16 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${height + textH}" width="${totalW}" height="${height + textH}" style="max-width:100%">
    <g fill="#000">${bars.join('')}</g>
    ${showText ? `<text x="${totalW / 2}" y="${height + 13}" text-anchor="middle" font-family="monospace" font-size="12" fill="#000">${String(text)}</text>` : ''}
  </svg>`;
}

// 인쇄 창 열기 (전표 HTML)
export function printSheet(title, bodyHtml) {
  const w = window.open('', '_blank', 'width=820,height=900');
  if (!w) { alert('팝업이 차단되었습니다. 팝업을 허용해주세요.'); return; }
  w.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Malgun Gothic', sans-serif; padding: 28px; color: #111; }
      h1 { font-size: 22px; text-align: center; margin-bottom: 4px; letter-spacing: 6px; }
      .sub { text-align: center; color: #555; font-size: 12px; margin-bottom: 18px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
      th, td { border: 1px solid #333; padding: 8px 10px; font-size: 13px; text-align: left; }
      th { background: #f0f0f0; width: 130px; }
      .bc { text-align: center; padding: 18px 0 8px; }
      .foot { display: flex; justify-content: space-between; margin-top: 24px; font-size: 12px; color: #444; }
      .sign { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid #333; margin-top: 16px; }
      .sign > div { border-right: 1px solid #333; text-align: center; }
      .sign > div:last-child { border-right: 0; }
      .sign .t { background: #f0f0f0; border-bottom: 1px solid #333; padding: 5px; font-size: 12px; }
      .sign .s { height: 56px; }
      @media print { body { padding: 10mm; } }
    </style></head><body>${bodyHtml}
    <script>window.onload = () => { window.print(); };</script></body></html>`);
  w.document.close();
}

// 작업지시서 겸 공정이동전표 인쇄
export function printWorkOrderSheet(wo, processes = []) {
  const lot = wo.lot_no || wo.wo_no;
  const rows = processes.length
    ? processes.map(p => `<tr><td style="text-align:center">${p.seq ?? ''}</td><td>${p.process_name || ''}</td><td>${p.in_out || '사내'}</td><td>${p.equipment || ''}</td><td></td><td></td><td></td></tr>`).join('')
    : `<tr><td colspan="7" style="text-align:center;color:#888">등록된 라우팅이 없습니다</td></tr>`;
  printSheet(`작업지시서_${wo.wo_no}`, `
    <h1>작업지시서 / 공정이동전표</h1>
    <div class="sub">(주)민선 MES·QMS — 본 전표는 바코드 스캔으로 공정이동 처리에 사용됩니다</div>
    <div class="bc">${barcodeSVG(lot, { height: 56, narrow: 2 })}</div>
    <table>
      <tr><th>작업지시번호</th><td>${wo.wo_no || ''}</td><th>LOT No.</th><td>${lot}</td></tr>
      <tr><th>품목코드</th><td>${wo.item_code || ''}</td><th>품명</th><td>${wo.item_name || ''}</td></tr>
      <tr><th>지시수량</th><td>${Number(wo.order_qty || 0).toLocaleString()} EA</td><th>생산계획</th><td>${wo.plan_no || ''}</td></tr>
      <tr><th>계획기간</th><td>${(wo.start_date || '').slice(0, 10)} ~ ${(wo.due_date || '').slice(0, 10)}</td><th>지시일</th><td>${(wo.wo_date || '').slice(0, 10)}</td></tr>
    </table>
    <table>
      <thead><tr><th style="width:46px;text-align:center">순서</th><th>공정</th><th style="width:60px">구분</th><th>설비/호기</th><th style="width:80px">양품</th><th style="width:80px">불량</th><th style="width:90px">작업자 확인</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sign">
      <div><div class="t">작 성</div><div class="s"></div></div>
      <div><div class="t">검 토</div><div class="s"></div></div>
      <div><div class="t">승 인</div><div class="s"></div></div>
    </div>
    <div class="foot"><span>출력일시: ${new Date().toLocaleString('ko-KR')}</span><span>MINSUN MES·QMS</span></div>`);
}

// 자재/제품 라벨 인쇄
export function printLabel({ title = '자재 라벨', code, name, lot, qty, date, partner, extra = '' }) {
  printSheet(`라벨_${lot || code}`, `
    <div style="border:2px solid #000;padding:18px;max-width:420px;margin:0 auto">
      <h1 style="letter-spacing:2px;font-size:18px">${title}</h1>
      <div class="bc">${barcodeSVG(lot || code || '', { height: 50 })}</div>
      <table>
        <tr><th>품목코드</th><td>${code || ''}</td></tr>
        <tr><th>품명</th><td>${name || ''}</td></tr>
        <tr><th>LOT(관리번호)</th><td>${lot || ''}</td></tr>
        <tr><th>수량</th><td>${qty != null ? Number(qty).toLocaleString() : ''}</td></tr>
        <tr><th>일자</th><td>${(date || '').slice(0, 10)}</td></tr>
        ${partner ? `<tr><th>거래처</th><td>${partner}</td></tr>` : ''}
        ${extra}
      </table>
    </div>`);
}
