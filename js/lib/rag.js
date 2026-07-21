// =====================================================================
// RAG (검색증강) 엔진 — 시스템 전체 데이터를 문서화하고 질의 관련도로 검색
// ---------------------------------------------------------------------
// Retrieve(관련 레코드 검색) → Augment(근거로 구성) → 답변 생성.
// LLM 미사용(키 불필요). 향후 Claude API 연동 시 generate 단계만 교체 가능.
// =====================================================================
import { db } from './db.js';
import { num, won, fmtDate, escapeHtml } from './format.js';

const e = (v) => escapeHtml(v ?? '');
const fmtDT = (s) => (s ? String(s).slice(0, 16).replace('T', ' ') : '');

// 인덱싱 대상: 테이블 → 문서(label/검색텍스트/답변라인)
const SOURCES = [
  { table: 'sales_orders', label: '수주', text: r => `수주 ${r.order_no} ${r.partner} ${r.item_code} ${r.item_name} ${r.status}`, line: r => `${e(r.order_no)} · ${e(r.partner)} · ${e(r.item_name)} ${num(r.order_qty)}EA · ${e(r.status)} <span class="muted">(${fmtDate(r.order_date)} 납기 ${fmtDate(r.due_date)})</span>` },
  { table: 'deliveries', label: '납품', text: r => `납품 ${r.delivery_no} ${r.order_no} ${r.partner} ${r.item_name} ${r.status}`, line: r => `${e(r.delivery_no)} · ${e(r.partner)} · ${e(r.item_name)} ${num(r.delivery_qty)}EA · ${e(r.status)} <span class="muted">(${fmtDate(r.delivery_date)})</span>` },
  { table: 'items', label: '품목', text: r => `품목 자재 ${r.code} ${r.name} ${r.item_type} ${r.spec} ${r.category}`, line: r => `${e(r.code)} · ${e(r.name)} [${e(r.item_type)}] 안전재고 ${num(r.safety_stock)} · 단가 ${won(r.unit_price)}` },
  { table: 'partners', label: '거래처', text: r => `거래처 ${r.code} ${r.name} ${r.biz_type} ${r.ceo} ${r.manager}`, line: r => `${e(r.code)} · ${e(r.name)} [${e(r.biz_type)}] 담당 ${e(r.manager)} ${e(r.phone)}` },
  { table: 'work_orders', label: '작업지시', text: r => `작업지시 ${r.wo_no} ${r.item_name} ${r.process} ${r.equipment} ${r.worker} ${r.status}`, line: r => `${e(r.wo_no)} · ${e(r.item_name)} · ${e(r.process)} · ${e(r.status)} <span class="muted">(${e(r.equipment)} / ${e(r.worker)})</span>` },
  { table: 'production_plans', label: '생산계획', text: r => `생산계획 ${r.plan_no} ${r.order_no} ${r.item_name} ${r.line} ${r.status}`, line: r => `${e(r.plan_no)} · ${e(r.item_name)} ${num(r.plan_qty)}EA · ${e(r.line)} · ${e(r.status)}` },
  { table: 'production_results', label: '생산실적', text: r => `생산실적 ${r.result_no} ${r.wo_no} ${r.item_name} ${r.process} ${r.worker}`, line: r => `${e(r.result_no)} · ${e(r.item_name)} 양품 ${num(r.good_qty)}/불량 ${num(r.defect_qty)} <span class="muted">(${fmtDate(r.result_date)})</span>` },
  { table: 'material_inbounds', label: '자재입고', text: r => `자재입고 ${r.inbound_no} ${r.partner} ${r.item_name} ${r.lot_no} ${r.status}`, line: r => `${e(r.inbound_no)} · ${e(r.item_name)} ${num(r.actual_qty != null && r.actual_qty !== '' ? r.actual_qty : r.inbound_qty)}EA · ${e(r.status)} <span class="muted">(${e(r.lot_no)})</span>` },
  { table: 'material_outbounds', label: '자재반출', text: r => `자재반출 반품 ${r.outbound_no} ${r.item_name} ${r.purpose} ${r.wo_no}`, line: r => `${e(r.outbound_no)} · ${e(r.item_name)} ${num(r.outbound_qty)}EA · ${e(r.purpose)}` },
  { table: 'nonconformances', label: '부적합', text: r => `부적합 불량 ${r.ncr_no} ${r.item_name} ${r.process} ${r.defect_type} ${r.cause} ${r.worker} ${r.status}`, line: r => `${e(r.ncr_no)} · ${e(r.item_name)} · ${e(r.defect_type)} ${num(r.defect_qty)}EA · 원인 ${e(r.cause)} · ${e(r.status)} <span class="muted">(${fmtDate(r.occur_date)})</span>` },
  { table: 'equipments', label: '설비', text: r => `설비 ${r.code} ${r.name} ${r.equip_type} ${r.work_center} ${r.status}`, line: r => `${e(r.code)} · ${e(r.name)} [${e(r.status)}] · ${e(r.work_center)}` },
  { table: 'incoming_inspections', label: '수입검사', text: r => `수입검사 ${r.inspect_no} ${r.partner} ${r.item_name} ${r.lot_no} ${r.result}`, line: r => `${e(r.inspect_no)} · ${e(r.item_name)} · ${e(r.result)} <span class="muted">(${fmtDate(r.inspect_date)})</span>` },
  { table: 'shipping_inspections', label: '출하검사', text: r => `출하검사 ${r.inspect_no} ${r.order_no} ${r.partner} ${r.item_name} ${r.result}`, line: r => `${e(r.inspect_no)} · ${e(r.item_name)} · ${e(r.result)} <span class="muted">(${fmtDate(r.inspect_date)})</span>` },
  { table: 'inspection_standards', label: '검사기준', text: r => `검사기준 ${r.std_no} ${r.item_name} ${r.inspect_item} ${r.inspect_type} ${r.eval_method}`, line: r => `${e(r.std_no)} · ${e(r.item_name)} · ${e(r.inspect_item)} [${e(r.inspect_type)}/${e(r.eval_method)}]` },
  { table: 'tools', label: '공구', text: r => `공구 ${r.code} ${r.name} ${r.tool_type} ${r.process}`, line: r => `${e(r.code)} · ${e(r.name)} [${e(r.tool_type)}] · 공정 ${e(r.process)}` },
  { table: 'process_inspections', label: '공정검사', text: r => `공정검사 ${r.inspect_no} ${r.wo_no} ${r.process} ${r.item_name} ${r.result}`, line: r => `${e(r.inspect_no)} · ${e(r.process)} · ${e(r.item_name)} · ${e(r.result)} <span class="muted">(${fmtDate(r.inspect_date)})</span>` },
  { table: 'purchase_orders', label: '자재발주', text: r => `자재발주 ${r.po_no} ${r.material_partner} ${r.cutting_partner} ${r.item_name} ${r.status}`, line: r => `${e(r.po_no)} · ${e(r.material_partner)} · ${e(r.item_name)} ${num(r.po_qty)}${e(r.unit)} · ${e(r.status)}` },
  { table: 'subcon_orders', label: '외주발주', text: r => `외주발주 ${r.sco_no} ${r.partner} ${r.item_name} ${r.process} ${r.status}`, line: r => `${e(r.sco_no)} · ${e(r.partner)} · ${e(r.item_name)} [${e(r.process)}] · ${e(r.status)}` },
  { table: 'measuring_instruments', label: '계측기', text: r => `계측기 ${r.code} ${r.name} ${r.model} ${r.serial_no} ${r.status}`, line: r => `${e(r.code)} · ${e(r.name)} [${e(r.status)}] 차기교정 ${fmtDate(r.next_calib)}` },
  { table: 'welders', label: '용접사', text: r => `용접사 ${r.code} ${r.name} ${r.cert_type} ${r.welding_process} ${r.status}`, line: r => `${e(r.code)} · ${e(r.name)} [${e(r.welding_process)}] · ${e(r.status)} (만료 ${fmtDate(r.expire_date)})` },
  { table: 'processes', label: '공정', text: r => `공정 ${r.code} ${r.name} ${r.process_type} ${r.work_center}`, line: r => `${e(r.code)} · ${e(r.name)} [${e(r.process_type)}]` },
];

// 도메인 지식/도움말 문서 (개념 질의 대응)
const KNOWLEDGE = [
  { label: '용어', title: 'LOT 추적', text: 'lot 추적 로트 이동경로 바코드 공정이동전표 불량 영향범위', line: () => 'LOT 추적은 작업지시(LOT No.) 기반으로 원소재 투입→공정→검사→출하 경로를 정·역방향 추적합니다. (메뉴: SQ 리포트 ▸ LOT 추적)' },
  { label: '용어', title: 'SQ 심사', text: 'sq 심사 현대차 품질인증 ppm 공정능력 cpk', line: () => 'SQ 심사(2026.11 예정) 대응 수치는 SQ 리포트 메뉴에서 자동 산출됩니다. 목표: 불량률 12,000PPM 이하, 시간당 생산량 170EA.' },
  { label: '용어', title: '수율', text: '수율 양품 불량 yield 비율', line: () => '수율 = 양품수량 ÷ (양품+불량) × 100. 생산실적 기준으로 계산됩니다.' },
  { label: '용어', title: '안전재고', text: '안전재고 safety stock 부족 발주', line: () => '안전재고는 품목별 최소 보유 기준입니다. 현재고가 안전재고 미만이면 재고 예측에서 발주를 추천합니다.' },
  { label: '안내', title: '출하검사', text: '출하검사 생산완료 검사기준 합격', line: () => '출하검사는 생산완료 수주를 대상으로, 품목 검사기준(정량/정성)에 따라 항목 평가 후 합격/불합격을 판정합니다.' },
];

let _cache = null, _t = 0;
export function ragInvalidate() { _cache = null; }

export async function ragIndex() {
  if (_cache && Date.now() - _t < 60000) return _cache;
  const docs = [];
  await Promise.all(SOURCES.map(async (s) => {
    let rows = [];
    try { rows = await db.all(s.table, {}); } catch { rows = []; }
    for (const r of rows) docs.push({ label: s.label, table: s.table, row: r, text: String(s.text(r)).toLowerCase(), line: s.line });
  }));
  for (const k of KNOWLEDGE) docs.push({ label: k.label, table: '__kb__', row: k, text: (k.title + ' ' + k.text).toLowerCase(), line: k.line, title: k.title });
  _cache = docs; _t = Date.now();
  return docs;
}

const STOP = new Set(['알려줘', '보여줘', '뭐', '어떻게', '얼마', '있어', '있나', '해줘', '좀', '리스트', '목록', '의', '를', '을', '는', '은', '이', '가', '에', '에서', '현황', '상태', '정보', '확인']);
const PARTICLE = /(이|가|을|를|은|는|의|에|도|만|과|와|로|으로|에서|에게|한테|까지|부터|된|한)$/;
function tokenize(q) {
  const out = new Set();
  for (const t of q.toLowerCase().split(/[\s,./?!()]+/).filter(Boolean)) {
    if (STOP.has(t)) continue;
    out.add(t);
    const s = t.replace(PARTICLE, '');
    if (s && s.length >= 2 && s !== t && !STOP.has(s)) out.add(s); // 조사 제거 변형(납품이→납품)
  }
  return [...out];
}
function tokenWeight(t) {
  if (/\d/.test(t) && t.length >= 3) return 5; // 코드/번호(SO-2406-001, P-1001 등)
  if (t.length >= 3) return 3;
  if (t.length === 2) return 1;
  return 0;
}

export async function ragRetrieve(q, topK = 8) {
  const docs = await ragIndex();
  const toks = tokenize(q);
  if (!toks.length) return [];
  const scored = [];
  for (const d of docs) {
    let s = 0;
    for (const t of toks) if (d.text.includes(t)) s += tokenWeight(t);
    if (s > 0) scored.push({ ...d, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// 검색 결과를 근거로 답변 구성 (RAG 응답)
export function ragAnswer(q, docs) {
  const groups = {};
  for (const d of docs) (groups[d.label] ??= []).push(d);
  const sections = Object.entries(groups).map(([label, list]) => {
    const lines = list.slice(0, 4).map(d => `<li>${d.line(d.row)}</li>`).join('');
    const more = list.length > 4 ? `<li class="muted">+${list.length - 4}건 더</li>` : '';
    return `<div class="chat-rag-group"><div class="chat-rag-label">${escapeHtml(label)} ${list.length}건</div><ul class="chat-ul">${lines}${more}</ul></div>`;
  }).join('');
  const total = docs.length;
  const sources = [...new Set(docs.map(d => d.label))].join(', ');
  return {
    html: `🔎 <b>"${escapeHtml(q)}"</b> 관련 <b>${total}건</b>을 찾았습니다.${sections}<div class="chat-rag-src">📎 근거: ${escapeHtml(sources)} 데이터</div>`,
    suggestions: ['오늘 생산량', '지연 위험 작업지시', '재고 부족 자재'],
  };
}
