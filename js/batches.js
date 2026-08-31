// ─── 입추(사육배치) 관리 ────────────────────────────────────────────────
let currentBatchId = null;

function computeDayAge(placementDate) {
  const start = new Date(placementDate + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.floor((today - start) / 86400000) + 1;
}

// 육계는 보통 35일령 전후로 출하되는데, 출하 이후에도 사용자가 상태를 수동으로
// '완료'로 바꾸지 않으면 배치는 계속 status==='active'로 남아 목록에 "사육중"으로
// 표시된다. 이건 화면상 오해의 소지가 있어 "출하완료"로 다르게 보여주되, 실제
// status 컬럼은 절대 바꾸지 않는다 — 대시보드의 활성 배치 카운트, 투약 예정 알림,
// 사양표준/온습도 카드 등 여러 로직이 status==='active'를 그대로 필터링에 쓰고
// 있어서, 이 배치들을 계속 active로 취급해야 그 기능들이 정상 동작한다.
// 따라서 이 함수는 "표시 전용" 파생값만 계산하며, 화면에 상태를 보여줄 때는
// 항상 이 함수를 거쳐야 한다(로직 중복 방지).
function computeBatchDisplayStatus(b) {
  if (b.status === 'completed') return { label: '완료', badgeClass: 'badge-teal' };
  if (b.species === '육계' && computeDayAge(b.placementDate) > 35) {
    return { label: '출하완료', badgeClass: 'badge-purple' };
  }
  return { label: '사육중', badgeClass: 'badge-green' };
}

function populateProgramSelectForFarm(selectId, farmId, val) {
  const programs = load('programs').filter(p => p.farmId === farmId);
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">투약 프로그램 선택 (선택)</option>' + programs.map(p =>
    `<option value="${p.id}"${p.id===val?' selected':''}>${p.name}</option>`
  ).join('');
}

function onBatchFarmChange() {
  const farmId = document.getElementById('b-farm').value;
  populateProgramSelectForFarm('b-program', farmId, '');
  const farm = load('farms').find(f => f.id === farmId);
  if (farm && farm.count && !document.getElementById('b-count').value) {
    document.getElementById('b-count').value = farm.count;
  }
  if (farm && farm.type && !document.getElementById('b-species').value) {
    // 농장 축종이 목록에 없는 값(예: 예전 '오리')이면 그대로 넣었을 때 선택이 풀려
    // 축종이 빈 값으로 저장되므로, 먼저 임시 option을 확보한다.
    ensureSelectOption(document.getElementById('b-species'), farm.type);
    document.getElementById('b-species').value = farm.type;
    populateBatchBreedSelect(farm.type, '');
  }
  const houseSel = document.getElementById('b-house');
  const curHouse = houseSel.value === '__custom__' ? document.getElementById('b-house-custom-input').value : houseSel.value;
  populateBatchHouseSelect(farmId, curHouse);
}

// 농장의 "동수"만큼 1동~N동 선택지를 만들고, 현재 값이 그 범위 밖이면(다른 농장에서
// 넘어왔거나 자유롭게 적어둔 값) "직접 입력" 옵션으로 유지한다.
function populateBatchHouseSelect(farmId, selectedHouse) {
  const farm = load('farms').find(f => f.id === farmId);
  const n = farm?.houses ? Number(farm.houses) : 0;
  const opts = [];
  for (let i = 1; i <= n; i++) opts.push(`${i}동`);
  const isCustom = !!selectedHouse && !opts.includes(selectedHouse);
  const sel = document.getElementById('b-house');
  sel.innerHTML = '<option value="">동 선택</option>'
    + opts.map(o => `<option value="${o}"${o===selectedHouse?' selected':''}>${o}</option>`).join('')
    + `<option value="__custom__"${isCustom?' selected':''}>✏️ 직접 입력</option>`;
  document.getElementById('b-house-custom').style.display = isCustom ? '' : 'none';
  document.getElementById('b-house-custom-input').value = isCustom ? selectedHouse : '';
}
function onBatchHouseSelectChange() {
  document.getElementById('b-house-custom').style.display = document.getElementById('b-house').value === '__custom__' ? '' : 'none';
}

// 축종이 육계/산란계일 때만 CONSULT_BREEDS(js/breedStandards.js)의 품종 목록을 채운다.
// 그 외 축종은 표준 매뉴얼 자체가 없어 대시보드 요약 대상에서 자연히 빠진다.
function populateBatchBreedSelect(species, selectedBreed) {
  const sel = document.getElementById('b-breed');
  const hint = document.getElementById('b-breed-hint');
  const speciesKey = species === '육계' ? 'broiler' : species === '산란계' ? 'layer' : null;
  if (!speciesKey) {
    sel.innerHTML = '<option value="">-</option>';
    sel.disabled = true;
    hint.style.display = species ? '' : 'none';
    return;
  }
  sel.disabled = false;
  hint.style.display = 'none';
  const breeds = CONSULT_BREEDS[speciesKey].breeds;
  sel.innerHTML = '<option value="">품종 선택</option>' + Object.entries(breeds).map(([key, b]) =>
    `<option value="${key}"${key===selectedBreed?' selected':''}>${b.name}</option>`
  ).join('');
}
function onBatchSpeciesChange() {
  populateBatchBreedSelect(document.getElementById('b-species').value, '');
}

function openBatchModal(id) {
  editingId.batch = id || null;
  const b = id ? load('batches').find(x => x.id === id) : null;
  document.getElementById('modal-batch-title').textContent = id ? '입추 편집' : '입추 등록';
  populateFarmSelect('b-farm', b?.farmId || '');
  populateProgramSelectForFarm('b-program', b?.farmId || '', b?.programId || '');
  // 축종 목록에서 '오리'를 뺐으므로, 이미 그 값으로 저장된 배치는 임시 option으로 살려둔다.
  ensureSelectOption(document.getElementById('b-species'), b?.species || '');
  document.getElementById('b-species').value = b?.species || '';
  populateBatchBreedSelect(b?.species || '', b?.breed || '');
  populateBatchHouseSelect(b?.farmId || '', b?.house || '');
  document.getElementById('b-placement-date').value = b?.placementDate || new Date().toISOString().slice(0,10);
  document.getElementById('b-count').value = b?.birdCount || '';
  document.getElementById('b-notes').value = b?.notes || '';
  const statusWrap = document.getElementById('b-status-wrap');
  statusWrap.style.display = id ? '' : 'none';
  document.getElementById('b-status').value = b?.status || 'active';
  openModal('modal-batch');
}

async function saveBatch() {
  const farmId = document.getElementById('b-farm').value;
  const placementDate = document.getElementById('b-placement-date').value;
  if (!farmId || !placementDate) { alert('농장과 입추일은 필수입니다.'); return; }
  const programId = document.getElementById('b-program').value || null;
  const programName = programId ? (load('programs').find(p => p.id === programId)?.name || '') : '';
  const houseSel = document.getElementById('b-house').value;
  const house = houseSel === '__custom__' ? document.getElementById('b-house-custom-input').value.trim() : houseSel;
  const data = {
    farmId, programId, programName,
    house,
    placementDate,
    birdCount: document.getElementById('b-count').value,
    species: document.getElementById('b-species').value || null,
    breed: document.getElementById('b-breed').value || null,
    notes: document.getElementById('b-notes').value.trim(),
    status: editingId.batch ? (document.getElementById('b-status').value || 'active') : 'active',
  };
  try {
    if (editingId.batch) await updateRow('batches', editingId.batch, data);
    else await insertRow('batches', data);
  } catch (e) { alert('저장 실패: ' + e.message); return; }
  closeModal('modal-batch');
  renderBatches();
}

async function deleteBatch(id) {
  if (!confirm('이 입추 기록을 삭제하시겠습니까? 연결된 투약 이력도 함께 삭제됩니다.')) return;
  try { await deleteRow('batches', id); } catch (e) { alert('삭제 실패: ' + e.message); return; }
  renderBatches();
}

function renderBatches() {
  const batches = load('batches');
  const tbody = document.getElementById('batch-tbody');
  const empty = document.getElementById('batch-empty');
  if (!batches.length) { tbody.innerHTML=''; empty.style.display=''; return; }
  empty.style.display='none';
  const farms = load('farms');
  const programs = load('programs');
  tbody.innerHTML = batches.map(b => {
    const farm = farms.find(f => f.id === b.farmId);
    const prog = programs.find(p => p.id === b.programId);
    const dayAge = computeDayAge(b.placementDate);
    const dayAgeLabel = dayAge < 1 ? '입추 예정' : `${dayAge}일령`;
    const displayStatus = computeBatchDisplayStatus(b);
    const statusBadge = `<span class="badge ${displayStatus.badgeClass}">${displayStatus.label}</span>`;
    const speciesKey = b.species === '육계' ? 'broiler' : b.species === '산란계' ? 'layer' : null;
    const breedName = speciesKey && b.breed ? (CONSULT_BREEDS[speciesKey].breeds[b.breed]?.name || b.breed) : '-';
    return `<tr style="cursor:pointer" onclick="openBatchDetail('${b.id}')">
      <td><strong>${farm?.name || '(삭제된 농장)'}</strong></td>
      <td>${prog ? prog.name : (b.programName || '-')}</td>
      <td>${b.placementDate}</td>
      <td><strong>${dayAgeLabel}</strong></td>
      <td>${b.birdCount ? Number(b.birdCount).toLocaleString()+'수' : '-'}</td>
      <td>${b.house || '-'}</td>
      <td>${b.species ? `${b.species}${breedName !== '-' ? ' · '+breedName : ''}` : '-'}</td>
      <td>${statusBadge}</td>
      <td onclick="event.stopPropagation()"><div class="flex-gap">
        <button class="btn btn-outline btn-sm" onclick="openBatchModal('${b.id}')">편집</button>
        <button class="btn btn-danger btn-sm" onclick="deleteBatch('${b.id}')">삭제</button>
      </div></td>
    </tr>`;
  }).join('');
}

function openBatchDetail(id) {
  currentBatchId = id;
  showPage('batch-detail');
}

function renderBatchDetail() {
  const wrap = document.getElementById('batch-detail-body');
  const b = load('batches').find(x => x.id === currentBatchId);
  if (!b) { wrap.innerHTML = '<div class="empty-state"><p>입추 기록을 찾을 수 없습니다.</p></div>'; return; }
  const farm = load('farms').find(f => f.id === b.farmId);
  const prog = b.programId ? load('programs').find(p => p.id === b.programId) : null;
  const dayAge = computeDayAge(b.placementDate);
  const logs = load('medicationLogs').filter(l => l.batchId === b.id);

  document.getElementById('topbar-title').textContent = `입추 상세 · ${farm?.name || ''}`;

  let rowsHtml = '';
  if (prog) {
    for (let i = 1; i <= prog.duration; i++) {
      const d = prog.days.find(x => x.day === i);
      const hasPlan = d && ((d.drugs && d.drugs.length) || d.vaccine);
      const isToday = i === dayAge, isFuture = i > dayAge;
      // 계획일의 상태는 세 가지다: 투약함 / 안 하기로 함(미투약) / 아직 기록 안 함.
      // 계획대로 투약하지 않는 날도 있으므로, 미투약을 기록으로 남길 수 있어야
      // "잊어버려서 비어 있는 것"과 구분된다.
      const loggedForDay = logs.filter(l => l.programDay === i);
      const givenForDay = loggedForDay.filter(l => l.administered !== false);
      const skippedForDay = loggedForDay.filter(l => l.administered === false);
      let statusCell = '<span class="text-muted">-</span>';
      if (hasPlan) {
        if (givenForDay.length) {
          statusCell = '<span class="badge badge-green">투약</span>';
        } else if (skippedForDay.length) {
          const reason = skippedForDay[0].note || '';
          statusCell = `<span class="badge badge-amber">미투약</span>` +
            (reason && reason !== '미투약' ? `<div style="font-size:10px;color:var(--text-secondary);margin-top:2px">${reason}</div>` : '');
        } else if (i <= dayAge) {
          statusCell = `<span class="badge badge-red">미기록</span>
            <div class="flex-gap" style="margin-top:4px;gap:4px">
              <button class="btn btn-outline btn-sm" onclick="openMedicationLogModal('${b.id}',${i})">투약</button>
              <button class="btn btn-outline btn-sm" onclick="recordNotAdministered('${b.id}',${i})">미투약</button>
            </div>`;
        } else {
          statusCell = '<span class="text-muted">예정</span>';
        }
      }
      rowsHtml += `<div class="day-plan-row ${isToday?'today':''} ${isFuture?'future':''}">
        <div class="program-cell num">${i}일<div style="font-size:10px;color:var(--text-secondary);font-weight:400">${programDayDateShort(b.placementDate, i)}</div></div>
        <div class="program-cell">${dayDrugPillsHtml(d)}</div>
        <div class="program-cell">${dayVaccinePillHtml(d)}</div>
        <div class="program-cell" style="color:var(--text-secondary);font-size:11px">${d?.note||''}</div>
        <div class="program-cell">${statusCell}</div>
      </div>`;
    }
  }

  // 이 배치에 입력된 품종을 기준으로, 표준 매뉴얼에서 사육 전 기간의 목표 온·습도를
  // 찾아 구간표로 정리한다. 오늘 해당하는 구간은 따로 표시해 현장에서 바로 보게 한다.
  const envHtml = buildBatchEnvHtml(b, dayAge);

  const logsHtml = logs.length ? `<div class="tbl-wrap"><table><thead><tr><th>일령</th><th>날짜</th><th>구분</th><th>약품</th><th>백신</th><th>메모</th><th>기록자</th><th>관리</th></tr></thead><tbody>
    ${logs.slice().sort((a,b2)=>(b2.programDay||0)-(a.programDay||0)).map(l => `<tr>
      <td>${l.programDay ? l.programDay+'일' : '-'}</td>
      <td>${l.logDate}</td>
      <td>${l.administered === false ? '<span class="badge badge-amber">미투약</span>' : '<span class="badge badge-green">투약</span>'}</td>
      <td>${l.drugName||'-'}</td>
      <td>${l.vaccineName||'-'}</td>
      <td style="color:var(--text-secondary)">${l.note||'-'}</td>
      <td style="color:var(--text-secondary);font-size:11px">${l.administeredByEmail||'-'}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteMedicationLog('${l.id}')">삭제</button></td>
    </tr>`).join('')}
  </tbody></table></div>` : '<div class="empty-state"><p>기록된 투약 이력이 없습니다.</p></div>';

  wrap.innerHTML = `
    <button class="btn btn-outline btn-sm mb-16" onclick="showPage('batches')">← 목록으로</button>
    <div class="batch-hero">
      <div class="stat-card"><div class="stat-label">현재 일령</div><div class="stat-value big">${dayAge<1?'예정':dayAge+'일'}</div><div class="stat-sub">${b.status==='completed'?'사육 종료':computeBatchDisplayStatus(b).label}</div></div>
      <div class="stat-card"><div class="stat-label">농장</div><div class="stat-value" style="font-size:16px">${farm?.name||'-'}</div><div class="stat-sub">${b.house?b.house+' · ':''}${farm?.address||''}</div></div>
      <div class="stat-card"><div class="stat-label">프로그램</div><div class="stat-value" style="font-size:16px">${prog?prog.name:(b.programName||'-')}</div><div class="stat-sub">${prog?prog.duration+'일령 프로그램':''}</div></div>
      <div class="stat-card"><div class="stat-label">입추수수</div><div class="stat-value" style="font-size:16px">${b.birdCount?Number(b.birdCount).toLocaleString()+'수':'-'}</div><div class="stat-sub">입추일 ${b.placementDate}</div></div>
    </div>
    <div class="card mb-16">
      <div class="card-header"><div class="card-title">일자별 계획 대비 실적</div></div>
      ${prog ? `<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">
        <div class="day-plan-row" style="background:var(--bg)">
          <div class="program-cell head" style="text-align:center">일령</div>
          <div class="program-cell head">💊 약품투약</div>
          <div class="program-cell head">💉 백신사항</div>
          <div class="program-cell head">⚠️ 중요사항</div>
          <div class="program-cell head">기록상태</div>
        </div>
        ${rowsHtml}
      </div>` : '<div class="empty-state"><p>연결된 투약 프로그램이 없습니다. 편집에서 프로그램을 선택하세요.</p></div>'}
    </div>
    ${envHtml}
    <div class="card">
      <div class="card-header"><div class="card-title">투약 이력</div></div>
      ${logsHtml}
    </div>
  `;
}

// 배치에 등록된 품종 → 표준 매뉴얼의 일령/주령별 목표 온·습도 구간표.
// 품종이 없거나 매뉴얼이 없는 축종(오리·토종닭 등)이면 안내만 띄운다.
function buildBatchEnvHtml(b, dayAge) {
  const speciesKey = speciesKeyOf(b.species);
  const breed = speciesKey ? CONSULT_BREEDS[speciesKey]?.breeds[b.breed] : null;
  if (!speciesKey || !breed) {
    return `<div class="card mb-16">
      <div class="card-header"><div class="card-title">🌡️ 계사 목표 온·습도</div></div>
      <p class="text-muted">${b.species && !speciesKey
        ? `${b.species}는 육종회사 표준 온·습도 매뉴얼이 등록돼 있지 않습니다(육계·산란계만 지원).`
        : '이 배치에 축종·품종이 입력되어 있지 않습니다. 편집에서 품종을 선택하면 매뉴얼 기준 온·습도가 표시됩니다.'}</p>
    </div>`;
  }
  const isBroiler = speciesKey === 'broiler';
  const table = isBroiler ? BROILER_ENV_DEFAULT : LAYER_ENV_DEFAULT;
  const curAge = isBroiler ? dayAge : Math.ceil(dayAge / 7);
  const curBand = dayAge >= 1 ? lookupEnvStandard(speciesKey, b.breed, curAge) : null;

  let prev = 0;
  const rows = table.map(band => {
    const key = isBroiler ? 'maxDay' : 'maxWeek';
    const lo = prev + 1;
    const hi = band[key];
    prev = hi;
    const label = hi >= 999 ? `${lo}${isBroiler ? '일령' : '주령'}~` : `${lo}~${hi}${isBroiler ? '일령' : '주령'}`;
    const isNow = curBand && band.stage === curBand.stage && curAge >= lo && (hi >= 999 || curAge <= hi);
    return `<tr${isNow ? ' style="background:var(--accent-light);font-weight:700"' : ''}>
      <td>${label}${isNow ? ' <span class="badge badge-blue">현재</span>' : ''}</td>
      <td>${band.stage}</td>
      <td><strong style="color:var(--accent)">${band.tMin}~${band.tMax}℃</strong> <span class="text-muted">(목표 ${band.t}℃)</span></td>
      <td>${band.rhMin}~${band.rhMax}%</td>
    </tr>`;
  }).join('');

  const nowLine = curBand
    ? `<div class="mb-16" style="font-size:13px">오늘 <strong>${isBroiler ? dayAge + '일령' : curAge + '주령'}</strong> ·
        목표 온도 <strong style="color:var(--accent)">${curBand.tRange}</strong> ·
        목표 습도 <strong>${curBand.rhRange}</strong> <span class="text-muted">(${curBand.stage})</span></div>`
    : '<div class="mb-16 text-muted" style="font-size:13px">아직 입추 전이라 현재 구간이 없습니다.</div>';

  return `<div class="card mb-16">
    <div class="card-header"><div class="card-title">🌡️ 계사 목표 온·습도 — ${breed.name}</div></div>
    ${nowLine}
    <div class="tbl-wrap"><table>
      <thead><tr><th>구간</th><th>단계</th><th>목표 온도</th><th>목표 습도</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="text-muted mt-16" style="font-size:11px">
      출처: ${curBand ? curBand.source : ENV_SOURCE[speciesKey]}<br>
      계사 내부 기준값입니다. 온도계 수치보다 계군의 행동(헐떡임·웅크림·분산)을 최종 판단 기준으로 삼고,
      농장이 보유한 매뉴얼 판본과 다르면 그 값을 우선하세요.
    </p>
  </div>`;
}
