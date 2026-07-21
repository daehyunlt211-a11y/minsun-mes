// 검사 진행 화면 (수입검사 / 출하검사)
// 검사기준관리(inspection_standards)에 등록된 항목 기준으로 검사를 진행하고
// 항목별 측정/판정을 inspection_details에 저장한다.
import { db } from '../lib/db.js';
import { num, fmtDate, todayStr, escapeHtml, nextDocNo, downloadCSV } from '../lib/format.js';
import { badge, toast, openModal, confirmDialog } from '../ui/components.js';
import { icon } from '../ui/icons.js';

// 기간검색 툴바 HTML + 이벤트 바인딩 (수입/출하검사 공용)
function dateRangeHTML(label) {
  return `<div class="date-range" title="${label} 기간 조회">
    <span class="date-range__label">${icon('calendar', 14)} ${label}</span>
    <select class="select" data-dr-preset style="width:auto;min-width:96px">
      <option value="">기간 전체</option><option value="today">오늘</option><option value="7">최근 7일</option><option value="30">최근 30일</option><option value="month">이번 달</option>
    </select>
    <input class="input input--date" type="date" data-dr-from aria-label="시작일"><span class="date-range__sep">~</span><input class="input input--date" type="date" data-dr-to aria-label="종료일"></div>`;
}
function wireDateRange(scope, state, onChange) {
  const fromEl = scope.querySelector('[data-dr-from]'), toEl = scope.querySelector('[data-dr-to]'), presetEl = scope.querySelector('[data-dr-preset]');
  if (!fromEl) return;
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const apply = () => { state.from = fromEl.value; state.to = toEl.value; onChange(); };
  fromEl.addEventListener('change', () => { presetEl.value = ''; apply(); });
  toEl.addEventListener('change', () => { presetEl.value = ''; apply(); });
  presetEl.addEventListener('change', () => {
    const v = presetEl.value, now = new Date(); let f = '', t = '';
    if (v === 'today') { f = t = iso(now); }
    else if (v === '7') { const d = new Date(now); d.setDate(d.getDate() - 6); f = iso(d); t = iso(now); }
    else if (v === '30') { const d = new Date(now); d.setDate(d.getDate() - 29); f = iso(d); t = iso(now); }
    else if (v === 'month') { f = iso(new Date(now.getFullYear(), now.getMonth(), 1)); t = iso(now); }
    fromEl.value = f; toEl.value = t; apply();
  });
}
function inDateRange(dateStr, state) {
  const d = String(dateStr || '').slice(0, 10);
  if (state.from && d < state.from) return false;
  if (state.to && d > state.to) return false;
  return true;
}

// 정량 판정: 측정값이 규격값 ± 공차 범위 내이면 OK
function judgeQuant(spec, tol, measured) {
  const s = parseFloat(spec);
  const m = parseFloat(measured);
  if (isNaN(s) || isNaN(m)) return null;
  const t = Math.abs(parseFloat(String(tol ?? '').replace(/[^0-9.\-]/g, '')) || 0);
  return (m >= s - t && m <= s + t) ? 'OK' : 'NG';
}

export function createInspectionPage(cfg) {
  // cfg: { table, kind, title, subtitle, docPrefix, sourceTable, sourceKey, sourceLabel, sourceFill, extraKey, extraLabel }
  return async function render(root) {
    const state = { search: '', result: '__all__', from: '', to: '' };

    root.innerHTML = `
      <div class="page-head">
        <div class="page-head__text"><h1>${escapeHtml(cfg.title)}</h1><p>${escapeHtml(cfg.subtitle)}</p></div>
        <div class="page-head__actions">
          <button class="btn" id="ins-csv">${icon('download', 16)} 엑셀(CSV)</button>
          <button class="btn" id="ins-refresh">${icon('refresh', 16)} 새로고침</button>
          <button class="btn btn--primary" id="ins-new">${icon('plus', 16)} 신규 검사</button>
        </div>
      </div>
      <div id="ins-stats"></div>
      <div class="card">
        <div class="toolbar">
          <div class="search-box grow">${icon('search', 16)}<input id="ins-search" placeholder="검사번호·품목·거래처 검색" autocomplete="off"/></div>
          ${dateRangeHTML('검사일')}
        </div>
        <div class="toolbar" style="border-top:0;padding-top:12px"><div class="chips" id="ins-chips"></div></div>
        <div class="table-wrap"><div id="ins-table"><div class="spinner"></div></div></div>
      </div>`;

    root.querySelector('#ins-refresh').onclick = () => load();
    root.querySelector('#ins-new').onclick = () => openInspectionForm();
    root.querySelector('#ins-csv').onclick = () => exportCsv();
    root.querySelector('#ins-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });
    wireDateRange(root, state, () => { renderStats(); renderTable(); });

    let rows = [];

    async function load() {
      root.querySelector('#ins-table').innerHTML = `<div class="spinner"></div>`;
      try { rows = await db.all(cfg.table, { sort: 'inspect_date', sortDir: 'desc' }); }
      catch (e) { root.querySelector('#ins-table').innerHTML = `<div class="empty">${icon('alert', 48)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; return; }
      renderStats(); renderChips(); renderTable();
    }

    // 검색 + 기간(검사일) 적용
    function scoped() {
      const q = state.search.toLowerCase();
      return rows.filter(r => inDateRange(r.inspect_date, state) &&
        (!q || [r.inspect_no, r.item_code, r.item_name, r.partner].some(v => String(v ?? '').toLowerCase().includes(q))));
    }
    function filtered() {
      return scoped().filter(r => state.result === '__all__' || r.result === state.result);
    }

    function renderStats() {
      const base = scoped();
      const pass = base.filter(r => r.result === '합격').length;
      const rate = base.length ? ((pass / base.length) * 100).toFixed(1) : '0.0';
      root.querySelector('#ins-stats').innerHTML = `<div class="stat-grid">
        ${stat('총 검사건수', num(base.length), '건', 'shield', 'brand')}
        ${stat('합격', num(pass), '건', 'checkCircle', 'green')}
        ${stat('불합격', num(base.filter(r => r.result === '불합격').length), '건', 'alert', 'red')}
        ${stat('합격률', rate, '%', 'trendUp', 'violet')}</div>`;
    }

    function renderChips() {
      const opts = [{ v: '__all__', l: '전체' }, { v: '합격', l: '합격' }, { v: '불합격', l: '불합격' }, { v: '조건부합격', l: '조건부합격' }];
      const wrap = root.querySelector('#ins-chips');
      wrap.innerHTML = opts.map(o => `<button class="chip ${state.result === o.v ? 'active' : ''}" data-r="${o.v}">${o.l}</button>`).join('');
      wrap.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { state.result = b.dataset.r; renderChips(); renderTable(); });
    }

    function renderTable() {
      const list = filtered();
      const slot = root.querySelector('#ins-table');
      if (!list.length) { slot.innerHTML = `<div class="empty">${icon('inbox', 52)}<h4>검사 내역이 없습니다</h4><p>신규 검사 버튼으로 검사를 진행하세요.</p></div>`; return; }
      slot.innerHTML = `<table class="grid"><thead><tr>
        <th>검사번호</th><th>검사일</th><th>${escapeHtml(cfg.extraLabel || '구분')}</th><th>거래처</th><th>품명</th>
        <th class="num">검사</th><th class="num">양품</th><th class="num">불량</th><th>검사자</th><th class="center">판정</th><th class="center" style="width:90px">관리</th>
      </tr></thead><tbody>${list.map(r => `<tr class="clickable" data-id="${r.id}">
        <td class="cell-code">${escapeHtml(r.inspect_no)}</td><td>${fmtDate(r.inspect_date)}</td>
        <td class="cell-code">${escapeHtml(r[cfg.extraKey] || r[cfg.sourceKey] || '')}</td>
        <td>${escapeHtml(r.partner || '')}</td><td class="cell-strong">${escapeHtml(r.item_name || '')}</td>
        <td class="num mono">${num(r.inspect_qty)}</td><td class="num mono">${num(r.good_qty)}</td><td class="num mono">${num(r.defect_qty)}</td>
        <td>${escapeHtml(r.inspector || '')}</td><td class="center">${badge(r.result || '')}</td>
        <td class="center"><div class="row-actions">
          <button class="icon-btn" data-view="${r.id}" title="상세">${icon('search', 15)}</button>
          <button class="icon-btn" data-del="${r.id}" title="삭제">${icon('trash', 15)}</button>
        </div></td></tr>`).join('')}</tbody></table>`;
      slot.querySelectorAll('[data-view]').forEach(b => b.onclick = (e) => { e.stopPropagation(); openDetail(list.find(r => r.id === b.dataset.view)); });
      slot.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => openDetail(list.find(r => r.id === tr.dataset.id)));
      slot.querySelectorAll('[data-del]').forEach(b => b.onclick = async (e) => {
        e.stopPropagation();
        const r = list.find(x => x.id === b.dataset.del);
        if (!(await confirmDialog({ message: '이 검사 내역을 삭제하시겠습니까?', confirmText: '삭제' }))) return;
        try {
          await db.remove(cfg.table, r.id);
          try { const dets = await db.all('inspection_details', { filters: { inspect_no: r.inspect_no } }); for (const d of dets) await db.remove('inspection_details', d.id); } catch { /* noop */ }
          toast('삭제되었습니다.'); load();
        } catch (err) { toast(err.message || '삭제 실패', 'error'); }
      });
    }

    // ---------- 신규 검사 폼 ----------
    async function openInspectionForm() {
      const [items, users, sources] = await Promise.all([
        db.all('items', { sort: 'code' }), db.all('users', { sort: 'name' }),
        db.all(cfg.sourceTable, {}).catch(() => []),
      ]);

      const body = document.createElement('div');
      body.innerHTML = `
        <form id="ins-form" class="form-grid">
          <div class="field"><label>검사일 <span class="req">*</span></label><input class="input" name="inspect_date" type="date" value="${todayStr()}"></div>
          <div class="field"><label>${escapeHtml(cfg.sourceLabel)}</label>
            <select class="select" name="__source"><option value="">선택 (선택사항)</option>
              ${sources.map(s => `<option value="${escapeHtml(s[cfg.sourceKey])}">${escapeHtml(cfg.sourceText(s))}</option>`).join('')}
            </select></div>
          <div class="field"><label>품목 <span class="req">*</span></label>
            <select class="select" name="item_code"><option value="">품목 선택</option>
              ${items.map(i => `<option value="${escapeHtml(i.code)}">${escapeHtml(i.code)} · ${escapeHtml(i.name)}</option>`).join('')}
            </select></div>
          <div class="field"><label>거래처</label><input class="input" name="partner"></div>
          ${cfg.extraKey ? `<div class="field"><label>${escapeHtml(cfg.extraLabel)}</label><input class="input" name="${cfg.extraKey}"></div>` : ''}
          <div class="field"><label>검사수량</label><input class="input" name="inspect_qty" type="number" value="0"></div>
          <div class="field"><label>양품수량</label><input class="input" name="good_qty" type="number" value="0"></div>
          <div class="field"><label>불량수량</label><input class="input" name="defect_qty" type="number" value="0"></div>
          <div class="field"><label>검사자</label><select class="select" name="inspector"><option value="">선택</option>
            ${users.map(u => `<option value="${escapeHtml(u.name)}">${escapeHtml(u.name)}${u.department ? ` (${escapeHtml(u.department)})` : ''}</option>`).join('')}</select></div>
          <input type="hidden" name="item_name">
        </form>
        <h4 style="margin:18px 0 10px;display:flex;align-items:center;gap:8px">${icon('shield', 18)} 검사기준 평가</h4>
        <div id="ins-criteria"><div class="muted" style="padding:10px">품목을 선택하면 등록된 검사기준이 표시됩니다.</div></div>
        <div id="ins-result" class="flex between" style="margin-top:14px;padding:12px 16px;background:var(--surface-2);border-radius:10px">
          <b>종합 판정</b><span id="ins-result-badge">${badge('대기', 'neutral')}</span></div>`;

      const form = body.querySelector('#ins-form');
      let criteria = []; // {std, el, getJudgment()}

      async function loadCriteria(itemCode) {
        const slot = body.querySelector('#ins-criteria');
        criteria = [];
        if (!itemCode) { slot.innerHTML = `<div class="muted" style="padding:10px">품목을 선택하세요.</div>`; updateResult(); return; }
        let stds = [];
        try { stds = await db.all('inspection_standards', { filters: { item_code: itemCode, inspect_type: cfg.kind }, sort: 'std_no' }); } catch { stds = []; }
        stds = stds.filter(s => s.use_yn !== false);
        if (!stds.length) {
          slot.innerHTML = `<div class="empty" style="padding:24px">${icon('alert', 40)}<h4>등록된 검사기준이 없습니다</h4><p>검사기준관리에서 이 품목의 <b>${escapeHtml(cfg.kind)}</b> 기준을 먼저 등록하세요. (종합판정은 수동 선택)</p>
            <select class="select" id="ins-manual" style="max-width:200px;margin:10px auto 0"><option value="합격">합격</option><option value="불합격">불합격</option><option value="조건부합격">조건부합격</option></select></div>`;
          slot.querySelector('#ins-manual').onchange = updateResult;
          updateResult(); return;
        }
        slot.innerHTML = `<div class="table-wrap"><table class="grid">
          <thead><tr><th>검사항목</th><th class="center">평가</th><th>기준</th><th>${'측정값/관측'}</th><th class="center">판정</th></tr></thead>
          <tbody>${stds.map((s, i) => {
            const quant = (s.eval_method || '정량적') === '정량적';
            const input = quant
              ? `<input class="input" data-cidx="${i}" type="number" step="any" placeholder="측정값(숫자)">`
              : `<select class="select" data-cidx="${i}"><option value="">판정</option><option value="OK">OK</option><option value="NG">NG</option></select>`;
            const spec = quant
              ? `${escapeHtml(s.spec_value ?? '')}${s.tolerance ? ` <span class="muted">/ 공차 ${escapeHtml(s.tolerance)}</span>` : ''}`
              : `<span class="muted">${escapeHtml(s.spec_value || 'OK/NG')}</span>`;
            return `<tr data-row="${i}">
              <td class="cell-strong">${escapeHtml(s.inspect_item || '')}</td>
              <td class="center">${badge(s.eval_method || '정량적', quant ? 'neutral' : 'info')}</td>
              <td>${spec}</td><td>${input}</td>
              <td class="center" data-judge="${i}">-</td></tr>`;
          }).join('')}</tbody></table></div>`;
        criteria = stds.map((s, i) => ({ std: s, idx: i }));
        slot.querySelectorAll('[data-cidx]').forEach(el => el.addEventListener('input', () => judgeRow(+el.dataset.cidx)));
        slot.querySelectorAll('select[data-cidx]').forEach(el => el.addEventListener('change', () => judgeRow(+el.dataset.cidx)));
        criteria.forEach(c => judgeRow(c.idx));
      }

      function judgeRow(i) {
        const c = criteria[i]; if (!c) return;
        const el = body.querySelector(`[data-cidx="${i}"]`);
        const cell = body.querySelector(`[data-judge="${i}"]`);
        const quant = (c.std.eval_method || '정량적') === '정량적';
        let j = null;
        if (quant) j = el.value === '' ? null : judgeQuant(c.std.spec_value, c.std.tolerance, el.value);
        else j = el.value || null;
        c.judgment = j; c.measured = el.value;
        cell.innerHTML = j ? badge(j) : '-';
        updateResult();
      }

      function updateResult() {
        const badgeEl = body.querySelector('#ins-result-badge');
        if (criteria.length) {
          const judged = criteria.filter(c => c.judgment);
          if (judged.length < criteria.length) { badgeEl.innerHTML = badge('검사중', 'warning'); body._result = null; return; }
          const allPass = criteria.every(c => c.judgment === 'OK');
          body._result = allPass ? '합격' : '불합격';
          badgeEl.innerHTML = badge(body._result);
        } else {
          const manual = body.querySelector('#ins-manual');
          body._result = manual ? manual.value : '합격';
          badgeEl.innerHTML = badge(body._result);
        }
      }

      form.querySelector('[name="item_code"]').addEventListener('change', (e) => {
        const it = items.find(x => x.code === e.target.value);
        form.querySelector('[name="item_name"]').value = it?.name || '';
        loadCriteria(e.target.value);
      });
      form.querySelector('[name="__source"]').addEventListener('change', (e) => {
        const s = sources.find(x => String(x[cfg.sourceKey]) === e.target.value);
        if (!s) return;
        for (const [f, col] of Object.entries(cfg.sourceFill)) { const el = form.querySelector(`[name="${f}"]`); if (el) el.value = s[col] ?? ''; }
        const ic = form.querySelector('[name="item_code"]'); if (ic.value) { ic.dispatchEvent(new Event('change')); }
      });

      openModal({
        title: `${cfg.title} 진행`, body, wide: true,
        footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 검사 저장</button>`,
        onMount: ({ footEl, close }) => {
          footEl.querySelector('[data-cancel]').onclick = close;
          footEl.querySelector('[data-ok]').onclick = async () => {
            const g = (n) => { const el = form.querySelector(`[name="${n}"]`); return el ? el.value : ''; };
            if (!g('item_code')) { toast('품목을 선택하세요.', 'error'); return; }
            if (criteria.length && body._result == null) { toast('모든 검사항목을 평가하세요.', 'error'); return; }
            const result = body._result || '합격';
            try {
              const all = await db.all(cfg.table, {});
              const inspect_no = nextDocNo(cfg.docPrefix, all.map(x => x.inspect_no));
              const header = {
                inspect_no, inspect_date: g('inspect_date') || todayStr(), partner: g('partner'),
                item_code: g('item_code'), item_name: g('item_name'),
                inspect_qty: Number(g('inspect_qty')) || 0, good_qty: Number(g('good_qty')) || 0, defect_qty: Number(g('defect_qty')) || 0,
                inspector: g('inspector'), result, remark: '',
              };
              if (cfg.extraKey) header[cfg.extraKey] = g(cfg.extraKey);
              if (cfg.sourceKey && form.querySelector('[name="__source"]').value) header[cfg.sourceKey] = form.querySelector('[name="__source"]').value;
              await db.insert(cfg.table, header);
              // 상세 저장 (테이블 없으면 무시)
              try {
                for (const c of criteria) {
                  await db.insert('inspection_details', {
                    inspect_no, inspect_kind: cfg.kind, item_code: header.item_code, inspect_item: c.std.inspect_item,
                    eval_method: c.std.eval_method || '정량적', spec_value: c.std.spec_value, tolerance: c.std.tolerance,
                    measured: c.measured ?? '', judgment: c.judgment || '',
                  });
                }
              } catch { /* inspection_details 미생성 시 무시 */ }
              close(); toast(`검사(${inspect_no}) 저장 — 판정: ${result}`); load();
            } catch (e) { toast(e.message || '저장 실패', 'error'); }
          };
        },
      });
    }

    // ---------- 상세 보기 ----------
    async function openDetail(r) {
      if (!r) return;
      let dets = [];
      try { dets = await db.all('inspection_details', { filters: { inspect_no: r.inspect_no } }); } catch { dets = []; }
      const body = document.createElement('div');
      body.innerHTML = `
        <div class="grid-2" style="margin-bottom:16px">
          ${info('검사번호', r.inspect_no)}${info('검사일', fmtDate(r.inspect_date))}
          ${info('품목', `${r.item_code || ''} ${r.item_name || ''}`)}${info('거래처', r.partner || '-')}
          ${info('검사수량', num(r.inspect_qty))}${info('검사자', r.inspector || '-')}
        </div>
        <div class="flex between" style="margin-bottom:14px"><b>종합 판정</b>${badge(r.result || '')}</div>
        <h4 style="margin:0 0 10px">검사항목 결과</h4>
        ${dets.length ? `<div class="table-wrap"><table class="grid">
          <thead><tr><th>검사항목</th><th class="center">평가</th><th>기준</th><th>측정/관측</th><th class="center">판정</th></tr></thead>
          <tbody>${dets.map(d => `<tr><td class="cell-strong">${escapeHtml(d.inspect_item || '')}</td>
            <td class="center">${badge(d.eval_method || '정량적', d.eval_method === '정성적' ? 'info' : 'neutral')}</td>
            <td>${escapeHtml(d.spec_value ?? '')}${d.tolerance ? ` <span class="muted">/ 공차 ${escapeHtml(d.tolerance)}</span>` : ''}</td>
            <td class="mono">${escapeHtml(d.measured ?? '')}</td><td class="center">${d.judgment ? badge(d.judgment) : '-'}</td></tr>`).join('')}</tbody></table></div>`
          : `<div class="muted" style="padding:14px">항목별 상세 기록이 없습니다.</div>`}`;
      openModal({ title: `${cfg.title} 상세`, body, wide: true, footer: `<button class="btn" data-cancel>닫기</button>`, onMount: ({ footEl, close }) => { footEl.querySelector('[data-cancel]').onclick = close; } });
    }

    function exportCsv() {
      const cols = [
        { label: '검사번호', key: 'inspect_no' }, { label: '검사일', key: 'inspect_date', csv: (r) => fmtDate(r.inspect_date) },
        { label: '거래처', key: 'partner' }, { label: '품목코드', key: 'item_code' }, { label: '품명', key: 'item_name' },
        { label: '검사수량', key: 'inspect_qty' }, { label: '양품', key: 'good_qty' }, { label: '불량', key: 'defect_qty' },
        { label: '검사자', key: 'inspector' }, { label: '판정', key: 'result' },
      ];
      downloadCSV(`${cfg.title}_${todayStr()}.csv`, cols, filtered());
      toast('CSV로 내보냈습니다.');
    }

    load();
  };
}

function stat(label, value, unit, ic, tint) {
  return `<div class="stat"><div class="stat__top"><span class="stat__label">${label}</span><span class="stat__ico ico-tint-${tint}">${icon(ic, 21)}</span></div><div class="stat__value">${value}<small>${unit}</small></div></div>`;
}
function info(label, val) {
  return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:12px 14px"><div class="muted" style="font-size:12px">${escapeHtml(label)}</div><div style="font-weight:700;margin-top:2px">${escapeHtml(val)}</div></div>`;
}

// 수입검사 — 입고완료된 입고 리스트 + 행별 [수입검사] 버튼
export async function incomingInspection(root) {
  const state = { search: '', chip: '전체', from: '', to: '' };
  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>수입검사</h1><p>자재입고관리에서 입고완료된 건을 대상으로 검사기준에 따라 수입검사를 진행합니다.</p></div>
      <div class="page-head__actions"><button class="btn" id="ii-refresh">${icon('refresh', 16)} 새로고침</button></div>
    </div>
    <div id="ii-stats"></div>
    <div class="card">
      <div class="toolbar"><div class="search-box grow">${icon('search', 16)}<input id="ii-search" placeholder="입고번호·거래처·품명·LOT 검색" autocomplete="off"/></div>${dateRangeHTML('입고일')}</div>
      <div class="toolbar" style="border-top:0;padding-top:12px"><div class="chips" id="ii-chips"></div></div>
      <div class="table-wrap"><div id="ii-table"><div class="spinner"></div></div></div>
    </div>`;
  root.querySelector('#ii-refresh').onclick = () => reload();
  root.querySelector('#ii-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });
  wireDateRange(root, state, () => renderTable());

  let rows = [];
  async function loadData() {
    const [inbounds, insp] = await Promise.all([
      db.all('material_inbounds', {}), db.all('incoming_inspections', {}),
    ]);
    const inspByInbound = {}; for (const r of insp) if (r.inbound_no) inspByInbound[r.inbound_no] = r;
    rows = inbounds.filter(m => m.status === '입고완료').map(m => {
      const r = inspByInbound[m.inbound_no];
      const qty = (m.actual_qty != null && m.actual_qty !== '') ? +m.actual_qty : +m.inbound_qty || 0;
      return {
        inbound_no: m.inbound_no, inbound_date: m.inbound_date, partner: m.partner, item_code: m.item_code, item_name: m.item_name,
        lot_no: m.lot_no, qty, inspected: !!r, result: r ? r.result : '', inspect_no: r ? r.inspect_no : '', inspect_date: r ? r.inspect_date : '',
      };
    }).sort((a, b) => (a.inspected === b.inspected ? 0 : a.inspected ? 1 : -1) || String(b.inbound_date).localeCompare(String(a.inbound_date)));
  }
  function scoped() {
    let out = rows;
    if (state.chip === '미검사') out = out.filter(r => !r.inspected);
    else if (state.chip === '검사완료') out = out.filter(r => r.inspected);
    if (state.from || state.to) out = out.filter(r => inDateRange(r.inbound_date, state));
    if (state.search) { const q = state.search.toLowerCase(); out = out.filter(r => [r.inbound_no, r.partner, r.item_name, r.lot_no].some(v => String(v ?? '').toLowerCase().includes(q))); }
    return out;
  }
  function renderStats() {
    const done = rows.filter(r => r.inspected); const pass = done.filter(r => r.result === '합격').length;
    const rate = done.length ? ((pass / done.length) * 100).toFixed(1) : '0.0';
    root.querySelector('#ii-stats').innerHTML = `<div class="stat-grid">
      ${stat('검사 대상', num(rows.length), '건', 'shield', 'brand')}
      ${stat('검사완료', num(done.length), '건', 'checkCircle', 'green')}
      ${stat('미검사', num(rows.length - done.length), '건', 'clock', 'amber')}
      ${stat('합격률', rate, '%', 'trendUp', 'violet')}</div>`;
  }
  function renderChips() {
    const wrap = root.querySelector('#ii-chips');
    const opts = [['전체', rows.length], ['미검사', rows.filter(r => !r.inspected).length], ['검사완료', rows.filter(r => r.inspected).length]];
    wrap.innerHTML = opts.map(([t, c]) => `<button class="chip ${state.chip === t ? 'active' : ''}" data-c="${t}">${t}<span class="chip__count">${c}</span></button>`).join('');
    wrap.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { state.chip = b.dataset.c; renderChips(); renderTable(); });
  }
  function renderTable() {
    const list = scoped(); const slot = root.querySelector('#ii-table');
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:50px">${icon('inbox', 48)}<h4>대상 입고건이 없습니다</h4><p>자재입고관리에서 <b>입고완료</b>된 건이 여기에 표시됩니다.</p></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr><th>입고번호</th><th>입고일</th><th>거래처</th><th>품명</th><th>LOT</th><th class="num">수량</th><th class="center">검사상태</th><th>검사일</th><th class="center" style="width:130px">검사</th></tr></thead>
      <tbody>${list.map(r => `<tr>
        <td class="cell-code">${escapeHtml(r.inbound_no)}</td><td>${fmtDate(r.inbound_date)}</td><td>${escapeHtml(r.partner || '')}</td>
        <td class="cell-strong">${escapeHtml(r.item_name || '')}</td><td class="cell-code">${escapeHtml(r.lot_no || '')}</td><td class="num mono">${num(r.qty)}</td>
        <td class="center">${r.inspected ? badge(r.result || '검사완료', r.result === '합격' ? 'success' : r.result === '불합격' ? 'danger' : 'warning') : badge('미검사', 'neutral')}</td>
        <td>${r.inspect_date ? fmtDate(r.inspect_date) : '<span class="muted">-</span>'}</td>
        <td class="center">${r.inspected
          ? `<button class="btn btn--sm" data-view="${escapeHtml(r.inbound_no)}">${icon('search', 14)} 결과</button>`
          : `<button class="btn btn--sm btn--primary" data-do="${escapeHtml(r.inbound_no)}">${icon('shield', 14)} 수입검사</button>`}</td>
      </tr>`).join('')}</tbody></table>`;
    slot.querySelectorAll('[data-do]').forEach(b => b.onclick = () => {
      const r = rows.find(x => x.inbound_no === b.dataset.do);
      openInspectionModal({ kind: '수입검사', table: 'incoming_inspections', docPrefix: 'II',
        preset: { refLabel: '입고번호', refValue: r.inbound_no, lot_no: r.lot_no, item_code: r.item_code, item_name: r.item_name, partner: r.partner, inspect_qty: r.qty },
        extra: { inbound_no: r.inbound_no, lot_no: r.lot_no },
        onSaved: () => reload() });
    });
    slot.querySelectorAll('[data-view]').forEach(b => b.onclick = () => openResult(rows.find(x => x.inbound_no === b.dataset.view)));
  }
  async function openResult(r) {
    let dets = []; try { dets = await db.all('inspection_details', { filters: { inspect_no: r.inspect_no } }); } catch { dets = []; }
    const body = document.createElement('div');
    body.innerHTML = `<div class="grid-2" style="margin-bottom:14px">${info('검사번호', r.inspect_no)}${info('검사일', fmtDate(r.inspect_date))}${info('입고번호', r.inbound_no)}${info('판정', r.result)}</div>
      ${dets.length ? `<div class="table-wrap"><table class="grid"><thead><tr><th>검사항목</th><th class="center">평가</th><th>기준</th><th>측정/관측</th><th class="center">판정</th></tr></thead>
        <tbody>${dets.map(d => `<tr><td class="cell-strong">${escapeHtml(d.inspect_item || '')}</td><td class="center">${badge(d.eval_method || '정량적', d.eval_method === '정성적' ? 'info' : 'neutral')}</td><td>${escapeHtml(d.spec_value ?? '')}${d.tolerance ? ` <span class="muted">/ ±${escapeHtml(d.tolerance)}</span>` : ''}</td><td class="mono">${escapeHtml(d.measured ?? '')}</td><td class="center">${d.judgment ? badge(d.judgment) : '-'}</td></tr>`).join('')}</tbody></table></div>` : `<div class="muted" style="padding:14px">항목별 상세 기록이 없습니다.</div>`}`;
    openModal({ title: `수입검사 결과 — ${escapeHtml(r.inbound_no)}`, body, wide: true, footer: `<button class="btn" data-cancel>닫기</button>`, onMount: ({ footEl, close }) => { footEl.querySelector('[data-cancel]').onclick = close; } });
  }
  async function reload() {
    try { await loadData(); renderStats(); renderChips(); renderTable(); }
    catch (e) { root.querySelector('#ii-table').innerHTML = `<div class="empty">${icon('alert', 48)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
  }
  reload();
}

// ---------- 공용: 검사기준 기반 검사 모달 (preset 품목으로 진행) ----------
// opts: { kind, table, docPrefix, preset:{order_no,item_code,item_name,partner,inspect_qty}, onSaved }
export async function openInspectionModal(opts) {
  const p = opts.preset || {};
  const users = await db.all('users', { sort: 'name' }).catch(() => []);
  const body = document.createElement('div');
  body.innerHTML = `
    <form id="ins-form" class="form-grid">
      <div class="field"><label>검사일 <span class="req">*</span></label><input class="input" name="inspect_date" type="date" value="${todayStr()}"></div>
      <div class="field"><label>${escapeHtml(p.refLabel || '참조번호')}</label><input class="input" value="${escapeHtml(p.refValue || '')}" readonly></div>
      ${p.lot_no ? `<div class="field"><label>LOT</label><input class="input" value="${escapeHtml(p.lot_no)}" readonly></div>` : ''}
      <div class="field"><label>품목</label><input class="input" value="${escapeHtml(p.item_code || '')} · ${escapeHtml(p.item_name || '')}" readonly></div>
      <div class="field"><label>거래처</label><input class="input" value="${escapeHtml(p.partner || '')}" readonly></div>
      <div class="field"><label>검사수량</label><input class="input" name="inspect_qty" type="number" value="${p.inspect_qty || 0}"></div>
      <div class="field"><label>양품수량</label><input class="input" name="good_qty" type="number" value="${p.inspect_qty || 0}"></div>
      <div class="field"><label>불량수량</label><input class="input" name="defect_qty" type="number" value="0"></div>
      <div class="field"><label>검사자</label><select class="select" name="inspector"><option value="">선택</option>
        ${users.map(u => `<option value="${escapeHtml(u.name)}">${escapeHtml(u.name)}${u.department ? ` (${escapeHtml(u.department)})` : ''}</option>`).join('')}</select></div>
    </form>
    <h4 style="margin:18px 0 10px;display:flex;align-items:center;gap:8px">${icon('shield', 18)} 검사기준 평가</h4>
    <div id="ins-criteria"></div>
    <div class="flex between" style="margin-top:14px;padding:12px 16px;background:var(--surface-2);border-radius:10px"><b>종합 판정</b><span id="ins-result-badge">${badge('대기', 'neutral')}</span></div>`;

  const form = body.querySelector('#ins-form');
  let criteria = [];
  async function loadCriteria() {
    const slot = body.querySelector('#ins-criteria');
    let stds = [];
    try { stds = await db.all('inspection_standards', { filters: { item_code: p.item_code, inspect_type: opts.kind }, sort: 'std_no' }); } catch { stds = []; }
    stds = stds.filter(s => s.use_yn !== false);
    if (!stds.length) {
      slot.innerHTML = `<div class="empty" style="padding:20px">${icon('alert', 40)}<h4>등록된 검사기준이 없습니다</h4><p>검사기준관리에서 이 품목의 <b>${escapeHtml(opts.kind)}</b> 기준을 먼저 등록하세요. (종합판정 수동 선택)</p>
        <select class="select" id="ins-manual" style="max-width:200px;margin:10px auto 0"><option value="합격">합격</option><option value="불합격">불합격</option><option value="조건부합격">조건부합격</option></select></div>`;
      slot.querySelector('#ins-manual').onchange = updateResult; updateResult(); return;
    }
    slot.innerHTML = `<div class="table-wrap"><table class="grid">
      <thead><tr><th>검사항목</th><th class="center">평가</th><th>기준</th><th>측정/관측</th><th class="center">판정</th></tr></thead>
      <tbody>${stds.map((s, i) => {
        const quant = (s.eval_method || '정량적') === '정량적';
        const input = quant ? `<input class="input" data-cidx="${i}" type="number" step="any" placeholder="측정값">` : `<select class="select" data-cidx="${i}"><option value="">판정</option><option value="OK">OK</option><option value="NG">NG</option></select>`;
        const spec = quant ? `${escapeHtml(s.spec_value ?? '')}${s.tolerance ? ` <span class="muted">/ ±${escapeHtml(s.tolerance)}</span>` : ''}` : `<span class="muted">${escapeHtml(s.spec_value || 'OK/NG')}</span>`;
        return `<tr><td class="cell-strong">${escapeHtml(s.inspect_item || '')}</td><td class="center">${badge(s.eval_method || '정량적', quant ? 'neutral' : 'info')}</td><td>${spec}</td><td>${input}</td><td class="center" data-judge="${i}">-</td></tr>`;
      }).join('')}</tbody></table></div>`;
    criteria = stds.map((s, i) => ({ std: s, idx: i }));
    slot.querySelectorAll('[data-cidx]').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => judgeRow(+el.dataset.cidx)));
    criteria.forEach(c => judgeRow(c.idx));
  }
  function judgeRow(i) {
    const c = criteria[i]; if (!c) return;
    const el = body.querySelector(`[data-cidx="${i}"]`); const cell = body.querySelector(`[data-judge="${i}"]`);
    const quant = (c.std.eval_method || '정량적') === '정량적';
    const j = quant ? (el.value === '' ? null : judgeQuant(c.std.spec_value, c.std.tolerance, el.value)) : (el.value || null);
    c.judgment = j; c.measured = el.value; cell.innerHTML = j ? badge(j) : '-'; updateResult();
  }
  function updateResult() {
    const b = body.querySelector('#ins-result-badge');
    if (criteria.length) {
      if (criteria.filter(c => c.judgment).length < criteria.length) { b.innerHTML = badge('검사중', 'warning'); body._result = null; return; }
      body._result = criteria.every(c => c.judgment === 'OK') ? '합격' : '불합격'; b.innerHTML = badge(body._result);
    } else { const m = body.querySelector('#ins-manual'); body._result = m ? m.value : '합격'; b.innerHTML = badge(body._result); }
  }

  openModal({
    title: `${opts.kind} 진행 — ${escapeHtml(p.item_name || '')}`, body, wide: true,
    footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 검사 저장</button>`,
    onMount: ({ footEl, close }) => {
      loadCriteria();
      footEl.querySelector('[data-cancel]').onclick = close;
      footEl.querySelector('[data-ok]').onclick = async () => {
        if (criteria.length && body._result == null) { toast('모든 검사항목을 평가하세요.', 'error'); return; }
        const g = (n) => { const el = form.querySelector(`[name="${n}"]`); return el ? el.value : ''; };
        const result = body._result || '합격';
        try {
          const all = await db.all(opts.table, {});
          const inspect_no = nextDocNo(opts.docPrefix, all.map(x => x.inspect_no));
          const header = { inspect_no, inspect_date: g('inspect_date') || todayStr(), partner: p.partner || '',
            item_code: p.item_code, item_name: p.item_name, inspect_qty: Number(g('inspect_qty')) || 0,
            good_qty: Number(g('good_qty')) || 0, defect_qty: Number(g('defect_qty')) || 0, inspector: g('inspector'), result, ...(opts.extra || {}) };
          await db.insert(opts.table, header);
          try { for (const c of criteria) await db.insert('inspection_details', { inspect_no, inspect_kind: opts.kind, item_code: p.item_code, inspect_item: c.std.inspect_item, eval_method: c.std.eval_method || '정량적', spec_value: c.std.spec_value, tolerance: c.std.tolerance, measured: c.measured ?? '', judgment: c.judgment || '' }); } catch { /* noop */ }
          close(); toast(`${opts.kind}(${inspect_no}) 저장 — 판정: ${result}`); opts.onSaved && opts.onSaved();
        } catch (e) { toast(e.message || '저장 실패', 'error'); }
      };
    },
  });
}

// 출하검사 — 생산완료 수주 리스트 + 행별 [출하검사] 버튼 (납품관리와 동일한 대상)
export async function shippingInspection(root) {
  const state = { search: '', chip: '전체', from: '', to: '' };
  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>출하검사</h1><p>생산이 완료된 수주를 대상으로 출하검사를 진행합니다. (기간검색은 검사일 기준)</p></div>
      <div class="page-head__actions"><button class="btn" id="si-refresh">${icon('refresh', 16)} 새로고침</button></div>
    </div>
    <div id="si-stats"></div>
    <div class="card">
      <div class="toolbar"><div class="search-box grow">${icon('search', 16)}<input id="si-search" placeholder="수주번호·거래처·품명 검색" autocomplete="off"/></div>${dateRangeHTML('검사일')}</div>
      <div class="toolbar" style="border-top:0;padding-top:12px"><div class="chips" id="si-chips"></div></div>
      <div class="table-wrap"><div id="si-table"><div class="spinner"></div></div></div>
    </div>`;
  root.querySelector('#si-refresh').onclick = () => reload();
  root.querySelector('#si-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });
  wireDateRange(root, state, () => renderTable());

  let rows = [];
  async function loadData() {
    const [orders, plans, wos, insp, dels] = await Promise.all([
      db.all('sales_orders', {}), db.all('production_plans', {}), db.all('work_orders', {}), db.all('shipping_inspections', {}), db.all('deliveries', {}),
    ]);
    const planByOrder = {}; for (const pl of plans) (planByOrder[pl.order_no] ??= []).push(pl.plan_no);
    const allWoComplete = (pns) => { const ws = wos.filter(w => pns.includes(w.plan_no)); return ws.length > 0 && ws.every(w => w.status === '완료'); };
    const prodComplete = (o) => o.status === '완료' || allWoComplete(planByOrder[o.order_no] || []);
    const inspByOrder = {}; for (const r of insp) if (r.order_no) inspByOrder[r.order_no] = r;
    const deliveredOrders = new Set(dels.filter(d => d.status === '납품완료').map(d => d.order_no));
    rows = orders.filter(prodComplete).map(o => {
      const r = inspByOrder[o.order_no];
      return { order_no: o.order_no, partner: o.partner, item_code: o.item_code, item_name: o.item_name, qty: +o.order_qty || 0,
        inspected: !!r, result: r ? r.result : '', inspect_no: r ? r.inspect_no : '', inspect_date: r ? r.inspect_date : '',
        delivery_status: deliveredOrders.has(o.order_no) ? '납품완료' : '납품대기' };
    }).sort((a, b) => (a.inspected === b.inspected ? 0 : a.inspected ? 1 : -1) || String(a.order_no).localeCompare(String(b.order_no)));
  }
  function scoped() {
    let out = rows;
    if (state.chip === '미검사') out = out.filter(r => !r.inspected);
    else if (state.chip === '검사완료') out = out.filter(r => r.inspected);
    if (state.from || state.to) out = out.filter(r => r.inspected && inDateRange(r.inspect_date, state)); // 기간 지정 시 해당 기간 검사완료 건만
    if (state.search) { const q = state.search.toLowerCase(); out = out.filter(r => [r.order_no, r.partner, r.item_name].some(v => String(v ?? '').toLowerCase().includes(q))); }
    return out;
  }
  function renderStats() {
    const done = rows.filter(r => r.inspected); const pass = done.filter(r => r.result === '합격').length;
    const rate = done.length ? ((pass / done.length) * 100).toFixed(1) : '0.0';
    root.querySelector('#si-stats').innerHTML = `<div class="stat-grid">
      ${stat('검사 대상', num(rows.length), '건', 'shield', 'brand')}
      ${stat('검사완료', num(done.length), '건', 'checkCircle', 'green')}
      ${stat('미검사', num(rows.length - done.length), '건', 'clock', 'amber')}
      ${stat('합격률', rate, '%', 'trendUp', 'violet')}</div>`;
  }
  function renderChips() {
    const wrap = root.querySelector('#si-chips');
    const opts = [['전체', rows.length], ['미검사', rows.filter(r => !r.inspected).length], ['검사완료', rows.filter(r => r.inspected).length]];
    wrap.innerHTML = opts.map(([t, c]) => `<button class="chip ${state.chip === t ? 'active' : ''}" data-c="${t}">${t}<span class="chip__count">${c}</span></button>`).join('');
    wrap.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { state.chip = b.dataset.c; renderChips(); renderTable(); });
  }
  function renderTable() {
    const list = scoped(); const slot = root.querySelector('#si-table');
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:50px">${icon('inbox', 48)}<h4>대상 수주가 없습니다</h4><p>생산이 완료된 수주가 여기에 표시됩니다.</p></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr><th>수주번호</th><th>거래처</th><th>품명</th><th class="num">수량</th><th class="center">검사상태</th><th class="center">납품상태</th><th>검사일</th><th class="center" style="width:130px">검사</th></tr></thead>
      <tbody>${list.map(r => `<tr>
        <td class="cell-code">${escapeHtml(r.order_no)}</td><td>${escapeHtml(r.partner || '')}</td><td class="cell-strong">${escapeHtml(r.item_name || '')}</td>
        <td class="num mono">${num(r.qty)}</td>
        <td class="center">${r.inspected ? badge(r.result || '검사완료', r.result === '합격' ? 'success' : r.result === '불합격' ? 'danger' : 'warning') : badge('미검사', 'neutral')}</td>
        <td class="center">${badge(r.delivery_status, r.delivery_status === '납품완료' ? 'success' : 'neutral')}</td>
        <td>${r.inspect_date ? fmtDate(r.inspect_date) : '<span class="muted">-</span>'}</td>
        <td class="center">${r.inspected
          ? `<button class="btn btn--sm" data-view="${escapeHtml(r.order_no)}">${icon('search', 14)} 결과</button>`
          : `<button class="btn btn--sm btn--primary" data-do="${escapeHtml(r.order_no)}">${icon('shield', 14)} 출하검사</button>`}</td>
      </tr>`).join('')}</tbody></table>`;
    slot.querySelectorAll('[data-do]').forEach(b => b.onclick = () => {
      const r = rows.find(x => x.order_no === b.dataset.do);
      openInspectionModal({ kind: '출하검사', table: 'shipping_inspections', docPrefix: 'SI',
        preset: { refLabel: '수주번호', refValue: r.order_no, item_code: r.item_code, item_name: r.item_name, partner: r.partner, inspect_qty: r.qty },
        extra: { order_no: r.order_no },
        onSaved: () => reload() });
    });
    slot.querySelectorAll('[data-view]').forEach(b => b.onclick = () => openResult(rows.find(x => x.order_no === b.dataset.view)));
  }
  async function openResult(r) {
    let dets = []; try { dets = await db.all('inspection_details', { filters: { inspect_no: r.inspect_no } }); } catch { dets = []; }
    const body = document.createElement('div');
    body.innerHTML = `<div class="grid-2" style="margin-bottom:14px">${info('검사번호', r.inspect_no)}${info('검사일', fmtDate(r.inspect_date))}${info('품목', `${r.item_code} ${r.item_name}`)}${info('판정', r.result)}</div>
      ${dets.length ? `<div class="table-wrap"><table class="grid"><thead><tr><th>검사항목</th><th class="center">평가</th><th>기준</th><th>측정/관측</th><th class="center">판정</th></tr></thead>
        <tbody>${dets.map(d => `<tr><td class="cell-strong">${escapeHtml(d.inspect_item || '')}</td><td class="center">${badge(d.eval_method || '정량적', d.eval_method === '정성적' ? 'info' : 'neutral')}</td><td>${escapeHtml(d.spec_value ?? '')}${d.tolerance ? ` <span class="muted">/ ±${escapeHtml(d.tolerance)}</span>` : ''}</td><td class="mono">${escapeHtml(d.measured ?? '')}</td><td class="center">${d.judgment ? badge(d.judgment) : '-'}</td></tr>`).join('')}</tbody></table></div>` : `<div class="muted" style="padding:14px">항목별 상세 기록이 없습니다.</div>`}`;
    openModal({ title: `출하검사 결과 — ${escapeHtml(r.order_no)}`, body, wide: true, footer: `<button class="btn" data-cancel>닫기</button>`, onMount: ({ footEl, close }) => { footEl.querySelector('[data-cancel]').onclick = close; } });
  }
  async function reload() {
    try { await loadData(); renderStats(); renderChips(); renderTable(); }
    catch (e) { root.querySelector('#si-table').innerHTML = `<div class="empty">${icon('alert', 48)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
  }
  reload();
}
