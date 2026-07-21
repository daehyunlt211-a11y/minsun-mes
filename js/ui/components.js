// 공통 UI 컴포넌트: toast, modal, confirm, badge
import { icon } from './icons.js';
import { escapeHtml } from '../lib/format.js';

// ---------- Toast ----------
let toastWrap;
export function toast(msg, type = 'success') {
  if (!toastWrap) { toastWrap = document.createElement('div'); toastWrap.className = 'toast-wrap'; document.body.appendChild(toastWrap); }
  const ico = type === 'success' ? 'checkCircle' : type === 'error' ? 'alert' : 'bell';
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `<div class="toast__ico">${icon(ico, 18)}</div><div class="toast__msg">${escapeHtml(msg)}</div>`;
  toastWrap.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, 2600);
}

// ---------- Modal ----------
// openModal({ title, body(html|node), footer(html|node), wide, onMount, dismissible })
//  dismissible=false 이면 X·바깥클릭·ESC로 닫히지 않음(저장/확정해야 close 호출 시에만 닫힘)
export function openModal({ title, body, footer, wide = false, onMount, dismissible = true }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal ${wide ? 'modal--wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal__head">
        <h3>${escapeHtml(title)}</h3>
        <div class="spacer"></div>
        ${dismissible ? `<button class="icon-btn" data-close>${icon('x', 19)}</button>` : ''}
      </div>
      <div class="modal__body"></div>
      <div class="modal__foot"></div>
    </div>`;
  const modal = overlay.querySelector('.modal');
  const bodyEl = overlay.querySelector('.modal__body');
  const footEl = overlay.querySelector('.modal__foot');
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  if (typeof footer === 'string') footEl.innerHTML = footer; else if (footer) footEl.appendChild(footer);
  else footEl.remove();

  const close = () => { overlay.style.animation = 'fadeIn 140ms reverse'; modal.style.opacity = '0'; setTimeout(() => overlay.remove(), 130); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape' && dismissible) close(); };
  if (dismissible) {
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-close]')?.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
  }
  document.body.appendChild(overlay);
  onMount?.({ overlay, bodyEl, footEl, close });
  return { overlay, bodyEl, footEl, close };
}

// ---------- Confirm ----------
export function confirmDialog({ title = '확인', message, confirmText = '삭제', danger = true } = {}) {
  return new Promise((resolve) => {
    const m = openModal({
      title,
      body: `<p style="margin:0;color:var(--text-2);line-height:1.6">${escapeHtml(message)}</p>`,
      footer: `<button class="btn" data-cancel>취소</button><button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-ok>${escapeHtml(confirmText)}</button>`,
      onMount: ({ footEl, close }) => {
        footEl.querySelector('[data-cancel]').onclick = () => { close(); resolve(false); };
        footEl.querySelector('[data-ok]').onclick = () => { close(); resolve(true); };
      },
    });
  });
}

// ---------- Badge ----------
const STATUS_MAP = {
  // 공통/상태
  '정상': 'success', '점검': 'warning', '고장': 'danger', '비가동': 'neutral',
  '접수': 'info', '생산중': 'warning', '완료': 'success', '취소': 'neutral',
  '계획': 'info', '진행': 'warning', '보류': 'neutral',
  '대기': 'neutral', '작업중': 'warning', '중단': 'danger',
  '입고예정': 'info', '입고대기': 'neutral', '입고완료': 'success', '출고예정': 'info', '납품대기': 'neutral', '납품완료': 'success',
  '합격': 'success', '불합격': 'danger', '조건부합격': 'warning',
  'OK': 'success', 'NG': 'danger',
  '정량적': 'neutral', '정성적': 'info',
  '처리중': 'warning',
  '폐기': 'danger', '재작업': 'warning', '특채': 'info', '반품': 'neutral',
  '사용': 'success', '미사용': 'neutral',
  // 문서 승인 흐름
  '작성중': 'neutral', '검토중': 'warning', '승인': 'success', '반려': 'danger', '제출': 'info', '개정': 'warning',
  '신청': 'neutral', '조건부승인': 'warning',
  // 부적합 진행상태
  '발생': 'danger', '식별·격리': 'warning', '처리결정': 'info', '조치중': 'warning',
  // 공정검사 구분
  '초물': 'info', '중물': 'neutral', '종물': 'brand',
  // 판정
  '적합': 'success', '조건부': 'warning', '부적합': 'danger',
  // 자격/교정
  '유효': 'success', '만료임박': 'warning', '만료': 'danger',
  '교정예정': 'warning', '기한초과': 'danger', '수리중': 'warning', '사용중지': 'neutral',
  // 공구 상태
  '가용': 'success', '사용중': 'warning', '수명초과': 'danger', '중지': 'neutral',
  // 특성
  '일반': 'neutral', '중요특성': 'warning', '특별특성': 'danger',
};
export function badge(text, tone) {
  const t = tone || STATUS_MAP[text] || 'brand';
  return `<span class="badge badge--${t}">${escapeHtml(text)}</span>`;
}
export function yesNo(v) { return v ? badge('사용', 'success') : badge('미사용', 'neutral'); }
