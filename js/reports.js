// ─── 통계/리포트 ──────────────────────────────────────────────────────────
// 배치의 계획 대비 실적 이행률: 현재일령(또는 프로그램 종료일)까지 계획된 날 중
// 실제 기록이 있는 날의 비율. 연결된 프로그램이 삭제됐거나(program_id null) 계획이
// 아직 시작 전이면 계산에서 제외한다.
function computeBatchAdherence(b) {
  if (!b.programId) return null;
  const prog = load('programs').find(p => p.id === b.programId);
  if (!prog) return null;
  const dayAge = computeDayAge(b.placementDate);
  const upTo = Math.min(dayAge, prog.duration);
  if (upTo < 1) return null;
  const logs = load('medicationLogs').filter(l => l.batchId === b.id);
  let planned = 0, done = 0;
  for (let i = 1; i <= upTo; i++) {
    const d = prog.days.find(x => x.day === i);
    const hasPlan = d && ((d.drugs && d.drugs.length) || d.vaccine);
    if (!hasPlan) continue;
    planned++;
    if (logs.some(l => l.programDay === i)) done++;
  }
  if (planned === 0) return null;
  const farmName = load('farms').find(f => f.id === b.farmId)?.name || '(삭제된 농장)';
  return { planned, done, rate: Math.round((done/planned)*100), farmName, progName: prog.name, batchId: b.id };
}

function renderReports() {
  const batches = load('batches');
  const farms = load('farms');
  const logs = load('medicationLogs');
  const active = batches.filter(b => b.status === 'active').length;
  const completed = batches.filter(b => b.status === 'completed').length;
  const thisMonth = new Date().toISOString().slice(0,7);
  const logsThisMonth = logs.filter(l => (l.logDate||'').startsWith(thisMonth)).length;

  const adherenceList = batches.map(computeBatchAdherence).filter(Boolean);
  const avgAdherence = adherenceList.length ? Math.round(adherenceList.reduce((s,a) => s+a.rate, 0) / adherenceList.length) : null;

  document.getElementById('report-stats').innerHTML = [
    `<div class="stat-card"><div class="stat-label">사육중인 입추</div><div class="stat-value">${active}</div><div class="stat-sub">개 배치</div></div>`,
    `<div class="stat-card"><div class="stat-label">완료된 입추</div><div class="stat-value">${completed}</div><div class="stat-sub">개 배치</div></div>`,
    `<div class="stat-card"><div class="stat-label">이번달 투약 기록</div><div class="stat-value">${logsThisMonth}</div><div class="stat-sub">건</div></div>`,
    `<div class="stat-card"><div class="stat-label">평균 계획 이행률</div><div class="stat-value">${avgAdherence!=null?avgAdherence+'%':'-'}</div><div class="stat-sub">계획 대비 실적 기록 비율</div></div>`,
  ].join('');

  const freq = {};
  logs.forEach(l => { if (l.drugName) freq[l.drugName] = (freq[l.drugName]||0) + 1; });
  const freqEntries = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 10);
  const maxFreq = freqEntries.length ? freqEntries[0][1] : 1;
  document.getElementById('report-drug-usage').innerHTML = freqEntries.length ? freqEntries.map(([name,count]) => `
    <div class="flex-gap" style="margin-bottom:8px">
      <div style="width:120px;font-size:12px;flex-shrink:0">${name}</div>
      <div class="usage-bar-track"><div class="usage-bar-fill" style="width:${Math.max(4,count/maxFreq*100)}%"></div></div>
      <div style="width:32px;text-align:right;font-size:12px;font-weight:700">${count}</div>
    </div>`).join('') : '<div class="empty-state"><p>투약 기록이 없습니다.</p></div>';

  const byFarm = {};
  batches.forEach(b => { (byFarm[b.farmId] = byFarm[b.farmId]||[]).push(b); });
  const farmRows = Object.entries(byFarm).map(([farmId, list]) => {
    const farm = farms.find(f => f.id === farmId);
    const activeCount = list.filter(b => b.status === 'active').length;
    return `<tr><td><strong>${farm?.name||'(삭제된 농장)'}</strong></td><td>${list.length}</td><td>${activeCount}</td></tr>`;
  }).join('');
  document.getElementById('report-farm-table').innerHTML = farmRows
    ? `<div class="tbl-wrap"><table><thead><tr><th>농장명</th><th>전체 입추</th><th>사육중</th></tr></thead><tbody>${farmRows}</tbody></table></div>`
    : '<div class="empty-state"><p>등록된 입추 기록이 없습니다.</p></div>';

  document.getElementById('report-adherence').innerHTML = adherenceList.length ? adherenceList.map(a => `
    <div style="margin-bottom:10px">
      <div class="flex-between" style="margin-bottom:4px">
        <span style="font-size:12px"><strong>${a.farmName}</strong> · ${a.progName}</span>
        <span style="font-size:12px;font-weight:700">${a.rate}% (${a.done}/${a.planned})</span>
      </div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${a.rate}%"></div></div>
    </div>`).join('') : '<div class="empty-state"><p>이행률을 계산할 입추 기록이 없습니다.</p></div>';
}
