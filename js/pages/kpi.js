// SQ 심사 대응 지표 리포트 + LOT 추적 (정·역방향 추적성)
import { db } from '../lib/db.js';
import { num, fmtDate, todayStr, escapeHtml } from '../lib/format.js';
import { badge } from '../ui/components.js';
import { icon } from '../ui/icons.js';

function statCard(label, value, unit, ic, tint, sub = '') {
  return `<div class="stat"><div class="stat__top"><span class="stat__label">${escapeHtml(label)}</span><span class="stat__ico ico-tint-${tint}">${icon(ic, 21)}</span></div>
    <div class="stat__value">${value}${unit ? `<small>${escapeHtml(unit)}</small>` : ''}</div>
    ${sub ? `<div class="muted" style="margin-top:6px">${sub}</div>` : ''}</div>`;
}

// =====================================================================
// SQ 지표 리포트 — 불량률(PPM), 시간당 생산량, 검사합격률, 공정능력(Cpk)
// =====================================================================
export async function sqReport(root) {
  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>SQ 지표 리포트</h1><p>SQ 심사에 요구되는 품질 수치를 실적 데이터 기반으로 자동 산출합니다. (목표: 불량률 12,000PPM 이하 · 시간당 생산량 170EA)</p></div>
      <div class="page-head__actions">
        <button class="btn" id="sq-print">${icon('fileText', 16)} 인쇄</button>
        <button class="btn" id="sq-refresh">${icon('refresh', 16)} 새로고침</button>
      </div>
    </div>
    <div id="sq-stats"><div class="spinner"></div></div>
    <div class="grid-2" style="margin-bottom:18px">
      <div class="card"><div class="card__head">${icon('trendDown', 18)}<h3>월별 공정 불량률(PPM) 추이</h3></div><div class="card__body" id="sq-ppm"></div></div>
      <div class="card"><div class="card__head">${icon('shield', 18)}<h3>검사 합격률 (수입/공정/출하)</h3></div><div class="card__body" id="sq-insp"></div></div>
    </div>
    <div class="card"><div class="card__head">${icon('target', 18)}<h3>공정능력(Cpk) — 정량 검사항목 기준</h3>
      <span class="muted" style="margin-left:8px">검사 상세(측정값) 5건 이상 축적된 항목만 산출</span></div>
      <div class="table-wrap"><div id="sq-cpk"></div></div></div>`;

  root.querySelector('#sq-refresh').onclick = () => sqReport(root);
  root.querySelector('#sq-print').onclick = () => window.print();

  const [results, incoming, procInsp, shipping, details] = await Promise.all([
    db.all('production_results', {}).catch(() => []),
    db.all('incoming_inspections', {}).catch(() => []),
    db.all('process_inspections', {}).catch(() => []),
    db.all('shipping_inspections', {}).catch(() => []),
    db.all('inspection_details', {}).catch(() => []),
  ]);

  // ---- 종합 지표 ----
  const good = results.reduce((s, r) => s + (+r.good_qty || 0), 0);
  const defect = results.reduce((s, r) => s + (+r.defect_qty || 0), 0);
  const total = good + defect;
  const ppm = total ? Math.round(defect / total * 1000000) : 0;
  const time = results.reduce((s, r) => s + (+r.work_time || 0), 0);
  const uph = time ? Math.round(good / (time / 60)) : 0;
  const allInsp = [...incoming, ...procInsp, ...shipping];
  const passRate = allInsp.length ? ((allInsp.filter(r => r.result === '합격').length / allInsp.length) * 100).toFixed(1) : '0.0';
  const ppmOk = ppm <= 12000;
  const uphOk = uph >= 170;
  root.querySelector('#sq-stats').innerHTML = `<div class="stat-grid">
    ${statCard('공정 불량률', num(ppm), 'PPM', 'trendDown', ppmOk ? 'green' : 'red', `목표 12,000 PPM ${ppmOk ? badge('달성', 'success') : badge('미달', 'danger')}`)}
    ${statCard('시간당 생산량', num(uph), 'EA/h', 'zap', uphOk ? 'green' : 'amber', `목표 170 EA ${uphOk ? badge('달성', 'success') : badge('미달', 'warning')}`)}
    ${statCard('검사 합격률', passRate, '%', 'shield', 'brand', `총 ${num(allInsp.length)}건 검사`)}
    ${statCard('총 생산수량', num(total), 'EA', 'factory', 'violet', `양품 ${num(good)} · 불량 ${num(defect)}`)}
  </div>`;

  // ---- 월별 PPM 추이 (최근 6개월) ----
  const byMonth = {};
  for (const r of results) {
    const ym = String(r.result_date || '').slice(0, 7);
    if (!ym) continue;
    (byMonth[ym] ??= { good: 0, defect: 0 });
    byMonth[ym].good += +r.good_qty || 0;
    byMonth[ym].defect += +r.defect_qty || 0;
  }
  const months = Object.keys(byMonth).sort().slice(-6);
  const ppmSlot = root.querySelector('#sq-ppm');
  if (!months.length) ppmSlot.innerHTML = `<div class="empty">${icon('inbox', 44)}<h4>실적 데이터가 없습니다</h4></div>`;
  else {
    const rows = months.map(m => {
      const t = byMonth[m].good + byMonth[m].defect;
      return { ym: m, total: t, defect: byMonth[m].defect, ppm: t ? Math.round(byMonth[m].defect / t * 1000000) : 0 };
    });
    const maxPpm = Math.max(...rows.map(r => r.ppm), 12000);
    ppmSlot.innerHTML = `<div class="flex-col" style="gap:10px">${rows.map(r => `
      <div>
        <div class="flex between" style="margin-bottom:4px"><b>${r.ym}</b>
          <span class="mono">${num(r.ppm)} PPM ${r.ppm <= 12000 ? badge('목표내', 'success') : badge('초과', 'danger')}</span></div>
        <div class="progress" style="height:10px"><span style="width:${Math.min(100, r.ppm / maxPpm * 100)}%;background:${r.ppm <= 12000 ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)'}"></span></div>
        <div class="muted" style="margin-top:2px">생산 ${num(r.total)} EA · 불량 ${num(r.defect)} EA</div>
      </div>`).join('')}</div>`;
  }

  // ---- 검사 합격률 ----
  const inspSlot = root.querySelector('#sq-insp');
  const kinds = [['수입검사', incoming], ['공정검사', procInsp], ['출하검사', shipping]];
  inspSlot.innerHTML = `<div class="flex-col" style="gap:12px">${kinds.map(([name, arr]) => {
    const pass = arr.filter(r => r.result === '합격').length;
    const rate = arr.length ? (pass / arr.length * 100) : 0;
    return `<div>
      <div class="flex between" style="margin-bottom:4px"><b>${name}</b><span class="mono">${rate.toFixed(1)}% <span class="muted">(${num(pass)}/${num(arr.length)}건)</span></span></div>
      <div class="progress" style="height:10px"><span style="width:${rate}%"></span></div>
    </div>`;
  }).join('')}</div>`;

  // ---- Cpk (정량 검사항목별) ----
  const cpkSlot = root.querySelector('#sq-cpk');
  const groups = {};
  for (const d of details) {
    if ((d.eval_method || '정량적') !== '정량적') continue;
    const m = parseFloat(d.measured), s = parseFloat(d.spec_value);
    const t = Math.abs(parseFloat(String(d.tolerance ?? '').replace(/[^0-9.\-]/g, '')) || 0);
    if (isNaN(m) || isNaN(s) || !t) continue;
    const key = `${d.item_code}|${d.inspect_item}|${s}|${t}`;
    (groups[key] ??= { item_code: d.item_code, inspect_item: d.inspect_item, spec: s, tol: t, vals: [] }).vals.push(m);
  }
  const cpkRows = Object.values(groups).filter(g => g.vals.length >= 5).map(g => {
    const n = g.vals.length;
    const mean = g.vals.reduce((a, b) => a + b, 0) / n;
    const sigma = Math.sqrt(g.vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) || 0;
    const usl = g.spec + g.tol, lsl = g.spec - g.tol;
    const cpk = sigma ? Math.min(usl - mean, mean - lsl) / (3 * sigma) : 0;
    return { ...g, n, mean, sigma, usl, lsl, cpk };
  }).sort((a, b) => a.cpk - b.cpk);
  cpkSlot.innerHTML = cpkRows.length ? `<table class="grid"><thead><tr>
      <th>품목</th><th>검사항목</th><th class="num">시료수</th><th class="num">규격(LSL~USL)</th><th class="num">평균</th><th class="num">표준편차</th><th class="num">Cpk</th><th class="center">평가</th>
    </tr></thead><tbody>${cpkRows.map(g => {
      const tone = g.cpk >= 1.67 ? 'success' : g.cpk >= 1.33 ? 'success' : g.cpk >= 1.0 ? 'warning' : 'danger';
      const label = g.cpk >= 1.67 ? '매우우수' : g.cpk >= 1.33 ? '양호' : g.cpk >= 1.0 ? '보통(개선권고)' : '불충분';
      return `<tr>
        <td class="cell-code">${escapeHtml(g.item_code || '')}</td><td class="cell-strong">${escapeHtml(g.inspect_item || '')}</td>
        <td class="num mono">${g.n}</td><td class="num mono">${g.lsl} ~ ${g.usl}</td>
        <td class="num mono">${g.mean.toFixed(3)}</td><td class="num mono">${g.sigma.toFixed(4)}</td>
        <td class="num mono" style="font-weight:800">${g.cpk.toFixed(2)}</td>
        <td class="center">${badge(label, tone)}</td></tr>`;
    }).join('')}</tbody></table>`
    : `<div class="empty" style="padding:40px">${icon('target', 44)}<h4>Cpk 산출 가능한 데이터가 부족합니다</h4><p>검사(수입/공정/출하)에서 정량 측정값이 5건 이상 축적되면 자동 산출됩니다.</p></div>`;
}

// =====================================================================
// LOT 추적 — 작업지시(LOT No.) 기반 정·역방향 제조이력 타임라인
// =====================================================================
export async function lotTrace(root) {
  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>LOT 추적</h1><p>LOT No.(또는 작업지시번호)로 원소재 투입 → 공정 → 검사 → 출하 전 구간을 추적합니다.</p></div>
    </div>
    <div class="card" style="margin-bottom:18px"><div class="card__body">
      <div class="toolbar" style="border:0;padding:0">
        <div class="search-box grow">${icon('search', 16)}<input id="lt-input" placeholder="LOT No. 또는 작업지시번호 입력 (예: LOT-WO-2607-001 / WO-2607-001)" autocomplete="off"/></div>
        <button class="btn btn--primary" id="lt-go">${icon('search', 16)} 추적</button>
      </div>
      <div id="lt-recent" style="margin-top:12px"></div>
    </div></div>
    <div id="lt-result"></div>`;

  const input = root.querySelector('#lt-input');
  root.querySelector('#lt-go').onclick = () => trace(input.value.trim());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') trace(input.value.trim()); });

  // 최근 작업지시 빠른 선택
  try {
    const wos = await db.all('work_orders', { sort: 'wo_date', sortDir: 'desc' });
    root.querySelector('#lt-recent').innerHTML = `<div class="chips">${wos.slice(0, 8).map(w =>
      `<button class="chip" data-lot="${escapeHtml(w.lot_no || w.wo_no)}">${escapeHtml(w.lot_no || w.wo_no)} · ${escapeHtml(w.item_name || '')}</button>`).join('')}</div>`;
    root.querySelectorAll('[data-lot]').forEach(b => b.onclick = () => { input.value = b.dataset.lot; trace(b.dataset.lot); });
  } catch { /* noop */ }

  async function trace(q) {
    const slot = root.querySelector('#lt-result');
    if (!q) { slot.innerHTML = ''; return; }
    slot.innerHTML = `<div class="spinner"></div>`;
    const [wos, plans, orders, wops, outs, results, procInsp, shipInsp, dels, ncrs] = await Promise.all([
      db.all('work_orders', {}).catch(() => []), db.all('production_plans', {}).catch(() => []),
      db.all('sales_orders', {}).catch(() => []), db.all('work_order_processes', {}).catch(() => []),
      db.all('material_outbounds', {}).catch(() => []), db.all('production_results', {}).catch(() => []),
      db.all('process_inspections', {}).catch(() => []), db.all('shipping_inspections', {}).catch(() => []),
      db.all('deliveries', {}).catch(() => []), db.all('nonconformances', {}).catch(() => []),
    ]);
    const qq = q.toUpperCase();
    const wo = wos.find(w => String(w.lot_no || '').toUpperCase() === qq || String(w.wo_no || '').toUpperCase() === qq);
    if (!wo) { slot.innerHTML = `<div class="empty" style="padding:60px">${icon('alert', 48)}<h4>해당 LOT/작업지시를 찾을 수 없습니다</h4><p>"${escapeHtml(q)}" 로 등록된 작업지시가 없습니다.</p></div>`; return; }

    const lot = wo.lot_no || wo.wo_no;
    const plan = plans.find(p => p.plan_no === wo.plan_no);
    const order = plan ? orders.find(o => o.order_no === plan.order_no) : null;
    const myWops = wops.filter(x => x.wo_no === wo.wo_no).sort((a, b) => (a.seq || 0) - (b.seq || 0));
    const myOuts = outs.filter(x => x.wo_no === wo.wo_no);
    const myResults = results.filter(x => x.wo_no === wo.wo_no);
    const myProcInsp = procInsp.filter(x => x.wo_no === wo.wo_no);
    const myShipInsp = order ? shipInsp.filter(x => x.order_no === order.order_no) : [];
    const myDels = order ? dels.filter(x => x.order_no === order.order_no) : [];
    const myNcrs = ncrs.filter(x => String(x.lot_no || '').toUpperCase() === String(lot).toUpperCase() || myResults.some(r => r.result_no && x.remark === r.result_no));

    const steps = [];
    if (order) steps.push({ ic: 'cart', tint: 'brand', title: `수주 ${order.order_no}`, date: order.order_date, desc: `${order.partner || ''} · ${order.item_name || ''} ${num(order.order_qty)}EA · 납기 ${fmtDate(order.due_date)}`, badge: badge(order.status || '') });
    if (plan) steps.push({ ic: 'calendar', tint: 'violet', title: `생산계획 ${plan.plan_no}`, date: plan.plan_date, desc: `계획수량 ${num(plan.plan_qty)}EA · 기간 ${fmtDate(plan.start_date)} ~ ${fmtDate(plan.end_date)}`, badge: badge(plan.status || '') });
    steps.push({ ic: 'clipboard', tint: 'brand', title: `작업지시 ${wo.wo_no} (LOT: ${lot})`, date: wo.wo_date, desc: `${wo.item_name || ''} ${num(wo.order_qty)}EA · 계획기간 ${fmtDate(wo.start_date)} ~ ${fmtDate(wo.due_date)}`, badge: badge(wo.status || '') });
    for (const o of myOuts) steps.push({ ic: 'box', tint: 'amber', title: `자재투입 ${o.outbound_no}`, date: o.outbound_date, desc: `${o.item_name || ''} ${num(o.outbound_qty)}${o.unit || 'EA'} · ${o.purpose || ''}${o.lot_no ? ` · 자재LOT ${o.lot_no}` : ''}`, badge: null });
    for (const p of myWops) steps.push({ ic: 'factory', tint: p.status === '완료' ? 'green' : 'amber', title: `공정 ${p.seq ?? ''}. ${p.process_name || p.process_code || ''} (${p.in_out || '사내'})`, date: (p.end_at || p.start_at || '').slice(0, 10), desc: `설비 ${p.equipment || '-'} · 작업자 ${p.worker || '-'} · 양품 ${num(p.good_qty)} / 불량 ${num(p.defect_qty)}${p.is_rework ? ' · 재작업' : ''}`, badge: badge(p.status || '') });
    for (const r of myResults) steps.push({ ic: 'activity', tint: 'green', title: `생산실적 ${r.result_no}`, date: r.result_date, desc: `${r.process || ''} · 생산 ${num((+r.prod_qty || 0) || (+r.good_qty || 0) + (+r.defect_qty || 0))} · 양품 ${num(r.good_qty)} / 불량 ${num(r.defect_qty)}`, badge: r.rework_yn ? badge('재작업', 'warning') : null });
    for (const i of myProcInsp) steps.push({ ic: 'shield', tint: i.result === '합격' ? 'green' : 'red', title: `공정검사 ${i.inspect_no}`, date: i.inspect_date, desc: `${i.process || ''} · 검사 ${num(i.inspect_qty)} · 양품 ${num(i.good_qty)} / 불량 ${num(i.defect_qty)} · ${i.inspector || ''}`, badge: badge(i.result || '') });
    for (const n of myNcrs) steps.push({ ic: 'alert', tint: 'red', title: `부적합 ${n.ncr_no}`, date: n.occur_date, desc: `${n.defect_type || ''} ${num(n.defect_qty)}EA · ${n.cause || ''} · 조치: ${n.action_type || ''}`, badge: badge(n.status || '', 'danger') });
    for (const i of myShipInsp) steps.push({ ic: 'shield', tint: i.result === '합격' ? 'green' : 'red', title: `출하검사 ${i.inspect_no}`, date: i.inspect_date, desc: `검사 ${num(i.inspect_qty)} · 양품 ${num(i.good_qty)} · ${i.inspector || ''}`, badge: badge(i.result || '') });
    for (const d of myDels) steps.push({ ic: 'truck', tint: 'brand', title: `출하/납품 ${d.delivery_no}`, date: d.delivery_date, desc: `${d.partner || ''} · ${num(d.delivery_qty)}EA`, badge: badge(d.status || '', 'success') });

    slot.innerHTML = `<div class="card"><div class="card__head">${icon('route', 18)}<h3>LOT ${escapeHtml(lot)} 제조이력 타임라인</h3>
        <span class="muted" style="margin-left:8px">${escapeHtml(wo.item_name || '')} · 총 ${steps.length}개 이벤트</span></div>
      <div class="card__body"><div class="flex-col" style="gap:0">
      ${steps.map((s, i) => `
        <div style="display:flex;gap:14px">
          <div style="display:flex;flex-direction:column;align-items:center">
            <span class="stat__ico ico-tint-${s.tint}" style="width:38px;height:38px;flex-shrink:0">${icon(s.ic, 18)}</span>
            ${i < steps.length - 1 ? `<div style="width:2px;flex:1;background:var(--border);min-height:18px"></div>` : ''}
          </div>
          <div style="padding-bottom:20px;flex:1">
            <div class="flex between"><b>${escapeHtml(s.title)}</b><span class="muted mono">${fmtDate(s.date) || ''}</span></div>
            <div class="muted" style="margin-top:3px">${escapeHtml(s.desc)} ${s.badge || ''}</div>
          </div>
        </div>`).join('')}
      </div></div></div>`;
  }
}
