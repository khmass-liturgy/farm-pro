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
  );
  const tbody = document.getElementById('ps-tbody');
  const empty = document.getElementById('ps-empty');
  if (!list.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  tbody.innerHTML = list.map(p => `
    <tr>
      <td>${p.sampledAt}</td>
      <td><strong>${p.farmName}</strong><div style="font-size:11px;color:var(--text-secondary)">${p.owner || ''}</div></td>
      <td>${p.species || '-'}</td>
      <td>${p.scale ? Number(p.scale).toLocaleString() + '수' : '-'}${p.houseCount ? ' · ' + p.houseCount + '동' : ''}</td>
      <td>${p.purpose || '-'}</td>
      <td>${(p.rows || []).length}동</td>
      <td style="font-size:11px">${psSampleSummary(p)}</td>
      <td>${p.shipDate || '-'}</td>
      <td><div class="flex-gap">
        <button class="btn btn-primary btn-sm" onclick="printPreShipment('${p.id}')">🖨️ 인쇄</button>
        <button class="btn btn-outline btn-sm" onclick="openPreShipmentModal('${p.id}')">편집</button>
        <button class="btn btn-danger btn-sm" onclick="deletePreShipment('${p.id}')">삭제</button>
      </div></td>
    </tr>`).join('');
}

// ─── 동별 시료채취 내역 줄 ─────────────────────────────────────────────────
function psRowHtml(idx, row) {
  const v = k => (row && row[k] != null ? row[k] : '');
  const sampleInputs = PS_SAMPLE_COLS.map(c =>
    `<td><input id="ps-${c.key}-${idx}" type="number" min="0" value="${v(c.key)}" style="width:100%"></td>`
  ).join('');
  return `<tr id="ps-row-${idx}">
    <td><input id="ps-house-${idx}" value="${v('house')}" placeholder="예) 1동" style="width:100%"></td>
    <td><input id="ps-count-${idx}" type="number" min="0" value="${v('count')}" style="width:100%"></td>
    <td><input id="ps-age-${idx}" type="number" min="0" value="${v('ageDays')}" style="width:100%"></td>
    <td><input id="ps-dead-${idx}" type="number" min="0" value="${v('deadCount')}" style="width:100%"></td>
    <td><input id="ps-clinical-${idx}" value="${v('clinical') || '정상'}" style="width:100%"></td>
    ${sampleInputs}
    <td><input id="ps-note-${idx}" value="${v('note')}" placeholder="예) 계사,시설" style="width:100%"></td>
    <td style="text-align:center"><button type="button" class="btn btn-danger btn-sm" onclick="removePsRow(${idx})">×</button></td>
  </tr>`;
}

function addPsRow(row) {
  const tbody = document.getElementById('ps-rows-body');
  if (!tbody) return;
  tbody.insertAdjacentHTML('beforeend', psRowHtml(psRowSeq, row));
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
}

function openPreShipmentModal(id) {
  editingId.preShipment = id || null;
  const ps = id ? load('preShipments').find(x => x.id === id) : null;
  document.getElementById('modal-ps-title').textContent = id ? '출하전검사 서식 편집' : '출하전검사 서식 작성';

  populateFarmSelect('ps-farm', ps?.farmId || '');
  const today = new Date().toISOString().slice(0, 10);
  const sampler = psDefaultSampler();

  document.getElementById('ps-doc-no').value = ps?.docNo || '';
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

async function deletePreShipment(id) {
  if (!confirm('이 출하전검사 기록을 삭제하시겠습니까?')) return;
  try { await deleteRow('preShipments', id); } catch (e) { alert('삭제 실패: ' + e.message); return; }
  renderPreShipments();
}

// ─── A4 인쇄 (원본 「의뢰서식」 시트 배치를 그대로 옮김) ────────────────────
function printPreShipment(id) {
  const ps = load('preShipments').find(x => x.id === id);
  if (!ps) return;
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

  const html = `
  <div class="print-page">
    <div class="ps-title">시료채취 내역서</div>
    <div class="ps-docno">No. ${ps.docNo || ''}</div>

    <table class="ps-head">
      <tr><td class="lbl">□ 검사목적</td><td colspan="5">${ps.purpose || ''}</td></tr>
      <tr><td class="lbl">□ 시료채취일</td><td colspan="5">${ps.sampledAt || ''}</td></tr>
      <tr>
        <td class="lbl">□ 시료채취자</td><td>${ps.samplerOrg || ''}</td>
        <td class="lbl2">${ps.samplerTitle || ''}</td><td>: ${ps.samplerName || ''}</td>
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
      ${(ps.shipDate || ps.shipHouses || ps.shipCount) ? `<tr>
        <td class="lbl">□ 출하예정</td><td>${ps.shipDate || ''}</td>
        <td class="lbl2">○ 출하동</td><td>${ps.shipHouses || ''}</td>
        <td class="lbl2">○ 예정수수</td><td>${n(ps.shipCount)}</td>
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

  document.getElementById('print-area').innerHTML = html;
  setTimeout(() => window.print(), 200);
}
