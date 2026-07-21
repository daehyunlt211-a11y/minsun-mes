// =====================================================================
// 공통 CRUD 페이지 팩토리
// 설정(config)만 선언하면 검색·필터·정렬·페이징·모달폼·CSV·삭제가 자동 생성
// =====================================================================
import { db } from './db.js';
import { icon } from '../ui/icons.js';
import { toast, openModal, confirmDialog, badge, yesNo } from '../ui/components.js';
import { won, num, fmtDate, escapeHtml, nextDocNo, downloadCSV, debounce } from './format.js';

export function createCrudPage(cfg) {
  return async function render(root) {
    const state = {
      page: 1, pageSize: 10, search: '',
      sort: cfg.defaultSort?.key || null,
      sortDir: cfg.defaultSort?.dir || 'asc',
      filters: {},
      chip: '__all__',
      dateFrom: '', dateTo: '',
      selected: new Set(),
    };
    let pageRows = []; // 현재 페이지 행 (일괄작업 매핑용)
    // 날짜 기간 조회 옵션 (cfg.dateField 설정 시)
    const dateRangeOpt = () => cfg.dateField ? { key: cfg.dateField.key, from: state.dateFrom, to: state.dateTo } : undefined;

    root.innerHTML = `
      <div class="page-head">
        <div class="page-head__text">
          <h1>${escapeHtml(cfg.title)}</h1>
          <p>${escapeHtml(cfg.subtitle || '')}</p>
        </div>
        <div class="page-head__actions" id="ph-actions"></div>
      </div>
      <div id="stats-slot"></div>
      <div id="banner-slot"></div>
      <div class="card">
        <div class="toolbar" id="toolbar"></div>
        <div id="chips-slot"></div>
        <div class="table-wrap"><div id="table-slot"></div></div>
        <div id="pager-slot"></div>
      </div>`;

    // ----- 상단 액션 버튼 -----
    const actions = root.querySelector('#ph-actions');
    const bulkActions = cfg.bulkActions || [];
    actions.innerHTML = `
      ${bulkActions.map((a, i) => `<button class="btn ${a.cls || ''}" data-bulk="${i}" disabled>${a.icon ? icon(a.icon, 16) : ''} ${escapeHtml(a.label)} <span data-bulk-count></span></button>`).join('')}
      <button class="btn" id="btn-csv">${icon('download', 16)} 엑셀(CSV)</button>
      <button class="btn" id="btn-refresh">${icon('refresh', 16)} 새로고침</button>
      ${cfg.readOnly ? '' : `<button class="btn btn--primary" id="btn-add">${icon('plus', 16)} 신규등록</button>`}`;
    root.querySelector('#btn-refresh').onclick = () => load();
    root.querySelector('#btn-csv').onclick = () => exportCsv();
    if (!cfg.readOnly) root.querySelector('#btn-add').onclick = () => openForm(null);
    actions.querySelectorAll('[data-bulk]').forEach(btn => btn.onclick = async () => {
      const a = bulkActions[+btn.dataset.bulk];
      const sel = pageRows.filter(r => state.selected.has(r.id));
      if (!sel.length) return;
      await a.onClick(sel, load);
    });

    function updateBulk() {
      const n = state.selected.size;
      actions.querySelectorAll('[data-bulk]').forEach(btn => {
        btn.disabled = n === 0;
        const c = btn.querySelector('[data-bulk-count]');
        if (c) c.textContent = n ? `(${n})` : '';
      });
    }

    // ----- 툴바: 검색 + 필터 -----
    const toolbar = root.querySelector('#toolbar');
    let toolbarHtml = `
      <div class="search-box grow">
        ${icon('search', 16)}
        <input id="search" placeholder="${escapeHtml(cfg.searchPlaceholder || '검색')}" autocomplete="off"/>
      </div>`;
    for (const f of (cfg.filters || [])) {
      const opts = ['<option value="__all__">전체 ' + escapeHtml(f.label) + '</option>']
        .concat(f.options.map(o => `<option value="${escapeHtml(optVal(o))}">${escapeHtml(optLabel(o))}</option>`)).join('');
      toolbarHtml += `<select class="select" style="width:auto;min-width:150px" data-filter="${escapeHtml(f.key)}">${opts}</select>`;
    }
    if (cfg.dateField) {
      toolbarHtml += `
        <div class="date-range" title="${escapeHtml(cfg.dateField.label || '날짜')} 기간 조회">
          <span class="date-range__label">${icon('calendar', 14)} ${escapeHtml(cfg.dateField.label || '날짜')} 기준</span>
          <select class="select" data-date-preset style="width:auto;min-width:96px">
            <option value="">기간 전체</option>
            <option value="today">오늘</option>
            <option value="7">최근 7일</option>
            <option value="30">최근 30일</option>
            <option value="month">이번 달</option>
          </select>
          <input class="input input--date" type="date" data-date-from aria-label="시작일"/>
          <span class="date-range__sep">~</span>
          <input class="input input--date" type="date" data-date-to aria-label="종료일"/>
        </div>`;
    }
    toolbar.innerHTML = toolbarHtml;
    toolbar.querySelector('#search').addEventListener('input', debounce((e) => { state.search = e.target.value.trim(); state.page = 1; load(); }));
    toolbar.querySelectorAll('[data-filter]').forEach(sel => {
      sel.addEventListener('change', (e) => { state.filters[e.target.dataset.filter] = e.target.value; state.page = 1; load(); });
    });
    if (cfg.dateField) {
      const fromEl = toolbar.querySelector('[data-date-from]');
      const toEl = toolbar.querySelector('[data-date-to]');
      const presetEl = toolbar.querySelector('[data-date-preset]');
      const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const applyDates = () => { state.dateFrom = fromEl.value; state.dateTo = toEl.value; state.page = 1; load(); };
      fromEl.addEventListener('change', () => { presetEl.value = ''; applyDates(); });
      toEl.addEventListener('change', () => { presetEl.value = ''; applyDates(); });
      presetEl.addEventListener('change', () => {
        const v = presetEl.value, now = new Date();
        let from = '', to = '';
        if (v === 'today') { from = to = isoLocal(now); }
        else if (v === '7') { const d = new Date(now); d.setDate(d.getDate() - 6); from = isoLocal(d); to = isoLocal(now); }
        else if (v === '30') { const d = new Date(now); d.setDate(d.getDate() - 29); from = isoLocal(d); to = isoLocal(now); }
        else if (v === 'month') { from = isoLocal(new Date(now.getFullYear(), now.getMonth(), 1)); to = isoLocal(now); }
        fromEl.value = from; toEl.value = to; applyDates();
      });
    }

    // ----- 상태칩(빠른 필터) -----
    if (cfg.statusChips) renderChips();
    function renderChips() {
      const slot = root.querySelector('#chips-slot');
      const c = cfg.statusChips;
      slot.innerHTML = `<div class="toolbar" style="border-top:0;padding-top:12px"><div class="chips" id="chips"></div></div>`;
      const wrap = slot.querySelector('#chips');
      const opts = [{ value: '__all__', label: '전체' }, ...c.options.map(o => ({ value: optVal(o), label: optLabel(o) }))];
      wrap.innerHTML = opts.map(o => `<button class="chip ${state.chip === o.value ? 'active' : ''}" data-chip="${escapeHtml(o.value)}">${escapeHtml(o.label)}<span class="chip__count" data-count="${escapeHtml(o.value)}"></span></button>`).join('');
      wrap.querySelectorAll('[data-chip]').forEach(b => b.onclick = () => {
        state.chip = b.dataset.chip; state.page = 1;
        state.filters[c.key] = b.dataset.chip;
        renderChips(); load();
      });
    }

    // ----- 데이터 로드 -----
    const tableSlot = root.querySelector('#table-slot');
    const pagerSlot = root.querySelector('#pager-slot');
    const statsSlot = root.querySelector('#stats-slot');

    async function load() {
      tableSlot.innerHTML = `<div class="spinner"></div>`;
      try {
        const opts = { search: state.search, searchFields: cfg.searchFields, filters: { ...state.filters }, dateRange: dateRangeOpt(), sort: state.sort, sortDir: state.sortDir, page: state.page, pageSize: state.pageSize };
        const { rows, total } = await db.list(cfg.table, opts);
        state.selected.clear();
        renderTable(rows);
        renderPager(total);
        if (cfg.bulkActions) updateBulk();
        if (cfg.stats) renderStats();
        if (cfg.statusChips) updateChipCounts();
        if (cfg.banner) { try { await cfg.banner(root.querySelector('#banner-slot'), load); } catch { /* noop */ } }
      } catch (e) {
        tableSlot.innerHTML = `<div class="empty">${icon('alert', 48)}<h4>데이터를 불러오지 못했습니다</h4><p>${escapeHtml(e.message || e)}</p></div>`;
      }
    }

    async function renderStats() {
      try {
        const all = await db.all(cfg.table, { search: state.search, searchFields: cfg.searchFields, filters: { ...state.filters }, dateRange: dateRangeOpt() });
        const cards = await cfg.stats(all);
        statsSlot.innerHTML = `<div class="stat-grid">` + cards.map(c => `
          <div class="stat">
            <div class="stat__top">
              <span class="stat__label">${escapeHtml(c.label)}</span>
              <span class="stat__ico ico-tint-${c.tint || 'brand'}">${icon(c.icon || 'box', 21)}</span>
            </div>
            <div class="stat__value">${c.value}${c.unit ? `<small>${escapeHtml(c.unit)}</small>` : ''}</div>
            ${c.sub ? `<div class="muted" style="margin-top:6px">${c.sub}</div>` : ''}
          </div>`).join('') + `</div>`;
      } catch { statsSlot.innerHTML = ''; }
    }

    async function updateChipCounts() {
      const c = cfg.statusChips;
      const all = await db.all(cfg.table, { search: state.search, searchFields: cfg.searchFields, dateRange: dateRangeOpt() });
      const counts = {}; let total = 0;
      for (const r of all) { const v = String(r[c.key] ?? ''); counts[v] = (counts[v] || 0) + 1; total++; }
      root.querySelectorAll('[data-count]').forEach(el => {
        const v = el.dataset.count;
        el.textContent = v === '__all__' ? total : (counts[v] || 0);
      });
    }

    function renderTable(rows) {
      pageRows = rows;
      if (!rows.length) {
        tableSlot.innerHTML = `<div class="empty">${icon('inbox', 52)}<h4>데이터가 없습니다</h4><p>${cfg.readOnly ? '표시할 항목이 없습니다.' : '신규등록 버튼으로 항목을 추가하세요.'}</p></div>`;
        return;
      }
      const cols = cfg.columns;
      const selCol = cfg.bulkActions ? `<th class="center" style="width:40px"><input type="checkbox" class="checkbox" id="sel-all"></th>` : '';
      const thead = selCol + cols.map(c => {
        const align = c.align === 'right' || c.type === 'num' || c.type === 'money' ? 'num' : c.align === 'center' ? 'center' : '';
        const sortable = c.sortable ? 'sortable' : '';
        const sorted = state.sort === c.key ? 'sorted' : '';
        const arrow = state.sort === c.key ? (state.sortDir === 'desc' ? '▼' : '▲') : '↕';
        return `<th class="${align} ${sortable} ${sorted}" ${c.sortable ? `data-sort="${escapeHtml(c.key)}"` : ''}>${escapeHtml(c.label)}${c.sortable ? `<span class="th-sort">${arrow}</span>` : ''}</th>`;
      }).join('') + (cfg.readOnly ? '' : `<th class="center" style="width:${cfg.rowActions ? 200 : 90}px">관리</th>`);

      const rowActs = cfg.rowActions || [];
      const tbody = rows.map(r => {
        const selCell = cfg.bulkActions ? `<td class="center"><input type="checkbox" class="checkbox" data-select="${r.id}"></td>` : '';
        const tds = cols.map(c => {
          const align = c.align === 'right' || c.type === 'num' || c.type === 'money' ? 'num' : c.align === 'center' ? 'center' : '';
          return `<td class="${align} ${c.cls || ''}">${cellValue(c, r)}</td>`;
        }).join('');
        const customActs = rowActs.map((a, i) => (a.show && !a.show(r)) ? '' :
          `<button class="btn btn--sm ${a.cls || ''}" data-rowact="${i}" data-id="${r.id}" title="${escapeHtml(a.title || a.label || '')}">${a.icon ? icon(a.icon, 14) : ''}${a.label ? ' ' + escapeHtml(a.label) : ''}</button>`).join('');
        const act = cfg.readOnly ? '' : `<td class="center"><div class="row-actions">
            ${customActs}
            <button class="icon-btn" data-edit="${r.id}" title="수정">${icon('edit', 15)}</button>
            <button class="icon-btn" data-del="${r.id}" title="삭제">${icon('trash', 15)}</button>
          </div></td>`;
        return `<tr data-id="${r.id}">${selCell}${tds}${act}</tr>`;
      }).join('');

      tableSlot.innerHTML = `<table class="grid"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;

      tableSlot.querySelectorAll('[data-sort]').forEach(th => th.onclick = () => {
        const k = th.dataset.sort;
        if (state.sort === k) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sort = k; state.sortDir = 'asc'; }
        load();
      });

      // 행 선택(다중) — 일괄 작업용. 체크박스뿐 아니라 행 클릭으로도 선택 토글
      if (cfg.bulkActions) {
        const selAll = tableSlot.querySelector('#sel-all');
        const boxes = [...tableSlot.querySelectorAll('[data-select]')];
        const mark = (b) => b.closest('tr')?.classList.toggle('is-selected', b.checked);
        const syncAll = () => { selAll.checked = boxes.length > 0 && boxes.every(b => b.checked); selAll.indeterminate = !selAll.checked && boxes.some(b => b.checked); };
        selAll.onchange = () => { boxes.forEach(b => { b.checked = selAll.checked; b.checked ? state.selected.add(b.dataset.select) : state.selected.delete(b.dataset.select); mark(b); }); updateBulk(); };
        boxes.forEach(b => b.onchange = () => { b.checked ? state.selected.add(b.dataset.select) : state.selected.delete(b.dataset.select); mark(b); syncAll(); updateBulk(); });
        tableSlot.querySelectorAll('tbody tr[data-id]').forEach(tr => {
          tr.classList.add('row-selectable');
          tr.addEventListener('click', (e) => {
            if (e.target.closest('button, a, input, select, label, .row-actions')) return;
            const box = tr.querySelector('[data-select]');
            if (!box) return;
            box.checked = !box.checked;
            box.dispatchEvent(new Event('change', { bubbles: true }));
          });
        });
      }
      if (!cfg.readOnly) {
        tableSlot.querySelectorAll('[data-rowact]').forEach(b => b.onclick = async () => {
          const row = rows.find(r => r.id === b.dataset.id);
          const a = (cfg.rowActions || [])[+b.dataset.rowact];
          if (a?.onClick) await a.onClick(row, load);
        });
        tableSlot.querySelectorAll('[data-edit]').forEach(b => b.onclick = async () => { const row = rows.find(r => r.id === b.dataset.edit); openForm(row); });
        tableSlot.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
          const row = rows.find(r => r.id === b.dataset.del);
          const ok = await confirmDialog({ message: `이 항목을 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.`, confirmText: '삭제' });
          if (!ok) return;
          try { await db.remove(cfg.table, row.id); toast('삭제되었습니다.'); load(); } catch (e) { toast(e.message || '삭제 실패', 'error'); }
        });
      }
    }

    function cellValue(c, r) {
      if (c.render) return c.render(r);
      let v = r[c.key];
      if (c.type === 'money') return `<span class="mono">${won(v)}</span>`;
      if (c.type === 'num') return `<span class="mono">${num(v)}</span>`;
      if (c.type === 'date') return fmtDate(v);
      if (c.type === 'badge') return v == null || v === '' ? '' : badge(String(v), c.tone);
      if (c.type === 'yesno') return yesNo(v);
      return escapeHtml(v ?? '');
    }

    function renderPager(total) {
      const size = state.pageSize;
      const pages = Math.max(1, Math.ceil(total / size));
      if (state.page > pages) state.page = pages;
      const cur = state.page;
      const from = total === 0 ? 0 : (cur - 1) * size + 1;
      const to = Math.min(cur * size, total);
      let btns = '';
      const add = (p, label, opts = {}) => { btns += `<button ${opts.disabled ? 'disabled' : ''} class="${opts.active ? 'active' : ''}" data-page="${p}">${label}</button>`; };
      add(cur - 1, icon('chevronLeft', 16), { disabled: cur <= 1 });
      const win = 2; let start = Math.max(1, cur - win), end = Math.min(pages, cur + win);
      if (start > 1) { add(1, '1'); if (start > 2) btns += `<span style="color:var(--text-3);padding:0 2px">…</span>`; }
      for (let p = start; p <= end; p++) add(p, String(p), { active: p === cur });
      if (end < pages) { if (end < pages - 1) btns += `<span style="color:var(--text-3);padding:0 2px">…</span>`; add(pages, String(pages)); }
      add(cur + 1, icon('chevronRight', 16), { disabled: cur >= pages });

      pagerSlot.innerHTML = `
        <div class="pagination">
          <span class="info">총 <b>${num(total)}</b>건 중 ${num(from)}–${num(to)}</span>
          <div class="spacer"></div>
          <div class="page-size">표시 <select id="psize">
            ${[10, 20, 50, 100].map(s => `<option value="${s}" ${s === size ? 'selected' : ''}>${s}</option>`).join('')}
          </select></div>
          <div class="pager">${btns}</div>
        </div>`;
      pagerSlot.querySelector('#psize').onchange = (e) => { state.pageSize = +e.target.value; state.page = 1; load(); };
      pagerSlot.querySelectorAll('[data-page]').forEach(b => b.onclick = () => { const p = +b.dataset.page; if (p >= 1 && p <= pages) { state.page = p; load(); } });
    }

    // ----- 신규/수정 폼 -----
    async function openForm(row) {
      const isEdit = !!row;
      const fields = cfg.fields || [];

      // 참조(ref) 필드용 기준정보 미리 로드 (드롭다운 옵션 + 자동채움 소스)
      const refData = {};
      const refFields = fields.filter(f => f.ref);
      if (refFields.length) {
        const tables = [...new Set(refFields.map(f => f.ref.table))];
        await Promise.all(tables.map(async t => {
          try { refData[t] = await db.all(t, { sort: 'code' }); }
          catch { try { refData[t] = await db.all(t, {}); } catch { refData[t] = []; } }
        }));
      }

      const body = document.createElement('form');
      body.id = 'crud-form';
      body.className = 'form-grid';
      body.innerHTML = fields.map(f => fieldHtml(f, row, refData)).join('');

      const footer = `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-save>${icon('check', 16)} ${isEdit ? '수정' : '등록'}</button>`;

      openModal({
        title: `${escapeHtml(cfg.title)} ${isEdit ? '수정' : '신규등록'}`,
        body, footer, wide: cfg.wideForm,
        onMount: ({ footEl, close }) => {
          footEl.querySelector('[data-cancel]').onclick = close;
          footEl.querySelector('[data-save]').onclick = async () => {
            const data = collect(body, fields);
            if (!data) return;
            try {
              // 문서번호 자동 채번 (신규 & 비어있을 때)
              if (!isEdit && cfg.docNoField && !data[cfg.docNoField.key]) {
                const all = await db.all(cfg.table, {});
                data[cfg.docNoField.key] = nextDocNo(cfg.docNoField.prefix, all.map(x => x[cfg.docNoField.key]));
              }
              if (cfg.beforeSave) cfg.beforeSave(data, row);
              if (isEdit) { await db.update(cfg.table, row.id, data); toast('수정되었습니다.'); }
              else { await db.insert(cfg.table, data); toast('등록되었습니다.'); }
              close(); load();
            } catch (e) { toast(e.message || '저장 실패', 'error'); }
          };
          // 참조 필드 선택 시 다른 필드 자동 채움 (예: 품목 선택 → 품명·단가)
          bindRefFills(body, refFields, refData);
          // 자동 계산 필드 바인딩 (예: 금액 = 수량 * 단가)
          if (cfg.computed) cfg.computed(body);
        },
      });
    }

    // 참조 필드의 change 이벤트 → fill 매핑에 따라 다른 입력값 자동 채움
    function bindRefFills(form, refFields, refData) {
      for (const f of refFields) {
        if (!f.ref.fill) continue;
        const el = form.querySelector(`[name="${f.key}"]`);
        if (!el) continue;
        el.addEventListener('change', () => {
          const rows = refData[f.ref.table] || [];
          const sel = rows.find(r => String(r[f.ref.value]) === String(el.value));
          if (!sel) return;
          for (const [target, src] of Object.entries(f.ref.fill)) {
            const tEl = form.querySelector(`[name="${target}"]`);
            if (!tEl) continue;
            tEl.value = typeof src === 'function' ? src(sel) : (sel[src] ?? '');
            tEl.dispatchEvent(new Event('input', { bubbles: true }));
            tEl.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      }
    }

    function fieldHtml(f, row, refData = {}) {
      if (f.type === 'hidden') return '';
      const val = row ? row[f.key] : (f.default ?? '');
      const span = f.col2 ? 'col-2' : (f.type === 'textarea' ? 'col-2' : '');
      const reqMark = f.required ? '<span class="req">*</span>' : '';
      let control;
      if (f.ref) {
        // 기준정보 참조 드롭다운
        const rows = refData[f.ref.table] || [];
        const opts = rows.map(r => {
          const v = r[f.ref.value];
          const label = typeof f.ref.label === 'function' ? f.ref.label(r) : r[f.ref.label || f.ref.value];
          return `<option value="${escapeHtml(v)}" ${String(v) === String(val) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
        }).join('');
        control = `<select class="select" name="${f.key}" ${f.required ? 'required' : ''}>
          <option value="">${escapeHtml(f.placeholder || '선택하세요')}</option>${opts}
        </select>`;
        if (!rows.length) control += `<div class="field__err" style="color:var(--warning)">기준정보(${escapeHtml(f.ref.table)})에 등록된 데이터가 없습니다.</div>`;
      } else if (f.type === 'select') {
        const options = (typeof f.options === 'function' ? f.options() : f.options) || [];
        control = `<select class="select" name="${f.key}" ${f.required ? 'required' : ''}>
          ${f.placeholder ? `<option value="">${escapeHtml(f.placeholder)}</option>` : ''}
          ${options.map(o => `<option value="${escapeHtml(optVal(o))}" ${String(optVal(o)) === String(val) ? 'selected' : ''}>${escapeHtml(optLabel(o))}</option>`).join('')}
        </select>`;
      } else if (f.type === 'textarea') {
        control = `<textarea class="textarea" name="${f.key}" placeholder="${escapeHtml(f.placeholder || '')}">${escapeHtml(val ?? '')}</textarea>`;
      } else if (f.type === 'switch') {
        const checked = (val === undefined ? (f.default ?? true) : val) ? 'checked' : '';
        return `<div class="field ${span}"><label>${escapeHtml(f.label)}</label>
          <label class="switch"><input type="checkbox" name="${f.key}" ${checked}/><span class="switch__track"></span><span class="muted" data-switch-label>${val === false ? '미사용' : '사용'}</span></label></div>`;
      } else {
        const type = f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'password' ? 'password' : 'text';
        const step = f.type === 'number' ? (f.step ? `step="${f.step}"` : 'step="any"') : '';
        const auto = f.type === 'password' ? 'autocomplete="new-password"' : '';
        control = `<input class="input" type="${type}" name="${f.key}" value="${escapeHtml(val ?? '')}" ${step} ${auto} placeholder="${escapeHtml(f.placeholder || '')}" ${f.required ? 'required' : ''} ${f.readonly ? 'readonly' : ''} ${f.attrs || ''}/>`;
      }
      return `<div class="field ${span}" data-field="${f.key}"><label>${escapeHtml(f.label)} ${reqMark}</label>${control}<div class="field__err hidden"></div></div>`;
    }

    function collect(form, fields) {
      const data = {};
      let valid = true;
      for (const f of fields) {
        if (f.type === 'hidden') { if (f.default !== undefined) data[f.key] = f.default; continue; }
        const el = form.querySelector(`[name="${f.key}"]`);
        if (!el) continue;
        const wrap = form.querySelector(`[data-field="${f.key}"]`);
        const errEl = wrap?.querySelector('.field__err');
        let v;
        if (f.type === 'switch') v = el.checked;
        else if (f.type === 'number') v = el.value === '' ? null : Number(el.value);
        else v = el.value.trim();
        if (f.required && (v === '' || v == null)) {
          valid = false;
          wrap?.classList.add('field--error');
          if (errEl) { errEl.textContent = `${f.label}은(는) 필수입니다.`; errEl.classList.remove('hidden'); }
        } else {
          wrap?.classList.remove('field--error');
          if (errEl) errEl.classList.add('hidden');
        }
        data[f.key] = v;
      }
      if (!valid) { toast('필수 항목을 확인하세요.', 'error'); return null; }
      return data;
    }

    async function exportCsv() {
      try {
        const all = await db.all(cfg.table, { search: state.search, searchFields: cfg.searchFields, filters: { ...state.filters }, dateRange: dateRangeOpt(), sort: state.sort, sortDir: state.sortDir });
        const csvCols = cfg.columns.map(c => ({ label: c.label, key: c.key, csv: c.csv || (c.type === 'date' ? (r) => fmtDate(r[c.key]) : c.type === 'yesno' ? (r) => (r[c.key] ? '사용' : '미사용') : null) }));
        downloadCSV(`${cfg.title}_${new Date().toISOString().slice(0, 10)}.csv`, csvCols, all);
        toast('CSV로 내보냈습니다.');
      } catch (e) { toast(e.message || '내보내기 실패', 'error'); }
    }

    load();
  };
}

// 스위치 라벨 토글 (위임)
document.addEventListener('change', (e) => {
  if (e.target.matches('.switch input[type="checkbox"]')) {
    const lbl = e.target.parentElement.querySelector('[data-switch-label]');
    if (lbl) lbl.textContent = e.target.checked ? '사용' : '미사용';
  }
});

function optVal(o) { return typeof o === 'object' ? o.value : o; }
function optLabel(o) { return typeof o === 'object' ? o.label : o; }
