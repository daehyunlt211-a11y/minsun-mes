// =====================================================================
// Q-Cost관리 — 기준정보 / 세부항목 / Q-Cost 등록 / Q-Cost 현황
//   · 비용구분(예방·평가·내부실패·외부실패) → 세부항목(계산기준) → 등록 → 현황
//   · 부적합번호 선택 시 품목·LOT·불량수량 자동입력, 수량×단가 / 시간×시간당단가 자동계산
// =====================================================================
import { createCrudPage } from '../lib/crud.js';
import { db } from '../lib/db.js';
import { num, won, fmtDate, todayStr, escapeHtml, nextDocNo, downloadCSV } from '../lib/format.js';
import { badge, toast, openModal, confirmDialog } from '../ui/components.js';
import { icon } from '../ui/icons.js';

const CATEGORIES = ['예방비용', '평가비용', '내부실패비용', '외부실패비용'];
const CAT_TONE = { '예방비용': 'green', '평가비용': 'brand', '내부실패비용': 'amber', '외부실패비용': 'red' };
const CALC_TYPES = ['수량기준', '시간기준', '직접금액'];
const AUTO_LINKS = ['', '부적합', '검사', '재작업', '폐기', '클레임'];

function stat(label, value, unit, ic, tint) {
  return `<div class="stat"><div class="stat__top"><span class="stat__label">${escapeHtml(label)}</span><span class="stat__ico ico-tint-${tint}">${icon(ic, 21)}</span></div><div class="stat__value">${value}${unit ? `<small>${escapeHtml(unit)}</small>` : ''}</div></div>`;
}
function info(label, val) {
  return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:11px 13px"><div class="muted" style="font-size:11.5px">${escapeHtml(label)}</div><div style="font-weight:700;margin-top:2px">${escapeHtml(val ?? '')}</div></div>`;
}

// =====================================================================
// 10-1 기준정보관리 (비용구분)
// =====================================================================
export const qcostItems = createCrudPage({
  table: 'qcost_items', title: 'Q-Cost 기준정보', subtitle: '예방·평가·내부실패·외부실패 비용구분 코드를 관리합니다. 사용 중인 코드는 삭제 대신 사용중지하세요.',
  searchFields: ['code', 'name', 'calc_basis'], searchPlaceholder: '비용구분 코드·명 검색',
  defaultSort: { key: 'sort_no', dir: 'asc' },
  filters: [{ key: 'category', label: '분류', options: CATEGORIES }],
  statusChips: { key: 'category', options: CATEGORIES },
  stats: async (rows) => CATEGORIES.map(c => ({
    label: c, value: num(rows.filter(r => r.category === c).length), unit: '개',
    icon: c === '예방비용' ? 'shield' : c === '평가비용' ? 'search' : 'alert', tint: CAT_TONE[c],
  })),
  columns: [
    { key: 'code', label: '비용구분 코드', cls: 'cell-code', sortable: true },
    { key: 'category', label: '분류', type: 'badge', render: (r) => badge(r.category || '', CAT_TONE[r.category]) },
    { key: 'name', label: '비용구분명', cls: 'cell-strong' },
    { key: 'calc_basis', label: '산출기준' },
    { key: 'sort_no', label: '표시순서', type: 'num', align: 'center' },
    { key: 'use_yn', label: '사용', type: 'yesno', align: 'center' },
    { key: 'remark', label: '비고' },
  ],
  fields: [
    { key: 'code', label: '비용구분 코드', required: true, placeholder: '예: QP-01' },
    { key: 'category', label: '분류', type: 'select', options: CATEGORIES, default: '예방비용', required: true },
    { key: 'name', label: '비용구분명', required: true, placeholder: '예: 품질교육비' },
    { key: 'calc_basis', label: '산출기준', col2: true, placeholder: '예: 월별 교육비 실적 합계' },
    { key: 'sort_no', label: '표시순서', type: 'number', default: 0 },
    { key: 'use_yn', label: '사용여부', type: 'switch', default: true },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// =====================================================================
// 10-2 세부항목관리
// =====================================================================
export async function qcostDetails(root) {
  const state = { search: '', chip: '전체' };
  let rows = [], parents = [], depts = [];

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>Q-Cost 세부항목</h1><p>비용구분별 세부항목과 <b>계산기준(수량/시간/직접금액)</b>·계정과목·담당부서·자동연계를 관리합니다.</p></div>
      <div class="page-head__actions">
        <button class="btn" id="qd-basic">${icon('layers', 16)} 기본항목 생성</button>
        <button class="btn" id="qd-refresh">${icon('refresh', 16)} 새로고침</button>
        <button class="btn btn--primary" id="qd-add">${icon('plus', 16)} 세부항목 등록</button>
      </div>
    </div>
    <div id="qd-stats"></div>
    <div class="card">
      <div class="toolbar"><div class="search-box grow">${icon('search', 16)}<input id="qd-search" placeholder="세부항목 코드·명·계정과목 검색" autocomplete="off"/></div></div>
      <div class="toolbar" style="border-top:0;padding-top:12px"><div class="chips" id="qd-chips"></div></div>
      <div class="table-wrap"><div id="qd-table"><div class="spinner"></div></div></div>
    </div>`;
  root.querySelector('#qd-refresh').onclick = () => reload();
  root.querySelector('#qd-add').onclick = () => openForm(null);
  root.querySelector('#qd-basic').onclick = () => createBasics();
  root.querySelector('#qd-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });

  async function loadAll() {
    [rows, parents, depts] = await Promise.all([
      db.all('qcost_details', {}).catch(() => []),
      db.all('qcost_items', { sort: 'code' }).catch(() => []),
      db.all('departments', { sort: 'code' }).catch(() => []),
    ]);
  }
  function scoped() {
    const q = state.search.toLowerCase();
    return rows.filter(r => {
      if (state.chip !== '전체' && r.category !== state.chip) return false;
      if (q && ![r.detail_code, r.name, r.account, r.dept, r.cost_code].some(v => String(v ?? '').toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => (a.sort_no || 0) - (b.sort_no || 0) || String(a.detail_code).localeCompare(String(b.detail_code)));
  }
  function renderStats() {
    root.querySelector('#qd-stats').innerHTML = `<div class="stat-grid">
      ${CATEGORIES.map(c => stat(c, num(rows.filter(r => r.category === c).length), '개', c === '예방비용' ? 'shield' : c === '평가비용' ? 'search' : 'alert', CAT_TONE[c])).join('')}</div>`;
  }
  function renderChips() {
    const wrap = root.querySelector('#qd-chips');
    const opts = [['전체', rows.length], ...CATEGORIES.map(c => [c, rows.filter(r => r.category === c).length])];
    wrap.innerHTML = opts.map(([t, c]) => `<button class="chip ${state.chip === t ? 'active' : ''}" data-c="${escapeHtml(t)}">${escapeHtml(t)}<span class="chip__count">${c}</span></button>`).join('');
    wrap.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { state.chip = b.dataset.c; renderChips(); renderTable(); });
  }
  function renderTable() {
    const list = scoped(); const slot = root.querySelector('#qd-table');
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:44px">${icon('inbox', 46)}<h4>세부항목이 없습니다</h4><p>[기본항목 생성]으로 표준 항목을 만들 수 있습니다.</p></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th>세부항목 코드</th><th class="center">분류</th><th>상위 비용구분</th><th>세부항목명</th><th class="center">계산기준</th>
      <th class="num">단가</th><th>계정과목</th><th>담당부서</th><th class="center">자동연계</th><th class="center">사용</th><th class="center" style="width:88px">관리</th>
    </tr></thead><tbody>${list.map(r => `<tr>
      <td class="cell-code">${escapeHtml(r.detail_code)}</td>
      <td class="center">${badge(r.category || '', CAT_TONE[r.category])}</td>
      <td class="muted">${escapeHtml(parents.find(p => p.code === r.cost_code)?.name || r.cost_code || '')}</td>
      <td class="cell-strong">${escapeHtml(r.name)}</td>
      <td class="center">${badge(r.calc_type || '직접금액', 'neutral')}</td>
      <td class="num mono">${r.unit_price ? won(r.unit_price) : '-'}</td>
      <td>${escapeHtml(r.account || '')}</td><td>${escapeHtml(r.dept || '')}</td>
      <td class="center">${r.auto_link ? badge(r.auto_link, 'info') : '<span class="muted">-</span>'}</td>
      <td class="center">${r.use_yn === false ? badge('미사용', 'neutral') : badge('사용', 'success')}</td>
      <td class="center"><div class="row-actions">
        <button class="icon-btn" data-edit="${r.id}" title="수정">${icon('edit', 15)}</button>
        <button class="icon-btn" data-del="${r.id}" title="삭제">${icon('trash', 15)}</button></div></td>
    </tr>`).join('')}</tbody></table>`;
    slot.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openForm(list.find(x => x.id === b.dataset.edit)));
    slot.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const r = list.find(x => x.id === b.dataset.del);
      const used = await db.all('qcost_records', { filters: { detail_code: r.detail_code } }).catch(() => []);
      if (used.length) { toast(`등록된 Q-Cost ${used.length}건에서 사용 중입니다. 사용중지로 변경하세요.`, 'error'); return; }
      if (!(await confirmDialog({ message: `[${r.name}]을(를) 삭제하시겠습니까?`, confirmText: '삭제' }))) return;
      try { await db.remove('qcost_details', r.id); toast('삭제되었습니다.'); reload(); } catch (e) { toast(e.message || '삭제 실패', 'error'); }
    });
  }
  async function createBasics() {
    const BASICS = [
      { category: '예방비용', name: '품질교육비', calc_type: '직접금액', account: '교육훈련비' },
      { category: '예방비용', name: '예방정비비', calc_type: '직접금액', account: '수선비' },
      { category: '예방비용', name: '품질시스템 운영비', calc_type: '직접금액', account: '지급수수료' },
      { category: '평가비용', name: '검사인건비', calc_type: '시간기준', account: '급여', auto_link: '검사' },
      { category: '평가비용', name: '검교정비', calc_type: '직접금액', account: '지급수수료' },
      { category: '평가비용', name: '시험분석비', calc_type: '직접금액', account: '지급수수료' },
      { category: '내부실패비용', name: '폐기비용', calc_type: '수량기준', account: '재료비', auto_link: '폐기' },
      { category: '내부실패비용', name: '재작업비용', calc_type: '시간기준', account: '노무비', auto_link: '재작업' },
      { category: '내부실패비용', name: '선별비용', calc_type: '시간기준', account: '노무비', auto_link: '부적합' },
      { category: '외부실패비용', name: '클레임 배상비', calc_type: '직접금액', account: '잡손실', auto_link: '클레임' },
      { category: '외부실패비용', name: '반품 물류비', calc_type: '직접금액', account: '운반비' },
    ];
    const missing = BASICS.filter(b => !rows.some(r => r.name === b.name));
    if (!missing.length) { toast('기본항목이 모두 등록되어 있습니다.', 'error'); return; }
    const ok = await confirmDialog({ title: '기본항목 생성', danger: false, confirmText: '생성', message: `표준 세부항목 ${missing.length}건을 생성합니다.` });
    if (!ok) return;
    try {
      let seq = rows.length;
      for (const b of missing) {
        const parent = parents.find(p => p.category === b.category);
        const prefix = { '예방비용': 'QP', '평가비용': 'QA', '내부실패비용': 'QIF', '외부실패비용': 'QEF' }[b.category];
        const codes = [...rows, ...missing].map(x => x.detail_code).filter(Boolean);
        let n = 1, code;
        do { code = `${prefix}-D${String(n).padStart(2, '0')}`; n++; } while (codes.includes(code) || rows.some(x => x.detail_code === code));
        await db.insert('qcost_details', { ...b, detail_code: code, cost_code: parent?.code || '', sort_no: ++seq * 10, use_yn: true, unit_price: 0 });
        rows.push({ detail_code: code });
      }
      toast(`${missing.length}건이 생성되었습니다.`); await reload();
    } catch (e) { toast(e.message || '생성 실패', 'error'); }
  }
  function openForm(r) {
    const isEdit = !!r;
    const v = (k, d = '') => (r ? (r[k] ?? d) : d);
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field"><label>상위 비용구분 <span class="req">*</span></label><select class="select" name="cost_code"><option value="">선택</option>
        ${parents.map(p => `<option value="${escapeHtml(p.code)}" data-cat="${escapeHtml(p.category || '')}" ${v('cost_code') === p.code ? 'selected' : ''}>${escapeHtml(p.code)} · ${escapeHtml(p.name)} (${escapeHtml(p.category || '')})</option>`).join('')}</select></div>
      <div class="field"><label>분류(자동)</label><input class="input" name="category" value="${escapeHtml(v('category'))}" readonly></div>
      <div class="field"><label>세부항목 코드 <span class="req">*</span></label><input class="input" name="detail_code" value="${escapeHtml(v('detail_code'))}" placeholder="비워두면 자동채번"></div>
      <div class="field"><label>세부항목명 <span class="req">*</span></label><input class="input" name="name" value="${escapeHtml(v('name'))}" placeholder="예: 재작업비"></div>
      <div class="field"><label>계산기준 <span class="req">*</span></label><select class="select" name="calc_type">${CALC_TYPES.map(c => `<option value="${c}" ${v('calc_type', '직접금액') === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label>단가 / 시간당 단가</label><input class="input" type="number" name="unit_price" value="${v('unit_price', 0)}"></div>
      <div class="field"><label>계정과목</label><input class="input" name="account" value="${escapeHtml(v('account'))}"></div>
      <div class="field"><label>담당부서</label><select class="select" name="dept"><option value="">선택</option>
        ${depts.map(d => `<option value="${escapeHtml(d.name)}" ${v('dept') === d.name ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}</select></div>
      <div class="field"><label>자동연계</label><select class="select" name="auto_link">
        ${AUTO_LINKS.map(a => `<option value="${a}" ${v('auto_link') === a ? 'selected' : ''}>${a || '없음'}</option>`).join('')}</select></div>
      <div class="field"><label>표시순서</label><input class="input" type="number" name="sort_no" value="${v('sort_no', 0)}"></div>
      <div class="field"><label>사용여부</label><label class="switch" style="height:40px"><input type="checkbox" name="use_yn" ${v('use_yn', true) === false ? '' : 'checked'}><span class="switch__track"></span><span class="muted" data-switch-label>${v('use_yn', true) === false ? '미사용' : '사용'}</span></label></div>
      <div class="field col-2"><label>비고</label><textarea class="textarea" name="remark">${escapeHtml(v('remark'))}</textarea></div>
      <div class="field col-2 muted" style="background:var(--surface-2);padding:10px 12px;border-radius:10px" id="qd-hint"></div>`;
    const hint = body.querySelector('#qd-hint');
    const updateHint = () => {
      const t = body.querySelector('[name="calc_type"]').value;
      hint.innerHTML = t === '수량기준' ? `${icon('alert', 15)} 등록 시 <b>수량 × 단가</b>로 금액이 자동 계산됩니다.`
        : t === '시간기준' ? `${icon('alert', 15)} 등록 시 <b>작업시간 × 시간당 단가</b>로 금액이 자동 계산됩니다.`
          : `${icon('alert', 15)} 등록 시 금액을 직접 입력합니다.`;
    };
    body.querySelector('[name="calc_type"]').addEventListener('change', updateHint);
    body.querySelector('[name="cost_code"]').addEventListener('change', (e) => {
      body.querySelector('[name="category"]').value = e.target.selectedOptions[0]?.dataset.cat || '';
    });
    updateHint();
    openModal({
      title: `Q-Cost 세부항목 ${isEdit ? '수정' : '등록'}`, body, wide: true,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 저장</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => { const el = body.querySelector(`[name="${n}"]`); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };
          if (!g('cost_code')) { toast('상위 비용구분을 선택하세요.', 'error'); return; }
          if (!g('name')) { toast('세부항목명을 입력하세요.', 'error'); return; }
          if (!isEdit && rows.some(x => x.name === g('name') && x.cost_code === g('cost_code'))) { toast('동일 비용구분에 같은 이름의 항목이 있습니다.', 'error'); return; }
          let code = g('detail_code');
          if (!code) {
            const prefix = { '예방비용': 'QP', '평가비용': 'QA', '내부실패비용': 'QIF', '외부실패비용': 'QEF' }[g('category')] || 'QD';
            let n = 1; do { code = `${prefix}-D${String(n).padStart(2, '0')}`; n++; } while (rows.some(x => x.detail_code === code));
          }
          const payload = {
            detail_code: code, cost_code: g('cost_code'), category: g('category'), name: g('name'),
            calc_type: g('calc_type'), unit_price: Number(g('unit_price')) || 0, account: g('account'),
            dept: g('dept'), auto_link: g('auto_link'), sort_no: Number(g('sort_no')) || 0,
            use_yn: g('use_yn'), remark: g('remark'),
          };
          try {
            if (isEdit) await db.update('qcost_details', r.id, payload); else await db.insert('qcost_details', payload);
            close(); toast('저장되었습니다.'); await reload();
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }
  async function reload() {
    try { await loadAll(); renderStats(); renderChips(); renderTable(); }
    catch (e) { root.querySelector('#qd-table').innerHTML = `<div class="empty" style="padding:40px">${icon('database', 46)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p><p class="muted">신규 테이블이 없으면 <b>supabase/migration_v2_sq.sql</b>을 실행하세요.</p></div>`; }
  }
  reload();
}

// =====================================================================
// 10-3 Q-Cost 관리 (등록)
// =====================================================================
export async function qcostRecords(root) {
  const state = { search: '', chip: '전체', from: '', to: '' };
  let rows = [], details = [], ncrs = [], items = [], processes = [], depts = [], users = [];

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>Q-Cost 관리</h1><p>품질비용을 등록합니다. <b>부적합번호 선택 시 품목·LOT·불량수량이 자동 입력</b>되고, 계산기준에 따라 금액이 자동 계산됩니다.</p></div>
      <div class="page-head__actions">
        <button class="btn" id="qr-csv">${icon('download', 16)} 엑셀(CSV)</button>
        <button class="btn" id="qr-refresh">${icon('refresh', 16)} 새로고침</button>
        <button class="btn btn--primary" id="qr-add">${icon('plus', 16)} Q-Cost 등록</button>
      </div>
    </div>
    <div id="qr-stats"></div>
    <div class="card">
      <div class="toolbar">
        <div class="search-box grow">${icon('search', 16)}<input id="qr-search" placeholder="등록번호·항목·품목·부적합번호 검색" autocomplete="off"/></div>
        <div class="date-range"><span class="date-range__label">${icon('calendar', 14)} 발생일</span>
          <input class="input input--date" type="date" id="qr-from"><span class="date-range__sep">~</span><input class="input input--date" type="date" id="qr-to"></div>
      </div>
      <div class="toolbar" style="border-top:0;padding-top:12px"><div class="chips" id="qr-chips"></div></div>
      <div class="table-wrap"><div id="qr-table"><div class="spinner"></div></div></div>
    </div>`;
  root.querySelector('#qr-refresh').onclick = () => reload();
  root.querySelector('#qr-add').onclick = () => openForm(null);
  root.querySelector('#qr-csv').onclick = () => exportCsv();
  root.querySelector('#qr-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });
  root.querySelector('#qr-from').addEventListener('change', (e) => { state.from = e.target.value; renderTable(); });
  root.querySelector('#qr-to').addEventListener('change', (e) => { state.to = e.target.value; renderTable(); });

  async function loadAll() {
    [rows, details, ncrs, items, processes, depts, users] = await Promise.all([
      db.all('qcost_records', {}).catch(() => []),
      db.all('qcost_details', {}).catch(() => []),
      db.all('nonconformances', {}).catch(() => []),
      db.all('items', { sort: 'code' }).catch(() => []),
      db.all('processes', { sort: 'code' }).catch(() => []),
      db.all('departments', { sort: 'code' }).catch(() => []),
      db.all('users', { sort: 'name' }).catch(() => []),
    ]);
  }
  function scoped() {
    const q = state.search.toLowerCase();
    return rows.filter(r => {
      if (state.chip !== '전체' && r.category !== state.chip) return false;
      const d = String(r.cost_date || r.cost_ym || '').slice(0, 10);
      if (state.from && d < state.from) return false;
      if (state.to && d > state.to) return false;
      if (q && ![r.rec_no, r.detail_name, r.cost_name, r.item_name, r.ncr_no, r.dept].some(v => String(v ?? '').toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => String(b.cost_date || b.cost_ym).localeCompare(String(a.cost_date || a.cost_ym)));
  }
  function renderStats() {
    const list = scoped();
    const sum = (cat) => list.filter(r => r.category === cat).reduce((s, r) => s + (+r.amount || 0), 0);
    root.querySelector('#qr-stats').innerHTML = `<div class="stat-grid">
      ${CATEGORIES.map(c => stat(c, won(sum(c)), '', c === '예방비용' ? 'shield' : c === '평가비용' ? 'search' : 'alert', CAT_TONE[c])).join('')}</div>`;
  }
  function renderChips() {
    const wrap = root.querySelector('#qr-chips');
    const opts = [['전체', rows.length], ...CATEGORIES.map(c => [c, rows.filter(r => r.category === c).length])];
    wrap.innerHTML = opts.map(([t, c]) => `<button class="chip ${state.chip === t ? 'active' : ''}" data-c="${escapeHtml(t)}">${escapeHtml(t)}<span class="chip__count">${c}</span></button>`).join('');
    wrap.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { state.chip = b.dataset.c; renderChips(); renderTable(); renderStats(); });
  }
  function renderTable() {
    const list = scoped(); const slot = root.querySelector('#qr-table');
    renderStats();
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:44px">${icon('inbox', 46)}<h4>Q-Cost 등록 내역이 없습니다</h4></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th>등록번호</th><th>발생일</th><th class="center">분류</th><th>세부항목</th><th>품목</th><th>공정</th><th>LOT</th><th>부적합</th>
      <th class="num">수량/시간</th><th class="num">단가</th><th class="num">금액</th><th>담당부서</th><th class="center">마감</th><th class="center" style="width:88px">관리</th>
    </tr></thead><tbody>${list.map(r => `<tr>
      <td class="cell-code">${escapeHtml(r.rec_no)}</td><td>${fmtDate(r.cost_date) || escapeHtml(r.cost_ym || '')}</td>
      <td class="center">${badge(r.category || '', CAT_TONE[r.category])}</td>
      <td class="cell-strong">${escapeHtml(r.detail_name || r.cost_name || '')}</td>
      <td>${escapeHtml(r.item_name || '')}</td><td>${escapeHtml(r.process || '')}</td>
      <td class="cell-code">${escapeHtml(r.lot_no || '')}</td><td class="cell-code">${escapeHtml(r.ncr_no || '')}</td>
      <td class="num mono">${r.calc_type === '시간기준' ? `${num(r.work_hours)}h` : r.qty ? num(r.qty) : '-'}</td>
      <td class="num mono">${r.calc_type === '시간기준' ? won(r.hour_rate) : r.unit_price ? won(r.unit_price) : '-'}</td>
      <td class="num mono" style="font-weight:700">${won(r.amount)}</td>
      <td>${escapeHtml(r.dept || '')}</td>
      <td class="center">${r.closed_yn ? badge('마감', 'neutral') : '<span class="muted">-</span>'}</td>
      <td class="center"><div class="row-actions">
        <button class="icon-btn" data-copy="${r.id}" title="반복등록">${icon('layers', 15)}</button>
        <button class="icon-btn" data-edit="${r.id}" title="수정">${icon('edit', 15)}</button>
        <button class="icon-btn" data-del="${r.id}" title="삭제">${icon('trash', 15)}</button></div></td>
    </tr>`).join('')}</tbody></table>`;
    slot.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openForm(list.find(x => x.id === b.dataset.edit)));
    slot.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => openForm(list.find(x => x.id === b.dataset.copy), true));
    slot.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const r = list.find(x => x.id === b.dataset.del);
      if (r.closed_yn) { toast('마감된 항목은 삭제할 수 없습니다.', 'error'); return; }
      if (!(await confirmDialog({ message: `[${r.rec_no}]을(를) 삭제하시겠습니까?`, confirmText: '삭제' }))) return;
      try { await db.remove('qcost_records', r.id); toast('삭제되었습니다.'); reload(); } catch (e) { toast(e.message || '삭제 실패', 'error'); }
    });
  }
  function openForm(r, isCopy = false) {
    const isEdit = !!r && !isCopy;
    const v = (k, d = '') => (r ? (r[k] ?? d) : d);
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field"><label>발생일자 <span class="req">*</span></label><input class="input" type="date" name="cost_date" value="${escapeHtml(String(v('cost_date', todayStr())).slice(0, 10))}"></div>
      <div class="field"><label>세부항목 <span class="req">*</span></label><select class="select" name="detail_code"><option value="">선택</option>
        ${details.filter(d => d.use_yn !== false).map(d => `<option value="${escapeHtml(d.detail_code)}" data-cat="${escapeHtml(d.category || '')}" data-name="${escapeHtml(d.name)}" data-calc="${escapeHtml(d.calc_type || '직접금액')}" data-price="${d.unit_price || 0}" data-dept="${escapeHtml(d.dept || '')}" data-link="${escapeHtml(d.auto_link || '')}" ${v('detail_code') === d.detail_code ? 'selected' : ''}>[${escapeHtml(d.category || '')}] ${escapeHtml(d.name)}</option>`).join('')}</select></div>
      <div class="field"><label>분류(자동)</label><input class="input" name="category" value="${escapeHtml(v('category'))}" readonly></div>
      <div class="field"><label>계산기준(자동)</label><input class="input" name="calc_type" value="${escapeHtml(v('calc_type', '직접금액'))}" readonly></div>
      <div class="field col-2"><label>부적합번호 <span class="muted">(선택 시 품목·LOT·수량 자동입력)</span></label>
        <select class="select" name="ncr_no"><option value="">해당없음</option>
          ${ncrs.map(n => `<option value="${escapeHtml(n.ncr_no)}" data-item="${escapeHtml(n.item_code || '')}" data-iname="${escapeHtml(n.item_name || '')}" data-lot="${escapeHtml(n.lot_no || '')}" data-proc="${escapeHtml(n.process || '')}" data-qty="${n.defect_qty || 0}" ${v('ncr_no') === n.ncr_no ? 'selected' : ''}>${escapeHtml(n.ncr_no)} · ${escapeHtml(n.item_name || '')} · ${escapeHtml(n.defect_type || '')} ${num(n.defect_qty)}EA</option>`).join('')}</select></div>
      <div class="field"><label>품목</label><select class="select" name="item_code"><option value="">선택</option>
        ${items.map(i => `<option value="${escapeHtml(i.code)}" data-name="${escapeHtml(i.name)}" ${v('item_code') === i.code ? 'selected' : ''}>${escapeHtml(i.code)} · ${escapeHtml(i.name)}</option>`).join('')}</select></div>
      <div class="field"><label>공정</label><select class="select" name="process"><option value="">선택</option>
        ${processes.map(p => `<option value="${escapeHtml(p.name)}" ${v('process') === p.name ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>LOT</label><input class="input" name="lot_no" value="${escapeHtml(v('lot_no'))}"></div>
      <div class="field" data-qty><label>수량</label><input class="input" type="number" name="qty" value="${v('qty', 0)}"></div>
      <div class="field" data-qty><label>단가</label><input class="input" type="number" name="unit_price" value="${v('unit_price', 0)}"></div>
      <div class="field" data-hour><label>작업시간(h)</label><input class="input" type="number" step="any" name="work_hours" value="${v('work_hours', 0)}"></div>
      <div class="field" data-hour><label>시간당 단가</label><input class="input" type="number" name="hour_rate" value="${v('hour_rate', 0)}"></div>
      <div class="field"><label>계산금액 <span class="req">*</span></label><input class="input" type="number" name="amount" value="${v('amount', 0)}" style="font-weight:700"></div>
      <div class="field"><label>담당부서</label><select class="select" name="dept"><option value="">선택</option>
        ${depts.map(d => `<option value="${escapeHtml(d.name)}" ${v('dept') === d.name ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}</select></div>
      <div class="field"><label>작성자</label><select class="select" name="writer"><option value="">선택</option>
        ${users.map(u => `<option value="${escapeHtml(u.name)}" ${v('writer') === u.name ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select></div>
      <div class="field"><label>증빙자료 URL</label><input class="input" name="evidence_url" value="${escapeHtml(v('evidence_url'))}"></div>
      <div class="field col-2"><label>비고</label><textarea class="textarea" name="remark">${escapeHtml(v('remark'))}</textarea></div>
      <div class="field col-2 muted" style="background:var(--surface-2);padding:10px 12px;border-radius:10px" id="qr-calc"></div>`;

    const g = (n) => { const el = body.querySelector(`[name="${n}"]`); return el ? el.value.trim() : ''; };
    const toggleCalc = () => {
      const t = g('calc_type');
      body.querySelectorAll('[data-qty]').forEach(el => el.classList.toggle('hidden', t !== '수량기준'));
      body.querySelectorAll('[data-hour]').forEach(el => el.classList.toggle('hidden', t !== '시간기준'));
      calcAmount();
    };
    const calcAmount = () => {
      const t = g('calc_type');
      const el = body.querySelector('[name="amount"]');
      const hint = body.querySelector('#qr-calc');
      if (t === '수량기준') {
        const a = (Number(g('qty')) || 0) * (Number(g('unit_price')) || 0);
        el.value = a; hint.innerHTML = `${icon('activity', 15)} 계산식: 수량 ${num(g('qty'))} × 단가 ${won(g('unit_price'))} = <b>${won(a)}</b>`;
      } else if (t === '시간기준') {
        const a = Math.round((Number(g('work_hours')) || 0) * (Number(g('hour_rate')) || 0));
        el.value = a; hint.innerHTML = `${icon('activity', 15)} 계산식: 작업시간 ${g('work_hours') || 0}h × 시간당 ${won(g('hour_rate'))} = <b>${won(a)}</b>`;
      } else {
        hint.innerHTML = `${icon('activity', 15)} 직접금액 기준 — 계산금액을 직접 입력하세요.`;
      }
    };
    body.querySelector('[name="detail_code"]').addEventListener('change', (e) => {
      const o = e.target.selectedOptions[0];
      if (!o?.dataset) return;
      body.querySelector('[name="category"]').value = o.dataset.cat || '';
      body.querySelector('[name="calc_type"]').value = o.dataset.calc || '직접금액';
      if (o.dataset.price && Number(o.dataset.price) > 0) {
        if (o.dataset.calc === '수량기준') body.querySelector('[name="unit_price"]').value = o.dataset.price;
        if (o.dataset.calc === '시간기준') body.querySelector('[name="hour_rate"]').value = o.dataset.price;
      }
      const ds = body.querySelector('[name="dept"]');
      if (o.dataset.dept && !ds.value) { const opt = [...ds.options].find(x => x.value === o.dataset.dept); if (opt) ds.value = o.dataset.dept; }
      toggleCalc();
    });
    body.querySelector('[name="ncr_no"]').addEventListener('change', (e) => {
      const o = e.target.selectedOptions[0];
      if (!o?.dataset?.item) return;
      const is = body.querySelector('[name="item_code"]');
      const opt = [...is.options].find(x => x.value === o.dataset.item); if (opt) is.value = o.dataset.item;
      body.querySelector('[name="lot_no"]').value = o.dataset.lot || '';
      const ps = body.querySelector('[name="process"]');
      const popt = [...ps.options].find(x => x.value === o.dataset.proc); if (popt) ps.value = o.dataset.proc;
      if (g('calc_type') === '수량기준') { body.querySelector('[name="qty"]').value = o.dataset.qty || 0; calcAmount(); }
      toast('부적합 정보가 자동 입력되었습니다.');
    });
    ['qty', 'unit_price', 'work_hours', 'hour_rate'].forEach(n => body.querySelector(`[name="${n}"]`).addEventListener('input', calcAmount));
    toggleCalc();

    openModal({
      title: `Q-Cost ${isEdit ? '수정' : isCopy ? '반복등록' : '등록'}`, body, wide: true,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 저장</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          if (!g('detail_code')) { toast('세부항목을 선택하세요.', 'error'); return; }
          if (!Number(g('amount'))) { toast('계산금액을 입력하세요.', 'error'); return; }
          const d = details.find(x => x.detail_code === g('detail_code'));
          const it = items.find(x => x.code === g('item_code'));
          const payload = {
            cost_date: g('cost_date') || todayStr(), cost_ym: (g('cost_date') || todayStr()).slice(0, 7),
            detail_code: g('detail_code'), detail_name: d?.name || '', cost_code: d?.cost_code || '', cost_name: d?.name || '',
            category: g('category'), calc_type: g('calc_type'),
            item_code: g('item_code'), item_name: it?.name || '', process: g('process'), lot_no: g('lot_no'), ncr_no: g('ncr_no'),
            qty: Number(g('qty')) || 0, unit_price: Number(g('unit_price')) || 0,
            work_hours: Number(g('work_hours')) || 0, hour_rate: Number(g('hour_rate')) || 0,
            amount: Number(g('amount')) || 0, dept: g('dept'), writer: g('writer'),
            evidence_url: g('evidence_url'), remark: g('remark'),
          };
          try {
            if (isEdit) await db.update('qcost_records', r.id, payload);
            else { payload.rec_no = nextDocNo('QC', rows.map(x => x.rec_no)); payload.closed_yn = false; await db.insert('qcost_records', payload); }
            close(); toast('저장되었습니다.'); await reload();
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }
  function exportCsv() {
    downloadCSV(`QCost_${todayStr()}.csv`, [
      { label: '등록번호', key: 'rec_no' }, { label: '발생일', key: 'cost_date', csv: r => fmtDate(r.cost_date) || r.cost_ym },
      { label: '분류', key: 'category' }, { label: '세부항목', key: 'detail_name' }, { label: '품목', key: 'item_name' },
      { label: '공정', key: 'process' }, { label: 'LOT', key: 'lot_no' }, { label: '부적합번호', key: 'ncr_no' },
      { label: '수량', key: 'qty' }, { label: '단가', key: 'unit_price' }, { label: '작업시간', key: 'work_hours' },
      { label: '시간당단가', key: 'hour_rate' }, { label: '금액', key: 'amount' }, { label: '담당부서', key: 'dept' },
    ], scoped());
    toast('CSV로 내보냈습니다.');
  }
  async function reload() {
    try { await loadAll(); renderChips(); renderTable(); }
    catch (e) { root.querySelector('#qr-table').innerHTML = `<div class="empty">${icon('alert', 46)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
  }
  reload();
}

// =====================================================================
// 10-4 Q-Cost 현황 (차트)
// =====================================================================
export async function qcostStatus(root) {
  const state = { from: '', to: '', fCat: '', fItem: '', fProcess: '', drill: null };
  let rows = [], items = [], processes = [];

  const monthStart = todayStr().slice(0, 8) + '01';
  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>Q-Cost 현황</h1><p>월별·비용구분별·품목별·공정별 품질비용을 분석합니다. 차트 항목을 클릭하면 원본 내역이 표시됩니다.</p></div>
      <div class="page-head__actions">
        <button class="btn" id="qs-csv">${icon('download', 16)} 보고서(CSV)</button>
        <button class="btn" id="qs-print">${icon('fileText', 16)} 인쇄</button>
        <button class="btn" id="qs-refresh">${icon('refresh', 16)} 새로고침</button>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="toolbar">
        <div class="date-range"><span class="date-range__label">${icon('calendar', 14)} 기간</span>
          <input class="input input--date" type="date" id="qs-from" value="${monthStart}"><span class="date-range__sep">~</span>
          <input class="input input--date" type="date" id="qs-to" value="${todayStr()}"></div>
        <select class="select" id="qs-fcat" style="width:auto;min-width:150px"><option value="">전체 비용구분</option>${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}</select>
        <select class="select" id="qs-fitem" style="width:auto;min-width:170px"><option value="">전체 품목</option></select>
        <select class="select" id="qs-fproc" style="width:auto;min-width:150px"><option value="">전체 공정</option></select>
      </div>
    </div>
    <div id="qs-stats"></div>
    <div class="grid-2" style="margin-bottom:16px">
      <div class="card"><div class="card__head">${icon('trendUp', 18)}<h3>월별 Q-Cost 추이</h3></div><div class="card__body" id="qs-month"></div></div>
      <div class="card"><div class="card__head">${icon('dashboard', 18)}<h3>비용구분별 비율</h3></div><div class="card__body" id="qs-cat"></div></div>
    </div>
    <div class="grid-2" style="margin-bottom:16px">
      <div class="card"><div class="card__head">${icon('box', 18)}<h3>품목별 품질비용</h3></div><div class="card__body" id="qs-item"></div></div>
      <div class="card"><div class="card__head">${icon('factory', 18)}<h3>공정별 품질비용</h3></div><div class="card__body" id="qs-proc"></div></div>
    </div>
    <div class="card" style="margin-bottom:16px"><div class="card__head">${icon('layers', 18)}<h3>세부항목별 상위 비용</h3></div><div class="card__body" id="qs-detail"></div></div>
    <div class="card"><div class="card__head">${icon('fileText', 18)}<h3 id="qs-listtitle">Q-Cost 등록 내역</h3>
      <div class="spacer"></div><button class="btn btn--sm" id="qs-clear" style="display:none">${icon('x', 13)} 필터 해제</button></div>
      <div class="table-wrap"><div id="qs-list"></div></div></div>`;

  root.querySelector('#qs-refresh').onclick = () => reload();
  root.querySelector('#qs-print').onclick = () => window.print();
  root.querySelector('#qs-csv').onclick = () => exportCsv();
  root.querySelector('#qs-clear').onclick = () => { state.drill = null; render(); };
  ['from', 'to'].forEach(k => root.querySelector(`#qs-${k}`).addEventListener('change', (e) => { state[k] = e.target.value; render(); }));
  root.querySelector('#qs-fcat').addEventListener('change', (e) => { state.fCat = e.target.value; render(); });
  root.querySelector('#qs-fitem').addEventListener('change', (e) => { state.fItem = e.target.value; render(); });
  root.querySelector('#qs-fproc').addEventListener('change', (e) => { state.fProcess = e.target.value; render(); });
  state.from = monthStart; state.to = todayStr();

  async function loadAll() {
    [rows, items, processes] = await Promise.all([
      db.all('qcost_records', {}).catch(() => []),
      db.all('items', { sort: 'code' }).catch(() => []),
      db.all('processes', { sort: 'code' }).catch(() => []),
    ]);
    root.querySelector('#qs-fitem').innerHTML = `<option value="">전체 품목</option>` + items.map(i => `<option value="${escapeHtml(i.code)}">${escapeHtml(i.code)} · ${escapeHtml(i.name)}</option>`).join('');
    root.querySelector('#qs-fproc').innerHTML = `<option value="">전체 공정</option>` + processes.map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join('');
  }
  function filtered() {
    return rows.filter(r => {
      const d = String(r.cost_date || (r.cost_ym ? r.cost_ym + '-01' : '')).slice(0, 10);
      if (state.from && d < state.from) return false;
      if (state.to && d > state.to) return false;
      if (state.fCat && r.category !== state.fCat) return false;
      if (state.fItem && r.item_code !== state.fItem) return false;
      if (state.fProcess && r.process !== state.fProcess) return false;
      return true;
    });
  }
  function drilled() {
    const base = filtered();
    if (!state.drill) return base;
    const { type, key } = state.drill;
    return base.filter(r => {
      if (type === 'month') return String(r.cost_date || r.cost_ym).slice(0, 7) === key;
      if (type === 'cat') return r.category === key;
      if (type === 'item') return (r.item_name || r.item_code || '미지정') === key;
      if (type === 'proc') return (r.process || '미지정') === key;
      if (type === 'detail') return (r.detail_name || r.cost_name || '미지정') === key;
      return true;
    });
  }
  function renderStats() {
    const list = filtered();
    const total = list.reduce((s, r) => s + (+r.amount || 0), 0);
    const sum = (c) => list.filter(r => r.category === c).reduce((s, r) => s + (+r.amount || 0), 0);
    const fail = sum('내부실패비용') + sum('외부실패비용');
    // 전월 대비
    const prevFrom = new Date(state.from || monthStart); prevFrom.setMonth(prevFrom.getMonth() - 1);
    const prevTo = new Date(state.to || todayStr()); prevTo.setMonth(prevTo.getMonth() - 1);
    const prev = rows.filter(r => {
      const d = String(r.cost_date || (r.cost_ym ? r.cost_ym + '-01' : '')).slice(0, 10);
      return d >= prevFrom.toISOString().slice(0, 10) && d <= prevTo.toISOString().slice(0, 10);
    }).reduce((s, r) => s + (+r.amount || 0), 0);
    const diff = prev ? ((total - prev) / prev * 100) : null;
    root.querySelector('#qs-stats').innerHTML = `<div class="stat-grid">
      <div class="stat"><div class="stat__top"><span class="stat__label">총 품질비용</span><span class="stat__ico ico-tint-brand">${icon('dollar', 21)}</span></div>
        <div class="stat__value">${won(total)}</div>
        ${diff != null ? `<div class="muted" style="margin-top:6px">전기간 대비 ${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff).toFixed(1)}%</div>` : ''}</div>
      ${stat('예방+평가 비용', won(sum('예방비용') + sum('평가비용')), '', 'shield', 'green')}
      ${stat('실패 비용', won(fail), '', 'alert', 'red')}
      ${stat('실패비용 비중', total ? ((fail / total) * 100).toFixed(1) : '0.0', '%', 'trendDown', fail / (total || 1) > 0.5 ? 'red' : 'violet')}</div>`;
  }
  function barList(slot, data, type, unit = '원') {
    const el = root.querySelector(slot);
    const entries = Object.entries(data).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (!entries.length) { el.innerHTML = `<div class="muted">데이터가 없습니다.</div>`; return; }
    const max = Math.max(...entries.map(e => e[1]));
    el.innerHTML = `<div class="flex-col" style="gap:10px">${entries.map(([k, v]) => `
      <button style="text-align:left;background:none;border:0;padding:0;cursor:pointer" data-drill="${escapeHtml(k)}">
        <div class="flex between" style="margin-bottom:4px"><b style="font-size:12.5px">${escapeHtml(k)}</b><span class="mono">${won(v)}</span></div>
        <div class="progress" style="height:10px"><span style="width:${(v / max * 100).toFixed(1)}%;background:${CAT_TONE[k] === 'red' ? 'var(--danger,#ef4444)' : CAT_TONE[k] === 'amber' ? 'var(--warning,#d97706)' : CAT_TONE[k] === 'green' ? 'var(--success,#16a34a)' : ''}"></span></div>
      </button>`).join('')}</div>`;
    el.querySelectorAll('[data-drill]').forEach(b => b.onclick = () => { state.drill = { type, key: b.dataset.drill }; render(); });
  }
  function render() {
    renderStats();
    const list = filtered();
    // 월별
    const byMonth = {};
    for (const r of list) { const m = String(r.cost_date || r.cost_ym).slice(0, 7); if (m) byMonth[m] = (byMonth[m] || 0) + (+r.amount || 0); }
    const months = Object.keys(byMonth).sort().slice(-6);
    const mEl = root.querySelector('#qs-month');
    if (!months.length) mEl.innerHTML = `<div class="muted">데이터가 없습니다.</div>`;
    else {
      const max = Math.max(...months.map(m => byMonth[m]));
      mEl.innerHTML = `<div style="display:flex;gap:10px;align-items:flex-end;height:150px">
        ${months.map(m => `<button style="flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;background:none;border:0;cursor:pointer" data-m="${m}">
          <div style="font-size:11px;font-weight:700">${won(byMonth[m])}</div>
          <div style="width:100%;background:var(--brand-500);height:${Math.max(6, (byMonth[m] / max) * 100)}px;border-radius:5px 5px 0 0"></div>
          <div class="muted" style="font-size:11px">${m.slice(2)}</div></button>`).join('')}</div>`;
      mEl.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { state.drill = { type: 'month', key: b.dataset.m }; render(); });
    }
    // 비용구분별
    const byCat = {}; CATEGORIES.forEach(c => { byCat[c] = list.filter(r => r.category === c).reduce((s, r) => s + (+r.amount || 0), 0); });
    barList('#qs-cat', byCat, 'cat');
    // 품목별
    const byItem = {}; for (const r of list) { const k = r.item_name || r.item_code || '미지정'; byItem[k] = (byItem[k] || 0) + (+r.amount || 0); }
    barList('#qs-item', byItem, 'item');
    // 공정별
    const byProc = {}; for (const r of list) { const k = r.process || '미지정'; byProc[k] = (byProc[k] || 0) + (+r.amount || 0); }
    barList('#qs-proc', byProc, 'proc');
    // 세부항목별
    const byDetail = {}; for (const r of list) { const k = r.detail_name || r.cost_name || '미지정'; byDetail[k] = (byDetail[k] || 0) + (+r.amount || 0); }
    barList('#qs-detail', byDetail, 'detail');
    renderList();
  }
  function renderList() {
    const list = drilled();
    const slot = root.querySelector('#qs-list');
    root.querySelector('#qs-listtitle').textContent = state.drill ? `Q-Cost 내역 — ${state.drill.key}` : 'Q-Cost 등록 내역';
    root.querySelector('#qs-clear').style.display = state.drill ? '' : 'none';
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:40px">${icon('inbox', 44)}<h4>해당 내역이 없습니다</h4></div>`; return; }
    const total = list.reduce((s, r) => s + (+r.amount || 0), 0);
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th>등록번호</th><th>발생일</th><th class="center">분류</th><th>세부항목</th><th>품목</th><th>공정</th><th>LOT</th><th>부적합</th><th class="num">금액</th><th>담당부서</th>
    </tr></thead><tbody>${list.slice(0, 100).map(r => `<tr>
      <td class="cell-code">${escapeHtml(r.rec_no)}</td><td>${fmtDate(r.cost_date) || escapeHtml(r.cost_ym || '')}</td>
      <td class="center">${badge(r.category || '', CAT_TONE[r.category])}</td>
      <td class="cell-strong">${escapeHtml(r.detail_name || r.cost_name || '')}</td>
      <td>${escapeHtml(r.item_name || '')}</td><td>${escapeHtml(r.process || '')}</td>
      <td class="cell-code">${escapeHtml(r.lot_no || '')}</td><td class="cell-code">${escapeHtml(r.ncr_no || '')}</td>
      <td class="num mono" style="font-weight:700">${won(r.amount)}</td><td>${escapeHtml(r.dept || '')}</td>
    </tr>`).join('')}
    <tr style="background:var(--surface-2);font-weight:700"><td colspan="8">합계 (${list.length}건)</td><td class="num mono">${won(total)}</td><td></td></tr>
    </tbody></table>`;
  }
  function exportCsv() {
    downloadCSV(`QCost현황_${todayStr()}.csv`, [
      { label: '등록번호', key: 'rec_no' }, { label: '발생일', key: 'cost_date', csv: r => fmtDate(r.cost_date) || r.cost_ym },
      { label: '분류', key: 'category' }, { label: '세부항목', key: 'detail_name' }, { label: '품목', key: 'item_name' },
      { label: '공정', key: 'process' }, { label: 'LOT', key: 'lot_no' }, { label: '부적합번호', key: 'ncr_no' },
      { label: '금액', key: 'amount' }, { label: '담당부서', key: 'dept' },
    ], drilled());
    toast('CSV로 내보냈습니다.');
  }
  async function reload() {
    try { await loadAll(); render(); }
    catch (e) { root.querySelector('#qs-list').innerHTML = `<div class="empty">${icon('alert', 46)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
  }
  reload();
}
