// =====================================================================
// AI 분석 엔진 (휴리스틱 / 규칙기반)
// ---------------------------------------------------------------------
// 데모·운영 공통으로 동작하는 의사결정 보조 분석기.
// MES/QMS/CMS/WMS 데이터를 종합해 "분석 결과 + 추천안"을 산출합니다.
// (실제 ML 모델 연동 시 동일한 인터페이스로 교체 가능)
// =====================================================================
import { db } from './db.js';
import { todayStr } from './format.js';

const DAY = 86400000;
const today = () => new Date(todayStr());
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / DAY);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const addDays = (dateStr, n) => { const d = new Date(dateStr); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// 문자열 → 안정적 의사난수(0~1). 데모 센서값 합성용(동일 입력 → 동일 출력)
function seedRand(str, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < String(str).length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

// 위험도 → 배지 톤
export const RISK_TONE = { critical: 'danger', high: 'danger', medium: 'warning', low: 'success', stagnant: 'info', out: 'danger', soon: 'warning', ok: 'success' };
export const RISK_LABEL = { critical: '납기초과', high: '높음', medium: '보통', low: '낮음', stagnant: '장기정체', out: '재고소진', soon: '임박', ok: '양호' };

// =====================================================================
// 2.1 MES — 생산지연 예측
// =====================================================================
export async function predictDelays() {
  const [wos, results, plans] = await Promise.all([
    db.all('work_orders', {}), db.all('production_results', {}), db.all('production_plans', {}),
  ]);
  const t0 = today();
  const items = [];

  for (const wo of wos) {
    if (wo.status === '완료' || wo.status === '취소') continue;
    const res = results.filter(r => r.wo_no === wo.wo_no);
    const produced = res.reduce((s, r) => s + (+r.good_qty || 0), 0);
    const orderQty = +wo.order_qty || 0;
    const remaining = Math.max(0, orderQty - produced);
    const due = wo.due_date ? new Date(wo.due_date) : null;
    const daysLeft = due ? daysBetween(t0, due) : null;
    const progress = orderQty ? Math.round((produced / orderQty) * 100) : 0;

    // 일평균 실적 산출
    let actualRate = 0;
    if (produced > 0 && res.length) {
      const dates = res.map(r => new Date(r.result_date)).sort((a, b) => a - b);
      const span = Math.max(1, daysBetween(dates[0], t0) + 1);
      actualRate = produced / span;
    }
    // 계획 기준 필요 일평균
    const planSpan = wo.start_date && wo.due_date ? Math.max(1, daysBetween(wo.start_date, wo.due_date)) : null;
    const planRate = planSpan ? orderQty / planSpan : null;
    const requiredRate = daysLeft != null && daysLeft > 0 ? remaining / daysLeft : remaining;

    // 위험도 판정
    let risk = 'low';
    const reasons = [];
    if (daysLeft != null && daysLeft < 0 && remaining > 0) {
      risk = 'critical';
      reasons.push(`납기일 ${Math.abs(daysLeft)}일 경과, 잔량 ${remaining}EA`);
    } else if (remaining === 0) {
      risk = 'low'; reasons.push('생산 완료 수량 충족');
    } else {
      const baseRate = actualRate > 0 ? actualRate : (planRate || 0);
      const ratio = baseRate > 0 ? requiredRate / baseRate : Infinity;
      if (daysLeft != null && daysLeft <= 1 && remaining > 0) { risk = 'high'; reasons.push(`납기 ${daysLeft}일 전 잔량 ${remaining}EA`); }
      else if (ratio > 1.4 || baseRate === 0) { risk = 'high'; }
      else if (ratio > 0.95) { risk = 'medium'; }
      else { risk = 'low'; }
      if (actualRate > 0) reasons.push(`현재 일평균 ${actualRate.toFixed(0)}EA, 필요 일평균 ${requiredRate.toFixed(0)}EA`);
      else reasons.push('실적 미발생 — 착수 지연 가능성');
      if (planRate && actualRate && actualRate < planRate * 0.8) reasons.push(`계획대비 생산속도 ${Math.round(actualRate / planRate * 100)}%`);
    }

    // 추천
    let rec = '정상 진행 — 모니터링 유지';
    if (risk === 'critical') rec = '납기 재협의 또는 라인 추가 투입 / 외주 분할 검토';
    else if (risk === 'high') rec = '설비·작업자 추가 배정, 잔업/주말 가동으로 일평균 상향 필요';
    else if (risk === 'medium') rec = '생산속도 점검 — 자재·공구 사전확보 권장';

    const score = (risk === 'critical' ? 1000 : risk === 'high' ? 500 : risk === 'medium' ? 200 : 0)
      + (daysLeft != null ? clamp(30 - daysLeft, 0, 60) : 0) + remaining / 100;

    items.push({ wo, produced, orderQty, remaining, daysLeft, progress, actualRate, requiredRate, risk, reasons, rec, score });
  }

  items.sort((a, b) => b.score - a.score);
  const summary = {
    total: items.length,
    critical: items.filter(i => i.risk === 'critical').length,
    high: items.filter(i => i.risk === 'high').length,
    medium: items.filter(i => i.risk === 'medium').length,
    low: items.filter(i => i.risk === 'low').length,
  };
  return { items, summary };
}

// =====================================================================
// 2.2 QMS — 불량 원인 분석
// =====================================================================
export async function analyzeDefects() {
  const ncr = await db.all('nonconformances', {});
  const t0 = today();
  const qtyOf = (r) => +r.defect_qty || 0;

  const group = (key) => {
    const m = {};
    for (const r of ncr) { const k = r[key] || '미지정'; (m[k] ??= { key: k, count: 0, qty: 0 }); m[k].count++; m[k].qty += qtyOf(r); }
    return Object.values(m).sort((a, b) => b.qty - a.qty);
  };
  const byCause = group('cause'), byProcess = group('process'), byItem = group('item_name'), byType = group('defect_type');

  // 최근 7일 vs 직전 7일 추세
  const recent = ncr.filter(r => daysBetween(r.occur_date, t0) >= 0 && daysBetween(r.occur_date, t0) < 7);
  const prior = ncr.filter(r => daysBetween(r.occur_date, t0) >= 7 && daysBetween(r.occur_date, t0) < 14);
  const recentQty = recent.reduce((s, r) => s + qtyOf(r), 0);
  const priorQty = prior.reduce((s, r) => s + qtyOf(r), 0);
  const trendPct = priorQty ? Math.round((recentQty - priorQty) / priorQty * 100) : (recentQty ? 100 : 0);

  // 추천안 (원인-공정 결합)
  const recommendations = [];
  if (byCause[0]) {
    const c = byCause[0];
    const causeRows = ncr.filter(r => (r.cause || '미지정') === c.key);
    const procM = {}; for (const r of causeRows) { const p = r.process || '미지정'; procM[p] = (procM[p] || 0) + qtyOf(r); }
    const topProc = Object.entries(procM).sort((a, b) => b[1] - a[1])[0];
    const map = {
      '공구마모': '공구 교체주기 단축 및 수명관리(LOT 수명) 강화 — POP 공구투입 이력 점검',
      '셋업오류': '초·중·종물 검사 강화 및 셋업 체크시트 적용',
      '소재불량': '수입검사 강화 품목 지정, 해당 자재 LOT 입고검사 샘플 확대',
      '작업자 실수': '작업표준(SOP) 재교육 및 자주검사 항목 추가',
      '설비 이상': '해당 설비 예지보전 점검 — CMS 이상징후 연계 확인',
    };
    recommendations.push({
      title: `주요 원인: ${c.key} (${c.qty}EA, ${c.count}건)`,
      detail: (map[c.key] || '근본원인 분석(5Why) 및 표준 재정비') + (topProc ? ` · 집중 공정: ${topProc[0]}` : ''),
      confidence: Math.round(clamp(c.qty / Math.max(1, ncr.reduce((s, r) => s + qtyOf(r), 0)) * 100, 35, 92)),
    });
  }
  if (byProcess[0]) recommendations.push({ title: `취약 공정: ${byProcess[0].key}`, detail: `해당 공정 불량 ${byProcess[0].qty}EA — 공정조건 표준화 및 자주검사 빈도 상향`, confidence: 70 });
  if (trendPct > 20) recommendations.push({ title: `불량 급증 추세 (+${trendPct}%)`, detail: '최근 7일 불량이 직전 대비 증가 — 변경점(4M) 관리 및 긴급 원인분석 권장', confidence: 80 });

  const totalQty = ncr.reduce((s, r) => s + qtyOf(r), 0);
  return {
    summary: { count: ncr.length, qty: totalQty, recentQty, priorQty, trendPct, topCause: byCause[0]?.key || '-', topProcess: byProcess[0]?.key || '-' },
    byCause, byProcess, byItem, byType, recommendations,
  };
}

// 특정 품목/공정에 대한 원인 후보 추정 (불량 발생 시 원인 추천)
export async function probableCauses(itemName, process) {
  const ncr = await db.all('nonconformances', {});
  const rows = ncr.filter(r => (!itemName || r.item_name === itemName) && (!process || r.process === process));
  const m = {};
  for (const r of rows) { const k = r.cause || '미지정'; (m[k] ??= { cause: k, count: 0, qty: 0 }); m[k].count++; m[k].qty += +r.defect_qty || 0; }
  const total = rows.reduce((s, r) => s + (+r.defect_qty || 0), 0) || 1;
  return Object.values(m).sort((a, b) => b.qty - a.qty).map(c => ({ ...c, prob: Math.round(c.qty / total * 100) }));
}

// =====================================================================
// 2.3 WMS — 재고 예측 (적정재고 / 부족재고 / 장기재고)
// =====================================================================
export async function predictInventory() {
  const [stocks, items, outs] = await Promise.all([
    db.all('material_stocks', {}), db.all('items', {}), db.all('material_outbounds', {}),
  ]);
  const t0 = today();
  const itemMap = {}; for (const it of items) itemMap[it.code] = it;
  const WINDOW = 30;

  const list = stocks.map(s => {
    const it = itemMap[s.item_code] || {};
    const safety = +it.safety_stock || 0;
    const stock = +s.stock_qty || 0;
    const recentOut = outs.filter(o => o.item_code === s.item_code && daysBetween(o.outbound_date, t0) >= 0 && daysBetween(o.outbound_date, t0) < WINDOW);
    const consumed = recentOut.reduce((sum, o) => sum + (+o.outbound_qty || 0), 0);
    const dailyAvg = consumed / WINDOW;
    const daysToOut = dailyAvg > 0 ? Math.floor(stock / dailyAvg) : null;

    let status = 'ok';
    if (stock <= 0) status = 'out';
    else if (stock < safety) status = 'low';
    else if (daysToOut != null && daysToOut <= 7) status = 'soon';
    else if (dailyAvg === 0 && stock > 0 && (+s.out_qty || 0) === 0) status = 'stagnant';

    // 추천 발주량: 안전재고 2배 또는 14일 소요량 중 큰 값까지 충전
    const target = Math.max(safety * 2, Math.ceil(dailyAvg * 14));
    const reorderQty = status === 'ok' || status === 'stagnant' ? 0 : Math.max(0, target - stock);

    return { item_code: s.item_code, item_name: s.item_name || it.name, stock, safety, dailyAvg, daysToOut, status, reorderQty };
  });

  // 위험 우선 정렬
  const rank = { out: 4, low: 3, soon: 2, stagnant: 1, ok: 0 };
  list.sort((a, b) => (rank[b.status] - rank[a.status]) || (a.daysToOut ?? 999) - (b.daysToOut ?? 999));
  const summary = {
    total: list.length,
    out: list.filter(i => i.status === 'out').length,
    low: list.filter(i => i.status === 'low').length,
    soon: list.filter(i => i.status === 'soon').length,
    stagnant: list.filter(i => i.status === 'stagnant').length,
    reorderItems: list.filter(i => i.reorderQty > 0).length,
  };
  return { list, summary };
}

// =====================================================================
// 2.4 CMS — 설비 이상감지 / 예지보전
// =====================================================================
export async function detectEquipmentAnomaly() {
  const [equips, results, ncr] = await Promise.all([
    db.all('equipments', {}), db.all('production_results', {}), db.all('nonconformances', {}),
  ]);

  const list = equips.map(e => {
    // 데모 센서값 합성(코드 기반 안정적). 운영 시 IoT/OPC-UA 수집값으로 대체
    const vibration = +(1.2 + seedRand(e.code, 1) * 4.3).toFixed(2);     // mm/s
    const temperature = +(38 + seedRand(e.code, 2) * 32).toFixed(1);     // °C
    const current = +(8 + seedRand(e.code, 3) * 12).toFixed(1);          // A

    // 해당 설비 불량률
    const res = results.filter(r => r.equipment === e.code);
    const good = res.reduce((s, r) => s + (+r.good_qty || 0), 0);
    const defect = res.reduce((s, r) => s + (+r.defect_qty || 0), 0);
    const defectRate = good + defect ? defect / (good + defect) * 100 : 0;
    const eqNcr = ncr.filter(n => n.equipment === e.code).length;

    // 건강도 점수 (100 - 페널티)
    let penalty = 0; const signals = [];
    if (vibration > 4.0) { penalty += 30; signals.push(`진동 ${vibration}mm/s 임계 초과`); }
    else if (vibration > 3.2) { penalty += 15; signals.push(`진동 ${vibration}mm/s 상승`); }
    if (temperature > 62) { penalty += 25; signals.push(`온도 ${temperature}°C 과열`); }
    else if (temperature > 55) { penalty += 12; signals.push(`온도 ${temperature}°C 주의`); }
    if (defectRate > 4) { penalty += 20; signals.push(`불량률 ${defectRate.toFixed(1)}%`); }
    if (e.status === '고장') penalty += 60;
    else if (e.status === '점검') penalty += 25;
    const health = clamp(Math.round(100 - penalty), 0, 100);

    let risk = 'low';
    if (e.status === '고장' || health < 40) risk = 'critical';
    else if (health < 65) risk = 'high';
    else if (health < 82) risk = 'medium';

    let rec = '정상 — 정기 점검주기 유지';
    if (risk === 'critical') rec = '즉시 정지·정비, 배정 작업지시 타 설비 재배치(MES 연계)';
    else if (risk === 'high') rec = '예방정비 일정 단축, 진동·온도 추이 집중 모니터링';
    else if (risk === 'medium') rec = '다음 점검 시 베어링/윤활 상태 확인 권장';

    return { equip: e, vibration, temperature, current, defectRate, eqNcr, health, risk, signals, rec };
  });

  const rank = { critical: 3, high: 2, medium: 1, low: 0 };
  list.sort((a, b) => (rank[b.risk] - rank[a.risk]) || a.health - b.health);
  const summary = {
    total: list.length,
    critical: list.filter(i => i.risk === 'critical').length,
    high: list.filter(i => i.risk === 'high').length,
    avgHealth: list.length ? Math.round(list.reduce((s, i) => s + i.health, 0) / list.length) : 0,
  };
  return { list, summary };
}

// =====================================================================
// 2.1 MES — AI 일일 리포트 (생산/품질/물류/설비 자동 요약)
// =====================================================================
export async function dailyReport() {
  const [delays, defects, inv, equip, results, orders] = await Promise.all([
    predictDelays(), analyzeDefects(), predictInventory(), detectEquipmentAnomaly(),
    db.all('production_results', {}), db.all('sales_orders', {}),
  ]);
  const t = todayStr();
  const todayRes = results.filter(r => String(r.result_date).slice(0, 10) === t);
  const good = todayRes.reduce((s, r) => s + (+r.good_qty || 0), 0);
  const defect = todayRes.reduce((s, r) => s + (+r.defect_qty || 0), 0);
  const yieldRate = good + defect ? (good / (good + defect) * 100).toFixed(1) : '—';

  const highlights = [];
  const topDelay = delays.items.find(i => i.risk === 'critical' || i.risk === 'high');
  if (topDelay) highlights.push(`납기지연 위험: ${topDelay.wo.item_name} (${topDelay.wo.wo_no}) — ${RISK_LABEL[topDelay.risk]}`);
  if (defects.summary.trendPct > 20) highlights.push(`불량 증가 추세 +${defects.summary.trendPct}% (주요 원인: ${defects.summary.topCause})`);
  const reorder = inv.list.filter(i => i.reorderQty > 0);
  if (reorder.length) highlights.push(`발주 필요 자재 ${reorder.length}종 (최우선: ${reorder[0].item_name})`);
  const eqRisk = equip.list.find(i => i.risk === 'critical' || i.risk === 'high');
  if (eqRisk) highlights.push(`설비 이상징후: ${eqRisk.equip.name} (건강도 ${eqRisk.health})`);
  if (!highlights.length) highlights.push('금일 특이사항 없음 — 전 공정 정상 범위');

  return {
    date: t,
    production: { good, defect, yieldRate, count: todayRes.length },
    delays: delays.summary, defects: defects.summary, inventory: inv.summary, equipment: equip.summary,
    highlights,
    actions: [
      delays.summary.critical + delays.summary.high > 0 ? `생산지연 위험 작업지시 ${delays.summary.critical + delays.summary.high}건 조정 검토` : null,
      reorder.length ? `자재 발주 ${reorder.length}종 품의` : null,
      equip.summary.critical ? `설비 ${equip.summary.critical}대 긴급 정비` : null,
      defects.summary.trendPct > 20 ? '품질 변경점(4M) 점검 회의' : null,
    ].filter(Boolean),
  };
}

// =====================================================================
// 영업 — AI 수주 예측 (거래처×품목 주문주기 분석)
//  과거 수주 이력에서 거래처-품목별 평균 주문주기를 분석해
//  "어떤 거래처가 어떤 품목을 언제 수주할 확률"을 예측한다.
// =====================================================================
export async function forecastOrders() {
  const orders = (await db.all('sales_orders', {})).filter(o => o.order_date && o.partner && o.item_code);
  const t0 = today();
  const groups = {};
  for (const o of orders) {
    const k = o.partner + '||' + o.item_code;
    (groups[k] ??= { partner: o.partner, item_code: o.item_code, item_name: o.item_name, dates: [], qtys: [], prices: [] });
    groups[k].dates.push(String(o.order_date).slice(0, 10));
    groups[k].qtys.push(+o.order_qty || 0);
    groups[k].prices.push(+o.unit_price || 0);
  }

  const items = Object.values(groups).map(g => {
    g.dates.sort();
    const n = g.dates.length;
    const last = g.dates[n - 1];
    const avgQty = Math.round(g.qtys.reduce((a, b) => a + b, 0) / n);
    const avgPrice = Math.round(g.prices.reduce((a, b) => a + b, 0) / n);
    let predDate, prob, interval, std = 0, reason;
    if (n >= 2) {
      const ivs = [];
      for (let i = 1; i < n; i++) ivs.push(Math.max(1, daysBetween(g.dates[i - 1], g.dates[i])));
      const mean = ivs.reduce((a, b) => a + b, 0) / ivs.length;
      interval = Math.round(mean);
      std = Math.sqrt(ivs.reduce((a, b) => a + (b - mean) ** 2, 0) / ivs.length);
      const regularity = clamp(1 - (mean ? std / mean : 1), 0, 1);           // 주기 일관성
      predDate = addDays(last, interval);
      const daysToPred = daysBetween(t0, predDate);
      const recency = clamp(1 - Math.abs(daysToPred) / Math.max(interval, 1) * 0.5, 0.3, 1);
      const freqBoost = clamp(n / 8, 0, 0.3);                                 // 누적 주문수 가산
      prob = Math.round(clamp(regularity * 0.6 + recency * 0.25 + freqBoost, 0.1, 0.97) * 100);
      reason = `과거 ${n}회 수주 · 평균주기 ${interval}일(±${Math.round(std)}일)`;
    } else {
      interval = null;
      predDate = addDays(last, 30);
      prob = 30;
      reason = '과거 1회 수주 · 표준주기(30일) 가정';
    }
    return { partner: g.partner, item_code: g.item_code, item_name: g.item_name, count: n, lastDate: last, predDate, daysToPred: daysBetween(t0, predDate), avgQty, avgPrice, prob, interval, std: Math.round(std), reason };
  });

  items.sort((a, b) => b.prob - a.prob || a.daysToPred - b.daysToPred);
  const summary = {
    total: items.length,
    within7: items.filter(i => i.daysToPred >= 0 && i.daysToPred <= 7).length,
    within30: items.filter(i => i.daysToPred >= -3 && i.daysToPred <= 30).length,
    high: items.filter(i => i.prob >= 70).length,
    avgProb: items.length ? Math.round(items.reduce((s, i) => s + i.prob, 0) / items.length) : 0,
  };
  return { items, summary };
}
