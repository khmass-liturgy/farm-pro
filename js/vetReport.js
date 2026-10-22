// ─── 공수의 보고서 ───────────────────────────────────────────────────────────
// 원본: 매달 만들던 "OOOO_공수의보고서.xlsx" 워크북(입력대장 시트에 하루 한 줄씩
// 방문 기록을 적으면 여비청구서/활동수당청구서/근무상황보고서/예찰내역/예찰일지/
// 출장일지가 전부 그 시트를 참조해 자동으로 채워지던 구조)를 이 앱으로 옮긴 것.
//
// "입력대장"이 하던 일을 vet_report_entries 테이블 + 이 화면의 "일자별 근무내용"이
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

// ─── 일자별 근무내용 (= 입력대장) — 방문 기록 등록/편집/삭제 ─────────────────
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
  try {
    for (const id of vetEntrySelectedIds) await deleteRow('vetReportEntries', id);
  } catch (e) { alert('삭제 실패: ' + e.message); return; }
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

// ─── 일자별 근무내용: 입력대장 엑셀 업로드 ─────────────────────────────────
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
    ['일자별 근무내용 업로드 양식 작성 방법'], [''],
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
  XLSX.writeFile(wb, '일자별_근무내용_양식.xlsx');
}

// ─── 근무상황보고서 ─────────────────────────────────────────────────────────
// "2. 예방주사 및 채혈내역"·"3. 동물질병예찰 실적"은 이 앱에 그 수치를 따로
// 기록하는 화면이 없어 원본 서식과 같이 항상 "-"로 찍는다. "4. 기타실적"의
// 업무명 5개는 매달 거의 같은 문구라 고정해두고, 그달의 추진실적만 화면에서
// 입력해 인쇄에 반영한다(저장하지 않음 — 매달 조금씩 달라지는 자유 텍스트라서).
const VET_WORK_ETC_ITEMS = ['출하이동승인서 발급', '기립불능우확인서 발급', 'AI 시료채취 및 의뢰', '산란성계 살충제검사 샘플링 및 검사의뢰', '역학관련'];

function renderVetWorkReportSummary() {
  const monthEl = document.getElementById('vetwork-month');
  if (!monthEl.value) monthEl.value = vetDefaultYm();
  const { count, scaleSum } = vetMonthStats(monthEl.value);
  document.getElementById('vetwork-summary').textContent = `${vetMonthLabel(monthEl.value)} 예찰 ${count}건 · 사육규모 합계 ${scaleSum.toLocaleString()}`;
}

function buildVetWorkReportHtml(ym) {
  const o = vetOfficeInfo();
  const { count, scaleSum } = vetMonthStats(ym);
  const etcRows = VET_WORK_ETC_ITEMS.map((name, i) => `
    <tr><td>${name}</td><td colspan="4">${(document.getElementById(`vetwork-etc-${i}`)?.value || '').trim() || '-'}</td></tr>`).join('');
  return `
  <div class="print-page">
    <div class="ps-docno">[붙임 1-1]</div>
    <div class="ps-title">공수의 근무상황 보고(산업동물)</div>
    <div class="ps-request" style="text-indent:0;text-align:right">(공수의 → 시군) &middot; ${vetMonthLabel(ym)}분</div>

    <div class="ps-section">1. 공수의 근무상황</div>
    <table class="ps-head">
      <tr><td class="lbl">동물병원</td><td>${o.clinicName || ''}</td><td class="lbl2">담당지역</td><td colspan="2">${o.address || ''}</td></tr>
      <tr><td class="lbl">성명</td><td>${o.vetName || ''}</td><td class="lbl2">면허번호</td><td colspan="2">${o.licenseNo || ''}</td></tr>
      <tr><td class="lbl">예찰 횟수</td><td>${count} 건 방문</td><td class="lbl2">예찰 농가수</td><td colspan="2">${count} 건 방문</td></tr>
      <tr><td class="lbl">비고(수수)</td><td colspan="4">${scaleSum.toLocaleString()} 수</td></tr>
    </table>

    <div class="ps-section">2. 예방주사 및 채혈내역</div>
    <table class="ps-head">
      <tr><td class="lbl">예방주사(구제역/광견병/탄저·기종저/돼지열병/기타)</td><td colspan="4">- (금월실적 없음)</td></tr>
      <tr><td class="lbl">혈청검사용 채혈내역(브루셀라병/우결핵)</td><td colspan="4">- (금월실적 없음)</td></tr>
    </table>

    <div class="ps-section">3. 동물질병예찰 실적</div>
    <table class="ps-head">
      <tr><td class="lbl">지역별 신고내역·조치내역</td><td colspan="4">계 - / - / -</td></tr>
    </table>

    <div class="ps-section">4. 기타실적</div>
    <table class="ps-table">
      <thead><tr><th>업무명</th><th colspan="4">추진실적</th></tr></thead>
      <tbody>${etcRows}</tbody>
    </table>

    <div class="ps-request">▣ 제출자&#8195;&#8195;&#8195;&#8195;&#8195;&#8195;${o.clinicName || ''}&#8195;&#8195;&#8195;${o.vetName || ''}&#8195;&#8195;&#8195;(서명)</div>
  </div>`;
}

function printVetWorkReport() {
  const ym = document.getElementById('vetwork-month').value || vetDefaultYm();
  document.getElementById('print-area').innerHTML = buildVetWorkReportHtml(ym);
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
    alert('선택한 달에 방문 기록이 없어 여비를 계산할 수 없습니다. 일자별 근무내용에서 방문 기록을 먼저 등록해주세요.');
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
    `${vetMonthLabel(monthEl.value)} — 상반기(1~15일) ${halves[0].entries.length}건 · 하반기(16일~) ${halves[1].entries.length}건 → 모두 ${pages}쪽으로 인쇄됩니다. 내용은 일자별 근무내용에서 가져옵니다.`;
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

// 원본 「공수의사 현장 예찰 일지」의 방역 체크리스트 문구는 항목이 매우 많아
// (출입구 소독시설·방역복·소독제 종류 등 수십 줄) 여기서는 핵심 항목만 간추려
// 옮긴다 — 실제 제출 서식과 문구를 통일해야 하면 이 배열만 고치면 된다.
const VET_DIARY_CHECKLIST = [
  '① 농장출입구 소독·방역시설 설치 및 운영여부',
  '② 축사 내·외부 소독 실시여부',
  '③ 방역복·장화 등 방역장비 구비 및 착용여부',
  '④ 야생조수류·설치류 유입 차단시설 관리상태',
  '⑤ 사료·물 관리상태 및 이상 유무',
];

function buildVetDiaryHtml(e) {
  return `
  <div class="print-page">
    <div class="ps-title">공수의사 현장 예찰 일지(산업동물)</div>
    <div class="ps-request" style="text-align:right;text-indent:0">(공수의 → 시군) ※공수의 근무상황 보고와 같이 제출</div>

    <div class="ps-section">▣ 농장 기본 정보</div>
    <table class="ps-head">
      <tr><td class="lbl">농장명</td><td>${e.farmName || ''}</td><td class="lbl2">예찰일자</td><td>${e.visitDate}</td></tr>
      <tr><td class="lbl">대표자</td><td>${e.owner || ''}</td><td class="lbl2">사육축종</td><td>${e.species || '-'}</td></tr>
      <tr><td class="lbl">농장주소</td><td colspan="3">${e.address || '-'}</td></tr>
      <tr><td class="lbl">사육두수</td><td colspan="3">${e.scale != null ? Number(e.scale).toLocaleString() + ' 수' : '-'}</td></tr>
    </table>

    <div class="ps-section">▣ 농장 방문 목적</div>
    <table class="ps-head"><tr><td class="lbl">예찰 [■]</td><td>채혈 [ ]</td><td>접종 [ ]</td><td>기타 [ ]</td></tr></table>

    <div class="ps-section">▣ 현장 예찰 사항 / 예찰의견</div>
    <table class="ps-head"><tr><td colspan="4">${e.content || '-'}</td></tr></table>

    <div class="ps-section">▣ 농장 기본 방역 확인 사항</div>
    <div class="ps-foot-note">${VET_DIARY_CHECKLIST.join('<br>')}</div>
  </div>`;
}

function printSelectedVetDiary() {
  const list = load('vetReportEntries').filter(e => vetDiarySelectedIds.has(e.id));
  if (!list.length) { alert('인쇄할 방문 기록을 먼저 체크해주세요.'); return; }
  document.getElementById('print-area').innerHTML = list.map(buildVetDiaryHtml).join('');
  setTimeout(() => window.print(), 200);
}

// ─── 출장일지 ───────────────────────────────────────────────────────────────
function renderVetTripSummary() {
  const monthEl = document.getElementById('vettrip-month');
  if (!monthEl.value) monthEl.value = vetDefaultYm();
  const { count, scaleSum } = vetMonthStats(monthEl.value);
  document.getElementById('vettrip-summary').textContent = `${vetMonthLabel(monthEl.value)} 출장 ${count}일 · 비고(예찰수수) ${scaleSum.toLocaleString()}`;
}

function buildVetTripHtml(ym) {
  const o = vetOfficeInfo();
  const { list, count, scaleSum } = vetMonthStats(ym);
  const rows = list.map((e, i) => `
    <tr>
      <td class="ctr">${i + 1}</td>
      <td>${e.owner || ''}</td>
      <td>${e.address || '-'}</td>
      <td class="ctr">${e.species || '-'}</td>
      <td class="ctr">${(e.visitDate || '').slice(5)}</td>
      <td>${e.content || '-'}</td>
      <td class="ctr">${e.scale != null ? Number(e.scale).toLocaleString() : '-'}</td>
    </tr>`).join('');
  return `
  <div class="print-page">
    <div class="ps-title">공수의 여비 지원사업 근무보고</div>
    <div class="ps-request" style="text-align:right;text-indent:0">(공수의→시군)&#8195;&#8195;발신 : ${o.clinicName || ''} ${o.vetName || ''} (인)</div>

    <div class="ps-section">1. 근무상황</div>
    <table class="ps-head">
      <tr><td class="lbl">공수의</td><td>${o.clinicName || ''} / ${o.vetName || ''} / ${o.licenseNo || ''}</td><td class="lbl2">담당지역</td><td>${o.address || ''}</td></tr>
      <tr><td class="lbl">출장일수</td><td>${count} 일</td><td class="lbl2">비고(예찰수수)</td><td>${scaleSum.toLocaleString()}</td></tr>
    </table>

    <div class="ps-section">2. 농가별 출장내역 — 기간 ${list[0]?.visitDate || ''} ~ ${list[list.length - 1]?.visitDate || ''} (농가수 ${count} 건, 총 두수 ${scaleSum.toLocaleString()})</div>
    <table class="ps-table">
      <thead><tr><th>번호</th><th>축주명</th><th>지역(주소)</th><th>축종</th><th>출장일</th><th>근무내용</th><th>검진두수</th></tr></thead>
      <tbody>
        ${rows}
        <tr class="ps-total"><td colspan="4" class="ctr">합계</td><td colspan="2" class="ctr">${count}일</td><td class="ctr">${scaleSum.toLocaleString()}</td></tr>
      </tbody>
    </table>
  </div>`;
}

function printVetTrip() {
  const ym = document.getElementById('vettrip-month').value || vetDefaultYm();
  if (!vetMonthStats(ym).count) { alert('선택한 달에 방문 기록이 없습니다.'); return; }
  document.getElementById('print-area').innerHTML = buildVetTripHtml(ym);
  setTimeout(() => window.print(), 200);
}
