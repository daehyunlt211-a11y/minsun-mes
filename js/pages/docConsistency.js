// =====================================================================
// 개발문서 정합성 점검 — PFD · PFMEA · 관리계획서 · 작업표준서
//   4개 문서가 공정번호를 기준으로 일치하는지 자동 점검합니다.
//   점검 항목(현장에서 자주 발생하는 불일치):
//     1) PFD에는 있으나 PFMEA에 없는 공정
//     2) PFMEA 고위험(RPN 100↑)·특별특성이 관리계획서에 미반영
//     3) 관리계획서 항목이 작업표준서에 미반영
//     4) 관리계획서와 작업표준서의 검사주기 불일치
//     5) 특별특성 표시가 문서 간 불일치
//     6) 상위 문서는 개정되었으나 하위 문서가 미개정
//     7) 문서 자체가 없거나 미승인 상태
// =====================================================================
import { db } from '../lib/db.js';
import { num, fmtDate, todayStr, escapeHtml, downloadCSV } from '../lib/format.js';
import { badge, toast, openModal } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { findWsRow } from './devDocs.js';

const DOC_TYPES = ['PFD', 'PFMEA', '관리계획서', '작업표준서'];
const DOC_PATH = { 'PFD': '#/dev/pfd', 'PFMEA': '#/dev/pfmea', '관리계획서': '#/dev/control-plan', '작업표준서': '#/dev/work-standard' };
const SEV = { high: '중대', mid: '주의', low: '참고' };
const SEV_TONE = { high: 'danger', mid: 'warning', low: 'neutral' };

function stat(label, value, unit, ic, tint) {
  return `<div class="stat"><div class="stat__top"><span class="stat__label">${escapeHtml(label)}</span><span class="stat__ico ico-tint-${tint}">${icon(ic, 21)}</span></div><div class="stat__value">${value}${unit ? `<small>${escapeHtml(unit)}</small>` : ''}</div></div>`;
}
function info(label, val) {
  return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:11px 13px"><div class="muted" style="font-size:11.5px">${escapeHtml(label)}</div><div style="font-weight:700;margin-top:2px">${val ?? ''}</div></div>`;
}

// 품목별 최신 문서(승인본 우선)
function pickLatest(docs, type, itemCode) {
  const list = docs.filter(d => d.doc_type === type && d.item_code === itemCode);
  if (!list.length) return null;
  const approved = list.filter(d => d.status === '승인');
  const pool = approved.length ? approved : list;
  pool.sort((a, b) => String(b.rev || '').localeCompare(String(a.rev || '')));
  return pool[0];
}

// =====================================================================
// 정합성 분석 — 한 품목에 대해 4문서를 비교
// =====================================================================
export async function analyzeConsistency(itemCode, cache) {
  const docs = cache?.docs || await db.all('dev_docs', {}).catch(() => []);
  const d = {
    PFD: pickLatest(docs, 'PFD', itemCode),
    PFMEA: pickLatest(docs, 'PFMEA', itemCode),
    '관리계획서': pickLatest(docs, '관리계획서', itemCode),
    '작업표준서': pickLatest(docs, '작업표준서', itemCode),
  };
  const issues = [];
  const push = (sev, type, msg, detail) => issues.push({ sev, type, msg, detail });

  // 0) 문서 존재·승인 상태
  for (const t of DOC_TYPES) {
    if (!d[t]) { push('high', '문서없음', `${t} 문서가 없습니다`, '4개 문서는 모두 작성되어야 합니다.'); continue; }
    if (d[t].status !== '승인') push('mid', '미승인', `${t}가 미승인 상태입니다 (${d[t].status || '작성중'})`, `${d[t].doc_no} Rev.${d[t].rev || 'A'}`);
  }

  const items = {};
  for (const t of DOC_TYPES) {
    if (!d[t]) { items[t] = []; continue; }
    const table = { 'PFD': 'pfd_items', 'PFMEA': 'pfmea_items', '관리계획서': 'control_plan_items', '작업표준서': 'work_std_steps' }[t];
    items[t] = await db.all(table, { filters: { doc_no: d[t].doc_no }, sort: 'seq' }).catch(() => []);
  }

  const procNo = (r) => String(r.process_no ?? '').trim();
  const pfdProcs = items.PFD.filter(r => procNo(r));

  // 1) PFD 공정이 PFMEA에 반영되었는가
  if (d.PFD && d.PFMEA) {
    for (const p of pfdProcs) {
      if (!items.PFMEA.some(f => procNo(f) === procNo(p))) {
        push('high', '공정누락', `PFMEA에 공정 ${procNo(p)}(${p.process_name || ''})이 없습니다`, 'PFD의 모든 공정은 PFMEA에서 위험분석되어야 합니다.');
      }
    }
    for (const f of items.PFMEA.filter(x => procNo(x))) {
      if (!pfdProcs.some(p => procNo(p) === procNo(f))) {
        push('mid', '공정불일치', `PFMEA 공정 ${procNo(f)}(${f.process_name || f.process || ''})이 PFD에 없습니다`, 'PFD에 공정을 추가하거나 PFMEA 항목을 정리하세요.');
      }
    }
    // 공정명 불일치
    for (const p of pfdProcs) {
      const f = items.PFMEA.find(x => procNo(x) === procNo(p));
      if (f && p.process_name && (f.process_name || f.process) && p.process_name !== (f.process_name || f.process)) {
        push('mid', '공정명불일치', `공정 ${procNo(p)} 공정명이 다릅니다`, `PFD: ${p.process_name} / PFMEA: ${f.process_name || f.process}`);
      }
    }
  }

  // 2) PFMEA 고위험·특별특성이 관리계획서에 반영되었는가
  if (d.PFMEA && d['관리계획서']) {
    const targets = items.PFMEA.filter(f => (Number(f.rpn) || 0) >= 100 || (f.char_type && f.char_type !== '일반'));
    for (const f of targets) {
      const hit = items['관리계획서'].some(c => procNo(c) === procNo(f)
        && (c.fmea_ref === f.fail_mode || String(c.ctrl_item || '').includes(String(f.fail_mode || '__x__'))));
      if (!hit) {
        push('high', '고위험미반영', `PFMEA 고위험 항목이 관리계획서에 없습니다 — 공정 ${procNo(f)} "${f.fail_mode || ''}"`,
          `RPN ${f.rpn || 0}${f.char_type && f.char_type !== '일반' ? ` · ${f.char_type}` : ''} · 검출관리: ${f.detect_ctrl || '-'}`);
      }
    }
    // 관리계획서 공정이 PFMEA에 없는 경우
    for (const c of items['관리계획서'].filter(x => procNo(x))) {
      if (!items.PFMEA.some(f => procNo(f) === procNo(c))) {
        push('low', '공정불일치', `관리계획서 공정 ${procNo(c)}이 PFMEA에 없습니다`, `관리항목: ${c.ctrl_item || ''}`);
      }
    }
  }

  // 3) 관리계획서 → 작업표준서 반영, 4) 검사주기 일치, 5) 특별특성 일치
  if (d['관리계획서'] && d['작업표준서']) {
    const wsProc = d['작업표준서'].process; // 공정 한정 작업표준서면 해당 공정만 비교
    const cps = items['관리계획서'].filter(c => !wsProc || (c.process_name || c.process) === wsProc);
    // 작업표준서가 다루지 않는 공정의 관리항목 — 해당 공정 작업표준서 자체가 없는 상태
    if (wsProc) {
      const uncovered = [...new Set(items['관리계획서']
        .filter(c => (c.process_name || c.process) && (c.process_name || c.process) !== wsProc)
        .map(c => `${procNo(c) || '-'}(${c.process_name || c.process})`))];
      if (uncovered.length) {
        push('mid', '작업표준서미작성', `관리항목이 있으나 작업표준서가 없는 공정이 있습니다 — ${uncovered.join(', ')}`,
          `현재 작업표준서 ${d['작업표준서'].doc_no}는 "${wsProc}" 공정만 다룹니다. 나머지 공정의 작업표준서를 작성하세요.`);
      }
    }
    for (const c of cps) {
      const w = findWsRow(items['작업표준서'], c);
      if (!w) {
        push('high', '관리항목미반영', `관리계획서 항목이 작업표준서에 없습니다 — 공정 ${procNo(c)} "${c.ctrl_item || ''}"`,
          `기준: ${c.spec_value || '-'} · 주기: ${c.inspect_cycle || '-'} · 방법: ${c.ctrl_method || '-'}`);
        continue;
      }
      if (c.inspect_cycle && w.inspect_cycle && c.inspect_cycle !== w.inspect_cycle) {
        push('high', '검사주기불일치', `검사주기가 다릅니다 — "${c.ctrl_item || ''}"`,
          `관리계획서: ${c.inspect_cycle} / 작업표준서: ${w.inspect_cycle}`);
      }
      if (c.reaction_plan && w.reaction && c.reaction_plan !== w.reaction) {
        push('mid', '이상조치불일치', `이상 시 조치가 다릅니다 — "${c.ctrl_item || ''}"`,
          `관리계획서: ${c.reaction_plan} / 작업표준서: ${w.reaction}`);
      }
    }
  }

  // 5) 특별특성 표시 일치 (PFD · PFMEA · 관리계획서)
  // 한 공정에 여러 항목이 있으면 가장 높은 등급(특별 > 중요 > 일반)을 그 공정의 표시로 본다
  const CHAR_RANK = { 특별특성: 2, 중요특성: 1 };
  const specialByProc = {};
  const mark = (t, r) => {
    const p = procNo(r); if (!p) return;
    const m = (specialByProc[p] ??= {});
    const ct = r.char_type && r.char_type !== '일반' ? r.char_type : null;
    if (!(t in m) || (CHAR_RANK[ct] || 0) > (CHAR_RANK[m[t]] || 0)) m[t] = ct;
  };
  items.PFD.forEach(r => mark('PFD', r));
  items.PFMEA.forEach(r => mark('PFMEA', r));
  items['관리계획서'].forEach(r => mark('관리계획서', r));
  for (const [p, m] of Object.entries(specialByProc)) {
    const vals = DOC_TYPES.filter(t => t in m).map(t => m[t] || '일반');
    const uniq = [...new Set(vals)];
    if (uniq.length > 1 && uniq.some(v => v !== '일반')) {
      push('mid', '특별특성불일치', `공정 ${p}의 특별특성 표시가 문서마다 다릅니다`,
        DOC_TYPES.filter(t => t in m).map(t => `${t}: ${m[t] || '일반'}`).join(' / '));
    }
  }

  // 6) 상위 문서 개정 후 하위 문서 미개정
  const chain = [['PFD', 'PFMEA'], ['PFMEA', '관리계획서'], ['관리계획서', '작업표준서']];
  for (const [up, down] of chain) {
    if (!d[up] || !d[down]) continue;
    const upDate = String(d[up].approve_date || d[up].write_date || '').slice(0, 10);
    const downDate = String(d[down].approve_date || d[down].write_date || '').slice(0, 10);
    if (upDate && downDate && upDate > downDate) {
      push('high', '개정미반영', `${up} 개정 후 ${down}가 개정되지 않았습니다`,
        `${up}: ${d[up].doc_no} Rev.${d[up].rev || 'A'} (${upDate}) → ${down}: ${d[down].doc_no} Rev.${d[down].rev || 'A'} (${downDate})`);
    }
  }

  const counts = { high: issues.filter(i => i.sev === 'high').length, mid: issues.filter(i => i.sev === 'mid').length, low: issues.filter(i => i.sev === 'low').length };
  return { itemCode, docs: d, items, issues, counts, ok: issues.length === 0 };
}

// =====================================================================
// 화면
// =====================================================================
export async function docConsistency(root) {
  const state = { fItem: '', fSev: '전체', results: [], selected: null };
  let items = [], docs = [];

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head__text"><h1>개발문서 정합성 점검</h1>
        <p>PFD → PFMEA → 관리계획서 → 작업표준서가 <b>공정번호 기준으로 일치</b>하는지 점검합니다. 공정 누락·고위험 미반영·검사주기 불일치·개정 미반영을 자동 검출합니다.</p></div>
      <div class="page-head__actions">
        <button class="btn" id="dc-csv">${icon('download', 16)} 점검결과(CSV)</button>
        <button class="btn" id="dc-print">${icon('fileText', 16)} 인쇄</button>
        <button class="btn btn--primary" id="dc-run">${icon('shield', 16)} 전체 점검 실행</button>
      </div>
    </div>
    <div id="dc-stats"></div>
    <div class="card" style="margin-bottom:16px">
      <div class="toolbar">
        <select class="select" id="dc-fitem" style="width:auto;min-width:200px"><option value="">전체 품목</option></select>
        <select class="select" id="dc-fsev" style="width:auto;min-width:130px">
          <option value="전체">전체 심각도</option><option value="high">중대</option><option value="mid">주의</option><option value="low">참고</option></select>
        <div class="spacer"></div>
        <span class="muted" id="dc-time"></span>
      </div>
      <div class="table-wrap"><div id="dc-table"><div class="empty" style="padding:50px">${icon('shield', 48)}<h4>점검을 실행하세요</h4><p>[전체 점검 실행]을 누르면 품목별 4개 문서를 비교합니다.</p></div></div></div>
    </div>
    <div id="dc-detail"></div>`;

  root.querySelector('#dc-run').onclick = () => runAll();
  root.querySelector('#dc-csv').onclick = () => exportCsv();
  root.querySelector('#dc-print').onclick = () => window.print();
  root.querySelector('#dc-fitem').addEventListener('change', (e) => { state.fItem = e.target.value; renderTable(); });
  root.querySelector('#dc-fsev').addEventListener('change', (e) => { state.fSev = e.target.value; renderTable(); if (state.selected) renderDetail(); });

  async function loadBase() {
    [items, docs] = await Promise.all([
      db.all('items', { sort: 'code' }).catch(() => []),
      db.all('dev_docs', {}).catch(() => []),
    ]);
    // 개발문서가 하나라도 있는 품목만 대상
    const targets = [...new Set(docs.map(d => d.item_code).filter(Boolean))];
    const sel = root.querySelector('#dc-fitem');
    sel.innerHTML = `<option value="">전체 품목 (${targets.length})</option>` +
      targets.map(c => { const it = items.find(i => i.code === c); return `<option value="${escapeHtml(c)}">${escapeHtml(c)} · ${escapeHtml(it?.name || '')}</option>`; }).join('');
    return targets;
  }

  async function runAll() {
    const btn = root.querySelector('#dc-run');
    btn.disabled = true; btn.textContent = '점검 중…';
    root.querySelector('#dc-table').innerHTML = `<div class="spinner"></div>`;
    try {
      const targets = await loadBase();
      if (!targets.length) {
        root.querySelector('#dc-table').innerHTML = `<div class="empty" style="padding:50px">${icon('inbox', 48)}<h4>점검할 개발문서가 없습니다</h4><p>PFD·PFMEA·관리계획서·작업표준서를 먼저 작성하세요.</p></div>`;
        return;
      }
      state.results = [];
      for (const code of targets) state.results.push(await analyzeConsistency(code, { docs }));
      root.querySelector('#dc-time').textContent = `점검 시각: ${new Date().toLocaleString('ko-KR')}`;
      renderStats(); renderTable();
      const total = state.results.reduce((s, r) => s + r.issues.length, 0);
      toast(total ? `${state.results.length}개 품목 점검 완료 — 총 ${total}건의 불일치를 발견했습니다.` : `${state.results.length}개 품목 모두 정합성 이상 없음`);
    } catch (e) {
      root.querySelector('#dc-table').innerHTML = `<div class="empty" style="padding:40px">${icon('alert', 46)}<h4>점검 실패</h4><p>${escapeHtml(e.message || e)}</p></div>`;
    } finally { btn.disabled = false; btn.innerHTML = `${icon('shield', 16)} 전체 점검 실행`; }
  }

  function filtered() {
    let list = state.results;
    if (state.fItem) list = list.filter(r => r.itemCode === state.fItem);
    if (state.fSev !== '전체') list = list.filter(r => r.counts[state.fSev] > 0);
    return list;
  }
  function renderStats() {
    const rs = state.results;
    const okCnt = rs.filter(r => r.ok).length;
    const sum = (k) => rs.reduce((s, r) => s + r.counts[k], 0);
    root.querySelector('#dc-stats').innerHTML = `<div class="stat-grid">
      ${stat('점검 품목', num(rs.length), '종', 'box', 'brand')}
      ${stat('정합성 OK', num(okCnt), '종', 'checkCircle', 'green')}
      ${stat('중대 불일치', num(sum('high')), '건', 'alert', 'red')}
      ${stat('주의 항목', num(sum('mid')), '건', 'clock', 'amber')}</div>`;
  }
  function docCell(doc) {
    if (!doc) return badge('없음', 'danger');
    const tone = doc.status === '승인' ? 'success' : doc.status === '폐기' ? 'neutral' : 'warning';
    return `<span class="badge badge--${tone}" title="${escapeHtml(doc.doc_no)}">Rev.${escapeHtml(doc.rev || 'A')} ${escapeHtml(doc.status || '')}</span>`;
  }
  function renderTable() {
    const list = filtered(); const slot = root.querySelector('#dc-table');
    if (!state.results.length) return;
    if (!list.length) { slot.innerHTML = `<div class="empty" style="padding:44px">${icon('checkCircle', 46)}<h4>해당 조건의 결과가 없습니다</h4></div>`; return; }
    slot.innerHTML = `<table class="grid"><thead><tr>
      <th>품목코드</th><th>품명</th><th class="center">PFD</th><th class="center">PFMEA</th><th class="center">관리계획서</th><th class="center">작업표준서</th>
      <th class="center">공정수</th><th class="center">중대</th><th class="center">주의</th><th class="center">참고</th><th class="center">정합성</th>
    </tr></thead><tbody>${list.map(r => {
      const it = items.find(i => i.code === r.itemCode);
      return `<tr class="clickable ${state.selected?.itemCode === r.itemCode ? 'is-selected' : ''}" data-code="${escapeHtml(r.itemCode)}">
        <td class="cell-code">${escapeHtml(r.itemCode)}</td><td class="cell-strong">${escapeHtml(it?.name || '')}</td>
        <td class="center">${docCell(r.docs.PFD)}</td><td class="center">${docCell(r.docs.PFMEA)}</td>
        <td class="center">${docCell(r.docs['관리계획서'])}</td><td class="center">${docCell(r.docs['작업표준서'])}</td>
        <td class="center mono">${num(r.items.PFD.length)}</td>
        <td class="center mono" style="${r.counts.high ? 'color:var(--danger);font-weight:800' : ''}">${r.counts.high || '-'}</td>
        <td class="center mono" style="${r.counts.mid ? 'color:var(--warning);font-weight:700' : ''}">${r.counts.mid || '-'}</td>
        <td class="center mono muted">${r.counts.low || '-'}</td>
        <td class="center">${r.ok ? badge('일치', 'success') : badge(`불일치 ${r.issues.length}`, r.counts.high ? 'danger' : 'warning')}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
    slot.querySelectorAll('tr[data-code]').forEach(tr => tr.onclick = () => {
      state.selected = state.results.find(r => r.itemCode === tr.dataset.code);
      renderTable(); renderDetail();
    });
  }

  function renderDetail() {
    const r = state.selected; const slot = root.querySelector('#dc-detail');
    if (!r) { slot.innerHTML = ''; return; }
    const it = items.find(i => i.code === r.itemCode);
    const issues = state.fSev === '전체' ? r.issues : r.issues.filter(i => i.sev === state.fSev);
    // 공정번호 매트릭스
    const allProcs = [...new Set([
      ...r.items.PFD.map(x => String(x.process_no ?? '')),
      ...r.items.PFMEA.map(x => String(x.process_no ?? '')),
      ...r.items['관리계획서'].map(x => String(x.process_no ?? '')),
      ...r.items['작업표준서'].map(x => String(x.process_no ?? '')),
    ].filter(Boolean))].sort((a, b) => Number(a) - Number(b));

    slot.innerHTML = `<div class="card" style="margin-bottom:16px">
      <div class="card__head">
        <div><span class="cell-code" style="font-size:14px">${escapeHtml(r.itemCode)}</span>
          <h3 style="margin-top:4px">${escapeHtml(it?.name || '')} — 문서 연계 매트릭스</h3></div>
        <div class="spacer"></div>${r.ok ? badge('정합성 일치', 'success') : badge(`불일치 ${r.issues.length}건`, r.counts.high ? 'danger' : 'warning')}
      </div>
      <div class="card__body">
        <div class="grid-2" style="margin-bottom:14px">
          ${DOC_TYPES.map(t => info(t, r.docs[t]
            ? `<a href="${DOC_PATH[t]}" style="color:var(--brand)">${escapeHtml(r.docs[t].doc_no)}</a> Rev.${escapeHtml(r.docs[t].rev || 'A')} · ${badge(r.docs[t].status || '작성중')} <span class="muted">(${fmtDate(r.docs[t].approve_date || r.docs[t].write_date) || '-'})</span>`
            : badge('문서 없음', 'danger'))).join('')}
        </div>
        <h4 style="margin:0 0 8px;font-size:13.5px">공정번호별 문서 반영 현황</h4>
        ${allProcs.length ? `<div class="table-wrap"><table class="grid">
          <thead><tr><th class="center" style="width:80px">공정번호</th><th>공정명</th>
            <th class="center">PFD</th><th class="center">PFMEA</th><th class="center">관리계획서</th><th class="center">작업표준서</th><th class="center">특별특성</th></tr></thead>
          <tbody>${allProcs.map(p => {
            const pfd = r.items.PFD.find(x => String(x.process_no) === p);
            const fm = r.items.PFMEA.filter(x => String(x.process_no) === p);
            const cp = r.items['관리계획서'].filter(x => String(x.process_no) === p);
            const ws = r.items['작업표준서'].filter(x => String(x.process_no) === p);
            // 문서별 최고 등급끼리 비교 (한 공정에 항목이 여러 개여도 문서당 1개 값)
            const RANK = { 특별특성: 2, 중요특성: 1 };
            const top = (arr) => arr.map(x => x?.char_type).filter(c => c && c !== '일반')
              .sort((a, b) => (RANK[b] || 0) - (RANK[a] || 0))[0] || null;
            const chars = [top([pfd]), top(fm), top(cp)].filter(Boolean);
            const uniqChars = [...new Set(chars)];
            const cell = (arr, present) => present ? `<span class="badge badge--success">${arr.length ? arr.length : '○'}</span>` : badge('누락', 'danger');
            return `<tr>
              <td class="center mono" style="font-weight:700">${escapeHtml(p)}</td>
              <td class="cell-strong">${escapeHtml(pfd?.process_name || fm[0]?.process_name || cp[0]?.process_name || '')}</td>
              <td class="center">${pfd ? badge('○', 'success') : badge('누락', 'danger')}</td>
              <td class="center">${cell(fm, fm.length > 0)}</td>
              <td class="center">${cell(cp, cp.length > 0)}</td>
              <td class="center">${cell(ws, ws.length > 0)}</td>
              <td class="center">${uniqChars.length ? (uniqChars.length > 1 ? badge('불일치', 'danger') : badge(uniqChars[0])) : '<span class="muted">-</span>'}</td>
            </tr>`;
          }).join('')}</tbody></table></div>` : `<div class="muted" style="padding:12px">공정번호가 부여된 항목이 없습니다. PFD에서 공정번호를 먼저 부여하세요.</div>`}
      </div></div>

      <div class="card">
        <div class="card__head">${icon('alert', 18)}<h3>불일치 상세 <span class="muted" style="font-weight:500">${issues.length}건</span></h3></div>
        <div class="card__body">
          ${issues.length ? `<div class="flex-col" style="gap:9px">${issues.map(i => `
            <div style="padding:11px 13px;background:${i.sev === 'high' ? 'var(--danger-bg)' : 'var(--surface-2)'};border-radius:10px">
              <div class="flex" style="gap:8px;align-items:center">
                ${badge(SEV[i.sev], SEV_TONE[i.sev])}<span class="badge badge--neutral">${escapeHtml(i.type)}</span>
                <b>${escapeHtml(i.msg)}</b></div>
              ${i.detail ? `<div class="muted" style="margin-top:5px;font-size:12.5px">${escapeHtml(i.detail)}</div>` : ''}
            </div>`).join('')}</div>`
            : `<div class="flex" style="padding:16px;background:var(--surface-2);border-radius:10px;gap:9px">
                ${icon('checkCircle', 20)} <b>해당 조건의 불일치가 없습니다.</b></div>`}
          <div class="flex" style="gap:8px;margin-top:14px;flex-wrap:wrap">
            ${DOC_TYPES.map(t => `<a class="btn btn--sm" href="${DOC_PATH[t]}">${icon('fileText', 13)} ${escapeHtml(t)} 열기</a>`).join('')}
          </div>
        </div></div>`;
  }

  function exportCsv() {
    if (!state.results.length) { toast('먼저 점검을 실행하세요.', 'error'); return; }
    const rows = [];
    for (const r of state.results) {
      const it = items.find(i => i.code === r.itemCode);
      if (!r.issues.length) rows.push({ item_code: r.itemCode, item_name: it?.name || '', sev: '', type: '정합성 일치', msg: '', detail: '' });
      for (const i of r.issues) rows.push({ item_code: r.itemCode, item_name: it?.name || '', sev: SEV[i.sev], type: i.type, msg: i.msg, detail: i.detail || '' });
    }
    downloadCSV(`개발문서_정합성점검_${todayStr()}.csv`, [
      { label: '품목코드', key: 'item_code' }, { label: '품명', key: 'item_name' },
      { label: '심각도', key: 'sev' }, { label: '유형', key: 'type' },
      { label: '내용', key: 'msg' }, { label: '상세', key: 'detail' },
    ], rows);
    toast('점검결과를 내보냈습니다.');
  }

  // 최초 진입 시 자동 점검
  await loadBase();
  runAll();
}
