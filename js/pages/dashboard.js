// 종합 대시보드
import { db } from '../lib/db.js';
import { num, won, fmtDate, todayStr, escapeHtml } from '../lib/format.js';
import { badge } from '../ui/components.js';
import { icon } from '../ui/icons.js';

export async function dashboard(root) {
  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>대시보드</h1><p>오늘의 생산·영업·품질 현황을 한눈에 확인하세요.</p></div>
      <div class="page-head__actions"><span class="muted">${new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</span></div>
    </div>
    <div id="dash-stats"><div class="stat-grid">${Array(4).fill('<div class="stat skeleton" style="height:118px;border:0"></div>').join('')}</div></div>
    <div class="grid-2" style="margin-bottom:18px">
      <div class="card"><div class="card__head">${icon('cart', 18)}<h3>최근 수주현황</h3><div class="spacer"></div><a class="btn btn--sm" href="#/sales/orders">전체보기</a></div><div class="card__body" id="dash-orders"></div></div>
      <div class="card"><div class="card__head">${icon('factory', 18)}<h3>작업지시 진행</h3><div class="spacer"></div><a class="btn btn--sm" href="#/production/board">현황판</a></div><div class="card__body" id="dash-wo"></div></div>
    </div>
    <div class="grid-3">
      <div class="card"><div class="card__head">${icon('shield', 18)}<h3>품질 요약</h3></div><div class="card__body" id="dash-qa"></div></div>
      <div class="card"><div class="card__head">${icon('box', 18)}<h3>재고 부족 알림</h3></div><div class="card__body" id="dash-stock"></div></div>
      <div class="card"><div class="card__head">${icon('cpu', 18)}<h3>설비 가동현황</h3></div><div class="card__body" id="dash-equip"></div></div>
    </div>
    <div class="grid-2" style="margin-top:18px">
      <div class="card"><div class="card__head">${icon('trendUp', 18)}<h3>SQ 핵심지표</h3><div class="spacer"></div><a class="btn btn--sm" href="#/sq/report">SQ 리포트</a></div><div class="card__body" id="dash-sq"></div></div>
      <div class="card"><div class="card__head">${icon('clock', 18)}<h3>납기 임박 · 지연 수주</h3><div class="spacer"></div><a class="btn btn--sm" href="#/sales/order-status">수주현황</a></div><div class="card__body" id="dash-due"></div></div>
    </div>`;

  const [orders, wos, results, incoming, shipping, ncr, mstock, equips] = await Promise.all([
    db.all('sales_orders', {}), db.all('work_orders', {}), db.all('production_results', {}),
    db.all('incoming_inspections', {}), db.all('shipping_inspections', {}), db.all('nonconformances', {}),
    db.all('material_stocks', {}), db.all('equipments', {}),
  ]);

  // KPI
  const today = todayStr();
  const todayRes = results.filter(r => String(r.result_date).slice(0, 10) === today);
  const todayGood = todayRes.reduce((s, r) => s + (+r.good_qty || 0), 0);
  const todayDefect = todayRes.reduce((s, r) => s + (+r.defect_qty || 0), 0);
  const orderAmount = orders.reduce((s, r) => s + (+r.amount || 0), 0);
  const activeWo = wos.filter(w => w.status === '작업중').length;
  const allQa = [...incoming, ...shipping];
  const qaPass = allQa.filter(r => r.result === '합격').length;
  const qaRate = allQa.length ? ((qaPass / allQa.length) * 100).toFixed(1) : '0.0';

  root.querySelector('#dash-stats').innerHTML = `<div class="stat-grid">
    ${kpi('금일 생산량', num(todayGood + todayDefect), 'EA', 'factory', 'brand', `양품 ${num(todayGood)} · 불량 ${num(todayDefect)}`)}
    ${kpi('진행중 작업지시', num(activeWo), '건', 'activity', 'amber', `전체 작업지시 ${num(wos.length)}건`)}
    ${kpi('누적 수주금액', won(orderAmount), '', 'dollar', 'green', `수주 ${num(orders.length)}건`)}
    ${kpi('품질 합격률', qaRate, '%', 'shield', 'violet', `검사 ${num(allQa.length)}건 · 부적합 ${num(ncr.length)}건`)}
  </div>`;

  // 최근 수주
  const recentOrders = [...orders].sort((a, b) => String(b.order_date).localeCompare(String(a.order_date))).slice(0, 5);
  root.querySelector('#dash-orders').innerHTML = recentOrders.length ? `<div class="table-wrap"><table class="grid">
    <thead><tr><th>수주번호</th><th>거래처</th><th>품명</th><th class="num">수량</th><th class="center">상태</th></tr></thead>
    <tbody>${recentOrders.map(o => `<tr><td class="cell-code">${escapeHtml(o.order_no)}</td><td>${escapeHtml(o.partner || '')}</td><td class="cell-strong">${escapeHtml(o.item_name || '')}</td><td class="num mono">${num(o.order_qty)}</td><td class="center">${badge(o.status)}</td></tr>`).join('')}</tbody>
  </table></div>` : empty('수주 내역이 없습니다');

  // 작업지시 진행 (상태 분포 바)
  const woStatus = ['대기', '작업중', '완료', '중단'];
  const woTones = { '대기': 'neutral', '작업중': 'warning', '완료': 'success', '중단': 'danger' };
  root.querySelector('#dash-wo').innerHTML = wos.length ? `<div class="flex-col">
    ${woStatus.map(s => {
      const c = wos.filter(w => w.status === s).length;
      const pct = wos.length ? Math.round(c / wos.length * 100) : 0;
      return `<div><div class="flex between" style="margin-bottom:5px">${badge(s, woTones[s])}<span class="mono muted">${c}건 (${pct}%)</span></div><div class="progress"><span style="width:${pct}%"></span></div></div>`;
    }).join('')}
  </div>` : empty('작업지시가 없습니다');

  // 품질 요약
  root.querySelector('#dash-qa').innerHTML = `<div class="flex-col">
    ${qaRow('수입검사', incoming)}
    ${qaRow('출하검사', shipping)}
    <div class="flex between" style="padding:10px 12px;background:var(--surface-2);border-radius:10px">
      <span>부적합 처리중</span><b>${badge(num(ncr.filter(n => n.status === '처리중').length) + '건', 'warning')}</b></div>
  </div>`;

  // 재고 부족
  const low = mstock.filter(r => (+r.stock_qty || 0) < 30).sort((a, b) => (+a.stock_qty || 0) - (+b.stock_qty || 0)).slice(0, 6);
  root.querySelector('#dash-stock').innerHTML = low.length ? `<div class="flex-col">
    ${low.map(r => `<div class="flex between" style="padding:9px 12px;background:var(--surface-2);border-radius:10px">
      <div><b>${escapeHtml(r.item_name || r.item_code)}</b><div class="muted">${escapeHtml(r.item_code)}</div></div>
      ${badge(num(r.stock_qty) + ' EA', (+r.stock_qty || 0) <= 0 ? 'danger' : 'warning')}</div>`).join('')}
  </div>` : `<div class="flex-col"><div class="flex" style="color:var(--success);padding:10px">${icon('checkCircle', 18)} 재고 부족 품목이 없습니다.</div></div>`;

  // 설비
  const eTones = { '정상': 'success', '점검': 'warning', '고장': 'danger', '비가동': 'neutral' };
  root.querySelector('#dash-equip').innerHTML = equips.length ? `<div class="flex-col">
    ${['정상', '점검', '고장', '비가동'].map(s => {
      const c = equips.filter(e => e.status === s).length;
      return c ? `<div class="flex between" style="padding:9px 12px;background:var(--surface-2);border-radius:10px"><span>${escapeHtml(s)}</span>${badge(num(c) + '대', eTones[s])}</div>` : '';
    }).join('')}
  </div>` : empty('설비 정보가 없습니다');

  // 납기 임박·지연 수주 (미완료 수주를 납기 순으로)
  (async () => {
    const el = root.querySelector('#dash-due'); if (!el) return;
    const openOrders = orders
      .filter(o => !['완료', '취소'].includes(o.status) && o.due_date)
      .map(o => ({ ...o, due: String(o.due_date).slice(0, 10) }))
      .sort((a, b) => a.due.localeCompare(b.due))
      .slice(0, 6);
    const dday = (due) => Math.round((new Date(due) - new Date(today)) / 86400000);
    el.innerHTML = openOrders.length ? `<div class="flex-col">
      ${openOrders.map(o => {
        const dd = dday(o.due);
        const tone = dd < 0 ? 'danger' : dd <= 3 ? 'warning' : 'neutral';
        const label = dd < 0 ? `지연 ${-dd}일` : dd === 0 ? '오늘' : `D-${dd}`;
        return `<div class="flex between" style="padding:9px 12px;background:var(--surface-2);border-radius:10px">
          <div><b>${escapeHtml(o.item_name || o.item_code)}</b><div class="muted">${escapeHtml(o.partner || '')} · ${num(o.order_qty)}EA · 납기 ${fmtDate(o.due)}</div></div>
          ${badge(label, tone)}</div>`;
      }).join('')}
    </div>` : `<div class="flex-col"><div class="flex" style="color:var(--success);padding:10px">${icon('checkCircle', 18)} 진행중인 납기 건이 없습니다.</div></div>`;
  })();

  // SQ 핵심지표 (불량률 PPM · 시간당 생산량)
  (async () => {
    const el = root.querySelector('#dash-sq'); if (!el) return;
    try {
      const good = results.reduce((s, r) => s + (+r.good_qty || 0), 0);
      const defect = results.reduce((s, r) => s + (+r.defect_qty || 0), 0);
      const total = good + defect;
      const ppm = total ? Math.round(defect / total * 1000000) : 0;
      const time = results.reduce((s, r) => s + (+r.work_time || 0), 0);
      const uph = time ? Math.round(good / (time / 60)) : 0;
      el.innerHTML = `<div class="flex-col">
        <div class="flex between" style="padding:10px 12px;background:var(--surface-2);border-radius:10px">
          <span>공정 불량률</span><div class="flex"><b class="mono">${num(ppm)} PPM</b>${ppm <= 12000 ? badge('목표내', 'success') : badge('목표초과', 'danger')}</div></div>
        <div class="progress" style="height:10px"><span style="width:${Math.min(100, ppm / 20000 * 100)}%;background:${ppm <= 12000 ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)'}"></span></div>
        <div class="muted">목표: 12,000 PPM 이하 (2026.11 SQ 심사)</div>
        <div class="flex between" style="padding:10px 12px;background:var(--surface-2);border-radius:10px;margin-top:6px">
          <span>시간당 생산량</span><div class="flex"><b class="mono">${num(uph)} EA/h</b>${uph >= 170 ? badge('목표달성', 'success') : badge('목표 170', 'warning')}</div></div>
        <div class="progress" style="height:10px"><span style="width:${Math.min(100, uph / 170 * 100)}%"></span></div>
        <div class="muted">목표: 170 EA (현재 기준 140 EA → 향상)</div>
      </div>`;
    } catch { el.innerHTML = empty('SQ 지표 데이터 없음'); }
  })();
}

function kpi(label, value, unit, ic, tint, sub) {
  return `<div class="stat"><div class="stat__top"><span class="stat__label">${label}</span><span class="stat__ico ico-tint-${tint}">${icon(ic, 21)}</span></div>
    <div class="stat__value">${value}${unit ? `<small>${unit}</small>` : ''}</div>${sub ? `<div class="muted" style="margin-top:7px">${sub}</div>` : ''}</div>`;
}
function qaRow(label, list) {
  const pass = list.filter(r => r.result === '합격').length;
  const rate = list.length ? Math.round(pass / list.length * 100) : 0;
  return `<div class="flex between" style="padding:10px 12px;background:var(--surface-2);border-radius:10px">
    <span>${label}</span><div class="flex"><span class="muted mono">${list.length}건</span>${badge(rate + '%', rate >= 98 ? 'success' : rate >= 90 ? 'warning' : 'danger')}</div></div>`;
}
function empty(msg) { return `<div class="empty" style="padding:30px">${icon('inbox', 40)}<h4>${msg}</h4></div>`; }
