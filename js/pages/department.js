// 부서관리 — 좌: 부서 목록 / 우: 부서 정보 + 소속 사용자 관리
import { db } from '../lib/db.js';
import { escapeHtml } from '../lib/format.js';
import { toast, confirmDialog, openModal, badge, yesNo } from '../ui/components.js';
import { icon } from '../ui/icons.js';

const ROLES = [{ value: 'admin', label: '관리자' }, { value: 'manager', label: '매니저' }, { value: 'user', label: '일반' }];
const roleLabel = (r) => ({ admin: '관리자', manager: '매니저', user: '일반' }[r] || r || '일반');

export async function departmentManager(root) {
  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>부서관리</h1><p>부서를 선택하면 소속 사용자를 확인하고 관리할 수 있습니다.</p></div>
    </div>
    <div style="display:grid;grid-template-columns:340px 1fr;gap:18px;align-items:start">
      <div class="card">
        <div class="toolbar"><div class="search-box grow">${icon('search', 16)}<input id="dp-search" placeholder="부서코드·부서명 검색" autocomplete="off"/></div>
          <button class="btn btn--primary btn--sm" id="dp-add">${icon('plus', 14)} 부서</button></div>
        <div id="dp-list" style="max-height:62vh;overflow-y:auto"></div>
      </div>
      <div class="card" id="dp-editor"><div class="card__body"><div class="empty" style="padding:80px 20px">${icon('building', 52)}<h4>부서를 선택하세요</h4><p>왼쪽에서 부서를 선택하면 소속 사용자가 표시됩니다.</p></div></div></div>
    </div>`;

  const state = { code: null, departments: [], users: [], counts: {} };

  async function reloadAll() {
    const [deps, users] = await Promise.all([db.all('departments', { sort: 'code' }), db.all('users', { sort: 'name' })]);
    state.departments = deps; state.users = users;
    state.counts = {};
    for (const u of users) if (u.department) state.counts[u.department] = (state.counts[u.department] || 0) + 1;
    renderList(root.querySelector('#dp-search').value.trim());
  }

  const listSlot = root.querySelector('#dp-list');
  function renderList(filter = '') {
    const q = filter.toLowerCase();
    const list = state.departments.filter(d => !q || [d.code, d.name, d.manager].some(v => String(v ?? '').toLowerCase().includes(q)));
    if (!list.length) { listSlot.innerHTML = `<div class="empty" style="padding:40px 12px">${icon('inbox', 40)}<h4>부서가 없습니다</h4></div>`; return; }
    listSlot.innerHTML = list.map(d => `
      <div class="rt-item ${state.code === d.code ? 'active' : ''}" data-code="${escapeHtml(d.code)}"
        style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer">
        <span class="stat__ico ico-tint-brand" style="width:36px;height:36px;flex-shrink:0">${icon('building', 18)}</span>
        <div style="flex:1;min-width:0">
          <div class="flex" style="gap:8px"><span class="cell-code">${escapeHtml(d.code)}</span>${d.use_yn === false ? badge('미사용', 'neutral') : ''}</div>
          <div style="font-weight:700;margin-top:3px">${escapeHtml(d.name)}</div>
        </div>
        <span class="badge badge--brand">${state.counts[d.name] || 0}명</span>
      </div>`).join('');
    listSlot.querySelectorAll('[data-code]').forEach(el => el.onclick = () => selectDept(el.dataset.code));
  }

  function selectDept(code) {
    state.code = code;
    renderList(root.querySelector('#dp-search').value.trim());
    renderEditor();
  }

  function renderEditor() {
    const d = state.departments.find(x => x.code === state.code);
    if (!d) return;
    const members = state.users.filter(u => u.department === d.name);
    const editor = root.querySelector('#dp-editor');
    editor.innerHTML = `
      <div class="card__head">
        <div><span class="cell-code" style="font-size:14px">${escapeHtml(d.code)}</span><h3 style="margin-top:4px">${escapeHtml(d.name)}</h3></div>
        <div class="spacer"></div>
        <button class="btn btn--sm" id="dp-edit">${icon('edit', 14)} 부서정보 수정</button>
        <button class="btn btn--sm btn--danger" id="dp-del">${icon('trash', 14)} 삭제</button>
      </div>
      <div class="card__body">
        <div class="grid-3" style="margin-bottom:18px">
          ${infoBox('부서장', d.manager || '-')}${infoBox('연락처', d.phone || '-')}${infoBox('사용여부', d.use_yn === false ? '미사용' : '사용')}
        </div>
        <div class="flex between" style="margin-bottom:12px">
          <h4 style="margin:0;display:flex;align-items:center;gap:8px">${icon('users', 18)} 소속 사용자 <span class="badge badge--brand">${members.length}명</span></h4>
          <button class="btn btn--primary btn--sm" id="dp-user-add">${icon('plus', 14)} 사용자 추가</button>
        </div>
        <div class="table-wrap"><table class="grid">
          <thead><tr><th>아이디</th><th>이름</th><th>직급</th><th class="center">권한</th><th>이메일</th><th>연락처</th><th class="center">사용</th><th class="center" style="width:90px">관리</th></tr></thead>
          <tbody>${members.length ? members.map(u => `<tr>
            <td class="cell-code">${escapeHtml(u.login_id || '')}</td><td class="cell-strong">${escapeHtml(u.name || '')}</td>
            <td>${escapeHtml(u.position || '')}</td><td class="center">${badge(roleLabel(u.role), u.role === 'admin' ? 'danger' : u.role === 'manager' ? 'warning' : 'neutral')}</td>
            <td>${escapeHtml(u.email || '')}</td><td>${escapeHtml(u.phone || '')}</td><td class="center">${yesNo(u.use_yn)}</td>
            <td class="center"><div class="row-actions">
              <button class="icon-btn" data-uedit="${u.id}" title="수정">${icon('edit', 15)}</button>
              <button class="icon-btn" data-udel="${u.id}" title="삭제">${icon('trash', 15)}</button>
            </div></td></tr>`).join('') : `<tr><td colspan="8"><div class="empty" style="padding:30px">${icon('users', 40)}<h4>소속 사용자가 없습니다</h4><p>[사용자 추가]로 이 부서의 사용자를 등록하세요.</p></div></td></tr>`}</tbody>
        </table></div>
      </div>`;
    editor.querySelector('#dp-edit').onclick = () => openDeptModal(d);
    editor.querySelector('#dp-del').onclick = () => delDept(d, members);
    editor.querySelector('#dp-user-add').onclick = () => openUserModal(null, d);
    editor.querySelectorAll('[data-uedit]').forEach(b => b.onclick = () => openUserModal(state.users.find(u => u.id === b.dataset.uedit), d));
    editor.querySelectorAll('[data-udel]').forEach(b => b.onclick = () => delUser(state.users.find(u => u.id === b.dataset.udel)));
  }

  // ----- 부서 신규/수정 -----
  function openDeptModal(dept) {
    const isEdit = !!dept;
    const v = (k, d = '') => (dept ? (dept[k] ?? d) : d);
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field"><label>부서코드 <span class="req">*</span></label><input class="input" name="code" value="${escapeHtml(v('code'))}" ${isEdit ? 'readonly' : ''} placeholder="예: D300"></div>
      <div class="field"><label>부서명 <span class="req">*</span></label><input class="input" name="name" value="${escapeHtml(v('name'))}"></div>
      <div class="field"><label>부서장</label><input class="input" name="manager" value="${escapeHtml(v('manager'))}"></div>
      <div class="field"><label>연락처</label><input class="input" name="phone" value="${escapeHtml(v('phone'))}"></div>
      <div class="field col-2"><label class="switch"><input type="checkbox" name="use_yn" ${v('use_yn', true) === false ? '' : 'checked'}><span class="switch__track"></span><span class="muted" data-switch-label>${v('use_yn', true) === false ? '미사용' : '사용'}</span></label></div>
      <div class="field col-2"><label>비고</label><input class="input" name="remark" value="${escapeHtml(v('remark'))}"></div>`;
    openModal({
      title: `부서 ${isEdit ? '수정' : '신규등록'}`, body,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} ${isEdit ? '수정' : '등록'}</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => body.querySelector(`[name="${n}"]`).value.trim();
          if (!g('code') || !g('name')) { toast('부서코드와 부서명은 필수입니다.', 'error'); return; }
          const payload = { code: g('code'), name: g('name'), manager: g('manager'), phone: g('phone'), use_yn: body.querySelector('[name="use_yn"]').checked, remark: g('remark') };
          try {
            if (isEdit) {
              await db.update('departments', dept.id, payload);
              // 부서명이 바뀌면 소속 사용자의 부서명도 갱신
              if (dept.name !== payload.name) {
                for (const u of state.users.filter(u => u.department === dept.name)) await db.update('users', u.id, { department: payload.name });
              }
            } else await db.insert('departments', payload);
            close(); toast(isEdit ? '수정되었습니다.' : '등록되었습니다.');
            await reloadAll(); selectDept(payload.code);
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }

  async function delDept(d, members) {
    if (members.length) { toast('소속 사용자가 있어 삭제할 수 없습니다. 사용자를 먼저 이동/삭제하세요.', 'error'); return; }
    if (!(await confirmDialog({ message: `부서 [${d.code} ${d.name}]을(를) 삭제하시겠습니까?`, confirmText: '삭제' }))) return;
    try { await db.remove('departments', d.id); toast('삭제되었습니다.'); state.code = null; await reloadAll(); root.querySelector('#dp-editor').innerHTML = `<div class="card__body"><div class="empty" style="padding:80px 20px">${icon('building', 52)}<h4>부서를 선택하세요</h4></div></div>`; }
    catch (e) { toast(e.message || '삭제 실패', 'error'); }
  }

  // ----- 사용자 신규/수정 (부서 고정) -----
  function openUserModal(user, dept) {
    const isEdit = !!user;
    const v = (k, d = '') => (user ? (user[k] ?? d) : d);
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field col-2"><label>부서</label><input class="input" value="${escapeHtml(dept.name)}" readonly></div>
      <div class="field"><label>로그인 아이디 <span class="req">*</span></label><input class="input" name="login_id" value="${escapeHtml(v('login_id'))}" ${isEdit ? 'readonly' : ''}></div>
      <div class="field"><label>비밀번호</label><input class="input" type="password" name="password" autocomplete="new-password" placeholder="${isEdit ? '변경 시에만 입력' : '로그인 비밀번호'}"></div>
      <div class="field"><label>이름 <span class="req">*</span></label><input class="input" name="name" value="${escapeHtml(v('name'))}"></div>
      <div class="field"><label>직급</label><input class="input" name="position" value="${escapeHtml(v('position'))}"></div>
      <div class="field"><label>권한</label><select class="select" name="role">${ROLES.map(o => `<option value="${o.value}" ${v('role', 'user') === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}</select></div>
      <div class="field"><label>이메일</label><input class="input" name="email" value="${escapeHtml(v('email'))}"></div>
      <div class="field"><label>연락처</label><input class="input" name="phone" value="${escapeHtml(v('phone'))}"></div>
      <div class="field col-2"><label class="switch"><input type="checkbox" name="use_yn" ${v('use_yn', true) === false ? '' : 'checked'}><span class="switch__track"></span><span class="muted" data-switch-label>${v('use_yn', true) === false ? '미사용' : '사용'}</span></label></div>`;
    openModal({
      title: `사용자 ${isEdit ? '수정' : '신규등록'}`, body,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} ${isEdit ? '수정' : '등록'}</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => body.querySelector(`[name="${n}"]`).value.trim();
          if (!g('login_id') || !g('name')) { toast('아이디와 이름은 필수입니다.', 'error'); return; }
          const payload = { login_id: g('login_id'), name: g('name'), department: dept.name, position: g('position'), role: g('role'), email: g('email'), phone: g('phone'), use_yn: body.querySelector('[name="use_yn"]').checked };
          if (g('password')) payload.password = g('password'); // 입력했을 때만 반영(수정 시 빈칸이면 기존 유지)
          try {
            if (isEdit) await db.update('users', user.id, payload);
            else await db.insert('users', payload);
            close(); toast(isEdit ? '수정되었습니다.' : '등록되었습니다.');
            await reloadAll(); renderEditor();
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }

  async function delUser(u) {
    if (!u) return;
    if (!(await confirmDialog({ message: `사용자 [${u.name}]을(를) 삭제하시겠습니까?`, confirmText: '삭제' }))) return;
    try { await db.remove('users', u.id); toast('삭제되었습니다.'); await reloadAll(); renderEditor(); }
    catch (e) { toast(e.message || '삭제 실패', 'error'); }
  }

  root.querySelector('#dp-add').onclick = () => openDeptModal(null);
  root.querySelector('#dp-search').addEventListener('input', (e) => renderList(e.target.value.trim()));
  await reloadAll();
}

function infoBox(label, val) {
  return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:12px 14px"><div class="muted" style="font-size:12px">${escapeHtml(label)}</div><div style="font-weight:700;font-size:15px;margin-top:2px">${escapeHtml(val)}</div></div>`;
}
