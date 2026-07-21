// 앱 부트스트랩: 레이아웃 렌더 + 해시 라우팅
import { MENU, ROUTES, DEFAULT_ROUTE } from './routes.js';
import { icon } from './ui/icons.js';
import { IS_DEMO, db } from './lib/db.js';
import { APP_CONFIG } from './config.js';
import { toast, confirmDialog, openModal } from './ui/components.js';
import { escapeHtml } from './lib/format.js';
import { getCurrentUser, login, logout, changeMyPassword } from './lib/auth.js';

const app = document.getElementById('app');
const initial = (s) => escapeHtml(String(s || '?').trim().slice(0, 1).toUpperCase());
const roleLabel = (r) => ({ admin: '관리자', manager: '매니저', user: '일반' }[r] || '일반');

// ---------- 테마 ----------
function initTheme() {
  const saved = localStorage.getItem('mes_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('mes_theme', next);
  renderThemeBtn();
}
function renderThemeBtn() {
  const btn = document.getElementById('theme-btn');
  if (btn) btn.innerHTML = icon(document.documentElement.getAttribute('data-theme') === 'dark' ? 'sun' : 'moon', 19);
}
// ---------- 레이아웃 ----------
function renderShell() {
  const me = getCurrentUser() || { name: '사용자', department: '', role: 'user' };
  const collapsed = localStorage.getItem('mes_collapsed') === '1';
  app.className = 'app' + (collapsed ? ' collapsed' : '');
  app.innerHTML = `
    <aside class="sidebar">
      <div class="sidebar__brand">
        <div class="sidebar__logo">M</div>
        <div class="sidebar__title"><b>${escapeHtml(APP_CONFIG.appName)}</b><span>${escapeHtml(APP_CONFIG.company)}</span></div>
      </div>
      <nav class="sidebar__nav" id="nav"></nav>
      <div class="sidebar__footer">
        ${IS_DEMO ? `<button class="btn btn--sm" id="reset-demo" style="width:100%">${icon('refresh', 14)} 데모 데이터 초기화</button>` : ''}
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="icon-btn" id="toggle-sidebar" title="메뉴 접기">${icon('menu', 19)}</button>
        <div class="breadcrumb" id="breadcrumb"></div>
        <div class="topbar__spacer"></div>
        ${IS_DEMO ? `<span class="badge badge--warning" title="Supabase 미연결 — 브라우저에 임시 저장됩니다">데모 모드</span>` : `<span class="badge badge--success">Supabase 연결됨</span>`}
        <button class="icon-btn" id="spec-btn" title="화면설계서">${icon('fileText', 19)}</button>
        <button class="icon-btn" id="theme-btn" title="테마 전환"></button>
        <button class="icon-btn" title="알림">${icon('bell', 19)}</button>
        <div class="user-menu">
          <div class="avatar" id="user-avatar" title="${escapeHtml(me ? me.name : '')}">${initial(me?.name)}</div>
        </div>
      </header>
      <div class="tabbar" id="tabbar"></div>
      <main class="content" id="content"></main>
    </div>
    <div class="scrim" id="scrim"></div>`;

  renderNav();
  renderThemeBtn();

  document.getElementById('toggle-sidebar').onclick = () => {
    if (window.innerWidth <= 900) {
      app.classList.toggle('mobile-open');
      document.getElementById('scrim').classList.toggle('show', app.classList.contains('mobile-open'));
    } else {
      app.classList.toggle('collapsed');
      localStorage.setItem('mes_collapsed', app.classList.contains('collapsed') ? '1' : '0');
    }
  };
  document.getElementById('scrim').onclick = () => { app.classList.remove('mobile-open'); document.getElementById('scrim').classList.remove('show'); };
  document.getElementById('theme-btn').onclick = toggleTheme;
  document.getElementById('spec-btn').onclick = () => { location.hash = '#/spec'; };
  document.getElementById('user-avatar').onclick = (e) => { e.stopPropagation(); toggleUserMenu(); };
  const reset = document.getElementById('reset-demo');
  if (reset) reset.onclick = async () => {
    const ok = await confirmDialog({ title: '데모 데이터 초기화', message: '모든 입력 데이터를 삭제하고 기본 샘플로 되돌립니다. 계속하시겠습니까?', confirmText: '초기화' });
    if (!ok) return;
    await db.resetDemo(); toast('초기화되었습니다.'); location.reload();
  };
}

// ---------- 네비게이션 ----------
function renderNav() {
  const nav = document.getElementById('nav');
  const curPath = currentPath();
  nav.innerHTML = MENU.map(m => {
    if (!m.children) {
      const active = curPath === m.path ? 'active' : '';
      return `<div class="nav-group"><a class="nav-group__header ${active === 'active' ? '' : ''}" href="#${m.path}">
        <span class="nav-ico">${icon(m.icon, 20)}</span><span class="nav-group__label">${escapeHtml(m.label)}</span></a></div>`;
    }
    const childActive = m.children.some(c => c.path === curPath);
    const open = childActive || openGroups.has(m.id);
    return `<div class="nav-group ${open ? 'open' : ''}" data-group="${m.id}">
      <div class="nav-group__header" data-toggle="${m.id}">
        <span class="nav-ico">${icon(m.icon, 20)}</span>
        <span class="nav-group__label">${escapeHtml(m.label)}</span>
        <span class="nav-group__chev">${icon('chevronRight', 16)}</span>
      </div>
      <div class="nav-group__items"><div>
        ${m.children.map(c => `<a class="nav-item ${c.path === curPath ? 'active' : ''}" href="#${c.path}">${escapeHtml(c.label)}</a>`).join('')}
      </div></div></div>`;
  }).join('');

  nav.querySelectorAll('[data-toggle]').forEach(h => h.onclick = () => {
    const id = h.dataset.toggle;
    const group = nav.querySelector(`[data-group="${id}"]`);
    const isOpen = group.classList.toggle('open');
    if (isOpen) openGroups.add(id); else openGroups.delete(id);
  });
  nav.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', () => {
    if (window.innerWidth <= 900) { app.classList.remove('mobile-open'); document.getElementById('scrim').classList.remove('show'); }
  }));
}
const openGroups = new Set();

// ---------- 탭 (메뉴 클릭 시 탭 생성/전환/닫기) ----------
let tabs = [];
try { tabs = JSON.parse(localStorage.getItem('mes_tabs') || '[]'); } catch { tabs = []; }
const saveTabs = () => localStorage.setItem('mes_tabs', JSON.stringify(tabs));

function ensureTab(path, title) {
  if (!tabs.find(t => t.path === path)) { tabs.push({ path, title }); saveTabs(); }
}
function renderTabs(activePath) {
  const bar = document.getElementById('tabbar');
  if (!bar) return;
  if (!tabs.length) { bar.innerHTML = ''; bar.classList.remove('show'); return; }
  bar.classList.add('show');
  bar.innerHTML = tabs.map(t => `
    <div class="tab ${t.path === activePath ? 'active' : ''}" data-tab="${escapeHtml(t.path)}" title="${escapeHtml(t.title)}">
      <span class="tab__label">${escapeHtml(t.title)}</span>
      <button class="tab__close" data-close-tab="${escapeHtml(t.path)}" title="탭 닫기">${icon('x', 12)}</button>
    </div>`).join('')
    + (tabs.length > 1 ? `<button class="tab-closeall" id="tab-closeall" title="모든 탭 닫기">${icon('x', 13)} 전체 닫기</button>` : '');
  bar.querySelectorAll('[data-tab]').forEach(el => el.onclick = (e) => {
    if (e.target.closest('[data-close-tab]')) return;
    if (el.dataset.tab !== currentPath()) location.hash = el.dataset.tab;
  });
  bar.querySelectorAll('[data-close-tab]').forEach(b => b.onclick = (e) => { e.stopPropagation(); closeTab(b.dataset.closeTab); });
  const ca = bar.querySelector('#tab-closeall');
  if (ca) ca.onclick = closeAllTabs;
}
function closeAllTabs() {
  tabs = []; saveTabs();
  if (currentPath() === DEFAULT_ROUTE) route(); // 이미 대시보드면 hashchange 없으므로 강제 갱신
  else location.hash = DEFAULT_ROUTE;
}
function closeTab(path) {
  const idx = tabs.findIndex(t => t.path === path);
  if (idx < 0) return;
  const wasActive = currentPath() === path;
  tabs.splice(idx, 1); saveTabs();
  if (wasActive) {
    const next = tabs[idx] || tabs[idx - 1] || null;
    location.hash = next ? next.path : DEFAULT_ROUTE;
    if (!next && currentPath() === DEFAULT_ROUTE) route(); // 이미 대시보드면 hashchange 안 일어나므로 강제 갱신
  } else {
    renderTabs(currentPath());
  }
}

// ---------- 라우터 ----------
function currentPath() {
  const h = location.hash.replace(/^#/, '').split('?')[0];
  return h || DEFAULT_ROUTE;
}
function currentParams() {
  const qs = location.hash.replace(/^#/, '').split('?')[1] || '';
  const params = {};
  new URLSearchParams(qs).forEach((v, k) => { params[k] = v; });
  return params;
}

async function route() {
  const path = currentPath();
  const r = ROUTES[path];
  const content = document.getElementById('content');
  if (!content) return;

  // breadcrumb
  const bc = document.getElementById('breadcrumb');
  if (r) bc.innerHTML = `<span>${escapeHtml(r.group)}</span><span class="sep">${icon('chevronRight', 14)}</span><b>${escapeHtml(r.title)}</b>`;

  // 탭 생성/활성화
  if (r) ensureTab(path, r.title);
  renderTabs(path);

  // active nav 갱신
  renderNav();

  if (!r) {
    content.innerHTML = `<div class="empty" style="padding:100px 20px">${icon('alert', 56)}<h4>페이지를 찾을 수 없습니다</h4><p>요청하신 메뉴(${escapeHtml(path)})가 존재하지 않습니다.</p><a class="btn btn--primary" href="#${DEFAULT_ROUTE}" style="margin-top:14px">대시보드로 이동</a></div>`;
    return;
  }

  const view = document.createElement('div');
  view.className = 'page-enter';
  content.innerHTML = '';
  content.appendChild(view);
  try {
    await r.render(view, currentParams());
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="empty" style="padding:80px 20px">${icon('alert', 56)}<h4>화면을 불러오지 못했습니다</h4><p>${escapeHtml(e.message || e)}</p></div>`;
  }
  document.title = `${r.title} · ${APP_CONFIG.appName}`;
  content.scrollTo?.(0, 0);
  window.scrollTo(0, 0);
}

// ---------- 사용자 메뉴 (아바타 드롭다운) ----------
function toggleUserMenu() {
  const wrap = document.querySelector('.user-menu');
  if (!wrap) return;
  const existing = wrap.querySelector('.user-pop');
  if (existing) { existing.remove(); return; }
  const me = getCurrentUser() || { name: '사용자', department: '', role: 'user', login_id: '' };
  const pop = document.createElement('div');
  pop.className = 'user-pop';
  pop.innerHTML = `
    <div class="user-pop__head">
      <div class="avatar">${initial(me.name)}</div>
      <div><div class="user-pop__name">${escapeHtml(me.name)}</div>
        <div class="user-pop__sub">${escapeHtml(me.login_id || '')} · ${escapeHtml(me.department || '')} · ${escapeHtml(roleLabel(me.role))}</div></div>
    </div>
    <button class="user-pop__item" data-act="pw">${icon('settings', 17)} 비밀번호 변경</button>
    <button class="user-pop__item danger" data-act="logout">${icon('logout', 17)} 로그아웃</button>`;
  wrap.appendChild(pop);
  pop.querySelector('[data-act="pw"]').onclick = () => { pop.remove(); openChangePassword(); };
  pop.querySelector('[data-act="logout"]').onclick = () => { pop.remove(); doLogout(); };
  // 바깥 클릭 시 닫기
  setTimeout(() => document.addEventListener('click', function close(ev) {
    if (!wrap.contains(ev.target)) { pop.remove(); document.removeEventListener('click', close); }
  }), 0);
}

async function doLogout() {
  const ok = await confirmDialog({ title: '로그아웃', message: '로그아웃 하시겠습니까?', confirmText: '로그아웃', danger: false });
  if (!ok) return;
  logout();
  renderLogin();
}

function openChangePassword() {
  const body = document.createElement('form');
  body.className = 'form-grid';
  body.innerHTML = `
    <div class="field col-2"><label>새 비밀번호 <span class="req">*</span></label><input class="input" type="password" name="pw1" autocomplete="new-password"></div>
    <div class="field col-2"><label>새 비밀번호 확인 <span class="req">*</span></label><input class="input" type="password" name="pw2" autocomplete="new-password"></div>`;
  openModal({
    title: '비밀번호 변경', body,
    footer: `<button class="btn" data-cancel>취소</button><button class="btn btn--primary" data-ok>${icon('check', 16)} 변경</button>`,
    onMount: ({ footEl, close }) => {
      footEl.querySelector('[data-cancel]').onclick = close;
      footEl.querySelector('[data-ok]').onclick = async () => {
        const pw1 = body.querySelector('[name="pw1"]').value;
        const pw2 = body.querySelector('[name="pw2"]').value;
        if (!pw1) { toast('새 비밀번호를 입력하세요.', 'error'); return; }
        if (pw1 !== pw2) { toast('비밀번호 확인이 일치하지 않습니다.', 'error'); return; }
        try { await changeMyPassword(pw1); close(); toast('비밀번호가 변경되었습니다.'); }
        catch (e) { toast(e.message || '변경 실패 (DB에 password 컬럼이 없으면 migration_user_password.sql 실행 필요)', 'error'); }
      };
    },
  });
}

// ---------- 로그인 화면 ----------
function renderLogin() {
  app.className = '';
  app.innerHTML = `
    <div class="login-wrap">
      <form class="login-card" id="login-form">
        <div class="login-brand">
          <div class="sidebar__logo">M</div>
          <b>${escapeHtml(APP_CONFIG.appName)}</b>
          <span>${escapeHtml(APP_CONFIG.company)} 제조실행시스템</span>
        </div>
        <div class="field"><label>아이디</label><input class="input" name="login_id" autocomplete="username" placeholder="로그인 아이디" autofocus></div>
        <div class="field"><label>비밀번호</label><input class="input" type="password" name="password" autocomplete="current-password" placeholder="비밀번호"></div>
        <div class="login-err" id="login-err"></div>
        <button class="btn btn--primary" type="submit">${icon('logout', 16)} 로그인</button>
        ${IS_DEMO ? `<div class="login-hint">데모 계정: <b>admin / admin</b><br/>(prod01·qa01·mat01·sales01 / 1234)</div>` : ''}
      </form>
    </div>`;
  const form = document.getElementById('login-form');
  const err = document.getElementById('login-err');
  form.onsubmit = async (e) => {
    e.preventDefault();
    err.textContent = '';
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await login(form.login_id.value, form.password.value);
      startApp();
    } catch (ex) { err.textContent = ex.message || '로그인 실패'; btn.disabled = false; }
  };
}

// ---------- 시작 ----------
let started = false;
function startApp() {
  renderShell();
  if (!started) { window.addEventListener('hashchange', route); started = true; }
  if (!location.hash) location.replace('#' + DEFAULT_ROUTE);
  route();
}

initTheme();
if (getCurrentUser()) startApp();
else renderLogin();
