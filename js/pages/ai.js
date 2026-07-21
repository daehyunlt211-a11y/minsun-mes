// =====================================================================
// AI 인텔리전스 — 생산지연 예측 / 불량원인 분석 / 재고 예측 / 설비 예지보전 / 일일 리포트
// (휴리스틱 분석 엔진 js/lib/ai.js 사용. 결과는 의사결정 보조용)
// =====================================================================
import * as AI from '../lib/ai.js';
import { RISK_TONE, RISK_LABEL } from '../lib/ai.js';
import { num, fmtDate, escapeHtml } from '../lib/format.js';
import { badge } from '../ui/components.js';
import { icon } from '../ui/icons.js';

// ---------- 공통 렌더 헬퍼 ----------
function head(title, subtitle) {
  return `<div class="page-head"><div class="page-head__text"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>
    <div class="page-head__actions"><span class="badge badge--violet">${icon('brain', 14)} AI 분석</span><span class="muted">${new Date().toLocaleString('ko-KR')}</span></div></div>`;
}
function disclaimer() {
  return `<div class="ai-note">${icon('alert', 16)} AI 분석 결과는 현장 데이터 기반 <b>의사결정 보조</b>입니다. 최종 조치는 담당자 검토·승인 후 진행하세요.</div>`;
}
function statGrid(cards) {
  return `<div class="stat-grid">${cards.map(c => `
    <div class="stat"><div class="stat__top"><span class="stat__label">${escapeHtml(c.label)}</span>
      <span class="stat__ico ico-tint-${c.tint || 'brand'}">${icon(c.icon || 'brain', 21)}</span></div>
      <div class="stat__value">${c.value}${c.unit ? `<small>${escapeHtml(c.unit)}</small>` : ''}</div>
      ${c.sub ? `<div class="muted" style="margin-top:6px">${c.sub}</div>` : ''}</div>`).join('')}</div>`;
}
function riskBadge(risk) { return badge(RISK_LABEL[risk] || risk, RISK_TONE[risk]); }
function confBar(pct) {
  return `<div class="flex" style="gap:8px;align-items:center"><div class="progress" style="flex:1;max-width:120px"><span style="width:${pct}%"></span></div><span class="mono muted">${pct}%</span></div>`;
}
function loading(root) { root.innerHTML = `<div class="spinner" style="margin:80px auto"></div>`; }
function recoCards(list) {
  if (!list.length) return '';
  return `<div class="reco-list">${list.map(r => `
    <div class="reco">
      <div class="reco__ico">${icon('zap', 18)}</div>
      <div class="reco__body"><b>${escapeHtml(r.title)}</b><p>${escapeHtml(r.detail)}</p></div>
      ${r.confidence != null ? `<div class="reco__conf">신뢰도<br>${confBar(r.confidence)}</div>` : ''}
    </div>`).join('')}</div>`;
}

// =====================================================================
// 생산지연 예측
// =====================================================================
export async function aiDelay(root) {
  loading(root);
  const { items, summary } = await AI.predictDelays();
  root.innerHTML = head('AI 생산지연 예측', '작업지시 실적·납기·생산속도를 분석해 지연 위험을 사전 예측합니다.')
    + disclaimer()
    + statGrid([
      { label: '분석 작업지시', value: num(summary.total), unit: '건', icon: 'factory', tint: 'brand' },
      { label: '납기초과', value: num(summary.critical), unit: '건', icon: 'alert', tint: 'red', sub: '즉시 조치 필요' },
      { label: '지연위험 높음', value: num(summary.high), unit: '건', icon: 'trendDown', tint: 'amber' },
      { label: '정상 진행', value: num(summary.low), unit: '건', icon: 'checkCircle', tint: 'green' },
    ])
    + `<div class="card"><div class="card__head">${icon('activity', 18)}<h3>지연 위험 작업지시 (위험순)</h3></div>
       <div class="table-wrap"><table class="grid">
       <thead><tr><th>위험도</th><th>작업지시</th><th>품명</th><th class="num">진척률</th><th class="num">잔량</th><th class="center">납기</th><th>AI 분석</th><th>추천 조치</th></tr></thead>
       <tbody>${items.length ? items.map(i => `
         <tr>
           <td class="center">${riskBadge(i.risk)}</td>
           <td class="cell-code">${escapeHtml(i.wo.wo_no)}</td>
           <td class="cell-strong">${escapeHtml(i.wo.item_name || '')}</td>
           <td class="num"><div class="flex" style="gap:6px;justify-content:flex-end;align-items:center"><span class="mono">${i.progress}%</span><div class="progress" style="width:54px"><span style="width:${i.progress}%"></span></div></div></td>
           <td class="num mono">${num(i.remaining)}</td>
           <td class="center">${i.daysLeft == null ? '-' : i.daysLeft < 0 ? badge(`${Math.abs(i.daysLeft)}일 초과`, 'danger') : badge(`D-${i.daysLeft}`, i.daysLeft <= 2 ? 'warning' : 'neutral')}</td>
           <td class="muted" style="max-width:240px">${i.reasons.map(escapeHtml).join('<br>')}</td>
           <td>${escapeHtml(i.rec)}</td>
         </tr>`).join('') : `<tr><td colspan="8"><div class="empty" style="padding:30px">${icon('checkCircle', 40)}<h4>진행중 작업지시가 없습니다</h4></div></td></tr>`}
       </tbody></table></div></div>`;
}

// =====================================================================
// 불량 원인 분석
// =====================================================================
export async function aiDefect(root) {
  loading(root);
  const a = await AI.analyzeDefects();
  const barRows = (rows) => rows.slice(0, 6).map(r => {
    const max = rows[0]?.qty || 1; const pct = Math.round((r.qty / max) * 100);
    return `<div style="margin-bottom:10px"><div class="flex between" style="margin-bottom:4px"><span>${escapeHtml(r.key)}</span><span class="mono muted">${num(r.qty)}EA · ${r.count}건</span></div><div class="progress"><span style="width:${pct}%"></span></div></div>`;
  }).join('') || '<div class="muted">데이터 없음</div>';

  root.innerHTML = head('AI 불량 원인 분석', '부적합 이력을 종합해 주요 원인·취약공정·추세를 분석하고 시정/예방조치를 추천합니다.')
    + disclaimer()
    + statGrid([
      { label: '누적 불량', value: num(a.summary.qty), unit: 'EA', icon: 'alert', tint: 'red', sub: `${num(a.summary.count)}건` },
      { label: '주요 원인', value: escapeHtml(a.summary.topCause), icon: 'target', tint: 'amber' },
      { label: '취약 공정', value: escapeHtml(a.summary.topProcess), icon: 'factory', tint: 'violet' },
      { label: '최근 7일 추세', value: (a.summary.trendPct >= 0 ? '+' : '') + a.summary.trendPct, unit: '%', icon: a.summary.trendPct > 0 ? 'trendUp' : 'trendDown', tint: a.summary.trendPct > 20 ? 'red' : 'green', sub: `최근 ${num(a.summary.recentQty)} / 직전 ${num(a.summary.priorQty)}EA` },
    ])
    + `<div class="card"><div class="card__head">${icon('zap', 18)}<h3>AI 추천 조치</h3></div><div class="card__body">${recoCards(a.recommendations)}</div></div>`
    + `<div class="grid-2">
        <div class="card"><div class="card__head">${icon('sliders', 18)}<h3>원인별 불량</h3></div><div class="card__body">${barRows(a.byCause)}</div></div>
        <div class="card"><div class="card__head">${icon('factory', 18)}<h3>공정별 불량</h3></div><div class="card__body">${barRows(a.byProcess)}</div></div>
       </div>
       <div class="grid-2">
        <div class="card"><div class="card__head">${icon('box', 18)}<h3>품목별 불량</h3></div><div class="card__body">${barRows(a.byItem)}</div></div>
        <div class="card"><div class="card__head">${icon('shield', 18)}<h3>불량유형별</h3></div><div class="card__body">${barRows(a.byType)}</div></div>
       </div>`;
}

// =====================================================================
// 재고 예측 (적정/부족/장기재고)
// =====================================================================
export async function aiInventory(root) {
  loading(root);
  const { list, summary } = await AI.predictInventory();
  root.innerHTML = head('AI 재고 예측', '소비 추이를 기반으로 부족·소진임박·장기정체 재고를 예측하고 발주량을 추천합니다.')
    + disclaimer()
    + statGrid([
      { label: '재고 소진', value: num(summary.out), unit: '종', icon: 'alert', tint: 'red' },
      { label: '안전재고 미달', value: num(summary.low), unit: '종', icon: 'trendDown', tint: 'amber' },
      { label: '소진 임박(7일)', value: num(summary.soon), unit: '종', icon: 'clock', tint: 'violet' },
      { label: '장기 정체', value: num(summary.stagnant), unit: '종', icon: 'archive', tint: 'brand' },
    ])
    + `<div class="card"><div class="card__head">${icon('box', 18)}<h3>재고 예측 (위험순)</h3><div class="spacer"></div><span class="muted">발주 필요 ${num(summary.reorderItems)}종</span></div>
       <div class="table-wrap"><table class="grid">
       <thead><tr><th>상태</th><th>품목코드</th><th>품명</th><th class="num">현재고</th><th class="num">안전재고</th><th class="num">일평균소비</th><th class="num">소진예상</th><th class="num">추천 발주량</th></tr></thead>
       <tbody>${list.map(i => `
         <tr>
           <td class="center">${badge(RISK_LABEL[i.status] || i.status, RISK_TONE[i.status])}</td>
           <td class="cell-code">${escapeHtml(i.item_code)}</td>
           <td class="cell-strong">${escapeHtml(i.item_name || '')}</td>
           <td class="num mono">${num(i.stock)}</td>
           <td class="num mono muted">${num(i.safety)}</td>
           <td class="num mono">${i.dailyAvg ? i.dailyAvg.toFixed(1) : '0'}</td>
           <td class="num">${i.daysToOut == null ? '<span class="muted">—</span>' : i.daysToOut <= 7 ? badge(`${i.daysToOut}일`, 'warning') : `<span class="mono">${i.daysToOut}일</span>`}</td>
           <td class="num mono">${i.reorderQty ? `<b style="color:var(--brand)">${num(i.reorderQty)}</b>` : '-'}</td>
         </tr>`).join('')}
       </tbody></table></div></div>`;
}

// =====================================================================
// 설비 예지보전 (이상감지)
// =====================================================================
export async function aiEquipment(root) {
  loading(root);
  const { list, summary } = await AI.detectEquipmentAnomaly();
  const healthTone = (h) => h >= 82 ? 'success' : h >= 65 ? 'warning' : 'danger';
  root.innerHTML = head('AI 설비 예지보전', '설비 센서값(진동·온도·전류)과 불량률을 분석해 이상징후를 감지하고 점검 시점을 추천합니다.')
    + disclaimer()
    + statGrid([
      { label: '분석 설비', value: num(summary.total), unit: '대', icon: 'cpu', tint: 'brand' },
      { label: '긴급 정비', value: num(summary.critical), unit: '대', icon: 'alert', tint: 'red' },
      { label: '점검 권장', value: num(summary.high), unit: '대', icon: 'settings', tint: 'amber' },
      { label: '평균 건강도', value: num(summary.avgHealth), unit: '점', icon: 'activity', tint: 'green' },
    ])
    + `<div class="card"><div class="card__head">${icon('cpu', 18)}<h3>설비 상태 진단 (위험순)</h3></div>
       <div class="table-wrap"><table class="grid">
       <thead><tr><th>위험도</th><th>설비</th><th class="num">건강도</th><th class="num">진동</th><th class="num">온도</th><th class="num">전류</th><th class="num">불량률</th><th>이상신호</th><th>추천 조치</th></tr></thead>
       <tbody>${list.map(i => `
         <tr>
           <td class="center">${riskBadge(i.risk)}</td>
           <td><b>${escapeHtml(i.equip.name)}</b><div class="muted">${escapeHtml(i.equip.code)} · ${escapeHtml(i.equip.status || '')}</div></td>
           <td class="num"><div class="flex" style="gap:6px;justify-content:flex-end;align-items:center">${badge(String(i.health), healthTone(i.health))}</div></td>
           <td class="num mono">${i.vibration}<small class="muted"> mm/s</small></td>
           <td class="num mono">${i.temperature}<small class="muted"> °C</small></td>
           <td class="num mono">${i.current}<small class="muted"> A</small></td>
           <td class="num mono">${i.defectRate.toFixed(1)}%</td>
           <td class="muted" style="max-width:200px">${i.signals.length ? i.signals.map(escapeHtml).join('<br>') : '<span style="color:var(--success)">정상 범위</span>'}</td>
           <td>${escapeHtml(i.rec)}</td>
         </tr>`).join('')}
       </tbody></table></div></div>`;
}

// =====================================================================
// AI 일일 리포트
// =====================================================================
export async function aiReport(root) {
  loading(root);
  const r = await AI.dailyReport();
  root.innerHTML = head('AI 일일 종합 리포트', '생산·품질·물류·설비 현황을 AI가 자동 요약하고 금일 권장 조치를 제시합니다.')
    + disclaimer()
    + `<div class="card ai-report__head"><div class="card__body">
        <div class="flex between" style="flex-wrap:wrap;gap:12px">
          <div><div class="muted">리포트 기준일</div><h2 style="margin:2px 0">${escapeHtml(r.date)}</h2></div>
          <div class="flex" style="gap:20px;flex-wrap:wrap">
            <div><div class="muted">금일 생산</div><b style="font-size:20px">${num(r.production.good + r.production.defect)} EA</b></div>
            <div><div class="muted">수율</div><b style="font-size:20px">${r.production.yieldRate}%</b></div>
            <div><div class="muted">불량</div><b style="font-size:20px">${num(r.production.defect)} EA</b></div>
          </div>
        </div></div></div>`
    + `<div class="card"><div class="card__head">${icon('zap', 18)}<h3>AI 핵심 인사이트</h3></div><div class="card__body">
        <ul class="ai-highlights">${r.highlights.map(h => `<li>${icon('chevronRight', 14)} ${escapeHtml(h)}</li>`).join('')}</ul></div></div>`
    + `<div class="grid-2">
        <div class="card"><div class="card__head">${icon('factory', 18)}<h3>생산 / 납기</h3></div><div class="card__body">
          ${kv('지연 위험(높음↑)', `${r.delays.critical + r.delays.high}건`, r.delays.critical + r.delays.high > 0 ? 'warning' : 'success')}
          ${kv('납기초과', `${r.delays.critical}건`, r.delays.critical ? 'danger' : 'success')}
          ${kv('정상 진행', `${r.delays.low}건`, 'neutral')}
        </div></div>
        <div class="card"><div class="card__head">${icon('shield', 18)}<h3>품질</h3></div><div class="card__body">
          ${kv('최근 7일 불량', `${num(r.defects.recentQty)} EA`, 'neutral')}
          ${kv('추세', `${r.defects.trendPct >= 0 ? '+' : ''}${r.defects.trendPct}%`, r.defects.trendPct > 20 ? 'danger' : 'success')}
          ${kv('주요 원인', r.defects.topCause, 'info')}
        </div></div>
        <div class="card"><div class="card__head">${icon('box', 18)}<h3>자재 / 물류</h3></div><div class="card__body">
          ${kv('재고 소진/미달', `${r.inventory.out + r.inventory.low}종`, r.inventory.out + r.inventory.low ? 'warning' : 'success')}
          ${kv('발주 필요', `${r.inventory.reorderItems}종`, r.inventory.reorderItems ? 'warning' : 'success')}
          ${kv('장기 정체', `${r.inventory.stagnant}종`, 'neutral')}
        </div></div>
        <div class="card"><div class="card__head">${icon('cpu', 18)}<h3>설비</h3></div><div class="card__body">
          ${kv('긴급 정비', `${r.equipment.critical}대`, r.equipment.critical ? 'danger' : 'success')}
          ${kv('점검 권장', `${r.equipment.high}대`, r.equipment.high ? 'warning' : 'success')}
          ${kv('평균 건강도', `${r.equipment.avgHealth}점`, r.equipment.avgHealth >= 80 ? 'success' : 'warning')}
        </div></div>
       </div>`
    + (r.actions.length ? `<div class="card"><div class="card__head">${icon('check', 18)}<h3>금일 권장 조치</h3></div><div class="card__body">
        <ol class="ai-actions">${r.actions.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ol></div></div>` : '');
}
function kv(label, value, tone) {
  return `<div class="flex between" style="padding:9px 12px;background:var(--surface-2);border-radius:10px;margin-bottom:8px"><span>${escapeHtml(label)}</span>${badge(String(value), tone)}</div>`;
}
