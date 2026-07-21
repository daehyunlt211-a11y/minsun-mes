// =====================================================================
// AI 비서 플로팅 챗봇 위젯 (전역 마운트)
//  - 상단바 버튼 / 플로팅 버튼 모두 "채팅 창(입력 화면)"을 직접 열고 닫음
// =====================================================================
import { chatAnswer, CHAT_SUGGESTIONS } from '../lib/chatbot.js';
import { icon } from './icons.js';
import { escapeHtml } from '../lib/format.js';

let _toggle = null; // 외부(상단바 버튼)에서 채팅 창을 열고 닫기 위한 핸들
export function toggleChatbot() { _toggle?.(); }
export function isChatPanelOpen() { const p = document.getElementById('chat-panel'); return !!p && p.classList.contains('is-open'); }

export function mountChatbot() {
  if (document.getElementById('chatbot-root')) return;
  const root = document.createElement('div');
  root.id = 'chatbot-root';
  root.innerHTML = `
    <button class="chat-fab" id="chat-fab" title="AI 비서 열기">${icon('brain', 24)}</button>
    <div class="chat-panel" id="chat-panel">
      <div class="chat-head">
        <span class="chat-head__ico">${icon('brain', 18)}</span>
        <div><b>AI 데이터 비서</b><div class="muted" style="font-size:11px">규칙기반 · 현장 데이터 조회</div></div>
        <div class="spacer"></div>
        <button class="icon-btn" id="chat-close" title="닫기">${icon('x', 18)}</button>
      </div>
      <div class="chat-body" id="chat-body"></div>
      <div class="chat-suggest" id="chat-suggest"></div>
      <form class="chat-input" id="chat-form">
        <input id="chat-q" placeholder="생산·품질·재고·설비·LOT 질문하기…" autocomplete="off"/>
        <button class="btn btn--primary" type="submit" title="전송">${icon('chevronRight', 18)}</button>
      </form>
    </div>`;
  document.body.appendChild(root);

  const fab = root.querySelector('#chat-fab');
  const panel = root.querySelector('#chat-panel');
  const body = root.querySelector('#chat-body');
  const suggestWrap = root.querySelector('#chat-suggest');
  const form = root.querySelector('#chat-form');
  const input = root.querySelector('#chat-q');
  let greeted = false;

  function open() {
    panel.classList.add('is-open');  // 채팅 입력 창 표시
    fab.classList.add('hidden');     // 플로팅 버튼 숨김
    if (!greeted) {
      greeted = true;
      addBot({ html: '안녕하세요! 무엇을 도와드릴까요? 아래 추천 질문을 누르거나 자유롭게 입력하세요. 🤖', suggestions: CHAT_SUGGESTIONS });
    }
    setTimeout(() => input.focus(), 50);
  }
  function close() {
    panel.classList.remove('is-open'); // 채팅 입력 창 숨김
    fab.classList.remove('hidden');    // 플로팅 버튼 복귀
  }
  function toggle() { panel.classList.contains('is-open') ? close() : open(); }

  _toggle = toggle;                // 상단바 버튼이 호출
  fab.onclick = open;
  root.querySelector('#chat-close').onclick = close;

  function scroll() { body.scrollTop = body.scrollHeight; }
  function addUser(text) {
    const el = document.createElement('div');
    el.className = 'chat-msg chat-msg--user';
    el.innerHTML = `<div class="chat-bubble">${escapeHtml(text)}</div>`;
    body.appendChild(el); scroll();
  }
  function addBot(res) {
    const el = document.createElement('div');
    el.className = 'chat-msg chat-msg--bot';
    el.innerHTML = `<div class="chat-ava">${icon('brain', 15)}</div><div class="chat-bubble">${res.html}</div>`;
    body.appendChild(el);
    renderSuggest(res.suggestions || []);
    scroll();
  }
  function renderSuggest(list) {
    suggestWrap.innerHTML = list.map(s => `<button class="chat-chip" type="button">${escapeHtml(s)}</button>`).join('');
    suggestWrap.querySelectorAll('.chat-chip').forEach(b => b.onclick = () => ask(b.textContent));
  }
  function typing(on) {
    let t = body.querySelector('#chat-typing');
    if (on) { if (!t) { t = document.createElement('div'); t.id = 'chat-typing'; t.className = 'chat-msg chat-msg--bot'; t.innerHTML = `<div class="chat-ava">${icon('brain', 15)}</div><div class="chat-bubble"><span class="chat-dots"><i></i><i></i><i></i></span></div>`; body.appendChild(t); scroll(); } }
    else if (t) t.remove();
  }

  async function ask(text) {
    const q = String(text || '').trim();
    if (!q) return;
    addUser(q);
    input.value = '';
    suggestWrap.innerHTML = '';
    typing(true);
    const res = await chatAnswer(q);
    typing(false);
    addBot(res);
  }
  form.onsubmit = (e) => { e.preventDefault(); ask(input.value); };
}

export function unmountChatbot() { document.getElementById('chatbot-root')?.remove(); _toggle = null; }
