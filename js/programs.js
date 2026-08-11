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
  opts += `<optgroup label="─ 직접입력"><option value="__custom__">✏️ 직접 입력...</option></optgroup>`;
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
  div.innerHTML = `
    <div>
      <div style="font-size:10px;color:var(--text-secondary);margin-bottom:3px">제품</div>
      <select id="fs-sel-${idx}" onchange="onFeedSlotChange(${idx})"
        style="width:100%;border:1px solid var(--border);border-radius:4px;padding:5px 7px;font-size:12px;font-family:inherit;background:var(--bg-card)">
        ${getFeedOptions(selId)}
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
  const farms = load('farms');
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">농장 선택</option>' + farms.map(f =>
    `<option value="${f.id}"${f.id===val?' selected':''}>${f.name} (${f.owner})</option>`
  ).join('');
}
function populateFarmFilter() {
  const farms = load('farms');
  const sel = document.getElementById('prog-filter-farm');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">전체 농장</option>' + farms.map(f =>
    `<option value="${f.id}"${f.id===cur?' selected':''}>${f.name}</option>`
  ).join('');
}

function openProgramModal(id) {
  editingId.program = id || null;
  const prog = id ? load('programs').find(p => p.id === id) : null;
  document.getElementById('modal-prog-title').textContent = id ? '투약 프로그램 편집' : '투약 프로그램 등록';
  populateFarmSelect('p-farm', prog?.farmId || '');
  document.getElementById('p-name').value = prog?.name || '';
  document.getElementById('p-duration').value = prog?.duration || 30;
  document.getElementById('p-placement-date').value = prog?.placementDate || '';
  document.getElementById('p-focus').value = prog?.focus || '';
  document.getElementById('p-notes').value = prog?.notes || '';
  document.getElementById('p-feed-memo').value = prog?.feedMemo || '';
  generateDayRows(prog?.days);
  initFeedSlots(prog?.feedItems || []);
  openModal('modal-program');
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
  opts += `<optgroup label="─ 직접입력"><option value="__custom__">✏️ 직접 입력...</option></optgroup>`;
  return opts;
}

function getVaccineOptions(selectedId) {
  const vaccines = load('vaccines');
  let opts = `<option value="">백신 선택...</option>`;
  vaccines.forEach(v => {
    const sel = v.id === selectedId ? ' selected' : '';
    opts += `<option value="${v.id}" data-name="${v.name}" data-method="${v.method||''}" data-dilution="${v.dilution||''}"${sel}>${v.name}</option>`;
  });
  opts += `<optgroup label="─ 직접입력"><option value="__custom__">✏️ 직접 입력...</option></optgroup>`;
  return opts;
}

// 약품 선택 변경 → 용법 자동입력
function onDrugSelectChange(dayNum, slotIdx) {
  const sel = document.getElementById(`day-drug-sel-${dayNum}-${slotIdx}`);
  const customWrap = document.getElementById(`day-drug-custom-${dayNum}-${slotIdx}`);
  if (!sel) return;
  if (sel.value === '__custom__') { customWrap.style.display = ''; updateDayNote(dayNum); return; }
  customWrap.style.display = 'none';
  updateDayNote(dayNum);
}

function onVaccineSelectChange(dayNum) {
  const sel = document.getElementById(`day-vaccine-sel-${dayNum}`);
  const customWrap = document.getElementById(`day-vaccine-custom-${dayNum}`);
  if (!sel) return;
  customWrap.style.display = sel.value === '__custom__' ? '' : 'none';
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
  div.style.cssText = 'display:flex;align-items:center;gap:4px;margin-top:3px';
  div.innerHTML = `
    <select id="day-drug-sel-${dayNum}-${newIdx}" onchange="onDrugSelectChange(${dayNum},${newIdx})"
      style="flex:1;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:11px;font-family:inherit;background:var(--bg-card)">
      ${getDrugOptions('')}
    </select>
    <div id="day-drug-custom-${dayNum}-${newIdx}" style="display:none;flex:1">
      <input type="text" id="day-drug-text-${dayNum}-${newIdx}" placeholder="직접 입력"
        style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:11px;font-family:inherit">
    </div>
    <button onclick="removeDrugSlot(${dayNum},${newIdx})" title="삭제"
      style="background:var(--red-bg);color:var(--red);border:none;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:13px;line-height:1">×</button>`;
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
      slotsHtml += `
        <div id="drug-slot-${i}-${s}" style="display:flex;align-items:center;gap:4px;${s>0?'margin-top:3px':''}">
          <select id="day-drug-sel-${i}-${s}" onchange="onDrugSelectChange(${i},${s})"
            style="flex:1;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:11px;font-family:inherit;background:var(--bg-card)">
            ${getDrugOptions(dEntry?.drugId || '')}
          </select>
          <div id="day-drug-custom-${i}-${s}" style="display:${isCustom?'':'none'};flex:1">
            <input type="text" id="day-drug-text-${i}-${s}" value="${isCustom?(dEntry.name||''):''}" placeholder="직접 입력"
              style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:11px;font-family:inherit">
          </div>
          ${s>0?`<button onclick="removeDrugSlot(${i},${s})" title="삭제"
            style="background:var(--red-bg);color:var(--red);border:none;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:13px;line-height:1">×</button>`:''}
        </div>`;
    }

    const isCustomV = !!(exVaccine && !exVaccine.vaccineId);
    const placementDate = document.getElementById('p-placement-date').value;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align:center;font-weight:700;color:var(--accent);background:var(--bg);border:1px solid var(--border);vertical-align:top;padding-top:10px">${i}</td>
      <td id="day-date-${i}" style="text-align:center;color:var(--text-secondary);font-size:11px;background:var(--bg);border:1px solid var(--border);vertical-align:top;padding-top:10px">${programDayDateShort(placementDate, i)}</td>
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
          ${getVaccineOptions(exVaccine?.vaccineId || '')}
        </select>
        <div id="day-vaccine-custom-${i}" style="display:${isCustomV?'':'none'};margin-top:3px">
          <input type="text" id="day-vaccine-text-${i}" value="${isCustomV?(exVaccine.name||''):''}" placeholder="직접 입력"
            style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:11px;font-family:inherit">
        </div>
      </td>
      <td style="border:1px solid var(--border);padding:6px 8px;vertical-align:top">
        <textarea id="day-note-${i}" rows="2" placeholder="약품 선택시 자동입력. 직접 수정 가능"
          oninput="this.dataset.manualEdit='1'"
          style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:11px;font-family:inherit;resize:vertical;min-height:48px">${exNote}</textarea>
      </td>`;
    tbody.appendChild(tr);
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

function viewProgram(id) {
  const prog = load('programs').find(p => p.id === id);
  if (!prog) return;
  const farm = load('farms').find(f => f.id === prog.farmId);
  let rows = '';
  for (let i = 1; i <= prog.duration; i++) {
    const d = prog.days.find(x => x.day === i);
    const hasData = d && ((d.drugs && d.drugs.length) || d.vaccine || d.note);
    rows += `<tr style="background:${hasData?'':'var(--bg)'}">
      <td style="text-align:center;font-weight:700;color:var(--accent);background:var(--bg);width:55px">${i}</td>
      <td style="text-align:center;color:var(--text-secondary);font-size:12px;width:60px">${programDayDateShort(prog.placementDate, i)}</td>
      <td>${dayDrugPillsHtml(d)}</td>
      <td>${dayVaccinePillHtml(d)}</td>
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
        <table class="schedule-table" style="border-collapse:collapse;font-size:12px;min-width:600px">
          <thead><tr style="background:var(--bg)">
            <th style="padding:7px 10px;border-bottom:1px solid var(--border);width:50px;text-align:center">일령</th>
            <th style="padding:7px 10px;border-bottom:1px solid var(--border)">약품투약</th>
            <th style="padding:7px 10px;border-bottom:1px solid var(--border)">백신사항</th>
            <th style="padding:7px 10px;border-bottom:1px solid var(--border)">비고</th>
          </tr></thead>
          <tbody>${p.days.map(d=>`
            <tr>
              <td style="text-align:center;font-weight:700;color:var(--accent);background:var(--bg);padding:5px 8px">${d.day}</td>
              <td style="padding:5px 8px">${(d.drugs&&d.drugs.length)?dayDrugPillsHtml(d):''}</td>
              <td style="padding:5px 8px">${d.vaccine?dayVaccinePillHtml(d):''}</td>
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
