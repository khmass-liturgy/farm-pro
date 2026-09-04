// ─── 프로그램 모달 - 사료첨가 슬롯 ───────────────────────────────────────
let feedSlotCount = 0;
function getFeedOptions(selectedId) {
  const feeds = load('feeds');
  let opts = `<option value="">사료첨가제 선택...</option>`;
  const byType = {};
  feeds.forEach(f => { (byType[f.type]=byType[f.type]||[]).push(f); });
  Object.entries(byType).forEach(([type,list]) => {
    opts += `<optgroup label="${type}">`;
    list.forEach(f => {
      opts += `<option value="${f.id}" data-name="${f.name}" data-dose="${f.dose||''}" data-period="${f.period||''}"${f.id===selectedId?' selected':''}>${f.name}${f.dose?' ('+f.dose+')':''}</option>`;
    });
    opts += `</optgroup>`;
  });
  opts += `<optgroup label="─ 직접입력"><option value="__custom__"${selectedId==='__custom__'?' selected':''}>✏️ 직접 입력...</option></optgroup>`;
  return opts;
}
function initFeedSlots(existing) {
  feedSlotCount = 0;
  const wrap = document.getElementById('feed-slots-wrap');
  wrap.innerHTML = '';
  if (existing && existing.length) {
    existing.forEach(item => addFeedSlot(item));
  } else {
    addFeedSlot();
  }
}
function addFeedSlot(existing) {
  const idx = feedSlotCount++;
  const wrap = document.getElementById('feed-slots-wrap');
  const div = document.createElement('div');
  div.id = `feed-slot-${idx}`;
  div.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:6px;align-items:start;margin-bottom:6px;padding:8px;background:var(--bg);border-radius:6px;border:1px solid var(--border)';
  const selId = existing?.feedId || '';
  const customDose = existing?.customDose || '';
  const isCustom = selId === '__custom__' || (!selId && existing?.name);
  // 직접입력 항목은 select에서도 '__custom__'이 선택돼 있어야 한다. 안 그러면
  // collectFeedSlots()가 sel.value('')를 보고 제품명을 수집하지 못해 이름이 사라진다.
  const optSelId = isCustom ? '__custom__' : selId;
  div.innerHTML = `
    <div>
      <div style="font-size:10px;color:var(--text-secondary);margin-bottom:3px">제품</div>
      <select id="fs-sel-${idx}" onchange="onFeedSlotChange(${idx})"
        style="width:100%;border:1px solid var(--border);border-radius:4px;padding:5px 7px;font-size:12px;font-family:inherit;background:var(--bg-card)">
        ${getFeedOptions(optSelId)}
      </select>
      <div id="fs-custom-${idx}" style="display:${isCustom?'':'none'};margin-top:4px">
        <input id="fs-custom-name-${idx}" value="${isCustom?(existing?.name||''):''}" placeholder="제품명 직접 입력"
          style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 7px;font-size:12px;font-family:inherit">
      </div>
    </div>
    <div>
      <div style="font-size:10px;color:var(--text-secondary);margin-bottom:3px">첨가량</div>
      <input id="fs-dose-${idx}" value="${customDose || (existing?.dose||'')}" placeholder="예) 톤당 2kg"
        style="width:100%;border:1px solid var(--border);border-radius:4px;padding:5px 7px;font-size:12px;font-family:inherit">
    </div>
    <div>
      <div style="font-size:10px;color:var(--text-secondary);margin-bottom:3px">첨가 시기</div>
      <input id="fs-period-${idx}" value="${existing?.period||''}" placeholder="예) 전기부터 전기간"
        style="width:100%;border:1px solid var(--border);border-radius:4px;padding:5px 7px;font-size:12px;font-family:inherit">
    </div>
    <div style="padding-top:18px">
      <button onclick="document.getElementById('feed-slot-${idx}').remove()" title="삭제"
        style="background:var(--red-bg);color:var(--red);border:none;border-radius:4px;padding:5px 9px;cursor:pointer;font-size:14px">×</button>
    </div>`;
  wrap.appendChild(div);
  if (!isCustom && selId && selId !== '__custom__') {
    const feeds = load('feeds');
    const fd = feeds.find(f => f.id === selId);
    if (fd) {
      if (!customDose) document.getElementById(`fs-dose-${idx}`).value = fd.dose || '';
      if (!existing?.period) document.getElementById(`fs-period-${idx}`).value = fd.period || '';
    }
  }
}
function onFeedSlotChange(idx) {
  const sel = document.getElementById(`fs-sel-${idx}`);
  const customWrap = document.getElementById(`fs-custom-${idx}`);
  if (sel.value === '__custom__') { customWrap.style.display = ''; return; }
  customWrap.style.display = 'none';
  if (!sel.value) return;
  const opt = sel.options[sel.selectedIndex];
  document.getElementById(`fs-dose-${idx}`).value = opt.dataset.dose || '';
  document.getElementById(`fs-period-${idx}`).value = opt.dataset.period || '';
}
function collectFeedSlots() {
  const result = [];
  document.querySelectorAll('[id^="feed-slot-"]').forEach(div => {
    const idx = div.id.replace('feed-slot-','');
    const sel = document.getElementById(`fs-sel-${idx}`);
    if (!sel) return;
    let feedId='', name='', dose='', period='';
    if (sel.value === '__custom__') {
      name = document.getElementById(`fs-custom-name-${idx}`)?.value.trim() || '';
      feedId = '__custom__';
    } else if (sel.value) {
      feedId = sel.value;
      name = sel.options[sel.selectedIndex]?.dataset.name || '';
    }
    dose = document.getElementById(`fs-dose-${idx}`)?.value.trim() || '';
    period = document.getElementById(`fs-period-${idx}`)?.value.trim() || '';
    if (name || dose) result.push({ feedId, name, dose, period });
  });
  return result;
}

// ─── 일자별 계획 표시 헬퍼 (schedule.js / batches.js / print.js 에서도 사용) ──
function dayDrugLabel(d) { return (d?.drugs || []).map(x => x.name).filter(Boolean).join(' + '); }
function dayVaccineLabel(d) { return d?.vaccine?.name || ''; }
function dayDrugPillsHtml(d) {
  return (d?.drugs || []).length ? d.drugs.map(x => `<span class="drug-pill">${x.name}</span>`).join(' ') : '<span style="color:var(--text-muted)">-</span>';
}
function dayVaccinePillHtml(d) {
  return d?.vaccine ? `<span class="vaccine-pill">💉 ${d.vaccine.name}</span>` : '<span style="color:var(--text-muted)">-</span>';
}
// 입추일 기준 일령 N일차의 실제 날짜 (day=1이 입추일). UTC로만 계산해 로컬 타임존에 따른
// 하루 밀림 없이 안전하게 문자열 그대로 더한다.
function programDayDate(placementDate, day) {
  if (!placementDate) return '';
  const [y, m, d] = placementDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + (day - 1))).toISOString().slice(0, 10);
}
function programDayDateShort(placementDate, day) {
  const iso = programDayDate(placementDate, day);
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

// ─── 투약 프로그램 ─────────────────────────────────────────────────────────
function populateFarmSelect(selectId, val) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">농장 선택</option>' + farmsByOwner().map(f =>
    `<option value="${f.id}"${f.id===val?' selected':''}>${f.name} (${f.owner})</option>`
  ).join('');
}
function populateFarmFilter() {
  const sel = document.getElementById('prog-filter-farm');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">전체 농장</option>' + farmsByOwner().map(f =>
    `<option value="${f.id}"${f.id===cur?' selected':''}>${f.name} (${f.owner})</option>`
  ).join('');
}

// 복제 화면에서 일령별로 나란히 보여줄 원본 계획. 사육기간을 바꿔 표를 다시 그려도
// (generateDayRows()가 인자 없이 호출됨) 비교 기준은 남아 있어야 하므로 모듈 변수로 둔다.
let progRefDays = null;

// 원본 열 한 칸: 그 일령에 원래 뭘 했는지 한눈에.
function refDayCellHtml(d) {
  if (!d) return '<span style="color:var(--text-muted)">-</span>';
  const parts = [];
  const drugs = dayDrugLabel(d);
  if (drugs) parts.push(`<span style="color:var(--accent);font-weight:600">${drugs}</span>`);
  const vac = dayVaccineLabel(d);
  if (vac) parts.push(`<span style="color:var(--green);font-weight:600">💉 ${vac}</span>`);
  if (d.note) parts.push(`<span style="color:var(--text-secondary)">${d.note}</span>`);
  return parts.length ? parts.join('<br>') : '<span style="color:var(--text-muted)">-</span>';
}

// source를 넘기면 그 프로그램의 내용을 채운 채로 "새 프로그램" 화면을 연다(복제).
// editingId.program을 null로 두는 것이 핵심 — saveProgram()이 update가 아니라
// insert로 가서 원본은 그대로 남는다.
function openProgramModal(id, source) {
  editingId.program = id || null;
  const prog = id ? load('programs').find(p => p.id === id) : (source || null);
  const isDup = !id && !!source;
  document.getElementById('modal-prog-title').textContent =
    id ? '투약 프로그램 편집' : (isDup ? '투약 프로그램 복제' : '투약 프로그램 등록');
  document.getElementById('prog-dup-hint').style.display = isDup ? '' : 'none';
  // 원본 비교 열은 복제할 때만 띄운다. generateDayRows()보다 먼저 세팅해야 표가 그려질 때 반영된다.
  progRefDays = isDup ? (prog.days || []) : null;
  document.querySelectorAll('.prog-ref-col').forEach(el => { el.style.display = isDup ? '' : 'none'; });
  document.getElementById('prog-ref-name').textContent = isDup ? `(${prog.name})` : '';
  populateFarmSelect('p-farm', prog?.farmId || '');
  document.getElementById('p-name').value = isDup ? `${prog.name} (복사본)` : (prog?.name || '');
  // 편집·복제로 열었을 때 기존 이름이 자동 생성으로 덮이지 않도록 추적값을 비운다.
  // 새 등록이면 농장을 고르는 순간 applyProgramAutoName()이 채운다.
  progLastAutoName = '';
  document.getElementById('p-duration').value = prog?.duration || 30;
  // 복제본은 다음 회차용이라 지난 회차의 입추일이 그대로 남아 있으면 일령별 날짜가
  // 옛 날짜로 저장되기 쉽다. 비워서 새로 지정하게 한다.
  document.getElementById('p-placement-date').value = isDup ? '' : (prog?.placementDate || '');
  // 축종/품종은 generateDayRows()보다 먼저 세팅해야 온·습도 칸이 처음부터 채워진다.
  // 프로그램에 저장된 값이 있으면 그것을, 없으면 그 농장 계군에 입력된 품종을 쓴다.
  const farmType = prog?.farmId ? (load('farms').find(f => f.id === prog.farmId)?.type || '') : '';
  const fallback = prog?.farmId ? farmBreedDefault(prog.farmId) : null;
  const species = prog?.species || fallback?.species || (speciesKeyOf(farmType) ? farmType : '');
  const breed = prog?.species
    ? (prog.breed || '')
    : (fallback?.species === species ? (fallback.breed || '') : '');
  document.getElementById('p-species').value = species;
  populateProgramBreedSelect(species, breed);
  // 사육동수·마릿수. 복제본은 다음 회차라 마릿수를 그대로 물려주면 틀린 값이 되기 쉽지만,
  // 동수는 같은 농장이면 대개 그대로라 유지한다.
  document.getElementById('p-houses').value = prog?.houses ?? '';
  document.getElementById('p-count').value = isDup ? '' : (prog?.birdCount ?? '');
  updateProgramBatchHint();
  document.getElementById('p-focus').value = prog?.focus || '';
  document.getElementById('p-notes').value = prog?.notes || '';
  document.getElementById('p-feed-memo').value = prog?.feedMemo || '';
  generateDayRows(prog?.days);
  initFeedSlots(prog?.feedItems || []);
  openModal('modal-program');
  if (isDup) document.getElementById('p-placement-date').focus();
}

function duplicateProgram(id) {
  const prog = load('programs').find(p => p.id === id);
  if (!prog) { alert('프로그램을 찾을 수 없습니다.'); return; }
  openProgramModal(null, prog);
}

// ─── 약품/백신 선택 드롭다운 옵션 생성 (value = id) ──────────────────────
function getDrugOptions(selectedId) {
  const drugs = load('drugs');
  let opts = `<option value="">약품 선택...</option>`;
  if (drugs.length) {
    const byType = {};
    drugs.forEach(d => { (byType[d.type] = byType[d.type]||[]).push(d); });
    Object.entries(byType).forEach(([type, list]) => {
      opts += `<optgroup label="${type}">`;
      list.forEach(d => {
        const sel = d.id === selectedId ? ' selected' : '';
        opts += `<option value="${d.id}" data-name="${d.name}" data-dose="${d.dose||''}" data-withdrawal="${d.withdrawal||''}"${sel}>${d.name}${d.withdrawal?' (휴약'+d.withdrawal+')':''}</option>`;
      });
      opts += `</optgroup>`;
    });
  }
  opts += `<optgroup label="─ 직접입력"><option value="__custom__"${selectedId==='__custom__'?' selected':''}>✏️ 직접 입력...</option></optgroup>`;
  return opts;
}

// 농장 축종 → 그 농장에서 고를 수 있는 백신 축종.
// 백신은 육계/산란계/공통 세 가지로만 구분하므로, 삼계·토종닭·기타처럼 대응하는
// 구분이 없는 축종은 거르지 않고 전부 보여준다(잘못 감추는 것보다 낫다).
const VACCINE_SPECIES_BY_FARM_TYPE = { '육계': ['육계', '공통'], '산란계': ['산란계', '공통'] };
function allowedVaccineSpecies(farmType) {
  return VACCINE_SPECIES_BY_FARM_TYPE[farmType] || null; // null = 필터 없음
}
function currentProgramFarmType() {
  const farmId = document.getElementById('p-farm')?.value;
  if (!farmId) return '';
  return load('farms').find(f => f.id === farmId)?.type || '';
}

// allowed를 넘기면 그 축종의 백신만 추린다(넘기지 않으면 전체 — 투약 이력 등 다른 화면용).
// 이미 선택된 백신은 축종이 맞지 않아도 항상 남긴다. 농장을 바꿨다고 기존 선택이
// 목록에서 사라지면 저장할 때 조용히 지워지기 때문이다.
function getVaccineOptions(selectedId, allowed) {
  const list = load('vaccines').filter(v =>
    !allowed || allowed.includes(v.species || '공통') || v.id === selectedId
  );
  let opts = `<option value="">백신 선택...</option>`;
  const bySpecies = {};
  list.forEach(v => { const s = v.species || '공통'; (bySpecies[s] = bySpecies[s] || []).push(v); });
  const order = ['육계', '산란계', '공통'];
  order.concat(Object.keys(bySpecies).filter(s => !order.includes(s))).forEach(s => {
    if (!bySpecies[s]) return;
    opts += `<optgroup label="${s}">`;
    bySpecies[s].forEach(v => {
      const sel = v.id === selectedId ? ' selected' : '';
      opts += `<option value="${v.id}" data-name="${v.name}" data-method="${v.method||''}" data-dilution="${v.dilution||''}"${sel}>${v.name}</option>`;
    });
    opts += `</optgroup>`;
  });
  opts += `<optgroup label="─ 직접입력"><option value="__custom__"${selectedId==='__custom__'?' selected':''}>✏️ 직접 입력...</option></optgroup>`;
  return opts;
}

// 농장을 바꾸면 그 축종에 맞는 백신만 보이도록 일령별 백신 드롭다운을 다시 채운다.
// 표를 통째로 다시 그리면 입력 중이던 약품·중요사항이 날아가므로 백신 select만 교체한다.
function onProgramFarmChange() {
  const allowed = allowedVaccineSpecies(currentProgramFarmType());
  const n = parseInt(document.getElementById('p-duration').value) || 30;
  for (let i = 1; i <= n; i++) {
    const sel = document.getElementById(`day-vaccine-sel-${i}`);
    if (!sel) continue;
    const cur = sel.value;
    sel.innerHTML = getVaccineOptions(cur, allowed);
    sel.value = cur;
  }
  applyProgramBreedDefault();
  applyProgramAutoName();
}

// ─── 사육동수·마릿수 → 입추(사육배치) 자동 등록 ────────────────────────────
// 프로그램에 사육동수·마릿수를 넣어두면 저장할 때 입추를 한 건으로 묶어 만든다
// (계사는 "3개동"처럼 동수로 기록). 저장 전에 무엇이 만들어질지 화면에 미리 보여준다.
function programBatchHouseLabel(houses) {
  return houses ? `${Number(houses)}개동` : '';
}

function updateProgramBatchHint() {
  const hint = document.getElementById('p-batch-hint');
  if (!hint) return;
  const houses = document.getElementById('p-houses').value;
  const count = document.getElementById('p-count').value;
  if (!houses && !count) {
    hint.textContent = '사육동수·마릿수를 입력하면 저장할 때 입추(사육배치)가 자동으로 등록됩니다.';
    return;
  }
  // 입추는 입추일이 필수라 날짜가 없으면 만들 수 없다. 왜 안 되는지 미리 알려준다.
  if (!document.getElementById('p-placement-date').value) {
    hint.innerHTML = '⚠️ 입추를 자동 등록하려면 <strong>입추일</strong>도 입력해야 합니다.';
    return;
  }
  const farm = load('farms').find(f => f.id === document.getElementById('p-farm').value);
  const parts = [farm?.name, programBatchHouseLabel(houses), count ? Number(count).toLocaleString() + '수' : null]
    .filter(Boolean).join(' · ');
  const existing = existingProgramBatch(editingId.program);
  hint.textContent = existing
    ? `저장하면 이미 연결된 입추 기록이 갱신됩니다 → ${parts}`
    : `저장하면 입추가 등록됩니다 → ${parts}`;
}

// 이 프로그램으로 이미 만들어 둔 입추(있으면). 다시 저장할 때 중복 생성하지 않기 위함.
function existingProgramBatch(programId) {
  if (!programId) return null;
  return load('batches').find(b => b.programId === programId) || null;
}

// 프로그램 저장 직후 호출. 입추를 새로 만들거나(없으면) 기존 것을 갱신한다.
// 반환값은 사용자에게 무슨 일이 있었는지 알려주기 위한 결과 요약.
async function syncProgramBatch(saved) {
  const houses = document.getElementById('p-houses').value;
  const count = document.getElementById('p-count').value;
  if (!houses && !count) return null;                       // 입력이 없으면 아무것도 만들지 않는다
  if (!saved.placementDate) return { skipped: 'no-date' };   // batches.placement_date는 필수

  const existing = existingProgramBatch(saved.id);
  const data = {
    farmId: saved.farmId,
    programId: saved.id, programName: saved.name,
    // 동수를 안 적었으면 기존 계사 표기를 그대로 둔다(사용자가 손으로 고쳐둔 값 보존).
    house: houses ? programBatchHouseLabel(houses) : (existing?.house || null),
    placementDate: saved.placementDate,
    birdCount: count === '' ? (existing?.birdCount ?? null) : Number(count),
    species: saved.species || existing?.species || null,
    breed: saved.breed || existing?.breed || null,
    // 사육 종료 처리 등 입추 쪽에서 바꿔둔 상태는 덮어쓰지 않는다.
    status: existing?.status || 'active',
    endDate: existing?.endDate || null,
    notes: existing?.notes || null,
  };
  try {
    if (existing) { await updateRow('batches', existing.id, data); return { updated: true }; }
    await insertRow('batches', data);
    return { created: true };
  } catch (e) {
    return { error: e.message };
  }
}

// ─── 프로그램명 자동 입력 (yy-mm-dd-농장주) ────────────────────────────────
// 농장과 입추일을 고르면 프로그램명을 자동으로 채운다. 사용자가 직접 고친 이름은
// 덮어쓰면 안 되므로, 마지막으로 자동 생성해 넣은 값을 기억해 두고 그것과 같을 때만
// 다시 만든다(빈 칸일 때도 채운다).
let progLastAutoName = '';

function programAutoName() {
  const farm = load('farms').find(f => f.id === document.getElementById('p-farm')?.value);
  if (!farm?.owner) return '';
  // 입추일이 아직 없으면 오늘 날짜로 만들어 두고, 입추일을 넣으면 그 날짜로 다시 만든다.
  const ymd = document.getElementById('p-placement-date')?.value || new Date().toISOString().slice(0, 10);
  return `${ymd.slice(2)}-${farm.owner}`; // 2026-08-19 → 26-08-19-홍길동
}

function applyProgramAutoName() {
  const el = document.getElementById('p-name');
  if (!el) return;
  if (el.value && el.value !== progLastAutoName) return; // 직접 입력한 이름은 보존
  const next = programAutoName();
  if (!next) return;
  el.value = next;
  progLastAutoName = next;
}

// 사용자가 이름을 직접 손대면 그 순간부터 자동 생성 대상에서 제외한다.
function onProgramNameInput() {
  const el = document.getElementById('p-name');
  if (el && el.value !== progLastAutoName) progLastAutoName = '';
}

// 농장에 등록된 계군(입추배치)에서 축종·품종을 가져온다.
// 품종은 입추 관리에서 이미 입력하므로, 프로그램에서 같은 값을 다시 고르게 하지 않는다.
// 사육중 계군을 우선하고, 없으면 가장 최근 입추 건을 쓴다.
function farmBreedDefault(farmId) {
  if (!farmId) return null;
  const b = load('batches')
    .filter(x => x.farmId === farmId && x.species && x.breed)
    .sort((a, c) => (a.status === c.status ? 0 : a.status === 'active' ? -1 : 1) ||
                    (c.placementDate || '').localeCompare(a.placementDate || ''))[0];
  return b ? { species: b.species, breed: b.breed } : null;
}

// 농장을 고르면 축종·품종을 자동으로 채운다. 사용자가 이미 직접 고른 값이 있으면
// 덮어쓰지 않는다(농장만 바꿔 끼우는 경우에도 선택이 날아가지 않게).
function applyProgramBreedDefault() {
  const spEl = document.getElementById('p-species');
  const brEl = document.getElementById('p-breed');
  if (!spEl || !brEl || spEl.value || brEl.value) return;
  const d = farmBreedDefault(document.getElementById('p-farm').value);
  const farmType = currentProgramFarmType();
  const species = d?.species || (speciesKeyOf(farmType) ? farmType : '');
  if (!species) return;
  spEl.value = species;
  populateProgramBreedSelect(species, d?.species === species ? (d.breed || '') : '');
  onProgramBreedChange();
}

// 약품 선택 변경 → 용법 자동입력
function onDrugSelectChange(dayNum, slotIdx) {
  const sel = document.getElementById(`day-drug-sel-${dayNum}-${slotIdx}`);
  const customWrap = document.getElementById(`day-drug-custom-${dayNum}-${slotIdx}`);
  if (!sel) return;
  if (sel.value === '__custom__') {
    customWrap.style.display = '';
    // 직접입력을 고른 목적이 곧 타이핑이므로 커서를 바로 넣어준다.
    document.getElementById(`day-drug-text-${dayNum}-${slotIdx}`)?.focus();
    updateDayNote(dayNum);
    return;
  }
  customWrap.style.display = 'none';
  updateDayNote(dayNum);
}

function onVaccineSelectChange(dayNum) {
  const sel = document.getElementById(`day-vaccine-sel-${dayNum}`);
  const customWrap = document.getElementById(`day-vaccine-custom-${dayNum}`);
  if (!sel) return;
  const isCustom = sel.value === '__custom__';
  customWrap.style.display = isCustom ? '' : 'none';
  if (isCustom) document.getElementById(`day-vaccine-text-${dayNum}`)?.focus();
  updateDayNote(dayNum);
}

// 중요사항에 선택된 약품들의 용법 자동 조합
function updateDayNote(dayNum) {
  const noteEl = document.getElementById(`day-note-${dayNum}`);
  if (!noteEl || noteEl.dataset.manualEdit === '1') return;
  const slotCount = parseInt(document.getElementById(`day-drug-slots-${dayNum}`)?.dataset.slots || '1');
  const notes = [];
  for (let s = 0; s < slotCount; s++) {
    const sel = document.getElementById(`day-drug-sel-${dayNum}-${s}`);
    if (!sel || !sel.value || sel.value === '__custom__') continue;
    const opt = sel.options[sel.selectedIndex];
    const dose = opt.dataset.dose;
    const wd = opt.dataset.withdrawal;
    const name = opt.dataset.name;
    if (dose) notes.push(`${name}: ${dose}`);
    else if (wd) notes.push(`${name} (휴약${wd})`);
  }
  const vsel = document.getElementById(`day-vaccine-sel-${dayNum}`);
  if (vsel && vsel.value && vsel.value !== '__custom__') {
    const vopt = vsel.options[vsel.selectedIndex];
    const method = vopt.dataset.method;
    const dilution = vopt.dataset.dilution;
    if (dilution) notes.push(`[백신] ${vopt.dataset.name}: ${dilution}`);
    else if (method) notes.push(`[백신] ${vopt.dataset.name} ${method}`);
  }
  noteEl.value = notes.join(' / ');
}

// 약품 슬롯 추가/삭제
function addDrugSlot(dayNum) {
  const wrap = document.getElementById(`day-drug-slots-${dayNum}`);
  const current = parseInt(wrap.dataset.slots);
  const newIdx = current;
  wrap.dataset.slots = current + 1;
  const div = document.createElement('div');
  div.id = `drug-slot-${dayNum}-${newIdx}`;
  // 마크업은 generateDayRows()의 슬롯과 반드시 같아야 한다(직접입력 칸은 select 아래 전체폭).
  div.style.cssText = 'margin-top:3px';
  div.innerHTML = `
    <div style="display:flex;align-items:center;gap:4px">
      <select id="day-drug-sel-${dayNum}-${newIdx}" onchange="onDrugSelectChange(${dayNum},${newIdx})"
        style="flex:1;min-width:0;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:11px;font-family:inherit;background:var(--bg-card)">
        ${getDrugOptions('')}
      </select>
      <button onclick="removeDrugSlot(${dayNum},${newIdx})" title="삭제"
        style="flex:none;background:var(--red-bg);color:var(--red);border:none;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:13px;line-height:1">×</button>
    </div>
    <div id="day-drug-custom-${dayNum}-${newIdx}" style="display:none;margin-top:3px">
      <input type="text" id="day-drug-text-${dayNum}-${newIdx}" placeholder="약품명 직접 입력"
        style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:11px;font-family:inherit">
    </div>`;
  wrap.appendChild(div);
}
function removeDrugSlot(dayNum, slotIdx) {
  const el = document.getElementById(`drug-slot-${dayNum}-${slotIdx}`);
  if (el) el.remove();
  updateDayNote(dayNum);
}

function generateDayRows(existingDays) {
  const n = parseInt(document.getElementById('p-duration').value) || 30;
  const tbody = document.getElementById('day-rows-body');
  const allowedVac = allowedVaccineSpecies(currentProgramFarmType());
  tbody.innerHTML = '';
  for (let i = 1; i <= n; i++) {
    const ex = existingDays ? existingDays.find(d => d.day === i) : null;
    const exDrugs = ex?.drugs || [];
    const exVaccine = ex?.vaccine || null;
    const exNote = ex?.note || '';

    let slotsHtml = '';
    const initialCount = exDrugs.length || 1;
    for (let s = 0; s < initialCount; s++) {
      const dEntry = exDrugs[s] || null;
      const isCustom = !!(dEntry && !dEntry.drugId);
      // 직접입력 칸은 select 아래에 전체폭으로 놓는다. select와 나란히 두면 좁은
      // 약품 열에서 반칸씩 나눠 가져 글자를 못 넣는다(백신·사료·계사동과 같은 구조).
      slotsHtml += `
        <div id="drug-slot-${i}-${s}" style="${s>0?'margin-top:3px':''}">
          <div style="display:flex;align-items:center;gap:4px">
            <select id="day-drug-sel-${i}-${s}" onchange="onDrugSelectChange(${i},${s})"
              style="flex:1;min-width:0;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:11px;font-family:inherit;background:var(--bg-card)">
              ${getDrugOptions(isCustom ? '__custom__' : (dEntry?.drugId || ''))}
            </select>
            ${s>0?`<button onclick="removeDrugSlot(${i},${s})" title="삭제"
              style="flex:none;background:var(--red-bg);color:var(--red);border:none;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:13px;line-height:1">×</button>`:''}
          </div>
          <div id="day-drug-custom-${i}-${s}" style="display:${isCustom?'':'none'};margin-top:3px">
            <input type="text" id="day-drug-text-${i}-${s}" value="${isCustom?(dEntry.name||''):''}" placeholder="약품명 직접 입력"
              style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:11px;font-family:inherit">
          </div>
        </div>`;
    }

    const isCustomV = !!(exVaccine && !exVaccine.vaccineId);
    const placementDate = document.getElementById('p-placement-date').value;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align:center;font-weight:700;color:var(--accent);background:var(--bg);border:1px solid var(--border);vertical-align:top;padding-top:10px">${i}</td>
      <td id="day-date-${i}" style="text-align:center;color:var(--text-secondary);font-size:11px;background:var(--bg);border:1px solid var(--border);vertical-align:top;padding-top:10px">${programDayDateShort(placementDate, i)}</td>
      <td class="prog-ref-col" id="day-ref-${i}" style="display:${progRefDays?'':'none'};background:var(--bg);border:1px solid var(--border);padding:6px 8px;vertical-align:top;font-size:11px;line-height:1.5">${progRefDays ? refDayCellHtml(progRefDays.find(d => d.day === i)) : ''}</td>
      <td style="border:1px solid var(--border);padding:6px 8px;vertical-align:top">
        <div id="day-drug-slots-${i}" data-slots="${initialCount}">${slotsHtml}</div>
        <button onclick="addDrugSlot(${i})"
          style="margin-top:4px;background:var(--accent-light);color:var(--accent);border:1px solid var(--accent);border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;font-family:inherit">
          + 약품추가
        </button>
      </td>
      <td style="border:1px solid var(--border);padding:6px 8px;vertical-align:top">
        <select id="day-vaccine-sel-${i}" onchange="onVaccineSelectChange(${i})"
          style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:11px;font-family:inherit;background:var(--bg-card)">
          ${getVaccineOptions(isCustomV ? '__custom__' : (exVaccine?.vaccineId || ''), allowedVac)}
        </select>
        <div id="day-vaccine-custom-${i}" style="display:${isCustomV?'':'none'};margin-top:3px">
          <input type="text" id="day-vaccine-text-${i}" value="${isCustomV?(exVaccine.name||''):''}" placeholder="직접 입력"
            style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:11px;font-family:inherit">
        </div>
      </td>
      <td class="prog-env-col" id="day-env-${i}" style="display:none;background:var(--bg);border:1px solid var(--border);padding:6px 8px;vertical-align:top;font-size:11px;line-height:1.5"></td>
      <td style="border:1px solid var(--border);padding:6px 8px;vertical-align:top">
        <textarea id="day-note-${i}" rows="2" placeholder="약품 선택시 자동입력. 직접 수정 가능"
          oninput="this.dataset.manualEdit='1'"
          style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:11px;font-family:inherit;resize:vertical;min-height:48px">${exNote}</textarea>
      </td>`;
    tbody.appendChild(tr);
  }
  updateProgramEnvColumn();
}

// ─── 축종/품종 → 일령별 목표 온·습도 ───────────────────────────────────────
// 품종을 고르면 일령별 계획표 오른쪽에 그 일령의 계사 목표 온도·습도가 붙는다.
// 값은 js/breedStandards.js의 lookupEnvStandard() 한 곳에서만 관리한다.
function populateProgramBreedSelect(species, selectedBreed) {
  const sel = document.getElementById('p-breed');
  const hint = document.getElementById('p-breed-hint');
  const speciesKey = speciesKeyOf(species);
  if (!speciesKey) {
    sel.innerHTML = '<option value="">축종을 먼저 선택하세요</option>';
    sel.disabled = true;
    hint.style.display = 'none';
    return;
  }
  sel.disabled = false;
  const breeds = CONSULT_BREEDS[speciesKey].breeds;
  sel.innerHTML = '<option value="">품종 선택</option>' + Object.entries(breeds).map(([key, b]) =>
    `<option value="${key}"${key === selectedBreed ? ' selected' : ''}>${b.name}</option>`).join('');
  const cur = breeds[sel.value];
  hint.textContent = cur ? `출처: ${cur.source}` : '';
  hint.style.display = cur ? '' : 'none';
}

function onProgramSpeciesChange() {
  populateProgramBreedSelect(document.getElementById('p-species').value, '');
  updateProgramEnvColumn();
}

function onProgramBreedChange() {
  const speciesKey = speciesKeyOf(document.getElementById('p-species').value);
  const breedKey = document.getElementById('p-breed').value;
  const hint = document.getElementById('p-breed-hint');
  const breed = speciesKey && breedKey ? CONSULT_BREEDS[speciesKey].breeds[breedKey] : null;
  hint.textContent = breed ? `출처: ${breed.source}` : '';
  hint.style.display = breed ? '' : 'none';
  updateProgramEnvColumn();
}

// 온·습도 칸은 품종이 선택됐을 때만 보이게 하고, 각 일령 행에 해당 구간 값을 채운다.
function updateProgramEnvColumn() {
  const speciesKey = speciesKeyOf(document.getElementById('p-species')?.value);
  const breedKey = document.getElementById('p-breed')?.value || '';
  const show = !!(speciesKey && breedKey);
  document.querySelectorAll('.prog-env-col').forEach(el => { el.style.display = show ? '' : 'none'; });
  if (!show) return;
  const n = parseInt(document.getElementById('p-duration').value) || 30;
  for (let i = 1; i <= n; i++) {
    const cell = document.getElementById(`day-env-${i}`);
    if (!cell) continue;
    // 산란계 매뉴얼은 주령 단위라 일령을 주령으로 바꿔 조회한다.
    const age = speciesKey === 'broiler' ? i : Math.ceil(i / 7);
    const env = lookupEnvStandard(speciesKey, breedKey, age);
    cell.innerHTML = env
      ? `<div style="font-weight:700;color:var(--accent)">🌡️ ${env.tRange}</div>
         <div style="color:var(--text-secondary)">💧 ${env.rhRange}</div>
         <div style="color:var(--text-muted);font-size:10px">${env.stage}${speciesKey === 'layer' ? ` · ${age}주령` : ''}</div>`
      : '';
  }
}

// 입추일만 바뀌었을 때 표 전체를 다시 그리지 않고(입력 중이던 약품/백신 선택이 날아감)
// 날짜 칸만 갱신한다.
function updateProgramDayDates() {
  const placementDate = document.getElementById('p-placement-date').value;
  const n = parseInt(document.getElementById('p-duration').value) || 30;
  for (let i = 1; i <= n; i++) {
    const cell = document.getElementById(`day-date-${i}`);
    if (cell) cell.textContent = programDayDateShort(placementDate, i);
  }
}

async function saveProgram() {
  const name = document.getElementById('p-name').value.trim();
  const farmId = document.getElementById('p-farm').value;
  if (!name || !farmId) { alert('프로그램명과 농장 선택은 필수입니다.'); return; }
  const n = parseInt(document.getElementById('p-duration').value) || 30;
  const days = [];
  for (let i = 1; i <= n; i++) {
    const slotsWrap = document.getElementById(`day-drug-slots-${i}`);
    const slotCount = parseInt(slotsWrap?.dataset.slots || '1');
    const drugs = [];
    for (let s = 0; s < slotCount; s++) {
      const sel = document.getElementById(`day-drug-sel-${i}-${s}`);
      if (!sel) continue;
      if (sel.value === '__custom__') {
        const txt = document.getElementById(`day-drug-text-${i}-${s}`)?.value.trim();
        if (txt) drugs.push({ drugId: null, name: txt });
      } else if (sel.value) {
        const opt = sel.options[sel.selectedIndex];
        const dname = opt.dataset.name || '';
        if (dname) drugs.push({ drugId: sel.value, name: dname });
      }
    }

    const vsel = document.getElementById(`day-vaccine-sel-${i}`);
    let vaccine = null;
    if (vsel?.value === '__custom__') {
      const txt = document.getElementById(`day-vaccine-text-${i}`)?.value.trim();
      if (txt) vaccine = { vaccineId: null, name: txt };
    } else if (vsel?.value) {
      const vopt = vsel.options[vsel.selectedIndex];
      const vname = vopt.dataset.name || '';
      if (vname) vaccine = { vaccineId: vsel.value, name: vname };
    }

    const note = document.getElementById(`day-note-${i}`)?.value.trim() || '';
    if (drugs.length || vaccine || note) days.push({ day: i, drugs, vaccine, note });
  }
  const farms = load('farms');
  const farmName = farms.find(f => f.id === farmId)?.name || '';
  const data = {
    name, farmId, farmName,
    duration: n,
    placementDate: document.getElementById('p-placement-date').value || null,
    species: document.getElementById('p-species').value || null,
    breed: document.getElementById('p-breed').value || null,
    houses: document.getElementById('p-houses').value,
    birdCount: document.getElementById('p-count').value,
    focus: document.getElementById('p-focus').value.trim(),
    notes: document.getElementById('p-notes').value.trim(),
    feedItems: collectFeedSlots(),
    feedMemo: document.getElementById('p-feed-memo').value.trim(),
    days,
  };
  let saved;
  try {
    if (editingId.program) saved = await updateRow('programs', editingId.program, data);
    else saved = await insertRow('programs', data);
  } catch (e) { alert('저장 실패: ' + e.message); return; }

  // 사육동수·마릿수를 넣었으면 입추(사육배치)까지 이어서 만든다.
  // 프로그램 저장은 이미 끝났으므로, 입추 쪽이 실패해도 프로그램은 그대로 두고 알리기만 한다.
  const batchResult = await syncProgramBatch(saved);

  closeModal('modal-program');
  populateFarmFilter();
  renderPrograms();

  if (batchResult?.created) alert(`입추(사육배치)도 함께 등록했습니다.\n${saved.farmName} · ${programBatchHouseLabel(saved.houses)} · ${saved.birdCount ? Number(saved.birdCount).toLocaleString() + '수' : ''}`);
  else if (batchResult?.skipped === 'no-date') alert('사육동수·마릿수는 저장했지만, 입추일이 없어 입추(사육배치)는 만들지 못했습니다.\n프로그램 편집에서 입추일을 넣고 다시 저장하면 등록됩니다.');
  else if (batchResult?.error) alert('프로그램은 저장했지만 입추(사육배치) 등록에 실패했습니다.\n' + batchResult.error);
}

async function deleteProgram(id) {
  if (!confirm('이 투약 프로그램을 삭제하시겠습니까? 이 프로그램을 참조하는 입추 기록은 유지되지만 연결이 해제됩니다.')) return;
  try { await deleteRow('programs', id); } catch (e) { alert('삭제 실패: ' + e.message); return; }
  renderPrograms();
}

function buildFeedSection(prog) {
  const items = prog.feedItems || [];
  if (!items.length && !prog.feedMemo) return '';
  const rows = items.map(it => `
    <tr>
      <td style="padding:5px 8px;font-weight:600">${it.name}</td>
      <td style="padding:5px 8px;color:var(--accent);font-weight:700">${it.dose||'-'}</td>
      <td style="padding:5px 8px;color:var(--text-secondary)">${it.period||'-'}</td>
    </tr>`).join('');
  return `<div style="margin-top:10px">
    <div style="font-size:12px;font-weight:700;color:var(--green);background:var(--green-bg);padding:6px 10px;border-radius:6px 6px 0 0">🌾 사료 첨가제</div>
    <div style="border:1px solid var(--border);border-top:none;border-radius:0 0 6px 6px;overflow-x:auto">
      <table style="width:100%;min-width:320px;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:var(--bg)">
          <th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border)">제품명</th>
          <th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border)">첨가량</th>
          <th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border)">시기</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${prog.feedMemo ? `<div style="margin-top:6px;font-size:11px;color:var(--text-secondary);padding:5px 8px;background:var(--bg);border-radius:4px">📝 ${prog.feedMemo}</div>` : ''}
  </div>`;
}

// 프로그램에 저장된 축종·품종으로 그 일령의 목표 온·습도를 찾는다.
// 편집 모달·상세 보기·A4 인쇄가 모두 이 두 함수를 공유해야 세 화면이 어긋나지 않는다.
// 프로그램에 저장된 축종·품종을 쓰되, 비어 있으면 그 농장 계군에 입력된 값으로 대체한다.
// 축종·품종 컬럼이 생기기 전에 만든 프로그램은 이 값이 비어 있는데, 그것 때문에
// 상세 보기·인쇄에서 온·습도가 통째로 빠지면 안 된다(편집 모달과 같은 기준을 쓴다).
// 둘 중 하나만 있는 어중간한 상태에서 축종과 품종이 서로 어긋나지 않도록 쌍으로만 쓴다.
function programEffectiveBreed(prog) {
  if (prog?.species && prog?.breed) return { species: prog.species, breed: prog.breed };
  return farmBreedDefault(prog?.farmId);
}
function programHasEnv(prog) {
  const e = programEffectiveBreed(prog);
  return !!(e && speciesKeyOf(e.species) && e.breed);
}
function programBreedName(prog) {
  const e = programEffectiveBreed(prog);
  const speciesKey = speciesKeyOf(e?.species);
  return (speciesKey && CONSULT_BREEDS[speciesKey]?.breeds[e.breed]?.name) || e?.breed || '';
}
function programSpeciesName(prog) {
  return programEffectiveBreed(prog)?.species || '';
}
function programEnvFor(prog, day) {
  const e = programEffectiveBreed(prog);
  const speciesKey = speciesKeyOf(e?.species);
  if (!speciesKey || !e.breed) return null;
  // 산란계 매뉴얼은 주령 단위라 일령을 주령으로 바꿔 조회한다.
  const age = speciesKey === 'broiler' ? day : Math.ceil(day / 7);
  return lookupEnvStandard(speciesKey, e.breed, age);
}

function viewProgram(id) {
  const prog = load('programs').find(p => p.id === id);
  if (!prog) return;
  const farm = load('farms').find(f => f.id === prog.farmId);
  const showEnv = programHasEnv(prog);
  let rows = '';
  for (let i = 1; i <= prog.duration; i++) {
    const d = prog.days.find(x => x.day === i);
    const hasData = d && ((d.drugs && d.drugs.length) || d.vaccine || d.note);
    const env = showEnv ? programEnvFor(prog, i) : null;
    rows += `<tr style="background:${hasData?'':'var(--bg)'}">
      <td style="text-align:center;font-weight:700;color:var(--accent);background:var(--bg);width:55px">${i}</td>
      <td style="text-align:center;color:var(--text-secondary);font-size:12px;width:60px">${programDayDateShort(prog.placementDate, i)}</td>
      <td>${dayDrugPillsHtml(d)}</td>
      <td>${dayVaccinePillHtml(d)}</td>
      ${showEnv ? `<td style="font-size:11px;line-height:1.5;white-space:nowrap">
        <span style="color:var(--accent);font-weight:700">🌡️ ${env ? env.tRange : '-'}</span><br>
        <span style="color:var(--text-secondary)">💧 ${env ? env.rhRange : '-'}</span>
      </td>` : ''}
      <td style="color:var(--text-secondary);font-size:12px">${d?.note||''}</td>
    </tr>`;
  }
  document.getElementById('modal-prog-view-title').textContent = prog.name;
  document.getElementById('modal-prog-view-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">
      <div style="background:var(--bg);border-radius:8px;padding:12px">
        <div style="font-size:11px;color:var(--text-secondary);font-weight:700;margin-bottom:4px">농장</div>
        <div style="font-size:14px;font-weight:700">${prog.farmName}</div>
        ${farm ? `<div style="font-size:12px;color:var(--text-secondary)">${farm.owner} · ${farm.address}</div>` : ''}
      </div>
      <div style="background:var(--bg);border-radius:8px;padding:12px">
        <div style="font-size:11px;color:var(--text-secondary);font-weight:700;margin-bottom:4px">사육 기간</div>
        <div style="font-size:14px;font-weight:700">${prog.duration}일령${prog.placementDate ? ' · 입추일 '+prog.placementDate : ''}</div>
        ${(prog.houses || prog.birdCount) ? `<div style="font-size:12px;color:var(--text-secondary)">${[
          prog.houses ? programBatchHouseLabel(prog.houses) : null,
          prog.birdCount ? Number(prog.birdCount).toLocaleString() + '수' : null,
        ].filter(Boolean).join(' · ')}</div>` : ''}
        ${showEnv ? `<div style="font-size:12px;color:var(--text-secondary)">${programSpeciesName(prog)} · ${programBreedName(prog)}</div>` : ''}
        ${prog.focus ? `<div style="font-size:12px;color:var(--text-secondary)">${prog.focus}</div>` : ''}
      </div>
      <div style="background:var(--bg);border-radius:8px;padding:12px">
        <div style="font-size:11px;color:var(--text-secondary);font-weight:700;margin-bottom:4px">투약 일수</div>
        <div style="font-size:14px;font-weight:700">${prog.days.length}일</div>
        <div style="font-size:12px;color:var(--text-secondary)">투약 계획 있는 날</div>
      </div>
    </div>
    <div style="overflow-x:auto;border:1px solid var(--border);border-radius:8px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--bg)">
            <th style="padding:9px 10px;text-align:center;border-bottom:1.5px solid var(--border);width:55px">일령</th>
            <th style="padding:9px 10px;text-align:center;border-bottom:1.5px solid var(--border);width:60px">날짜</th>
            <th style="padding:9px 10px;border-bottom:1.5px solid var(--border)">약품투약</th>
            <th style="padding:9px 10px;border-bottom:1.5px solid var(--border)">백신사항</th>
            ${showEnv ? `<th style="padding:9px 10px;border-bottom:1.5px solid var(--border);width:96px">🌡️ 온·습도</th>` : ''}
            <th style="padding:9px 10px;border-bottom:1.5px solid var(--border)">중요사항</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${prog.notes ? `<div style="margin-top:14px;padding:12px;background:var(--accent-light);border-radius:8px;font-size:12px;color:var(--accent-dark)">
      <strong>투약 관리 포인트:</strong> ${prog.notes}</div>` : ''}
    ${buildFeedSection(prog)}
  `;
  document.querySelector('#modal-prog-view .modal-footer').innerHTML = `
    <button class="btn btn-outline" onclick="closeModal('modal-prog-view')">닫기</button>
    <button class="btn btn-primary" onclick="printProgram('${id}')">🖨️ A4 인쇄</button>
  `;
  openModal('modal-prog-view');
}

// ─── 일령 하나만 고치는 계획 변경 모달 ─────────────────────────────────────
// 입추 상세의 "일자별 계획 대비 실적" 표에서 그 줄의 계획(약품/백신/중요사항)만
// 바로 고친다. openProgramModal()로 전체를 여는 것과 일부러 나눠 둔다 —
// 전체 편집은 일령 수만큼(최대 500줄) 표를 다시 그려 무겁고, 저장할 때
// syncProgramBatch()가 함께 돌아 입추 기록까지 건드리기 때문이다.
// 여기서는 programs.days에서 그 일령 항목 하나만 갈아끼운다.
let editingDayPlan = { programId: null, day: null };
let dpSlotCount = 0;
// 백신 목록을 농장 축종에 맞춰 거를 때 쓴다. 모달을 여는 시점에 정해 두고
// 슬롯을 다시 그릴 때도 같은 기준을 쓴다.
let dpAllowedVaccineSpecies = null;

function dpDrugSlotHtml(idx, entry) {
  const isCustom = !!(entry && !entry.drugId);
  return `<div id="dp-drug-slot-${idx}" style="${idx > 0 ? 'margin-top:6px' : ''}">
    <div style="display:flex;align-items:center;gap:6px">
      <select id="dp-drug-sel-${idx}" onchange="onDpDrugChange(${idx})" style="flex:1;min-width:0">
        ${getDrugOptions(isCustom ? '__custom__' : (entry?.drugId || ''))}
      </select>
      <button type="button" onclick="removeDpDrugSlot(${idx})" title="이 약품 빼기"
        style="flex:none;background:var(--red-bg);color:var(--red);border:none;border-radius:6px;padding:7px 11px;cursor:pointer;font-size:15px;line-height:1;font-family:inherit">×</button>
    </div>
    <div id="dp-drug-custom-${idx}" style="display:${isCustom ? '' : 'none'};margin-top:6px">
      <input id="dp-drug-text-${idx}" value="${isCustom ? (entry.name || '') : ''}" placeholder="약품명 직접 입력">
    </div>
  </div>`;
}

function addDpDrugSlot(entry) {
  const wrap = document.getElementById('dp-drug-slots');
  if (!wrap) return;
  wrap.insertAdjacentHTML('beforeend', dpDrugSlotHtml(dpSlotCount, entry));
  dpSlotCount++;
}

function removeDpDrugSlot(idx) {
  document.getElementById(`dp-drug-slot-${idx}`)?.remove();
  updateDpNote();
}

function onDpDrugChange(idx) {
  const sel = document.getElementById(`dp-drug-sel-${idx}`);
  const custom = document.getElementById(`dp-drug-custom-${idx}`);
  if (!sel || !custom) return;
  const isCustom = sel.value === '__custom__';
  custom.style.display = isCustom ? '' : 'none';
  if (isCustom) document.getElementById(`dp-drug-text-${idx}`)?.focus();
  updateDpNote();
}

function onDpVaccineChange() {
  const sel = document.getElementById('dp-vaccine-sel');
  const custom = document.getElementById('dp-vaccine-custom');
  const isCustom = sel.value === '__custom__';
  custom.style.display = isCustom ? '' : 'none';
  if (isCustom) document.getElementById('dp-vaccine-text')?.focus();
  updateDpNote();
}

// 프로그램 편집 모달의 updateDayNote()와 같은 규칙으로 중요사항을 자동 조합한다.
// 사용자가 직접 손댄 문구(manualEdit)는 덮지 않는다.
function updateDpNote() {
  const noteEl = document.getElementById('dp-note');
  if (!noteEl || noteEl.dataset.manualEdit === '1') return;
  const notes = [];
  document.querySelectorAll('#dp-drug-slots select').forEach(sel => {
    if (!sel.value || sel.value === '__custom__') return;
    const opt = sel.options[sel.selectedIndex];
    if (opt.dataset.dose) notes.push(`${opt.dataset.name}: ${opt.dataset.dose}`);
    else if (opt.dataset.withdrawal) notes.push(`${opt.dataset.name} (휴약${opt.dataset.withdrawal})`);
  });
  const vsel = document.getElementById('dp-vaccine-sel');
  if (vsel?.value && vsel.value !== '__custom__') {
    const vopt = vsel.options[vsel.selectedIndex];
    if (vopt.dataset.dilution) notes.push(`[백신] ${vopt.dataset.name}: ${vopt.dataset.dilution}`);
    else if (vopt.dataset.method) notes.push(`[백신] ${vopt.dataset.name} ${vopt.dataset.method}`);
  }
  noteEl.value = notes.join(' / ');
}

// 어느 입추일을 기준으로 날짜를 보여줄지는 부르는 화면이 정해서 넘긴다.
// 입추 상세는 그 입추의 입추일, 투약 일정 화면은 연결된 사육중 계군의 입추일(없으면
// 프로그램에 적힌 입추일)을 쓰는데, 프로그램에 적힌 날짜와 실제 입추일이 다를 수 있어
// 여기서 하나로 정해버리면 화면에 보이던 날짜와 모달의 날짜가 어긋난다.
function openDayPlanModal(programId, day, placementDate) {
  const prog = load('programs').find(p => p.id === programId);
  if (!prog) { alert('투약 프로그램을 찾을 수 없습니다.'); return; }

  const dayNum = Number(day);
  editingDayPlan = { programId: prog.id, day: dayNum };
  const d = (prog.days || []).find(x => x.day === dayNum) || null;

  document.getElementById('modal-day-plan-title').textContent = `${dayNum}일령 계획 변경`;

  // 같은 프로그램을 여러 입추가 함께 쓰는 경우가 있다. 여기서 고치면 그 입추들의
  // 계획도 같이 바뀌므로, 저장하기 전에 몇 건이 영향을 받는지 알려준다.
  const sharedCount = load('batches').filter(b => b.programId === prog.id).length;
  const dateStr = programDayDate(placementDate, dayNum);
  document.getElementById('dp-context').innerHTML =
    `📋 <strong>${prog.name}</strong>의 ${dayNum}일령${dateStr ? ` (${dateStr})` : ''} 계획을 고칩니다.`
    + (sharedCount > 1
      ? `<br>⚠️ 이 프로그램을 함께 쓰는 입추가 ${sharedCount}건이라, 나머지 입추의 계획도 같이 바뀝니다.`
      : '');

  const farmType = load('farms').find(f => f.id === prog.farmId)?.type || '';
  dpAllowedVaccineSpecies = allowedVaccineSpecies(farmType);

  dpSlotCount = 0;
  document.getElementById('dp-drug-slots').innerHTML = '';
  const drugs = d?.drugs || [];
  if (drugs.length) drugs.forEach(x => addDpDrugSlot(x));
  else addDpDrugSlot();

  const v = d?.vaccine || null;
  const isCustomV = !!(v && !v.vaccineId);
  document.getElementById('dp-vaccine-sel').innerHTML =
    getVaccineOptions(isCustomV ? '__custom__' : (v?.vaccineId || ''), dpAllowedVaccineSpecies);
  document.getElementById('dp-vaccine-custom').style.display = isCustomV ? '' : 'none';
  document.getElementById('dp-vaccine-text').value = isCustomV ? (v.name || '') : '';

  // 이미 적어둔 중요사항이 있으면 "직접 입력한 문구"로 취급한다. 약품을 하나 바꿨다고
  // 현장에서 적어둔 메모가 자동 문구로 지워지면 안 되기 때문이다(전체 편집 모달과
  // 다른 점 — 거기는 표를 처음부터 다시 채우는 흐름이라 자동 조합을 그대로 둔다).
  const noteEl = document.getElementById('dp-note');
  noteEl.value = d?.note || '';
  if (noteEl.value) noteEl.dataset.manualEdit = '1';
  else delete noteEl.dataset.manualEdit;

  openModal('modal-day-plan');
}

function collectDpDrugs() {
  const drugs = [];
  // DOM 순서 = 화면에 보이는 순서. 슬롯을 지웠다 추가해도 번호가 아니라 순서를 따른다.
  document.querySelectorAll('#dp-drug-slots > div').forEach(div => {
    const idx = div.id.replace('dp-drug-slot-', '');
    const sel = document.getElementById(`dp-drug-sel-${idx}`);
    if (!sel) return;
    if (sel.value === '__custom__') {
      const txt = document.getElementById(`dp-drug-text-${idx}`)?.value.trim();
      if (txt) drugs.push({ drugId: null, name: txt });
    } else if (sel.value) {
      const name = sel.options[sel.selectedIndex].dataset.name || '';
      if (name) drugs.push({ drugId: sel.value, name });
    }
  });
  return drugs;
}

async function saveDayPlan() {
  const { programId, day } = editingDayPlan;
  const prog = load('programs').find(p => p.id === programId);
  if (!prog) { alert('프로그램을 찾을 수 없습니다. 새로고침 후 다시 시도하세요.'); return; }

  const drugs = collectDpDrugs();
  const vsel = document.getElementById('dp-vaccine-sel');
  let vaccine = null;
  if (vsel.value === '__custom__') {
    const txt = document.getElementById('dp-vaccine-text').value.trim();
    if (txt) vaccine = { vaccineId: null, name: txt };
  } else if (vsel.value) {
    const vname = vsel.options[vsel.selectedIndex].dataset.name || '';
    if (vname) vaccine = { vaccineId: vsel.value, name: vname };
  }
  const note = document.getElementById('dp-note').value.trim();

  // 세 칸이 모두 비면 그 일령 항목 자체를 뺀다. 빈 항목을 남기면 프로그램 목록의
  // "투약 일수"나 상세·인쇄 표에 내용 없는 줄이 생긴다(saveProgram()과 같은 규칙).
  const days = (prog.days || []).filter(x => x.day !== day);
  if (drugs.length || vaccine || note) days.push({ day, drugs, vaccine, note });
  days.sort((a, b) => a.day - b.day);

  const btn = document.getElementById('dp-save-btn');
  btn.disabled = true;
  try {
    // days만 넘기면 toRow()가 나머지 컬럼을 전부 null로 덮어써 프로그램이 비워진다.
    // 반드시 기존 값을 통째로 실어 보내고 days만 바꾼다.
    await updateRow('programs', programId, { ...prog, days });
  } catch (e) {
    alert('저장 실패: ' + e.message);
    return;
  } finally {
    btn.disabled = false;
  }

  editingDayPlan = { programId: null, day: null };
  closeModal('modal-day-plan');
  // 이 모달은 입추 상세에서만 열리지만, 프로그램 목록이 열려 있는 채로 저장될
  // 가능성도 있어 함께 갱신한다(같은 데이터를 각자 그리는 화면들이라).
  if (document.getElementById('page-batch-detail')?.classList.contains('active')) renderBatchDetail();
  if (document.getElementById('page-programs')?.classList.contains('active')) renderPrograms();
  if (document.getElementById('page-schedule')?.classList.contains('active')) renderScheduleView();
}

function renderPrograms() {
  const q = (document.getElementById('prog-search')?.value||'').toLowerCase();
  const ff = document.getElementById('prog-filter-farm')?.value||'';
  let progs = load('programs').filter(p =>
    (!q || p.name.toLowerCase().includes(q) || (p.farmName||'').toLowerCase().includes(q)) &&
    (!ff || p.farmId === ff)
  );
  // 최근에 등록한 프로그램을 맨 위에 놓는다. STORE는 created_at 오름차순(오래된 것부터)이라
  // 그대로 그리면 방금 만든 프로그램이 목록 맨 아래로 밀려 한참 스크롤해야 한다.
  // filter()가 새 배열을 돌려주므로 여기서 정렬해도 STORE 원본 순서는 건드리지 않는다.
  // created_at이 없는 데이터(구버전 백업 복원분 등)는 맨 뒤로 보낸다.
  progs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const container = document.getElementById('prog-list');
  if (!progs.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon-big">📋</div><p>등록된 투약 프로그램이 없습니다. 프로그램을 추가해주세요.</p></div>`;
    return;
  }
  container.innerHTML = progs.map(p => {
    const drugDays = p.days.filter(d=>d.drugs&&d.drugs.length).length;
    const vaccDays = p.days.filter(d=>d.vaccine).length;
    const showEnv = programHasEnv(p);
    return `
    <div class="card mb-16">
      <div class="card-header">
        <div>
          <div class="card-title">${p.name}</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">🏘️ ${p.farmName}${p.focus?' · '+p.focus:''}</div>
        </div>
        <div class="flex-gap">
          <button class="btn btn-outline btn-sm" onclick="viewProgram('${p.id}')">📋 상세보기</button>
          <button class="btn btn-primary btn-sm" onclick="printProgram('${p.id}')">🖨️ 인쇄</button>
          <button class="btn btn-outline btn-sm" onclick="duplicateProgram('${p.id}')" title="이 프로그램을 그대로 복사해 새 회차로 등록">📄 복제</button>
          <button class="btn btn-outline btn-sm" onclick="openProgramModal('${p.id}')">편집</button>
          <button class="btn btn-danger btn-sm" onclick="deleteProgram('${p.id}')">삭제</button>
        </div>
      </div>
      <div class="flex-gap" style="margin-bottom:12px;gap:16px">
        <span><span style="color:var(--text-secondary);font-size:12px">사육기간 </span><strong>${p.duration}일령</strong></span>
        ${p.houses ? `<span><span style="color:var(--text-secondary);font-size:12px">동수 </span><strong>${programBatchHouseLabel(p.houses)}</strong></span>` : ''}
        ${p.birdCount ? `<span><span style="color:var(--text-secondary);font-size:12px">마릿수 </span><strong>${Number(p.birdCount).toLocaleString()}수</strong></span>` : ''}
        <span><span class="badge badge-blue">약품 ${drugDays}일</span></span>
        <span><span class="badge badge-green">백신 ${vaccDays}일</span></span>
      </div>
      <div style="overflow-x:auto;border:1px solid var(--border);border-radius:8px">
        <table class="schedule-table" style="border-collapse:collapse;font-size:12px;min-width:${showEnv?700:600}px">
          <thead><tr style="background:var(--bg)">
            <th style="padding:7px 10px;border-bottom:1px solid var(--border);width:50px;text-align:center">일령</th>
            <th style="padding:7px 10px;border-bottom:1px solid var(--border);width:60px;text-align:center">날짜</th>
            <th style="padding:7px 10px;border-bottom:1px solid var(--border)">약품투약</th>
            <th style="padding:7px 10px;border-bottom:1px solid var(--border)">백신사항</th>
            ${showEnv ? `<th style="padding:7px 10px;border-bottom:1px solid var(--border);width:92px;text-align:center">🌡️ 온·습도</th>` : ''}
            <th style="padding:7px 10px;border-bottom:1px solid var(--border)">비고</th>
          </tr></thead>
          <tbody>${p.days.map(d=>`
            <tr>
              <td style="text-align:center;font-weight:700;color:var(--accent);background:var(--bg);padding:5px 8px">${d.day}</td>
              <td style="text-align:center;color:var(--text-secondary);font-size:11px;padding:5px 8px">${programDayDateShort(p.placementDate, d.day)}</td>
              <td style="padding:5px 8px">${(d.drugs&&d.drugs.length)?dayDrugPillsHtml(d):''}</td>
              <td style="padding:5px 8px">${d.vaccine?dayVaccinePillHtml(d):''}</td>
              ${showEnv ? (env => `<td style="padding:5px 8px;text-align:center;font-size:11px;line-height:1.4;white-space:nowrap">
                <span style="color:var(--accent);font-weight:700">${env?env.tRange:'-'}</span><br>
                <span style="color:var(--text-secondary)">${env?env.rhRange:'-'}</span>
              </td>`)(programEnvFor(p, d.day)) : ''}
              <td style="padding:5px 8px;color:var(--text-secondary);font-size:11px">${d.note||''}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${(p.feedItems&&p.feedItems.length) ? `<div style="margin-top:10px;padding:8px 10px;background:var(--green-bg);border-radius:6px;font-size:11px;color:var(--green)">
        <strong>🌾 사료첨가제:</strong> ${p.feedItems.map(it=>`${it.name} ${it.dose}`).join(' · ')}
      </div>` : ''}
    </div>`;
  }).join('');
}
