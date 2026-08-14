// ─── 농장 구서작업 컨설팅 평가 ─────────────────────────────────────────────
// 원본: 농장_구서작업_컨설팅_평가표.xlsx (구서 감사표 / 해결방안 매트릭스 / 실행계획 시트).
//
// 임상평가(SCS) 화면과 같은 흐름을 의도적으로 그대로 따른다 — 현장에서 항목을 탭으로
// 채점하면 그 자리에서 위험도·등급이 나오고, 농장주에게 건네줄 리포트를 인쇄한다.
// 다른 점은 채점 대상이 개체가 아니라 농장 시설·관리라서 방문당 1건만 기록한다는 것.
//
// 운영 원칙(원본 해결방안 매트릭스): 약제부터 투입하지 않는다.
// 배제(exclusion) → 위생·먹이관리 → 모니터링 → 포획·미끼 → 검증·재침입 방지 순서.

// ─── 감사 항목 20개 ────────────────────────────────────────────────────────
// weight: 중요도 1(일반) / 2(중요) — 가중위험점수 = 점수 × 중요도
// critical: 원본 Critical(Y/N). Y인 항목이 3점이면 위험도와 무관하게 "긴급 개선"이다.
const RODENT_AREAS = ['외부·환경', '건물 차단', '먹이·사료', '모니터링·방제', '바이오시큐리티'];

const RODENT_ITEMS = [
  { id: 'R-01', area: '외부·환경', check: '축사 외곽 1–2m 내 잡초·폐기물·목재가 정리되어 있는가?', evidence: '사진·현장 확인', weight: 1, critical: false, fix: '외곽 청소·잔재물 제거·정기 예초' },
  { id: 'R-02', area: '외부·환경', check: '굴·배설물·갉은 흔적이 확인되지 않는가?', evidence: '벽면·기초·배수로 흔적 확인', weight: 2, critical: true, fix: '활동지점 지도화·즉시 미끼함/트랩 보강' },
  { id: 'R-03', area: '외부·환경', check: '사료·계란·폐기물 주변에 설치류 유인원이 없는가?', evidence: '유출·쓰레기·사체 확인', weight: 2, critical: true, fix: '유출 즉시 제거·폐기물 밀폐·사료 잔량 관리' },
  { id: 'R-04', area: '외부·환경', check: '축사 주변 배수·배관·관통부가 침수·은신처를 만들지 않는가?', evidence: '배수로·배관 주변 확인', weight: 1, critical: false, fix: '배수 개선·은신처 제거·관통부 보수' },
  { id: 'R-05', area: '건물 차단', check: '벽·지붕·기초·문 하부에 6mm 이상 틈이 없는가?', evidence: '줄자·손전등·사진', weight: 2, critical: true, fix: '금속망·몰탈·도어씰로 영구 차단' },
  { id: 'R-06', area: '건물 차단', check: '환기구·배수구·케이블 관통부가 금속망으로 보호되는가?', evidence: '망·관통부 확인', weight: 2, critical: true, fix: '내식성 금속망 설치·손상부 교체' },
  { id: 'R-07', area: '건물 차단', check: '문이 바닥에 밀착되고 자동 닫힘·잠금이 되는가?', evidence: '문 닫힘·하부 틈 확인', weight: 1, critical: false, fix: '도어씰·문틀 보수·출입 습관 개선' },
  { id: 'R-08', area: '건물 차단', check: '사료창고·약품창고·알 보관실이 설치류 차단 상태인가?', evidence: '보관실 내부·외부 확인', weight: 2, critical: true, fix: '문틈 보수·선반 이격·밀폐 보관' },
  { id: 'R-09', area: '먹이·사료', check: '사료 유출을 매일 확인하고 즉시 청소하는가?', evidence: '일일기록·유출 흔적', weight: 2, critical: true, fix: '일일 spill check·급이기 누출 보수' },
  { id: 'R-10', area: '먹이·사료', check: '사료·곡물이 바닥이 아닌 밀폐 용기에 보관되는가?', evidence: '보관상태·뚜껑 확인', weight: 2, critical: true, fix: '밀폐 사일로·팔레트 이격·용기 교체' },
  { id: 'R-11', area: '먹이·사료', check: '물·습기·응축수가 설치류 서식처를 만들지 않는가?', evidence: '누수·응축·습기 확인', weight: 1, critical: false, fix: '누수 수리·환기·습기 제거' },
  { id: 'R-12', area: '모니터링·방제', check: '미끼함·트랩이 설치류 동선에 고정·표지되어 있는가?', evidence: '배치도·현장 대조', weight: 2, critical: true, fix: '동선 기반 재배치·잠금·ID 부여' },
  { id: 'R-13', area: '모니터링·방제', check: '미끼함을 정기 점검하고 소비량·활동 흔적을 기록하는가?', evidence: '점검일지·사진', weight: 2, critical: true, fix: '주간 점검·소비량·배설물·갉은 흔적 기록' },
  { id: 'R-14', area: '모니터링·방제', check: '트랩·미끼 관리가 가금·사람·비표적동물에 안전한가?', evidence: '잠금·고정·접근성 확인', weight: 2, critical: true, fix: '잠금형 station·트랩 보호커버·사체 회수' },
  { id: 'R-15', area: '모니터링·방제', check: '활동지수 추세를 보고 방제 강도를 조정하는가?', evidence: '주간 추세 그래프·회의록', weight: 1, critical: false, fix: '활동 증가 시 원인분석·재배치·구조보수' },
  { id: 'R-16', area: '바이오시큐리티', check: '설치류 사체·폐미끼를 안전하게 회수·처리하는가?', evidence: '처리기록·보호구 확인', weight: 2, critical: true, fix: '보호구·밀폐용기·법규에 맞는 폐기' },
  { id: 'R-17', area: '바이오시큐리티', check: '방문자·장비·사료 동선이 청결/오염 구역으로 관리되는가?', evidence: '동선표·교육기록', weight: 1, critical: false, fix: 'clean/dirty line·전용장화·장비 세척' },
  { id: 'R-18', area: '바이오시큐리티', check: '설치류 활동 증가·이상폐사 시 보고·격리 절차가 있는가?', evidence: 'SOP·모의훈련·기록', weight: 2, critical: true, fix: '경보·격리·수의사/방역기관 연락체계' },
  { id: 'R-19', area: '바이오시큐리티', check: '직원이 설치류 흔적과 오염 예방을 교육받았는가?', evidence: '교육자료·서명부', weight: 1, critical: false, fix: '신규·정기 교육·사진 기반 퀴즈' },
  { id: 'R-20', area: '바이오시큐리티', check: '월간 재감사와 시정조치 closure 검증이 이루어지는가?', evidence: '전월 감사·closure 증거', weight: 1, critical: false, fix: '월간 리뷰·미해결 항목 escalation' },
];

// 점수 정의 (원본 "점수 입력 규칙")
const RODENT_LEVELS = [
  { score: 0, label: '적합',      desc: '기준을 충족하며 개선 필요 없음' },
  { score: 1, label: '부분 개선', desc: '대체로 충족하나 보완할 부분 있음' },
  { score: 2, label: '부적합',    desc: '기준 미충족 — 실행계획 등록 대상' },
  { score: 3, label: '긴급',      desc: '중대 결함 — 즉시 조치 필요' },
];

const RODENT_MAX = RODENT_ITEMS.reduce((s, it) => s + 3 * it.weight, 0); // 최대 가중점수

// 감사 위험도 구간 (원본 "판정 기준": 0–29 양호 / 30–59 주의 / 60 이상 고위험)
const RODENT_BANDS = [
  { min: 0,  max: 30,  grade: '양호',   badge: 'badge-green', summary: '전반적으로 관리 기준을 충족',
    action: '현 수준 유지·월간 재감사와 기록 지속' },
  { min: 30, max: 60,  grade: '주의',   badge: 'badge-amber', summary: '일부 영역에 개선 필요 사항 존재',
    action: '부적합 항목을 실행계획에 등록하고 7일 내 조치' },
  { min: 60, max: 101, grade: '고위험', badge: 'badge-red',   summary: '다수 항목이 기준 미달',
    action: '외곽·구조·먹이원을 동시에 개선하고 30일 내 재감사' },
];
const RODENT_URGENT_BAND = { grade: '긴급 개선', badge: 'badge-red', summary: '중요항목에 중대 결함 존재',
  action: '위험도와 무관하게 24시간 내 조치하고 담당자·기한을 지정' };

// 영역별 컨설팅 해결방안 (원본 "해결방안 매트릭스" 시트)
const RODENT_ACTION_MATRIX = {
  '외부·환경':     { cause: '은신처·먹이원 풍부',        d1: '흔적 표시·폐기물 제거·유출 청소', d7: '식생·잔재물·배수 개선',        d30: '월간 외부 perimeter 감사',      kpi: '외곽 활동지수 감소',   role: '농장장/환경관리' },
  '건물 차단':     { cause: '침입 경로 미봉쇄',          d1: '임시 차단·취약구역 표시',        d7: '금속망·도어씰·몰탈 보수',       d30: '예방보수 목록·분기 점검',       kpi: '신규 침입구 0건',     role: '시설관리' },
  '먹이·사료':     { cause: '사료 접근성·보관 불량',      d1: '유출 즉시 제거·포대 격리',        d7: '밀폐·팔레트 이격·급이기 보수',   d30: '일일 spill check KPI',        kpi: '유출 기록 0 또는 감소', role: '사료관리' },
  '모니터링·방제': { cause: '동선과 배치 불일치',         d1: 'station 잠금·표지·재배치',       d7: '동선 기반 밀도 조정',           d30: '주간 활동지도·trend 회의',      kpi: '활동지수 지속 하락',   role: '구서담당' },
  '바이오시큐리티': { cause: '회수·동선·교육 미흡',        d1: '보호구·밀폐회수·보고',           d7: 'clean/dirty line·전용장비',     d30: '교육·모의훈련·월간 review',     kpi: '교육 이수 100%',      role: '방역/품질' },
};

// ─── 채점 ──────────────────────────────────────────────────────────────────
// 가중위험도(%) = Σ(점수 × 중요도) ÷ Σ(3 × 중요도) × 100
function scoreRodentAudit(scores) {
  let riskScore = 0;
  const areaScores = {};
  RODENT_AREAS.forEach(a => { areaScores[a] = { score: 0, max: 0, pct: 0 }; });

  RODENT_ITEMS.forEach(it => {
    const v = Number(scores[it.id]) || 0;
    const weighted = v * it.weight;
    riskScore += weighted;
    const a = areaScores[it.area];
    a.score += weighted;
    a.max += 3 * it.weight;
  });
  RODENT_AREAS.forEach(a => {
    const s = areaScores[a];
    s.pct = s.max ? round1(s.score / s.max * 100) : 0;
  });

  const riskPct = round1(riskScore / RODENT_MAX * 100);
  // 중요항목(Critical)이 3점이면 위험도 총점이 낮아도 긴급으로 본다.
  const criticalItems = RODENT_ITEMS.filter(it => it.critical && (Number(scores[it.id]) || 0) === 3);
  const band = criticalItems.length
    ? RODENT_URGENT_BAND
    : RODENT_BANDS.find(b => riskPct >= b.min && b.max > riskPct) || RODENT_BANDS[0];

  return { riskScore, maxScore: RODENT_MAX, riskPct, areaScores, criticalItems, band, grade: band.grade };
}

function rodentGradeBadge(grade) {
  if (grade === RODENT_URGENT_BAND.grade) return RODENT_URGENT_BAND.badge;
  return (RODENT_BANDS.find(b => b.grade === grade) || {}).badge || 'badge-blue';
}

// 실행계획 우선순위 — 원본은 "점수 2 이상이면 실행계획에 등록"이다.
// 그중에서도 중요항목의 중대 결함을 먼저 처리하도록 3단계로 나눈다.
function rodentPriority(item, score) {
  if (score === 3 && item.critical) return { key: 'P1', label: 'P1 · 24시간', due: '24시간 내', badge: 'badge-red' };
  if (score === 3 || (score === 2 && item.critical)) return { key: 'P2', label: 'P2 · 7일', due: '7일 내', badge: 'badge-amber' };
  return { key: 'P3', label: 'P3 · 30일', due: '30일 내', badge: 'badge-blue' };
}

// 점수 2 이상인 항목을 우선순위 순으로 — 화면과 리포트가 같은 목록을 쓴다.
function rodentFindings(scores) {
  const order = { P1: 0, P2: 1, P3: 2 };
  return RODENT_ITEMS
    .map(it => ({ item: it, score: Number(scores[it.id]) || 0 }))
    .filter(r => r.score >= 2)
    .map(r => ({ ...r, priority: rodentPriority(r.item, r.score) }))
    .sort((a, b) => order[a.priority.key] - order[b.priority.key] || a.item.id.localeCompare(b.item.id));
}

// ─── 입력 폼 ───────────────────────────────────────────────────────────────
let rcDraft = { scores: {}, evidence: {} };

function openRodentModal(id) {
  editingId.rodentAssessment = id || null;
  const rec = id ? load('rodentAssessments').find(r => r.id === id) : null;

  rcDraft = rec
    ? { scores: { ...rec.scores }, evidence: { ...rec.evidence } }
    : { scores: {}, evidence: {} };
  if (!rec) {
    // 임상평가와 같은 이유로 전부 적합(0)에서 시작한다. 20개를 다 누르는 것보다
    // 문제 있는 항목만 눌러 올리는 쪽이 현장에서 훨씬 빠르다.
    RODENT_ITEMS.forEach(it => { rcDraft.scores[it.id] = 0; });
  }

  document.getElementById('modal-rodent-title').textContent = id ? '구서 컨설팅 평가 편집' : '구서 컨설팅 평가 입력';
  populateFarmSelect('rc-farm', rec?.farmId || '');
  document.getElementById('rc-date').value = rec?.assessedAt || new Date().toISOString().slice(0, 10);
  document.getElementById('rc-notes').value = rec?.notes || '';

  renderRodentInputs();
  updateRodentScorePanel();
  openModal('modal-rodent');
}

function renderRodentInputs() {
  document.getElementById('rc-items-wrap').innerHTML = RODENT_AREAS.map(area => {
    const items = RODENT_ITEMS.filter(it => it.area === area);
    return `
      <div class="rc-area">
        <div class="rc-area-head">${area} <span class="text-muted">(${items.length}항목)</span></div>
        ${items.map(it => {
          const v = Number(rcDraft.scores[it.id]) || 0;
          return `<div class="ca-item">
            <div class="ca-item-label">
              <span class="rc-id">${it.id}</span> ${it.check}
              ${it.critical ? '<span class="badge badge-red" style="margin-left:6px;font-size:10px">중요</span>' : ''}
              ${it.weight === 2 ? '<span class="text-muted" style="font-size:10px;margin-left:4px">가중 ×2</span>' : ''}
              <div class="text-muted" style="font-size:11px;margin-top:2px">확인방법: ${it.evidence}</div>
            </div>
            <div class="ca-btn-row">
              ${RODENT_LEVELS.map(lv => `
                <button type="button" class="ca-btn ${v === lv.score ? 'on ' + (lv.score === 0 ? 'ok' : lv.score >= 2 ? 'bad' : 'warn') : ''}"
                  onclick="setRodentScore('${it.id}',${lv.score})">
                  <span class="ca-btn-score">${lv.score} ${lv.label}</span>
                  <span class="ca-btn-desc">${lv.desc}</span>
                </button>`).join('')}
            </div>
            ${v >= 1 ? `<input class="rc-evidence" placeholder="관찰 증거·위치 메모 (예: 3동 서측 배수구 옆 갉은 흔적)"
              value="${(rcDraft.evidence[it.id] || '').replace(/"/g, '&quot;')}"
              oninput="rcDraft.evidence['${it.id}']=this.value">
              <div class="rc-fix">권장 조치: ${it.fix}</div>` : ''}
          </div>`;
        }).join('')}
      </div>`;
  }).join('');
}

function setRodentScore(id, value) {
  rcDraft.scores[id] = value;
  if (value === 0) delete rcDraft.evidence[id]; // 적합으로 되돌리면 증거 메모도 의미가 없다
  renderRodentInputs();
  updateRodentScorePanel();
}

function updateRodentScorePanel() {
  const s = scoreRodentAudit(rcDraft.scores);
  const findings = rodentFindings(rcDraft.scores);
  const urgentHtml = s.criticalItems.length
    ? `<div class="ca-urgent">🚨 긴급 중요항목 ${s.criticalItems.length}건: ${s.criticalItems.map(i => i.id).join(', ')}<br>
        <span class="text-muted">위험도 점수와 무관하게 24시간 내 조치하고 담당자·기한을 지정하세요.</span></div>`
    : '';
  const areaHtml = RODENT_AREAS.map(a => {
    const v = s.areaScores[a];
    return `<div class="rc-area-bar">
      <span class="rc-area-name">${a}</span>
      <span class="rc-bar"><span class="rc-bar-fill" style="width:${v.pct}%;background:${v.pct >= 60 ? 'var(--red)' : v.pct >= 30 ? 'var(--amber)' : 'var(--green)'}"></span></span>
      <span class="rc-area-pct">${v.pct}%</span>
    </div>`;
  }).join('');

  document.getElementById('rc-score-panel').innerHTML = `
    <div class="ca-score-grid">
      <div><div class="ca-score-label">가중위험점수</div><div class="ca-score-value">${s.riskScore}<span>/${s.maxScore}</span></div><div class="ca-score-sub">점수 × 중요도 합계</div></div>
      <div class="ca-score-di"><div class="ca-score-label">감사 위험도</div><div class="ca-score-value">${s.riskPct}<span>%</span></div><div class="ca-score-sub">0–29 양호 · 30–59 주의 · 60+ 고위험</div></div>
      <div><div class="ca-score-label">긴급 중요항목</div><div class="ca-score-value">${s.criticalItems.length}<span>건</span></div><div class="ca-score-sub">중요항목 중 3점</div></div>
      <div><div class="ca-score-label">시정조치 대상</div><div class="ca-score-value">${findings.length}<span>건</span></div><div class="ca-score-sub">2점 이상 항목</div></div>
      <div><div class="ca-score-label">판정</div><div class="mt-8"><span class="badge ${s.band.badge}" style="font-size:13px;padding:5px 12px">${s.grade}</span></div><div class="ca-score-sub">${s.band.action}</div></div>
    </div>
    ${urgentHtml}
    <div class="rc-area-bars">${areaHtml}</div>`;
}

async function saveRodentAssessment() {
  const farmId = document.getElementById('rc-farm').value;
  const assessedAt = document.getElementById('rc-date').value;
  if (!farmId || !assessedAt) { alert('농장과 평가일은 필수입니다.'); return; }
  const farm = load('farms').find(f => f.id === farmId);
  const s = scoreRodentAudit(rcDraft.scores);
  const data = {
    assessedAt, farmId, farmName: farm.name,
    scores: rcDraft.scores, evidence: rcDraft.evidence,
    riskScore: s.riskScore, maxScore: s.maxScore, riskPct: s.riskPct,
    grade: s.grade, criticalCount: s.criticalItems.length,
    areaScores: s.areaScores,
    notes: document.getElementById('rc-notes').value.trim(),
    assessedByEmail: await currentUserEmail(),
  };
  try {
    if (editingId.rodentAssessment) await updateRow('rodentAssessments', editingId.rodentAssessment, data);
    else await insertRow('rodentAssessments', data);
  } catch (e) { alert('저장 실패: ' + e.message); return; }
  closeModal('modal-rodent');
  populateRodentFarmFilter();
  renderRodentAssessments();
}

async function deleteRodentAssessment(id) {
  if (!confirm('이 구서 컨설팅 평가 기록을 삭제하시겠습니까?')) return;
  try { await deleteRow('rodentAssessments', id); } catch (e) { alert('삭제 실패: ' + e.message); return; }
  renderRodentAssessments();
}

// ─── 목록 ──────────────────────────────────────────────────────────────────
function populateRodentFarmFilter() {
  const sel = document.getElementById('rc-filter-farm');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">전체 농장</option>' + farmsByOwner().map(f =>
    `<option value="${f.id}"${f.id === cur ? ' selected' : ''}>${f.name} (${f.owner})</option>`
  ).join('');
}

function renderRodentAssessments() {
  const q = (document.getElementById('rc-search')?.value || '').toLowerCase();
  const ff = document.getElementById('rc-filter-farm')?.value || '';
  const list = load('rodentAssessments').filter(r =>
    (!q || (r.farmName || '').toLowerCase().includes(q)) && (!ff || r.farmId === ff)
  );
  const tbody = document.getElementById('rc-tbody');
  const empty = document.getElementById('rc-empty');
  if (!list.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  tbody.innerHTML = list.map(r => {
    const findings = rodentFindings(r.scores || {});
    // 직전 평가와 비교해 개선/악화를 보여준다. 재감사가 이 화면의 핵심이라서다.
    const prev = load('rodentAssessments')
      .filter(x => x.farmId === r.farmId && x.assessedAt < r.assessedAt)
      .sort((a, b) => b.assessedAt.localeCompare(a.assessedAt))[0];
    const delta = prev ? round1(Number(r.riskPct) - Number(prev.riskPct)) : null;
    const trend = delta == null ? '<span class="text-muted">-</span>'
      : delta < 0 ? `<span style="color:var(--green);font-weight:700">▼ ${Math.abs(delta)}</span>`
      : delta > 0 ? `<span style="color:var(--red);font-weight:700">▲ ${delta}</span>`
      : '<span class="text-muted">─ 0</span>';
    return `
    <tr>
      <td>${r.assessedAt}</td>
      <td><strong>${r.farmName}</strong></td>
      <td><strong>${r.riskPct}%</strong> <span class="text-muted">(${r.riskScore}/${r.maxScore})</span></td>
      <td>${trend}</td>
      <td>${r.criticalCount ? `<span class="badge badge-red">${r.criticalCount}건</span>` : '<span class="text-muted">0</span>'}</td>
      <td>${findings.length}건</td>
      <td><span class="badge ${rodentGradeBadge(r.grade)}">${r.grade}</span></td>
      <td><div class="flex-gap">
        <button class="btn btn-primary btn-sm" onclick="printRodentReport('${r.id}')" title="최종 컨설팅 보고서 인쇄">🖨️ 보고서</button>
        <button class="btn btn-outline btn-sm" onclick="openRodentModal('${r.id}')">편집</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRodentAssessment('${r.id}')">삭제</button>
      </div></td>
    </tr>`;
  }).join('');
}

// ─── 최종 컨설팅 보고서 ────────────────────────────────────────────────────
// 농장주에게 건네주는 결과물. 감사 결과 → 영역별 위험도 → 시정조치 실행계획 →
// 영역별 24시간/7일/30일 개선방안 → 전체 항목 결과 순서로 담는다.
function printRodentReport(id) {
  const rec = load('rodentAssessments').find(r => r.id === id);
  if (!rec) { alert('평가 기록을 찾을 수 없습니다.'); return; }
  const farm = load('farms').find(f => f.id === rec.farmId);
  const scores = rec.scores || {};
  const evidence = rec.evidence || {};
  const s = scoreRodentAudit(scores);
  const findings = rodentFindings(scores);

  const prev = load('rodentAssessments')
    .filter(x => x.farmId === rec.farmId && x.assessedAt < rec.assessedAt)
    .sort((a, b) => b.assessedAt.localeCompare(a.assessedAt))[0];
  const trendLine = prev
    ? `직전 평가(${prev.assessedAt}) ${prev.riskPct}% → 이번 ${rec.riskPct}% (${round1(Number(rec.riskPct) - Number(prev.riskPct)) <= 0 ? '개선' : '악화'} ${Math.abs(round1(Number(rec.riskPct) - Number(prev.riskPct)))}p)`
    : '이번이 첫 감사입니다. 다음 재감사와 비교해 추세를 확인하세요.';

  const urgentBlock = s.criticalItems.length ? `
    <div class="print-focus" style="border-color:#c00">
      <strong>🚨 긴급 개선 ${s.criticalItems.length}건</strong> — 감사 위험도와 무관하게 24시간 내 조치가 필요한 중요항목입니다.<br>
      ${s.criticalItems.map(i => `${i.id} ${i.check}`).join('<br>')}
    </div>` : '';

  const areaRows = RODENT_AREAS.map(a => {
    const v = s.areaScores[a];
    const m = RODENT_ACTION_MATRIX[a];
    const judge = v.pct >= 60 ? '고위험' : v.pct >= 30 ? '주의' : '양호';
    return `<tr>
      <td><strong>${a}</strong></td>
      <td style="text-align:center">${v.score}/${v.max}</td>
      <td style="text-align:center"><strong>${v.pct}%</strong></td>
      <td style="text-align:center">${judge}</td>
      <td>${m.cause}</td>
    </tr>`;
  }).join('');

  const findingRows = findings.length ? findings.map(f => `
    <tr>
      <td style="text-align:center">${f.priority.label}</td>
      <td style="text-align:center">${f.item.id}</td>
      <td>${f.item.check}<br><span style="color:#666;font-size:7pt">${evidence[f.item.id] ? '관찰: ' + evidence[f.item.id] : f.item.area}</span></td>
      <td style="text-align:center">${f.score}점</td>
      <td>${f.item.fix}</td>
      <td style="text-align:center">${f.priority.due}</td>
      <td></td>
    </tr>`).join('')
    : `<tr><td colspan="7" style="text-align:center;color:#666">2점 이상 항목이 없습니다 — 현 수준을 유지하고 월간 재감사를 계속하세요.</td></tr>`;

  // 조치가 필요한 영역만 개선방안을 싣는다. 문제없는 영역까지 넣으면 보고서가 흐려진다.
  const affectedAreas = RODENT_AREAS.filter(a => findings.some(f => f.item.area === a));
  const planAreas = affectedAreas.length ? affectedAreas : RODENT_AREAS;
  const planRows = planAreas.map(a => {
    const m = RODENT_ACTION_MATRIX[a];
    return `<tr>
      <td><strong>${a}</strong></td>
      <td>${m.d1}</td>
      <td>${m.d7}</td>
      <td>${m.d30}</td>
      <td>${m.kpi}</td>
      <td style="text-align:center">${m.role}</td>
    </tr>`;
  }).join('');

  const allRows = RODENT_AREAS.map(a => {
    const items = RODENT_ITEMS.filter(it => it.area === a);
    return items.map((it, i) => {
      const v = Number(scores[it.id]) || 0;
      const lv = RODENT_LEVELS[v];
      return `<tr>
        ${i === 0 ? `<td rowspan="${items.length}" style="vertical-align:middle;text-align:center;font-weight:700">${a}</td>` : ''}
        <td style="text-align:center">${it.id}</td>
        <td>${it.check}</td>
        <td style="text-align:center">${it.critical ? '중요' : '-'}</td>
        <td style="text-align:center;font-weight:700${v >= 2 ? ';color:#c00' : ''}">${v} ${lv.label}</td>
        <td style="font-size:7pt">${evidence[it.id] || ''}</td>
      </tr>`;
    }).join('');
  }).join('');

  const html = `<div class="print-page">
    <div class="print-header">
      <h1>농장 구서작업 컨설팅 보고서</h1>
      <div class="ph-meta">
        <span>농장: <strong>${rec.farmName}</strong></span>
        <span>농장주: ${farm?.owner || '-'}</span>
        <span>평가일: ${rec.assessedAt}</span>
        <span>감사 항목: ${RODENT_ITEMS.length}개</span>
      </div>
    </div>

    <div class="print-info-grid">
      <div class="print-info-cell"><div class="lbl">감사 위험도</div><div class="val">${rec.riskPct}%</div></div>
      <div class="print-info-cell"><div class="lbl">가중위험점수</div><div class="val">${rec.riskScore}/${rec.maxScore}</div></div>
      <div class="print-info-cell"><div class="lbl">종합 판정</div><div class="val">${rec.grade}</div></div>
      <div class="print-info-cell"><div class="lbl">긴급 중요항목</div><div class="val">${s.criticalItems.length}건</div></div>
    </div>

    ${urgentBlock}

    <div class="print-focus">
      <strong>종합 의견</strong> — ${s.band.summary}. ${s.band.action}.<br>
      <strong>추세</strong> — ${trendLine}
      ${rec.notes ? `<br><strong>현장 메모</strong> — ${rec.notes}` : ''}
    </div>

    <div class="print-section-title">1. 영역별 위험도</div>
    <table class="print-table">
      <thead><tr><th style="width:20%">영역</th><th style="width:12%">가중점수</th><th style="width:12%">위험도</th><th style="width:12%">판정</th><th>주요 원인</th></tr></thead>
      <tbody>${areaRows}</tbody>
    </table>

    <div class="print-section-title">2. 시정조치 실행계획 <span style="font-weight:400;font-size:7.5pt">(2점 이상 항목 — 담당자·완료일은 농장에서 기입)</span></div>
    <table class="print-table">
      <thead><tr><th style="width:11%">우선순위</th><th style="width:7%">ID</th><th style="width:31%">발견사항</th><th style="width:8%">점수</th><th style="width:23%">권장 조치</th><th style="width:9%">기한</th><th style="width:11%">담당자</th></tr></thead>
      <tbody>${findingRows}</tbody>
    </table>

    <div class="print-section-title">3. 영역별 개선 로드맵</div>
    <table class="print-table">
      <thead><tr><th style="width:14%">영역</th><th>24시간</th><th>7일</th><th>30일 체계개선</th><th style="width:15%">성공 KPI</th><th style="width:11%">책임</th></tr></thead>
      <tbody>${planRows}</tbody>
    </table>

    <div class="print-section-title">4. 전체 감사 결과</div>
    <table class="print-table">
      <thead><tr><th style="width:12%">영역</th><th style="width:7%">ID</th><th>감사 체크포인트</th><th style="width:8%">중요도</th><th style="width:13%">평가</th><th style="width:20%">관찰 증거</th></tr></thead>
      <tbody>${allRows}</tbody>
    </table>

    <div class="print-two-col">
      <div class="print-box">
        <div class="print-box-title">평가 기준</div>
        <p>0 적합 · 1 부분 개선 · 2 부적합 · 3 긴급·중대 결함
중요항목은 가중치 ×2로 계산

가중위험도 = Σ(점수×중요도) ÷ ${RODENT_MAX} × 100
0–29 양호 · 30–59 주의 · 60 이상 고위험
중요항목 3점은 위험도와 무관하게 긴급 개선</p>
      </div>
      <div class="print-box">
        <div class="print-box-title">확인 및 서명</div>
        <p>평가자: ${rec.assessedByEmail || ''}
출력일: ${new Date().toLocaleDateString('ko-KR')}
재감사 예정일: ______________

농장주 확인 ______________________</p>
      </div>
    </div>

    <div class="print-focus" style="margin-top:6pt;font-size:7pt">
      <strong>운영 원칙 및 주의</strong> — 구서관리는 배제(exclusion) → 위생·먹이관리 → 모니터링 → 포획·미끼 → 검증·재침입 방지 순서로 진행하며,
      약제 투입을 먼저 하지 않습니다. 이 보고서는 Aviagen 'Best Practice for Rodent Control', USDA APHIS 'Defend the Flock' 바이오시큐리티 자료,
      FAO 통합 구서관리 원칙을 현장 감사 형식으로 재구성한 컨설팅용 운영도구입니다.
      제품명·성분·용량은 표준화하지 않으며 등록제품 라벨·국가 법규·수의사 지침이 우선합니다.
      미끼·트랩은 가금·사람·비표적동물이 접근할 수 없도록 잠금·고정하고, 사체와 폐미끼는 규정에 따라 처리하시기 바랍니다.
      설치류 활동 증가와 함께 이상폐사가 확인되면 구서작업보다 수의사·방역기관 보고가 우선입니다.
    </div>
  </div>`;

  document.getElementById('print-area').innerHTML = html;
  setTimeout(() => window.print(), 200);
}
