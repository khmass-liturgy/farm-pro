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
function openMedicationLogModal(batchId, programDay) {
  const b = load('batches').find(x => x.id === batchId);
  const prog = b?.programId ? load('programs').find(p => p.id === b.programId) : null;
  const planDay = prog ? prog.days.find(d => d.day === programDay) : null;
  const firstDrug = planDay?.drugs?.[0] || null;
  const vaccine = planDay?.vaccine || null;

  document.getElementById('ml-batch-id').value = batchId;
  document.getElementById('ml-program-day').value = programDay || '';
  document.getElementById('ml-log-date').value = new Date().toISOString().slice(0,10);

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

async function saveMedicationLog() {
  const batchId = document.getElementById('ml-batch-id').value;
  const programDay = document.getElementById('ml-program-day').value;
  const logDate = document.getElementById('ml-log-date').value;
  if (!batchId || !logDate) { alert('날짜는 필수입니다.'); return; }

  const dsel = document.getElementById('ml-drug-sel');
  let drugId = null, drugName = '';
  if (dsel.value === '__custom__') drugName = document.getElementById('ml-drug-custom-input').value.trim();
  else if (dsel.value) { drugId = dsel.value; drugName = dsel.options[dsel.selectedIndex].dataset.name || ''; }

  const vsel = document.getElementById('ml-vaccine-sel');
  let vaccineId = null, vaccineName = '';
  if (vsel.value === '__custom__') vaccineName = document.getElementById('ml-vaccine-custom-input').value.trim();
  else if (vsel.value) { vaccineId = vsel.value; vaccineName = vsel.options[vsel.selectedIndex].dataset.name || ''; }

  if (!drugName && !vaccineName) { alert('약품 또는 백신 중 하나는 선택/입력해야 합니다.'); return; }

  const data = {
    batchId, logDate, programDay: programDay ? Number(programDay) : null,
    drugId, drugName: drugName || null, vaccineId, vaccineName: vaccineName || null,
    doseNote: document.getElementById('ml-dose-note').value.trim(),
    note: document.getElementById('ml-note').value.trim(),
    administeredByEmail: await currentUserEmail(),
  };
  try { await insertRow('medicationLogs', data); }
  catch (e) { alert('저장 실패: ' + e.message); return; }
  closeModal('modal-medlog');
  if (document.getElementById('page-batch-detail')?.classList.contains('active')) renderBatchDetail();
  if (document.getElementById('page-medication-log')?.classList.contains('active')) renderMedicationLogPage();
}

async function deleteMedicationLog(id) {
  if (!confirm('이 투약 기록을 삭제하시겠습니까?')) return;
  try { await deleteRow('medicationLogs', id); } catch (e) { alert('삭제 실패: ' + e.message); return; }
  if (document.getElementById('page-batch-detail')?.classList.contains('active')) renderBatchDetail();
  if (document.getElementById('page-medication-log')?.classList.contains('active')) renderMedicationLogPage();
}

// ─── 투약 이력 조회 페이지 (필터: 농장/입추) ──────────────────────────────
function populateMedLogFilters() {
  const farms = load('farms');
  const farmSel = document.getElementById('mlp-farm-filter');
  const cur = farmSel.value;
  farmSel.innerHTML = '<option value="">전체 농장</option>' + farms.map(f => `<option value="${f.id}"${f.id===cur?' selected':''}>${f.name}</option>`).join('');
  renderMedLogFilterBatches();
  renderMedicationLogPage();
}
function renderMedLogFilterBatches() {
  const farmId = document.getElementById('mlp-farm-filter').value || '';
  const batches = load('batches').filter(b => !farmId || b.farmId === farmId);
  const farms = load('farms');
  const sel = document.getElementById('mlp-batch-filter');
  sel.innerHTML = '<option value="">전체 입추</option>' + batches.map(b => {
    const farm = farms.find(f => f.id === b.farmId);
    return `<option value="${b.id}">${farm?.name||''} · ${b.placementDate}</option>`;
  }).join('');
}
function onMedLogFarmFilterChange() {
  renderMedLogFilterBatches();
  renderMedicationLogPage();
}
function renderMedicationLogPage() {
  const farmId = document.getElementById('mlp-farm-filter')?.value || '';
  const batchId = document.getElementById('mlp-batch-filter')?.value || '';
  const batches = load('batches');
  const farms = load('farms');
  let logs = load('medicationLogs');
  if (batchId) {
    logs = logs.filter(l => l.batchId === batchId);
  } else if (farmId) {
    const idsInFarm = new Set(batches.filter(b => b.farmId === farmId).map(b => b.id));
    logs = logs.filter(l => idsInFarm.has(l.batchId));
  }
  const tbody = document.getElementById('medlog-tbody');
  const empty = document.getElementById('medlog-empty');
  if (!logs.length) { tbody.innerHTML=''; empty.style.display=''; return; }
  empty.style.display='none';
  tbody.innerHTML = logs.map(l => {
    const b = batches.find(x => x.id === l.batchId);
    const farm = b ? farms.find(f => f.id === b.farmId) : null;
    return `<tr>
      <td>${l.logDate}</td>
      <td>${farm?.name || '-'}</td>
      <td>${l.programDay ? l.programDay+'일' : '-'}</td>
      <td>${l.drugName||'-'}</td>
      <td>${l.vaccineName||'-'}</td>
      <td style="color:var(--text-secondary)">${l.note||'-'}</td>
      <td style="color:var(--text-secondary);font-size:11px">${l.administeredByEmail||'-'}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteMedicationLog('${l.id}')">삭제</button></td>
    </tr>`;
  }).join('');
}
