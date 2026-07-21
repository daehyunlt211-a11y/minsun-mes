// 검사기준관리 — 상단 큰 탭(수입검사/출하검사) + 좌:품목 / 우:검사기준 상세
import { db } from '../lib/db.js';
import { escapeHtml, nextDocNo } from '../lib/format.js';
import { toast, confirmDialog, openModal, badge, yesNo } from '../ui/components.js';
import { icon } from '../ui/icons.js';

const TYPES = ['수입검사', '출하검사'];

export async function inspectionStandards(root) {
  const state = { type: '수입검사', code: null, search: '', items: [], tools: [], stds: [] };

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>검사기준관리</h1><p>검사유형 탭을 선택하고 품목별 검사기준을 등록합니다. 정량적은 숫자 측정, 정성적은 OK/NG 판정.</p></div>
      <div class="page-head__actions"><button class="btn" id="is-refresh">${icon('refresh', 16)} 새로고침</button></div>
    </div>
    <div class="seg-tabs" id="is-typetabs">
      ${TYPES.map((t, i) => `<button class="seg-tab ${i === 0 ? 'active' : ''}" data-t="${t}">${icon(t === '수입검사' ? 'inbox' : 'truck', 16)} ${t}<span class="seg-tab__count" data-tcount="${t}"></span></button>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:340px 1fr;gap:18px;align-items:start">
      <div class="card">
        <div class="toolbar"><div class="search-box grow">${icon('search', 16)}<input id="is-search" placeholder="품목코드·품명 검색" autocomplete="off"/></div></div>
        <div id="is-list" style="max-height:62vh;overflow-y:auto"></div>
      </div>
      <div class="card" id="is-detail"><div class="card__body"><div class="empty" style="padding:80px 20px">${icon('shield', 52)}<h4>품목을 선택하세요</h4><p>왼쪽에서 품목을 선택하면 검사기준을 등록·관리할 수 있습니다.</p></div></div></div>
    </div>`;

  root.querySelector('#is-refresh').onclick = () => inspectionStandards(root);
  root.querySelectorAll('#is-typetabs [data-t]').forEach(b => b.onclick = () => {
    state.type = b.dataset.t;
    root.querySelectorAll('#is-typetabs [data-t]').forEach(x => x.classList.toggle('active', x.dataset.t === state.type));
    renderList(); if (state.code) renderDetail();
  });

  async function loadAll() {
    [state.items, state.tools, state.stds] = await Promise.all([
      db.all('items', { sort: 'code' }).catch(() => []),
      db.all('tools', { sort: 'code' }).catch(() => []),
      db.all('inspection_standards', { sort: 'std_no' }),
    ]);
  }
  const typeOf = (s) => s.inspect_type || '수입검사';
  const countOf = (code) => state.stds.filter(s => s.item_code === code && typeOf(s) === state.type).length;

  function updateTabCounts() {
    TYPES.forEach(t => { const el = root.querySelector(`[data-tcount="${t}"]`); if (el) el.textContent = state.stds.filter(s => typeOf(s) === t).length; });
  }

  const listSlot = root.querySelector('#is-list');
  function renderList() {
    updateTabCounts();
    const q = state.search.toLowerCase();
    const list = state.items.filter(i => !q || [i.code, i.name, i.spec].some(v => String(v ?? '').toLowerCase().includes(q)));
    if (!list.length) { listSlot.innerHTML = `<div class="empty" style="padding:40px 12px">${icon('inbox', 40)}<h4>품목이 없습니다</h4></div>`; return; }
    listSlot.innerHTML = list.map(i => {
      const c = countOf(i.code);
      return `<div class="rt-item ${state.code === i.code ? 'active' : ''}" data-code="${escapeHtml(i.code)}"
        style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer">
        <div style="flex:1;min-width:0"><div class="flex" style="gap:8px"><span class="cell-code">${escapeHtml(i.code)}</span><span class="badge badge--neutral" style="height:20px">${escapeHtml(i.item_type || '')}</span></div>
          <div style="font-weight:700;margin-top:3px">${escapeHtml(i.name)}</div></div>
        ${c ? `<span class="badge badge--brand">${c}건</span>` : `<span class="muted">미등록</span>`}
      </div>`;
    }).join('');
    listSlot.querySelectorAll('[data-code]').forEach(el => el.onclick = () => { state.code = el.dataset.code; renderList(); renderDetail(); });
  }

  function renderDetail() {
    const item = state.items.find(i => i.code === state.code) || {};
    const list = state.stds.filter(s => s.item_code === state.code && typeOf(s) === state.type);
    const editor = root.querySelector('#is-detail');
    editor.innerHTML = `
      <div class="card__head">
        <div><div class="flex" style="gap:8px"><span class="cell-code" style="font-size:14px">${escapeHtml(item.code || '')}</span><span class="badge badge--neutral">${escapeHtml(item.item_type || '')}</span><span class="badge ${state.type === '출하검사' ? 'badge--brand' : 'badge--info'}">${escapeHtml(state.type)}</span></div>
          <h3 style="margin-top:4px">${escapeHtml(item.name || '')} 검사기준</h3></div>
        <div class="spacer"></div>
        <button class="btn btn--primary" id="is-add">${icon('plus', 16)} 검사기준 등록</button>
      </div>
      <div class="card__body">
        <div class="table-wrap"><table class="grid">
          <thead><tr><th>기준번호</th><th>검사항목</th><th class="center">평가방법</th><th>기준/판정</th><th>검사방법</th><th>측정장비</th><th class="center">사용</th><th class="center" style="width:88px">관리</th></tr></thead>
          <tbody>${list.length ? list.map(r => {
      const quant = (r.eval_method || '정량적') === '정량적';
      const std = quant ? `${escapeHtml(r.spec_value ?? '')}${r.tolerance ? ` <span class="muted">/ ±${escapeHtml(r.tolerance)}</span>` : ''}` : `<span class="muted">${escapeHtml(r.spec_value || 'OK/NG')}</span>`;
      return `<tr><td class="cell-code">${escapeHtml(r.std_no)}</td>
        <td class="cell-strong">${escapeHtml(r.inspect_item || '')}</td><td class="center">${badge(r.eval_method || '정량적')}</td>
        <td>${std}</td><td>${escapeHtml(r.method || '')}</td><td>${escapeHtml(r.equipment || '')}</td><td class="center">${yesNo(r.use_yn)}</td>
        <td class="center"><div class="row-actions"><button class="icon-btn" data-edit="${r.id}" title="수정">${icon('edit', 15)}</button><button class="icon-btn" data-del="${r.id}" title="삭제">${icon('trash', 15)}</button></div></td></tr>`;
    }).join('') : `<tr><td colspan="8"><div class="empty" style="padding:36px">${icon('inbox', 44)}<h4>${escapeHtml(state.type)} 기준이 없습니다</h4><p>[검사기준 등록]으로 추가하세요.</p></div></td></tr>`}</tbody>
        </table></div>
      </div>`;
    editor.querySelector('#is-add').onclick = () => openForm(null);
    editor.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openForm(list.find(r => r.id === b.dataset.edit)));
    editor.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const r = list.find(x => x.id === b.dataset.del);
      if (!(await confirmDialog({ message: `검사기준 [${r.std_no}]을(를) 삭제하시겠습니까?`, confirmText: '삭제' }))) return;
      try { await db.remove('inspection_standards', r.id); toast('삭제되었습니다.'); await loadAll(); renderList(); renderDetail(); } catch (e) { toast(e.message || '삭제 실패', 'error'); }
    });
  }

  function openForm(r) {
    const isEdit = !!r;
    const v = (k, d = '') => (r ? (r[k] ?? d) : d);
    const evalMethod = v('eval_method', '정량적');
    const item = state.items.find(i => i.code === state.code) || {};
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field"><label>품목</label><input class="input" value="${escapeHtml(item.code)} · ${escapeHtml(item.name || '')}" readonly></div>
      <div class="field"><label>검사유형</label><input class="input" value="${escapeHtml(state.type)}" readonly></div>
      <div class="field col-2"><label>검사항목 <span class="req">*</span></label><input class="input" name="inspect_item" value="${escapeHtml(v('inspect_item'))}" placeholder="예: 전장, 두께, 외관"></div>
      <div class="field"><label>평가방법 <span class="req">*</span></label>
        <select class="select" name="eval_method">
          <option value="정량적" ${evalMethod === '정량적' ? 'selected' : ''}>정량적 (숫자 측정)</option>
          <option value="정성적" ${evalMethod === '정성적' ? 'selected' : ''}>정성적 (OK/NG 판정)</option></select></div>
      <div class="field" data-quant><label>규격값 <span class="req">*</span></label><input class="input" name="spec_value_q" type="number" step="any" value="${escapeHtml(evalMethod === '정량적' ? v('spec_value') : '')}" placeholder="예: 120"></div>
      <div class="field" data-quant><label>허용공차(±)</label><input class="input" name="tolerance" type="number" step="any" value="${escapeHtml(v('tolerance'))}" placeholder="예: 0.1"></div>
      <div class="field col-2" data-qual><label>판정기준(OK 조건)</label><input class="input" name="spec_value_t" value="${escapeHtml(evalMethod === '정성적' ? v('spec_value') : '')}" placeholder="예: 스크래치·이물 없음"></div>
      <div class="field"><label>검사방법</label><input class="input" name="method" value="${escapeHtml(v('method'))}" placeholder="버니어캘리퍼스 / 육안"></div>
      <div class="field"><label>측정장비</label>
        <select class="select" name="equipment"><option value="">선택</option>
          ${state.tools.map(t => `<option value="${escapeHtml(t.name)}" ${v('equipment') === t.name ? 'selected' : ''}>${escapeHtml(t.code)} · ${escapeHtml(t.name)}</option>`).join('')}</select></div>
      <div class="field col-2"><label class="switch"><input type="checkbox" name="use_yn" ${v('use_yn', true) === false ? '' : 'checked'}><span class="switch__track"></span><span class="muted" data-switch-label>${v('use_yn', true) === false ? '미사용' : '사용'}</span></label></div>`;

    const toggleEval = () => {
      const m = body.querySelector('[name="eval_method"]').value;
      body.querySelectorAll('[data-quant]').forEach(el => el.classList.toggle('hidden', m !== '정량적'));
      body.querySelectorAll('[data-qual]').forEach(el => el.classList.toggle('hidden', m !== '정성적'));
    };
    body.querySelector('[name="eval_method"]').addEventListener('change', toggleEval);

    openModal({
      title: `${state.type} 기준 ${isEdit ? '수정' : '등록'} — ${escapeHtml(item.name || '')}`, body, wide: true,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} ${isEdit ? '수정' : '등록'}</button>`,
      onMount: ({ footEl, close }) => {
        toggleEval();
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => { const el = body.querySelector(`[name="${n}"]`); return el ? el.value.trim() : ''; };
          const evalM = g('eval_method');
          if (!g('inspect_item')) { toast('검사항목을 입력하세요.', 'error'); return; }
          if (evalM === '정량적' && g('spec_value_q') === '') { toast('규격값(숫자)을 입력하세요.', 'error'); return; }
          const payload = {
            inspect_type: state.type, item_code: item.code, item_name: item.name,
            inspect_item: g('inspect_item'), eval_method: evalM,
            spec_value: evalM === '정량적' ? g('spec_value_q') : g('spec_value_t'),
            tolerance: evalM === '정량적' ? g('tolerance') : '',
            method: g('method'), equipment: g('equipment'), use_yn: body.querySelector('[name="use_yn"]').checked,
          };
          try {
            if (isEdit) await db.update('inspection_standards', r.id, payload);
            else { payload.std_no = nextDocNo('IS', state.stds.map(x => x.std_no)); await db.insert('inspection_standards', payload); }
            close(); toast(isEdit ? '수정되었습니다.' : '등록되었습니다.');
            await loadAll(); renderList(); renderDetail();
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }

  try { await loadAll(); renderList(); }
  catch (e) {
    const need = /eval_method|column|does not exist|schema cache/i.test(e.message || '');
    listSlot.innerHTML = need
      ? `<div class="empty" style="padding:30px">${icon('database', 44)}<h4>마이그레이션 필요</h4><p>supabase/migration_inspection.sql 실행 후 다시 시도하세요.</p></div>`
      : `<div class="empty">${icon('alert', 40)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`;
  }
}
