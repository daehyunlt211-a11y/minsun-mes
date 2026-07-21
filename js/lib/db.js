// =====================================================================
// 데이터 접근 계층 — Supabase 연결 시 REST, 미연결 시 localStorage 데모
// 통일된 인터페이스: list / all / get / insert / update / remove
// =====================================================================
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { SEED } from './seed.js';

// URL에 ?demo=1 또는 localStorage('mes_force_demo')='1' 이면 키가 있어도 데모 모드로 강제
const forceDemo = (() => {
  try {
    if (new URLSearchParams(location.search).get('demo') === '1') { localStorage.setItem('mes_force_demo', '1'); return true; }
    if (new URLSearchParams(location.search).get('demo') === '0') { localStorage.removeItem('mes_force_demo'); return false; }
    return localStorage.getItem('mes_force_demo') === '1';
  } catch { return false; }
})();

const isConfigured = !forceDemo && !!(SUPABASE_URL && SUPABASE_ANON_KEY);
export const IS_DEMO = !isConfigured;

let supabase = null;
if (isConfigured) {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ---------- 정렬/필터 클라이언트 측 적용 (데모 + 보조) ----------
function applyQuery(rows, opts = {}) {
  let out = [...rows];
  const { search, searchFields, filters, sort, sortDir } = opts;
  if (search && searchFields?.length) {
    const q = String(search).toLowerCase();
    out = out.filter(r => searchFields.some(f => String(r[f] ?? '').toLowerCase().includes(q)));
  }
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      if (v === '' || v == null || v === '__all__') continue;
      out = out.filter(r => String(r[k] ?? '') === String(v));
    }
  }
  // 날짜 기간 필터 (YYYY-MM-DD 문자열 비교, 시작/종료일 포함)
  if (opts.dateRange && opts.dateRange.key) {
    const { key, from, to } = opts.dateRange;
    if (from) out = out.filter(r => String(r[key] ?? '').slice(0, 10) >= from);
    if (to) out = out.filter(r => String(r[key] ?? '').slice(0, 10) <= to);
  }
  if (sort) {
    const dir = sortDir === 'desc' ? -1 : 1;
    out.sort((a, b) => {
      let av = a[sort], bv = b[sort];
      if (av == null) return 1; if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'ko') * dir;
    });
  }
  return out;
}

// =====================================================================
// 데모 어댑터 (localStorage)
// =====================================================================
const LS_PREFIX = 'mes_demo__';
const memViews = ['material_stocks', 'tool_stocks'];

function lsGet(table) {
  const raw = localStorage.getItem(LS_PREFIX + table);
  if (raw) { try { return JSON.parse(raw); } catch { /* noop */ } }
  // 시드
  const seeded = (SEED[table] || []).map(r => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...r }));
  localStorage.setItem(LS_PREFIX + table, JSON.stringify(seeded));
  return seeded;
}
function lsSet(table, rows) { localStorage.setItem(LS_PREFIX + table, JSON.stringify(rows)); }

function computeView(name) {
  if (name === 'material_stocks') {
    const ins = lsGet('material_inbounds'), outs = lsGet('material_outbounds');
    const map = {};
    for (const r of ins) {
      if (r.status && r.status !== '입고완료') continue; // 입고완료만 재고 반영
      const qty = (r.actual_qty != null && r.actual_qty !== '') ? +r.actual_qty : +r.inbound_qty; // 실 입고수량 우선
      const k = r.item_code; (map[k] ??= { item_code: k, item_name: r.item_name, in_qty: 0, out_qty: 0 }); map[k].in_qty += qty || 0; map[k].item_name = r.item_name || map[k].item_name;
    }
    for (const r of outs) { const k = r.item_code; (map[k] ??= { item_code: k, item_name: r.item_name, in_qty: 0, out_qty: 0 }); map[k].out_qty += +r.outbound_qty || 0; map[k].item_name = r.item_name || map[k].item_name; }
    return Object.values(map).map(r => ({ ...r, id: r.item_code, stock_qty: r.in_qty - r.out_qty }));
  }
  if (name === 'tool_stocks') {
    const tools = lsGet('tools'), moves = lsGet('tool_movements'), disp = lsGet('tool_disposals');
    return tools.map(t => {
      const sum = (type) => moves.filter(m => m.tool_code === t.code && m.move_type === type).reduce((s, m) => s + (+m.qty || 0), 0);
      const inQ = sum('입고'), outQ = sum('출고'), retQ = sum('회수');
      const dQ = disp.filter(x => x.tool_code === t.code).reduce((s, x) => s + (+x.qty || 0), 0);
      return { id: t.code, tool_code: t.code, tool_name: t.name, tool_type: t.tool_type, safety_stock: t.safety_stock, in_qty: inQ, out_qty: outQ, return_qty: retQ, disposal_qty: dQ, stock_qty: inQ - outQ + retQ - dQ };
    });
  }
  return [];
}

const demoAdapter = {
  async all(table, opts = {}) {
    const rows = memViews.includes(table) ? computeView(table) : lsGet(table);
    return applyQuery(rows, opts);
  },
  async list(table, opts = {}) {
    const rows = await this.all(table, opts);
    const total = rows.length;
    const page = opts.page || 1, size = opts.pageSize || 10;
    return { rows: rows.slice((page - 1) * size, page * size), total };
  },
  async get(table, id) { return lsGet(table).find(r => r.id === id) || null; },
  async insert(table, obj) {
    const rows = lsGet(table);
    const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...obj };
    rows.unshift(row); lsSet(table, rows); return row;
  },
  async update(table, id, obj) {
    const rows = lsGet(table); const i = rows.findIndex(r => r.id === id);
    if (i >= 0) { rows[i] = { ...rows[i], ...obj, updated_at: new Date().toISOString() }; lsSet(table, rows); return rows[i]; }
    return null;
  },
  async remove(table, id) { lsSet(table, lsGet(table).filter(r => r.id !== id)); return true; },
  async resetDemo() { Object.keys(localStorage).filter(k => k.startsWith(LS_PREFIX)).forEach(k => localStorage.removeItem(k)); },
};

// =====================================================================
// Supabase 어댑터
// =====================================================================
const sbAdapter = {
  async all(table, opts = {}) {
    let q = supabase.from(table).select('*');
    q = sbFilters(q, opts);
    if (opts.sort) q = q.order(opts.sort, { ascending: opts.sortDir !== 'desc' });
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },
  async list(table, opts = {}) {
    const page = opts.page || 1, size = opts.pageSize || 10;
    let q = supabase.from(table).select('*', { count: 'exact' });
    q = sbFilters(q, opts);
    if (opts.sort) q = q.order(opts.sort, { ascending: opts.sortDir !== 'desc' });
    q = q.range((page - 1) * size, page * size - 1);
    const { data, count, error } = await q;
    if (error) throw error;
    return { rows: data || [], total: count || 0 };
  },
  async get(table, id) { const { data, error } = await supabase.from(table).select('*').eq('id', id).single(); if (error) throw error; return data; },
  async insert(table, obj) { const { data, error } = await supabase.from(table).insert(obj).select().single(); if (error) throw error; return data; },
  async update(table, id, obj) { const { data, error } = await supabase.from(table).update(obj).eq('id', id).select().single(); if (error) throw error; return data; },
  async remove(table, id) { const { error } = await supabase.from(table).delete().eq('id', id); if (error) throw error; return true; },
  async resetDemo() {},
};
function sbFilters(q, opts) {
  if (opts.filters) for (const [k, v] of Object.entries(opts.filters)) { if (v !== '' && v != null && v !== '__all__') q = q.eq(k, v); }
  if (opts.dateRange && opts.dateRange.key) {
    const { key, from, to } = opts.dateRange;
    if (from) q = q.gte(key, from);
    if (to) q = q.lte(key, to + 'T23:59:59'); // 종료일 당일 포함(timestamptz 안전)
  }
  if (opts.search && opts.searchFields?.length) {
    const or = opts.searchFields.map(f => `${f}.ilike.%${opts.search}%`).join(',');
    q = q.or(or);
  }
  return q;
}

export const db = isConfigured ? sbAdapter : demoAdapter;
