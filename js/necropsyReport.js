// ─── 공수의 업무: 부검소견서(검안서) ─────────────────────────────────────────
// 원본 「부검소견서(검안서)」 엑셀 서식을 그대로 옮긴 화면이다. 원본은 「발급대장」 시트에
// 한 줄씩 적어 두고, 서식 시트가 No.로 그 줄을 찾아(VLOOKUP) 8개 항목을 채웠다:
//   1 농장명·축종  2 이름·전화  3 주소  4 방문일  5 농장상황  6 부검소견  7 최종소견  8 처방
// 여기서는 농장 등록/관리의 정보를 불러와 채우고, 그때 발급한 내용이 나중에 농장 정보가
// 바뀌어도 그대로 남도록 스냅샷으로 저장한다(출하전검사·이동승인서와 같은 방식).
//
// 병원명·수의사명·면허번호·전화는 처방전과 같은 RX_CLINIC(js/prescriptions.js)을 쓴다.
// 서식 맨 아래의 병원 주소·팩스·이메일은 이 저장소가 퍼블릭이라 소스에 적지 않고,
// 발급할 때 한 번 적으면 건마다 함께 저장해 다음 발급 때 그대로 불러온다.
const NC_ISSUER_TITLE = '양계컨설턴트';
const NC_STAMP_SRC = 'img/rx-stamp-hospital.png';

function ncEsc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 발급번호는 원본 발급대장처럼 1부터 이어지는 일련번호다. 지금까지 쓴 번호 중 가장 큰 숫자 + 1.
function ncNextDocNo() {
  const max = load('necropsyReports').reduce((m, r) => {
    const n = parseInt(r.docNo, 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return String(max + 1);
}

// 발급자 정보(주소·팩스·이메일)는 가장 최근에 저장한 건의 값을 기본으로 쓴다.
function ncLastIssuer() {
  const last = [...load('necropsyReports')]
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .find(r => r.issuerAddress || r.issuerFax || r.issuerEmail);
  return { address: last?.issuerAddress || '', fax: last?.issuerFax || '', email: last?.issuerEmail || '' };
}

function ncSorted(list) {
  // 최근 방문일이 위로, 같은 날은 발급번호가 큰 것(나중에 발급한 것) 먼저.
  return [...list].sort((a, b) =>
    (b.visitDate || '').localeCompare(a.visitDate || '') ||
    (parseInt(b.docNo, 10) || 0) - (parseInt(a.docNo, 10) || 0) ||
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
}

// ─── 목록 ───────────────────────────────────────────────────────────────────
function populateNcFarmFilter() {
  const sel = document.getElementById('nc-filter-farm');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">전체 농장</option>' + farmsByOwner().map(f =>
    `<option value="${f.id}"${f.id === cur ? ' selected' : ''}>${ncEsc(f.name)} (${ncEsc(f.owner)})</option>`
  ).join('');
}

let ncSelectedIds = new Set();

function renderNecropsyReports() {
  const q = (document.getElementById('nc-search')?.value || '').toLowerCase();
  const ff = document.getElementById('nc-filter-farm')?.value || '';
  const all = load('necropsyReports');
  const list = ncSorted(all.filter(r =>
    (!q || [r.farmName, r.owner, r.finalOpinion].some(v => (v || '').toLowerCase().includes(q))) &&
    (!ff || r.farmId === ff)
  ));
  // 삭제된 항목의 선택 표시가 남지 않도록, 지금 존재하는 id만 유지한다.
  const liveIds = new Set(all.map(r => r.id));
  ncSelectedIds.forEach(id => { if (!liveIds.has(id)) ncSelectedIds.delete(id); });

  const setDisabled = (id, v) => { const el = document.getElementById(id); if (el) el.disabled = v; };
  setDisabled('nc-print-btn', ncSelectedIds.size === 0);
  setDisabled('nc-kakao-btn', ncSelectedIds.size === 0);
  setDisabled('nc-edit-btn', ncSelectedIds.size !== 1);
  setDisabled('nc-delete-btn', ncSelectedIds.size === 0);

  const tbody = document.getElementById('nc-tbody');
  const empty = document.getElementById('nc-empty');
  const checkAll = document.getElementById('nc-check-all');
  if (!list.length) {
    tbody.innerHTML = ''; empty.style.display = '';
    if (checkAll) checkAll.checked = false;
    return;
  }
  empty.style.display = 'none';
  if (checkAll) checkAll.checked = list.every(r => ncSelectedIds.has(r.id));
  const brief = t => { const s = (t || '').replace(/\s+/g, ' ').trim(); return s.length > 40 ? s.slice(0, 40) + '…' : (s || '-'); };
  // 줄을 누르면 바로 편집 화면을 연다. 체크박스 칸은 클릭이 줄로 번지지 않게 막는다.
  tbody.innerHTML = list.map(r => `
    <tr class="row-click" onclick="openNecropsyModal('${r.id}')">
      <td style="text-align:center" onclick="event.stopPropagation()"><input type="checkbox" ${ncSelectedIds.has(r.id) ? 'checked' : ''} onchange="toggleNcSelect('${r.id}', this.checked)"></td>
      <td>${ncEsc(r.docNo || '-')}</td>
      <td>${ncEsc(r.visitDate || '-')}</td>
      <td><strong>${ncEsc(r.farmName)}</strong><div style="font-size:11px;color:var(--text-secondary)">${ncEsc(r.owner || '')}</div></td>
      <td>${ncEsc(r.species || '-')}</td>
      <td style="font-size:12px">${ncEsc(brief(r.finalOpinion))}</td>
      <td style="font-size:12px">${ncEsc(brief(r.prescription))}</td>
      <td>${ncEsc(r.issueDate || '-')}</td>
    </tr>`).join('');
}

function toggleNcSelectAll(checked) {
  ncSelectedIds = checked ? new Set(load('necropsyReports').map(r => r.id)) : new Set();
  renderNecropsyReports();
}
function toggleNcSelect(id, checked) {
  if (checked) ncSelectedIds.add(id); else ncSelectedIds.delete(id);
  renderNecropsyReports();
}

function editSelectedNecropsy() {
  if (ncSelectedIds.size !== 1) return;
  openNecropsyModal([...ncSelectedIds][0]);
}

async function deleteSelectedNecropsies() {
  if (!ncSelectedIds.size) return;
  if (!confirm(`선택한 부검소견서 ${ncSelectedIds.size}건을 삭제하시겠습니까?`)) return;
  try {
    for (const id of ncSelectedIds) await deleteRow('necropsyReports', id);
  } catch (e) { alert('삭제 실패: ' + e.message); return; }
  ncSelectedIds.clear();
  renderNecropsyReports();
}

// ─── 입력/편집 ─────────────────────────────────────────────────────────────
// 농장을 고르면 농장 등록/관리에 있는 정보로 채운다. force=false(편집 모달을 다시 열 때)는
// 비어 있는 칸만 채워서, 그때 발급한 값이 덮이지 않게 한다.
function onNcFarmChange(force) {
  const farm = load('farms').find(f => f.id === document.getElementById('nc-farm').value);
  const info = document.getElementById('nc-farm-info');
  if (!farm) {
    info.textContent = '농장을 선택하면 농장 등록/관리에 있는 이름·전화·주소·축종이 자동으로 채워집니다.';
    return;
  }
  const missing = [['이름', farm.owner], ['전화', farm.phone], ['주소', farm.address], ['축종', farm.type]]
    .filter(([, v]) => !v).map(([k]) => k);
  info.textContent = missing.length
    ? `농장 등록/관리에 ${missing.join('·')} 정보가 비어 있습니다. 아래 칸에 직접 적거나 농장 등록/관리에서 채워주세요.`
    : '농장 등록/관리의 정보를 불러왔습니다. 이 소견서에만 다르게 적으려면 아래 칸을 고치면 됩니다.';
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el && (force || !el.value)) el.value = val ?? '';
  };
  set('nc-owner', farm.owner);
  set('nc-phone', farm.phone);
  set('nc-address', farm.address);
  set('nc-species', farm.type);
}

function openNecropsyModal(id) {
  editingId.necropsyReport = id || null;
  const r = id ? load('necropsyReports').find(x => x.id === id) : null;
  document.getElementById('modal-nc-title').textContent = id ? '부검소견서(검안서) 편집' : '부검소견서(검안서) 작성';

  populateFarmSelect('nc-farm', r?.farmId || '');
  // 농장이 삭제된 옛 소견서도 농장명이 보이게, 목록에 없는 농장은 스냅샷 이름으로 한 줄 넣는다.
  const farmSel = document.getElementById('nc-farm');
  if (r && !r.farmId) {
    const opt = document.createElement('option');
    opt.value = ''; opt.textContent = `${r.farmName} (삭제된 농장)`; opt.selected = true;
    farmSel.insertBefore(opt, farmSel.children[1] || null);
  }
  const today = new Date().toISOString().slice(0, 10);
  const issuer = ncLastIssuer();
  const setVal = (elId, v) => { document.getElementById(elId).value = v ?? ''; };
  setVal('nc-doc-no', r?.docNo || ncNextDocNo());
  setVal('nc-visit-date', r?.visitDate || today);
  setVal('nc-issue-date', r?.issueDate || today);
  setVal('nc-owner', r?.owner);
  setVal('nc-phone', r?.phone);
  setVal('nc-address', r?.address);
  setVal('nc-species', r?.species);
  setVal('nc-farm-status', r?.farmStatus);
  setVal('nc-findings', r?.findings);
  setVal('nc-final-opinion', r?.finalOpinion);
  setVal('nc-prescription', r?.prescription);
  setVal('nc-issuer-address', r ? r.issuerAddress : issuer.address);
  setVal('nc-issuer-fax', r ? r.issuerFax : issuer.fax);
  setVal('nc-issuer-email', r ? r.issuerEmail : issuer.email);

  onNcFarmChange(false);
  openModal('modal-necropsy');
}

async function saveNecropsy() {
  const farmId = document.getElementById('nc-farm').value;
  const visitDate = document.getElementById('nc-visit-date').value;
  const prev = editingId.necropsyReport ? load('necropsyReports').find(x => x.id === editingId.necropsyReport) : null;
  const farm = load('farms').find(f => f.id === farmId);
  // 농장이 삭제된 옛 소견서는 농장을 다시 고르지 않아도 스냅샷 이름으로 그대로 저장된다.
  const farmName = farm?.name || (prev && !prev.farmId ? prev.farmName : '');
  if (!farmName || !visitDate) { alert('농장과 방문일은 필수입니다.'); return; }
  const val = id => document.getElementById(id).value.trim();
  const data = {
    docNo: val('nc-doc-no'), visitDate,
    issueDate: document.getElementById('nc-issue-date').value || visitDate,
    farmId: farm?.id || null, farmName,
    owner: val('nc-owner'), phone: val('nc-phone'), address: val('nc-address'), species: val('nc-species'),
    farmStatus: val('nc-farm-status'), findings: val('nc-findings'),
    finalOpinion: val('nc-final-opinion'), prescription: val('nc-prescription'),
    issuerAddress: val('nc-issuer-address'), issuerFax: val('nc-issuer-fax'), issuerEmail: val('nc-issuer-email'),
    createdByEmail: prev?.createdByEmail || await currentUserEmail(),
  };
  let saved;
  try {
    if (editingId.necropsyReport) saved = await updateRow('necropsyReports', editingId.necropsyReport, data);
    else saved = await insertRow('necropsyReports', data);
  } catch (e) { alert('저장 실패: ' + e.message); return; }
  const isNew = !editingId.necropsyReport;
  editingId.necropsyReport = null;
  closeModal('modal-necropsy');
  populateNcFarmFilter();
  renderNecropsyReports();
  if (isNew && confirm('부검소견서를 저장했습니다. 지금 인쇄하시겠습니까?')) printNecropsy(saved.id);
}

// ─── A4 인쇄 (원본 서식의 1~8번 항목 순서 + 대한동물병원 직인) ───────────────
// buildNecropsyHtml()은 한 건의 .print-page 마크업만 만든다. 인쇄·카톡 발송이 같은 마크업을 쓴다.
function buildNecropsyHtml(r) {
  const text = v => ncEsc(v || '').replace(/\n/g, '<br>');
  const dateKo = d => (d ? rxFormatDateKo(d) : '');
  const contact = [
    `면허번호 : ${RX_CLINIC.licenseNo}`,
    r.issuerAddress ? ncEsc(r.issuerAddress) : '',
    [`전화 : ${RX_CLINIC.phone}`, r.issuerFax ? `팩스 : ${ncEsc(r.issuerFax)}` : ''].filter(Boolean).join('　　'),
    r.issuerEmail ? `이메일 : ${ncEsc(r.issuerEmail)}` : '',
  ].filter(Boolean);
  const longRow = (no, label, value) => `
      <tr class="nc-long">
        <td class="num">${no}</td><td class="lbl">${label}</td>
        <td class="val" colspan="3">${text(value)}</td>
      </tr>`;
  return `
  <div class="print-page nc-page">
    <div class="nc-frame">
      <div class="nc-head">
        <div class="nc-title">부검소견서(검안서)</div>
        <div class="nc-docno">No. ${ncEsc(r.docNo || '')}</div>
      </div>
      <table class="nc-table">
        <colgroup><col style="width:7%"><col style="width:16%"><col style="width:37%"><col style="width:12%"><col style="width:28%"></colgroup>
        <tr>
          <td class="num">1</td><td class="lbl">농 장 명</td><td class="val">${ncEsc(r.farmName || '')}</td>
          <td class="lbl">축 종</td><td class="val">${ncEsc(r.species || '')}</td>
        </tr>
        <tr>
          <td class="num">2</td><td class="lbl">이 　 름</td><td class="val">${ncEsc(r.owner || '')}</td>
          <td class="lbl">전 화</td><td class="val">${ncEsc(r.phone || '')}</td>
        </tr>
        <tr>
          <td class="num">3</td><td class="lbl">주 　 소</td><td class="val" colspan="3">${ncEsc(r.address || '')}</td>
        </tr>
        <tr>
          <td class="num">4</td><td class="lbl">방 문 일</td><td class="val" colspan="3">${dateKo(r.visitDate)}</td>
        </tr>
        ${longRow(5, '농장상황', r.farmStatus)}
        ${longRow(6, '부검소견', r.findings)}
        ${longRow(7, '최종소견', r.finalOpinion)}
        ${longRow(8, '처 　 방', r.prescription)}
      </table>
      <div class="nc-foot">
        <div class="nc-issue-date">발급일 : ${dateKo(r.issueDate)}</div>
        <div class="nc-issuer">
          <div class="nc-issuer-name">
            <div>${RX_CLINIC.name}</div>
            <div>${NC_ISSUER_TITLE}</div>
            <div>${RX_CLINIC.vetName} 수의사</div>
          </div>
          <img class="nc-stamp" src="${NC_STAMP_SRC}" alt="">
          <div class="nc-issuer-info">${contact.join('<br>')}</div>
        </div>
      </div>
    </div>
  </div>`;
}

function printNecropsy(id) {
  const r = load('necropsyReports').find(x => x.id === id);
  if (!r) return;
  document.getElementById('print-area').innerHTML = buildNecropsyHtml(r);
  setTimeout(() => window.print(), 200);
}

function ncSelectedList() {
  return ncSorted(load('necropsyReports').filter(r => ncSelectedIds.has(r.id)));
}

function printSelectedNecropsies() {
  const list = ncSelectedList();
  if (!list.length) { alert('인쇄할 항목을 먼저 체크해주세요.'); return; }
  document.getElementById('print-area').innerHTML = list.map(buildNecropsyHtml).join('');
  setTimeout(() => window.print(), 200);
}

// 체크한 소견서를 인쇄 모양 그대로 이미지로 만들어 카카오톡으로 보낸다(js/kakao.js의 kakaoSendPrintPages).
function kakaoSendSelectedNecropsies() {
  const list = ncSelectedList();
  if (!list.length) { alert('카카오톡으로 보낼 항목을 먼저 체크해주세요.'); return; }
  const first = list[0].farmName || '';
  return kakaoSendPrintPages({
    htmls: list.map(buildNecropsyHtml),
    title: list.length === 1 ? `${first} 부검소견서` : `${first} 외 ${list.length - 1}건 부검소견서`,
    btn: document.getElementById('nc-kakao-btn'),
    isEnabled: () => ncSelectedIds.size > 0,
  });
}

// ─── 엑셀 출력 ─────────────────────────────────────────────────────────────
// 원본 파일과 같은 구성으로 저장한다: 첫 시트 「발급대장」(한 줄에 한 건) + 건마다 서식 시트 한 장.
// 체크한 건이 있으면 그 건들만, 없으면 방문일 구간에 드는 건을 전부 담는다.
// ExcelJS 불러오기(loadExcelJs)는 js/preShipment.js의 것을 그대로 쓴다.
function ncExcelRange() {
  return { from: document.getElementById('nc-xl-from').value, to: document.getElementById('nc-xl-to').value };
}

function ncExcelUseSelected() {
  return ncSelectedIds.size > 0 && document.getElementById('nc-xl-selected')?.checked;
}

function ncExcelTargets() {
  const { from, to } = ncExcelRange();
  const all = load('necropsyReports');
  const list = ncExcelUseSelected()
    ? all.filter(r => ncSelectedIds.has(r.id))
    : all.filter(r => r.visitDate && (!from || r.visitDate >= from) && (!to || r.visitDate <= to));
  // 발급대장은 발급번호 순(같으면 방문일 순)
  return list.sort((a, b) =>
    (parseInt(a.docNo, 10) || 0) - (parseInt(b.docNo, 10) || 0) ||
    (a.visitDate || '').localeCompare(b.visitDate || ''));
}

function openNcExcelModal() {
  // 기본 구간: 이번 달 1일 ~ 말일(로컬 날짜)
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const y = now.getFullYear(), m = now.getMonth() + 1;
  document.getElementById('nc-xl-from').value = `${y}-${pad(m)}-01`;
  document.getElementById('nc-xl-to').value = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
  const selWrap = document.getElementById('nc-xl-selected-wrap');
  const selBox = document.getElementById('nc-xl-selected');
  selWrap.style.display = ncSelectedIds.size ? '' : 'none';
  selBox.checked = ncSelectedIds.size > 0;
  document.getElementById('nc-xl-selected-label').textContent = `체크한 ${ncSelectedIds.size}건만 저장`;
  updateNcExcelCount();
  openModal('modal-nc-excel');
}

// 파일은 대상이 정해질 때마다 미리 만들어 두고 "엑셀 저장"을 누르면 곧바로 내려받는다
// (클릭 뒤에 파일을 만들면 일부 브라우저가 자동 다운로드로 보고 막는다 — 출하전검사와 같은 이유).
let ncXlPrepared = null;
let ncXlSeq = 0;

function updateNcExcelCount() {
  const useSel = ncExcelUseSelected();
  document.getElementById('nc-xl-from').disabled = useSel;
  document.getElementById('nc-xl-to').disabled = useSel;
  const list = ncExcelTargets();
  const countEl = document.getElementById('nc-xl-count');
  const btn = document.getElementById('nc-xl-btn');
  ncXlPrepared = null;
  ncXlSeq++;
  if (!list.length) {
    countEl.textContent = '해당 구간에 방문일이 드는 부검소견서가 없습니다.';
    btn.disabled = true;
    return;
  }
  const summary = `${useSel ? '체크한 항목' : '해당 구간'}: ${list.length}건 (발급대장 1장 + 서식 ${list.length}장)`;
  countEl.textContent = `${summary} — 파일 준비 중...`;
  btn.disabled = true;
  const seq = ncXlSeq;
  buildNcExcelFile(list, useSel ? {} : ncExcelRange()).then(file => {
    if (seq !== ncXlSeq) return; // 그사이 대상이 바뀜
    ncXlPrepared = file;
    countEl.textContent = summary;
    btn.disabled = false;
  }).catch(e => {
    if (seq !== ncXlSeq) return;
    countEl.textContent = `${summary} — 파일을 만들지 못했습니다: ${e.message}`;
  });
}

function exportNcExcel() {
  if (!ncXlPrepared) { alert('파일을 준비하는 중입니다. 잠시 후 다시 눌러주세요.'); return; }
  const url = URL.createObjectURL(ncXlPrepared.blob);
  const a = document.createElement('a');
  a.download = ncXlPrepared.fileName;
  a.href = url;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  closeModal('modal-nc-excel');
}

// 엑셀 날짜는 UTC 자정 값으로 넣어야 시간대와 상관없이 같은 날짜로 보인다.
function ncXlDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// 줄바꿈이 있는 긴 글이 칸에서 잘리지 않게, 글자 수로 줄 수를 어림해 행 높이를 정한다.
function ncXlLines(textValue, charsPerLine) {
  return String(textValue || '').split('\n')
    .reduce((n, line) => n + Math.max(1, Math.ceil([...line].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e7f ? 2 : 1), 0) / charsPerLine)), 0);
}

async function buildNcExcelFile(list, range) {
  const first = list[0], last = list[list.length - 1];
  const span = range.from || range.to
    ? `${range.from || first.visitDate}_${range.to || last.visitDate}`
    : `No${first.docNo || ''}${list.length > 1 ? `-${last.docNo || ''}` : ''}`;
  const fileName = `부검소견서_${span}.xlsx`;
  await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  const thin = { style: 'thin' };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const font = (size, bold) => ({ name: '맑은 고딕', size, bold: !!bold });

  // ── 발급대장 ──
  const ledger = wb.addWorksheet('발급대장');
  const cols = [
    ['No.', 6, r => (Number.isFinite(parseInt(r.docNo, 10)) ? parseInt(r.docNo, 10) : r.docNo || '')],
    ['방문일', 12, r => ncXlDate(r.visitDate)],
    ['이름', 10, r => r.owner || ''],
    ['농장명', 16, r => r.farmName || ''],
    ['주소', 34, r => r.address || ''],
    ['전화', 15, r => r.phone || ''],
    ['축종', 9, r => r.species || ''],
    ['농장상황', 34, r => r.farmStatus || ''],
    ['부검소견', 40, r => r.findings || ''],
    ['최종소견', 30, r => r.finalOpinion || ''],
    ['처방', 30, r => r.prescription || ''],
    ['발급일', 12, r => ncXlDate(r.issueDate)],
  ];
  ledger.mergeCells(1, 1, 1, cols.length);
  ledger.getCell('A1').value = '부검소견서(검안서) 발급대장';
  ledger.getCell('A1').font = font(16, true);
  ledger.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ledger.getRow(1).height = 32;
  cols.forEach(([head, width], i) => {
    ledger.getColumn(i + 1).width = width;
    const c = ledger.getCell(3, i + 1);
    c.value = head; c.font = font(10, true); c.border = box;
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0F8' } };
  });
  ledger.getRow(3).height = 24;
  list.forEach((r, idx) => {
    const row = 4 + idx;
    let lines = 1;
    cols.forEach(([head, width, get], i) => {
      const c = ledger.getCell(row, i + 1);
      const v = get(r);
      c.value = v; c.font = font(10); c.border = box;
      const isLong = width >= 30;
      c.alignment = { horizontal: isLong ? 'left' : 'center', vertical: 'middle', wrapText: true };
      if (v instanceof Date) c.numFmt = 'yyyy-mm-dd';
      if (typeof v === 'string') lines = Math.max(lines, ncXlLines(v, width * 0.95));
    });
    ledger.getRow(row).height = Math.max(22, lines * 15);
  });
  ledger.views = [{ state: 'frozen', ySplit: 3 }];
  ledger.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  // ── 서식 시트(건마다 한 장) ──
  let stampId = null;
  try {
    const res = await fetch(NC_STAMP_SRC);
    if (res.ok) stampId = wb.addImage({ buffer: await res.arrayBuffer(), extension: 'png' });
  } catch (e) { /* 직인 그림을 못 읽어도 내용은 그대로 저장한다 */ }

  const used = new Set(['발급대장']);
  for (const r of list) {
    // 시트 이름: 31자 이내, 쓸 수 없는 문자(\ / ? * [ ] :) 제거, 겹치면 뒤에 번호를 붙인다.
    const base = `${r.docNo || ''}_${r.farmName || ''}`.replace(/[\\/?*[\]:]/g, '').slice(0, 27) || '서식';
    let name = base, n = 2;
    while (used.has(name)) name = `${base}(${n++})`;
    used.add(name);
    const ws = wb.addWorksheet(name);
    [7.2, 13.6, 30.1, 8.7, 14.1, 8.7, 8.7].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    const put = (addr, v, size, align = {}, bold = false) => {
      const c = ws.getCell(addr);
      c.value = v; c.font = font(size, bold);
      c.alignment = { vertical: 'middle', ...align };
      return c;
    };
    ws.mergeCells('A1:G1');
    put('A1', '부검소견서(검안서)', 18, { horizontal: 'center' }, true);
    ws.getRow(1).height = 32.4;
    put('A2', 'No.', 10, { horizontal: 'center' });
    put('B2', r.docNo || '', 10, { horizontal: 'left' });
    ws.getRow(2).height = 21.6;
    ws.getRow(3).height = 17.4;

    const shortRows = [
      [4, 1, '농장명 :', r.farmName, '축종 :', r.species],
      [6, 2, '이   름 :', r.owner, '전화 :', r.phone],
      [8, 3, '주   소 :', r.address],
      [10, 4, '방문일 :', r.visitDate ? rxFormatDateKo(r.visitDate) : ''],
    ];
    shortRows.forEach(([row, no, label, value, label2, value2]) => {
      ws.getRow(row).height = 25.2; ws.getRow(row + 1).height = 12;
      put(`A${row}`, no, 16, { horizontal: 'center' });
      put(`B${row}`, label, 16);
      if (label2 == null) ws.mergeCells(`C${row}:G${row}`);
      put(`C${row}`, value || '', 14, { horizontal: 'left', wrapText: true });
      if (label2 != null) {
        put(`D${row}`, label2, 16);
        ws.mergeCells(`E${row}:G${row}`);
        put(`E${row}`, value2 || '', 14, { horizontal: 'left', wrapText: true });
      }
    });
    const longRows = [
      [12, 5, '농장상황 :', r.farmStatus], [14, 6, '부검소견 :', r.findings],
      [16, 7, '최종소견 :', r.finalOpinion], [18, 8, '처   방 : ', r.prescription],
    ];
    longRows.forEach(([row, no, label, value]) => {
      // 긴 글은 C~G를 합친 칸에 줄바꿈으로 넣고, 줄 수만큼 행 높이를 늘린다(합친 칸은 엑셀이 자동으로 높이를 안 맞춘다).
      const lines = ncXlLines(value, 46);
      ws.getRow(row).height = Math.max(25.2, lines * 20 + 6);
      ws.getRow(row + 1).height = 12;
      put(`A${row}`, no, 16, { horizontal: 'center', vertical: 'top' });
      put(`B${row}`, label, 16, { vertical: 'top' });
      ws.mergeCells(`C${row}:G${row}`);
      put(`C${row}`, value || '', 13, { horizontal: 'left', vertical: 'top', wrapText: true });
    });

    ws.getRow(20).height = 13.95;
    put('A21', '⃞', 14, { horizontal: 'center' });
    put('B21', '발급일 :', 14);
    put('C21', r.issueDate ? rxFormatDateKo(r.issueDate) : '', 14, { horizontal: 'left' });
    put('D21', RX_CLINIC.name, 14);
    put('D22', NC_ISSUER_TITLE, 14);
    put('D23', `${RX_CLINIC.vetName}수의사`, 14);
    [21, 22, 23].forEach(row => { ws.getRow(row).height = 22; });
    put('D25', `면허번호 : ${RX_CLINIC.licenseNo}`, 10);
    if (r.issuerAddress) put('D26', r.issuerAddress, 10);
    put('D27', `전화 : ${RX_CLINIC.phone}`, 10);
    if (r.issuerFax) put('F27', `팩스 : ${r.issuerFax}`, 10);
    if (r.issuerEmail) put('D28', `이메일 : ${r.issuerEmail}`, 10);
    // 직인: 원본과 같은 자리(E~G열, 발급일 줄부터 면허번호 줄까지)에 같은 크기로 얹는다.
    if (stampId != null) ws.addImage(stampId, { tl: { col: 4.25, row: 18.3 }, ext: { width: 186, height: 169 } });
    ws.pageSetup = {
      paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1,
      horizontalCentered: true, margins: { left: 0.6, right: 0.6, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    };
  }

  const buf = await wb.xlsx.writeBuffer();
  return { fileName, blob: new Blob([buf], { type: 'application/octet-stream' }) };
}
