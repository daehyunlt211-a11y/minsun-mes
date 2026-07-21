// 메뉴 구조 + 라우트 → 페이지 매핑 (민선 MES·QMS)
import { dashboard } from './pages/dashboard.js';
import * as base from './pages/base.js';
import * as sales from './pages/sales.js';
import * as prod from './pages/production.js';
import * as mat from './pages/material.js';
import * as pur from './pages/purchase.js';
import * as tool from './pages/tool.js';
import * as qa from './pages/quality.js';
import * as qms from './pages/qms.js';
import * as cms from './pages/cms.js';
import { sqReport, lotTrace } from './pages/kpi.js';
import { popList, popDetail } from './pages/pop.js';
import { itemRouting } from './pages/routing.js';
import { processMaster } from './pages/processMaster.js';
import { incomingInspection, shippingInspection } from './pages/inspection.js';
import { departmentManager } from './pages/department.js';
import { inspectionStandards } from './pages/inspectionStandard.js';
import { ncrStatus } from './pages/ncrStatus.js';
import { bomManager } from './pages/bom.js';
import { toolStock } from './pages/toolStock.js';
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
    id: 'tool', label: '공구관리', icon: 'tool', children: [
      { label: '재고관리', path: '/tool/stocks' },
      { label: '입·출고·회수관리', path: '/tool/movements' },
      { label: '폐기관리', path: '/tool/disposals' },
      { label: '치수검증', path: '/tool/verifications' },
    ],
  },
  {
    id: 'quality', label: '품질관리', icon: 'shield', children: [
      { label: '검사규격관리', path: '/quality/standards' },
      { label: '수입검사', path: '/quality/incoming' },
      { label: '수입검사현황', path: '/quality/incoming-status' },
      { label: '공정검사', path: '/quality/process' },
      { label: '출하검사', path: '/quality/shipping' },
      { label: '출하검사현황', path: '/quality/shipping-status' },
      { label: '부적합관리', path: '/quality/nonconformance' },
      { label: '부적합현황', path: '/quality/ncr-status' },
      { label: '개선대책관리', path: '/quality/improvements' },
    ],
  },
  {
    id: 'dev', label: '변경/개발관리', icon: 'clipboard', children: [
      { label: '4M 변경관리', path: '/dev/four-m' },
      { label: 'PPAP 승인관리', path: '/dev/ppap' },
      { label: '개발문서(PFMEA·PFD 등)', path: '/dev/docs' },
    ],
  },
  {
    id: 'measure', label: '계측기관리', icon: 'target', children: [
      { label: '계측기관리', path: '/measure/instruments' },
      { label: '검교정 이력', path: '/measure/calibrations' },
      { label: 'Gauge R&R', path: '/measure/gauge-rr' },
    ],
  },
  {
    id: 'weld', label: '용접기술관리', icon: 'zap', children: [
      { label: 'WPS 관리', path: '/weld/wps' },
      { label: 'PQR 관리', path: '/weld/pqr' },
      { label: '용접사 관리', path: '/weld/welders' },
    ],
  },
  {
    id: 'qcost', label: 'Q-Cost관리', icon: 'dollar', children: [
      { label: 'Q-Cost 기준항목', path: '/qcost/items' },
      { label: 'Q-Cost 등록/현황', path: '/qcost/records' },
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

  '/tool/stocks': { render: toolStock, title: '공구 재고관리', group: '공구관리' },
  '/tool/movements': { render: tool.toolMovements, title: '공구 입·출고·회수', group: '공구관리' },
  '/tool/disposals': { render: tool.toolDisposals, title: '공구 폐기관리', group: '공구관리' },
  '/tool/verifications': { render: tool.toolVerifications, title: '공구 치수검증', group: '공구관리' },

  '/quality/standards': { render: inspectionStandards, title: '검사규격관리', group: '품질관리' },
  '/quality/incoming': { render: incomingInspection, title: '수입검사', group: '품질관리' },
  '/quality/incoming-status': { render: incomingStatus, title: '수입검사현황', group: '품질관리' },
  '/quality/process': { render: qms.processInspection, title: '공정검사', group: '품질관리' },
  '/quality/shipping': { render: shippingInspection, title: '출하검사', group: '품질관리' },
  '/quality/shipping-status': { render: shippingStatus, title: '출하검사현황', group: '품질관리' },
  '/quality/nonconformance': { render: qa.nonconformances, title: '부적합관리', group: '품질관리' },
  '/quality/ncr-status': { render: ncrStatus, title: '부적합현황', group: '품질관리' },
  '/quality/improvements': { render: qms.improvementActions, title: '개선대책관리', group: '품질관리' },

  '/dev/four-m': { render: qms.fourMChanges, title: '4M 변경관리', group: '변경/개발관리' },
  '/dev/ppap': { render: qms.ppapApprovals, title: 'PPAP 승인관리', group: '변경/개발관리' },
  '/dev/docs': { render: qms.devDocs, title: '개발문서관리', group: '변경/개발관리' },

  '/measure/instruments': { render: qms.instruments, title: '계측기관리', group: '계측기관리' },
  '/measure/calibrations': { render: qms.calibrations, title: '검교정 이력', group: '계측기관리' },
  '/measure/gauge-rr': { render: qms.gaugeRR, title: 'Gauge R&R', group: '계측기관리' },

  '/weld/wps': { render: qms.wpsDocs, title: 'WPS 관리', group: '용접기술관리' },
  '/weld/pqr': { render: qms.pqrDocs, title: 'PQR 관리', group: '용접기술관리' },
  '/weld/welders': { render: qms.welders, title: '용접사 관리', group: '용접기술관리' },

  '/qcost/items': { render: qms.qcostItems, title: 'Q-Cost 기준항목', group: 'Q-Cost관리' },
  '/qcost/records': { render: qms.qcostRecords, title: 'Q-Cost 등록/현황', group: 'Q-Cost관리' },

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
