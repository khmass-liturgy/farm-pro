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
    focus: document.getElementById('p-focus').value.trim(),
    notes: document.getElementById('p-notes').value.trim(),
    feedItems: collectFeedSlots(),
    feedMemo: document.getElementById('p-feed-memo').value.trim(),
    days,
  };
  try {
    if (editingId.program) await updateRow('programs', editingId.program, data);
    else await insertRow('programs', data);
  } catch (e) { alert('저장 실패: ' + e.message); return; }
  closeModal('modal-program');
  populateFarmFilter();
  renderPrograms();
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
    <div style="border:1px solid var(--border);border-top:none;border-radius:0 0 6px 6px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
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

function renderPrograms() {
  const q = (document.getElementById('prog-search')?.value||'').toLowerCase();
  const ff = document.getElementById('prog-filter-farm')?.value||'';
  let progs = load('programs').filter(p =>
    (!q || p.name.toLowerCase().includes(q) || (p.farmName||'').toLowerCase().includes(q)) &&
    (!ff || p.farmId === ff)
  );
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
