// =====================================================================
// 검사 실행 화면 — 수입검사 / 공정검사 / 출하검사
//   · 좌: 검사대상 목록 / 우: 검사결과 입력 (검사규격 자동호출)
//   · 정량: 상·하한(또는 규격±공차) 자동판정, 정성: OK/NG
//   · 검교정 기한 초과 계측기 선택 제한, 불합격 시 부적합 연계
// =====================================================================
import { db } from '../lib/db.js';
import { num, fmtDate, todayStr, escapeHtml, nextDocNo, downloadCSV } from '../lib/format.js';
import { badge, toast, openModal, confirmDialog } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { getActiveSpec } from './inspectionSpec.js';

// ---------- 공통 유틸 ----------
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
function stat(label, value, unit, ic, tint) {
  return `<div class="stat"><div class="stat__top"><span class="stat__label">${escapeHtml(label)}</span><span class="stat__ico ico-tint-${tint}">${icon(ic, 21)}</span></div><div class="stat__value">${value}${unit ? `<small>${escapeHtml(unit)}</small>` : ''}</div></div>`;
}
function info(label, val) {
  return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:11px 13px"><div class="muted" style="font-size:11.5px">${escapeHtml(label)}</div><div style="font-weight:700;margin-top:2px">${escapeHtml(val ?? '')}</div></div>`;
}

// 정량 판정: 상·하한 우선, 없으면 규격값±공차
export function judgeValue(specItem, measured) {
  const m = parseFloat(measured);
  if (isNaN(m)) return null;
  const lsl = specItem.lsl != null && specItem.lsl !== '' ? Number(specItem.lsl) : null;
  const usl = specItem.usl != null && specItem.usl !== '' ? Number(specItem.usl) : null;
  if (lsl != null || usl != null) {
    if (lsl != null && m < lsl) return 'NG';
    if (usl != null && m > usl) return 'NG';
    return 'OK';
  }
  const s = parseFloat(specItem.spec_value);
  if (isNaN(s)) return null;
  const t = Math.abs(parseFloat(String(specItem.tolerance ?? '').replace(/[^0-9.\-]/g, '')) || 0);
  return (m >= s - t && m <= s + t) ? 'OK' : 'NG';
}

// 검교정 유효 계측기만 (기한 초과 제외)
function validInstruments(insts) {
  const t = todayStr();
  return insts.map(i => {
    const over = i.next_calib && String(i.next_calib).slice(0, 10) < t;
    const bad = ['교정중', '수리중', '폐기'].includes(i.status);
    return { ...i, _blocked: over || bad, _reason: over ? '교정기한 초과' : bad ? i.status : '' };
  });
}

// =====================================================================
// 검사 실행 모달 (공통) — 검사규격(승인 최신본) 호출 → 항목 평가 → 저장
// =====================================================================
export async function openInspectionModal(opts) {
  // opts: { kind, table, docPrefix, preset{refLabel,refValue,item_code,item_name,partner,lot_no,inspect_qty,process,equipment,worker}, extra, onSaved }
  const p = opts.preset || {};
  const [users, instsRaw] = await Promise.all([
    db.all('users', { sort: 'name' }).catch(() => []),
    db.all('measuring_instruments', { sort: 'code' }).catch(() => []),
  ]);
  const insts = validInstruments(instsRaw);
  const active = await getActiveSpec(p.item_code, opts.kind, p.process);
  const specItems = active ? active.items.filter(i => i.use_yn !== false) : [];

  const body = document.createElement('div');
  body.innerHTML = `
    <form id="ins-form" class="form-grid">
      <div class="field"><label>검사일 <span class="req">*</span></label><input class="input" name="inspect_date" type="date" value="${todayStr()}"></div>
      <div class="field"><label>${escapeHtml(p.refLabel || '참조번호')}</label><input class="input" value="${escapeHtml(p.refValue || '')}" readonly></div>
      ${p.lot_no ? `<div class="field"><label>LOT</label><input class="input" value="${escapeHtml(p.lot_no)}" readonly></div>` : ''}
      <div class="field"><label>품목</label><input class="input" value="${escapeHtml(p.item_code || '')} · ${escapeHtml(p.item_name || '')}" readonly></div>
      ${p.partner ? `<div class="field"><label>거래처</label><input class="input" value="${escapeHtml(p.partner)}" readonly></div>` : ''}
      ${p.process ? `<div class="field"><label>공정</label><input class="input" value="${escapeHtml(p.process)}${p.equipment ? ' / ' + escapeHtml(p.equipment) : ''}" readonly></div>` : ''}
      ${opts.kind === '공정검사' ? `<div class="field"><label>검사구분 <span class="req">*</span></label>
        <select class="select" name="inspect_stage"><option value="초물">초물</option><option value="중물" selected>중물</option><option value="종물">종물</option></select></div>` : ''}
      <div class="field"><label>검사수량</label><input class="input" name="inspect_qty" type="number" value="${p.inspect_qty || 0}"></div>
      <div class="field"><label>샘플수량</label><input class="input" name="sample_qty" type="number" value="${specItems[0]?.sample_size || 0}"></div>
      <div class="field"><label>불량수량</label><input class="input" name="defect_qty" type="number" value="0"></div>
      <div class="field"><label>양품수량(자동)</label><input class="input" name="good_qty" type="number" value="${p.inspect_qty || 0}" readonly></div>
      <div class="field"><label>검사자 <span class="req">*</span></label><select class="select" name="inspector"><option value="">선택</option>
        ${users.map(u => `<option value="${escapeHtml(u.name)}" ${u.name === p.worker ? 'selected' : ''}>${escapeHtml(u.name)}${u.department ? ` (${escapeHtml(u.department)})` : ''}</option>`).join('')}</select></div>
      ${opts.kind === '출하검사' ? `
      <div class="field"><label>포장상태</label><select class="select" name="package_check"><option value="양호">양호</option><option value="불량">불량</option></select></div>
      <div class="field"><label>라벨 확인</label><select class="select" name="label_check"><option value="적합">적합</option><option value="부적합">부적합</option></select></div>` : ''}
      <div class="field col-2"><label>검사성적서/사진 URL</label><input class="input" name="report_url" placeholder="첨부 파일 링크"></div>
    </form>
    ${active ? `<div class="flex" style="margin:16px 0 8px;gap:8px;align-items:center">
        ${icon('shield', 18)}<b>검사규격 평가</b>
        <span class="badge badge--info">${escapeHtml(active.spec.spec_no)} · Rev.${escapeHtml(active.spec.rev || '00')}</span>
        <span class="muted" style="font-size:12px">승인 최신본 자동 적용</span>
        <div class="spacer"></div>
        <button class="btn btn--sm" type="button" id="ins-allok">${icon('check', 14)} 전체 적합</button>
      </div>` : `<h4 style="margin:18px 0 10px;display:flex;align-items:center;gap:8px">${icon('shield', 18)} 검사규격 평가</h4>`}
    <div id="ins-criteria"></div>
    <div class="flex between" style="margin-top:14px;padding:12px 16px;background:var(--surface-2);border-radius:10px">
      <b>종합 판정</b><span id="ins-result-badge">${badge('대기', 'neutral')}</span></div>`;

  const form = body.querySelector('#ins-form');
  let criteria = [];

  // 수량 자동집계
  const iq = form.querySelector('[name="inspect_qty"]'), dq = form.querySelector('[name="defect_qty"]'), gq = form.querySelector('[name="good_qty"]');
  const calcQty = () => { gq.value = Math.max(0, (Number(iq.value) || 0) - (Number(dq.value) || 0)); };
  iq.addEventListener('input', calcQty); dq.addEventListener('input', calcQty);

  function renderCriteria() {
    const slot = body.querySelector('#ins-criteria');
    if (!specItems.length) {
      slot.innerHTML = `<div class="empty" style="padding:22px">${icon('alert', 40)}<h4>승인된 검사규격이 없습니다</h4>
        <p><b>검사규격관리</b>에서 이 품목의 <b>${escapeHtml(opts.kind)}</b> 규격을 등록·승인하세요. (종합판정 수동 선택)</p>
        <select class="select" id="ins-manual" style="max-width:200px;margin:10px auto 0"><option value="합격">합격</option><option value="불합격">불합격</option><option value="조건부합격">조건부합격</option></select></div>`;
      slot.querySelector('#ins-manual').onchange = updateResult;
      updateResult(); return;
    }
    slot.innerHTML = `<div class="table-wrap"><table class="grid">
      <thead><tr><th style="width:34px">№</th><th>검사항목</th><th class="center">특성</th><th>규격</th><th style="width:130px">측정값/판정</th><th style="width:150px">계측기</th><th class="center" style="width:60px">판정</th></tr></thead>
      <tbody>${specItems.map((s, i) => {
        const quant = (s.eval_method || '정량적') === '정량적';
        const input = quant
          ? `<input class="input" data-cidx="${i}" type="number" step="any" placeholder="측정값">`
          : `<select class="select" data-cidx="${i}"><option value="">판정</option><option value="OK">OK</option><option value="NG">NG</option></select>`;
        const range = (s.lsl != null && s.lsl !== '') || (s.usl != null && s.usl !== '')
          ? `${s.lsl ?? ''} ~ ${s.usl ?? ''}` : `${s.spec_value ?? ''}${s.tolerance ? ` ±${s.tolerance}` : ''}`;
        const spec = quant ? `${escapeHtml(range)}${s.unit ? ` <span class="muted">${escapeHtml(s.unit)}</span>` : ''}` : `<span class="muted">${escapeHtml(s.spec_value || 'OK/NG')}</span>`;
        const instOpts = insts.map(x => `<option value="${escapeHtml(x.code)}" ${x._blocked ? 'disabled' : ''} ${x.code === s.instrument ? 'selected' : ''}>${escapeHtml(x.code)} · ${escapeHtml(x.name)}${x._blocked ? ` (${escapeHtml(x._reason)})` : ''}</option>`).join('');
        return `<tr>
          <td class="center mono">${i + 1}</td>
          <td class="cell-strong">${escapeHtml(s.inspect_item || '')}</td>
          <td class="center">${s.char_type && s.char_type !== '일반' ? badge(s.char_type) : '<span class="muted">일반</span>'}</td>
          <td>${spec}</td><td>${input}</td>
          <td><select class="select" data-inst="${i}"><option value="">선택</option>${instOpts}</select></td>
          <td class="center" data-judge="${i}">-</td></tr>`;
      }).join('')}</tbody></table></div>`;
    criteria = specItems.map((s, i) => ({ std: s, idx: i, instrument: s.instrument || '' }));
    slot.querySelectorAll('[data-cidx]').forEach(el => {
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => judgeRow(+el.dataset.cidx));
      // 숫자 입력 후 Enter → 다음 항목 자동 이동
      el.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const next = slot.querySelector(`[data-cidx="${+el.dataset.cidx + 1}"]`);
        if (next) next.focus();
      });
    });
    slot.querySelectorAll('[data-inst]').forEach(el => el.addEventListener('change', () => { criteria[+el.dataset.inst].instrument = el.value; }));
    criteria.forEach(c => judgeRow(c.idx));
  }

  function judgeRow(i) {
    const c = criteria[i]; if (!c) return;
    const el = body.querySelector(`[data-cidx="${i}"]`); const cell = body.querySelector(`[data-judge="${i}"]`);
    const quant = (c.std.eval_method || '정량적') === '정량적';
    const j = quant ? (el.value === '' ? null : judgeValue(c.std, el.value)) : (el.value || null);
    c.judgment = j; c.measured = el.value;
    cell.innerHTML = j ? badge(j) : '-';
    // 규격 이탈 즉시 경고 표시
    el.style.borderColor = j === 'NG' ? 'var(--danger)' : '';
    updateResult();
  }

  function updateResult() {
    const b = body.querySelector('#ins-result-badge');
    if (criteria.length) {
      if (criteria.filter(c => c.judgment).length < criteria.length) { b.innerHTML = badge('검사중', 'warning'); body._result = null; return; }
      body._result = criteria.every(c => c.judgment === 'OK') ? '합격' : '불합격';
      b.innerHTML = badge(body._result);
    } else { const m = body.querySelector('#ins-manual'); body._result = m ? m.value : '합격'; b.innerHTML = badge(body._result); }
  }

  const allOk = body.querySelector('#ins-allok');
  if (allOk) allOk.onclick = () => {
    criteria.forEach(c => {
      const el = body.querySelector(`[data-cidx="${c.idx}"]`);
      if ((c.std.eval_method || '정량적') === '정성적') { el.value = 'OK'; }
      else if (el.value === '') {
        // 규격 중앙값으로 채움
        const lsl = c.std.lsl != null && c.std.lsl !== '' ? Number(c.std.lsl) : null;
        const usl = c.std.usl != null && c.std.usl !== '' ? Number(c.std.usl) : null;
        el.value = (lsl != null && usl != null) ? ((lsl + usl) / 2) : (c.std.spec_value ?? '');
      }
      judgeRow(c.idx);
    });
  };

  openModal({
    title: `${opts.kind} 진행 — ${escapeHtml(p.item_name || '')}`, body, wide: true,
    footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 검사 저장</button>`,
    onMount: ({ footEl, close }) => {
      renderCriteria();
      footEl.querySelector('[data-cancel]').onclick = close;
      footEl.querySelector('[data-ok]').onclick = async () => {
        const g = (n) => { const el = form.querySelector(`[name="${n}"]`); return el ? el.value : ''; };
        if (!g('inspector')) { toast('검사자를 선택하세요.', 'error'); return; }
        if (criteria.length && body._result == null) { toast('모든 검사항목을 평가하세요.', 'error'); return; }
        const result = body._result || '합격';
        try {
          const all = await db.all(opts.table, {});
          const inspect_no = nextDocNo(opts.docPrefix, all.map(x => x.inspect_no));
          const header = {
            inspect_no, inspect_date: g('inspect_date') || todayStr(), partner: p.partner || '',
            item_code: p.item_code, item_name: p.item_name, lot_no: p.lot_no || '',
            spec_no: active?.spec?.spec_no || '',
            inspect_qty: Number(g('inspect_qty')) || 0, sample_qty: Number(g('sample_qty')) || 0,
            good_qty: Number(g('good_qty')) || 0, defect_qty: Number(g('defect_qty')) || 0,
            inspector: g('inspector'), result, report_url: g('report_url') || '',
            ...(opts.extra || {}),
          };
          if (opts.kind === '공정검사') { header.inspect_stage = g('inspect_stage') || '중물'; header.equipment = p.equipment || ''; header.worker = p.worker || ''; }
          if (opts.kind === '출하검사') { header.package_check = g('package_check') || ''; header.label_check = g('label_check') || ''; }
          await db.insert(opts.table, header);
          try {
            for (const c of criteria) {
              await db.insert('inspection_details', {
                inspect_no, inspect_kind: opts.kind, item_code: p.item_code, seq: c.std.seq || (c.idx + 1) * 10,
                inspect_item: c.std.inspect_item, eval_method: c.std.eval_method || '정량적',
                spec_value: c.std.spec_value, tolerance: c.std.tolerance, unit: c.std.unit,
                lsl: c.std.lsl ?? null, usl: c.std.usl ?? null, char_type: c.std.char_type,
                instrument: c.instrument || c.std.instrument || '',
                measured: c.measured ?? '', judgment: c.judgment || '',
              });
            }
          } catch { /* noop */ }
          close();
          toast(`${opts.kind}(${inspect_no}) 저장 — 판정: ${result}`);
          if (result === '불합격') promptNcr({ kind: opts.kind, inspect_no, preset: p, defectQty: Number(g('defect_qty')) || 0 });
          opts.onSaved && opts.onSaved();
        } catch (e) { toast(e.message || '저장 실패', 'error'); }
      };
    },
  });
}

// 불합격 → 부적합 등록 유도
async function promptNcr({ kind, inspect_no, preset, defectQty }) {
  const ok = await confirmDialog({
    title: '부적합 등록', danger: false, confirmText: '부적합 등록',
    message: `검사 결과가 불합격입니다.\n부적합관리에 등록하시겠습니까?\n(품목·LOT·거래처 정보가 자동 전달됩니다)`,
  });
  if (!ok) return;
  try {
    const all = await db.all('nonconformances', {});
    const ncr_no = nextDocNo('NC', all.map(x => x.ncr_no));
    const typeMap = { '수입검사': '수입부적합', '공정검사': '공정부적합', '출하검사': '출하부적합' };
    await db.insert('nonconformances', {
      ncr_no, occur_date: todayStr(), ncr_type: typeMap[kind] || '공정부적합',
      source_type: kind, source_no: inspect_no,
      process: preset.process || '', item_code: preset.item_code, item_name: preset.item_name,
      lot_no: preset.lot_no || '', partner: preset.partner || '',
      defect_qty: defectQty || 0, isolate_qty: defectQty || 0,
      progress: '발생', status: '처리중',
    });
    toast(`부적합(${ncr_no})이 등록되었습니다. 부적합관리에서 처리하세요.`);
  } catch (e) { toast(e.message || '부적합 등록 실패', 'error'); }
}

// =====================================================================
// 1) 수입검사 — 입고완료 자재 대상
// =====================================================================
export async function incomingInspection(root) {
  const state = { search: '', chip: '전체', from: '', to: '' };
  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>수입검사</h1><p>자재입고관리에서 <b>입고완료</b>된 건을 대상으로 검사규격에 따라 수입검사를 진행합니다.</p></div>
      <div class="page-head__actions"><button class="btn" id="ii-csv">${icon('download', 16)} 엑셀(CSV)</button><button class="btn" id="ii-refresh">${icon('refresh', 16)} 새로고침</button></div>
    </div>
    <div id="ii-stats"></div>
    <div class="card">
      <div class="toolbar"><div class="search-box grow">${icon('search', 16)}<input id="ii-search" placeholder="입고번호·거래처·품명·LOT 검색" autocomplete="off"/></div>${dateRangeHTML('입고일')}</div>
      <div class="toolbar" style="border-top:0;padding-top:12px"><div class="chips" id="ii-chips"></div></div>
      <div class="table-wrap"><div id="ii-table"><div class="spinner"></div></div></div>
    </div>`;
  root.querySelector('#ii-refresh').onclick = () => reload();
  root.querySelector('#ii-csv').onclick = () => exportCsv();
  root.querySelector('#ii-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });
  wireDateRange(root, state, () => renderTable());

  let rows = [];
  async function loadData() {
    const [inbounds, insp] = await Promise.all([db.all('material_inbounds', {}), db.all('incoming_inspections', {})]);
    const byInbound = {}; for (const r of insp) if (r.inbound_no) byInbound[r.inbound_no] = r;
    rows = inbounds.filter(m => m.status === '입고완료').map(m => {
      const r = byInbound[m.inbound_no];
      const qty = (m.actual_qty != null && m.actual_qty !== '') ? +m.actual_qty : +m.inbound_qty || 0;
      return {
        inbound_no: m.inbound_no, inbound_date: m.inbound_date, partner: m.partner, item_code: m.item_code, item_name: m.item_name,
        lot_no: m.lot_no, vendor_lot: m.vendor_lot, qty,
        inspected: !!r, result: r?.result || '', inspect_no: r?.inspect_no || '', inspect_date: r?.inspect_date || '', inspector: r?.inspector || '',
      };
    }).sort((a, b) => (a.inspected === b.inspected ? 0 : a.inspected ? 1 : -1) || String(b.inbound_date).localeCompare(String(a.inbound_date)));
  }
  function scoped() {
    let out = rows;
    if (state.chip === '미검사') out = out.filter(r => !r.inspected);
    else if (state.chip === '검사완료') out = out.filter(r => r.inspected);
    if (state.from || state.to) out = out.filter(r => inDateRange(r.inbound_date, state));
    if (state.search) { const q = state.search.toLowerCase(); out = out.filter(r => [r.inbound_no, r.partner, r.item_name, r.lot_no, r.vendor_lot].some(v => String(v ?? '').toLowerCase().includes(q))); }
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
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:50px">${icon('inbox', 48)}<h4>대상 입고건이 없습니다</h4><p>자재입고관리에서 <b>입고완료</b>된 건이 표시됩니다.</p></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr><th>입고번호</th><th>입고일</th><th>거래처</th><th>품명</th><th>LOT</th><th>거래처로트</th><th class="num">수량</th><th class="center">검사상태</th><th>검사일</th><th>검사자</th><th class="center" style="width:130px">검사</th></tr></thead>
      <tbody>${list.map(r => `<tr>
        <td class="cell-code">${escapeHtml(r.inbound_no)}</td><td>${fmtDate(r.inbound_date)}</td><td>${escapeHtml(r.partner || '')}</td>
        <td class="cell-strong">${escapeHtml(r.item_name || '')}</td><td class="cell-code">${escapeHtml(r.lot_no || '')}</td><td class="muted">${escapeHtml(r.vendor_lot || '')}</td>
        <td class="num mono">${num(r.qty)}</td>
        <td class="center">${r.inspected ? badge(r.result || '검사완료') : badge('미검사', 'neutral')}</td>
        <td>${r.inspect_date ? fmtDate(r.inspect_date) : '<span class="muted">-</span>'}</td><td>${escapeHtml(r.inspector || '')}</td>
        <td class="center">${r.inspected
          ? `<button class="btn btn--sm" data-view="${escapeHtml(r.inbound_no)}">${icon('search', 14)} 결과</button>`
          : `<button class="btn btn--sm btn--primary" data-do="${escapeHtml(r.inbound_no)}">${icon('shield', 14)} 수입검사</button>`}</td>
      </tr>`).join('')}</tbody></table>`;
    slot.querySelectorAll('[data-do]').forEach(b => b.onclick = () => {
      const r = rows.find(x => x.inbound_no === b.dataset.do);
      openInspectionModal({
        kind: '수입검사', table: 'incoming_inspections', docPrefix: 'II',
        preset: { refLabel: '입고번호', refValue: r.inbound_no, lot_no: r.lot_no, item_code: r.item_code, item_name: r.item_name, partner: r.partner, inspect_qty: r.qty },
        extra: { inbound_no: r.inbound_no },
        onSaved: () => reload(),
      });
    });
    slot.querySelectorAll('[data-view]').forEach(b => b.onclick = () => openResult(rows.find(x => x.inbound_no === b.dataset.view), '수입검사'));
  }
  function exportCsv() {
    downloadCSV(`수입검사_${todayStr()}.csv`, [
      { label: '입고번호', key: 'inbound_no' }, { label: '입고일', key: 'inbound_date', csv: r => fmtDate(r.inbound_date) },
      { label: '거래처', key: 'partner' }, { label: '품명', key: 'item_name' }, { label: 'LOT', key: 'lot_no' },
      { label: '수량', key: 'qty' }, { label: '검사상태', key: 'result', csv: r => (r.inspected ? r.result : '미검사') },
      { label: '검사번호', key: 'inspect_no' }, { label: '검사일', key: 'inspect_date', csv: r => fmtDate(r.inspect_date) }, { label: '검사자', key: 'inspector' },
    ], scoped());
    toast('CSV로 내보냈습니다.');
  }
  async function reload() {
    try { await loadData(); renderStats(); renderChips(); renderTable(); }
    catch (e) { root.querySelector('#ii-table').innerHTML = `<div class="empty">${icon('alert', 48)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
  }
  reload();
}

// =====================================================================
// 2) 공정검사 — 작업지시(공정) 대상, 초물/중물/종물
// =====================================================================
export async function processInspection(root) {
  const state = { search: '', chip: '전체', from: '', to: '' };
  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>공정검사</h1><p>작업지시(LOT)를 선택해 <b>초물·중물·종물</b> 공정검사를 진행합니다. 측정값은 SQ 공정능력(Cpk) 산출 근거가 됩니다.</p></div>
      <div class="page-head__actions"><button class="btn" id="pi-csv">${icon('download', 16)} 엑셀(CSV)</button><button class="btn" id="pi-refresh">${icon('refresh', 16)} 새로고침</button></div>
    </div>
    <div id="pi-stats"></div>
    <div class="card" style="margin-bottom:16px">
      <div class="card__head">${icon('monitor', 18)}<h3>검사 대상 — 작업지시 / LOT 선택</h3>
        <div class="spacer"></div>
        <div class="search-box" style="min-width:260px">${icon('search', 16)}<input id="pi-scan" placeholder="작업지시번호·LOT 스캔 또는 입력 후 Enter" autocomplete="off"/></div>
      </div>
      <div class="card__body" id="pi-targets"><div class="spinner"></div></div>
    </div>
    <div class="card">
      <div class="toolbar"><div class="search-box grow">${icon('search', 16)}<input id="pi-search" placeholder="검사번호·작업지시·품명·공정 검색" autocomplete="off"/></div>${dateRangeHTML('검사일')}</div>
      <div class="toolbar" style="border-top:0;padding-top:12px"><div class="chips" id="pi-chips"></div></div>
      <div class="table-wrap"><div id="pi-table"><div class="spinner"></div></div></div>
    </div>`;
  root.querySelector('#pi-refresh').onclick = () => reload();
  root.querySelector('#pi-csv').onclick = () => exportCsv();
  root.querySelector('#pi-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });
  wireDateRange(root, state, () => renderTable());

  let wos = [], insps = [], wops = [];
  const scanEl = root.querySelector('#pi-scan');
  scanEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = scanEl.value.trim().toUpperCase();
    if (!q) return;
    const wo = wos.find(w => String(w.wo_no).toUpperCase() === q || String(w.lot_no || '').toUpperCase() === q);
    if (!wo) { toast('해당 작업지시/LOT를 찾을 수 없습니다.', 'error'); return; }
    startInspect(wo); scanEl.value = '';
  });

  async function loadData() {
    [wos, insps, wops] = await Promise.all([
      db.all('work_orders', {}).catch(() => []),
      db.all('process_inspections', {}).catch(() => []),
      db.all('work_order_processes', {}).catch(() => []),
    ]);
  }
  function renderTargets() {
    const slot = root.querySelector('#pi-targets');
    const targets = wos.filter(w => ['작업중', '대기'].includes(w.status)).slice(0, 12);
    if (!targets.length) { slot.innerHTML = `<div class="empty" style="padding:30px">${icon('inbox', 44)}<h4>진행중인 작업지시가 없습니다</h4><p>작업지시관리에서 [작업시작]한 지시가 표시됩니다.</p></div>`; return; }
    slot.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px">
      ${targets.map(w => {
        const cnt = insps.filter(i => i.wo_no === w.wo_no).length;
        const stages = ['초물', '중물', '종물'].map(s => insps.some(i => i.wo_no === w.wo_no && i.inspect_stage === s) ? `<span class="badge badge--success" style="height:19px">${s}</span>` : `<span class="badge badge--neutral" style="height:19px">${s}</span>`).join(' ');
        return `<button class="statcard" data-wo="${escapeHtml(w.wo_no)}" style="text-align:left">
          <div class="flex between"><span class="cell-code">${escapeHtml(w.wo_no)}</span>${badge(w.status || '')}</div>
          <div style="font-weight:700;margin:5px 0 2px">${escapeHtml(w.item_name || '')}</div>
          <div class="muted" style="font-size:11.5px">${escapeHtml(w.lot_no || '')} · ${escapeHtml(w.process || '')} ${w.machine_no ? '· ' + escapeHtml(w.machine_no) : ''}</div>
          <div style="margin-top:7px;display:flex;gap:4px">${stages}</div>
          <div class="muted" style="margin-top:6px;font-size:11.5px">검사 ${cnt}회</div>
        </button>`;
      }).join('')}</div>`;
    slot.querySelectorAll('[data-wo]').forEach(b => b.onclick = () => startInspect(wos.find(w => w.wo_no === b.dataset.wo)));
  }
  function startInspect(wo) {
    if (!wo) return;
    // 진행중 공정 정보 자동 연결
    const proc = wops.filter(p => p.wo_no === wo.wo_no).sort((a, b) => (a.seq || 0) - (b.seq || 0)).find(p => p.status === '진행') || null;
    openInspectionModal({
      kind: '공정검사', table: 'process_inspections', docPrefix: 'PI',
      preset: {
        refLabel: '작업지시', refValue: wo.wo_no, lot_no: wo.lot_no || ('LOT-' + wo.wo_no),
        item_code: wo.item_code, item_name: wo.item_name, inspect_qty: 0,
        process: proc?.process_name || wo.process || '', equipment: proc?.equipment || wo.equipment || '',
        worker: proc?.worker || wo.worker || '',
      },
      extra: { wo_no: wo.wo_no, machine_no: wo.machine_no || '' },
      onSaved: () => reload(),
    });
  }
  function scoped() {
    let out = insps;
    if (state.chip !== '전체') out = out.filter(r => (r.inspect_stage || '중물') === state.chip);
    if (state.from || state.to) out = out.filter(r => inDateRange(r.inspect_date, state));
    if (state.search) { const q = state.search.toLowerCase(); out = out.filter(r => [r.inspect_no, r.wo_no, r.lot_no, r.item_name, r.process].some(v => String(v ?? '').toLowerCase().includes(q))); }
    return [...out].sort((a, b) => String(b.inspect_date).localeCompare(String(a.inspect_date)));
  }
  function renderStats() {
    const pass = insps.filter(r => r.result === '합격').length;
    const rate = insps.length ? ((pass / insps.length) * 100).toFixed(1) : '0.0';
    root.querySelector('#pi-stats').innerHTML = `<div class="stat-grid">
      ${stat('총 공정검사', num(insps.length), '건', 'shield', 'brand')}
      ${stat('합격', num(pass), '건', 'checkCircle', 'green')}
      ${stat('불합격', num(insps.filter(r => r.result === '불합격').length), '건', 'alert', 'red')}
      ${stat('합격률', rate, '%', 'trendUp', 'violet')}</div>`;
  }
  function renderChips() {
    const wrap = root.querySelector('#pi-chips');
    const opts = [['전체', insps.length], ['초물', insps.filter(r => r.inspect_stage === '초물').length], ['중물', insps.filter(r => (r.inspect_stage || '중물') === '중물').length], ['종물', insps.filter(r => r.inspect_stage === '종물').length]];
    wrap.innerHTML = opts.map(([t, c]) => `<button class="chip ${state.chip === t ? 'active' : ''}" data-c="${t}">${t}<span class="chip__count">${c}</span></button>`).join('');
    wrap.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { state.chip = b.dataset.c; renderChips(); renderTable(); });
  }
  function renderTable() {
    const list = scoped(); const slot = root.querySelector('#pi-table');
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:50px">${icon('inbox', 48)}<h4>공정검사 내역이 없습니다</h4><p>위에서 작업지시를 선택해 검사를 진행하세요.</p></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr><th>검사번호</th><th>검사일</th><th class="center">구분</th><th>작업지시</th><th>LOT</th><th>품명</th><th>공정</th><th>호기</th><th class="num">검사</th><th class="num">불량</th><th>검사자</th><th class="center">판정</th><th class="center" style="width:88px">관리</th></tr></thead>
      <tbody>${list.map(r => `<tr>
        <td class="cell-code">${escapeHtml(r.inspect_no)}</td><td>${fmtDate(r.inspect_date)}</td>
        <td class="center">${badge(r.inspect_stage || '중물')}</td>
        <td class="cell-code">${escapeHtml(r.wo_no || '')}</td><td class="cell-code">${escapeHtml(r.lot_no || '')}</td>
        <td class="cell-strong">${escapeHtml(r.item_name || '')}</td><td>${escapeHtml(r.process || '')}</td><td class="center">${escapeHtml(r.machine_no || '')}</td>
        <td class="num mono">${num(r.inspect_qty)}</td><td class="num mono">${num(r.defect_qty)}</td>
        <td>${escapeHtml(r.inspector || '')}</td><td class="center">${badge(r.result || '')}</td>
        <td class="center"><div class="row-actions">
          <button class="icon-btn" data-view="${r.id}" title="상세">${icon('search', 15)}</button>
          <button class="icon-btn" data-del="${r.id}" title="삭제">${icon('trash', 15)}</button></div></td>
      </tr>`).join('')}</tbody></table>`;
    slot.querySelectorAll('[data-view]').forEach(b => b.onclick = () => openResult(list.find(x => x.id === b.dataset.view), '공정검사'));
    slot.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const r = list.find(x => x.id === b.dataset.del);
      if (!(await confirmDialog({ message: `검사 [${r.inspect_no}]를 삭제하시겠습니까?`, confirmText: '삭제' }))) return;
      try {
        await db.remove('process_inspections', r.id);
        const dets = await db.all('inspection_details', { filters: { inspect_no: r.inspect_no } }).catch(() => []);
        for (const d of dets) await db.remove('inspection_details', d.id);
        toast('삭제되었습니다.'); reload();
      } catch (e) { toast(e.message || '삭제 실패', 'error'); }
    });
  }
  function exportCsv() {
    downloadCSV(`공정검사_${todayStr()}.csv`, [
      { label: '검사번호', key: 'inspect_no' }, { label: '검사일', key: 'inspect_date', csv: r => fmtDate(r.inspect_date) },
      { label: '구분', key: 'inspect_stage' }, { label: '작업지시', key: 'wo_no' }, { label: 'LOT', key: 'lot_no' },
      { label: '품명', key: 'item_name' }, { label: '공정', key: 'process' }, { label: '호기', key: 'machine_no' },
      { label: '검사수량', key: 'inspect_qty' }, { label: '불량', key: 'defect_qty' }, { label: '검사자', key: 'inspector' }, { label: '판정', key: 'result' },
    ], scoped());
    toast('CSV로 내보냈습니다.');
  }
  async function reload() {
    try { await loadData(); renderStats(); renderChips(); renderTargets(); renderTable(); }
    catch (e) { root.querySelector('#pi-table').innerHTML = `<div class="empty">${icon('alert', 48)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
  }
  reload();
}

// =====================================================================
// 3) 출하검사 — 출하지시/생산완료 수주 대상 (공정검사 완료 확인)
// =====================================================================
export async function shippingInspection(root) {
  const state = { search: '', chip: '전체', from: '', to: '' };
  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>출하검사</h1><p>출하지시·생산완료 수주를 대상으로 최종 검사를 진행합니다. <b>공정검사 미완료·부적합 미처리 건은 합격 처리가 제한</b>됩니다.</p></div>
      <div class="page-head__actions"><button class="btn" id="si-csv">${icon('download', 16)} 엑셀(CSV)</button><button class="btn" id="si-refresh">${icon('refresh', 16)} 새로고침</button></div>
    </div>
    <div id="si-stats"></div>
    <div class="card">
      <div class="toolbar"><div class="search-box grow">${icon('search', 16)}<input id="si-search" placeholder="수주번호·출하지시·거래처·품명 검색" autocomplete="off"/></div>${dateRangeHTML('검사일')}</div>
      <div class="toolbar" style="border-top:0;padding-top:12px"><div class="chips" id="si-chips"></div></div>
      <div class="table-wrap"><div id="si-table"><div class="spinner"></div></div></div>
    </div>`;
  root.querySelector('#si-refresh').onclick = () => reload();
  root.querySelector('#si-csv').onclick = () => exportCsv();
  root.querySelector('#si-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderTable(); });
  wireDateRange(root, state, () => renderTable());

  let rows = [];
  async function loadData() {
    const [orders, plans, wos, insp, dels, ships, procInsp, ncrs] = await Promise.all([
      db.all('sales_orders', {}), db.all('production_plans', {}), db.all('work_orders', {}),
      db.all('shipping_inspections', {}), db.all('deliveries', {}), db.all('shipping_orders', {}).catch(() => []),
      db.all('process_inspections', {}).catch(() => []), db.all('nonconformances', {}).catch(() => []),
    ]);
    const planByOrder = {}; for (const pl of plans) (planByOrder[pl.order_no] ??= []).push(pl.plan_no);
    const allWoComplete = (pns) => { const ws = wos.filter(w => pns.includes(w.plan_no)); return ws.length > 0 && ws.every(w => w.status === '완료'); };
    const prodComplete = (o) => o.status === '완료' || allWoComplete(planByOrder[o.order_no] || []);
    const inspByOrder = {}; for (const r of insp) if (r.order_no) inspByOrder[r.order_no] = r;
    const shipByOrder = {}; for (const s of ships) if (s.order_no) shipByOrder[s.order_no] = s;
    const delivered = new Set(dels.filter(d => d.status === '납품완료').map(d => d.order_no));

    rows = orders.filter(prodComplete).map(o => {
      const r = inspByOrder[o.order_no];
      const planNos = planByOrder[o.order_no] || [];
      const woList = wos.filter(w => planNos.includes(w.plan_no));
      const lots = woList.map(w => w.lot_no || ('LOT-' + w.wo_no));
      // 공정검사 완료 여부: 해당 작업지시에 공정검사 1건 이상 + 불합격 없음
      const pInsp = procInsp.filter(p => woList.some(w => w.wo_no === p.wo_no));
      const procDone = woList.length > 0 && woList.every(w => procInsp.some(p => p.wo_no === w.wo_no));
      const procNg = pInsp.some(p => p.result === '불합격');
      const openNcr = ncrs.filter(n => lots.includes(n.lot_no) && n.status !== '완료').length;
      return {
        order_no: o.order_no, ship_no: shipByOrder[o.order_no]?.ship_no || '', partner: o.partner,
        item_code: o.item_code, item_name: o.item_name, qty: +o.order_qty || 0, lot_no: lots[0] || '',
        inspected: !!r, result: r?.result || '', inspect_no: r?.inspect_no || '', inspect_date: r?.inspect_date || '',
        delivery_status: delivered.has(o.order_no) ? '납품완료' : '납품대기',
        procDone, procNg, procCount: pInsp.length, openNcr,
      };
    }).sort((a, b) => (a.inspected === b.inspected ? 0 : a.inspected ? 1 : -1) || String(a.order_no).localeCompare(String(b.order_no)));
  }
  function scoped() {
    let out = rows;
    if (state.chip === '미검사') out = out.filter(r => !r.inspected);
    else if (state.chip === '검사완료') out = out.filter(r => r.inspected);
    else if (state.chip === '검사제한') out = out.filter(r => !r.inspected && (!r.procDone || r.procNg || r.openNcr));
    if (state.from || state.to) out = out.filter(r => r.inspected && inDateRange(r.inspect_date, state));
    if (state.search) { const q = state.search.toLowerCase(); out = out.filter(r => [r.order_no, r.ship_no, r.partner, r.item_name].some(v => String(v ?? '').toLowerCase().includes(q))); }
    return out;
  }
  function renderStats() {
    const done = rows.filter(r => r.inspected); const pass = done.filter(r => r.result === '합격').length;
    const rate = done.length ? ((pass / done.length) * 100).toFixed(1) : '0.0';
    root.querySelector('#si-stats').innerHTML = `<div class="stat-grid">
      ${stat('검사 대상', num(rows.length), '건', 'shield', 'brand')}
      ${stat('검사완료', num(done.length), '건', 'checkCircle', 'green')}
      ${stat('검사 제한', num(rows.filter(r => !r.inspected && (!r.procDone || r.procNg || r.openNcr)).length), '건', 'alert', 'red')}
      ${stat('합격률', rate, '%', 'trendUp', 'violet')}</div>`;
  }
  function renderChips() {
    const wrap = root.querySelector('#si-chips');
    const opts = [['전체', rows.length], ['미검사', rows.filter(r => !r.inspected).length], ['검사완료', rows.filter(r => r.inspected).length],
      ['검사제한', rows.filter(r => !r.inspected && (!r.procDone || r.procNg || r.openNcr)).length]];
    wrap.innerHTML = opts.map(([t, c]) => `<button class="chip ${state.chip === t ? 'active' : ''}" data-c="${t}">${t}<span class="chip__count">${c}</span></button>`).join('');
    wrap.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { state.chip = b.dataset.c; renderChips(); renderTable(); });
  }
  function renderTable() {
    const list = scoped(); const slot = root.querySelector('#si-table');
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:50px">${icon('inbox', 48)}<h4>대상이 없습니다</h4><p>생산이 완료된 수주가 표시됩니다.</p></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr><th>수주번호</th><th>출하지시</th><th>거래처</th><th>품명</th><th>LOT</th><th class="num">수량</th><th class="center">공정검사</th><th class="center">부적합</th><th class="center">검사상태</th><th class="center">납품</th><th class="center" style="width:130px">검사</th></tr></thead>
      <tbody>${list.map(r => {
        const blocked = !r.procDone || r.procNg || r.openNcr > 0;
        return `<tr>
          <td class="cell-code">${escapeHtml(r.order_no)}</td><td class="cell-code">${escapeHtml(r.ship_no || '-')}</td>
          <td>${escapeHtml(r.partner || '')}</td><td class="cell-strong">${escapeHtml(r.item_name || '')}</td>
          <td class="cell-code">${escapeHtml(r.lot_no || '')}</td><td class="num mono">${num(r.qty)}</td>
          <td class="center">${r.procNg ? badge('불합격', 'danger') : r.procDone ? badge(`완료 ${r.procCount}`, 'success') : badge('미완료', 'warning')}</td>
          <td class="center">${r.openNcr ? badge(`미처리 ${r.openNcr}`, 'danger') : badge('없음', 'success')}</td>
          <td class="center">${r.inspected ? badge(r.result || '검사완료') : badge('미검사', 'neutral')}</td>
          <td class="center">${badge(r.delivery_status, r.delivery_status === '납품완료' ? 'success' : 'neutral')}</td>
          <td class="center">${r.inspected
            ? `<button class="btn btn--sm" data-view="${escapeHtml(r.order_no)}">${icon('search', 14)} 결과</button>`
            : `<button class="btn btn--sm ${blocked ? '' : 'btn--primary'}" data-do="${escapeHtml(r.order_no)}">${icon('shield', 14)} 출하검사</button>`}</td>
        </tr>`;
      }).join('')}</tbody></table>`;
    slot.querySelectorAll('[data-do]').forEach(b => b.onclick = async () => {
      const r = rows.find(x => x.order_no === b.dataset.do);
      if (!r.procDone || r.procNg || r.openNcr > 0) {
        const msgs = [];
        if (!r.procDone) msgs.push('· 공정검사가 완료되지 않은 작업지시가 있습니다.');
        if (r.procNg) msgs.push('· 공정검사 불합격 건이 있습니다.');
        if (r.openNcr > 0) msgs.push(`· 미처리 부적합 ${r.openNcr}건이 있습니다.`);
        const ok = await confirmDialog({
          title: '출하검사 제한', danger: true, confirmText: '그래도 진행',
          message: `필수 선행 조건이 충족되지 않았습니다.\n${msgs.join('\n')}\n\n계속 진행하시겠습니까? (합격 처리 시 SQ 심사 지적 사유가 될 수 있습니다)`,
        });
        if (!ok) return;
      }
      openInspectionModal({
        kind: '출하검사', table: 'shipping_inspections', docPrefix: 'SI',
        preset: { refLabel: '수주번호', refValue: r.order_no, item_code: r.item_code, item_name: r.item_name, partner: r.partner, inspect_qty: r.qty, lot_no: r.lot_no },
        extra: { order_no: r.order_no, ship_no: r.ship_no || '' },
        onSaved: () => reload(),
      });
    });
    slot.querySelectorAll('[data-view]').forEach(b => b.onclick = () => openResult(rows.find(x => x.order_no === b.dataset.view), '출하검사'));
  }
  function exportCsv() {
    downloadCSV(`출하검사_${todayStr()}.csv`, [
      { label: '수주번호', key: 'order_no' }, { label: '출하지시', key: 'ship_no' }, { label: '거래처', key: 'partner' },
      { label: '품명', key: 'item_name' }, { label: 'LOT', key: 'lot_no' }, { label: '수량', key: 'qty' },
      { label: '공정검사', key: 'procDone', csv: r => (r.procNg ? '불합격' : r.procDone ? '완료' : '미완료') },
      { label: '검사상태', key: 'result', csv: r => (r.inspected ? r.result : '미검사') },
      { label: '검사번호', key: 'inspect_no' }, { label: '검사일', key: 'inspect_date', csv: r => fmtDate(r.inspect_date) },
    ], scoped());
    toast('CSV로 내보냈습니다.');
  }
  async function reload() {
    try { await loadData(); renderStats(); renderChips(); renderTable(); }
    catch (e) { root.querySelector('#si-table').innerHTML = `<div class="empty">${icon('alert', 48)}<h4>불러오기 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
  }
  reload();
}

// ---------- 검사 결과 상세 ----------
const RESULT_TABLE = { '수입검사': 'incoming_inspections', '공정검사': 'process_inspections', '출하검사': 'shipping_inspections' };
async function openResult(r, kind) {
  if (!r) return;
  const inspectNo = r.inspect_no;
  let dets = [], header = r;
  // 목록 행이 검사 레코드가 아닌 경우(수입/출하) 실제 검사 헤더를 조회
  try {
    const found = (await db.all(RESULT_TABLE[kind], { filters: { inspect_no: inspectNo } }))[0];
    if (found) header = found;
  } catch { /* noop */ }
  try { dets = await db.all('inspection_details', { filters: { inspect_no: inspectNo } }); } catch { dets = []; }
  dets.sort((a, b) => (+a.seq || 0) - (+b.seq || 0));
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="grid-3" style="margin-bottom:14px">
      ${info('검사번호', inspectNo)}${info('검사일', fmtDate(header.inspect_date))}${info('판정', header.result || '')}
      ${info('품목', `${header.item_code || ''} ${header.item_name || ''}`)}${info('LOT', header.lot_no || '-')}${info('검사자', header.inspector || '-')}
      ${kind === '공정검사' ? info('검사구분', header.inspect_stage || '중물') + info('공정', header.process || '-') + info('호기', header.machine_no || '-') : ''}
      ${kind === '출하검사' ? info('포장상태', header.package_check || '-') + info('라벨', header.label_check || '-') + info('출하지시', header.ship_no || '-') : ''}
    </div>
    ${dets.length ? `<div class="table-wrap"><table class="grid">
      <thead><tr><th>검사항목</th><th class="center">특성</th><th>규격</th><th>측정/관측</th><th>단위</th><th>계측기</th><th class="center">판정</th></tr></thead>
      <tbody>${dets.map(d => {
        const range = (d.lsl != null && d.lsl !== '') || (d.usl != null && d.usl !== '') ? `${d.lsl ?? ''} ~ ${d.usl ?? ''}` : `${d.spec_value ?? ''}${d.tolerance ? ` ±${d.tolerance}` : ''}`;
        return `<tr><td class="cell-strong">${escapeHtml(d.inspect_item || '')}</td>
          <td class="center">${d.char_type && d.char_type !== '일반' ? badge(d.char_type) : '<span class="muted">일반</span>'}</td>
          <td>${escapeHtml(range)}</td><td class="mono" style="font-weight:700">${escapeHtml(d.measured ?? '')}</td>
          <td class="muted">${escapeHtml(d.unit || '')}</td><td>${escapeHtml(d.instrument || '')}</td>
          <td class="center">${d.judgment ? badge(d.judgment) : '-'}</td></tr>`;
      }).join('')}</tbody></table></div>` : `<div class="muted" style="padding:14px">항목별 상세 기록이 없습니다.</div>`}
    ${header.report_url ? `<div style="margin-top:12px"><a class="btn btn--sm" href="${escapeHtml(header.report_url)}" target="_blank" rel="noopener">${icon('fileText', 14)} 검사성적서 열기</a></div>` : ''}`;
  openModal({ title: `${kind} 결과 — ${escapeHtml(inspectNo || '')}`, body, wide: true, footer: `<button class="btn" data-cancel>닫기</button>`, onMount: ({ footEl, close }) => { footEl.querySelector('[data-cancel]').onclick = close; } });
}
