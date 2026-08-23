// ─── 투약 이력 기록(실적) ──────────────────────────────────────────────
function onLogDrugChange() {
  const sel = document.getElementById('ml-drug-sel');
  document.getElementById('ml-drug-custom').style.display = sel.value === '__custom__' ? '' : 'none';
}
function onLogVaccineChange() {
  const sel = document.getElementById('ml-vaccine-sel');
  document.getElementById('ml-vaccine-custom').style.display = sel.value === '__custom__' ? '' : 'none';
}

// ─── 부검사진 첨부 ──────────────────────────────────────────────────────
// modal-medlog는 두 진입점(openMedicationLogModal / openConsultLogModal)이 공유하므로
// 이 상태도 두 흐름이 함께 쓴다. 매번 모달을 열 때 반드시 resetMlPhotoState()로 비워야
// 이전에 열었던 다른 레코드의 사진이 새 모달에 남아있는 사고를 막을 수 있다.
//   existing: 이미 Storage에 저장된 사진. { path, removed, url(서명 URL, 비동기로 채움) }
//   newFiles: 이번에 새로 고른 파일(아직 업로드 안 됨). { file, previewUrl(로컬 blob URL) }
let mlPhotoState = { existing: [], newFiles: [] };

function resetMlPhotoState() {
  // 아직 업로드 안 한 로컬 미리보기 URL은 메모리 누수 방지를 위해 해제한다.
  mlPhotoState.newFiles.forEach(f => URL.revokeObjectURL(f.previewUrl));
  mlPhotoState = { existing: [], newFiles: [] };
}

function mlPhotoThumbHtml(innerHtml, onRemove) {
  return `<div style="position:relative;width:88px;height:88px">
    ${innerHtml}
    <button type="button" onclick="${onRemove}" title="삭제"
      style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:none;background:var(--red);color:#fff;font-size:12px;line-height:20px;padding:0;cursor:pointer">✕</button>
  </div>`;
}

function renderMlPhotoGrid() {
  const grid = document.getElementById('ml-photo-grid');
  if (!grid) return;
  const existingHtml = mlPhotoState.existing.filter(p => !p.removed).map(p => {
    const img = p.url
      ? `<img src="${p.url}" style="width:88px;height:88px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">`
      : `<div style="width:88px;height:88px;border-radius:6px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--text-secondary);text-align:center">불러오는 중...</div>`;
    return mlPhotoThumbHtml(img, `removeMlExistingPhoto('${p.path}')`);
  }).join('');
  const newHtml = mlPhotoState.newFiles.map((f, i) => {
    const img = `<img src="${f.previewUrl}" style="width:88px;height:88px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">`;
    return mlPhotoThumbHtml(img, `removeMlNewPhoto(${i})`);
  }).join('');
  grid.innerHTML = existingHtml + newHtml;
}

// 파일 선택 즉시(업로드 전) 로컬 미리보기만 보여준다. 실제 업로드는 저장 시점에 한다.
function onMlPhotoInputChange(input) {
  Array.from(input.files || []).forEach(file => {
    mlPhotoState.newFiles.push({ file, previewUrl: URL.createObjectURL(file) });
  });
  input.value = ''; // 같은 파일을 다시 골라도 change가 또 발생하도록 초기화
  renderMlPhotoGrid();
}
function removeMlNewPhoto(index) {
  const removed = mlPhotoState.newFiles.splice(index, 1)[0];
  if (removed) URL.revokeObjectURL(removed.previewUrl);
  renderMlPhotoGrid();
}
// 기존(저장된) 사진은 바로 지우지 않고 "제거 표시"만 한다. 실제 Storage 삭제는
// 저장(saveMedicationLog) 성공 후에 한다 — 취소를 누르면 아무 일도 없어야 하므로.
function removeMlExistingPhoto(path) {
  const item = mlPhotoState.existing.find(p => p.path === path);
  if (item) item.removed = true;
  renderMlPhotoGrid();
}

// dashboard.js의 fetchDashboardWeather()와 같은 패턴: 모달은 먼저 동기로 열고,
// 서명 URL은 비동기로 받아온 뒤 사진 영역만 다시 그린다(모달을 여는 함수를 막지 않는다).
async function loadMlExistingPhotoUrls() {
  const targets = mlPhotoState.existing.filter(p => !p.url);
  if (!targets.length) return;
  await Promise.all(targets.map(async p => {
    try {
      const { data, error } = await sb.storage.from('necropsy-photos').createSignedUrl(p.path, 3600);
      if (!error && data) p.url = data.signedUrl;
    } catch (e) { /* 사진 한 장 실패는 무시 — 해당 칸만 "불러오는 중" 상태로 남는다 */ }
  }));
  renderMlPhotoGrid();
}

// Storage 경로에 안전하지 않은 문자(공백/한글/특수문자 등)가 있으면 업로드가 실패할 수
// 있어 파일명에서 영문/숫자/점/하이픈/언더스코어 외 문자는 전부 치환한다.
function sanitizeFileNameForStorage(name) {
  return (name || 'photo').replace(/[^A-Za-z0-9._-]/g, '_');
}

// batchId + programDay(해당 일령의 계획)를 프리필해 "실제 투약 기록" 모달을 연다.
// (입추 상세의 일자별 계획표에서 특정 일령의 "실제 투약 기록" 버튼으로 진입)
// 이 흐름은 항상 새로 생성만 한다(편집 없음). modal-medlog는 진료기록 편집과 모달을
// 공유하므로, 직전에 진료기록 편집을 열었다가 취소하고 여기로 넘어와도 그 편집 상태
// (editingId, 사진 미리보기)가 남지 않도록 매번 초기화한다.
function openMedicationLogModal(batchId, programDay) {
  editingId.medicationLog = null;
  resetMlPhotoState();

  const b = load('batches').find(x => x.id === batchId);
  const prog = b?.programId ? load('programs').find(p => p.id === b.programId) : null;
  const planDay = prog ? prog.days.find(d => d.day === programDay) : null;
  const firstDrug = planDay?.drugs?.[0] || null;
  const vaccine = planDay?.vaccine || null;

  document.getElementById('modal-medlog-title').textContent = '실제 투약 기록';
  document.getElementById('ml-farm-batch-row').style.display = 'none';
  document.getElementById('ml-batch-id').value = batchId;
  document.getElementById('ml-program-day').value = programDay || '';
  document.getElementById('ml-log-date').value = new Date().toISOString().slice(0,10);
  document.getElementById('ml-disease').value = '';

  document.getElementById('ml-drug-sel').innerHTML = getDrugOptions(firstDrug?.drugId || '');
  document.getElementById('ml-drug-custom').style.display = (firstDrug && !firstDrug.drugId) ? '' : 'none';
  document.getElementById('ml-drug-custom-input').value = (firstDrug && !firstDrug.drugId) ? firstDrug.name : '';

  document.getElementById('ml-vaccine-sel').innerHTML = getVaccineOptions(vaccine?.vaccineId || '');
  document.getElementById('ml-vaccine-custom').style.display = (vaccine && !vaccine.vaccineId) ? '' : 'none';
  document.getElementById('ml-vaccine-custom-input').value = (vaccine && !vaccine.vaccineId) ? vaccine.name : '';

  document.getElementById('ml-dose-note').value = '';
  document.getElementById('ml-note').value = '';
  document.getElementById('ml-plan-summary').textContent = planDay
    ? `📋 계획: ${[dayDrugLabel(planDay), dayVaccineLabel(planDay)].filter(Boolean).join(' / ') || '(계획 없음)'}`
    : '📋 이 일령에 대한 계획이 없습니다. 직접 입력하세요.';
  document.getElementById('ml-photo-input').value = '';
  renderMlPhotoGrid();
  openModal('modal-medlog');
}

// 투약상담 및 처방 목록 페이지의 "+ 진료기록 추가"/"편집" 버튼 — 특정 배치/일령에
// 묶이지 않으므로 농장→입추를 직접 선택하게 한다. id가 없으면 새로 만들기, 있으면
// 그 진료기록을 불러와 채워넣는 편집 모드로 연다.
function openConsultLogModal(id) {
  editingId.medicationLog = id || null;
  resetMlPhotoState();

  document.getElementById('ml-farm-batch-row').style.display = '';
  document.getElementById('ml-batch-id').value = '';
  document.getElementById('ml-plan-summary').textContent = '';
  document.getElementById('ml-farm-sel').innerHTML = '<option value="">농장 선택</option>' + farmsByOwner().map(f => `<option value="${f.id}">${f.name} (${f.owner})</option>`).join('');

  if (id) {
    const log = load('medicationLogs').find(l => l.id === id);
    if (!log) { alert('진료기록을 찾을 수 없습니다.'); editingId.medicationLog = null; return; }
    const batch = load('batches').find(x => x.id === log.batchId);

    document.getElementById('modal-medlog-title').textContent = '진료기록 편집';
    document.getElementById('ml-program-day').value = log.programDay || '';
    document.getElementById('ml-log-date').value = log.logDate || '';
    document.getElementById('ml-disease').value = log.disease || '';

    document.getElementById('ml-farm-sel').value = batch?.farmId || '';
    onConsultFarmSelChange();
    document.getElementById('ml-batch-sel').value = log.batchId || '';

    document.getElementById('ml-drug-sel').innerHTML = getDrugOptions(log.drugId || '');
    document.getElementById('ml-drug-custom').style.display = (log.drugName && !log.drugId) ? '' : 'none';
    document.getElementById('ml-drug-custom-input').value = (log.drugName && !log.drugId) ? log.drugName : '';

    document.getElementById('ml-vaccine-sel').innerHTML = getVaccineOptions(log.vaccineId || '');
    document.getElementById('ml-vaccine-custom').style.display = (log.vaccineName && !log.vaccineId) ? '' : 'none';
    document.getElementById('ml-vaccine-custom-input').value = (log.vaccineName && !log.vaccineId) ? log.vaccineName : '';

    document.getElementById('ml-dose-note').value = log.doseNote || '';
    document.getElementById('ml-note').value = log.note || '';

    mlPhotoState.existing = (log.necropsyPhotos || []).map(path => ({ path, removed: false, url: null }));
  } else {
    document.getElementById('modal-medlog-title').textContent = '진료기록 추가';
    document.getElementById('ml-batch-sel').innerHTML = '<option value="">입추 선택</option>';
    document.getElementById('ml-program-day').value = '';
    document.getElementById('ml-log-date').value = new Date().toISOString().slice(0,10);
    document.getElementById('ml-disease').value = '';

    document.getElementById('ml-drug-sel').innerHTML = getDrugOptions('');
    document.getElementById('ml-drug-custom').style.display = 'none';
    document.getElementById('ml-drug-custom-input').value = '';
    document.getElementById('ml-vaccine-sel').innerHTML = getVaccineOptions('');
    document.getElementById('ml-vaccine-custom').style.display = 'none';
    document.getElementById('ml-vaccine-custom-input').value = '';
    document.getElementById('ml-dose-note').value = '';
    document.getElementById('ml-note').value = '';
  }

  document.getElementById('ml-photo-input').value = '';
  renderMlPhotoGrid();
  openModal('modal-medlog');
  if (mlPhotoState.existing.length) loadMlExistingPhotoUrls();
}

function onConsultFarmSelChange() {
  const farmId = document.getElementById('ml-farm-sel').value;
  const batches = load('batches').filter(b => b.farmId === farmId);
  const sel = document.getElementById('ml-batch-sel');
  sel.innerHTML = '<option value="">입추 선택</option>' + batches.map(b => {
    const displayStatus = computeBatchDisplayStatus(b);
    const suffix = b.status === 'completed' ? ' (완료)' : (displayStatus.label === '출하완료' ? ' (출하완료)' : '');
    return `<option value="${b.id}">${b.house ? b.house+' · ' : ''}${b.placementDate}${suffix}</option>`;
  }).join('');
}

async function saveMedicationLog() {
  const standalone = document.getElementById('ml-farm-batch-row').style.display !== 'none';
  const batchId = standalone ? document.getElementById('ml-batch-sel').value : document.getElementById('ml-batch-id').value;
  const programDay = document.getElementById('ml-program-day').value;
  const logDate = document.getElementById('ml-log-date').value;
  if (!batchId || !logDate) { alert(standalone ? '농장/입추와 날짜는 필수입니다.' : '날짜는 필수입니다.'); return; }

  const dsel = document.getElementById('ml-drug-sel');
  let drugId = null, drugName = '';
  if (dsel.value === '__custom__') drugName = document.getElementById('ml-drug-custom-input').value.trim();
  else if (dsel.value) { drugId = dsel.value; drugName = dsel.options[dsel.selectedIndex].dataset.name || ''; }

  const vsel = document.getElementById('ml-vaccine-sel');
  let vaccineId = null, vaccineName = '';
  if (vsel.value === '__custom__') vaccineName = document.getElementById('ml-vaccine-custom-input').value.trim();
  else if (vsel.value) { vaccineId = vsel.value; vaccineName = vsel.options[vsel.selectedIndex].dataset.name || ''; }

  const disease = document.getElementById('ml-disease').value.trim();
  const note = document.getElementById('ml-note').value.trim();
  if (!drugName && !vaccineName && !disease && !note) { alert('질병, 내용, 약품, 백신 중 최소 하나는 입력해야 합니다.'); return; }

  // 새로 선택된 사진을 먼저 업로드한다. 하나라도 실패하면 저장 자체를 중단해서
  // "사진 일부만 저장되고 로그는 저장 안 됨" 같은 어중간한 상태를 피한다.
  const uploadedPaths = [];
  for (let i = 0; i < mlPhotoState.newFiles.length; i++) {
    const file = mlPhotoState.newFiles[i].file;
    const path = `${batchId}/${Date.now()}_${i}_${sanitizeFileNameForStorage(file.name)}`;
    const { error } = await sb.storage.from('necropsy-photos').upload(path, file);
    if (error) { alert('부검사진 업로드 실패: ' + error.message); return; }
    uploadedPaths.push(path);
  }
  const keptExistingPaths = mlPhotoState.existing.filter(p => !p.removed).map(p => p.path);
  const removedExistingPaths = mlPhotoState.existing.filter(p => p.removed).map(p => p.path);

  const data = {
    batchId, logDate, programDay: programDay ? Number(programDay) : null,
    drugId, drugName: drugName || null, vaccineId, vaccineName: vaccineName || null,
    doseNote: document.getElementById('ml-dose-note').value.trim(),
    disease: disease || null, note,
    administeredByEmail: await currentUserEmail(),
    necropsyPhotos: [...keptExistingPaths, ...uploadedPaths],
  };
  try {
    if (editingId.medicationLog) await updateRow('medicationLogs', editingId.medicationLog, data);
    else await insertRow('medicationLogs', data);
  } catch (e) { alert('저장 실패: ' + e.message); return; }

  // 제거 표시된 기존 사진은 로그 저장이 성공한 뒤에 실제로 지운다(저장 실패 시 남겨둬야
  // 사용자가 다시 시도할 때 사진이 사라져 있지 않다).
  if (removedExistingPaths.length) {
    try { await sb.storage.from('necropsy-photos').remove(removedExistingPaths); }
    catch (e) { /* Storage 정리 실패는 로그 저장 자체를 막지 않는다 */ }
  }

  editingId.medicationLog = null;
  closeModal('modal-medlog');
  if (document.getElementById('page-batch-detail')?.classList.contains('active')) renderBatchDetail();
  if (document.getElementById('page-medconsult')?.classList.contains('active')) renderConsultLogPage();
}

async function deleteMedicationLog(id) {
  if (!confirm('이 진료기록을 삭제하시겠습니까?')) return;
  const log = load('medicationLogs').find(l => l.id === id);
  try { await deleteRow('medicationLogs', id); } catch (e) { alert('삭제 실패: ' + e.message); return; }
  // 레코드가 지워진 뒤 남은 부검사진 파일(고아 파일)이 Storage에 쌓이지 않도록 함께 지운다.
  if (log?.necropsyPhotos?.length) {
    try { await sb.storage.from('necropsy-photos').remove(log.necropsyPhotos); }
    catch (e) { /* Storage 정리 실패는 레코드 삭제 자체를 막지 않는다 */ }
  }
  if (document.getElementById('page-batch-detail')?.classList.contains('active')) renderBatchDetail();
  if (document.getElementById('page-medconsult')?.classList.contains('active')) renderConsultLogPage();
}

// ─── 투약상담 및 처방 목록 페이지 (필터: 농장/입추) ────────────────────────
function populateConsultFilters() {
  const farmSel = document.getElementById('mc-farm-filter');
  const cur = farmSel.value;
  farmSel.innerHTML = '<option value="">전체 농장</option>' + farmsByOwner().map(f => `<option value="${f.id}"${f.id===cur?' selected':''}>${f.name} (${f.owner})</option>`).join('');
  renderConsultFilterBatches();
  renderConsultLogPage();
}
function renderConsultFilterBatches() {
  const farmId = document.getElementById('mc-farm-filter').value || '';
  const batches = load('batches').filter(b => !farmId || b.farmId === farmId);
  const farms = load('farms');
  const sel = document.getElementById('mc-batch-filter');
  sel.innerHTML = '<option value="">전체 입추</option>' + batches.map(b => {
    const farm = farms.find(f => f.id === b.farmId);
    return `<option value="${b.id}">${farm?.name||''} · ${b.house?b.house+' · ':''}${b.placementDate}</option>`;
  }).join('');
}
function onConsultFarmFilterChange() {
  renderConsultFilterBatches();
  renderConsultLogPage();
}
function renderConsultLogPage() {
  const farmId = document.getElementById('mc-farm-filter')?.value || '';
  const batchId = document.getElementById('mc-batch-filter')?.value || '';
  const batches = load('batches');
  const farms = load('farms');
  let logs = load('medicationLogs');
  if (batchId) {
    logs = logs.filter(l => l.batchId === batchId);
  } else if (farmId) {
    const idsInFarm = new Set(batches.filter(b => b.farmId === farmId).map(b => b.id));
    logs = logs.filter(l => idsInFarm.has(l.batchId));
  }
  const tbody = document.getElementById('medconsult-tbody');
  const empty = document.getElementById('medconsult-empty');
  if (!logs.length) { tbody.innerHTML=''; empty.style.display=''; return; }
  empty.style.display='none';
  tbody.innerHTML = logs.map(l => {
    const b = batches.find(x => x.id === l.batchId);
    const farm = b ? farms.find(f => f.id === b.farmId) : null;
    const medParts = [l.drugName, l.vaccineName, l.doseNote].filter(Boolean);
    const photoCount = l.necropsyPhotos?.length || 0;
    return `<tr>
      <td>${l.logDate}</td>
      <td>${farm?.name || '-'}</td>
      <td style="color:var(--text-secondary)">${b?.house || '-'}</td>
      <td>${l.programDay ? l.programDay+'일' : '-'}</td>
      <td>${l.disease||'-'}</td>
      <td style="color:var(--text-secondary)">${l.note||'-'}</td>
      <td>${medParts.length ? medParts.join(' / ') : '-'}</td>
      <td>${photoCount ? `📷 ${photoCount}장` : '-'}</td>
      <td style="color:var(--text-secondary);font-size:11px">${l.administeredByEmail||'-'}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="openConsultLogModal('${l.id}')">편집</button>
        <button class="btn btn-danger btn-sm" onclick="deleteMedicationLog('${l.id}')">삭제</button>
      </td>
    </tr>`;
  }).join('');
}
