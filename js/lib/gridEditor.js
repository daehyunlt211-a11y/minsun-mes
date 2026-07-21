// =====================================================================
// 인라인 편집 그리드 — 마스터-디테일 상세표 공용 컴포넌트
//   검사규격 항목 / PFMEA / PFD / 관리계획서 / 작업표준서 / R&R 측정값 등
//   · 행 추가·삭제·순서변경, 셀 직접 입력, 엑셀 붙여넣기, 계산식 자동반영
// =====================================================================
import { db } from './db.js';
import { escapeHtml } from './format.js';
import { toast, confirmDialog } from '../ui/components.js';
import { icon } from '../ui/icons.js';

// cols: [{ key, label, type:'text'|'number'|'select'|'textarea'|'check', width, options, readonly, calc(row), placeholder, align }]
// opts: { table, parentKey, parentValue, seqKey='seq', title, emptyText, onChanged, rowDefaults, maxRows }
export function createGridEditor(mount, cols, opts) {
  const seqKey = opts.seqKey || 'seq';
  let rows = [];
  let dirty = false;

  mount.innerHTML = `
    <div class="ge">
      <div class="ge__bar">
        <b>${escapeHtml(opts.title || '상세 항목')}</b>
        <span class="ge__count" data-ge-count></span>
        <div class="spacer"></div>
        ${opts.extraButtons || ''}
        <button class="btn btn--sm" data-ge-paste title="엑셀에서 복사한 표를 붙여넣습니다">${icon('upload', 14)} 엑셀 붙여넣기</button>
        <button class="btn btn--sm" data-ge-add>${icon('plus', 14)} 행 추가</button>
        <button class="btn btn--sm btn--primary" data-ge-save>${icon('check', 14)} 저장</button>
      </div>
      <div class="table-wrap"><div data-ge-table></div></div>
    </div>`;

  const tableSlot = mount.querySelector('[data-ge-table]');
  const countEl = mount.querySelector('[data-ge-count]');

  async function load() {
    if (!opts.parentValue) { rows = []; render(); return; }
    try {
      rows = await db.all(opts.table, { filters: { [opts.parentKey]: opts.parentValue }, sort: seqKey });
    } catch { rows = []; }
    rows.sort((a, b) => (+a[seqKey] || 0) - (+b[seqKey] || 0));
    dirty = false;
    render();
  }

  function cellHtml(c, r, i) {
    const v = r[c.key];
    if (c.readonly || c.calc) {
      const val = c.calc ? c.calc(r) : v;
      return `<span class="ge__ro ${c.tone ? c.tone(r) : ''}" data-ge-ro="${i}-${c.key}">${escapeHtml(val ?? '')}</span>`;
    }
    if (c.type === 'select') {
      const options = typeof c.options === 'function' ? c.options(r) : (c.options || []);
      return `<select class="ge__in" data-ge-cell="${i}" data-ge-key="${c.key}">
        ${c.placeholder ? `<option value="">${escapeHtml(c.placeholder)}</option>` : ''}
        ${options.map(o => {
          const val = typeof o === 'object' ? o.value : o;
          const lb = typeof o === 'object' ? o.label : o;
          return `<option value="${escapeHtml(val)}" ${String(val) === String(v ?? '') ? 'selected' : ''}>${escapeHtml(lb)}</option>`;
        }).join('')}</select>`;
    }
    if (c.type === 'check') {
      return `<input type="checkbox" class="checkbox" data-ge-cell="${i}" data-ge-key="${c.key}" ${v ? 'checked' : ''}>`;
    }
    if (c.type === 'textarea') {
      return `<textarea class="ge__in ge__in--area" data-ge-cell="${i}" data-ge-key="${c.key}" rows="2" placeholder="${escapeHtml(c.placeholder || '')}">${escapeHtml(v ?? '')}</textarea>`;
    }
    const t = c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text';
    return `<input class="ge__in" type="${t}" ${c.type === 'number' ? 'step="any"' : ''} data-ge-cell="${i}" data-ge-key="${c.key}" value="${escapeHtml(v ?? '')}" placeholder="${escapeHtml(c.placeholder || '')}">`;
  }

  function render() {
    countEl.textContent = rows.length ? `${rows.length}건${dirty ? ' · 저장 필요' : ''}` : '';
    countEl.className = 'ge__count' + (dirty ? ' ge__count--dirty' : '');
    if (!rows.length) {
      tableSlot.innerHTML = `<div class="empty" style="padding:34px">${icon('inbox', 42)}<h4>${escapeHtml(opts.emptyText || '등록된 항목이 없습니다')}</h4><p>[행 추가] 또는 [엑셀 붙여넣기]로 입력하세요.</p></div>`;
      return;
    }
    tableSlot.innerHTML = `<table class="grid ge__table"><thead><tr>
        <th class="center" style="width:38px">순번</th>
        ${cols.map(c => `<th class="${c.align === 'center' ? 'center' : c.type === 'number' ? 'num' : ''}" ${c.width ? `style="width:${c.width}"` : ''}>${escapeHtml(c.label)}</th>`).join('')}
        <th class="center" style="width:76px">관리</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr data-ge-row="${i}">
        <td class="center mono">${r[seqKey] ?? (i + 1) * 10}</td>
        ${cols.map(c => `<td class="${c.align === 'center' ? 'center' : ''}">${cellHtml(c, r, i)}</td>`).join('')}
        <td class="center"><div class="row-actions">
          <button class="icon-btn" data-ge-up="${i}" title="위로">${icon('chevronDown', 14)}</button>
          <button class="icon-btn" data-ge-del="${i}" title="삭제">${icon('trash', 14)}</button>
        </div></td></tr>`).join('')}</tbody></table>`;

    tableSlot.querySelectorAll('[data-ge-cell]').forEach(el => {
      const ev = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
      el.addEventListener(ev, () => {
        const i = +el.dataset.geCell, key = el.dataset.geKey;
        const col = cols.find(c => c.key === key);
        rows[i][key] = el.type === 'checkbox' ? el.checked : (col?.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value);
        dirty = true;
        refreshCalc(i);
        countEl.textContent = `${rows.length}건 · 저장 필요`;
        countEl.className = 'ge__count ge__count--dirty';
      });
    });
    tableSlot.querySelectorAll('[data-ge-del]').forEach(b => b.onclick = () => {
      rows.splice(+b.dataset.geDel, 1); resequence(); dirty = true; render();
    });
    tableSlot.querySelectorAll('[data-ge-up]').forEach(b => b.onclick = () => {
      const i = +b.dataset.geUp; if (i === 0) return;
      [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; resequence(); dirty = true; render();
    });
  }

  // 계산 컬럼만 갱신 (전체 리렌더 없이 포커스 유지)
  function refreshCalc(i) {
    for (const c of cols) {
      if (!c.calc) continue;
      const el = tableSlot.querySelector(`[data-ge-ro="${i}-${c.key}"]`);
      if (el) { el.textContent = c.calc(rows[i]) ?? ''; if (c.tone) el.className = `ge__ro ${c.tone(rows[i])}`; }
    }
  }
  function resequence() { rows.forEach((r, i) => { r[seqKey] = (i + 1) * 10; }); }

  mount.querySelector('[data-ge-add]').onclick = () => {
    if (opts.maxRows && rows.length >= opts.maxRows) { toast(`최대 ${opts.maxRows}행까지 입력할 수 있습니다.`, 'error'); return; }
    rows.push({ ...(opts.rowDefaults || {}), [opts.parentKey]: opts.parentValue, [seqKey]: (rows.length + 1) * 10 });
    dirty = true; render();
  };

  // 엑셀(탭 구분) 붙여넣기 — 편집 가능 컬럼 순서대로 매핑
  mount.querySelector('[data-ge-paste]').onclick = () => {
    const editable = cols.filter(c => !c.readonly && !c.calc);
    const ta = document.createElement('textarea');
    ta.className = 'textarea';
    ta.rows = 8;
    ta.placeholder = `엑셀에서 복사한 셀을 붙여넣으세요 (탭 구분)\n컬럼 순서: ${editable.map(c => c.label).join(' → ')}`;
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="muted" style="margin-bottom:8px">컬럼 순서: <b>${editable.map(c => escapeHtml(c.label)).join(' · ')}</b></div>`;
    wrap.appendChild(ta);
    import('../ui/components.js').then(({ openModal }) => {
      openModal({
        title: '엑셀 붙여넣기', body: wrap, wide: true,
        footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 적용</button>`,
        onMount: ({ footEl, close }) => {
          footEl.querySelector('[data-cancel]').onclick = close;
          footEl.querySelector('[data-ok]').onclick = () => {
            const lines = ta.value.split('\n').map(l => l.trim()).filter(Boolean);
            if (!lines.length) { close(); return; }
            for (const line of lines) {
              const cells = line.split('\t');
              const row = { ...(opts.rowDefaults || {}), [opts.parentKey]: opts.parentValue, [seqKey]: (rows.length + 1) * 10 };
              editable.forEach((c, ci) => {
                const raw = (cells[ci] ?? '').trim();
                row[c.key] = c.type === 'number' ? (raw === '' ? null : Number(raw)) : raw;
              });
              rows.push(row);
            }
            dirty = true; close(); render(); toast(`${lines.length}행이 추가되었습니다. [저장]을 눌러 반영하세요.`);
          };
        },
      });
    });
  };

  mount.querySelector('[data-ge-save]').onclick = () => save();

  async function save() {
    if (!opts.parentValue) { toast('먼저 상위 항목을 선택하세요.', 'error'); return; }
    try {
      const existing = await db.all(opts.table, { filters: { [opts.parentKey]: opts.parentValue } }).catch(() => []);
      const keepIds = new Set(rows.filter(r => r.id).map(r => r.id));
      for (const e of existing) if (!keepIds.has(e.id)) await db.remove(opts.table, e.id);
      for (const r of rows) {
        const payload = { ...r };
        delete payload.created_at; delete payload.updated_at;
        payload[opts.parentKey] = opts.parentValue;
        if (opts.beforeSaveRow) opts.beforeSaveRow(payload, rows.indexOf(r));
        if (r.id) { const id = r.id; delete payload.id; await db.update(opts.table, id, payload); }
        else { delete payload.id; const created = await db.insert(opts.table, payload); r.id = created?.id; }
      }
      dirty = false; toast('저장되었습니다.');
      await load();
      opts.onChanged?.(rows);
    } catch (e) { toast(e.message || '저장 실패', 'error'); }
  }

  return {
    load,
    reload: (parentValue) => { opts.parentValue = parentValue; return load(); },
    getRows: () => rows,
    setRows: (r) => { rows = r; dirty = true; render(); },
    isDirty: () => dirty,
    save,
  };
}
