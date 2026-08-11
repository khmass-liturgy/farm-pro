// ─── 대시보드 ─────────────────────────────────────────────────────────────
function parseWithdrawalDays(text) {
  if (!text) return null;
  const m = /(\d+)/.exec(text);
  return m ? parseInt(m[1], 10) : null;
}

// 활성 입추 배치 중, 오늘부터 DUE_SOON_HORIZON_DAYS일 이내에 투약/백신 계획이 있는데
// 아직 기록되지 않은 항목. 계군(배치)의 입추일을 기준으로 일령을 계산해 알려준다.
const DUE_SOON_HORIZON_DAYS = 7;
function computeDueSoonAlerts(horizonDays = DUE_SOON_HORIZON_DAYS) {
  const batches = load('batches').filter(b => b.status === 'active');
  const farms = load('farms');
  const programs = load('programs');
  const logs = load('medicationLogs');
  const alerts = [];
  batches.forEach(b => {
    if (!b.programId) return;
    const prog = programs.find(p => p.id === b.programId);
    if (!prog) return;
    const dayAge = computeDayAge(b.placementDate);
    const farm = farms.find(f => f.id === b.farmId);
    for (let offset = 0; offset <= horizonDays; offset++) {
      const day = dayAge + offset;
      if (day < 1 || day > prog.duration) continue;
      const d = prog.days.find(x => x.day === day);
      const hasPlan = d && ((d.drugs && d.drugs.length) || d.vaccine);
      if (!hasPlan) continue;
      if (logs.some(l => l.batchId === b.id && l.programDay === day)) continue;
      const label = [dayDrugLabel(d), dayVaccineLabel(d)].filter(Boolean).join(' / ');
      alerts.push({
        level: offset === 0 ? 'red' : 'amber',
        text: offset === 0
          ? `${farm?.name||''} — 오늘(${day}일령) 투약 예정: ${label} (미기록)`
          : `${farm?.name||''} — ${offset}일 후(${day}일령) 투약 예정: ${label}`,
        batchId: b.id,
        farmId: b.farmId, day, offset,
      });
    }
  });
  return alerts;
}

// 활성 입추 배치 중, 오늘부터 horizonDays일 이내에 투약/백신 계획이 있는 항목 전체
// (기록 여부 상관없이) — "다가오는 일정" 목록용. computeDueSoonAlerts는 미기록 건만
// 골라 경고 문구로 보여주는 반면, 이건 한 주 계획을 날짜순으로 그대로 보여준다.
function computeUpcomingSchedule(horizonDays = DUE_SOON_HORIZON_DAYS) {
  const batches = load('batches').filter(b => b.status === 'active');
  const farms = load('farms');
  const programs = load('programs');
  const logs = load('medicationLogs');
  const items = [];
  batches.forEach(b => {
    if (!b.programId) return;
    const prog = programs.find(p => p.id === b.programId);
    if (!prog) return;
    const dayAge = computeDayAge(b.placementDate);
    const farm = farms.find(f => f.id === b.farmId);
    for (let offset = 0; offset <= horizonDays; offset++) {
      const day = dayAge + offset;
      if (day < 1 || day > prog.duration) continue;
      const d = prog.days.find(x => x.day === day);
      const hasPlan = d && ((d.drugs && d.drugs.length) || d.vaccine);
      if (!hasPlan) continue;
      items.push({
        date: programDayDate(b.placementDate, day),
        farmName: farm?.name || '', batchId: b.id, day, offset,
        drugLabel: dayDrugLabel(d), vaccineLabel: dayVaccineLabel(d),
        logged: logs.some(l => l.batchId === b.id && l.programDay === day),
      });
    }
  });
  items.sort((a, b) => a.date.localeCompare(b.date) || a.farmName.localeCompare(b.farmName));
  return items;
}

// 활성 입추 배치의 최근 투약 기록 중 휴약기간이 아직 끝나지 않은 항목
// (drug_id가 삭제되었거나 자유입력 약품은 withdrawal을 알 수 없어 계산에서 제외됨)
function computeWithdrawalAlerts() {
  const batches = load('batches').filter(b => b.status === 'active');
  const farms = load('farms');
  const drugs = load('drugs');
  const logs = load('medicationLogs');
  const today = new Date(); today.setHours(0,0,0,0);
  const alerts = [];
  batches.forEach(b => {
    const batchLogs = logs
      .filter(l => l.batchId === b.id && l.drugId)
      .slice().sort((a,c) => c.logDate.localeCompare(a.logDate));
    batchLogs.forEach(l => {
      const drug = drugs.find(d => d.id === l.drugId);
      const wd = parseWithdrawalDays(drug?.withdrawal);
      if (!wd) return;
      const endDate = new Date(new Date(l.logDate + 'T00:00:00').getTime() + wd * 86400000);
      if (endDate >= today) {
        const farm = farms.find(f => f.id === b.farmId);
        alerts.push({
          level: 'amber',
          text: `${farm?.name||''} — ${drug?.name||l.drugName} 휴약기간 진행중 (종료: ${endDate.toISOString().slice(0,10)})`,
          batchId: b.id,
        });
      }
    });
  });
  return alerts;
}

function renderDashboard() {
  const farms = load('farms'), drugs = load('drugs'), programs = load('programs');
  const batches = load('batches'), logs = load('medicationLogs');
  const activeBatches = batches.filter(b => b.status === 'active').length;
  const thisMonth = new Date().toISOString().slice(0,7);
  const logsThisMonth = logs.filter(l => (l.logDate||'').startsWith(thisMonth)).length;

  document.getElementById('dash-stats').innerHTML = [
    `<div class="stat-card"><div class="stat-label">등록 농장</div><div class="stat-value">${farms.length}</div><div class="stat-sub">개 농장</div></div>`,
    `<div class="stat-card"><div class="stat-label">투약 프로그램</div><div class="stat-value">${programs.length}</div><div class="stat-sub">개 프로그램</div></div>`,
    `<div class="stat-card"><div class="stat-label">사육중인 입추</div><div class="stat-value">${activeBatches}</div><div class="stat-sub">개 배치</div></div>`,
    `<div class="stat-card"><div class="stat-label">이번달 투약 기록</div><div class="stat-value">${logsThisMonth}</div><div class="stat-sub">건</div></div>`,
  ].join('');

  const dueSoon = computeDueSoonAlerts();
  const withdrawal = computeWithdrawalAlerts();
  const alertsEl = document.getElementById('dash-alerts');
  if (!dueSoon.length && !withdrawal.length) {
    alertsEl.innerHTML = '';
  } else {
    alertsEl.innerHTML = `<div class="card mb-16">
      <div class="card-header"><div class="card-title">⏰ 알림</div></div>
      ${dueSoon.map(a => `<div class="alert-row ${a.level}" onclick="openBatchDetail('${a.batchId}')" style="cursor:pointer">${a.text}</div>`).join('')}
      ${withdrawal.map(a => `<div class="alert-row ${a.level}" onclick="openBatchDetail('${a.batchId}')" style="cursor:pointer">${a.text}</div>`).join('')}
    </div>`;
  }

  const upcoming = computeUpcomingSchedule();
  const upcomingEl = document.getElementById('dash-upcoming');
  if (!upcoming.length) {
    upcomingEl.innerHTML = '';
  } else {
    const upcomingRows = upcoming.map(it => `
      <tr onclick="openBatchDetail('${it.batchId}')" style="cursor:pointer">
        <td>${it.date}${it.offset === 0 ? ' <span class="badge badge-red">오늘</span>' : ''}</td>
        <td><strong>${it.farmName}</strong></td>
        <td>${it.day}일령</td>
        <td>${it.drugLabel ? `<span class="drug-pill">${it.drugLabel}</span>` : '-'}</td>
        <td>${it.vaccineLabel ? `<span class="vaccine-pill">💉 ${it.vaccineLabel}</span>` : '-'}</td>
        <td>${it.logged ? '<span class="badge badge-green">기록완료</span>' : '<span class="badge badge-amber">예정</span>'}</td>
      </tr>`).join('');
    upcomingEl.innerHTML = `<div class="card mb-16">
      <div class="card-header"><div class="card-title">📅 다가오는 ${DUE_SOON_HORIZON_DAYS}일 투약 일정</div></div>
      <div class="tbl-wrap"><table><thead><tr><th>날짜</th><th>농장</th><th>일령</th><th>약품</th><th>백신</th><th>상태</th></tr></thead><tbody>${upcomingRows}</tbody></table></div>
    </div>`;
  }

  const farmRows = farms.slice(-5).reverse().map(f =>
    `<tr><td><strong>${f.name}</strong></td><td>${f.owner}</td><td><span class="badge badge-blue">${f.type}</span></td><td style="color:var(--text-secondary)">${f.address}</td></tr>`
  ).join('') || `<tr><td colspan="4" class="text-muted" style="text-align:center;padding:20px">등록된 농장이 없습니다</td></tr>`;
  document.getElementById('dash-recent-farms').innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>농장명</th><th>농장주</th><th>축종</th><th>주소</th></tr></thead><tbody>${farmRows}</tbody></table></div>`;

  const drugTypeColors = { '항생제':'badge-blue', '콕시듐제':'badge-green', '영양제':'badge-amber', '소독제':'badge-teal', '성장촉진제':'badge-purple', '대사촉진제':'badge-red', '기타':'badge-red' };
  const drugRows = drugs.slice(0,8).map(d =>
    `<tr><td><strong>${d.name}</strong></td><td><span class="badge ${drugTypeColors[d.type]||'badge-blue'}">${d.type}</span></td><td style="color:var(--text-secondary)">${d.withdrawal||'-'}</td></tr>`
  ).join('') || `<tr><td colspan="3" class="text-muted" style="text-align:center;padding:20px">등록된 약품이 없습니다</td></tr>`;
  document.getElementById('dash-drugs').innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>약품명</th><th>분류</th><th>휴약기간</th></tr></thead><tbody>${drugRows}</tbody></table></div>`;
}
