// =====================================================================
// 부적합관리 / 개선대책관리
//   · 부적합: 진행상태(발생→식별·격리→처리결정→조치중→완료) + 격리·처리수량 정합성 검증
//   · 개선대책: 부적합 연계, 원인분석 → 임시조치/근본대책 → 유효성 평가 → 수평전개
// =====================================================================
import { db } from '../lib/db.js';
import { num, won, fmtDate, todayStr, escapeHtml, nextDocNo, downloadCSV } from '../lib/format.js';
import { badge, toast, openModal, confirmDialog } from '../ui/components.js';
import { icon } from '../ui/icons.js';

const PROGRESS = ['발생', '식별·격리', '처리결정', '조치중', '완료'];
const NCR_TYPES = ['공정부적합', '수입부적합', '출하부적합', '고객클레임'];
const ACTIONS = ['선별', '재작업', '폐기', '특채', '반품'];

function stepsHtml(cur) {
  const idx = Math.max(0, PROGRESS.indexOf(cur || '발생'));
  return `<div class="steps">${PROGRESS.map((s, i) => `
    <span class="step ${i < idx ? 'is-done' : i === idx ? 'is-current' : ''}"><span class="step__no">${i + 1}</span>${escapeHtml(s)}</span>
    ${i < PROGRESS.length - 1 ? `<span class="step__arrow">${icon('chevronRight', 15)}</span>` : ''}`).join('')}</div>`;
}
function info(label, val) {
  return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:11px 13px"><div class="muted" style="font-size:11.5px">${escapeHtml(label)}</div><div style="font-weight:700;margin-top:2px">${escapeHtml(val ?? '')}</div></div>`;
}
function stat(label, value, unit, ic, tint) {
  return `<div class="stat"><div class="stat__top"><span class="stat__label">${escapeHtml(label)}</span><span class="stat__ico ico-tint-${tint}">${icon(ic, 21)}</span></div><div class="stat__value">${value}${unit ? `<small>${escapeHtml(unit)}</small>` : ''}</div></div>`;
}

// =====================================================================
// 부적합관리
// =====================================================================
export async function nonconformances(root) {
  const state = { search: '', chip: '전체', fType: '__all__', from: '', to: '', selected: null, tab: 'occur' };
  let rows = [], items = [], processes = [], users = [], depts = [], defectCodes = [], improves = [];

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>부적합관리</h1><p>발생 → 식별·격리 → 처리결정 → 조치중 → 완료 단계로 부적합품을 통제합니다. 격리·처리수량 정합성이 자동 검증됩니다.</p></div>
      <div class="page-head__actions">
        <button class="btn" id="nc-csv">${icon('download', 16)} 엑셀(CSV)</button>
        <button class="btn" id="nc-refresh">${icon('refresh', 16)} 새로고침</button>
        <button class="btn btn--primary" id="nc-add">${icon('plus', 16)} 부적합 등록</button>
      </div>
    </div>
    <div id="nc-stats"></div>
    <div class="card" style="margin-bottom:16px">
      <div class="toolbar">
        <div class="search-box grow">${icon('search', 16)}<input id="nc-search" placeholder="부적합번호·품목·LOT·불량유형 검색" autocomplete="off"/></div>
        <select class="select" id="nc-ftype" style="width:auto;min-width:140px"><option value="__all__">전체 구분</option>${NCR_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}</select>
        <div class="date-range"><span class="date-range__label">${icon('calendar', 14)} 발생일</span>
          <input class="input input--date" type="date" id="nc-from"><span class="date-range__sep">~</span><input class="input input--date" type="date" id="nc-to"></div>
      </div>
      <div class="toolbar" style="border-top:0;padding-top:12px"><div class="chips" id="nc-chips"></div></div>
      <div class="table-wrap"><div id="nc-table"><div class="spinner"></div></div></div>
    </div>
    <div id="nc-detail"></div>`;

  root.querySelector('#nc-refresh').onclick = () => reload();
  root.querySelector('#nc-add').onclick = () => openForm(null);
  root.querySelector('#nc-csv').onclick = () => exportCsv();
  root.querySelector('#nc-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });
  root.querySelector('#nc-ftype').addEventListener('change', (e) => { state.fType = e.target.value; renderTable(); });
  root.querySelector('#nc-from').addEventListener('change', (e) => { state.from = e.target.value; renderTable(); });
  root.querySelector('#nc-to').addEventListener('change', (e) => { state.to = e.target.value; renderTable(); });

  async function loadAll() {
    [rows, items, processes, users, depts, defectCodes, improves] = await Promise.all([
      db.all('nonconformances', {}).catch(() => []),
      db.all('items', { sort: 'code' }).catch(() => []),
      db.all('processes', { sort: 'code' }).catch(() => []),
      db.all('users', { sort: 'name' }).catch(() => []),
      db.all('departments', { sort: 'code' }).catch(() => []),
      db.all('common_codes', { filters: { group_code: 'DEFECT_TYPE' } }).catch(() => []),
      db.all('improvement_actions', {}).catch(() => []),
    ]);
  }
  function scoped() {
    const q = state.search.toLowerCase();
    return rows.filter(r => {
      const prog = r.progress || (r.status === '완료' ? '완료' : '발생');
      if (state.chip === '진행중' && prog === '완료') return false;
      if (state.chip === '완료' && prog !== '완료') return false;
      if (state.chip === '기한초과' && !(prog !== '완료' && r.due_date && String(r.due_date).slice(0, 10) < todayStr())) return false;
      if (PROGRESS.includes(state.chip) && prog !== state.chip) return false;
      if (state.fType !== '__all__' && r.ncr_type !== state.fType) return false;
      const d = String(r.occur_date || '').slice(0, 10);
      if (state.from && d < state.from) return false;
      if (state.to && d > state.to) return false;
      if (q && ![r.ncr_no, r.item_code, r.item_name, r.lot_no, r.defect_type, r.process].some(v => String(v ?? '').toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => String(b.occur_date).localeCompare(String(a.occur_date)));
  }
  function renderStats() {
    const open = rows.filter(r => (r.progress || '발생') !== '완료');
    const overdue = open.filter(r => r.due_date && String(r.due_date).slice(0, 10) < todayStr());
    root.querySelector('#nc-stats').innerHTML = `<div class="stat-grid">
      ${stat('총 부적합', num(rows.length), '건', 'alert', 'brand')}
      ${stat('진행중', num(open.length), '건', 'clock', 'amber')}
      ${stat('기한 초과', num(overdue.length), '건', 'alert', 'red')}
      ${stat('부적합수량', num(rows.reduce((s, r) => s + (+r.defect_qty || 0), 0)), 'EA', 'box', 'violet')}</div>`;
  }
  function renderChips() {
    const wrap = root.querySelector('#nc-chips');
    const prog = (r) => r.progress || (r.status === '완료' ? '완료' : '발생');
    const opts = [['전체', rows.length], ['진행중', rows.filter(r => prog(r) !== '완료').length],
      ...PROGRESS.map(p => [p, rows.filter(r => prog(r) === p).length]),
      ['기한초과', rows.filter(r => prog(r) !== '완료' && r.due_date && String(r.due_date).slice(0, 10) < todayStr()).length]];
    wrap.innerHTML = opts.map(([t, c]) => `<button class="chip ${state.chip === t ? 'active' : ''}" data-c="${escapeHtml(t)}">${escapeHtml(t)}<span class="chip__count">${c}</span></button>`).join('');
    wrap.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { state.chip = b.dataset.c; renderChips(); renderTable(); });
  }
  function renderTable() {
    const list = scoped(); const slot = root.querySelector('#nc-table');
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:50px">${icon('inbox', 48)}<h4>부적합 내역이 없습니다</h4></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th>부적합번호</th><th>발생일</th><th class="center">구분</th><th>발생공정</th><th>품명</th><th>LOT</th><th>불량유형</th>
      <th class="num">발생</th><th class="num">격리</th><th class="num">처리</th><th class="center">진행상태</th><th class="center">기한</th><th class="center">대책</th><th class="center" style="width:88px">관리</th>
    </tr></thead><tbody>${list.map(r => {
      const prog = r.progress || (r.status === '완료' ? '완료' : '발생');
      const handled = (+r.sort_qty || 0) + (+r.rework_qty || 0) + (+r.scrap_qty || 0) + (+r.accept_qty || 0);
      const overdue = prog !== '완료' && r.due_date && String(r.due_date).slice(0, 10) < todayStr();
      const imp = improves.find(i => i.ncr_no === r.ncr_no);
      return `<tr class="clickable ${state.selected?.id === r.id ? 'is-selected' : ''}" data-id="${r.id}">
        <td class="cell-code">${escapeHtml(r.ncr_no)}</td><td>${fmtDate(r.occur_date)}</td>
        <td class="center">${badge(r.ncr_type || '공정부적합')}</td><td>${escapeHtml(r.process || '')}</td>
        <td class="cell-strong">${escapeHtml(r.item_name || '')}</td><td class="cell-code">${escapeHtml(r.lot_no || '')}</td>
        <td>${escapeHtml(r.defect_type || '')}</td>
        <td class="num mono">${num(r.defect_qty)}</td><td class="num mono">${num(r.isolate_qty)}</td>
        <td class="num mono ${handled !== (+r.defect_qty || 0) ? 'tone-warning' : ''}" style="${handled !== (+r.defect_qty || 0) ? 'color:var(--warning)' : ''}">${num(handled)}</td>
        <td class="center">${badge(prog)}</td>
        <td class="center">${r.due_date ? (overdue ? badge(fmtDate(r.due_date), 'danger') : fmtDate(r.due_date)) : '<span class="muted">-</span>'}</td>
        <td class="center">${imp ? badge(imp.status || '진행중', imp.status === '완료' ? 'success' : 'warning') : '<span class="muted">미수립</span>'}</td>
        <td class="center"><div class="row-actions">
          <button class="icon-btn" data-edit="${r.id}" title="수정">${icon('edit', 15)}</button>
          <button class="icon-btn" data-del="${r.id}" title="삭제">${icon('trash', 15)}</button></div></td>
      </tr>`;
    }).join('')}</tbody></table>`;
    slot.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = (e) => { if (e.target.closest('button')) return; select(list.find(x => x.id === tr.dataset.id)); });
    slot.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openForm(list.find(x => x.id === b.dataset.edit)));
    slot.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const r = list.find(x => x.id === b.dataset.del);
      if (!(await confirmDialog({ message: `부적합 [${r.ncr_no}]을(를) 삭제하시겠습니까?`, confirmText: '삭제' }))) return;
      try { await db.remove('nonconformances', r.id); toast('삭제되었습니다.'); state.selected = null; await reload(); } catch (e) { toast(e.message || '삭제 실패', 'error'); }
    });
  }

  function select(r) { if (!r) return; state.selected = r; renderTable(); renderDetail(); }

  function renderDetail() {
    const r = state.selected; const slot = root.querySelector('#nc-detail');
    if (!r) { slot.innerHTML = ''; return; }
    const prog = r.progress || '발생';
    const tabs = [['occur', '발생정보'], ['isolate', '격리·선별'], ['action', '처리내용'], ['cause', '원인정보'], ['history', '개선대책·이력']];
    slot.innerHTML = `<div class="card">
      <div class="card__head">
        <div><div class="flex" style="gap:8px"><span class="cell-code" style="font-size:14px">${escapeHtml(r.ncr_no)}</span>${badge(r.ncr_type || '')}${badge(prog)}</div>
          <h3 style="margin-top:4px">${escapeHtml(r.item_name || '')} <span class="muted" style="font-weight:600;font-size:13px">${escapeHtml(r.defect_type || '')} ${num(r.defect_qty)}EA</span></h3></div>
        <div class="spacer"></div>
        ${prog !== '완료' ? `<button class="btn btn--primary btn--sm" id="nc-next">${icon('chevronRight', 14)} 다음 단계</button>` : ''}
        <button class="btn btn--sm" id="nc-imp">${icon('clipboard', 14)} 개선대책</button>
      </div>
      <div class="card__body" style="padding-bottom:6px">${stepsHtml(prog)}</div>
      <div class="seg-tabs" style="margin:0 20px">${tabs.map(([k, l]) => `<button class="seg-tab ${state.tab === k ? 'active' : ''}" data-tab="${k}">${escapeHtml(l)}</button>`).join('')}</div>
      <div class="card__body" id="nc-tabbody"></div></div>`;
    slot.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; renderDetail(); });
    const nx = slot.querySelector('#nc-next'); if (nx) nx.onclick = () => nextStep(r);
    slot.querySelector('#nc-imp').onclick = () => openImprovement(r);
    renderTabBody();
  }

  function renderTabBody() {
    const r = state.selected; const body = root.querySelector('#nc-tabbody');
    if (!body) return;
    const handled = (+r.sort_qty || 0) + (+r.rework_qty || 0) + (+r.scrap_qty || 0) + (+r.accept_qty || 0);
    if (state.tab === 'occur') {
      body.innerHTML = `<div class="grid-3">
        ${info('발생일', fmtDate(r.occur_date))}${info('구분', r.ncr_type || '')}${info('발생출처', `${r.source_type || '-'} ${r.source_no || ''}`)}
        ${info('품목', `${r.item_code || ''} ${r.item_name || ''}`)}${info('LOT', r.lot_no || '-')}${info('발생공정', r.process || '-')}
        ${info('설비/호기', r.equipment || '-')}${info('작업자', r.worker || '-')}${info('고객사', r.partner || '-')}
        ${info('불량유형', r.defect_type || '')}${info('발생수량', num(r.defect_qty) + ' EA')}${info('클레임금액', r.claim_amount ? won(r.claim_amount) : '-')}
      </div>${r.photo_url ? `<div style="margin-top:12px"><a class="btn btn--sm" href="${escapeHtml(r.photo_url)}" target="_blank" rel="noopener">${icon('fileText', 14)} 발생사진/증빙 열기</a></div>` : ''}`;
      return;
    }
    if (state.tab === 'isolate') {
      const iso = +r.isolate_qty || 0, def = +r.defect_qty || 0;
      body.innerHTML = `<div class="grid-3" style="margin-bottom:14px">
        ${info('발생수량', num(def) + ' EA')}${info('격리수량', num(iso) + ' EA')}${info('미격리', num(Math.max(0, def - iso)) + ' EA')}</div>
        <div class="flex" style="padding:12px 14px;background:var(--surface-2);border-radius:10px;gap:8px;align-items:flex-start">
          ${icon(iso >= def ? 'checkCircle' : 'alert', 18)}
          <div>${iso >= def ? '발생수량 전량이 격리되었습니다.' : `<b>${num(def - iso)}EA</b>가 아직 격리되지 않았습니다. 부적합품 식별·격리는 SQ 심사 필수 확인사항입니다.`}</div>
        </div>
        <div style="margin-top:14px"><button class="btn btn--sm btn--primary" id="nc-iso">${icon('edit', 14)} 격리수량 입력</button></div>`;
      body.querySelector('#nc-iso').onclick = () => openIsolate(r);
      return;
    }
    if (state.tab === 'action') {
      body.innerHTML = `<div class="grid-3" style="margin-bottom:14px">
        ${info('선별', num(r.sort_qty) + ' EA')}${info('재작업', num(r.rework_qty) + ' EA')}${info('폐기', num(r.scrap_qty) + ' EA')}
        ${info('특채', num(r.accept_qty) + ' EA')}${info('처리합계', num(handled) + ' EA')}${info('발생수량', num(r.defect_qty) + ' EA')}</div>
        <div class="flex" style="padding:12px 14px;background:var(--surface-2);border-radius:10px;gap:8px;align-items:flex-start">
          ${icon(handled === (+r.defect_qty || 0) ? 'checkCircle' : 'alert', 18)}
          <div>${handled === (+r.defect_qty || 0) ? '처리수량이 발생수량과 일치합니다.' : `처리수량(${num(handled)})이 발생수량(${num(r.defect_qty)})과 <b>일치하지 않습니다</b>. 완료 처리가 제한됩니다.`}</div>
        </div>
        ${r.action ? `<div style="margin-top:14px"><div class="muted" style="font-size:12px;font-weight:700">처리방안</div><div style="margin-top:4px">${escapeHtml(r.action)}</div></div>` : ''}
        <div style="margin-top:14px"><button class="btn btn--sm btn--primary" id="nc-act">${icon('edit', 14)} 처리내용 입력</button></div>`;
      body.querySelector('#nc-act').onclick = () => openAction(r);
      return;
    }
    if (state.tab === 'cause') {
      const similar = rows.filter(x => x.id !== r.id && x.item_code === r.item_code && x.defect_type === r.defect_type).slice(0, 5);
      body.innerHTML = `<div class="grid-2" style="margin-bottom:14px">${info('원인', r.cause || '-')}${info('귀책부서', r.charge_dept || '-')}
        ${info('담당자', r.owner || r.worker || '-')}${info('처리기한', fmtDate(r.due_date) || '-')}</div>
        <h4 style="margin:16px 0 8px;font-size:13.5px">동일 품목·동일 불량 과거 사례 <span class="muted" style="font-weight:500">${similar.length}건</span></h4>
        ${similar.length ? `<div class="table-wrap"><table class="grid"><thead><tr><th>부적합번호</th><th>발생일</th><th>공정</th><th class="num">수량</th><th>원인</th><th>조치</th><th class="center">상태</th></tr></thead>
          <tbody>${similar.map(s => `<tr><td class="cell-code">${escapeHtml(s.ncr_no)}</td><td>${fmtDate(s.occur_date)}</td><td>${escapeHtml(s.process || '')}</td>
            <td class="num mono">${num(s.defect_qty)}</td><td>${escapeHtml(s.cause || '')}</td><td>${escapeHtml(s.action_type || '')}</td>
            <td class="center">${badge(s.progress || s.status || '')}</td></tr>`).join('')}</tbody></table></div>`
          : `<div class="muted" style="padding:10px">과거 동일 사례가 없습니다.</div>`}`;
      return;
    }
    if (state.tab === 'history') {
      const imp = improves.find(i => i.ncr_no === r.ncr_no);
      body.innerHTML = imp ? `<div class="grid-3" style="margin-bottom:14px">
          ${info('대책번호', imp.imp_no)}${info('구분', imp.action_type || '')}${info('상태', imp.status || '')}
          ${info('담당자', imp.owner || '-')}${info('완료예정', fmtDate(imp.due_date) || '-')}${info('완료일', fmtDate(imp.complete_date) || '-')}</div>
          <div class="grid-2">
            <div><div class="muted" style="font-size:12px;font-weight:700">원인분석</div><div style="margin-top:4px">${escapeHtml(imp.cause_analysis || '-')}</div></div>
            <div><div class="muted" style="font-size:12px;font-weight:700">근본대책</div><div style="margin-top:4px">${escapeHtml(imp.root_action || imp.action_plan || '-')}</div></div>
          </div>
          <div style="margin-top:14px"><button class="btn btn--sm" id="nc-imp2">${icon('edit', 14)} 개선대책 수정</button></div>`
        : `<div class="empty" style="padding:30px">${icon('clipboard', 44)}<h4>개선대책이 수립되지 않았습니다</h4><p>[개선대책] 버튼으로 원인분석과 대책을 등록하세요.</p></div>`;
      const b2 = body.querySelector('#nc-imp2'); if (b2) b2.onclick = () => openImprovement(r);
      return;
    }
  }

  // 다음 단계 진행
  async function nextStep(r) {
    const cur = r.progress || '발생';
    const idx = PROGRESS.indexOf(cur);
    const next = PROGRESS[idx + 1];
    if (!next) return;
    const handled = (+r.sort_qty || 0) + (+r.rework_qty || 0) + (+r.scrap_qty || 0) + (+r.accept_qty || 0);
    if (next === '처리결정' && (+r.isolate_qty || 0) <= 0) { toast('격리수량을 먼저 입력하세요. (격리·선별 탭)', 'error'); state.tab = 'isolate'; renderDetail(); return; }
    if (next === '완료') {
      if (handled !== (+r.defect_qty || 0)) { toast(`처리수량(${num(handled)})이 발생수량(${num(r.defect_qty)})과 일치해야 완료할 수 있습니다.`, 'error'); state.tab = 'action'; renderDetail(); return; }
      const imp = improves.find(i => i.ncr_no === r.ncr_no);
      if (!imp) {
        const ok = await confirmDialog({ title: '개선대책 미수립', danger: false, confirmText: '그래도 완료', message: '개선대책이 수립되지 않았습니다.\nSQ 심사에서 지적될 수 있습니다. 완료 처리하시겠습니까?' });
        if (!ok) return;
      }
    }
    try {
      await db.update('nonconformances', r.id, { progress: next, status: next === '완료' ? '완료' : '처리중' });
      toast(`진행상태가 [${next}]로 변경되었습니다.`);
      await reload(); state.selected = rows.find(x => x.id === r.id); renderDetail();
    } catch (e) { toast(e.message || '변경 실패', 'error'); }
  }

  function openIsolate(r) {
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field"><label>발생수량</label><input class="input" value="${num(r.defect_qty)}" readonly></div>
      <div class="field"><label>격리수량 <span class="req">*</span></label><input class="input" type="number" name="isolate_qty" value="${r.isolate_qty || r.defect_qty || 0}"></div>
      <div class="field col-2"><label>격리 위치/방법</label><input class="input" name="remark" value="${escapeHtml(r.remark || '')}" placeholder="예: 부적합품 보관대(적색) 격리, 식별표 부착"></div>`;
    openModal({
      title: '부적합품 식별·격리', body,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 저장</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const iso = Number(body.querySelector('[name="isolate_qty"]').value) || 0;
          if (iso > (+r.defect_qty || 0)) { toast('격리수량은 발생수량을 초과할 수 없습니다.', 'error'); return; }
          try {
            await db.update('nonconformances', r.id, { isolate_qty: iso, remark: body.querySelector('[name="remark"]').value, progress: (r.progress || '발생') === '발생' ? '식별·격리' : r.progress });
            close(); toast('저장되었습니다.'); await reload(); state.selected = rows.find(x => x.id === r.id); renderDetail();
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }

  function openAction(r) {
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field col-2"><label>발생수량 <span class="muted">처리수량 합계가 발생수량과 같아야 완료할 수 있습니다</span></label><input class="input" value="${num(r.defect_qty)} EA" readonly></div>
      <div class="field"><label>선별</label><input class="input" type="number" name="sort_qty" value="${r.sort_qty || 0}"></div>
      <div class="field"><label>재작업</label><input class="input" type="number" name="rework_qty" value="${r.rework_qty || 0}"></div>
      <div class="field"><label>폐기</label><input class="input" type="number" name="scrap_qty" value="${r.scrap_qty || 0}"></div>
      <div class="field"><label>특채</label><input class="input" type="number" name="accept_qty" value="${r.accept_qty || 0}"></div>
      <div class="field col-2"><label>처리합계</label><input class="input" name="__sum" value="0" readonly style="font-weight:700"></div>
      <div class="field"><label>대표 조치구분</label><select class="select" name="action_type">${ACTIONS.map(a => `<option value="${a}" ${r.action_type === a ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
      <div class="field"><label>처리기한</label><input class="input" type="date" name="due_date" value="${escapeHtml(String(r.due_date || '').slice(0, 10))}"></div>
      <div class="field col-2"><label>처리방안 상세</label><textarea class="textarea" name="action">${escapeHtml(r.action || '')}</textarea></div>`;
    const sumEl = body.querySelector('[name="__sum"]');
    const calc = () => {
      const s = ['sort_qty', 'rework_qty', 'scrap_qty', 'accept_qty'].reduce((a, k) => a + (Number(body.querySelector(`[name="${k}"]`).value) || 0), 0);
      sumEl.value = `${num(s)} EA ${s === (+r.defect_qty || 0) ? '(일치)' : `(발생수량과 ${s > (+r.defect_qty || 0) ? '초과' : '부족'} ${num(Math.abs(s - (+r.defect_qty || 0)))})`}`;
      sumEl.style.color = s === (+r.defect_qty || 0) ? 'var(--success)' : 'var(--danger)';
    };
    ['sort_qty', 'rework_qty', 'scrap_qty', 'accept_qty'].forEach(k => body.querySelector(`[name="${k}"]`).addEventListener('input', calc));
    calc();
    openModal({
      title: '부적합 처리내용', body, wide: true,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 저장</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => Number(body.querySelector(`[name="${n}"]`).value) || 0;
          const sum = g('sort_qty') + g('rework_qty') + g('scrap_qty') + g('accept_qty');
          if (sum > (+r.defect_qty || 0)) { toast('처리수량 합계가 발생수량을 초과할 수 없습니다.', 'error'); return; }
          try {
            await db.update('nonconformances', r.id, {
              sort_qty: g('sort_qty'), rework_qty: g('rework_qty'), scrap_qty: g('scrap_qty'), accept_qty: g('accept_qty'),
              action_type: body.querySelector('[name="action_type"]').value,
              action: body.querySelector('[name="action"]').value,
              due_date: body.querySelector('[name="due_date"]').value || null,
              progress: ['발생', '식별·격리'].includes(r.progress || '발생') ? '처리결정' : r.progress,
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
      <div class="field"><label>발생일 <span class="req">*</span></label><input class="input" type="date" name="occur_date" value="${escapeHtml(String(v('occur_date', todayStr())).slice(0, 10))}"></div>
      <div class="field"><label>부적합 구분 <span class="req">*</span></label><select class="select" name="ncr_type">${NCR_TYPES.map(t => `<option value="${t}" ${v('ncr_type', '공정부적합') === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label>품목 <span class="req">*</span></label><select class="select" name="item_code"><option value="">선택</option>
        ${items.map(i => `<option value="${escapeHtml(i.code)}" ${v('item_code') === i.code ? 'selected' : ''}>${escapeHtml(i.code)} · ${escapeHtml(i.name)}</option>`).join('')}</select></div>
      <div class="field"><label>LOT</label><input class="input" name="lot_no" value="${escapeHtml(v('lot_no'))}"></div>
      <div class="field"><label>발생공정</label><select class="select" name="process"><option value="">선택</option>
        ${processes.map(p => `<option value="${escapeHtml(p.name)}" ${v('process') === p.name ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>설비/호기</label><input class="input" name="equipment" value="${escapeHtml(v('equipment'))}"></div>
      <div class="field"><label>불량유형 <span class="req">*</span></label>
        ${defectCodes.length ? `<select class="select" name="defect_type"><option value="">선택</option>
          ${defectCodes.map(c => `<option value="${escapeHtml(c.name)}" ${v('defect_type') === c.name ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select>`
          : `<input class="input" name="defect_type" value="${escapeHtml(v('defect_type'))}" placeholder="예: 치수불량">`}</div>
      <div class="field"><label>발생수량 <span class="req">*</span></label><input class="input" type="number" name="defect_qty" value="${v('defect_qty', 0)}"></div>
      <div class="field"><label>작업자</label><select class="select" name="worker"><option value="">선택</option>
        ${users.map(u => `<option value="${escapeHtml(u.name)}" ${v('worker') === u.name ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select></div>
      <div class="field"><label>귀책부서</label><select class="select" name="charge_dept"><option value="">선택</option>
        ${depts.map(d => `<option value="${escapeHtml(d.name)}" ${v('charge_dept') === d.name ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}</select></div>
      <div class="field"><label>담당자</label><select class="select" name="owner"><option value="">선택</option>
        ${users.map(u => `<option value="${escapeHtml(u.name)}" ${v('owner') === u.name ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select></div>
      <div class="field"><label>처리기한</label><input class="input" type="date" name="due_date" value="${escapeHtml(String(v('due_date', '')).slice(0, 10))}"></div>
      <div class="field"><label>고객사(클레임)</label><input class="input" name="partner" value="${escapeHtml(v('partner'))}"></div>
      <div class="field"><label>클레임금액</label><input class="input" type="number" name="claim_amount" value="${v('claim_amount', 0)}"></div>
      <div class="field col-2"><label>원인</label><textarea class="textarea" name="cause">${escapeHtml(v('cause'))}</textarea></div>
      <div class="field col-2"><label>발생사진/증빙 URL</label><input class="input" name="photo_url" value="${escapeHtml(v('photo_url'))}"></div>`;
    openModal({
      title: `부적합 ${isEdit ? '수정' : '등록'}`, body, wide: true,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} ${isEdit ? '수정' : '등록'}</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => { const el = body.querySelector(`[name="${n}"]`); return el ? el.value.trim() : ''; };
          if (!g('item_code')) { toast('품목을 선택하세요.', 'error'); return; }
          if (!g('defect_type')) { toast('불량유형을 입력하세요.', 'error'); return; }
          const it = items.find(i => i.code === g('item_code'));
          const payload = {
            occur_date: g('occur_date') || todayStr(), ncr_type: g('ncr_type'),
            item_code: g('item_code'), item_name: it?.name || '', lot_no: g('lot_no'),
            process: g('process'), equipment: g('equipment'), defect_type: g('defect_type'),
            defect_qty: Number(g('defect_qty')) || 0, worker: g('worker'), charge_dept: g('charge_dept'),
            owner: g('owner'), due_date: g('due_date') || null, partner: g('partner'),
            claim_amount: Number(g('claim_amount')) || 0, cause: g('cause'), photo_url: g('photo_url'),
          };
          try {
            if (isEdit) await db.update('nonconformances', r.id, payload);
            else {
              payload.ncr_no = nextDocNo('NC', rows.map(x => x.ncr_no));
              payload.progress = '발생'; payload.status = '처리중';
              payload.isolate_qty = 0;
              await db.insert('nonconformances', payload);
            }
            close(); toast(isEdit ? '수정되었습니다.' : '등록되었습니다.');
            await reload();
            if (isEdit) { state.selected = rows.find(x => x.id === r.id); renderDetail(); }
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }

  // 개선대책 등록/수정 (부적합에서 바로)
  function openImprovement(r) {
    const imp = improves.find(i => i.ncr_no === r.ncr_no);
    openImprovementForm(imp, r, users, improves, async () => { await reload(); state.selected = rows.find(x => x.id === r.id); renderDetail(); });
  }

  function exportCsv() {
    downloadCSV(`부적합관리_${todayStr()}.csv`, [
      { label: '부적합번호', key: 'ncr_no' }, { label: '발생일', key: 'occur_date', csv: r => fmtDate(r.occur_date) },
      { label: '구분', key: 'ncr_type' }, { label: '공정', key: 'process' }, { label: '품명', key: 'item_name' },
      { label: 'LOT', key: 'lot_no' }, { label: '불량유형', key: 'defect_type' }, { label: '발생수량', key: 'defect_qty' },
      { label: '격리수량', key: 'isolate_qty' }, { label: '선별', key: 'sort_qty' }, { label: '재작업', key: 'rework_qty' },
      { label: '폐기', key: 'scrap_qty' }, { label: '특채', key: 'accept_qty' }, { label: '귀책부서', key: 'charge_dept' },
      { label: '진행상태', key: 'progress' }, { label: '처리기한', key: 'due_date', csv: r => fmtDate(r.due_date) },
    ], scoped());
    toast('CSV로 내보냈습니다.');
  }

  async function reload() {
    try { await loadAll(); renderStats(); renderChips(); renderTable(); if (state.selected) { state.selected = rows.find(x => x.id === state.selected.id); renderDetail(); } }
    catch (e) { root.querySelector('#nc-table').innerHTML = `<div class="empty">${icon('alert', 48)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
  }
  reload();
}

// =====================================================================
// 개선대책관리
// =====================================================================
export function openImprovementForm(imp, ncr, users, allImproves, onSaved) {
  const isEdit = !!imp;
  const v = (k, d = '') => (imp ? (imp[k] ?? d) : d);
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="grid-3" style="margin-bottom:14px">
      ${info('부적합번호', ncr?.ncr_no || v('ncr_no'))}
      ${info('품목', `${ncr?.item_code || ''} ${ncr?.item_name || ''}`)}
      ${info('불량', `${ncr?.defect_type || ''} ${ncr ? num(ncr.defect_qty) + 'EA' : ''}`)}
    </div>
    <form class="form-grid" id="imp-form">
      <div class="field col-2"><label>제목 <span class="req">*</span></label><input class="input" name="title" value="${escapeHtml(v('title', ncr ? `${ncr.defect_type || '부적합'} 개선대책 — ${ncr.item_name || ''}` : ''))}"></div>
      <div class="field"><label>구분</label><select class="select" name="action_type">
        <option value="시정조치" ${v('action_type', '시정조치') === '시정조치' ? 'selected' : ''}>시정조치</option>
        <option value="예방조치" ${v('action_type') === '예방조치' ? 'selected' : ''}>예방조치</option></select></div>
      <div class="field"><label>담당자 <span class="req">*</span></label><select class="select" name="owner"><option value="">선택</option>
        ${(users || []).map(u => `<option value="${escapeHtml(u.name)}" ${v('owner') === u.name ? 'selected' : ''}>${escapeHtml(u.name)}${u.department ? ` (${escapeHtml(u.department)})` : ''}</option>`).join('')}</select></div>
      <div class="field"><label>완료기한</label><input class="input" type="date" name="due_date" value="${escapeHtml(String(v('due_date', '')).slice(0, 10))}"></div>
      <div class="field"><label>완료일</label><input class="input" type="date" name="complete_date" value="${escapeHtml(String(v('complete_date', '')).slice(0, 10))}"></div>
      <div class="field col-2"><label>원인분석 <span class="req">*</span> <span class="muted">(5Why / 4M 관점)</span></label>
        <textarea class="textarea" name="cause_analysis" placeholder="Man: \nMachine: \nMaterial: \nMethod: ">${escapeHtml(v('cause_analysis'))}</textarea></div>
      <div class="field col-2"><label>임시조치 (응급조치)</label><textarea class="textarea" name="temp_action" placeholder="예: 해당 LOT 전수 선별, 후속 LOT 초물검사 강화">${escapeHtml(v('temp_action'))}</textarea></div>
      <div class="field col-2"><label>근본대책 <span class="req">*</span></label><textarea class="textarea" name="root_action" placeholder="예: 공구 교체알람 450회 설정 + 교체 후 치수검증 의무화">${escapeHtml(v('root_action', v('action_plan')))}</textarea></div>
      <div class="field"><label>조치 전 자료 URL</label><input class="input" name="before_url" value="${escapeHtml(v('before_url'))}"></div>
      <div class="field"><label>조치 후 자료 URL</label><input class="input" name="after_url" value="${escapeHtml(v('after_url'))}"></div>
      <div class="field"><label>유효성 평가</label><select class="select" name="effect_result">
        <option value="" ${!v('effect_result') ? 'selected' : ''}>미평가</option>
        <option value="적합" ${v('effect_result') === '적합' ? 'selected' : ''}>적합 (효과 있음)</option>
        <option value="부적합" ${v('effect_result') === '부적합' ? 'selected' : ''}>부적합 (재수립 필요)</option></select></div>
      <div class="field"><label>재발 여부</label><label class="switch" style="height:40px"><input type="checkbox" name="recur_yn" ${v('recur_yn') ? 'checked' : ''}><span class="switch__track"></span><span class="muted" data-switch-label>${v('recur_yn') ? '재발' : '재발 없음'}</span></label></div>
      <div class="field col-2"><label>효과확인 내용</label><textarea class="textarea" name="effect_check">${escapeHtml(v('effect_check'))}</textarea></div>
      <div class="field col-2"><label>유사품목 수평전개</label><textarea class="textarea" name="horizontal" placeholder="예: 동일 공정 P-CNC-01에 동일 대책 적용 완료(2026-07-25)">${escapeHtml(v('horizontal'))}</textarea></div>
      <div class="field"><label>승인자</label><select class="select" name="approver"><option value="">선택</option>
        ${(users || []).map(u => `<option value="${escapeHtml(u.name)}" ${v('approver') === u.name ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select></div>
      <div class="field"><label>상태</label><select class="select" name="status">
        ${['진행중', '완료', '지연'].map(s => `<option value="${s}" ${v('status', '진행중') === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    </form>`;
  openModal({
    title: `개선대책 ${isEdit ? '수정' : '수립'}`, body, wide: true,
    footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 저장</button>`,
    onMount: ({ footEl, close }) => {
      footEl.querySelector('[data-cancel]').onclick = close;
      footEl.querySelector('[data-ok]').onclick = async () => {
        const form = body.querySelector('#imp-form');
        const g = (n) => { const el = form.querySelector(`[name="${n}"]`); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };
        if (!g('title')) { toast('제목을 입력하세요.', 'error'); return; }
        if (!g('owner')) { toast('담당자를 선택하세요.', 'error'); return; }
        if (!g('cause_analysis')) { toast('원인분석을 입력하세요.', 'error'); return; }
        if (!g('root_action')) { toast('근본대책을 입력하세요.', 'error'); return; }
        if (g('status') === '완료' && !g('effect_result')) { toast('완료 처리 전 유효성 평가를 입력하세요.', 'error'); return; }
        const payload = {
          ncr_no: ncr?.ncr_no || v('ncr_no'), title: g('title'), action_type: g('action_type'), owner: g('owner'),
          due_date: g('due_date') || null, complete_date: g('complete_date') || null,
          cause_analysis: g('cause_analysis'), temp_action: g('temp_action'), root_action: g('root_action'),
          action_plan: g('root_action'), before_url: g('before_url'), after_url: g('after_url'),
          effect_result: g('effect_result'), effect_check: g('effect_check'), recur_yn: g('recur_yn'),
          horizontal: g('horizontal'), approver: g('approver'), status: g('status'),
        };
        try {
          if (isEdit) await db.update('improvement_actions', imp.id, payload);
          else {
            payload.imp_no = nextDocNo('CA', (allImproves || []).map(x => x.imp_no));
            payload.reg_date = todayStr();
            await db.insert('improvement_actions', payload);
          }
          close(); toast('저장되었습니다.'); onSaved && onSaved();
        } catch (e) { toast(e.message || '저장 실패', 'error'); }
      };
    },
  });
}

export async function improvementActions(root) {
  const state = { search: '', chip: '전체' };
  let rows = [], ncrs = [], users = [];

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>개선대책관리</h1><p>부적합 → 원인분석 → 임시조치·근본대책 → 담당자·기한 → 유효성 평가 → 수평전개 순으로 관리합니다.</p></div>
      <div class="page-head__actions">
        <button class="btn" id="im-csv">${icon('download', 16)} 엑셀(CSV)</button>
        <button class="btn" id="im-refresh">${icon('refresh', 16)} 새로고침</button>
        <button class="btn btn--primary" id="im-add">${icon('plus', 16)} 개선대책 수립</button>
      </div>
    </div>
    <div id="im-stats"></div>
    <div class="card">
      <div class="toolbar"><div class="search-box grow">${icon('search', 16)}<input id="im-search" placeholder="대책번호·부적합번호·제목·담당자 검색" autocomplete="off"/></div></div>
      <div class="toolbar" style="border-top:0;padding-top:12px"><div class="chips" id="im-chips"></div></div>
      <div class="table-wrap"><div id="im-table"><div class="spinner"></div></div></div>
    </div>`;
  root.querySelector('#im-refresh').onclick = () => reload();
  root.querySelector('#im-csv').onclick = () => exportCsv();
  root.querySelector('#im-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });
  root.querySelector('#im-add').onclick = () => openPick();

  async function loadAll() {
    [rows, ncrs, users] = await Promise.all([
      db.all('improvement_actions', {}).catch(() => []),
      db.all('nonconformances', {}).catch(() => []),
      db.all('users', { sort: 'name' }).catch(() => []),
    ]);
  }
  const dday = (d) => (d ? Math.round((new Date(String(d).slice(0, 10)) - new Date(todayStr())) / 86400000) : null);
  function scoped() {
    const q = state.search.toLowerCase();
    return rows.filter(r => {
      if (state.chip !== '전체') {
        if (state.chip === '기한초과') { const dd = dday(r.due_date); if (!(r.status !== '완료' && dd != null && dd < 0)) return false; }
        else if (state.chip === '미평가') { if (!(r.status === '완료' && !r.effect_result)) return false; }
        else if (r.status !== state.chip) return false;
      }
      if (q && ![r.imp_no, r.ncr_no, r.title, r.owner].some(v => String(v ?? '').toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => String(b.reg_date).localeCompare(String(a.reg_date)));
  }
  function renderStats() {
    const done = rows.filter(r => r.status === '완료');
    const rate = rows.length ? ((done.length / rows.length) * 100).toFixed(1) : '0.0';
    const overdue = rows.filter(r => r.status !== '완료' && dday(r.due_date) != null && dday(r.due_date) < 0);
    root.querySelector('#im-stats').innerHTML = `<div class="stat-grid">
      ${stat('총 개선대책', num(rows.length), '건', 'clipboard', 'brand')}
      ${stat('완료율', rate, '%', 'checkCircle', 'green')}
      ${stat('기한 초과', num(overdue.length), '건', 'alert', 'red')}
      ${stat('재발 발생', num(rows.filter(r => r.recur_yn).length), '건', 'refresh', 'amber')}</div>`;
  }
  function renderChips() {
    const wrap = root.querySelector('#im-chips');
    const opts = [['전체', rows.length], ['진행중', rows.filter(r => r.status === '진행중').length], ['완료', rows.filter(r => r.status === '완료').length],
      ['지연', rows.filter(r => r.status === '지연').length],
      ['기한초과', rows.filter(r => r.status !== '완료' && dday(r.due_date) != null && dday(r.due_date) < 0).length],
      ['미평가', rows.filter(r => r.status === '완료' && !r.effect_result).length]];
    wrap.innerHTML = opts.map(([t, c]) => `<button class="chip ${state.chip === t ? 'active' : ''}" data-c="${t}">${t}<span class="chip__count">${c}</span></button>`).join('');
    wrap.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { state.chip = b.dataset.c; renderChips(); renderTable(); });
  }
  function renderTable() {
    const list = scoped(); const slot = root.querySelector('#im-table');
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:50px">${icon('inbox', 48)}<h4>개선대책이 없습니다</h4><p>[개선대책 수립]으로 부적합에 대한 대책을 등록하세요.</p></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th>대책번호</th><th>등록일</th><th>부적합번호</th><th>제목</th><th class="center">구분</th><th>담당자</th>
      <th class="center">완료기한</th><th class="center">D-Day</th><th class="center">유효성</th><th class="center">재발</th><th class="center">상태</th><th class="center" style="width:88px">관리</th>
    </tr></thead><tbody>${list.map(r => {
      const dd = dday(r.due_date);
      const ddTxt = dd == null ? '-' : (r.status === '완료' ? '완료' : dd < 0 ? `D+${-dd}` : dd === 0 ? 'D-Day' : `D-${dd}`);
      const ddTone = r.status === '완료' ? 'success' : dd == null ? 'neutral' : dd < 0 ? 'danger' : dd <= 3 ? 'warning' : 'neutral';
      return `<tr>
        <td class="cell-code">${escapeHtml(r.imp_no)}</td><td>${fmtDate(r.reg_date)}</td>
        <td class="cell-code">${escapeHtml(r.ncr_no || '-')}</td><td class="cell-strong">${escapeHtml(r.title || '')}</td>
        <td class="center">${badge(r.action_type || '시정조치')}</td><td>${escapeHtml(r.owner || '')}</td>
        <td class="center">${fmtDate(r.due_date) || '-'}</td><td class="center">${badge(ddTxt, ddTone)}</td>
        <td class="center">${r.effect_result ? badge(r.effect_result) : '<span class="muted">미평가</span>'}</td>
        <td class="center">${r.recur_yn ? badge('재발', 'danger') : '<span class="muted">-</span>'}</td>
        <td class="center">${badge(r.status || '진행중')}</td>
        <td class="center"><div class="row-actions">
          <button class="icon-btn" data-edit="${r.id}" title="수정">${icon('edit', 15)}</button>
          <button class="icon-btn" data-del="${r.id}" title="삭제">${icon('trash', 15)}</button></div></td>
      </tr>`;
    }).join('')}</tbody></table>`;
    slot.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
      const r = list.find(x => x.id === b.dataset.edit);
      openImprovementForm(r, ncrs.find(n => n.ncr_no === r.ncr_no), users, rows, () => reload());
    });
    slot.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const r = list.find(x => x.id === b.dataset.del);
      if (!(await confirmDialog({ message: `개선대책 [${r.imp_no}]을(를) 삭제하시겠습니까?`, confirmText: '삭제' }))) return;
      try { await db.remove('improvement_actions', r.id); toast('삭제되었습니다.'); reload(); } catch (e) { toast(e.message || '삭제 실패', 'error'); }
    });
  }
  // 부적합 선택 후 대책 수립
  function openPick() {
    const withOut = ncrs.filter(n => !rows.some(r => r.ncr_no === n.ncr_no));
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `<div class="field col-2"><label>대상 부적합 <span class="req">*</span></label>
      <select class="select" name="ncr"><option value="">선택</option>
        ${withOut.map(n => `<option value="${escapeHtml(n.ncr_no)}">${escapeHtml(n.ncr_no)} · ${escapeHtml(n.item_name || '')} · ${escapeHtml(n.defect_type || '')} ${num(n.defect_qty)}EA</option>`).join('')}</select>
      ${!withOut.length ? `<div class="field__err" style="color:var(--warning)">대책이 수립되지 않은 부적합이 없습니다.</div>` : ''}</div>`;
    openModal({
      title: '개선대책 대상 선택', body,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('chevronRight', 16)} 다음</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = () => {
          const no = body.querySelector('[name="ncr"]').value;
          if (!no) { toast('부적합을 선택하세요.', 'error'); return; }
          close();
          openImprovementForm(null, ncrs.find(n => n.ncr_no === no), users, rows, () => reload());
        };
      },
    });
  }
  function exportCsv() {
    downloadCSV(`개선대책_${todayStr()}.csv`, [
      { label: '대책번호', key: 'imp_no' }, { label: '등록일', key: 'reg_date', csv: r => fmtDate(r.reg_date) },
      { label: '부적합번호', key: 'ncr_no' }, { label: '제목', key: 'title' }, { label: '구분', key: 'action_type' },
      { label: '담당자', key: 'owner' }, { label: '완료기한', key: 'due_date', csv: r => fmtDate(r.due_date) },
      { label: '완료일', key: 'complete_date', csv: r => fmtDate(r.complete_date) },
      { label: '유효성', key: 'effect_result' }, { label: '재발', key: 'recur_yn', csv: r => (r.recur_yn ? 'Y' : 'N') }, { label: '상태', key: 'status' },
    ], scoped());
    toast('CSV로 내보냈습니다.');
  }
  async function reload() {
    try { await loadAll(); renderStats(); renderChips(); renderTable(); }
    catch (e) { root.querySelector('#im-table').innerHTML = `<div class="empty">${icon('alert', 48)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
  }
  reload();
}
