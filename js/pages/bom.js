// BOM관리 — 좌: 모품목 선택 / 우: 구성품(자재·반제품) + 소요량 편집(추가·삭제·저장)
import { db } from '../lib/db.js';
import { num, escapeHtml } from '../lib/format.js';
import { toast, badge } from '../ui/components.js';
import { icon } from '../ui/icons.js';

export async function bomManager(root) {
  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>BOM관리</h1><p>모품목(완제품·반제품)을 선택하고 구성품(자재·반제품)과 소요량을 등록합니다.</p></div>
    </div>
    <div style="display:grid;grid-template-columns:340px 1fr;gap:18px;align-items:start">
      <div class="card">
        <div class="toolbar" style="flex-direction:column;align-items:stretch;gap:10px">
          <div class="chips" id="bom-tabs"></div>
          <div class="search-box grow">${icon('search', 16)}<input id="bom-search" placeholder="품목코드·품명 검색" autocomplete="off"/></div>
        </div>
        <div id="bom-items" style="max-height:60vh;overflow-y:auto"></div>
      </div>
      <div class="card" id="bom-editor"><div class="card__body"><div class="empty" style="padding:80px 20px">${icon('layers', 52)}<h4>모품목을 선택하세요</h4><p>왼쪽에서 품목을 선택하면 BOM(구성품)을 편집할 수 있습니다.</p></div></div></div>
    </div>`;

  const [items, allBoms] = await Promise.all([
    db.all('items', { sort: 'code' }),
    db.all('boms', {}).catch(() => []),
  ]);
  // 모품목 후보: 완제품/반제품 (그 외 품목도 선택 가능하게 전체 노출하되 정렬은 유형 우선)
  const itemByCode = Object.fromEntries(items.map(i => [i.code, i]));

  const state = { code: null, rows: [], removedIds: [], counts: {}, allBoms, tab: '완제품' };
  for (const b of allBoms) state.counts[b.item_code] = (state.counts[b.item_code] || 0) + 1;

  const TABS = ['완제품', '반제품'];
  const tabsSlot = root.querySelector('#bom-tabs');
  function renderTabs() {
    tabsSlot.innerHTML = TABS.map(t => {
      const cnt = items.filter(i => i.item_type === t).length;
      return `<button class="chip ${state.tab === t ? 'active' : ''}" data-tab="${t}">${t}<span class="chip__count">${cnt}</span></button>`;
    }).join('');
    tabsSlot.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; renderTabs(); renderItems(root.querySelector('#bom-search').value.trim()); });
  }

  const itemsSlot = root.querySelector('#bom-items');
  function renderItems(filter = '') {
    const q = filter.toLowerCase();
    const list = items.filter(i => i.item_type === state.tab)
      .filter(i => !q || [i.code, i.name, i.spec].some(v => String(v ?? '').toLowerCase().includes(q)));
    if (!list.length) { itemsSlot.innerHTML = `<div class="empty" style="padding:40px 12px">${icon('inbox', 40)}<h4>${escapeHtml(state.tab)}이 없습니다</h4><p>품목관리에서 먼저 등록하세요.</p></div>`; return; }
    itemsSlot.innerHTML = list.map(i => `
      <div class="rt-item ${state.code === i.code ? 'active' : ''}" data-code="${escapeHtml(i.code)}"
        style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer">
        <div style="flex:1;min-width:0">
          <div class="flex" style="gap:8px"><span class="cell-code">${escapeHtml(i.code)}</span><span class="badge badge--neutral" style="height:20px">${escapeHtml(i.item_type || '')}</span></div>
          <div style="font-weight:700;margin-top:3px">${escapeHtml(i.name)}</div>
        </div>
        ${state.counts[i.code] ? `<span class="badge badge--brand">${state.counts[i.code]}개</span>` : `<span class="muted">미등록</span>`}
      </div>`).join('');
    itemsSlot.querySelectorAll('[data-code]').forEach(el => el.onclick = () => selectItem(el.dataset.code));
  }

  async function selectItem(code) {
    state.code = code; state.removedIds = [];
    renderItems(root.querySelector('#bom-search').value.trim());
    const editor = root.querySelector('#bom-editor');
    editor.innerHTML = `<div class="card__body"><div class="spinner"></div></div>`;
    let rows = [];
    try {
      rows = await db.all('boms', { filters: { item_code: code }, sort: 'component_code' });
      state.allBoms = await db.all('boms', {}); // 다단계 전개용 최신화
    }
    catch (e) { editor.innerHTML = `<div class="card__body">${/boms|relation|does not exist|schema cache/i.test(e.message || '') ? migrationBox() : `<div class="empty">${icon('alert', 48)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`}</div>`; return; }
    state.rows = rows.map(r => ({ ...r }));
    renderEditor();
  }

  function renderEditor() {
    const item = itemByCode[state.code];
    const editor = root.querySelector('#bom-editor');
    state.rows.sort((a, b) => String(a.component_code).localeCompare(String(b.component_code)));
    // 모품목 유형에 따른 구성품 허용 유형
    //  - 반제품: 원자재·부자재만
    //  - 완제품: 반제품·원자재·부자재 (완제품끼리 구성 불가)
    state.allowTypes = item.item_type === '반제품' ? ['원자재', '부자재'] : ['반제품', '원자재', '부자재'];
    const placeholder = item.item_type === '반제품' ? '구성품(원자재·부자재) 선택…' : '구성품(반제품·원자재·부자재) 선택…';
    const compOptions = items.filter(i => i.code !== state.code && state.allowTypes.includes(i.item_type))
      .map(i => `<option value="${escapeHtml(i.code)}">${escapeHtml(i.code)} · ${escapeHtml(i.name)} (${escapeHtml(i.item_type || '')})</option>`).join('');

    editor.innerHTML = `
      <div class="card__head">
        <div><div class="flex" style="gap:8px"><span class="cell-code" style="font-size:14px">${escapeHtml(item.code)}</span><span class="badge badge--neutral">${escapeHtml(item.item_type || '')}</span></div>
          <h3 style="margin-top:4px">${escapeHtml(item.name)} BOM</h3></div>
        <div class="spacer"></div>
        <button class="btn btn--primary" id="bom-save">${icon('check', 16)} 저장</button>
      </div>
      <div class="card__body">
        <div class="muted" style="margin-bottom:10px">구성 가능 유형: <b>${state.allowTypes.join(' · ')}</b></div>
        <div class="flex" style="gap:10px;margin-bottom:14px">
          <select class="select" id="bom-add-comp" style="max-width:360px"><option value="">${placeholder}</option>${compOptions}</select>
          <button class="btn" id="bom-add">${icon('plus', 16)} 구성품 추가</button>
          <div class="spacer"></div><span class="muted">총 ${state.rows.length}개 구성품</span>
        </div>
        <div class="table-wrap"><table class="grid" id="bom-table">
          <thead><tr><th>구성품코드</th><th>구성품명</th><th>유형</th><th class="num" style="width:130px">소요량</th><th class="center" style="width:80px">단위</th><th style="width:180px">비고</th><th class="center" style="width:60px"></th></tr></thead>
          <tbody></tbody>
        </table></div>
        ${!state.rows.length ? `<div class="empty" style="padding:40px">${icon('layers', 44)}<h4>등록된 구성품이 없습니다</h4><p>위에서 구성품을 선택해 추가하세요.</p></div>` : ''}

        <h4 style="margin:22px 0 10px;display:flex;align-items:center;gap:8px;border-top:1px solid var(--border);padding-top:18px">${icon('layers', 18)} BOM 전개 (완제품 → 반제품 → 원자재)</h4>
        ${treeView(item)}
      </div>`;

    renderRows();
    editor.querySelector('#bom-add').onclick = addComp;
    editor.querySelector('#bom-save').onclick = save;
  }

  // 다단계 BOM 전개 트리 (현재 편집중인 구성품은 저장 전이라 state.rows 우선 사용)
  function childrenOf(code) {
    if (code === state.code) return state.rows.map(r => ({ component_code: r.component_code, component_name: r.component_name, qty: r.qty, unit: r.unit }));
    return state.allBoms.filter(b => b.item_code === code);
  }
  function treeView(item) {
    const rows = [];
    (function walk(code, qtyPer, depth, path) {
      for (const c of childrenOf(code)) {
        if (path.has(c.component_code)) continue; // 순환 방지
        const it = itemByCode[c.component_code] || {};
        const q = qtyPer * (+c.qty || 0);
        rows.push({ depth, code: c.component_code, name: c.component_name || it.name || '', type: it.item_type || '', qty: q, unit: c.unit || it.unit || 'EA', hasChild: state.allBoms.some(b => b.item_code === c.component_code) || c.component_code === state.code });
        walk(c.component_code, q, depth + 1, new Set([...path, c.component_code]));
      }
    })(state.code, 1, 0, new Set([state.code]));

    const tone = (t) => t === '완제품' ? 'brand' : t === '반제품' ? 'info' : t === '원자재' ? 'warning' : 'neutral';
    const rootRow = `<div class="flex" style="gap:8px;padding:8px 6px;font-weight:800">${icon('package', 16)}<span class="cell-code">${escapeHtml(item.code)}</span> ${escapeHtml(item.name)} ${badge(item.item_type || '완제품', tone(item.item_type))}<span class="muted" style="margin-left:auto">1 ${escapeHtml(item.unit || 'EA')}</span></div>`;
    if (!rows.length) return `<div style="border:1px solid var(--border);border-radius:12px;padding:10px 14px">${rootRow}<div class="muted" style="padding:8px 6px 4px">구성품이 없습니다. 위에서 추가 후 저장하면 하위 전개가 표시됩니다.</div></div>`;
    const body = rows.map(r => `
      <div class="flex" style="gap:8px;padding:7px 6px;border-top:1px solid var(--border)">
        <span style="display:inline-block;width:${r.depth * 24}px;flex-shrink:0"></span>
        <span style="color:var(--text-3)">${'└ '}</span>
        <span class="cell-code">${escapeHtml(r.code)}</span>
        <span style="font-weight:600">${escapeHtml(r.name)}</span>
        ${badge(r.type || '구성품', tone(r.type))}
        <span class="muted mono" style="margin-left:auto">${num(r.qty)} ${escapeHtml(r.unit)}</span>
      </div>`).join('');
    return `<div style="border:1px solid var(--border);border-radius:12px;padding:6px 14px 10px">${rootRow}${body}<div class="muted" style="margin-top:8px;font-size:11.5px">※ 소요량은 모품목 1개 기준 누적 소요량입니다.</div></div>`;
  }

  function renderRows() {
    const tbody = root.querySelector('#bom-table tbody');
    if (!tbody) return;
    tbody.innerHTML = state.rows.map((r, idx) => {
      const it = itemByCode[r.component_code] || {};
      return `<tr>
        <td class="cell-code">${escapeHtml(r.component_code)}</td>
        <td class="cell-strong">${escapeHtml(r.component_name || it.name || '')}</td>
        <td>${escapeHtml(it.item_type || '')}</td>
        <td class="num"><input class="input mono" style="text-align:right" type="number" step="any" value="${escapeHtml(r.qty ?? 0)}" data-idx="${idx}" data-f="qty"></td>
        <td class="center">${escapeHtml(r.unit || it.unit || 'EA')}</td>
        <td><input class="input" value="${escapeHtml(r.remark ?? '')}" data-idx="${idx}" data-f="remark" placeholder="-"></td>
        <td class="center"><button class="icon-btn" data-del="${idx}" title="삭제">${icon('trash', 15)}</button></td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-idx]').forEach(el => el.addEventListener('input', () => {
      const r = state.rows[+el.dataset.idx];
      r[el.dataset.f] = el.dataset.f === 'qty' ? (el.value === '' ? null : Number(el.value)) : el.value;
    }));
    tbody.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const r = state.rows[+b.dataset.del];
      if (r.id) state.removedIds.push(r.id);
      state.rows.splice(+b.dataset.del, 1);
      renderEditor();
    });
  }

  function addComp() {
    const sel = root.querySelector('#bom-add-comp');
    const code = sel.value;
    if (!code) { toast('추가할 구성품을 선택하세요.', 'error'); return; }
    if (state.rows.some(r => r.component_code === code)) { toast('이미 추가된 구성품입니다.', 'error'); return; }
    const it = itemByCode[code] || {};
    if (state.allowTypes && !state.allowTypes.includes(it.item_type)) { toast(`${it.item_type} 은(는) 구성품으로 추가할 수 없습니다. (가능: ${state.allowTypes.join('·')})`, 'error'); return; }
    state.rows.push({ item_code: state.code, component_code: code, component_name: it.name || code, qty: 1, unit: it.unit || 'EA', remark: '' });
    sel.value = '';
    renderEditor();
  }

  async function save() {
    if (!state.code) return;
    const btn = root.querySelector('#bom-save');
    btn.disabled = true; btn.innerHTML = '저장 중…';
    try {
      for (const id of state.removedIds) await db.remove('boms', id);
      state.removedIds = [];
      for (const r of state.rows) {
        const it = itemByCode[r.component_code] || {};
        const payload = { item_code: state.code, component_code: r.component_code, component_name: r.component_name || it.name || '', qty: +r.qty || 0, unit: r.unit || it.unit || 'EA', remark: r.remark || '' };
        if (r.id) await db.update('boms', r.id, payload);
        else await db.insert('boms', payload);
      }
      state.counts[state.code] = state.rows.length;
      toast('BOM이 저장되었습니다.');
      await selectItem(state.code);
    } catch (e) {
      toast(e.message || '저장 실패', 'error');
      btn.disabled = false; btn.innerHTML = '저장';
    }
  }

  renderTabs();
  renderItems();
  root.querySelector('#bom-search').addEventListener('input', (e) => renderItems(e.target.value.trim()));
}

function migrationBox() {
  return `<div class="empty" style="padding:40px 20px">${icon('database', 52)}<h4>BOM 테이블이 아직 생성되지 않았습니다</h4><p>Supabase SQL Editor에서 <b>supabase/migration_bom.sql</b> 을 실행한 뒤 다시 시도하세요.<br/>(데모 모드에서는 자동으로 동작합니다.)</p></div>`;
}
