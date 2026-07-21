// =====================================================================
// 변경관리 — 4M 변경관리 / PPAP 승인관리
//   · 4M: Man·Machine·Material·Method 버튼 선택, 변경 전/후 비교, 영향품목,
//         시험생산 결과, 고객승인, 적용 LOT, 관련 문서 개정 체크
//   · PPAP: 제출차수 자동증가, 제출서류 체크리스트(7종), 승인/조건부/반려
// =====================================================================
import { db } from '../lib/db.js';
import { num, fmtDate, todayStr, escapeHtml, nextDocNo, downloadCSV } from '../lib/format.js';
import { badge, toast, openModal, confirmDialog } from '../ui/components.js';
import { icon } from '../ui/icons.js';

const FOUR_M = [
  { key: 'Man', label: 'Man (작업자)', ic: 'users', before: '기존 작업자', after: '변경 작업자' },
  { key: 'Machine', label: 'Machine (설비)', ic: 'cpu', before: '기존 설비', after: '변경 설비' },
  { key: 'Material', label: 'Material (자재)', ic: 'box', before: '기존 자재', after: '변경 자재' },
  { key: 'Method', label: 'Method (방법)', ic: 'route', before: '기존 조건', after: '변경 조건' },
];
const FM_STATUS = ['신청', '검토중', '승인', '반려'];
const APPLY_STATUS = ['미적용', '적용중', '완료'];
const PPAP_STATUS = ['작성중', '제출', '승인', '조건부승인', '반려'];
const PPAP_DOCS = [
  ['chk_pfd', 'PFD (공정흐름도)'], ['chk_pfmea', 'PFMEA'], ['chk_cp', '관리계획서'], ['chk_ws', '작업표준서'],
  ['chk_result', '검사결과 (치수·재료)'], ['chk_drawing', '도면 및 사양서'], ['chk_customer', '고객 승인문서'],
];

function stat(label, value, unit, ic, tint) {
  return `<div class="stat"><div class="stat__top"><span class="stat__label">${escapeHtml(label)}</span><span class="stat__ico ico-tint-${tint}">${icon(ic, 21)}</span></div><div class="stat__value">${value}${unit ? `<small>${escapeHtml(unit)}</small>` : ''}</div></div>`;
}
function info(label, val) {
  return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:11px 13px"><div class="muted" style="font-size:11.5px">${escapeHtml(label)}</div><div style="font-weight:700;margin-top:2px">${escapeHtml(val ?? '')}</div></div>`;
}

// =====================================================================
// 7-1 4M 변경관리
// =====================================================================
export async function fourMChanges(root) {
  const state = { search: '', chip: '전체', fCat: '__all__', selected: null };
  let rows = [], items = [], processes = [], users = [], equipments = [], docs = [];

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>4M 변경관리</h1><p>Man·Machine·Material·Method 변경을 <b>사전 승인</b>하고 변경 전/후·시험생산·적용 LOT·관련 문서 개정을 관리합니다.</p></div>
      <div class="page-head__actions">
        <button class="btn" id="fm-csv">${icon('download', 16)} 엑셀(CSV)</button>
        <button class="btn" id="fm-refresh">${icon('refresh', 16)} 새로고침</button>
        <button class="btn btn--primary" id="fm-add">${icon('plus', 16)} 4M 변경 신청</button>
      </div>
    </div>
    <div id="fm-stats"></div>
    <div class="card" style="margin-bottom:16px">
      <div class="toolbar">
        <div class="search-box grow">${icon('search', 16)}<input id="fm-search" placeholder="변경번호·품목·공정·사유 검색" autocomplete="off"/></div>
        <select class="select" id="fm-fcat" style="width:auto;min-width:150px"><option value="__all__">전체 4M</option>${FOUR_M.map(f => `<option value="${f.key}">${f.label}</option>`).join('')}</select>
      </div>
      <div class="toolbar" style="border-top:0;padding-top:12px"><div class="chips" id="fm-chips"></div></div>
      <div class="table-wrap"><div id="fm-table"><div class="spinner"></div></div></div>
    </div>
    <div id="fm-detail"></div>`;

  root.querySelector('#fm-refresh').onclick = () => reload();
  root.querySelector('#fm-add').onclick = () => openForm(null);
  root.querySelector('#fm-csv').onclick = () => exportCsv();
  root.querySelector('#fm-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });
  root.querySelector('#fm-fcat').addEventListener('change', (e) => { state.fCat = e.target.value; renderTable(); });

  async function loadAll() {
    [rows, items, processes, users, equipments, docs] = await Promise.all([
      db.all('four_m_changes', {}).catch(() => []),
      db.all('items', { sort: 'code' }).catch(() => []),
      db.all('processes', { sort: 'code' }).catch(() => []),
      db.all('users', { sort: 'name' }).catch(() => []),
      db.all('equipments', { sort: 'code' }).catch(() => []),
      db.all('dev_docs', {}).catch(() => []),
    ]);
  }
  function scoped() {
    const q = state.search.toLowerCase();
    return rows.filter(r => {
      if (state.chip !== '전체') {
        if (state.chip === 'PPAP대상') { if (!r.ppap_yn) return false; }
        else if ((r.status || '신청') !== state.chip) return false;
      }
      if (state.fCat !== '__all__' && r.category !== state.fCat) return false;
      if (q && ![r.fm_no, r.item_code, r.item_name, r.process, r.reason, r.before_desc, r.after_desc].some(v => String(v ?? '').toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => String(b.change_date).localeCompare(String(a.change_date)));
  }
  function renderStats() {
    root.querySelector('#fm-stats').innerHTML = `<div class="stat-grid">
      ${stat('총 4M 변경', num(rows.length), '건', 'refresh', 'brand')}
      ${stat('승인 대기', num(rows.filter(r => ['신청', '검토중'].includes(r.status || '신청')).length), '건', 'clock', 'amber')}
      ${stat('PPAP 대상', num(rows.filter(r => r.ppap_yn).length), '건', 'clipboard', 'violet')}
      ${stat('적용 완료', num(rows.filter(r => r.apply_status === '완료').length), '건', 'checkCircle', 'green')}</div>`;
  }
  function renderChips() {
    const wrap = root.querySelector('#fm-chips');
    const opts = [['전체', rows.length], ...FM_STATUS.map(s => [s, rows.filter(r => (r.status || '신청') === s).length]), ['PPAP대상', rows.filter(r => r.ppap_yn).length]];
    wrap.innerHTML = opts.map(([t, c]) => `<button class="chip ${state.chip === t ? 'active' : ''}" data-c="${t}">${t}<span class="chip__count">${c}</span></button>`).join('');
    wrap.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { state.chip = b.dataset.c; renderChips(); renderTable(); });
  }
  function renderTable() {
    const list = scoped(); const slot = root.querySelector('#fm-table');
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:50px">${icon('inbox', 48)}<h4>4M 변경 내역이 없습니다</h4></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th>변경번호</th><th>변경일</th><th class="center">4M</th><th>품명</th><th>공정</th><th>변경사유</th>
      <th class="center">시험생산</th><th class="center">고객승인</th><th class="center">문서개정</th><th class="center">적용LOT</th><th class="center">승인상태</th><th class="center">적용</th><th class="center" style="width:88px">관리</th>
    </tr></thead><tbody>${list.map(r => {
      const docCnt = ['doc_pfmea_yn', 'doc_pfd_yn', 'doc_cp_yn', 'doc_ws_yn'].filter(k => r[k]).length;
      return `<tr class="clickable ${state.selected?.id === r.id ? 'is-selected' : ''}" data-id="${r.id}">
        <td class="cell-code">${escapeHtml(r.fm_no)}</td><td>${fmtDate(r.change_date)}</td>
        <td class="center">${badge(r.category || 'Machine', 'brand')}</td>
        <td class="cell-strong">${escapeHtml(r.item_name || '')}</td><td>${escapeHtml(r.process || '')}</td>
        <td>${escapeHtml(r.reason || '')}</td>
        <td class="center">${r.trial_result ? badge('완료', 'success') : '<span class="muted">-</span>'}</td>
        <td class="center">${r.customer_approval_yn ? (r.customer_approval_url ? badge('접수', 'success') : badge('필요', 'warning')) : '<span class="muted">불필요</span>'}</td>
        <td class="center">${docCnt ? `<span class="mono">${docCnt}/4</span>` : '<span class="muted">-</span>'}</td>
        <td class="center cell-code">${escapeHtml(r.apply_lot || '-')}</td>
        <td class="center">${badge(r.status || '신청')}</td>
        <td class="center">${badge(r.apply_status || '미적용', r.apply_status === '완료' ? 'success' : r.apply_status === '적용중' ? 'warning' : 'neutral')}</td>
        <td class="center"><div class="row-actions">
          <button class="icon-btn" data-edit="${r.id}" title="수정">${icon('edit', 15)}</button>
          <button class="icon-btn" data-del="${r.id}" title="삭제">${icon('trash', 15)}</button></div></td>
      </tr>`;
    }).join('')}</tbody></table>`;
    slot.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = (e) => { if (e.target.closest('button')) return; state.selected = list.find(x => x.id === tr.dataset.id); renderTable(); renderDetail(); });
    slot.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openForm(list.find(x => x.id === b.dataset.edit)));
    slot.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const r = list.find(x => x.id === b.dataset.del);
      if (!(await confirmDialog({ message: `[${r.fm_no}]을(를) 삭제하시겠습니까?`, confirmText: '삭제' }))) return;
      try { await db.remove('four_m_changes', r.id); toast('삭제되었습니다.'); state.selected = null; reload(); } catch (e) { toast(e.message || '삭제 실패', 'error'); }
    });
  }
  function renderDetail() {
    const r = state.selected; const slot = root.querySelector('#fm-detail');
    if (!r) { slot.innerHTML = ''; return; }
    const cat = FOUR_M.find(f => f.key === r.category) || FOUR_M[1];
    const relDocs = docs.filter(d => d.item_code === r.item_code);
    const docChecks = [['doc_pfd_yn', 'PFD'], ['doc_pfmea_yn', 'PFMEA'], ['doc_cp_yn', '관리계획서'], ['doc_ws_yn', '작업표준서']];
    slot.innerHTML = `<div class="card">
      <div class="card__head">
        <div><div class="flex" style="gap:8px"><span class="cell-code" style="font-size:14px">${escapeHtml(r.fm_no)}</span>${badge(r.category || '', 'brand')}${badge(r.status || '신청')}${badge(r.apply_status || '미적용', r.apply_status === '완료' ? 'success' : 'neutral')}</div>
          <h3 style="margin-top:4px">${escapeHtml(r.item_name || '')} <span class="muted" style="font-weight:600;font-size:13px">${escapeHtml(r.process || '')}</span></h3></div>
        <div class="spacer"></div>
        ${r.status !== '승인' ? `<button class="btn btn--primary btn--sm" id="fm-approve">${icon('check', 14)} 승인 처리</button>`
          : `<button class="btn btn--sm" id="fm-apply">${icon('activity', 14)} 적용 처리</button>`}
      </div>
      <div class="card__body">
        <h4 style="margin:0 0 10px;font-size:13.5px;display:flex;align-items:center;gap:8px">${icon(cat.ic, 16)} 변경 전·후 비교</h4>
        <div class="table-wrap" style="margin-bottom:16px"><table class="grid">
          <thead><tr><th style="width:130px">항목</th><th>변경 전</th><th>변경 후</th></tr></thead>
          <tbody><tr><td class="cell-strong">${escapeHtml(cat.label)}</td>
            <td style="white-space:pre-wrap">${escapeHtml(r.before_desc || '')}</td>
            <td style="white-space:pre-wrap;color:var(--brand);font-weight:600">${escapeHtml(r.after_desc || '')}</td></tr></tbody></table></div>
        <div class="grid-3" style="margin-bottom:16px">
          ${info('변경일', fmtDate(r.change_date))}${info('변경사유', r.reason || '-')}${info('승인자 / 승인일', `${r.approver || '-'} / ${fmtDate(r.approve_date) || '-'}`)}
          ${info('영향 품목', (r.affect_items || '').split(',').filter(Boolean).join(', ') || '-')}
          ${info('영향 설비', (r.affect_equipments || '').split(',').filter(Boolean).join(', ') || '-')}
          ${info('적용일 / 적용 LOT', `${fmtDate(r.apply_date) || '-'} / ${r.apply_lot || '-'}`)}
        </div>
        <div class="grid-2">
          <div>
            <h4 style="margin:0 0 8px;font-size:13.5px">시험생산 결과</h4>
            <div style="padding:12px 14px;background:var(--surface-2);border-radius:10px;min-height:60px;white-space:pre-wrap">${escapeHtml(r.trial_result || '미실시')}</div>
            ${r.trial_date ? `<div class="muted" style="margin-top:5px;font-size:12px">실시일: ${fmtDate(r.trial_date)}</div>` : ''}
          </div>
          <div>
            <h4 style="margin:0 0 8px;font-size:13.5px">관련 문서 개정 필요 여부</h4>
            <div class="flex-col" style="gap:7px">
              ${docChecks.map(([k, label]) => {
                const need = !!r[k];
                const doc = relDocs.filter(d => d.doc_type === (label === 'PFD' ? 'PFD' : label)).sort((a, b) => String(b.rev || '').localeCompare(String(a.rev || '')))[0];
                return `<div class="flex between" style="padding:8px 12px;background:var(--surface-2);border-radius:9px">
                  <span>${need ? icon('check', 14) : icon('x', 14)} ${escapeHtml(label)}</span>
                  ${need ? (doc ? `<span class="badge badge--${doc.status === '승인' ? 'success' : 'warning'}">${escapeHtml(doc.doc_no)} Rev.${escapeHtml(doc.rev || 'A')} · ${escapeHtml(doc.status || '')}</span>` : badge('문서 없음', 'danger')) : '<span class="muted">불필요</span>'}
                </div>`;
              }).join('')}
            </div>
            ${r.customer_approval_yn ? `<div class="flex" style="margin-top:10px;padding:10px 12px;background:var(--surface-2);border-radius:9px;gap:8px">
              ${icon('clipboard', 15)} 고객승인 ${r.customer_approval_url ? `<a href="${escapeHtml(r.customer_approval_url)}" target="_blank" rel="noopener" style="color:var(--brand);font-weight:600">승인서 열기</a>` : '<b style="color:var(--warning)">미접수</b>'}</div>` : ''}
          </div>
        </div>
      </div></div>`;
    const ap = slot.querySelector('#fm-approve'); if (ap) ap.onclick = () => openApprove(r);
    const apl = slot.querySelector('#fm-apply'); if (apl) apl.onclick = () => openApply(r);
  }

  function openApprove(r) {
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field col-2"><label>변경 건</label><input class="input" value="${escapeHtml(r.fm_no)} · ${escapeHtml(r.category || '')} · ${escapeHtml(r.item_name || '')}" readonly></div>
      <div class="field"><label>승인상태 <span class="req">*</span></label><select class="select" name="status">${FM_STATUS.map(s => `<option value="${s}" ${(r.status || '신청') === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="field"><label>승인자</label><select class="select" name="approver"><option value="">선택</option>
        ${users.map(u => `<option value="${escapeHtml(u.name)}" ${r.approver === u.name ? 'selected' : ''}>${escapeHtml(u.name)} (${escapeHtml(u.department || '')})</option>`).join('')}</select></div>
      <div class="field"><label>승인일</label><input class="input" type="date" name="approve_date" value="${escapeHtml(String(r.approve_date || todayStr()).slice(0, 10))}"></div>
      <div class="field"><label>시험생산 실시일</label><input class="input" type="date" name="trial_date" value="${escapeHtml(String(r.trial_date || '').slice(0, 10))}"></div>
      <div class="field col-2"><label>시험생산 결과</label><textarea class="textarea" name="trial_result" placeholder="예: 시험생산 50EA, 치수 전수검사 이상 없음 (Cpk 1.52)">${escapeHtml(r.trial_result || '')}</textarea></div>
      <div class="field col-2 muted" style="background:var(--surface-2);padding:10px 12px;border-radius:10px">
        ${icon('alert', 15)} SQ 심사 확인사항: 4M 변경은 <b>적용 전 승인</b>되어야 하며, 품질영향 검토(시험생산)와 관련 문서 개정이 완료되어야 합니다.</div>`;
    openModal({
      title: '4M 변경 승인', body, wide: true,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 저장</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => body.querySelector(`[name="${n}"]`).value.trim();
          const status = g('status');
          if (status === '승인') {
            const needDocs = ['doc_pfd_yn', 'doc_pfmea_yn', 'doc_cp_yn', 'doc_ws_yn'].filter(k => r[k]);
            if (r.customer_approval_yn && !r.customer_approval_url) {
              const ok = await confirmDialog({ title: '고객승인 미접수', danger: false, confirmText: '그래도 승인', message: '고객승인이 필요한 변경이나 승인서가 첨부되지 않았습니다.\n계속 진행하시겠습니까?' });
              if (!ok) return;
            }
            if (!g('trial_result')) {
              const ok = await confirmDialog({ title: '시험생산 미실시', danger: false, confirmText: '그래도 승인', message: '시험생산 결과가 입력되지 않았습니다.\nSQ 심사에서 품질영향 검토 미흡으로 지적될 수 있습니다. 계속하시겠습니까?' });
              if (!ok) return;
            }
          }
          try {
            await db.update('four_m_changes', r.id, {
              status, approver: g('approver'), approve_date: g('approve_date') || null,
              trial_date: g('trial_date') || null, trial_result: g('trial_result'),
            });
            close(); toast('저장되었습니다.'); await reload(); state.selected = rows.find(x => x.id === r.id); renderDetail();
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }

  function openApply(r) {
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field col-2"><label>변경 건</label><input class="input" value="${escapeHtml(r.fm_no)} · ${escapeHtml(r.item_name || '')}" readonly></div>
      <div class="field"><label>적용 상태</label><select class="select" name="apply_status">${APPLY_STATUS.map(s => `<option value="${s}" ${(r.apply_status || '미적용') === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="field"><label>적용일</label><input class="input" type="date" name="apply_date" value="${escapeHtml(String(r.apply_date || todayStr()).slice(0, 10))}"></div>
      <div class="field col-2"><label>적용 시작 LOT</label><input class="input" name="apply_lot" value="${escapeHtml(r.apply_lot || '')}" placeholder="예: LOT-WO-2607-015"></div>
      <div class="field col-2 muted" style="background:var(--surface-2);padding:10px 12px;border-radius:10px">적용 시작 LOT을 기록하면 LOT 추적에서 변경 적용 시점을 확인할 수 있습니다.</div>`;
    openModal({
      title: '4M 변경 적용', body,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 저장</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => body.querySelector(`[name="${n}"]`).value.trim();
          try {
            await db.update('four_m_changes', r.id, { apply_status: g('apply_status'), apply_date: g('apply_date') || null, apply_lot: g('apply_lot') });
            close(); toast('저장되었습니다.'); await reload(); state.selected = rows.find(x => x.id === r.id); renderDetail();
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }

  function openForm(r) {
    const isEdit = !!r;
    const v = (k, d = '') => (r ? (r[k] ?? d) : d);
    const cat = v('category', 'Machine');
    const multi = (key, list, valueKey, labelFn) => {
      const sel = String(v(key, '')).split(',').map(s => s.trim()).filter(Boolean);
      return list.map(o => `<option value="${escapeHtml(o[valueKey])}" ${sel.includes(String(o[valueKey])) ? 'selected' : ''}>${escapeHtml(labelFn(o))}</option>`).join('');
    };
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field col-2"><label>4M 구분 <span class="req">*</span></label>
        <div class="chips" id="fm-cat">${FOUR_M.map(f => `<button type="button" class="chip ${cat === f.key ? 'active' : ''}" data-cat="${f.key}">${icon(f.ic, 14)} ${escapeHtml(f.label)}</button>`).join('')}</div>
        <input type="hidden" name="category" value="${escapeHtml(cat)}"></div>
      <div class="field"><label>변경일 <span class="req">*</span></label><input class="input" type="date" name="change_date" value="${escapeHtml(String(v('change_date', todayStr())).slice(0, 10))}"></div>
      <div class="field"><label>품목 <span class="req">*</span></label><select class="select" name="item_code"><option value="">선택</option>
        ${items.map(i => `<option value="${escapeHtml(i.code)}" ${v('item_code') === i.code ? 'selected' : ''}>${escapeHtml(i.code)} · ${escapeHtml(i.name)}</option>`).join('')}</select></div>
      <div class="field"><label>공정</label><select class="select" name="process"><option value="">선택</option>
        ${processes.map(p => `<option value="${escapeHtml(p.name)}" ${v('process') === p.name ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>변경사유 <span class="req">*</span></label><input class="input" name="reason" value="${escapeHtml(v('reason'))}" placeholder="예: 수주량 증가 대응"></div>
      <div class="field col-2"><label>변경 전 <span class="req">*</span> <span class="muted" data-before-label>${escapeHtml((FOUR_M.find(f => f.key === cat) || FOUR_M[1]).before)}</span></label>
        <textarea class="textarea" name="before_desc">${escapeHtml(v('before_desc'))}</textarea></div>
      <div class="field col-2"><label>변경 후 <span class="req">*</span> <span class="muted" data-after-label>${escapeHtml((FOUR_M.find(f => f.key === cat) || FOUR_M[1]).after)}</span></label>
        <textarea class="textarea" name="after_desc">${escapeHtml(v('after_desc'))}</textarea></div>
      <div class="field"><label>영향 품목 <span class="muted">(다중)</span></label>
        <select class="select" name="affect_items" multiple size="4" style="height:auto">${multi('affect_items', items, 'code', o => `${o.code} · ${o.name}`)}</select></div>
      <div class="field"><label>영향 설비 <span class="muted">(다중)</span></label>
        <select class="select" name="affect_equipments" multiple size="4" style="height:auto">${multi('affect_equipments', equipments, 'code', o => `${o.code} · ${o.name}`)}</select></div>
      <div class="field col-2"><label>관련 문서 개정 필요 여부</label>
        <div class="flex" style="gap:16px;flex-wrap:wrap;padding:10px 12px;background:var(--surface-2);border-radius:10px">
          <label class="flex" style="gap:6px"><input type="checkbox" class="checkbox" name="doc_pfd_yn" ${v('doc_pfd_yn') ? 'checked' : ''}> PFD</label>
          <label class="flex" style="gap:6px"><input type="checkbox" class="checkbox" name="doc_pfmea_yn" ${v('doc_pfmea_yn') ? 'checked' : ''}> PFMEA</label>
          <label class="flex" style="gap:6px"><input type="checkbox" class="checkbox" name="doc_cp_yn" ${v('doc_cp_yn') ? 'checked' : ''}> 관리계획서</label>
          <label class="flex" style="gap:6px"><input type="checkbox" class="checkbox" name="doc_ws_yn" ${v('doc_ws_yn') ? 'checked' : ''}> 작업표준서</label>
        </div></div>
      <div class="field"><label>PPAP 제출 대상</label><label class="switch" style="height:40px"><input type="checkbox" name="ppap_yn" ${v('ppap_yn') ? 'checked' : ''}><span class="switch__track"></span><span class="muted" data-switch-label>${v('ppap_yn') ? '대상' : '비대상'}</span></label></div>
      <div class="field"><label>고객승인 필요</label><label class="switch" style="height:40px"><input type="checkbox" name="customer_approval_yn" ${v('customer_approval_yn') ? 'checked' : ''}><span class="switch__track"></span><span class="muted" data-switch-label>${v('customer_approval_yn') ? '필요' : '불필요'}</span></label></div>
      <div class="field col-2"><label>고객 승인서 URL</label><input class="input" name="customer_approval_url" value="${escapeHtml(v('customer_approval_url'))}"></div>
      <div class="field col-2"><label>비고</label><textarea class="textarea" name="remark">${escapeHtml(v('remark'))}</textarea></div>`;
    // 4M 버튼 선택
    body.querySelectorAll('#fm-cat [data-cat]').forEach(b => b.onclick = () => {
      body.querySelectorAll('#fm-cat [data-cat]').forEach(x => x.classList.toggle('active', x === b));
      body.querySelector('[name="category"]').value = b.dataset.cat;
      const f = FOUR_M.find(x => x.key === b.dataset.cat);
      body.querySelector('[data-before-label]').textContent = f.before;
      body.querySelector('[data-after-label]').textContent = f.after;
    });
    // 변경 전 자동 호출 (설비/작업자)
    body.querySelector('[name="item_code"]').addEventListener('change', async (e) => {
      const beforeEl = body.querySelector('[name="before_desc"]');
      if (beforeEl.value) return;
      const c = body.querySelector('[name="category"]').value;
      if (c === 'Machine') {
        const routes = await db.all('item_processes', { filters: { item_code: e.target.value }, sort: 'seq' }).catch(() => []);
        if (routes.length) beforeEl.value = routes.map(r => `${r.process_name}: ${r.equipment || '-'}`).join('\n');
      } else if (c === 'Material') {
        const boms = await db.all('boms', { filters: { item_code: e.target.value } }).catch(() => []);
        if (boms.length) beforeEl.value = boms.map(b => `${b.component_name} ${b.qty}${b.unit || ''} (${b.material_partner || ''})`).join('\n');
      }
    });
    openModal({
      title: `4M 변경 ${isEdit ? '수정' : '신청'}`, body, wide: true,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 저장</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => { const el = body.querySelector(`[name="${n}"]`); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };
          const gm = (n) => [...body.querySelector(`[name="${n}"]`).selectedOptions].map(o => o.value).join(',');
          if (!g('item_code')) { toast('품목을 선택하세요.', 'error'); return; }
          if (!g('before_desc') || !g('after_desc')) { toast('변경 전·후 내용을 입력하세요.', 'error'); return; }
          const it = items.find(i => i.code === g('item_code'));
          const payload = {
            category: g('category'), change_date: g('change_date') || todayStr(),
            item_code: g('item_code'), item_name: it?.name || '', process: g('process'), reason: g('reason'),
            before_desc: g('before_desc'), after_desc: g('after_desc'),
            affect_items: gm('affect_items'), affect_equipments: gm('affect_equipments'),
            doc_pfd_yn: g('doc_pfd_yn'), doc_pfmea_yn: g('doc_pfmea_yn'), doc_cp_yn: g('doc_cp_yn'), doc_ws_yn: g('doc_ws_yn'),
            ppap_yn: g('ppap_yn'), customer_approval_yn: g('customer_approval_yn'), customer_approval_url: g('customer_approval_url'),
            remark: g('remark'),
          };
          try {
            if (isEdit) await db.update('four_m_changes', r.id, payload);
            else {
              payload.fm_no = nextDocNo('4M', rows.map(x => x.fm_no));
              payload.status = '신청'; payload.apply_status = '미적용';
              await db.insert('four_m_changes', payload);
            }
            close(); toast('저장되었습니다.'); await reload();
            if (isEdit) { state.selected = rows.find(x => x.id === r.id); renderDetail(); }
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }
  function exportCsv() {
    downloadCSV(`4M변경관리_${todayStr()}.csv`, [
      { label: '변경번호', key: 'fm_no' }, { label: '변경일', key: 'change_date', csv: r => fmtDate(r.change_date) },
      { label: '4M구분', key: 'category' }, { label: '품명', key: 'item_name' }, { label: '공정', key: 'process' },
      { label: '변경사유', key: 'reason' }, { label: '변경전', key: 'before_desc' }, { label: '변경후', key: 'after_desc' },
      { label: 'PPAP대상', key: 'ppap_yn', csv: r => (r.ppap_yn ? 'Y' : 'N') },
      { label: '시험생산', key: 'trial_result' }, { label: '승인상태', key: 'status' },
      { label: '적용일', key: 'apply_date', csv: r => fmtDate(r.apply_date) }, { label: '적용LOT', key: 'apply_lot' },
    ], scoped());
    toast('CSV로 내보냈습니다.');
  }
  async function reload() {
    try { await loadAll(); renderStats(); renderChips(); renderTable(); if (state.selected) { state.selected = rows.find(x => x.id === state.selected.id); renderDetail(); } }
    catch (e) { root.querySelector('#fm-table').innerHTML = `<div class="empty">${icon('alert', 46)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
  }
  reload();
}

// =====================================================================
// 7-2 PPAP 승인관리
// =====================================================================
export async function ppapApprovals(root) {
  const state = { search: '', chip: '전체', selected: null };
  let rows = [], items = [], partners = [], fourM = [], docs = [], users = [];

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>PPAP 승인관리</h1><p>고객 PPAP 제출·승인을 관리합니다. 제출서류 체크리스트로 <b>미첨부 문서를 자동 확인</b>하고 제출차수를 관리합니다.</p></div>
      <div class="page-head__actions">
        <button class="btn" id="pp-csv">${icon('download', 16)} 엑셀(CSV)</button>
        <button class="btn" id="pp-refresh">${icon('refresh', 16)} 새로고침</button>
        <button class="btn btn--primary" id="pp-add">${icon('plus', 16)} PPAP 등록</button>
      </div>
    </div>
    <div id="pp-stats"></div>
    <div class="card" style="margin-bottom:16px">
      <div class="toolbar"><div class="search-box grow">${icon('search', 16)}<input id="pp-search" placeholder="PPAP번호·고객사·품목 검색" autocomplete="off"/></div></div>
      <div class="toolbar" style="border-top:0;padding-top:12px"><div class="chips" id="pp-chips"></div></div>
      <div class="table-wrap"><div id="pp-table"><div class="spinner"></div></div></div>
    </div>
    <div id="pp-detail"></div>`;

  root.querySelector('#pp-refresh').onclick = () => reload();
  root.querySelector('#pp-add').onclick = () => openForm(null);
  root.querySelector('#pp-csv').onclick = () => exportCsv();
  root.querySelector('#pp-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });

  async function loadAll() {
    [rows, items, partners, fourM, docs, users] = await Promise.all([
      db.all('ppap_approvals', {}).catch(() => []),
      db.all('items', { sort: 'code' }).catch(() => []),
      db.all('partners', { sort: 'code' }).catch(() => []),
      db.all('four_m_changes', {}).catch(() => []),
      db.all('dev_docs', {}).catch(() => []),
      db.all('users', { sort: 'name' }).catch(() => []),
    ]);
  }
  function scoped() {
    const q = state.search.toLowerCase();
    return rows.filter(r => {
      if (state.chip !== '전체' && (r.status || '작성중') !== state.chip) return false;
      if (q && ![r.ppap_no, r.customer, r.item_code, r.item_name, r.part_no].some(v => String(v ?? '').toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => String(b.submit_date).localeCompare(String(a.submit_date)));
  }
  function renderStats() {
    root.querySelector('#pp-stats').innerHTML = `<div class="stat-grid">
      ${stat('총 PPAP', num(rows.length), '건', 'clipboard', 'brand')}
      ${stat('제출·검토중', num(rows.filter(r => ['제출', '작성중'].includes(r.status || '작성중')).length), '건', 'clock', 'amber')}
      ${stat('승인', num(rows.filter(r => ['승인', '조건부승인'].includes(r.status)).length), '건', 'checkCircle', 'green')}
      ${stat('반려', num(rows.filter(r => r.status === '반려').length), '건', 'alert', 'red')}</div>`;
  }
  function renderChips() {
    const wrap = root.querySelector('#pp-chips');
    const opts = [['전체', rows.length], ...PPAP_STATUS.map(s => [s, rows.filter(r => (r.status || '작성중') === s).length])];
    wrap.innerHTML = opts.map(([t, c]) => `<button class="chip ${state.chip === t ? 'active' : ''}" data-c="${t}">${t}<span class="chip__count">${c}</span></button>`).join('');
    wrap.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { state.chip = b.dataset.c; renderChips(); renderTable(); });
  }
  function docCount(r) { return PPAP_DOCS.filter(([k]) => r[k]).length; }
  function renderTable() {
    const list = scoped(); const slot = root.querySelector('#pp-table');
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:50px">${icon('inbox', 48)}<h4>PPAP 내역이 없습니다</h4></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th>PPAP번호</th><th>고객사</th><th>품목</th><th>품번</th><th class="center">Level</th><th class="center">제출차수</th>
      <th class="center">제출일</th><th class="center">서류</th><th>제출사유</th><th>4M변경</th><th class="center">승인일</th><th class="center">적용일</th><th class="center">상태</th><th class="center" style="width:88px">관리</th>
    </tr></thead><tbody>${list.map(r => {
      const cnt = docCount(r);
      return `<tr class="clickable ${state.selected?.id === r.id ? 'is-selected' : ''}" data-id="${r.id}">
        <td class="cell-code">${escapeHtml(r.ppap_no)}</td><td>${escapeHtml(r.customer || '')}</td>
        <td class="cell-strong">${escapeHtml(r.item_name || '')}</td><td class="cell-code">${escapeHtml(r.part_no || '')}</td>
        <td class="center">${badge(r.level || 'Level 3', 'brand')}</td><td class="center mono">${r.submit_seq || 1}차</td>
        <td class="center">${fmtDate(r.submit_date) || '-'}</td>
        <td class="center"><span class="mono ${cnt === PPAP_DOCS.length ? '' : 'muted'}" style="${cnt === PPAP_DOCS.length ? 'color:var(--success);font-weight:700' : ''}">${cnt}/${PPAP_DOCS.length}</span></td>
        <td>${escapeHtml(r.reason || '')}</td><td class="cell-code">${escapeHtml(r.fm_no || '-')}</td>
        <td class="center">${fmtDate(r.approve_date) || '-'}</td><td class="center">${fmtDate(r.apply_date) || '-'}</td>
        <td class="center">${badge(r.status || '작성중')}</td>
        <td class="center"><div class="row-actions">
          <button class="icon-btn" data-edit="${r.id}" title="수정">${icon('edit', 15)}</button>
          <button class="icon-btn" data-del="${r.id}" title="삭제">${icon('trash', 15)}</button></div></td>
      </tr>`;
    }).join('')}</tbody></table>`;
    slot.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = (e) => { if (e.target.closest('button')) return; state.selected = list.find(x => x.id === tr.dataset.id); renderTable(); renderDetail(); });
    slot.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openForm(list.find(x => x.id === b.dataset.edit)));
    slot.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const r = list.find(x => x.id === b.dataset.del);
      if (!(await confirmDialog({ message: `[${r.ppap_no}]을(를) 삭제하시겠습니까?`, confirmText: '삭제' }))) return;
      try { await db.remove('ppap_approvals', r.id); toast('삭제되었습니다.'); state.selected = null; reload(); } catch (e) { toast(e.message || '삭제 실패', 'error'); }
    });
  }
  function renderDetail() {
    const r = state.selected; const slot = root.querySelector('#pp-detail');
    if (!r) { slot.innerHTML = ''; return; }
    const relDocs = docs.filter(d => d.item_code === r.item_code);
    const docMap = { chk_pfd: 'PFD', chk_pfmea: 'PFMEA', chk_cp: '관리계획서', chk_ws: '작업표준서' };
    slot.innerHTML = `<div class="card">
      <div class="card__head">
        <div><div class="flex" style="gap:8px"><span class="cell-code" style="font-size:14px">${escapeHtml(r.ppap_no)}</span>
          ${badge(r.level || 'Level 3', 'brand')}<span class="badge badge--neutral">${r.submit_seq || 1}차 제출</span>${badge(r.status || '작성중')}</div>
          <h3 style="margin-top:4px">${escapeHtml(r.customer || '')} · ${escapeHtml(r.item_name || '')}</h3></div>
        <div class="spacer"></div>
        <button class="btn btn--sm" id="pp-resubmit">${icon('refresh', 14)} 재제출(차수+1)</button>
        <button class="btn btn--primary btn--sm" id="pp-approve">${icon('check', 14)} 승인 처리</button>
      </div>
      <div class="card__body">
        <div class="grid-3" style="margin-bottom:16px">
          ${info('제출일', fmtDate(r.submit_date) || '-')}${info('제출사유', r.reason || '-')}${info('연계 4M', r.fm_no || '-')}
          ${info('승인자 / 승인일', `${r.approver || '-'} / ${fmtDate(r.approve_date) || '-'}`)}
          ${info('양산 적용일', fmtDate(r.apply_date) || '-')}${info('상태', r.status || '작성중')}
        </div>
        <h4 style="margin:0 0 10px;font-size:13.5px;display:flex;align-items:center;gap:8px">${icon('clipboard', 16)} 제출서류 체크리스트
          <span class="muted" style="font-weight:500">${docCount(r)}/${PPAP_DOCS.length} 준비</span></h4>
        <div class="flex-col" style="gap:7px;margin-bottom:16px">
          ${PPAP_DOCS.map(([k, label]) => {
            const ok = !!r[k];
            const linked = docMap[k] ? relDocs.filter(d => d.doc_type === docMap[k]).sort((a, b) => String(b.rev || '').localeCompare(String(a.rev || '')))[0] : null;
            return `<div class="flex between" style="padding:9px 13px;background:${ok ? 'var(--surface-2)' : 'var(--danger-bg)'};border-radius:9px">
              <span class="flex" style="gap:8px">${ok ? icon('checkCircle', 15) : icon('alert', 15)} <b>${escapeHtml(label)}</b></span>
              <span>${linked ? `<span class="badge badge--${linked.status === '승인' ? 'success' : 'warning'}">${escapeHtml(linked.doc_no)} Rev.${escapeHtml(linked.rev || 'A')}</span>` : (ok ? badge('첨부', 'success') : badge('미첨부', 'danger'))}</span>
            </div>`;
          }).join('')}
        </div>
        ${r.reject_reason ? `<div style="padding:12px 14px;background:var(--danger-bg);border-radius:10px">
          <div style="font-weight:700;margin-bottom:4px">${icon('alert', 15)} 보완요청</div>
          <div style="white-space:pre-wrap">${escapeHtml(r.reject_reason)}</div>
          ${r.reject_due ? `<div class="muted" style="margin-top:5px">보완기한: ${fmtDate(r.reject_due)}</div>` : ''}</div>` : ''}
        ${r.docs ? `<div style="margin-top:14px"><div class="muted" style="font-size:12px;font-weight:700">제출서류 목록</div><div style="margin-top:4px;white-space:pre-wrap">${escapeHtml(r.docs)}</div></div>` : ''}
      </div></div>`;
    slot.querySelector('#pp-approve').onclick = () => openApprove(r);
    slot.querySelector('#pp-resubmit').onclick = () => resubmit(r);
  }
  async function resubmit(r) {
    const ok = await confirmDialog({ title: '재제출', danger: false, confirmText: '재제출', message: `제출차수를 ${(r.submit_seq || 1) + 1}차로 올리고 상태를 '제출'로 변경합니다.\n계속하시겠습니까?` });
    if (!ok) return;
    try {
      await db.update('ppap_approvals', r.id, { submit_seq: (r.submit_seq || 1) + 1, submit_date: todayStr(), status: '제출', approve_date: null, reject_reason: '', reject_due: null });
      toast('재제출 처리되었습니다.'); await reload(); state.selected = rows.find(x => x.id === r.id); renderDetail();
    } catch (e) { toast(e.message || '실패', 'error'); }
  }
  function openApprove(r) {
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field col-2"><label>PPAP</label><input class="input" value="${escapeHtml(r.ppap_no)} · ${escapeHtml(r.item_name || '')} (${r.submit_seq || 1}차)" readonly></div>
      <div class="field"><label>승인상태 <span class="req">*</span></label><select class="select" name="status">${PPAP_STATUS.map(s => `<option value="${s}" ${(r.status || '작성중') === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="field"><label>고객 승인자</label><input class="input" name="approver" value="${escapeHtml(r.approver || '')}"></div>
      <div class="field"><label>승인일</label><input class="input" type="date" name="approve_date" value="${escapeHtml(String(r.approve_date || todayStr()).slice(0, 10))}"></div>
      <div class="field"><label>양산 적용일</label><input class="input" type="date" name="apply_date" value="${escapeHtml(String(r.apply_date || '').slice(0, 10))}"></div>
      <div class="field col-2" data-reject><label>보완요청 내용</label><textarea class="textarea" name="reject_reason">${escapeHtml(r.reject_reason || '')}</textarea></div>
      <div class="field" data-reject><label>보완 기한</label><input class="input" type="date" name="reject_due" value="${escapeHtml(String(r.reject_due || '').slice(0, 10))}"></div>`;
    const toggle = () => {
      const s = body.querySelector('[name="status"]').value;
      body.querySelectorAll('[data-reject]').forEach(el => el.classList.toggle('hidden', !['조건부승인', '반려'].includes(s)));
    };
    body.querySelector('[name="status"]').addEventListener('change', toggle);
    openModal({
      title: 'PPAP 승인 처리', body, wide: true,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 저장</button>`,
      onMount: ({ footEl, close }) => {
        toggle();
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => body.querySelector(`[name="${n}"]`).value.trim();
          const status = g('status');
          if (status === '승인' && docCount(r) < PPAP_DOCS.length) {
            const ok = await confirmDialog({ title: '미첨부 서류', danger: false, confirmText: '그래도 승인', message: `제출서류 ${PPAP_DOCS.length - docCount(r)}건이 미첨부 상태입니다.\n계속 진행하시겠습니까?` });
            if (!ok) return;
          }
          try {
            await db.update('ppap_approvals', r.id, {
              status, approver: g('approver'), approve_date: g('approve_date') || null, apply_date: g('apply_date') || null,
              reject_reason: g('reject_reason'), reject_due: g('reject_due') || null,
            });
            close(); toast('저장되었습니다.'); await reload(); state.selected = rows.find(x => x.id === r.id); renderDetail();
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }
  function openForm(r) {
    const isEdit = !!r;
    const v = (k, d = '') => (r ? (r[k] ?? d) : d);
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field"><label>고객사 <span class="req">*</span></label><select class="select" name="customer"><option value="">선택</option>
        ${partners.filter(p => p.biz_type === '매출처').map(p => `<option value="${escapeHtml(p.name)}" ${v('customer') === p.name ? 'selected' : ''}>${escapeHtml(p.code)} · ${escapeHtml(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>품목 <span class="req">*</span></label><select class="select" name="item_code"><option value="">선택</option>
        ${items.map(i => `<option value="${escapeHtml(i.code)}" data-cust="${escapeHtml(i.customer || '')}" ${v('item_code') === i.code ? 'selected' : ''}>${escapeHtml(i.code)} · ${escapeHtml(i.name)}</option>`).join('')}</select></div>
      <div class="field"><label>품번</label><input class="input" name="part_no" value="${escapeHtml(v('part_no'))}"></div>
      <div class="field"><label>제출 Level</label><select class="select" name="level">${['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5'].map(l => `<option value="${l}" ${v('level', 'Level 3') === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label>제출차수</label><input class="input" type="number" name="submit_seq" value="${v('submit_seq', 1)}" ${isEdit ? '' : 'readonly'}></div>
      <div class="field"><label>제출일</label><input class="input" type="date" name="submit_date" value="${escapeHtml(String(v('submit_date', todayStr())).slice(0, 10))}"></div>
      <div class="field"><label>제출사유</label><select class="select" name="reason">${['신규부품', '4M변경', '설계변경', '공정변경', '고객요청', '기타'].map(s => `<option value="${s}" ${v('reason', '신규부품') === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="field"><label>연계 4M 변경</label><select class="select" name="fm_no"><option value="">해당없음</option>
        ${fourM.map(f => `<option value="${escapeHtml(f.fm_no)}" ${v('fm_no') === f.fm_no ? 'selected' : ''}>${escapeHtml(f.fm_no)} · ${escapeHtml(f.category || '')} · ${escapeHtml(f.item_name || '')}</option>`).join('')}</select></div>
      <div class="field col-2"><label>제출서류 체크리스트</label>
        <div class="flex" style="gap:14px;flex-wrap:wrap;padding:11px 13px;background:var(--surface-2);border-radius:10px">
          ${PPAP_DOCS.map(([k, label]) => `<label class="flex" style="gap:6px"><input type="checkbox" class="checkbox" name="${k}" ${v(k) ? 'checked' : ''}> ${escapeHtml(label)}</label>`).join('')}
        </div>
        <button type="button" class="btn btn--sm" id="pp-autochk" style="margin-top:8px;align-self:flex-start">${icon('layers', 14)} 개발문서 승인상태로 자동 체크</button></div>
      <div class="field col-2"><label>제출서류 목록/비고</label><textarea class="textarea" name="docs" placeholder="예: PSW, 치수측정결과, 재료성적서, Cpk, MSA, PFMEA, 관리계획서">${escapeHtml(v('docs'))}</textarea></div>`;
    body.querySelector('[name="item_code"]').addEventListener('change', (e) => {
      const cust = e.target.selectedOptions[0]?.dataset.cust;
      const cs = body.querySelector('[name="customer"]');
      if (cust && !cs.value) { const opt = [...cs.options].find(o => o.value === cust); if (opt) cs.value = cust; }
    });
    body.querySelector('#pp-autochk').onclick = () => {
      const code = body.querySelector('[name="item_code"]').value;
      if (!code) { toast('품목을 먼저 선택하세요.', 'error'); return; }
      const map = { chk_pfd: 'PFD', chk_pfmea: 'PFMEA', chk_cp: '관리계획서', chk_ws: '작업표준서' };
      let n = 0;
      for (const [k, type] of Object.entries(map)) {
        const has = docs.some(d => d.item_code === code && d.doc_type === type && d.status === '승인');
        body.querySelector(`[name="${k}"]`).checked = has;
        if (has) n++;
      }
      toast(`승인된 개발문서 ${n}건을 체크했습니다.`);
    };
    openModal({
      title: `PPAP ${isEdit ? '수정' : '등록'}`, body, wide: true,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 저장</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => { const el = body.querySelector(`[name="${n}"]`); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };
          if (!g('customer')) { toast('고객사를 선택하세요.', 'error'); return; }
          if (!g('item_code')) { toast('품목을 선택하세요.', 'error'); return; }
          const it = items.find(i => i.code === g('item_code'));
          const payload = {
            customer: g('customer'), item_code: g('item_code'), item_name: it?.name || '', part_no: g('part_no'),
            level: g('level'), submit_seq: Number(g('submit_seq')) || 1, submit_date: g('submit_date') || todayStr(),
            reason: g('reason'), fm_no: g('fm_no'), docs: g('docs'),
            ...Object.fromEntries(PPAP_DOCS.map(([k]) => [k, g(k)])),
          };
          try {
            if (isEdit) await db.update('ppap_approvals', r.id, payload);
            else { payload.ppap_no = nextDocNo('PPAP', rows.map(x => x.ppap_no)); payload.status = '작성중'; await db.insert('ppap_approvals', payload); }
            close(); toast('저장되었습니다.'); await reload();
            if (isEdit) { state.selected = rows.find(x => x.id === r.id); renderDetail(); }
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }
  function exportCsv() {
    downloadCSV(`PPAP승인관리_${todayStr()}.csv`, [
      { label: 'PPAP번호', key: 'ppap_no' }, { label: '고객사', key: 'customer' }, { label: '품목', key: 'item_code' },
      { label: '품명', key: 'item_name' }, { label: '품번', key: 'part_no' }, { label: 'Level', key: 'level' },
      { label: '제출차수', key: 'submit_seq' }, { label: '제출일', key: 'submit_date', csv: r => fmtDate(r.submit_date) },
      { label: '제출사유', key: 'reason' }, { label: '4M변경', key: 'fm_no' },
      { label: '서류준비', key: 'docs_cnt', csv: r => `${docCount(r)}/${PPAP_DOCS.length}` },
      { label: '승인일', key: 'approve_date', csv: r => fmtDate(r.approve_date) },
      { label: '적용일', key: 'apply_date', csv: r => fmtDate(r.apply_date) }, { label: '상태', key: 'status' },
    ], scoped());
    toast('CSV로 내보냈습니다.');
  }
  async function reload() {
    try { await loadAll(); renderStats(); renderChips(); renderTable(); if (state.selected) { state.selected = rows.find(x => x.id === state.selected.id); renderDetail(); } }
    catch (e) { root.querySelector('#pp-table').innerHTML = `<div class="empty">${icon('alert', 46)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
  }
  reload();
}
