// 도면관리 (회의록 260814 개발 3.3~3.6·3.8)
//  · 좌: 품목 리스트(자동 연동) / 우: 도면 4종(단품도·조립도·단조도·공구도)
//  · 제품당 도면 등록, 개정(Rev) 시 하단에 변경 이력 누적
//  · PDF 업로드(파일 선택 + 드래그앤드롭) / URL 링크, POP 도면보기 연계
import { db } from '../lib/db.js';
import { escapeHtml, fmtDate, todayStr } from '../lib/format.js';
import { badge, toast, openModal, confirmDialog } from '../ui/components.js';
import { icon } from '../ui/icons.js';

const DRAWING_TYPES = ['단품도', '조립도', '단조도', '공구도'];
const MAX_FILE_MB = 5;

// data URL / 일반 URL 모두 새 탭으로 열기 (data URL은 blob 변환)
export async function openDrawingFile(url) {
  if (!url) { toast('등록된 파일이 없습니다.', 'error'); return; }
  try {
    if (url.startsWith('data:')) {
      const blob = await (await fetch(url)).blob();
      const obj = URL.createObjectURL(blob);
      window.open(obj, '_blank');
      setTimeout(() => URL.revokeObjectURL(obj), 60000);
    } else { window.open(url, '_blank', 'noopener'); }
  } catch { toast('파일을 열 수 없습니다.', 'error'); }
}

// 품목별 최신(개정 최고) 도면 유형별 1건 반환
function latestByType(list) {
  const map = {};
  for (const d of list) {
    const t = d.drawing_type || '단품도';
    if (!map[t] || String(d.rev || '').localeCompare(String(map[t].rev || '')) > 0) map[t] = d;
  }
  return map;
}

// POP 등 외부에서 호출 — 해당 품목의 현행 도면을 팝업으로 표시
export async function openDrawingViewer(itemCode, itemName) {
  let list = [];
  try { list = await db.all('drawings', { filters: { item_code: itemCode } }); } catch { list = []; }
  const cur = latestByType(list.filter(d => d.use_yn !== false));
  const body = document.createElement('div');
  const rows = DRAWING_TYPES.map(t => {
    const d = cur[t];
    return `<div class="flex between" style="padding:10px 13px;background:var(--surface-2);border-radius:9px;margin-bottom:7px">
      <span class="flex" style="gap:8px">${icon('fileText', 15)} <b>${escapeHtml(t)}</b>${d ? `<span class="cell-code">${escapeHtml(d.drawing_no || '')}</span> ${badge('Rev.' + (d.rev || 'A'), 'brand')}` : '<span class="muted">미등록</span>'}</span>
      ${d && d.file_url ? `<button class="btn btn--sm btn--primary" data-open="${escapeHtml(d.file_url)}">${icon('search', 13)} 도면 보기</button>` : '<span class="muted">파일 없음</span>'}</div>`;
  }).join('');
  body.innerHTML = `<div class="muted" style="margin-bottom:10px">${escapeHtml(itemCode)} · ${escapeHtml(itemName || '')}</div>${rows}`;
  openModal({
    title: '도면 보기', body,
    footer: `<button class="btn" data-cancel>닫기</button>`,
    onMount: ({ footEl, close }) => {
      footEl.querySelector('[data-cancel]').onclick = close;
      body.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openDrawingFile(b.dataset.open));
    },
  });
}

export async function drawingManager(root) {
  const state = { search: '', selItem: null, items: [], drawings: [], users: [] };
  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>도면관리</h1><p>좌측 품목을 선택하면 우측에 도면(단품도·조립도·단조도·공구도)이 표시됩니다. 개정 시 이력이 누적됩니다.</p></div>
      <div class="page-head__actions"><button class="btn" id="dw-refresh">${icon('refresh', 16)} 새로고침</button></div>
    </div>
    <div class="spec-md" style="display:grid;grid-template-columns:320px 1fr;gap:16px;align-items:start">
      <div class="card"><div class="card__head">${icon('package', 18)}<h3>품목</h3></div>
        <div class="toolbar"><div class="search-box grow">${icon('search', 16)}<input id="dw-search" placeholder="품목코드·품명 검색" autocomplete="off"/></div></div>
        <div id="dw-items" style="max-height:640px;overflow:auto"></div></div>
      <div id="dw-detail"></div>
    </div>`;
  root.querySelector('#dw-refresh').onclick = load;
  root.querySelector('#dw-search').addEventListener('input', (e) => { state.search = e.target.value.trim().toLowerCase(); renderItems(); });

  async function load() {
    try {
      [state.items, state.drawings, state.users] = await Promise.all([
        db.all('items', { sort: 'code' }).catch(() => []),
        db.all('drawings', {}).catch(() => []),
        db.all('users', { sort: 'name' }).catch(() => []),
      ]);
      if (state.selItem) state.selItem = state.items.find(i => i.code === state.selItem.code) || null;
      renderItems(); renderDetail();
    } catch (e) { root.querySelector('#dw-detail').innerHTML = `<div class="empty">${icon('alert', 42)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
  }
  function drawingsOf(code) { return state.drawings.filter(d => d.item_code === code); }
  function renderItems() {
    const q = state.search;
    const list = state.items.filter(i => !q || [i.code, i.name].some(v => String(v ?? '').toLowerCase().includes(q)));
    const slot = root.querySelector('#dw-items');
    slot.innerHTML = list.map(i => {
      const cnt = drawingsOf(i.code).length;
      return `<button class="spec-li ${state.selItem?.code === i.code ? 'is-selected' : ''}" data-code="${escapeHtml(i.code)}"
        style="display:block;width:100%;text-align:left;padding:10px 13px;border:0;border-bottom:1px solid var(--border);background:${state.selItem?.code === i.code ? 'var(--brand-50)' : 'transparent'};cursor:pointer">
        <div class="flex between"><span class="cell-code">${escapeHtml(i.code)}</span>${cnt ? `<span class="badge badge--brand">${cnt}</span>` : ''}</div>
        <div style="font-weight:600;margin-top:2px">${escapeHtml(i.name || '')}</div></button>`;
    }).join('') || `<div class="empty" style="padding:30px">${icon('inbox', 36)}<p>품목이 없습니다</p></div>`;
    slot.querySelectorAll('[data-code]').forEach(b => b.onclick = () => { state.selItem = state.items.find(i => i.code === b.dataset.code); renderItems(); renderDetail(); });
  }
  function renderDetail() {
    const slot = root.querySelector('#dw-detail');
    const it = state.selItem;
    if (!it) { slot.innerHTML = `<div class="card"><div class="card__body"><div class="empty" style="padding:60px">${icon('fileText', 46)}<h4>좌측에서 품목을 선택하세요</h4></div></div></div>`; return; }
    const list = drawingsOf(it.code);
    const cur = latestByType(list.filter(d => d.use_yn !== false));
    slot.innerHTML = `<div class="card">
      <div class="card__head">
        <div><div class="flex" style="gap:8px"><span class="cell-code" style="font-size:14px">${escapeHtml(it.code)}</span>${it.car_model ? badge('차종 ' + it.car_model, 'violet') : ''}${it.customer_part_no ? `<span class="badge badge--neutral">고객품번 ${escapeHtml(it.customer_part_no)}</span>` : ''}</div>
          <h3 style="margin-top:4px">${escapeHtml(it.name || '')}</h3></div>
        <div class="spacer"></div>
        <button class="btn btn--primary btn--sm" id="dw-add">${icon('plus', 14)} 도면 등록/개정</button>
      </div>
      <div class="card__body">
        <div class="grid-2" style="gap:12px;margin-bottom:18px">
          ${DRAWING_TYPES.map(t => {
      const d = cur[t];
      return `<div style="border:1px solid var(--border);border-radius:12px;padding:14px 16px;${d ? '' : 'opacity:.7'}">
            <div class="flex between" style="margin-bottom:8px"><b>${escapeHtml(t)}</b>${d ? badge('Rev.' + (d.rev || 'A'), 'brand') : badge('미등록', 'neutral')}</div>
            ${d ? `<div class="cell-code" style="margin-bottom:4px">${escapeHtml(d.drawing_no || '')}</div>
              <div class="muted" style="font-size:12.5px;margin-bottom:10px">${escapeHtml(d.title || '')} · ${escapeHtml(d.writer || '')} · ${fmtDate(d.reg_date) || ''}</div>
              <div class="flex" style="gap:6px">${d.file_url ? `<button class="btn btn--sm btn--primary" data-open="${escapeHtml(d.file_url)}">${icon('search', 13)} 도면 보기</button>` : '<span class="muted">파일 없음</span>'}
                <button class="btn btn--sm" data-revise="${escapeHtml(t)}">${icon('refresh', 13)} 개정</button></div>`
          : `<button class="btn btn--sm" data-newtype="${escapeHtml(t)}">${icon('plus', 13)} 등록</button>`}
          </div>`;
    }).join('')}
        </div>
        <h4 style="margin:0 0 10px;font-size:13.5px">개정 이력 <span class="muted" style="font-weight:500">${list.length}건</span></h4>
        ${list.length ? `<div class="table-wrap"><table class="grid">
          <thead><tr><th>도면유형</th><th>도면번호</th><th class="center">Rev</th><th>도면명</th><th>작성자</th><th class="center">등록일</th><th class="center">파일</th><th class="center">사용</th><th class="center" style="width:60px">관리</th></tr></thead>
          <tbody>${list.sort((a, b) => (a.drawing_type || '').localeCompare(b.drawing_type || '') || String(b.rev || '').localeCompare(String(a.rev || ''))).map(d => `<tr>
            <td>${escapeHtml(d.drawing_type || '단품도')}</td><td class="cell-code">${escapeHtml(d.drawing_no || '')}</td>
            <td class="center">${badge('Rev.' + (d.rev || 'A'), 'brand')}</td><td>${escapeHtml(d.title || '')}</td><td>${escapeHtml(d.writer || '')}</td>
            <td class="center">${fmtDate(d.reg_date) || '-'}</td>
            <td class="center">${d.file_url ? `<button class="icon-btn" data-open="${escapeHtml(d.file_url)}" title="열기">${icon('search', 14)}</button>` : '-'}</td>
            <td class="center">${d.use_yn === false ? badge('폐지', 'neutral') : badge('사용', 'success')}</td>
            <td class="center"><button class="icon-btn" data-del="${d.id}" title="삭제">${icon('trash', 14)}</button></td>
          </tr>`).join('')}</tbody></table></div>` : `<div class="muted" style="padding:14px">등록된 도면이 없습니다. 상단에서 도면을 등록하세요.</div>`}
      </div></div>`;
    slot.querySelector('#dw-add').onclick = () => openForm(it, null, null);
    slot.querySelectorAll('[data-newtype]').forEach(b => b.onclick = () => openForm(it, b.dataset.newtype, null));
    slot.querySelectorAll('[data-revise]').forEach(b => b.onclick = () => openForm(it, b.dataset.revise, cur[b.dataset.revise]));
    slot.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openDrawingFile(b.dataset.open));
    slot.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const d = list.find(x => x.id === b.dataset.del);
      if (!(await confirmDialog({ message: `도면 [${d.drawing_no}] Rev.${d.rev || 'A'}을 삭제하시겠습니까?`, confirmText: '삭제' }))) return;
      try { await db.remove('drawings', d.id); toast('삭제되었습니다.'); load(); } catch (e) { toast(e.message || '삭제 실패', 'error'); }
    });
  }
  // 다음 개정 문자 (A→B→C…)
  function nextRev(r) { const c = String(r || 'A').trim().toUpperCase(); return c && c.length === 1 && c >= 'A' && c < 'Z' ? String.fromCharCode(c.charCodeAt(0) + 1) : 'A'; }
  function openForm(it, type, base) {
    const isRevise = !!base;
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field col-2"><label>품목</label><input class="input" value="${escapeHtml(it.code)} · ${escapeHtml(it.name || '')}${it.car_model ? ' · 차종 ' + escapeHtml(it.car_model) : ''}" readonly></div>
      <div class="field"><label>도면 유형 <span class="req">*</span></label><select class="select" name="drawing_type">${DRAWING_TYPES.map(t => `<option value="${t}" ${(type || base?.drawing_type) === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label>개정(Rev) <span class="req">*</span></label><input class="input" name="rev" value="${isRevise ? escapeHtml(nextRev(base.rev)) : 'A'}"></div>
      <div class="field"><label>도면번호 <span class="req">*</span></label><input class="input" name="drawing_no" value="${escapeHtml(base?.drawing_no || '')}" placeholder="예: DWG-P1001-A"></div>
      <div class="field"><label>도면명</label><input class="input" name="title" value="${escapeHtml(base?.title || '')}"></div>
      <div class="field"><label>작성자</label><select class="select" name="writer"><option value="">선택</option>${state.users.map(u => `<option value="${escapeHtml(u.name)}" ${base?.writer === u.name ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select></div>
      <div class="field"><label>등록일</label><input class="input" type="date" name="reg_date" value="${todayStr()}"></div>
      <div class="field col-2"><label>도면 파일 (PDF 등)</label>
        <div id="dw-drop" style="border:2px dashed var(--border);border-radius:12px;padding:18px;text-align:center;cursor:pointer;background:var(--surface-2)">
          ${icon('upload', 24)}<div style="margin-top:6px;font-size:13px">파일을 여기에 끌어다 놓거나 <b style="color:var(--brand)">클릭하여 선택</b> (최대 ${MAX_FILE_MB}MB)</div>
          <div class="muted" id="dw-fname" style="margin-top:6px;font-size:12px">${base?.file_url ? '기존 파일 유지' : '선택된 파일 없음'}</div>
        </div>
        <input type="file" id="dw-file" accept="application/pdf,image/*" style="display:none">
        <input type="hidden" name="file_url" value="${escapeHtml(base?.file_url || '')}">
        <input class="input" name="file_link" style="margin-top:8px" placeholder="또는 파일 URL 직접 입력(스토리지 링크)" value="${base && !String(base.file_url || '').startsWith('data:') ? escapeHtml(base.file_url || '') : ''}"></div>
      <div class="field col-2"><label>비고</label><textarea class="textarea" name="remark">${escapeHtml(base?.remark || '')}</textarea></div>
      ${isRevise ? `<div class="field col-2 muted" style="background:var(--surface-2);padding:9px 12px;border-radius:10px">${icon('refresh', 14)} 개정 등록 시 기존 Rev.${escapeHtml(base.rev || 'A')}은 이력으로 보존되고 새 개정본이 현행이 됩니다.</div>` : ''}`;
    // 드래그앤드롭 + 파일선택 → data URL
    const drop = body.querySelector('#dw-drop'); const fileInput = body.querySelector('#dw-file');
    const fname = body.querySelector('#dw-fname');
    const readFile = (f) => {
      if (!f) return;
      if (f.size > MAX_FILE_MB * 1024 * 1024) { toast(`파일이 너무 큽니다 (최대 ${MAX_FILE_MB}MB). URL 링크를 사용하세요.`, 'error'); return; }
      const r = new FileReader();
      r.onload = () => { body.querySelector('[name="file_url"]').value = r.result; fname.textContent = `${f.name} (${Math.round(f.size / 1024)} KB)`; body.querySelector('[name="file_link"]').value = ''; };
      r.readAsDataURL(f);
    };
    drop.onclick = () => fileInput.click();
    fileInput.onchange = () => readFile(fileInput.files[0]);
    drop.ondragover = (e) => { e.preventDefault(); drop.style.borderColor = 'var(--brand)'; };
    drop.ondragleave = () => { drop.style.borderColor = 'var(--border)'; };
    drop.ondrop = (e) => { e.preventDefault(); drop.style.borderColor = 'var(--border)'; readFile(e.dataTransfer.files[0]); };
    openModal({
      title: isRevise ? `도면 개정 — ${it.name}` : `도면 등록 — ${it.name}`, body, wide: true,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 저장</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => body.querySelector(`[name="${n}"]`).value.trim();
          if (!g('drawing_no')) { toast('도면번호를 입력하세요.', 'error'); return; }
          const fileUrl = body.querySelector('[name="file_url"]').value || g('file_link');
          const payload = {
            item_code: it.code, item_name: it.name, drawing_type: g('drawing_type'), rev: g('rev') || 'A',
            drawing_no: g('drawing_no'), title: g('title'), writer: g('writer'), reg_date: g('reg_date') || todayStr(),
            file_url: fileUrl, remark: g('remark'), use_yn: true,
          };
          try {
            // 개정 시 같은 유형의 이전 현행본은 폐지(use_yn=false)로 이력화
            if (isRevise) { try { await db.update('drawings', base.id, { use_yn: false }); } catch { /* noop */ } }
            await db.insert('drawings', payload);
            close(); toast(isRevise ? '개정 도면이 등록되었습니다.' : '도면이 등록되었습니다.'); load();
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }
  load();
}
