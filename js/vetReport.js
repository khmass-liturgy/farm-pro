// ─── 공수의 보고서 ───────────────────────────────────────────────────────────
// 원본: 매달 만들던 "OOOO_공수의보고서.xlsx" 워크북(입력대장 시트에 하루 한 줄씩
// 방문 기록을 적으면 여비청구서/활동수당청구서/근무상황보고서/예찰내역/예찰일지/
// 출장일지가 전부 그 시트를 참조해 자동으로 채워지던 구조)를 이 앱으로 옮긴 것.
//
// "입력대장"이 하던 일을 vet_report_entries 테이블 + 이 화면의 "일자별 근무내용"이
// 대신한다. 원본은 "기간 시작일 + 비고란의 1~30 일련번호"로 날짜를 계산했는데,
// 그 방식은 일련번호가 하나라도 밀리면 그 아래 날짜가 전부 틀어진다. 여기서는
// 방문일을 날짜로 직접 받아 그 문제 자체가 없다. 나머지 5개 화면은 모두 이
// 테이블을 "선택한 년월" 기준으로 걸러 읽기만 하는 보고서/인쇄 화면이다.
//
// 청구서에 들어가는 공수의 개인정보(주민등록번호·계좌번호 포함)는 vet_office_info
// 표(로그인한 사용자만 읽는 단일 행)에서 가져온다. 처방전의 RX_CLINIC처럼 js
// 소스에 두면 이 저장소가 퍼블릭이라 그대로 공개 배포되기 때문이다.

function vetOfficeInfo() { return load('vetOfficeInfo')[0] || {}; }
function vetDefaultYm() { return new Date().toISOString().slice(0, 7); }
function vetMonthLabel(ym) {
  const [y, m] = (ym || '').split('-');
  return y && m ? `${y}년 ${Number(m)}월` : '';
}
function vetEntriesForYm(ym) {
  return load('vetReportEntries')
    .filter(e => (e.visitDate || '').slice(0, 7) === ym)
    .sort((a, b) => a.visitDate.localeCompare(b.visitDate));
}
function vetMonthStats(ym) {
  const list = vetEntriesForYm(ym);
  return { list, count: list.length, scaleSum: list.reduce((s, e) => s + (Number(e.scale) || 0), 0) };
}

// ─── ⚙ 사무실 정보(민감정보) ─────────────────────────────────────────────────
function openVetOfficeInfoModal() {
  const o = vetOfficeInfo();
  document.getElementById('voi-clinic-name').value = o.clinicName || '';
  document.getElementById('voi-vet-name').value = o.vetName || '';
  document.getElementById('voi-license-no').value = o.licenseNo || '';
  document.getElementById('voi-address').value = o.address || '';
  document.getElementById('voi-resident-no').value = o.residentNo || '';
  document.getElementById('voi-bank-name').value = o.bankName || '';
  document.getElementById('voi-bank-account').value = o.bankAccount || '';
  document.getElementById('voi-travel-fee').value = o.travelFeePerVisit ?? 20000;
  document.getElementById('voi-activity-allowance').value = o.monthlyActivityAllowance ?? '';
  openModal('modal-vet-office-info');
}

async function saveVetOfficeInfo() {
  const val = id => document.getElementById(id).value.trim();
  const numVal = id => { const v = document.getElementById(id).value; return v === '' ? null : Number(v); };
  const data = {
    clinicName: val('voi-clinic-name'), vetName: val('voi-vet-name'), licenseNo: val('voi-license-no'),
    address: val('voi-address'), residentNo: val('voi-resident-no'),
    bankName: val('voi-bank-name'), bankAccount: val('voi-bank-account'),
    travelFeePerVisit: numVal('voi-travel-fee') ?? 20000,
    monthlyActivityAllowance: numVal('voi-activity-allowance'),
  };
  try {
    if (vetOfficeInfo().id != null) await updateRow('vetOfficeInfo', true, data);
    else await insertRow('vetOfficeInfo', data);
  } catch (e) { alert('저장 실패: ' + e.message); return; }
  closeModal('modal-vet-office-info');
  alert('사무실 정보를 저장했습니다.');
}

// ─── 일자별 근무내용 (= 입력대장) — 방문 기록 등록/편집/삭제 ─────────────────
let vetEntrySelectedIds = new Set();

function toggleVetEntrySelectAll(checked) {
  const ids = vetEntriesForYm(document.getElementById('vetentry-month').value).map(e => e.id);
  vetEntrySelectedIds = checked ? new Set(ids) : new Set();
  renderVetEntries();
}
function toggleVetEntrySelect(id, checked) {
  if (checked) vetEntrySelectedIds.add(id); else vetEntrySelectedIds.delete(id);
  renderVetEntries();
}

function renderVetEntries() {
  const monthEl = document.getElementById('vetentry-month');
  if (!monthEl.value) monthEl.value = vetDefaultYm();
  const q = (document.getElementById('vetentry-search')?.value || '').toLowerCase();
  const list = vetEntriesForYm(monthEl.value).filter(e =>
    !q || (e.farmName || '').toLowerCase().includes(q) || (e.owner || '').toLowerCase().includes(q)
  );
  const liveIds = new Set(load('vetReportEntries').map(e => e.id));
  vetEntrySelectedIds.forEach(id => { if (!liveIds.has(id)) vetEntrySelectedIds.delete(id); });

  const editBtn = document.getElementById('vetentry-edit-btn');
  const deleteBtn = document.getElementById('vetentry-delete-btn');
  if (editBtn) editBtn.disabled = vetEntrySelectedIds.size !== 1;
  if (deleteBtn) deleteBtn.disabled = vetEntrySelectedIds.size === 0;

  const tbody = document.getElementById('vetentry-tbody');
  const empty = document.getElementById('vetentry-empty');
  const checkAll = document.getElementById('vetentry-check-all');
  if (!list.length) {
    tbody.innerHTML = ''; empty.style.display = '';
    if (checkAll) checkAll.checked = false;
    return;
  }
  empty.style.display = 'none';
  if (checkAll) checkAll.checked = list.every(e => vetEntrySelectedIds.has(e.id));
  tbody.innerHTML = list.map(e => `
    <tr>
      <td style="text-align:center"><input type="checkbox" ${vetEntrySelectedIds.has(e.id) ? 'checked' : ''} onchange="toggleVetEntrySelect('${e.id}', this.checked)"></td>
      <td>${e.visitDate}</td>
      <td><strong>${e.farmName || '(삭제된 농장)'}</strong><div style="font-size:11px;color:var(--text-secondary)">${e.owner || ''}</div></td>
      <td>${e.species || '-'}</td>
      <td>${e.scale != null ? Number(e.scale).toLocaleString() : '-'}</td>
      <td>${e.content || '-'}</td>
    </tr>`).join('');
}

function editSelectedVetEntry() {
  if (vetEntrySelectedIds.size !== 1) return;
  openVetEntryModal([...vetEntrySelectedIds][0]);
}

async function deleteSelectedVetEntries() {
  if (!vetEntrySelectedIds.size) return;
  if (!confirm(`선택한 방문 기록 ${vetEntrySelectedIds.size}건을 삭제하시겠습니까?`)) return;
  try {
    for (const id of vetEntrySelectedIds) await deleteRow('vetReportEntries', id);
  } catch (e) { alert('삭제 실패: ' + e.message); return; }
  vetEntrySelectedIds.clear();
  renderVetEntries();
}

function onVetEntryFarmChange() {
  const farm = load('farms').find(f => f.id === document.getElementById('vetentry-farm').value);
  const info = document.getElementById('vetentry-farm-info');
  info.textContent = farm
    ? [`주소 ${farm.address || '-'}`, `축종 ${farm.type || '-'}`, `사육규모 ${farm.count ? Number(farm.count).toLocaleString() : '-'}`].join(' · ')
    : '농장을 선택하면 주소·축종·사육규모가 자동으로 채워집니다.';
}

function openVetEntryModal(id) {
  editingId.vetReportEntry = id || null;
  const e = id ? load('vetReportEntries').find(x => x.id === id) : null;
  document.getElementById('modal-vet-entry-title').textContent = id ? '방문 기록 편집' : '방문 기록 추가';
  document.getElementById('vetentry-date').value = e?.visitDate || new Date().toISOString().slice(0, 10);
  populateFarmSelect('vetentry-farm', e?.farmId || '');
  document.getElementById('vetentry-content').value = e?.content || '';
  onVetEntryFarmChange();
  openModal('modal-vet-entry');
}

async function saveVetEntry() {
  const visitDate = document.getElementById('vetentry-date').value;
  const farmId = document.getElementById('vetentry-farm').value;
  if (!visitDate || !farmId) { alert('방문일과 농장은 필수입니다.'); return; }
  const farm = load('farms').find(f => f.id === farmId);
  const data = {
    visitDate, farmId, farmName: farm.name, owner: farm.owner,
    address: farm.address, species: farm.type, scale: farm.count,
    content: document.getElementById('vetentry-content').value.trim(),
    createdByEmail: await currentUserEmail(),
  };
  try {
    if (editingId.vetReportEntry) await updateRow('vetReportEntries', editingId.vetReportEntry, data);
    else await insertRow('vetReportEntries', data);
  } catch (e) { alert('저장 실패: ' + e.message); return; }
  editingId.vetReportEntry = null;
  closeModal('modal-vet-entry');
  renderVetEntries();
}

// ─── 근무상황보고서 ─────────────────────────────────────────────────────────
// "2. 예방주사 및 채혈내역"·"3. 동물질병예찰 실적"은 이 앱에 그 수치를 따로
// 기록하는 화면이 없어 원본 서식과 같이 항상 "-"로 찍는다. "4. 기타실적"의
// 업무명 5개는 매달 거의 같은 문구라 고정해두고, 그달의 추진실적만 화면에서
// 입력해 인쇄에 반영한다(저장하지 않음 — 매달 조금씩 달라지는 자유 텍스트라서).
const VET_WORK_ETC_ITEMS = ['출하이동승인서 발급', '기립불능우확인서 발급', 'AI 시료채취 및 의뢰', '산란성계 살충제검사 샘플링 및 검사의뢰', '역학관련'];

function renderVetWorkReportSummary() {
  const monthEl = document.getElementById('vetwork-month');
  if (!monthEl.value) monthEl.value = vetDefaultYm();
  const { count, scaleSum } = vetMonthStats(monthEl.value);
  document.getElementById('vetwork-summary').textContent = `${vetMonthLabel(monthEl.value)} 예찰 ${count}건 · 사육규모 합계 ${scaleSum.toLocaleString()}`;
}

function buildVetWorkReportHtml(ym) {
  const o = vetOfficeInfo();
  const { count, scaleSum } = vetMonthStats(ym);
  const etcRows = VET_WORK_ETC_ITEMS.map((name, i) => `
    <tr><td>${name}</td><td colspan="4">${(document.getElementById(`vetwork-etc-${i}`)?.value || '').trim() || '-'}</td></tr>`).join('');
  return `
  <div class="print-page">
    <div class="ps-docno">[붙임 1-1]</div>
    <div class="ps-title">공수의 근무상황 보고(산업동물)</div>
    <div class="ps-request" style="text-indent:0;text-align:right">(공수의 → 시군) &middot; ${vetMonthLabel(ym)}분</div>

    <div class="ps-section">1. 공수의 근무상황</div>
    <table class="ps-head">
      <tr><td class="lbl">동물병원</td><td>${o.clinicName || ''}</td><td class="lbl2">담당지역</td><td colspan="2">${o.address || ''}</td></tr>
      <tr><td class="lbl">성명</td><td>${o.vetName || ''}</td><td class="lbl2">면허번호</td><td colspan="2">${o.licenseNo || ''}</td></tr>
      <tr><td class="lbl">예찰 횟수</td><td>${count} 건 방문</td><td class="lbl2">예찰 농가수</td><td colspan="2">${count} 건 방문</td></tr>
      <tr><td class="lbl">비고(수수)</td><td colspan="4">${scaleSum.toLocaleString()} 수</td></tr>
    </table>

    <div class="ps-section">2. 예방주사 및 채혈내역</div>
    <table class="ps-head">
      <tr><td class="lbl">예방주사(구제역/광견병/탄저·기종저/돼지열병/기타)</td><td colspan="4">- (금월실적 없음)</td></tr>
      <tr><td class="lbl">혈청검사용 채혈내역(브루셀라병/우결핵)</td><td colspan="4">- (금월실적 없음)</td></tr>
    </table>

    <div class="ps-section">3. 동물질병예찰 실적</div>
    <table class="ps-head">
      <tr><td class="lbl">지역별 신고내역·조치내역</td><td colspan="4">계 - / - / -</td></tr>
    </table>

    <div class="ps-section">4. 기타실적</div>
    <table class="ps-table">
      <thead><tr><th>업무명</th><th colspan="4">추진실적</th></tr></thead>
      <tbody>${etcRows}</tbody>
    </table>

    <div class="ps-request">▣ 제출자&#8195;&#8195;&#8195;&#8195;&#8195;&#8195;${o.clinicName || ''}&#8195;&#8195;&#8195;${o.vetName || ''}&#8195;&#8195;&#8195;(서명)</div>
  </div>`;
}

function printVetWorkReport() {
  const ym = document.getElementById('vetwork-month').value || vetDefaultYm();
  document.getElementById('print-area').innerHTML = buildVetWorkReportHtml(ym);
  setTimeout(() => window.print(), 200);
}

// ─── 여비청구서 / 활동수당 청구서 ───────────────────────────────────────────
function renderVetInvoiceSummary() {
  const monthEl = document.getElementById('vetinvoice-month');
  if (!monthEl.value) monthEl.value = vetDefaultYm();
  const o = vetOfficeInfo();
  const { count } = vetMonthStats(monthEl.value);
  const travelFee = count * (o.travelFeePerVisit || 20000);
  document.getElementById('vetinvoice-summary').textContent =
    `${vetMonthLabel(monthEl.value)} 방문 ${count}건 · 여비 ${travelFee.toLocaleString()}원 (건당 ${(o.travelFeePerVisit || 20000).toLocaleString()}원)` +
    (o.monthlyActivityAllowance ? ` · 활동수당 ${Number(o.monthlyActivityAllowance).toLocaleString()}원` : ' · 활동수당 금액이 사무실 정보에 없습니다');
}

function vetMonthEndLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}년 ${m}월 ${lastDay}일`;
}

function buildVetInvoiceHtml(kind, ym) {
  const o = vetOfficeInfo();
  const { count } = vetMonthStats(ym);
  const isTravel = kind === 'travel';
  const title = isTravel ? '공수의 여비 청구서' : '공수의 활동수당 청구서';
  const itemLabel = isTravel ? '공수의\n여비' : '공수의\n활동\n수당';
  const amount = isTravel ? count * (o.travelFeePerVisit || 20000) : (o.monthlyActivityAllowance || 0);
  return `
  <div class="print-page">
    <div class="ps-title" style="letter-spacing:2pt">${title}</div>
    <div class="ps-request" style="text-indent:0">${vetMonthEndLabel(ym)}분 공수의 ${isTravel ? '여비' : '활동수당'}를 아래와 같이 청구합니다.</div>
    <table class="ps-table">
      <thead><tr><th>건명</th><th>주소</th><th>성명</th><th>주민등록번호</th><th>청구금액</th><th>계좌번호</th></tr></thead>
      <tbody>
        <tr>
          <td>${itemLabel.replace(/\n/g, '<br>')}</td>
          <td>${(o.address || '').replace(/\n/g, '<br>')}</td>
          <td>${o.vetName || ''}</td>
          <td>${o.residentNo || ''}</td>
          <td class="ctr"><strong>${amount.toLocaleString()}</strong></td>
          <td>${(o.bankName || '')} ${(o.bankAccount || '')}</td>
        </tr>
      </tbody>
    </table>
    <div class="ps-request" style="text-align:right;text-indent:0">청구인 &#8195;&#8195;&#8195;&#8195; ${o.vetName || ''} &#8195;(인)</div>
    <div class="ps-request" style="text-align:center;text-indent:0;margin-top:24pt">파&#8195;주&#8195;시&#8195;장</div>
  </div>`;
}

function printVetInvoice(kind) {
  const ym = document.getElementById('vetinvoice-month').value || vetDefaultYm();
  document.getElementById('print-area').innerHTML = buildVetInvoiceHtml(kind, ym);
  setTimeout(() => window.print(), 200);
}

// ─── 예찰내역 (15건씩 나눠 인쇄 — 원본 예찰내역1/예찰내역2와 같은 분량) ──────
function renderVetPatrolSummary() {
  const monthEl = document.getElementById('vetpatrol-month');
  if (!monthEl.value) monthEl.value = vetDefaultYm();
  const { count, scaleSum } = vetMonthStats(monthEl.value);
  document.getElementById('vetpatrol-summary').textContent = `${vetMonthLabel(monthEl.value)} 예찰 ${count}건 (15건씩 ${Math.max(1, Math.ceil(count / 15))}쪽으로 나눠 인쇄) · 사육규모 합계 ${scaleSum.toLocaleString()}`;
}

function buildVetPatrolChunkHtml(chunk, startNo) {
  const scaleSum = chunk.reduce((s, e) => s + (Number(e.scale) || 0), 0);
  const rows = chunk.map((e, i) => `
    <tr>
      <td class="ctr">${startNo + i}</td>
      <td>${e.farmName || ''}<div style="font-size:9px;color:#666">${e.owner || ''}</div></td>
      <td>${e.address || '-'}</td>
      <td class="ctr">${e.species || '-'}</td>
      <td class="ctr">${e.scale != null ? Number(e.scale).toLocaleString() : '-'}</td>
      <td>${e.content || '-'}</td>
      <td class="ctr">${(e.visitDate || '').slice(5).replace('-', '/')}</td>
    </tr>`).join('');
  return `
  <div class="print-page">
    <div class="ps-title">동물질병 예찰내역</div>
    <div class="ps-request" style="text-align:right;text-indent:0">(공수의→시군)</div>
    <div class="ps-request" style="text-indent:0">1. 예찰일자 : ${chunk[0]?.visitDate || ''} 부터 ${chunk[chunk.length - 1]?.visitDate || ''}</div>
    <div class="ps-section">2. 예찰내역</div>
    <table class="ps-table">
      <thead><tr><th>번호</th><th>축주명(농장명)</th><th>주소</th><th>축종(품종)</th><th>사육두수</th><th>예찰결과</th><th>비고</th></tr></thead>
      <tbody>
        ${rows}
        <tr class="ps-total"><td class="ctr">계</td><td class="ctr">${chunk.length}</td><td colspan="2"></td><td class="ctr">${scaleSum.toLocaleString()}</td><td colspan="2"></td></tr>
      </tbody>
    </table>
    <div class="ps-foot-note">※ 예찰결과에는 폐사두수, 임상증상 등 질병발생상황을 기록</div>
  </div>`;
}

function printVetPatrol() {
  const ym = document.getElementById('vetpatrol-month').value || vetDefaultYm();
  const list = vetEntriesForYm(ym);
  if (!list.length) { alert('선택한 달에 방문 기록이 없습니다.'); return; }
  const pages = [];
  for (let i = 0; i < list.length; i += 15) pages.push(buildVetPatrolChunkHtml(list.slice(i, i + 15), i + 1));
  document.getElementById('print-area').innerHTML = pages.join('');
  setTimeout(() => window.print(), 200);
}

// ─── 예찰일지 (방문 건마다 한 쪽 — 체크박스로 여러 건 골라 한 번에 인쇄) ─────
let vetDiarySelectedIds = new Set();

function toggleVetDiarySelectAll(checked) {
  const ids = vetEntriesForYm(document.getElementById('vetdiary-month').value).map(e => e.id);
  vetDiarySelectedIds = checked ? new Set(ids) : new Set();
  renderVetDiaryList();
}
function toggleVetDiarySelect(id, checked) {
  if (checked) vetDiarySelectedIds.add(id); else vetDiarySelectedIds.delete(id);
  renderVetDiaryList();
}

function renderVetDiaryList() {
  const monthEl = document.getElementById('vetdiary-month');
  if (!monthEl.value) monthEl.value = vetDefaultYm();
  const list = vetEntriesForYm(monthEl.value);
  const liveIds = new Set(list.map(e => e.id));
  vetDiarySelectedIds.forEach(id => { if (!liveIds.has(id)) vetDiarySelectedIds.delete(id); });

  const printBtn = document.getElementById('vetdiary-print-btn');
  if (printBtn) printBtn.disabled = vetDiarySelectedIds.size === 0;

  const tbody = document.getElementById('vetdiary-tbody');
  const empty = document.getElementById('vetdiary-empty');
  const checkAll = document.getElementById('vetdiary-check-all');
  if (!list.length) {
    tbody.innerHTML = ''; empty.style.display = '';
    if (checkAll) checkAll.checked = false;
    return;
  }
  empty.style.display = 'none';
  if (checkAll) checkAll.checked = list.every(e => vetDiarySelectedIds.has(e.id));
  tbody.innerHTML = list.map(e => `
    <tr>
      <td style="text-align:center"><input type="checkbox" ${vetDiarySelectedIds.has(e.id) ? 'checked' : ''} onchange="toggleVetDiarySelect('${e.id}', this.checked)"></td>
      <td>${e.visitDate}</td>
      <td><strong>${e.farmName || '(삭제된 농장)'}</strong><div style="font-size:11px;color:var(--text-secondary)">${e.owner || ''}</div></td>
      <td>${e.content || '-'}</td>
    </tr>`).join('');
}

// 원본 「공수의사 현장 예찰 일지」의 방역 체크리스트 문구는 항목이 매우 많아
// (출입구 소독시설·방역복·소독제 종류 등 수십 줄) 여기서는 핵심 항목만 간추려
// 옮긴다 — 실제 제출 서식과 문구를 통일해야 하면 이 배열만 고치면 된다.
const VET_DIARY_CHECKLIST = [
  '① 농장출입구 소독·방역시설 설치 및 운영여부',
  '② 축사 내·외부 소독 실시여부',
  '③ 방역복·장화 등 방역장비 구비 및 착용여부',
  '④ 야생조수류·설치류 유입 차단시설 관리상태',
  '⑤ 사료·물 관리상태 및 이상 유무',
];

function buildVetDiaryHtml(e) {
  return `
  <div class="print-page">
    <div class="ps-title">공수의사 현장 예찰 일지(산업동물)</div>
    <div class="ps-request" style="text-align:right;text-indent:0">(공수의 → 시군) ※공수의 근무상황 보고와 같이 제출</div>

    <div class="ps-section">▣ 농장 기본 정보</div>
    <table class="ps-head">
      <tr><td class="lbl">농장명</td><td>${e.farmName || ''}</td><td class="lbl2">예찰일자</td><td>${e.visitDate}</td></tr>
      <tr><td class="lbl">대표자</td><td>${e.owner || ''}</td><td class="lbl2">사육축종</td><td>${e.species || '-'}</td></tr>
      <tr><td class="lbl">농장주소</td><td colspan="3">${e.address || '-'}</td></tr>
      <tr><td class="lbl">사육두수</td><td colspan="3">${e.scale != null ? Number(e.scale).toLocaleString() + ' 수' : '-'}</td></tr>
    </table>

    <div class="ps-section">▣ 농장 방문 목적</div>
    <table class="ps-head"><tr><td class="lbl">예찰 [■]</td><td>채혈 [ ]</td><td>접종 [ ]</td><td>기타 [ ]</td></tr></table>

    <div class="ps-section">▣ 현장 예찰 사항 / 예찰의견</div>
    <table class="ps-head"><tr><td colspan="4">${e.content || '-'}</td></tr></table>

    <div class="ps-section">▣ 농장 기본 방역 확인 사항</div>
    <div class="ps-foot-note">${VET_DIARY_CHECKLIST.join('<br>')}</div>
  </div>`;
}

function printSelectedVetDiary() {
  const list = load('vetReportEntries').filter(e => vetDiarySelectedIds.has(e.id));
  if (!list.length) { alert('인쇄할 방문 기록을 먼저 체크해주세요.'); return; }
  document.getElementById('print-area').innerHTML = list.map(buildVetDiaryHtml).join('');
  setTimeout(() => window.print(), 200);
}

// ─── 출장일지 ───────────────────────────────────────────────────────────────
function renderVetTripSummary() {
  const monthEl = document.getElementById('vettrip-month');
  if (!monthEl.value) monthEl.value = vetDefaultYm();
  const { count, scaleSum } = vetMonthStats(monthEl.value);
  document.getElementById('vettrip-summary').textContent = `${vetMonthLabel(monthEl.value)} 출장 ${count}일 · 비고(예찰수수) ${scaleSum.toLocaleString()}`;
}

function buildVetTripHtml(ym) {
  const o = vetOfficeInfo();
  const { list, count, scaleSum } = vetMonthStats(ym);
  const rows = list.map((e, i) => `
    <tr>
      <td class="ctr">${i + 1}</td>
      <td>${e.owner || ''}</td>
      <td>${e.address || '-'}</td>
      <td class="ctr">${e.species || '-'}</td>
      <td class="ctr">${(e.visitDate || '').slice(5)}</td>
      <td>${e.content || '-'}</td>
      <td class="ctr">${e.scale != null ? Number(e.scale).toLocaleString() : '-'}</td>
    </tr>`).join('');
  return `
  <div class="print-page">
    <div class="ps-title">공수의 여비 지원사업 근무보고</div>
    <div class="ps-request" style="text-align:right;text-indent:0">(공수의→시군)&#8195;&#8195;발신 : ${o.clinicName || ''} ${o.vetName || ''} (인)</div>

    <div class="ps-section">1. 근무상황</div>
    <table class="ps-head">
      <tr><td class="lbl">공수의</td><td>${o.clinicName || ''} / ${o.vetName || ''} / ${o.licenseNo || ''}</td><td class="lbl2">담당지역</td><td>${o.address || ''}</td></tr>
      <tr><td class="lbl">출장일수</td><td>${count} 일</td><td class="lbl2">비고(예찰수수)</td><td>${scaleSum.toLocaleString()}</td></tr>
    </table>

    <div class="ps-section">2. 농가별 출장내역 — 기간 ${list[0]?.visitDate || ''} ~ ${list[list.length - 1]?.visitDate || ''} (농가수 ${count} 건, 총 두수 ${scaleSum.toLocaleString()})</div>
    <table class="ps-table">
      <thead><tr><th>번호</th><th>축주명</th><th>지역(주소)</th><th>축종</th><th>출장일</th><th>근무내용</th><th>검진두수</th></tr></thead>
      <tbody>
        ${rows}
        <tr class="ps-total"><td colspan="4" class="ctr">합계</td><td colspan="2" class="ctr">${count}일</td><td class="ctr">${scaleSum.toLocaleString()}</td></tr>
      </tbody>
    </table>
  </div>`;
}

function printVetTrip() {
  const ym = document.getElementById('vettrip-month').value || vetDefaultYm();
  if (!vetMonthStats(ym).count) { alert('선택한 달에 방문 기록이 없습니다.'); return; }
  document.getElementById('print-area').innerHTML = buildVetTripHtml(ym);
  setTimeout(() => window.print(), 200);
}
