// ─── 공수의 업무: 이동승인서 발급 ──────────────────────────────────────────
// 원본 서식: AI-이동승인서.xlsx의 「이동승인서출력」(일반)과 「종계장이동승인서」(종계장).
// 두 서식은 11칸 × 16줄 표의 같은 자리를 쓰고, 아래 세 줄만 내용이 다르다.
//   일반   : 시료채취일 · 정밀검사 결과 / 출하처 · 반출일 / 일령 · 운송인 성명
//   종계장 : 정밀검사 16·36·56주령 실시여부 / 출하수수 · MG백신 / 운송인(구매자) · 전화
// 그래서 입력 화면도 인쇄도 한 벌로 두고 서식 종류에 따라 그 칸만 바꿔 끼운다.
//
// 한 농장에서 차량이 여러 대 나가면 승인서도 대수만큼 발급한다(운송인·차량번호만 다름).
// 그래서 "이 건 복제" 버튼으로 방금 발급분을 그대로 복사해 차량 정보만 고치게 한다.

const MP_FORM_TYPES = { general: '일반 (검사증명서)', breeder: '종계장' };

// 원본 서식 임상검사 칸의 체크 항목(순서 그대로)
const MP_CLINICAL_SIGNS = ['사료섭취감소', '침울', '설사', '기침 등 호흡기 증상', '안면부종', '벼슬·육수의 청색증'];

// 운반차량 준수사항 — 서식에 인쇄되는 고정 문구
const MP_VEHICLE_RULES = [
  '출하 및 하차시 : 차량 내·외부 철저한 세척 및 소독실시',
  '차량적재함 바닥 : 분뇨 등 오물이 새지 않도록 오염방지',
  '운반차량 준비물 : 소독약품, 휴대용 소독장비',
];

// ─── 목록 ───────────────────────────────────────────────────────────────────
function populateMpFarmFilter() {
  const sel = document.getElementById('mp-filter-farm');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">전체 농장</option>' + farmsByOwner().map(f =>
    `<option value="${f.id}"${f.id === cur ? ' selected' : ''}>${f.name} (${f.owner})</option>`
  ).join('');
}

function mpDocNo(mp) {
  if (!mp.docNoPrefix && mp.docNoSerial == null) return '-';
  return `제 ${mp.docNoPrefix || ''} - ${mp.docNoSerial ?? ''} 호`;
}

function renderMovePermits() {
  const q = (document.getElementById('mp-search')?.value || '').toLowerCase();
  const ff = document.getElementById('mp-filter-farm')?.value || '';
  const list = load('movePermits').filter(m =>
    (!q || (m.farmName || '').toLowerCase().includes(q) || (m.carrierName || '').toLowerCase().includes(q) ||
      (m.vehicleNo || '').toLowerCase().includes(q) || (m.shipTo || '').toLowerCase().includes(q)) &&
    (!ff || m.farmId === ff)
  );
  const tbody = document.getElementById('mp-tbody');
  const empty = document.getElementById('mp-empty');
  if (!list.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  tbody.innerHTML = list.map(m => `
    <tr>
      <td>${m.issueDate}</td>
      <td>${mpDocNo(m)}</td>
      <td><span class="badge ${m.formType === 'breeder' ? 'badge-purple' : 'badge-blue'}">${m.formType === 'breeder' ? '종계장' : '일반'}</span></td>
      <td><strong>${m.farmName}</strong><div style="font-size:11px;color:var(--text-secondary)">${m.owner || ''}</div></td>
      <td>${m.species || '-'}</td>
      <td>${m.shipTo || '-'}</td>
      <td>${m.carrierName || '-'}<div style="font-size:11px;color:var(--text-secondary)">${m.vehicleNo || ''}</div></td>
      <td>${m.releaseDate || '-'}</td>
      <td><div class="flex-gap">
        <button class="btn btn-primary btn-sm" onclick="printMovePermit('${m.id}')">🖨️ 인쇄</button>
        <button class="btn btn-outline btn-sm" onclick="duplicateMovePermit('${m.id}')" title="차량만 다른 승인서를 이어서 발급">📄 복제</button>
        <button class="btn btn-outline btn-sm" onclick="openMovePermitModal('${m.id}')">편집</button>
        <button class="btn btn-danger btn-sm" onclick="deleteMovePermit('${m.id}')">삭제</button>
      </div></td>
    </tr>`).join('');
}

// ─── 입력/편집 ─────────────────────────────────────────────────────────────
// 서식 종류에 따라 쓰지 않는 칸을 감춘다. 값은 지우지 않는다 — 종류를 잘못 골랐다가
// 되돌렸을 때 적어둔 내용이 사라지면 안 되기 때문이다(저장 때 그 서식의 칸만 쓴다).
function onMpFormTypeChange() {
  const isBreeder = document.getElementById('mp-form-type').value === 'breeder';
  document.querySelectorAll('.mp-general-only').forEach(el => { el.style.display = isBreeder ? 'none' : ''; });
  document.querySelectorAll('.mp-breeder-only').forEach(el => { el.style.display = isBreeder ? '' : 'none'; });
}

function onMpFarmChange(force) {
  const farm = load('farms').find(f => f.id === document.getElementById('mp-farm').value);
  const info = document.getElementById('mp-farm-info');
  if (!farm) {
    info.textContent = '농장을 선택하면 대표자·주소·사육두수·연락처가 자동으로 채워집니다.';
    return;
  }
  info.textContent = [
    `대표자 ${farm.owner || '-'}`, `연락처 ${farm.phone || '-'}`,
    `사육두수 ${farm.count ? Number(farm.count).toLocaleString() + '수' : '-'}`,
    `생년월일 ${farm.owner_birth || '-'}`,
  ].join(' · ');
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el && (force || !el.value)) el.value = val ?? '';
  };
  set('mp-owner', farm.owner);
  set('mp-address', farm.address);
  set('mp-phone', farm.phone);
  set('mp-head-count', farm.count);
  set('mp-species', farm.type);
  // 주민등록번호 칸에는 서식과 같이 생년월일 6자리만 넣는다(원본도 뒷자리는 비어 있다).
  if (farm.owner_birth) set('mp-owner-birth', farm.owner_birth.replace(/-/g, '').slice(2));
  const b = load('batches')
    .filter(x => x.farmId === farm.id && x.status === 'active')
    .sort((a, c) => (c.placementDate || '').localeCompare(a.placementDate || ''))[0];
  if (b) {
    const speciesKey = speciesKeyOf(b.species);
    const breedName = (speciesKey && CONSULT_BREEDS[speciesKey]?.breeds[b.breed]?.name) || b.breed || '';
    if (breedName) set('mp-breed', breedName);
    const age = computeDayAge(b.placementDate);
    if (age >= 1) set('mp-age-label', b.species === '산란계' ? `${Math.ceil(age / 7)}주령` : `${age}일령`);
  }
}

// 다음 발급번호 제안 — 같은 앞자리(26-3 등)로 발급한 것 중 가장 큰 일련번호 + 1.
// 시군에서 내려온 번호 체계라 앱이 채번하지는 않고 제안만 한다.
function mpNextSerial(prefix) {
  const used = load('movePermits')
    .filter(m => (m.docNoPrefix || '') === prefix && m.docNoSerial != null)
    .map(m => Number(m.docNoSerial));
  return used.length ? Math.max(...used) + 1 : 1;
}

function mpLatest() {
  return load('movePermits').slice().sort((a, b) =>
    (b.issueDate || '').localeCompare(a.issueDate || '') || (b.docNoSerial ?? 0) - (a.docNoSerial ?? 0))[0] || null;
}

function onMpPrefixInput() {
  const serialEl = document.getElementById('mp-doc-serial');
  // 편집 중이거나 사용자가 번호를 직접 적어둔 상태면 건드리지 않는다.
  if (editingId.movePermit || serialEl.dataset.manualEdit === '1') return;
  serialEl.value = mpNextSerial(document.getElementById('mp-doc-prefix').value.trim());
}

function renderMpClinicalSigns(selected) {
  const wrap = document.getElementById('mp-clinical-signs');
  wrap.innerHTML = MP_CLINICAL_SIGNS.map((s, i) => `
    <label style="display:inline-flex;align-items:center;gap:5px;margin-right:14px;font-size:12px">
      <input type="checkbox" id="mp-sign-${i}" value="${s}" style="width:auto"${selected.includes(s) ? ' checked' : ''}> ${s}
    </label>`).join('');
}

function collectMpSigns() {
  return MP_CLINICAL_SIGNS.filter((_, i) => document.getElementById(`mp-sign-${i}`)?.checked);
}

// source를 넘기면 그 승인서 내용을 채운 채로 "새 발급" 화면을 연다(복제).
// editingId를 비워 두는 것이 핵심 — 저장하면 update가 아니라 insert로 간다.
function openMovePermitModal(id, source) {
  editingId.movePermit = id || null;
  const mp = id ? load('movePermits').find(x => x.id === id) : (source || null);
  const isDup = !id && !!source;
  document.getElementById('modal-mp-title').textContent =
    id ? '이동승인서 편집' : (isDup ? '이동승인서 발급 (복제)' : '이동승인서 발급');
  document.getElementById('mp-dup-hint').style.display = isDup ? '' : 'none';

  const today = new Date().toISOString().slice(0, 10);
  const last = mpLatest();
  const prefix = mp?.docNoPrefix ?? (last?.docNoPrefix || '');

  document.getElementById('mp-form-type').innerHTML = Object.entries(MP_FORM_TYPES).map(([k, v]) =>
    `<option value="${k}"${(mp?.formType || 'general') === k ? ' selected' : ''}>${v}</option>`).join('');
  document.getElementById('mp-doc-prefix').value = prefix;
  const serialEl = document.getElementById('mp-doc-serial');
  // 편집은 그 건의 번호를 그대로, 새 발급·복제는 다음 번호를 제안한다.
  serialEl.value = id ? (mp?.docNoSerial ?? '') : mpNextSerial(prefix);
  delete serialEl.dataset.manualEdit;
  document.getElementById('mp-issue-date').value = mp?.issueDate || today;

  populateFarmSelect('mp-farm', mp?.farmId || '');
  document.getElementById('mp-owner').value = mp?.owner || '';
  document.getElementById('mp-address').value = mp?.address || '';
  document.getElementById('mp-phone').value = mp?.phone || '';
  document.getElementById('mp-owner-birth').value = mp?.ownerBirth || '';
  document.getElementById('mp-head-count').value = mp?.headCount ?? '';

  renderMpClinicalSigns(mp?.clinicalSigns || []);
  document.getElementById('mp-dead-count').value = mp?.deadCount ?? '';
  document.getElementById('mp-laying-rate').value = mp?.layingRate ?? '';
  document.getElementById('mp-clinical-result').value = mp?.clinicalResult || '정상';

  document.getElementById('mp-sampling-date').value = mp?.samplingDate || '';
  document.getElementById('mp-test-result').value = mp?.testResult || '음성';
  document.getElementById('mp-test-16w').checked = !!mp?.test16w;
  document.getElementById('mp-test-36w').checked = !!mp?.test36w;
  document.getElementById('mp-test-56w').checked = !!mp?.test56w;
  document.getElementById('mp-mg-vaccine').value = mp?.mgVaccine || '';

  document.getElementById('mp-ship-to').value = mp?.shipTo || '';
  document.getElementById('mp-ship-count').value = mp?.shipCount ?? '';
  document.getElementById('mp-release-date').value = mp?.releaseDate || (isDup ? mp?.releaseDate : '') || today;
  document.getElementById('mp-vehicle-no').value = isDup ? '' : (mp?.vehicleNo || '');
  document.getElementById('mp-species').value = mp?.species || '';
  document.getElementById('mp-breed').value = mp?.breed || '';
  document.getElementById('mp-age-label').value = mp?.ageLabel || '';
  document.getElementById('mp-carrier-name').value = isDup ? '' : (mp?.carrierName || '');
  document.getElementById('mp-carrier-phone').value = isDup ? '' : (mp?.carrierPhone || '');
  document.getElementById('mp-note').value = mp?.note || '';

  onMpFormTypeChange();
  onMpFarmChange(false);
  openModal('modal-move-permit');
  if (isDup) document.getElementById('mp-carrier-name').focus();
}

// 같은 농장에서 차량만 바꿔 이어서 발급할 때. 운송인·차량번호는 비운 채로 연다.
function duplicateMovePermit(id) {
  const mp = load('movePermits').find(x => x.id === id);
  if (!mp) { alert('이동승인서를 찾을 수 없습니다.'); return; }
  openMovePermitModal(null, mp);
}

async function saveMovePermit() {
  const farmId = document.getElementById('mp-farm').value;
  const issueDate = document.getElementById('mp-issue-date').value;
  if (!farmId || !issueDate) { alert('농장과 발급일은 필수입니다.'); return; }
  const farm = load('farms').find(f => f.id === farmId);
  const val = id => document.getElementById(id).value.trim();
  const numVal = id => { const v = document.getElementById(id).value; return v === '' ? null : Number(v); };
  const data = {
    formType: document.getElementById('mp-form-type').value,
    docNoPrefix: val('mp-doc-prefix'), docNoSerial: numVal('mp-doc-serial'),
    issueDate, farmId, farmName: farm.name,
    owner: val('mp-owner'), address: val('mp-address'), phone: val('mp-phone'),
    ownerBirth: val('mp-owner-birth'), headCount: numVal('mp-head-count'),
    clinicalSigns: collectMpSigns(), deadCount: numVal('mp-dead-count'),
    layingRate: numVal('mp-laying-rate'), clinicalResult: val('mp-clinical-result') || '정상',
    samplingDate: document.getElementById('mp-sampling-date').value || null,
    testResult: val('mp-test-result'),
    test16w: document.getElementById('mp-test-16w').checked,
    test36w: document.getElementById('mp-test-36w').checked,
    test56w: document.getElementById('mp-test-56w').checked,
    mgVaccine: val('mp-mg-vaccine'),
    shipTo: val('mp-ship-to'), shipCount: numVal('mp-ship-count'),
    releaseDate: document.getElementById('mp-release-date').value || null,
    vehicleNo: val('mp-vehicle-no'),
    species: val('mp-species'), breed: val('mp-breed'), ageLabel: val('mp-age-label'),
    carrierName: val('mp-carrier-name'), carrierPhone: val('mp-carrier-phone'),
    note: val('mp-note'), issuedByEmail: await currentUserEmail(),
  };
  let saved;
  try {
    if (editingId.movePermit) saved = await updateRow('movePermits', editingId.movePermit, data);
    else saved = await insertRow('movePermits', data);
  } catch (e) { alert('저장 실패: ' + e.message); return; }
  const isNew = !editingId.movePermit;
  editingId.movePermit = null;
  closeModal('modal-move-permit');
  populateMpFarmFilter();
  renderMovePermits();
  if (isNew && confirm('이동승인서를 발급했습니다. 지금 인쇄하시겠습니까?')) printMovePermit(saved.id);
}

async function deleteMovePermit(id) {
  if (!confirm('이 이동승인서를 삭제하시겠습니까?')) return;
  try { await deleteRow('movePermits', id); } catch (e) { alert('삭제 실패: ' + e.message); return; }
  renderMovePermits();
}

// ─── A4 인쇄 (원본 서식의 11칸 × 16줄 배치를 그대로 옮김) ───────────────────
function mpCheck(on) { return on ? '■' : '□'; }

// 서식 안에서 날짜가 나오는 자리마다 표기 방식이 다르다(원본 엑셀의 서로 다른
// 셀 서식을 그대로 옮김) — 하나로 통일하면 실제 서식과 달라진다.
//   문서번호 줄  : "0716"      — 월일만, 구분자 없음(제 26-3-45 0716 호)
//   시료채취일 등: "07월 16일" — 월일만, 앞자리 0 유지
//   확인 서명란 : "2026년 7월 16일" — 연도 포함, 앞자리 0 없음(rxFormatDateKo와 동일)
function mpFormatMMDD(dateStr) {
  if (!dateStr) return '';
  const [, m, d] = dateStr.split('-');
  return `${m}${d}`;
}
function mpFormatDateMD(dateStr) {
  if (!dateStr) return '';
  const [, m, d] = dateStr.split('-');
  return `${m}월 ${d}일`;
}

function printMovePermit(id) {
  const mp = load('movePermits').find(x => x.id === id);
  if (!mp) return;
  const isBreeder = mp.formType === 'breeder';
  const signs = mp.clinicalSigns || [];
  const sign = s => `${mpCheck(signs.includes(s))} ${s}`;
  const n = v => (v == null || v === '' ? '' : Number(v).toLocaleString());

  // 7~9행만 서식에 따라 달라진다(위 주석의 표 참고).
  const row7 = isBreeder
    ? `<td class="lbl" colspan="3">임상관찰결과</td><td colspan="2">${mp.clinicalResult || ''}</td>
       <td class="lbl" colspan="3">정밀검사실시여부</td>
       <td class="ctr">${mpCheck(mp.test16w)}16주령</td><td class="ctr">${mpCheck(mp.test36w)}36주령</td><td class="ctr">${mpCheck(mp.test56w)}56주령</td>`
    : `<td class="lbl" colspan="3">임상관찰결과</td><td colspan="2">${mp.clinicalResult || ''}</td>
       <td class="lbl" colspan="3">시료채취일</td><td class="date">${mpFormatDateMD(mp.samplingDate)}</td>
       <td class="lbl">정밀검사<br>결과</td><td class="ctr">${mp.testResult || ''}</td>`;

  const row8 = isBreeder
    ? `<td class="lbl" colspan="2">출 하<br>수수(개수)</td><td colspan="2">${n(mp.shipCount)}</td>
       <td class="lbl" colspan="3">MG 백신 사용여부<br>(MG 백신명/접종일자)</td><td class="ctr">${mp.mgVaccine || ''}</td>
       <td class="lbl">운송차량<br>번　　호</td><td class="ctr">${mp.vehicleNo || ''}</td>`
    : `<td class="lbl" colspan="2">출 하</td><td colspan="2">${mp.shipTo || ''}</td>
       <td class="lbl" colspan="3">반출일</td><td class="date">${mpFormatDateMD(mp.releaseDate)}</td>
       <td class="lbl">운송차량<br>번호</td><td class="ctr">${mp.vehicleNo || ''}</td>`;

  const row9 = isBreeder
    ? `<td class="lbl" colspan="2">축 종</td><td>${mp.species || ''}</td>
       <td class="lbl">품종</td><td colspan="2">${mp.breed || ''}</td>
       <td class="lbl">운송인 성명<br>(구매자)</td><td class="ctr">${mp.carrierName || ''}</td>
       <td class="lbl">전화번호</td><td class="ctr">${mp.carrierPhone || ''}</td>`
    : `<td class="lbl" colspan="2">축 종</td><td>${mp.species || ''}</td>
       <td class="lbl">품종</td><td colspan="2">${mp.breed || ''}</td>
       <td class="lbl">일령</td><td class="ctr">${mp.ageLabel || ''}</td>
       <td class="lbl">운송인<br>성명</td><td class="ctr">${mp.carrierName || ''}</td>`;

  const closing = isBreeder
    ? ['상기 가축은 가축전염병예방법에 의거 임상 관찰, 정밀검사 결과 특이 증상이 없고, 정밀검사',
       '3회를 적절히 받았으며, 운반차량이 관련 규정에 의거 적절하게 청소·소독되었음을 확인합니다.']
    : ['상기 가축은 가축전염병예방법에 의거 임상 관찰, 정밀검사 결과 특이 증상이 없고',
       '운반차량이 관련 규정에 의거 적절하게 청소·소독되었음을 확인합니다.'];

  const html = `
  <div class="print-page">
    <table class="mp-table">
      <colgroup>${'<col style="width:9.09%">'.repeat(11)}</colgroup>
      <tr class="mp-docno-row">
        <td colspan="2" class="noborder">제 ${mp.docNoPrefix || ''} -</td>
        <td class="noborder ctr">${mp.docNoSerial ?? ''}</td>
        <td class="noborder date">${mpFormatMMDD(mp.issueDate)}</td>
        <td class="noborder">호</td>
        <td class="noborder" colspan="6"></td>
      </tr>
      <tr><td colspan="11" class="mp-title noborder">${isBreeder ? '가금류 이동 승인서' : '검사증명서(가금류 이동 승인서)'}</td></tr>
      <tr>
        <td class="lbl" rowspan="2">농장<br>현황</td>
        <td class="lbl">농장명</td><td colspan="2">${mp.farmName || ''}</td>
        <td class="lbl" colspan="2">주소</td><td colspan="3">${mp.address || ''}</td>
        <td class="lbl">사육두수</td><td class="ctr">${n(mp.headCount)}</td>
      </tr>
      <tr>
        <td class="lbl">대표자</td><td colspan="2">${mp.owner || ''}</td>
        <td class="lbl" colspan="2">주민등록번호</td><td colspan="3">${mp.ownerBirth || ''}</td>
        <td class="lbl">전화번호</td><td class="ctr">${mp.phone || ''}</td>
      </tr>
      <tr>
        <td class="lbl" rowspan="2">임상<br>검사</td>
        <td colspan="10" class="mp-signs">${[MP_CLINICAL_SIGNS[0], MP_CLINICAL_SIGNS[1], MP_CLINICAL_SIGNS[2], MP_CLINICAL_SIGNS[3], MP_CLINICAL_SIGNS[4]].map(sign).join('　')}</td>
      </tr>
      <tr>
        <td colspan="10" class="mp-signs">${sign(MP_CLINICAL_SIGNS[5])}　□ 최근 15일이내 폐사 수수 ( ${mp.deadCount ?? '　'} 수)　□ 산란율( ${mp.layingRate ?? '　'} %)</td>
      </tr>
      <tr>${row7}</tr>
      <tr>
        <td class="lbl" rowspan="5">출하<br><br>및<br><br>운송</td>
        ${row8}
      </tr>
      <tr>${row9}</tr>
      ${MP_VEHICLE_RULES.map((rule, i) => `<tr>
        ${i === 0 ? '<td class="lbl" colspan="2" rowspan="3">운 반<br>차 량</td>' : ''}
        <td colspan="8" class="mp-rule">■ ${rule}</td>
      </tr>`).join('')}
      <tr><td colspan="11" class="mp-closing noborder">${closing[0]}</td></tr>
      <tr><td colspan="11" class="mp-closing noborder">${closing[1]}</td></tr>
      <tr><td colspan="11" class="mp-date noborder">${rxFormatDateKo(mp.issueDate)}</td></tr>
      <tr><td colspan="11" class="mp-signer noborder">
        <span class="mp-signer-label">확 인 자(가축방역관 소속 및 성명)</span>
        <span class="mp-signer-name">${RX_CLINIC.name} ${RX_CLINIC.vetName} 수의사<img class="mp-stamp" src="img/rx-stamp-hospital.png" alt=""></span>
        (인 또는 서명)
      </td></tr>
    </table>
    ${mp.note ? `<div class="mp-note">비고 : ${mp.note}</div>` : ''}
  </div>`;

  document.getElementById('print-area').innerHTML = html;
  setTimeout(() => window.print(), 200);
}
