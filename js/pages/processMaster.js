// 표준공정관리 — 좌: 공정 목록 / 우: 공정정보 + 사용설비 등록(설비관리 연동)
import { db } from '../lib/db.js';
import { escapeHtml } from '../lib/format.js';
import { toast, confirmDialog, openModal, badge } from '../ui/components.js';
import { icon } from '../ui/icons.js';

const PTYPES = ['가공', '조립', '검사', '포장'];

export async function processMaster(root) {
  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>표준공정관리</h1><p>표준공정을 등록하고, 공정별 사용 가능한 설비(설비호기)를 지정합니다.</p></div>
    </div>
    <div style="display:grid;grid-template-columns:340px 1fr;gap:18px;align-items:start">
      <div class="card">
        <div class="toolbar"><div class="search-box grow">${icon('search', 16)}<input id="pm-search" placeholder="공정코드·공정명 검색" autocomplete="off"/></div>
          <button class="btn btn--primary btn--sm" id="pm-add">${icon('plus', 14)} 공정</button></div>
        <div id="pm-list" style="max-height:62vh;overflow-y:auto"></div>
      </div>
      <div class="card" id="pm-editor"><div class="card__body"><div class="empty" style="padding:80px 20px">${icon('route', 52)}<h4>공정을 선택하세요</h4><p>왼쪽에서 공정을 선택하면 사용 설비를 지정할 수 있습니다.</p></div></div></div>
    </div>`;

  const state = { code: null, processes: [], equipments: [], assigns: [], counts: {} };

  async function reloadAll() {
    const [procs, equips] = await Promise.all([db.all('processes', { sort: 'code' }), db.all('equipments', { sort: 'code' })]);
    state.processes = procs; state.equipments = equips;
    state.counts = {};
    try { const all = await db.all('process_equipments', {}); for (const a of all) state.counts[a.process_code] = (state.counts[a.process_code] || 0) + 1; }
    catch { /* 테이블 미생성 */ }
    renderList(root.querySelector('#pm-search').value.trim());
  }

  const listSlot = root.querySelector('#pm-list');
  function renderList(filter = '') {
    const q = filter.toLowerCase();
    const list = state.processes.filter(p => !q || [p.code, p.name, p.work_center].some(v => String(v ?? '').toLowerCase().includes(q)));
    if (!list.length) { listSlot.innerHTML = `<div class="empty" style="padding:40px 12px">${icon('inbox', 40)}<h4>공정이 없습니다</h4></div>`; return; }
    listSlot.innerHTML = list.map(p => `
      <div class="rt-item ${state.code === p.code ? 'active' : ''}" data-code="${escapeHtml(p.code)}"
        style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer">
        <div style="flex:1;min-width:0">
          <div class="flex" style="gap:8px"><span class="cell-code">${escapeHtml(p.code)}</span><span class="badge badge--neutral" style="height:20px">${escapeHtml(p.process_type || '')}</span></div>
          <div style="font-weight:700;margin-top:3px">${escapeHtml(p.name)}</div>
        </div>
        ${state.counts[p.code] ? `<span class="badge badge--brand">설비 ${state.counts[p.code]}</span>` : `<span class="muted">미지정</span>`}
      </div>`).join('');
    listSlot.querySelectorAll('[data-code]').forEach(el => el.onclick = () => selectProcess(el.dataset.code));
  }

  async function selectProcess(code) {
    state.code = code;
    renderList(root.querySelector('#pm-search').value.trim());
    const editor = root.querySelector('#pm-editor');
    editor.innerHTML = `<div class="card__body"><div class="spinner"></div></div>`;
    try { state.assigns = await db.all('process_equipments', { filters: { process_code: code }, sort: 'equipment_code' }); }
    catch (e) {
      const need = /process_equipments|relation|does not exist|not find the table|schema cache/i.test(e.message || '');
      editor.innerHTML = `<div class="card__body">${need ? migrationBox() : `<div class="empty">${icon('alert', 48)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`}</div>`;
      return;
    }
    renderEditor();
  }

  function renderEditor() {
    const p = state.processes.find(x => x.code === state.code);
    if (!p) return;
    const editor = root.querySelector('#pm-editor');
    const assignedCodes = new Set(state.assigns.map(a => a.equipment_code));
    const available = state.equipments.filter(e => !assignedCodes.has(e.code));

    editor.innerHTML = `
      <div class="card__head">
        <div><div class="flex" style="gap:8px"><span class="cell-code" style="font-size:14px">${escapeHtml(p.code)}</span><span class="badge badge--neutral">${escapeHtml(p.process_type || '')}</span></div>
          <h3 style="margin-top:4px">${escapeHtml(p.name)}</h3></div>
        <div class="spacer"></div>
        <button class="btn btn--sm" id="pm-edit">${icon('edit', 14)} 공정정보 수정</button>
        <button class="btn btn--sm btn--danger" id="pm-del">${icon('trash', 14)} 삭제</button>
      </div>
      <div class="card__body">
        <div class="grid-2" style="margin-bottom:18px">
          ${infoBox('작업장', p.work_center || '-')}${infoBox('표준시간(분)', p.std_time ?? 0)}
          ${infoBox('준비시간(분)', p.setup_time ?? 0)}${infoBox('사용여부', p.use_yn === false ? '미사용' : '사용')}
        </div>
        <h4 style="margin:0 0 10px;display:flex;align-items:center;gap:8px">${icon('cpu', 18)} 사용 설비 (설비호기)</h4>
        <div class="flex" style="gap:10px;margin-bottom:14px">
          <select class="select" id="pm-add-equip" style="max-width:360px">
            <option value="">설비관리에서 설비 선택…</option>
            ${available.map(e => `<option value="${escapeHtml(e.code)}">${escapeHtml(e.code)} · ${escapeHtml(e.name)} (${escapeHtml(e.equip_type || '')})</option>`).join('')}
          </select>
          <button class="btn btn--primary" id="pm-add-equip-btn">${icon('plus', 16)} 설비 추가</button>
          <div class="spacer"></div><span class="muted">총 ${state.assigns.length}대</span>
        </div>
        <div class="table-wrap"><table class="grid">
          <thead><tr><th>설비코드</th><th>설비명</th><th>유형</th><th class="center">상태</th><th class="center" style="width:60px"></th></tr></thead>
          <tbody>${state.assigns.length ? state.assigns.map(a => {
            const e = state.equipments.find(x => x.code === a.equipment_code) || {};
            return `<tr><td class="cell-code">${escapeHtml(a.equipment_code)}</td><td class="cell-strong">${escapeHtml(a.equipment_name || e.name || '')}</td>
              <td>${escapeHtml(e.equip_type || '')}</td><td class="center">${e.status ? badge(e.status) : '-'}</td>
              <td class="center"><button class="icon-btn" data-rm="${a.id}" title="제외">${icon('trash', 15)}</button></td></tr>`;
          }).join('') : `<tr><td colspan="5"><div class="empty" style="padding:30px">${icon('cpu', 40)}<h4>지정된 설비가 없습니다</h4><p>위에서 설비를 선택해 추가하세요.</p></div></td></tr>`}</tbody>
        </table></div>
      </div>`;

    editor.querySelector('#pm-edit').onclick = () => openProcessModal(p);
    editor.querySelector('#pm-del').onclick = () => delProcess(p);
    editor.querySelector('#pm-add-equip-btn').onclick = addEquip;
    editor.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => rmEquip(b.dataset.rm));
  }

  async function addEquip() {
    const sel = root.querySelector('#pm-add-equip');
    const code = sel.value;
    if (!code) { toast('추가할 설비를 선택하세요.', 'error'); return; }
    const e = state.equipments.find(x => x.code === code);
    try {
      await db.insert('process_equipments', { process_code: state.code, equipment_code: code, equipment_name: e?.name || '' });
      toast('설비가 추가되었습니다.');
      state.counts[state.code] = (state.counts[state.code] || 0) + 1;
      await selectProcess(state.code);
    } catch (err) { toast(err.message || '추가 실패', 'error'); }
  }

  async function rmEquip(id) {
    try {
      await db.remove('process_equipments', id);
      toast('설비를 제외했습니다.');
      state.counts[state.code] = Math.max(0, (state.counts[state.code] || 1) - 1);
      await selectProcess(state.code);
    } catch (err) { toast(err.message || '삭제 실패', 'error'); }
  }

  // 공정 master 신규/수정 모달
  function openProcessModal(proc) {
    const isEdit = !!proc;
    const v = (k, d = '') => (proc ? (proc[k] ?? d) : d);
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field"><label>공정코드 <span class="req">*</span></label><input class="input" name="code" value="${escapeHtml(v('code'))}" ${isEdit ? 'readonly' : ''} placeholder="예: OP10"></div>
      <div class="field"><label>공정명 <span class="req">*</span></label><input class="input" name="name" value="${escapeHtml(v('name'))}"></div>
      <div class="field"><label>공정유형</label><select class="select" name="process_type">${PTYPES.map(t => `<option ${v('process_type', '가공') === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label>작업장</label><input class="input" name="work_center" value="${escapeHtml(v('work_center'))}"></div>
      <div class="field"><label>표준작업시간(분)</label><input class="input" name="std_time" type="number" value="${escapeHtml(v('std_time', 0))}"></div>
      <div class="field"><label>준비시간(분)</label><input class="input" name="setup_time" type="number" value="${escapeHtml(v('setup_time', 0))}"></div>
      <div class="field col-2"><label>비고</label><input class="input" name="remark" value="${escapeHtml(v('remark'))}"></div>`;
    openModal({
      title: `표준공정 ${isEdit ? '수정' : '신규등록'}`, body,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} ${isEdit ? '수정' : '등록'}</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => body.querySelector(`[name="${n}"]`).value.trim();
          if (!g('code') || !g('name')) { toast('공정코드와 공정명은 필수입니다.', 'error'); return; }
          const payload = { code: g('code'), name: g('name'), process_type: g('process_type'), work_center: g('work_center'), std_time: Number(g('std_time')) || 0, setup_time: Number(g('setup_time')) || 0, use_yn: true };
          payload.remark = g('remark');
          try {
            if (isEdit) await db.update('processes', proc.id, payload);
            else await db.insert('processes', payload);
            close(); toast(isEdit ? '수정되었습니다.' : '등록되었습니다.');
            await reloadAll();
            selectProcess(payload.code);
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }

  async function delProcess(p) {
    const ok = await confirmDialog({ message: `공정 [${p.code} ${p.name}]을(를) 삭제하시겠습니까?\n지정된 설비 연결도 함께 삭제됩니다.`, confirmText: '삭제' });
    if (!ok) return;
    try {
      for (const a of state.assigns) await db.remove('process_equipments', a.id);
      await db.remove('processes', p.id);
      toast('삭제되었습니다.');
      state.code = null;
      await reloadAll();
      root.querySelector('#pm-editor').innerHTML = `<div class="card__body"><div class="empty" style="padding:80px 20px">${icon('route', 52)}<h4>공정을 선택하세요</h4></div></div>`;
    } catch (e) { toast(e.message || '삭제 실패', 'error'); }
  }

  root.querySelector('#pm-add').onclick = () => openProcessModal(null);
  root.querySelector('#pm-search').addEventListener('input', (e) => renderList(e.target.value.trim()));
  await reloadAll();
}

function infoBox(label, val) {
  return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:12px 14px"><div class="muted" style="font-size:12px">${escapeHtml(label)}</div><div style="font-weight:700;font-size:15px;margin-top:2px">${escapeHtml(val)}</div></div>`;
}
function migrationBox() {
  return `<div class="empty" style="padding:40px 20px">${icon('database', 52)}<h4>설비 연결 테이블이 아직 생성되지 않았습니다</h4><p>Supabase SQL Editor에서 <b>supabase/migration_process_equipment.sql</b> 을 실행한 뒤 다시 시도하세요.<br/>(데모 모드에서는 자동으로 동작합니다.)</p></div>`;
}
