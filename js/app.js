// ─── 네비게이션 / 부팅 ──────────────────────────────────────────────────────
const PAGE_TITLES = {
  dashboard: '대시보드',
  'weather-consult': '날씨별 컨설팅',
  clinical: '계군 임상평가',
  rodent: '구서작업 컨설팅 평가',
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
  clinical: `<button class="btn btn-primary" onclick="openClinicalModal()">+ 계군 임상평가 입력</button>`,
  rodent: `<button class="btn btn-primary" onclick="openRodentModal()">+ 구서 평가 입력</button>`,
  medconsult: `<button class="btn btn-primary" onclick="openConsultLogModal()">+ 진료기록 추가</button>`,
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
  if (name === 'clinical') { populateClinicalFarmFilter(); renderClinicalAssessments(); }
  if (name === 'rodent') { populateRodentFarmFilter(); renderRodentAssessments(); }
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

// 선택지 목록을 바꾼 뒤에도 예전에 저장된 값이 사라지지 않게 한다.
// select에 없는 값을 .value로 넣으면 선택이 해제(selectedIndex = -1)되고, 그 상태로
// 저장하면 빈 문자열이 써져 기존 데이터가 조용히 지워진다. 그래서 편집 모달을 열 때
// 저장된 값이 목록에 없으면 "(기존 값)" 표시를 달아 임시 option으로 끼워 넣는다.
// 농장 선택 드롭다운은 농장주 이름순으로 정렬한다.
// STORE는 created_at 순이라 등록한 순서대로 나와서 농장이 늘어나면 찾기 어렵다.
// 한글 정렬을 DB collation에 맡기지 않고 localeCompare('ko')로 맞추며,
// 농장주가 같으면 농장명으로 한 번 더 정렬한다.
// 정렬본을 새 배열로 만드는 것이 중요하다 — STORE.farms를 제자리에서 뒤집으면
// 농장 관리 목록 등 다른 화면의 순서까지 딸려 바뀐다.
function farmsByOwner() {
  return [...load('farms')].sort((a, b) =>
    (a.owner || '').localeCompare(b.owner || '', 'ko') ||
    (a.name || '').localeCompare(b.name || '', 'ko')
  );
}

// 모달은 한 번 만들어진 DOM을 계속 재사용하므로, 먼저 지난번에 끼워 넣은 option을
// 걷어내야 다른 레코드를 열 때마다 찌꺼기가 쌓이지 않는다.
function ensureSelectOption(el, value) {
  if (!el) return;
  [...el.options].forEach(o => { if (o.dataset.legacyOption) o.remove(); });
  if (!value) return;
  if ([...el.options].some(o => o.value === value)) return;
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = value + ' (기존 값)';
  opt.dataset.legacyOption = '1';
  el.appendChild(opt);
}

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
