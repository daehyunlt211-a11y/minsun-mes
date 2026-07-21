// 메뉴 구조 + 라우트 → 페이지 매핑 (민선 MES·QMS)
import { dashboard } from './pages/dashboard.js';
import * as base from './pages/base.js';
import * as sales from './pages/sales.js';
import * as prod from './pages/production.js';
import * as mat from './pages/material.js';
import * as pur from './pages/purchase.js';
import * as tool from './pages/tool.js';
import * as cms from './pages/cms.js';
import * as devDocs from './pages/devDocs.js';
import * as change from './pages/change.js';
import * as measure from './pages/measure.js';
import * as weld from './pages/welding.js';
import * as qcost from './pages/qcost.js';
import { sqReport, lotTrace } from './pages/kpi.js';
import { popList, popDetail } from './pages/pop.js';
import { itemRouting } from './pages/routing.js';
import { processMaster } from './pages/processMaster.js';
import { incomingInspection, processInspection, shippingInspection } from './pages/inspection.js';
import { inspectionSpecs } from './pages/inspectionSpec.js';
import { nonconformances, improvementActions } from './pages/nonconformance.js';
import { departmentManager } from './pages/department.js';
import { ncrStatus } from './pages/ncrStatus.js';
import { bomManager } from './pages/bom.js';
import { incomingStatus, shippingStatus, salesStatus, deliveryStatus } from './pages/statusView.js';
import { designSpecHome, designSpecDetail } from './pages/designSpec.js';

// 사이드바 메뉴 트리
export const MENU = [
  { id: 'dashboard', label: '대시보드', icon: 'dashboard', path: '/dashboard' },
  { id: 'pop', label: '작업 POP', icon: 'monitor', path: '/pop' },
  {
    id: 'base', label: '기준정보관리', icon: 'database', children: [
      { label: '사용자관리', path: '/base/users' },
      { label: '부서관리', path: '/base/departments' },
      { label: '공통코드관리', path: '/base/codes' },
      { label: '거래처관리', path: '/base/partners' },
      { label: '품목관리', path: '/base/items' },
      { label: 'BOM관리', path: '/base/bom' },
      { label: '표준공정관리', path: '/base/processes' },
      { label: '제품별표준공정(라우팅)', path: '/base/item-processes' },
      { label: '도면관리', path: '/base/drawings' },
      { label: '표준재질관리', path: '/base/materials' },
      { label: '휴일관리', path: '/base/holidays' },
      { label: '공구 기초정보', path: '/base/tools' },
      { label: '설비관리', path: '/base/equipments' },
    ],
  },
  {
    id: 'sales', label: '영업관리', icon: 'cart', children: [
      { label: '수주관리', path: '/sales/orders' },
      { label: '수주현황', path: '/sales/order-status' },
      { label: '출하지시', path: '/sales/shipping-orders' },
      { label: '출하(납품)관리', path: '/sales/deliveries' },
      { label: '출하현황', path: '/sales/delivery-status' },
    ],
  },
  {
    id: 'purchase', label: '구매/자재관리', icon: 'box', children: [
      { label: '자재발주', path: '/purchase/orders' },
      { label: '자재입고관리', path: '/material/inbounds' },
      { label: '자재반출관리', path: '/material/outbounds' },
      { label: '자재현황(재고)', path: '/material/stocks' },
      { label: '외주발주', path: '/purchase/subcon-orders' },
      { label: '외주입고', path: '/purchase/subcon-inbounds' },
    ],
  },
  {
    id: 'production', label: '생산관리', icon: 'factory', children: [
      { label: '생산계획관리', path: '/production/plans' },
      { label: '작업지시관리', path: '/production/work-orders' },
      { label: '생산실적', path: '/production/results' },
      { label: '생산일보', path: '/production/daily' },
      { label: '생산현황판', path: '/production/board' },
    ],
  },
  {
    id: 'tool', label: '공구 및 툴관리', icon: 'tool', children: [
      { label: '기준정보등록', path: '/tool/master' },
      { label: '입고관리', path: '/tool/inbounds' },
      { label: '재고관리', path: '/tool/stocks' },
      { label: '출고·회수관리', path: '/tool/issues' },
      { label: '재고조정', path: '/tool/adjustments' },
      { label: '폐기관리', path: '/tool/disposals' },
      { label: '치수검증', path: '/tool/verifications' },
    ],
  },
  {
    id: 'quality', label: '검사관리', icon: 'shield', children: [
      { label: '검사규격관리', path: '/quality/standards' },
      { label: '수입검사관리', path: '/quality/incoming' },
      { label: '수입검사현황', path: '/quality/incoming-status' },
      { label: '공정검사관리', path: '/quality/process' },
      { label: '출하검사관리', path: '/quality/shipping' },
      { label: '출하검사현황', path: '/quality/shipping-status' },
    ],
  },
  {
    id: 'ncr', label: '부적합관리', icon: 'alert', children: [
      { label: '부적합관리', path: '/quality/nonconformance' },
      { label: '부적합현황', path: '/quality/ncr-status' },
      { label: '개선대책관리', path: '/quality/improvements' },
    ],
  },
  {
    id: 'dev', label: '개발관리', icon: 'clipboard', children: [
      { label: 'PFMEA', path: '/dev/pfmea' },
      { label: 'PFD (공정흐름도)', path: '/dev/pfd' },
      { label: '관리계획서', path: '/dev/control-plan' },
      { label: '작업표준서', path: '/dev/work-standard' },
    ],
  },
  {
    id: 'change', label: '변경관리', icon: 'refresh', children: [
      { label: '4M 관리', path: '/change/four-m' },
      { label: 'PPAP 승인관리', path: '/change/ppap' },
    ],
  },
  {
    id: 'measure', label: '계측기관리', icon: 'target', children: [
      { label: '계측기 관리', path: '/measure/instruments' },
      { label: '검교정 관리', path: '/measure/calibrations' },
      { label: '계측기현황', path: '/measure/status' },
      { label: 'R&R 관리대장', path: '/measure/rr-register' },
      { label: 'R&R 평가계획', path: '/measure/rr-plan' },
      { label: 'R&R 평가등록', path: '/measure/gauge-rr' },
      { label: 'R&R 실시현황', path: '/measure/rr-status' },
    ],
  },
  {
    id: 'weld', label: '용접기술관리', icon: 'zap', children: [
      { label: '용접절차 시방서(WPS)', path: '/weld/wps' },
      { label: '인정기록서(PQR)', path: '/weld/pqr' },
      { label: '용접사 관리', path: '/weld/welders' },
    ],
  },
  {
    id: 'qcost', label: 'Q-Cost관리', icon: 'dollar', children: [
      { label: '기준정보관리', path: '/qcost/items' },
      { label: '세부항목관리', path: '/qcost/details' },
      { label: 'Q-Cost 관리', path: '/qcost/records' },
      { label: 'Q-Cost 현황', path: '/qcost/status' },
    ],
  },
  {
    id: 'cms', label: '설비관리(CMS)', icon: 'cpu', children: [
      { label: '설비모니터링', path: '/cms/monitor' },
      { label: '설비 수리이력', path: '/cms/histories' },
      { label: '비가동사유 관리', path: '/cms/downtime-codes' },
      { label: '비가동 실적', path: '/cms/downtimes' },
      { label: '설비점검', path: '/cms/checks' },
    ],
  },
  {
    id: 'sq', label: 'SQ 리포트', icon: 'trendUp', children: [
      { label: 'SQ 지표 리포트', path: '/sq/report' },
      { label: 'LOT 추적', path: '/sq/lot-trace' },
    ],
  },
];

// 라우트 → { render, title, group }
export const ROUTES = {
  '/dashboard': { render: dashboard, title: '대시보드', group: '대시보드' },

  '/pop': { render: popList, title: '작업 POP', group: 'POP' },
  '/pop/detail': { render: popDetail, title: '작업 진행', group: 'POP' },

  '/base/users': { render: base.users, title: '사용자관리', group: '기준정보관리' },
  '/base/departments': { render: departmentManager, title: '부서관리', group: '기준정보관리' },
  '/base/codes': { render: base.commonCodes, title: '공통코드관리', group: '기준정보관리' },
  '/base/partners': { render: base.partners, title: '거래처관리', group: '기준정보관리' },
  '/base/items': { render: base.items, title: '품목관리', group: '기준정보관리' },
  '/base/bom': { render: bomManager, title: 'BOM관리', group: '기준정보관리' },
  '/base/processes': { render: processMaster, title: '표준공정관리', group: '기준정보관리' },
  '/base/item-processes': { render: itemRouting, title: '제품별표준공정(라우팅)', group: '기준정보관리' },
  '/base/drawings': { render: base.drawings, title: '도면관리', group: '기준정보관리' },
  '/base/materials': { render: base.stdMaterials, title: '표준재질관리', group: '기준정보관리' },
  '/base/holidays': { render: base.holidays, title: '휴일관리', group: '기준정보관리' },
  '/base/tools': { render: base.tools, title: '공구 기초정보', group: '기준정보관리' },
  '/base/equipments': { render: base.equipments, title: '설비관리', group: '기준정보관리' },

  '/sales/orders': { render: sales.salesOrders, title: '수주관리', group: '영업관리' },
  '/sales/order-status': { render: salesStatus, title: '수주현황', group: '영업관리' },
  '/sales/shipping-orders': { render: sales.shippingOrders, title: '출하지시', group: '영업관리' },
  '/sales/deliveries': { render: sales.deliveries, title: '출하(납품)관리', group: '영업관리' },
  '/sales/delivery-status': { render: deliveryStatus, title: '출하현황', group: '영업관리' },

  '/purchase/orders': { render: pur.purchaseOrders, title: '자재발주', group: '구매/자재관리' },
  '/material/inbounds': { render: mat.materialInbounds, title: '자재입고관리', group: '구매/자재관리' },
  '/material/outbounds': { render: mat.materialOutbounds, title: '자재반출관리', group: '구매/자재관리' },
  '/material/stocks': { render: mat.materialStocks, title: '자재현황(재고)', group: '구매/자재관리' },
  '/purchase/subcon-orders': { render: pur.subconOrders, title: '외주발주', group: '구매/자재관리' },
  '/purchase/subcon-inbounds': { render: pur.subconInbounds, title: '외주입고', group: '구매/자재관리' },

  '/production/plans': { render: prod.productionPlans, title: '생산계획관리', group: '생산관리' },
  '/production/work-orders': { render: prod.workOrders, title: '작업지시관리', group: '생산관리' },
  '/production/results': { render: prod.productionResults, title: '생산실적', group: '생산관리' },
  '/production/daily': { render: prod.dailyReport, title: '생산일보', group: '생산관리' },
  '/production/board': { render: prod.productionBoard, title: '생산현황판', group: '생산관리' },

  '/tool/master': { render: tool.toolMaster, title: '공구 기준정보등록', group: '공구 및 툴관리' },
  '/tool/inbounds': { render: tool.toolInbounds, title: '공구 입고관리', group: '공구 및 툴관리' },
  '/tool/stocks': { render: tool.toolStock, title: '공구 재고관리', group: '공구 및 툴관리' },
  '/tool/issues': { render: tool.toolIssue, title: '공구 출고·회수관리', group: '공구 및 툴관리' },
  '/tool/adjustments': { render: tool.toolAdjustments, title: '공구 재고조정', group: '공구 및 툴관리' },
  '/tool/disposals': { render: tool.toolDisposals, title: '공구 폐기관리', group: '공구 및 툴관리' },
  '/tool/verifications': { render: tool.toolVerifications, title: '공구 치수검증', group: '공구 및 툴관리' },

  '/quality/standards': { render: inspectionSpecs, title: '검사규격관리', group: '검사관리' },
  '/quality/incoming': { render: incomingInspection, title: '수입검사관리', group: '검사관리' },
  '/quality/incoming-status': { render: incomingStatus, title: '수입검사현황', group: '검사관리' },
  '/quality/process': { render: processInspection, title: '공정검사관리', group: '검사관리' },
  '/quality/shipping': { render: shippingInspection, title: '출하검사관리', group: '검사관리' },
  '/quality/shipping-status': { render: shippingStatus, title: '출하검사현황', group: '검사관리' },

  '/quality/nonconformance': { render: nonconformances, title: '부적합관리', group: '부적합관리' },
  '/quality/ncr-status': { render: ncrStatus, title: '부적합현황', group: '부적합관리' },
  '/quality/improvements': { render: improvementActions, title: '개선대책관리', group: '부적합관리' },

  '/dev/pfmea': { render: devDocs.pfmeaDocs, title: 'PFMEA', group: '개발관리' },
  '/dev/pfd': { render: devDocs.pfdDocs, title: 'PFD (공정흐름도)', group: '개발관리' },
  '/dev/control-plan': { render: devDocs.controlPlans, title: '관리계획서', group: '개발관리' },
  '/dev/work-standard': { render: devDocs.workStandards, title: '작업표준서', group: '개발관리' },

  '/change/four-m': { render: change.fourMChanges, title: '4M 관리', group: '변경관리' },
  '/change/ppap': { render: change.ppapApprovals, title: 'PPAP 승인관리', group: '변경관리' },

  '/measure/instruments': { render: measure.instruments, title: '계측기 관리', group: '계측기관리' },
  '/measure/calibrations': { render: measure.calibrations, title: '검교정 관리', group: '계측기관리' },
  '/measure/status': { render: measure.instrumentStatus, title: '계측기현황', group: '계측기관리' },
  '/measure/rr-register': { render: measure.grrRegisters, title: 'R&R 관리대장', group: '계측기관리' },
  '/measure/rr-plan': { render: measure.grrPlans, title: 'R&R 평가계획', group: '계측기관리' },
  '/measure/gauge-rr': { render: measure.gaugeRR, title: 'R&R 평가등록', group: '계측기관리' },
  '/measure/rr-status': { render: measure.grrStatus, title: 'R&R 실시현황', group: '계측기관리' },

  '/weld/wps': { render: weld.wpsDocs, title: '용접절차 시방서(WPS)', group: '용접기술관리' },
  '/weld/pqr': { render: weld.pqrDocs, title: '인정기록서(PQR)', group: '용접기술관리' },
  '/weld/welders': { render: weld.welders, title: '용접사 관리', group: '용접기술관리' },

  '/qcost/items': { render: qcost.qcostItems, title: 'Q-Cost 기준정보관리', group: 'Q-Cost관리' },
  '/qcost/details': { render: qcost.qcostDetails, title: 'Q-Cost 세부항목관리', group: 'Q-Cost관리' },
  '/qcost/records': { render: qcost.qcostRecords, title: 'Q-Cost 관리', group: 'Q-Cost관리' },
  '/qcost/status': { render: qcost.qcostStatus, title: 'Q-Cost 현황', group: 'Q-Cost관리' },

  '/cms/monitor': { render: cms.equipmentMonitor, title: '설비모니터링', group: '설비관리(CMS)' },
  '/cms/histories': { render: cms.equipmentHistories, title: '설비 수리이력', group: '설비관리(CMS)' },
  '/cms/downtime-codes': { render: cms.downtimeCodes, title: '비가동사유 관리', group: '설비관리(CMS)' },
  '/cms/downtimes': { render: cms.equipmentDowntimes, title: '비가동 실적', group: '설비관리(CMS)' },
  '/cms/checks': { render: cms.equipmentChecks, title: '설비점검', group: '설비관리(CMS)' },

  '/sq/report': { render: sqReport, title: 'SQ 지표 리포트', group: 'SQ 리포트' },
  '/sq/lot-trace': { render: lotTrace, title: 'LOT 추적', group: 'SQ 리포트' },
};

// 화면설계서 (메뉴 외 — 상단 버튼으로 진입)
ROUTES['/spec'] = { render: designSpecHome, title: '화면설계서', group: '화면설계서' };
ROUTES['/spec/view'] = { render: designSpecDetail, title: '화면설계서 상세', group: '화면설계서' };

export const DEFAULT_ROUTE = '/dashboard';
