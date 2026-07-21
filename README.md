# MINSUN MES·QMS — (주)민선 가공업 맞춤형 제조실행·품질경영시스템

빌드 과정이 없는(No-build) 순수 정적 웹앱입니다. **Supabase**(PostgreSQL)를 백엔드로,
**Cloudflare**(Workers 정적 자산 또는 Pages)로 배포합니다.

> (주)민선: 자동차 알루미늄 부품 가공·조립·파이프 성형 (MCT/CNC/DRILL/복합기/PIPE/용접)
> **2026년 11월 SQ 심사(현대차 계열 품질인증) 대응**을 위한 MES+QMS 통합 시스템입니다.

## ✨ 특징
- **데모 모드 자동 동작**: Supabase 키가 없으면 브라우저 `localStorage` 샘플 데이터로 즉시 사용
- **가공업 특화 기준정보**: EA/KG 이중단위·단중, 판매/구매/외주단가, 라우팅그룹, 원소재/절단업체, 사내↔외주 혼류 라우팅
- **LOT 추적성**: 작업지시 LOT No. 자동 부여 → 작업지시서 겸 **공정이동전표(바코드) 인쇄** → 원소재 투입~출하 정·역방향 추적
- **양품 자동집계**: 생산실적·외주입고 등 모든 실적 입력에서 양품 = 생산수량 − 불량수량 자동 계산
- **QMS(SQ 대응)**: 수입/공정/출하검사(체크시트), 부적합·개선대책, 4M/PPAP, PFMEA·PFD·관리계획서·작업표준서, 계측기/검교정/Gauge R&R, WPS/PQR/용접사, Q-Cost
- **SQ 지표 자동 산출**: 불량률(PPM), 시간당 생산량, 검사합격률, 공정능력(Cpk) 리포트
- **CMS**: 설비모니터링(PLC 수집로그 반영), 수리이력, 비가동사유/실적, 설비점검
- **공통 CRUD 엔진**: 검색·필터·정렬·페이징·모달폼·CSV 내보내기·유효성검사 내장

## 📁 메뉴 구조
| 모듈 | 화면 |
|------|------|
| 대시보드 | KPI + SQ 핵심지표(PPM·UPH) + AI 인사이트 |
| 작업 POP | 작업지시 → 공정별 시작/종료(작업자·호기 선택, 양품 자동집계, 재작업) |
| 기준정보관리 | 사용자·부서·공통코드·거래처(원소재/절단업체 포함)·품목(단중·이중단위)·BOM·표준공정·라우팅·도면·표준재질·휴일·공구·설비(호기·PLC) |
| 영업관리 | 수주관리·수주현황·출하지시·출하(납품)관리·출하현황 |
| 구매/자재관리 | 자재발주(단중)·자재입고(라벨발행)·자재반출(외주출고/반납)·자재현황·외주발주·외주입고 |
| 생산관리 | 생산계획·작업지시(LOT·전표출력)·생산실적·생산일보·생산현황판 |
| 공구관리 | 재고·입출고/회수(호기별)·폐기(사유·수명)·치수검증 |
| 품질관리 | 검사규격·수입/공정/출하검사·현황·부적합(클레임)·개선대책 |
| 변경/개발관리 | 4M 변경·PPAP 승인·개발문서(PFMEA/PFD/관리계획서/작업표준서) |
| 계측기관리 | 계측기·검교정 이력·Gauge R&R |
| 용접기술관리 | WPS·PQR·용접사 자격 |
| Q-Cost관리 | 기준항목·월별 등록/현황 |
| 설비관리(CMS) | 설비모니터링·수리이력·비가동사유/실적·설비점검 |
| SQ 리포트 | SQ 지표(PPM·UPH·합격률·Cpk)·LOT 추적 타임라인 |
| AI 인텔리전스 | 생산지연 예측·불량원인 분석·재고 예측·설비 예지보전·일일리포트 |

## 🚀 로컬 실행
ES Module을 사용하므로 `file://`로 직접 열면 안 되고, 간단한 정적 서버가 필요합니다.

```bash
python -m http.server 5500
# 또는 VS Code "Live Server" 확장
```
브라우저에서 `http://localhost:5500` 접속. 데모 계정: **admin / admin** (prod01·qa01·mat01·sales01·weld01 / 1234)

## 🗄️ Supabase 연결 (실데이터 사용)
1. [supabase.com](https://supabase.com)에서 프로젝트 생성
2. **SQL Editor**에 `supabase/schema.sql` 전체를 붙여넣고 실행 (테이블 50여 개·뷰·트리거·RLS 생성)
3. **Project Settings → API**에서 `Project URL`과 `anon public key` 복사
4. `js/config.js`에 입력:
   ```js
   export const SUPABASE_URL = 'https://xxxx.supabase.co';
   export const SUPABASE_ANON_KEY = 'sb_publishable_...';
   ```
5. 새로고침 → 상단 "Supabase 연결됨" 표시 확인. 기준정보(부서→사용자→거래처→재질→품목→공정→설비→라우팅→BOM) 순으로 등록

> ⚠️ `schema.sql`의 RLS 정책은 개발 편의를 위해 **anon 전체 허용**입니다.
> 운영 배포 전 반드시 인증 기반 정책으로 강화하세요.

### 생산 파이프라인 (수주 → 계획 → 작업지시(LOT) → POP → 검사 → 출하)
1. **수주관리** 등록 → **생산계획관리** 상단 "생산계획 대기 수주"에서 [생산계획 생성]
2. **작업지시관리** 상단 "작업지시 대기 계획"에서 [작업지시 생성] → **LOT No. 자동 부여**
3. [전표출력] 버튼 → **작업지시서 겸 공정이동전표(Code39 바코드)** 인쇄
4. [작업시작] → **작업 POP**에서 공정별 시작(작업자·호기 선택)/종료(생산·불량수량 → 양품 자동집계, 재작업 처리)
5. **공정검사**(작업지시 대상)·**출하검사**(생산완료 수주 대상) → 검사기준 체크시트 평가로 합격/불합격 자동 판정
6. **출하지시** → **출하(납품)관리**에서 납품완료 처리
7. **SQ 리포트 ▸ LOT 추적**에서 전 구간 타임라인 확인

### CMS(설비 PLC) 연계
PLC 게이트웨이가 `equipment_logs` 테이블에 3초 주기로 적재(equip_code, run_status, run_seconds, prod_count, alarm_*)하면
**설비모니터링** 화면에 자동 반영됩니다. Supabase REST API 또는 PostgreSQL 직결로 적재하면 됩니다.

### 🧪 데모 모드 강제 전환
주소 끝에 `?demo=1`을 붙이면 키가 있어도 localStorage 데모로 동작합니다. `?demo=0`으로 해제.

## ☁️ Cloudflare 배포

**방법 A — Workers 정적 자산 (wrangler, 권장)**
```bash
npm i -g wrangler       # 최초 1회
wrangler login
wrangler deploy         # wrangler.jsonc 의 'minsun-mes' Worker로 배포
```
→ `https://minsun-mes.<계정>.workers.dev`

**방법 B — Pages 대시보드 업로드 (Node 불필요)**
1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Upload assets**
2. 이 폴더 전체를 드래그앤드롭 → **Deploy** → `https://<프로젝트>.pages.dev`

**방법 C — Git 연동 Pages**
빌드 명령 없음(비워둠), 출력 디렉터리 `/`. 포함된 `_headers`가 자동 적용됩니다.

## 📂 폴더 구조
```
minsun/
├─ index.html            # 진입점
├─ wrangler.jsonc        # Cloudflare Workers 배포 설정 (minsun-mes)
├─ assets/css/           # 디자인시스템·레이아웃·컴포넌트
├─ supabase/schema.sql   # 전체 DB 스키마 (민선 MES·QMS)
└─ js/
   ├─ config.js          # Supabase 연결 설정 ← 여기에 URL/KEY 입력
   ├─ routes.js          # 메뉴·라우팅
   ├─ app.js             # 셸·라우터·로그인
   ├─ lib/               # db(어댑터)·crud(페이지 팩토리)·barcode(전표)·seed(데모)·ai·chatbot·rag
   └─ pages/             # 화면 모듈 (base·sales·purchase·production·tool·quality·qms·cms·kpi·pop …)
```
