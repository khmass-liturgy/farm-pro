// ─── 네비게이션 / 부팅 ──────────────────────────────────────────────────────
const PAGE_TITLES = {
  dashboard: '대시보드',
  'pb-polcon': '농장동물 컨설팅',
  preshipment: '출하전검사',
  movepermit: '이동승인서 발급',
  henshipment: '산란성계 출하대장',
  'vet-entries': '입력대장',
  'vet-workreport': '근무상황보고서',
  'vet-invoice': '여비청구서/활동수당 청구서',
  'vet-patrol': '예찰내역',
  'vet-diary': '예찰일지',
  'vet-trip': '출장일지',
  'vet-daily': '일자별 근무내용',
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
  farms: `<button class="btn btn-outline" onclick="exportFarmsExcel()">📤 엑셀로 내보내기</button><button class="btn btn-primary" onclick="openFarmModal()">+ 농장 추가</button>`,
  programs: `<button class="btn btn-primary" onclick="openProgramModal()">+ 프로그램 추가</button>`,
  batches: `<button class="btn btn-primary" onclick="openBatchModal()">+ 입추 등록</button>`,
  clinical: `<button class="btn btn-primary" onclick="openClinicalModal()">+ 계군 임상평가 입력</button>`,
  rodent: `<button class="btn btn-primary" onclick="openRodentModal()">+ 구서 평가 입력</button>`,
  medconsult: `<button class="btn btn-primary" onclick="openConsultLogModal()">+ 진료기록 추가</button>`,
  prescriptions: `<button class="btn btn-primary" onclick="openRxPrescriptionModal()">+ 처방전 발급</button>`,
  preshipment: `<button class="btn btn-primary" onclick="openPreShipmentModal()">+ 출하전검사 작성</button>`,
  movepermit: `<button class="btn btn-primary" onclick="openMovePermitModal()">+ 이동승인서 발급</button>`,
  henshipment: `<button class="btn btn-primary" onclick="openHenShipmentModal()">+ 출하대장 작성</button>`,
  'vet-invoice': `<button class="btn btn-outline" onclick="openVetOfficeInfoModal()">⚙️ 사무실 정보</button>`,
  'vet-entries': `<button class="btn btn-outline" onclick="openVetOfficeInfoModal()">⚙️ 사무실 정보</button><button class="btn btn-primary" onclick="openVetEntryModal()">+ 방문 기록 추가</button>`,
  drugs: `<button class="btn btn-primary" onclick="openDrugModal()">+ 약품 추가</button>`,
  'rx-products': `<button class="btn btn-primary" onclick="openRxProductModal()">+ 제품 추가</button>`,
  vaccines: `<button class="btn btn-primary" onclick="openVaccineModal()">+ 백신 추가</button>`,
  feeds: `<button class="btn btn-primary" onclick="openFeedModal()">+ 사료첨가제 추가</button>`,
};

let currentPage = 'dashboard';

// ─── 사이드바 접기/펼치기 ────────────────────────────────────────────────
// 가금컨설팅·데이터·시스템은 매일 들어가는 곳이 아니라 기본으로 접어둔다.
// 펼침 상태는 브라우저에 남겨 다음 방문에도 그대로 유지한다.
const COLLAPSIBLE_SECTIONS = ['consult', 'vetreport', 'data', 'system'];
const SIDEBAR_STATE_KEY = 'sidebar_open_sections';

function loadOpenSections() {
  try {
    const s = localStorage.getItem(SIDEBAR_STATE_KEY);
    if (s) return new Set(JSON.parse(s));
  } catch (e) { /* 저장값이 깨졌으면 기본값(전부 접힘)으로 */ }
  return new Set();
}

function setSidebarSection(key, open) {
  const items = document.getElementById('sidebar-items-' + key);
  const chevron = document.getElementById('sidebar-chevron-' + key);
  if (!items) return;
  items.classList.toggle('open', open);
  chevron?.closest('button')?.setAttribute('aria-expanded', String(open));
}

function toggleSidebarSection(key) {
  const items = document.getElementById('sidebar-items-' + key);
  if (!items) return;
  const open = !items.classList.contains('open');
  setSidebarSection(key, open);
  const set = loadOpenSections();
  open ? set.add(key) : set.delete(key);
  try { localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify([...set])); } catch (e) { /* 저장 실패해도 동작엔 지장 없음 */ }
}

function initSidebarSections() {
  const open = loadOpenSections();
  COLLAPSIBLE_SECTIONS.forEach(k => setSidebarSection(k, open.has(k)));
}

// 접힌 묶음 안의 메뉴로 이동하면 그 묶음을 펼쳐 어디에 있는지 보이게 한다.
// (저장된 펼침 상태는 건드리지 않는다 — 사용자가 직접 접어둔 선택을 덮지 않기 위해.)
function revealSectionOfActiveItem(activeItem) {
  const items = activeItem?.closest('.sidebar-section-items');
  if (items && !items.classList.contains('open')) {
    const key = items.id.replace('sidebar-items-', '');
    setSidebarSection(key, true);
  }
}

// 좁은 화면에서는 메뉴 항목을 누르면 본문이 전체 화면을 덮는다(모바일 레이아웃,
// css/styles.css 참고). closeMobileNav()의 ✕ 버튼으로 다시 메뉴로 돌아간다.
function closeMobileNav() {
  document.body.classList.remove('mobile-nav-open');
}

function showPage(name) {
  currentPage = name;
  document.body.classList.add('mobile-nav-open');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
  // pb 메뉴는 page-pb(iframe)를 쓴다.
  document.getElementById(PB_TABS[name] ? 'page-pb' : 'page-' + name).classList.add('active');
  document.querySelectorAll('.sidebar-item').forEach(i => {
    if (i.getAttribute('onclick') && i.getAttribute('onclick').includes("'" + name + "'")) {
      i.classList.add('active');
      revealSectionOfActiveItem(i);
    }
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
  if (name === 'preshipment') { populatePsFarmFilter(); renderPreShipments(); }
  if (name === 'movepermit') { populateMpFarmFilter(); renderMovePermits(); }
  if (name === 'henshipment') { populateHsFarmFilter(); renderHenShipments(); }
  if (name === 'vet-entries') renderVetEntries();
  if (name === 'vet-workreport') renderVetWorkReportSummary();
  if (name === 'vet-invoice') renderVetInvoiceSummary();
  if (name === 'vet-patrol') renderVetPatrolSummary();
  if (name === 'vet-diary') renderVetDiaryList();
  if (name === 'vet-trip') renderVetTripSummary();
  if (name === 'vet-daily') renderVetDaily();
  if (name === 'schedule') populateScheduleSelects();
  if (name === 'reports') renderReports();
  if (name === 'drugs') renderDrugs();
  if (name === 'rx-products') renderRxProducts();
  if (name === 'vaccines') renderVaccines();
  if (name === 'feeds') renderFeeds();
  if (name === 'drugsearch') renderDsearch();
  if (PB_TABS[name]) showPbTab(PB_TABS[name]);
}

// ─── 농장동물 컨설팅 = polcon.cc 임베드 ─────────────────────────────────────
// 날씨·환기가이드·육계/산란계 컨설팅·양계질병·AI 발생예측통계는 polcon.cc(pb 저장소의 배포본)가
// 자기 탭으로 갖고 있다. 메뉴를 다섯으로 쪼개지 않고 사이드바 항목 하나로 사이트를 통째로 띄우며,
// 사이트 안의 탭 이동은 polcon.cc 화면에서 한다. 내용을 복사해 오지 않으므로 그쪽이 바뀌면
// 여기에도 바로 반영된다. 처음 들어갈 때만 불러온다(앱을 켤 때마다 미리 받지 않도록).
const PB_BASE_URL = 'https://polcon.cc/';
const PB_TABS = { 'pb-polcon': true };

function showPbTab() {
  const frame = document.getElementById('pb-frame');
  if (frame && !frame.getAttribute('src')) frame.src = PB_BASE_URL;
}

// 사이드바 "바로가기" — 이 앱과 별개로 배포된 대한가축약품 사이트로 나간다.
// showPage()를 거치지 않으므로 현재 화면·입력 중이던 내용이 그대로 남는다.
function openDaehanSite() {
  window.open('https://khmass-liturgy.github.io/daehan/', '_blank', 'noopener');
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
  initSidebarSections();
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
