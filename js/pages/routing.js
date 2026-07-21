// 제품별표준공정관리 (라우팅) — 좌: 품목 선택 / 우: 공정순서 편집(추가·삭제·저장)
import { db } from '../lib/db.js';
import { num, escapeHtml } from '../lib/format.js';
import { toast, confirmDialog } from '../ui/components.js';
import { icon } from '../ui/icons.js';

export async function itemRouting(root) {
  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>제품별표준공정관리</h1><p>품목을 선택하고 표준공정 순서(라우팅)를 등록·수정합니다.</p></div>
    </div>
    <div style="display:grid;grid-template-columns:340px 1fr;gap:18px;align-items:start">
      <div class="card">
        <div class="toolbar"><div class="search-box grow">${icon('search', 16)}<input id="rt-search" placeholder="품목코드·품명 검색" autocomplete="off"/></div></div>
        <div id="rt-items" style="max-height:62vh;overflow-y:auto"></div>
      </div>
      <div class="card" id="rt-editor"><div class="card__body"><div class="empty" style="padding:80px 20px">${icon('route', 52)}<h4>품목을 선택하세요</h4><p>왼쪽 목록에서 품목을 선택하면 공정을 편집할 수 있습니다.</p></div></div></div>
    </div>`;

  const [items, processes] = await Promise.all([
    db.all('items', { sort: 'code' }), db.all('processes', { sort: 'code' }),
  ]);
  const procMap = Object.fromEntries(processes.map(p => [p.code, p]));

  const state = { itemCode: null, rows: [], removedIds: [], counts: {} };

  // 품목별 공정 수 (목록 배지)
  try {
    const all = await db.all('item_processes', {});
    for (const r of all) state.counts[r.item_code] = (state.counts[r.item_code] || 0) + 1;
  } catch { /* noop */ }

  const itemsSlot = root.querySelector('#rt-items');
  function renderItems(filter = '') {
    const q = filter.toLowerCase();
    const list = items.filter(i => ['완제품', '반제품'].includes(i.item_type))
      .filter(i => !q || [i.code, i.name, i.spec].some(v => String(v ?? '').toLowerCase().includes(q)));
    if (!list.length) { itemsSlot.innerHTML = `<div class="empty" style="padding:40px 12px">${icon('inbox', 40)}<h4>완제품·반제품이 없습니다</h4><p>원자재·부자재는 공정 대상이 아닙니다.</p></div>`; return; }
    itemsSlot.innerHTML = list.map(i => `
      <div class="rt-item ${state.itemCode === i.code ? 'active' : ''}" data-code="${escapeHtml(i.code)}"
        style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer">
        <div style="flex:1;min-width:0">
          <div class="flex" style="gap:8px"><span class="cell-code">${escapeHtml(i.code)}</span><span class="badge badge--neutral" style="height:20px">${escapeHtml(i.item_type || '')}</span></div>
          <div style="font-weight:700;margin-top:3px">${escapeHtml(i.name)}</div>
        </div>
        ${state.counts[i.code] ? `<span class="badge badge--brand">${state.counts[i.code]}공정</span>` : `<span class="muted">미등록</span>`}
      </div>`).join('');
    itemsSlot.querySelectorAll('[data-code]').forEach(el => el.onclick = () => selectItem(el.dataset.code));
    // 활성 표시 스타일
    itemsSlot.querySelectorAll('.rt-item.active').forEach(el => { el.style.background = 'var(--brand-50)'; });
  }

  async function selectItem(code) {
    state.itemCode = code; state.removedIds = [];
    renderItems(root.querySelector('#rt-search').value.trim());
    const editor = root.querySelector('#rt-editor');
    editor.innerHTML = `<div class="card__body"><div class="spinner"></div></div>`;
    let rows = [];
    try { rows = await db.all('item_processes', { filters: { item_code: code }, sort: 'seq' }); }
    catch (e) { editor.innerHTML = `<div class="card__body"><div class="empty">${icon('alert', 48)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div></div>`; return; }
    state.rows = rows.map(r => ({ ...r }));
    renderEditor();
  }

  function renderEditor() {
    const item = items.find(i => i.code === state.itemCode);
    const editor = root.querySelector('#rt-editor');
    state.rows.sort((a, b) => (+a.seq || 0) - (+b.seq || 0));
    const procOptions = processes.map(p => `<option value="${escapeHtml(p.code)}">${escapeHtml(p.code)} · ${escapeHtml(p.name)}</option>`).join('');

    editor.innerHTML = `
      <div class="card__head">
        <div><div class="flex" style="gap:8px"><span class="cell-code" style="font-size:14px">${escapeHtml(item.code)}</span><span class="badge badge--neutral">${escapeHtml(item.item_type || '')}</span></div>
          <h3 style="margin-top:4px">${escapeHtml(item.name)} 공정순서</h3></div>
        <div class="spacer"></div>
        <button class="btn btn--primary" id="rt-save">${icon('check', 16)} 저장</button>
      </div>
      <div class="card__body">
        <div class="flex" style="gap:10px;margin-bottom:14px">
          <select class="select" id="rt-add-proc" style="max-width:340px"><option value="">표준공정 선택…</option>${procOptions}</select>
          <button class="btn" id="rt-add">${icon('plus', 16)} 공정 추가</button>
          <div class="spacer"></div>
          <span class="muted">총 ${state.rows.length}개 공정</span>
        </div>
        <div class="table-wrap"><table class="grid" id="rt-table">
          <thead><tr><th class="center" style="width:64px">순서</th><th>공정</th><th class="num" style="width:120px">표준시간(분)</th><th style="width:200px">비고</th><th class="center" style="width:60px"></th></tr></thead>
          <tbody></tbody>
        </table></div>
        ${!state.rows.length ? `<div class="empty" style="padding:40px">${icon('route', 44)}<h4>등록된 공정이 없습니다</h4><p>위에서 표준공정을 선택해 추가하세요.</p></div>` : ''}
      </div>`;

    renderRows();
    editor.querySelector('#rt-add').onclick = addProc;
    editor.querySelector('#rt-save').onclick = save;
  }

  function renderRows() {
    const tbody = root.querySelector('#rt-table tbody');
    if (!tbody) return;
    tbody.innerHTML = state.rows.map((r, idx) => `
      <tr>
        <td class="center"><input class="input" style="width:54px;padding:0 6px;text-align:center" type="number" value="${escapeHtml(r.seq ?? '')}" data-idx="${idx}" data-f="seq"></td>
        <td><select class="select" data-idx="${idx}" data-f="process_code">
          ${processes.map(p => `<option value="${escapeHtml(p.code)}" ${p.code === r.process_code ? 'selected' : ''}>${escapeHtml(p.code)} · ${escapeHtml(p.name)}</option>`).join('')}
        </select></td>
        <td class="num"><input class="input mono" style="text-align:right" type="number" value="${escapeHtml(r.std_time ?? 0)}" data-idx="${idx}" data-f="std_time"></td>
        <td><input class="input" value="${escapeHtml(r.remark ?? '')}" data-idx="${idx}" data-f="remark" placeholder="-"></td>
        <td class="center"><button class="icon-btn" data-del="${idx}" title="삭제">${icon('trash', 15)}</button></td>
      </tr>`).join('');

    tbody.querySelectorAll('[data-idx]').forEach(el => {
      const ev = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(ev, () => {
        const r = state.rows[+el.dataset.idx];
        const f = el.dataset.f;
        if (f === 'process_code') {
          r.process_code = el.value;
          const p = procMap[el.value];
          if (p) { r.process_name = p.name; r.std_time = p.std_time; renderRows(); }
        } else if (f === 'seq' || f === 'std_time') {
          r[f] = el.value === '' ? null : Number(el.value);
        } else { r[f] = el.value; }
      });
    });
    tbody.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const r = state.rows[+b.dataset.del];
      if (r.id) state.removedIds.push(r.id);
      state.rows.splice(+b.dataset.del, 1);
      renderEditor();
    });
  }

  function addProc() {
    const sel = root.querySelector('#rt-add-proc');
    const code = sel.value;
    if (!code) { toast('추가할 표준공정을 선택하세요.', 'error'); return; }
    const p = procMap[code];
    const nextSeq = state.rows.length ? Math.max(...state.rows.map(r => +r.seq || 0)) + 10 : 10;
    state.rows.push({ item_code: state.itemCode, seq: nextSeq, process_code: code, process_name: p?.name || code, std_time: p?.std_time || 0, remark: '' });
    sel.value = '';
    renderEditor();
  }

  async function save() {
    if (!state.itemCode) return;
    const btn = root.querySelector('#rt-save');
    btn.disabled = true; btn.innerHTML = '저장 중…';
    try {
      for (const id of state.removedIds) await db.remove('item_processes', id);
      state.removedIds = [];
      for (const r of state.rows) {
        const payload = { item_code: state.itemCode, seq: +r.seq || 0, process_code: r.process_code, process_name: r.process_name, std_time: +r.std_time || 0, remark: r.remark || '' };
        if (r.id) await db.update('item_processes', r.id, payload);
        else await db.insert('item_processes', payload);
      }
      // 공정 수 갱신
      state.counts[state.itemCode] = state.rows.length;
      toast('공정순서가 저장되었습니다.');
      await selectItem(state.itemCode); // 재로딩(신규 id 반영)
    } catch (e) {
      toast(e.message || '저장 실패', 'error');
      btn.disabled = false; btn.innerHTML = '저장';
    }
  }

  renderItems();
  root.querySelector('#rt-search').addEventListener('input', (e) => renderItems(e.target.value.trim()));
}
