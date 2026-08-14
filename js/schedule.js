// ─── 투약 일정 뷰 ──────────────────────────────────────────────────────────
function populateScheduleSelects() {
  const sel = document.getElementById('sched-farm-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">농장을 선택하세요</option>' + farmsByOwner().map(f =>
    `<option value="${f.id}">${f.name} (${f.owner})</option>`
  ).join('');
  renderScheduleAlerts();
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

  let rows = '';
  for (let i = 1; i <= prog.duration; i++) {
    const d = prog.days.find(x => x.day === i);
    const hasData = d && ((d.drugs && d.drugs.length) || d.vaccine || d.note);
    const isToday = dayAge != null && i === dayAge;
    const isUpcoming = dayAge != null && i > dayAge && i <= dayAge + DUE_SOON_HORIZON_DAYS;
    const rowClass = isToday ? 'today' : (isUpcoming ? 'upcoming' : '');
    rows += `<div class="program-day-row ${rowClass}" style="${rowClass ? '' : 'background:' + (hasData ? 'var(--bg-card)' : 'var(--bg)')}">
      <div class="program-cell num">${i}일${isToday ? ' (오늘)' : ''}<div style="font-size:10px;color:var(--text-secondary);font-weight:400">${programDayDateShort(refPlacementDate, i)}</div></div>
      <div class="program-cell">${(d && d.drugs && d.drugs.length) ? dayDrugPillsHtml(d) : ''}</div>
      <div class="program-cell">${(d && d.vaccine) ? dayVaccinePillHtml(d) : ''}</div>
      <div class="program-cell" style="color:var(--text-secondary);font-size:11px">${d?.note||''}</div>
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
      <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">
        <div class="program-day-row" style="background:var(--bg)">
          <div class="program-cell head" style="text-align:center">일령</div>
          <div class="program-cell head">💊 약품투약</div>
          <div class="program-cell head">💉 백신사항</div>
          <div class="program-cell head">⚠️ 중요사항</div>
        </div>
        ${rows}
      </div>
      ${prog.notes ? `<div style="margin-top:12px;padding:12px;background:var(--accent-light);border-radius:8px;font-size:12px;color:var(--accent-dark)">
        <strong>투약 관리 포인트:</strong><br>${prog.notes}</div>` : ''}
      ${buildFeedSection(prog)}
    </div>`;
}
