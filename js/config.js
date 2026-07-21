// =====================================================================
// Supabase 연결 설정
// ---------------------------------------------------------------------
// Supabase 대시보드 > Project Settings > API 에서 값을 복사해 채우세요.
// 값이 비어있으면 자동으로 "데모 모드"(브라우저 localStorage)로 동작합니다.
// =====================================================================

export const SUPABASE_URL = 'https://gcrjtqstlbgzvsnfpmex.supabase.co';      // 민선 전용 Supabase 프로젝트 URL (예: https://xxxx.supabase.co)
export const SUPABASE_ANON_KEY = 'sb_publishable_8T1lnyIa-ffYt5uCpyDl6A_GFU6BbEE'; // anon(publishable) 공개키 — 비워두면 데모 모드로 동작

export const APP_CONFIG = {
  appName: 'MINSUN MES·QMS',
  company: '(주)민선',
  version: '1.0.0',
};
