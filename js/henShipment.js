// ─── 공수의 업무: 산란성계 출하대장 (AI노계출하.xlsx 「검사의뢰서」) ──────────
// 산란성계(노계) 농장이 도축장으로 출하하기 전 정밀검사를 의뢰하는 서식.
// 원본 10개 항목 중 6(시료종류 및 수량)·7(검사항목)·10(기타사항)은 매번 같은
// 문구라 입력칸을 두지 않고 아래 상수로 고정한다. 축종(항목1)도 이 서식 자체가
// "산란성계" 전용이라 항상 "산란계"로 고정 — 별도 입력칸이 없다.
const HS_FIXED = {
  species: '산란계',
  sampleSpec: '(근육, 지방) 각 6수분',
  testItems: '살충제 34종',
  etcNote: '살충제 사용한적 없슴',
};
const HS_REQUEST_ORG = '파주시청';

// 일련번호 자동표기: yy-03-그 해로 이미 등록된 건수 다음 번호(예: 26-03-31, -32).
// "03"은 이 서식 고유의 고정 자릿값(원본 문서번호 체계)이다. preShipment.js의
// psNextDocNo와 같은 패턴 — yy-03- 로 시작하는 기존 docNo 중 가장 큰 순번 + 1.
function hsNextDocNo(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const yy = String(d.getFullYear()).slice(2);
  const prefix = `${yy}-03-`;
  const used = load('henShipments')
    .filter(h => (h.docNo || '').startsWith(prefix))
    .map(h => Number((h.docNo || '').slice(prefix.length)) || 0);
  return `${prefix}${used.length ? Math.max(...used) + 1 : 1}`;
}

// 신청일을 바꾸면 그 날짜(연도) 기준으로 다시 제안한다. 편집 중이거나 사용자가
// 직접 적어둔 상태면 건드리지 않는다(preShipment.js의 onPsSampledAtChange와 같은 패턴).
function onHsAppliedAtChange() {
  const docNoEl = document.getElementById('hs-doc-no');
  if (editingId.henShipment || docNoEl.dataset.manualEdit === '1') return;
  docNoEl.value = hsNextDocNo(document.getElementById('hs-applied-at').value);
}

// 농장을 고르면 축주명·주소·연락처를 자동으로 채운다(이미 직접 고친 칸은 덮지 않음).
function onHsFarmChange(force) {
  const farm = load('farms').find(f => f.id === document.getElementById('hs-farm').value);
  const info = document.getElementById('hs-farm-info');
  if (!farm) {
    info.textContent = '농장을 선택하면 축주명·주소·연락처가 자동으로 채워집니다.';
    return;
  }
  info.textContent = [`축주 ${farm.owner || '-'}`, `연락처 ${farm.phone || '-'}`, `소재지 ${farm.address || '-'}`].join(' · ');
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el && (force || !el.value)) el.value = val ?? '';
  };
  set('hs-owner', farm.owner);
  set('hs-address', farm.address);
  set('hs-phone', farm.phone);
}

// ─── 목록 ───────────────────────────────────────────────────────────────────
function populateHsFarmFilter() {
  const sel = document.getElementById('hs-filter-farm');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">전체 농장</option>' + farmsByOwner().map(f =>
    `<option value="${f.id}"${f.id === cur ? ' selected' : ''}>${f.name} (${f.owner})</option>`
  ).join('');
}

// 목록 왼쪽 체크박스로 고른 여러 건을 인쇄·삭제에, 정확히 한 건일 때 편집에 쓴다
// (처방전 발급·출하전검사·이동승인서와 같은 패턴).
let hsSelectedIds = new Set();

function toggleHsSelectAll(checked) {
  const ids = load('henShipments').map(h => h.id);
  hsSelectedIds = checked ? new Set(ids) : new Set();
  renderHenShipments();
}
function toggleHsSelect(id, checked) {
  if (checked) hsSelectedIds.add(id); else hsSelectedIds.delete(id);
  renderHenShipments();
}

function renderHenShipments() {
  const q = (document.getElementById('hs-search')?.value || '').toLowerCase();
  const ff = document.getElementById('hs-filter-farm')?.value || '';
  const list = load('henShipments').filter(h =>
    (!q || (h.farmName || '').toLowerCase().includes(q) || (h.owner || '').toLowerCase().includes(q)) &&
    (!ff || h.farmId === ff)
  );
  const liveIds = new Set(load('henShipments').map(h => h.id));
  hsSelectedIds.forEach(id => { if (!liveIds.has(id)) hsSelectedIds.delete(id); });

  const printBtn = document.getElementById('hs-print-btn');
  const editBtn = document.getElementById('hs-edit-btn');
  const deleteBtn = document.getElementById('hs-delete-btn');
  if (printBtn) printBtn.disabled = hsSelectedIds.size === 0;
  if (editBtn) editBtn.disabled = hsSelectedIds.size !== 1;
  if (deleteBtn) deleteBtn.disabled = hsSelectedIds.size === 0;

  const tbody = document.getElementById('hs-tbody');
  const empty = document.getElementById('hs-empty');
  const checkAll = document.getElementById('hs-check-all');
  if (!list.length) {
    tbody.innerHTML = ''; empty.style.display = '';
    if (checkAll) checkAll.checked = false;
    return;
  }
  empty.style.display = 'none';
  if (checkAll) checkAll.checked = list.every(h => hsSelectedIds.has(h.id));
  tbody.innerHTML = list.map(h => `
    <tr>
      <td style="text-align:center"><input type="checkbox" ${hsSelectedIds.has(h.id) ? 'checked' : ''} onchange="toggleHsSelect('${h.id}', this.checked)"></td>
      <td>${h.docNo || '-'}</td>
      <td>${h.appliedAt || '-'}</td>
      <td><strong>${h.farmName}</strong><div style="font-size:11px;color:var(--text-secondary)">${h.owner || ''}</div></td>
      <td>${h.shipCount != null ? Number(h.shipCount).toLocaleString() + '수' : '-'}</td>
      <td>${h.shipWeek != null ? h.shipWeek + '주령' : '-'}</td>
      <td>${h.shipDate || '-'}</td>
      <td>${h.slaughterhouse || '-'}</td>
    </tr>`).join('');
}

function editSelectedHenShipment() {
  if (hsSelectedIds.size !== 1) return;
  openHenShipmentModal([...hsSelectedIds][0]);
}

async function deleteSelectedHenShipments() {
  if (!hsSelectedIds.size) return;
  if (!confirm(`선택한 산란성계 출하대장 ${hsSelectedIds.size}건을 삭제하시겠습니까?`)) return;
  try {
    for (const id of hsSelectedIds) await deleteRow('henShipments', id);
  } catch (e) { alert('삭제 실패: ' + e.message); return; }
  hsSelectedIds.clear();
  renderHenShipments();
}

// ─── 입력/편집 ─────────────────────────────────────────────────────────────
function openHenShipmentModal(id) {
  editingId.henShipment = id || null;
  const hs = id ? load('henShipments').find(x => x.id === id) : null;
  document.getElementById('modal-hs-title').textContent = id ? '산란성계 출하대장 편집' : '산란성계 출하대장 작성';

  const today = new Date().toISOString().slice(0, 10);
  populateFarmSelect('hs-farm', hs?.farmId || '');
  document.getElementById('hs-owner').value = hs?.owner || '';
  document.getElementById('hs-address').value = hs?.address || '';
  document.getElementById('hs-phone').value = hs?.phone || '';
  document.getElementById('hs-ship-count').value = hs?.shipCount ?? '';
  document.getElementById('hs-ship-week').value = hs?.shipWeek ?? '';
  document.getElementById('hs-ship-date').value = hs?.shipDate || '';
  document.getElementById('hs-slaughterhouse').value = hs?.slaughterhouse || '';
  document.getElementById('hs-reexam').checked = !!hs?.reexam;
  document.getElementById('hs-applied-at').value = hs?.appliedAt || today;
  document.getElementById('hs-request-org').value = hs?.requestOrg || HS_REQUEST_ORG;

  const docNoEl = document.getElementById('hs-doc-no');
  docNoEl.value = hs?.docNo || hsNextDocNo(hs?.appliedAt || today);
  delete docNoEl.dataset.manualEdit;

  onHsFarmChange(false);
  openModal('modal-hen-shipment');
}

async function saveHenShipment() {
  const farmId = document.getElementById('hs-farm').value;
  const appliedAt = document.getElementById('hs-applied-at').value;
  if (!farmId || !appliedAt) { alert('농장과 신청일은 필수입니다.'); return; }
  const farm = load('farms').find(f => f.id === farmId);
  const val = id => document.getElementById(id).value.trim();
  const numVal = id => { const v = document.getElementById(id).value; return v === '' ? null : Number(v); };
  const data = {
    docNo: val('hs-doc-no'), farmId, farmName: farm.name,
    owner: val('hs-owner'), address: val('hs-address'), phone: val('hs-phone'),
    shipCount: numVal('hs-ship-count'), shipWeek: numVal('hs-ship-week'),
    shipDate: val('hs-ship-date'), slaughterhouse: val('hs-slaughterhouse'),
    reexam: document.getElementById('hs-reexam').checked,
    appliedAt, requestOrg: val('hs-request-org'),
    createdByEmail: await currentUserEmail(),
  };
  let saved;
  try {
    if (editingId.henShipment) saved = await updateRow('henShipments', editingId.henShipment, data);
    else saved = await insertRow('henShipments', data);
  } catch (e) { alert('저장 실패: ' + e.message); return; }
  const isNew = !editingId.henShipment;
  editingId.henShipment = null;
  closeModal('modal-hen-shipment');
  populateHsFarmFilter();
  renderHenShipments();
  if (isNew && confirm('산란성계 출하대장을 저장했습니다. 지금 인쇄하시겠습니까?')) printHenShipment(saved.id);
}

// ─── A4 인쇄 ────────────────────────────────────────────────────────────────
function buildHenShipmentHtml(hs) {
  const n = v => (v == null || v === '' ? '' : Number(v).toLocaleString());
  return `
  <div class="print-page">
    <div class="hs-frame">
      <div class="ps-docno">No. ${hs.docNo || ''}</div>
      <div class="ps-title">산란성계 출하대장</div>

      <table class="hs-table">
        <tr><td class="lbl">1. 축&#8195;&#8195;종 :</td><td>${HS_FIXED.species}</td></tr>
        <tr><td class="lbl">2. 농장주 :</td><td>${hs.owner || ''} <span class="text-muted">${hs.phone || ''}</span></td></tr>
        <tr><td class="lbl">3. 농장주소 :</td><td>${hs.address || ''}</td></tr>
        <tr><td class="lbl">4. 도축장 출하 수수 :</td><td>${n(hs.shipCount)}${hs.shipCount != null ? ' 수' : ''}</td></tr>
        <tr><td class="lbl">5. 출하주령 :</td><td>${hs.shipWeek != null ? hs.shipWeek + ' 주령' : ''}</td></tr>
        <tr><td class="lbl">6. 시료종류 및 수량 :</td><td>${HS_FIXED.sampleSpec}</td></tr>
        <tr><td class="lbl">7. 검사항목 :</td><td>${HS_FIXED.testItems}</td></tr>
        <tr><td class="lbl">8. 출하(예정)일 :</td><td>${hs.shipDate || ''}</td></tr>
        <tr><td class="lbl">9. 출하(예정)도축장명 :</td><td>${hs.slaughterhouse || ''}</td></tr>
        <tr><td class="lbl">10. 기타사항 :</td><td>${HS_FIXED.etcNote}</td></tr>
        <tr><td></td><td>${hs.reexam ? '■' : '□'} 재검사</td></tr>
      </table>

      <div class="ps-request">신청일 &#8195;${rxFormatDateKo(hs.appliedAt)}</div>
      <div class="ps-request">의뢰기관명 &#8195;${hs.requestOrg || ''}</div>

      <div class="hs-signer">
        ${hs.owner || ''}
        <span class="hs-signature-wrap"><img class="hs-signature" src="img/hs-signature.png" alt=""></span>
        <span class="text-muted">(서명 또는 인)</span>
      </div>
    </div>
  </div>`;
}

function printHenShipment(id) {
  const hs = load('henShipments').find(x => x.id === id);
  if (!hs) return;
  document.getElementById('print-area').innerHTML = buildHenShipmentHtml(hs);
  setTimeout(() => window.print(), 200);
}

function printSelectedHenShipments() {
  const list = load('henShipments').filter(h => hsSelectedIds.has(h.id));
  if (!list.length) { alert('인쇄할 항목을 먼저 체크해주세요.'); return; }
  document.getElementById('print-area').innerHTML = list.map(buildHenShipmentHtml).join('');
  setTimeout(() => window.print(), 200);
}
