// =====================================================================
// 개발관리 — PFD / PFMEA / 관리계획서 / 작업표준서
//   PFD → PFMEA → 관리계획서 → 작업표준서 순으로 연계되는 4개 문서.
//   · PFD에서 부여한 "공정번호"를 전 문서가 동일하게 사용(일치성의 기준)
//   · PFMEA 고위험·특별특성 → 관리계획서 관리항목으로 전개
//   · 관리계획서 관리기준 → 작업표준서 실행방법으로 구체화
//   · 각 문서에서 상위 문서 대비 누락·불일치를 점검할 수 있음
// =====================================================================
import { db } from '../lib/db.js';
import { num, fmtDate, todayStr, escapeHtml, nextDocNo } from '../lib/format.js';
import { badge, toast, openModal, confirmDialog } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { createGridEditor } from '../lib/gridEditor.js';

const STATUSES = ['작성중', '검토중', '승인', '개정', '폐기'];
const CHAR_TYPES = ['일반', '중요특성', '특별특성'];
// 관리계획서·작업표준서가 공유하는 검사주기(불일치 방지를 위해 동일 목록 사용)
export const INSPECT_CYCLES = ['초물', '중물', '종물', '초·중·종물', '1회/LOT', '전수', '주기(1h)', '주기(2h)', '주기(4h)', '작업시작 시', '작업종료 시'];
// 관리계획서·작업표준서가 공유하는 이상 시 조치
export const REACTION_PLANS = ['생산 중지 및 조건 확인', '설비정지 후 보고', '전수선별', '재작업', '공구교체', '조건 재설정', '부적합품 격리', '부적합 등록', '초물 재검사'];

// 품목의 최신 문서(승인본 우선) 조회 — 문서 간 연계 호출에 사용
export async function latestDoc(docType, itemCode) {
  const all = await db.all('dev_docs', {}).catch(() => []);
  const list = all.filter(d => d.doc_type === docType && d.item_code === itemCode);
  if (!list.length) return null;
  const approved = list.filter(d => d.status === '승인');
  const pool = approved.length ? approved : list;
  pool.sort((a, b) => String(b.rev || '').localeCompare(String(a.rev || '')));
  return pool[0];
}

// 관리계획서 관리항목 ↔ 작업표준서 작업단계 매칭 규칙 (일치 점검 · 정합성 점검 공용)
//   ① cp_ref 직접 연결 → ② 같은 공정에서 단계명·품질확인사항에 관리항목명이 포함된 행
export function findWsRow(wsRows, cpItem) {
  const key = String(cpItem.ctrl_item || '').trim();
  if (!key) return null;
  const pno = String(cpItem.process_no || '');
  return wsRows.find(r => r.cp_ref && r.cp_ref === key)
    || wsRows.find(r => (!pno || String(r.process_no || '') === pno)
      && (String(r.step_name || '').includes(key) || String(r.quality_check || '').includes(key)))
    || null;
}

function stat(label, value, unit, ic, tint) {
  return `<div class="stat"><div class="stat__top"><span class="stat__label">${escapeHtml(label)}</span><span class="stat__ico ico-tint-${tint}">${icon(ic, 21)}</span></div><div class="stat__value">${value}${unit ? `<small>${escapeHtml(unit)}</small>` : ''}</div></div>`;
}
function info(label, val) {
  return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:11px 13px"><div class="muted" style="font-size:11.5px">${escapeHtml(label)}</div><div style="font-weight:700;margin-top:2px">${escapeHtml(val ?? '')}</div></div>`;
}

// =====================================================================
// 공용 문서 화면 팩토리
// =====================================================================
function createDevDocPage(cfg) {
  // cfg: { docType, title, subtitle, docPrefix, detailTable, cols(state), emptyText, extraHeader(doc) }
  return async function render(root) {
    const state = { search: '', fItem: '', fStatus: '__all__', selected: null };
    let docs = [], items = [], processes = [], users = [], instruments = [], equipments = [], partners = [];

    root.innerHTML = `
      <div class="page-head">
        <div class="page-head__text"><h1>${escapeHtml(cfg.title)}</h1><p>${escapeHtml(cfg.subtitle)}</p></div>
        <div class="page-head__actions">
          <button class="btn" id="dd-copy">${icon('layers', 16)} 유사품목 복사</button>
          <button class="btn" id="dd-refresh">${icon('refresh', 16)} 새로고침</button>
          <button class="btn btn--primary" id="dd-add">${icon('plus', 16)} ${escapeHtml(cfg.docType)} 등록</button>
        </div>
      </div>
      <div id="dd-stats"></div>
      <div class="card" style="margin-bottom:16px">
        <div class="toolbar">
          <div class="search-box grow">${icon('search', 16)}<input id="dd-search" placeholder="문서번호·품목·제목 검색" autocomplete="off"/></div>
          <select class="select" id="dd-fitem" style="width:auto;min-width:170px"><option value="">전체 품목</option></select>
          <select class="select" id="dd-fstatus" style="width:auto;min-width:120px"><option value="__all__">전체 상태</option>${STATUSES.map(s => `<option value="${s}">${s}</option>`).join('')}</select>
        </div>
        <div class="table-wrap"><div id="dd-table"><div class="spinner"></div></div></div>
      </div>
      <div id="dd-detail"></div>`;

    root.querySelector('#dd-refresh').onclick = () => reload();
    root.querySelector('#dd-add').onclick = () => openForm(null);
    root.querySelector('#dd-copy').onclick = () => openCopy();
    root.querySelector('#dd-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });
    root.querySelector('#dd-fitem').addEventListener('change', (e) => { state.fItem = e.target.value; renderTable(); });
    root.querySelector('#dd-fstatus').addEventListener('change', (e) => { state.fStatus = e.target.value; renderTable(); });

    async function loadAll() {
      const [all, its, procs, us, insts, eqs, pts] = await Promise.all([
        db.all('dev_docs', {}).catch(() => []),
        db.all('items', { sort: 'code' }).catch(() => []),
        db.all('processes', { sort: 'code' }).catch(() => []),
        db.all('users', { sort: 'name' }).catch(() => []),
        db.all('measuring_instruments', { sort: 'code' }).catch(() => []),
        db.all('equipments', { sort: 'code' }).catch(() => []),
        db.all('partners', { sort: 'code' }).catch(() => []),
      ]);
      docs = all.filter(d => d.doc_type === cfg.docType);
      items = its; processes = procs; users = us; instruments = insts; equipments = eqs; partners = pts;
      root.querySelector('#dd-fitem').innerHTML = `<option value="">전체 품목</option>` + items.map(i => `<option value="${escapeHtml(i.code)}">${escapeHtml(i.code)} · ${escapeHtml(i.name)}</option>`).join('');
    }
    function filtered() {
      const q = state.search.toLowerCase();
      return docs.filter(d => {
        if (state.fItem && d.item_code !== state.fItem) return false;
        if (state.fStatus !== '__all__' && (d.status || '작성중') !== state.fStatus) return false;
        if (q && ![d.doc_no, d.item_code, d.item_name, d.title, d.process].some(v => String(v ?? '').toLowerCase().includes(q))) return false;
        return true;
      }).sort((a, b) => String(a.item_code).localeCompare(String(b.item_code)) || String(b.rev || '').localeCompare(String(a.rev || '')));
    }
    function renderStats() {
      root.querySelector('#dd-stats').innerHTML = `<div class="stat-grid">
        ${stat(`총 ${cfg.docType}`, num(docs.length), '건', 'fileText', 'brand')}
        ${stat('승인 완료', num(docs.filter(d => d.status === '승인').length), '건', 'checkCircle', 'green')}
        ${stat('작성·검토중', num(docs.filter(d => ['작성중', '검토중'].includes(d.status || '작성중')).length), '건', 'clock', 'amber')}
        ${stat('적용 품목', num(new Set(docs.map(d => d.item_code).filter(Boolean)).size), '종', 'box', 'violet')}</div>`;
    }
    function renderTable() {
      const list = filtered(); const slot = root.querySelector('#dd-table');
      if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:50px">${icon('inbox', 48)}<h4>${escapeHtml(cfg.docType)} 문서가 없습니다</h4><p>[${escapeHtml(cfg.docType)} 등록]으로 추가하세요.</p></div>`; return; }
      slot.innerHTML = `<table class="grid"><thead><tr>
        <th>문서번호</th><th>고객사</th><th>품목</th><th>품명</th>${cfg.showProcess ? '<th>공정</th>' : ''}<th class="center">개정</th><th>제목</th>
        <th>작성자</th><th class="center">작성일</th><th>승인자</th><th class="center">상태</th><th class="center" style="width:110px">관리</th>
      </tr></thead><tbody>${list.map(d => `<tr class="clickable ${state.selected?.id === d.id ? 'is-selected' : ''}" data-id="${d.id}">
        <td class="cell-code">${escapeHtml(d.doc_no)}</td><td>${escapeHtml(d.customer || '')}</td>
        <td class="cell-code">${escapeHtml(d.item_code || '')}</td><td class="cell-strong">${escapeHtml(d.item_name || '')}</td>
        ${cfg.showProcess ? `<td>${escapeHtml(d.process || '-')}</td>` : ''}
        <td class="center mono">Rev.${escapeHtml(d.rev || 'A')}</td><td>${escapeHtml(d.title || '')}</td>
        <td>${escapeHtml(d.writer || '')}</td><td class="center">${fmtDate(d.write_date) || '-'}</td>
        <td>${escapeHtml(d.approver || '')}</td><td class="center">${badge(d.status || '작성중')}</td>
        <td class="center"><div class="row-actions">
          <button class="icon-btn" data-rev="${d.id}" title="개정">${icon('layers', 15)}</button>
          <button class="icon-btn" data-edit="${d.id}" title="수정">${icon('edit', 15)}</button>
          <button class="icon-btn" data-del="${d.id}" title="삭제">${icon('trash', 15)}</button></div></td>
      </tr>`).join('')}</tbody></table>`;
      slot.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = (e) => { if (e.target.closest('button')) return; select(list.find(x => x.id === tr.dataset.id)); });
      slot.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openForm(list.find(x => x.id === b.dataset.edit)));
      slot.querySelectorAll('[data-rev]').forEach(b => b.onclick = () => openRevision(list.find(x => x.id === b.dataset.rev)));
      slot.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
        const d = list.find(x => x.id === b.dataset.del);
        if (d.status === '승인') { toast('승인된 문서는 삭제할 수 없습니다. [개정] 또는 폐기 처리하세요.', 'error'); return; }
        if (!(await confirmDialog({ message: `[${d.doc_no}] 문서와 상세 항목을 모두 삭제하시겠습니까?`, confirmText: '삭제' }))) return;
        try {
          const dets = await db.all(cfg.detailTable, { filters: { doc_no: d.doc_no } }).catch(() => []);
          for (const x of dets) await db.remove(cfg.detailTable, x.id);
          await db.remove('dev_docs', d.id);
          toast('삭제되었습니다.'); state.selected = null; await reload(); root.querySelector('#dd-detail').innerHTML = '';
        } catch (e) { toast(e.message || '삭제 실패', 'error'); }
      });
    }
    function select(d) { if (!d) return; state.selected = d; renderTable(); renderDetail(); }

    function renderDetail() {
      const d = state.selected; const slot = root.querySelector('#dd-detail');
      if (!d) { slot.innerHTML = ''; return; }
      slot.innerHTML = `<div class="card">
        <div class="card__head">
          <div><div class="flex" style="gap:8px"><span class="cell-code" style="font-size:14px">${escapeHtml(d.doc_no)}</span>
            <span class="badge badge--brand">${escapeHtml(cfg.docType)}</span><span class="badge badge--neutral">Rev.${escapeHtml(d.rev || 'A')}</span>${badge(d.status || '작성중')}</div>
            <h3 style="margin-top:4px">${escapeHtml(d.title || d.item_name || '')}</h3></div>
          <div class="spacer"></div>
          ${d.status !== '승인' ? `<button class="btn btn--primary btn--sm" id="dd-approve">${icon('check', 14)} 승인 처리</button>` : ''}
          <button class="btn btn--sm" id="dd-print">${icon('fileText', 14)} 인쇄</button>
        </div>
        <div class="card__body">
          <div class="grid-3" style="margin-bottom:16px">
            ${info('고객사', d.customer || '-')}${info('품목', `${d.item_code || ''} ${d.item_name || ''}`)}${info('품번', d.part_no || '-')}
            ${info('작성자 / 작성일', `${d.writer || '-'} / ${fmtDate(d.write_date) || '-'}`)}
            ${info('승인자 / 승인일', `${d.approver || '-'} / ${fmtDate(d.approve_date) || '-'}`)}
            ${info('적용일', fmtDate(d.apply_date) || '-')}
          </div>
          ${cfg.extraHeader ? cfg.extraHeader(d) : ''}
          <div id="dd-grid"></div>
        </div></div>`;
      const ap = slot.querySelector('#dd-approve'); if (ap) ap.onclick = () => openApprove(d);
      slot.querySelector('#dd-print').onclick = () => cfg.print(d, state);
      const grid = createGridEditor(slot.querySelector('#dd-grid'), cfg.cols({ processes, instruments, equipments, items, users, partners, doc: d }), {
        table: cfg.detailTable, parentKey: 'doc_no', parentValue: d.doc_no,
        title: cfg.detailTitle, emptyText: cfg.emptyText,
        rowDefaults: cfg.rowDefaults || {},
        beforeSaveRow: cfg.beforeSaveRow,
        extraButtons: cfg.extraButtons || '',
      });
      grid.load();
      // PFD 공정 불러오기 등 부가 버튼
      if (cfg.wireExtra) cfg.wireExtra(slot, grid, { processes, items, doc: d, reload });
    }

    function openApprove(d) {
      const body = document.createElement('form');
      body.className = 'form-grid';
      body.innerHTML = `
        <div class="field col-2"><label>문서</label><input class="input" value="${escapeHtml(d.doc_no)} · ${escapeHtml(d.title || '')} (Rev.${escapeHtml(d.rev || 'A')})" readonly></div>
        <div class="field"><label>상태 <span class="req">*</span></label><select class="select" name="status">${STATUSES.map(s => `<option value="${s}" ${(d.status || '작성중') === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="field"><label>승인자</label><select class="select" name="approver"><option value="">선택</option>
          ${users.map(u => `<option value="${escapeHtml(u.name)}" ${d.approver === u.name ? 'selected' : ''}>${escapeHtml(u.name)} (${escapeHtml(u.department || '')})</option>`).join('')}</select></div>
        <div class="field"><label>승인일</label><input class="input" type="date" name="approve_date" value="${escapeHtml(String(d.approve_date || todayStr()).slice(0, 10))}"></div>
        <div class="field"><label>적용일</label><input class="input" type="date" name="apply_date" value="${escapeHtml(String(d.apply_date || todayStr()).slice(0, 10))}"></div>
        <div class="field col-2 muted" style="background:var(--surface-2);padding:10px 12px;border-radius:10px">승인 시 동일 품목의 이전 개정본은 <b>개정</b> 상태로 변경되며, 최신 승인본만 현장에 적용됩니다.</div>`;
      openModal({
        title: `${cfg.docType} 승인`, body,
        footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 저장</button>`,
        onMount: ({ footEl, close }) => {
          footEl.querySelector('[data-cancel]').onclick = close;
          footEl.querySelector('[data-ok]').onclick = async () => {
            const g = (n) => body.querySelector(`[name="${n}"]`).value;
            const status = g('status');
            try {
              const dets = await db.all(cfg.detailTable, { filters: { doc_no: d.doc_no } }).catch(() => []);
              if (status === '승인' && !dets.length) { toast('상세 항목이 없는 문서는 승인할 수 없습니다.', 'error'); return; }
              await db.update('dev_docs', d.id, { status, approver: g('approver'), approve_date: g('approve_date') || null, apply_date: g('apply_date') || null });
              if (status === '승인') {
                const olds = docs.filter(x => x.id !== d.id && x.doc_type === cfg.docType && x.item_code === d.item_code && (x.process || '') === (d.process || '') && x.status === '승인');
                for (const o of olds) await db.update('dev_docs', o.id, { status: '개정' });
              }
              close(); toast('저장되었습니다.'); await reload();
              state.selected = docs.find(x => x.id === d.id); renderDetail();
            } catch (e) { toast(e.message || '저장 실패', 'error'); }
          };
        },
      });
    }

    function openForm(r) {
      const isEdit = !!r;
      const v = (k, dv = '') => (r ? (r[k] ?? dv) : dv);
      const body = document.createElement('form');
      body.className = 'form-grid';
      body.innerHTML = `
        <div class="field"><label>고객사</label><input class="input" name="customer" value="${escapeHtml(v('customer'))}" placeholder="품목 선택 시 자동"></div>
        <div class="field"><label>품목 <span class="req">*</span></label><select class="select" name="item_code"><option value="">선택</option>
          ${items.map(i => `<option value="${escapeHtml(i.code)}" data-cust="${escapeHtml(i.customer || '')}" ${v('item_code') === i.code ? 'selected' : ''}>${escapeHtml(i.code)} · ${escapeHtml(i.name)}</option>`).join('')}</select></div>
        <div class="field"><label>품번</label><input class="input" name="part_no" value="${escapeHtml(v('part_no'))}"></div>
        ${cfg.showProcess ? `<div class="field"><label>공정</label><select class="select" name="process"><option value="">전체 공정</option>
          ${processes.map(p => `<option value="${escapeHtml(p.name)}" ${v('process') === p.name ? 'selected' : ''}>${escapeHtml(p.code)} · ${escapeHtml(p.name)}</option>`).join('')}</select></div>` : ''}
        <div class="field"><label>개정번호</label><input class="input" name="rev" value="${escapeHtml(v('rev', 'A'))}"></div>
        <div class="field col-2"><label>제목 <span class="req">*</span></label><input class="input" name="title" value="${escapeHtml(v('title'))}" placeholder="예: MCT 하우징 ${cfg.docType}"></div>
        <div class="field"><label>작성자</label><select class="select" name="writer"><option value="">선택</option>
          ${users.map(u => `<option value="${escapeHtml(u.name)}" ${v('writer') === u.name ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select></div>
        <div class="field"><label>작성일</label><input class="input" type="date" name="write_date" value="${escapeHtml(String(v('write_date', todayStr())).slice(0, 10))}"></div>
        <div class="field col-2"><label>파일 URL</label><input class="input" name="file_url" value="${escapeHtml(v('file_url'))}"></div>
        <div class="field col-2"><label>비고</label><textarea class="textarea" name="remark">${escapeHtml(v('remark'))}</textarea></div>`;
      body.querySelector('[name="item_code"]').addEventListener('change', (e) => {
        const cust = e.target.selectedOptions[0]?.dataset.cust;
        if (cust && !body.querySelector('[name="customer"]').value) body.querySelector('[name="customer"]').value = cust;
        const it = items.find(i => i.code === e.target.value);
        const t = body.querySelector('[name="title"]');
        if (it && !t.value) t.value = `${it.name} ${cfg.docType}`;
      });
      openModal({
        title: `${cfg.docType} ${isEdit ? '수정' : '등록'}`, body, wide: true,
        footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 저장</button>`,
        onMount: ({ footEl, close }) => {
          footEl.querySelector('[data-cancel]').onclick = close;
          footEl.querySelector('[data-ok]').onclick = async () => {
            const g = (n) => { const el = body.querySelector(`[name="${n}"]`); return el ? el.value.trim() : ''; };
            if (!g('item_code')) { toast('품목을 선택하세요.', 'error'); return; }
            if (!g('title')) { toast('제목을 입력하세요.', 'error'); return; }
            const it = items.find(i => i.code === g('item_code'));
            const payload = {
              doc_type: cfg.docType, customer: g('customer'), item_code: g('item_code'), item_name: it?.name || '',
              part_no: g('part_no'), process: cfg.showProcess ? g('process') : '', rev: g('rev') || 'A',
              title: g('title'), writer: g('writer'), write_date: g('write_date') || todayStr(),
              file_url: g('file_url'), remark: g('remark'),
            };
            try {
              if (isEdit) await db.update('dev_docs', r.id, payload);
              else {
                payload.doc_no = nextDocNo(cfg.docPrefix, docs.map(x => x.doc_no));
                payload.status = '작성중';
                await db.insert('dev_docs', payload);
              }
              close(); toast(isEdit ? '수정되었습니다.' : '등록되었습니다. 상세 항목을 입력하세요.');
              await reload();
              state.selected = isEdit ? docs.find(x => x.id === r.id) : docs.find(x => x.doc_no === payload.doc_no);
              renderTable(); renderDetail();
            } catch (e) { toast(e.message || '저장 실패', 'error'); }
          };
        },
      });
    }

    function openRevision(d) {
      const nextRev = String.fromCharCode((d.rev || 'A').charCodeAt(0) + 1);
      const body = document.createElement('form');
      body.className = 'form-grid';
      body.innerHTML = `
        <div class="field col-2"><label>원본</label><input class="input" value="${escapeHtml(d.doc_no)} · ${escapeHtml(d.title || '')} (Rev.${escapeHtml(d.rev || 'A')})" readonly></div>
        <div class="field"><label>새 개정번호</label><input class="input" name="rev" value="${nextRev}"></div>
        <div class="field"><label>적용일</label><input class="input" type="date" name="apply_date" value="${todayStr()}"></div>
        <div class="field col-2"><label>개정사유</label><textarea class="textarea" name="remark" placeholder="예: 4M 변경(설비 추가)에 따른 개정"></textarea></div>`;
      openModal({
        title: `${cfg.docType} 개정`, body,
        footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('layers', 16)} 개정본 생성</button>`,
        onMount: ({ footEl, close }) => {
          footEl.querySelector('[data-cancel]').onclick = close;
          footEl.querySelector('[data-ok]').onclick = async () => {
            const g = (n) => body.querySelector(`[name="${n}"]`).value.trim();
            try {
              const doc_no = nextDocNo(cfg.docPrefix, docs.map(x => x.doc_no));
              await db.insert('dev_docs', {
                doc_type: cfg.docType, doc_no, customer: d.customer, item_code: d.item_code, item_name: d.item_name,
                part_no: d.part_no, process: d.process, rev: g('rev'), title: d.title, writer: d.writer,
                write_date: todayStr(), apply_date: g('apply_date') || null, status: '작성중', remark: g('remark'), file_url: d.file_url,
              });
              const dets = await db.all(cfg.detailTable, { filters: { doc_no: d.doc_no }, sort: 'seq' }).catch(() => []);
              for (const x of dets) { const c = { ...x }; delete c.id; delete c.created_at; delete c.updated_at; c.doc_no = doc_no; await db.insert(cfg.detailTable, c); }
              close(); toast(`개정본(Rev.${g('rev')})이 생성되었습니다.`);
              await reload(); state.selected = docs.find(x => x.doc_no === doc_no); renderTable(); renderDetail();
            } catch (e) { toast(e.message || '개정 실패', 'error'); }
          };
        },
      });
    }

    function openCopy() {
      const body = document.createElement('form');
      body.className = 'form-grid';
      body.innerHTML = `
        <div class="field col-2"><label>복사할 원본 <span class="req">*</span></label><select class="select" name="src"><option value="">선택</option>
          ${docs.map(d => `<option value="${escapeHtml(d.doc_no)}">${escapeHtml(d.doc_no)} · ${escapeHtml(d.item_name || '')} (Rev.${escapeHtml(d.rev || 'A')})</option>`).join('')}</select></div>
        <div class="field col-2"><label>대상 품목 <span class="req">*</span></label><select class="select" name="target"><option value="">선택</option>
          ${items.map(i => `<option value="${escapeHtml(i.code)}">${escapeHtml(i.code)} · ${escapeHtml(i.name)}</option>`).join('')}</select></div>`;
      openModal({
        title: `유사품목 ${cfg.docType} 복사`, body,
        footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('layers', 16)} 복사</button>`,
        onMount: ({ footEl, close }) => {
          footEl.querySelector('[data-cancel]').onclick = close;
          footEl.querySelector('[data-ok]').onclick = async () => {
            const srcNo = body.querySelector('[name="src"]').value, target = body.querySelector('[name="target"]').value;
            if (!srcNo || !target) { toast('원본과 대상 품목을 선택하세요.', 'error'); return; }
            const src = docs.find(d => d.doc_no === srcNo); const it = items.find(i => i.code === target);
            try {
              const doc_no = nextDocNo(cfg.docPrefix, docs.map(x => x.doc_no));
              await db.insert('dev_docs', {
                doc_type: cfg.docType, doc_no, customer: it?.customer || src.customer, item_code: target, item_name: it?.name || '',
                process: src.process, rev: 'A', title: `${it?.name || ''} ${cfg.docType}`, writer: src.writer,
                write_date: todayStr(), status: '작성중', remark: `${src.doc_no} 복사`,
              });
              const dets = await db.all(cfg.detailTable, { filters: { doc_no: srcNo }, sort: 'seq' }).catch(() => []);
              for (const x of dets) { const c = { ...x }; delete c.id; delete c.created_at; delete c.updated_at; c.doc_no = doc_no; await db.insert(cfg.detailTable, c); }
              close(); toast(`${dets.length}개 항목이 복사되었습니다.`);
              await reload(); state.selected = docs.find(x => x.doc_no === doc_no); renderTable(); renderDetail();
            } catch (e) { toast(e.message || '복사 실패', 'error'); }
          };
        },
      });
    }

    async function reload() {
      try { await loadAll(); renderStats(); renderTable(); if (state.selected) { state.selected = docs.find(x => x.id === state.selected.id); renderDetail(); } }
      catch (e) { root.querySelector('#dd-table').innerHTML = `<div class="empty" style="padding:40px">${icon('database', 46)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p><p class="muted">신규 테이블이 없으면 <b>supabase/migration_v2_sq.sql</b>을 실행하세요.</p></div>`; }
    }
    reload();
  };
}

// 인쇄 공통
function printDoc(title, doc, headRows, tableHead, tableRows) {
  const w = window.open('', '_blank', 'width=1000,height=900');
  if (!w) { toast('팝업이 차단되었습니다.', 'error'); return; }
  w.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${title}_${doc.doc_no}</title>
    <style>body{font-family:'Malgun Gothic',sans-serif;padding:22px;color:#111}h1{font-size:19px;text-align:center;letter-spacing:5px;margin-bottom:5px}
    .sub{text-align:center;color:#555;font-size:11.5px;margin-bottom:14px}table{width:100%;border-collapse:collapse;margin-bottom:10px}
    th,td{border:1px solid #333;padding:5px 6px;font-size:10.5px;text-align:left;vertical-align:top}th{background:#f0f0f0}
    .sign{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #333;margin-top:12px;width:300px;margin-left:auto}
    .sign>div{border-right:1px solid #333;text-align:center}.sign>div:last-child{border-right:0}
    .sign .t{background:#f0f0f0;border-bottom:1px solid #333;padding:3px;font-size:10px}.sign .s{height:40px}
    @media print{body{padding:8mm}@page{size:A4 landscape}}</style></head><body>
    <h1>${title}</h1><div class="sub">(주)민선 MES·QMS</div>
    <table>${headRows}</table>
    <table><thead><tr>${tableHead}</tr></thead><tbody>${tableRows}</tbody></table>
    <div class="sign"><div><div class="t">작성</div><div class="s">${doc.writer || ''}</div></div><div><div class="t">검토</div><div class="s"></div></div><div><div class="t">승인</div><div class="s">${doc.approver || ''}</div></div></div>
    <div style="margin-top:8px;font-size:10px;color:#555">출력일시: ${new Date().toLocaleString('ko-KR')}</div>
    <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}
function docHead(doc, extra = '') {
  return `<tr><th style="width:80px">문서번호</th><td>${doc.doc_no}</td><th style="width:80px">개정</th><td>Rev.${doc.rev || 'A'}</td><th style="width:70px">고객사</th><td>${doc.customer || ''}</td></tr>
    <tr><th>품목코드</th><td>${doc.item_code || ''}</td><th>품명</th><td>${doc.item_name || ''}</td><th>품번</th><td>${doc.part_no || ''}</td></tr>
    <tr><th>작성일</th><td>${(doc.write_date || '').slice(0, 10)}</td><th>승인일</th><td>${(doc.approve_date || '').slice(0, 10)}</td><th>적용일</th><td>${(doc.apply_date || '').slice(0, 10)}</td></tr>${extra}`;
}

// =====================================================================
// 6-1 PFD (공정흐름도) — 4개 문서의 기준. 여기서 정의한 공정번호를 전 문서가 승계
// =====================================================================
export const pfdDocs = createDevDocPage({
  docType: 'PFD', docPrefix: 'PFD', detailTable: 'pfd_items', detailTitle: '공정흐름',
  title: 'PFD (공정흐름도)', subtitle: '제품이 만들어지는 전체 공정 순서를 정의합니다. 여기서 부여한 공정번호(10·20·30…)를 PFMEA·관리계획서·작업표준서가 그대로 사용합니다.',
  emptyText: '공정이 없습니다',
  showProcess: false,
  rowDefaults: { process_type: '가공' },
  extraButtons: `<button class="btn btn--sm" data-load-routing type="button">${icon('route', 14)} 표준 라우팅 불러오기</button>
    <button class="btn btn--sm" data-renumber type="button">${icon('sliders', 14)} 공정번호 재부여</button>`,
  // 공정번호 미입력 시 순번×10으로 자동 부여
  beforeSaveRow: (r, i) => { if (!r.process_no) r.process_no = String((i + 1) * 10); },
  cols: ({ processes, equipments, partners }) => [
    { key: 'process_no', label: '공정번호', width: '78px', align: 'center', placeholder: '10' },
    { key: 'process_code', label: '공정코드', type: 'select', width: '110px', placeholder: '선택', options: () => processes.map(p => ({ value: p.code, label: `${p.code} · ${p.name}` })) },
    { key: 'process_name', label: '공정명', width: '124px', placeholder: '예: 용접' },
    { key: 'process_type', label: '공정구분', type: 'select', options: ['가공', '검사', '이동', '보관', '외주', '조립', '포장', '재작업'], width: '92px', align: 'center' },
    { key: 'equipment', label: '설비', type: 'select', width: '130px', placeholder: '선택', options: () => equipments.map(e => ({ value: e.code, label: `${e.code} · ${e.name}` })) },
    { key: 'input_item', label: '투입품', width: '120px' },
    { key: 'output_item', label: '산출품', width: '120px' },
    { key: 'material_flow', label: '자재이동', width: '120px', placeholder: '예: 자재창고→가공라인' },
    { key: 'inspect_yn', label: '검사', type: 'check', width: '56px', align: 'center' },
    { key: 'outsource_yn', label: '외주', type: 'check', width: '56px', align: 'center' },
    { key: 'partner', label: '외주처', type: 'select', width: '120px', placeholder: '선택', options: () => partners.filter(p => p.biz_type === '외주가공처').map(p => p.name) },
    { key: 'rework_yn', label: '재작업', type: 'check', width: '62px', align: 'center' },
    { key: 'storage_yn', label: '보관', type: 'check', width: '56px', align: 'center' },
    { key: 'char_type', label: '특별특성', type: 'select', options: CHAR_TYPES, width: '96px', align: 'center' },
    { key: 'remark', label: '비고', width: '120px' },
  ],
  extraHeader: () => `<div class="flex" style="padding:10px 12px;background:var(--surface-2);border-radius:10px;gap:8px;margin-bottom:12px;font-size:12.5px">
    ${icon('route', 16)} <b>PFD는 4개 문서의 기준 문서입니다.</b> 공정번호는 10·20·30… 단위로 부여하며, PFMEA·관리계획서·작업표준서에서 <b>동일한 번호·공정명</b>을 사용해야 합니다.
    (미입력 시 저장할 때 순서대로 자동 부여)</div>`,
  wireExtra: (slot, grid, { processes, doc }) => {
    const rt = slot.querySelector('[data-load-routing]');
    if (rt) rt.onclick = async () => {
      const routes = await db.all('item_processes', { filters: { item_code: doc.item_code }, sort: 'seq' }).catch(() => []);
      if (!routes.length) { toast('해당 품목의 표준 라우팅이 없습니다. (기준정보 ▸ 제품별표준공정)', 'error'); return; }
      const rows = routes.map((r, i) => ({
        doc_no: doc.doc_no, seq: (i + 1) * 10, process_no: String((i + 1) * 10),
        process_code: r.process_code, process_name: r.process_name,
        process_type: r.in_out === '외주' ? '외주' : (String(r.process_name || '').includes('검사') ? '검사' : '가공'),
        equipment: r.equipment || '', outsource_yn: r.in_out === '외주',
        inspect_yn: String(r.process_name || '').includes('검사'),
      }));
      grid.setRows(rows);
      toast(`표준 라우팅에서 공정 ${routes.length}개를 불러왔습니다. [저장]을 눌러 반영하세요.`);
    };
    const rn = slot.querySelector('[data-renumber]');
    if (rn) rn.onclick = () => {
      const rows = grid.getRows().map((r, i) => ({ ...r, process_no: String((i + 1) * 10) }));
      grid.setRows(rows);
      toast('공정번호를 10 단위로 재부여했습니다. [저장]을 눌러 반영하세요.');
    };
  },
  print: async (d) => {
    const rows = await db.all('pfd_items', { filters: { doc_no: d.doc_no }, sort: 'seq' }).catch(() => []);
    printDoc('공정 흐름도 (PFD)', d, docHead(d),
      ['공정번호', '공정명', '공정구분', '설비', '투입품', '산출품', '자재이동', '검사', '외주', '재작업', '보관', '특별특성', '비고'].map(h => `<th>${h}</th>`).join(''),
      rows.map(r => `<tr><td>${r.process_no || ''}</td><td>${r.process_name || ''}</td><td>${r.process_type || ''}</td>
        <td>${r.equipment || ''}</td><td>${r.input_item || ''}</td><td>${r.output_item || ''}</td><td>${r.material_flow || ''}</td>
        <td>${r.inspect_yn ? '○' : ''}</td><td>${r.outsource_yn ? '○' : ''}</td><td>${r.rework_yn ? '○' : ''}</td><td>${r.storage_yn ? '○' : ''}</td>
        <td>${r.char_type && r.char_type !== '일반' ? r.char_type : ''}</td><td>${r.remark || ''}</td></tr>`).join('')
      || '<tr><td colspan="13" style="text-align:center;color:#888">항목 없음</td></tr>');
  },
});

// =====================================================================
// 6-2 PFMEA — PFD의 모든 공정을 동일 공정번호로 분석
// =====================================================================
export const pfmeaDocs = createDevDocPage({
  docType: 'PFMEA', docPrefix: 'FMEA', detailTable: 'pfmea_items', detailTitle: 'PFMEA 분석표',
  title: 'PFMEA', subtitle: 'PFD의 모든 공정에 대해 잠재적 고장형태·영향·원인을 분석하고 S·O·D로 위험도(RPN)를 산출합니다. 고위험·특별특성 항목은 관리계획서로 전개해야 합니다.',
  emptyText: 'PFMEA 항목이 없습니다',
  showProcess: false,
  rowDefaults: { severity: 1, occurrence: 1, detection: 1, char_type: '일반' },
  extraButtons: `<button class="btn btn--sm" data-load-pfd type="button">${icon('layers', 14)} PFD 공정 불러오기</button>
    <button class="btn btn--sm" data-check-pfd type="button">${icon('shield', 14)} PFD 공정 누락 점검</button>`,
  beforeSaveRow: (r) => {
    r.rpn = (Number(r.severity) || 1) * (Number(r.occurrence) || 1) * (Number(r.detection) || 1);
    if (r.after_sev || r.after_occ || r.after_det) r.after_rpn = (Number(r.after_sev) || 1) * (Number(r.after_occ) || 1) * (Number(r.after_det) || 1);
  },
  cols: ({ processes }) => [
    { key: 'process_no', label: '공정번호', width: '72px', align: 'center', placeholder: '10' },
    { key: 'process_name', label: '공정명', width: '104px', placeholder: 'PFD 공정명' },
    { key: 'func', label: '기능/요구사항', width: '116px' },
    { key: 'fail_mode', label: '잠재적 고장형태', width: '124px', placeholder: '예: 용접 누락' },
    { key: 'fail_effect', label: '잠재적 영향', width: '124px', placeholder: '예: 누설·조립 불가' },
    { key: 'severity', label: 'S', type: 'number', width: '48px', align: 'center' },
    { key: 'fail_cause', label: '잠재적 원인', width: '124px', placeholder: '예: 지그 위치 불량' },
    { key: 'occurrence', label: 'O', type: 'number', width: '48px', align: 'center' },
    { key: 'prevent_ctrl', label: '예방관리', width: '124px', placeholder: '예: 전용 지그·인터록' },
    { key: 'detect_ctrl', label: '검출관리', width: '124px', placeholder: '예: 비전검사' },
    { key: 'detection', label: 'D', type: 'number', width: '48px', align: 'center' },
    {
      key: 'rpn', label: 'RPN', width: '60px', align: 'center',
      calc: (r) => (Number(r.severity) || 1) * (Number(r.occurrence) || 1) * (Number(r.detection) || 1),
      tone: (r) => { const v = (Number(r.severity) || 1) * (Number(r.occurrence) || 1) * (Number(r.detection) || 1); return v >= 100 ? 'tone-danger' : v >= 60 ? 'tone-warning' : ''; },
    },
    { key: 'char_type', label: '특별특성', type: 'select', options: CHAR_TYPES, width: '92px', align: 'center' },
    { key: 'action_plan', label: '개선대책', width: '124px' },
    { key: 'action_owner', label: '담당', width: '72px' },
    { key: 'after_sev', label: '개선S', type: 'number', width: '54px', align: 'center' },
    { key: 'after_occ', label: '개선O', type: 'number', width: '54px', align: 'center' },
    { key: 'after_det', label: '개선D', type: 'number', width: '54px', align: 'center' },
    { key: 'after_rpn', label: '개선RPN', width: '66px', align: 'center', calc: (r) => (r.after_sev || r.after_occ || r.after_det) ? (Number(r.after_sev) || 1) * (Number(r.after_occ) || 1) * (Number(r.after_det) || 1) : '' },
  ],
  extraHeader: () => `<div class="flex" style="padding:10px 12px;background:var(--surface-2);border-radius:10px;gap:8px;margin-bottom:12px;font-size:12.5px">
    ${icon('alert', 16)} <b>RPN = S × O × D</b> (100 이상 빨강 · 60 이상 주황). PFD의 <b>모든 공정</b>이 분석되어야 하며,
    고위험(RPN 100↑)·특별특성 항목은 <b>관리계획서의 관리항목</b>으로 반드시 전개해야 합니다.</div>`,
  wireExtra: (slot, grid, { doc }) => {
    const load = slot.querySelector('[data-load-pfd]');
    if (load) load.onclick = async () => {
      const pfd = await latestDoc('PFD', doc.item_code);
      if (!pfd) { toast('해당 품목의 PFD 문서가 없습니다. PFD를 먼저 작성하세요.', 'error'); return; }
      const steps = await db.all('pfd_items', { filters: { doc_no: pfd.doc_no }, sort: 'seq' }).catch(() => []);
      if (!steps.length) { toast('PFD에 등록된 공정이 없습니다.', 'error'); return; }
      const cur = grid.getRows();
      const rows = [...cur];
      let added = 0;
      for (const s of steps) {
        if (cur.some(r => String(r.process_no || '') === String(s.process_no || ''))) continue;
        rows.push({
          doc_no: doc.doc_no, seq: (rows.length + 1) * 10,
          process_no: s.process_no, process_name: s.process_name, func: s.output_item || '',
          char_type: s.char_type || '일반', severity: 1, occurrence: 1, detection: 1,
        });
        added++;
      }
      if (!added) { toast('이미 모든 PFD 공정이 반영되어 있습니다.', 'error'); return; }
      grid.setRows(rows);
      toast(`PFD(${pfd.doc_no})에서 공정 ${added}개를 불러왔습니다. [저장]을 눌러 반영하세요.`);
    };
    const chk = slot.querySelector('[data-check-pfd]');
    if (chk) chk.onclick = async () => {
      const pfd = await latestDoc('PFD', doc.item_code);
      if (!pfd) { toast('해당 품목의 PFD 문서가 없습니다.', 'error'); return; }
      const steps = await db.all('pfd_items', { filters: { doc_no: pfd.doc_no }, sort: 'seq' }).catch(() => []);
      const cur = grid.getRows();
      const missing = steps.filter(s => !cur.some(r => String(r.process_no || '') === String(s.process_no || '')));
      const extra = cur.filter(r => r.process_no && !steps.some(s => String(s.process_no) === String(r.process_no)));
      const body = document.createElement('div');
      body.innerHTML = `<div class="muted" style="margin-bottom:10px">PFD <b>${escapeHtml(pfd.doc_no)}</b> 대비 공정 반영 상태</div>
        ${!missing.length && !extra.length ? `<div class="flex" style="padding:14px;background:var(--surface-2);border-radius:10px;gap:8px">${icon('checkCircle', 18)} <b>PFD의 모든 공정이 PFMEA에 반영되어 있습니다.</b></div>` : ''}
        ${missing.length ? `<div style="margin-bottom:12px"><div style="font-weight:700;color:var(--danger);margin-bottom:6px">${icon('alert', 15)} PFMEA에 누락된 공정 ${missing.length}건</div>
          <ul class="spec-list">${missing.map(s => `<li>${escapeHtml(s.process_no || '')} · ${escapeHtml(s.process_name || '')} (${escapeHtml(s.process_type || '')})</li>`).join('')}</ul></div>` : ''}
        ${extra.length ? `<div><div style="font-weight:700;color:var(--warning);margin-bottom:6px">${icon('alert', 15)} PFD에 없는 공정 ${extra.length}건</div>
          <ul class="spec-list">${extra.map(r => `<li>${escapeHtml(r.process_no || '')} · ${escapeHtml(r.process_name || '')}</li>`).join('')}</ul></div>` : ''}`;
      openModal({
        title: 'PFD 공정 누락 점검', body, wide: true,
        footer: `<button class="btn" data-cancel>닫기</button>${missing.length ? `<button class="btn btn--primary" data-ok>${icon('plus', 16)} 누락 공정 추가</button>` : ''}`,
        onMount: ({ footEl, close }) => {
          footEl.querySelector('[data-cancel]').onclick = close;
          footEl.querySelector('[data-ok]')?.addEventListener('click', () => {
            const rows = [...grid.getRows()];
            missing.forEach(s => rows.push({ doc_no: doc.doc_no, seq: (rows.length + 1) * 10, process_no: s.process_no, process_name: s.process_name, func: s.output_item || '', char_type: s.char_type || '일반', severity: 1, occurrence: 1, detection: 1 }));
            grid.setRows(rows); close(); toast(`${missing.length}개 공정을 추가했습니다. [저장]을 눌러 반영하세요.`);
          });
        },
      });
    };
  },
  print: async (d) => {
    const rows = await db.all('pfmea_items', { filters: { doc_no: d.doc_no }, sort: 'seq' }).catch(() => []);
    printDoc('공정 FMEA', d, docHead(d),
      ['공정번호', '공정명', '기능', '잠재적 고장형태', '잠재적 영향', 'S', '잠재적 원인', 'O', '예방관리', '검출관리', 'D', 'RPN', '특별특성', '개선대책', '담당', '개선RPN'].map(h => `<th>${h}</th>`).join(''),
      rows.map(r => `<tr><td>${r.process_no || ''}</td><td>${r.process_name || r.process || ''}</td><td>${r.func || ''}</td><td>${r.fail_mode || ''}</td><td>${r.fail_effect || ''}</td>
        <td>${r.severity || ''}</td><td>${r.fail_cause || ''}</td><td>${r.occurrence || ''}</td><td>${r.prevent_ctrl || ''}</td><td>${r.detect_ctrl || ''}</td>
        <td>${r.detection || ''}</td><td><b>${r.rpn || ''}</b></td><td>${r.char_type && r.char_type !== '일반' ? r.char_type : ''}</td>
        <td>${r.action_plan || ''}</td><td>${r.action_owner || ''}</td><td>${r.after_rpn || ''}</td></tr>`).join('')
      || '<tr><td colspan="16" style="text-align:center;color:#888">항목 없음</td></tr>');
  },
});

// =====================================================================
// 6-3 관리계획서 — PFMEA의 위험요소를 현장 관리항목으로 전개
// =====================================================================
export const controlPlans = createDevDocPage({
  docType: '관리계획서', docPrefix: 'CP', detailTable: 'control_plan_items', detailTitle: '관리항목',
  title: '관리계획서', subtitle: 'PFMEA에서 분석한 위험요소 중 현장에서 실제 관리할 항목과 기준·방법·주기·수량·이상 시 조치를 정의합니다.',
  emptyText: '관리항목이 없습니다',
  showProcess: false,
  rowDefaults: { char_kind: '제품특성', char_type: '일반', inspect_cycle: '1회/LOT' },
  extraButtons: `<button class="btn btn--sm" data-load-pfd type="button">${icon('layers', 14)} PFD·PFMEA 불러오기</button>
    <button class="btn btn--sm" data-check-fmea type="button">${icon('shield', 14)} 고위험 반영 점검</button>`,
  cols: ({ processes, instruments, equipments, users }) => [
    { key: 'process_no', label: '공정번호', width: '72px', align: 'center', placeholder: '10' },
    { key: 'process_name', label: '공정명', width: '104px' },
    { key: 'char_kind', label: '특성구분', type: 'select', options: ['제품특성', '공정특성'], width: '90px', align: 'center' },
    { key: 'ctrl_item', label: '관리항목', width: '140px', placeholder: '예: 용접 위치' },
    { key: 'char_type', label: '특별특성', type: 'select', options: CHAR_TYPES, width: '92px', align: 'center' },
    { key: 'spec_value', label: '관리기준/규격', width: '124px', placeholder: '도면 기준 ±1mm' },
    { key: 'ctrl_method', label: '관리방법', width: '124px', placeholder: '전용 게이지 / SPC' },
    { key: 'instrument', label: '측정장비', type: 'select', width: '130px', placeholder: '선택', options: () => instruments.map(i => ({ value: i.code, label: `${i.code} · ${i.name}` })) },
    { key: 'equipment', label: '설비/치공구', type: 'select', width: '124px', placeholder: '선택', options: () => equipments.map(e => ({ value: e.code, label: `${e.code} · ${e.name}` })) },
    { key: 'inspect_cycle', label: '검사주기', type: 'select', width: '112px', options: INSPECT_CYCLES },
    { key: 'inspect_qty', label: '검사수량', width: '78px', placeholder: '3ea / 전수' },
    { key: 'owner', label: '담당자', type: 'select', width: '96px', placeholder: '선택', options: () => users.map(u => u.name) },
    { key: 'reaction_plan', label: '이상 시 조치', type: 'select', width: '150px', placeholder: '선택', options: REACTION_PLANS },
    { key: 'fmea_ref', label: '근거 PFMEA', width: '124px', placeholder: '고장형태' },
    { key: 'remark', label: '비고', width: '110px' },
  ],
  extraHeader: () => `<div class="flex" style="padding:10px 12px;background:var(--surface-2);border-radius:10px;gap:8px;margin-bottom:12px;font-size:12.5px">
    ${icon('shield', 16)} PFMEA의 <b>고위험(RPN 100↑)·특별특성</b> 항목은 반드시 관리항목으로 전개되어야 합니다.
    검사주기·특별특성 표시는 <b>작업표준서와 동일</b>해야 하며, 측정장비는 계측기관리에 등록된 것만 지정합니다.</div>`,
  wireExtra: (slot, grid, { doc }) => {
    const load = slot.querySelector('[data-load-pfd]');
    if (load) load.onclick = async () => {
      const [pfd, fmea] = await Promise.all([latestDoc('PFD', doc.item_code), latestDoc('PFMEA', doc.item_code)]);
      const rows = [...grid.getRows()];
      let added = 0;
      if (pfd) {
        const steps = await db.all('pfd_items', { filters: { doc_no: pfd.doc_no }, sort: 'seq' }).catch(() => []);
        for (const s of steps) {
          if (rows.some(r => String(r.process_no) === String(s.process_no))) continue;
          rows.push({ doc_no: doc.doc_no, seq: (rows.length + 1) * 10, process_no: s.process_no, process_name: s.process_name, char_kind: '공정특성', char_type: s.char_type || '일반', inspect_cycle: '1회/LOT' });
          added++;
        }
      }
      if (fmea) {
        const fitems = await db.all('pfmea_items', { filters: { doc_no: fmea.doc_no }, sort: 'seq' }).catch(() => []);
        // 고위험(RPN 100↑) 또는 특별/중요특성 항목을 관리항목으로 전개
        const targets = fitems.filter(f => (Number(f.rpn) || 0) >= 100 || (f.char_type && f.char_type !== '일반'));
        for (const f of targets) {
          const item = f.fail_mode ? `${f.fail_mode} 여부` : (f.func || '');
          if (rows.some(r => String(r.process_no) === String(f.process_no) && r.ctrl_item === item)) continue;
          rows.push({
            doc_no: doc.doc_no, seq: (rows.length + 1) * 10,
            process_no: f.process_no, process_name: f.process_name || f.process,
            char_kind: '제품특성', ctrl_item: item, char_type: f.char_type || '일반',
            ctrl_method: f.detect_ctrl || '', inspect_cycle: (Number(f.rpn) || 0) >= 100 ? '전수' : '초·중·종물',
            reaction_plan: '설비정지 후 보고', fmea_ref: f.fail_mode || '',
          });
          added++;
        }
      }
      if (!added) { toast('불러올 항목이 없습니다. PFD 또는 PFMEA를 먼저 작성하세요.', 'error'); return; }
      grid.setRows(rows);
      toast(`${added}개 항목을 불러왔습니다. (PFMEA 고위험·특별특성 포함) [저장]을 눌러 반영하세요.`);
    };
    const chk = slot.querySelector('[data-check-fmea]');
    if (chk) chk.onclick = async () => {
      const fmea = await latestDoc('PFMEA', doc.item_code);
      if (!fmea) { toast('해당 품목의 PFMEA 문서가 없습니다.', 'error'); return; }
      const fitems = await db.all('pfmea_items', { filters: { doc_no: fmea.doc_no }, sort: 'seq' }).catch(() => []);
      const cur = grid.getRows();
      const targets = fitems.filter(f => (Number(f.rpn) || 0) >= 100 || (f.char_type && f.char_type !== '일반'));
      const missing = targets.filter(f => !cur.some(r => String(r.process_no) === String(f.process_no)
        && (r.fmea_ref === f.fail_mode || String(r.ctrl_item || '').includes(String(f.fail_mode || '__none__')))));
      const body = document.createElement('div');
      body.innerHTML = `<div class="muted" style="margin-bottom:10px">PFMEA <b>${escapeHtml(fmea.doc_no)}</b>의 고위험(RPN 100↑)·특별특성 항목 ${targets.length}건 기준</div>
        ${!missing.length ? `<div class="flex" style="padding:14px;background:var(--surface-2);border-radius:10px;gap:8px">${icon('checkCircle', 18)} <b>고위험·특별특성 항목이 모두 관리계획서에 반영되어 있습니다.</b></div>`
          : `<div style="font-weight:700;color:var(--danger);margin-bottom:8px">${icon('alert', 15)} 관리계획서에 미반영된 항목 ${missing.length}건</div>
            <div class="table-wrap"><table class="grid"><thead><tr><th>공정</th><th>고장형태</th><th class="num">RPN</th><th class="center">특별특성</th><th>검출관리</th></tr></thead>
            <tbody>${missing.map(f => `<tr><td>${escapeHtml(f.process_no || '')} ${escapeHtml(f.process_name || f.process || '')}</td>
              <td class="cell-strong">${escapeHtml(f.fail_mode || '')}</td>
              <td class="num mono" style="color:${(Number(f.rpn) || 0) >= 100 ? 'var(--danger)' : ''};font-weight:700">${f.rpn || ''}</td>
              <td class="center">${f.char_type && f.char_type !== '일반' ? badge(f.char_type) : '-'}</td>
              <td>${escapeHtml(f.detect_ctrl || '')}</td></tr>`).join('')}</tbody></table></div>`}`;
      openModal({
        title: 'PFMEA 고위험 항목 반영 점검', body, wide: true,
        footer: `<button class="btn" data-cancel>닫기</button>${missing.length ? `<button class="btn btn--primary" data-ok>${icon('plus', 16)} 관리항목으로 추가</button>` : ''}`,
        onMount: ({ footEl, close }) => {
          footEl.querySelector('[data-cancel]').onclick = close;
          footEl.querySelector('[data-ok]')?.addEventListener('click', () => {
            const rows = [...grid.getRows()];
            missing.forEach(f => rows.push({
              doc_no: doc.doc_no, seq: (rows.length + 1) * 10, process_no: f.process_no, process_name: f.process_name || f.process,
              char_kind: '제품특성', ctrl_item: `${f.fail_mode || ''} 여부`, char_type: f.char_type || '일반',
              ctrl_method: f.detect_ctrl || '', inspect_cycle: (Number(f.rpn) || 0) >= 100 ? '전수' : '초·중·종물',
              reaction_plan: '설비정지 후 보고', fmea_ref: f.fail_mode || '',
            }));
            grid.setRows(rows); close(); toast(`${missing.length}개 관리항목을 추가했습니다. [저장]을 눌러 반영하세요.`);
          });
        },
      });
    };
  },
  print: async (d) => {
    const rows = await db.all('control_plan_items', { filters: { doc_no: d.doc_no }, sort: 'seq' }).catch(() => []);
    printDoc('관 리 계 획 서', d, docHead(d),
      ['공정번호', '공정명', '특성구분', '관리항목', '특별특성', '관리기준/규격', '관리방법', '측정장비', '설비', '검사주기', '검사수량', '담당자', '이상 시 조치'].map(h => `<th>${h}</th>`).join(''),
      rows.map(r => `<tr><td>${r.process_no || ''}</td><td>${r.process_name || r.process || ''}</td><td>${r.char_kind || ''}</td>
        <td>${r.ctrl_item || ''}</td><td>${r.char_type && r.char_type !== '일반' ? r.char_type : ''}</td><td>${r.spec_value || ''}</td>
        <td>${r.ctrl_method || ''}</td><td>${r.instrument || ''}</td><td>${r.equipment || ''}</td>
        <td>${r.inspect_cycle || ''}</td><td>${r.inspect_qty || ''}</td><td>${r.owner || ''}</td><td>${r.reaction_plan || ''}</td></tr>`).join('')
      || '<tr><td colspan="13" style="text-align:center;color:#888">항목 없음</td></tr>');
  },
});

// =====================================================================
// 6-4 작업표준서 — 관리계획서의 관리기준을 현장 실행 방법으로 구체화
// =====================================================================
export const workStandards = createDevDocPage({
  docType: '작업표준서', docPrefix: 'WS', detailTable: 'work_std_steps', detailTitle: '작업단계',
  title: '작업표준서', subtitle: '관리계획서에서 정한 관리사항을 작업자가 실제로 수행할 수 있는 방법으로 작성합니다. 승인된 최신본만 현장(POP)에 표시됩니다.',
  emptyText: '작업단계가 없습니다',
  showProcess: true,
  extraButtons: `<button class="btn btn--sm" data-load-cp type="button">${icon('layers', 14)} 관리계획서 불러오기</button>
    <button class="btn btn--sm" data-check-cp type="button">${icon('shield', 14)} 관리계획서 일치 점검</button>`,
  cols: () => [
    { key: 'process_no', label: '공정번호', width: '72px', align: 'center', placeholder: '10' },
    { key: 'process_name', label: '공정명', width: '96px' },
    { key: 'step_name', label: '작업순서/단계', width: '132px', placeholder: '예: 1. 부품 장착' },
    { key: 'material_setup', label: '자재 장착 방법', type: 'textarea', width: '150px', placeholder: '지그에 정확히 안착 후 클램프 고정' },
    { key: 'equipment_op', label: '설비 조작 방법', type: 'textarea', width: '150px', placeholder: '조건 확인 후 양손 시작버튼' },
    { key: 'condition', label: '작업조건', width: '130px', placeholder: '전류 110A, 전압 14V' },
    { key: 'tools_used', label: '사용 공구/치공구', width: '120px' },
    { key: 'quality_check', label: '품질 확인 방법', type: 'textarea', width: '160px', placeholder: '게이지 영점→측정 위치→기록' },
    { key: 'inspect_cycle', label: '검사주기', type: 'select', width: '110px', options: INSPECT_CYCLES },
    { key: 'safety', label: '안전수칙', type: 'textarea', width: '140px', placeholder: '보안경 착용, 클램프 작동 시 손 주의' },
    { key: 'reaction', label: '이상 시 조치', type: 'select', width: '146px', placeholder: '선택', options: REACTION_PLANS },
    { key: 'ok_sample_url', label: '양품 예시 URL', width: '120px' },
    { key: 'ng_sample_url', label: '불량 예시 URL', width: '120px' },
    { key: 'photo_url', label: '작업사진 URL', width: '120px' },
    { key: 'cp_ref', label: '근거 관리항목', width: '124px' },
  ],
  extraHeader: (d) => `<div class="flex" style="padding:10px 12px;background:var(--surface-2);border-radius:10px;gap:8px;margin-bottom:12px;font-size:12.5px">
    ${icon('monitor', 16)} ${d.status === '승인' ? '<b>승인본</b>이므로 현장 키오스크(POP)에 표시됩니다.' : '승인 후 현장 키오스크(POP)에 표시됩니다.'}
    관리계획서의 <b>관리항목·검사주기·이상 시 조치</b>가 동일하게 반영되어야 하며, 양품·불량 판정 예시 사진을 등록하면 현장에서 함께 표시됩니다.</div>`,
  wireExtra: (slot, grid, { doc }) => {
    const load = slot.querySelector('[data-load-cp]');
    if (load) load.onclick = async () => {
      const cp = await latestDoc('관리계획서', doc.item_code);
      if (!cp) { toast('해당 품목의 관리계획서가 없습니다.', 'error'); return; }
      let citems = await db.all('control_plan_items', { filters: { doc_no: cp.doc_no }, sort: 'seq' }).catch(() => []);
      if (doc.process) citems = citems.filter(c => (c.process_name || c.process) === doc.process);
      if (!citems.length) { toast('불러올 관리항목이 없습니다.', 'error'); return; }
      const rows = [...grid.getRows()];
      let added = 0;
      citems.forEach(c => {
        if (rows.some(r => r.cp_ref === c.ctrl_item && String(r.process_no) === String(c.process_no))) return;
        rows.push({
          doc_no: doc.doc_no, seq: (rows.length + 1) * 10,
          process_no: c.process_no, process_name: c.process_name || c.process,
          step_name: `${c.ctrl_item || ''} 확인`,
          quality_check: `${c.ctrl_item || ''} ${c.spec_value || ''} — ${c.ctrl_method || ''} (${c.instrument || '육안'}) ${c.inspect_qty ? `${c.inspect_qty}` : ''}`,
          inspect_cycle: c.inspect_cycle || '', reaction: c.reaction_plan || '', cp_ref: c.ctrl_item || '',
        });
        added++;
      });
      if (!added) { toast('이미 모든 관리항목이 반영되어 있습니다.', 'error'); return; }
      grid.setRows(rows);
      toast(`관리계획서에서 ${added}개 항목을 불러왔습니다. [저장]을 눌러 반영하세요.`);
    };
    const chk = slot.querySelector('[data-check-cp]');
    if (chk) chk.onclick = async () => {
      const cp = await latestDoc('관리계획서', doc.item_code);
      if (!cp) { toast('해당 품목의 관리계획서가 없습니다.', 'error'); return; }
      let citems = await db.all('control_plan_items', { filters: { doc_no: cp.doc_no }, sort: 'seq' }).catch(() => []);
      if (doc.process) citems = citems.filter(c => (c.process_name || c.process) === doc.process);
      const cur = grid.getRows();
      const missing = citems.filter(c => !findWsRow(cur, c));
      // 검사주기 불일치
      const mismatch = [];
      for (const c of citems) {
        const r = findWsRow(cur, c);
        if (r && c.inspect_cycle && r.inspect_cycle && r.inspect_cycle !== c.inspect_cycle) {
          mismatch.push({ item: c.ctrl_item, cp: c.inspect_cycle, ws: r.inspect_cycle, row: r });
        }
      }
      const body = document.createElement('div');
      body.innerHTML = `<div class="muted" style="margin-bottom:10px">관리계획서 <b>${escapeHtml(cp.doc_no)}</b> (Rev.${escapeHtml(cp.rev || 'A')}) 대비 반영 상태</div>
        ${!missing.length && !mismatch.length ? `<div class="flex" style="padding:14px;background:var(--surface-2);border-radius:10px;gap:8px">${icon('checkCircle', 18)} <b>관리항목과 검사주기가 모두 일치합니다.</b></div>` : ''}
        ${missing.length ? `<div style="margin-bottom:12px"><div style="font-weight:700;color:var(--danger);margin-bottom:6px">${icon('alert', 15)} 작업표준서에 미반영된 관리항목 ${missing.length}건</div>
          <ul class="spec-list">${missing.map(c => `<li>${escapeHtml(c.process_no || '')} · <b>${escapeHtml(c.ctrl_item || '')}</b> (${escapeHtml(c.spec_value || '')}, ${escapeHtml(c.inspect_cycle || '')})</li>`).join('')}</ul></div>` : ''}
        ${mismatch.length ? `<div><div style="font-weight:700;color:var(--warning);margin-bottom:6px">${icon('alert', 15)} 검사주기 불일치 ${mismatch.length}건</div>
          <div class="table-wrap"><table class="grid"><thead><tr><th>관리항목</th><th>관리계획서</th><th>작업표준서</th></tr></thead>
          <tbody>${mismatch.map(m => `<tr><td class="cell-strong">${escapeHtml(m.item)}</td><td>${escapeHtml(m.cp)}</td>
            <td style="color:var(--danger);font-weight:700">${escapeHtml(m.ws)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
      openModal({
        title: '관리계획서 일치 점검', body, wide: true,
        footer: `<button class="btn" data-cancel>닫기</button>${(missing.length || mismatch.length) ? `<button class="btn btn--primary" data-ok>${icon('check', 16)} 자동 반영</button>` : ''}`,
        onMount: ({ footEl, close }) => {
          footEl.querySelector('[data-cancel]').onclick = close;
          footEl.querySelector('[data-ok]')?.addEventListener('click', () => {
            const rows = [...grid.getRows()];
            missing.forEach(c => rows.push({
              doc_no: doc.doc_no, seq: (rows.length + 1) * 10, process_no: c.process_no, process_name: c.process_name || c.process,
              step_name: `${c.ctrl_item || ''} 확인`,
              quality_check: `${c.ctrl_item || ''} ${c.spec_value || ''} — ${c.ctrl_method || ''} (${c.instrument || '육안'})`,
              inspect_cycle: c.inspect_cycle || '', reaction: c.reaction_plan || '', cp_ref: c.ctrl_item || '',
            }));
            // 검사주기 동기화
            mismatch.forEach(m => { const r = rows.find(x => x === m.row) || rows.find(x => x.cp_ref === m.item); if (r) { r.inspect_cycle = m.cp; r.cp_ref = m.item; } });
            grid.setRows(rows); close();
            toast(`미반영 ${missing.length}건 추가 · 검사주기 ${mismatch.length}건 동기화. [저장]을 눌러 반영하세요.`);
          });
        },
      });
    };
  },
  print: async (d) => {
    const rows = await db.all('work_std_steps', { filters: { doc_no: d.doc_no }, sort: 'seq' }).catch(() => []);
    printDoc('작 업 표 준 서', d, docHead(d, `<tr><th>공정</th><td colspan="5">${d.process || '전체'}</td></tr>`),
      ['공정번호', '작업순서', '자재 장착', '설비 조작', '작업조건', '사용공구', '품질 확인', '검사주기', '안전수칙', '이상 시 조치'].map(h => `<th>${h}</th>`).join(''),
      rows.map(r => `<tr><td>${r.process_no || ''}</td><td>${r.step_name || ''}</td>
        <td>${(r.material_setup || '').replace(/\n/g, '<br>')}</td><td>${(r.equipment_op || r.method || '').replace(/\n/g, '<br>')}</td>
        <td>${r.condition || ''}</td><td>${r.tools_used || ''}</td>
        <td>${(r.quality_check || '').replace(/\n/g, '<br>')}</td><td>${r.inspect_cycle || ''}</td>
        <td>${(r.safety || r.caution || '').replace(/\n/g, '<br>')}</td><td>${r.reaction || ''}</td></tr>`).join('')
      || '<tr><td colspan="10" style="text-align:center;color:#888">항목 없음</td></tr>');
  },
});
