// ─── 공수의 업무: 출하전검사 (AI 시료채취 내역서) ──────────────────────────
// 원본 서식: AI-출하전검사.xlsx의 「의뢰서식」 시트. 한 장이 농장 한 곳 방문분이고,
// 아래쪽 "사육사별(동별) 시료채취 내역" 표는 동 수만큼 줄이 늘어난다.
//
// 시료채취자·의뢰기관은 매번 같은 값을 다시 적게 하지 않고 기본값으로 채운다.
// 병원 정보는 처방전과 같은 곳을 쓰므로 js/prescriptions.js의 RX_CLINIC을 그대로 참조한다
// (두 군데에 같은 값을 적어두면 한쪽만 고쳐져 서식마다 달라진다).
const PS_VET_TITLE = '파주시 공수의';
const PS_REQUEST_ORG = '파주시 방역팀 가축방역관';

// 검사목적 — 원본 서식의 "□ 검사목적" 칸에 들어가던 값들
const PS_PURPOSES = ['출하전검사', '정기검사', '수시검사', '이동전검사'];
const PS_HOUSING_TYPES = ['평사', '케이지', '방사', '기타'];

// 시료채취 내역 칸(원본 표의 열 순서 그대로)
const PS_SAMPLE_COLS = [
  { key: 'env', label: '환경' },
  { key: 'trachea', label: '인후두' },
  { key: 'cloaca', label: '총배설강' },
  { key: 'feces', label: '분변' },
  { key: 'carcass', label: '폐사체' },
];

let psRowSeq = 0;

function psDefaultSampler() {
  return {
    org: RX_CLINIC.name,
    title: PS_VET_TITLE,
    name: RX_CLINIC.vetName + ' 수의사',
    phone: RX_CLINIC.phone,
  };
}

// 일련번호 자동표기: yymmdd + 그 날짜로 이미 등록된 건수 다음 번호(예: 260909-1, -2).
// docNo가 "yymmdd-N" 형식이 아닌 예전 기록(수기 번호 등)은 그냥 카운트에서 빠진다 —
// 이 형식은 지금부터 적용하는 새 규칙이라 과거 데이터까지 맞출 필요는 없다.
function psNextDocNo(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const prefix = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const used = load('preShipments')
    .filter(p => (p.docNo || '').startsWith(prefix + '-'))
    .map(p => Number(p.docNo.split('-')[1]) || 0);
  return `${prefix}-${used.length ? Math.max(...used) + 1 : 1}`;
}

// 시료채취일을 바꾸면 그 날짜 기준으로 다시 제안한다. 편집 중이거나 사용자가 직접 적어둔
// 상태면 건드리지 않는다(movePermit.js의 onMpPrefixInput과 같은 패턴).
function onPsSampledAtChange() {
  const docNoEl = document.getElementById('ps-doc-no');
  if (editingId.preShipment || docNoEl.dataset.manualEdit === '1') return;
  docNoEl.value = psNextDocNo(document.getElementById('ps-sampled-at').value);
}

// 새로 추가하는 동별 줄의 기본값. 사육사는 몇 번째 줄인지로 "N동"을 채우고, 사육수수는
// 사육규모÷사육동수를 백 단위로 반올림해 어림한다(예: 3,333 -> 3,300 — 실제 계군수는
// 동마다 조금씩 달라 십 단위까지 정확한 척 보여줄 필요가 없다). 일령은 사육현황 칸의
// 일령을 그대로 물려받아 두 곳이 어긋나지 않게 한다. 인후두·총배설강은 AI 채취 표준
// 수량인 5로, 기타임상증상은 "정상"으로 미리 채운다 — 전부 그대로 두는 경우가
// 대부분이고, 다를 때만 고쳐 쓰면 되게 하기 위함이다. 기존 저장 데이터를 불러올
// 때(row가 있을 때)는 이 기본값을 쓰지 않는다.
function psDefaultRow(rowNum) {
  const scale = Number(document.getElementById('ps-scale')?.value) || 0;
  const houseCount = Number(document.getElementById('ps-house-count')?.value) || 0;
  const ageDays = document.getElementById('ps-age-days')?.value || '';
  return {
    house: `${rowNum}동`,
    count: (scale && houseCount) ? Math.round(scale / houseCount / 100) * 100 : null,
    ageDays: ageDays !== '' ? Number(ageDays) : null,
    clinical: '정상',
    deadCount: 5,
    trachea: 5,
    cloaca: 5,
  };
}

// ─── 목록 ───────────────────────────────────────────────────────────────────
function populatePsFarmFilter() {
  const sel = document.getElementById('ps-filter-farm');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">전체 농장</option>' + farmsByOwner().map(f =>
    `<option value="${f.id}"${f.id === cur ? ' selected' : ''}>${f.name} (${f.owner})</option>`
  ).join('');
}

// 동별 채취 점수를 "환경5 · 인후두5" 처럼 한 줄로 줄여 목록에 보여준다.
function psSampleSummary(ps) {
  const total = {};
  (ps.rows || []).forEach(r => {
    PS_SAMPLE_COLS.forEach(c => {
      const n = Number(r[c.key]) || 0;
      if (n) total[c.key] = (total[c.key] || 0) + n;
    });
  });
  const parts = PS_SAMPLE_COLS.filter(c => total[c.key]).map(c => `${c.label}${total[c.key]}`);
  return parts.length ? parts.join(' · ') : '-';
}

function renderPreShipments() {
  const q = (document.getElementById('ps-search')?.value || '').toLowerCase();
  const ff = document.getElementById('ps-filter-farm')?.value || '';
  const list = load('preShipments').filter(p =>
    (!q || (p.farmName || '').toLowerCase().includes(q) || (p.owner || '').toLowerCase().includes(q)) &&
    (!ff || p.farmId === ff)
  // 최근 채취일이 위로 오게 정렬한다(같은 날은 출하일, 그다음 등록 순서가 최근인 것 먼저).
  ).sort((a, b) =>
    (b.sampledAt || '').localeCompare(a.sampledAt || '') ||
    (b.shipDate || '').localeCompare(a.shipDate || '') ||
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
  // 삭제된 항목의 선택 표시가 남지 않도록, 지금 존재하는 id만 유지한다.
  const liveIds = new Set(load('preShipments').map(p => p.id));
  psSelectedIds.forEach(id => { if (!liveIds.has(id)) psSelectedIds.delete(id); });

  const printBtn = document.getElementById('ps-print-btn');
  const editBtn = document.getElementById('ps-edit-btn');
  const deleteBtn = document.getElementById('ps-delete-btn');
  if (printBtn) printBtn.disabled = psSelectedIds.size === 0;
  if (editBtn) editBtn.disabled = psSelectedIds.size !== 1;
  if (deleteBtn) deleteBtn.disabled = psSelectedIds.size === 0;

  const tbody = document.getElementById('ps-tbody');
  const empty = document.getElementById('ps-empty');
  const checkAll = document.getElementById('ps-check-all');
  if (!list.length) {
    tbody.innerHTML = ''; empty.style.display = '';
    if (checkAll) checkAll.checked = false;
    return;
  }
  empty.style.display = 'none';
  if (checkAll) checkAll.checked = list.every(p => psSelectedIds.has(p.id));
  tbody.innerHTML = list.map(p => `
    <tr>
      <td style="text-align:center"><input type="checkbox" ${psSelectedIds.has(p.id) ? 'checked' : ''} onchange="togglePsSelect('${p.id}', this.checked)"></td>
      <td>${p.sampledAt}</td>
      <td><strong>${p.farmName}</strong><div style="font-size:11px;color:var(--text-secondary)">${p.owner || ''}</div></td>
      <td>${p.species || '-'}</td>
      <td>${p.scale ? Number(p.scale).toLocaleString() + '수' : '-'}${p.houseCount ? ' · ' + p.houseCount + '동' : ''}</td>
      <td>${p.purpose || '-'}</td>
      <td>${(p.rows || []).length}동</td>
      <td style="font-size:11px">${psSampleSummary(p)}</td>
      <td>${p.shipDate || '-'}</td>
    </tr>`).join('');
}

function editSelectedPreShipment() {
  if (psSelectedIds.size !== 1) return;
  openPreShipmentModal([...psSelectedIds][0]);
}

async function deleteSelectedPreShipments() {
  if (!psSelectedIds.size) return;
  if (!confirm(`선택한 출하전검사 ${psSelectedIds.size}건을 삭제하시겠습니까?`)) return;
  try {
    for (const id of psSelectedIds) await deleteRow('preShipments', id);
  } catch (e) { alert('삭제 실패: ' + e.message); return; }
  psSelectedIds.clear();
  renderPreShipments();
}

// ─── 동별 시료채취 내역 줄 ─────────────────────────────────────────────────
function psRowHtml(idx, row, isSaved) {
  const v = k => (row && row[k] != null ? row[k] : '');
  // 저장된 기존 값을 불러온 줄(isSaved)은 사육현황이 바뀌어도 recalcPsRowDefaults()가
  // 건드리지 않게 처음부터 manualEdit 표시를 붙여 둔다 — 새로 만든 기본값 줄만
  // "아직 안 건드림" 상태로 둬서 사육현황을 따라가게 한다.
  const lockAttr = isSaved ? " data-manual-edit=\"1\"" : '';
  const sampleInputs = PS_SAMPLE_COLS.map(c =>
    `<td><input id="ps-${c.key}-${idx}" type="number" min="0" value="${v(c.key)}" style="width:100%"></td>`
  ).join('');
  return `<tr id="ps-row-${idx}">
    <td><input id="ps-house-${idx}" value="${v('house')}" placeholder="예) 1동" style="width:100%"></td>
    <td><input id="ps-count-${idx}" type="number" min="0" value="${v('count')}" oninput="this.dataset.manualEdit='1'"${lockAttr} style="width:100%"></td>
    <td><input id="ps-age-${idx}" type="number" min="0" value="${v('ageDays')}" oninput="this.dataset.manualEdit='1'"${lockAttr} style="width:100%"></td>
    <td><input id="ps-dead-${idx}" type="number" min="0" value="${v('deadCount')}" style="width:100%"></td>
    <td><input id="ps-clinical-${idx}" value="${v('clinical')}" style="width:100%"></td>
    ${sampleInputs}
    <td><input id="ps-note-${idx}" value="${v('note')}" placeholder="예) 계사,시설" style="width:100%"></td>
    <td style="text-align:center"><button type="button" class="btn btn-danger btn-sm" onclick="removePsRow(${idx})">×</button></td>
  </tr>`;
}

function addPsRow(row) {
  const tbody = document.getElementById('ps-rows-body');
  if (!tbody) return;
  const data = row || psDefaultRow(tbody.children.length + 1);
  tbody.insertAdjacentHTML('beforeend', psRowHtml(psRowSeq, data, !!row));
  psRowSeq++;
}

function removePsRow(idx) {
  document.getElementById(`ps-row-${idx}`)?.remove();
}

function collectPsRows() {
  const rows = [];
  document.querySelectorAll('#ps-rows-body tr').forEach(tr => {
    const idx = tr.id.replace('ps-row-', '');
    const num = k => {
      const el = document.getElementById(`ps-${k}-${idx}`);
      return el && el.value !== '' ? Number(el.value) : null;
    };
    const text = k => document.getElementById(`ps-${k}-${idx}`)?.value.trim() || '';
    const row = {
      house: text('house'), count: num('count'), ageDays: num('age'), deadCount: num('dead'),
      clinical: text('clinical'), note: text('note'),
    };
    PS_SAMPLE_COLS.forEach(c => { row[c.key] = num(c.key); });
    // 아무것도 안 적은 빈 줄은 저장하지 않는다(서식에 빈 칸만 있는 줄이 인쇄된다).
    const hasSample = PS_SAMPLE_COLS.some(c => row[c.key]);
    if (row.house || row.count || hasSample) rows.push(row);
  });
  return rows;
}

// ─── 입력/편집 ─────────────────────────────────────────────────────────────
// 농장을 고르면 등록된 농장 정보로 채운다. 이미 손으로 고쳐 둔 칸은 덮지 않는다
// (편집 모달을 다시 열었을 때 그때 제출한 값이 그대로 보여야 하므로).
function onPsFarmChange(force) {
  const farm = load('farms').find(f => f.id === document.getElementById('ps-farm').value);
  const info = document.getElementById('ps-farm-info');
  if (!farm) {
    info.textContent = '농장을 선택하면 소재지·축주·연락처·사육규모가 자동으로 채워집니다.';
    return;
  }
  info.textContent = [
    `축주 ${farm.owner || '-'}`, `연락처 ${farm.phone || '-'}`,
    `소재지 ${farm.address || '-'}`, `축종 ${farm.type || '-'}`,
  ].join(' · ');
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el && (force || !el.value)) el.value = val ?? '';
  };
  set('ps-owner', farm.owner);
  set('ps-address', farm.address);
  set('ps-phone', farm.phone);
  set('ps-scale', farm.count);
  set('ps-house-count', farm.houses);
  set('ps-species', farm.type);
  set('ps-ship-count', farm.count);
  // 품종·일령은 농장이 아니라 계군(입추)에 있다. 사육중인 계군이 있으면 거기서 가져온다.
  const b = load('batches')
    .filter(x => x.farmId === farm.id && x.status === 'active')
    .sort((a, c) => (c.placementDate || '').localeCompare(a.placementDate || ''))[0];
  if (b) {
    const speciesKey = speciesKeyOf(b.species);
    const breedName = (speciesKey && CONSULT_BREEDS[speciesKey]?.breeds[b.breed]?.name) || b.breed || '';
    if (breedName) set('ps-breed', breedName);
    const age = computeDayAge(b.placementDate);
    if (age >= 1) set('ps-age-days', age);
  }
  // 농장을 고르기 전에 이미 추가돼 있던 줄(모달을 열 때 자동으로 생기는 첫 줄 등)은
  // psDefaultRow()가 그때는 사육규모·사육동수가 비어 있어 사육수수를 못 채웠다.
  // 그래서 여기서도 한 번 더 채워준다 — 사용자가 직접 고친 칸은 건드리지 않는다.
  recalcPsRowDefaults();
}

// 사육현황(사육규모/사육동수/일령)이 바뀔 때마다 아직 손대지 않은 줄들의 사육수수·일령을
// 다시 계산해 채운다. 사용자가 그 칸을 직접 고치면 psRowHtml에서 dataset.manualEdit를
// 남기므로, 그 표시가 없는 칸만 갱신한다(직접 고친 값을 덮어쓰지 않기 위함).
function recalcPsRowDefaults() {
  const tbody = document.getElementById('ps-rows-body');
  if (!tbody) return;
  const scale = Number(document.getElementById('ps-scale')?.value) || 0;
  const houseCount = Number(document.getElementById('ps-house-count')?.value) || 0;
  const ageDays = document.getElementById('ps-age-days')?.value || '';
  const count = (scale && houseCount) ? Math.round(scale / houseCount / 100) * 100 : null;
  [...tbody.children].forEach(tr => {
    const idx = tr.id.replace('ps-row-', '');
    const countEl = document.getElementById(`ps-count-${idx}`);
    const ageEl = document.getElementById(`ps-age-${idx}`);
    if (countEl && countEl.dataset.manualEdit !== '1' && count != null) countEl.value = count;
    if (ageEl && ageEl.dataset.manualEdit !== '1' && ageDays !== '') ageEl.value = ageDays;
  });
}

function openPreShipmentModal(id) {
  editingId.preShipment = id || null;
  const ps = id ? load('preShipments').find(x => x.id === id) : null;
  document.getElementById('modal-ps-title').textContent = id ? '출하전검사 서식 편집' : '출하전검사 서식 작성';

  populateFarmSelect('ps-farm', ps?.farmId || '');
  const today = new Date().toISOString().slice(0, 10);
  const sampler = psDefaultSampler();

  const docNoEl = document.getElementById('ps-doc-no');
  docNoEl.value = ps?.docNo || psNextDocNo(ps?.sampledAt || today);
  delete docNoEl.dataset.manualEdit;
  document.getElementById('ps-purpose').innerHTML = PS_PURPOSES.map(p =>
    `<option value="${p}"${ps?.purpose === p ? ' selected' : ''}>${p}</option>`).join('');
  if (!ps) document.getElementById('ps-purpose').value = '출하전검사';
  document.getElementById('ps-sampled-at').value = ps?.sampledAt || today;
  document.getElementById('ps-owner').value = ps?.owner || '';
  document.getElementById('ps-address').value = ps?.address || '';
  document.getElementById('ps-phone').value = ps?.phone || '';
  document.getElementById('ps-scale').value = ps?.scale ?? '';
  document.getElementById('ps-house-count').value = ps?.houseCount ?? '';
  document.getElementById('ps-species').value = ps?.species || '';
  document.getElementById('ps-breed').value = ps?.breed || '';
  document.getElementById('ps-housing-type').innerHTML = PS_HOUSING_TYPES.map(t =>
    `<option value="${t}"${ps?.housingType === t ? ' selected' : ''}>${t}</option>`).join('');
  document.getElementById('ps-ship-date').value = ps?.shipDate || '';
  document.getElementById('ps-ship-houses').value = ps?.shipHouses || '';
  document.getElementById('ps-ship-count').value = ps?.shipCount ?? '';
  document.getElementById('ps-age-days').value = ps?.ageDays ?? '';
  document.getElementById('ps-etc-note').value = ps?.etcNote || '';
  document.getElementById('ps-sampler-org').value = ps?.samplerOrg || sampler.org;
  document.getElementById('ps-sampler-title').value = ps?.samplerTitle || sampler.title;
  document.getElementById('ps-sampler-name').value = ps?.samplerName || sampler.name;
  document.getElementById('ps-sampler-phone').value = ps?.samplerPhone || sampler.phone;
  document.getElementById('ps-request-org').value = ps?.requestOrg || `${PS_REQUEST_ORG} ${RX_CLINIC.name} ${RX_CLINIC.vetName} 수의사`;
  document.getElementById('ps-requested-at').value = ps?.requestedAt || today;

  psRowSeq = 0;
  document.getElementById('ps-rows-body').innerHTML = '';
  const rows = ps?.rows || [];
  if (rows.length) rows.forEach(addPsRow);
  else addPsRow();

  onPsFarmChange(false);
  openModal('modal-pre-shipment');
}

async function savePreShipment() {
  const farmId = document.getElementById('ps-farm').value;
  const sampledAt = document.getElementById('ps-sampled-at').value;
  if (!farmId || !sampledAt) { alert('농장과 시료채취일은 필수입니다.'); return; }
  const rows = collectPsRows();
  if (!rows.length) { alert('동별 시료채취 내역을 한 줄 이상 입력해주세요.'); return; }
  const farm = load('farms').find(f => f.id === farmId);
  const val = id => document.getElementById(id).value.trim();
  const numVal = id => { const v = document.getElementById(id).value; return v === '' ? null : Number(v); };
  const data = {
    docNo: val('ps-doc-no'), purpose: document.getElementById('ps-purpose').value,
    sampledAt, farmId, farmName: farm.name,
    owner: val('ps-owner'), address: val('ps-address'), phone: val('ps-phone'),
    scale: numVal('ps-scale'), houseCount: numVal('ps-house-count'),
    species: val('ps-species'), breed: val('ps-breed'),
    housingType: document.getElementById('ps-housing-type').value,
    shipDate: document.getElementById('ps-ship-date').value || null,
    shipHouses: val('ps-ship-houses'), shipCount: numVal('ps-ship-count'),
    ageDays: numVal('ps-age-days'), etcNote: val('ps-etc-note'),
    rows,
    samplerOrg: val('ps-sampler-org'), samplerTitle: val('ps-sampler-title'),
    samplerName: val('ps-sampler-name'), samplerPhone: val('ps-sampler-phone'),
    requestOrg: val('ps-request-org'),
    requestedAt: document.getElementById('ps-requested-at').value || null,
    createdByEmail: await currentUserEmail(),
  };
  let saved;
  try {
    if (editingId.preShipment) saved = await updateRow('preShipments', editingId.preShipment, data);
    else saved = await insertRow('preShipments', data);
  } catch (e) { alert('저장 실패: ' + e.message); return; }
  const isNew = !editingId.preShipment;
  editingId.preShipment = null;
  closeModal('modal-pre-shipment');
  populatePsFarmFilter();
  renderPreShipments();
  if (isNew && confirm('출하전검사 서식을 저장했습니다. 지금 인쇄하시겠습니까?')) printPreShipment(saved.id);
}

// ─── A4 인쇄 (원본 「의뢰서식」 시트 배치를 그대로 옮김) ────────────────────
// buildPreShipmentHtml()은 한 건의 .print-page 마크업만 만들고, 실제 출력은
// printPreShipment()(한 건) / printSelectedPreShipments()(여러 건)가 맡는다.
// 여러 건을 이어붙여도 각 페이지가 print-page(page-break-after: always)라
// 인쇄 대화상자를 한 번만 띄우면서 건마다 새 용지로 넘어간다.
function buildPreShipmentHtml(ps) {
  const n = v => (v == null || v === '' ? '' : Number(v).toLocaleString());
  const sampleTotals = {};
  PS_SAMPLE_COLS.forEach(c => {
    sampleTotals[c.key] = (ps.rows || []).reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
  });

  const bodyRows = (ps.rows || []).map(r => `
    <tr>
      <td class="ctr">${r.house || ''}</td>
      <td class="ctr">${n(r.count)}</td>
      <td class="ctr">${r.ageDays ?? ''}</td>
      <td class="ctr">${r.deadCount ?? ''}</td>
      <td class="ctr">${r.clinical || ''}</td>
      ${PS_SAMPLE_COLS.map(c => `<td class="ctr">${r[c.key] ?? ''}</td>`).join('')}
      <td>${r.note || ''}</td>
    </tr>`).join('');

  return `
  <div class="print-page">
    <div class="ps-title">시료채취 내역서</div>
    <div class="ps-docno">No. ${ps.docNo || ''}</div>

    <table class="ps-head">
      <tr><td class="lbl">□ 검사목적</td><td colspan="5">${ps.purpose || ''}</td></tr>
      <tr><td class="lbl">□ 시료채취일</td><td colspan="5">${ps.sampledAt || ''}</td></tr>
      <tr>
        <td class="lbl">□ 시료채취자</td><td>${ps.samplerOrg || ''}</td>
        <td class="lbl2">${ps.samplerTitle || ''}</td><td>${ps.samplerName || ''}</td>
        <td class="lbl2">(연락처)</td><td>${ps.samplerPhone || ''}</td>
      </tr>
      <tr><td class="lbl">□ 농장명</td><td colspan="5">${ps.farmName || ''}</td></tr>
      <tr>
        <td class="lbl">&nbsp;&nbsp;○ 소재지</td><td colspan="3">${ps.address || ''}</td>
        <td class="lbl2">○ 전화번호</td><td>${ps.phone || ''}</td>
      </tr>
      <tr><td class="lbl">&nbsp;&nbsp;○ 축주명</td><td colspan="5">${ps.owner || ''}</td></tr>
      <tr><td class="lbl">□ 사육현황</td><td colspan="5"></td></tr>
      <tr>
        <td class="lbl">&nbsp;&nbsp;○ 사육규모</td><td>${n(ps.scale)}</td>
        <td class="lbl2">○ 사육동수</td><td>${ps.houseCount ?? ''}</td>
        <td class="lbl2">○ 사육형태</td><td>${ps.housingType || ''}</td>
      </tr>
      <tr>
        <td class="lbl">&nbsp;&nbsp;○ 축　　종</td><td>${ps.species || ''}</td>
        <td class="lbl2">○ 품　　종</td><td>${ps.breed || ''}</td>
        <td class="lbl2">○ 일　　령</td><td>${ps.ageDays ?? ''}</td>
      </tr>
      ${ps.shipDate ? `<tr>
        <td class="lbl">□ 출하예정</td><td colspan="5">${ps.shipDate}</td>
      </tr>` : ''}
    </table>

    <div class="ps-section">□ 사육사별(동별) 시료채취 내역</div>
    <table class="ps-table">
      <thead>
        <tr>
          <th rowspan="2">사육사<br>(동,품종)</th><th rowspan="2">사육<br>수수</th>
          <th rowspan="2">일령<br>(주령)</th><th rowspan="2">폐사<br>수수</th>
          <th rowspan="2">기타<br>임상증상*</th>
          <th colspan="${PS_SAMPLE_COLS.length}">시료채취 내역</th>
          <th rowspan="2">비고</th>
        </tr>
        <tr>${PS_SAMPLE_COLS.map(c => `<th>${c.label}${c.key === 'carcass' ? '**' : ''}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${bodyRows}
        <tr class="ps-total">
          <td class="ctr">합계</td>
          <td class="ctr">${n((ps.rows || []).reduce((s, r) => s + (Number(r.count) || 0), 0))}</td>
          <td colspan="3"></td>
          ${PS_SAMPLE_COLS.map(c => `<td class="ctr">${sampleTotals[c.key] || ''}</td>`).join('')}
          <td></td>
        </tr>
      </tbody>
    </table>
    <div class="ps-foot-note">
      * 기타 임상증상 : 폐사 이외의 모든 임상증상을 기록<br>
      ** 폐사체 : 폐사체는 폐사가 있는 동에 한하여 동별 5수 이하
    </div>
    ${ps.etcNote ? `<div class="ps-foot-note">□ 기타사항 : ${ps.etcNote}</div>` : ''}

    <div class="ps-request">상기 시료에 대한 AI 검사(항원)를 의뢰합니다.</div>
    <table class="ps-head">
      <tr><td class="lbl">□ 의뢰 기관</td><td colspan="5">${ps.requestOrg || ''}</td></tr>
      <tr><td class="lbl">□ 의뢰 일자</td><td colspan="5">${ps.requestedAt || ''}</td></tr>
    </table>
  </div>`;
}

function printPreShipment(id) {
  const ps = load('preShipments').find(x => x.id === id);
  if (!ps) return;
  document.getElementById('print-area').innerHTML = buildPreShipmentHtml(ps);
  setTimeout(() => window.print(), 200);
}

// 목록 왼쪽 체크박스로 고른 여러 건을 인쇄·편집·삭제에 함께 쓴다(처방전 발급과 같은 패턴).
let psSelectedIds = new Set();

function togglePsSelectAll(checked) {
  const ids = load('preShipments').map(p => p.id);
  psSelectedIds = checked ? new Set(ids) : new Set();
  renderPreShipments();
}
function togglePsSelect(id, checked) {
  if (checked) psSelectedIds.add(id); else psSelectedIds.delete(id);
  renderPreShipments();
}

function printSelectedPreShipments() {
  const list = load('preShipments').filter(p => psSelectedIds.has(p.id));
  if (!list.length) { alert('인쇄할 항목을 먼저 체크해주세요.'); return; }
  document.getElementById('print-area').innerHTML = list.map(buildPreShipmentHtml).join('');
  setTimeout(() => window.print(), 200);
}

// ─── 엑셀 출력: AI 검사를 위한 현장 시료채취 결과 기록대장 (<서식 1>) ─────────
// 공수의사 → 시군 제출 양식. 채취일이 같은 농장을 이어 적고, 날짜가 끝날 때마다
// "북부시험소" 줄을 넣는다(시료를 시험소에 의뢰한 방문). 한 날 농장을 3곳 이상
// 돌면 그날 시험소 줄의 "8H초과 차감시간"에 1을 적는다.
// 서식(글꼴·테두리·열 너비)을 살려야 해서 스타일을 지원하는 ExcelJS를 필요할 때만 불러온다.
const PS_LAB_NAME = '북부시험소';
const PS_LAB_ADDRESS = '경기도 양주시 고덕로 229-26';
const PS_OVER8H_MIN_FARMS = 3;

// <서식 2> 시료채취비용 지급 신청서 — 같은 파일의 두 번째 시트로 함께 저장한다.
// 시간 기준은 원본 서식의 값: 농가당 2시간, 시험소 방문 1회당 3시간, 시간당 26,500원,
// 8시간 초과 차감은 시험소 줄에 1이 찍힌 날마다 1시간.
const PS_FEE = { hourly: 26500, hoursPerFarm: 2, hoursPerLabVisit: 3, over8hDeduct: 1 };
const PS_APPLICANT = {
  address: '경기도 파주시 청석로300,920-302',
  account: 'SC제일은행 402-20-552944',
};

function loadExcelJs() {
  if (window.ExcelJS) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('엑셀 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.'));
    document.head.appendChild(s);
  });
}

function psExcelRange() {
  return { from: document.getElementById('ps-xl-from').value, to: document.getElementById('ps-xl-to').value };
}

function psExcelTargets() {
  const { from, to } = psExcelRange();
  return load('preShipments')
    .filter(p => p.sampledAt && (!from || p.sampledAt >= from) && (!to || p.sampledAt <= to))
    // 날짜 오름차순(기록대장은 시간순), 같은 날은 등록 순서
    .sort((a, b) => a.sampledAt.localeCompare(b.sampledAt) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

function openPsExcelModal() {
  const dates = load('preShipments').map(p => p.sampledAt).filter(Boolean).sort();
  // 기본 구간: 가장 최근 채취일이 속한 달 전체
  const last = dates[dates.length - 1] || new Date().toISOString().slice(0, 10);
  const [y, m] = last.split('-');
  document.getElementById('ps-xl-from').value = `${y}-${m}-01`;
  document.getElementById('ps-xl-to').value = `${y}-${m}-${String(new Date(Number(y), Number(m), 0).getDate()).padStart(2, '0')}`;
  updatePsExcelCount();
  openModal('modal-ps-excel');
}

// 파일은 구간이 정해질 때마다 미리 만들어 두고, "엑셀 저장"을 누르면 곧바로 내려받는다.
// 클릭 후 파일을 만드느라 기다리면 브라우저(Brave 등)가 클릭과 무관한 자동 다운로드로 보고
// "다운로드 권한 필요"로 막기 때문이다.
let psXlPrepared = null; // { key, blob, fileName }
let psXlSeq = 0;

function updatePsExcelCount() {
  const list = psExcelTargets();
  const days = new Set(list.map(p => p.sampledAt)).size;
  const countEl = document.getElementById('ps-xl-count');
  const btn = document.getElementById('ps-xl-btn');
  psXlPrepared = null;
  if (!list.length) {
    countEl.textContent = '해당 구간에 출하전검사가 없습니다.';
    btn.disabled = true;
    return;
  }
  const summary = `해당 구간: ${days}일 · 농장 ${list.length}건`;
  countEl.textContent = `${summary} — 파일 준비 중...`;
  btn.disabled = true;
  const seq = ++psXlSeq;
  buildPsExcelFile(list, psExcelRange()).then(file => {
    if (seq !== psXlSeq) return; // 그사이 구간이 바뀜
    psXlPrepared = file;
    countEl.textContent = summary;
    btn.disabled = false;
  }).catch(e => {
    if (seq !== psXlSeq) return;
    countEl.textContent = `${summary} — 파일을 만들지 못했습니다: ${e.message}`;
  });
}

function exportPsExcel() {
  if (!psXlPrepared) { alert('파일을 준비하는 중입니다. 잠시 후 다시 눌러주세요.'); return; }
  // Brave에서도 받아지는 XLSX.writeFile(양식 다운로드)과 같은 방식으로 내려받는다:
  // octet-stream 형식, 임시 주소는 60초 뒤 해제(브라우저가 다운로드를 확인하는 동안
  // 주소가 먼저 사라지면 받기에 실패한다).
  const url = URL.createObjectURL(psXlPrepared.blob);
  const a = document.createElement('a');
  a.download = psXlPrepared.fileName;
  a.href = url;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  closeModal('modal-ps-excel');
}

// 채취건수 칸: 동별 표의 점수 중 가장 큰 값을 항목별로 "분변5점\n인후두5점" 식으로 적는다
// (동마다 5점씩 뽑는 것이 표준이라 동 수만큼 곱하지 않는다).
function psSampleCountText(ps) {
  const order = ['feces', 'trachea', 'cloaca', 'env', 'carcass'];
  const label = Object.fromEntries(PS_SAMPLE_COLS.map(c => [c.key, c.label]));
  return order.map(k => {
    const mx = Math.max(0, ...(ps.rows || []).map(r => Number(r[k]) || 0));
    return mx ? `${label[k]}${mx}점` : '';
  }).filter(Boolean).join('\n');
}

async function buildPsExcelFile(list, range) {
  const fileName = `시료채취결과기록대장_${range.from || list[0].sampledAt}_${range.to || list[list.length - 1].sampledAt}.xlsx`;
  await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  [4.9, 8.9, 13.1, 8.8, 9, 31, 9.4, 7.3, 8.8, 9.3, 8.8].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const thin = { style: 'thin' };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const center = { horizontal: 'center', vertical: 'middle', wrapText: true };

  ws.getCell('A1').value = '<서식 1>';
  ws.getCell('A1').font = { name: '맑은 고딕', size: 10 };
  ws.mergeCells('A2:J2');
  ws.getCell('A2').value = 'AI 검사를 위한 현장 시료채취 결과 기록대장(공수의사 → 시군)';
  ws.getCell('A2').font = { name: 'HY헤드라인M', size: 14 };
  ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 26.4; ws.getRow(3).height = 16.2; ws.getRow(4).height = 35.4;

  ['연번', '채취일자', '농장주', '농장명', '축종', '소재지', '사육수수', '동수', '채취건수', '비고', '8H초과\n차감시간']
    .forEach((h, i) => {
      const c = ws.getCell(4, i + 1);
      c.value = h; c.font = { name: '맑은 고딕', size: i === 10 ? 10 : 11, bold: true };
      c.alignment = center; c.border = box;
    });

  const byDate = new Map();
  list.forEach(p => { if (!byDate.has(p.sampledAt)) byDate.set(p.sampledAt, []); byDate.get(p.sampledAt).push(p); });

  let r = 5, no = 1, farmCount = 0, labVisits = 0, over8h = 0;
  const f9 = { name: '맑은 고딕', size: 9 };
  const put = (col, v, opt = {}) => {
    const c = ws.getCell(r, col);
    c.value = v; c.font = opt.font || f9; c.border = box;
    c.alignment = { horizontal: opt.left ? 'left' : 'center', vertical: 'middle', wrapText: !!opt.wrap };
    if (opt.fmt) c.numFmt = opt.fmt;
  };
  for (const [date, farms] of byDate) {
    // 엑셀 날짜는 UTC 자정 기준 값으로 넣어야 시간대와 상관없이 같은 날짜로 보인다
    const [yy, mm, dd] = date.split('-').map(Number);
    const d = new Date(Date.UTC(yy, mm - 1, dd));
    for (const p of farms) {
      ws.getRow(r).height = 27;
      put(1, no++);
      put(2, d, { font: { name: '돋움', size: 11 }, fmt: 'mm/dd' });
      put(3, p.owner || '', { font: { name: '굴림체', size: 11 } });
      put(4, p.farmName || '', { font: { name: '돋움', size: 9 } });
      put(5, p.species || '');
      put(6, p.address || '', { left: true });
      put(7, p.scale ?? '');
      put(8, p.houseCount ?? ((p.rows || []).length || ''));
      put(9, psSampleCountText(p), { wrap: true });
      put(10, ''); put(11, '');
      r++; farmCount++;
    }
    const over = farms.length >= PS_OVER8H_MIN_FARMS;
    ws.getRow(r).height = 27;
    put(1, no++); put(2, '');
    put(3, PS_LAB_NAME, { font: { name: '굴림체', size: 10 } });
    put(4, '-', { font: { name: '돋움', size: 9 } }); put(5, '-');
    put(6, PS_LAB_ADDRESS, { left: true }); put(7, '-'); put(8, '-'); put(9, '', { wrap: true });
    put(10, '샘플링시료\n검사의뢰', { wrap: true });
    put(11, over ? 1 : '');
    r++; labVisits++; if (over) over8h++;
  }

  ws.getRow(r).height = 21.6;
  const foot = (col, v) => {
    const c = ws.getCell(r, col);
    c.value = v; c.font = { name: '맑은 고딕', size: 11 }; c.alignment = { horizontal: 'center', vertical: 'middle' };
  };
  ws.mergeCells(r, 1, r, 2);
  foot(1, '농가수'); foot(3, farmCount); foot(4, '개소');
  foot(7, '시험소'); foot(8, labVisits); foot(9, '회방문'); foot(11, over8h);

  // 신청서 작성일: 조회한 구간(종료일)이 속한 달의 말일
  const refDate = (range.to || list[list.length - 1].sampledAt).split('-').map(Number);
  const monthEnd = new Date(refDate[0], refDate[1], 0);
  buildPsFeeSheet(wb, { farmCount, labVisits, over8h, monthEnd });

  const buf = await wb.xlsx.writeBuffer();
  return { fileName, blob: new Blob([buf], { type: 'application/octet-stream' }) };
}

function buildPsFeeSheet(wb, { farmCount, labVisits, over8h, monthEnd }) {
  const ws = wb.addWorksheet('Sheet2');
  [23.9, 17.1, 8.8, 15.4, 8.8, 5.4].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const F = (size) => ({ name: 'HY헤드라인M', size });
  const dbl = { style: 'double' }, thin = { style: 'thin' };
  const set = (addr, v, size, align, extra = {}) => {
    const c = ws.getCell(addr);
    c.value = v; c.font = F(size);
    c.alignment = { horizontal: align, vertical: 'middle' };
    Object.assign(c, extra);
    return c;
  };
  const W = '_-"₩"* #,##0_-;\-"₩"* #,##0_-;_-"₩"* "-"_-;_-@_-';

  const farmHours = farmCount * PS_FEE.hoursPerFarm;
  const labHours = labVisits * PS_FEE.hoursPerLabVisit;
  const total = farmHours + labHours;
  const deduct = over8h * PS_FEE.over8hDeduct;
  const finalHours = total - deduct;
  const amount = finalHours * PS_FEE.hourly;

  ws.getRow(2).height = 26.4; ws.getRow(3).height = 18; ws.getRow(9).height = 20.4;
  for (let r = 12; r <= 19; r++) ws.getRow(r).height = 30;
  ws.getRow(31).height = 36.6;

  set('A1', '<서식 2>', 9);
  ws.mergeCells('A2:F2');
  set('A2', 'AI 현장 시료채취비용 지급 신청서(공수의사 → 시군)', 14, 'center');
  for (let c = 1; c <= 6; c++) ws.getCell(2, c).border = { bottom: dbl };

  set('A4', '⃞ 신청금액 :', 14, 'left');
  set('B4', { formula: 'E19*D5', result: amount }, 14, 'left', { numFmt: W });
  set('A5', '⃞ 공수의사', 14, 'left');
  set('C5', '(기준:', 8, 'right');
  set('D5', PS_FEE.hourly, 8, 'left', { numFmt: W });
  set('E5', '/시간)', 8, 'left');
  set('A6', '⃝ 성   명 :', 14, 'right'); set('B6', RX_CLINIC.vetName, 14, 'left');
  set('A7', '⃝ 주   소 :', 14, 'right'); set('B7', PS_APPLICANT.address, 14, 'left');
  set('A8', '⃝ 연락처 :', 14, 'right'); set('B8', RX_CLINIC.phone, 14, 'left');
  set('A10', '⃞ 시료채취비용 산출내역 :', 14, 'left');

  set('A12', '항목', 14, 'center'); set('B12', '방문수/시간', 14, 'center');
  for (let c = 1; c <= 6; c++) { ws.getCell(12, c).border = { bottom: dbl }; ws.getCell(12, c).font = F(14); }
  ws.mergeCells('D13:E13');

  set('A13', '방문 농가수 : ', 11, 'right'); set('B13', farmCount, 11, 'left'); set('C13', '농가', 11, 'left');
  set('A14', '농가당 소요시간 :', 11, 'right'); set('B14', PS_FEE.hoursPerFarm, 11, 'left'); set('C14', '시간', 11, 'left');
  set('D14', '총', 11, 'right'); set('E14', { formula: 'B13*B14', result: farmHours }, 11, 'center'); set('F14', '시간', 11, 'left');
  set('A15', '시험소 방문 :', 11, 'right'); set('B15', labVisits, 11, 'left'); set('C15', '회', 11, 'left');
  set('A16', '시험소 방문소요시간 : ', 11, 'right'); set('B16', PS_FEE.hoursPerLabVisit, 11, 'left'); set('C16', '시간', 11, 'left');
  set('D16', '총', 11, 'right'); set('E16', { formula: 'B15*B16', result: labHours }, 11, 'center'); set('F16', '시간', 11, 'left');
  set('E17', { formula: 'E14+E16', result: total }, 11, 'center'); set('F17', '시간', 11, 'left');
  set('A18', '8시간 초과 차감', 11, 'right'); set('E18', deduct, 11, 'center'); set('F18', '시간', 11, 'left');
  set('A19', '최종소요시간', 14, 'right'); set('E19', { formula: 'E17-E18', result: finalHours }, 11, 'center'); set('F19', '시간', 11, 'left');
  for (const r of [14, 16, 18]) for (let c = 1; c <= 6; c++) { const cell = ws.getCell(r, c); cell.border = { bottom: thin }; cell.font = cell.font?.name ? cell.font : F(11); }

  set('A20', '※  농가별 세부내역 별첨', 14, 'left');
  set('A22', `⃞ 계좌번호 : ${PS_APPLICANT.account} (예금주 : ${RX_CLINIC.vetName})`, 14, 'left');
  set('C25', `${monthEnd.getFullYear()}년`, 14, 'center');
  set('D25', `${monthEnd.getMonth() + 1}월 `, 14, 'center');
  set('E25', monthEnd.getDate(), 14, 'center');
  set('F25', '일', 14, 'left');
  set('B27', '공수의사 : ', 14, 'left'); set('C27', `${RX_CLINIC.vetName} 수의사`, 14, 'left'); set('E27', '(서명)', 9, 'left');
  set('A31', '파주시장', 28, 'left');
}
