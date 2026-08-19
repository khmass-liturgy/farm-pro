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
      const dateStr = programDayDateShort(b.placementDate, day);
      alerts.push({
        level: offset === 0 ? 'red' : 'amber',
        text: offset === 0
          ? `${farm?.name||''} — 오늘 ${dateStr}(${day}일령) 투약 예정: ${label} (미기록)`
          : `${farm?.name||''} — ${offset}일 후 ${dateStr}(${day}일령) 투약 예정: ${label}`,
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

// 입추일이 입력된 모든 투약 프로그램에서, 그 프로그램의 입추일 기준 "오늘"에 해당하는
// 일령부터 15일치 계획. computeUpcomingSchedule과 달리 배치(사육중 여부)와 무관하게
// 프로그램 자체를 훑는다(입추 전/후 상관없이 프로그램만 등록돼 있으면 대상).
const PROGRAM_SCHEDULE_HORIZON_DAYS = 14; // offset 0~14 = 오늘 포함 15일
// 목록에 못 들어간 프로그램은 그 사유도 함께 돌려준다. 조건이 안 맞는다고 카드를 그냥
// 비우면 "방금 만든 프로그램이 대시보드에 안 뜬다"로만 보이고 원인을 알 수 없다.
// 특히 입추일은 프로그램 등록 시 선택 항목이라, 안 넣으면 여기서 통째로 빠진다.
function computeProgramNext15Days(horizonDays = PROGRAM_SCHEDULE_HORIZON_DAYS) {
  const items = [];
  const excluded = [];
  load('programs').forEach(p => {
    const label = { programId: p.id, programName: p.name, farmName: p.farmName || '' };
    if (!p.placementDate) {
      excluded.push({ ...label, reason: '입추일이 입력되지 않음 — 프로그램 편집에서 입추일을 넣으면 표시됩니다' });
      return;
    }
    const dayAge = computeDayAge(p.placementDate);
    const before = items.length;
    for (let offset = 0; offset <= horizonDays; offset++) {
      const day = dayAge + offset;
      if (day < 1 || day > p.duration) continue;
      const d = p.days.find(x => x.day === day);
      const hasPlan = d && ((d.drugs && d.drugs.length) || d.vaccine);
      if (!hasPlan) continue;
      items.push({
        date: programDayDate(p.placementDate, day),
        programId: p.id, programName: p.name, farmName: p.farmName, day, offset,
        drugLabel: dayDrugLabel(d), vaccineLabel: dayVaccineLabel(d),
      });
    }
    if (items.length === before) {
      const reason = dayAge > p.duration
        ? `프로그램 기간이 지남 (${p.duration}일령 프로그램인데 입추일 기준 오늘 ${dayAge}일령)`
        : dayAge + horizonDays < 1
          ? `아직 입추 전 (입추일 ${p.placementDate})`
          : '앞으로 15일 안에 약품·백신 계획이 있는 날이 없음';
      excluded.push({ ...label, reason });
    }
  });
  items.sort((a, b) => a.date.localeCompare(b.date) || a.farmName.localeCompare(b.farmName));
  return { items, excluded };
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

  const { items: next15, excluded: next15Excluded } = computeProgramNext15Days();
  const next15El = document.getElementById('dash-program-15days');
  // 목록에 못 들어간 프로그램이 있으면 사유를 함께 적는다(왜 안 뜨는지 화면에서 알 수 있게).
  const excludedHtml = next15Excluded.length ? `
    <div class="${next15.length ? 'mt-16' : ''}" style="font-size:11px;color:var(--text-secondary)">
      <div style="font-weight:700;margin-bottom:4px">아래 프로그램은 이 목록에 포함되지 않았습니다</div>
      ${next15Excluded.map(e => `<div style="padding:3px 0;cursor:pointer" onclick="showPage('programs')">
        · <strong>${e.programName}</strong>${e.farmName ? ` <span class="text-muted">(${e.farmName})</span>` : ''} — ${e.reason}
      </div>`).join('')}
    </div>` : '';

  if (!next15.length && !next15Excluded.length) {
    next15El.innerHTML = ''; // 프로그램 자체가 없으면 할 말도 없다
  } else if (!next15.length) {
    next15El.innerHTML = `<div class="card mt-16">
      <div class="card-header"><div class="card-title">📋 프로그램 기준 오늘부터 15일 일정</div></div>
      <p class="text-muted mb-16">앞으로 15일 안에 예정된 투약 계획이 없습니다.</p>
      ${excludedHtml}
    </div>`;
  } else {
    const next15Rows = next15.map(it => `
      <tr onclick="showPage('programs')" style="cursor:pointer">
        <td>${it.date}${it.offset === 0 ? ' <span class="badge badge-red">오늘</span>' : ''}</td>
        <td><strong>${it.farmName}</strong></td>
        <td style="color:var(--text-secondary)">${it.programName}</td>
        <td>${it.day}일령</td>
        <td>${it.drugLabel ? `<span class="drug-pill">${it.drugLabel}</span>` : '-'}</td>
        <td>${it.vaccineLabel ? `<span class="vaccine-pill">💉 ${it.vaccineLabel}</span>` : '-'}</td>
      </tr>`).join('');
    next15El.innerHTML = `<div class="card mt-16">
      <div class="card-header"><div class="card-title">📋 프로그램 기준 오늘부터 15일 일정</div></div>
      <div class="tbl-wrap"><table><thead><tr><th>날짜</th><th>농장</th><th>프로그램</th><th>일령</th><th>약품</th><th>백신</th></tr></thead><tbody>${next15Rows}</tbody></table></div>
      ${excludedHtml}
    </div>`;
  }

  renderBreedSummaryCard();

  renderEnvStandardCard();
  if (dashWeatherState.status === 'idle') fetchDashboardWeather();

  if (poultryPriceState.status === 'idle') fetchPoultryPrices(); else renderPoultryPriceCard();
}

// ── 사양표준 요약 (육종회사 표준 매뉴얼) ─────────────────────────────────────
// 축종/품종이 설정된 사육중 배치를 대상으로, 오늘 일령(육계)/주령(산란계)에 해당하는
// 표준 수치를 js/breedStandards.js의 CONSULT_BREEDS·lookupBroiler·lookupLayerPhase로
// 조회한다(weather-consult.html의 육계/산란계 컨설팅 탭과 동일한 데이터·로직).
function computeBreedStandardSummary() {
  const batches = load('batches').filter(b => b.status === 'active' && b.species && b.breed);
  const farms = load('farms');
  const items = [];
  batches.forEach(b => {
    const speciesKey = b.species === '육계' ? 'broiler' : b.species === '산란계' ? 'layer' : null;
    if (!speciesKey) return; // 육계/산란계 외에는 표준 매뉴얼 자체가 없음
    const breed = CONSULT_BREEDS[speciesKey].breeds[b.breed];
    if (!breed) return;
    const farm = farms.find(f => f.id === b.farmId);
    const dayAge = computeDayAge(b.placementDate);
    if (dayAge < 1) return;
    let ageLabel, parts = [];
    if (speciesKey === 'broiler') {
      const row = lookupBroiler(breed.data, dayAge);
      ageLabel = `${dayAge}일령`;
      if (row[1] != null) parts.push(`목표체중 ${row[1].toLocaleString()}g`);
      if (row[4] != null) parts.push(`누적FCR ${row[4]}`);
    } else {
      const week = Math.ceil(dayAge / 7);
      const { phase, row } = lookupLayerPhase(breed.data, week);
      ageLabel = `${week}주령`;
      if (phase === 'production') {
        if (row[1] != null) parts.push(`산란율 ${row[1]}%`);
        if (row[2] != null) parts.push(`목표체중 ${row[2].toLocaleString()}g`);
        if (row[5] != null) parts.push(`평균난중 ${row[5]}g`);
        if (row[6] != null) parts.push(`누적폐사율 ${row[6]}%`);
      } else {
        if (row[1] != null) parts.push(`목표체중 ${row[1].toLocaleString()}g`);
        if (row[4] != null) parts.push(`누적폐사율 ${row[4]}%`);
      }
    }
    if (!parts.length) return;
    items.push({
      farmName: farm?.name || '', house: b.house || '-', breedName: breed.name,
      ageLabel, summaryText: parts.join(' · '), batchId: b.id,
    });
  });
  items.sort((a, b) => a.farmName.localeCompare(b.farmName));
  return items;
}

function renderBreedSummaryCard() {
  const el = document.getElementById('dash-breed-summary');
  if (!el) return;
  const items = computeBreedStandardSummary();
  if (!items.length) { el.innerHTML = ''; return; }
  const rows = items.map(it => `
    <tr onclick="openBatchDetail('${it.batchId}')" style="cursor:pointer">
      <td><strong>${it.farmName}</strong></td>
      <td style="color:var(--text-secondary)">${it.house}</td>
      <td>${it.breedName}</td>
      <td>${it.ageLabel}</td>
      <td>${it.summaryText}</td>
    </tr>`).join('');
  el.innerHTML = `<div class="card mt-16">
    <div class="card-header"><div class="card-title">🧬 사양표준 요약 (육종회사 매뉴얼)</div></div>
    <div class="tbl-wrap"><table><thead><tr><th>농장</th><th>동</th><th>품종</th><th>일령/주령</th><th>표준 수치</th></tr></thead><tbody>${rows}</tbody></table></div>
  </div>`;
}

// ── 계사 목표 온·습도 vs 오늘 날씨 ──────────────────────────────────────────
// 사육중 배치의 품종·일령으로 매뉴얼상 계사 목표 온·습도를 찾고, 같은 날 외기 예보와
// 나란히 보여준다.
//
// 중요: 목표값은 "계사 내부" 기준이고 예보는 "외기"라서 둘을 직접 비교해 정상/이상을
// 판정하면 안 된다. 그래서 판정 대신 "외기가 목표보다 O℃ 낮음 → 난방 부하" 처럼
// 그날 환경설비가 감당해야 할 부담으로 해석해서 보여준다.
// 위치는 날씨별 농장컨설팅 화면이 localStorage('weather_loc')에 저장한 값을 그대로 쓴다
// (같은 오리진의 iframe이라 저장소를 공유한다).
let dashWeatherState = { status: 'idle', today: null, locationName: '' };

async function fetchDashboardWeather() {
  let loc = null;
  try {
    const s = localStorage.getItem('weather_loc');
    if (s) loc = JSON.parse(s);
  } catch (e) { /* 저장값이 깨졌으면 위치 미설정으로 취급 */ }
  if (!loc || loc.lat == null || loc.lng == null) {
    dashWeatherState = { status: 'nolocation', today: null, locationName: '' };
    if (currentPage === 'dashboard') renderEnvStandardCard();
    return;
  }
  dashWeatherState = { status: 'loading', today: null, locationName: loc.name || '' };
  if (currentPage === 'dashboard') renderEnvStandardCard();
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}` +
      `&daily=temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean&timezone=Asia%2FSeoul&forecast_days=1`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const j = await resp.json();
    dashWeatherState = {
      status: 'done',
      today: {
        tMax: j.daily.temperature_2m_max?.[0],
        tMin: j.daily.temperature_2m_min?.[0],
        rh: j.daily.relative_humidity_2m_mean?.[0],
      },
      locationName: loc.name || '',
    };
  } catch (e) {
    console.warn('대시보드 날씨 조회 실패:', e.message);
    dashWeatherState = { status: 'error', today: null, locationName: loc.name || '' };
  }
  if (currentPage === 'dashboard') renderEnvStandardCard();
}

// 사육중 배치별로 오늘 일령의 목표 온·습도를 뽑는다.
function computeEnvStandards() {
  const farms = load('farms');
  return load('batches')
    .filter(b => b.status === 'active' && b.species && b.breed)
    .map(b => {
      const speciesKey = speciesKeyOf(b.species);
      if (!speciesKey) return null;
      const breed = CONSULT_BREEDS[speciesKey]?.breeds[b.breed];
      if (!breed) return null;
      const dayAge = computeDayAge(b.placementDate);
      if (dayAge < 1) return null;
      const age = speciesKey === 'broiler' ? dayAge : Math.ceil(dayAge / 7);
      const env = lookupEnvStandard(speciesKey, b.breed, age);
      if (!env) return null;
      return {
        batchId: b.id, farmName: farms.find(f => f.id === b.farmId)?.name || '',
        house: b.house || '-', breedName: breed.name,
        ageLabel: speciesKey === 'broiler' ? `${dayAge}일령` : `${age}주령`,
        env,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.farmName.localeCompare(b.farmName));
}

// 외기와 계사 목표의 차이를 "설비 부하" 문구로 바꾼다.
function envLoadLabel(outdoor, env) {
  if (outdoor?.tMax == null || outdoor?.tMin == null) return '';
  const notes = [];
  if (outdoor.tMin < env.tMin) {
    notes.push(`<span style="color:var(--accent)">🔥 난방 부하 (외기 최저 ${outdoor.tMin}℃ · 목표보다 ${Math.round((env.tMin - outdoor.tMin) * 10) / 10}℃ 낮음)</span>`);
  }
  if (outdoor.tMax > env.tMax) {
    notes.push(`<span style="color:var(--red)">🌀 환기·냉방 부하 (외기 최고 ${outdoor.tMax}℃ · 목표보다 ${Math.round((outdoor.tMax - env.tMax) * 10) / 10}℃ 높음)</span>`);
  }
  if (!notes.length) notes.push('<span style="color:var(--green)">외기가 목표 온도 범위 안 — 최소환기로 유지 가능</span>');
  if (outdoor.rh != null && outdoor.rh > env.rhMax) {
    notes.push(`<span style="color:var(--amber)">💧 외기 습도 ${Math.round(outdoor.rh)}% — 목표 상한(${env.rhMax}%) 초과, 제습·환기 주의</span>`);
  }
  return notes.join('<br>');
}

function renderEnvStandardCard() {
  const el = document.getElementById('dash-env-standard');
  if (!el) return;
  const items = computeEnvStandards();
  if (!items.length) {
    // 조건이 안 맞아 카드를 통째로 숨기면 "기능이 안 보인다"로만 보인다.
    // 무엇이 빠져서 안 뜨는지 화면에서 바로 알 수 있게 안내한다.
    const active = load('batches').filter(b => b.status === 'active');
    if (!active.length) { el.innerHTML = ''; return; } // 사육중 계군이 없으면 할 말도 없음
    const supported = active.filter(b => speciesKeyOf(b.species));
    const msg = !supported.length
      ? '사육중인 계군의 축종이 육계·산란계가 아니어서 표준 온·습도 매뉴얼이 없습니다.'
      : '사육중인 계군에 <strong>품종</strong>이 입력되어 있지 않습니다. 「입추(사육배치) 관리 → 편집」에서 품종을 선택하면 그 품종 매뉴얼의 일령별 목표 온·습도가 여기에 표시됩니다.';
    el.innerHTML = `<div class="card mt-16">
      <div class="card-header"><div class="card-title">🌡️ 계사 목표 온·습도 (품종 매뉴얼 기준)</div></div>
      <p class="text-muted">${msg}</p>
    </div>`;
    return;
  }

  const wx = dashWeatherState;
  const outdoor = wx.today;
  let wxLine;
  if (wx.status === 'nolocation') {
    wxLine = `<span class="text-muted">오늘 날씨 미설정 — 「가금컨설팅 → 날씨」에서 지역을 한 번 선택하면 여기에 함께 표시됩니다.</span>`;
  } else if (wx.status === 'loading' || wx.status === 'idle') {
    wxLine = `<span class="text-muted">오늘 날씨 조회 중...</span>`;
  } else if (wx.status === 'error') {
    wxLine = `<span class="text-muted">오늘 날씨를 불러오지 못했습니다.</span>`;
  } else {
    wxLine = `<strong>${wx.locationName}</strong> 오늘 외기 <strong>${outdoor.tMin}~${outdoor.tMax}℃</strong>` +
      (outdoor.rh != null ? ` · 평균습도 <strong>${Math.round(outdoor.rh)}%</strong>` : '');
  }

  const rows = items.map(it => `
    <tr onclick="openBatchDetail('${it.batchId}')" style="cursor:pointer">
      <td><strong>${it.farmName}</strong></td>
      <td style="color:var(--text-secondary)">${it.house}</td>
      <td>${it.breedName}</td>
      <td>${it.ageLabel}</td>
      <td><strong style="color:var(--accent)">${it.env.tRange}</strong><div class="text-muted" style="font-size:11px">${it.env.stage}</div></td>
      <td><strong>${it.env.rhRange}</strong></td>
      <td style="font-size:11px;line-height:1.6">${outdoor ? envLoadLabel(outdoor, it.env) : '-'}</td>
    </tr>`).join('');

  el.innerHTML = `<div class="card mt-16">
    <div class="card-header"><div class="card-title">🌡️ 계사 목표 온·습도 (품종 매뉴얼 기준)</div></div>
    <div class="mb-16" style="font-size:12px">${wxLine}</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>농장</th><th>동</th><th>품종</th><th>일령/주령</th><th>목표 온도</th><th>목표 습도</th><th>오늘 외기 대비</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="text-muted mt-16" style="font-size:11px">
      목표값은 <strong>계사 내부</strong> 기준이고 위 날씨는 <strong>외기</strong> 예보입니다. 두 값을 직접 비교해 정상/이상을 판단하는 것이 아니라,
      그날 난방·환기 설비가 감당해야 할 부담을 가늠하는 용도입니다. 실제 조절은 온도계 수치보다 계군의 행동(헐떡임·웅크림·분산)을 우선 기준으로 삼으세요.
    </p>
  </div>`;
}

// ── 축산산지시세 ────────────────────────────────────────────────────────────
// 농장동물컨설팅(pb) 프로젝트가 GitHub Actions로 매일 수집해 저장하는 시세
// 데이터를 raw.githubusercontent.com에서 직접 fetch한다(CORS 허용 도메인이라
// 프록시 불필요). pb 프로젝트 자체 크론잡이 갱신하므로 이 저장소는 최신 URL만
// 참조하면 되고, 데이터를 별도로 복제/관리할 필요가 없다.
const POULTRY_PRICE_JSON_URL = 'https://raw.githubusercontent.com/khmass-liturgy/pb/main/poultry_price/latest.json';
let poultryPriceState = { status: 'idle', data: null };

async function fetchPoultryPrices(force) {
  poultryPriceState = { status: 'loading', data: null };
  if (currentPage === 'dashboard') renderPoultryPriceCard();
  try {
    const bust = force ? Date.now() : Math.floor(Date.now() / 600000);
    const resp = await fetch(POULTRY_PRICE_JSON_URL + '?t=' + bust);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    if (!data.egg?.rows?.length || !data.chicken?.rows?.length || !data.pig?.rows?.length || !data.cow?.items) throw new Error('시세 자료 없음');
    poultryPriceState = { status: 'done', data };
  } catch (e) {
    console.warn('축산산지시세 로딩 실패:', e.message);
    poultryPriceState = { status: 'error', data: null };
  }
  if (currentPage === 'dashboard') renderPoultryPriceCard();
}

function renderPoultryPriceCard() {
  const el = document.getElementById('dash-poultry-price');
  if (!el) return;
  const st = poultryPriceState;
  if (st.status === 'idle' || st.status === 'loading') {
    el.innerHTML = `<div class="card mt-16" style="text-align:center;padding:20px;color:var(--text-muted)">⏳ 축산산지시세 조회 중...</div>`;
    return;
  }
  if (st.status === 'error' || !st.data) {
    el.innerHTML = `<div class="card mt-16" style="text-align:center;padding:20px;color:var(--text-muted)">⚠️ 축산산지시세를 불러오지 못했습니다.</div>`;
    return;
  }
  const { egg, chicken, pig, cow } = st.data;
  const items = [
    { icon:'🥚', label:'계란 산지가격', sub:'특란 (XL)', value: egg.latest, unit:'원/10개', color:'#D4A012', date: egg.rows[0]?.date },
    { icon:'🐔', label:'육계 생계유통', sub:'대', value: chicken.latest, unit:'원/kg', color:'#E8530A', date: chicken.rows[0]?.date },
    { icon:'🐷', label:'양돈', sub:'농가수취 평균', value: pig.latest, unit:'원/kg', color:'#E84A6F', date: pig.rows[0]?.date },
    { icon:'🐮', label: cow.items.female_calf.label, sub:'', value: cow.items.female_calf.value, unit: cow.items.female_calf.unit, color:'#A0522D', date: cow.items.female_calf.date },
    { icon:'🐮', label: cow.items.male_calf.label, sub:'', value: cow.items.male_calf.value, unit: cow.items.male_calf.unit, color:'#8B4513', date: cow.items.male_calf.date },
    { icon:'🐂', label: cow.items.farm_receipt_600kg.label, sub:'', value: cow.items.farm_receipt_600kg.value, unit: cow.items.farm_receipt_600kg.unit, color:'#6B4423', date: cow.items.farm_receipt_600kg.date },
  ];
  const cards = items.map(it => `
    <div class="livestock-price-card">
      <div class="livestock-price-card__content">
        <span class="livestock-price-card__icon">${it.icon}</span>
        <div class="livestock-price-card__body">
          <div class="livestock-price-card__label">${it.label} <span style="font-weight:400">${it.sub}</span></div>
          <div class="livestock-price-card__value" style="color:${it.color}">${Number.isInteger(it.value) ? it.value.toLocaleString() : '-'}<span>${it.unit}</span></div>
        </div>
      </div>
      <div class="livestock-price-card__date">${it.date || ''}<br>발표전일 기준</div>
    </div>`).join('');
  el.innerHTML = `<div class="card mt-16">
    <div class="livestock-price-heading">
      <div class="card-title">📊 축산산지시세 <span style="font-size:10px;color:var(--text-muted);font-weight:400">수집 ${st.data.updated || ''}</span></div>
      <div style="display:flex;align-items:center;gap:6px">
        <a href="https://www.ekapepia.com/v3/web/main.do?userGroup=producer" target="_blank" rel="noopener" class="btn btn-outline btn-sm">생산자 시세 ↗</a>
        <button class="btn btn-outline btn-sm" onclick="fetchPoultryPrices(true)">🔄 갱신</button>
      </div>
    </div>
    <div class="livestock-price-cards">${cards}</div>
    <div style="font-size:9px;color:var(--text-muted);margin-top:8px;text-align:right">카드 날짜=원본 발표일 · 수집 시각=${st.data.updated || ''} · 출처: 축산물품질평가원 다봄</div>
  </div>`;
}
