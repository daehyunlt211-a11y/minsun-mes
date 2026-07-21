-- =====================================================================
-- MINSUN MES·QMS 데이터베이스 스키마 (Supabase / PostgreSQL)
-- (주)민선 가공업 맞춤형 MES + QMS 통합 재구축
--   · 가공업 특성: EA/KG 이중단위, 단중, 원소재/절단업체, 사내↔외주 혼류 라우팅
--   · QMS(SQ 심사 대응): 수입/공정/출하검사, 부적합·개선대책, 4M/PPAP,
--     개발문서(PFMEA/PFD/관리계획서/작업표준서), 계측기/검교정/Gauge R&R,
--     용접기술(WPS/PQR/용접사), Q-Cost
--   · CMS: 설비 수리이력/비가동/점검/PLC 수집로그
-- 실행 방법: Supabase 대시보드 > SQL Editor 에 붙여넣고 실행
-- =====================================================================

-- 확장
create extension if not exists "uuid-ossp";

-- 공통: updated_at 자동 갱신 트리거 함수
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =====================================================================
-- 1. 시스템/기준정보
-- =====================================================================

-- 1-0 공통코드
create table if not exists common_codes (
  id          uuid primary key default uuid_generate_v4(),
  group_code  text not null,                   -- 코드그룹 (예: DEFECT_TYPE, DOWNTIME)
  group_name  text,
  code        text not null,
  name        text not null,
  sort_no     int default 0,
  use_yn      boolean default true,
  remark      text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (group_code, code)
);

-- 1-1 부서관리
create table if not exists departments (
  id          uuid primary key default uuid_generate_v4(),
  code        text unique not null,
  name        text not null,
  parent_id   uuid references departments(id),
  manager     text,
  phone       text,
  use_yn      boolean default true,
  remark      text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- 1-2 사용자관리
create table if not exists users (
  id          uuid primary key default uuid_generate_v4(),
  login_id    text unique not null,
  password    text,                            -- 로그인 비밀번호 (운영 시 해시/Supabase Auth 권장)
  name        text not null,
  department  text,
  position    text,
  role        text default 'user',            -- admin / manager / user
  email       text,
  phone       text,
  use_yn      boolean default true,
  remark      text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- 1-3 거래처관리 (매출처/매입처/외주가공처/원소재업체/절단업체)
create table if not exists partners (
  id          uuid primary key default uuid_generate_v4(),
  code        text unique not null,
  name        text not null,
  biz_type    text,                            -- 매출처 / 매입처 / 외주가공처 / 원소재업체 / 절단업체
  biz_no      text,
  ceo         text,
  manager     text,
  phone       text,
  email       text,
  address     text,
  use_yn      boolean default true,
  remark      text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- 1-4 품목관리 (가공업 특성: EA/KG 이중단위·단중·판매/구매/외주단가·라우팅그룹)
create table if not exists items (
  id             uuid primary key default uuid_generate_v4(),
  code           text unique not null,
  name           text not null,
  item_type      text,                          -- 완제품 / 반제품 / 원소재 / 부자재
  customer       text,                          -- 고객사(매출처)
  spec           text,
  unit           text default 'EA',             -- 기본단위
  unit2          text,                          -- 보조단위 (KG 등, EA/KG 이중단위)
  unit_weight    numeric default 0,             -- 단중 (KG/EA)
  material       text,                          -- 재질 (표준재질 참조)
  drawing_no     text,                          -- 도면번호
  routing_group  text,                          -- 라우팅그룹
  category       text,
  safety_stock   numeric default 0,
  sale_price     numeric default 0,             -- 판매단가
  purchase_price numeric default 0,             -- 구매단가
  subcon_price   numeric default 0,             -- 외주단가
  unit_price     numeric default 0,             -- 대표단가(호환)
  location       text,                          -- 대표위치
  partner        text,                          -- 주거래처
  use_yn         boolean default true,
  remark         text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- 1-5 표준공정관리 (MCT/CNC/DRILL/복합기/PIPE성형/용접/조립/검사/외주)
create table if not exists processes (
  id            uuid primary key default uuid_generate_v4(),
  code          text unique not null,
  name          text not null,
  process_type  text,                           -- MCT가공/CNC가공/DRILL/복합기/PIPE성형/용접/조립/검사/포장/외주
  in_out        text default '사내',            -- 사내 / 외주
  work_center   text,
  std_time      numeric default 0,
  setup_time    numeric default 0,
  use_yn        boolean default true,
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 1-6 제품별표준공정(라우팅) — 사내↔외주 혼류 공정 순서 지원
create table if not exists item_processes (
  id            uuid primary key default uuid_generate_v4(),
  item_code     text not null,
  process_code  text not null,
  seq           int default 10,
  process_name  text,
  in_out        text default '사내',            -- 사내 / 외주
  std_time      numeric default 0,
  equipment     text,
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (item_code, seq, process_code)
);

-- 1-7 공구관리 마스터 (최대사용횟수·교체알람횟수)
create table if not exists tools (
  id            uuid primary key default uuid_generate_v4(),
  code          text unique not null,
  name          text not null,
  tool_type     text,                           -- 절삭 / 측정 / 지그 / 기타
  spec          text,
  maker         text,
  life_count    int default 0,                  -- 최대사용횟수(1개당)
  alarm_count   int default 0,                  -- 교체알람횟수
  unit_price    numeric default 0,              -- 표준 입고단가
  process       text,
  unit          text default 'EA',
  safety_stock  numeric default 0,
  location      text,
  lot_rule      text,                           -- 공구 LOT 형식(제작일자 기반 등)
  use_yn        boolean default true,
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 1-7b 공구 투입 이력 (입고 LOT별 사용 횟수 차감)
create table if not exists tool_usages (
  id            uuid primary key default uuid_generate_v4(),
  use_no        text,
  use_date      date default current_date,
  tool_code     text not null,
  lot_no        text,
  use_qty       numeric default 0,
  wo_no         text,
  process       text,
  machine_no    text,                           -- 호기
  worker        text,
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists idx_toolusage_tool on tool_usages(tool_code);

-- 1-8 설비관리 (호기 관리 + PLC 연계 여부)
create table if not exists equipments (
  id            uuid primary key default uuid_generate_v4(),
  code          text unique not null,
  name          text not null,
  equip_type    text,                           -- MCT / CNC / DRILL / 복합기 / PIPE성형기 / 용접기 / 검사기 / 기타
  machine_no    text,                           -- 호기 (예: MCT-1호기)
  model         text,
  maker         text,
  work_center   text,
  install_date  date,
  plc_yn        boolean default false,          -- PLC(CMS) 연계 여부
  check_cycle   text,                           -- 점검주기 (일상/주간/월간)
  status        text default '정상',            -- 정상 / 점검 / 고장 / 비가동
  use_yn        boolean default true,
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 1-9 BOM관리 (원소재 기준 — 원소재업체·절단업체 포함, 기준정보 소속)
create table if not exists boms (
  id                uuid primary key default uuid_generate_v4(),
  item_code         text not null,
  component_code    text not null,
  component_name    text,
  qty               numeric default 0,
  unit              text default 'EA',
  unit_weight       numeric default 0,           -- 소요 단중(KG)
  material_partner  text,                        -- 원소재업체
  cutting_partner   text,                        -- 절단업체
  remark            text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  unique (item_code, component_code)
);
create index if not exists idx_bom_item on boms(item_code);

-- 1-5b 공정별 사용설비 (N:M)
create table if not exists process_equipments (
  id              uuid primary key default uuid_generate_v4(),
  process_code    text not null,
  equipment_code  text not null,
  equipment_name  text,
  remark          text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (process_code, equipment_code)
);
create index if not exists idx_pe_proc on process_equipments(process_code);

-- 1-10 도면관리
create table if not exists drawings (
  id            uuid primary key default uuid_generate_v4(),
  drawing_no    text unique not null,
  item_code     text,
  item_name     text,
  rev           text default 'A',
  title         text,
  file_url      text,
  writer        text,
  reg_date      date default current_date,
  use_yn        boolean default true,
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 1-11 표준재질관리
create table if not exists std_materials (
  id            uuid primary key default uuid_generate_v4(),
  code          text unique not null,
  name          text not null,                   -- 예: AL6061, SUS304
  category      text,                            -- 알루미늄 / 스틸 / 스테인리스 등
  density       numeric default 0,               -- 비중
  spec          text,
  use_yn        boolean default true,
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 1-12 휴일관리
create table if not exists holidays (
  id            uuid primary key default uuid_generate_v4(),
  holiday_date  date unique not null,
  name          text not null,
  holiday_type  text default '법정공휴일',       -- 법정공휴일 / 회사휴일 / 임시휴일
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- =====================================================================
-- 2. 영업관리
-- =====================================================================

-- 2-1 수주관리 (EA/KG, 생산계획 연계)
create table if not exists sales_orders (
  id            uuid primary key default uuid_generate_v4(),
  order_no      text unique not null,
  order_date    date default current_date,
  partner       text,
  item_code     text,
  item_name     text,
  spec          text,
  unit          text default 'EA',
  order_qty     numeric default 0,
  order_weight  numeric default 0,              -- KG 환산(단중×수량)
  unit_price    numeric default 0,
  amount        numeric default 0,
  due_date      date,
  po_no         text,                           -- 고객 발주번호
  status        text default '접수',            -- 접수 / 생산중 / 완료 / 취소
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 2-2 출하지시
create table if not exists shipping_orders (
  id            uuid primary key default uuid_generate_v4(),
  ship_no       text unique not null,
  ship_date     date default current_date,      -- 출하예정일
  order_no      text,
  partner       text,
  item_code     text,
  item_name     text,
  ship_qty      numeric default 0,
  warehouse     text,
  status        text default '지시',            -- 지시 / 출하완료 / 취소
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 2-3 출하(납품)실적
create table if not exists deliveries (
  id            uuid primary key default uuid_generate_v4(),
  delivery_no   text unique not null,
  delivery_date date default current_date,
  ship_no       text,                           -- 출하지시번호
  order_no      text,
  partner       text,
  item_code     text,
  item_name     text,
  delivery_qty  numeric default 0,
  unit_price    numeric default 0,
  amount        numeric default 0,
  status        text default '납품완료',        -- 출고예정 / 납품완료
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- =====================================================================
-- 3. 구매/자재관리
-- =====================================================================

-- 3-1 자재발주 (원소재업체·절단업체·단중 관리)
create table if not exists purchase_orders (
  id                uuid primary key default uuid_generate_v4(),
  po_no             text unique not null,
  po_date           date default current_date,
  material_partner  text,                        -- 원소재업체
  cutting_partner   text,                        -- 절단업체
  item_code         text,
  item_name         text,
  spec              text,
  unit              text default 'EA',
  po_qty            numeric default 0,
  unit_weight       numeric default 0,           -- 단중(KG/EA)
  total_weight      numeric default 0,           -- 총중량(KG)
  unit_price        numeric default 0,
  amount            numeric default 0,
  due_date          date,
  status            text default '발주',         -- 발주 / 입고중 / 입고완료 / 취소
  remark            text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- 3-2 자재입고 (수입검사 연계, 관리번호(LOT))
create table if not exists material_inbounds (
  id            uuid primary key default uuid_generate_v4(),
  inbound_no    text unique not null,
  inbound_date  date default current_date,
  po_no         text,                            -- 자재발주번호
  partner       text,
  item_code     text,
  item_name     text,
  spec          text,
  unit          text default 'EA',
  inbound_qty   numeric default 0,
  actual_qty    numeric,
  unit_weight   numeric default 0,               -- 단중
  unit_price    numeric default 0,
  amount        numeric default 0,
  warehouse     text,
  lot_no        text,                            -- 관리번호(LOT)
  vendor_lot    text,                            -- 거래처 로트
  status        text default '입고대기',         -- 입고대기 / 입고완료
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 3-3 자재반출(출고) — 생산투입 / 외주출고 / 외주반납 / 반품 (PDA 연동)
create table if not exists material_outbounds (
  id            uuid primary key default uuid_generate_v4(),
  outbound_no   text unique not null,
  outbound_date date default current_date,
  item_code     text,
  item_name     text,
  unit          text default 'EA',
  outbound_qty  numeric default 0,
  wo_no         text,
  inbound_no    text,
  lot_no        text,
  warehouse     text,
  partner       text,                            -- 외주출고 시 외주가공처
  purpose       text,                            -- 생산투입 / 외주출고 / 외주반납 / 반품 / 재고조정
  worker        text,
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 3-4 자재현황 (재고: 입고-반출 집계 뷰)
create or replace view material_stocks as
with ins as (
  select item_code, max(item_name) as item_name,
    sum(case when status = '입고완료' then coalesce(nullif(actual_qty, 0), inbound_qty) else 0 end) as in_qty
  from material_inbounds group by item_code
), outs as (
  select item_code, max(item_name) as item_name, sum(outbound_qty) as out_qty
  from material_outbounds group by item_code
)
select
  coalesce(i.item_code, o.item_code)                 as item_code,
  coalesce(i.item_name, o.item_name)                 as item_name,
  coalesce(i.in_qty, 0)                              as in_qty,
  coalesce(o.out_qty, 0)                             as out_qty,
  coalesce(i.in_qty, 0) - coalesce(o.out_qty, 0)     as stock_qty
from ins i full outer join outs o on i.item_code = o.item_code;

-- 3-5 외주발주
create table if not exists subcon_orders (
  id            uuid primary key default uuid_generate_v4(),
  sco_no        text unique not null,
  sco_date      date default current_date,
  partner       text,                            -- 외주가공처
  item_code     text,
  item_name     text,
  process       text,                            -- 외주공정
  order_qty     numeric default 0,
  unit_price    numeric default 0,               -- 외주단가
  amount        numeric default 0,
  due_date      date,
  wo_no         text,                            -- 연계 작업지시
  status        text default '발주',             -- 발주 / 가공중 / 입고완료 / 취소
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 3-6 외주입고 (외주가공품 입고검사 연계)
create table if not exists subcon_inbounds (
  id            uuid primary key default uuid_generate_v4(),
  sci_no        text unique not null,
  sci_date      date default current_date,
  sco_no        text,
  partner       text,
  item_code     text,
  item_name     text,
  process       text,
  inbound_qty   numeric default 0,
  good_qty      numeric default 0,
  defect_qty    numeric default 0,
  lot_no        text,
  inspect_result text,                           -- 합격 / 불합격 / 미검사
  status        text default '입고대기',         -- 입고대기 / 입고완료
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- =====================================================================
-- 4. 생산관리
-- =====================================================================

-- 4-1 생산계획 (수주 연계)
create table if not exists production_plans (
  id            uuid primary key default uuid_generate_v4(),
  plan_no       text unique not null,
  plan_date     date default current_date,
  order_no      text,
  item_code     text,
  item_name     text,
  plan_qty      numeric default 0,
  start_date    date,
  end_date      date,
  line          text,
  status        text default '계획',
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 4-2 작업지시 (LOT No 부여, 공정이동전표 바코드 겸용, 계획기간)
create table if not exists work_orders (
  id            uuid primary key default uuid_generate_v4(),
  wo_no         text unique not null,
  wo_date       date default current_date,
  lot_no        text,                            -- LOT Number (추적성 핵심)
  plan_no       text,
  item_code     text,
  item_name     text,
  order_qty     numeric default 0,
  process       text,
  equipment     text,
  machine_no    text,                            -- 호기
  worker        text,
  line          text,
  start_date    date,                            -- 계획 시작일 (계획기간)
  due_date      date,                            -- 계획 종료일 (계획기간)
  status        text default '대기',
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 4-3 생산실적 (양품수량 = 생산수량 - 불량수량 자동집계)
create table if not exists production_results (
  id            uuid primary key default uuid_generate_v4(),
  result_no     text unique not null,
  result_date   date default current_date,
  wo_no         text,
  lot_no        text,
  item_code     text,
  item_name     text,
  process       text,
  equipment     text,
  machine_no    text,
  worker        text,
  prod_qty      numeric default 0,              -- 생산수량
  defect_qty    numeric default 0,              -- 불량수량
  good_qty      numeric default 0,              -- 양품수량(자동집계)
  rework_yn     boolean default false,          -- 재작업 여부
  work_time     numeric default 0,
  status        text default '완료',
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 4-4 POP 작업지시별 공정 진행
create table if not exists work_order_processes (
  id            uuid primary key default uuid_generate_v4(),
  wo_no         text not null,
  item_code     text,
  seq           int default 10,
  process_code  text,
  process_name  text,
  in_out        text default '사내',
  equipment     text,
  machine_no    text,
  worker        text,
  status        text default '대기',
  start_at      timestamptz,
  end_at        timestamptz,
  input_qty     numeric default 0,
  prod_qty      numeric default 0,
  good_qty      numeric default 0,
  defect_qty    numeric default 0,
  work_time     numeric default 0,
  is_rework     boolean default false,
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists idx_wop_wo on work_order_processes(wo_no);

-- =====================================================================
-- 5. 공구관리 (운영)
-- =====================================================================

-- 5-1 공구 입/출고/회수 (입고검사·단가, 호기별 출고, 회수처)
create table if not exists tool_movements (
  id             uuid primary key default uuid_generate_v4(),
  move_no        text unique not null,
  move_date      date default current_date,
  move_type      text default '입고',            -- 입고 / 출고 / 회수
  tool_code      text,
  tool_name      text,
  lot_no         text,                           -- 공구 LOT(제작일자 기반)
  qty            numeric default 0,
  unit_price     numeric default 0,              -- 입고금액(단가)
  inspect_result text,                           -- 입고검사: 합격 / 불합격 / 성적서확인
  dest_type      text,                           -- 출고/회수처 구분: 사내 / 외주
  machine_no     text,                           -- 호기 (사내 출고 시 필수)
  partner        text,                           -- 외주처 (외주 출고 시)
  worker         text,
  equipment      text,
  location       text,
  remark         text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- 5-2 공구 폐기 (폐기사유·공구수명)
create table if not exists tool_disposals (
  id            uuid primary key default uuid_generate_v4(),
  disposal_no   text unique not null,
  disposal_date date default current_date,
  tool_code     text,
  tool_name     text,
  lot_no        text,
  qty           numeric default 0,
  reason        text,                            -- 수명초과 / 파손 / 마모 / 기타
  life_used     numeric default 0,               -- 사용수명(횟수)
  worker        text,
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 5-3 공구 치수검증 (교체 전/후 및 교체 후 일정수량 검증)
create table if not exists tool_verifications (
  id            uuid primary key default uuid_generate_v4(),
  verify_no     text unique not null,
  verify_date   date default current_date,
  tool_code     text,
  tool_name     text,
  lot_no        text,
  machine_no    text,
  wo_no         text,
  verify_type   text default '교체후',          -- 교체전 / 교체후 / 교체후N개
  item_code     text,
  inspect_item  text,                            -- 검증 치수 항목
  spec_value    text,
  tolerance     text,
  measured      text,
  judgment      text,                            -- OK / NG
  worker        text,
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 5-4 공구재고 (입고-출고+회수-폐기 집계 뷰)
create or replace view tool_stocks as
select
  t.code                                                       as tool_code,
  t.name                                                       as tool_name,
  t.tool_type,
  t.safety_stock,
  coalesce(sum(case when m.move_type='입고' then m.qty else 0 end),0) as in_qty,
  coalesce(sum(case when m.move_type='출고' then m.qty else 0 end),0) as out_qty,
  coalesce(sum(case when m.move_type='회수' then m.qty else 0 end),0) as return_qty,
  coalesce(d.disposal_qty,0)                                   as disposal_qty,
  coalesce(sum(case when m.move_type='입고' then m.qty else 0 end),0)
    - coalesce(sum(case when m.move_type='출고' then m.qty else 0 end),0)
    + coalesce(sum(case when m.move_type='회수' then m.qty else 0 end),0)
    - coalesce(d.disposal_qty,0)                               as stock_qty
from tools t
left join tool_movements m on t.code = m.tool_code
left join (select tool_code, sum(qty) disposal_qty from tool_disposals group by tool_code) d
  on t.code = d.tool_code
group by t.code, t.name, t.tool_type, t.safety_stock, d.disposal_qty;

-- =====================================================================
-- 6. 품질관리 (QMS — SQ 심사 대응)
-- =====================================================================

-- 6-1 검사규격(기준)관리
create table if not exists inspection_standards (
  id            uuid primary key default uuid_generate_v4(),
  std_no        text unique not null,
  item_code     text,
  item_name     text,
  process       text,                            -- 공정검사용: 대상 공정
  inspect_type  text default '수입검사',        -- 수입검사 / 공정검사 / 출하검사
  inspect_item  text,
  eval_method   text default '정량적',
  spec_value    text,
  tolerance     text,
  method        text,
  equipment     text,                            -- 측정장비(계측기)
  use_yn        boolean default true,
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 6-1b 검사 실적 상세
create table if not exists inspection_details (
  id            uuid primary key default uuid_generate_v4(),
  inspect_no    text not null,
  inspect_kind  text,                            -- 수입검사 / 공정검사 / 출하검사
  item_code     text,
  inspect_item  text,
  eval_method   text,
  spec_value    text,
  tolerance     text,
  measured      text,
  judgment      text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists idx_idet_no on inspection_details(inspect_no);

-- 6-2 수입검사
create table if not exists incoming_inspections (
  id            uuid primary key default uuid_generate_v4(),
  inspect_no    text unique not null,
  inspect_date  date default current_date,
  inbound_no    text,
  partner       text,
  item_code     text,
  item_name     text,
  lot_no        text,
  inspect_qty   numeric default 0,
  good_qty      numeric default 0,
  defect_qty    numeric default 0,
  inspector     text,
  result        text default '합격',
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 6-3 공정검사 (기존 MES 부재 — SQ 심사 필수 신설)
create table if not exists process_inspections (
  id            uuid primary key default uuid_generate_v4(),
  inspect_no    text unique not null,
  inspect_date  date default current_date,
  wo_no         text,
  lot_no        text,
  process       text,
  machine_no    text,
  item_code     text,
  item_name     text,
  inspect_qty   numeric default 0,
  good_qty      numeric default 0,
  defect_qty    numeric default 0,
  inspector     text,
  result        text default '합격',
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 6-4 출하검사
create table if not exists shipping_inspections (
  id            uuid primary key default uuid_generate_v4(),
  inspect_no    text unique not null,
  inspect_date  date default current_date,
  ship_no       text,
  order_no      text,
  partner       text,
  item_code     text,
  item_name     text,
  lot_no        text,
  inspect_qty   numeric default 0,
  good_qty      numeric default 0,
  defect_qty    numeric default 0,
  inspector     text,
  result        text default '합격',
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 6-5 부적합관리 (클레임 데이터 항목 수용)
create table if not exists nonconformances (
  id            uuid primary key default uuid_generate_v4(),
  ncr_no        text unique not null,
  occur_date    date default current_date,
  ncr_type      text default '공정부적합',      -- 공정부적합 / 수입부적합 / 출하부적합 / 고객클레임
  process       text,
  item_code     text,
  item_name     text,
  lot_no        text,
  partner       text,                            -- 클레임 고객사
  defect_type   text,
  defect_qty    numeric default 0,
  cause         text,
  charge_dept   text,                            -- 귀책부서
  action        text,
  action_type   text default '폐기',
  claim_amount  numeric default 0,               -- 클레임금액
  worker        text,
  status        text default '처리중',
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 6-6 개선대책관리 (부적합 연계 시정·예방조치)
create table if not exists improvement_actions (
  id             uuid primary key default uuid_generate_v4(),
  imp_no         text unique not null,
  reg_date       date default current_date,
  ncr_no         text,                           -- 연계 부적합번호
  title          text,
  cause_analysis text,                           -- 원인분석
  action_plan    text,                           -- 대책(시정/예방조치)
  action_type    text default '시정조치',        -- 시정조치 / 예방조치
  owner          text,                           -- 담당자
  due_date       date,
  complete_date  date,
  effect_check   text,                           -- 효과확인
  status         text default '진행중',          -- 진행중 / 완료 / 지연
  remark         text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- =====================================================================
-- 7. 변경/개발관리 (4M · PPAP · 개발문서)
-- =====================================================================

-- 7-1 4M 변경관리
create table if not exists four_m_changes (
  id            uuid primary key default uuid_generate_v4(),
  fm_no         text unique not null,
  change_date   date default current_date,
  category      text default 'Machine',         -- Man / Machine / Material / Method
  item_code     text,
  item_name     text,
  process       text,
  before_desc   text,                            -- 변경 전
  after_desc    text,                            -- 변경 후
  reason        text,
  ppap_yn       boolean default false,           -- PPAP 제출 대상 여부
  approver      text,
  status        text default '신청',             -- 신청 / 검토중 / 승인 / 반려
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 7-2 PPAP 승인관리
create table if not exists ppap_approvals (
  id            uuid primary key default uuid_generate_v4(),
  ppap_no       text unique not null,
  submit_date   date default current_date,
  customer      text,
  item_code     text,
  item_name     text,
  level         text default 'Level 3',         -- Level 1~5
  reason        text,                            -- 신규 / 4M변경 / 설계변경 등
  fm_no         text,                            -- 연계 4M 변경번호
  docs          text,                            -- 제출 서류 목록
  approver      text,
  approve_date  date,
  status        text default '작성중',           -- 작성중 / 제출 / 승인 / 반려
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 7-3 개발문서 관리 (PFMEA / PFD / 관리계획서 / 작업표준서 — 개정관리)
create table if not exists dev_docs (
  id            uuid primary key default uuid_generate_v4(),
  doc_no        text unique not null,
  doc_type      text default 'PFMEA',            -- PFMEA / PFD / 관리계획서 / 작업표준서
  item_code     text,
  item_name     text,
  process       text,
  rev           text default 'A',
  title         text,
  writer        text,
  write_date    date default current_date,
  approver      text,
  approve_date  date,
  file_url      text,
  status        text default '작성중',           -- 작성중 / 승인 / 개정 / 폐기
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- =====================================================================
-- 8. 계측기관리 (SQ 측정 신뢰성)
-- =====================================================================

-- 8-1 계측기 마스터
create table if not exists measuring_instruments (
  id            uuid primary key default uuid_generate_v4(),
  code          text unique not null,
  name          text not null,
  model         text,
  serial_no     text,
  maker         text,
  meas_range    text,                            -- 측정범위
  resolution    text,                            -- 분해능
  location      text,
  manager       text,
  calib_cycle   int default 12,                  -- 검교정주기(개월)
  last_calib    date,
  next_calib    date,
  status        text default '정상',             -- 정상 / 교정중 / 수리중 / 폐기
  use_yn        boolean default true,
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 8-2 검교정/수리 이력
create table if not exists calibrations (
  id            uuid primary key default uuid_generate_v4(),
  cal_no        text unique not null,
  cal_date      date default current_date,
  inst_code     text,
  inst_name     text,
  cal_type      text default '외부교정',         -- 사내교정 / 외부교정 / 수리
  agency        text,                            -- 교정기관
  result        text default '합격',             -- 합격 / 불합격 / 조정후합격
  cert_no       text,                            -- 성적서번호
  cost          numeric default 0,
  next_date     date,
  worker        text,
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 8-3 Gauge R&R
create table if not exists gauge_rr (
  id            uuid primary key default uuid_generate_v4(),
  rr_no         text unique not null,
  eval_date     date default current_date,
  inst_code     text,
  inst_name     text,
  item_code     text,
  characteristic text,                           -- 측정 특성(치수 등)
  appraisers    int default 3,                   -- 평가자 수
  parts         int default 10,                  -- 시료 수
  trials        int default 3,                   -- 반복 수
  grr_percent   numeric default 0,               -- %GRR
  ndc           numeric default 0,               -- 구별범주수
  judgment      text default '적합',             -- 적합(<10%) / 조건부(10~30%) / 부적합(>30%)
  evaluator     text,
  plan_date     date,                            -- 평가계획일
  status        text default '완료',             -- 계획 / 진행 / 완료
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- =====================================================================
-- 9. 용접기술관리 (WPS / PQR / 용접사)
-- =====================================================================

-- 9-1 용접절차 시방서 (WPS)
create table if not exists wps_docs (
  id              uuid primary key default uuid_generate_v4(),
  wps_no          text unique not null,
  rev             text default 'A',
  title           text,
  welding_process text,                          -- GTAW / GMAW / SMAW / SAW 등
  base_metal      text,                          -- 모재
  filler_metal    text,                          -- 용가재
  shielding_gas   text,                          -- 보호가스
  current_range   text,                          -- 전류범위
  voltage_range   text,                          -- 전압범위
  travel_speed    text,                          -- 용접속도
  preheat_temp    text,                          -- 예열온도
  position        text,                          -- 용접자세
  pqr_no          text,                          -- 근거 PQR
  writer          text,
  write_date      date default current_date,
  approver        text,
  status          text default '작성중',         -- 작성중 / 승인 / 개정 / 폐기
  remark          text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- 9-2 용접절차 인정기록서 (PQR)
create table if not exists pqr_docs (
  id              uuid primary key default uuid_generate_v4(),
  pqr_no          text unique not null,
  test_date       date default current_date,
  wps_no          text,
  welding_process text,
  base_metal      text,
  filler_metal    text,
  welder          text,                          -- 시험 용접사
  test_items      text,                          -- 시험항목(인장/굽힘/침투 등)
  test_agency     text,                          -- 시험기관
  result          text default '합격',           -- 합격 / 불합격
  cert_no         text,
  writer          text,
  status          text default '유효',           -- 유효 / 만료 / 폐기
  remark          text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- 9-3 용접사 관리 (자격·이력)
create table if not exists welders (
  id              uuid primary key default uuid_generate_v4(),
  code            text unique not null,
  name            text not null,
  department      text,
  cert_no         text,                          -- 자격증번호
  cert_type       text,                          -- 자격종류(용접기능사 등)
  welding_process text,                          -- 인정 용접법
  position_range  text,                          -- 인정 자세
  issue_date      date,
  expire_date     date,                          -- 자격 유효기간
  renewal_date    date,                          -- 갱신예정일
  status          text default '유효',           -- 유효 / 만료임박 / 만료
  use_yn          boolean default true,
  remark          text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- =====================================================================
-- 10. Q-Cost 관리
-- =====================================================================

-- 10-1 Q-Cost 기준(세부항목)
create table if not exists qcost_items (
  id            uuid primary key default uuid_generate_v4(),
  code          text unique not null,
  category      text default '예방비용',         -- 예방비용 / 평가비용 / 내부실패비용 / 외부실패비용
  name          text not null,
  calc_basis    text,                            -- 산출기준
  use_yn        boolean default true,
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 10-2 Q-Cost 등록 (월별)
create table if not exists qcost_records (
  id            uuid primary key default uuid_generate_v4(),
  rec_no        text unique not null,
  cost_ym       text,                            -- 귀속월 (YYYY-MM)
  cost_code     text,                            -- Q-Cost 항목코드
  cost_name     text,
  category      text,                            -- 예방비용 / 평가비용 / 내부실패비용 / 외부실패비용
  amount        numeric default 0,
  dept          text,
  writer        text,
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- =====================================================================
-- 11. CMS 설비관리
-- =====================================================================

-- 11-1 설비 수리/보전 이력
create table if not exists equipment_histories (
  id            uuid primary key default uuid_generate_v4(),
  hist_no       text unique not null,
  hist_date     date default current_date,
  equip_code    text,
  equip_name    text,
  hist_type     text default '고장수리',         -- 고장수리 / 예방정비 / 부품교체
  content       text,
  parts         text,                            -- 교체부품
  cost          numeric default 0,
  downtime_min  numeric default 0,               -- 정지시간(분)
  worker        text,
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 11-2 비가동사유 코드
create table if not exists downtime_codes (
  id            uuid primary key default uuid_generate_v4(),
  code          text unique not null,
  name          text not null,                   -- 금형교체 / 자재대기 / 고장 / 계획정지 등
  category      text default '비계획',           -- 계획 / 비계획
  use_yn        boolean default true,
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 11-3 비가동 실적
create table if not exists equipment_downtimes (
  id            uuid primary key default uuid_generate_v4(),
  dt_no         text unique not null,
  dt_date       date default current_date,
  equip_code    text,
  equip_name    text,
  reason_code   text,
  reason_name   text,
  start_time    timestamptz,
  end_time      timestamptz,
  minutes       numeric default 0,
  worker        text,
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 11-4 설비 점검 (일상/주간/월간)
create table if not exists equipment_checks (
  id            uuid primary key default uuid_generate_v4(),
  check_no      text unique not null,
  check_date    date default current_date,
  equip_code    text,
  equip_name    text,
  check_cycle   text default '일상',             -- 일상 / 주간 / 월간
  check_item    text,
  result        text default '양호',             -- 양호 / 불량 / 조치완료
  worker        text,
  remark        text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 11-5 CMS 설비 수집 로그 (PLC 게이트웨이 3초 주기 적재용)
create table if not exists equipment_logs (
  id            uuid primary key default uuid_generate_v4(),
  log_time      timestamptz default now(),
  equip_code    text,
  run_status    text,                            -- 가동 / 비가동 / 알람
  run_seconds   numeric default 0,               -- 누적 가동시간(초)
  prod_count    numeric default 0,               -- 생산 카운트
  alarm_code    text,
  alarm_msg     text,
  created_at    timestamptz default now()
);
create index if not exists idx_eqlog_time on equipment_logs(log_time);
create index if not exists idx_eqlog_equip on equipment_logs(equip_code);

-- =====================================================================
-- updated_at 트리거 일괄 적용
-- =====================================================================
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'common_codes','departments','users','partners','items','processes','item_processes',
      'tools','tool_usages','equipments','boms','process_equipments','drawings','std_materials','holidays',
      'sales_orders','shipping_orders','deliveries',
      'purchase_orders','material_inbounds','material_outbounds','subcon_orders','subcon_inbounds',
      'production_plans','work_orders','production_results','work_order_processes',
      'tool_movements','tool_disposals','tool_verifications',
      'inspection_standards','inspection_details','incoming_inspections','process_inspections','shipping_inspections',
      'nonconformances','improvement_actions',
      'four_m_changes','ppap_approvals','dev_docs',
      'measuring_instruments','calibrations','gauge_rr',
      'wps_docs','pqr_docs','welders',
      'qcost_items','qcost_records',
      'equipment_histories','downtime_codes','equipment_downtimes','equipment_checks'
    ])
  loop
    execute format('drop trigger if exists trg_%I_updated on %I;', t, t);
    execute format('create trigger trg_%I_updated before update on %I for each row execute function set_updated_at();', t, t);
  end loop;
end $$;

-- =====================================================================
-- RLS (개발 단계: anon 전체 허용. 운영 전 정책 강화 필요)
-- =====================================================================
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'common_codes','departments','users','partners','items','processes','item_processes',
      'tools','tool_usages','equipments','boms','process_equipments','drawings','std_materials','holidays',
      'sales_orders','shipping_orders','deliveries',
      'purchase_orders','material_inbounds','material_outbounds','subcon_orders','subcon_inbounds',
      'production_plans','work_orders','production_results','work_order_processes',
      'tool_movements','tool_disposals','tool_verifications',
      'inspection_standards','inspection_details','incoming_inspections','process_inspections','shipping_inspections',
      'nonconformances','improvement_actions',
      'four_m_changes','ppap_approvals','dev_docs',
      'measuring_instruments','calibrations','gauge_rr',
      'wps_docs','pqr_docs','welders',
      'qcost_items','qcost_records',
      'equipment_histories','downtime_codes','equipment_downtimes','equipment_checks','equipment_logs'
    ])
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "allow_all" on %I;', t);
    execute format('create policy "allow_all" on %I for all using (true) with check (true);', t);
  end loop;
end $$;
