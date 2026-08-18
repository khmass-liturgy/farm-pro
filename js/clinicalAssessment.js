// ─── 닭 임상평가 (SCS + 확장 임상평가 종합평가표) ──────────────────────────
// 원본: 닭_임상평가_SCS_종합평가표.xlsx (SCS 기준 / 확장 임상평가 / 종합평가 지표 시트).
// 농장 방문 현장에서 개체를 보며 탭으로 빠르게 채점하고, 그 자리에서 판정을 확인한 뒤
// 농장주에게 건네줄 방문 컨설팅 리포트를 인쇄하는 것이 이 화면의 목적이다.
//
// 주의: SCS는 스트레스·불편 신호 선별 척도이고 확장표는 여러 해외 자료를 조합한 현장용
// 초안이다. DI의 40:60 가중치와 25/50/70 경계값은 검증된 질병진단 cut-off가 아니므로,
// 화면과 인쇄물 모두에 이 한계를 반드시 함께 표시한다.

// ─── 채점 항목 정의 ────────────────────────────────────────────────────────
// SCS 7개 신호. 각 항목은 0(정상) / 1(스트레스 표현) / null(미상).
const SCS_ITEMS = [
  { key: 'tail',    label: '꼬리 위치',   normal: '꼬리를 높이 듦',            stressed: '꼬리가 아래로 처짐' },
  { key: 'head',    label: '머리 위치',   normal: '머리를 높이 들고 목을 뻗음', stressed: '머리를 몸 안쪽으로 움츠림' },
  { key: 'eye',     label: '눈 감음',     normal: '눈을 또렷하게 뜸',          stressed: '부분적 또는 완전히 감음' },
  { key: 'beak',    label: '부리 개방',   normal: '호흡 시 부리를 닫음',        stressed: '부리를 벌리고 헐떡임' },
  { key: 'wing',    label: '날개 위치',   normal: '몸에 붙여 유지',            stressed: '날개가 축 처짐' },
  { key: 'leg',     label: '다리·자세',   normal: '똑바로 서고 정상 보행',      stressed: '다리를 굽히고 웅크리거나 앉음' },
  { key: 'feather', label: '깃털 충만도', normal: '매끄럽고 몸에 밀착',         stressed: '부풀거나 흐트러짐' },
];

// 확장 임상평가 13개 항목. levels[i]가 i점의 설명이며, 최대점수는 levels.length - 1.
// 점수 합계 최대 34점 (3+3+3+2+3+2+2+2+2+3+4+2+3).
const CLINICAL_ITEMS = [
  { key: 'activity', domain: '행동', label: '활동성·반응', source: 'University of Michigan',
    levels: ['정상적으로 움직이고 환경에 관심', '움직임·관심 감소', '자극 후 느리게 이동·반응 저하', '움직이지 않거나 의식 저하'] },
  { key: 'gait', domain: '행동', label: '보행·균형', source: 'University of Michigan',
    levels: ['정상 보행', '약한 절뚝거림·불안정', '뚜렷한 보행장애·먹이/물 접근 곤란', '서지 못함·우측반사 불가'] },
  { key: 'feeding', domain: '행동', label: '섭식·음수', source: 'University of Michigan',
    levels: ['정상 섭취', '섭취 감소', '장시간 섭취·음수 감소', '먹이·물 전혀 접근/섭취 불가'] },
  { key: 'social', domain: '행동', label: '무리와의 상호작용', source: 'University of Michigan',
    levels: ['정상적으로 함께 있음', '상호작용 감소·고립 경향', '무리에서 분리되어 있음'] },
  { key: 'posture', domain: '자세', label: '웅크림·앉음', source: 'SCS + University of Michigan',
    levels: ['곧게 서 있음', '간헐적 웅크림', '지속적 웅크림·땅에 앉음', '누워 있거나 자세 유지 불가'] },
  { key: 'eyes', domain: '외관', label: '눈 상태', source: 'SCS + University of Maryland',
    levels: ['맑고 활짝 뜸', '부분적으로 감음·침침함', '계속 감음·침몰/분비물 동반'] },
  { key: 'feathers', domain: '외관', label: '깃털 상태', source: 'SCS + University of Maryland',
    levels: ['깨끗하고 매끄러움', '약간 흐트러짐·광택 저하', '심하게 부풀고 더러움'] },
  { key: 'comb', domain: '외관', label: '벼슬·육수·점막', source: 'University of Maryland / USDA',
    levels: ['정상 색·형태', '창백·약간 변색', '청색/자주색·부종·심한 변색'] },
  { key: 'discharge', domain: '외관', label: '체액·분비물', source: 'University of Michigan',
    levels: ['없음', '경미한 콧물·눈물', '중등도/농성/혈성 분비물'] },
  { key: 'respiration', domain: '호흡기', label: '호흡 노력·소리', source: 'SCS + University of Maryland',
    levels: ['조용하고 정상 호흡', '약간 빠르거나 간헐적 이상음', '호흡곤란·기침·천명', '입 벌림·심한 호흡곤란'] },
  { key: 'footpad', domain: '병변', label: '발바닥 피부염', source: 'Virginia Tech',
    levels: ['병변 없음', '표재성 변색(<10%)', '표재성 변색(>10%)', '깊은 병변·궤양(<50%)', '깊은 병변·궤양(>50%)'] },
  { key: 'wounds', domain: '병변', label: '상처·부종·출혈', source: 'University of Michigan',
    levels: ['없음', '경미·국소', '광범위·출혈·기능장애'] },
  { key: 'bodyCondition', domain: '체형', label: '체중·근육상태(BCS 참고)', source: 'University of Michigan',
    levels: ['정상 체형', '약간 마름/과체중', '뚜렷한 근육감소·골격 돌출', '심한 쇠약·기립 곤란'] },
];

const SCS_MAX = SCS_ITEMS.length;                                              // 7
const CLINICAL_MAX = CLINICAL_ITEMS.reduce((s, it) => s + it.levels.length - 1, 0); // 34

// DI와 무관하게 즉시 확인이 필요한 개별 중증 신호 (종합평가 지표 시트의 "긴급 우선 신호").
const URGENT_RULES = [
  { key: 'respiration',   min: 3, label: '호흡곤란·입 벌림 심함' },
  { key: 'activity',      min: 3, label: '활동불능·의식저하' },
  { key: 'gait',          min: 3, label: '보행불능·기립불가' },
  { key: 'feeding',       min: 3, label: '섭식·음수 불가' },
];

// DI 구간별 판정. 원본 "판정 기준 및 권장 조치" 표를 그대로 옮겼다.
const GRADE_BANDS = [
  { min: 0,  max: 25,  grade: '저위험',      badge: 'badge-green',  summary: '현재 관찰상 뚜렷한 질병징후 적음',
    action: '일상 관찰·기록 유지', caution: '무증상 감염 가능성을 배제하지 않음' },
  { min: 25, max: 50,  grade: '주의·재평가', badge: 'badge-amber',  summary: '경미하거나 단일 영역 이상',
    action: '12–24시간 내 재평가; 환경·섭식 확인', caution: '더위·운송·취급 스트레스와 구분 필요' },
  { min: 50, max: 70,  grade: '질병징후 의심', badge: 'badge-red',  summary: '복수 임상징후 또는 높은 SCS',
    action: '격리 관찰·수의사 상담·무리 내 분포 확인', caution: '질병명 확정 아님' },
  { min: 70, max: 101, grade: '고위험',      badge: 'badge-red',    summary: '다수·중증 임상징후',
    action: '즉시 격리·수의사/방역기관 확인', caution: '신고대상 질병 여부는 기관 판단' },
];
const URGENT_GRADE = { grade: '긴급징후 우선', badge: 'badge-red', summary: '중증 개별 신호 존재',
  action: 'DI와 무관하게 즉시 확인·격리, 수의사/방역기관 연락', caution: '응급·복지 우선' };

// ─── 채점 ──────────────────────────────────────────────────────────────────
// SI = SCS ÷ 7 × 100 | CI = 임상증상 ÷ 34 × 100 | DI = SI×0.40 + CI×0.60
// 미상(null)은 0점으로 계산하되 개수를 따로 세어, 판정 신뢰도를 화면에 함께 알린다
// (원본 시트의 분모가 항상 7이므로 분모에서 빼지 않는다).
function scoreAssessment(scs, clinical) {
  let scsScore = 0, scsUnknown = 0;
  SCS_ITEMS.forEach(it => {
    const v = scs[it.key];
    if (v === 1) scsScore++;
    else if (v == null) scsUnknown++;
  });
  let clinicalScore = 0;
  CLINICAL_ITEMS.forEach(it => { clinicalScore += Number(clinical[it.key]) || 0; });

  const si = round1(scsScore / SCS_MAX * 100);
  const ci = round1(clinicalScore / CLINICAL_MAX * 100);
  const di = round1(si * 0.40 + ci * 0.60);

  const urgentFlags = URGENT_RULES
    .filter(r => (Number(clinical[r.key]) || 0) >= r.min)
    .map(r => r.label);

  const band = urgentFlags.length
    ? URGENT_GRADE
    : GRADE_BANDS.find(b => di >= b.min && di < b.max) || GRADE_BANDS[0];

  return { scsScore, scsUnknown, clinicalScore, si, ci, di, urgentFlags, band, grade: band.grade };
}

function round1(n) { return Math.round(n * 10) / 10; }

// 저장된 기록의 등급 표시용. 평가 시점의 grade 문자열로 배지 색을 되찾는다.
function gradeBadgeClass(grade) {
  if (grade === URGENT_GRADE.grade) return URGENT_GRADE.badge;
  const band = GRADE_BANDS.find(b => b.grade === grade);
  return band ? band.badge : 'badge-blue';
}

// SCS 원점수 해석 (SCS 기준 시트: 0–2 징후 적음 / 3 경계 / 4–7 스트레스 의심)
function scsInterpretation(score) {
  if (score >= 4) return '스트레스 의심';
  if (score === 3) return '경계';
  return '징후 적음';
}

// ─── 계군(입추배치) 연동 ───────────────────────────────────────────────────
// 농장을 고르면 그 농장에 등록된 계군을 불러오고, 계군을 고르면 계사동과 일령이
// 자동으로 채워진다. 현장에서 손으로 다시 적을 필요가 없게 하려는 것.

// 일령은 "오늘"이 아니라 "평가일" 기준으로 센다. 방문 후 나중에 입력하거나 날짜를
// 소급해 기록할 때, computeDayAge(오늘 기준)를 쓰면 실제 관찰 시점의 일령과 어긋난다.
function dayAgeOn(placementDate, onDate) {
  if (!placementDate || !onDate) return null;
  const start = new Date(placementDate + 'T00:00:00');
  const end = new Date(onDate + 'T00:00:00');
  return Math.floor((end - start) / 86400000) + 1;
}

function caBatchLabel(b) {
  const speciesKey = b.species === '육계' ? 'broiler' : b.species === '산란계' ? 'layer' : null;
  const breedName = speciesKey && b.breed ? (CONSULT_BREEDS[speciesKey]?.breeds[b.breed]?.name || b.breed) : '';
  const parts = [
    b.house || '동 미지정',
    `${b.placementDate} 입추`,
    [b.species, breedName].filter(Boolean).join(' '),
    b.status === 'completed' ? '완료' : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

// 사육중인 계군을 먼저, 그다음 완료된 계군(과거 기록 소급 입력용)을 보여준다.
function populateClinicalBatchSelect(farmId, selectedId) {
  const sel = document.getElementById('ca-batch');
  if (!sel) return;
  const batches = load('batches')
    .filter(b => b.farmId === farmId)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1) ||
                    b.placementDate.localeCompare(a.placementDate));
  if (!farmId) {
    sel.innerHTML = '<option value="">농장을 먼저 선택하세요</option>';
    return;
  }
  if (!batches.length) {
    sel.innerHTML = '<option value="">등록된 계군 없음 — 계사/일령 직접 입력</option>';
    return;
  }
  sel.innerHTML = '<option value="">계군 선택 (직접 입력하려면 비워두세요)</option>' +
    batches.map(b => `<option value="${b.id}"${b.id === selectedId ? ' selected' : ''}>${caBatchLabel(b)}</option>`).join('');
}

function onClinicalFarmChange() {
  const farmId = document.getElementById('ca-farm').value;
  populateClinicalBatchSelect(farmId, '');
  // 이전 농장에서 채워둔 계사/일령은 새 농장과 무관하므로 지운다.
  document.getElementById('ca-house').value = '';
  document.getElementById('ca-age').value = '';
  // 계군이 하나뿐이면 고민할 게 없으니 바로 선택해준다.
  const batches = load('batches').filter(b => b.farmId === farmId && b.status === 'active');
  if (batches.length === 1) {
    document.getElementById('ca-batch').value = batches[0].id;
    onClinicalBatchChange();
  } else {
    // 계군이 없거나 여러 개면, 농장에 적어둔 축사번호라도 힌트로 넣어준다.
    const farm = load('farms').find(f => f.id === farmId);
    if (farm?.barn_range) document.getElementById('ca-house').value = farm.barn_range;
  }
}

function onClinicalBatchChange() {
  const batchId = document.getElementById('ca-batch').value;
  const b = load('batches').find(x => x.id === batchId);
  if (!b) return;
  document.getElementById('ca-house').value = b.house || '';
  updateCaAgeFromBatch();
}

// 평가일이 바뀌면 일령도 다시 계산한다(같은 계군이라도 날짜가 다르면 일령이 다르다).
function updateCaAgeFromBatch() {
  const batchId = document.getElementById('ca-batch').value;
  const b = load('batches').find(x => x.id === batchId);
  if (!b) return;
  const age = dayAgeOn(b.placementDate, document.getElementById('ca-date').value);
  // 입추 전 날짜로 평가일을 잡으면 일령이 0 이하가 되는데, 그건 채워봐야 의미가 없다.
  document.getElementById('ca-age').value = age != null && age >= 1 ? age : '';
}

// ─── 입력 폼 ───────────────────────────────────────────────────────────────
// 현장에서 탭으로만 채점하도록, 모든 항목을 버튼 그리드로 그린다.
let caDraft = { scs: {}, clinical: {} };

function openClinicalModal(id) {
  editingId.clinicalAssessment = id || null;
  const rec = id ? load('clinicalAssessments').find(r => r.id === id) : null;

  caDraft = rec
    ? { scs: { ...rec.scs }, clinical: { ...rec.clinical } }
    : { scs: {}, clinical: {} };
  if (!rec) {
    // 새 평가는 전부 정상(0)에서 시작한다. 현장에서는 이상 있는 항목만 눌러 바꾸는 쪽이
    // 20개 항목을 하나씩 다 누르는 것보다 훨씬 빠르다.
    SCS_ITEMS.forEach(it => { caDraft.scs[it.key] = 0; });
    CLINICAL_ITEMS.forEach(it => { caDraft.clinical[it.key] = 0; });
  }

  document.getElementById('modal-clinical-title').textContent = id ? '계군 임상평가 편집' : '계군 임상평가 입력';
  populateFarmSelect('ca-farm', rec?.farmId || '');
  document.getElementById('ca-date').value = rec?.assessedAt || new Date().toISOString().slice(0, 10);
  populateClinicalBatchSelect(rec?.farmId || '', rec?.batchId || '');
  document.getElementById('ca-subject').value = rec?.subjectId || '';
  // 편집일 때는 저장된 값을 그대로 둔다. 계군에서 다시 계산해 덮어쓰면 그때 기록한
  // 계사/일령이 바뀌어버려, 과거 평가 기록이 사실과 달라진다.
  document.getElementById('ca-house').value = rec?.house || '';
  document.getElementById('ca-age').value = rec?.ageDays ?? '';
  document.getElementById('ca-temp').value = rec?.temperatureC ?? '';
  document.getElementById('ca-humidity').value = rec?.humidityPct ?? '';
  document.getElementById('ca-notes').value = rec?.notes || '';

  renderScsInputs();
  renderClinicalInputs();
  updateCaScorePanel();
  openModal('modal-clinical');
}

function renderScsInputs() {
  document.getElementById('ca-scs-wrap').innerHTML = SCS_ITEMS.map(it => {
    const v = caDraft.scs[it.key];
    return `<div class="ca-item">
      <div class="ca-item-label">${it.label}</div>
      <div class="ca-btn-row">
        <button type="button" class="ca-btn ${v === 0 ? 'on ok' : ''}" onclick="setScs('${it.key}',0)">
          <span class="ca-btn-score">정상</span><span class="ca-btn-desc">${it.normal}</span>
        </button>
        <button type="button" class="ca-btn ${v === 1 ? 'on bad' : ''}" onclick="setScs('${it.key}',1)">
          <span class="ca-btn-score">스트레스</span><span class="ca-btn-desc">${it.stressed}</span>
        </button>
        <button type="button" class="ca-btn narrow ${v == null ? 'on unknown' : ''}" onclick="setScs('${it.key}',null)">
          <span class="ca-btn-score">미상</span>
        </button>
      </div>
    </div>`;
  }).join('');
}

function renderClinicalInputs() {
  let lastDomain = '';
  document.getElementById('ca-clinical-wrap').innerHTML = CLINICAL_ITEMS.map(it => {
    const v = Number(caDraft.clinical[it.key]) || 0;
    const domainHeader = it.domain !== lastDomain ? `<div class="ca-domain">${it.domain}</div>` : '';
    lastDomain = it.domain;
    const buttons = it.levels.map((desc, score) => `
      <button type="button" class="ca-btn ${v === score ? 'on ' + (score === 0 ? 'ok' : score >= it.levels.length - 1 ? 'bad' : 'warn') : ''}"
        onclick="setClinical('${it.key}',${score})">
        <span class="ca-btn-score">${score}</span><span class="ca-btn-desc">${desc}</span>
      </button>`).join('');
    return `${domainHeader}<div class="ca-item">
      <div class="ca-item-label">${it.label} <span class="text-muted">(0–${it.levels.length - 1})</span></div>
      <div class="ca-btn-row">${buttons}</div>
    </div>`;
  }).join('');
}

function setScs(key, value) {
  caDraft.scs[key] = value;
  renderScsInputs();
  updateCaScorePanel();
}

function setClinical(key, value) {
  caDraft.clinical[key] = value;
  renderClinicalInputs();
  updateCaScorePanel();
}

// 입력할 때마다 판정을 즉시 보여준다 — 농장주 앞에서 근거를 설명하기 위한 화면이다.
function updateCaScorePanel() {
  const s = scoreAssessment(caDraft.scs, caDraft.clinical);
  const urgentHtml = s.urgentFlags.length
    ? `<div class="ca-urgent">🚨 긴급징후: ${s.urgentFlags.join(' · ')}<br>
        <span class="text-muted">DI 점수와 무관하게 즉시 확인·격리하고 수의사/방역기관에 연락하세요.</span></div>`
    : '';
  const unknownHtml = s.scsUnknown
    ? `<div class="text-muted mt-8">※ SCS 미상 ${s.scsUnknown}개 — 미상은 0점으로 계산되므로 실제보다 낮게 나올 수 있습니다.</div>`
    : '';
  document.getElementById('ca-score-panel').innerHTML = `
    <div class="ca-score-grid">
      <div><div class="ca-score-label">SCS</div><div class="ca-score-value">${s.scsScore}<span>/${SCS_MAX}</span></div><div class="ca-score-sub">${scsInterpretation(s.scsScore)}</div></div>
      <div><div class="ca-score-label">임상증상</div><div class="ca-score-value">${s.clinicalScore}<span>/${CLINICAL_MAX}</span></div><div class="ca-score-sub">CI ${s.ci}</div></div>
      <div><div class="ca-score-label">스트레스지수 SI</div><div class="ca-score-value">${s.si}</div><div class="ca-score-sub">SCS÷7×100</div></div>
      <div class="ca-score-di"><div class="ca-score-label">종합 질병징후 DI</div><div class="ca-score-value">${s.di}</div><div class="ca-score-sub">SI×40% + CI×60%</div></div>
      <div><div class="ca-score-label">판정</div><div class="mt-8"><span class="badge ${s.band.badge}" style="font-size:13px;padding:5px 12px">${s.grade}</span></div><div class="ca-score-sub">${s.band.action}</div></div>
    </div>
    ${urgentHtml}${unknownHtml}`;
}

async function saveClinicalAssessment() {
  const farmId = document.getElementById('ca-farm').value;
  const assessedAt = document.getElementById('ca-date').value;
  if (!farmId || !assessedAt) { alert('농장과 평가일은 필수입니다.'); return; }
  const farm = load('farms').find(f => f.id === farmId);
  const s = scoreAssessment(caDraft.scs, caDraft.clinical);
  const data = {
    assessedAt, farmId, farmName: farm.name,
    batchId: document.getElementById('ca-batch').value || null,
    subjectId: document.getElementById('ca-subject').value.trim(),
    house: document.getElementById('ca-house').value.trim(),
    ageDays: document.getElementById('ca-age').value,
    temperatureC: document.getElementById('ca-temp').value,
    humidityPct: document.getElementById('ca-humidity').value,
    scs: caDraft.scs, clinical: caDraft.clinical,
    scsScore: s.scsScore, scsUnknown: s.scsUnknown, clinicalScore: s.clinicalScore,
    si: s.si, ci: s.ci, di: s.di, grade: s.grade, urgentFlags: s.urgentFlags,
    notes: document.getElementById('ca-notes').value.trim(),
    assessedByEmail: await currentUserEmail(),
  };
  try {
    if (editingId.clinicalAssessment) await updateRow('clinicalAssessments', editingId.clinicalAssessment, data);
    else await insertRow('clinicalAssessments', data);
  } catch (e) { alert('저장 실패: ' + e.message); return; }
  const isNew = !editingId.clinicalAssessment;
  closeModal('modal-clinical');
  populateClinicalFarmFilter();
  renderClinicalAssessments();
  // 같은 계사에서 여러 마리를 연달아 보는 흐름이라, 저장 직후 바로 다음 개체를 열어준다.
  // 농장·계군·계사·일령·온습도는 같은 방문 안에서 그대로이므로 전부 이어받고,
  // 개체 ID와 점수만 새로 입력하면 되게 한다.
  if (isNew && confirm(`저장했습니다. ${farm.name}에서 다른 개체를 이어서 평가하시겠습니까?`)) {
    openClinicalModal();
    document.getElementById('ca-farm').value = farmId;
    document.getElementById('ca-date').value = assessedAt;
    populateClinicalBatchSelect(farmId, data.batchId || '');
    document.getElementById('ca-house').value = data.house;
    document.getElementById('ca-age').value = data.ageDays;
    document.getElementById('ca-temp').value = data.temperatureC;
    document.getElementById('ca-humidity').value = data.humidityPct;
  }
}

async function deleteClinicalAssessment(id) {
  if (!confirm('이 계군 임상평가 기록을 삭제하시겠습니까?')) return;
  try { await deleteRow('clinicalAssessments', id); } catch (e) { alert('삭제 실패: ' + e.message); return; }
  renderClinicalAssessments();
}

// ─── 목록 ──────────────────────────────────────────────────────────────────
function populateClinicalFarmFilter() {
  const sel = document.getElementById('ca-filter-farm');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">전체 농장</option>' + farmsByOwner().map(f =>
    `<option value="${f.id}"${f.id === cur ? ' selected' : ''}>${f.name} (${f.owner})</option>`
  ).join('');
}

function renderClinicalAssessments() {
  const q = (document.getElementById('ca-search')?.value || '').toLowerCase();
  const ff = document.getElementById('ca-filter-farm')?.value || '';
  const list = load('clinicalAssessments').filter(r =>
    (!q || (r.farmName || '').toLowerCase().includes(q) || (r.subjectId || '').toLowerCase().includes(q)) &&
    (!ff || r.farmId === ff)
  );
  const tbody = document.getElementById('ca-tbody');
  const empty = document.getElementById('ca-empty');
  if (!list.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  tbody.innerHTML = list.map(r => `
    <tr>
      <td>${r.assessedAt}</td>
      <td><strong>${r.farmName}</strong></td>
      <td>${r.subjectId || '-'}${r.house ? ` <span class="text-muted">(${r.house})</span>` : ''}</td>
      <td>${r.ageDays != null ? r.ageDays + '일령' : '-'}</td>
      <td>${r.scsScore}/${SCS_MAX}</td>
      <td>${r.clinicalScore}/${CLINICAL_MAX}</td>
      <td><strong>${r.di}</strong></td>
      <td><span class="badge ${gradeBadgeClass(r.grade)}">${r.grade}</span>${r.urgentFlags?.length ? ' 🚨' : ''}</td>
      <td><div class="flex-gap">
        <button class="btn btn-primary btn-sm" onclick="printVisitReport('${r.farmId}','${r.assessedAt}')" title="이 농장·이 날짜의 모든 평가를 리포트로 인쇄">🖨️ 리포트</button>
        <button class="btn btn-outline btn-sm" onclick="openClinicalModal('${r.id}')">편집</button>
        <button class="btn btn-danger btn-sm" onclick="deleteClinicalAssessment('${r.id}')">삭제</button>
      </div></td>
    </tr>`).join('');
}

// ─── 방문 컨설팅 리포트 인쇄 ───────────────────────────────────────────────
// 농장주에게 그 자리에서 건네주는 결과물. 한 농장·한 날짜에 평가한 개체를 모두 모아
// 무리 전체의 분포를 보여주고, 이상 소견과 권장 조치를 정리한다.
function printVisitReport(farmId, assessedAt) {
  const records = load('clinicalAssessments')
    .filter(r => r.farmId === farmId && r.assessedAt === assessedAt)
    .sort((a, b) => b.di - a.di);
  if (!records.length) { alert('해당 방문의 평가 기록을 찾을 수 없습니다.'); return; }

  const farm = load('farms').find(f => f.id === farmId);
  const farmName = records[0].farmName;
  const n = records.length;
  const avgDi = round1(records.reduce((s, r) => s + r.di, 0) / n);
  const maxDi = Math.max(...records.map(r => r.di));
  const urgentRecords = records.filter(r => r.urgentFlags?.length);
  const worstBand = urgentRecords.length
    ? URGENT_GRADE
    : GRADE_BANDS.find(b => maxDi >= b.min && maxDi < b.max) || GRADE_BANDS[0];

  // 등급별 마릿수 분포 — 무리 전체 상태를 한 줄로 보여준다.
  const gradeCounts = {};
  records.forEach(r => { gradeCounts[r.grade] = (gradeCounts[r.grade] || 0) + 1; });
  const distributionRows = Object.entries(gradeCounts)
    .map(([g, c]) => `<tr><td>${g}</td><td style="text-align:center">${c}수</td><td style="text-align:center">${Math.round(c / n * 100)}%</td></tr>`)
    .join('');

  // 이상 소견 집계 — 어떤 항목이 무리에서 반복되는지가 컨설팅의 핵심 근거다.
  // 같은 항목은 심각도가 달라도 한 줄로 묶고(3마리가 각각 1·2·3점이면 "3수"),
  // 그중 가장 나쁜 소견을 대표로 보여준다. 항목별로 줄을 쪼개면 농장주가 읽기 어렵다.
  const findingMap = new Map(); // label -> { count, worst, worstDesc }
  const addFinding = (label, severity, desc) => {
    const cur = findingMap.get(label);
    if (!cur) findingMap.set(label, { count: 1, worst: severity, worstDesc: desc });
    else {
      cur.count++;
      if (severity > cur.worst) { cur.worst = severity; cur.worstDesc = desc; }
    }
  };
  records.forEach(r => {
    SCS_ITEMS.forEach(it => {
      if (r.scs[it.key] === 1) addFinding('SCS · ' + it.label, 1, it.stressed);
    });
    CLINICAL_ITEMS.forEach(it => {
      const v = Number(r.clinical[it.key]) || 0;
      if (v > 0) addFinding(`${it.domain} · ${it.label}`, v, `${v}점: ${it.levels[v]}`);
    });
  });
  const findings = [...findingMap.entries()].sort((a, b) => b[1].count - a[1].count || b[1].worst - a[1].worst);
  const findingRows = findings.length
    ? findings.map(([label, f]) => `<tr>
        <td><strong>${label}</strong><br><span style="color:#666">최고 소견: ${f.worstDesc}</span></td>
        <td style="text-align:center">${f.count} / ${n}수</td>
        <td style="text-align:center">${Math.round(f.count / n * 100)}%</td>
      </tr>`).join('')
    : '<tr><td colspan="3" style="text-align:center;color:#999;padding:10pt">기록된 이상 소견이 없습니다.</td></tr>';

  const individualRows = records.map(r => `<tr>
    <td>${r.subjectId || '-'}</td>
    <td>${r.house || '-'}</td>
    <td style="text-align:center">${r.ageDays != null ? r.ageDays : '-'}</td>
    <td style="text-align:center">${r.scsScore}/${SCS_MAX}</td>
    <td style="text-align:center">${r.clinicalScore}/${CLINICAL_MAX}</td>
    <td style="text-align:center"><strong>${r.di}</strong></td>
    <td>${r.grade}${r.urgentFlags?.length ? ' 🚨' : ''}</td>
    <td>${r.notes || ''}</td>
  </tr>`).join('');

  const urgentBlock = urgentRecords.length ? `
    <div class="print-focus" style="border-color:#c0392b;background:#fdecea !important;color:#8c231a">
      <strong>🚨 즉시 확인이 필요한 개체 ${urgentRecords.length}수</strong><br>
      ${urgentRecords.map(r => `${r.subjectId || '개체'}: ${r.urgentFlags.join(' · ')}`).join('<br>')}
      <br>종합점수와 무관하게 즉시 격리하고 수의사 또는 방역기관에 연락하시기 바랍니다.
    </div>` : '';

  // 온습도는 방문 중 여러 계사를 돌면 값이 달라지므로 범위로 보여준다.
  // (Supabase numeric은 문자열로 올 수 있어 Number()로 맞춘 뒤 계산한다.)
  const range = (vals, unit) => {
    const ns = vals.map(Number).filter(v => !Number.isNaN(v));
    if (!ns.length) return '-';
    const lo = Math.min(...ns), hi = Math.max(...ns);
    return (lo === hi ? `${lo}` : `${lo}~${hi}`) + unit;
  };
  const tempLabel = range(records.map(r => r.temperatureC).filter(v => v != null), '℃');
  const humidityLabel = range(records.map(r => r.humidityPct).filter(v => v != null), '%');
  const envLabel = tempLabel === '-' && humidityLabel === '-' ? '-' : `${tempLabel} / ${humidityLabel}`;

  // 방문에서 본 계군이 하나면 어떤 계군인지 헤더에 밝혀준다.
  const batchIds = [...new Set(records.map(r => r.batchId).filter(Boolean))];
  const batch = batchIds.length === 1 ? load('batches').find(b => b.id === batchIds[0]) : null;
  const batchMeta = batch ? `<span>계군: ${caBatchLabel(batch)}</span>` : '';

  const html = `<div class="print-page">
    <div class="print-header">
      <h1>농장 계군 임상평가 컨설팅 리포트</h1>
      <div class="ph-meta">
        <span>농장: <strong>${farmName}</strong></span>
        <span>농장주: ${farm?.owner || '-'}</span>
        <span>평가일: ${assessedAt}</span>
        <span>평가 개체수: ${n}수</span>
        ${batchMeta}
      </div>
    </div>

    <div class="print-info-grid">
      <div class="print-info-cell"><div class="lbl">평균 종합지수 DI</div><div class="val">${avgDi}</div></div>
      <div class="print-info-cell"><div class="lbl">최고 DI</div><div class="val">${maxDi}</div></div>
      <div class="print-info-cell"><div class="lbl">종합 판정</div><div class="val">${worstBand.grade}</div></div>
      <div class="print-info-cell"><div class="lbl">관찰 기온 / 습도</div><div class="val">${envLabel}</div></div>
    </div>

    ${urgentBlock}

    <div class="print-focus">
      <strong>권장 조치</strong> — ${worstBand.action}<br>
      ${worstBand.summary}. ${worstBand.caution}.
    </div>

    <div class="print-section-title">1. 무리 내 판정 분포</div>
    <table class="print-table">
      <thead><tr><th style="width:50%">판정 등급</th><th>개체수</th><th>비율</th></tr></thead>
      <tbody>${distributionRows}</tbody>
    </table>

    <div class="print-section-title">2. 반복 관찰된 이상 소견 (빈도순)</div>
    <table class="print-table">
      <thead><tr><th style="width:60%">소견</th><th>발생</th><th>비율</th></tr></thead>
      <tbody>${findingRows}</tbody>
    </table>

    <div class="print-section-title">3. 개체별 평가 결과</div>
    <table class="print-table">
      <thead><tr>
        <th>개체 ID</th><th>계사</th><th>일령</th><th>SCS</th><th>임상</th><th>DI</th><th>판정</th><th>메모</th>
      </tr></thead>
      <tbody>${individualRows}</tbody>
    </table>

    <div class="print-bottom">
      <div class="print-box">
        <div class="print-box-title">판정 기준</div>
        <p>SI = SCS ÷ ${SCS_MAX} × 100
CI = 임상증상 ÷ ${CLINICAL_MAX} × 100
DI = SI × 40% + CI × 60%

0–24.9 저위험 · 25–49.9 주의·재평가
50–69.9 질병징후 의심 · 70–100 고위험
긴급징후는 DI보다 우선 적용</p>
      </div>
      <div class="print-box">
        <div class="print-box-title">확인 및 서명</div>
        <p>평가자: ${records[0].assessedByEmail || ''}
출력일: ${new Date().toLocaleDateString('ko-KR')}

농장주 확인 ______________________</p>
      </div>
    </div>

    <div class="print-focus" style="margin-top:6pt;font-size:7pt">
      <strong>한계 및 주의</strong> — SCS(Stressed Chicken Scale)는 스트레스·불편 신호를 보는 선별 척도이고, 확장 임상평가표는
      University of Michigan, University of Maryland Extension, Virginia Tech Extension 등의 자료를 조합한 현장 기록용 초안입니다.
      DI의 40:60 가중치와 25/50/70 경계값은 검증된 질병진단 cut-off가 아니며, 이 리포트는 질병 진단이나 치료·살처분 판단을 대체하지 않습니다.
      고병원성 조류인플루엔자 등 신고대상 질병이 의심되면 즉시 방역기관에 확인하시기 바랍니다.
    </div>
  </div>`;

  document.getElementById('print-area').innerHTML = html;
  setTimeout(() => window.print(), 200);
}
