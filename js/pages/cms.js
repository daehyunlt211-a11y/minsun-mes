// CMS 설비관리: 설비모니터링 / 수리이력 / 비가동사유·실적 / 설비점검
// PLC 게이트웨이가 equipment_logs 테이블에 3초 주기로 적재하면 모니터링에 자동 반영됩니다.
import { createCrudPage } from '../lib/crud.js';
import { db } from '../lib/db.js';
import { num, won, todayStr, fmtDate, escapeHtml } from '../lib/format.js';
import { badge } from '../ui/components.js';
import { icon } from '../ui/icons.js';

// 11-1 설비 수리/보전 이력
export const equipmentHistories = createCrudPage({
  table: 'equipment_histories', title: '설비 수리이력', subtitle: '고장수리·예방정비·부품교체 이력을 관리합니다.',
  searchFields: ['hist_no', 'equip_code', 'equip_name', 'content', 'worker'], searchPlaceholder: '이력번호·설비·내용 검색',
  defaultSort: { key: 'hist_date', dir: 'desc' },
  dateField: { key: 'hist_date', label: '일자' },
  filters: [{ key: 'hist_type', label: '구분', options: ['고장수리', '예방정비', '부품교체'] }],
  statusChips: { key: 'hist_type', options: ['고장수리', '예방정비', '부품교체'] },
  docNoField: { key: 'hist_no', prefix: 'EH' },
  stats: async (rows) => [
    { label: '총 이력', value: num(rows.length), unit: '건', icon: 'settings', tint: 'brand' },
    { label: '고장수리', value: num(rows.filter(r => r.hist_type === '고장수리').length), unit: '건', icon: 'alert', tint: 'red' },
    { label: '예방정비', value: num(rows.filter(r => r.hist_type === '예방정비').length), unit: '건', icon: 'shield', tint: 'green' },
    { label: '총 정지시간', value: num(rows.reduce((s, r) => s + (+r.downtime_min || 0), 0)), unit: '분', icon: 'clock', tint: 'amber' },
  ],
  columns: [
    { key: 'hist_no', label: '이력번호', cls: 'cell-code', sortable: true },
    { key: 'hist_date', label: '일자', type: 'date', sortable: true },
    { key: 'equip_code', label: '설비코드', cls: 'cell-code' },
    { key: 'equip_name', label: '설비명', cls: 'cell-strong' },
    { key: 'hist_type', label: '구분', type: 'badge' },
    { key: 'content', label: '내용' },
    { key: 'parts', label: '교체부품' },
    { key: 'cost', label: '비용', type: 'money' },
    { key: 'downtime_min', label: '정지(분)', type: 'num' },
    { key: 'worker', label: '담당자' },
  ],
  fields: [
    { key: 'hist_no', label: '이력번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'hist_date', label: '일자', type: 'date', required: true, default: todayStr() },
    { key: 'equip_code', label: '설비', required: true, ref: { table: 'equipments', value: 'code', label: (r) => `${r.code} · ${r.name}`, fill: { equip_name: 'name' } }, placeholder: '설비 선택' },
    { key: 'equip_name', label: '설비명(자동)', readonly: true },
    { key: 'hist_type', label: '구분', type: 'select', options: ['고장수리', '예방정비', '부품교체'], default: '고장수리' },
    { key: 'content', label: '내용', type: 'textarea', required: true },
    { key: 'parts', label: '교체부품' },
    { key: 'cost', label: '비용(원)', type: 'number', default: 0 },
    { key: 'downtime_min', label: '정지시간(분)', type: 'number', default: 0 },
    { key: 'worker', label: '담당자', ref: { table: 'users', value: 'name', label: (r) => `${r.name} (${r.department || ''})` }, placeholder: '담당자 선택' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 11-2 비가동사유 코드
export const downtimeCodes = createCrudPage({
  table: 'downtime_codes', title: '비가동사유 관리', subtitle: '설비 비가동 사유코드(계획/비계획)를 관리합니다.',
  searchFields: ['code', 'name'], searchPlaceholder: '사유코드·명 검색',
  defaultSort: { key: 'code', dir: 'asc' },
  filters: [{ key: 'category', label: '분류', options: ['계획', '비계획'] }],
  statusChips: { key: 'category', options: ['계획', '비계획'] },
  columns: [
    { key: 'code', label: '사유코드', cls: 'cell-code', sortable: true },
    { key: 'name', label: '사유명', cls: 'cell-strong' },
    { key: 'category', label: '분류', type: 'badge' },
    { key: 'use_yn', label: '사용', type: 'yesno', align: 'center' },
    { key: 'remark', label: '비고' },
  ],
  fields: [
    { key: 'code', label: '사유코드', required: true, placeholder: '예: DT-01' },
    { key: 'name', label: '사유명', required: true, placeholder: '예: 금형교체, 자재대기, 고장, 계획정지' },
    { key: 'category', label: '분류', type: 'select', options: ['계획', '비계획'], default: '비계획' },
    { key: 'use_yn', label: '사용여부', type: 'switch', default: true },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 11-3 비가동 실적
export const equipmentDowntimes = createCrudPage({
  table: 'equipment_downtimes', title: '비가동 실적', subtitle: '설비별 비가동 발생 내역과 시간을 관리합니다.',
  searchFields: ['dt_no', 'equip_code', 'equip_name', 'reason_name', 'worker'], searchPlaceholder: '번호·설비·사유 검색',
  defaultSort: { key: 'dt_date', dir: 'desc' },
  dateField: { key: 'dt_date', label: '발생일' },
  docNoField: { key: 'dt_no', prefix: 'DT' },
  stats: async (rows) => [
    { label: '총 비가동', value: num(rows.length), unit: '건', icon: 'clock', tint: 'brand' },
    { label: '총 비가동시간', value: num(rows.reduce((s, r) => s + (+r.minutes || 0), 0)), unit: '분', icon: 'alert', tint: 'red' },
    { label: '금일 비가동', value: num(rows.filter(r => String(r.dt_date).slice(0, 10) === todayStr()).length), unit: '건', icon: 'activity', tint: 'amber' },
    { label: '평균 시간', value: rows.length ? Math.round(rows.reduce((s, r) => s + (+r.minutes || 0), 0) / rows.length) : 0, unit: '분/건', icon: 'trendDown', tint: 'violet' },
  ],
  columns: [
    { key: 'dt_no', label: '번호', cls: 'cell-code', sortable: true },
    { key: 'dt_date', label: '발생일', type: 'date', sortable: true },
    { key: 'equip_code', label: '설비코드', cls: 'cell-code' },
    { key: 'equip_name', label: '설비명', cls: 'cell-strong' },
    { key: 'reason_name', label: '비가동사유' },
    { key: 'minutes', label: '시간(분)', type: 'num', sortable: true },
    { key: 'worker', label: '담당자' },
    { key: 'remark', label: '비고' },
  ],
  fields: [
    { key: 'dt_no', label: '번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'dt_date', label: '발생일', type: 'date', required: true, default: todayStr() },
    { key: 'equip_code', label: '설비', required: true, ref: { table: 'equipments', value: 'code', label: (r) => `${r.code} · ${r.name}`, fill: { equip_name: 'name' } }, placeholder: '설비 선택' },
    { key: 'equip_name', label: '설비명(자동)', readonly: true },
    { key: 'reason_code', label: '비가동사유', required: true, ref: { table: 'downtime_codes', value: 'code', label: (r) => `${r.code} · ${r.name} (${r.category || ''})`, fill: { reason_name: 'name' } }, placeholder: '사유 선택' },
    { key: 'reason_name', label: '사유명(자동)', readonly: true },
    { key: 'minutes', label: '비가동시간(분)', type: 'number', required: true, default: 0 },
    { key: 'worker', label: '담당자', ref: { table: 'users', value: 'name', label: (r) => `${r.name}` }, placeholder: '담당자 선택' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 11-4 설비점검
export const equipmentChecks = createCrudPage({
  table: 'equipment_checks', title: '설비점검', subtitle: '일상·주간·월간 설비점검 결과를 관리합니다.',
  searchFields: ['check_no', 'equip_code', 'equip_name', 'check_item', 'worker'], searchPlaceholder: '점검번호·설비·항목 검색',
  defaultSort: { key: 'check_date', dir: 'desc' },
  dateField: { key: 'check_date', label: '점검일' },
  filters: [
    { key: 'check_cycle', label: '주기', options: ['일상', '주간', '월간'] },
    { key: 'result', label: '결과', options: ['양호', '불량', '조치완료'] },
  ],
  statusChips: { key: 'result', options: ['양호', '불량', '조치완료'] },
  docNoField: { key: 'check_no', prefix: 'EC' },
  stats: async (rows) => [
    { label: '총 점검', value: num(rows.length), unit: '건', icon: 'checkCircle', tint: 'brand' },
    { label: '양호', value: num(rows.filter(r => r.result === '양호').length), unit: '건', icon: 'check', tint: 'green' },
    { label: '불량 발견', value: num(rows.filter(r => r.result === '불량').length), unit: '건', icon: 'alert', tint: 'red' },
    { label: '금일 점검', value: num(rows.filter(r => String(r.check_date).slice(0, 10) === todayStr()).length), unit: '건', icon: 'calendar', tint: 'violet' },
  ],
  columns: [
    { key: 'check_no', label: '점검번호', cls: 'cell-code', sortable: true },
    { key: 'check_date', label: '점검일', type: 'date', sortable: true },
    { key: 'equip_code', label: '설비코드', cls: 'cell-code' },
    { key: 'equip_name', label: '설비명', cls: 'cell-strong' },
    { key: 'check_cycle', label: '주기', type: 'badge', align: 'center' },
    { key: 'check_item', label: '점검항목' },
    { key: 'result', label: '결과', type: 'badge', align: 'center' },
    { key: 'worker', label: '점검자' },
    { key: 'remark', label: '비고' },
  ],
  fields: [
    { key: 'check_no', label: '점검번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'check_date', label: '점검일', type: 'date', required: true, default: todayStr() },
    { key: 'equip_code', label: '설비', required: true, ref: { table: 'equipments', value: 'code', label: (r) => `${r.code} · ${r.name}`, fill: { equip_name: 'name' } }, placeholder: '설비 선택' },
    { key: 'equip_name', label: '설비명(자동)', readonly: true },
    { key: 'check_cycle', label: '점검주기', type: 'select', options: ['일상', '주간', '월간'], default: '일상' },
    { key: 'check_item', label: '점검항목', required: true, placeholder: '예: 유압/절삭유/이상소음 점검' },
    { key: 'result', label: '결과', type: 'select', options: ['양호', '불량', '조치완료'], default: '양호' },
    { key: 'worker', label: '점검자', ref: { table: 'users', value: 'name', label: (r) => `${r.name}` }, placeholder: '점검자 선택' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// 11-5 설비 모니터링 (CMS) — 가동현황 + 비가동 집계 + 알람
export async function equipmentMonitor(root) {
  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>설비모니터링 (CMS)</h1><p>설비 가동상태·비가동·알람을 모니터링합니다. PLC 연계 설비는 수집로그(3초 주기)가 자동 반영됩니다.</p></div>
      <div class="page-head__actions"><button class="btn" id="em-refresh">${icon('refresh', 16)} 새로고침</button></div>
    </div>
    <div id="em-stats"><div class="spinner"></div></div>
    <div class="card" style="margin-bottom:18px"><div class="card__head">${icon('cpu', 18)}<h3>설비별 가동현황</h3></div><div class="card__body" id="em-grid"></div></div>
    <div class="grid-2">
      <div class="card"><div class="card__head">${icon('clock', 18)}<h3>비가동 사유별 집계 (최근 30일)</h3></div><div class="card__body" id="em-dt"></div></div>
      <div class="card"><div class="card__head">${icon('bell', 18)}<h3>최근 알람/수집 로그</h3></div><div class="card__body" id="em-log"></div></div>
    </div>`;

  root.querySelector('#em-refresh').onclick = () => equipmentMonitor(root);

  const monthAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); })();
  const [equips, downs, logs, results] = await Promise.all([
    db.all('equipments', { sort: 'code' }).catch(() => []),
    db.all('equipment_downtimes', { dateRange: { key: 'dt_date', from: monthAgo, to: todayStr() } }).catch(() => []),
    db.all('equipment_logs', { sort: 'log_time', sortDir: 'desc' }).catch(() => []),
    db.all('production_results', { dateRange: { key: 'result_date', from: todayStr(), to: todayStr() } }).catch(() => []),
  ]);

  const run = equips.filter(e => e.status === '정상').length;
  const down = equips.filter(e => ['고장', '비가동'].includes(e.status)).length;
  const dtMin = downs.reduce((s, r) => s + (+r.minutes || 0), 0);
  root.querySelector('#em-stats').innerHTML = `<div class="stat-grid">
    <div class="stat"><div class="stat__top"><span class="stat__label">전체 설비</span><span class="stat__ico ico-tint-brand">${icon('cpu', 21)}</span></div><div class="stat__value">${num(equips.length)}<small>대</small></div></div>
    <div class="stat"><div class="stat__top"><span class="stat__label">가동(정상)</span><span class="stat__ico ico-tint-green">${icon('activity', 21)}</span></div><div class="stat__value">${num(run)}<small>대</small></div></div>
    <div class="stat"><div class="stat__top"><span class="stat__label">고장/비가동</span><span class="stat__ico ico-tint-red">${icon('alert', 21)}</span></div><div class="stat__value">${num(down)}<small>대</small></div></div>
    <div class="stat"><div class="stat__top"><span class="stat__label">30일 비가동시간</span><span class="stat__ico ico-tint-amber">${icon('clock', 21)}</span></div><div class="stat__value">${num(dtMin)}<small>분</small></div></div>
  </div>`;

  // 설비별 카드 (최근 로그 + 금일 생산 카운트)
  const latestLog = {};
  for (const l of logs) if (!latestLog[l.equip_code]) latestLog[l.equip_code] = l;
  const todayProd = {};
  for (const r of results) { const k = r.equipment || r.machine_no; if (k) todayProd[k] = (todayProd[k] || 0) + ((+r.prod_qty || 0) || (+r.good_qty || 0) + (+r.defect_qty || 0)); }

  root.querySelector('#em-grid').innerHTML = equips.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px">
    ${equips.map(e => {
      const log = latestLog[e.code];
      const st = log ? log.run_status : e.status;
      const tone = st === '가동' || st === '정상' ? 'success' : st === '알람' || st === '고장' ? 'danger' : 'warning';
      const prod = todayProd[e.name] || todayProd[e.code] || (log ? +log.prod_count || 0 : 0);
      return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:14px;padding:14px 16px">
        <div class="flex between" style="margin-bottom:8px"><span class="cell-code">${escapeHtml(e.code)}</span>${badge(st === '정상' ? '가동' : st, tone)}</div>
        <div style="font-weight:700;margin-bottom:2px">${escapeHtml(e.name)}</div>
        <div class="muted" style="margin-bottom:8px">${escapeHtml(e.equip_type || '')} ${e.machine_no ? '· ' + escapeHtml(e.machine_no) : ''} ${e.plc_yn ? '· PLC' : ''}</div>
        <div class="flex between"><span class="muted">금일 생산</span><b class="mono">${num(prod)} EA</b></div>
        ${log ? `<div class="flex between"><span class="muted">최근 수집</span><span class="mono muted">${escapeHtml(String(log.log_time || '').slice(5, 16).replace('T', ' '))}</span></div>` : `<div class="muted" style="margin-top:4px">수집로그 없음 (수동 상태)</div>`}
      </div>`;
    }).join('')}</div>` : `<div class="empty">${icon('cpu', 48)}<h4>설비가 없습니다</h4><p>기준정보 &gt; 설비관리에서 설비를 등록하세요.</p></div>`;

  // 비가동 사유별 집계
  const byReason = {};
  for (const r of downs) { const k = r.reason_name || r.reason_code || '기타'; byReason[k] = (byReason[k] || 0) + (+r.minutes || 0); }
  const reasons = Object.entries(byReason).sort((a, b) => b[1] - a[1]);
  const maxMin = Math.max(...reasons.map(r => r[1]), 1);
  root.querySelector('#em-dt').innerHTML = reasons.length ? `<div class="flex-col" style="gap:10px">
    ${reasons.map(([name, min]) => `<div>
      <div class="flex between" style="margin-bottom:4px"><b>${escapeHtml(name)}</b><span class="mono">${num(min)}분</span></div>
      <div class="progress" style="height:10px"><span style="width:${Math.round(min / maxMin * 100)}%"></span></div>
    </div>`).join('')}</div>` : `<div class="empty">${icon('inbox', 44)}<h4>최근 30일 비가동 실적이 없습니다</h4></div>`;

  // 최근 로그
  const recent = logs.slice(0, 12);
  root.querySelector('#em-log').innerHTML = recent.length ? `<div class="table-wrap"><table class="grid">
    <thead><tr><th>시각</th><th>설비</th><th class="center">상태</th><th class="num">생산카운트</th><th>알람</th></tr></thead>
    <tbody>${recent.map(l => `<tr>
      <td class="mono">${escapeHtml(String(l.log_time || '').slice(5, 19).replace('T', ' '))}</td>
      <td class="cell-code">${escapeHtml(l.equip_code || '')}</td>
      <td class="center">${badge(l.run_status || '', l.run_status === '가동' ? 'success' : l.run_status === '알람' ? 'danger' : 'warning')}</td>
      <td class="num mono">${num(l.prod_count)}</td>
      <td>${escapeHtml(l.alarm_msg || l.alarm_code || '')}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="empty">${icon('radio', 44)}<h4>수집 로그가 없습니다</h4><p>PLC 게이트웨이가 equipment_logs 테이블에 적재하면 표시됩니다.</p></div>`;
}
