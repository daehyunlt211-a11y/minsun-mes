// 간단 인증/세션 (users 테이블 기반)
// ⚠️ 평문 비밀번호 비교 — 개발/사내용. 운영은 Supabase Auth/해시 권장.
import { db } from './db.js';

const KEY = 'mes_session';

export function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}
export function setSession(u) { localStorage.setItem(KEY, JSON.stringify(u)); }
export function logout() { localStorage.removeItem(KEY); }

// 로그인: 아이디로 사용자 조회 후 비밀번호 검증
//  - 비밀번호가 설정돼 있지 않은 계정(미설정/마이그레이션 전)은 아이디만으로 로그인 허용(잠김 방지)
export async function login(loginId, password) {
  const id = String(loginId || '').trim();
  if (!id) throw new Error('아이디를 입력하세요.');
  let rows = [];
  try { rows = await db.all('users', { filters: { login_id: id } }); }
  catch (e) { throw new Error('사용자 정보를 불러오지 못했습니다: ' + (e.message || e)); }
  const u = rows.find(x => x.login_id === id);
  if (!u) throw new Error('존재하지 않는 아이디입니다.');
  if (u.use_yn === false) throw new Error('비활성화된 계정입니다. 관리자에게 문의하세요.');
  if (u.password) {
    if (String(u.password) !== String(password)) throw new Error('비밀번호가 일치하지 않습니다.');
  }
  const session = { id: u.id, login_id: u.login_id, name: u.name, department: u.department || '', role: u.role || 'user' };
  setSession(session);
  return session;
}

// 본인 비밀번호 변경
export async function changeMyPassword(newPassword) {
  const me = getCurrentUser();
  if (!me) throw new Error('로그인이 필요합니다.');
  await db.update('users', me.id, { password: newPassword });
}
