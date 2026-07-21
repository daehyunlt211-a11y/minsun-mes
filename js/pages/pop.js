// POP (생산시점관리) — 작업자 단말
//  - popList: 작업지시 목록(카드)
//  - popDetail: 작업지시 1건의 전체 공정 시작/종료
import { db } from '../lib/db.js';
import { num, escapeHtml, todayStr, nextDocNo } from '../lib/format.js';
import { badge, toast, openModal, confirmDialog } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { openNonconformanceForm } from './nonconformanceForm.js';

// 마지막 선택 작업자(시작 모달 기본값) 기억
const WORKER_KEY = 'mes_pop_worker';
function getWorker() { return localStorage.getItem(WORKER_KEY) || ''; }
function setWorker(v) { localStorage.setItem(WORKER_KEY, v); }

// =====================================================================
// POP 메인 — 작업지시 목록
// =====================================================================
export async function popList(root) {
  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>작업 POP</h1><p>작업지시를 선택해 공정별 작업을 시작/종료하세요.</p></div>
      <div class="page-head__actions" id="pop-actions"></div>
    </div>
    <div class="pop-toolbar">
      <div class="search-box" style="min-width:240px">${icon('search', 16)}<input id="pop-search" placeholder="작업지시·품목 검색" autocomplete="off"/></div>
      <div class="chips" id="pop-chips"></div>
    </div>
    <div id="pop-list"><div class="spinner"></div></div>`;

  const state = { search: '', status: '__all__', view: localStorage.getItem('mes_pop_view') || 'card' };
  const statuses = ['작업중', '완료', '중단'];

  root.querySelector('#pop-actions').innerHTML = `
    <div class="seg-toggle" id="pop-view">
      <button data-view="card" class="${state.view === 'card' ? 'active' : ''}" title="카드 보기">${icon('grid', 16)}</button>
      <button data-view="list" class="${state.view === 'list' ? 'active' : ''}" title="리스트 보기">${icon('menu', 16)}</button>
    </div>
    <button class="btn" id="pop-refresh">${icon('refresh', 16)} 새로고침</button>`;
  root.querySelector('#pop-refresh').onclick = () => popList(root);
  root.querySelectorAll('#pop-view [data-view]').forEach(b => b.onclick = () => {
    state.view = b.dataset.view; localStorage.setItem('mes_pop_view', state.view);
    root.querySelectorAll('#pop-view [data-view]').forEach(x => x.classList.toggle('active', x.dataset.view === state.view));
    renderList();
  });

  let wos = [];
  try { wos = await db.all('work_orders', { sort: 'wo_date', sortDir: 'desc' }); }
  catch (e) { root.querySelector('#pop-list').innerHTML = errBox(e); return; }
  // '작업시작'을 누른(=대기가 아닌) 작업지시만 POP에 노출
  wos = wos.filter(w => w.status !== '대기');

  // 진행률 계산용 공정 데이터 (한 번에 로드)
  let allProcs = [];
  try { allProcs = await db.all('work_order_processes', {}); } catch { allProcs = []; }
  const procByWo = {};
  for (const p of allProcs) (procByWo[p.wo_no] ??= []).push(p);

  function renderChips() {
    const wrap = root.querySelector('#pop-chips');
    const counts = { __all__: wos.length };
    for (const s of statuses) counts[s] = wos.filter(w => w.status === s).length;
    const opts = [{ v: '__all__', l: '전체' }, ...statuses.map(s => ({ v: s, l: s }))];
    wrap.innerHTML = opts.map(o => `<button class="chip ${state.status === o.v ? 'active' : ''}" data-st="${o.v}">${o.l}<span class="chip__count">${counts[o.v] || 0}</span></button>`).join('');
    wrap.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { state.status = b.dataset.st; renderChips(); renderList(); });
  }

  function renderList() {
    const q = state.search.toLowerCase();
    let list = wos.filter(w =>
      (state.status === '__all__' || w.status === state.status) &&
      (!q || [w.wo_no, w.item_name, w.item_code, w.process].some(v => String(v ?? '').toLowerCase().includes(q)))
    );
    const slot = root.querySelector('#pop-list');
    if (!list.length) { slot.innerHTML = `<div class="empty">${icon('inbox', 52)}<h4>진행할 작업이 없습니다</h4><p>작업지시관리에서 <b>'작업시작'</b> 버튼을 누른 작업지시가 여기에 표시됩니다.</p></div>`; return; }
    const stat = (w) => { const procs = procByWo[w.wo_no] || []; const done = procs.filter(p => p.status === '완료').length; return { procs, done, prog: procs.length ? `${done}/${procs.length} 공정` : '공정 미생성', good: procs.reduce((s, p) => s + (+p.good_qty || 0), 0) }; };

    if (state.view === 'list') {
      slot.innerHTML = `<div class="table-wrap"><table class="grid">
        <thead><tr><th>작업지시번호</th><th>품목코드</th><th>품명</th><th class="num">지시수량</th><th class="center">공정진행</th><th class="num">양품</th><th class="center">상태</th><th></th></tr></thead>
        <tbody>${list.map(w => { const s = stat(w); return `<tr class="clickable" data-wo="${escapeHtml(w.wo_no)}">
          <td class="cell-code">${escapeHtml(w.wo_no)}</td><td class="cell-code">${escapeHtml(w.item_code || '')}</td>
          <td class="cell-strong">${escapeHtml(w.item_name || '')}</td><td class="num mono">${num(w.order_qty)}</td>
          <td class="center">${escapeHtml(s.prog)}</td><td class="num mono">${num(s.good)}</td>
          <td class="center">${badge(w.status)}</td><td class="center">${icon('chevronRight', 16)}</td></tr>`; }).join('')}</tbody>
      </table></div>`;
    } else {
      slot.innerHTML = `<div class="pop-grid">${list.map(w => { const s = stat(w); return `<div class="pop-card s-${escapeHtml(w.status)}" data-wo="${escapeHtml(w.wo_no)}">
        <div class="pop-card__top"><span class="pop-card__no">${escapeHtml(w.wo_no)}</span>${badge(w.status)}</div>
        <div class="pop-card__item">${escapeHtml(w.item_name || '')}</div>
        <div class="pop-card__meta">
          <span><b>품목</b> ${escapeHtml(w.item_code || '-')}</span>
          <span><b>납기</b> ${escapeHtml((w.due_date || '').slice(0, 10) || '-')}</span>
        </div>
        <div class="pop-card__foot">
          <div class="pop-card__qty">${num(s.good)}<small> / ${num(w.order_qty)} EA</small></div>
          <div class="pop-card__prog">${s.prog} ${icon('chevronRight', 16)}</div>
        </div>
      </div>`; }).join('')}</div>`;
    }
    slot.querySelectorAll('[data-wo]').forEach(c => c.onclick = () => { location.hash = `#/pop/detail?wo=${encodeURIComponent(c.dataset.wo)}`; });
  }

  renderChips();
  renderList();
  root.querySelector('#pop-search').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderList(); });
}

// =====================================================================
// POP 상세 — 작업지시 1건의 전체 공정 시작/종료
// =====================================================================
export async function popDetail(root, params = {}) {
  const woNo = params.wo;
  root.innerHTML = `<div class="spinner"></div>`;
  if (!woNo) { root.innerHTML = backBar() + errBox({ message: '작업지시번호가 없습니다.' }); bindBack(root); return; }

  let wo;
  try {
    const list = await db.all('work_orders', { filters: { wo_no: woNo } });
    wo = list[0];
  } catch (e) { root.innerHTML = backBar() + errBox(e); bindBack(root); return; }
  if (!wo) { root.innerHTML = backBar() + errBox({ message: `작업지시 ${woNo} 를 찾을 수 없습니다.` }); bindBack(root); return; }

  let procs;
  try { procs = await loadOrCreateProcesses(wo); }
  catch (e) {
    const needMigration = /work_order_processes|relation|does not exist|not find the table|schema cache/i.test(e.message || '');
    root.innerHTML = backBar() + (needMigration ? migrationBox() : errBox(e));
    bindBack(root); return;
  }

  // 공정 시작 시 선택할 작업자/설비 목록 (기준정보에서 로드, 각각 독립적으로)
  let equips = [], users = [];
  try { equips = await db.all('equipments', { sort: 'code' }); } catch { equips = []; }
  try { users = (await db.all('users', { sort: 'name' })).filter(u => u.use_yn !== false); } catch { users = []; }
  // 공정별 대상 품목명/유형(구성품 단계 표시용)
  const itemNameMap = {}, itemTypeMap = {};
  try { for (const it of await db.all('items', {})) { itemNameMap[it.code] = it.name; itemTypeMap[it.code] = it.item_type; } } catch { /* noop */ }
  const itemNameOf = (code) => itemNameMap[code] || code || '';
  const itemTypeOf = (code) => itemTypeMap[code] || '구성품';
  // BOM 구조(완제품→반제품→원자재)
  const bomByItem = {};
  try { for (const b of await db.all('boms', {})) (bomByItem[b.item_code] ??= []).push(b); } catch { /* noop */ }
  // 품목별 필요수량(투입 기준): 모품목=지시수량, 반제품=지시수량×BOM 경로 소요량 — 첫 공정 fallback
  const reqQtyMap = { [wo.item_code]: +wo.order_qty || 0 };
  (function calc(code, q) {
    for (const c of (bomByItem[code] || [])) {
      if (itemTypeMap[c.component_code] === '반제품') {
        const need = q * (+c.qty || 0);
        reqQtyMap[c.component_code] = (reqQtyMap[c.component_code] || 0) + need;
        calc(c.component_code, need);
      }
    }
  })(wo.item_code, +wo.order_qty || 0);

  // 공구 투입(POP): 공정에 지정된 공구 + 입고 LOT 수명
  let allTools = [], toolLots = [], toolUsages = [];
  try { allTools = (await db.all('tools', {})).filter(t => t.use_yn !== false); } catch { allTools = []; }
  try { toolLots = (await db.all('tool_movements', {})).filter(m => m.move_type === '입고'); } catch { toolLots = []; }
  try { toolUsages = await db.all('tool_usages', {}); } catch { toolUsages = []; }
  const toolsForProcess = (procName) => allTools.filter(t => t.process && t.process === procName);
  // 입고수량을 1개 단위 LOT(입고번호-01,-02…)으로 분해해 반환 (재고관리와 동일 규칙)
  function lotsForTool(code) {
    const t = allTools.find(x => x.code === code) || {}; const life1 = +t.life_count || 0;
    const moves = toolLots.filter(m => m.tool_code === code)
      .sort((a, b) => String(a.move_date || '').localeCompare(String(b.move_date || '')));
    const units = [];
    for (const m of moves) {
      const qty = +m.qty || 0;
      let pool = toolUsages.filter(u => u.lot_no === m.move_no).reduce((s, u) => s + (+u.use_qty || 0), 0); // 레거시(입고건 단위) 사용
      for (let i = 1; i <= qty; i++) {
        const lot_no = `${m.move_no}-${String(i).padStart(2, '0')}`;
        if (life1 > 0) {
          const direct = toolUsages.filter(u => u.lot_no === lot_no).reduce((s, u) => s + (+u.use_qty || 0), 0);
          const take = Math.min(Math.max(0, life1 - direct), Math.max(0, pool)); pool -= take;
          units.push({ lot_no, move_no: m.move_no, move_date: m.move_date, remain: Math.max(0, life1 - (direct + take)) });
        } else {
          units.push({ lot_no, move_no: m.move_no, move_date: m.move_date, remain: null });
        }
      }
    }
    return units;
  }

  render();

  function render() {
    const totalGood = procs.reduce((s, p) => s + (+p.good_qty || 0), 0);
    const totalDefect = procs.reduce((s, p) => s + (+p.defect_qty || 0), 0);
    const doneCnt = procs.filter(p => p.status === '완료').length;
    const progPct = procs.length ? Math.round(doneCnt / procs.length * 100) : 0;

    root.innerHTML = `
      <div style="margin-bottom:16px">
        <button class="btn" id="pop-back">${icon('chevronLeft', 16)} 작업지시 목록</button>
      </div>
      <div class="pop-detail-head">
        <div>
          <div class="d-no">${escapeHtml(wo.wo_no)}</div>
          <div class="d-item">${escapeHtml(wo.item_name || '')}</div>
          <div class="muted" style="margin-top:4px">${escapeHtml(wo.item_code || '')} · 지시수량 ${num(wo.order_qty)} EA · ${escapeHtml(wo.line || '')}</div>
        </div>
        <div class="d-spacer"></div>
        <div class="d-metric"><div class="v">${badge(wo.status)}</div><div class="l">작업지시 상태</div></div>
        <div class="d-metric"><div class="v mono">${doneCnt}/${procs.length}</div><div class="l">완료 공정</div></div>
        <div class="d-metric"><div class="v mono" style="color:var(--success)">${num(totalGood)}</div><div class="l">양품(EA)</div></div>
        <div class="d-metric"><div class="v mono" style="color:var(--danger)">${num(totalDefect)}</div><div class="l">불량(EA)</div></div>
      </div>
      <div class="progress" style="height:10px;margin-bottom:18px"><span style="width:${progPct}%"></span></div>
      <div class="pop-detail-grid">
        <div id="proc-list"></div>
        <div class="card"><div class="card__head">${icon('layers', 18)}<h3>BOM 구조</h3></div><div class="card__body" id="bom-panel"></div></div>
      </div>`;
    bindBack(root);
    renderProcs();
    renderBomPanel();
  }

  // 현재 진행/예정 공정의 대상 품목 (BOM에서 위치 강조)
  function currentItemCode() {
    const cur = procs.find(p => p.status === '진행') || procs.find(p => p.status !== '완료');
    return cur ? (cur.item_code || wo.item_code) : null;
  }
  function currentProcName() {
    const cur = procs.find(p => p.status === '진행') || procs.find(p => p.status !== '완료');
    return cur ? (cur.process_name || cur.process_code || '') : '';
  }

  function renderBomPanel() {
    const panel = root.querySelector('#bom-panel');
    if (!panel) return;
    const curItem = currentItemCode();
    const tone = (t) => t === '완제품' ? 'brand' : t === '반제품' ? 'info' : t === '원자재' ? 'warning' : 'neutral';
    const rows = [{ depth: 0, code: wo.item_code, name: itemNameOf(wo.item_code), type: itemTypeOf(wo.item_code) || '완제품' }];
    (function walk(code, depth, path) {
      for (const b of (bomByItem[code] || [])) {
        if (path.has(b.component_code)) continue;
        rows.push({ depth, code: b.component_code, name: b.component_name || itemNameOf(b.component_code), type: itemTypeOf(b.component_code) });
        walk(b.component_code, depth + 1, new Set([...path, b.component_code]));
      }
    })(wo.item_code, 1, new Set([wo.item_code]));

    panel.innerHTML = rows.map(r => {
      const isCur = r.code === curItem;
      // 공정 대상(완제품/반제품)인지 — 공정이 있는 품목
      const isProcessed = procs.some(p => (p.item_code || wo.item_code) === r.code);
      return `<div class="flex" style="gap:7px;padding:7px 8px;border-radius:8px;${isCur ? 'background:var(--brand-50);box-shadow:inset 3px 0 0 var(--brand-500)' : ''}">
        <span style="display:inline-block;width:${r.depth * 16}px;flex-shrink:0"></span>
        ${r.depth ? '<span style="color:var(--text-3)">└</span>' : icon('package', 15)}
        <span class="cell-code">${escapeHtml(r.code)}</span>
        <span style="font-weight:${isCur ? 700 : 600};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.name)}</span>
        ${badge(r.type || '구성품', tone(r.type))}
        ${isCur ? `<span class="badge badge--brand" style="margin-left:auto;flex-shrink:0">▶ 현재공정</span>` : (isProcessed ? '' : `<span class="muted" style="margin-left:auto;font-size:11px;flex-shrink:0">투입</span>`)}
      </div>`;
    }).join('') + (curItem ? `<div class="muted" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);font-size:12.5px">▶ 현재 진행: <b>${escapeHtml(itemNameOf(curItem))}</b> · ${escapeHtml(currentProcName())}</div>` : '');
  }

  // 부적합 등록 (부적합관리와 동일한 팝업) — 종료한 공정으로 고정, 등록 전 닫기 불가
  function openNcr(proc) {
    const code = proc?.item_code || wo.item_code;
    openNonconformanceForm({
      mandatory: true, lockProcess: true,
      prefill: {
        occur_date: todayStr(), process: proc?.process_name || '', item_code: code, item_name: itemNameOf(code),
        defect_qty: proc?.defect_qty || 0, worker: proc?.worker || getWorker(), status: '처리중',
      },
      // 조치구분이 '재작업'이면 그 수량만큼 같은 공정의 재작업 단계 추가
      onSaved: (ncr) => { if (ncr && ncr.action_type === '재작업') createReworkStep(proc, +ncr.defect_qty || 0); },
    });
  }

  function renderProcs() {
    const slot = root.querySelector('#proc-list');
    slot.innerHTML = procs.map(p => {
      const st = p.status || '대기';
      const isSub = p.item_code && p.item_code !== wo.item_code; // BOM 반제품 단계
      return `<div class="proc-step s-${escapeHtml(st)}" data-id="${p.id}">
        <div class="proc-step__seq">${escapeHtml(String(p.seq ?? ''))}</div>
        <div class="proc-step__body">
          <div class="proc-step__name">${p.is_rework ? `<span class="badge badge--danger" style="margin-right:6px">재작업</span>` : (isSub ? `<span class="badge badge--info" style="margin-right:6px">${escapeHtml(itemTypeOf(p.item_code))} ${escapeHtml(itemNameOf(p.item_code))}</span>` : '')}${escapeHtml(p.process_name || p.process_code || '공정')}</div>
          <div class="proc-step__sub">
            ${p.process_code ? `<span>${escapeHtml(p.process_code)}</span>` : ''}
            <span>투입 <b class="mono">${num(effInput(p))}</b></span>
            ${p.equipment ? `<span>설비 ${escapeHtml(p.equipment)}</span>` : ''}
            ${p.worker ? `<span>작업자 ${escapeHtml(p.worker)}</span>` : ''}
            ${st === '완료' ? `<span style="color:var(--success);font-weight:700">양품 ${num(p.good_qty)} · 불량 ${num(p.defect_qty)}</span>` : ''}
          </div>
          <div class="proc-step__times">
            <span>시작 <span class="mono">${fmtTime(p.start_at)}</span></span>
            <span>종료 <span class="mono">${fmtTime(p.end_at)}</span></span>
            ${p.work_time ? `<span>작업 <span class="mono">${num(p.work_time)}분</span></span>` : ''}
          </div>
        </div>
        <div class="proc-step__actions">${stepButtons(p)}</div>
      </div>`;
    }).join('');

    slot.querySelectorAll('[data-start]').forEach(b => b.onclick = () => startProc(b.closest('[data-id]').dataset.id));
    slot.querySelectorAll('[data-end]').forEach(b => b.onclick = () => endProc(b.closest('[data-id]').dataset.id));
    slot.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => openToolUse(b.closest('[data-id]').dataset.id));
  }

  // 공구 투입 (선택사항) — 진행 공정에서 그 공정에 지정된 공구를 LOT 기준으로 투입
  function openToolUse(id) {
    const p = procs.find(x => String(x.id) === String(id));
    const tools = toolsForProcess(p.process_name);
    if (!tools.length) { toast('이 공정에 지정된 공구가 없습니다.', 'error'); return; }
    const defQty = effInput(p); // 투입 횟수 기본 = 지시(투입)수량
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field col-2"><label>공정</label><input class="input" value="${escapeHtml(p.process_name || '')}" readonly></div>
      <div class="field"><label>공구 <span class="req">*</span></label>
        <select class="select" name="tool"><option value="">선택</option>${tools.map(t => `<option value="${escapeHtml(t.code)}">${escapeHtml(t.code)} · ${escapeHtml(t.name)}</option>`).join('')}</select></div>
      <div class="field"><label>투입 LOT <span class="req">*</span></label>
        <select class="select" name="lot"><option value="">공구를 먼저 선택</option></select></div>
      <div class="field"><label>투입 횟수 <span class="req">*</span></label><input class="input" name="use_qty" type="number" min="0" step="any" value="${defQty}"></div>
      <div class="field"><label>작업자</label>
        <select class="select" name="worker"><option value="">선택</option>${users.map(u => `<option value="${escapeHtml(u.name)}" ${u.name === getWorker() ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select></div>`;
    body.querySelector('[name="tool"]').addEventListener('change', (e) => {
      const lots = lotsForTool(e.target.value);
      const sel = body.querySelector('[name="lot"]');
      sel.innerHTML = lots.length
        ? `<option value="">선택 (총 ${lots.length}개 LOT)</option>` + lots.map(l => {
          const soldOut = l.remain !== null && l.remain <= 0;
          return `<option value="${escapeHtml(l.lot_no)}" ${soldOut ? 'disabled' : ''}>${escapeHtml(l.lot_no)} (${(l.move_date || '').slice(0, 10)}) · 남은 ${l.remain === null ? '∞' : num(l.remain)}${soldOut ? ' · 소진' : ''}</option>`;
        }).join('')
        : `<option value="">입고 LOT 없음 — 입·출고관리에서 입고 등록 필요</option>`;
    });
    openModal({
      title: '공구 투입', body,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 투입</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const g = (n) => body.querySelector(`[name="${n}"]`).value;
          if (!g('tool')) { toast('공구를 선택하세요.', 'error'); return; }
          if (!g('lot')) { toast('투입 LOT을 선택하세요.', 'error'); return; }
          const qty = Number(g('use_qty')) || 0;
          if (qty <= 0) { toast('투입 횟수를 입력하세요.', 'error'); return; }
          try {
            const all = await db.all('tool_usages', {});
            const use_no = nextDocNo('TU', all.map(x => x.use_no));
            await db.insert('tool_usages', { use_no, use_date: todayStr(), tool_code: g('tool'), lot_no: g('lot'), use_qty: qty, wo_no: wo.wo_no, process: p.process_name, worker: g('worker') || getWorker() });
            toolUsages = await db.all('tool_usages', {}); // 잔여수명 갱신
            close(); toast(`공구 투입(${num(qty)}회)이 기록되었습니다.`); render();
          } catch (e) { toast(e.message || '투입 실패', 'error'); }
        };
      },
    });
  }

  // 반제품 공정이 모두 끝나야 완제품(모품목) 공정 시작 가능
  function subPending() { return procs.some(x => x.item_code && x.item_code !== wo.item_code && x.status !== '완료'); }
  function isParentStep(p) { return !p.item_code || p.item_code === wo.item_code; }
  // 같은 품목 공정 체인(순서대로) / 다음 본공정(재작업 제외) / 이전 미완료 여부
  function chainOf(code) { return procs.filter(x => (x.item_code || wo.item_code) === code).sort((a, b) => (+a.seq || 0) - (+b.seq || 0)); }
  function nextMainStep(p) { const code = p.item_code || wo.item_code; return chainOf(code).find(x => (+x.seq || 0) > (+p.seq || 0) && !x.is_rework); }
  function priorPending(p) { const code = p.item_code || wo.item_code; return chainOf(code).some(x => (+x.seq || 0) < (+p.seq || 0) && x.status !== '완료'); }
  // 공정 투입수량 = 직전 공정 양품(없으면 저장값/계획값) — 불량 제외 cascade
  function effInput(p) {
    if (+p.input_qty > 0) return +p.input_qty;
    const code = p.item_code || wo.item_code;
    const chain = chainOf(code);
    const idx = chain.findIndex(x => x.id === p.id);
    // 첫 공정(또는 구버전 데이터)은 품목 필요수량으로 fallback
    if (idx <= 0) return reqQtyMap[code] ?? (+wo.order_qty || 0);
    const prev = chain[idx - 1];
    return prev.status === '완료' ? (+prev.good_qty || 0) : effInput(prev);
  }
  function stepBlockReason(p) {
    if (priorPending(p)) return '이전 공정 완료 후';
    if (isParentStep(p) && subPending()) return '반제품 공정 완료 후';
    return null;
  }

  function stepButtons(p) {
    const st = p.status || '대기';
    if (st === '완료') return `<span class="badge badge--success" style="height:36px;padding:0 16px;font-size:14px">완료</span>`;
    if (st === '진행') {
      const toolBtn = toolsForProcess(p.process_name).length ? `<button class="btn btn--pop" data-tool style="background:var(--surface);color:var(--text)">${icon('tool', 16)} 공구투입</button>` : '';
      return `${toolBtn}<button class="btn btn--pop btn--end" data-end>${icon('check', 18)} 종료</button>`;
    }
    const blocked = stepBlockReason(p);
    if (blocked) return `<button class="btn btn--pop" disabled title="${blocked} 시작 가능">${icon('clock', 18)} 대기</button>`;
    return `<button class="btn btn--pop btn--start" data-start>${icon('activity', 18)} 시작</button>`;
  }

  // 공정 시작 — 작업자·설비호기를 선택 (설비는 해당 표준공정에 등록된 설비만)
  async function startProc(id) {
    const p = procs.find(x => String(x.id) === String(id));
    const blk = stepBlockReason(p);
    if (blk) { toast(`${blk} 시작할 수 있습니다.`, 'error'); return; }
    // 설비호기 후보 = 표준공정관리에서 이 공정에 등록한 설비만.
    // (등록 0건이면 빈 목록으로 두고 안내 표시. process_equipments 테이블이 없을 때만 전체 폴백)
    let equipOptions = equips;
    if (p.process_code) {
      try {
        const allowed = await db.all('process_equipments', { filters: { process_code: p.process_code } });
        const names = new Set(allowed.map(a => a.equipment_name));
        const codes = new Set(allowed.map(a => a.equipment_code));
        equipOptions = equips.filter(e => names.has(e.name) || codes.has(e.code));
      } catch { /* 테이블 미생성 시에만 전체 노출 */ }
    }
    // 투입 자재(BOM) — 이 공정 품목의 직접 구성품(원자재·반제품·부자재)
    const comps = bomByItem[p.item_code || wo.item_code] || [];
    const tone = (t) => t === '완제품' ? 'brand' : t === '반제품' ? 'info' : t === '원자재' ? 'warning' : 'neutral';
    const inputsHtml = comps.length ? `
      <div class="field col-2"><label>투입 자재 (BOM · 지시수량 ${num(wo.order_qty)} 기준)</label>
        <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
          ${comps.map((c, i) => {
      const t = itemTypeOf(c.component_code);
      const total = (+c.qty || 0) * (+wo.order_qty || 0);
      return `<div class="flex" style="gap:8px;padding:9px 12px;${i ? 'border-top:1px solid var(--border)' : ''}">
            <span class="cell-code">${escapeHtml(c.component_code)}</span>
            <span style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(c.component_name || itemNameOf(c.component_code))}</span>
            ${badge(t || '자재', tone(t))}
            <span class="muted mono" style="margin-left:auto;flex-shrink:0">${num(c.qty)} ${escapeHtml(c.unit || 'EA')}/개 · 총 ${num(total)}</span>
          </div>`;
    }).join('')}
        </div></div>` : `<div class="field col-2"><div class="muted" style="padding:4px 2px">이 공정에 등록된 투입 자재(BOM)가 없습니다.</div></div>`;

    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field col-2"><label>공정</label><input class="input" value="${escapeHtml((p.item_code && p.item_code !== wo.item_code ? `[${itemNameOf(p.item_code)}] ` : '') + (p.process_name || ''))}" readonly></div>
      <div class="field"><label>작업자 <span class="req">*</span></label>
        <select class="select" name="worker"><option value="">선택</option>
          ${users.map(u => `<option value="${escapeHtml(u.name)}" ${u.name === getWorker() ? 'selected' : ''}>${escapeHtml(u.name)}${u.department ? ` (${escapeHtml(u.department)})` : ''}</option>`).join('')}
        </select></div>
      <div class="field"><label>설비호기 <span class="req">*</span></label>
        <select class="select" name="equipment"><option value="">선택</option>
          ${equipOptions.map(e => `<option value="${escapeHtml(e.name)}" ${e.name === p.equipment ? 'selected' : ''}>${escapeHtml(e.code)} · ${escapeHtml(e.name)}</option>`).join('')}
        </select>${(p.process_code && equipOptions.length === 0) ? `<div class="field__err" style="color:var(--warning)">이 공정에 등록된 설비가 없습니다. 표준공정관리에서 설비를 지정하세요.</div>` : ''}</div>
      ${inputsHtml}`;
    openModal({
      title: `${p.process_name} 작업 시작`, body,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('activity', 16)} 작업 시작</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const worker = body.querySelector('[name="worker"]').value;
          const equipment = body.querySelector('[name="equipment"]').value;
          if (!worker) { toast('작업자를 선택하세요.', 'error'); return; }
          if (!equipment) { toast('설비호기를 선택하세요.', 'error'); return; }
          const startAt = new Date().toISOString();
          try {
            const upd = await db.update('work_order_processes', id, { status: '진행', start_at: startAt, worker, equipment });
            Object.assign(p, upd || { status: '진행', start_at: startAt, worker, equipment });
            setWorker(worker);
            await syncWoStatus();
            close();
            toast(`[${p.process_name}] 작업을 시작했습니다.`);
            render();
          } catch (e) { toast(e.message || '시작 실패', 'error'); }
        };
      },
    });
  }

  function endProc(id) {
    const p = procs.find(x => String(x.id) === String(id));
    const input = effInput(p);
    const body = document.createElement('form');
    body.className = 'form-grid';
    body.innerHTML = `
      <div class="field"><label>투입수량</label><input class="input mono" name="input_qty" value="${num(input)}" readonly></div>
      <div class="field"><label>불량수량</label><input class="input" name="defect_qty" type="number" min="0" max="${input}" step="any" value="0"/></div>
      <div class="field"><label>양품수량 (자동)</label><input class="input mono" name="good_qty" value="${num(input)}" readonly></div>
      <div class="field"><label>비고</label><input class="input" name="remark" placeholder="특이사항"/></div>`;
    // 불량 입력 시 양품 자동 = 투입 - 불량
    body.querySelector('[name="defect_qty"]').addEventListener('input', (e) => {
      let d = Number(e.target.value) || 0; if (d > input) { d = input; e.target.value = d; }
      body.querySelector('[name="good_qty"]').value = num(input - d);
    });
    openModal({
      title: `${p.process_name} 공정 종료 (투입 ${num(input)})`,
      body,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 종료 처리</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = close;
        footEl.querySelector('[data-ok]').onclick = async () => {
          const defect = Math.min(input, Number(body.querySelector('[name="defect_qty"]').value) || 0);
          const good = input - defect;
          const remark = body.querySelector('[name="remark"]').value.trim();
          const endAt = new Date();
          const startAt = p.start_at ? new Date(p.start_at) : endAt;
          const workTime = Math.max(0, Math.round((endAt - startAt) / 60000));
          try {
            const upd = await db.update('work_order_processes', id, { status: '완료', end_at: endAt.toISOString(), input_qty: input, good_qty: good, defect_qty: defect, work_time: workTime, remark });
            Object.assign(p, upd || { status: '완료', end_at: endAt.toISOString(), input_qty: input, good_qty: good, defect_qty: defect, work_time: workTime, remark });
            // 다음 본공정에 양품수량 cascade (불량 제외)
            const nm = nextMainStep(p);
            if (nm) {
              const next = p.is_rework ? (+nm.input_qty || 0) + good : good; // 재작업이면 합산, 본공정이면 대체
              try { await db.update('work_order_processes', nm.id, { input_qty: next }); nm.input_qty = next; } catch { /* noop */ }
            }
            await createResult(p, good, defect, workTime);
            await syncWoStatus();
            close();
            render();
            // 불량 발생 시 해당 공정과 연계한 부적합 등록 진행 (재작업이면 재작업 공정 추가)
            if (defect > 0) {
              toast(`[${p.process_name}] 불량 ${num(defect)}EA — 부적합 등록을 진행합니다.`, 'info');
              openNcr({ ...p, defect_qty: defect });
            } else {
              toast(`[${p.process_name}] 종료 — 생산실적이 등록되었습니다.`);
            }
          } catch (e) { toast(e.message || '종료 실패', 'error'); }
        };
      },
    });
  }

  // 재작업 공정 단계 추가 (해당 공정 뒤에 삽입, 재작업 수량만큼 다시 진행)
  async function createReworkStep(proc, qty) {
    qty = +qty || 0;
    if (qty <= 0) return;
    const baseSeq = +proc.seq || 0;
    const cnt = procs.filter(x => (x.item_code || wo.item_code) === (proc.item_code || wo.item_code) && (+x.seq || 0) > baseSeq && (+x.seq || 0) < baseSeq + 10).length;
    try {
      await db.insert('work_order_processes', {
        wo_no: wo.wo_no, item_code: proc.item_code, seq: baseSeq + 1 + cnt,
        process_code: proc.process_code || '', process_name: '[재작업] ' + (proc.process_name || ''),
        equipment: '', status: '대기', input_qty: qty, good_qty: 0, defect_qty: 0, work_time: 0, is_rework: true, remark: '재작업',
      });
      procs = await db.all('work_order_processes', { filters: { wo_no: wo.wo_no }, sort: 'seq' });
      await syncWoStatus();
      render();
      toast(`재작업 공정(${num(qty)}EA)이 추가되었습니다.`, 'info');
    } catch (e) { toast(e.message || '재작업 공정 추가 실패', 'error'); }
  }

  // 생산실적 자동 등록
  async function createResult(p, good, defect, workTime) {
    try {
      const all = await db.all('production_results', {});
      const result_no = nextDocNo('PR', all.map(x => x.result_no));
      const code = p.item_code || wo.item_code;
      await db.insert('production_results', {
        result_no, result_date: todayStr(), wo_no: wo.wo_no, lot_no: wo.lot_no || ('LOT-' + wo.wo_no), item_code: code, item_name: itemNameOf(code),
        process: p.process_name, equipment: p.equipment || wo.equipment, machine_no: p.machine_no || wo.machine_no || '', worker: p.worker || getWorker(),
        prod_qty: (Number(good) || 0) + (Number(defect) || 0), good_qty: good, defect_qty: defect,
        rework_yn: !!p.is_rework, work_time: workTime, status: '완료',
      });
    } catch { /* 실적 등록 실패는 공정 종료를 막지 않음 */ }
  }

  // 작업지시 상태 자동 동기화
  async function syncWoStatus() {
    const allDone = procs.length && procs.every(p => p.status === '완료');
    const anyProg = procs.some(p => p.status === '진행' || p.status === '완료');
    const next = allDone ? '완료' : anyProg ? '작업중' : '대기';
    if (next !== wo.status) {
      try { await db.update('work_orders', wo.id, { status: next }); wo.status = next; } catch { /* noop */ }
    }
  }
}

// 작업지시 공정 로드, 없으면 생성.
// BOM 다단계 전개: 모품목의 반제품 구성품 공정을 먼저, 그다음 모품목 공정 순으로 생성.
async function loadOrCreateProcesses(wo) {
  let rows = await db.all('work_order_processes', { filters: { wo_no: wo.wo_no }, sort: 'seq' });
  if (rows.length) return rows;

  const items = await db.all('items', {}).catch(() => []);
  const itemType = {}; for (const it of items) itemType[it.code] = it.item_type;
  let boms = []; try { boms = await db.all('boms', {}); } catch { boms = []; }
  const bomByItem = {}; for (const b of boms) (bomByItem[b.item_code] ??= []).push(b);

  // 처리 순서: 하위 반제품(깊은 것)부터 → 상위 반제품 → 모품목(마지막)
  // 반제품만 공정 전개(원자재·부자재는 공정 없이 소비만 됨).
  const order = []; const seen = new Set();
  (function expand(code) {
    if (seen.has(code)) return; seen.add(code);
    for (const c of (bomByItem[code] || [])) {
      if (itemType[c.component_code] === '반제품') expand(c.component_code);
    }
    order.push(code);
  })(wo.item_code);

  // 품목별 필요수량(투입 기준): 모품목=지시수량, 반제품=지시수량×BOM 경로 소요량
  const reqQty = { [wo.item_code]: +wo.order_qty || 0 };
  (function calc(code, q) {
    for (const c of (bomByItem[code] || [])) {
      if (itemType[c.component_code] === '반제품') {
        const need = q * (+c.qty || 0);
        reqQty[c.component_code] = (reqQty[c.component_code] || 0) + need;
        calc(c.component_code, need);
      }
    }
  })(wo.item_code, +wo.order_qty || 0);

  let seq = 0;
  for (const code of order) {
    const base = reqQty[code] || +wo.order_qty || 0;
    let routing = [];
    try { routing = await db.all('item_processes', { filters: { item_code: code }, sort: 'seq' }); } catch { routing = []; }
    if (routing.length) {
      let idx = 0;
      for (const r of routing) {
        seq += 10; idx++;
        await db.insert('work_order_processes', {
          wo_no: wo.wo_no, item_code: code, seq,
          process_code: r.process_code || '', process_name: r.process_name || r.process_code || '공정',
          equipment: '', status: '대기', input_qty: idx === 1 ? base : 0, good_qty: 0, defect_qty: 0, work_time: 0, is_rework: false,
        });
      }
    } else if (code === wo.item_code) {
      // 모품목 라우팅이 없으면 단일 공정 (반제품 라우팅 없으면 스킵)
      seq += 10;
      await db.insert('work_order_processes', {
        wo_no: wo.wo_no, item_code: code, seq, process_code: '',
        process_name: wo.process || '작업', equipment: '', status: '대기', input_qty: base, good_qty: 0, defect_qty: 0, work_time: 0, is_rework: false,
      });
    }
  }
  return db.all('work_order_processes', { filters: { wo_no: wo.wo_no }, sort: 'seq' });
}

// ---------- helpers ----------
function fmtTime(s) { if (!s) return '–'; const d = new Date(s); return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function backBar() { return `<div style="margin-bottom:16px"><button class="btn" id="pop-back">${icon('chevronLeft', 16)} 작업지시 목록</button></div>`; }
function bindBack(root) { const b = root.querySelector('#pop-back'); if (b) b.onclick = () => { location.hash = '#/pop'; }; }
function errBox(e) { return `<div class="empty" style="padding:60px 20px">${icon('alert', 52)}<h4>오류</h4><p>${escapeHtml(e.message || e)}</p></div>`; }
function migrationBox() {
  return `<div class="card"><div class="card__body">
    <div class="empty" style="padding:40px 20px">${icon('database', 52)}
      <h4>POP 테이블이 아직 생성되지 않았습니다</h4>
      <p>Supabase SQL Editor에서 <b>supabase/migration_pop.sql</b> 을 실행한 뒤 다시 시도하세요.<br/>
      (데모 모드에서는 자동으로 동작합니다.)</p>
    </div></div></div>`;
}
