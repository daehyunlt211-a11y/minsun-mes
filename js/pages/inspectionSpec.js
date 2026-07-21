// =====================================================================
// 검사규격관리 — 상단 검색 / 중앙 목록 / 하단 상세(탭)
//   · 품목·공정별 검사규격을 개정(Rev) 단위로 관리
//   · 상세: [기본정보] [검사항목] [적용정보] [개정이력]
//   · 승인된 최신 개정본만 검사화면(수입/공정/출하)에 적용
// =====================================================================
import { db } from '../lib/db.js';
import { escapeHtml, fmtDate, todayStr, nextDocNo, num } from '../lib/format.js';
import { toast, confirmDialog, openModal, badge } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { createGridEditor } from '../lib/gridEditor.js';

const TYPES = ['수입검사', '공정검사', '출하검사'];
const APPROVALS = ['작성중', '검토중', '승인', '폐기'];
const CHAR_TYPES = ['일반', '중요특성', '특별특성'];
const CYCLES = ['초물', '중물', '종물', '초·중·종물', '1회/LOT', '전수', '주기(2h)', '주기(4h)'];

// 승인된 최신 개정본 찾기 (검사 화면에서 공용으로 사용)
export async function getActiveSpec(itemCode, inspectType, process) {
  let specs = [];
  try { specs = await db.all('inspection_specs', { filters: { item_code: itemCode, inspect_type: inspectType } }); } catch { return null; }
  let list = specs.filter(s => s.approval_status === '승인' && s.use_yn !== false);
  if (process) {
    const byProc = list.filter(s => (s.process || '') === process);
    if (byProc.length) list = byProc;
  }
  if (!list.length) return null;
  // 개정번호(rev) 내림차순 → 적용일 내림차순
  list.sort((a, b) => String(b.rev || '').localeCompare(String(a.rev || '')) || String(b.apply_date || '').localeCompare(String(a.apply_date || '')));
  const spec = list[0];
  let items = [];
  try { items = await db.all('inspection_spec_items', { filters: { spec_no: spec.spec_no }, sort: 'seq' }); } catch { items = []; }
  return { spec, items };
}

export async function inspectionSpecs(root) {
  const state = {
    search: '', fItem: '', fProcess: '', fType: '__all__', fUse: '__all__', fApproval: '__all__',
    selected: null, tab: 'basic',
    specs: [], items: [], processes: [], instruments: [], users: [],
  };

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>검사규격관리</h1><p>품목·공정별 검사규격을 개정(Rev) 단위로 등록·승인합니다. <b>승인된 최신 개정본만</b> 수입·공정·출하검사 화면에 적용됩니다.</p></div>
      <div class="page-head__actions">
        <button class="btn" id="sp-copy">${icon('layers', 16)} 유사품목 복사</button>
        <button class="btn" id="sp-refresh">${icon('refresh', 16)} 새로고침</button>
        <button class="btn btn--primary" id="sp-add">${icon('plus', 16)} 검사규격 등록</button>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="toolbar">
        <div class="search-box grow">${icon('search', 16)}<input id="sp-search" placeholder="규격번호·품목·검사항목 검색" autocomplete="off"/></div>
        <select class="select" id="sp-fitem" style="width:auto;min-width:170px"><option value="">전체 품목</option></select>
        <select class="select" id="sp-fproc" style="width:auto;min-width:150px"><option value="">전체 공정</option></select>
        <select class="select" id="sp-ftype" style="width:auto;min-width:130px">
          <option value="__all__">전체 검사구분</option>${TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}</select>
        <select class="select" id="sp-fapp" style="width:auto;min-width:130px">
          <option value="__all__">전체 승인상태</option>${APPROVALS.map(t => `<option value="${t}">${t}</option>`).join('')}</select>
        <select class="select" id="sp-fuse" style="width:auto;min-width:120px">
          <option value="__all__">적용 전체</option><option value="Y">적용</option><option value="N">미적용</option></select>
      </div>
      <div class="table-wrap"><div id="sp-table"><div class="spinner"></div></div></div>
    </div>
    <div id="sp-detail"></div>`;

  root.querySelector('#sp-refresh').onclick = () => inspectionSpecs(root);
  root.querySelector('#sp-add').onclick = () => openSpecForm(null);
  root.querySelector('#sp-copy').onclick = () => openCopy();
  root.querySelector('#sp-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });
  root.querySelector('#sp-fitem').addEventListener('change', (e) => { state.fItem = e.target.value; renderTable(); });
  root.querySelector('#sp-fproc').addEventListener('change', (e) => { state.fProcess = e.target.value; renderTable(); });
  root.querySelector('#sp-ftype').addEventListener('change', (e) => { state.fType = e.target.value; renderTable(); });
  root.querySelector('#sp-fapp').addEventListener('change', (e) => { state.fApproval = e.target.value; renderTable(); });
  root.querySelector('#sp-fuse').addEventListener('change', (e) => { state.fUse = e.target.value; renderTable(); });

  async function loadAll() {
    [state.specs, state.items, state.processes, state.instruments, state.users] = await Promise.all([
      db.all('inspection_specs', {}).catch(() => []),
      db.all('items', { sort: 'code' }).catch(() => []),
      db.all('processes', { sort: 'code' }).catch(() => []),
      db.all('measuring_instruments', { sort: 'code' }).catch(() => []),
      db.all('users', { sort: 'name' }).catch(() => []),
    ]);
    const fi = root.querySelector('#sp-fitem');
    fi.innerHTML = `<option value="">전체 품목</option>` + state.items.map(i => `<option value="${escapeHtml(i.code)}">${escapeHtml(i.code)} · ${escapeHtml(i.name)}</option>`).join('');
    const fp = root.querySelector('#sp-fproc');
    fp.innerHTML = `<option value="">전체 공정</option>` + state.processes.map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join('');
  }

  function filtered() {
    const q = state.search.toLowerCase();
    return state.specs.filter(s => {
      if (state.fItem && s.item_code !== state.fItem) return false;
      if (state.fProcess && (s.process || '') !== state.fProcess) return false;
      if (state.fType !== '__all__' && s.inspect_type !== state.fType) return false;
      if (state.fApproval !== '__all__' && (s.approval_status || '작성중') !== state.fApproval) return false;
      if (state.fUse === 'Y' && s.use_yn === false) return false;
      if (state.fUse === 'N' && s.use_yn !== false) return false;
      if (q && ![s.spec_no, s.item_code, s.item_name, s.process, s.drawing_no].some(v => String(v ?? '').toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => String(a.item_code).localeCompare(String(b.item_code)) || String(a.inspect_type).localeCompare(String(b.inspect_type)) || String(b.rev || '').localeCompare(String(a.rev || '')));
  }

  // 동일 품목·공정·검사구분에서 최신 승인본인지
  function isLatest(s) {
    const same = state.specs.filter(x => x.item_code === s.item_code && x.inspect_type === s.inspect_type && (x.process || '') === (s.process || '') && x.approval_status === '승인');
    if (!same.length) return false;
    same.sort((a, b) => String(b.rev || '').localeCompare(String(a.rev || '')));
    return same[0].id === s.id;
  }

  function renderTable() {
    const list = filtered();
    const slot = root.querySelector('#sp-table');
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:50px">${icon('inbox', 48)}<h4>검사규격이 없습니다</h4><p>[검사규격 등록]으로 추가하세요.</p></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th>규격번호</th><th>품목</th><th>품명</th><th>공정</th><th class="center">검사구분</th><th class="center">개정</th>
      <th class="center">적용일</th><th class="center">검사항목</th><th class="center">승인상태</th><th class="center">적용</th><th class="center" style="width:96px">관리</th>
    </tr></thead><tbody>${list.map(s => {
      const cnt = 0; // 항목 수는 상세에서 조회(성능)
      return `<tr class="clickable ${state.selected?.id === s.id ? 'is-selected' : ''}" data-id="${s.id}">
        <td class="cell-code">${escapeHtml(s.spec_no)}</td>
        <td class="cell-code">${escapeHtml(s.item_code || '')}</td>
        <td class="cell-strong">${escapeHtml(s.item_name || '')}</td>
        <td>${escapeHtml(s.process || '-')}</td>
        <td class="center">${badge(s.inspect_type || '')}</td>
        <td class="center mono">Rev.${escapeHtml(s.rev || '00')}${isLatest(s) ? ' <span class="badge badge--success" style="height:18px">최신</span>' : ''}</td>
        <td class="center">${fmtDate(s.apply_date) || '-'}</td>
        <td class="center" data-cnt="${escapeHtml(s.spec_no)}"><span class="muted">…</span></td>
        <td class="center">${badge(s.approval_status || '작성중')}</td>
        <td class="center">${s.use_yn === false ? badge('미적용', 'neutral') : badge('적용', 'success')}</td>
        <td class="center"><div class="row-actions">
          <button class="icon-btn" data-rev="${s.id}" title="개정(새 Rev 생성)">${icon('layers', 15)}</button>
          <button class="icon-btn" data-edit="${s.id}" title="수정">${icon('edit', 15)}</button>
          <button class="icon-btn" data-del="${s.id}" title="삭제">${icon('trash', 15)}</button>
        </div></td></tr>`;
    }).join('')}</tbody></table>`;

    slot.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = (e) => {
      if (e.target.closest('button')) return;
      select(list.find(x => x.id === tr.dataset.id));
    });
    slot.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openSpecForm(list.find(x => x.id === b.dataset.edit)));
    slot.querySelectorAll('[data-rev]').forEach(b => b.onclick = () => openRevision(list.find(x => x.id === b.dataset.rev)));
    slot.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const s = list.find(x => x.id === b.dataset.del);
      // 사용 중(승인) 규격은 삭제 대신 개정 안내
      if (s.approval_status === '승인') { toast('승인된 규격은 삭제할 수 없습니다. [개정] 또는 상태를 폐기로 변경하세요.', 'error'); return; }
      if (!(await confirmDialog({ message: `검사규격 [${s.spec_no}]과 검사항목을 모두 삭제하시겠습니까?`, confirmText: '삭제' }))) return;
      try {
        const its = await db.all('inspection_spec_items', { filters: { spec_no: s.spec_no } }).catch(() => []);
        for (const it of its) await db.remove('inspection_spec_items', it.id);
        await db.remove('inspection_specs', s.id);
        toast('삭제되었습니다.'); state.selected = null;
        await loadAll(); renderTable(); root.querySelector('#sp-detail').innerHTML = '';
      } catch (e) { toast(e.message || '삭제 실패', 'error'); }
    });
    updateCounts(list);
  }

  async function updateCounts(list) {
    try {
      const all = await db.all('inspection_spec_items', {});
      const map = {};
      for (const it of all) map[it.spec_no] = (map[it.spec_no] || 0) + 1;
      for (const s of list) {
        const el = root.querySelector(`[data-cnt="${CSS.escape(s.spec_no)}"]`);
        if (el) el.innerHTML = map[s.spec_no] ? `<b class="mono">${map[s.spec_no]}</b>` : '<span class="muted">0</span>';
      }
    } catch { /* noop */ }
  }

  // ---------- 하단 상세(탭) ----------
  function select(s) {
    if (!s) return;
    state.selected = s;
    renderTable();
    renderDetail();
  }

  function renderDetail() {
    const s = state.selected;
    const slot = root.querySelector('#sp-detail');
    if (!s) { slot.innerHTML = ''; return; }
    const tabs = [['basic', '기본정보'], ['items', '검사항목'], ['apply', '적용정보'], ['history', '개정이력']];
    slot.innerHTML = `
      <div class="card">
        <div class="card__head">
          <div><div class="flex" style="gap:8px">
            <span class="cell-code" style="font-size:14px">${escapeHtml(s.spec_no)}</span>
            ${badge(s.inspect_type || '')}<span class="badge badge--neutral">Rev.${escapeHtml(s.rev || '00')}</span>${badge(s.approval_status || '작성중')}
          </div><h3 style="margin-top:4px">${escapeHtml(s.item_name || '')} ${s.process ? `<span class="muted" style="font-weight:600;font-size:13px">· ${escapeHtml(s.process)}</span>` : ''}</h3></div>
          <div class="spacer"></div>
          ${s.approval_status !== '승인' ? `<button class="btn btn--primary btn--sm" id="sp-approve">${icon('check', 14)} 승인 처리</button>` : ''}
          <button class="btn btn--sm" id="sp-print">${icon('fileText', 14)} 인쇄</button>
        </div>
        <div class="seg-tabs" style="margin:0 20px">${tabs.map(([k, l]) => `<button class="seg-tab ${state.tab === k ? 'active' : ''}" data-tab="${k}">${escapeHtml(l)}</button>`).join('')}</div>
        <div class="card__body" id="sp-tabbody"></div>
      </div>`;
    slot.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; renderDetail(); });
    const ap = slot.querySelector('#sp-approve');
    if (ap) ap.onclick = () => openApprove(s);
    slot.querySelector('#sp-print').onclick = () => printSpec(s);
    renderTabBody();
  }

  async function renderTabBody() {
    const s = state.selected;
    const body = root.querySelector('#sp-tabbody');
    if (!body) return;

    if (state.tab === 'basic') {
      body.innerHTML = `<div class="grid-3">
        ${info('규격번호', s.spec_no)}${info('품목', `${s.item_code || ''} ${s.item_name || ''}`)}${info('공정', s.process || '-')}
        ${info('검사구분', s.inspect_type || '')}${info('개정번호', 'Rev.' + (s.rev || '00'))}${info('적용일', fmtDate(s.apply_date) || '-')}
        ${info('도면번호', s.drawing_no || '-')}${info('작성자', s.writer || '-')}${info('검토자', s.reviewer || '-')}
        ${info('승인자', s.approver || '-')}${info('승인일', fmtDate(s.approve_date) || '-')}${info('승인상태', s.approval_status || '작성중')}
      </div>
      ${s.remark ? `<div style="margin-top:14px"><div class="muted" style="font-size:12px;font-weight:700">비고</div><div style="margin-top:4px">${escapeHtml(s.remark)}</div></div>` : ''}
      ${s.std_file_url ? `<div style="margin-top:14px"><a class="btn btn--sm" href="${escapeHtml(s.std_file_url)}" target="_blank" rel="noopener">${icon('fileText', 14)} 검사표준서 열기</a></div>` : ''}`;
      return;
    }

    if (state.tab === 'items') {
      body.innerHTML = `<div id="sp-grid"></div>
        <div class="muted" style="margin-top:10px;font-size:12px">※ 상·하한을 입력하면 정량 판정(자동), 판정기준만 입력하면 정성 판정(OK/NG)으로 검사화면에 적용됩니다.</div>`;
      const grid = createGridEditor(body.querySelector('#sp-grid'), [
        { key: 'inspect_item', label: '검사항목', width: '150px', placeholder: '예: 내경 Ø25' },
        { key: 'char_type', label: '특성', type: 'select', options: CHAR_TYPES, width: '96px', align: 'center' },
        { key: 'eval_method', label: '평가방법', type: 'select', options: ['정량적', '정성적'], width: '92px', align: 'center' },
        { key: 'spec_value', label: '기준값/판정기준', width: '130px', placeholder: '25.0 또는 흠 없음' },
        { key: 'unit', label: '단위', width: '64px', placeholder: 'mm' },
        { key: 'lsl', label: '하한', type: 'number', width: '84px' },
        { key: 'usl', label: '상한', type: 'number', width: '84px' },
        { key: 'tolerance', label: '공차(±)', width: '74px', placeholder: '0.02' },
        { key: 'method', label: '검사방법', width: '110px', placeholder: '3차원측정' },
        { key: 'instrument', label: '계측기', type: 'select', width: '130px', placeholder: '선택', options: () => state.instruments.map(i => ({ value: i.code, label: `${i.code} · ${i.name}` })) },
        { key: 'inspect_cycle', label: '검사주기', type: 'select', options: CYCLES, width: '110px' },
        { key: 'sample_size', label: '샘플수', width: '70px', placeholder: '3' },
        {
          key: 'judge', label: '판정방식', width: '90px', align: 'center',
          calc: (r) => (r.lsl != null && r.lsl !== '') || (r.usl != null && r.usl !== '') ? '범위판정' : (r.eval_method === '정성적' ? 'OK/NG' : (r.tolerance ? '공차판정' : '-')),
        },
      ], {
        table: 'inspection_spec_items', parentKey: 'spec_no', parentValue: s.spec_no,
        title: '검사항목', emptyText: '검사항목이 없습니다',
        rowDefaults: { eval_method: '정량적', char_type: '일반', inspect_cycle: '1회/LOT' },
        // 상·하한 입력 시 판정방식 자동 설정: 정량으로 강제
        beforeSaveRow: (r) => {
          if ((r.lsl != null && r.lsl !== '') || (r.usl != null && r.usl !== '')) r.eval_method = '정량적';
          if (r.eval_method === '정량적' && !r.tolerance && r.lsl != null && r.usl != null && r.spec_value) {
            const c = Number(r.spec_value);
            if (!isNaN(c)) r.tolerance = String(Math.max(Number(r.usl) - c, c - Number(r.lsl)));
          }
        },
        onChanged: () => renderTable(),
      });
      grid.load();
      return;
    }

    if (state.tab === 'apply') {
      const latest = isLatest(s);
      body.innerHTML = `
        <div class="grid-2" style="margin-bottom:14px">
          ${info('검사화면 적용 여부', latest && s.use_yn !== false ? '적용 중 (승인된 최신 개정본)' : '미적용')}
          ${info('적용 대상 화면', s.inspect_type || '')}
        </div>
        <div class="${latest && s.use_yn !== false ? 'flex' : 'flex'}" style="padding:12px 14px;background:var(--surface-2);border-radius:10px;gap:8px;align-items:flex-start">
          ${icon(latest && s.use_yn !== false ? 'checkCircle' : 'alert', 18)}
          <div>${latest && s.use_yn !== false
            ? `이 규격은 <b>${escapeHtml(s.item_name || '')}</b>의 <b>${escapeHtml(s.inspect_type)}</b> 화면에서 자동으로 호출됩니다.`
            : `승인 상태가 <b>승인</b>이고 <b>최신 개정본</b>이며 <b>적용</b>으로 설정된 규격만 검사화면에 호출됩니다.`}</div>
        </div>
        <div style="margin-top:16px" class="flex" >
          <button class="btn btn--sm" id="sp-toggle-use">${icon('sliders', 14)} ${s.use_yn === false ? '적용으로 변경' : '미적용으로 변경'}</button>
        </div>`;
      body.querySelector('#sp-toggle-use').onclick = async () => {
        try {
          await db.update('inspection_specs', s.id, { use_yn: s.use_yn === false });
          toast('변경되었습니다.'); await loadAll();
          state.selected = state.specs.find(x => x.id === s.id); renderTable(); renderDetail();
        } catch (e) { toast(e.message || '변경 실패', 'error'); }
      };
      return;
    }

    if (state.tab === 'history') {
      const family = state.specs
        .filter(x => x.item_code === s.item_code && x.inspect_type === s.inspect_type && (x.process || '') === (s.process || ''))
        .sort((a, b) => String(b.rev || '').localeCompare(String(a.rev || '')));
      body.innerHTML = `<div class="table-wrap"><table class="grid">
        <thead><tr><th>규격번호</th><th class="center">개정</th><th class="center">적용일</th><th>작성자</th><th>승인자</th><th class="center">승인일</th><th class="center">상태</th><th class="center">비교</th></tr></thead>
        <tbody>${family.map(x => `<tr class="${x.id === s.id ? 'is-selected' : ''}">
          <td class="cell-code">${escapeHtml(x.spec_no)}</td>
          <td class="center mono">Rev.${escapeHtml(x.rev || '00')}</td>
          <td class="center">${fmtDate(x.apply_date) || '-'}</td>
          <td>${escapeHtml(x.writer || '')}</td><td>${escapeHtml(x.approver || '')}</td>
          <td class="center">${fmtDate(x.approve_date) || '-'}</td>
          <td class="center">${badge(x.approval_status || '작성중')}</td>
          <td class="center">${x.id !== s.id ? `<button class="btn btn--sm" data-diff="${escapeHtml(x.spec_no)}">${icon('layers', 13)} 변경비교</button>` : '<span class="muted">현재</span>'}</td>
        </tr>`).join('')}</tbody></table></div>`;
      body.querySelectorAll('[data-diff]').forEach(b => b.onclick = () => openDiff(s.spec_no, b.dataset.diff));
      return;
    }
  }

  // ---------- 개정본 비교 ----------
  async function openDiff(curNo, prevNo) {
    const [cur, prev] = await Promise.all([
      db.all('inspection_spec_items', { filters: { spec_no: curNo }, sort: 'seq' }).catch(() => []),
      db.all('inspection_spec_items', { filters: { spec_no: prevNo }, sort: 'seq' }).catch(() => []),
    ]);
    const key = (r) => r.inspect_item || '';
    const prevMap = {}; prev.forEach(r => { prevMap[key(r)] = r; });
    const curMap = {}; cur.forEach(r => { curMap[key(r)] = r; });
    const names = [...new Set([...cur.map(key), ...prev.map(key)])];
    const fields = [['spec_value', '기준값'], ['lsl', '하한'], ['usl', '상한'], ['tolerance', '공차'], ['method', '검사방법'], ['instrument', '계측기'], ['inspect_cycle', '검사주기'], ['char_type', '특성']];
    const body = document.createElement('div');
    body.innerHTML = `<div class="muted" style="margin-bottom:10px">${escapeHtml(prevNo)} → <b>${escapeHtml(curNo)}</b> 변경 항목만 표시</div>
      <div class="table-wrap"><table class="grid"><thead><tr><th>검사항목</th><th class="center">구분</th><th>항목</th><th>이전</th><th>현재</th></tr></thead>
      <tbody>${names.map(n => {
        const c = curMap[n], p = prevMap[n];
        if (!p) return `<tr><td class="cell-strong">${escapeHtml(n)}</td><td class="center">${badge('추가', 'success')}</td><td colspan="3" class="muted">신규 항목</td></tr>`;
        if (!c) return `<tr><td class="cell-strong">${escapeHtml(n)}</td><td class="center">${badge('삭제', 'danger')}</td><td colspan="3" class="muted">삭제된 항목</td></tr>`;
        const diffs = fields.filter(([f]) => String(c[f] ?? '') !== String(p[f] ?? ''));
        if (!diffs.length) return '';
        return diffs.map((d, i) => `<tr>
          ${i === 0 ? `<td class="cell-strong" rowspan="${diffs.length}">${escapeHtml(n)}</td><td class="center" rowspan="${diffs.length}">${badge('변경', 'warning')}</td>` : ''}
          <td>${escapeHtml(d[1])}</td><td class="muted">${escapeHtml(p[d[0]] ?? '')}</td><td style="font-weight:700;color:var(--brand)">${escapeHtml(c[d[0]] ?? '')}</td></tr>`).join('');
      }).join('') || `<tr><td colspan="5"><div class="empty" style="padding:26px">${icon('check', 40)}<h4>변경된 항목이 없습니다</h4></div></td></tr>`}</tbody></table></div>`;
    openModal({ title: '개정 전·후 비교', body, wide: true, footer: `<button class="btn" data-cancel>닫기</button>`, onMount: ({ footEl, close }) => { footEl.querySelector('[data-cancel]').onclick = close; } });
  }

  // ---------- 승인 처리 ----------
  function openApprove(s) {
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field col-2"><label>규격</label><input class="input" value="${escapeHtml(s.spec_no)} · ${escapeHtml(s.item_name || '')} (Rev.${escapeHtml(s.rev || '00')})" readonly></div>
      <div class="field"><label>승인상태 <span class="req">*</span></label>
        <select class="select" name="approval_status">${APPROVALS.map(a => `<option value="${a}" ${(s.approval_status || '작성중') === a ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
      <div class="field"><label>승인자</label>
        <select class="select" name="approver"><option value="">선택</option>${state.users.map(u => `<option value="${escapeHtml(u.name)}" ${s.approver === u.name ? 'selected' : ''}>${escapeHtml(u.name)} (${escapeHtml(u.department || '')})</option>`).join('')}</select></div>
      <div class="field"><label>승인일</label><input class="input" type="date" name="approve_date" value="${escapeHtml((s.approve_date || todayStr()).slice(0, 10))}"></div>
      <div class="field"><label>적용일</label><input class="input" type="date" name="apply_date" value="${escapeHtml((s.apply_date || todayStr()).slice(0, 10))}"></div>
      <div class="field col-2 muted" style="background:var(--surface-2);padding:10px 12px;border-radius:10px">승인 시 동일 품목·공정·검사구분의 <b>이전 개정본은 자동으로 미적용</b> 처리되고, 이 규격이 검사화면에 호출됩니다.</div>`;
    openModal({
      title: '검사규격 승인', body,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 저장</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => body.querySelector(`[name="${n}"]`).value;
          const status = g('approval_status');
          try {
            const items = await db.all('inspection_spec_items', { filters: { spec_no: s.spec_no } }).catch(() => []);
            if (status === '승인' && !items.length) { toast('검사항목이 없는 규격은 승인할 수 없습니다.', 'error'); return; }
            await db.update('inspection_specs', s.id, {
              approval_status: status, approver: g('approver'), approve_date: g('approve_date') || null,
              apply_date: g('apply_date') || null, use_yn: status === '승인' ? true : s.use_yn,
            });
            if (status === '승인') {
              // 이전 개정본 미적용 처리
              const olds = state.specs.filter(x => x.id !== s.id && x.item_code === s.item_code && x.inspect_type === s.inspect_type && (x.process || '') === (s.process || '') && x.use_yn !== false);
              for (const o of olds) await db.update('inspection_specs', o.id, { use_yn: false });
            }
            close(); toast('저장되었습니다.');
            await loadAll(); state.selected = state.specs.find(x => x.id === s.id); renderTable(); renderDetail();
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }

  // ---------- 규격 등록/수정 ----------
  function openSpecForm(r) {
    const isEdit = !!r;
    const v = (k, d = '') => (r ? (r[k] ?? d) : d);
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field"><label>품목 <span class="req">*</span></label>
        <select class="select" name="item_code" ${isEdit ? 'disabled' : ''}><option value="">선택</option>
          ${state.items.map(i => `<option value="${escapeHtml(i.code)}" ${v('item_code') === i.code ? 'selected' : ''}>${escapeHtml(i.code)} · ${escapeHtml(i.name)}</option>`).join('')}</select></div>
      <div class="field"><label>검사구분 <span class="req">*</span></label>
        <select class="select" name="inspect_type" ${isEdit ? 'disabled' : ''}>${TYPES.map(t => `<option value="${t}" ${v('inspect_type', '수입검사') === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label>공정 <span class="muted">(공정검사 시)</span></label>
        <select class="select" name="process"><option value="">해당없음</option>
          ${state.processes.map(p => `<option value="${escapeHtml(p.name)}" ${v('process') === p.name ? 'selected' : ''}>${escapeHtml(p.code)} · ${escapeHtml(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>개정번호</label><input class="input" name="rev" value="${escapeHtml(v('rev', '00'))}" placeholder="00"></div>
      <div class="field"><label>적용일</label><input class="input" type="date" name="apply_date" value="${escapeHtml(String(v('apply_date', '')).slice(0, 10))}"></div>
      <div class="field"><label>도면번호</label><input class="input" name="drawing_no" value="${escapeHtml(v('drawing_no'))}" placeholder="품목 선택 시 자동"></div>
      <div class="field"><label>작성자</label>
        <select class="select" name="writer"><option value="">선택</option>${state.users.map(u => `<option value="${escapeHtml(u.name)}" ${v('writer') === u.name ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select></div>
      <div class="field"><label>검토자</label>
        <select class="select" name="reviewer"><option value="">선택</option>${state.users.map(u => `<option value="${escapeHtml(u.name)}" ${v('reviewer') === u.name ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select></div>
      <div class="field col-2"><label>검사표준서 URL</label><input class="input" name="std_file_url" value="${escapeHtml(v('std_file_url'))}" placeholder="문서 링크(스토리지 URL)"></div>
      <div class="field col-2"><label>비고</label><textarea class="textarea" name="remark">${escapeHtml(v('remark'))}</textarea></div>`;

    // 품목 선택 시 품명·도면 자동
    body.querySelector('[name="item_code"]').addEventListener('change', (e) => {
      const it = state.items.find(i => i.code === e.target.value);
      if (it && !body.querySelector('[name="drawing_no"]').value) body.querySelector('[name="drawing_no"]').value = it.drawing_no || '';
    });

    openModal({
      title: `검사규격 ${isEdit ? '수정' : '등록'}`, body, wide: true,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} ${isEdit ? '수정' : '등록'}</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => { const el = body.querySelector(`[name="${n}"]`); return el ? el.value.trim() : ''; };
          const itemCode = isEdit ? r.item_code : g('item_code');
          const type = isEdit ? r.inspect_type : g('inspect_type');
          if (!itemCode) { toast('품목을 선택하세요.', 'error'); return; }
          const it = state.items.find(i => i.code === itemCode);
          const payload = {
            item_code: itemCode, item_name: it?.name || '', inspect_type: type,
            process: g('process'), rev: g('rev') || '00', apply_date: g('apply_date') || null,
            drawing_no: g('drawing_no'), writer: g('writer'), reviewer: g('reviewer'),
            std_file_url: g('std_file_url'), remark: g('remark'),
          };
          try {
            if (isEdit) { await db.update('inspection_specs', r.id, payload); }
            else {
              payload.spec_no = nextDocNo('IS', state.specs.map(x => x.spec_no));
              payload.approval_status = '작성중'; payload.use_yn = true;
              const created = await db.insert('inspection_specs', payload);
              await loadAll(); state.selected = state.specs.find(x => x.id === created?.id) || null; state.tab = 'items';
            }
            close(); toast(isEdit ? '수정되었습니다.' : '등록되었습니다. 검사항목을 입력하세요.');
            await loadAll();
            if (isEdit) state.selected = state.specs.find(x => x.id === r.id);
            renderTable(); renderDetail();
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }

  // ---------- 개정 (새 Rev 생성 + 항목 복사) ----------
  function openRevision(s) {
    const nextRev = String(Number(s.rev || '00') + 1).padStart(2, '0');
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field col-2"><label>원본 규격</label><input class="input" value="${escapeHtml(s.spec_no)} · ${escapeHtml(s.item_name || '')} (Rev.${escapeHtml(s.rev || '00')})" readonly></div>
      <div class="field"><label>새 개정번호 <span class="req">*</span></label><input class="input" name="rev" value="${nextRev}"></div>
      <div class="field"><label>적용일</label><input class="input" type="date" name="apply_date" value="${todayStr()}"></div>
      <div class="field col-2"><label>개정사유</label><textarea class="textarea" name="remark" placeholder="예: 고객 도면 변경(Rev.C)에 따른 공차 조정"></textarea></div>
      <div class="field col-2 muted" style="background:var(--surface-2);padding:10px 12px;border-radius:10px">기존 검사항목이 새 개정본으로 복사됩니다. 새 개정본은 <b>작성중</b> 상태로 생성되며, 승인 시 이전본이 자동 미적용 처리됩니다.</div>`;
    openModal({
      title: '검사규격 개정', body,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('layers', 16)} 개정본 생성</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => body.querySelector(`[name="${n}"]`).value.trim();
          try {
            const spec_no = nextDocNo('IS', state.specs.map(x => x.spec_no));
            await db.insert('inspection_specs', {
              spec_no, item_code: s.item_code, item_name: s.item_name, process: s.process, inspect_type: s.inspect_type,
              rev: g('rev'), apply_date: g('apply_date') || null, drawing_no: s.drawing_no, std_file_url: s.std_file_url,
              writer: s.writer, reviewer: s.reviewer, approval_status: '작성중', use_yn: true,
              prev_spec_no: s.spec_no, remark: g('remark'),
            });
            const items = await db.all('inspection_spec_items', { filters: { spec_no: s.spec_no }, sort: 'seq' }).catch(() => []);
            for (const it of items) {
              const copy = { ...it }; delete copy.id; delete copy.created_at; delete copy.updated_at;
              copy.spec_no = spec_no;
              await db.insert('inspection_spec_items', copy);
            }
            close(); toast(`개정본(Rev.${g('rev')})이 생성되었습니다. 항목 수정 후 승인하세요.`);
            await loadAll();
            state.selected = state.specs.find(x => x.spec_no === spec_no); state.tab = 'items';
            renderTable(); renderDetail();
          } catch (e) { toast(e.message || '개정 실패', 'error'); }
        };
      },
    });
  }

  // ---------- 유사품목 복사 ----------
  function openCopy() {
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field col-2"><label>복사할 원본 규격 <span class="req">*</span></label>
        <select class="select" name="src"><option value="">선택</option>
          ${state.specs.map(s => `<option value="${escapeHtml(s.spec_no)}">${escapeHtml(s.spec_no)} · ${escapeHtml(s.item_name || '')} · ${escapeHtml(s.inspect_type)} (Rev.${escapeHtml(s.rev || '00')})</option>`).join('')}</select></div>
      <div class="field"><label>대상 품목 <span class="req">*</span></label>
        <select class="select" name="target"><option value="">선택</option>
          ${state.items.map(i => `<option value="${escapeHtml(i.code)}">${escapeHtml(i.code)} · ${escapeHtml(i.name)}</option>`).join('')}</select></div>
      <div class="field"><label>적용일</label><input class="input" type="date" name="apply_date" value="${todayStr()}"></div>
      <div class="field col-2 muted" style="background:var(--surface-2);padding:10px 12px;border-radius:10px">원본의 검사항목 전체가 대상 품목의 새 규격(Rev.00, 작성중)으로 복사됩니다.</div>`;
    openModal({
      title: '유사품목 검사규격 복사', body, wide: true,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('layers', 16)} 복사</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const srcNo = body.querySelector('[name="src"]').value;
          const target = body.querySelector('[name="target"]').value;
          const applyDate = body.querySelector('[name="apply_date"]').value;
          if (!srcNo || !target) { toast('원본 규격과 대상 품목을 선택하세요.', 'error'); return; }
          const src = state.specs.find(s => s.spec_no === srcNo);
          const it = state.items.find(i => i.code === target);
          try {
            const spec_no = nextDocNo('IS', state.specs.map(x => x.spec_no));
            await db.insert('inspection_specs', {
              spec_no, item_code: target, item_name: it?.name || '', process: src.process, inspect_type: src.inspect_type,
              rev: '00', apply_date: applyDate || null, drawing_no: it?.drawing_no || '', writer: src.writer,
              approval_status: '작성중', use_yn: true, remark: `${src.spec_no} 복사`,
            });
            const items = await db.all('inspection_spec_items', { filters: { spec_no: srcNo }, sort: 'seq' }).catch(() => []);
            for (const r of items) {
              const copy = { ...r }; delete copy.id; delete copy.created_at; delete copy.updated_at;
              copy.spec_no = spec_no;
              await db.insert('inspection_spec_items', copy);
            }
            close(); toast(`${items.length}개 검사항목이 복사되었습니다.`);
            await loadAll(); state.selected = state.specs.find(x => x.spec_no === spec_no); state.tab = 'items';
            renderTable(); renderDetail();
          } catch (e) { toast(e.message || '복사 실패', 'error'); }
        };
      },
    });
  }

  // ---------- 인쇄 ----------
  async function printSpec(s) {
    const items = await db.all('inspection_spec_items', { filters: { spec_no: s.spec_no }, sort: 'seq' }).catch(() => []);
    const w = window.open('', '_blank', 'width=900,height=900');
    if (!w) { toast('팝업이 차단되었습니다.', 'error'); return; }
    w.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>검사규격서_${s.spec_no}</title>
      <style>body{font-family:'Malgun Gothic',sans-serif;padding:26px;color:#111}h1{font-size:20px;text-align:center;letter-spacing:6px;margin-bottom:6px}
      .sub{text-align:center;color:#555;font-size:12px;margin-bottom:16px}table{width:100%;border-collapse:collapse;margin-bottom:12px}
      th,td{border:1px solid #333;padding:6px 8px;font-size:11.5px;text-align:left}th{background:#f0f0f0}
      .sign{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #333;margin-top:14px}.sign>div{border-right:1px solid #333;text-align:center}
      .sign>div:last-child{border-right:0}.sign .t{background:#f0f0f0;border-bottom:1px solid #333;padding:4px;font-size:11px}.sign .s{height:48px}
      @media print{body{padding:10mm}}</style></head><body>
      <h1>검 사 규 격 서</h1><div class="sub">(주)민선 MES·QMS</div>
      <table><tr><th style="width:110px">규격번호</th><td>${s.spec_no}</td><th style="width:110px">개정번호</th><td>Rev.${s.rev || '00'}</td></tr>
      <tr><th>품목코드</th><td>${s.item_code || ''}</td><th>품명</th><td>${s.item_name || ''}</td></tr>
      <tr><th>검사구분</th><td>${s.inspect_type || ''}</td><th>공정</th><td>${s.process || '-'}</td></tr>
      <tr><th>도면번호</th><td>${s.drawing_no || '-'}</td><th>적용일</th><td>${(s.apply_date || '').slice(0, 10)}</td></tr></table>
      <table><thead><tr><th style="width:34px">№</th><th>검사항목</th><th style="width:60px">특성</th><th style="width:90px">기준값</th><th style="width:50px">단위</th><th style="width:60px">하한</th><th style="width:60px">상한</th><th>검사방법</th><th style="width:90px">계측기</th><th style="width:80px">주기</th><th style="width:50px">샘플</th></tr></thead>
      <tbody>${items.map((r, i) => `<tr><td>${i + 1}</td><td>${r.inspect_item || ''}</td><td>${r.char_type || ''}</td><td>${r.spec_value ?? ''}</td><td>${r.unit || ''}</td><td>${r.lsl ?? ''}</td><td>${r.usl ?? ''}</td><td>${r.method || ''}</td><td>${r.instrument || ''}</td><td>${r.inspect_cycle || ''}</td><td>${r.sample_size || ''}</td></tr>`).join('') || '<tr><td colspan="11" style="text-align:center;color:#888">검사항목 없음</td></tr>'}</tbody></table>
      <div class="sign"><div><div class="t">작 성</div><div class="s">${s.writer || ''}</div></div><div><div class="t">검 토</div><div class="s">${s.reviewer || ''}</div></div><div><div class="t">승 인</div><div class="s">${s.approver || ''}</div></div></div>
      <div style="margin-top:12px;font-size:11px;color:#555">출력일시: ${new Date().toLocaleString('ko-KR')}</div>
      <script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  }

  function info(label, val) {
    return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:11px 13px">
      <div class="muted" style="font-size:11.5px">${escapeHtml(label)}</div>
      <div style="font-weight:700;margin-top:2px">${escapeHtml(val ?? '')}</div></div>`;
  }

  try { await loadAll(); renderTable(); }
  catch (e) {
    root.querySelector('#sp-table').innerHTML = `<div class="empty" style="padding:40px">${icon('database', 46)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p><p class="muted">신규 테이블이 없으면 <b>supabase/migration_v2_sq.sql</b>을 실행하세요.</p></div>`;
  }
}
