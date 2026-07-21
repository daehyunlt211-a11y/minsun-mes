// =====================================================================
// 공구 및 툴관리 — 기준정보 / 입고 / 재고 / 출고 / 재고조정 / 폐기
//   · QR코드 발행, 기준수명(횟수·수량·시간), 점검주기, 적용 품목·공정·설비
//   · 출고: QR스캔 → 작업자 → 작업지시·설비 → 수명초과 공구 출고 제한
//   · 재고조정: 전산 vs 실사, 승인 후 반영
// =====================================================================
import { createCrudPage } from '../lib/crud.js';
import { db } from '../lib/db.js';
import { num, won, fmtDate, todayStr, escapeHtml, nextDocNo, downloadCSV } from '../lib/format.js';
import { badge, toast, openModal, confirmDialog } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { barcodeSVG, printSheet } from '../lib/barcode.js';

const TOOL_CLASSES = ['공구', '치공구', '지그', '게이지'];
const LIFE_UNITS = ['횟수', '수량', '시간'];
const CHECK_CYCLES = ['일상', '주간', '월간', '분기', '반기'];
const ADJ_REASONS = ['실사차이', '분실', '파손', '오등록', '이관', '기타'];
const DISPOSAL_REASONS = ['수명초과', '파손', '마모', '정밀도 저하', '기타'];

function stat(label, value, unit, ic, tint) {
  return `<div class="stat"><div class="stat__top"><span class="stat__label">${escapeHtml(label)}</span><span class="stat__ico ico-tint-${tint}">${icon(ic, 21)}</span></div><div class="stat__value">${value}${unit ? `<small>${escapeHtml(unit)}</small>` : ''}</div></div>`;
}
function info(label, val) {
  return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:11px 13px"><div class="muted" style="font-size:11.5px">${escapeHtml(label)}</div><div style="font-weight:700;margin-top:2px">${escapeHtml(val ?? '')}</div></div>`;
}

// 공구 QR 라벨 인쇄
export function printToolQR(tools) {
  const list = Array.isArray(tools) ? tools : [tools];
  printSheet('공구 QR 라벨', `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">
    ${list.map(t => `<div style="border:2px solid #000;padding:10px;text-align:center">
      <div style="font-weight:700;font-size:13px;margin-bottom:4px">${t.name || ''}</div>
      <div style="font-family:monospace;font-size:11px;margin-bottom:6px">${t.code || ''}</div>
      ${barcodeSVG(t.qr_code || t.code || '', { height: 40, narrow: 1.6 })}
      <div style="font-size:10px;color:#444;margin-top:4px">${t.spec || ''} / 수명 ${t.life_count || 0}${t.life_unit || '횟수'}</div>
      <div style="font-size:10px;color:#444">${t.location || ''}</div>
    </div>`).join('')}</div>`);
}

// =====================================================================
// 5-1 기준정보등록 (공구 마스터)
// =====================================================================
export async function toolMaster(root) {
  const state = { search: '', fClass: '__all__', fStatus: '__all__', selected: null };
  let tools = [], items = [], processes = [], equipments = [];

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>공구 기준정보</h1><p>공구·치공구를 등록하고 적용 품목·공정·설비, 기준수명, 점검주기, QR코드를 관리합니다.</p></div>
      <div class="page-head__actions">
        <button class="btn" id="tm-qr">${icon('grid', 16)} QR 일괄출력</button>
        <button class="btn" id="tm-refresh">${icon('refresh', 16)} 새로고침</button>
        <button class="btn btn--primary" id="tm-add">${icon('plus', 16)} 공구 등록</button>
      </div>
    </div>
    <div id="tm-stats"></div>
    <div style="display:grid;grid-template-columns:1fr 380px;gap:18px;align-items:start">
      <div class="card">
        <div class="toolbar">
          <div class="search-box grow">${icon('search', 16)}<input id="tm-search" placeholder="공구코드·공구명·규격·제조사 검색" autocomplete="off"/></div>
          <select class="select" id="tm-fclass" style="width:auto;min-width:120px"><option value="__all__">전체 구분</option>${TOOL_CLASSES.map(c => `<option value="${c}">${c}</option>`).join('')}</select>
          <select class="select" id="tm-fstatus" style="width:auto;min-width:110px"><option value="__all__">전체 상태</option><option value="사용">사용</option><option value="중지">중지</option></select>
        </div>
        <div class="table-wrap"><div id="tm-table"><div class="spinner"></div></div></div>
      </div>
      <div class="card" id="tm-detail"><div class="card__body"><div class="empty" style="padding:60px 16px">${icon('tool', 48)}<h4>공구를 선택하세요</h4><p>목록에서 공구를 선택하면 상세정보가 표시됩니다.</p></div></div></div>
    </div>`;

  root.querySelector('#tm-refresh').onclick = () => reload();
  root.querySelector('#tm-add').onclick = () => openForm(null);
  root.querySelector('#tm-qr').onclick = () => printToolQR(filtered());
  root.querySelector('#tm-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });
  root.querySelector('#tm-fclass').addEventListener('change', (e) => { state.fClass = e.target.value; renderTable(); });
  root.querySelector('#tm-fstatus').addEventListener('change', (e) => { state.fStatus = e.target.value; renderTable(); });

  async function loadAll() {
    [tools, items, processes, equipments] = await Promise.all([
      db.all('tools', { sort: 'code' }).catch(() => []),
      db.all('items', { sort: 'code' }).catch(() => []),
      db.all('processes', { sort: 'code' }).catch(() => []),
      db.all('equipments', { sort: 'code' }).catch(() => []),
    ]);
  }
  function filtered() {
    const q = state.search.toLowerCase();
    return tools.filter(t => {
      if (state.fClass !== '__all__' && (t.tool_class || '공구') !== state.fClass) return false;
      if (state.fStatus !== '__all__' && (t.status || '사용') !== state.fStatus) return false;
      if (q && ![t.code, t.name, t.spec, t.maker, t.model].some(v => String(v ?? '').toLowerCase().includes(q))) return false;
      return true;
    });
  }
  function renderStats() {
    root.querySelector('#tm-stats').innerHTML = `<div class="stat-grid">
      ${stat('등록 공구', num(tools.length), '종', 'tool', 'brand')}
      ${stat('사용 중', num(tools.filter(t => (t.status || '사용') === '사용').length), '종', 'checkCircle', 'green')}
      ${stat('치공구·지그', num(tools.filter(t => ['치공구', '지그'].includes(t.tool_class)).length), '종', 'settings', 'violet')}
      ${stat('사용중지', num(tools.filter(t => t.status === '중지').length), '종', 'alert', 'amber')}</div>`;
  }
  function renderTable() {
    const list = filtered(); const slot = root.querySelector('#tm-table');
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:44px">${icon('inbox', 46)}<h4>등록된 공구가 없습니다</h4></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th style="width:52px"></th><th>공구코드</th><th>공구명</th><th class="center">구분</th><th>규격</th><th>적용품목</th>
      <th class="num">기준수명</th><th class="center">점검주기</th><th>보관위치</th><th class="center">상태</th><th class="center" style="width:110px">관리</th>
    </tr></thead><tbody>${list.map(t => `<tr class="clickable ${state.selected?.id === t.id ? 'is-selected' : ''}" data-id="${t.id}">
      <td class="center">${t.photo_url ? `<img src="${escapeHtml(t.photo_url)}" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">` : `<span class="stat__ico ico-tint-brand" style="width:32px;height:32px;display:inline-flex">${icon('tool', 15)}</span>`}</td>
      <td class="cell-code">${escapeHtml(t.code)}</td><td class="cell-strong">${escapeHtml(t.name)}</td>
      <td class="center">${badge(t.tool_class || '공구', 'brand')}</td><td>${escapeHtml(t.spec || '')}</td>
      <td class="muted">${escapeHtml((t.apply_items || '').split(',').filter(Boolean).slice(0, 2).join(', ') || '-')}</td>
      <td class="num mono">${t.life_count ? `${num(t.life_count)} ${escapeHtml(t.life_unit || '횟수')}` : '<span class="muted">관리안함</span>'}</td>
      <td class="center">${escapeHtml(t.check_cycle || '-')}</td><td>${escapeHtml(t.location || '')}</td>
      <td class="center">${badge(t.status || '사용', (t.status || '사용') === '사용' ? 'success' : 'neutral')}</td>
      <td class="center"><div class="row-actions">
        <button class="icon-btn" data-qr="${t.id}" title="QR 출력">${icon('grid', 15)}</button>
        <button class="icon-btn" data-copy="${t.id}" title="복사등록">${icon('layers', 15)}</button>
        <button class="icon-btn" data-edit="${t.id}" title="수정">${icon('edit', 15)}</button>
        <button class="icon-btn" data-del="${t.id}" title="삭제">${icon('trash', 15)}</button></div></td>
    </tr>`).join('')}</tbody></table>`;
    slot.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = (e) => { if (e.target.closest('button')) return; state.selected = list.find(x => x.id === tr.dataset.id); renderTable(); renderDetail(); });
    slot.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openForm(list.find(x => x.id === b.dataset.edit)));
    slot.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => openForm(list.find(x => x.id === b.dataset.copy), true));
    slot.querySelectorAll('[data-qr]').forEach(b => b.onclick = () => printToolQR(list.find(x => x.id === b.dataset.qr)));
    slot.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const t = list.find(x => x.id === b.dataset.del);
      if (!(await confirmDialog({ message: `공구 [${t.code} ${t.name}]을(를) 삭제하시겠습니까?`, confirmText: '삭제' }))) return;
      try { await db.remove('tools', t.id); toast('삭제되었습니다.'); state.selected = null; reload(); } catch (e) { toast(e.message || '삭제 실패', 'error'); }
    });
  }
  function renderDetail() {
    const t = state.selected; const slot = root.querySelector('#tm-detail');
    if (!t) { slot.innerHTML = `<div class="card__body"><div class="empty" style="padding:60px 16px">${icon('tool', 48)}<h4>공구를 선택하세요</h4></div></div>`; return; }
    slot.innerHTML = `
      <div class="card__head"><div><span class="cell-code">${escapeHtml(t.code)}</span><h3 style="margin-top:4px">${escapeHtml(t.name)}</h3></div></div>
      <div class="card__body">
        ${t.photo_url ? `<img src="${escapeHtml(t.photo_url)}" alt="" style="width:100%;max-height:170px;object-fit:contain;border:1px solid var(--border);border-radius:10px;margin-bottom:14px;background:var(--surface-2)">` : ''}
        <div style="text-align:center;padding:10px;background:#fff;border-radius:10px;border:1px solid var(--border);margin-bottom:14px">${barcodeSVG(t.qr_code || t.code, { height: 42, narrow: 1.7 })}</div>
        <div class="flex-col" style="gap:9px">
          ${info('구분 / 상태', `${t.tool_class || '공구'} / ${t.status || '사용'}`)}
          ${info('규격 · 제조사 · 모델', `${t.spec || '-'} · ${t.maker || '-'} · ${t.model || '-'}`)}
          ${info('적용 품목', (t.apply_items || '').split(',').filter(Boolean).join(', ') || '-')}
          ${info('적용 공정', (t.apply_processes || t.process || '').split(',').filter(Boolean).join(', ') || '-')}
          ${info('적용 설비', (t.apply_equipments || '').split(',').filter(Boolean).join(', ') || '-')}
          ${info('기준수명', t.life_count ? `${num(t.life_count)} ${t.life_unit || '횟수'} (교체알람 ${num(t.alarm_count)})` : '관리 안함')}
          ${info('점검주기 · 보관위치', `${t.check_cycle || '-'} · ${t.location || '-'}`)}
          ${info('LOT 체계 · 표준단가', `${t.lot_rule || '-'} · ${t.unit_price ? won(t.unit_price) : '-'}`)}
        </div>
        <div class="flex" style="gap:8px;margin-top:14px">
          <button class="btn btn--sm" id="tm-qr1">${icon('grid', 14)} QR 출력</button>
          ${t.drawing_url ? `<a class="btn btn--sm" href="${escapeHtml(t.drawing_url)}" target="_blank" rel="noopener">${icon('fileText', 14)} 도면</a>` : ''}
        </div>
      </div>`;
    slot.querySelector('#tm-qr1').onclick = () => printToolQR(t);
  }

  function openForm(r, isCopy = false) {
    const isEdit = !!r && !isCopy;
    const v = (k, d = '') => (r ? (r[k] ?? d) : d);
    const multi = (key, list, valueKey, labelFn) => {
      const sel = String(v(key, '')).split(',').map(s => s.trim()).filter(Boolean);
      return list.map(o => `<option value="${escapeHtml(o[valueKey])}" ${sel.includes(String(o[valueKey])) ? 'selected' : ''}>${escapeHtml(labelFn(o))}</option>`).join('');
    };
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field"><label>공구코드 <span class="req">*</span></label><input class="input" name="code" value="${escapeHtml(isCopy ? '' : v('code'))}" placeholder="비워두면 자동채번 (T-001)"></div>
      <div class="field"><label>공구명 <span class="req">*</span></label><input class="input" name="name" value="${escapeHtml(isCopy ? v('name') + ' (복사)' : v('name'))}"></div>
      <div class="field"><label>구분</label><select class="select" name="tool_class">${TOOL_CLASSES.map(c => `<option value="${c}" ${v('tool_class', '공구') === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label>공구유형</label><select class="select" name="tool_type">${['절삭', '측정', '지그', '기타'].map(c => `<option value="${c}" ${v('tool_type', '절삭') === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label>규격</label><input class="input" name="spec" value="${escapeHtml(v('spec'))}"></div>
      <div class="field"><label>제조사</label><input class="input" name="maker" value="${escapeHtml(v('maker'))}"></div>
      <div class="field"><label>모델</label><input class="input" name="model" value="${escapeHtml(v('model'))}"></div>
      <div class="field"><label>보관위치</label><input class="input" name="location" value="${escapeHtml(v('location'))}" placeholder="예: 공구실 A-1"></div>
      <div class="field col-2"><label>적용 품목 <span class="muted">(Ctrl+클릭 다중선택)</span></label>
        <select class="select" name="apply_items" multiple size="4" style="height:auto">${multi('apply_items', items, 'code', o => `${o.code} · ${o.name}`)}</select></div>
      <div class="field"><label>적용 공정 <span class="muted">(다중)</span></label>
        <select class="select" name="apply_processes" multiple size="4" style="height:auto">${multi('apply_processes', processes, 'name', o => `${o.code} · ${o.name}`)}</select></div>
      <div class="field"><label>적용 설비 <span class="muted">(다중)</span></label>
        <select class="select" name="apply_equipments" multiple size="4" style="height:auto">${multi('apply_equipments', equipments, 'code', o => `${o.code} · ${o.name}`)}</select></div>
      <div class="field"><label>기준수명</label><input class="input" type="number" name="life_count" value="${v('life_count', 0)}"></div>
      <div class="field"><label>수명 단위</label><select class="select" name="life_unit">${LIFE_UNITS.map(u => `<option value="${u}" ${v('life_unit', '횟수') === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
      <div class="field"><label>교체알람 기준</label><input class="input" type="number" name="alarm_count" value="${v('alarm_count', 0)}" placeholder="수명 도달 전 알람 기준"></div>
      <div class="field"><label>점검주기</label><select class="select" name="check_cycle"><option value="">해당없음</option>${CHECK_CYCLES.map(c => `<option value="${c}" ${v('check_cycle') === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label>표준단가</label><input class="input" type="number" name="unit_price" value="${v('unit_price', 0)}"></div>
      <div class="field"><label>안전재고</label><input class="input" type="number" name="safety_stock" value="${v('safety_stock', 0)}"></div>
      <div class="field"><label>LOT 체계</label><input class="input" name="lot_rule" value="${escapeHtml(v('lot_rule'))}" placeholder="예: T001-YYMMDD-일련"></div>
      <div class="field"><label>사용상태</label><select class="select" name="status"><option value="사용" ${v('status', '사용') === '사용' ? 'selected' : ''}>사용</option><option value="중지" ${v('status') === '중지' ? 'selected' : ''}>중지</option></select></div>
      <div class="field"><label>공구사진 URL</label><input class="input" name="photo_url" value="${escapeHtml(v('photo_url'))}"></div>
      <div class="field"><label>도면 URL</label><input class="input" name="drawing_url" value="${escapeHtml(v('drawing_url'))}"></div>
      <div class="field col-2"><label>비고</label><textarea class="textarea" name="remark">${escapeHtml(v('remark'))}</textarea></div>`;
    openModal({
      title: `공구 ${isEdit ? '수정' : isCopy ? '복사등록' : '등록'}`, body, wide: true,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 저장</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => { const el = body.querySelector(`[name="${n}"]`); return el ? el.value.trim() : ''; };
          const gm = (n) => [...body.querySelector(`[name="${n}"]`).selectedOptions].map(o => o.value).join(',');
          if (!g('name')) { toast('공구명을 입력하세요.', 'error'); return; }
          let code = g('code');
          if (!code) {
            const nums = tools.map(t => parseInt(String(t.code).replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
            code = 'T-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
          }
          if (!isEdit && tools.some(t => t.code === code)) { toast('이미 존재하는 공구코드입니다.', 'error'); return; }
          const payload = {
            code, name: g('name'), tool_class: g('tool_class'), tool_type: g('tool_type'), spec: g('spec'),
            maker: g('maker'), model: g('model'), location: g('location'),
            apply_items: gm('apply_items'), apply_processes: gm('apply_processes'), apply_equipments: gm('apply_equipments'),
            process: gm('apply_processes').split(',')[0] || '',
            life_count: Number(g('life_count')) || 0, life_unit: g('life_unit'), alarm_count: Number(g('alarm_count')) || 0,
            check_cycle: g('check_cycle'), unit_price: Number(g('unit_price')) || 0, safety_stock: Number(g('safety_stock')) || 0,
            lot_rule: g('lot_rule'), status: g('status'), qr_code: code,
            photo_url: g('photo_url'), drawing_url: g('drawing_url'), remark: g('remark'), use_yn: g('status') !== '중지',
          };
          try {
            if (isEdit) await db.update('tools', r.id, payload); else await db.insert('tools', payload);
            close(); toast('저장되었습니다.'); await reload();
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }
  async function reload() {
    try { await loadAll(); renderStats(); renderTable(); if (state.selected) { state.selected = tools.find(t => t.id === state.selected.id); renderDetail(); } }
    catch (e) { root.querySelector('#tm-table').innerHTML = `<div class="empty">${icon('alert', 46)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
  }
  reload();
}

// =====================================================================
// 5-2 입고관리
// =====================================================================
export const toolInbounds = createCrudPage({
  table: 'tool_movements', title: '공구 입고관리', subtitle: '공구 입고를 등록합니다. 제조번호·검사결과·입고단가를 관리하고 QR 라벨을 출력합니다.',
  searchFields: ['move_no', 'tool_code', 'tool_name', 'lot_no', 'serial_no', 'partner'], searchPlaceholder: '입고번호·공구·LOT·제조번호 검색',
  defaultSort: { key: 'move_date', dir: 'desc' },
  dateField: { key: 'move_date', label: '입고일' },
  docNoField: { key: 'move_no', prefix: 'TI' },
  wideForm: true,
  filters: [{ key: 'inspect_result', label: '검사결과', options: ['합격', '불합격', '성적서확인'] }],
  beforeSave: (data) => { data.move_type = '입고'; },
  // 입고 건만 표시
  stats: async (rows) => {
    const ins = rows.filter(r => r.move_type === '입고');
    return [
      { label: '입고 건수', value: num(ins.length), unit: '건', icon: 'inbox', tint: 'brand' },
      { label: '입고 수량', value: num(ins.reduce((s, r) => s + (+r.qty || 0), 0)), unit: 'EA', icon: 'box', tint: 'green' },
      { label: '입고 금액', value: won(ins.reduce((s, r) => s + (+r.qty || 0) * (+r.unit_price || 0), 0)), icon: 'dollar', tint: 'violet' },
      { label: '검사 불합격', value: num(ins.filter(r => r.inspect_result === '불합격').length), unit: '건', icon: 'alert', tint: 'red' },
    ];
  },
  columns: [
    { key: 'move_no', label: '입고번호', cls: 'cell-code', sortable: true },
    { key: 'move_date', label: '입고일', type: 'date', sortable: true },
    { key: 'tool_code', label: '공구코드', cls: 'cell-code' },
    { key: 'tool_name', label: '공구명', cls: 'cell-strong' },
    { key: 'partner', label: '거래처' },
    { key: 'qty', label: '입고수량', type: 'num', sortable: true },
    { key: 'unit_price', label: '단가', type: 'money' },
    { key: 'amount', label: '금액', align: 'right', csv: (r) => (+r.qty || 0) * (+r.unit_price || 0), render: (r) => `<span class="mono">${won((+r.qty || 0) * (+r.unit_price || 0))}</span>` },
    { key: 'serial_no', label: '제조번호', cls: 'cell-code' },
    { key: 'lot_no', label: '관리번호(LOT)', cls: 'cell-code' },
    { key: 'inspect_result', label: '검사결과', type: 'badge', align: 'center' },
    { key: 'location', label: '보관위치' },
  ],
  rowActions: [
    {
      label: 'QR', icon: 'grid', title: 'QR 라벨 출력',
      onClick: async (r) => {
        const tools = await db.all('tools', { filters: { code: r.tool_code } }).catch(() => []);
        const t = tools[0] || { code: r.tool_code, name: r.tool_name };
        printToolQR({ ...t, qr_code: r.lot_no || t.code });
      },
    },
  ],
  fields: [
    { key: 'move_no', label: '입고번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'move_date', label: '입고일', type: 'date', required: true, default: todayStr() },
    { key: 'tool_code', label: '공구', required: true, ref: { table: 'tools', value: 'code', label: (r) => `${r.code} · ${r.name} (${r.tool_class || '공구'})`, fill: { tool_name: 'name', location: 'location', unit_price: 'unit_price' } }, placeholder: '공구 선택' },
    { key: 'tool_name', label: '공구명(자동)', required: true, readonly: true },
    { key: 'partner', label: '거래처', ref: { table: 'partners', value: 'name', label: (r) => `${r.code} · ${r.name}` }, placeholder: '거래처 선택' },
    { key: 'po_no', label: '발주번호', placeholder: '발주 연계 시 입력' },
    { key: 'qty', label: '입고수량', type: 'number', required: true, default: 0 },
    { key: 'unit_price', label: '단가', type: 'number', default: 0 },
    { key: 'serial_no', label: '제조번호', placeholder: '제작처 제조번호' },
    { key: 'lot_no', label: '관리번호(LOT)', placeholder: '예: T001-260721-01' },
    { key: 'inspect_result', label: '입고검사 결과', type: 'select', options: ['합격', '불합격', '성적서확인'], default: '성적서확인' },
    { key: 'location', label: '보관위치' },
    { key: 'worker', label: '담당자', ref: { table: 'users', value: 'name', label: (r) => `${r.name} (${r.department || ''})` }, placeholder: '담당자 선택' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});

// =====================================================================
// 5-3 재고관리 (상태 구분 + LOT별 수명)
// =====================================================================
export async function toolStock(root) {
  const state = { search: '', chip: '전체', selected: null };
  let tools = [], moves = [], usages = [], disposals = [], adjustments = [];

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>공구 재고관리</h1><p>공구별 전체 재고와 위치별 재고, LOT 단위 수명·상태(가용/사용중/수리중/수명초과)를 관리합니다.</p></div>
      <div class="page-head__actions">
        <button class="btn" id="ts-csv">${icon('download', 16)} 재고대장(CSV)</button>
        <button class="btn" id="ts-refresh">${icon('refresh', 16)} 새로고침</button>
      </div>
    </div>
    <div id="ts-stats"></div>
    <div class="card" style="margin-bottom:16px">
      <div class="toolbar">
        <div class="search-box grow">${icon('search', 16)}<input id="ts-search" placeholder="공구명·코드·QR 통합검색" autocomplete="off"/></div>
      </div>
      <div class="toolbar" style="border-top:0;padding-top:12px"><div class="chips" id="ts-chips"></div></div>
      <div class="table-wrap"><div id="ts-table"><div class="spinner"></div></div></div>
    </div>
    <div id="ts-detail"></div>`;

  root.querySelector('#ts-refresh').onclick = () => reload();
  root.querySelector('#ts-csv').onclick = () => exportCsv();
  root.querySelector('#ts-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });

  async function loadAll() {
    [tools, moves, usages, disposals, adjustments] = await Promise.all([
      db.all('tools', { sort: 'code' }).catch(() => []),
      db.all('tool_movements', {}).catch(() => []),
      db.all('tool_usages', {}).catch(() => []),
      db.all('tool_disposals', {}).catch(() => []),
      db.all('tool_adjustments', {}).catch(() => []),
    ]);
  }

  // 공구별 재고 집계
  function stockOf(t) {
    const mv = moves.filter(m => m.tool_code === t.code);
    const inQ = mv.filter(m => m.move_type === '입고').reduce((s, m) => s + (+m.qty || 0), 0);
    const outQ = mv.filter(m => m.move_type === '출고').reduce((s, m) => s + (+m.qty || 0), 0);
    const retQ = mv.filter(m => m.move_type === '회수').reduce((s, m) => s + (+m.qty || 0), 0);
    const dsQ = disposals.filter(d => d.tool_code === t.code && d.status !== '반려').reduce((s, d) => s + (+d.qty || 0), 0);
    const adjQ = adjustments.filter(a => a.tool_code === t.code && a.status === '승인').reduce((s, a) => s + (+a.adj_qty || 0), 0);
    const total = inQ - dsQ + adjQ;              // 보유 총량
    const using = Math.max(0, outQ - retQ);      // 사용 중(출고 미회수)
    const avail = Math.max(0, total - using);    // 가용
    // 수명 초과 LOT 수
    const lots = lotsOf(t.code);
    const overLife = lots.filter(l => l.remain !== null && l.remain <= 0).length;
    return { inQ, outQ, retQ, dsQ, adjQ, total, using, avail, overLife, lots };
  }
  // 입고 1개당 LOT 부여 + 사용/남은수명
  function lotsOf(code) {
    const tool = tools.find(t => t.code === code) || {};
    const life1 = +tool.life_count || 0;
    const ins = moves.filter(m => m.move_type === '입고' && m.tool_code === code)
      .sort((a, b) => String(a.move_date || '').localeCompare(String(b.move_date || '')));
    const disposedLots = new Set(disposals.filter(d => d.tool_code === code && d.lot_no && d.status !== '반려').map(d => d.lot_no));
    const outLots = new Set(moves.filter(m => m.move_type === '출고' && m.tool_code === code && m.lot_no).map(m => m.lot_no));
    const retLots = new Set(moves.filter(m => m.move_type === '회수' && m.tool_code === code && m.lot_no).map(m => m.lot_no));
    const units = [];
    for (const m of ins) {
      const qty = +m.qty || 0;
      let pool = usages.filter(u => u.lot_no === m.move_no).reduce((s, u) => s + (+u.use_qty || 0), 0);
      for (let i = 1; i <= qty; i++) {
        const lot_no = m.lot_no && qty === 1 ? m.lot_no : `${m.move_no}-${String(i).padStart(2, '0')}`;
        let used = 0, remain = null;
        if (life1 > 0) {
          const direct = usages.filter(u => u.lot_no === lot_no).reduce((s, u) => s + (+u.use_qty || 0), 0);
          const take = Math.min(Math.max(0, life1 - direct), Math.max(0, pool));
          pool -= take; used = direct + take; remain = Math.max(0, life1 - used);
        }
        const disposed = disposedLots.has(lot_no);
        const out = outLots.has(lot_no) && !retLots.has(lot_no);
        const status = disposed ? '폐기' : (remain !== null && remain <= 0) ? '수명초과' : out ? '사용중' : '가용';
        units.push({ lot_no, move_no: m.move_no, move_date: m.move_date, life: life1, lifeUnit: tool.life_unit || '횟수', used, remain, status, location: m.location, serial_no: m.serial_no });
      }
    }
    return units;
  }
  function rowsWithStock() {
    return tools.map(t => ({ tool: t, ...stockOf(t) }));
  }
  function filtered() {
    const q = state.search.toLowerCase();
    let list = rowsWithStock();
    if (state.chip === '부족재고') list = list.filter(r => r.avail <= (+r.tool.safety_stock || 0));
    else if (state.chip === '수명초과') list = list.filter(r => r.overLife > 0);
    else if (state.chip === '사용중') list = list.filter(r => r.using > 0);
    if (q) list = list.filter(r => [r.tool.code, r.tool.name, r.tool.qr_code, r.tool.spec].some(v => String(v ?? '').toLowerCase().includes(q)));
    return list;
  }
  function renderStats() {
    const all = rowsWithStock();
    root.querySelector('#ts-stats').innerHTML = `<div class="stat-grid">
      ${stat('관리 공구', num(tools.length), '종', 'tool', 'brand')}
      ${stat('가용 재고', num(all.reduce((s, r) => s + r.avail, 0)), 'EA', 'checkCircle', 'green')}
      ${stat('사용 중', num(all.reduce((s, r) => s + r.using, 0)), 'EA', 'activity', 'amber')}
      ${stat('수명초과 LOT', num(all.reduce((s, r) => s + r.overLife, 0)), '개', 'alert', 'red')}</div>`;
  }
  function renderChips() {
    const all = rowsWithStock();
    const wrap = root.querySelector('#ts-chips');
    const opts = [['전체', all.length], ['부족재고', all.filter(r => r.avail <= (+r.tool.safety_stock || 0)).length],
      ['사용중', all.filter(r => r.using > 0).length], ['수명초과', all.filter(r => r.overLife > 0).length]];
    wrap.innerHTML = opts.map(([t, c]) => `<button class="chip ${state.chip === t ? 'active' : ''}" data-c="${t}">${t}<span class="chip__count">${c}</span></button>`).join('');
    wrap.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { state.chip = b.dataset.c; renderChips(); renderTable(); });
  }
  function renderTable() {
    const list = filtered(); const slot = root.querySelector('#ts-table');
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:44px">${icon('inbox', 46)}<h4>해당 공구가 없습니다</h4></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th>공구코드</th><th>공구명</th><th class="center">구분</th><th>보관위치</th>
      <th class="num">가용</th><th class="num">사용중</th><th class="num">수명초과</th><th class="num">폐기</th><th class="num">보유합계</th><th class="num">안전재고</th><th class="center">상태</th>
    </tr></thead><tbody>${list.map(r => {
      const low = r.avail <= (+r.tool.safety_stock || 0);
      return `<tr class="clickable ${state.selected === r.tool.code ? 'is-selected' : ''}" data-code="${escapeHtml(r.tool.code)}">
        <td class="cell-code">${escapeHtml(r.tool.code)}</td><td class="cell-strong">${escapeHtml(r.tool.name)}</td>
        <td class="center">${badge(r.tool.tool_class || '공구', 'brand')}</td><td>${escapeHtml(r.tool.location || '')}</td>
        <td class="num mono" style="font-weight:700">${num(r.avail)}</td>
        <td class="num mono">${r.using ? num(r.using) : '<span class="muted">0</span>'}</td>
        <td class="num mono">${r.overLife ? `<span style="color:var(--danger);font-weight:700">${num(r.overLife)}</span>` : '<span class="muted">0</span>'}</td>
        <td class="num mono muted">${num(r.dsQ)}</td><td class="num mono">${num(r.total)}</td><td class="num mono muted">${num(r.tool.safety_stock)}</td>
        <td class="center">${r.overLife ? badge('수명초과', 'danger') : low ? badge('부족', 'warning') : badge('정상', 'success')}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
    slot.querySelectorAll('tr[data-code]').forEach(tr => tr.onclick = () => { state.selected = tr.dataset.code; renderTable(); renderDetail(); });
  }
  function renderDetail() {
    const code = state.selected; const slot = root.querySelector('#ts-detail');
    if (!code) { slot.innerHTML = ''; return; }
    const t = tools.find(x => x.code === code) || {};
    const s = stockOf(t);
    const hist = moves.filter(m => m.tool_code === code).sort((a, b) => String(b.move_date).localeCompare(String(a.move_date))).slice(0, 12);
    slot.innerHTML = `<div class="card">
      <div class="card__head"><div><span class="cell-code">${escapeHtml(t.code)}</span><h3 style="margin-top:4px">${escapeHtml(t.name)}</h3></div>
        <div class="spacer"></div><span class="muted">기준수명 ${t.life_count ? `${num(t.life_count)} ${escapeHtml(t.life_unit || '횟수')}` : '관리 안함'}</span></div>
      <div class="card__body">
        <h4 style="margin:0 0 10px;font-size:13.5px;display:flex;align-items:center;gap:8px">${icon('inbox', 16)} LOT별 상태 <span class="muted" style="font-weight:500">${s.lots.length}개</span></h4>
        <div class="table-wrap" style="max-height:280px;overflow-y:auto"><table class="grid">
          <thead><tr><th>LOT 번호</th><th>입고일</th><th>제조번호</th><th class="num">수명</th><th class="num">사용</th><th class="num">잔여</th><th>보관위치</th><th class="center">상태</th></tr></thead>
          <tbody>${s.lots.length ? s.lots.map(l => `<tr>
            <td class="cell-code" style="font-weight:700">${escapeHtml(l.lot_no)}</td><td>${fmtDate(l.move_date)}</td>
            <td class="muted">${escapeHtml(l.serial_no || '')}</td>
            <td class="num mono">${l.remain === null ? '∞' : num(l.life)}</td><td class="num mono">${num(l.used)}</td>
            <td class="num mono" style="font-weight:700">${l.remain === null ? '∞' : num(l.remain)}</td>
            <td>${escapeHtml(l.location || '')}</td><td class="center">${badge(l.status)}</td></tr>`).join('')
            : `<tr><td colspan="8"><div class="empty" style="padding:24px">${icon('inbox', 40)}<h4>입고 LOT이 없습니다</h4></div></td></tr>`}</tbody></table></div>
        <h4 style="margin:18px 0 10px;font-size:13.5px;display:flex;align-items:center;gap:8px">${icon('refresh', 16)} 최근 입·출고 이력</h4>
        <div class="table-wrap"><table class="grid">
          <thead><tr><th>일자</th><th class="center">구분</th><th>번호</th><th class="num">수량</th><th>호기/외주처</th><th>담당자</th></tr></thead>
          <tbody>${hist.length ? hist.map(m => `<tr><td>${fmtDate(m.move_date)}</td><td class="center">${badge(m.move_type || '')}</td>
            <td class="cell-code">${escapeHtml(m.move_no)}</td><td class="num mono">${num(m.qty)}</td>
            <td>${escapeHtml(m.machine_no || m.partner || '')}</td><td>${escapeHtml(m.worker || '')}</td></tr>`).join('')
            : `<tr><td colspan="6" class="muted" style="text-align:center;padding:20px">이력이 없습니다</td></tr>`}</tbody></table></div>
      </div></div>`;
  }
  function exportCsv() {
    const list = filtered();
    downloadCSV(`공구재고대장_${todayStr()}.csv`, [
      { label: '공구코드', key: 'code', csv: r => r.tool.code }, { label: '공구명', key: 'name', csv: r => r.tool.name },
      { label: '구분', key: 'cls', csv: r => r.tool.tool_class || '공구' }, { label: '보관위치', key: 'loc', csv: r => r.tool.location || '' },
      { label: '가용', key: 'avail' }, { label: '사용중', key: 'using' }, { label: '수명초과LOT', key: 'overLife' },
      { label: '폐기', key: 'dsQ' }, { label: '보유합계', key: 'total' }, { label: '안전재고', key: 'ss', csv: r => r.tool.safety_stock || 0 },
    ], list);
    toast('재고대장을 내보냈습니다.');
  }
  async function reload() {
    try { await loadAll(); renderStats(); renderChips(); renderTable(); if (state.selected) renderDetail(); }
    catch (e) { root.querySelector('#ts-table').innerHTML = `<div class="empty">${icon('alert', 46)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
  }
  reload();
}

// =====================================================================
// 5-4 출고관리 (QR 스캔 흐름)
// =====================================================================
export async function toolIssue(root) {
  const state = { search: '', chip: '전체' };
  let tools = [], moves = [], wos = [], users = [], equipments = [], partners = [], disposals = [];

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>공구 출고·회수</h1><p>QR 스캔 → 작업자 → 작업지시·설비 → 출고 처리. <b>수명초과·사용중지 공구는 출고가 제한</b>됩니다.</p></div>
      <div class="page-head__actions">
        <button class="btn" id="ti-csv">${icon('download', 16)} 엑셀(CSV)</button>
        <button class="btn" id="ti-refresh">${icon('refresh', 16)} 새로고침</button>
        <button class="btn btn--primary" id="ti-new">${icon('upload', 16)} 출고 등록</button>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="card__head">${icon('grid', 18)}<h3>QR 스캔 출고</h3>
        <div class="spacer"></div>
        <div class="search-box" style="min-width:300px">${icon('search', 16)}<input id="ti-scan" placeholder="공구 QR/코드 스캔 후 Enter" autocomplete="off"/></div>
      </div>
      <div class="card__body" id="ti-recent"></div>
    </div>
    <div id="ti-stats"></div>
    <div class="card">
      <div class="toolbar"><div class="search-box grow">${icon('search', 16)}<input id="ti-search" placeholder="번호·공구·작업지시·호기·작업자 검색" autocomplete="off"/></div></div>
      <div class="toolbar" style="border-top:0;padding-top:12px"><div class="chips" id="ti-chips"></div></div>
      <div class="table-wrap"><div id="ti-table"><div class="spinner"></div></div></div>
    </div>`;

  root.querySelector('#ti-refresh').onclick = () => reload();
  root.querySelector('#ti-new').onclick = () => openIssue(null);
  root.querySelector('#ti-csv').onclick = () => exportCsv();
  root.querySelector('#ti-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });
  const scanEl = root.querySelector('#ti-scan');
  scanEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = scanEl.value.trim().toUpperCase();
    if (!q) return;
    const t = tools.find(x => String(x.qr_code || x.code).toUpperCase() === q || String(x.code).toUpperCase() === q);
    if (!t) { toast('해당 공구를 찾을 수 없습니다.', 'error'); return; }
    scanEl.value = ''; openIssue(t);
  });

  async function loadAll() {
    [tools, moves, wos, users, equipments, partners, disposals] = await Promise.all([
      db.all('tools', { sort: 'code' }).catch(() => []),
      db.all('tool_movements', {}).catch(() => []),
      db.all('work_orders', {}).catch(() => []),
      db.all('users', { sort: 'name' }).catch(() => []),
      db.all('equipments', { sort: 'code' }).catch(() => []),
      db.all('partners', { sort: 'code' }).catch(() => []),
      db.all('tool_disposals', {}).catch(() => []),
    ]);
  }
  function availOf(code) {
    const mv = moves.filter(m => m.tool_code === code);
    const inQ = mv.filter(m => m.move_type === '입고').reduce((s, m) => s + (+m.qty || 0), 0);
    const outQ = mv.filter(m => m.move_type === '출고').reduce((s, m) => s + (+m.qty || 0), 0);
    const retQ = mv.filter(m => m.move_type === '회수').reduce((s, m) => s + (+m.qty || 0), 0);
    const dsQ = disposals.filter(d => d.tool_code === code && d.status !== '반려').reduce((s, d) => s + (+d.qty || 0), 0);
    return inQ - outQ + retQ - dsQ;
  }
  function renderRecent() {
    const slot = root.querySelector('#ti-recent');
    const recent = [...new Set(moves.filter(m => m.move_type === '출고').sort((a, b) => String(b.move_date).localeCompare(String(a.move_date))).map(m => m.tool_code))].slice(0, 8);
    if (!recent.length) { slot.innerHTML = `<div class="muted">최근 출고 이력이 없습니다. QR을 스캔하거나 [출고 등록]을 누르세요.</div>`; return; }
    slot.innerHTML = `<div class="muted" style="margin-bottom:8px;font-size:12px">최근 출고 공구 — 클릭하면 바로 출고 화면이 열립니다</div>
      <div class="chips">${recent.map(c => {
        const t = tools.find(x => x.code === c); if (!t) return '';
        const av = availOf(c);
        return `<button class="chip" data-tool="${escapeHtml(c)}">${escapeHtml(t.name)} <span class="chip__count">가용 ${num(av)}</span></button>`;
      }).join('')}</div>`;
    slot.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => openIssue(tools.find(t => t.code === b.dataset.tool)));
  }
  function scoped() {
    const q = state.search.toLowerCase();
    let list = moves.filter(m => ['출고', '회수'].includes(m.move_type));
    if (state.chip === '출고') list = list.filter(m => m.move_type === '출고');
    else if (state.chip === '회수') list = list.filter(m => m.move_type === '회수');
    else if (state.chip === '미회수') {
      const retKeys = new Set(moves.filter(m => m.move_type === '회수').map(m => `${m.tool_code}|${m.lot_no || ''}`));
      list = list.filter(m => m.move_type === '출고' && !retKeys.has(`${m.tool_code}|${m.lot_no || ''}`));
    }
    if (q) list = list.filter(m => [m.move_no, m.tool_code, m.tool_name, m.wo_no, m.machine_no, m.worker, m.partner].some(v => String(v ?? '').toLowerCase().includes(q)));
    return list.sort((a, b) => String(b.move_date).localeCompare(String(a.move_date)));
  }
  function renderStats() {
    const out = moves.filter(m => m.move_type === '출고');
    const ret = moves.filter(m => m.move_type === '회수');
    const retKeys = new Set(ret.map(m => `${m.tool_code}|${m.lot_no || ''}`));
    const pending = out.filter(m => !retKeys.has(`${m.tool_code}|${m.lot_no || ''}`));
    const overdue = pending.filter(m => m.return_due && String(m.return_due).slice(0, 10) < todayStr());
    root.querySelector('#ti-stats').innerHTML = `<div class="stat-grid">
      ${stat('출고 건수', num(out.length), '건', 'upload', 'brand')}
      ${stat('회수 건수', num(ret.length), '건', 'download', 'green')}
      ${stat('미회수', num(pending.length), '건', 'clock', 'amber')}
      ${stat('반납기한 초과', num(overdue.length), '건', 'alert', 'red')}</div>`;
  }
  function renderChips() {
    const wrap = root.querySelector('#ti-chips');
    const out = moves.filter(m => m.move_type === '출고'), ret = moves.filter(m => m.move_type === '회수');
    const retKeys = new Set(ret.map(m => `${m.tool_code}|${m.lot_no || ''}`));
    const opts = [['전체', out.length + ret.length], ['출고', out.length], ['회수', ret.length],
      ['미회수', out.filter(m => !retKeys.has(`${m.tool_code}|${m.lot_no || ''}`)).length]];
    wrap.innerHTML = opts.map(([t, c]) => `<button class="chip ${state.chip === t ? 'active' : ''}" data-c="${t}">${t}<span class="chip__count">${c}</span></button>`).join('');
    wrap.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { state.chip = b.dataset.c; renderChips(); renderTable(); });
  }
  function renderTable() {
    const list = scoped(); const slot = root.querySelector('#ti-table');
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:44px">${icon('inbox', 46)}<h4>출고·회수 이력이 없습니다</h4></div>`; return; }
    const retKeys = new Set(moves.filter(m => m.move_type === '회수').map(m => `${m.tool_code}|${m.lot_no || ''}`));
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th>번호</th><th>일자</th><th class="center">구분</th><th>공구</th><th>LOT</th><th class="num">수량</th>
      <th>작업지시</th><th>호기/외주처</th><th>작업자</th><th>부서</th><th class="center">반납예정</th><th class="center" style="width:96px">관리</th>
    </tr></thead><tbody>${list.map(m => {
      const returned = m.move_type === '출고' && retKeys.has(`${m.tool_code}|${m.lot_no || ''}`);
      const overdue = m.move_type === '출고' && !returned && m.return_due && String(m.return_due).slice(0, 10) < todayStr();
      return `<tr>
        <td class="cell-code">${escapeHtml(m.move_no)}</td><td>${fmtDate(m.move_date)}</td>
        <td class="center">${badge(m.move_type)}</td>
        <td class="cell-strong">${escapeHtml(m.tool_name || m.tool_code)}</td><td class="cell-code">${escapeHtml(m.lot_no || '')}</td>
        <td class="num mono">${num(m.qty)}</td><td class="cell-code">${escapeHtml(m.wo_no || '')}</td>
        <td>${escapeHtml(m.machine_no || m.partner || '')}</td><td>${escapeHtml(m.worker || '')}</td><td class="muted">${escapeHtml(m.dept || '')}</td>
        <td class="center">${m.move_type === '출고' ? (returned ? badge('회수완료', 'success') : m.return_due ? (overdue ? badge(fmtDate(m.return_due), 'danger') : fmtDate(m.return_due)) : '<span class="muted">-</span>') : '-'}</td>
        <td class="center"><div class="row-actions">
          ${m.move_type === '출고' && !returned ? `<button class="icon-btn" data-ret="${m.id}" title="회수 처리">${icon('download', 15)}</button>` : ''}
          <button class="icon-btn" data-del="${m.id}" title="삭제">${icon('trash', 15)}</button></div></td>
      </tr>`;
    }).join('')}</tbody></table>`;
    slot.querySelectorAll('[data-ret]').forEach(b => b.onclick = () => openReturn(list.find(x => x.id === b.dataset.ret)));
    slot.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const m = list.find(x => x.id === b.dataset.del);
      if (!(await confirmDialog({ message: `[${m.move_no}] 이력을 삭제하시겠습니까?`, confirmText: '삭제' }))) return;
      try { await db.remove('tool_movements', m.id); toast('삭제되었습니다.'); reload(); } catch (e) { toast(e.message || '삭제 실패', 'error'); }
    });
  }

  function openIssue(tool) {
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field"><label>출고일 <span class="req">*</span></label><input class="input" type="date" name="move_date" value="${todayStr()}"></div>
      <div class="field"><label>공구 <span class="req">*</span></label>
        <select class="select" name="tool_code"><option value="">선택</option>
          ${tools.map(t => {
            const av = availOf(t.code);
            const blocked = (t.status === '중지') || av <= 0;
            return `<option value="${escapeHtml(t.code)}" ${tool?.code === t.code ? 'selected' : ''} ${blocked ? 'disabled' : ''}>${escapeHtml(t.code)} · ${escapeHtml(t.name)} (가용 ${av})${t.status === '중지' ? ' [사용중지]' : av <= 0 ? ' [재고없음]' : ''}</option>`;
          }).join('')}</select></div>
      <div class="field"><label>LOT 번호</label><select class="select" name="lot_no"><option value="">선택(선택사항)</option></select></div>
      <div class="field"><label>출고수량 <span class="req">*</span></label><input class="input" type="number" name="qty" value="1" min="1"></div>
      <div class="field"><label>출고처 구분</label><select class="select" name="dest_type"><option value="사내">사내</option><option value="외주">외주</option></select></div>
      <div class="field"><label>설비(호기)</label><select class="select" name="machine_no"><option value="">선택</option>
        ${equipments.map(e => `<option value="${escapeHtml(e.code)}">${escapeHtml(e.code)} · ${escapeHtml(e.name)}${e.machine_no ? ` [${escapeHtml(e.machine_no)}]` : ''}</option>`).join('')}</select></div>
      <div class="field"><label>외주처</label><select class="select" name="partner"><option value="">선택</option>
        ${partners.filter(p => p.biz_type === '외주가공처').map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.code)} · ${escapeHtml(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>작업지시</label><select class="select" name="wo_no"><option value="">선택</option>
        ${wos.filter(w => ['작업중', '대기'].includes(w.status)).map(w => `<option value="${escapeHtml(w.wo_no)}" data-eq="${escapeHtml(w.equipment || '')}" data-item="${escapeHtml(w.item_name || '')}">${escapeHtml(w.wo_no)} · ${escapeHtml(w.item_name || '')}</option>`).join('')}</select></div>
      <div class="field"><label>작업자 <span class="req">*</span></label><select class="select" name="worker"><option value="">선택</option>
        ${users.map(u => `<option value="${escapeHtml(u.name)}" data-dept="${escapeHtml(u.department || '')}">${escapeHtml(u.name)} (${escapeHtml(u.department || '')})</option>`).join('')}</select></div>
      <div class="field"><label>사용부서</label><input class="input" name="dept" readonly></div>
      <div class="field"><label>사용시작일</label><input class="input" type="date" name="use_start" value="${todayStr()}"></div>
      <div class="field"><label>반납예정일</label><input class="input" type="date" name="return_due"></div>
      <div class="field col-2"><label>비고</label><input class="input" name="remark"></div>
      <div class="field col-2" id="ti-warn"></div>`;

    const toolSel = body.querySelector('[name="tool_code"]');
    const lotSel = body.querySelector('[name="lot_no"]');
    const warn = body.querySelector('#ti-warn');
    const fillLots = () => {
      const code = toolSel.value;
      const t = tools.find(x => x.code === code);
      lotSel.innerHTML = `<option value="">선택(선택사항)</option>`;
      warn.innerHTML = '';
      if (!t) return;
      const life1 = +t.life_count || 0;
      const ins = moves.filter(m => m.move_type === '입고' && m.tool_code === code);
      const outLots = new Set(moves.filter(m => m.move_type === '출고' && m.tool_code === code && m.lot_no).map(m => m.lot_no));
      const retLots = new Set(moves.filter(m => m.move_type === '회수' && m.tool_code === code && m.lot_no).map(m => m.lot_no));
      const dsLots = new Set(disposals.filter(d => d.tool_code === code && d.lot_no).map(d => d.lot_no));
      for (const m of ins) {
        const qty = +m.qty || 0;
        for (let i = 1; i <= qty; i++) {
          const lot = m.lot_no && qty === 1 ? m.lot_no : `${m.move_no}-${String(i).padStart(2, '0')}`;
          const used = usagesOf(lot);
          const remain = life1 > 0 ? Math.max(0, life1 - used) : null;
          const inUse = outLots.has(lot) && !retLots.has(lot);
          const disposed = dsLots.has(lot);
          const blocked = disposed || inUse || (remain !== null && remain <= 0);
          lotSel.innerHTML += `<option value="${escapeHtml(lot)}" ${blocked ? 'disabled' : ''}>${escapeHtml(lot)} ${remain === null ? '' : `· 잔여 ${remain}`}${disposed ? ' [폐기]' : inUse ? ' [사용중]' : (remain !== null && remain <= 0) ? ' [수명초과]' : ''}</option>`;
        }
      }
      const av = availOf(code);
      if (t.status === '중지') warn.innerHTML = `<div class="flex" style="padding:10px 12px;background:var(--danger-bg);border-radius:10px;gap:8px">${icon('alert', 16)} <b>사용중지</b> 공구입니다. 출고할 수 없습니다.</div>`;
      else if (av <= 0) warn.innerHTML = `<div class="flex" style="padding:10px 12px;background:var(--danger-bg);border-radius:10px;gap:8px">${icon('alert', 16)} 가용 재고가 없습니다.</div>`;
      else if (av <= (+t.safety_stock || 0)) warn.innerHTML = `<div class="flex" style="padding:10px 12px;background:var(--surface-2);border-radius:10px;gap:8px">${icon('alert', 16)} 안전재고(${num(t.safety_stock)}) 이하입니다. 현재 가용 ${num(av)}.</div>`;
    };
    const usagesOf = (lot) => 0; // 사용횟수는 POP 연계 시 반영
    toolSel.addEventListener('change', fillLots);
    body.querySelector('[name="worker"]').addEventListener('change', (e) => {
      body.querySelector('[name="dept"]').value = e.target.selectedOptions[0]?.dataset.dept || '';
    });
    body.querySelector('[name="wo_no"]').addEventListener('change', (e) => {
      const eq = e.target.selectedOptions[0]?.dataset.eq;
      if (eq) { const sel = body.querySelector('[name="machine_no"]'); const opt = [...sel.options].find(o => o.value === eq); if (opt) sel.value = eq; }
    });
    fillLots();

    openModal({
      title: '공구 출고', body, wide: true,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('upload', 16)} 출고 처리</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => { const el = body.querySelector(`[name="${n}"]`); return el ? el.value.trim() : ''; };
          const code = g('tool_code');
          if (!code) { toast('공구를 선택하세요.', 'error'); return; }
          if (!g('worker')) { toast('작업자를 선택하세요.', 'error'); return; }
          const t = tools.find(x => x.code === code);
          if (t.status === '중지') { toast('사용중지 공구는 출고할 수 없습니다.', 'error'); return; }
          const qty = Number(g('qty')) || 0;
          if (qty <= 0) { toast('출고수량을 입력하세요.', 'error'); return; }
          if (qty > availOf(code)) { toast(`가용 재고(${num(availOf(code))})를 초과할 수 없습니다.`, 'error'); return; }
          try {
            const move_no = nextDocNo('TO', moves.map(x => x.move_no));
            await db.insert('tool_movements', {
              move_no, move_date: g('move_date') || todayStr(), move_type: '출고',
              tool_code: code, tool_name: t.name, lot_no: g('lot_no'), qty,
              dest_type: g('dest_type'), machine_no: g('machine_no'), partner: g('partner'),
              wo_no: g('wo_no'), worker: g('worker'), dept: g('dept'),
              use_start: g('use_start') || null, return_due: g('return_due') || null,
              location: t.location, remark: g('remark'),
            });
            close(); toast(`출고 처리되었습니다. (${move_no})`); await reload();
          } catch (e) { toast(e.message || '출고 실패', 'error'); }
        };
      },
    });
  }

  function openReturn(m) {
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field col-2"><label>출고 건</label><input class="input" value="${escapeHtml(m.move_no)} · ${escapeHtml(m.tool_name || '')} ${m.lot_no ? `(${escapeHtml(m.lot_no)})` : ''}" readonly></div>
      <div class="field"><label>회수일 <span class="req">*</span></label><input class="input" type="date" name="move_date" value="${todayStr()}"></div>
      <div class="field"><label>회수수량 <span class="req">*</span></label><input class="input" type="number" name="qty" value="${m.qty || 1}"></div>
      <div class="field"><label>회수처 구분</label><input class="input" value="${escapeHtml(m.dest_type || '사내')}" readonly></div>
      <div class="field"><label>회수 담당자</label><select class="select" name="worker"><option value="">선택</option>
        ${users.map(u => `<option value="${escapeHtml(u.name)}" ${u.name === m.worker ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select></div>
      <div class="field col-2"><label>회수 시 상태 / 비고</label><input class="input" name="remark" placeholder="예: 정상 회수 / 마모 심함 → 폐기 검토"></div>`;
    openModal({
      title: '공구 회수', body,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('download', 16)} 회수 처리</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => body.querySelector(`[name="${n}"]`).value.trim();
          try {
            const move_no = nextDocNo('TR', moves.map(x => x.move_no));
            await db.insert('tool_movements', {
              move_no, move_date: g('move_date') || todayStr(), move_type: '회수',
              tool_code: m.tool_code, tool_name: m.tool_name, lot_no: m.lot_no, qty: Number(g('qty')) || 0,
              dest_type: m.dest_type, machine_no: m.machine_no, partner: m.partner,
              wo_no: m.wo_no, worker: g('worker'), location: m.location, remark: g('remark'),
            });
            close(); toast('회수 처리되었습니다.'); await reload();
          } catch (e) { toast(e.message || '회수 실패', 'error'); }
        };
      },
    });
  }
  function exportCsv() {
    downloadCSV(`공구출고회수_${todayStr()}.csv`, [
      { label: '번호', key: 'move_no' }, { label: '일자', key: 'move_date', csv: r => fmtDate(r.move_date) },
      { label: '구분', key: 'move_type' }, { label: '공구코드', key: 'tool_code' }, { label: '공구명', key: 'tool_name' },
      { label: 'LOT', key: 'lot_no' }, { label: '수량', key: 'qty' }, { label: '작업지시', key: 'wo_no' },
      { label: '호기', key: 'machine_no' }, { label: '외주처', key: 'partner' }, { label: '작업자', key: 'worker' },
      { label: '부서', key: 'dept' }, { label: '반납예정', key: 'return_due', csv: r => fmtDate(r.return_due) },
    ], scoped());
    toast('CSV로 내보냈습니다.');
  }
  async function reload() {
    try { await loadAll(); renderStats(); renderChips(); renderRecent(); renderTable(); }
    catch (e) { root.querySelector('#ti-table').innerHTML = `<div class="empty">${icon('alert', 46)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
  }
  reload();
}

// =====================================================================
// 5-5 재고조정 (신규)
// =====================================================================
export async function toolAdjustments(root) {
  const state = { search: '', chip: '전체' };
  let rows = [], tools = [], moves = [], disposals = [], users = [];

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>공구 재고조정</h1><p>재고실사 결과를 등록합니다. 전산재고와 실사재고 차이가 자동 계산되며, <b>승인된 조정만 재고에 반영</b>됩니다.</p></div>
      <div class="page-head__actions">
        <button class="btn" id="ta-csv">${icon('download', 16)} 엑셀(CSV)</button>
        <button class="btn" id="ta-refresh">${icon('refresh', 16)} 새로고침</button>
        <button class="btn btn--primary" id="ta-add">${icon('plus', 16)} 실사 등록</button>
      </div>
    </div>
    <div id="ta-stats"></div>
    <div class="card">
      <div class="toolbar"><div class="search-box grow">${icon('search', 16)}<input id="ta-search" placeholder="조정번호·공구·사유 검색" autocomplete="off"/></div></div>
      <div class="toolbar" style="border-top:0;padding-top:12px"><div class="chips" id="ta-chips"></div></div>
      <div class="table-wrap"><div id="ta-table"><div class="spinner"></div></div></div>
    </div>`;
  root.querySelector('#ta-refresh').onclick = () => reload();
  root.querySelector('#ta-add').onclick = () => openForm();
  root.querySelector('#ta-csv').onclick = () => exportCsv();
  root.querySelector('#ta-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });

  async function loadAll() {
    [rows, tools, moves, disposals, users] = await Promise.all([
      db.all('tool_adjustments', {}).catch(() => []),
      db.all('tools', { sort: 'code' }).catch(() => []),
      db.all('tool_movements', {}).catch(() => []),
      db.all('tool_disposals', {}).catch(() => []),
      db.all('users', { sort: 'name' }).catch(() => []),
    ]);
  }
  function systemQty(code) {
    const mv = moves.filter(m => m.tool_code === code);
    const inQ = mv.filter(m => m.move_type === '입고').reduce((s, m) => s + (+m.qty || 0), 0);
    const dsQ = disposals.filter(d => d.tool_code === code && d.status !== '반려').reduce((s, d) => s + (+d.qty || 0), 0);
    const adjQ = rows.filter(a => a.tool_code === code && a.status === '승인').reduce((s, a) => s + (+a.adj_qty || 0), 0);
    return inQ - dsQ + adjQ;
  }
  function scoped() {
    const q = state.search.toLowerCase();
    return rows.filter(r => {
      if (state.chip !== '전체' && (r.status || '신청') !== state.chip) return false;
      if (q && ![r.adj_no, r.tool_code, r.tool_name, r.reason, r.location].some(v => String(v ?? '').toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => String(b.adj_date).localeCompare(String(a.adj_date)));
  }
  function renderStats() {
    root.querySelector('#ta-stats').innerHTML = `<div class="stat-grid">
      ${stat('총 조정', num(rows.length), '건', 'sliders', 'brand')}
      ${stat('승인 대기', num(rows.filter(r => (r.status || '신청') === '신청').length), '건', 'clock', 'amber')}
      ${stat('승인 완료', num(rows.filter(r => r.status === '승인').length), '건', 'checkCircle', 'green')}
      ${stat('차이 수량 합계', num(rows.filter(r => r.status === '승인').reduce((s, r) => s + Math.abs(+r.adj_qty || 0), 0)), 'EA', 'alert', 'violet')}</div>`;
  }
  function renderChips() {
    const wrap = root.querySelector('#ta-chips');
    const opts = [['전체', rows.length], ['신청', rows.filter(r => (r.status || '신청') === '신청').length],
      ['승인', rows.filter(r => r.status === '승인').length], ['반려', rows.filter(r => r.status === '반려').length]];
    wrap.innerHTML = opts.map(([t, c]) => `<button class="chip ${state.chip === t ? 'active' : ''}" data-c="${t}">${t}<span class="chip__count">${c}</span></button>`).join('');
    wrap.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { state.chip = b.dataset.c; renderChips(); renderTable(); });
  }
  function renderTable() {
    const list = scoped(); const slot = root.querySelector('#ta-table');
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:44px">${icon('inbox', 46)}<h4>재고조정 내역이 없습니다</h4><p>[실사 등록]으로 재고실사 결과를 입력하세요.</p></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th>조정번호</th><th>조정일</th><th>공구</th><th>위치</th><th class="num">전산재고</th><th class="num">실사재고</th><th class="num">조정수량</th>
      <th>조정사유</th><th>담당자</th><th class="center">상태</th><th class="center" style="width:110px">관리</th>
    </tr></thead><tbody>${list.map(r => `<tr>
      <td class="cell-code">${escapeHtml(r.adj_no)}</td><td>${fmtDate(r.adj_date)}</td>
      <td class="cell-strong">${escapeHtml(r.tool_name || r.tool_code)}</td><td>${escapeHtml(r.location || '')}</td>
      <td class="num mono">${num(r.system_qty)}</td><td class="num mono">${num(r.actual_qty)}</td>
      <td class="num mono" style="font-weight:700;color:${(+r.adj_qty || 0) < 0 ? 'var(--danger)' : (+r.adj_qty || 0) > 0 ? 'var(--success)' : 'inherit'}">${(+r.adj_qty || 0) > 0 ? '+' : ''}${num(r.adj_qty)}</td>
      <td>${escapeHtml(r.reason || '')}</td><td>${escapeHtml(r.worker || '')}</td>
      <td class="center">${badge(r.status || '신청')}</td>
      <td class="center"><div class="row-actions">
        ${(r.status || '신청') === '신청' ? `<button class="icon-btn" data-ok="${r.id}" title="승인">${icon('check', 15)}</button>
        <button class="icon-btn" data-no="${r.id}" title="반려">${icon('x', 15)}</button>` : ''}
        <button class="icon-btn" data-del="${r.id}" title="삭제">${icon('trash', 15)}</button></div></td>
    </tr>`).join('')}</tbody></table>`;
    slot.querySelectorAll('[data-ok]').forEach(b => b.onclick = async () => {
      const r = list.find(x => x.id === b.dataset.ok);
      if (!(await confirmDialog({ title: '재고조정 승인', danger: false, confirmText: '승인', message: `[${r.tool_name}] 조정수량 ${(+r.adj_qty || 0) > 0 ? '+' : ''}${r.adj_qty}를 승인하시겠습니까?\n승인 시 재고에 즉시 반영됩니다.` }))) return;
      try { await db.update('tool_adjustments', r.id, { status: '승인', approve_date: todayStr() }); toast('승인되었습니다.'); reload(); } catch (e) { toast(e.message || '승인 실패', 'error'); }
    });
    slot.querySelectorAll('[data-no]').forEach(b => b.onclick = async () => {
      const r = list.find(x => x.id === b.dataset.no);
      try { await db.update('tool_adjustments', r.id, { status: '반려' }); toast('반려되었습니다.'); reload(); } catch (e) { toast(e.message || '실패', 'error'); }
    });
    slot.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const r = list.find(x => x.id === b.dataset.del);
      if (!(await confirmDialog({ message: `[${r.adj_no}]을(를) 삭제하시겠습니까?`, confirmText: '삭제' }))) return;
      try { await db.remove('tool_adjustments', r.id); toast('삭제되었습니다.'); reload(); } catch (e) { toast(e.message || '삭제 실패', 'error'); }
    });
  }
  function openForm() {
    const body = document.createElement('div');
    body.innerHTML = `<div class="muted" style="margin-bottom:10px">실사재고만 입력하면 조정수량이 자동 계산됩니다. 차이가 없는 항목은 저장되지 않습니다.</div>
      <div class="form-grid" style="margin-bottom:12px">
        <div class="field"><label>조정일</label><input class="input" type="date" id="adj-date" value="${todayStr()}"></div>
        <div class="field"><label>실사 담당자</label><select class="select" id="adj-worker"><option value="">선택</option>
          ${users.map(u => `<option value="${escapeHtml(u.name)}">${escapeHtml(u.name)}</option>`).join('')}</select></div>
      </div>
      <div class="table-wrap" style="max-height:400px;overflow-y:auto"><table class="grid">
        <thead><tr><th>공구</th><th>위치</th><th class="num">전산재고</th><th style="width:110px">실사재고</th><th class="num">조정수량</th><th style="width:130px">조정사유</th></tr></thead>
        <tbody>${tools.map((t, i) => {
          const sys = systemQty(t.code);
          return `<tr data-row="${i}" data-code="${escapeHtml(t.code)}">
            <td class="cell-strong">${escapeHtml(t.code)} · ${escapeHtml(t.name)}</td><td>${escapeHtml(t.location || '')}</td>
            <td class="num mono" data-sys>${num(sys)}</td>
            <td><input class="ge__in" type="number" data-actual="${i}" placeholder="${sys}"></td>
            <td class="num mono" data-diff="${i}">-</td>
            <td><select class="ge__in" data-reason="${i}">${ADJ_REASONS.map(r => `<option value="${r}">${r}</option>`).join('')}</select></td>
          </tr>`;
        }).join('')}</tbody></table></div>`;
    body.querySelectorAll('[data-actual]').forEach(el => el.addEventListener('input', () => {
      const i = el.dataset.actual;
      const tr = body.querySelector(`[data-row="${i}"]`);
      const sys = Number(tr.querySelector('[data-sys]').textContent.replace(/[^0-9.-]/g, '')) || 0;
      const act = el.value === '' ? null : Number(el.value);
      const cell = body.querySelector(`[data-diff="${i}"]`);
      if (act === null) { cell.textContent = '-'; cell.style.color = ''; return; }
      const diff = act - sys;
      cell.textContent = (diff > 0 ? '+' : '') + num(diff);
      cell.style.color = diff < 0 ? 'var(--danger)' : diff > 0 ? 'var(--success)' : '';
      cell.style.fontWeight = '700';
    }));
    openModal({
      title: '공구 재고실사 등록', body, wide: true,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 조정 신청</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const date = body.querySelector('#adj-date').value || todayStr();
          const worker = body.querySelector('#adj-worker').value;
          const targets = [];
          body.querySelectorAll('[data-row]').forEach(tr => {
            const i = tr.dataset.row;
            const el = tr.querySelector(`[data-actual="${i}"]`);
            if (el.value === '') return;
            const sys = Number(tr.querySelector('[data-sys]').textContent.replace(/[^0-9.-]/g, '')) || 0;
            const act = Number(el.value);
            if (act === sys) return; // 차이 없으면 제외
            const t = tools.find(x => x.code === tr.dataset.code);
            targets.push({ tool: t, sys, act, diff: act - sys, reason: tr.querySelector(`[data-reason="${i}"]`).value });
          });
          if (!targets.length) { toast('차이가 있는 항목이 없습니다.', 'error'); return; }
          try {
            const used = rows.map(x => x.adj_no);
            for (const t of targets) {
              const adj_no = nextDocNo('TA', used); used.push(adj_no);
              await db.insert('tool_adjustments', {
                adj_no, adj_date: date, tool_code: t.tool.code, tool_name: t.tool.name, location: t.tool.location,
                system_qty: t.sys, actual_qty: t.act, adj_qty: t.diff, reason: t.reason, worker, status: '신청',
              });
            }
            close(); toast(`${targets.length}건이 조정 신청되었습니다. 승인 후 재고에 반영됩니다.`); await reload();
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }
  function exportCsv() {
    downloadCSV(`공구재고조정_${todayStr()}.csv`, [
      { label: '조정번호', key: 'adj_no' }, { label: '조정일', key: 'adj_date', csv: r => fmtDate(r.adj_date) },
      { label: '공구코드', key: 'tool_code' }, { label: '공구명', key: 'tool_name' }, { label: '위치', key: 'location' },
      { label: '전산재고', key: 'system_qty' }, { label: '실사재고', key: 'actual_qty' }, { label: '조정수량', key: 'adj_qty' },
      { label: '사유', key: 'reason' }, { label: '담당자', key: 'worker' }, { label: '상태', key: 'status' },
    ], scoped());
    toast('CSV로 내보냈습니다.');
  }
  async function reload() {
    try { await loadAll(); renderStats(); renderChips(); renderTable(); }
    catch (e) { root.querySelector('#ta-table').innerHTML = `<div class="empty" style="padding:40px">${icon('database', 46)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p><p class="muted">신규 테이블이 없으면 <b>supabase/migration_v2_sq.sql</b>을 실행하세요.</p></div>`; }
  }
  reload();
}

// =====================================================================
// 5-6 폐기관리
// =====================================================================
export async function toolDisposals(root) {
  const state = { search: '', chip: '전체' };
  let rows = [], tools = [], moves = [], users = [];

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>공구 폐기관리</h1><p>수명종료·파손 공구를 폐기 신청·승인합니다. <b>승인 후 재고가 차감</b>되고 해당 LOT은 재출고가 차단됩니다.</p></div>
      <div class="page-head__actions">
        <button class="btn" id="td-over">${icon('alert', 16)} 수명초과 자동검색</button>
        <button class="btn" id="td-refresh">${icon('refresh', 16)} 새로고침</button>
        <button class="btn btn--primary" id="td-add">${icon('plus', 16)} 폐기 신청</button>
      </div>
    </div>
    <div id="td-stats"></div>
    <div class="card">
      <div class="toolbar"><div class="search-box grow">${icon('search', 16)}<input id="td-search" placeholder="폐기번호·공구·LOT·사유 검색" autocomplete="off"/></div></div>
      <div class="toolbar" style="border-top:0;padding-top:12px"><div class="chips" id="td-chips"></div></div>
      <div class="table-wrap"><div id="td-table"><div class="spinner"></div></div></div>
    </div>`;
  root.querySelector('#td-refresh').onclick = () => reload();
  root.querySelector('#td-add').onclick = () => openForm(null);
  root.querySelector('#td-over').onclick = () => findOverLife();
  root.querySelector('#td-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });

  async function loadAll() {
    [rows, tools, moves, users] = await Promise.all([
      db.all('tool_disposals', {}).catch(() => []),
      db.all('tools', { sort: 'code' }).catch(() => []),
      db.all('tool_movements', {}).catch(() => []),
      db.all('users', { sort: 'name' }).catch(() => []),
    ]);
  }
  function scoped() {
    const q = state.search.toLowerCase();
    return rows.filter(r => {
      if (state.chip !== '전체' && (r.status || '승인') !== state.chip) return false;
      if (q && ![r.disposal_no, r.tool_code, r.tool_name, r.lot_no, r.reason].some(v => String(v ?? '').toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => String(b.disposal_date).localeCompare(String(a.disposal_date)));
  }
  function renderStats() {
    root.querySelector('#td-stats').innerHTML = `<div class="stat-grid">
      ${stat('총 폐기', num(rows.length), '건', 'trash', 'brand')}
      ${stat('승인 대기', num(rows.filter(r => (r.status || '승인') === '신청').length), '건', 'clock', 'amber')}
      ${stat('폐기 수량', num(rows.filter(r => r.status !== '반려').reduce((s, r) => s + (+r.qty || 0), 0)), 'EA', 'box', 'red')}
      ${stat('수명초과 폐기', num(rows.filter(r => r.reason === '수명초과').length), '건', 'alert', 'violet')}</div>`;
  }
  function renderChips() {
    const wrap = root.querySelector('#td-chips');
    const opts = [['전체', rows.length], ['신청', rows.filter(r => (r.status || '승인') === '신청').length],
      ['승인', rows.filter(r => (r.status || '승인') === '승인').length], ['반려', rows.filter(r => r.status === '반려').length]];
    wrap.innerHTML = opts.map(([t, c]) => `<button class="chip ${state.chip === t ? 'active' : ''}" data-c="${t}">${t}<span class="chip__count">${c}</span></button>`).join('');
    wrap.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { state.chip = b.dataset.c; renderChips(); renderTable(); });
  }
  function renderTable() {
    const list = scoped(); const slot = root.querySelector('#td-table');
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:44px">${icon('inbox', 46)}<h4>폐기 내역이 없습니다</h4></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th>폐기번호</th><th>폐기일</th><th>공구</th><th>LOT</th><th class="num">수량</th><th>폐기사유</th>
      <th class="num">잔여수명</th><th>담당자</th><th>승인자</th><th class="center">상태</th><th class="center" style="width:110px">관리</th>
    </tr></thead><tbody>${list.map(r => `<tr>
      <td class="cell-code">${escapeHtml(r.disposal_no)}</td><td>${fmtDate(r.disposal_date)}</td>
      <td class="cell-strong">${escapeHtml(r.tool_name || r.tool_code)}</td><td class="cell-code">${escapeHtml(r.lot_no || '')}</td>
      <td class="num mono">${num(r.qty)}</td><td>${badge(r.reason || '', 'brand')}</td>
      <td class="num mono">${r.remain_life != null ? num(r.remain_life) : '-'}</td>
      <td>${escapeHtml(r.worker || '')}</td><td>${escapeHtml(r.approver || '')}</td>
      <td class="center">${badge(r.status || '승인')}</td>
      <td class="center"><div class="row-actions">
        ${(r.status || '승인') === '신청' ? `<button class="icon-btn" data-ok="${r.id}" title="승인">${icon('check', 15)}</button>
        <button class="icon-btn" data-no="${r.id}" title="반려">${icon('x', 15)}</button>` : ''}
        <button class="icon-btn" data-del="${r.id}" title="삭제">${icon('trash', 15)}</button></div></td>
    </tr>`).join('')}</tbody></table>`;
    slot.querySelectorAll('[data-ok]').forEach(b => b.onclick = () => openApprove(list.find(x => x.id === b.dataset.ok)));
    slot.querySelectorAll('[data-no]').forEach(b => b.onclick = async () => {
      const r = list.find(x => x.id === b.dataset.no);
      try { await db.update('tool_disposals', r.id, { status: '반려' }); toast('반려되었습니다.'); reload(); } catch (e) { toast(e.message || '실패', 'error'); }
    });
    slot.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const r = list.find(x => x.id === b.dataset.del);
      if (!(await confirmDialog({ message: `[${r.disposal_no}]을(를) 삭제하시겠습니까?`, confirmText: '삭제' }))) return;
      try { await db.remove('tool_disposals', r.id); toast('삭제되었습니다.'); reload(); } catch (e) { toast(e.message || '삭제 실패', 'error'); }
    });
  }
  function openApprove(r) {
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field col-2"><label>폐기 건</label><input class="input" value="${escapeHtml(r.disposal_no)} · ${escapeHtml(r.tool_name || '')} ${r.lot_no ? `(${escapeHtml(r.lot_no)})` : ''} · ${num(r.qty)}EA" readonly></div>
      <div class="field"><label>승인자 <span class="req">*</span></label><select class="select" name="approver"><option value="">선택</option>
        ${users.map(u => `<option value="${escapeHtml(u.name)}">${escapeHtml(u.name)} (${escapeHtml(u.department || '')})</option>`).join('')}</select></div>
      <div class="field"><label>승인일</label><input class="input" type="date" name="approve_date" value="${todayStr()}"></div>
      <div class="field col-2 muted" style="background:var(--surface-2);padding:10px 12px;border-radius:10px">승인 시 재고가 차감되고 해당 LOT은 <b>재출고가 차단</b>됩니다.</div>`;
    openModal({
      title: '폐기 승인', body,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 승인</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const approver = body.querySelector('[name="approver"]').value;
          if (!approver) { toast('승인자를 선택하세요.', 'error'); return; }
          try {
            await db.update('tool_disposals', r.id, { status: '승인', approver, approve_date: body.querySelector('[name="approve_date"]').value || todayStr() });
            close(); toast('승인되었습니다. 재고가 차감되었습니다.'); reload();
          } catch (e) { toast(e.message || '승인 실패', 'error'); }
        };
      },
    });
  }
  // 수명초과 LOT 자동 검색 → 폐기 신청
  function findOverLife() {
    const cands = [];
    for (const t of tools) {
      const life1 = +t.life_count || 0;
      if (!life1) continue;
      const ins = moves.filter(m => m.move_type === '입고' && m.tool_code === t.code);
      const disposed = new Set(rows.filter(d => d.tool_code === t.code && d.lot_no).map(d => d.lot_no));
      for (const m of ins) {
        const qty = +m.qty || 0;
        for (let i = 1; i <= qty; i++) {
          const lot = m.lot_no && qty === 1 ? m.lot_no : `${m.move_no}-${String(i).padStart(2, '0')}`;
          if (disposed.has(lot)) continue;
          // 사용횟수 = tool_usages (없으면 0)
          cands.push({ tool: t, lot, life: life1, used: 0, remain: life1 });
        }
      }
    }
    const over = cands.filter(c => c.remain <= 0);
    if (!over.length) { toast('수명초과 공구가 없습니다. (POP 사용횟수 누적 기준)', 'error'); return; }
    openForm(null, over);
  }
  function openForm(r, presets) {
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field"><label>폐기일 <span class="req">*</span></label><input class="input" type="date" name="disposal_date" value="${todayStr()}"></div>
      <div class="field"><label>공구 <span class="req">*</span></label><select class="select" name="tool_code"><option value="">선택</option>
        ${tools.map(t => `<option value="${escapeHtml(t.code)}" data-life="${t.life_count || 0}">${escapeHtml(t.code)} · ${escapeHtml(t.name)}</option>`).join('')}</select></div>
      <div class="field"><label>LOT 번호</label><input class="input" name="lot_no" placeholder="LOT 단위 폐기 시 입력"></div>
      <div class="field"><label>폐기수량 <span class="req">*</span></label><input class="input" type="number" name="qty" value="1"></div>
      <div class="field"><label>폐기사유 <span class="req">*</span></label><select class="select" name="reason">${DISPOSAL_REASONS.map(x => `<option value="${x}">${x}</option>`).join('')}</select></div>
      <div class="field"><label>잔여수명</label><input class="input" type="number" name="remain_life" value="0" placeholder="폐기 시점 잔여수명"></div>
      <div class="field"><label>담당자</label><select class="select" name="worker"><option value="">선택</option>
        ${users.map(u => `<option value="${escapeHtml(u.name)}">${escapeHtml(u.name)}</option>`).join('')}</select></div>
      <div class="field"><label>폐기사진 URL</label><input class="input" name="photo_url"></div>
      <div class="field col-2"><label>비고</label><textarea class="textarea" name="remark"></textarea></div>
      <div class="field col-2" id="td-usage"></div>`;
    // 공구 선택 시 사용이력 표시
    body.querySelector('[name="tool_code"]').addEventListener('change', (e) => {
      const code = e.target.value;
      const slot = body.querySelector('#td-usage');
      const hist = moves.filter(m => m.tool_code === code).slice(-5).reverse();
      slot.innerHTML = hist.length ? `<div class="muted" style="font-size:12px;font-weight:700;margin-bottom:6px">최근 사용이력</div>
        <div class="table-wrap"><table class="grid"><thead><tr><th>일자</th><th class="center">구분</th><th class="num">수량</th><th>호기</th><th>작업자</th></tr></thead>
        <tbody>${hist.map(m => `<tr><td>${fmtDate(m.move_date)}</td><td class="center">${badge(m.move_type || '')}</td><td class="num mono">${num(m.qty)}</td><td>${escapeHtml(m.machine_no || '')}</td><td>${escapeHtml(m.worker || '')}</td></tr>`).join('')}</tbody></table></div>` : '';
    });
    if (presets?.length) {
      const p = presets[0];
      body.querySelector('[name="tool_code"]').value = p.tool.code;
      body.querySelector('[name="lot_no"]').value = p.lot;
      body.querySelector('[name="reason"]').value = '수명초과';
      body.querySelector('[name="remain_life"]').value = 0;
    }
    openModal({
      title: '공구 폐기 신청', body, wide: true,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 신청</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => { const el = body.querySelector(`[name="${n}"]`); return el ? el.value.trim() : ''; };
          if (!g('tool_code')) { toast('공구를 선택하세요.', 'error'); return; }
          const t = tools.find(x => x.code === g('tool_code'));
          try {
            const disposal_no = nextDocNo('TD', rows.map(x => x.disposal_no));
            await db.insert('tool_disposals', {
              disposal_no, disposal_date: g('disposal_date') || todayStr(),
              tool_code: t.code, tool_name: t.name, lot_no: g('lot_no'), qty: Number(g('qty')) || 0,
              reason: g('reason'), remain_life: Number(g('remain_life')) || 0, life_used: (+t.life_count || 0) - (Number(g('remain_life')) || 0),
              worker: g('worker'), photo_url: g('photo_url'), remark: g('remark'), status: '신청',
            });
            close(); toast('폐기 신청되었습니다. 승인 후 재고가 차감됩니다.'); await reload();
          } catch (e) { toast(e.message || '저장 실패', 'error'); }
        };
      },
    });
  }
  async function reload() {
    try { await loadAll(); renderStats(); renderChips(); renderTable(); }
    catch (e) { root.querySelector('#td-table').innerHTML = `<div class="empty">${icon('alert', 46)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
  }
  reload();
}

// 공구 치수검증 (기존 유지)
export const toolVerifications = createCrudPage({
  table: 'tool_verifications', title: '공구 치수검증', subtitle: '공구 교체 전/후 및 교체 후 일정수량 가공품의 치수 검증값을 기록합니다.',
  searchFields: ['verify_no', 'tool_code', 'tool_name', 'lot_no', 'machine_no', 'wo_no', 'inspect_item'], searchPlaceholder: '검증번호·공구·호기·작업지시 검색',
  defaultSort: { key: 'verify_date', dir: 'desc' },
  dateField: { key: 'verify_date', label: '검증일' },
  filters: [{ key: 'verify_type', label: '구분', options: ['교체전', '교체후', '교체후N개'] }, { key: 'judgment', label: '판정', options: ['OK', 'NG'] }],
  statusChips: { key: 'judgment', options: ['OK', 'NG'] },
  docNoField: { key: 'verify_no', prefix: 'TV' },
  stats: async (rows) => {
    const ok = rows.filter(r => r.judgment === 'OK').length;
    return [
      { label: '총 검증', value: num(rows.length), unit: '건', icon: 'target', tint: 'brand' },
      { label: 'OK', value: num(ok), unit: '건', icon: 'checkCircle', tint: 'green' },
      { label: 'NG', value: num(rows.filter(r => r.judgment === 'NG').length), unit: '건', icon: 'alert', tint: 'red' },
      { label: '합격률', value: rows.length ? ((ok / rows.length) * 100).toFixed(1) : '0.0', unit: '%', icon: 'trendUp', tint: 'violet' },
    ];
  },
  columns: [
    { key: 'verify_no', label: '검증번호', cls: 'cell-code', sortable: true },
    { key: 'verify_date', label: '검증일', type: 'date', sortable: true },
    { key: 'verify_type', label: '구분', type: 'badge', align: 'center' },
    { key: 'tool_name', label: '공구명', cls: 'cell-strong' },
    { key: 'lot_no', label: '공구LOT', cls: 'cell-code' },
    { key: 'machine_no', label: '호기', align: 'center' },
    { key: 'wo_no', label: '작업지시', cls: 'cell-code' },
    { key: 'inspect_item', label: '검증항목' },
    { key: 'spec_value', label: '규격' },
    { key: 'tolerance', label: '공차' },
    { key: 'measured', label: '측정값', align: 'right', cls: 'mono' },
    { key: 'judgment', label: '판정', type: 'badge', align: 'center' },
    { key: 'worker', label: '검증자' },
  ],
  fields: [
    { key: 'verify_no', label: '검증번호 (자동생성)', placeholder: '비워두면 자동 채번' },
    { key: 'verify_date', label: '검증일', type: 'date', required: true, default: todayStr() },
    { key: 'verify_type', label: '검증 구분', type: 'select', options: ['교체전', '교체후', '교체후N개'], default: '교체후' },
    { key: 'tool_code', label: '공구', required: true, ref: { table: 'tools', value: 'code', label: (r) => `${r.code} · ${r.name}`, fill: { tool_name: 'name' } }, placeholder: '공구 선택' },
    { key: 'tool_name', label: '공구명(자동)', required: true, readonly: true },
    { key: 'lot_no', label: '공구 LOT' },
    { key: 'machine_no', label: '호기', ref: { table: 'equipments', value: 'code', label: (r) => `${r.code} · ${r.name}` }, placeholder: '호기 선택' },
    { key: 'wo_no', label: '작업지시', ref: { table: 'work_orders', value: 'wo_no', label: (r) => `${r.wo_no} · ${r.item_name}`, fill: { item_code: 'item_code' } }, placeholder: '작업지시 선택' },
    { key: 'item_code', label: '품목코드', readonly: true },
    { key: 'inspect_item', label: '검증 치수항목', required: true, placeholder: '예: 내경 Ø25' },
    { key: 'spec_value', label: '규격값', placeholder: '25.0' },
    { key: 'tolerance', label: '공차', placeholder: '0.02' },
    { key: 'measured', label: '측정값', required: true, placeholder: '25.01' },
    { key: 'judgment', label: '판정', type: 'select', options: ['OK', 'NG'], default: 'OK' },
    { key: 'worker', label: '검증자', ref: { table: 'users', value: 'name', label: (r) => `${r.name} (${r.department || ''})` }, placeholder: '검증자 선택' },
    { key: 'remark', label: '비고', type: 'textarea' },
  ],
});
