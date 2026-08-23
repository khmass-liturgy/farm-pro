// ─── 투약 이력 기록(실적) ──────────────────────────────────────────────
function onLogDrugChange() {
  const sel = document.getElementById('ml-drug-sel');
  document.getElementById('ml-drug-custom').style.display = sel.value === '__custom__' ? '' : 'none';
}
function onLogVaccineChange() {
  const sel = document.getElementById('ml-vaccine-sel');
  document.getElementById('ml-vaccine-custom').style.display = sel.value === '__custom__' ? '' : 'none';
}

// batchId + programDay(해당 일령의 계획)를 프리필해 "실제 투약 기록" 모달을 연다.
// (입추 상세의 일자별 계획표에서 특정 일령의 "실제 투약 기록" 버튼으로 진입)
function openMedicationLogModal(batchId, programDay) {
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
  openModal('modal-medlog');
}

// 투약상담 및 처방 목록 페이지의 "+ 상담 기록 추가" 버튼 — 특정 배치/일령에
// 묶이지 않으므로 농장→입추를 직접 선택하게 한다.
function openConsultLogModal() {
  document.getElementById('modal-medlog-title').textContent = '투약상담 및 처방 기록';
  document.getElementById('ml-farm-batch-row').style.display = '';
  document.getElementById('ml-batch-id').value = '';
  document.getElementById('ml-program-day').value = '';
  document.getElementById('ml-plan-summary').textContent = '';
  document.getElementById('ml-log-date').value = new Date().toISOString().slice(0,10);
  document.getElementById('ml-disease').value = '';

  document.getElementById('ml-farm-sel').innerHTML = '<option value="">농장 선택</option>' + farmsByOwner().map(f => `<option value="${f.id}">${f.name} (${f.owner})</option>`).join('');
  document.getElementById('ml-batch-sel').innerHTML = '<option value="">입추 선택</option>';

  document.getElementById('ml-drug-sel').innerHTML = getDrugOptions('');
  document.getElementById('ml-drug-custom').style.display = 'none';
  document.getElementById('ml-drug-custom-input').value = '';
  document.getElementById('ml-vaccine-sel').innerHTML = getVaccineOptions('');
  document.getElementById('ml-vaccine-custom').style.display = 'none';
  document.getElementById('ml-vaccine-custom-input').value = '';
  document.getElementById('ml-dose-note').value = '';
  document.getElementById('ml-note').value = '';
  openModal('modal-medlog');
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

  const data = {
    batchId, logDate, programDay: programDay ? Number(programDay) : null,
    drugId, drugName: drugName || null, vaccineId, vaccineName: vaccineName || null,
    doseNote: document.getElementById('ml-dose-note').value.trim(),
    disease: disease || null, note,
    administeredByEmail: await currentUserEmail(),
  };
  try { await insertRow('medicationLogs', data); }
  catch (e) { alert('저장 실패: ' + e.message); return; }
  closeModal('modal-medlog');
  if (document.getElementById('page-batch-detail')?.classList.contains('active')) renderBatchDetail();
  if (document.getElementById('page-medconsult')?.classList.contains('active')) renderConsultLogPage();
}

async function deleteMedicationLog(id) {
  if (!confirm('이 투약상담 기록을 삭제하시겠습니까?')) return;
  try { await deleteRow('medicationLogs', id); } catch (e) { alert('삭제 실패: ' + e.message); return; }
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
    return `<tr>
      <td>${l.logDate}</td>
      <td>${farm?.name || '-'}</td>
      <td style="color:var(--text-secondary)">${b?.house || '-'}</td>
      <td>${l.programDay ? l.programDay+'일' : '-'}</td>
      <td>${l.disease||'-'}</td>
      <td style="color:var(--text-secondary)">${l.note||'-'}</td>
      <td>${medParts.length ? medParts.join(' / ') : '-'}</td>
      <td style="color:var(--text-secondary);font-size:11px">${l.administeredByEmail||'-'}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteMedicationLog('${l.id}')">삭제</button></td>
    </tr>`;
  }).join('');
}
