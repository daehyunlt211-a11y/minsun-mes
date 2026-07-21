// 부적합 등록 공용 폼 — 품질관리-부적합관리의 등록 팝업과 동일한 구성
// POP 등 다른 화면에서도 재사용한다.
import { db } from '../lib/db.js';
import { escapeHtml, todayStr, nextDocNo } from '../lib/format.js';
import { toast, openModal } from '../ui/components.js';
import { icon } from '../ui/icons.js';

const ACTION_TYPES = ['폐기', '재작업', '특채', '반품'];
const STATUSES = ['처리중', '완료'];

// openNonconformanceForm({ prefill, onSaved, mandatory, lockProcess })
//  mandatory=true: 등록하지 않으면 닫을 수 없음(취소/X/바깥클릭/ESC 불가)
//  lockProcess=true: 발생공정을 prefill 값으로 고정(수정 불가)
export async function openNonconformanceForm({ prefill = {}, onSaved, mandatory = false, lockProcess = false } = {}) {
  const [processes, items, users] = await Promise.all([
    db.all('processes', { sort: 'code' }).catch(() => []),
    db.all('items', { sort: 'code' }).catch(() => []),
    db.all('users', { sort: 'name' }).catch(() => []),
  ]);

  const p = prefill;
  const body = document.createElement('form');
  body.className = 'form-grid';
  body.innerHTML = `
    <div class="field"><label>부적합번호</label><input class="input" name="ncr_no" value="" placeholder="저장 시 자동 채번" readonly></div>
    <div class="field"><label>발생일 <span class="req">*</span></label><input class="input" name="occur_date" type="date" value="${escapeHtml(p.occur_date || todayStr())}"></div>
    <div class="field"><label>발생공정${lockProcess ? ' <span class="muted">(공정 고정)</span>' : ''}</label>
      ${lockProcess
      ? `<input class="input" name="process" value="${escapeHtml(p.process || '')}" readonly>`
      : `<select class="select" name="process"><option value="">선택</option>
        ${processes.map(x => `<option value="${escapeHtml(x.name)}" ${p.process === x.name ? 'selected' : ''}>${escapeHtml(x.code)} · ${escapeHtml(x.name)}</option>`).join('')}
      </select>`}</div>
    <div class="field"><label>품목</label>
      <select class="select" name="item_code"><option value="">선택</option>
        ${items.map(x => `<option value="${escapeHtml(x.code)}" ${p.item_code === x.code ? 'selected' : ''}>${escapeHtml(x.code)} · ${escapeHtml(x.name)}</option>`).join('')}
      </select></div>
    <div class="field"><label>품명 <span class="req">*</span></label><input class="input" name="item_name" value="${escapeHtml(p.item_name || '')}" readonly></div>
    <div class="field"><label>불량유형</label><input class="input" name="defect_type" value="${escapeHtml(p.defect_type || '')}" placeholder="예: 치수불량, 외관불량"></div>
    <div class="field"><label>부적합수량 <span class="req">*</span></label><input class="input" name="defect_qty" type="number" value="${escapeHtml(p.defect_qty ?? 0)}"></div>
    <div class="field"><label>담당자</label>
      <select class="select" name="worker"><option value="">선택</option>
        ${users.map(x => `<option value="${escapeHtml(x.name)}" ${p.worker === x.name ? 'selected' : ''}>${escapeHtml(x.name)}${x.department ? ` (${escapeHtml(x.department)})` : ''}</option>`).join('')}
      </select></div>
    <div class="field col-2"><label>원인</label><textarea class="textarea" name="cause" placeholder="발생 원인">${escapeHtml(p.cause || '')}</textarea></div>
    <div class="field col-2"><label>조치사항</label><textarea class="textarea" name="action" placeholder="조치 내용">${escapeHtml(p.action || '')}</textarea></div>
    <div class="field"><label>조치구분</label><select class="select" name="action_type">${ACTION_TYPES.map(t => `<option ${(p.action_type || '폐기') === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="field"><label>처리상태</label><select class="select" name="status">${STATUSES.map(t => `<option ${(p.status || '처리중') === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="field col-2"><label>비고</label><input class="input" name="remark" value="${escapeHtml(p.remark || '')}"></div>`;

  // 품목 선택 → 품명 자동
  body.querySelector('[name="item_code"]').addEventListener('change', (e) => {
    body.querySelector('[name="item_name"]').value = items.find(i => i.code === e.target.value)?.name || '';
  });

  openModal({
    title: mandatory ? '부적합 등록 (필수)' : '부적합 등록', body, wide: true, dismissible: !mandatory,
    footer: `${mandatory ? '<span class="muted" style="margin-right:auto">불량이 발생하여 부적합 등록이 필요합니다.</span>' : '<button class="btn" data-cancel>취소</button>'}<button class="btn btn--primary" data-ok>${icon('check', 16)} 등록</button>`,
    onMount: ({ footEl, close }) => {
      footEl.querySelector('[data-cancel]')?.addEventListener('click', close);
      footEl.querySelector('[data-ok]').onclick = async () => {
        const g = (n) => { const el = body.querySelector(`[name="${n}"]`); return el ? el.value.trim() : ''; };
        if (!g('item_name')) { toast('품목(품명)을 선택하세요.', 'error'); return; }
        try {
          const all = await db.all('nonconformances', {});
          const ncr_no = nextDocNo('NC', all.map(x => x.ncr_no));
          const record = {
            ncr_no, occur_date: g('occur_date') || todayStr(), process: g('process'),
            item_code: g('item_code'), item_name: g('item_name'), defect_type: g('defect_type'),
            defect_qty: Number(g('defect_qty')) || 0, cause: g('cause'), action: g('action'),
            action_type: g('action_type'), worker: g('worker'), status: g('status'), remark: g('remark'),
          };
          await db.insert('nonconformances', record);
          close(); toast(`부적합(${ncr_no})이 등록되었습니다.`); onSaved?.(record);
        } catch (e) { toast(e.message || '등록 실패', 'error'); }
      };
    },
  });
}
