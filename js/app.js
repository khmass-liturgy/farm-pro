// ─── 네비게이션 / 부팅 ──────────────────────────────────────────────────────
const PAGE_TITLES = {
  dashboard: '대시보드',
  'weather-consult': '날씨별 농장컨설팅',
  'weather-vent': '환기가이드',
  'weather-livestock': '육계/산란계 컨설팅',
  farms: '농장 등록/관리',
  programs: '투약 프로그램',
  batches: '입추(사육배치) 관리',
  'batch-detail': '입추 상세',
  medconsult: '투약상담 및 처방',
  prescriptions: '처방전 발급',
  schedule: '투약 일정',
  reports: '통계/리포트',
  drugsearch: '동물약품 검색',
  drugs: '약품 등록',
  'rx-products': '처방전용 제품',
  vaccines: '백신 관리',
  feeds: '사료첨가제 관리',
  backup: '백업 / 복원',
};
const PAGE_ACTIONS = {
  farms: `<button class="btn btn-primary" onclick="openFarmModal()">+ 농장 추가</button>`,
  programs: `<button class="btn btn-primary" onclick="openProgramModal()">+ 프로그램 추가</button>`,
  batches: `<button class="btn btn-primary" onclick="openBatchModal()">+ 입추 등록</button>`,
  medconsult: `<button class="btn btn-primary" onclick="openConsultLogModal()">+ 상담 기록 추가</button>`,
  prescriptions: `<button class="btn btn-primary" onclick="openRxPrescriptionModal()">+ 처방전 발급</button>`,
  drugs: `<button class="btn btn-primary" onclick="openDrugModal()">+ 약품 추가</button>`,
  'rx-products': `<button class="btn btn-primary" onclick="openRxProductModal()">+ 제품 추가</button>`,
  vaccines: `<button class="btn btn-primary" onclick="openVaccineModal()">+ 백신 추가</button>`,
  feeds: `<button class="btn btn-primary" onclick="openFeedModal()">+ 사료첨가제 추가</button>`,
};

let currentPage = 'dashboard';

function showPage(name) {
  currentPage = name;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelectorAll('.sidebar-item').forEach(i => {
    if (i.getAttribute('onclick') && i.getAttribute('onclick').includes("'" + name + "'")) i.classList.add('active');
  });
  document.getElementById('topbar-title').textContent = PAGE_TITLES[name] || name;
  document.getElementById('topbar-actions').innerHTML = PAGE_ACTIONS[name] || '';
  if (name === 'dashboard') renderDashboard();
  if (name === 'farms') renderFarms();
  if (name === 'programs') { populateFarmFilter(); renderPrograms(); }
  if (name === 'batches') renderBatches();
  if (name === 'batch-detail') renderBatchDetail();
  if (name === 'medconsult') populateConsultFilters();
  if (name === 'prescriptions') { populateRxFarmFilter(); renderPrescriptions(); }
  if (name === 'schedule') populateScheduleSelects();
  if (name === 'reports') renderReports();
  if (name === 'drugs') renderDrugs();
  if (name === 'rx-products') renderRxProducts();
  if (name === 'vaccines') renderVaccines();
  if (name === 'feeds') renderFeeds();
}

// ─── 모달 ───────────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ─── 새로고침 (동시 편집 대비 수동 재조회) ─────────────────────────────────
async function manualRefresh() {
  try { await refreshAllStores(); } catch (e) { alert('새로고침 실패: ' + e.message); return; }
  showPage(currentPage);
}

// ─── 부팅 ───────────────────────────────────────────────────────────────────
async function boot() {
  const session = await requireAuth();
  if (!session) return;
  watchAuthState();
  document.getElementById('sidebar-user-email').textContent = await currentUserEmail();
  try {
    await refreshAllStores();
  } catch (e) {
    alert('데이터를 불러오지 못했습니다. js/config.js의 Supabase 설정을 확인하세요.\n' + e.message);
    return;
  }
  showPage('dashboard');
}

boot();
