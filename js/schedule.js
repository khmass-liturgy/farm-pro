// ─── 투약 일정 뷰 ──────────────────────────────────────────────────────────
function populateScheduleSelects() {
  const sel = document.getElementById('sched-farm-select');
  if (!sel) return;
  const evantFarmIds = new Set(computeEvantTargets().targets.map(t => t.farmId));
  sel.innerHTML = '<option value="">농장을 선택하세요</option>' + farmsByOwner().map(f =>
    `<option value="${f.id}">${f.name} (${f.owner})${evantFarmIds.has(f.id) ? ' 💉 에반트' : ''}</option>`
  ).join('');
  renderEvantCard();
  renderScheduleAlerts();
}

// ─── 1일령 콕시듐 백신(에반트) 대상 농장 ──────────────────────────────────
// 에반트는 입추 당일(1일령)에 놓아야 해서 날짜를 놓치면 다시 할 수 없다. 그래서 투약 프로그램의
// 1일령 백신이 에반트(또는 백신 등록에서 대상 질병이 콕시듐인 백신)인 계군을 따로 모아 보여준다.
//  · 사육중인 입추(배치)가 그 프로그램을 쓰면 배치의 입추일로, 배치가 없으면 프로그램에 적힌 입추일로 본다.
//  · 보여주는 것: 입추 예정·오늘인 곳 + 지났는데 1일령 실적 기록이 없는 곳(EVANT_SHOW_PAST_DAYS일까지).
//    1일령 실적이 기록된 곳은 끝난 것으로 보고 뺀다. 입추일이 없는 프로그램은 "입추일 미정"으로 맨 아래에.
const EVANT_SHOW_PAST_DAYS = 7;

function isCoccidiosisVaccine(v) {
  if (!v) return false;
  const name = v.name || '';
  if (/에반트|evant/i.test(name)) return true;
  const master = load('vaccines').find(x => (v.vaccineId && x.id === v.vaccineId) || (x.name && x.name === name));
  return !!master && /콕시듐|에반트|evant/i.test(`${master.disease || ''} ${master.name || ''}`);
}

function computeEvantTargets() {
  const farms = load('farms');
  const logs = load('medicationLogs');
  const batches = load('batches');
  const programs = load('programs').filter(p => isCoccidiosisVaccine((p.days || []).find(d => d.day === 1)?.vaccine));
  const targets = [];
  programs.forEach(p => {
    const vaccineName = p.days.find(d => d.day === 1).vaccine.name;
    const active = batches.filter(b => b.programId === p.id && b.status === 'active');
    const entries = active.length
      ? active.map(b => ({ farmId: b.farmId, batchId: b.id, house: b.house || '', placementDate: b.placementDate,
          done: logs.some(l => l.batchId === b.id && l.programDay === 1 && l.administered !== false) }))
      : [{ farmId: p.farmId, batchId: null, house: '', placementDate: p.placementDate || '', done: false }];
    entries.forEach(e => {
      const dayAge = e.placementDate ? computeDayAge(e.placementDate) : null;
      if (e.done) return;
      if (dayAge != null && dayAge > 1 + EVANT_SHOW_PAST_DAYS) return;
      const farm = farms.find(f => f.id === e.farmId);
      targets.push({ ...e, dayAge, programId: p.id, programName: p.name, vaccineName,
        farmName: farm?.name || p.farmName || '(삭제된 농장)', owner: farm?.owner || '' });
    });
  });
  // 날짜가 있는 것은 입추일이 이른 순(지난 미기록 → 오늘 → 가까운 예정), 입추일 미정은 맨 뒤
  targets.sort((a, b) => (a.placementDate ? 0 : 1) - (b.placementDate ? 0 : 1) || (a.placementDate || '').localeCompare(b.placementDate || ''));
  return { targets, programCount: programs.length };
}

function renderEvantCard() {
  const el = document.getElementById('schedule-evant');
  if (!el) return;
  const { targets, programCount } = computeEvantTargets();
  const head = `<div class="card-header"><div class="card-title">💉 1일령 콕시듐백신(에반트) 대상 농장 <span class="text-muted" style="font-weight:400;font-size:12px">— 입추 당일에 놓아야 합니다. 줄을 누르면 그 농장 일정으로 갑니다</span></div></div>`;
  if (!programCount) {
    el.innerHTML = `<div class="card mb-16">${head}<p class="text-muted" style="font-size:12px">1일령 백신에 에반트(콕시듐 백신)가 들어간 투약 프로그램이 없습니다. 「투약 프로그램」의 1일령 백신에 에반트를 넣으면 여기에 표시됩니다.</p></div>`;
    return;
  }
  if (!targets.length) {
    el.innerHTML = `<div class="card mb-16">${head}<p class="text-muted" style="font-size:12px">지금 에반트를 놓아야 할 농장은 없습니다. (에반트가 들어간 프로그램 ${programCount}개 — 입추 예정·오늘이거나 지났는데 1일령 실적이 없는 계군만 보여줍니다)</p></div>`;
    return;
  }
  const status = t => {
    if (t.dayAge == null) return '<span class="badge badge-purple">입추일 미정</span>';
    if (t.dayAge < 1) return `<span class="badge badge-amber">입추 D-${1 - t.dayAge}</span>`;
    if (t.dayAge === 1) return '<span class="badge badge-red">오늘 접종</span>';
    return `<span class="badge badge-red">${t.dayAge - 1}일 지남 · 미기록</span>`;
  };
  el.innerHTML = `<div class="card mb-16">${head}
    <div class="tbl-wrap"><table>
      <thead><tr><th>상태</th><th>농장</th><th>입추일(1일령)</th><th>투약 프로그램</th><th>백신</th></tr></thead>
      <tbody>${targets.map(t => `
        <tr class="row-click" onclick="jumpToEvantSchedule('${t.farmId}','${t.programId}')">
          <td>${status(t)}</td>
          <td><strong>${t.farmName}</strong>${t.house ? ` <span class="text-muted">${t.house}</span>` : ''}<div style="font-size:11px;color:var(--text-secondary)">${t.owner}</div></td>
          <td>${t.placementDate || '-'}</td>
          <td>${t.programName}</td>
          <td>💉 ${t.vaccineName}</td>
        </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

function jumpToEvantSchedule(farmId, programId) {
  document.getElementById('sched-farm-select').value = farmId;
  loadScheduleForFarm();
  document.getElementById('sched-prog-select').value = programId;
  renderScheduleView();
}

// 전체 농장 대상, 앞으로 DUE_SOON_HORIZON_DAYS일 이내 투약/백신 예정 알림
function renderScheduleAlerts() {
  const el = document.getElementById('schedule-alerts');
  if (!el) return;
  const alerts = computeDueSoonAlerts();
  if (!alerts.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="card mb-16">
    <div class="card-header"><div class="card-title">⏰ ${DUE_SOON_HORIZON_DAYS}일 이내 투약/백신 예정 알림</div></div>
    ${alerts.map(a => `<div class="alert-row ${a.level}" onclick="jumpToFarmSchedule('${a.farmId}')" style="cursor:pointer">${a.text}</div>`).join('')}
  </div>`;
}

function jumpToFarmSchedule(farmId) {
  document.getElementById('sched-farm-select').value = farmId;
  loadScheduleForFarm();
}

function loadScheduleForFarm() {
  const farmId = document.getElementById('sched-farm-select').value;
  const progs = load('programs').filter(p => p.farmId === farmId);
  const sel = document.getElementById('sched-prog-select');
  sel.innerHTML = '<option value="">투약 프로그램 선택</option>' + progs.map(p =>
    `<option value="${p.id}">${p.name}</option>`
  ).join('');
  document.getElementById('schedule-view').innerHTML = '';
}

function renderScheduleView() {
  const progId = document.getElementById('sched-prog-select').value;
  if (!progId) { document.getElementById('schedule-view').innerHTML=''; return; }
  const prog = load('programs').find(p => p.id === progId);
  if (!prog) return;
  const farm = load('farms').find(f => f.id === prog.farmId);

  // 이 프로그램을 쓰는 사육중인 계군(배치)의 입추일이 있으면 그걸로, 없으면 프로그램
  // 자체에 입력된 입추일로 일령을 계산해 오늘(today)/7일 이내(upcoming) 예정 항목을
  // 강조 표시하고, 각 일령의 실제 날짜도 함께 보여준다.
  const activeBatch = load('batches').find(b => b.programId === progId && b.status === 'active');
  const refPlacementDate = activeBatch ? activeBatch.placementDate : prog.placementDate;
  const dayAge = refPlacementDate ? computeDayAge(refPlacementDate) : null;

  // 품종이 정해져 있으면 일령별 목표 온·습도도 함께 보여준다
  // (투약 프로그램 목록·상세·인쇄와 같은 기준: js/programs.js의 programHasEnv/programEnvFor).
  const showEnv = programHasEnv(prog);

  // 사육중인 계군이 연결돼 있으면 그 계군의 실적(투약/미투약)을 함께 보여준다.
  // 계군이 없으면 실적이랄 게 없으므로 상태 칸 자체를 띄우지 않는다.
  const showStatus = !!activeBatch;
  const batchLogs = activeBatch ? load('medicationLogs').filter(l => l.batchId === activeBatch.id) : [];
  const envCls = (showEnv ? ' with-env' : '') + (showStatus ? ' with-status' : '');

  function dayStatusHtml(day, hasPlan) {
    if (!hasPlan) return '<span class="text-muted">-</span>';
    const forDay = batchLogs.filter(l => l.programDay === day);
    if (forDay.some(l => l.administered !== false)) return '<span class="badge badge-green">투약</span>';
    const skipped = forDay.find(l => l.administered === false);
    if (skipped) return '<span class="badge badge-amber">미투약</span>';
    if (dayAge != null && day <= dayAge) return '<span class="badge badge-red">미기록</span>';
    return '<span class="text-muted">예정</span>';
  }

  let rows = '';
  for (let i = 1; i <= prog.duration; i++) {
    const d = prog.days.find(x => x.day === i);
    const hasData = d && ((d.drugs && d.drugs.length) || d.vaccine || d.note);
    const isToday = dayAge != null && i === dayAge;
    const isUpcoming = dayAge != null && i > dayAge && i <= dayAge + DUE_SOON_HORIZON_DAYS;
    const rowClass = isToday ? 'today' : (isUpcoming ? 'upcoming' : '');
    const env = showEnv ? programEnvFor(prog, i) : null;
    rows += `<div class="program-day-row${envCls} ${rowClass}" style="${rowClass ? '' : 'background:' + (hasData ? 'var(--bg-card)' : 'var(--bg)')}">
      <div class="program-cell num">${i}일${isToday ? ' (오늘)' : ''}<div style="font-size:10px;color:var(--text-secondary);font-weight:400">${programDayDateShort(refPlacementDate, i)}</div></div>
      <div class="program-cell">${(d && d.drugs && d.drugs.length) ? dayDrugPillsHtml(d) : ''}</div>
      <div class="program-cell">${(d && d.vaccine) ? dayVaccinePillHtml(d) : ''}</div>
      ${showEnv ? `<div class="program-cell" style="text-align:center;font-size:11px;line-height:1.4;white-space:nowrap">
        <span style="color:var(--accent);font-weight:700">${env ? env.tRange : '-'}</span><br>
        <span style="color:var(--text-secondary)">${env ? env.rhRange : '-'}</span>
      </div>` : ''}
      ${showStatus ? `<div class="program-cell" style="text-align:center">${dayStatusHtml(i, !!(d && ((d.drugs && d.drugs.length) || d.vaccine)))}</div>` : ''}
      <div class="program-cell" style="color:var(--text-secondary);font-size:11px">${d?.note||''}</div>
      <div class="program-cell" style="text-align:center">
        <button class="btn btn-outline btn-sm" onclick="openDayPlanModal('${prog.id}',${i},'${refPlacementDate || ''}')" title="${i}일령의 투약 프로그램 계획을 고칩니다">변경</button>
      </div>
    </div>`;
  }

  document.getElementById('schedule-view').innerHTML = `
    <div class="card mb-16">
      <div class="card-header">
        <div>
          <div class="card-title">${prog.name}</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">
            🏘️ ${prog.farmName}${farm?' · '+farm.address:''} &nbsp;|&nbsp; 총 ${prog.duration}일령 프로그램
          </div>
        </div>
      </div>
      ${prog.focus ? `<div style="padding:8px 12px;background:var(--amber-bg);border-radius:6px;font-size:12px;color:var(--amber);margin-bottom:14px">⚠️ <strong>중점 관리사항:</strong> ${prog.focus}</div>` : ''}
      <div style="border:1px solid var(--border);border-radius:8px;overflow-x:auto">
        <div class="program-day-row${envCls}" style="background:var(--bg)">
          <div class="program-cell head" style="text-align:center">일령</div>
          <div class="program-cell head">💊 약품투약</div>
          <div class="program-cell head">💉 백신사항</div>
          ${showEnv ? `<div class="program-cell head" style="text-align:center">🌡️ 온·습도</div>` : ''}
          ${showStatus ? `<div class="program-cell head" style="text-align:center">실적</div>` : ''}
          <div class="program-cell head">⚠️ 중요사항</div>
          <div class="program-cell head" style="text-align:center">계획</div>
        </div>
        ${rows}
      </div>
      ${prog.notes ? `<div style="margin-top:12px;padding:12px;background:var(--accent-light);border-radius:8px;font-size:12px;color:var(--accent-dark)">
        <strong>투약 관리 포인트:</strong><br>${prog.notes}</div>` : ''}
      ${buildFeedSection(prog)}
    </div>`;
}
