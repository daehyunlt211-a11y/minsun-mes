// =====================================================================
// 계측기관리 — 계측기 / 검교정 / 계측기현황 / Gauge R&R (관리대장·계획·평가등록·실시현황)
//   · 교정주기 입력 시 차기 교정일 자동계산, D-30/D-7/기한초과 표시
//   · 교정 부적합 시 사용중지 자동전환, 기한초과 계측기 검사 사용 제한
//   · R&R: 측정값 행렬 입력 → 반복성(EV)·재현성(AV)·%GRR·ndc 자동계산
// =====================================================================
import { createCrudPage } from '../lib/crud.js';
import { db } from '../lib/db.js';
import { num, won, fmtDate, todayStr, escapeHtml, nextDocNo, downloadCSV } from '../lib/format.js';
import { badge, toast, openModal, confirmDialog } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { barcodeSVG, printSheet } from '../lib/barcode.js';

const INST_STATUS = ['정상', '교정중', '수리중', '사용중지', '폐기'];
const CAL_TYPES = ['사내교정', '외부교정', '수리'];

function stat(label, value, unit, ic, tint) {
  return `<div class="stat"><div class="stat__top"><span class="stat__label">${escapeHtml(label)}</span><span class="stat__ico ico-tint-${tint}">${icon(ic, 21)}</span></div><div class="stat__value">${value}${unit ? `<small>${escapeHtml(unit)}</small>` : ''}</div></div>`;
}
function info(label, val) {
  return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:11px 13px"><div class="muted" style="font-size:11.5px">${escapeHtml(label)}</div><div style="font-weight:700;margin-top:2px">${escapeHtml(val ?? '')}</div></div>`;
}
export function ddayOf(d) {
  if (!d) return null;
  return Math.round((new Date(String(d).slice(0, 10)) - new Date(todayStr())) / 86400000);
}
function ddayBadge(d) {
  const dd = ddayOf(d);
  if (dd == null) return '<span class="muted">-</span>';
  if (dd < 0) return badge(`D+${-dd} 초과`, 'danger');
  if (dd <= 7) return badge(`D-${dd}`, 'danger');
  if (dd <= 30) return badge(`D-${dd}`, 'warning');
  return `<span class="mono muted">D-${dd}</span>`;
}
// 교정주기(개월) → 차기 교정일
function addMonths(dateStr, months) {
  if (!dateStr) return '';
  const d = new Date(String(dateStr).slice(0, 10));
  d.setMonth(d.getMonth() + (Number(months) || 0));
  return d.toISOString().slice(0, 10);
}

// =====================================================================
// 8-1 계측기 관리
// =====================================================================
export async function instruments(root) {
  const state = { search: '', fStatus: '__all__', selected: null };
  let rows = [], depts = [], users = [], cals = [], rrs = [];

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>계측기 관리</h1><p>계측기 등록·QR 발행·교정주기를 관리합니다. 교정주기 입력 시 <b>차기 교정일이 자동 계산</b>됩니다.</p></div>
      <div class="page-head__actions">
        <button class="btn" id="mi-qr">${icon('grid', 16)} QR 일괄출력</button>
        <button class="btn" id="mi-csv">${icon('download', 16)} 계측기대장</button>
        <button class="btn" id="mi-refresh">${icon('refresh', 16)} 새로고침</button>
        <button class="btn btn--primary" id="mi-add">${icon('plus', 16)} 계측기 등록</button>
      </div>
    </div>
    <div id="mi-stats"></div>
    <div style="display:grid;grid-template-columns:1fr 360px;gap:18px;align-items:start">
      <div class="card">
        <div class="toolbar">
          <div class="search-box grow">${icon('search', 16)}<input id="mi-search" placeholder="계측기코드·명·모델·시리얼 검색" autocomplete="off"/></div>
          <select class="select" id="mi-fstatus" style="width:auto;min-width:120px"><option value="__all__">전체 상태</option>${INST_STATUS.map(s => `<option value="${s}">${s}</option>`).join('')}</select>
        </div>
        <div class="table-wrap"><div id="mi-table"><div class="spinner"></div></div></div>
      </div>
      <div class="card" id="mi-detail"><div class="card__body"><div class="empty" style="padding:60px 16px">${icon('target', 48)}<h4>계측기를 선택하세요</h4></div></div></div>
    </div>`;

  root.querySelector('#mi-refresh').onclick = () => reload();
  root.querySelector('#mi-add').onclick = () => openForm(null);
  root.querySelector('#mi-csv').onclick = () => exportCsv();
  root.querySelector('#mi-qr').onclick = () => printQR(filtered());
  root.querySelector('#mi-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });
  root.querySelector('#mi-fstatus').addEventListener('change', (e) => { state.fStatus = e.target.value; renderTable(); });

  async function loadAll() {
    [rows, depts, users, cals, rrs] = await Promise.all([
      db.all('measuring_instruments', { sort: 'code' }).catch(() => []),
      db.all('departments', { sort: 'code' }).catch(() => []),
      db.all('users', { sort: 'name' }).catch(() => []),
      db.all('calibrations', {}).catch(() => []),
      db.all('gauge_rr', {}).catch(() => []),
    ]);
  }
  function filtered() {
    const q = state.search.toLowerCase();
    return rows.filter(r => {
      if (state.fStatus !== '__all__' && (r.status || '정상') !== state.fStatus) return false;
      if (q && ![r.code, r.name, r.model, r.serial_no, r.maker, r.location].some(v => String(v ?? '').toLowerCase().includes(q))) return false;
      return true;
    });
  }
  function renderStats() {
    const over = rows.filter(r => ddayOf(r.next_calib) != null && ddayOf(r.next_calib) < 0);
    const soon = rows.filter(r => { const d = ddayOf(r.next_calib); return d != null && d >= 0 && d <= 30; });
    root.querySelector('#mi-stats').innerHTML = `<div class="stat-grid">
      ${stat('총 계측기', num(rows.length), '대', 'target', 'brand')}
      ${stat('정상', num(rows.filter(r => (r.status || '정상') === '정상').length), '대', 'checkCircle', 'green')}
      ${stat('교정 임박(30일)', num(soon.length), '대', 'clock', 'amber')}
      ${stat('교정기한 초과', num(over.length), '대', 'alert', 'red')}</div>`;
  }
  function renderTable() {
    const list = filtered(); const slot = root.querySelector('#mi-table');
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:44px">${icon('inbox', 46)}<h4>계측기가 없습니다</h4></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th>계측기코드</th><th>계측기명</th><th>모델</th><th>시리얼</th><th>측정범위</th><th>분해능</th>
      <th class="center">주기(월)</th><th class="center">최근교정</th><th class="center">차기교정</th><th class="center">D-Day</th><th>사용부서</th><th class="center">상태</th><th class="center" style="width:110px">관리</th>
    </tr></thead><tbody>${list.map(r => `<tr class="clickable ${state.selected?.id === r.id ? 'is-selected' : ''}" data-id="${r.id}">
      <td class="cell-code">${escapeHtml(r.code)}</td><td class="cell-strong">${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.model || '')}</td><td class="muted">${escapeHtml(r.serial_no || '')}</td>
      <td>${escapeHtml(r.meas_range || '')}</td><td class="muted">${escapeHtml(r.resolution || '')}</td>
      <td class="center mono">${num(r.calib_cycle)}</td><td class="center">${fmtDate(r.last_calib) || '-'}</td>
      <td class="center">${fmtDate(r.next_calib) || '-'}</td><td class="center">${ddayBadge(r.next_calib)}</td>
      <td>${escapeHtml(r.dept || '')}</td><td class="center">${badge(r.status || '정상')}</td>
      <td class="center"><div class="row-actions">
        <button class="icon-btn" data-qr="${r.id}" title="QR 출력">${icon('grid', 15)}</button>
        <button class="icon-btn" data-copy="${r.id}" title="복사등록">${icon('layers', 15)}</button>
        <button class="icon-btn" data-edit="${r.id}" title="수정">${icon('edit', 15)}</button>
        <button class="icon-btn" data-del="${r.id}" title="삭제">${icon('trash', 15)}</button></div></td>
    </tr>`).join('')}</tbody></table>`;
    slot.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = (e) => { if (e.target.closest('button')) return; state.selected = list.find(x => x.id === tr.dataset.id); renderTable(); renderDetail(); });
    slot.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openForm(list.find(x => x.id === b.dataset.edit)));
    slot.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => openForm(list.find(x => x.id === b.dataset.copy), true));
    slot.querySelectorAll('[data-qr]').forEach(b => b.onclick = () => printQR(list.find(x => x.id === b.dataset.qr)));
    slot.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const r = list.find(x => x.id === b.dataset.del);
      if (!(await confirmDialog({ message: `계측기 [${r.code} ${r.name}]을(를) 삭제하시겠습니까?`, confirmText: '삭제' }))) return;
      try { await db.remove('measuring_instruments', r.id); toast('삭제되었습니다.'); state.selected = null; reload(); } catch (e) { toast(e.message || '삭제 실패', 'error'); }
    });
  }
  function renderDetail() {
    const r = state.selected; const slot = root.querySelector('#mi-detail');
    if (!r) { slot.innerHTML = `<div class="card__body"><div class="empty" style="padding:60px 16px">${icon('target', 48)}<h4>계측기를 선택하세요</h4></div></div>`; return; }
    const myCals = cals.filter(c => c.inst_code === r.code).sort((a, b) => String(b.cal_date).localeCompare(String(a.cal_date))).slice(0, 5);
    const myRR = rrs.filter(x => x.inst_code === r.code).sort((a, b) => String(b.eval_date).localeCompare(String(a.eval_date))).slice(0, 3);
    slot.innerHTML = `
      <div class="card__head"><div><span class="cell-code">${escapeHtml(r.code)}</span><h3 style="margin-top:4px">${escapeHtml(r.name)}</h3></div></div>
      <div class="card__body">
        ${r.photo_url ? `<img src="${escapeHtml(r.photo_url)}" alt="" style="width:100%;max-height:150px;object-fit:contain;border:1px solid var(--border);border-radius:10px;margin-bottom:12px;background:var(--surface-2)">` : ''}
        <div style="text-align:center;padding:10px;background:#fff;border-radius:10px;border:1px solid var(--border);margin-bottom:12px">${barcodeSVG(r.qr_code || r.code, { height: 40, narrow: 1.6 })}</div>
        <div class="flex-col" style="gap:8px">
          ${info('제조사 · 모델 · 시리얼', `${r.maker || '-'} · ${r.model || '-'} · ${r.serial_no || '-'}`)}
          ${info('측정범위 · 분해능 · 허용오차', `${r.meas_range || '-'} · ${r.resolution || '-'} · ${r.tolerance || '-'}`)}
          ${info('사용부서 · 관리자 · 보관위치', `${r.dept || '-'} · ${r.manager || '-'} · ${r.location || '-'}`)}
          ${info('교정주기 · 차기교정', `${num(r.calib_cycle)}개월 · ${fmtDate(r.next_calib) || '-'}`)}
          ${info('적용 검사항목', (r.apply_items || '').split(',').filter(Boolean).join(', ') || '-')}
        </div>
        <h4 style="margin:16px 0 8px;font-size:13px">검교정 이력 <span class="muted" style="font-weight:500">${myCals.length}건</span></h4>
        ${myCals.length ? `<div class="flex-col" style="gap:6px">${myCals.map(c => `<div class="flex between" style="padding:8px 11px;background:var(--surface-2);border-radius:9px;font-size:12.5px">
          <span>${fmtDate(c.cal_date)} · ${escapeHtml(c.cal_type || '')}</span>${badge(c.result || '')}</div>`).join('')}</div>` : `<div class="muted" style="font-size:12.5px">교정 이력이 없습니다.</div>`}
        <h4 style="margin:16px 0 8px;font-size:13px">Gauge R&R <span class="muted" style="font-weight:500">${myRR.length}건</span></h4>
        ${myRR.length ? `<div class="flex-col" style="gap:6px">${myRR.map(x => `<div class="flex between" style="padding:8px 11px;background:var(--surface-2);border-radius:9px;font-size:12.5px">
          <span>${fmtDate(x.eval_date)} · ${escapeHtml(x.inspect_item || x.characteristic || '')}</span>
          <span>${(+x.grr_percent || 0).toFixed(1)}% ${badge(x.judgment || '')}</span></div>`).join('')}</div>` : `<div class="muted" style="font-size:12.5px">R&R 평가 이력이 없습니다.</div>`}
        <div style="margin-top:14px"><button class="btn btn--sm" id="mi-qr1">${icon('grid', 14)} QR 출력</button></div>
      </div>`;
    slot.querySelector('#mi-qr1').onclick = () => printQR(r);
  }
  function printQR(insts) {
    const list = Array.isArray(insts) ? insts : [insts];
    printSheet('계측기 QR 라벨', `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">
      ${list.map(t => `<div style="border:2px solid #000;padding:10px;text-align:center">
        <div style="font-weight:700;font-size:13px;margin-bottom:3px">${t.name || ''}</div>
        <div style="font-family:monospace;font-size:11px;margin-bottom:5px">${t.code || ''}</div>
        ${barcodeSVG(t.qr_code || t.code || '', { height: 38, narrow: 1.6 })}
        <div style="font-size:10px;color:#444;margin-top:4px">${t.meas_range || ''} / 분해능 ${t.resolution || ''}</div>
        <div style="font-size:10px;color:#444">차기교정: ${(t.next_calib || '').slice(0, 10)}</div>
      </div>`).join('')}</div>`);
  }
  function openForm(r, isCopy = false) {
    const isEdit = !!r && !isCopy;
    const v = (k, d = '') => (r ? (r[k] ?? d) : d);
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field"><label>계측기코드 <span class="req">*</span></label><input class="input" name="code" value="${escapeHtml(isCopy ? '' : v('code'))}" placeholder="비워두면 자동채번 (MI-001)"></div>
      <div class="field"><label>계측기명 <span class="req">*</span></label><input class="input" name="name" value="${escapeHtml(isCopy ? v('name') + ' (복사)' : v('name'))}"></div>
      <div class="field"><label>계측기 구분</label><input class="input" name="inst_type" value="${escapeHtml(v('inst_type'))}" placeholder="예: 길이측정, 형상측정"></div>
      <div class="field"><label>제조사</label><input class="input" name="maker" value="${escapeHtml(v('maker'))}"></div>
      <div class="field"><label>모델</label><input class="input" name="model" value="${escapeHtml(v('model'))}"></div>
      <div class="field"><label>제조번호(시리얼)</label><input class="input" name="serial_no" value="${escapeHtml(isCopy ? '' : v('serial_no'))}"></div>
      <div class="field"><label>측정범위</label><input class="input" name="meas_range" value="${escapeHtml(v('meas_range'))}" placeholder="0-150mm"></div>
      <div class="field"><label>분해능</label><input class="input" name="resolution" value="${escapeHtml(v('resolution'))}" placeholder="0.01mm"></div>
      <div class="field"><label>허용오차</label><input class="input" name="tolerance" value="${escapeHtml(v('tolerance'))}" placeholder="±0.02mm"></div>
      <div class="field"><label>사용부서</label><select class="select" name="dept"><option value="">선택</option>
        ${depts.map(d => `<option value="${escapeHtml(d.name)}" ${v('dept') === d.name ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}</select></div>
      <div class="field"><label>관리자</label><select class="select" name="manager"><option value="">선택</option>
        ${users.map(u => `<option value="${escapeHtml(u.name)}" ${v('manager') === u.name ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select></div>
      <div class="field"><label>보관위치</label><input class="input" name="location" value="${escapeHtml(v('location'))}"></div>
      <div class="field"><label>교정주기(개월) <span class="req">*</span></label><input class="input" type="number" name="calib_cycle" value="${v('calib_cycle', 12)}"></div>
      <div class="field"><label>최근 교정일</label><input class="input" type="date" name="last_calib" value="${escapeHtml(String(v('last_calib', '')).slice(0, 10))}"></div>
      <div class="field"><label>차기 교정일 <span class="muted">(자동계산)</span></label><input class="input" type="date" name="next_calib" value="${escapeHtml(String(v('next_calib', '')).slice(0, 10))}"></div>
      <div class="field"><label>상태</label><select class="select" name="status">${INST_STATUS.map(s => `<option value="${s}" ${v('status', '정상') === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="field col-2"><label>적용 검사항목 <span class="muted">(콤마 구분)</span></label><input class="input" name="apply_items" value="${escapeHtml(v('apply_items'))}" placeholder="예: 내경 Ø25, 전장 120"></div>
      <div class="field"><label>사진 URL</label><input class="input" name="photo_url" value="${escapeHtml(v('photo_url'))}"></div>
      <div class="field"><label>성적서 URL</label><input class="input" name="cert_url" value="${escapeHtml(v('cert_url'))}"></div>
      <div class="field col-2"><label>비고</label><textarea class="textarea" name="remark">${escapeHtml(v('remark'))}</textarea></div>`;
    // 교정주기·최근교정일 → 차기교정일 자동계산
    const calc = () => {
      const last = body.querySelector('[name="last_calib"]').value;
      const cyc = body.querySelector('[name="calib_cycle"]').value;
      if (last && cyc) body.querySelector('[name="next_calib"]').value = addMonths(last, cyc);
    };
    body.querySelector('[name="last_calib"]').addEventListener('change', calc);
    body.querySelector('[name="calib_cycle"]').addEventListener('input', calc);
    openModal({
      title: `계측기 ${isEdit ? '수정' : isCopy ? '복사등록' : '등록'}`, body, wide: true,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 저장</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => { const el = body.querySelector(`[name="${n}"]`); return el ? el.value.trim() : ''; };
          if (!g('name')) { toast('계측기명을 입력하세요.', 'error'); return; }
          let code = g('code');
          if (!code) {
            const nums = rows.map(x => parseInt(String(x.code).replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
            code = 'MI-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
          }
          if (!isEdit && rows.some(x => x.code === code)) { toast('이미 존재하는 계측기코드입니다.', 'error'); return; }
          const payload = {
            code, name: g('name'), inst_type: g('inst_type'), maker: g('maker'), model: g('model'), serial_no: g('serial_no'),
            meas_range: g('meas_range'), resolution: g('resolution'), tolerance: g('tolerance'),
            dept: g('dept'), manager: g('manager'), location: g('location'),
            calib_cycle: Number(g('calib_cycle')) || 12, last_calib: g('last_calib') || null, next_calib: g('next_calib') || null,
            status: g('status'), apply_items: g('apply_items'), photo_url: g('photo_url'), cert_url: g('cert_url'),
            qr_code: code, remark: g('remark'), use_yn: !['폐기', '사용중지'].includes(g('status')),
          };
          try {
            if (isEdit) await db.update('measuring_instruments', r.id, payload); else await db.insert('measuring_instruments', payload);
            close(); toast('저장되었습니다.'); await reload();
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }
  function exportCsv() {
    downloadCSV(`계측기대장_${todayStr()}.csv`, [
      { label: '계측기코드', key: 'code' }, { label: '계측기명', key: 'name' }, { label: '구분', key: 'inst_type' },
      { label: '제조사', key: 'maker' }, { label: '모델', key: 'model' }, { label: '시리얼', key: 'serial_no' },
      { label: '측정범위', key: 'meas_range' }, { label: '분해능', key: 'resolution' }, { label: '허용오차', key: 'tolerance' },
      { label: '사용부서', key: 'dept' }, { label: '관리자', key: 'manager' }, { label: '보관위치', key: 'location' },
      { label: '교정주기(월)', key: 'calib_cycle' }, { label: '최근교정', key: 'last_calib', csv: r => fmtDate(r.last_calib) },
      { label: '차기교정', key: 'next_calib', csv: r => fmtDate(r.next_calib) }, { label: '상태', key: 'status' },
    ], filtered());
    toast('계측기대장을 내보냈습니다.');
  }
  async function reload() {
    try { await loadAll(); renderStats(); renderTable(); if (state.selected) { state.selected = rows.find(x => x.id === state.selected.id); renderDetail(); } }
    catch (e) { root.querySelector('#mi-table').innerHTML = `<div class="empty">${icon('alert', 46)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
  }
  reload();
}

// =====================================================================
// 8-2 검교정 관리
// =====================================================================
export async function calibrations(root) {
  const state = { search: '', chip: '교정대상', selected: new Set() };
  let insts = [], cals = [], users = [];

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>검교정 관리</h1><p>차기 교정일 기준으로 대상을 자동 조회합니다. 교정 완료 시 <b>차기 교정일이 자동 계산</b>되고, 부적합 시 <b>사용중지로 자동 전환</b>됩니다.</p></div>
      <div class="page-head__actions">
        <button class="btn btn--primary" id="cal-bulk" disabled>${icon('clipboard', 16)} 일괄 교정의뢰 <span id="cal-cnt"></span></button>
        <button class="btn" id="cal-refresh">${icon('refresh', 16)} 새로고침</button>
        <button class="btn" id="cal-add">${icon('plus', 16)} 교정 등록</button>
      </div>
    </div>
    <div id="cal-stats"></div>
    <div class="card" style="margin-bottom:16px">
      <div class="card__head">${icon('clock', 18)}<h3>교정 대상 계측기</h3><div class="spacer"></div>
        <div class="search-box" style="min-width:240px">${icon('search', 16)}<input id="cal-search" placeholder="계측기 검색" autocomplete="off"/></div></div>
      <div class="toolbar" style="border-top:0"><div class="chips" id="cal-chips"></div></div>
      <div class="table-wrap"><div id="cal-target"><div class="spinner"></div></div></div>
    </div>
    <div class="card">
      <div class="card__head">${icon('fileText', 18)}<h3>검교정 이력</h3></div>
      <div class="table-wrap"><div id="cal-table"></div></div>
    </div>`;

  root.querySelector('#cal-refresh').onclick = () => reload();
  root.querySelector('#cal-add').onclick = () => openForm(null);
  root.querySelector('#cal-bulk').onclick = () => openBulk();
  root.querySelector('#cal-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTargets(); });

  async function loadAll() {
    [insts, cals, users] = await Promise.all([
      db.all('measuring_instruments', { sort: 'code' }).catch(() => []),
      db.all('calibrations', {}).catch(() => []),
      db.all('users', { sort: 'name' }).catch(() => []),
    ]);
  }
  function targets() {
    const q = state.search.toLowerCase();
    let list = insts.filter(i => !['폐기'].includes(i.status));
    if (state.chip === '교정대상') list = list.filter(i => { const d = ddayOf(i.next_calib); return d != null && d <= 30; });
    else if (state.chip === 'D-30') list = list.filter(i => { const d = ddayOf(i.next_calib); return d != null && d >= 0 && d <= 30; });
    else if (state.chip === 'D-7') list = list.filter(i => { const d = ddayOf(i.next_calib); return d != null && d >= 0 && d <= 7; });
    else if (state.chip === '기한초과') list = list.filter(i => { const d = ddayOf(i.next_calib); return d != null && d < 0; });
    if (q) list = list.filter(i => [i.code, i.name, i.model, i.serial_no].some(v => String(v ?? '').toLowerCase().includes(q)));
    return list.sort((a, b) => (ddayOf(a.next_calib) ?? 9999) - (ddayOf(b.next_calib) ?? 9999));
  }
  function renderStats() {
    const over = insts.filter(i => { const d = ddayOf(i.next_calib); return d != null && d < 0; });
    const done = cals.filter(c => c.result === '합격').length;
    const rate = cals.length ? ((done / cals.length) * 100).toFixed(1) : '0.0';
    root.querySelector('#cal-stats').innerHTML = `<div class="stat-grid">
      ${stat('교정 이력', num(cals.length), '건', 'fileText', 'brand')}
      ${stat('교정 적합률', rate, '%', 'checkCircle', 'green')}
      ${stat('30일 내 교정대상', num(insts.filter(i => { const d = ddayOf(i.next_calib); return d != null && d >= 0 && d <= 30; }).length), '대', 'clock', 'amber')}
      ${stat('기한 초과', num(over.length), '대', 'alert', 'red')}</div>`;
  }
  function renderChips() {
    const wrap = root.querySelector('#cal-chips');
    const cnt = (f) => insts.filter(i => !['폐기'].includes(i.status)).filter(f).length;
    const opts = [['교정대상', cnt(i => { const d = ddayOf(i.next_calib); return d != null && d <= 30; })],
      ['D-30', cnt(i => { const d = ddayOf(i.next_calib); return d != null && d >= 0 && d <= 30; })],
      ['D-7', cnt(i => { const d = ddayOf(i.next_calib); return d != null && d >= 0 && d <= 7; })],
      ['기한초과', cnt(i => { const d = ddayOf(i.next_calib); return d != null && d < 0; })],
      ['전체', cnt(() => true)]];
    wrap.innerHTML = opts.map(([t, c]) => `<button class="chip ${state.chip === t ? 'active' : ''}" data-c="${t}">${t}<span class="chip__count">${c}</span></button>`).join('');
    wrap.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { state.chip = b.dataset.c; state.selected.clear(); renderChips(); renderTargets(); updateBulk(); });
  }
  function renderTargets() {
    const list = targets(); const slot = root.querySelector('#cal-target');
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:40px">${icon('checkCircle', 46)}<h4>교정 대상이 없습니다</h4></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th class="center" style="width:38px"><input type="checkbox" class="checkbox" id="cal-all"></th>
      <th>계측기</th><th>모델·시리얼</th><th class="center">최근 교정일</th><th class="center">차기 교정일</th><th class="center">D-Day</th>
      <th>사용부서</th><th class="center">상태</th><th class="center" style="width:110px">교정</th>
    </tr></thead><tbody>${list.map(i => `<tr>
      <td class="center"><input type="checkbox" class="checkbox" data-sel="${i.id}" ${state.selected.has(i.id) ? 'checked' : ''}></td>
      <td><span class="cell-code">${escapeHtml(i.code)}</span> <b>${escapeHtml(i.name)}</b></td>
      <td class="muted">${escapeHtml(i.model || '')} ${escapeHtml(i.serial_no || '')}</td>
      <td class="center">${fmtDate(i.last_calib) || '-'}</td><td class="center">${fmtDate(i.next_calib) || '-'}</td>
      <td class="center">${ddayBadge(i.next_calib)}</td><td>${escapeHtml(i.dept || '')}</td>
      <td class="center">${badge(i.status || '정상')}</td>
      <td class="center"><button class="btn btn--sm btn--primary" data-cal="${i.id}">${icon('check', 14)} 교정 등록</button></td>
    </tr>`).join('')}</tbody></table>`;
    const all = slot.querySelector('#cal-all');
    const boxes = [...slot.querySelectorAll('[data-sel]')];
    all.onchange = () => { boxes.forEach(b => { b.checked = all.checked; b.checked ? state.selected.add(b.dataset.sel) : state.selected.delete(b.dataset.sel); }); updateBulk(); };
    boxes.forEach(b => b.onchange = () => { b.checked ? state.selected.add(b.dataset.sel) : state.selected.delete(b.dataset.sel); updateBulk(); });
    slot.querySelectorAll('[data-cal]').forEach(b => b.onclick = () => openForm(null, insts.find(i => i.id === b.dataset.cal)));
  }
  function updateBulk() {
    const n = state.selected.size;
    root.querySelector('#cal-bulk').disabled = n === 0;
    root.querySelector('#cal-cnt').textContent = n ? `(${n})` : '';
  }
  function renderTable() {
    const slot = root.querySelector('#cal-table');
    const list = [...cals].sort((a, b) => String(b.cal_date).localeCompare(String(a.cal_date))).slice(0, 30);
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:40px">${icon('inbox', 46)}<h4>교정 이력이 없습니다</h4></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th>교정번호</th><th>교정일</th><th>계측기</th><th class="center">구분</th><th>교정기관</th><th class="center">결과</th>
      <th>성적서번호</th><th class="num">비용</th><th class="center">차기교정일</th><th>담당자</th><th class="center" style="width:88px">관리</th>
    </tr></thead><tbody>${list.map(c => `<tr>
      <td class="cell-code">${escapeHtml(c.cal_no)}</td><td>${fmtDate(c.cal_date)}</td>
      <td><span class="cell-code">${escapeHtml(c.inst_code || '')}</span> ${escapeHtml(c.inst_name || '')}</td>
      <td class="center">${badge(c.cal_type || '', 'brand')}</td><td>${escapeHtml(c.agency || '')}</td>
      <td class="center">${badge(c.result || '')}</td><td class="muted">${escapeHtml(c.cert_no || '')}</td>
      <td class="num mono">${c.cost ? won(c.cost) : '-'}</td><td class="center">${fmtDate(c.next_date) || '-'}</td>
      <td>${escapeHtml(c.worker || '')}</td>
      <td class="center"><div class="row-actions">
        ${c.cert_url ? `<a class="icon-btn" href="${escapeHtml(c.cert_url)}" target="_blank" rel="noopener" title="성적서">${icon('fileText', 15)}</a>` : ''}
        <button class="icon-btn" data-del="${c.id}" title="삭제">${icon('trash', 15)}</button></div></td>
    </tr>`).join('')}</tbody></table>`;
    slot.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const c = list.find(x => x.id === b.dataset.del);
      if (!(await confirmDialog({ message: `교정 [${c.cal_no}]을(를) 삭제하시겠습니까?`, confirmText: '삭제' }))) return;
      try { await db.remove('calibrations', c.id); toast('삭제되었습니다.'); reload(); } catch (e) { toast(e.message || '삭제 실패', 'error'); }
    });
  }
  function openBulk() {
    const sel = insts.filter(i => state.selected.has(i.id));
    if (!sel.length) return;
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field col-2"><label>대상 계측기 (${sel.length}대)</label>
        <div style="max-height:150px;overflow-y:auto;padding:10px 12px;background:var(--surface-2);border-radius:10px">
          ${sel.map(i => `<div style="font-size:12.5px;padding:2px 0">${escapeHtml(i.code)} · ${escapeHtml(i.name)} <span class="muted">(차기 ${fmtDate(i.next_calib) || '-'})</span></div>`).join('')}</div></div>
      <div class="field"><label>의뢰일</label><input class="input" type="date" name="cal_date" value="${todayStr()}"></div>
      <div class="field"><label>교정 구분</label><select class="select" name="cal_type">${CAL_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}</select></div>
      <div class="field col-2"><label>교정기관</label><input class="input" name="agency" placeholder="예: 한국계측기술원"></div>
      <div class="field col-2 muted" style="background:var(--surface-2);padding:10px 12px;border-radius:10px">의뢰 등록 시 계측기 상태가 <b>교정중</b>으로 변경됩니다. 교정 완료 후 결과를 입력하세요.</div>`;
    openModal({
      title: '일괄 교정의뢰', body, wide: true,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 의뢰 등록</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => body.querySelector(`[name="${n}"]`).value.trim();
          try {
            const used = cals.map(x => x.cal_no);
            for (const i of sel) {
              const cal_no = nextDocNo('CAL', used); used.push(cal_no);
              await db.insert('calibrations', {
                cal_no, cal_date: g('cal_date') || todayStr(), inst_code: i.code, inst_name: i.name,
                cal_type: g('cal_type'), agency: g('agency'), status: '의뢰', result: '',
              });
              await db.update('measuring_instruments', i.id, { status: '교정중' });
            }
            close(); toast(`${sel.length}대 교정의뢰가 등록되었습니다.`); state.selected.clear(); await reload();
          } catch (e) { toast(e.message || '실패', 'error'); }
        };
      },
    });
  }
  function openForm(r, preset) {
    const inst = preset || (r ? insts.find(i => i.code === r.inst_code) : null);
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field"><label>교정일 <span class="req">*</span></label><input class="input" type="date" name="cal_date" value="${todayStr()}"></div>
      <div class="field"><label>계측기 <span class="req">*</span></label><select class="select" name="inst_code"><option value="">선택</option>
        ${insts.map(i => `<option value="${escapeHtml(i.code)}" data-cyc="${i.calib_cycle || 12}" ${inst?.code === i.code ? 'selected' : ''}>${escapeHtml(i.code)} · ${escapeHtml(i.name)}</option>`).join('')}</select></div>
      <div class="field"><label>교정 구분</label><select class="select" name="cal_type">${CAL_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}</select></div>
      <div class="field"><label>교정기관</label><input class="input" name="agency"></div>
      <div class="field"><label>결과 <span class="req">*</span></label><select class="select" name="result">
        <option value="합격">합격 (적합)</option><option value="조정후합격">조정후합격</option><option value="불합격">불합격 (부적합)</option></select></div>
      <div class="field"><label>성적서번호</label><input class="input" name="cert_no"></div>
      <div class="field"><label>비용</label><input class="input" type="number" name="cost" value="0"></div>
      <div class="field"><label>차기 교정일 <span class="muted">(자동)</span></label><input class="input" type="date" name="next_date"></div>
      <div class="field col-2"><label>수리내용 (수리 시)</label><input class="input" name="repair_desc"></div>
      <div class="field"><label>담당자</label><select class="select" name="worker"><option value="">선택</option>
        ${users.map(u => `<option value="${escapeHtml(u.name)}">${escapeHtml(u.name)}</option>`).join('')}</select></div>
      <div class="field"><label>성적서 URL</label><input class="input" name="cert_url"></div>
      <div class="field col-2"><label>비고</label><textarea class="textarea" name="remark"></textarea></div>
      <div class="field col-2" id="cal-warn"></div>`;
    const calcNext = () => {
      const code = body.querySelector('[name="inst_code"]').value;
      const i = insts.find(x => x.code === code);
      const d = body.querySelector('[name="cal_date"]').value;
      if (i && d) body.querySelector('[name="next_date"]').value = addMonths(d, i.calib_cycle || 12);
    };
    body.querySelector('[name="inst_code"]').addEventListener('change', calcNext);
    body.querySelector('[name="cal_date"]').addEventListener('change', calcNext);
    body.querySelector('[name="result"]').addEventListener('change', (e) => {
      const w = body.querySelector('#cal-warn');
      w.innerHTML = e.target.value === '불합격'
        ? `<div class="flex" style="padding:10px 12px;background:var(--danger-bg);border-radius:10px;gap:8px">${icon('alert', 16)} 부적합 계측기는 <b>사용중지</b>로 자동 전환되며, 검사화면에서 선택할 수 없습니다.</div>` : '';
    });
    calcNext();
    openModal({
      title: '검교정 등록', body, wide: true,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 저장</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => { const el = body.querySelector(`[name="${n}"]`); return el ? el.value.trim() : ''; };
          const code = g('inst_code');
          if (!code) { toast('계측기를 선택하세요.', 'error'); return; }
          const i = insts.find(x => x.code === code);
          const result = g('result');
          try {
            const cal_no = nextDocNo('CAL', cals.map(x => x.cal_no));
            await db.insert('calibrations', {
              cal_no, cal_date: g('cal_date') || todayStr(), inst_code: code, inst_name: i.name,
              cal_type: g('cal_type'), agency: g('agency'), result, cert_no: g('cert_no'),
              cost: Number(g('cost')) || 0, next_date: g('next_date') || null, repair_desc: g('repair_desc'),
              worker: g('worker'), cert_url: g('cert_url'), remark: g('remark'), status: '완료',
            });
            // 계측기 마스터 갱신 (부적합 → 사용중지)
            await db.update('measuring_instruments', i.id, {
              last_calib: g('cal_date') || todayStr(), next_calib: g('next_date') || null,
              status: result === '불합격' ? '사용중지' : '정상',
              cert_url: g('cert_url') || i.cert_url,
            });
            close();
            toast(result === '불합격' ? '교정 등록 — 계측기가 사용중지로 전환되었습니다.' : '교정이 등록되었습니다.');
            await reload();
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }
  async function reload() {
    try { await loadAll(); renderStats(); renderChips(); renderTargets(); renderTable(); updateBulk(); }
    catch (e) { root.querySelector('#cal-target').innerHTML = `<div class="empty">${icon('alert', 46)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
  }
  reload();
}

// =====================================================================
// 8-3 계측기현황 (상태 요약 카드)
// =====================================================================
export async function instrumentStatus(root) {
  const state = { filter: '전체' };
  let insts = [], cals = [];

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>계측기현황</h1><p>상태별 요약 카드를 클릭하면 해당 계측기만 조회됩니다. 차기 교정일이 가까운 순서로 정렬됩니다.</p></div>
      <div class="page-head__actions">
        <button class="btn" id="is-csv">${icon('download', 16)} 계측기대장</button>
        <button class="btn" id="is-refresh">${icon('refresh', 16)} 새로고침</button>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px"><div class="card__body"><div class="statcards" id="is-cards"></div></div></div>
    <div class="card">
      <div class="card__head">${icon('target', 18)}<h3 id="is-title">전체 계측기</h3></div>
      <div class="table-wrap"><div id="is-table"><div class="spinner"></div></div></div>
    </div>
    <div id="is-detail"></div>`;
  root.querySelector('#is-refresh').onclick = () => reload();
  root.querySelector('#is-csv').onclick = () => exportCsv();

  async function loadAll() {
    [insts, cals] = await Promise.all([
      db.all('measuring_instruments', { sort: 'code' }).catch(() => []),
      db.all('calibrations', {}).catch(() => []),
    ]);
  }
  const groups = () => ({
    '정상': insts.filter(i => (i.status || '정상') === '정상' && !(ddayOf(i.next_calib) != null && ddayOf(i.next_calib) < 0)),
    '교정예정': insts.filter(i => { const d = ddayOf(i.next_calib); return d != null && d >= 0 && d <= 30 && (i.status || '정상') === '정상'; }),
    '기한초과': insts.filter(i => { const d = ddayOf(i.next_calib); return d != null && d < 0; }),
    '교정중': insts.filter(i => i.status === '교정중'),
    '수리중': insts.filter(i => i.status === '수리중'),
    '사용중지': insts.filter(i => i.status === '사용중지'),
    '폐기': insts.filter(i => i.status === '폐기'),
  });
  function renderCards() {
    const g = groups();
    const tones = { '정상': 'green', '교정예정': 'amber', '기한초과': 'red', '교정중': 'violet', '수리중': 'amber', '사용중지': 'brand', '폐기': 'brand' };
    root.querySelector('#is-cards').innerHTML = `
      <button class="statcard ${state.filter === '전체' ? 'active' : ''}" data-f="전체">
        <div class="statcard__label">전체</div><div class="statcard__value">${num(insts.length)}</div></button>
      ${Object.entries(g).map(([k, v]) => `<button class="statcard ${state.filter === k ? 'active' : ''}" data-f="${k}">
        <div class="statcard__label">${escapeHtml(k)}</div>
        <div class="statcard__value" style="color:${v.length && ['기한초과', '사용중지'].includes(k) ? 'var(--danger)' : v.length && k === '교정예정' ? 'var(--warning)' : ''}">${num(v.length)}</div></button>`).join('')}`;
    root.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { state.filter = b.dataset.f; renderCards(); renderTable(); });
  }
  function filtered() {
    if (state.filter === '전체') return [...insts].sort((a, b) => (ddayOf(a.next_calib) ?? 9999) - (ddayOf(b.next_calib) ?? 9999));
    return (groups()[state.filter] || []).sort((a, b) => (ddayOf(a.next_calib) ?? 9999) - (ddayOf(b.next_calib) ?? 9999));
  }
  function renderTable() {
    const list = filtered(); const slot = root.querySelector('#is-table');
    root.querySelector('#is-title').textContent = `${state.filter} 계측기 (${list.length}대)`;
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:44px">${icon('inbox', 46)}<h4>해당 계측기가 없습니다</h4></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th>계측기코드</th><th>계측기명</th><th>모델·시리얼</th><th>측정범위</th><th>보관위치</th><th>사용부서</th>
      <th class="center">최근교정</th><th class="center">차기교정</th><th class="center">D-Day</th><th class="center">상태</th>
    </tr></thead><tbody>${list.map(i => `<tr class="clickable" data-code="${escapeHtml(i.code)}">
      <td class="cell-code">${escapeHtml(i.code)}</td><td class="cell-strong">${escapeHtml(i.name)}</td>
      <td class="muted">${escapeHtml(i.model || '')} ${escapeHtml(i.serial_no || '')}</td>
      <td>${escapeHtml(i.meas_range || '')}</td><td>${escapeHtml(i.location || '')}</td><td>${escapeHtml(i.dept || '')}</td>
      <td class="center">${fmtDate(i.last_calib) || '-'}</td><td class="center">${fmtDate(i.next_calib) || '-'}</td>
      <td class="center">${ddayBadge(i.next_calib)}</td><td class="center">${badge(i.status || '정상')}</td>
    </tr>`).join('')}</tbody></table>`;
    slot.querySelectorAll('tr[data-code]').forEach(tr => tr.onclick = () => showHistory(tr.dataset.code));
  }
  function showHistory(code) {
    const i = insts.find(x => x.code === code);
    const my = cals.filter(c => c.inst_code === code).sort((a, b) => String(b.cal_date).localeCompare(String(a.cal_date)));
    root.querySelector('#is-detail').innerHTML = `<div class="card" style="margin-top:16px">
      <div class="card__head">${icon('fileText', 18)}<h3>${escapeHtml(i.code)} · ${escapeHtml(i.name)} — 검교정 이력</h3></div>
      <div class="table-wrap">${my.length ? `<table class="grid"><thead><tr><th>교정번호</th><th>교정일</th><th class="center">구분</th><th>교정기관</th><th class="center">결과</th><th>성적서</th><th class="num">비용</th><th class="center">차기교정일</th></tr></thead>
        <tbody>${my.map(c => `<tr><td class="cell-code">${escapeHtml(c.cal_no)}</td><td>${fmtDate(c.cal_date)}</td>
          <td class="center">${badge(c.cal_type || '', 'brand')}</td><td>${escapeHtml(c.agency || '')}</td>
          <td class="center">${badge(c.result || '')}</td><td class="muted">${escapeHtml(c.cert_no || '')}</td>
          <td class="num mono">${c.cost ? won(c.cost) : '-'}</td><td class="center">${fmtDate(c.next_date) || '-'}</td></tr>`).join('')}</tbody></table>`
        : `<div class="empty" style="padding:34px">${icon('inbox', 44)}<h4>교정 이력이 없습니다</h4></div>`}</div></div>`;
  }
  function exportCsv() {
    downloadCSV(`계측기현황_${todayStr()}.csv`, [
      { label: '계측기코드', key: 'code' }, { label: '계측기명', key: 'name' }, { label: '모델', key: 'model' },
      { label: '시리얼', key: 'serial_no' }, { label: '측정범위', key: 'meas_range' }, { label: '보관위치', key: 'location' },
      { label: '사용부서', key: 'dept' }, { label: '최근교정', key: 'last_calib', csv: r => fmtDate(r.last_calib) },
      { label: '차기교정', key: 'next_calib', csv: r => fmtDate(r.next_calib) },
      { label: 'D-Day', key: 'dday', csv: r => { const d = ddayOf(r.next_calib); return d == null ? '' : (d < 0 ? `초과 ${-d}일` : `D-${d}`); } },
      { label: '상태', key: 'status' },
    ], filtered());
    toast('CSV로 내보냈습니다.');
  }
  async function reload() {
    try { await loadAll(); renderCards(); renderTable(); }
    catch (e) { root.querySelector('#is-table').innerHTML = `<div class="empty">${icon('alert', 46)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
  }
  reload();
}

// =====================================================================
// 8-4 Gauge R&R 관리대장
// =====================================================================
export const grrRegisters = createCrudPage({
  table: 'grr_registers', title: 'Gauge R&R 관리대장', subtitle: '평가대상(품목·검사항목·계측기)과 평가조건(평가자·시료·반복)·판정기준을 정의합니다.',
  searchFields: ['reg_no', 'item_code', 'item_name', 'inspect_item', 'inst_code', 'inst_name'], searchPlaceholder: '대장번호·품목·검사항목·계측기 검색',
  defaultSort: { key: 'reg_no', dir: 'asc' },
  docNoField: { key: 'reg_no', prefix: 'RRM' },
  wideForm: true,
  stats: async (rows) => [
    { label: '관리대장', value: num(rows.length), unit: '건', icon: 'clipboard', tint: 'brand' },
    { label: '사용 중', value: num(rows.filter(r => r.use_yn !== false).length), unit: '건', icon: 'checkCircle', tint: 'green' },
    { label: '대상 계측기', value: num(new Set(rows.map(r => r.inst_code).filter(Boolean)).size), unit: '대', icon: 'target', tint: 'violet' },
    { label: '대상 품목', value: num(new Set(rows.map(r => r.item_code).filter(Boolean)).size), unit: '종', icon: 'box', tint: 'amber' },
  ],
  columns: [
    { key: 'reg_no', label: '대장번호', cls: 'cell-code', sortable: true },
    { key: 'item_code', label: '품목코드', cls: 'cell-code' },
    { key: 'item_name', label: '품명', cls: 'cell-strong' },
    { key: 'process', label: '공정' },
    { key: 'inspect_item', label: '검사항목' },
    { key: 'inst_code', label: '계측기', cls: 'cell-code' },
    { key: 'inst_name', label: '계측기명' },
    { key: 'appraisers', label: '평가자', type: 'num', align: 'center' },
    { key: 'parts', label: '시료', type: 'num', align: 'center' },
    { key: 'trials', label: '반복', type: 'num', align: 'center' },
    { key: 'cycle_months', label: '주기(월)', type: 'num', align: 'center' },
    { key: 'use_yn', label: '사용', type: 'yesno', align: 'center' },
  ],
  fields: [
    { key: 'reg_no', label: '대장번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'item_code', label: '평가대상 품목', required: true, ref: { table: 'items', value: 'code', label: (r) => `${r.code} · ${r.name}`, fill: { item_name: 'name' } }, placeholder: '품목 선택' },
    { key: 'item_name', label: '품명(자동)', readonly: true },
    { key: 'process', label: '공정', ref: { table: 'processes', value: 'name', label: (r) => `${r.code} · ${r.name}` }, placeholder: '공정 선택' },
    { key: 'inspect_item', label: '검사항목', required: true, placeholder: '예: 내경 Ø25' },
    { key: 'inst_code', label: '대상 계측기', required: true, ref: { table: 'measuring_instruments', value: 'code', label: (r) => `${r.code} · ${r.name}`, fill: { inst_name: 'name' } }, placeholder: '계측기 선택' },
    { key: 'inst_name', label: '계측기명(자동)', readonly: true },
    { key: 'appraisers', label: '평가자 수', type: 'number', default: 3 },
    { key: 'parts', label: '시료 수', type: 'number', default: 10 },
    { key: 'trials', label: '반복측정 횟수', type: 'number', default: 3 },
    { key: 'cycle_months', label: '평가주기(개월)', type: 'number', default: 12 },
    { key: 'eval_std', label: '평가기준', default: 'AIAG MSA 4th' },
    { key: 'judge_std', label: '판정기준', col2: true, default: '%GRR<10 적합, 10~30 조건부, >30 부적합' },
    { key: 'use_yn', label: '사용여부', type: 'switch', default: true },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// =====================================================================
// 8-5 Gauge R&R 평가계획
// =====================================================================
export async function grrPlans(root) {
  const state = { search: '', chip: '전체' };
  let rows = [], regs = [], users = [], results = [];

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>Gauge R&R 평가계획</h1><p>관리대장의 평가조건을 자동 호출해 평가 일정을 수립합니다. 평가주기 도래 대상을 자동 생성할 수 있습니다.</p></div>
      <div class="page-head__actions">
        <button class="btn" id="gp-auto">${icon('refresh', 16)} 주기 도래 대상 자동생성</button>
        <button class="btn" id="gp-refresh">${icon('refresh', 16)} 새로고침</button>
        <button class="btn btn--primary" id="gp-add">${icon('plus', 16)} 평가계획 등록</button>
      </div>
    </div>
    <div id="gp-stats"></div>
    <div class="card">
      <div class="toolbar"><div class="search-box grow">${icon('search', 16)}<input id="gp-search" placeholder="계획번호·품목·검사항목·계측기 검색" autocomplete="off"/></div></div>
      <div class="toolbar" style="border-top:0;padding-top:12px"><div class="chips" id="gp-chips"></div></div>
      <div class="table-wrap"><div id="gp-table"><div class="spinner"></div></div></div>
    </div>`;
  root.querySelector('#gp-refresh').onclick = () => reload();
  root.querySelector('#gp-add').onclick = () => openForm(null);
  root.querySelector('#gp-auto').onclick = () => autoGenerate();
  root.querySelector('#gp-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });

  async function loadAll() {
    [rows, regs, users, results] = await Promise.all([
      db.all('grr_plans', {}).catch(() => []),
      db.all('grr_registers', {}).catch(() => []),
      db.all('users', { sort: 'name' }).catch(() => []),
      db.all('gauge_rr', {}).catch(() => []),
    ]);
    // 실시 여부에 따라 상태 보정
    rows = rows.map(p => ({ ...p, _done: results.some(r => r.plan_no === p.plan_no) }));
  }
  function scoped() {
    const q = state.search.toLowerCase();
    return rows.filter(r => {
      const st = r._done ? '완료' : (ddayOf(r.plan_date) != null && ddayOf(r.plan_date) < 0 ? '지연' : (r.status || '계획'));
      if (state.chip !== '전체' && st !== state.chip) return false;
      if (q && ![r.plan_no, r.reg_no, r.item_code, r.inspect_item, r.inst_code, r.owner].some(v => String(v ?? '').toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => String(a.plan_date).localeCompare(String(b.plan_date)));
  }
  function renderStats() {
    const done = rows.filter(r => r._done).length;
    const late = rows.filter(r => !r._done && ddayOf(r.plan_date) != null && ddayOf(r.plan_date) < 0).length;
    root.querySelector('#gp-stats').innerHTML = `<div class="stat-grid">
      ${stat('총 평가계획', num(rows.length), '건', 'calendar', 'brand')}
      ${stat('실시 완료', num(done), '건', 'checkCircle', 'green')}
      ${stat('미실시', num(rows.length - done), '건', 'clock', 'amber')}
      ${stat('기한 초과', num(late), '건', 'alert', 'red')}</div>`;
  }
  function renderChips() {
    const wrap = root.querySelector('#gp-chips');
    const st = (r) => r._done ? '완료' : (ddayOf(r.plan_date) != null && ddayOf(r.plan_date) < 0 ? '지연' : (r.status || '계획'));
    const opts = [['전체', rows.length], ...['계획', '진행', '완료', '지연'].map(s => [s, rows.filter(r => st(r) === s).length])];
    wrap.innerHTML = opts.map(([t, c]) => `<button class="chip ${state.chip === t ? 'active' : ''}" data-c="${t}">${t}<span class="chip__count">${c}</span></button>`).join('');
    wrap.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { state.chip = b.dataset.c; renderChips(); renderTable(); });
  }
  function renderTable() {
    const list = scoped(); const slot = root.querySelector('#gp-table');
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:44px">${icon('inbox', 46)}<h4>평가계획이 없습니다</h4></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th>계획번호</th><th>대장번호</th><th>품목</th><th>검사항목</th><th>계측기</th><th class="center">평가예정일</th><th class="center">D-Day</th>
      <th>평가자</th><th class="center">시료/반복</th><th>담당자</th><th class="center">상태</th><th class="center" style="width:130px">관리</th>
    </tr></thead><tbody>${list.map(r => {
      const st = r._done ? '완료' : (ddayOf(r.plan_date) != null && ddayOf(r.plan_date) < 0 ? '지연' : (r.status || '계획'));
      return `<tr>
        <td class="cell-code">${escapeHtml(r.plan_no)}</td><td class="cell-code muted">${escapeHtml(r.reg_no || '')}</td>
        <td class="cell-strong">${escapeHtml(r.item_code || '')}</td><td>${escapeHtml(r.inspect_item || '')}</td>
        <td class="cell-code">${escapeHtml(r.inst_code || '')}</td>
        <td class="center">${fmtDate(r.plan_date) || '-'}</td><td class="center">${r._done ? badge('완료', 'success') : ddayBadge(r.plan_date)}</td>
        <td class="muted">${escapeHtml((r.appraiser_list || '').split(',').filter(Boolean).join(', '))}</td>
        <td class="center mono">${num(r.parts)}/${num(r.trials)}</td><td>${escapeHtml(r.owner || '')}</td>
        <td class="center">${badge(st)}</td>
        <td class="center"><div class="row-actions">
          ${!r._done ? `<button class="btn btn--sm btn--primary" data-eval="${r.id}">${icon('edit', 13)} 평가등록</button>` : ''}
          <button class="icon-btn" data-del="${r.id}" title="삭제">${icon('trash', 15)}</button></div></td>
      </tr>`;
    }).join('')}</tbody></table>`;
    slot.querySelectorAll('[data-eval]').forEach(b => b.onclick = () => { location.hash = `#/measure/gauge-rr?plan=${encodeURIComponent(list.find(x => x.id === b.dataset.eval).plan_no)}`; });
    slot.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const r = list.find(x => x.id === b.dataset.del);
      if (!(await confirmDialog({ message: `[${r.plan_no}]을(를) 삭제하시겠습니까?`, confirmText: '삭제' }))) return;
      try { await db.remove('grr_plans', r.id); toast('삭제되었습니다.'); reload(); } catch (e) { toast(e.message || '삭제 실패', 'error'); }
    });
  }
  async function autoGenerate() {
    const targets = [];
    for (const reg of regs.filter(r => r.use_yn !== false)) {
      const last = results.filter(x => x.reg_no === reg.reg_no).sort((a, b) => String(b.eval_date).localeCompare(String(a.eval_date)))[0];
      const nextDue = last ? addMonths(last.eval_date, reg.cycle_months || 12) : todayStr();
      const dd = ddayOf(nextDue);
      if (dd != null && dd <= 30 && !rows.some(p => p.reg_no === reg.reg_no && !p._done)) targets.push({ reg, nextDue });
    }
    if (!targets.length) { toast('주기가 도래한 평가대상이 없습니다.', 'error'); return; }
    const ok = await confirmDialog({ title: '평가계획 자동생성', danger: false, confirmText: '생성', message: `주기가 도래한 ${targets.length}건의 평가계획을 생성합니다.` });
    if (!ok) return;
    try {
      const used = rows.map(x => x.plan_no);
      for (const t of targets) {
        const plan_no = nextDocNo('RRP', used); used.push(plan_no);
        await db.insert('grr_plans', {
          plan_no, reg_no: t.reg.reg_no, plan_date: t.nextDue, item_code: t.reg.item_code,
          inspect_item: t.reg.inspect_item, inst_code: t.reg.inst_code,
          parts: t.reg.parts, trials: t.reg.trials, status: '계획',
        });
      }
      toast(`${targets.length}건의 평가계획이 생성되었습니다.`); await reload();
    } catch (e) { toast(e.message || '실패', 'error'); }
  }
  function openForm(r) {
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field col-2"><label>관리대장 <span class="req">*</span></label><select class="select" name="reg_no"><option value="">선택</option>
        ${regs.map(g => `<option value="${escapeHtml(g.reg_no)}" data-item="${escapeHtml(g.item_code || '')}" data-insp="${escapeHtml(g.inspect_item || '')}" data-inst="${escapeHtml(g.inst_code || '')}" data-parts="${g.parts || 10}" data-trials="${g.trials || 3}" data-app="${g.appraisers || 3}">${escapeHtml(g.reg_no)} · ${escapeHtml(g.item_name || '')} · ${escapeHtml(g.inspect_item || '')} (${escapeHtml(g.inst_name || '')})</option>`).join('')}</select></div>
      <div class="field"><label>평가예정일 <span class="req">*</span></label><input class="input" type="date" name="plan_date" value="${todayStr()}"></div>
      <div class="field"><label>담당자</label><select class="select" name="owner"><option value="">선택</option>
        ${users.map(u => `<option value="${escapeHtml(u.name)}">${escapeHtml(u.name)}</option>`).join('')}</select></div>
      <div class="field"><label>시료 수</label><input class="input" type="number" name="parts" value="10"></div>
      <div class="field"><label>반복 횟수</label><input class="input" type="number" name="trials" value="3"></div>
      <div class="field col-2"><label>평가자 <span class="muted">(다중선택)</span></label>
        <select class="select" name="appraiser_list" multiple size="4" style="height:auto">
          ${users.map(u => `<option value="${escapeHtml(u.name)}">${escapeHtml(u.name)} (${escapeHtml(u.department || '')})</option>`).join('')}</select></div>
      <div class="field col-2"><label>비고</label><textarea class="textarea" name="remark"></textarea></div>`;
    body.querySelector('[name="reg_no"]').addEventListener('change', (e) => {
      const o = e.target.selectedOptions[0];
      if (!o?.dataset) return;
      body.querySelector('[name="parts"]').value = o.dataset.parts || 10;
      body.querySelector('[name="trials"]').value = o.dataset.trials || 3;
    });
    openModal({
      title: 'R&R 평가계획 등록', body, wide: true,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 저장</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => { const el = body.querySelector(`[name="${n}"]`); return el ? el.value.trim() : ''; };
          const regNo = g('reg_no');
          if (!regNo) { toast('관리대장을 선택하세요.', 'error'); return; }
          const reg = regs.find(x => x.reg_no === regNo);
          const appr = [...body.querySelector('[name="appraiser_list"]').selectedOptions].map(o => o.value);
          const planDate = g('plan_date');
          if (rows.some(p => p.reg_no === regNo && String(p.plan_date).slice(0, 10) === planDate && !p._done)) {
            toast('동일 대장·예정일의 미실시 계획이 이미 있습니다.', 'error'); return;
          }
          try {
            await db.insert('grr_plans', {
              plan_no: nextDocNo('RRP', rows.map(x => x.plan_no)), reg_no: regNo, plan_date: planDate || todayStr(),
              item_code: reg.item_code, inspect_item: reg.inspect_item, inst_code: reg.inst_code,
              appraiser_list: appr.join(','), parts: Number(g('parts')) || 10, trials: Number(g('trials')) || 3,
              owner: g('owner'), status: '계획', remark: g('remark'),
            });
            close(); toast('저장되었습니다.'); await reload();
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }
  async function reload() {
    try { await loadAll(); renderStats(); renderChips(); renderTable(); }
    catch (e) { root.querySelector('#gp-table').innerHTML = `<div class="empty" style="padding:40px">${icon('database', 46)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p><p class="muted">신규 테이블이 없으면 <b>supabase/migration_v2_sq.sql</b>을 실행하세요.</p></div>`; }
  }
  reload();
}

// =====================================================================
// 8-6 Gauge R&R 평가등록 (측정값 행렬 + 자동계산)
// =====================================================================
// AIAG MSA 평균-범위법 상수 (d2*)
const K1 = { 2: 4.56, 3: 3.05 };            // 반복 횟수별
const K2 = { 2: 3.65, 3: 2.70 };            // 평가자 수별
const K3 = { 2: 3.65, 3: 2.70, 4: 2.30, 5: 2.08, 6: 1.93, 7: 1.82, 8: 1.74, 9: 1.67, 10: 1.62 };

export function calcGRR(matrix, appraisers, parts, trials, tolerance) {
  // matrix[appraiser][part][trial] = value
  const partAvgByApp = [];   // 평가자별 시료 평균
  const rangesByApp = [];    // 평가자별 시료 범위
  const appAvgs = [];
  for (let a = 0; a < appraisers; a++) {
    const pAvgs = [], pRanges = [];
    for (let p = 0; p < parts; p++) {
      const vals = [];
      for (let t = 0; t < trials; t++) {
        const v = matrix?.[a]?.[p]?.[t];
        if (v != null && v !== '' && !isNaN(Number(v))) vals.push(Number(v));
      }
      if (!vals.length) { pAvgs.push(null); pRanges.push(null); continue; }
      pAvgs.push(vals.reduce((s, x) => s + x, 0) / vals.length);
      pRanges.push(Math.max(...vals) - Math.min(...vals));
    }
    partAvgByApp.push(pAvgs); rangesByApp.push(pRanges);
    const valid = pAvgs.filter(v => v != null);
    appAvgs.push(valid.length ? valid.reduce((s, x) => s + x, 0) / valid.length : null);
  }
  // Rbar (전체 범위 평균)
  const allRanges = rangesByApp.flat().filter(v => v != null);
  if (!allRanges.length) return null;
  const Rbar = allRanges.reduce((s, x) => s + x, 0) / allRanges.length;
  // Xdiff (평가자 평균 최대-최소)
  const validAppAvgs = appAvgs.filter(v => v != null);
  const Xdiff = validAppAvgs.length > 1 ? Math.max(...validAppAvgs) - Math.min(...validAppAvgs) : 0;
  // Rp (시료 평균의 범위)
  const partMeans = [];
  for (let p = 0; p < parts; p++) {
    const vals = partAvgByApp.map(a => a[p]).filter(v => v != null);
    if (vals.length) partMeans.push(vals.reduce((s, x) => s + x, 0) / vals.length);
  }
  const Rp = partMeans.length > 1 ? Math.max(...partMeans) - Math.min(...partMeans) : 0;

  const k1 = K1[trials] || 3.05;
  const k2 = K2[appraisers] || 2.70;
  const k3 = K3[Math.min(10, Math.max(2, parts))] || 1.62;

  const EV = Rbar * k1;                                              // 반복성
  const avSq = Math.pow(Xdiff * k2, 2) - (EV * EV) / (parts * trials);
  const AV = Math.sqrt(Math.max(0, avSq));                            // 재현성
  const GRR = Math.sqrt(EV * EV + AV * AV);
  const PV = Rp * k3;                                                // 부품 변동
  const TV = Math.sqrt(GRR * GRR + PV * PV);                         // 총 변동

  // %GRR: 공차가 있으면 공차 대비, 없으면 총변동 대비
  const tol = Number(tolerance) || 0;
  const grrPct = tol > 0 ? (GRR / tol) * 100 : (TV > 0 ? (GRR / TV) * 100 : 0);
  const ndc = GRR > 0 ? Math.floor(1.41 * (PV / GRR)) : 0;
  const judgment = grrPct < 10 ? '적합' : grrPct <= 30 ? '조건부' : '부적합';
  return {
    EV, AV, GRR, PV, TV, Rbar, Xdiff, Rp,
    evPct: TV > 0 ? (EV / TV) * 100 : 0, avPct: TV > 0 ? (AV / TV) * 100 : 0,
    grrPct, ndc, judgment,
  };
}

export async function gaugeRR(root, params) {
  const state = { search: '', chip: '전체', selected: null };
  let rows = [], regs = [], plans = [], insts = [], users = [], items = [], specItems = [];

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>Gauge R&R 평가등록</h1><p>측정값을 행렬로 입력하면 <b>반복성(EV)·재현성(AV)·%GRR·ndc가 자동 계산</b>되고 판정이 표시됩니다.</p></div>
      <div class="page-head__actions">
        <button class="btn" id="gr-refresh">${icon('refresh', 16)} 새로고침</button>
        <button class="btn btn--primary" id="gr-add">${icon('plus', 16)} 평가 등록</button>
      </div>
    </div>
    <div id="gr-stats"></div>
    <div class="card">
      <div class="toolbar"><div class="search-box grow">${icon('search', 16)}<input id="gr-search" placeholder="R&R번호·품목·검사항목·계측기 검색" autocomplete="off"/></div></div>
      <div class="toolbar" style="border-top:0;padding-top:12px"><div class="chips" id="gr-chips"></div></div>
      <div class="table-wrap"><div id="gr-table"><div class="spinner"></div></div></div>
    </div>
    <div id="gr-detail"></div>`;
  root.querySelector('#gr-refresh').onclick = () => reload();
  root.querySelector('#gr-add').onclick = () => openEval(null);
  root.querySelector('#gr-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });

  async function loadAll() {
    [rows, regs, plans, insts, users, items, specItems] = await Promise.all([
      db.all('gauge_rr', {}).catch(() => []),
      db.all('grr_registers', {}).catch(() => []),
      db.all('grr_plans', {}).catch(() => []),
      db.all('measuring_instruments', { sort: 'code' }).catch(() => []),
      db.all('users', { sort: 'name' }).catch(() => []),
      db.all('items', { sort: 'code' }).catch(() => []),
      db.all('inspection_spec_items', {}).catch(() => []),
    ]);
  }
  function scoped() {
    const q = state.search.toLowerCase();
    return rows.filter(r => {
      if (state.chip !== '전체' && (r.judgment || '') !== state.chip) return false;
      if (q && ![r.rr_no, r.item_code, r.inspect_item, r.characteristic, r.inst_code, r.inst_name].some(v => String(v ?? '').toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => String(b.eval_date).localeCompare(String(a.eval_date)));
  }
  function renderStats() {
    const ok = rows.filter(r => r.judgment === '적합').length;
    root.querySelector('#gr-stats').innerHTML = `<div class="stat-grid">
      ${stat('총 평가', num(rows.length), '건', 'target', 'brand')}
      ${stat('적합(<10%)', num(ok), '건', 'checkCircle', 'green')}
      ${stat('조건부(10~30%)', num(rows.filter(r => r.judgment === '조건부').length), '건', 'clock', 'amber')}
      ${stat('부적합(>30%)', num(rows.filter(r => r.judgment === '부적합').length), '건', 'alert', 'red')}</div>`;
  }
  function renderChips() {
    const wrap = root.querySelector('#gr-chips');
    const opts = [['전체', rows.length], ...['적합', '조건부', '부적합'].map(s => [s, rows.filter(r => r.judgment === s).length])];
    wrap.innerHTML = opts.map(([t, c]) => `<button class="chip ${state.chip === t ? 'active' : ''}" data-c="${t}">${t}<span class="chip__count">${c}</span></button>`).join('');
    wrap.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { state.chip = b.dataset.c; renderChips(); renderTable(); });
  }
  function renderTable() {
    const list = scoped(); const slot = root.querySelector('#gr-table');
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:44px">${icon('inbox', 46)}<h4>R&R 평가 내역이 없습니다</h4><p>[평가 등록]으로 측정값을 입력하세요.</p></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th>R&R번호</th><th>평가일</th><th>품목</th><th>검사항목</th><th>계측기</th>
      <th class="center">평가자/시료/반복</th><th class="num">EV</th><th class="num">AV</th><th class="num">%GRR</th><th class="num">ndc</th><th class="center">판정</th><th class="center" style="width:88px">관리</th>
    </tr></thead><tbody>${list.map(r => `<tr class="clickable ${state.selected?.id === r.id ? 'is-selected' : ''}" data-id="${r.id}">
      <td class="cell-code">${escapeHtml(r.rr_no)}</td><td>${fmtDate(r.eval_date)}</td>
      <td class="cell-code">${escapeHtml(r.item_code || '')}</td><td class="cell-strong">${escapeHtml(r.inspect_item || r.characteristic || '')}</td>
      <td>${escapeHtml(r.inst_name || r.inst_code || '')}</td>
      <td class="center mono">${num(r.appraisers)}/${num(r.parts)}/${num(r.trials)}</td>
      <td class="num mono">${(+r.repeatability || 0).toFixed(4)}</td><td class="num mono">${(+r.reproducibility || 0).toFixed(4)}</td>
      <td class="num mono" style="font-weight:700">${(+r.grr_percent || 0).toFixed(1)}%</td><td class="num mono">${num(r.ndc)}</td>
      <td class="center">${badge(r.judgment || '')}</td>
      <td class="center"><div class="row-actions">
        <button class="icon-btn" data-view="${r.id}" title="측정값 보기">${icon('search', 15)}</button>
        <button class="icon-btn" data-del="${r.id}" title="삭제">${icon('trash', 15)}</button></div></td>
    </tr>`).join('')}</tbody></table>`;
    slot.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = (e) => { if (e.target.closest('button')) return; state.selected = list.find(x => x.id === tr.dataset.id); renderTable(); renderDetail(); });
    slot.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { state.selected = list.find(x => x.id === b.dataset.view); renderDetail(); });
    slot.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const r = list.find(x => x.id === b.dataset.del);
      if (!(await confirmDialog({ message: `[${r.rr_no}] 평가와 측정값을 삭제하시겠습니까?`, confirmText: '삭제' }))) return;
      try {
        const ms = await db.all('grr_measures', { filters: { rr_no: r.rr_no } }).catch(() => []);
        for (const m of ms) await db.remove('grr_measures', m.id);
        await db.remove('gauge_rr', r.id);
        toast('삭제되었습니다.'); state.selected = null; reload();
      } catch (e) { toast(e.message || '삭제 실패', 'error'); }
    });
  }
  async function renderDetail() {
    const r = state.selected; const slot = root.querySelector('#gr-detail');
    if (!r) { slot.innerHTML = ''; return; }
    const ms = await db.all('grr_measures', { filters: { rr_no: r.rr_no } }).catch(() => []);
    const A = r.appraisers || 3, P = r.parts || 10, T = r.trials || 3;
    const get = (a, p, t) => ms.find(m => m.appraiser === a + 1 && m.part_no === p + 1 && m.trial === t + 1)?.value ?? '';
    slot.innerHTML = `<div class="card">
      <div class="card__head"><div><div class="flex" style="gap:8px"><span class="cell-code" style="font-size:14px">${escapeHtml(r.rr_no)}</span>${badge(r.judgment || '')}</div>
        <h3 style="margin-top:4px">${escapeHtml(r.item_code || '')} · ${escapeHtml(r.inspect_item || r.characteristic || '')}</h3></div>
        <div class="spacer"></div><button class="btn btn--sm" id="gr-print">${icon('fileText', 14)} 보고서 인쇄</button></div>
      <div class="card__body">
        <div class="grid-3" style="margin-bottom:16px">
          ${info('평가일 / 평가자', `${fmtDate(r.eval_date)} / ${r.evaluator || '-'}`)}
          ${info('계측기', `${r.inst_code || ''} ${r.inst_name || ''}`)}
          ${info('조건', `평가자 ${A}명 · 시료 ${P}개 · 반복 ${T}회`)}
          ${info('반복성 (EV)', (+r.repeatability || 0).toFixed(4))}
          ${info('재현성 (AV)', (+r.reproducibility || 0).toFixed(4))}
          ${info('%GRR / ndc', `${(+r.grr_percent || 0).toFixed(1)}% / ${num(r.ndc)}`)}
        </div>
        <h4 style="margin:0 0 10px;font-size:13.5px">측정값</h4>
        <div class="table-wrap"><table class="grid"><thead><tr><th>시료</th>
          ${Array.from({ length: A }, (_, a) => Array.from({ length: T }, (_, t) => `<th class="center">평가자${a + 1}-${t + 1}</th>`).join('')).join('')}
        </tr></thead><tbody>${Array.from({ length: P }, (_, p) => `<tr><td class="cell-strong">${p + 1}</td>
          ${Array.from({ length: A }, (_, a) => Array.from({ length: T }, (_, t) => `<td class="num mono">${get(a, p, t)}</td>`).join('')).join('')}
        </tr>`).join('')}</tbody></table></div>
        ${r.improve_action ? `<div style="margin-top:14px;padding:12px 14px;background:var(--surface-2);border-radius:10px">
          <div class="muted" style="font-size:12px;font-weight:700">개선내용</div><div style="margin-top:4px;white-space:pre-wrap">${escapeHtml(r.improve_action)}</div></div>` : ''}
      </div></div>`;
    slot.querySelector('#gr-print').onclick = () => printReport(r, ms);
  }
  function printReport(r, ms) {
    const A = r.appraisers || 3, P = r.parts || 10, T = r.trials || 3;
    const get = (a, p, t) => ms.find(m => m.appraiser === a + 1 && m.part_no === p + 1 && m.trial === t + 1)?.value ?? '';
    printSheet(`GaugeRR_${r.rr_no}`, `
      <h1>Gauge R&R 평가 보고서</h1><div class="sub">(주)민선 MES·QMS</div>
      <table><tr><th style="width:100px">R&R번호</th><td>${r.rr_no}</td><th style="width:90px">평가일</th><td>${(r.eval_date || '').slice(0, 10)}</td></tr>
      <tr><th>품목</th><td>${r.item_code || ''}</td><th>검사항목</th><td>${r.inspect_item || r.characteristic || ''}</td></tr>
      <tr><th>계측기</th><td>${r.inst_code || ''} ${r.inst_name || ''}</td><th>평가조건</th><td>평가자 ${A} · 시료 ${P} · 반복 ${T}</td></tr>
      <tr><th>반복성(EV)</th><td>${(+r.repeatability || 0).toFixed(4)}</td><th>재현성(AV)</th><td>${(+r.reproducibility || 0).toFixed(4)}</td></tr>
      <tr><th>%GRR</th><td><b>${(+r.grr_percent || 0).toFixed(1)}%</b></td><th>판정 / ndc</th><td><b>${r.judgment || ''}</b> / ${r.ndc || 0}</td></tr></table>
      <table><thead><tr><th>시료</th>${Array.from({ length: A }, (_, a) => Array.from({ length: T }, (_, t) => `<th>평가자${a + 1}-${t + 1}</th>`).join('')).join('')}</tr></thead>
      <tbody>${Array.from({ length: P }, (_, p) => `<tr><td>${p + 1}</td>${Array.from({ length: A }, (_, a) => Array.from({ length: T }, (_, t) => `<td>${get(a, p, t)}</td>`).join('')).join('')}</tr>`).join('')}</tbody></table>
      <div style="margin-top:10px;font-size:11px">판정기준: %GRR &lt; 10% 적합 · 10~30% 조건부 · &gt; 30% 부적합 (AIAG MSA)</div>`);
  }

  // 평가 등록 (측정값 행렬)
  function openEval(planNo) {
    const plan = planNo ? plans.find(p => p.plan_no === planNo) : null;
    const body = document.createElement('div');
    body.innerHTML = `
      <form class="form-grid" id="gr-form" style="margin-bottom:14px">
        <div class="field"><label>평가계획</label><select class="select" name="plan_no"><option value="">직접 입력</option>
          ${plans.filter(p => !rows.some(r => r.plan_no === p.plan_no)).map(p => `<option value="${escapeHtml(p.plan_no)}" ${plan?.plan_no === p.plan_no ? 'selected' : ''}>${escapeHtml(p.plan_no)} · ${escapeHtml(p.item_code || '')} · ${escapeHtml(p.inspect_item || '')}</option>`).join('')}</select></div>
        <div class="field"><label>평가일 <span class="req">*</span></label><input class="input" type="date" name="eval_date" value="${todayStr()}"></div>
        <div class="field"><label>품목 <span class="req">*</span></label><select class="select" name="item_code"><option value="">선택</option>
          ${items.map(i => `<option value="${escapeHtml(i.code)}">${escapeHtml(i.code)} · ${escapeHtml(i.name)}</option>`).join('')}</select></div>
        <div class="field"><label>검사항목 <span class="req">*</span></label><input class="input" name="inspect_item" placeholder="예: 내경 Ø25"></div>
        <div class="field"><label>계측기 <span class="req">*</span></label><select class="select" name="inst_code"><option value="">선택</option>
          ${insts.map(i => `<option value="${escapeHtml(i.code)}" data-tol="${escapeHtml(i.tolerance || '')}">${escapeHtml(i.code)} · ${escapeHtml(i.name)}</option>`).join('')}</select></div>
        <div class="field"><label>평가자 수</label><input class="input" type="number" name="appraisers" value="3" min="2" max="3"></div>
        <div class="field"><label>시료 수</label><input class="input" type="number" name="parts" value="10" min="2" max="10"></div>
        <div class="field"><label>반복 횟수</label><input class="input" type="number" name="trials" value="3" min="2" max="3"></div>
        <div class="field"><label>공차(규격 폭) <span class="muted">%GRR 기준</span></label><input class="input" type="number" step="any" name="tolerance" placeholder="예: 0.04 (±0.02)"></div>
        <div class="field"><label>담당 평가자</label><select class="select" name="evaluator"><option value="">선택</option>
          ${users.map(u => `<option value="${escapeHtml(u.name)}">${escapeHtml(u.name)}</option>`).join('')}</select></div>
      </form>
      <div class="flex between" style="margin-bottom:8px">
        <b>측정값 입력</b>
        <div class="flex" style="gap:6px">
          <button class="btn btn--sm" type="button" id="gr-paste">${icon('upload', 14)} 엑셀 붙여넣기</button>
          <button class="btn btn--sm" type="button" id="gr-calc">${icon('activity', 14)} 재계산</button>
        </div>
      </div>
      <div class="table-wrap" id="gr-matrix"></div>
      <div id="gr-result" style="margin-top:14px"></div>`;

    const form = body.querySelector('#gr-form');
    const gv = (n) => { const el = form.querySelector(`[name="${n}"]`); return el ? el.value.trim() : ''; };
    let A = 3, P = 10, T = 3;

    function buildMatrix() {
      A = Math.min(3, Math.max(2, Number(gv('appraisers')) || 3));
      P = Math.min(10, Math.max(2, Number(gv('parts')) || 10));
      T = Math.min(3, Math.max(2, Number(gv('trials')) || 3));
      const slot = body.querySelector('#gr-matrix');
      slot.innerHTML = `<table class="grid ge__table"><thead><tr><th style="width:56px">시료</th>
        ${Array.from({ length: A }, (_, a) => Array.from({ length: T }, (_, t) => `<th class="center">평가자${a + 1}-${t + 1}</th>`).join('')).join('')}
      </tr></thead><tbody>${Array.from({ length: P }, (_, p) => `<tr><td class="center cell-strong">${p + 1}</td>
        ${Array.from({ length: A }, (_, a) => Array.from({ length: T }, (_, t) => `<td><input class="ge__in" type="number" step="any" data-m="${a}-${p}-${t}"></td>`).join('')).join('')}
      </tr>`).join('')}</tbody></table>`;
      slot.querySelectorAll('[data-m]').forEach(el => {
        el.addEventListener('input', () => { el.style.borderColor = ''; calc(); });
        el.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const [a, p, t] = el.dataset.m.split('-').map(Number);
          const next = (t + 1 < T) ? `${a}-${p}-${t + 1}` : (p + 1 < P) ? `${a}-${p + 1}-0` : (a + 1 < A) ? `${a + 1}-0-0` : null;
          if (next) slot.querySelector(`[data-m="${next}"]`)?.focus();
        });
      });
      calc();
    }
    function readMatrix() {
      const m = [];
      for (let a = 0; a < A; a++) { m[a] = []; for (let p = 0; p < P; p++) { m[a][p] = []; for (let t = 0; t < T; t++) { m[a][p][t] = body.querySelector(`[data-m="${a}-${p}-${t}"]`)?.value ?? ''; } } }
      return m;
    }
    function calc() {
      const m = readMatrix();
      const filled = m.flat(2).filter(v => v !== '' && v != null).length;
      const total = A * P * T;
      const res = calcGRR(m, A, P, T, gv('tolerance'));
      const slot = body.querySelector('#gr-result');
      // 누락 강조
      body.querySelectorAll('[data-m]').forEach(el => { if (el.value === '') el.style.background = 'rgba(239,68,68,.07)'; else el.style.background = ''; });
      if (!res || filled < total) {
        slot.innerHTML = `<div class="flex" style="padding:11px 13px;background:var(--surface-2);border-radius:10px;gap:8px">
          ${icon('alert', 16)} 측정값 입력 ${filled}/${total} — 모든 값을 입력하면 %GRR이 계산됩니다.
          ${res ? `<span class="spacer"></span><span class="muted">현재 추정 %GRR ${res.grrPct.toFixed(1)}%</span>` : ''}</div>`;
        body._result = res && filled === total ? res : null;
        return;
      }
      body._result = res;
      slot.innerHTML = `<div class="stat-grid">
        ${stat('반복성 (EV)', res.EV.toFixed(4), '', 'refresh', 'brand')}
        ${stat('재현성 (AV)', res.AV.toFixed(4), '', 'users', 'violet')}
        ${stat('%GRR', res.grrPct.toFixed(1), '%', 'target', res.judgment === '적합' ? 'green' : res.judgment === '조건부' ? 'amber' : 'red')}
        ${stat('ndc (구별범주수)', num(res.ndc), '', 'grid', res.ndc >= 5 ? 'green' : 'amber')}</div>
        <div class="flex" style="margin-top:10px;padding:11px 13px;background:var(--surface-2);border-radius:10px;gap:8px">
          ${icon(res.judgment === '적합' ? 'checkCircle' : 'alert', 16)}
          <b>판정: ${res.judgment}</b>
          <span class="muted">· EV ${res.evPct.toFixed(1)}% · AV ${res.avPct.toFixed(1)}% · PV ${res.PV.toFixed(4)} · TV ${res.TV.toFixed(4)}</span>
          <span class="spacer"></span>
          <span class="muted">%GRR &lt;10 적합 · 10~30 조건부 · &gt;30 부적합</span>
        </div>
        ${res.judgment !== '적합' ? `<div class="field" style="margin-top:10px"><label>개선내용 <span class="req">*</span></label>
          <textarea class="textarea" id="gr-improve" placeholder="예: 측정 기준면 지그 도입, 평가자 교육 실시 후 재평가"></textarea></div>` : ''}`;
    }
    ['appraisers', 'parts', 'trials'].forEach(n => form.querySelector(`[name="${n}"]`).addEventListener('change', buildMatrix));
    form.querySelector('[name="tolerance"]').addEventListener('input', calc);
    form.querySelector('[name="plan_no"]').addEventListener('change', (e) => {
      const p = plans.find(x => x.plan_no === e.target.value);
      if (!p) return;
      form.querySelector('[name="item_code"]').value = p.item_code || '';
      form.querySelector('[name="inspect_item"]').value = p.inspect_item || '';
      form.querySelector('[name="inst_code"]').value = p.inst_code || '';
      form.querySelector('[name="parts"]').value = p.parts || 10;
      form.querySelector('[name="trials"]').value = p.trials || 3;
      buildMatrix();
    });
    // 검사규격에서 공차 자동
    form.querySelector('[name="inspect_item"]').addEventListener('blur', () => {
      const code = gv('item_code'), item = gv('inspect_item');
      if (!code || !item || form.querySelector('[name="tolerance"]').value) return;
      const si = specItems.find(s => s.inspect_item === item);
      if (si) {
        if (si.usl != null && si.lsl != null) form.querySelector('[name="tolerance"]').value = Number(si.usl) - Number(si.lsl);
        else if (si.tolerance) form.querySelector('[name="tolerance"]').value = Math.abs(Number(String(si.tolerance).replace(/[^0-9.\-]/g, '')) || 0) * 2;
        calc();
      }
    });
    body.querySelector('#gr-calc').onclick = calc;
    body.querySelector('#gr-paste').onclick = () => {
      const ta = document.createElement('textarea');
      ta.className = 'textarea'; ta.rows = 8;
      ta.placeholder = `엑셀에서 복사한 측정값을 붙여넣으세요 (행=시료, 열=평가자1-1, 1-2, ... 순서)`;
      openModal({
        title: '측정값 엑셀 붙여넣기', body: ta, wide: true,
        footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 적용</button>`,
        onMount: ({ footEl, close }) => {
          footEl.querySelector('[data-cancel]').onclick = close;
          footEl.querySelector('[data-ok]').onclick = () => {
            const lines = ta.value.split('\n').map(l => l.trim()).filter(Boolean);
            lines.forEach((line, p) => {
              if (p >= P) return;
              const cells = line.split('\t').map(c => c.trim());
              let idx = 0;
              for (let a = 0; a < A; a++) for (let t = 0; t < T; t++) {
                const el = body.querySelector(`[data-m="${a}-${p}-${t}"]`);
                if (el && cells[idx] !== undefined) el.value = cells[idx];
                idx++;
              }
            });
            close(); calc(); toast('측정값이 적용되었습니다.');
          };
        },
      });
    };

    openModal({
      title: 'Gauge R&R 평가 등록', body, wide: true,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 저장</button>`,
      onMount: ({ footEl, close }) => {
        buildMatrix();
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          if (!gv('item_code')) { toast('품목을 선택하세요.', 'error'); return; }
          if (!gv('inspect_item')) { toast('검사항목을 입력하세요.', 'error'); return; }
          if (!gv('inst_code')) { toast('계측기를 선택하세요.', 'error'); return; }
          const res = body._result;
          if (!res) { toast('모든 측정값을 입력하세요.', 'error'); return; }
          const improveEl = body.querySelector('#gr-improve');
          if (res.judgment !== '적합' && improveEl && !improveEl.value.trim()) { toast('부적합·조건부 판정 시 개선내용을 입력하세요.', 'error'); return; }
          const inst = insts.find(i => i.code === gv('inst_code'));
          try {
            const rr_no = nextDocNo('RR', rows.map(x => x.rr_no));
            const planNo = gv('plan_no');
            const reg = planNo ? plans.find(p => p.plan_no === planNo)?.reg_no : '';
            await db.insert('gauge_rr', {
              rr_no, eval_date: gv('eval_date') || todayStr(), plan_no: planNo, reg_no: reg || '',
              inst_code: gv('inst_code'), inst_name: inst?.name || '', item_code: gv('item_code'),
              inspect_item: gv('inspect_item'), characteristic: gv('inspect_item'),
              appraisers: A, parts: P, trials: T,
              repeatability: Number(res.EV.toFixed(6)), reproducibility: Number(res.AV.toFixed(6)),
              grr_percent: Number(res.grrPct.toFixed(2)), ndc: res.ndc, judgment: res.judgment,
              evaluator: gv('evaluator'), status: '완료',
              improve_action: improveEl ? improveEl.value.trim() : '',
            });
            // 측정값 저장
            const m = readMatrix();
            for (let a = 0; a < A; a++) for (let p = 0; p < P; p++) for (let t = 0; t < T; t++) {
              const v = m[a][p][t];
              if (v === '' || v == null) continue;
              await db.insert('grr_measures', { rr_no, part_no: p + 1, appraiser: a + 1, trial: t + 1, value: Number(v) });
            }
            if (planNo) { const pl = plans.find(x => x.plan_no === planNo); if (pl) await db.update('grr_plans', pl.id, { status: '완료' }); }
            close(); toast(`R&R 평가가 저장되었습니다. (%GRR ${res.grrPct.toFixed(1)}% — ${res.judgment})`);
            await reload();
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }

  async function reload() {
    try {
      await loadAll(); renderStats(); renderChips(); renderTable();
      if (params?.plan && !state._opened) { state._opened = true; openEval(params.plan); }
    } catch (e) { root.querySelector('#gr-table').innerHTML = `<div class="empty" style="padding:40px">${icon('database', 46)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p><p class="muted">신규 테이블이 없으면 <b>supabase/migration_v2_sq.sql</b>을 실행하세요.</p></div>`; }
  }
  reload();
}

// =====================================================================
// 8-7 Gauge R&R 실시현황
// =====================================================================
export async function grrStatus(root) {
  const state = { from: '', to: '', fItem: '', fInst: '', chip: '전체' };
  let rrs = [], plans = [], regs = [], insts = [], items = [];

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>Gauge R&R 실시현황</h1><p>계획 대비 실시 현황과 %GRR 결과를 조회합니다. 계측기별 추세를 확인할 수 있습니다.</p></div>
      <div class="page-head__actions">
        <button class="btn" id="gs-csv">${icon('download', 16)} 보고서(CSV)</button>
        <button class="btn" id="gs-refresh">${icon('refresh', 16)} 새로고침</button>
      </div>
    </div>
    <div id="gs-stats"></div>
    <div class="card" style="margin-bottom:16px">
      <div class="toolbar">
        <select class="select" id="gs-fitem" style="width:auto;min-width:170px"><option value="">전체 품목</option></select>
        <select class="select" id="gs-finst" style="width:auto;min-width:170px"><option value="">전체 계측기</option></select>
        <div class="date-range"><span class="date-range__label">${icon('calendar', 14)} 기간</span>
          <input class="input input--date" type="date" id="gs-from"><span class="date-range__sep">~</span><input class="input input--date" type="date" id="gs-to"></div>
      </div>
      <div class="toolbar" style="border-top:0;padding-top:12px"><div class="chips" id="gs-chips"></div></div>
      <div class="table-wrap"><div id="gs-table"><div class="spinner"></div></div></div>
    </div>
    <div class="card"><div class="card__head">${icon('trendUp', 18)}<h3>계측기별 %GRR 추세</h3></div>
      <div class="card__body" id="gs-trend"></div></div>`;
  root.querySelector('#gs-refresh').onclick = () => reload();
  root.querySelector('#gs-csv').onclick = () => exportCsv();
  root.querySelector('#gs-from').addEventListener('change', (e) => { state.from = e.target.value; render(); });
  root.querySelector('#gs-to').addEventListener('change', (e) => { state.to = e.target.value; render(); });
  root.querySelector('#gs-fitem').addEventListener('change', (e) => { state.fItem = e.target.value; render(); });
  root.querySelector('#gs-finst').addEventListener('change', (e) => { state.fInst = e.target.value; render(); });

  async function loadAll() {
    [rrs, plans, regs, insts, items] = await Promise.all([
      db.all('gauge_rr', {}).catch(() => []),
      db.all('grr_plans', {}).catch(() => []),
      db.all('grr_registers', {}).catch(() => []),
      db.all('measuring_instruments', { sort: 'code' }).catch(() => []),
      db.all('items', { sort: 'code' }).catch(() => []),
    ]);
    root.querySelector('#gs-fitem').innerHTML = `<option value="">전체 품목</option>` + items.map(i => `<option value="${escapeHtml(i.code)}">${escapeHtml(i.code)} · ${escapeHtml(i.name)}</option>`).join('');
    root.querySelector('#gs-finst').innerHTML = `<option value="">전체 계측기</option>` + insts.map(i => `<option value="${escapeHtml(i.code)}">${escapeHtml(i.code)} · ${escapeHtml(i.name)}</option>`).join('');
  }
  // 계획 + 실시 통합 목록
  function unified() {
    const done = rrs.map(r => ({
      type: '실시', key: r.rr_no, plan_no: r.plan_no || '', item_code: r.item_code, inspect_item: r.inspect_item || r.characteristic,
      inst_code: r.inst_code, inst_name: r.inst_name, plan_date: plans.find(p => p.plan_no === r.plan_no)?.plan_date || '',
      eval_date: r.eval_date, grr: +r.grr_percent || 0, ndc: r.ndc, judgment: r.judgment, status: '완료', raw: r,
    }));
    const pending = plans.filter(p => !rrs.some(r => r.plan_no === p.plan_no)).map(p => ({
      type: '계획', key: p.plan_no, plan_no: p.plan_no, item_code: p.item_code, inspect_item: p.inspect_item,
      inst_code: p.inst_code, inst_name: insts.find(i => i.code === p.inst_code)?.name || '',
      plan_date: p.plan_date, eval_date: '', grr: null, ndc: null, judgment: '',
      status: ddayOf(p.plan_date) != null && ddayOf(p.plan_date) < 0 ? '미실시' : '계획', raw: p,
    }));
    return [...done, ...pending];
  }
  function filtered() {
    return unified().filter(r => {
      if (state.fItem && r.item_code !== state.fItem) return false;
      if (state.fInst && r.inst_code !== state.fInst) return false;
      const d = String(r.eval_date || r.plan_date || '').slice(0, 10);
      if (state.from && d < state.from) return false;
      if (state.to && d > state.to) return false;
      if (state.chip === '완료' && r.status !== '완료') return false;
      if (state.chip === '계획' && r.status !== '계획') return false;
      if (state.chip === '미실시' && r.status !== '미실시') return false;
      if (state.chip === '부적합' && !['부적합', '조건부'].includes(r.judgment)) return false;
      return true;
    }).sort((a, b) => String(b.eval_date || b.plan_date).localeCompare(String(a.eval_date || a.plan_date)));
  }
  function renderStats() {
    const u = unified();
    const done = u.filter(r => r.status === '완료');
    const rate = u.length ? ((done.length / u.length) * 100).toFixed(1) : '0.0';
    const okRate = done.length ? ((done.filter(r => r.judgment === '적합').length / done.length) * 100).toFixed(1) : '0.0';
    root.querySelector('#gs-stats').innerHTML = `<div class="stat-grid">
      ${stat('평가 대상', num(u.length), '건', 'clipboard', 'brand')}
      ${stat('실시율', rate, '%', 'checkCircle', 'green')}
      ${stat('R&R 적합률', okRate, '%', 'target', 'violet')}
      ${stat('미실시(기한초과)', num(u.filter(r => r.status === '미실시').length), '건', 'alert', 'red')}</div>`;
  }
  function renderChips() {
    const u = unified();
    const wrap = root.querySelector('#gs-chips');
    const opts = [['전체', u.length], ['완료', u.filter(r => r.status === '완료').length], ['계획', u.filter(r => r.status === '계획').length],
      ['미실시', u.filter(r => r.status === '미실시').length], ['부적합', u.filter(r => ['부적합', '조건부'].includes(r.judgment)).length]];
    wrap.innerHTML = opts.map(([t, c]) => `<button class="chip ${state.chip === t ? 'active' : ''}" data-c="${t}">${t}<span class="chip__count">${c}</span></button>`).join('');
    wrap.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { state.chip = b.dataset.c; renderChips(); render(); });
  }
  function render() {
    const list = filtered(); const slot = root.querySelector('#gs-table');
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:44px">${icon('inbox', 46)}<h4>해당 데이터가 없습니다</h4></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th>품목</th><th>검사항목</th><th>계측기</th><th class="center">계획일</th><th class="center">실시일</th>
      <th class="num">%GRR</th><th class="num">ndc</th><th class="center">판정</th><th class="center">상태</th>
    </tr></thead><tbody>${list.map(r => `<tr class="${r.judgment === '부적합' ? '' : ''}">
      <td class="cell-code">${escapeHtml(r.item_code || '')}</td><td class="cell-strong">${escapeHtml(r.inspect_item || '')}</td>
      <td>${escapeHtml(r.inst_code || '')} ${escapeHtml(r.inst_name || '')}</td>
      <td class="center">${fmtDate(r.plan_date) || '-'}</td><td class="center">${fmtDate(r.eval_date) || '-'}</td>
      <td class="num mono" style="font-weight:700">${r.grr != null ? r.grr.toFixed(1) + '%' : '-'}</td>
      <td class="num mono">${r.ndc != null ? num(r.ndc) : '-'}</td>
      <td class="center">${r.judgment ? badge(r.judgment) : '-'}</td>
      <td class="center">${badge(r.status, r.status === '완료' ? 'success' : r.status === '미실시' ? 'danger' : 'neutral')}</td>
    </tr>`).join('')}</tbody></table>`;
    renderTrend();
  }
  function renderTrend() {
    const slot = root.querySelector('#gs-trend');
    const byInst = {};
    for (const r of rrs) { (byInst[r.inst_code] ??= []).push(r); }
    const entries = Object.entries(byInst).filter(([, v]) => v.length);
    if (!entries.length) { slot.innerHTML = `<div class="muted">R&R 실시 데이터가 없습니다.</div>`; return; }
    slot.innerHTML = `<div class="flex-col" style="gap:14px">${entries.map(([code, list]) => {
      const sorted = [...list].sort((a, b) => String(a.eval_date).localeCompare(String(b.eval_date))).slice(-6);
      const inst = insts.find(i => i.code === code);
      return `<div>
        <div class="flex between" style="margin-bottom:6px"><b>${escapeHtml(code)} · ${escapeHtml(inst?.name || '')}</b>
          <span class="muted">최근 ${sorted.length}회</span></div>
        <div style="display:flex;gap:8px;align-items:flex-end;height:80px">
          ${sorted.map(r => {
            const v = +r.grr_percent || 0;
            const h = Math.min(100, (v / 40) * 100);
            const color = v < 10 ? 'var(--success, #16a34a)' : v <= 30 ? 'var(--warning, #d97706)' : 'var(--danger, #ef4444)';
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px" title="${fmtDate(r.eval_date)} · ${v.toFixed(1)}%">
              <div style="font-size:11px;font-weight:700;color:${color}">${v.toFixed(1)}%</div>
              <div style="width:100%;background:${color};height:${Math.max(4, h * 0.5)}px;border-radius:4px 4px 0 0"></div>
              <div class="muted" style="font-size:10px">${String(r.eval_date || '').slice(5, 10)}</div></div>`;
          }).join('')}
        </div></div>`;
    }).join('')}</div>`;
  }
  function exportCsv() {
    downloadCSV(`GaugeRR_실시현황_${todayStr()}.csv`, [
      { label: '품목', key: 'item_code' }, { label: '검사항목', key: 'inspect_item' },
      { label: '계측기', key: 'inst_code' }, { label: '계측기명', key: 'inst_name' },
      { label: '계획일', key: 'plan_date', csv: r => fmtDate(r.plan_date) },
      { label: '실시일', key: 'eval_date', csv: r => fmtDate(r.eval_date) },
      { label: '%GRR', key: 'grr', csv: r => (r.grr != null ? r.grr.toFixed(1) : '') },
      { label: 'ndc', key: 'ndc' }, { label: '판정', key: 'judgment' }, { label: '상태', key: 'status' },
    ], filtered());
    toast('CSV로 내보냈습니다.');
  }
  async function reload() {
    try { await loadAll(); renderStats(); renderChips(); render(); }
    catch (e) { root.querySelector('#gs-table').innerHTML = `<div class="empty">${icon('alert', 46)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
  }
  reload();
}
