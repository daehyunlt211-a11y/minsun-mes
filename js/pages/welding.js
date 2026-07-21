// =====================================================================
// 용접기술관리 — WPS / 인정기록서(PQR) / 용접사 관리
//   · WPS: 용접조건 전체(모재 두께범위·와이어·보호가스·전류/전압·예열·층간온도·자세)
//   · PQR: 시험편·시험결과(외관/인장/굽힘)·인정범위, WPS 다중연결
//   · 용접사: 가능 용접법·자세·모재 두께범위, 자격만료 D-30/D-7 경고
// =====================================================================
import { createCrudPage } from '../lib/crud.js';
import { db } from '../lib/db.js';
import { num, fmtDate, todayStr, escapeHtml, nextDocNo, downloadCSV } from '../lib/format.js';
import { badge, toast, openModal, confirmDialog } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { printSheet } from '../lib/barcode.js';

const WELD_PROCESS = ['GTAW(TIG)', 'GMAW(MIG/MAG)', 'SMAW(피복아크)', 'FCAW', 'SAW', 'SPOT', '기타'];
const POSITIONS = ['1G(F)', '2G(H)', '3G(V)', '4G(OH)', '1F', '2F', '3F', '4F', 'ALL'];
const DOC_STATUS = ['작성중', '검토중', '승인', '개정', '폐기'];

function stat(label, value, unit, ic, tint) {
  return `<div class="stat"><div class="stat__top"><span class="stat__label">${escapeHtml(label)}</span><span class="stat__ico ico-tint-${tint}">${icon(ic, 21)}</span></div><div class="stat__value">${value}${unit ? `<small>${escapeHtml(unit)}</small>` : ''}</div></div>`;
}
function info(label, val) {
  return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:11px 13px"><div class="muted" style="font-size:11.5px">${escapeHtml(label)}</div><div style="font-weight:700;margin-top:2px">${escapeHtml(val ?? '')}</div></div>`;
}
const dday = (d) => (d ? Math.round((new Date(String(d).slice(0, 10)) - new Date(todayStr())) / 86400000) : null);

// =====================================================================
// 9-1 WPS 관리
// =====================================================================
export async function wpsDocs(root) {
  const state = { search: '', chip: '전체', selected: null };
  let rows = [], pqrs = [], items = [], processes = [], users = [], equipments = [];

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>용접절차 시방서 (WPS)</h1><p>용접조건을 정의하고 인정기록서(PQR)와 연결합니다. <b>승인된 WPS만 작업표준서·현장에 적용</b>됩니다.</p></div>
      <div class="page-head__actions">
        <button class="btn" id="wps-copy">${icon('layers', 16)} 복사 후 개정</button>
        <button class="btn" id="wps-refresh">${icon('refresh', 16)} 새로고침</button>
        <button class="btn btn--primary" id="wps-add">${icon('plus', 16)} WPS 등록</button>
      </div>
    </div>
    <div id="wps-stats"></div>
    <div class="card" style="margin-bottom:16px">
      <div class="toolbar"><div class="search-box grow">${icon('search', 16)}<input id="wps-search" placeholder="WPS번호·제목·용접법·모재 검색" autocomplete="off"/></div></div>
      <div class="toolbar" style="border-top:0;padding-top:12px"><div class="chips" id="wps-chips"></div></div>
      <div class="table-wrap"><div id="wps-table"><div class="spinner"></div></div></div>
    </div>
    <div id="wps-detail"></div>`;
  root.querySelector('#wps-refresh').onclick = () => reload();
  root.querySelector('#wps-add').onclick = () => openForm(null);
  root.querySelector('#wps-copy').onclick = () => { if (!state.selected) { toast('복사할 WPS를 목록에서 선택하세요.', 'error'); return; } openForm(state.selected, true); };
  root.querySelector('#wps-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });

  async function loadAll() {
    [rows, pqrs, items, processes, users, equipments] = await Promise.all([
      db.all('wps_docs', {}).catch(() => []),
      db.all('pqr_docs', {}).catch(() => []),
      db.all('items', { sort: 'code' }).catch(() => []),
      db.all('processes', { sort: 'code' }).catch(() => []),
      db.all('users', { sort: 'name' }).catch(() => []),
      db.all('equipments', { sort: 'code' }).catch(() => []),
    ]);
  }
  function scoped() {
    const q = state.search.toLowerCase();
    return rows.filter(r => {
      if (state.chip !== '전체' && (r.status || '작성중') !== state.chip) return false;
      if (q && ![r.wps_no, r.title, r.welding_process, r.base_metal, r.filler_metal, r.pqr_no].some(v => String(v ?? '').toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => String(a.wps_no).localeCompare(String(b.wps_no)));
  }
  function renderStats() {
    root.querySelector('#wps-stats').innerHTML = `<div class="stat-grid">
      ${stat('총 WPS', num(rows.length), '건', 'fileText', 'brand')}
      ${stat('승인', num(rows.filter(r => r.status === '승인').length), '건', 'checkCircle', 'green')}
      ${stat('PQR 미연결', num(rows.filter(r => !r.pqr_no).length), '건', 'alert', 'amber')}
      ${stat('적용 용접법', num(new Set(rows.map(r => r.welding_process).filter(Boolean)).size), '종', 'zap', 'violet')}</div>`;
  }
  function renderChips() {
    const wrap = root.querySelector('#wps-chips');
    const opts = [['전체', rows.length], ...DOC_STATUS.map(s => [s, rows.filter(r => (r.status || '작성중') === s).length])];
    wrap.innerHTML = opts.map(([t, c]) => `<button class="chip ${state.chip === t ? 'active' : ''}" data-c="${t}">${t}<span class="chip__count">${c}</span></button>`).join('');
    wrap.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { state.chip = b.dataset.c; renderChips(); renderTable(); });
  }
  function renderTable() {
    const list = scoped(); const slot = root.querySelector('#wps-table');
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:44px">${icon('inbox', 46)}<h4>WPS가 없습니다</h4></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th>WPS번호</th><th class="center">Rev</th><th>제목</th><th class="center">용접법</th><th>모재</th><th>두께범위</th><th>용가재</th>
      <th>보호가스</th><th class="center">전류/전압</th><th class="center">자세</th><th>PQR</th><th class="center">상태</th><th class="center" style="width:110px">관리</th>
    </tr></thead><tbody>${list.map(r => `<tr class="clickable ${state.selected?.id === r.id ? 'is-selected' : ''}" data-id="${r.id}">
      <td class="cell-code">${escapeHtml(r.wps_no)}</td><td class="center mono">${escapeHtml(r.rev || 'A')}</td>
      <td class="cell-strong">${escapeHtml(r.title || '')}</td><td class="center">${badge(r.welding_process || '', 'brand')}</td>
      <td>${escapeHtml(r.base_metal || '')}</td><td class="muted">${escapeHtml(r.thickness_range || '')}</td>
      <td>${escapeHtml(r.filler_metal || '')}</td><td class="muted">${escapeHtml(r.shielding_gas || '')}</td>
      <td class="center mono">${escapeHtml(r.current_range || '')} / ${escapeHtml(r.voltage_range || '')}</td>
      <td class="center">${escapeHtml(r.position || '')}</td>
      <td class="cell-code">${r.pqr_no ? escapeHtml(r.pqr_no) : `<span class="badge badge--warning" style="height:19px">미연결</span>`}</td>
      <td class="center">${badge(r.status || '작성중')}</td>
      <td class="center"><div class="row-actions">
        <button class="icon-btn" data-print="${r.id}" title="WPS 출력">${icon('fileText', 15)}</button>
        <button class="icon-btn" data-edit="${r.id}" title="수정">${icon('edit', 15)}</button>
        <button class="icon-btn" data-del="${r.id}" title="삭제">${icon('trash', 15)}</button></div></td>
    </tr>`).join('')}</tbody></table>`;
    slot.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = (e) => { if (e.target.closest('button')) return; state.selected = list.find(x => x.id === tr.dataset.id); renderTable(); renderDetail(); });
    slot.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openForm(list.find(x => x.id === b.dataset.edit)));
    slot.querySelectorAll('[data-print]').forEach(b => b.onclick = () => printWPS(list.find(x => x.id === b.dataset.print)));
    slot.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const r = list.find(x => x.id === b.dataset.del);
      if (r.status === '승인') { toast('승인된 WPS는 삭제할 수 없습니다. 폐기 처리하세요.', 'error'); return; }
      if (!(await confirmDialog({ message: `[${r.wps_no}]을(를) 삭제하시겠습니까?`, confirmText: '삭제' }))) return;
      try { await db.remove('wps_docs', r.id); toast('삭제되었습니다.'); state.selected = null; reload(); } catch (e) { toast(e.message || '삭제 실패', 'error'); }
    });
  }
  function renderDetail() {
    const r = state.selected; const slot = root.querySelector('#wps-detail');
    if (!r) { slot.innerHTML = ''; return; }
    const pqr = pqrs.find(p => p.pqr_no === r.pqr_no);
    slot.innerHTML = `<div class="card">
      <div class="card__head">
        <div><div class="flex" style="gap:8px"><span class="cell-code" style="font-size:14px">${escapeHtml(r.wps_no)}</span>
          <span class="badge badge--neutral">Rev.${escapeHtml(r.rev || 'A')}</span>${badge(r.welding_process || '', 'brand')}${badge(r.status || '작성중')}</div>
          <h3 style="margin-top:4px">${escapeHtml(r.title || '')}</h3></div>
        <div class="spacer"></div>
        ${r.status !== '승인' ? `<button class="btn btn--primary btn--sm" id="wps-approve">${icon('check', 14)} 승인</button>` : ''}
        <button class="btn btn--sm" id="wps-print">${icon('fileText', 14)} WPS 출력</button>
      </div>
      <div class="card__body">
        <div class="grid-3" style="margin-bottom:14px">
          ${info('모재 / 두께범위', `${r.base_metal || '-'} / ${r.thickness_range || '-'}`)}
          ${info('용가재 / 와이어', `${r.filler_metal || '-'} / ${r.wire_spec || '-'}`)}
          ${info('보호가스', r.shielding_gas || '-')}
          ${info('전류 (A)', r.current_range || '-')}${info('전압 (V)', r.voltage_range || '-')}${info('용접속도', r.travel_speed || '-')}
          ${info('예열온도', r.preheat_temp || '-')}${info('층간온도', r.interpass_temp || '-')}${info('용접자세', r.position || '-')}
          ${info('적용 용접기', r.weld_equipment || '-')}${info('적용 공정', r.apply_process || '-')}
          ${info('승인일 / 적용일', `${fmtDate(r.approve_date) || '-'} / ${fmtDate(r.apply_date) || '-'}`)}
        </div>
        <div class="grid-2">
          <div><h4 style="margin:0 0 8px;font-size:13.5px">적용 품목</h4>
            <div style="padding:11px 13px;background:var(--surface-2);border-radius:10px">${escapeHtml((r.apply_items || '').split(',').filter(Boolean).join(', ') || '지정 없음')}</div></div>
          <div><h4 style="margin:0 0 8px;font-size:13.5px">근거 인정기록서 (PQR)</h4>
            ${pqr ? `<div style="padding:11px 13px;background:var(--surface-2);border-radius:10px">
              <div class="flex between"><b>${escapeHtml(pqr.pqr_no)}</b>${badge(pqr.result || '')}</div>
              <div class="muted" style="margin-top:4px;font-size:12.5px">시험일 ${fmtDate(pqr.test_date)} · ${escapeHtml(pqr.test_agency || '')} · 인정범위: ${escapeHtml(pqr.qualified_range || '-')}</div></div>`
              : `<div style="padding:11px 13px;background:var(--danger-bg);border-radius:10px">${icon('alert', 15)} PQR이 연결되지 않았습니다. SQ 심사에서 <b>WPS 조건의 유효성 입증 자료</b>로 요구됩니다.</div>`}</div>
        </div>
      </div></div>`;
    const ap = slot.querySelector('#wps-approve');
    if (ap) ap.onclick = () => openApprove(r);
    slot.querySelector('#wps-print').onclick = () => printWPS(r);
  }
  function openApprove(r) {
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field col-2"><label>WPS</label><input class="input" value="${escapeHtml(r.wps_no)} · ${escapeHtml(r.title || '')}" readonly></div>
      <div class="field"><label>상태 <span class="req">*</span></label><select class="select" name="status">${DOC_STATUS.map(s => `<option value="${s}" ${(r.status || '작성중') === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="field"><label>승인자</label><select class="select" name="approver"><option value="">선택</option>
        ${users.map(u => `<option value="${escapeHtml(u.name)}" ${r.approver === u.name ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select></div>
      <div class="field"><label>승인일</label><input class="input" type="date" name="approve_date" value="${escapeHtml(String(r.approve_date || todayStr()).slice(0, 10))}"></div>
      <div class="field"><label>적용일</label><input class="input" type="date" name="apply_date" value="${escapeHtml(String(r.apply_date || todayStr()).slice(0, 10))}"></div>`;
    openModal({
      title: 'WPS 승인', body,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 저장</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => body.querySelector(`[name="${n}"]`).value.trim();
          if (g('status') === '승인' && !r.pqr_no) {
            const ok = await confirmDialog({ title: 'PQR 미연결', danger: false, confirmText: '그래도 승인', message: 'PQR이 연결되지 않았습니다.\nWPS 조건의 유효성 입증이 어려울 수 있습니다. 계속하시겠습니까?' });
            if (!ok) return;
          }
          try {
            await db.update('wps_docs', r.id, { status: g('status'), approver: g('approver'), approve_date: g('approve_date') || null, apply_date: g('apply_date') || null });
            close(); toast('저장되었습니다.'); await reload(); state.selected = rows.find(x => x.id === r.id); renderDetail();
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }
  function openForm(r, isCopy = false) {
    const isEdit = !!r && !isCopy;
    const v = (k, d = '') => (r ? (r[k] ?? d) : d);
    const selItems = String(v('apply_items', '')).split(',').map(s => s.trim()).filter(Boolean);
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field"><label>WPS번호 <span class="req">*</span></label><input class="input" name="wps_no" value="${escapeHtml(isCopy ? '' : v('wps_no'))}" placeholder="비워두면 자동채번"></div>
      <div class="field"><label>개정번호</label><input class="input" name="rev" value="${escapeHtml(isCopy ? String.fromCharCode((v('rev', 'A')).charCodeAt(0) + 1) : v('rev', 'A'))}"></div>
      <div class="field col-2"><label>제목 <span class="req">*</span></label><input class="input" name="title" value="${escapeHtml(v('title'))}" placeholder="예: AL5052 파이프 TIG 용접"></div>
      <div class="field"><label>용접법 <span class="req">*</span></label><select class="select" name="welding_process">${WELD_PROCESS.map(w => `<option value="${w}" ${v('welding_process', 'GMAW(MIG/MAG)') === w ? 'selected' : ''}>${w}</option>`).join('')}</select></div>
      <div class="field"><label>용접자세</label><select class="select" name="position">${POSITIONS.map(p => `<option value="${p}" ${v('position') === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
      <div class="field"><label>모재</label><input class="input" name="base_metal" value="${escapeHtml(v('base_metal'))}" placeholder="예: AL 5052-H32"></div>
      <div class="field"><label>모재 두께범위</label><input class="input" name="thickness_range" value="${escapeHtml(v('thickness_range'))}" placeholder="예: t1.0 ~ t3.0"></div>
      <div class="field"><label>용가재</label><input class="input" name="filler_metal" value="${escapeHtml(v('filler_metal'))}" placeholder="예: ER5356"></div>
      <div class="field"><label>와이어 규격</label><input class="input" name="wire_spec" value="${escapeHtml(v('wire_spec'))}" placeholder="예: Ø1.2mm"></div>
      <div class="field"><label>보호가스</label><input class="input" name="shielding_gas" value="${escapeHtml(v('shielding_gas'))}" placeholder="예: Ar 100% (15L/min)"></div>
      <div class="field"><label>전류범위 (A) <span class="req">*</span></label><input class="input" name="current_range" value="${escapeHtml(v('current_range'))}" placeholder="예: 90~130"></div>
      <div class="field"><label>전압범위 (V) <span class="req">*</span></label><input class="input" name="voltage_range" value="${escapeHtml(v('voltage_range'))}" placeholder="예: 12~16"></div>
      <div class="field"><label>용접속도</label><input class="input" name="travel_speed" value="${escapeHtml(v('travel_speed'))}" placeholder="예: 15~25 cm/min"></div>
      <div class="field"><label>예열온도</label><input class="input" name="preheat_temp" value="${escapeHtml(v('preheat_temp'))}" placeholder="예: 상온"></div>
      <div class="field"><label>층간온도</label><input class="input" name="interpass_temp" value="${escapeHtml(v('interpass_temp'))}" placeholder="예: 최대 150℃"></div>
      <div class="field"><label>적용 용접기</label><select class="select" name="weld_equipment"><option value="">선택</option>
        ${equipments.filter(e => e.equip_type === '용접기' || /용접/.test(e.name || '')).map(e => `<option value="${escapeHtml(e.code)}" ${v('weld_equipment') === e.code ? 'selected' : ''}>${escapeHtml(e.code)} · ${escapeHtml(e.name)}</option>`).join('')}</select></div>
      <div class="field"><label>적용 공정</label><select class="select" name="apply_process"><option value="">선택</option>
        ${processes.map(p => `<option value="${escapeHtml(p.name)}" ${v('apply_process') === p.name ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>근거 PQR</label><select class="select" name="pqr_no"><option value="">선택</option>
        ${pqrs.map(p => `<option value="${escapeHtml(p.pqr_no)}" ${v('pqr_no') === p.pqr_no ? 'selected' : ''}>${escapeHtml(p.pqr_no)} · ${escapeHtml(p.welding_process || '')} · ${escapeHtml(p.result || '')}</option>`).join('')}</select></div>
      <div class="field col-2"><label>적용 품목 <span class="muted">(다중선택)</span></label>
        <select class="select" name="apply_items" multiple size="4" style="height:auto">
          ${items.map(i => `<option value="${escapeHtml(i.code)}" ${selItems.includes(i.code) ? 'selected' : ''}>${escapeHtml(i.code)} · ${escapeHtml(i.name)}</option>`).join('')}</select></div>
      <div class="field"><label>작성자</label><select class="select" name="writer"><option value="">선택</option>
        ${users.map(u => `<option value="${escapeHtml(u.name)}" ${v('writer') === u.name ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select></div>
      <div class="field"><label>파일 URL</label><input class="input" name="file_url" value="${escapeHtml(v('file_url'))}"></div>
      <div class="field col-2"><label>비고</label><textarea class="textarea" name="remark">${escapeHtml(v('remark'))}</textarea></div>
      <div class="field col-2" id="wps-warn"></div>`;
    // 전류·전압 범위 검증
    const validate = () => {
      const w = body.querySelector('#wps-warn');
      const msgs = [];
      const chk = (val, label) => {
        if (!val) return;
        const m = String(val).match(/(\d+(?:\.\d+)?)\s*[~\-]\s*(\d+(?:\.\d+)?)/);
        if (!m) { msgs.push(`${label}는 "최소~최대" 형식으로 입력하세요.`); return; }
        if (Number(m[1]) >= Number(m[2])) msgs.push(`${label}의 최소값이 최대값보다 크거나 같습니다.`);
      };
      chk(body.querySelector('[name="current_range"]').value, '전류범위');
      chk(body.querySelector('[name="voltage_range"]').value, '전압범위');
      w.innerHTML = msgs.length ? `<div class="flex" style="padding:10px 12px;background:var(--danger-bg);border-radius:10px;gap:8px">${icon('alert', 16)} ${msgs.join(' / ')}</div>` : '';
      return msgs.length === 0;
    };
    body.querySelector('[name="current_range"]').addEventListener('blur', validate);
    body.querySelector('[name="voltage_range"]').addEventListener('blur', validate);
    // PQR 선택 시 조건 자동 입력
    body.querySelector('[name="pqr_no"]').addEventListener('change', (e) => {
      const p = pqrs.find(x => x.pqr_no === e.target.value);
      if (!p) return;
      const set = (n, val) => { const el = body.querySelector(`[name="${n}"]`); if (el && !el.value && val) el.value = val; };
      set('base_metal', p.base_metal); set('filler_metal', p.filler_metal);
      const wp = body.querySelector('[name="welding_process"]');
      if (p.welding_process && [...wp.options].some(o => o.value === p.welding_process)) wp.value = p.welding_process;
    });
    openModal({
      title: `WPS ${isEdit ? '수정' : isCopy ? '복사 후 개정' : '등록'}`, body, wide: true,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 저장</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => { const el = body.querySelector(`[name="${n}"]`); return el ? el.value.trim() : ''; };
          if (!g('title')) { toast('제목을 입력하세요.', 'error'); return; }
          if (!validate()) { toast('전류·전압 범위를 확인하세요.', 'error'); return; }
          const payload = {
            rev: g('rev') || 'A', title: g('title'), welding_process: g('welding_process'), position: g('position'),
            base_metal: g('base_metal'), thickness_range: g('thickness_range'), filler_metal: g('filler_metal'),
            wire_spec: g('wire_spec'), shielding_gas: g('shielding_gas'), current_range: g('current_range'),
            voltage_range: g('voltage_range'), travel_speed: g('travel_speed'), preheat_temp: g('preheat_temp'),
            interpass_temp: g('interpass_temp'), weld_equipment: g('weld_equipment'), apply_process: g('apply_process'),
            pqr_no: g('pqr_no'), apply_items: [...body.querySelector('[name="apply_items"]').selectedOptions].map(o => o.value).join(','),
            writer: g('writer'), file_url: g('file_url'), remark: g('remark'),
          };
          try {
            if (isEdit) await db.update('wps_docs', r.id, payload);
            else {
              payload.wps_no = g('wps_no') || nextDocNo('WPS', rows.map(x => x.wps_no));
              payload.status = '작성중'; payload.write_date = todayStr();
              if (rows.some(x => x.wps_no === payload.wps_no)) { toast('이미 존재하는 WPS번호입니다.', 'error'); return; }
              await db.insert('wps_docs', payload);
            }
            close(); toast('저장되었습니다.'); await reload();
            if (isEdit) { state.selected = rows.find(x => x.id === r.id); renderDetail(); }
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }
  function printWPS(r) {
    const pqr = pqrs.find(p => p.pqr_no === r.pqr_no);
    printSheet(`WPS_${r.wps_no}`, `
      <h1>용접절차 시방서 (WPS)</h1><div class="sub">(주)민선 MES·QMS</div>
      <table>
        <tr><th style="width:110px">WPS 번호</th><td>${r.wps_no}</td><th style="width:110px">개정번호</th><td>Rev.${r.rev || 'A'}</td></tr>
        <tr><th>제목</th><td colspan="3">${r.title || ''}</td></tr>
        <tr><th>용접법</th><td>${r.welding_process || ''}</td><th>용접자세</th><td>${r.position || ''}</td></tr>
        <tr><th>모재</th><td>${r.base_metal || ''}</td><th>모재 두께범위</th><td>${r.thickness_range || ''}</td></tr>
        <tr><th>용가재</th><td>${r.filler_metal || ''}</td><th>와이어 규격</th><td>${r.wire_spec || ''}</td></tr>
        <tr><th>보호가스</th><td>${r.shielding_gas || ''}</td><th>용접속도</th><td>${r.travel_speed || ''}</td></tr>
        <tr><th>전류범위 (A)</th><td>${r.current_range || ''}</td><th>전압범위 (V)</th><td>${r.voltage_range || ''}</td></tr>
        <tr><th>예열온도</th><td>${r.preheat_temp || ''}</td><th>층간온도</th><td>${r.interpass_temp || ''}</td></tr>
        <tr><th>적용 용접기</th><td>${r.weld_equipment || ''}</td><th>적용 공정</th><td>${r.apply_process || ''}</td></tr>
        <tr><th>적용 품목</th><td colspan="3">${(r.apply_items || '').split(',').filter(Boolean).join(', ')}</td></tr>
        <tr><th>근거 PQR</th><td>${r.pqr_no || '-'}</td><th>PQR 결과</th><td>${pqr ? `${pqr.result || ''} (${(pqr.test_date || '').slice(0, 10)})` : '-'}</td></tr>
        <tr><th>승인일</th><td>${(r.approve_date || '').slice(0, 10)}</td><th>적용일</th><td>${(r.apply_date || '').slice(0, 10)}</td></tr>
      </table>
      <div class="sign"><div><div class="t">작 성</div><div class="s">${r.writer || ''}</div></div>
        <div><div class="t">검 토</div><div class="s"></div></div>
        <div><div class="t">승 인</div><div class="s">${r.approver || ''}</div></div></div>
      <div class="foot"><span>출력일시: ${new Date().toLocaleString('ko-KR')}</span><span>MINSUN MES·QMS</span></div>`);
  }
  async function reload() {
    try { await loadAll(); renderStats(); renderChips(); renderTable(); if (state.selected) { state.selected = rows.find(x => x.id === state.selected.id); renderDetail(); } }
    catch (e) { root.querySelector('#wps-table').innerHTML = `<div class="empty">${icon('alert', 46)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
  }
  reload();
}

// =====================================================================
// 9-2 인정기록서 (PQR)
// =====================================================================
export const pqrDocs = createCrudPage({
  table: 'pqr_docs', title: '인정기록서 (PQR)', subtitle: 'WPS 조건의 유효성을 입증하는 시험 기록입니다. 외관·인장·굽힘 시험결과와 인정범위를 관리합니다.',
  searchFields: ['pqr_no', 'wps_no', 'welding_process', 'welder', 'test_agency', 'cert_no'], searchPlaceholder: 'PQR번호·WPS·용접사·시험기관 검색',
  defaultSort: { key: 'test_date', dir: 'desc' },
  dateField: { key: 'test_date', label: '시험일' },
  filters: [{ key: 'result', label: '결과', options: ['합격', '불합격'] }, { key: 'status', label: '상태', options: ['유효', '만료', '폐기'] }],
  statusChips: { key: 'result', options: ['합격', '불합격'] },
  docNoField: { key: 'pqr_no', prefix: 'PQR' },
  wideForm: true,
  stats: async (rows) => [
    { label: '총 PQR', value: num(rows.length), unit: '건', icon: 'fileText', tint: 'brand' },
    { label: '합격', value: num(rows.filter(r => r.result === '합격').length), unit: '건', icon: 'checkCircle', tint: 'green' },
    { label: '유효', value: num(rows.filter(r => (r.status || '유효') === '유효').length), unit: '건', icon: 'shield', tint: 'violet' },
    { label: '불합격', value: num(rows.filter(r => r.result === '불합격').length), unit: '건', icon: 'alert', tint: 'red' },
  ],
  columns: [
    { key: 'pqr_no', label: 'PQR번호', cls: 'cell-code', sortable: true },
    { key: 'test_date', label: '시험일', type: 'date', sortable: true },
    { key: 'wps_no', label: '관련 WPS', cls: 'cell-code' },
    { key: 'welding_process', label: '용접법', type: 'badge', tone: 'brand' },
    { key: 'base_metal', label: '모재' },
    { key: 'thickness', label: '두께' },
    { key: 'welder', label: '시험 용접사' },
    { key: 'visual_result', label: '외관', align: 'center' },
    { key: 'tensile_result', label: '인장', align: 'center' },
    { key: 'bend_result', label: '굽힘', align: 'center' },
    { key: 'qualified_range', label: '인정범위' },
    { key: 'test_agency', label: '시험기관' },
    { key: 'result', label: '최종판정', type: 'badge', align: 'center' },
    { key: 'status', label: '상태', type: 'badge', align: 'center' },
  ],
  // 시험결과 모두 합격이면 최종판정 자동 합격
  beforeSave: (data) => {
    const rs = [data.visual_result, data.tensile_result, data.bend_result].filter(Boolean);
    if (rs.length && rs.every(x => x === '합격')) data.result = '합격';
    else if (rs.some(x => x === '불합격')) data.result = '불합격';
  },
  fields: [
    { key: 'pqr_no', label: 'PQR번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'test_date', label: '시험일', type: 'date', required: true, default: todayStr() },
    { key: 'wps_no', label: '관련 WPS', ref: { table: 'wps_docs', value: 'wps_no', label: (r) => `${r.wps_no} · ${r.title || ''}`, fill: { welding_process: 'welding_process', base_metal: 'base_metal', filler_metal: 'filler_metal' } }, placeholder: 'WPS 선택 (조건 자동입력)' },
    { key: 'welding_process', label: '용접법', type: 'select', options: WELD_PROCESS, default: 'GMAW(MIG/MAG)' },
    { key: 'base_metal', label: '모재' },
    { key: 'thickness', label: '시험 모재 두께', placeholder: '예: t2.0' },
    { key: 'filler_metal', label: '용가재' },
    { key: 'welder', label: '시험 용접사', ref: { table: 'welders', value: 'name', label: (r) => `${r.code} · ${r.name}` }, placeholder: '용접사 선택' },
    { key: 'specimen_info', label: '시험편 정보', col2: true, placeholder: '예: 판재 맞대기 용접 시험편 300×150×t2.0, 2매' },
    { key: 'weld_condition', label: '실제 용접조건', col2: true, type: 'textarea', placeholder: '예: 전류 110A, 전압 14V, 속도 20cm/min, Ar 15L/min' },
    { key: 'visual_result', label: '외관시험', type: 'select', options: ['합격', '불합격'], default: '합격' },
    { key: 'tensile_result', label: '인장시험', type: 'select', options: ['합격', '불합격'], default: '합격' },
    { key: 'bend_result', label: '굽힘시험', type: 'select', options: ['합격', '불합격'], default: '합격' },
    { key: 'other_result', label: '기타시험 (침투탐상 등)' },
    { key: 'qualified_range', label: '인정범위', col2: true, placeholder: '예: AL5052 t1.0~t4.0, 1G/2G 자세, GTAW' },
    { key: 'test_agency', label: '시험기관' },
    { key: 'cert_no', label: '성적서번호' },
    { key: 'cert_url', label: '성적서 URL' },
    { key: 'result', label: '최종판정(자동)', type: 'select', options: ['합격', '불합격'], default: '합격' },
    { key: 'writer', label: '작성자', ref: { table: 'users', value: 'name', label: (r) => `${r.name}` }, placeholder: '작성자 선택' },
    { key: 'status', label: '상태', type: 'select', options: ['유효', '만료', '폐기'], default: '유효' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// =====================================================================
// 9-3 용접사 관리
// =====================================================================
export async function welders(root) {
  const state = { search: '', chip: '전체', selected: null };
  let rows = [], depts = [], wpsList = [], pqrList = [], users = [];

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>용접사 관리</h1><p>용접사 자격(가능 용접법·자세·모재 두께범위)과 유효기간을 관리합니다. <b>만료 D-30/D-7 자동 경고</b>, 만료자는 작업배정 시 경고됩니다.</p></div>
      <div class="page-head__actions">
        <button class="btn" id="wd-csv">${icon('download', 16)} 엑셀(CSV)</button>
        <button class="btn" id="wd-refresh">${icon('refresh', 16)} 새로고침</button>
        <button class="btn btn--primary" id="wd-add">${icon('plus', 16)} 용접사 등록</button>
      </div>
    </div>
    <div id="wd-stats"></div>
    <div style="display:grid;grid-template-columns:1fr 380px;gap:18px;align-items:start">
      <div class="card">
        <div class="toolbar"><div class="search-box grow">${icon('search', 16)}<input id="wd-search" placeholder="사번·이름·자격증번호·용접법 검색" autocomplete="off"/></div></div>
        <div class="toolbar" style="border-top:0;padding-top:12px"><div class="chips" id="wd-chips"></div></div>
        <div class="table-wrap"><div id="wd-table"><div class="spinner"></div></div></div>
      </div>
      <div class="card" id="wd-detail"><div class="card__body"><div class="empty" style="padding:60px 16px">${icon('users', 48)}<h4>용접사를 선택하세요</h4></div></div></div>
    </div>`;
  root.querySelector('#wd-refresh').onclick = () => reload();
  root.querySelector('#wd-add').onclick = () => openForm(null);
  root.querySelector('#wd-csv').onclick = () => exportCsv();
  root.querySelector('#wd-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });

  async function loadAll() {
    [rows, depts, wpsList, pqrList, users] = await Promise.all([
      db.all('welders', { sort: 'code' }).catch(() => []),
      db.all('departments', { sort: 'code' }).catch(() => []),
      db.all('wps_docs', {}).catch(() => []),
      db.all('pqr_docs', {}).catch(() => []),
      db.all('users', { sort: 'name' }).catch(() => []),
    ]);
    // 유효기간 기준 상태 자동 보정
    rows = rows.map(r => {
      const dd = dday(r.expire_date);
      const st = dd == null ? (r.status || '유효') : dd < 0 ? '만료' : dd <= 60 ? '만료임박' : '유효';
      return { ...r, _status: st, _dday: dd };
    });
  }
  function scoped() {
    const q = state.search.toLowerCase();
    return rows.filter(r => {
      if (state.chip !== '전체' && r._status !== state.chip) return false;
      if (q && ![r.code, r.emp_no, r.name, r.cert_no, r.cert_type, r.welding_process].some(v => String(v ?? '').toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => (a._dday ?? 99999) - (b._dday ?? 99999));
  }
  function renderStats() {
    root.querySelector('#wd-stats').innerHTML = `<div class="stat-grid">
      ${stat('총 용접사', num(rows.length), '명', 'users', 'brand')}
      ${stat('유효 자격', num(rows.filter(r => r._status === '유효').length), '명', 'checkCircle', 'green')}
      ${stat('만료임박(60일)', num(rows.filter(r => r._status === '만료임박').length), '명', 'clock', 'amber')}
      ${stat('만료', num(rows.filter(r => r._status === '만료').length), '명', 'alert', 'red')}</div>`;
  }
  function renderChips() {
    const wrap = root.querySelector('#wd-chips');
    const opts = [['전체', rows.length], ...['유효', '만료임박', '만료'].map(s => [s, rows.filter(r => r._status === s).length])];
    wrap.innerHTML = opts.map(([t, c]) => `<button class="chip ${state.chip === t ? 'active' : ''}" data-c="${t}">${t}<span class="chip__count">${c}</span></button>`).join('');
    wrap.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { state.chip = b.dataset.c; renderChips(); renderTable(); });
  }
  function renderTable() {
    const list = scoped(); const slot = root.querySelector('#wd-table');
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:44px">${icon('inbox', 46)}<h4>용접사가 없습니다</h4></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th>사번</th><th>이름</th><th>부서</th><th>자격종류</th><th>자격증번호</th><th class="center">용접법</th><th class="center">자세</th>
      <th>모재·두께</th><th class="center">만료일</th><th class="center">D-Day</th><th class="center">상태</th><th class="center" style="width:88px">관리</th>
    </tr></thead><tbody>${list.map(r => {
      const ddTxt = r._dday == null ? '-' : r._dday < 0 ? `만료 ${-r._dday}일` : `D-${r._dday}`;
      const ddTone = r._dday == null ? 'neutral' : r._dday < 0 ? 'danger' : r._dday <= 7 ? 'danger' : r._dday <= 30 ? 'warning' : 'neutral';
      return `<tr class="clickable ${state.selected?.id === r.id ? 'is-selected' : ''}" data-id="${r.id}">
        <td class="cell-code">${escapeHtml(r.emp_no || r.code)}</td><td class="cell-strong">${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.department || '')}</td><td>${escapeHtml(r.cert_type || '')}</td>
        <td class="muted">${escapeHtml(r.cert_no || '')}</td>
        <td class="center">${badge(r.welding_process || '', 'brand')}</td><td class="center">${escapeHtml(r.position_range || '')}</td>
        <td class="muted">${escapeHtml(r.base_metal || '')} ${escapeHtml(r.thickness_range || '')}</td>
        <td class="center">${fmtDate(r.expire_date) || '-'}</td><td class="center">${badge(ddTxt, ddTone)}</td>
        <td class="center">${badge(r._status)}</td>
        <td class="center"><div class="row-actions">
          <button class="icon-btn" data-edit="${r.id}" title="수정">${icon('edit', 15)}</button>
          <button class="icon-btn" data-del="${r.id}" title="삭제">${icon('trash', 15)}</button></div></td>
      </tr>`;
    }).join('')}</tbody></table>`;
    slot.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = (e) => { if (e.target.closest('button')) return; state.selected = list.find(x => x.id === tr.dataset.id); renderTable(); renderDetail(); });
    slot.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openForm(list.find(x => x.id === b.dataset.edit)));
    slot.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const r = list.find(x => x.id === b.dataset.del);
      if (!(await confirmDialog({ message: `용접사 [${r.name}]을(를) 삭제하시겠습니까?`, confirmText: '삭제' }))) return;
      try { await db.remove('welders', r.id); toast('삭제되었습니다.'); state.selected = null; reload(); } catch (e) { toast(e.message || '삭제 실패', 'error'); }
    });
  }
  function renderDetail() {
    const r = state.selected; const slot = root.querySelector('#wd-detail');
    if (!r) { slot.innerHTML = `<div class="card__body"><div class="empty" style="padding:60px 16px">${icon('users', 48)}<h4>용접사를 선택하세요</h4></div></div>`; return; }
    // 적용 가능한 WPS 검색 (용접법 + 자세 + 모재 일치)
    const applicable = wpsList.filter(w => {
      if (w.status !== '승인') return false;
      if (w.welding_process && r.welding_process && w.welding_process !== r.welding_process) return false;
      if (w.base_metal && r.base_metal && !String(r.base_metal).includes(String(w.base_metal).slice(0, 4))) return false;
      return true;
    });
    const myPqr = pqrList.filter(p => p.welder === r.name);
    slot.innerHTML = `
      <div class="card__head"><div><span class="cell-code">${escapeHtml(r.emp_no || r.code)}</span><h3 style="margin-top:4px">${escapeHtml(r.name)}</h3></div>
        <div class="spacer"></div>${badge(r._status)}</div>
      <div class="card__body">
        ${r._status !== '유효' ? `<div class="flex" style="padding:11px 13px;background:var(--danger-bg);border-radius:10px;gap:8px;margin-bottom:12px">
          ${icon('alert', 16)} <b>${r._status === '만료' ? '자격이 만료되었습니다.' : `자격 만료 ${r._dday}일 전입니다.`}</b> 작업 배정 전 갱신이 필요합니다.</div>` : ''}
        <div class="flex-col" style="gap:8px">
          ${info('부서', r.department || '-')}
          ${info('자격종류 / 자격증번호', `${r.cert_type || '-'} / ${r.cert_no || '-'}`)}
          ${info('가능 용접법', r.welding_process || '-')}
          ${info('인정 자세', r.position_range || '-')}
          ${info('인정 모재 / 두께범위', `${r.base_metal || '-'} / ${r.thickness_range || '-'}`)}
          ${info('취득일 / 만료일', `${fmtDate(r.issue_date) || '-'} / ${fmtDate(r.expire_date) || '-'}`)}
          ${info('갱신예정일', fmtDate(r.renewal_date) || '-')}
          ${info('평가결과', r.eval_result || '-')}
        </div>
        <h4 style="margin:16px 0 8px;font-size:13px">적용 가능한 WPS <span class="muted" style="font-weight:500">${applicable.length}건</span></h4>
        ${applicable.length ? `<div class="flex-col" style="gap:6px">${applicable.slice(0, 5).map(w => `<div class="flex between" style="padding:8px 11px;background:var(--surface-2);border-radius:9px;font-size:12.5px">
          <span><b>${escapeHtml(w.wps_no)}</b> ${escapeHtml(w.title || '')}</span><span class="muted">${escapeHtml(w.position || '')}</span></div>`).join('')}</div>`
          : `<div class="muted" style="font-size:12.5px">일치하는 승인 WPS가 없습니다.</div>`}
        <h4 style="margin:16px 0 8px;font-size:13px">PQR 시험 이력 <span class="muted" style="font-weight:500">${myPqr.length}건</span></h4>
        ${myPqr.length ? `<div class="flex-col" style="gap:6px">${myPqr.map(p => `<div class="flex between" style="padding:8px 11px;background:var(--surface-2);border-radius:9px;font-size:12.5px">
          <span>${escapeHtml(p.pqr_no)} · ${fmtDate(p.test_date)}</span>${badge(p.result || '')}</div>`).join('')}</div>`
          : `<div class="muted" style="font-size:12.5px">PQR 시험 이력이 없습니다.</div>`}
        ${r.cert_url ? `<div style="margin-top:14px"><a class="btn btn--sm" href="${escapeHtml(r.cert_url)}" target="_blank" rel="noopener">${icon('fileText', 14)} 자격증 보기</a></div>` : ''}
      </div>`;
  }
  function openForm(r) {
    const isEdit = !!r;
    const v = (k, d = '') => (r ? (r[k] ?? d) : d);
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field"><label>사번(코드) <span class="req">*</span></label><input class="input" name="code" value="${escapeHtml(v('code'))}" placeholder="예: WD-01"></div>
      <div class="field"><label>사번(사내)</label><input class="input" name="emp_no" value="${escapeHtml(v('emp_no'))}"></div>
      <div class="field"><label>이름 <span class="req">*</span></label>
        <select class="select" name="name"><option value="">직원 선택 또는 직접입력</option>
          ${users.map(u => `<option value="${escapeHtml(u.name)}" data-dept="${escapeHtml(u.department || '')}" ${v('name') === u.name ? 'selected' : ''}>${escapeHtml(u.name)} (${escapeHtml(u.department || '')})</option>`).join('')}</select></div>
      <div class="field"><label>부서</label><select class="select" name="department"><option value="">선택</option>
        ${depts.map(d => `<option value="${escapeHtml(d.name)}" ${v('department') === d.name ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}</select></div>
      <div class="field"><label>자격종류</label><input class="input" name="cert_type" value="${escapeHtml(v('cert_type'))}" placeholder="예: 용접기능사 / 사내인증"></div>
      <div class="field"><label>자격증번호</label><input class="input" name="cert_no" value="${escapeHtml(v('cert_no'))}"></div>
      <div class="field"><label>가능 용접법 <span class="req">*</span></label><select class="select" name="welding_process">${WELD_PROCESS.map(w => `<option value="${w}" ${v('welding_process', 'GMAW(MIG/MAG)') === w ? 'selected' : ''}>${w}</option>`).join('')}</select></div>
      <div class="field"><label>인정 자세</label><input class="input" name="position_range" value="${escapeHtml(v('position_range'))}" placeholder="예: 1G, 2F"></div>
      <div class="field"><label>인정 모재</label><input class="input" name="base_metal" value="${escapeHtml(v('base_metal'))}" placeholder="예: AL5052"></div>
      <div class="field"><label>인정 두께범위</label><input class="input" name="thickness_range" value="${escapeHtml(v('thickness_range'))}" placeholder="예: t1.0~t4.0"></div>
      <div class="field"><label>취득일</label><input class="input" type="date" name="issue_date" value="${escapeHtml(String(v('issue_date', '')).slice(0, 10))}"></div>
      <div class="field"><label>자격 만료일 <span class="req">*</span></label><input class="input" type="date" name="expire_date" value="${escapeHtml(String(v('expire_date', '')).slice(0, 10))}"></div>
      <div class="field"><label>갱신예정일</label><input class="input" type="date" name="renewal_date" value="${escapeHtml(String(v('renewal_date', '')).slice(0, 10))}"></div>
      <div class="field"><label>평가결과</label><input class="input" name="eval_result" value="${escapeHtml(v('eval_result'))}" placeholder="예: 사내 기량평가 합격(2026-05)"></div>
      <div class="field"><label>자격증 이미지 URL</label><input class="input" name="cert_url" value="${escapeHtml(v('cert_url'))}"></div>
      <div class="field"><label>교육자료 URL</label><input class="input" name="edu_url" value="${escapeHtml(v('edu_url'))}"></div>
      <div class="field col-2"><label>비고</label><textarea class="textarea" name="remark">${escapeHtml(v('remark'))}</textarea></div>`;
    body.querySelector('[name="name"]').addEventListener('change', (e) => {
      const dept = e.target.selectedOptions[0]?.dataset.dept;
      const ds = body.querySelector('[name="department"]');
      if (dept && !ds.value) { const opt = [...ds.options].find(o => o.value === dept); if (opt) ds.value = dept; }
    });
    // 만료일 → 갱신예정일 자동(30일 전)
    body.querySelector('[name="expire_date"]').addEventListener('change', (e) => {
      const rn = body.querySelector('[name="renewal_date"]');
      if (!e.target.value || rn.value) return;
      const d = new Date(e.target.value); d.setDate(d.getDate() - 30);
      rn.value = d.toISOString().slice(0, 10);
    });
    openModal({
      title: `용접사 ${isEdit ? '수정' : '등록'}`, body, wide: true,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 저장</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => { const el = body.querySelector(`[name="${n}"]`); return el ? el.value.trim() : ''; };
          if (!g('name')) { toast('이름을 선택/입력하세요.', 'error'); return; }
          let code = g('code');
          if (!code) {
            const nums = rows.map(x => parseInt(String(x.code).replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
            code = 'WD-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, '0');
          }
          const exp = g('expire_date');
          const dd = dday(exp);
          const payload = {
            code, emp_no: g('emp_no'), name: g('name'), department: g('department'),
            cert_type: g('cert_type'), cert_no: g('cert_no'), welding_process: g('welding_process'),
            position_range: g('position_range'), base_metal: g('base_metal'), thickness_range: g('thickness_range'),
            issue_date: g('issue_date') || null, expire_date: exp || null, renewal_date: g('renewal_date') || null,
            eval_result: g('eval_result'), cert_url: g('cert_url'), edu_url: g('edu_url'), remark: g('remark'),
            status: dd == null ? '유효' : dd < 0 ? '만료' : dd <= 60 ? '만료임박' : '유효',
            use_yn: !(dd != null && dd < 0),
          };
          try {
            if (isEdit) await db.update('welders', r.id, payload); else await db.insert('welders', payload);
            close(); toast('저장되었습니다.'); await reload();
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }
  function exportCsv() {
    downloadCSV(`용접사관리_${todayStr()}.csv`, [
      { label: '사번', key: 'code' }, { label: '이름', key: 'name' }, { label: '부서', key: 'department' },
      { label: '자격종류', key: 'cert_type' }, { label: '자격증번호', key: 'cert_no' },
      { label: '가능용접법', key: 'welding_process' }, { label: '인정자세', key: 'position_range' },
      { label: '인정모재', key: 'base_metal' }, { label: '두께범위', key: 'thickness_range' },
      { label: '취득일', key: 'issue_date', csv: r => fmtDate(r.issue_date) },
      { label: '만료일', key: 'expire_date', csv: r => fmtDate(r.expire_date) },
      { label: 'D-Day', key: 'dday', csv: r => (r._dday == null ? '' : (r._dday < 0 ? `만료 ${-r._dday}일` : `D-${r._dday}`)) },
      { label: '상태', key: '_status' },
    ], scoped());
    toast('CSV로 내보냈습니다.');
  }
  async function reload() {
    try { await loadAll(); renderStats(); renderChips(); renderTable(); if (state.selected) { state.selected = rows.find(x => x.id === state.selected.id); renderDetail(); } }
    catch (e) { root.querySelector('#wd-table').innerHTML = `<div class="empty">${icon('alert', 46)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
  }
  reload();
}
