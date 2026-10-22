// ─── 공수의 보고서 ───────────────────────────────────────────────────────────
// 원본: 매달 만들던 "OOOO_공수의보고서.xlsx" 워크북(입력대장 시트에 하루 한 줄씩
// 방문 기록을 적으면 여비청구서/활동수당청구서/근무상황보고서/예찰내역/예찰일지/
// 출장일지가 전부 그 시트를 참조해 자동으로 채워지던 구조)를 이 앱으로 옮긴 것.
//
// 엑셀 "입력대장" 시트가 하던 일을 vet_report_entries 테이블 + 이 화면(메뉴 이름도 "입력대장")이
// 대신한다. 원본은 "기간 시작일 + 비고란의 1~30 일련번호"로 날짜를 계산했는데,
// 그 방식은 일련번호가 하나라도 밀리면 그 아래 날짜가 전부 틀어진다. 여기서는
// 방문일을 날짜로 직접 받아 그 문제 자체가 없다. 나머지 5개 화면은 모두 이
// 테이블을 "선택한 년월" 기준으로 걸러 읽기만 하는 보고서/인쇄 화면이다.
//
// 청구서에 들어가는 공수의 개인정보(주민등록번호·계좌번호 포함)는 vet_office_info
// 표(로그인한 사용자만 읽는 단일 행)에서 가져온다. 처방전의 RX_CLINIC처럼 js
// 소스에 두면 이 저장소가 퍼블릭이라 그대로 공개 배포되기 때문이다.

function vetOfficeInfo() { return load('vetOfficeInfo')[0] || {}; }
function vetDefaultYm() { return new Date().toISOString().slice(0, 7); }
function vetMonthLabel(ym) {
  const [y, m] = (ym || '').split('-');
  return y && m ? `${y}년 ${Number(m)}월` : '';
}
function vetEntriesForYm(ym) {
  return load('vetReportEntries')
    .filter(e => (e.visitDate || '').slice(0, 7) === ym)
    .sort((a, b) => a.visitDate.localeCompare(b.visitDate));
}
function vetMonthStats(ym) {
  const list = vetEntriesForYm(ym);
  return { list, count: list.length, scaleSum: list.reduce((s, e) => s + (Number(e.scale) || 0), 0) };
}

// ─── ⚙ 사무실 정보(민감정보) ─────────────────────────────────────────────────
function openVetOfficeInfoModal() {
  const o = vetOfficeInfo();
  document.getElementById('voi-clinic-name').value = o.clinicName || '';
  document.getElementById('voi-vet-name').value = o.vetName || '';
  document.getElementById('voi-license-no').value = o.licenseNo || '';
  document.getElementById('voi-address').value = o.address || '';
  document.getElementById('voi-resident-no').value = o.residentNo || '';
  document.getElementById('voi-bank-name').value = o.bankName || '';
  document.getElementById('voi-bank-account').value = o.bankAccount || '';
  document.getElementById('voi-travel-fee').value = o.travelFeePerVisit ?? 20000;
  document.getElementById('voi-activity-allowance').value = o.monthlyActivityAllowance ?? '';
  openModal('modal-vet-office-info');
}

async function saveVetOfficeInfo() {
  const val = id => document.getElementById(id).value.trim();
  const numVal = id => { const v = document.getElementById(id).value; return v === '' ? null : Number(v); };
  const data = {
    clinicName: val('voi-clinic-name'), vetName: val('voi-vet-name'), licenseNo: val('voi-license-no'),
    address: val('voi-address'), residentNo: val('voi-resident-no'),
    bankName: val('voi-bank-name'), bankAccount: val('voi-bank-account'),
    travelFeePerVisit: numVal('voi-travel-fee') ?? 20000,
    monthlyActivityAllowance: numVal('voi-activity-allowance'),
  };
  try {
    if (vetOfficeInfo().id != null) await updateRow('vetOfficeInfo', true, data);
    else await insertRow('vetOfficeInfo', data);
  } catch (e) { alert('저장 실패: ' + e.message); return; }
  closeModal('modal-vet-office-info');
  alert('사무실 정보를 저장했습니다.');
}

// ─── 입력대장 (= 입력대장) — 방문 기록 등록/편집/삭제 ─────────────────
let vetEntrySelectedIds = new Set();

function toggleVetEntrySelectAll(checked) {
  const ids = vetEntriesForYm(document.getElementById('vetentry-month').value).map(e => e.id);
  vetEntrySelectedIds = checked ? new Set(ids) : new Set();
  renderVetEntries();
}
function toggleVetEntrySelect(id, checked) {
  if (checked) vetEntrySelectedIds.add(id); else vetEntrySelectedIds.delete(id);
  renderVetEntries();
}

function renderVetEntries() {
  const monthEl = document.getElementById('vetentry-month');
  if (!monthEl.value) monthEl.value = vetDefaultYm();
  const q = (document.getElementById('vetentry-search')?.value || '').toLowerCase();
  const list = vetEntriesForYm(monthEl.value).filter(e =>
    !q || (e.farmName || '').toLowerCase().includes(q) || (e.owner || '').toLowerCase().includes(q)
  );
  const liveIds = new Set(load('vetReportEntries').map(e => e.id));
  vetEntrySelectedIds.forEach(id => { if (!liveIds.has(id)) vetEntrySelectedIds.delete(id); });

  const editBtn = document.getElementById('vetentry-edit-btn');
  const deleteBtn = document.getElementById('vetentry-delete-btn');
  if (editBtn) editBtn.disabled = vetEntrySelectedIds.size !== 1;
  if (deleteBtn) deleteBtn.disabled = vetEntrySelectedIds.size === 0;

  const tbody = document.getElementById('vetentry-tbody');
  const empty = document.getElementById('vetentry-empty');
  const checkAll = document.getElementById('vetentry-check-all');
  if (!list.length) {
    tbody.innerHTML = ''; empty.style.display = '';
    if (checkAll) checkAll.checked = false;
    return;
  }
  empty.style.display = 'none';
  if (checkAll) checkAll.checked = list.every(e => vetEntrySelectedIds.has(e.id));
  tbody.innerHTML = list.map(e => `
    <tr>
      <td style="text-align:center"><input type="checkbox" ${vetEntrySelectedIds.has(e.id) ? 'checked' : ''} onchange="toggleVetEntrySelect('${e.id}', this.checked)"></td>
      <td>${e.visitDate}</td>
      <td><strong>${e.owner || '-'}</strong></td>
      <td>${e.farmName || '(삭제된 농장)'}</td>
      <td>${e.address || '-'}</td>
      <td>${e.species || '-'}</td>
      <td>${e.scale != null ? Number(e.scale).toLocaleString() : '-'}</td>
      <td>${e.content || '-'}</td>
    </tr>`).join('');
}

function editSelectedVetEntry() {
  if (vetEntrySelectedIds.size !== 1) return;
  openVetEntryModal([...vetEntrySelectedIds][0]);
}

async function deleteSelectedVetEntries() {
  if (!vetEntrySelectedIds.size) return;
  if (!confirm(`선택한 방문 기록 ${vetEntrySelectedIds.size}건을 삭제하시겠습니까?`)) return;
  const photoPaths = load('vetReportEntries').filter(e => vetEntrySelectedIds.has(e.id)).flatMap(e => e.photos || []);
  try {
    for (const id of vetEntrySelectedIds) await deleteRow('vetReportEntries', id);
  } catch (e) { alert('삭제 실패: ' + e.message); return; }
  // 기록이 지워지면 거기 딸린 관련자료 사진도 저장소에서 치운다(실패해도 기록 삭제는 이미 끝났으므로 조용히 넘어간다).
  if (photoPaths.length) { try { await sb.storage.from(VY_BUCKET).remove(photoPaths); } catch (e) { /* 남은 파일은 무해 */ } }
  vetEntrySelectedIds.clear();
  renderVetEntries();
}

// 입력대장 서식의 "(자동)" 칸 — 주소·축종·사육두수는 농장 등록 정보에서 자동으로 채워지고 직접 고치지 않는다.
function populateVetEntryFarms(selectedId) {
  const sel = document.getElementById('vetentry-farm');
  sel.innerHTML = '<option value="">농장주 선택</option>' + farmsByOwner().map(f =>
    `<option value="${f.id}"${f.id === selectedId ? ' selected' : ''}>${f.owner || '-'} — ${f.name || ''}</option>`).join('');
}

function onVetEntryFarmChange() {
  const farm = load('farms').find(f => f.id === document.getElementById('vetentry-farm').value);
  document.getElementById('vetentry-address').value = farm?.address || '';
  document.getElementById('vetentry-species').value = farm?.type || '';
  document.getElementById('vetentry-scale').value = farm?.count ? Number(farm.count).toLocaleString() : '';
}

// 예찰내용: 자주 쓰는 세 가지 중에서 고르거나 "직접입력"으로 적는다.
const VET_CONTENT_PRESETS = ['질병예찰 - 정상', 'AI진단키트 검사 -음성', '정기검사 샘플링 및 시험소의뢰'];

function onVetContentSelChange() {
  const custom = document.getElementById('vetentry-content-sel').value === '__custom__';
  const input = document.getElementById('vetentry-content');
  input.style.display = custom ? '' : 'none';
  if (custom) input.focus();
}

function vetEntryContentValue() {
  const sel = document.getElementById('vetentry-content-sel').value;
  return sel === '__custom__' ? document.getElementById('vetentry-content').value.trim() : sel;
}

function openVetEntryModal(id) {
  editingId.vetReportEntry = id || null;
  const e = id ? load('vetReportEntries').find(x => x.id === id) : null;
  document.getElementById('modal-vet-entry-title').textContent = id ? '방문 기록 편집' : '방문 기록 추가';
  document.getElementById('vetentry-date').value = e?.visitDate || new Date().toISOString().slice(0, 10);
  populateVetEntryFarms(e?.farmId || '');
  const content = e ? (e.content || '') : VET_CONTENT_PRESETS[0];
  const preset = VET_CONTENT_PRESETS.includes(content);
  document.getElementById('vetentry-content-sel').value = preset ? content : '__custom__';
  document.getElementById('vetentry-content').value = preset ? '' : content;
  onVetContentSelChange();
  onVetEntryFarmChange();
  openModal('modal-vet-entry');
}

async function saveVetEntry() {
  const visitDate = document.getElementById('vetentry-date').value;
  const farmId = document.getElementById('vetentry-farm').value;
  if (!visitDate || !farmId) { alert('방문일과 축주명(농장주)은 필수입니다.'); return; }
  const farm = load('farms').find(f => f.id === farmId);
  const data = {
    visitDate, farmId, farmName: farm.name, owner: farm.owner,
    address: farm.address, species: farm.type, scale: farm.count,
    content: vetEntryContentValue(),
    createdByEmail: await currentUserEmail(),
  };
  try {
    if (editingId.vetReportEntry) await updateRow('vetReportEntries', editingId.vetReportEntry, data);
    else await insertRow('vetReportEntries', data);
  } catch (e) { alert('저장 실패: ' + e.message); return; }
  editingId.vetReportEntry = null;
  closeModal('modal-vet-entry');
  renderVetEntries();
}

// ─── 입력대장: 입력대장 엑셀 업로드 ─────────────────────────────────
// 형식은 「공수의 예찰 입력 대장」 시트(번호·방문일(자동)·축주명(농장주)·주소(자동조회)·
// 축종(자동)·사육두수(자동)·예찰내용·비고(일련번호))와 같다. 열 이름으로 찾기 때문에 열 순서가
// 달라도 된다. (자동) 칸은 파일 값이 아니라 농장 등록 정보로 채운다 — 축주명으로 농장을 못 찾을
// 때만 파일에 적힌 값을 쓴다. 방문일이 비어 있으면 원본처럼 "기간 시작일 + 일련번호 - 1"로 계산한다.
const VET_IMP_ALIASES = {
  visitDate: ['방문일(자동)', '방문일', '방문날짜', '날짜', '날자'],
  owner: ['축주명(농장주)', '축주명', '농장주', '대표자'],
  address: ['주소(자동조회)', '주소'],
  species: ['축종(자동)', '축종'],
  scale: ['사육두수(자동)', '사육두수', '사육규모'],
  content: ['예찰내용', '예찰결과', '내용'],
  serial: ['비고(일련번호)', '일련번호', '비고'],
};
const vetImpNorm = v => String(v ?? '').replace(/\s+/g, '');

function vetXlDate(v) {
  if (v == null || v === '' || v === '-') return null;
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (v instanceof Date && !isNaN(v)) return ymd(new Date(v.getTime() + 12 * 3600 * 1000));
  if (typeof v === 'number') { const p = XLSX.SSF.parse_date_code(v); return p ? `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` : null; }
  const m = String(v).trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
}

function vetImpHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, 12); r++) {
    const cells = (rows[r] || []).map(vetImpNorm);
    const col = {};
    for (const [key, names] of Object.entries(VET_IMP_ALIASES)) {
      const i = cells.findIndex(c => names.map(vetImpNorm).includes(c));
      if (i >= 0) col[key] = i;
    }
    if (col.owner != null && (col.visitDate != null || col.serial != null)) return { row: r, col };
  }
  return null;
}

// "기간" 라벨 오른쪽의 시작일(원본 B2)
function vetImpPeriodStart(rows) {
  for (let r = 0; r < Math.min(rows.length, 6); r++) {
    const i = (rows[r] || []).findIndex(c => vetImpNorm(c) === '기간');
    if (i >= 0) for (let k = i + 1; k < (rows[r] || []).length; k++) { const d = vetXlDate(rows[r][k]); if (d) return d; }
  }
  return null;
}

function vetImpAddDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function vetParseLedger(rows) {
  const head = vetImpHeader(rows);
  if (!head) return null;
  const start = vetImpPeriodStart(rows);
  const farms = load('farms');
  const existing = load('vetReportEntries');
  const clean = v => { const t = String(v ?? '').trim(); return t === '-' ? '' : t; };
  const out = [];
  for (let r = head.row + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const get = k => (head.col[k] == null ? null : row[head.col[k]]);
    const owner = clean(get('owner'));
    if (!owner) continue; // 빈 줄·합계 줄
    const serial = Number(get('serial'));
    const visitDate = vetXlDate(get('visitDate')) || (start && Number.isInteger(serial) && serial >= 1 ? vetImpAddDays(start, serial - 1) : null);
    const fileAddr = clean(get('address'));
    let owned = farms.filter(f => f.owner === owner);
    if (owned.length > 1 && fileAddr) {
      const byAddr = owned.filter(f => (f.address || '').replace(/\s+/g, '') === fileAddr.replace(/\s+/g, ''));
      if (byAddr.length) owned = byAddr;
    }
    const farm = owned.length === 1 ? owned[0] : null;
    const scaleRaw = clean(get('scale')).replace(/,/g, '');
    const draft = {
      visitDate, farmId: farm?.id || null,
      farmName: farm?.name || '', owner,
      address: farm ? (farm.address || '') : fileAddr,
      species: farm ? (farm.type || '') : clean(get('species')),
      scale: farm ? (farm.count ?? null) : (scaleRaw !== '' && !isNaN(Number(scaleRaw)) ? Number(scaleRaw) : null),
      content: clean(get('content')),
    };
    const issues = [];
    if (!visitDate) issues.push('방문일 없음');
    const invalid = !visitDate;
    if (!invalid && owned.length > 1) issues.push(`같은 농장주 ${owned.length}곳 — 농장을 정할 수 없어 파일 값으로 등록`);
    else if (!invalid && !farm) issues.push('농장 목록에 없음 — 파일에 적힌 값으로 등록');
    const dup = !invalid && existing.some(e => e.visitDate === visitDate && e.owner === owner);
    if (dup) issues.push('이미 등록됨');
    out.push({ draft, issues, invalid, dup, include: !invalid && !dup, sheetRow: r + 1 });
  }
  return out;
}

let vetImpWb = null, vetImpRows = [];

async function onVetEntryFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try { vetImpWb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true }); }
  catch (err) { alert('엑셀 파일을 읽지 못했습니다: ' + err.message); return; }
  const sheetRows = n => XLSX.utils.sheet_to_json(vetImpWb.Sheets[n], { header: 1, raw: true, defval: null });
  const usable = vetImpWb.SheetNames.filter(n => vetImpHeader(sheetRows(n)));
  if (!usable.length) {
    alert('입력대장을 찾지 못했습니다.\n머리글 행에 "축주명(농장주)"과 "방문일(또는 비고(일련번호))" 열이 있는 시트가 필요합니다. "양식 다운로드"로 받은 양식을 사용해주세요.');
    return;
  }
  const sel = document.getElementById('vetimp-sheet');
  sel.innerHTML = usable.map(n => `<option value="${n}">${n}</option>`).join('');
  document.getElementById('vetimp-file-name').textContent = file.name;
  loadVetImportSheet();
  openModal('modal-vet-import');
}

function loadVetImportSheet() {
  const name = document.getElementById('vetimp-sheet').value;
  vetImpRows = vetParseLedger(XLSX.utils.sheet_to_json(vetImpWb.Sheets[name], { header: 1, raw: true, defval: null })) || [];
  renderVetImportPreview();
}

function toggleVetImportRow(i, checked) { vetImpRows[i].include = checked; renderVetImportPreview(); }
function toggleVetImportAll(checked) { vetImpRows.forEach(r => { if (!r.invalid) r.include = checked; }); renderVetImportPreview(); }

function renderVetImportPreview() {
  const n = vetImpRows.filter(r => r.include).length;
  document.getElementById('vetimp-count').textContent = `${vetImpRows.length}줄 중 ${n}건을 등록합니다` + (vetImpRows.some(r => r.dup) ? ' (이미 등록된 건은 기본으로 제외)' : '');
  const btn = document.getElementById('vetimp-issue-btn');
  btn.disabled = n === 0;
  btn.textContent = n ? `${n}건 등록` : '등록';
  document.getElementById('vetimp-check-all').checked = vetImpRows.length > 0 && vetImpRows.filter(r => !r.invalid).every(r => r.include);
  document.getElementById('vetimp-tbody').innerHTML = vetImpRows.map((r, i) => {
    const d = r.draft;
    return `<tr${r.invalid ? ' style="opacity:.5"' : ''}>
      <td style="text-align:center"><input type="checkbox" ${r.include ? 'checked' : ''} ${r.invalid ? 'disabled' : ''} onchange="toggleVetImportRow(${i}, this.checked)"></td>
      <td>${r.sheetRow}</td><td>${d.visitDate || '-'}</td>
      <td><strong>${d.owner}</strong>${d.farmName ? `<div style="font-size:11px;color:var(--text-secondary)">${d.farmName}</div>` : ''}</td>
      <td>${d.address || '-'}</td><td>${d.species || '-'}</td><td>${d.scale != null ? Number(d.scale).toLocaleString() : '-'}</td>
      <td>${d.content || '-'}</td>
      <td style="font-size:11px;color:${r.invalid ? 'var(--red)' : 'var(--text-secondary)'}">${r.issues.join(' · ') || '정상'}</td>
    </tr>`;
  }).join('');
}

async function saveVetImport() {
  const rows = vetImpRows.filter(r => r.include);
  if (!rows.length) return;
  if (!confirm(`방문 기록 ${rows.length}건을 등록합니다. 계속하시겠습니까?`)) return;
  const btn = document.getElementById('vetimp-issue-btn');
  const email = await currentUserEmail();
  btn.disabled = true;
  let done = 0;
  try {
    for (const r of rows) {
      btn.textContent = `등록 중... ${done + 1}/${rows.length}`;
      await insertRow('vetReportEntries', { ...r.draft, createdByEmail: email });
      done++;
    }
  } catch (e) {
    alert(`${done}건 등록 후 중단되었습니다: ${e.message}\n이미 등록된 건은 목록에 남아 있으니 다시 올리기 전에 확인하세요.`);
    renderVetEntries(); btn.disabled = false; return;
  }
  closeModal('modal-vet-import');
  renderVetEntries();
  alert(`${done}건을 등록했습니다.`);
}

function downloadVetEntryTemplate() {
  const header = ['번호', '방문일(자동)', '축주명(농장주)', '주소(자동조회)', '축종(자동)', '사육두수(자동)', '예찰내용'];
  const aoa = [['공수의 예찰 입력 대장'], header, ...Array.from({ length: 30 }, (_, i) => [i + 1, '', '', '', '', '', ''])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
  ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 16 }, { wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 32 }];
  const guide = XLSX.utils.aoa_to_sheet([
    ['입력대장 업로드 양식 작성 방법'], [''],
    ['· 한 줄이 하루 한 건의 농장 방문입니다. 머리글(2번째 줄)은 지우거나 바꾸지 마세요.'],
    ['· 방문일(2026-09-01 형식)과 축주명(농장주)과 예찰내용만 적으면 됩니다.'],
    ['· 주소·축종·사육두수는 비워두세요 — 축주명(농장주)으로 농장 등록 정보에서 자동으로 채워집니다.'],
    ['· 예찰내용 예: 질병예찰 - 정상 / AI진단키트 검사 -음성 / 정기검사 샘플링 및 시험소의뢰'],
    ['· 같은 방문일·같은 농장주가 이미 등록돼 있으면 기본으로 제외됩니다.'],
  ]);
  guide['!cols'] = [{ wch: 100 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '입력대장');
  XLSX.utils.book_append_sheet(wb, guide, '작성방법');
  XLSX.writeFile(wb, '입력대장_양식.xlsx');
}

// ─── 근무상황보고서 ─────────────────────────────────────────────────────────
// 첨부 「근무상황보고.xlsx」의 칸 배치를 그대로 옮긴 서식. 비고(수수)·예찰 횟수·예찰 농가수는 그달
// 입력대장에서 온다(비고(수수) = 그달 방문한 농장들의 사육두수 합계, 횟수·농가수 = 방문 건수).
// "2. 예방주사 및 채혈내역"·"3. 동물질병예찰 실적"은 이 앱에 그 수치를 따로 기록하는 화면이 없어
// 원본과 같이 "-"로 찍는다. "4. 기타실적"의 추진실적은 원본에 적혀 있던 내용을 기본 선택지로 두고,
// 직접 입력한 내용은 인쇄할 때 vet_office_info.work_etc_options에 저장돼 다음부터 선택지에 나온다.
// 원본 인쇄는 99%·가로 가운데 정렬이라 열 너비·줄 높이·글자 크기에 WR_SCALE을 곱했다.
const WR_COL_CHARS = [12.75, 10.75, 11.62, 15.5, 8.5, 10.75, 8.5];
const WR_SCALE = 0.99;
const WR_DEFAULT_ROW_PT = 13.5;
const WR_FONTS = [
  '"GulimChe","굴림체","Gulim","Malgun Gothic",sans-serif',
  '"HY헤드라인M","HYHeadLine-Medium","Malgun Gothic",sans-serif',
  '"HYMyeongJo","휴먼명조","Batang","바탕",serif',
  '"경기천년바탕","Batang","바탕",serif',
];
// [높이pt, [[열 수, 행 수, 글, 테두리(lrtb), 가로(c/l/r), 세로(m/b), 글자크기, 굵게, 글꼴번호]...]]  ({…}는 채워 넣는 자리)
const WR_ROWS = [
  [14.25,[[1,1,"[붙임 1-1]","","l","m",12.0,1,3],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","r","m",10.0,0,0],[1,1,"","","","b",11.0,0,0]]],
  [25.5,[[7,1,"공수의 근무상황 보고(산업동물)","","c","m",20.0,0,1]]],
  [15.0,[[7,1,"(공수의 → 시군)","","c","m",12.0,1,2]]],
  [12.0,[[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","l","m",10.0,0,0],[1,1,"","","","m",10.0,0,0],[1,1,"","","","m",10.0,0,0]]],
  [null,[[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","l","m",10.0,0,0],[2,1,"","","c","m",10.0,0,0]]],
  [14.25,[[7,1,"1. 공수의 근무상황","","l","m",12.0,1,0]]],
  [20.1,[[3,1,"공 수 의","lrtb","c","m",10.0,0,0],[1,2,"담 당 지 역","lrtb","c","m",10.0,0,0],[2,1,"예찰내역","lrtb","c","m",10.0,0,0],[1,2,"비 고\n(수수)","lrtb","c","m",10.0,0,0]]],
  [20.1,[[1,1,"동물병원","lrtb","c","m",10.0,0,0],[1,1,"성 명","lrtb","c","m",10.0,0,0],[1,1,"면허번호","lrtb","c","m",10.0,0,0],[1,1,"예찰 횟수","lrtb","c","m",9.0,0,0],[1,1,"예찰 농가수","lrtb","c","m",10.0,0,0]]],
  [20.1,[[1,1,"{clinic}","lrtb","c","m",10.0,0,0],[1,1,"{vet}","lrtb","c","m",10.0,0,0],[1,1,"{license}","lrtb","c","m",10.0,0,0],[1,1,"경기 파주","lrtb","c","m",10.0,0,0],[1,1,"{count}","lrtb","c","m",9.0,0,0],[1,1,"{count}","lrtb","c","m",10.0,0,0],[1,1,"{scale}","lrtb","c","m",10.0,0,0]]],
  [null,[[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0]]],
  [14.25,[[5,1,"2. 예방주사 및 채혈내역","","l","m",12.0,1,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0]]],
  [20.1,[[3,1,"예 방 주 사","lrtb","c","m",10.0,0,0],[3,1,"혈 청 검 사 용 채 혈 내 역","lrtb","c","m",10.0,0,0],[1,2,"비 고","lrtb","c","m",10.0,0,0]]],
  [20.1,[[1,1,"병 류 별","lrtb","c","m",10.0,0,0],[1,1,"금월실적","lrtb","c","m",10.0,0,0],[1,1,"누 계","lrtb","c","m",10.0,0,0],[1,1,"종류","lrtb","c","m",10.0,0,0],[1,1,"금월실적","lrtb","c","m",10.0,0,0],[1,1,"누 계","lrtb","c","m",10.0,0,0]]],
  [20.1,[[1,1,"구 제 역","lrtb","c","m",10.0,0,0],[1,1,"-","lrtb","c","m",10.0,0,0],[1,1,"두","lrtb","r","m",10.0,0,0],[1,1,"브 루 셀 라 병","lrtb","c","m",10.0,0,0],[1,1,"-","lrtb","c","m",10.0,0,0],[1,1,"두","lrtb","r","m",10.0,0,0],[1,1,"","lrtb","c","m",10.0,0,0]]],
  [20.1,[[1,1,"광 견 병","lrtb","c","m",10.0,0,0],[1,1,"-","lrtb","c","m",10.0,0,0],[1,1,"두","lrtb","r","m",10.0,0,0],[1,1,"우 결 핵","lrtb","c","m",10.0,0,0],[1,1,"-","lrtb","c","m",10.0,0,0],[1,1,"두","lrtb","r","m",10.0,0,0],[1,1,"","lrtb","c","m",10.0,0,0]]],
  [20.1,[[1,1,"탄저.기종저","lrtb","c","m",10.0,0,0],[1,1,"-","lrtb","c","m",10.0,0,0],[1,1,"두","lrtb","r","m",10.0,0,0],[1,1,"","lrtb","c","m",10.0,0,0],[1,1,"","lrtb","c","m",10.0,0,0],[1,1,"","lrtb","r","m",10.0,0,0],[1,1,"","lrtb","c","m",10.0,0,0]]],
  [20.1,[[1,1,"돼지열병","lrtb","c","m",10.0,0,0],[1,1,"-","lrtb","c","m",10.0,0,0],[1,1,"두","lrtb","r","m",10.0,0,0],[1,1,"","lrtb","c","m",10.0,0,0],[1,1,"","lrtb","c","m",10.0,0,0],[1,1,"","lrtb","r","m",10.0,0,0],[1,1,"","lrtb","c","m",10.0,0,0]]],
  [20.1,[[1,1,"기    타","lrtb","c","m",10.0,0,0],[1,1,"-","lrtb","c","m",10.0,0,0],[1,1,"두","lrtb","r","m",10.0,0,0],[1,1,"","lrtb","c","m",10.0,0,0],[1,1,"","lrtb","c","m",10.0,0,0],[1,1,"","lrtb","c","m",10.0,0,0],[1,1,"","lrtb","c","m",10.0,0,0]]],
  [null,[[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0]]],
  [14.25,[[5,1,"3. 동물질병예찰 실적","","l","m",12.0,1,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0]]],
  [21.0,[[1,2,"지역별","lrtb","c","m",10.0,0,0],[2,1,"신고내역","lrtb","c","m",10.0,0,0],[3,2,"조치내역","lrtb","c","m",10.0,0,0],[1,2,"비 고","lrtb","c","m",10.0,0,0]]],
  [28.5,[[1,1,"일시","lrtb","c","m",10.0,0,0],[1,1,"신고자(Tel.)","lrtb","c","m",10.0,0,0]]],
  [27.0,[[1,1,"계","lrtb","c","m",10.0,0,0],[1,1,"-","lrtb","c","m",10.0,0,0],[1,1,"-","lrtb","c","m",10.0,0,0],[3,1,"-","lrtb","c","m",12.0,0,0],[1,1,"","lrtb","c","m",8.0,0,0]]],
  [23.25,[[7,1,"동물 질병예찰 종합소견(발생동향 및 농가지도사항 등)","lrtb","c","m",10.0,0,0]]],
  [14.25,[[7,1,"","lrtb","c","m",10.0,0,0]]],
  [18.75,[[7,1,"","lrtb","l","m",10.0,0,0]]],
  [null,[[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0]]],
  [14.25,[[5,1,"4. 기타실적","","l","m",12.0,1,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0]]],
  [20.1,[[2,1,"업무명","lrtb","c","m",10.0,0,0],[4,1,"추진실적","lrtb","c","m",10.0,0,0],[1,1,"비고","lrtb","c","m",10.0,0,0]]],
  [20.1,[[2,1,"출하이동승인서 발급","lrtb","c","m",10.0,0,0],[4,1,"{etc0}","lrtb","c","m",10.0,0,0],[1,1,"","lrtb","","m",10.0,0,0]]],
  [20.1,[[2,1,"기립불능우확인서 발급","lrtb","c","m",10.0,0,0],[4,1,"{etc1}","lrtb","c","m",10.0,0,0],[1,1,"","lrtb","","m",10.0,0,0]]],
  [20.1,[[2,1,"AI 시료채취 및 의뢰","lrtb","c","m",10.0,0,0],[4,1,"{etc2}","lrtb","c","m",10.0,0,0],[1,1,"","lrtb","","m",10.0,0,0]]],
  [37.9,[[2,1,"산란성계 살충제검사 샘플링\n및 검사의뢰","lrtb","c","m",10.0,0,0],[4,1,"{etc3}","lrtb","c","m",10.0,0,0],[1,1,"","lrtb","","m",10.0,0,0]]],
  [45.6,[[2,1,"역학관련","lrtb","c","m",10.0,0,0],[4,1,"{etc4}","lrtb","c","m",10.0,0,0],[1,1,"","lrtb","","m",10.0,0,0]]],
  [null,[[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0],[1,1,"","","","b",11.0,0,0]]],
  [20.25,[[7,1,"▣ 제출자                       대한동물병원            최동명           (서명) ","","l","m",14.0,0,1]]]
];

// 업무명 5개와 원본에 적혀 있던 추진실적(기본 선택지). ''는 "비워두기".
const VET_WORK_ETC_ITEMS = [
  { name: '출하이동승인서 발급', defaults: ['매주 목요일 소래축산 관련 농장 이동승인서 발급', '-'] },
  { name: '기립불능우확인서 발급', defaults: ['-'] },
  { name: 'AI 시료채취 및 의뢰', defaults: ['AI정기검사, 육계 이동승인서 및 샘플채취', '-'] },
  { name: '산란성계 살충제검사 샘플링 및 검사의뢰', defaults: ['이장수', '-'] },
  { name: '역학관련', defaults: ['', '-'] },
];
let vetWorkEtcLists = [];   // 항목별 선택지(기본 + 저장된 것) — select의 option 번호가 이 배열의 위치다
let vetWorkEtcBuilt = false;

function vetWorkEtcSaved(i) { return ((vetOfficeInfo().workEtcOptions || {})[i] || []).filter(t => typeof t === 'string'); }

function renderVetWorkEtc(selected) {
  const wrap = document.getElementById('vetwork-etc-wrap');
  if (!wrap) return;
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  vetWorkEtcLists = VET_WORK_ETC_ITEMS.map((it, i) => {
    const list = [...it.defaults];
    vetWorkEtcSaved(i).forEach(t => { if (!list.includes(t)) list.push(t); });
    return list;
  });
  wrap.innerHTML = VET_WORK_ETC_ITEMS.map((it, i) => {
    const list = vetWorkEtcLists[i];
    const want = selected && selected[i] != null ? list.indexOf(selected[i]) : 0;
    return `<div class="form-group"><label>${esc(it.name)}</label>
      <div class="flex-gap">
        <select id="vetwork-etc-sel-${i}" onchange="onVetWorkEtcChange(${i})" style="flex:1">
          ${list.map((t, k) => `<option value="${k}"${k === want ? ' selected' : ''}>${t === '' ? '(비워두기)' : esc(t)}${k >= it.defaults.length ? '  · 저장됨' : ''}</option>`).join('')}
          <option value="c"${want < 0 ? ' selected' : ''}>직접입력</option>
        </select>
        <button type="button" class="btn btn-outline btn-sm" id="vetwork-etc-del-${i}" onclick="deleteVetWorkEtcSaved(${i})" style="display:none">저장된 항목 삭제</button>
      </div>
      <input id="vetwork-etc-${i}" value="${want < 0 ? esc(selected[i]) : ''}" placeholder="추진실적을 직접 입력하세요 (인쇄하면 저장되어 다음에 선택할 수 있습니다)" style="display:none;margin-top:6px">
    </div>`;
  }).join('');
  VET_WORK_ETC_ITEMS.forEach((_, i) => onVetWorkEtcChange(i));
  vetWorkEtcBuilt = true;
}

function onVetWorkEtcChange(i) {
  const v = document.getElementById(`vetwork-etc-sel-${i}`).value;
  document.getElementById(`vetwork-etc-${i}`).style.display = v === 'c' ? '' : 'none';
  document.getElementById(`vetwork-etc-del-${i}`).style.display = v !== 'c' && Number(v) >= VET_WORK_ETC_ITEMS[i].defaults.length ? '' : 'none';
  if (v === 'c') document.getElementById(`vetwork-etc-${i}`).focus();
}

function vetWorkEtcValues() {
  return VET_WORK_ETC_ITEMS.map((_, i) => {
    const v = document.getElementById(`vetwork-etc-sel-${i}`)?.value;
    return v === 'c' ? document.getElementById(`vetwork-etc-${i}`).value.trim() : (vetWorkEtcLists[i]?.[Number(v)] ?? '');
  });
}

async function saveVetWorkEtcOptions(options) {
  const o = vetOfficeInfo();
  const data = { ...o, workEtcOptions: options };
  if (o.id != null) await updateRow('vetOfficeInfo', true, data); else await insertRow('vetOfficeInfo', data);
}

async function deleteVetWorkEtcSaved(i) {
  const idx = Number(document.getElementById(`vetwork-etc-sel-${i}`).value);
  const text = vetWorkEtcLists[i]?.[idx];
  if (text == null || idx < VET_WORK_ETC_ITEMS[i].defaults.length) return;
  if (!confirm(`저장된 항목을 삭제할까요?\n\n${text}`)) return;
  const options = { ...(vetOfficeInfo().workEtcOptions || {}) };
  options[i] = vetWorkEtcSaved(i).filter(t => t !== text);
  try { await saveVetWorkEtcOptions(options); } catch (e) { alert('삭제 실패: ' + e.message); return; }
  const keep = vetWorkEtcValues(); keep[i] = VET_WORK_ETC_ITEMS[i].defaults[0];
  renderVetWorkEtc(keep);
}

function renderVetWorkReportSummary() {
  const monthEl = document.getElementById('vetwork-month');
  if (!monthEl.value) monthEl.value = vetDefaultYm();
  if (!vetWorkEtcBuilt) renderVetWorkEtc();
  const { count, scaleSum } = vetMonthStats(monthEl.value);
  document.getElementById('vetwork-summary').textContent =
    `${vetMonthLabel(monthEl.value)} 예찰 ${count}건 · 비고(수수) ${scaleSum.toLocaleString()} — 입력대장에서 가져옵니다.`;
}

function buildVetWorkReportHtml(ym, etc) {
  const S = WR_SCALE;
  const o = vetOfficeInfo();
  const { count, scaleSum } = vetMonthStats(ym);
  const widths = WR_COL_CHARS.map(c => Math.round(c * 7 * S));
  const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const fill = {
    '{clinic}': o.clinicName || '대한동물병원', '{vet}': o.vetName || '최동명', '{license}': o.licenseNo || '8433',
    '{count}': `${count} 건 방문`, '{scale}': scaleSum.toLocaleString(),
  };
  etc.forEach((t, i) => { fill[`{etc${i}}`] = t; });
  const align = { c: 'center', l: 'left', r: 'right' };
  const trs = WR_ROWS.map(([h, cells]) => {
    const tds = cells.map(([span, rspan, text, bd, ha, va, sz, bold, font]) => {
      const style = [
        bd.includes('l') ? 'border-left:0.75pt solid #000' : '', bd.includes('r') ? 'border-right:0.75pt solid #000' : '',
        bd.includes('t') ? 'border-top:0.75pt solid #000' : '', bd.includes('b') ? 'border-bottom:0.75pt solid #000' : '',
        `text-align:${align[ha] || 'left'}`, `vertical-align:${va === 'm' ? 'middle' : 'bottom'}`,
        `font-size:${(sz * S).toFixed(2)}pt`, bold ? 'font-weight:700' : '', `font-family:${WR_FONTS[font]}`,
        text === '{scale}' ? 'white-space:nowrap' : '',
      ].filter(Boolean).join(';');
      return `<td${span > 1 ? ` colspan="${span}"` : ''}${rspan > 1 ? ` rowspan="${rspan}"` : ''} style="${style}">${esc(fill[text] !== undefined ? fill[text] : text)}</td>`;
    }).join('');
    return `<tr style="height:${((h || WR_DEFAULT_ROW_PT) * S).toFixed(2)}pt">${tds}</tr>`;
  }).join('');
  // 파란 도장: 원본 앵커(F열 왼쪽에서 33131EMU, 34행 위에서 231914EMU, 4cm 정사각형)
  const stampLeft = widths.slice(0, 5).reduce((t, w) => t + w, 0) + 33131 / 9525 * S;
  const stampTop = WR_ROWS.slice(0, 33).reduce((t, [h]) => t + (h || WR_DEFAULT_ROW_PT), 0) * S * 96 / 72 + 231914 / 9525 * S;
  const stampSize = 1440180 / 9525 * S;
  return `
  <div class="print-page vw-page">
    <div class="vw-sheet" style="width:${widths.reduce((t, w) => t + w, 0)}px">
      <table class="vw-table"><colgroup>${widths.map(w => `<col style="width:${w}px">`).join('')}</colgroup>${trs}</table>
      <img class="vw-stamp" src="img/vet-stamp-blue.png" alt="" style="left:${stampLeft.toFixed(1)}px;top:${stampTop.toFixed(1)}px;width:${stampSize.toFixed(1)}px;height:${stampSize.toFixed(1)}px">
    </div>
  </div>`;
}

async function printVetWorkReport() {
  const ym = document.getElementById('vetwork-month').value || vetDefaultYm();
  const etc = vetWorkEtcValues();
  // 직접 입력한 새 내용은 저장해 두고 다음에 선택지로 보여준다(저장이 실패해도 인쇄는 계속한다).
  const options = { ...(vetOfficeInfo().workEtcOptions || {}) };
  let changed = false;
  etc.forEach((t, i) => {
    if (t === '' || vetWorkEtcLists[i].includes(t)) return;
    options[i] = [...vetWorkEtcSaved(i), t];
    changed = true;
  });
  if (changed) {
    try { await saveVetWorkEtcOptions(options); renderVetWorkEtc(etc); }
    catch (e) { alert('직접 입력한 내용을 저장하지 못했습니다(인쇄는 계속합니다).\n' + e.message); }
  }
  document.getElementById('print-area').innerHTML = buildVetWorkReportHtml(ym, etc);
  setTimeout(() => window.print(), 200);
}

// ─── 여비청구서 / 활동수당 청구서 ───────────────────────────────────────────
function renderVetInvoiceSummary() {
  const monthEl = document.getElementById('vetinvoice-month');
  if (!monthEl.value) monthEl.value = vetDefaultYm();
  const o = vetOfficeInfo();
  const { count } = vetMonthStats(monthEl.value);
  const travelFee = count * (o.travelFeePerVisit || 20000);
  document.getElementById('vetinvoice-summary').textContent =
    `${vetMonthLabel(monthEl.value)} 방문 ${count}건 · 여비 ${travelFee.toLocaleString()}원 (건당 ${(o.travelFeePerVisit || 20000).toLocaleString()}원)` +
    (o.monthlyActivityAllowance ? ` · 활동수당 ${Number(o.monthlyActivityAllowance).toLocaleString()}원` : ' · 활동수당 금액이 사무실 정보에 없습니다') +
    (o.vetName && o.residentNo && o.bankAccount ? '' : ' · ⚠️ 성명·주민등록번호·계좌번호가 사무실 정보에 없습니다(상단 ⚙️ 사무실 정보에서 입력)');
}

function vetMonthEndLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}년 ${m}월 ${lastDay}일`;
}

// 첨부된 「청구서.xlsx」(시트 "청구서(여비)"·"청구서 (활동수당)")의 칸 배치를 그대로 옮긴 서식.
// 열 너비(엑셀 글자수 × 7px)와 줄 높이(pt)를 원본 그대로 두고, 도장 그림은 원본의 앵커
// (E열 왼쪽에서 441960EMU, 14행 위에서 45720EMU, 4cm 정사각형) 위치에 얹는다.
// 두 서식은 제목·건명·금액·월 문구만 다르다. 월만 고르면 방문 건수로 여비가 계산된다.
const VI_COL_CHARS = {
  travel: [8.6, 14.6, 8.6, 13.8, 9.4, 16.0, 8.8],
  activity: [8.6, 16.6, 8.6, 12.0, 9.8, 14.6, 7.8],
};
const VI_ROW_PT = [27, 18.75, 18.75, 14.25, 14.25, 55.5, 57.75, 82.5, 14.25, 14.25, 14.25, 14.25, 14.25, 20.25, 20.25, 20.25, 20.25, 14.25, 14.25, 14.25, 22.5];
const VI_EMU_PX = 1 / 9525;

function viResidentNo(rn) {
  const s = String(rn || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{6})-?(\d+)$/);
  return m ? `${m[1]}<br>-${m[2]}` : s;
}

function buildVetInvoiceHtml(kind, ym) {
  const o = vetOfficeInfo();
  const { count } = vetMonthStats(ym);
  const isTravel = kind === 'travel';
  const widths = VI_COL_CHARS[kind].map(c => Math.round(c * 7));
  const amount = isTravel ? count * (o.travelFeePerVisit || 20000) : (o.monthlyActivityAllowance || 0);
  const month = Number(ym.split('-')[1]);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
  const spaced = (o.vetName || '').split('').join('&nbsp;&nbsp;');

  const tr = (i, cells) => `<tr style="height:${VI_ROW_PT[i - 1]}pt">${cells}</tr>`;
  const blank = i => tr(i, '<td colspan="7"></td>');

  const rows = [
    tr(1, '<td colspan="7" class="vi-title">' + (isTravel ? '공수의 여비 청구서' : '공수의 활동수당 청구서') + '</td>'),
    blank(2), blank(3),
    tr(4, `<td class="vi-r">${month}월</td><td colspan="6">분 공수의 ${isTravel ? '여비를' : '활동수당을'} 아래와 같이 청구합니다.</td>`),
    blank(5),
    tr(6, '<td class="vi-b vi-c" rowspan="2">건명</td><td class="vi-b vi-c" colspan="3">청구인</td><td class="vi-b vi-c" rowspan="2">청구금액</td><td class="vi-b vi-c" rowspan="2">계좌번호</td><td class="vi-b vi-c" rowspan="2">비 고</td>'),
    tr(7, '<td class="vi-b vi-c">주 소</td><td class="vi-b vi-c">성 명</td><td class="vi-b vi-c">주민등록번호</td>'),
    tr(8, `<td class="vi-b vi-c">${isTravel ? '공수의<br>여비' : '공수의<br>활동<br>수당'}</td>` +
      `<td class="vi-b vi-c">${esc(o.address)}</td><td class="vi-b vi-c">${esc(o.vetName)}</td>` +
      `<td class="vi-b vi-c">${viResidentNo(o.residentNo)}</td><td class="vi-b vi-c">${amount.toLocaleString()}</td>` +
      `<td class="vi-b vi-c">${esc(o.bankName)}<br>${esc(o.bankAccount)}</td><td class="vi-b"></td>`),
    blank(9), blank(10), blank(11), blank(12), blank(13),
    tr(14, `<td colspan="2"></td><td colspan="4" class="vi-c vi-big">${vetMonthEndLabel(ym)}</td><td></td>`),
    blank(15),
    tr(16, `<td colspan="2"></td><td class="vi-big">청구인</td><td colspan="2" class="vi-c vi-big">${spaced}</td><td>(인)</td><td></td>`),
    blank(17), blank(18), blank(19), blank(20),
    tr(21, '<td colspan="2" class="vi-c vi-sign">파주시장</td><td colspan="5"></td>'),
  ].join('');

  const stampLeft = widths.slice(0, 4).reduce((s, w) => s + w, 0) + 441960 * VI_EMU_PX;
  const stampTop = VI_ROW_PT.slice(0, 13).reduce((s, h) => s + h, 0) * 96 / 72 + 45720 * VI_EMU_PX;
  const stampSize = 1440180 * VI_EMU_PX;
  return `
  <div class="print-page vi-page">
    <div class="vi-sheet" style="width:${widths.reduce((s, w) => s + w, 0)}px">
      <table class="vi-table"><colgroup>${widths.map(w => `<col style="width:${w}px">`).join('')}</colgroup>${rows}</table>
      <img class="vi-stamp" src="img/vet-stamp-blue.png" alt="" style="left:${stampLeft.toFixed(1)}px;top:${stampTop.toFixed(1)}px;width:${stampSize.toFixed(1)}px;height:${stampSize.toFixed(1)}px">
    </div>
  </div>`;
}

// kind: 'travel' | 'activity' | 'both'(두 장을 한 번에)
function printVetInvoice(kind) {
  const ym = document.getElementById('vetinvoice-month').value || vetDefaultYm();
  const kinds = kind === 'both' ? ['travel', 'activity'] : [kind];
  if (kinds.includes('travel') && !vetMonthStats(ym).count) {
    alert('선택한 달에 방문 기록이 없어 여비를 계산할 수 없습니다. 입력대장에서 방문 기록을 먼저 등록해주세요.');
    return;
  }
  document.getElementById('print-area').innerHTML = kinds.map(k => buildVetInvoiceHtml(k, ym)).join('');
  setTimeout(() => window.print(), 200);
}

// ─── 예찰내역 ───────────────────────────────────────────────────────────────
// 첨부 「예찰내역.xlsx」(시트 예찰내역1·예찰내역2)의 칸 배치를 그대로 옮긴 서식. 원본은 한 달을
// 1~15일(상반기)·16일~말일(하반기) 두 장으로 나눠 내므로 똑같이 나눈다. 한 장은 15줄 고정이고
// (남는 줄은 빈 칸으로 둔다), 한쪽에 15건이 넘으면 이어서 다음 장에 찍는다. 내용은 모두 일자별
// 근무내용에서 온다 — 번호는 쪽 안에서 1부터, 축주명은 축주(농장주), 비고는 방문일(MM/DD).
// 원본 인쇄는 "너비에 맞춤(약 77%)"이라 열 너비·줄 높이·글자 크기에 같은 배율(VP_SCALE)을 곱해 옮겼다.
const VP_COL_CHARS = [[6, 16, 28, 14, 10, 37.57, 10], [6, 16, 28, 14, 10, 32, 10]];
const VP_SCALE = 0.774;
const VP_PAGE_ROWS = 15;

function vetPatrolHalves(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const list = vetEntriesForYm(ym);
  const pad = n => String(n).padStart(2, '0');
  return [
    { label: '상반기', from: 1, to: 15, entries: list.filter(e => Number(e.visitDate.slice(8, 10)) <= 15) },
    { label: '하반기', from: 16, to: last, entries: list.filter(e => Number(e.visitDate.slice(8, 10)) >= 16) },
  ].map((h, idx) => ({ ...h, idx, start: `${y}-${pad(m)}-${pad(h.from)}`, end: `${y}-${pad(m)}-${pad(h.to)}`, days: h.to - h.from + 1 }));
}

function renderVetPatrolSummary() {
  const monthEl = document.getElementById('vetpatrol-month');
  if (!monthEl.value) monthEl.value = vetDefaultYm();
  const halves = vetPatrolHalves(monthEl.value);
  const pages = halves.reduce((s, h) => s + (h.entries.length ? Math.ceil(h.entries.length / VP_PAGE_ROWS) : 0), 0);
  document.getElementById('vetpatrol-summary').textContent =
    `${vetMonthLabel(monthEl.value)} — 상반기(1~15일) ${halves[0].entries.length}건 · 하반기(16일~) ${halves[1].entries.length}건 → 모두 ${pages}쪽으로 인쇄됩니다. 내용은 입력대장에서 가져옵니다.`;
}

function buildVetPatrolPageHtml(half, chunk, startNo) {
  const S = VP_SCALE;
  const widths = VP_COL_CHARS[half.idx].map(c => Math.round(c * 7 * S));
  const pt = v => (v * S).toFixed(2) + 'pt';
  const n = v => (v == null || v === '' ? '' : Number(v).toLocaleString());
  const scaleSum = chunk.reduce((t, e) => t + (Number(e.scale) || 0), 0);
  const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const dataRows = Array.from({ length: VP_PAGE_ROWS }, (_, i) => {
    const e = chunk[i];
    return `<tr style="height:${pt(40.15)}">` + (e
      ? `<td class="vp-b vp-c">${startNo + i}</td><td class="vp-b vp-c">${esc(e.owner)}</td><td class="vp-b vp-l">${esc(e.address)}</td>` +
        `<td class="vp-b vp-c">${esc(e.species)}</td><td class="vp-b vp-r">${n(e.scale)}</td><td class="vp-b vp-l">${esc(e.content)}</td>` +
        `<td class="vp-b vp-c">${(e.visitDate || '').slice(5).replace('-', '/')}</td>`
      : '<td class="vp-b"></td>'.repeat(7)) + '</tr>';
  }).join('');
  const rows = [
    `<tr style="height:${pt(7.5)}"><td colspan="7"></td></tr>`,
    `<tr style="height:${pt(30)}"><td colspan="7" class="vp-title">동물질병 예찰내역</td></tr>`,
    `<tr style="height:${pt(16.5)}"><td colspan="5"></td><td colspan="2" class="vp-r vp-sm">(공수의→시군)</td></tr>`,
    `<tr style="height:${pt(26.45)}"><td colspan="2" class="vp-bold">1. 예찰일자 :</td><td class="vp-r vp-bold">${half.start}</td><td class="vp-l">부터</td><td colspan="2" class="vp-bold">${half.end}</td><td class="vp-r vp-nw">(${half.days}일간)</td></tr>`,
    `<tr style="height:${pt(24.6)}"><td colspan="7" class="vp-bold">2. 예찰내역</td></tr>`,
    `<tr style="height:${pt(40.15)}"><td class="vp-b vp-c vp-bold">번<br>호</td><td class="vp-b vp-c vp-bold">축주명<br>(농장명)</td><td class="vp-b vp-c vp-bold">주&nbsp;&nbsp;&nbsp;소</td><td class="vp-b vp-c vp-bold">축 종<br>(품 종)</td><td class="vp-b vp-c vp-bold">사육<br>두수</td><td class="vp-b vp-c vp-bold">예 찰 결 과</td><td class="vp-b vp-c vp-bold">비 고</td></tr>`,
    dataRows,
    `<tr style="height:${pt(40.15)}"><td class="vp-b vp-c">계</td><td colspan="3" class="vp-b vp-c">${chunk.length}</td><td class="vp-b vp-r">${scaleSum.toLocaleString()}</td><td colspan="2" class="vp-b vp-l">수</td></tr>`,
    `<tr style="height:${pt(15.75)}"><td colspan="7" class="vp-sm">※ 예찰결과에는 폐사두수, 임상증상 등 질병발생상황을 기록</td></tr>`,
  ].join('');
  return `
  <div class="print-page vp-page">
    <div class="vp-sheet" style="width:${widths.reduce((t, w) => t + w, 0)}px;font-size:${(12 * S).toFixed(2)}pt">
      <table class="vp-table"><colgroup>${widths.map(w => `<col style="width:${w}px">`).join('')}</colgroup>${rows}</table>
    </div>
  </div>`;
}

function printVetPatrol() {
  const ym = document.getElementById('vetpatrol-month').value || vetDefaultYm();
  const pages = [];
  vetPatrolHalves(ym).forEach(h => {
    for (let i = 0; i < h.entries.length; i += VP_PAGE_ROWS) {
      pages.push(buildVetPatrolPageHtml(h, h.entries.slice(i, i + VP_PAGE_ROWS), i + 1));
    }
  });
  if (!pages.length) { alert('선택한 달에 방문 기록이 없습니다.'); return; }
  document.getElementById('print-area').innerHTML = pages.join('');
  setTimeout(() => window.print(), 200);
}

// ─── 예찰일지 (방문 건마다 한 쪽 — 체크박스로 여러 건 골라 한 번에 인쇄) ─────
let vetDiarySelectedIds = new Set();

function toggleVetDiarySelectAll(checked) {
  const ids = vetEntriesForYm(document.getElementById('vetdiary-month').value).map(e => e.id);
  vetDiarySelectedIds = checked ? new Set(ids) : new Set();
  renderVetDiaryList();
}
function toggleVetDiarySelect(id, checked) {
  if (checked) vetDiarySelectedIds.add(id); else vetDiarySelectedIds.delete(id);
  renderVetDiaryList();
}

function renderVetDiaryList() {
  const monthEl = document.getElementById('vetdiary-month');
  if (!monthEl.value) monthEl.value = vetDefaultYm();
  const list = vetEntriesForYm(monthEl.value);
  const liveIds = new Set(list.map(e => e.id));
  vetDiarySelectedIds.forEach(id => { if (!liveIds.has(id)) vetDiarySelectedIds.delete(id); });

  const printBtn = document.getElementById('vetdiary-print-btn');
  if (printBtn) printBtn.disabled = vetDiarySelectedIds.size === 0;

  const tbody = document.getElementById('vetdiary-tbody');
  const empty = document.getElementById('vetdiary-empty');
  const checkAll = document.getElementById('vetdiary-check-all');
  if (!list.length) {
    tbody.innerHTML = ''; empty.style.display = '';
    if (checkAll) checkAll.checked = false;
    return;
  }
  empty.style.display = 'none';
  if (checkAll) checkAll.checked = list.every(e => vetDiarySelectedIds.has(e.id));
  tbody.innerHTML = list.map(e => `
    <tr>
      <td style="text-align:center"><input type="checkbox" ${vetDiarySelectedIds.has(e.id) ? 'checked' : ''} onchange="toggleVetDiarySelect('${e.id}', this.checked)"></td>
      <td>${e.visitDate}</td>
      <td><strong>${e.farmName || '(삭제된 농장)'}</strong><div style="font-size:11px;color:var(--text-secondary)">${e.owner || ''}</div></td>
      <td>${e.content || '-'}</td>
    </tr>`).join('');
}

// ─── 예찰일지 (방문 건마다 한 쪽 — 체크박스로 여러 건 골라 한 번에 인쇄) ─────
// 첨부 「예찰일지.xlsx」의 한 쪽(1~26행)을 칸 단위로 그대로 옮긴 서식이다. 건마다 바뀌는 곳은
// 예찰일자와 농장 기본 정보(농장명·대표자·주소·사육축종·사육두수)와 예찰의견(그날 예찰내용)뿐이고
// 나머지 문구는 모두 고정이다. 원본 인쇄는 95%·여백 0.5인치라 열 너비·줄 높이·글자 크기에 VD_SCALE을 곱했다.
// 백신접종(닭) 칸은 사육축종에 따라 해당 항목의 글자를 파랑으로 보인다:
//   육계·토종닭·오골계 → ① ② ⑤ / 산란계 → ① ③ ④ ⑤
const VD_COL_CHARS = [14, 11, 10.71, 14, 15.29, 14, 10.29];
const VD_SCALE = 0.95;
const VD_TEXT_COLOR = '#0f243e';
const VD_BLUE = '#0000ff';
const VD_BLUE_ITEMS = [{ test: /육계|토종|오골/, items: [1, 2, 5] }, { test: /산란/, items: [1, 3, 4, 5] }];
// [높이pt, [[열 수, 글, 테두리(lrtb), 가로(c/l/r), 세로(m/b), 글자크기, 굵게, 명조]...]]
// (5행~16행의 {…}는 건마다 채워 넣는 자리)
const VD_ROWS = [
  [6.0,[[7,"","","","b",11.0,0,0]]],
  [15.95,[[7,"공수의사 현장 예찰 일지(산업동물)","","c","m",18.0,1,0]]],
  [13.15,[[7,"(공수의 → 시군)  ※공수의 근무상황 보고와 같이 제출","","c","m",9.0,0,0]]],
  [13.15,[[1,"","","c","m",9.0,0,0],[1,"","","c","m",9.0,0,0],[1,"","","c","m",9.0,0,0],[1,"","","c","m",9.0,0,0],[1,"","","c","m",9.0,0,0],[1,"","","c","m",9.0,0,0],[1,"","","c","m",9.0,0,0]]],
  [13.15,[[3,"▣ 농장 기본 정보","","","m",11.0,1,0],[2,"예찰일자","","c","m",11.0,1,0],[2,"{date}","","c","m",11.0,1,0]]],
  [30.0,[[1,"농장명","lrtb","c","m",11.0,1,0],[2,"{farm}","lrtb","c","m",11.0,1,0],[1,"대표자","lrtb","c","m",11.0,1,0],[3,"{owner}","lrtb","c","m",11.0,1,0]]],
  [30.0,[[1,"농장주소","lrtb","c","m",11.0,1,0],[6,"{address}","lrtb","l","m",11.0,1,0]]],
  [30.0,[[1,"사육축종","lrtb","c","m",11.0,1,0],[2,"{species}","lrtb","c","m",11.0,1,0],[1,"사육두수","lrtb","c","m",11.0,1,0],[2,"{scale}","lrtb","r","m",11.0,1,0],[1,"수","lrtb","c","m",11.0,0,0]]],
  [28.9,[[7,"▣ 농장 방문 목적 ( V 표시)","l","l","b",11.0,1,0]]],
  [19.9,[[1,"예찰","lrtb","c","m",11.0,1,0],[1,"V","lrtb","c","m",11.0,1,0],[1,"채혈","lrtb","c","m",11.0,1,0],[1,"","lrtb","c","m",11.0,0,0],[1,"접종","lrtb","c","m",11.0,1,0],[1,"","lrtb","c","m",11.0,0,0],[1,"기타","lrtb","c","m",11.0,1,0]]],
  [30.6,[[7,"▣ 현장 예찰 사항 (임상증상)","l","l","b",11.0,1,0]]],
  [30.0,[[1,"임상증상","lrtb","c","m",11.0,1,0],[6,"①호흡기  ②소화기  ③신경계  ④폐사  ⑤유산  ⑥기타(           )  ⑦이상무","lrtb","l","m",11.0,0,0]]],
  [55.9,[[1,"백신접종(소)","lrtb","c","m",11.0,1,0],[6,"①구제역(상반기·하반기, 접종: 자가 · 수의사) ②탄저·기종저 \n③아까바네 ④IBR ⑤BVD ⑥설사병(로타, 코로나 등) ⑦유방염 \n⑧부제병 ⑨버짐병 ⑩광견병 ⑪보툴리즘 ⑫기타(            )","lrtb","l","m",11.0,0,1]]],
  [41.45,[[1,"백신접종\n(돼지)","lrtb","c","m",11.0,1,0],[6,"①구제역(비육: 일령, 일령, 모돈 회/년) ②돼지열병·단독혼합 ③일본뇌염 \n④PED ⑤돼지써코 ⑥ PRRS ⑦ 기타(               )","lrt","l","m",11.0,0,1]]],
  [37.15,[[1,"백신접종\n(닭)","ltb","c","m",11.0,1,0],[1,"①뉴캐슬","ltb","","m",11.0,0,0],[1,"②감보로 ","tb","","m",11.0,0,0],[1," ③저병원성AI  ","tb","","m",11.0,0,0],[1,"④뉴모바이러스 ","tb","","m",11.0,0,0],[2," ⑤기타(전염성기관지염)","rtb","c","m",11.0,0,0]]],
  [30.0,[[1,"예찰의견","lrtb","c","m",11.0,1,0],[6,"{content}","lrb","l","m",11.0,1,0]]],
  [30.0,[[7,"▣ 농장 기본 방역","l","l","m",11.0,1,0]]],
  [30.0,[[7,"기본 방역 사항","lrt","l","m",11.0,1,0]]],
  [30.0,[[7,"① 농장출입구 소독·방역시설 설치 및 운영여부","lrt","l","m",11.0,0,0]]],
  [30.0,[[7,"   - 소독시설 형태 : U자형     - 소독시설 작동여부 : 작동     - 미작동 시 지도·조치 : 유","lrb","l","m",11.0,0,0]]],
  [30.0,[[7,"② 외부인 출입통제 및 소독 실시여부 (사용 소독약 : 노프러블럼)","lr","l","m",11.0,0,0]]],
  [30.0,[[7,"   - 외부인 출입통제 안내 : 여     - 발판소독조 설치 여부 : 여","lr","l","m",11.0,0,0]]],
  [30.0,[[7,"   - 농장 출입기록부 및 소독기록부 비치·기록 여부 : 여","lr","l","m",11.0,0,0]]],
  [30.0,[[7,"   - 농장에 사람·가축·차량출입 전·후 소독실시여부 : 여","lrb","l","m",11.0,0,0]]],
  [6.0,[[1,"","","","b",11.0,0,0],[1,"","","","b",11.0,0,0],[1,"","","","b",11.0,0,0],[1,"","","","b",11.0,0,0],[1,"","","","b",11.0,0,0],[1,"","","","b",11.0,0,0],[1,"","","","b",11.0,0,0]]],
  [15.95,[[7,"▣ 제출자                         대한동물병원          최동명          (서명)","","l","m",14.0,1,0]]]
];

function vetDiaryBlueItems(species) {
  const hit = VD_BLUE_ITEMS.find(x => x.test.test(species || ''));
  return hit ? hit.items : [];
}

function buildVetDiaryHtml(e) {
  const S = VD_SCALE;
  const widths = VD_COL_CHARS.map(c => Math.round(c * 7 * S));
  const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const fill = {
    '{date}': (e.visitDate || '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1년 $2월 $3일'),
    '{farm}': e.farmName || '', '{owner}': e.owner || '', '{address}': e.address || '', '{species}': e.species || '',
    '{scale}': e.scale != null ? Number(e.scale).toLocaleString() : '', '{content}': e.content || '',
  };
  const blue = vetDiaryBlueItems(e.species);
  const align = { c: 'center', l: 'left', r: 'right' };
  let col = 0;
  const trs = VD_ROWS.map(([h, cells], ri) => {
    col = 0;
    const tds = cells.map(([span, text, bd, ha, va, sz, bold, serif]) => {
      const startCol = col; col += span;
      const isVaccine = ri === 14 && startCol >= 1;               // 15행: 백신접종(닭) 항목 ①~⑤
      const itemNo = isVaccine ? startCol : 0;                    // B=1(①) C=2 D=3 E=4 F=5(⑤)
      const style = [
        bd.includes('l') ? 'border-left:0.75pt solid #000' : '', bd.includes('r') ? 'border-right:0.75pt solid #000' : '',
        bd.includes('t') ? 'border-top:0.75pt solid #000' : '', bd.includes('b') ? 'border-bottom:0.75pt solid #000' : '',
        `text-align:${align[ha] || 'left'}`, `vertical-align:${va === 'm' ? 'middle' : 'bottom'}`,
        `font-size:${(sz * S).toFixed(2)}pt`, bold ? 'font-weight:700' : '',
        serif ? 'font-family:"HYMyeongJo","휴먼명조","Batang","바탕",serif' : '',
        itemNo && blue.includes(itemNo) ? `color:${VD_BLUE}` : '',
        ri === 14 ? 'white-space:pre;overflow:visible' : '',
      ].filter(Boolean).join(';');
      const body = fill[text] !== undefined ? esc(fill[text]) : esc(text);
      return `<td${span > 1 ? ` colspan="${span}"` : ''} style="${style}">${body}</td>`;
    }).join('');
    return `<tr style="height:${(h * S).toFixed(2)}pt">${tds}</tr>`;
  }).join('');
  return `
  <div class="print-page vd-page">
    <div class="vd-sheet" style="width:${widths.reduce((t, w) => t + w, 0)}px;color:${VD_TEXT_COLOR}">
      <table class="vd-table"><colgroup>${widths.map(w => `<col style="width:${w}px">`).join('')}</colgroup>${trs}</table>
    </div>
  </div>`;
}

function printSelectedVetDiary() {
  const list = load('vetReportEntries').filter(e => vetDiarySelectedIds.has(e.id));
  if (!list.length) { alert('인쇄할 방문 기록을 먼저 체크해주세요.'); return; }
  document.getElementById('print-area').innerHTML = list.map(buildVetDiaryHtml).join('');
  setTimeout(() => window.print(), 200);
}

// ─── 출장일지 ───────────────────────────────────────────────────────────────
// 첨부 「출장일지.xlsx」의 칸 배치를 그대로 옮긴 서식. 월만 고르면 제출일자(월말)·기간·건수·합계가 바뀌고
// 농가별 출장내역은 그달 입력대장에서 온다. 원본 표는 30줄(30일) 고정이라 남는 줄은 빈 칸으로 두고,
// 31건 이상이면 줄을 늘린다. 원본 인쇄는 "한 쪽에 맞춤(약 81%, 31줄까지 한 쪽에 들어가도록 77%)"이라 열 너비·줄 높이·글자 크기에 VT_SCALE을
// 곱했다. 파란 도장은 원본 앵커(G열 왼쪽에서 1455420EMU, 맨 위, 4cm 정사각형) 위치에 얹는다.
// 원본의 "품종" 칸은 축종을 다시 보여주는 값이라(원본 수식이 축종을 가져옴) 그대로 축종을 찍는다.
const VT_COL_CHARS = [6, 10.29, 30.86, 8.29, 8, 8.57, 31.71, 9.43];
const VT_SCALE = 0.77;
const VT_MIN_ROWS = 30;

function renderVetTripSummary() {
  const monthEl = document.getElementById('vettrip-month');
  if (!monthEl.value) monthEl.value = vetDefaultYm();
  const { count, scaleSum } = vetMonthStats(monthEl.value);
  document.getElementById('vettrip-summary').textContent =
    `${vetMonthLabel(monthEl.value)} 출장 ${count}일 · 총 두수 ${scaleSum.toLocaleString()} — 내용은 입력대장에서 가져옵니다.`;
}

function buildVetTripHtml(ym) {
  const S = VT_SCALE;
  const o = vetOfficeInfo();
  const { list, count, scaleSum } = vetMonthStats(ym);
  const [y, m] = ym.split('-').map(Number);
  const pad = n => String(n).padStart(2, '0');
  const last = new Date(y, m, 0).getDate();
  const monthStart = `${y}-${pad(m)}-01`, monthEnd = `${y}-${pad(m)}-${pad(last)}`;
  const widths = VT_COL_CHARS.map(c => Math.round(c * 7 * S));
  const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const num = v => (v == null || v === '' ? '' : Number(v).toLocaleString());
  const clinic = o.clinicName || '대한동물병원', vet = o.vetName || '최동명', license = o.licenseNo || '8433';
  // 셀: [열 수, 행 수, 글, 테두리(lrtb), 가로, 글자크기, 굵게, 세로]
  const td = (span, rowspan, text, bd = '', ha = '', sz = 11, bold = 0, va = 'm', raw = false) => {
    const style = [
      bd.includes('l') ? 'border-left:0.75pt solid #000' : '', bd.includes('r') ? 'border-right:0.75pt solid #000' : '',
      bd.includes('t') ? 'border-top:0.75pt solid #000' : '', bd.includes('b') ? 'border-bottom:0.75pt solid #000' : '',
      ha ? `text-align:${{ c: 'center', l: 'left', r: 'right' }[ha]}` : '', `vertical-align:${va === 'm' ? 'middle' : 'bottom'}`,
      `font-size:${(sz * S).toFixed(2)}pt`, bold ? 'font-weight:700' : '',
    ].filter(Boolean).join(';');
    return `<td${span > 1 ? ` colspan="${span}"` : ''}${rowspan > 1 ? ` rowspan="${rowspan}"` : ''} style="${style}">${raw ? text : esc(text)}</td>`;
  };
  const tr = (h, cells) => `<tr style="height:${(h * S).toFixed(2)}pt">${cells}</tr>`;
  const B = 'lrtb';

  const dataRows = Array.from({ length: Math.max(VT_MIN_ROWS, list.length) }, (_, i) => {
    const e = list[i];
    return tr(22.15, e
      ? td(1, 1, i + 1, B, 'c') + td(1, 1, e.owner, B, 'c') + td(1, 1, e.address, B, 'l') + td(1, 1, e.species, B, 'c') +
        td(1, 1, e.species, B, 'c') + td(1, 1, `${Number(e.visitDate.slice(5, 7))}/${Number(e.visitDate.slice(8, 10))}`, B, 'c') +
        td(1, 1, e.content, B, 'l') + td(1, 1, num(e.scale), B, 'r')
      : td(1, 1, '', B) .repeat(8));
  }).join('');

  const rows = [
    tr(7.5, td(8, 1, '')),
    tr(31.5, td(8, 1, '공수의 여비 지원사업 근무보고  (공수의→시군)', '', 'c', 20, 1)),
    tr(15.75, td(5, 1, '') + td(1, 1, '발   신 :', '', '') + td(1, 1, `${clinic} ${vet} `, '', '') + td(1, 1, '(인)', '', '')),
    tr(19.5, td(5, 1, '') + td(1, 1, '제출일자 :', '', '', 11, 0, 'b') + td(2, 1, monthEnd.replace(/-/g, '/'), '', 'l', 12, 0, 'b')),
    tr(19.5, td(8, 1, '1. 근무상황', '', '', 11, 0, 'b')),
    tr(19.5, td(3, 1, '공수의', B, 'c') + td(1, 2, '담당지역', B, 'c') + td(2, 1, '검진,살처분,출장내역', B, 'c', 9) + td(2, 2, '비고(예찰수수)', B, 'c')),
    tr(19.5, td(2, 1, '동물병원', B, 'c') + td(1, 1, '성명/면허번호', B, 'c') + td(1, 1, '출장일수', B, 'c', 10) + td(1, 1, '농가수', B, 'c')),
    tr(19.5, td(2, 1, clinic, B, 'c') + td(1, 1, `${vet}/${license}`, B, 'c') + td(1, 1, '파주전역', B, 'c') + td(1, 1, `${count}일`, B, 'c') + td(1, 1, count, B, 'c') + td(2, 1, num(scaleSum), B, 'c')),
    tr(19.5, td(8, 1, '2. 농가별 출장내역', '', '', 11, 0, 'b')),
    tr(19.5, td(1, 1, '기간', B, 'c', 11, 1) + td(3, 1, `${monthStart} ~ ${monthEnd}`, B, 'c', 11, 1) + td(1, 1, '출장일수', B, 'c', 11, 1) + td(3, 1, count, B, 'c', 11, 1)),
    tr(19.5, td(1, 1, '농가수', B, 'c', 11, 1) + td(3, 1, `${count} 건`, B, 'c', 11, 1) + td(1, 1, '총 두수', B, 'c', 11, 1) + td(3, 1, num(scaleSum), B, 'c', 11, 1)),
    tr(19.5, td(8, 1, '농가검진, 살처분 출장내역', B, 'c')),
    tr(22.15, ['번호', '축주명', '지역(주소)', '축종', '품종', '출장일', '근무내용', '검진두수'].map(t => td(1, 1, t, B, 'c')).join('')),
    dataRows,
    tr(22.15, td(5, 1, '합    계', B, 'c') + td(1, 1, `${count}일`, B, 'c') + td(1, 1, '', B, 'c') + td(1, 1, num(scaleSum), B, 'r', 10)),
    tr(7.5, td(8, 1, '')),
  ].join('');

  const stampLeft = widths.slice(0, 6).reduce((t, w) => t + w, 0) + 1455420 / 9525 * S;
  const stampSize = 1440180 / 9525 * S;
  return `
  <div class="print-page vt-page">
    <div class="vt-sheet" style="width:${widths.reduce((t, w) => t + w, 0)}px">
      <table class="vt-table"><colgroup>${widths.map(w => `<col style="width:${w}px">`).join('')}</colgroup>${rows}</table>
      <img class="vt-stamp" src="img/vet-stamp-blue.png" alt="" style="left:${stampLeft.toFixed(1)}px;top:0;width:${stampSize.toFixed(1)}px;height:${stampSize.toFixed(1)}px">
    </div>
  </div>`;
}

function printVetTrip() {
  const ym = document.getElementById('vettrip-month').value || vetDefaultYm();
  if (!vetMonthStats(ym).count) { alert('선택한 달에 방문 기록이 없습니다.'); return; }
  document.getElementById('print-area').innerHTML = buildVetTripHtml(ym);
  setTimeout(() => window.print(), 200);
}

// ─── 일자별 근무내용 (방문일마다 한 장 + 관련자료 사진) ────────────────────────
// 첨부 「일자별근무.xlsx」의 한 쪽을 옮긴 서식: 상단 박스(방문일·농장주·주소·축종·규모·내용)는 입력대장에서
// 오고, [관련자료]에는 그날 올려 둔 사진이 올린 순서대로 들어간다. 사진은 진료기록 부검사진과 같은 비공개
// 버킷(necropsy-photos)의 vet-daily/<기록id>/ 아래에 올리고 경로 순서를 vet_report_entries.photos에 둔다.
// (원본 엑셀의 "검사증명서(가금류 이동 승인서)" 칸은 이동승인서 발급 메뉴와 겹치고 외부 파일 링크가 깨져 있어
// 옮기지 않았다.)
const VY_BUCKET = 'necropsy-photos';
const VY_FIRST_PAGE_PHOTOS = 4;
const VY_NEXT_PAGE_PHOTOS = 6;
const VY_COL_CHARS = [6.71, 6.43, 6.43, 6.43, 6.43, 6.43, 6.43, 6.43, 6.43, 6.43, 6.43];
let vetDailySelectedIds = new Set();
let vetPhotoEntryId = null;
let vetPhotoUrlCache = {};     // 저장소 경로 → 임시 보기 주소

function toggleVetDailySelectAll(checked) {
  const ids = vetEntriesForYm(document.getElementById('vetdaily-month').value).map(e => e.id);
  vetDailySelectedIds = checked ? new Set(ids) : new Set();
  renderVetDaily();
}
function toggleVetDailySelect(id, checked) {
  if (checked) vetDailySelectedIds.add(id); else vetDailySelectedIds.delete(id);
  renderVetDaily();
}

function renderVetDaily() {
  const monthEl = document.getElementById('vetdaily-month');
  if (!monthEl.value) monthEl.value = vetDefaultYm();
  const list = vetEntriesForYm(monthEl.value);
  const liveIds = new Set(list.map(e => e.id));
  vetDailySelectedIds.forEach(id => { if (!liveIds.has(id)) vetDailySelectedIds.delete(id); });
  document.getElementById('vetdaily-print-btn').disabled = vetDailySelectedIds.size === 0;
  const tbody = document.getElementById('vetdaily-tbody');
  const empty = document.getElementById('vetdaily-empty');
  const checkAll = document.getElementById('vetdaily-check-all');
  if (!list.length) { tbody.innerHTML = ''; empty.style.display = ''; if (checkAll) checkAll.checked = false; return; }
  empty.style.display = 'none';
  if (checkAll) checkAll.checked = list.every(e => vetDailySelectedIds.has(e.id));
  tbody.innerHTML = list.map(e => `
    <tr>
      <td style="text-align:center"><input type="checkbox" ${vetDailySelectedIds.has(e.id) ? 'checked' : ''} onchange="toggleVetDailySelect('${e.id}', this.checked)"></td>
      <td>${e.visitDate}</td>
      <td><strong>${e.owner || '-'}</strong><div style="font-size:11px;color:var(--text-secondary)">${e.farmName || ''}</div></td>
      <td>${e.content || '-'}</td>
      <td>${(e.photos || []).length ? `📷 ${(e.photos || []).length}장` : '<span class="text-muted">없음</span>'}</td>
      <td><div class="flex-gap">
        <button class="btn btn-outline btn-sm" onclick="openVetPhotoModal('${e.id}')">📷 사진</button>
        <button class="btn btn-primary btn-sm" onclick="printVetDaily(['${e.id}'])">🖨️ 인쇄</button>
      </div></td>
    </tr>`).join('');
}

// ── 사진 올리기 ──
// 휴대폰 사진은 한 장이 수 MB라 그대로 올리면 느리고 인쇄가 무거워진다. 긴 변 1600px·JPEG로 줄여 올린다
// (EXIF 방향은 createImageBitmap이 반영). 줄이지 못하는 형식이면 원본 그대로 올린다.
async function vetResizeImage(file, maxDim = 1600) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
    return blob || file;
  } catch (e) { return file; }
}

async function vetPhotoUrls(paths) {
  const need = paths.filter(p => !vetPhotoUrlCache[p]);
  if (need.length) {
    try {
      const { data, error } = await sb.storage.from(VY_BUCKET).createSignedUrls(need, 3600);
      if (!error && data) data.forEach(d => { if (d.signedUrl && d.path) vetPhotoUrlCache[d.path] = d.signedUrl; });
    } catch (e) { /* 못 불러온 사진은 칸이 비어 보인다 */ }
  }
  return Object.fromEntries(paths.map(p => [p, vetPhotoUrlCache[p] || null]));
}

function vetPhotoEntry() { return load('vetReportEntries').find(e => e.id === vetPhotoEntryId); }

async function openVetPhotoModal(id) {
  vetPhotoEntryId = id;
  const e = vetPhotoEntry();
  if (!e) return;
  document.getElementById('vetphoto-title').textContent = `관련자료 사진 — ${e.visitDate} ${e.owner || ''}`;
  document.getElementById('vetphoto-status').textContent = '';
  openModal('modal-vet-photos');
  await renderVetPhotoGrid();
}

async function renderVetPhotoGrid() {
  const e = vetPhotoEntry();
  const grid = document.getElementById('vetphoto-grid');
  if (!e) return;
  const photos = e.photos || [];
  if (!photos.length) { grid.innerHTML = '<div class="text-muted">아직 올린 사진이 없습니다. "사진 추가"로 올려주세요.</div>'; return; }
  const urls = await vetPhotoUrls(photos);
  const btn = 'style="border:none;background:rgba(0,0,0,.55);color:#fff;border-radius:4px;padding:2px 7px;cursor:pointer;font-size:12px"';
  grid.innerHTML = photos.map((p, i) => `
    <div style="width:160px">
      <div style="position:relative;width:160px;height:120px;background:#f1f3f5;border-radius:6px;overflow:hidden">
        ${urls[p] ? `<img src="${urls[p]}" style="width:100%;height:100%;object-fit:cover">` : '<div class="text-muted" style="padding:44px 0;text-align:center;font-size:12px">불러오는 중...</div>'}
        <span style="position:absolute;top:4px;left:4px;background:#1a2744;color:#fff;border-radius:10px;padding:1px 8px;font-size:12px;font-weight:700">${i + 1}</span>
      </div>
      <div class="flex-gap" style="justify-content:center;margin-top:5px">
        <button type="button" ${btn} onclick="moveVetPhoto(${i}, -1)" ${i === 0 ? 'disabled' : ''}>◀</button>
        <button type="button" ${btn} onclick="moveVetPhoto(${i}, 1)" ${i === photos.length - 1 ? 'disabled' : ''}>▶</button>
        <button type="button" ${btn} onclick="removeVetPhoto(${i})">✕</button>
      </div>
    </div>`).join('');
}

async function saveVetPhotos(list) {
  const e = vetPhotoEntry();
  await updateRow('vetReportEntries', e.id, { ...e, photos: list });
  await renderVetPhotoGrid();
  renderVetDaily();
}

async function onVetPhotoFiles(input) {
  const files = [...input.files];
  input.value = '';
  const e = vetPhotoEntry();
  if (!files.length || !e) return;
  const status = document.getElementById('vetphoto-status');
  const uploaded = [];
  let failed = 0;
  for (let i = 0; i < files.length; i++) {   // 고른 순서대로 차례로 올려서 순서가 유지된다
    status.textContent = `올리는 중 ${i + 1}/${files.length}...`;
    try {
      const blob = await vetResizeImage(files[i]);
      const base = sanitizeFileNameForStorage(files[i].name).replace(/\.[^.]*$/, '');
      const path = `vet-daily/${e.id}/${Date.now()}_${i}_${base}.jpg`;
      const { error } = await sb.storage.from(VY_BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg' });
      if (error) throw error;
      uploaded.push(path);
    } catch (err) { failed++; console.warn('관련자료 사진 업로드 실패', err); }
  }
  if (uploaded.length) {
    try { await saveVetPhotos([...(vetPhotoEntry().photos || []), ...uploaded]); }
    catch (err) { alert('사진은 올렸지만 목록 저장에 실패했습니다: ' + err.message); }
  }
  status.textContent = failed ? `${uploaded.length}장 올림, ${failed}장 실패` : `${uploaded.length}장 올렸습니다.`;
}

async function moveVetPhoto(i, dir) {
  const list = [...(vetPhotoEntry().photos || [])];
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  try { await saveVetPhotos(list); } catch (e) { alert('순서 저장 실패: ' + e.message); }
}

async function removeVetPhoto(i) {
  const list = [...(vetPhotoEntry().photos || [])];
  if (!confirm(`${i + 1}번 사진을 지울까요?`)) return;
  const [gone] = list.splice(i, 1);
  try { await saveVetPhotos(list); } catch (e) { alert('삭제 실패: ' + e.message); return; }
  try { await sb.storage.from(VY_BUCKET).remove([gone]); } catch (e) { /* 파일이 남아도 목록에서는 빠졌다 */ }
}

// ── 인쇄 ──
function buildVetDailyHtml(e, urls) {
  const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const widths = VY_COL_CHARS.map(c => Math.round(c * 7));
  const photos = (e.photos || []).map(p => urls[p]).filter(Boolean);
  const chunks = [photos.slice(0, VY_FIRST_PAGE_PHOTOS)];
  for (let i = VY_FIRST_PAGE_PHOTOS; i < photos.length; i += VY_NEXT_PAGE_PHOTOS) chunks.push(photos.slice(i, i + VY_NEXT_PAGE_PHOTOS));
  const rowsDef = [['방문일 :', e.visitDate || ''], ['농장주 :', e.owner || ''], ['주   소 :', e.address || ''],
    ['축   종 :', e.species || ''], ['규   모 :', e.scale != null ? Number(e.scale).toLocaleString() : ''], ['내   용 :', e.content || '']];
  const box = `<table class="vy-box"><colgroup>${widths.map(w => `<col style="width:${w}px">`).join('')}</colgroup>` +
    rowsDef.map(([l, v]) => `<tr><td colspan="2" class="lbl">${esc(l)}</td><td colspan="9" class="val">${esc(v)}</td></tr>`).join('') + '</table>';
  const grid = (list, first) => {
    const n = list.length;
    const cols = n <= 1 || (first && n === 2) ? 1 : 2;
    const rows = first ? (n <= 1 ? 1 : n === 2 ? 2 : 2) : 3;
    const height = first ? '185mm' : '235mm';
    return `<div class="vy-grid" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);height:${height}">` +
      list.map(u => `<div class="vy-cell"><img src="${u}" alt=""></div>`).join('') + '</div>';
  };
  return chunks.map((list, i) => `
  <div class="print-page vy-page">
    <div class="vy-sheet">
      ${i === 0 ? box : ''}
      <div class="vy-head">[관련자료]${i > 0 ? ' (계속)' : ''}</div>
      ${list.length || i === 0 ? grid(list, i === 0) : ''}
    </div>
  </div>`).join('');
}

async function printVetDaily(ids) {
  const entries = load('vetReportEntries').filter(e => ids.includes(e.id)).sort((a, b) => a.visitDate.localeCompare(b.visitDate));
  if (!entries.length) { alert('인쇄할 방문 기록이 없습니다.'); return; }
  const urls = await vetPhotoUrls(entries.flatMap(e => e.photos || []));
  document.getElementById('print-area').innerHTML = entries.map(e => buildVetDailyHtml(e, urls)).join('');
  // 사진이 다 불려온 뒤에 인쇄 창을 연다(안 그러면 빈 칸으로 인쇄된다).
  const imgs = [...document.querySelectorAll('#print-area img')];
  await Promise.race([
    Promise.all(imgs.map(img => (img.complete ? null : new Promise(res => { img.onload = img.onerror = res; })))),
    new Promise(res => setTimeout(res, 20000)),
  ]);
  setTimeout(() => window.print(), 200);
}

function printSelectedVetDaily() {
  if (!vetDailySelectedIds.size) { alert('인쇄할 방문일을 먼저 체크해주세요.'); return; }
  return printVetDaily([...vetDailySelectedIds]);
}

function printAllVetDaily() {
  const list = vetEntriesForYm(document.getElementById('vetdaily-month').value || vetDefaultYm());
  if (!list.length) { alert('선택한 달에 방문 기록이 없습니다.'); return; }
  return printVetDaily(list.map(e => e.id));
}
