// ─── 처방전 발급 (수의사법 시행규칙 [별지 제10호서식]) ────────────────────
// 병원/판매업체 고정 정보 — 실제 사업자 정보로 하드코딩
const RX_CLINIC = { name: '대한동물병원', phone: '010-9150-8844', bizNo: '141-04-74801', vetName: '최동명', licenseNo: '8433' };
const RX_PHARMACY = { name: '대한가축약품', ceo: '조민형', pharmacistName: '김숙자', pharmacistLicenseNo: '4973' };
const RX_VALID_DAYS = 7;

function populateRxProductSelect(val) {
  const products = load('rxProducts');
  const sel = document.getElementById('rx-product');
  if (!sel) return;
  sel.innerHTML = '<option value="">제품 선택</option>' + products.map(p =>
    `<option value="${p.id}"${p.id === val ? ' selected' : ''}>${p.name}${p.purpose ? ' - ' + p.purpose : ''}</option>`
  ).join('');
}

function populateRxFarmFilter() {
  const farms = load('farms');
  const sel = document.getElementById('rx-filter-farm');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">전체 농장</option>' + farms.map(f =>
    `<option value="${f.id}"${f.id === cur ? ' selected' : ''}>${f.name}</option>`
  ).join('');
}

function onRxFarmChange() {
  const farmId = document.getElementById('rx-farm').value;
  const farm = load('farms').find(f => f.id === farmId);
  const summary = document.getElementById('rx-farm-summary');
  if (!farm) { summary.textContent = '농장을 선택하면 농장주/전화번호/축종/마릿수 정보가 자동으로 채워집니다.'; return; }
  const parts = [
    `농장주 ${farm.owner || '-'}`, `전화 ${farm.phone || '-'}`, `축종 ${farm.type || '-'}`,
    `마릿수 ${farm.count ? Number(farm.count).toLocaleString() + '수' : '-'}`,
    `축사번호 ${farm.barn_range || '-'}`, `생년월일 ${farm.owner_birth || '-'}`,
  ];
  summary.textContent = parts.join(' · ');
}

function onRxProductChange() {
  const productId = document.getElementById('rx-product').value;
  const product = load('rxProducts').find(p => p.id === productId);
  const summary = document.getElementById('rx-product-summary');
  if (!product) { summary.textContent = '제품을 선택하면 성분/용법/휴약기간이 자동으로 채워집니다.'; return; }
  const parts = [
    `성분 ${product.ingredient || '-'}`, `용법 ${product.usage_method}`,
    `휴약기간 ${product.withdrawal_days != null ? product.withdrawal_days + '일' : '-'}`,
  ];
  summary.textContent = parts.join(' · ');
}

function updateRxDosePreview() {
  const days = Number(document.getElementById('rx-days').value);
  const qty = Number(document.getElementById('rx-quantity').value);
  const el = document.getElementById('rx-dose-preview');
  if (days > 0 && qty > 0) {
    el.textContent = `1회투여량(용량) = ${qty} ÷ ${days}일 = ${(qty / days).toFixed(2).replace(/\.?0+$/, '')}`;
  } else {
    el.textContent = '1회투여량(용량) = 판매수량 ÷ 처방일수';
  }
}

function openRxPrescriptionModal(id) {
  editingId.prescription = id || null;
  const rx = id ? load('prescriptions').find(p => p.id === id) : null;
  populateFarmSelect('rx-farm', rx?.farmId || '');
  populateRxProductSelect(rx?.productId || '');
  document.getElementById('rx-issue-date').value = rx?.issueDate || new Date().toISOString().slice(0, 10);
  document.getElementById('rx-scope').value = rx?.scope || 'group';
  document.getElementById('rx-expiry-date').value = rx?.expiryDate || '';
  document.getElementById('rx-days').value = rx?.days || '';
  document.getElementById('rx-quantity').value = rx?.quantity || '';
  document.getElementById('rx-note').value = rx?.note || '';
  onRxFarmChange();
  onRxProductChange();
  updateRxDosePreview();
  openModal('modal-prescription');
}

async function saveRxPrescription() {
  const farmId = document.getElementById('rx-farm').value;
  const productId = document.getElementById('rx-product').value;
  const issueDate = document.getElementById('rx-issue-date').value;
  const days = document.getElementById('rx-days').value;
  const quantity = document.getElementById('rx-quantity').value;
  if (!farmId || !productId || !issueDate || !days || !quantity) {
    alert('농장, 제품, 발급일, 처방일수, 판매수량은 필수입니다.'); return;
  }
  const farm = load('farms').find(f => f.id === farmId);
  const product = load('rxProducts').find(p => p.id === productId);
  const data = {
    issueDate, scope: document.getElementById('rx-scope').value,
    farmId, farmName: farm.name, owner: farm.owner, phone: farm.phone,
    ownerBirth: farm.owner_birth, animalType: farm.type, headCount: farm.count, barnRange: farm.barn_range,
    productId, productName: product.name, ingredient: product.ingredient,
    usageMethod: product.usage_method, purpose: product.purpose, withdrawalDays: product.withdrawal_days,
    days, quantity, expiryDate: document.getElementById('rx-expiry-date').value || null,
    note: document.getElementById('rx-note').value.trim() || null,
    issuedByEmail: await currentUserEmail(),
  };
  let saved;
  try {
    if (editingId.prescription) saved = await updateRow('prescriptions', editingId.prescription, data);
    else saved = await insertRow('prescriptions', data);
  } catch (e) { alert('저장 실패: ' + e.message); return; }
  const isNew = !editingId.prescription;
  closeModal('modal-prescription');
  populateRxFarmFilter();
  renderPrescriptions();
  if (isNew && confirm('처방전을 발급했습니다. 지금 인쇄하시겠습니까?')) printPrescription(saved.id);
}

async function deleteRxPrescription(id) {
  if (!confirm('이 처방전을 삭제하시겠습니까?')) return;
  try { await deleteRow('prescriptions', id); } catch (e) { alert('삭제 실패: ' + e.message); return; }
  renderPrescriptions();
}

function renderPrescriptions() {
  const q = (document.getElementById('rx-search')?.value || '').toLowerCase();
  const ff = document.getElementById('rx-filter-farm')?.value || '';
  const list = load('prescriptions').filter(p =>
    (!q || (p.farmName || '').toLowerCase().includes(q) || (p.productName || '').toLowerCase().includes(q)) &&
    (!ff || p.farmId === ff)
  );
  const tbody = document.getElementById('rx-tbody');
  const empty = document.getElementById('rx-empty');
  if (!list.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  tbody.innerHTML = list.map(p => `
    <tr>
      <td>${p.issueNo != null ? '#' + p.issueNo : '-'}</td>
      <td>${p.issueDate}</td>
      <td><strong>${p.farmName}</strong></td>
      <td>${p.owner || '-'}</td>
      <td>${p.productName}</td>
      <td>${p.days}일</td>
      <td>${p.quantity}</td>
      <td><div class="flex-gap">
        <button class="btn btn-primary btn-sm" onclick="printPrescription('${p.id}')">🖨️ 인쇄</button>
        <button class="btn btn-outline btn-sm" onclick="openRxPrescriptionModal('${p.id}')">편집</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRxPrescription('${p.id}')">삭제</button>
      </div></td>
    </tr>`).join('');
}

// ─── A4 인쇄 ─────────────────────────────────────────────────────────────
function rxFormatDocNo(rx) {
  const ymd = (rx.issueDate || '').replace(/-/g, '');
  return `${RX_CLINIC.licenseNo}${ymd}${rx.issueNo ?? ''}`;
}

function printPrescription(id) {
  const rx = load('prescriptions').find(p => p.id === id);
  if (!rx) return;
  const isGroup = rx.scope !== 'individual';
  const dosePerAdmin = rx.days > 0 ? (rx.quantity / rx.days).toFixed(2).replace(/\.?0+$/, '') : '-';
  const note = rx.note || rx.purpose || '-';

  const html = `
  <div class="print-page">
    <div class="rx-topline">■ 수의사법 시행규칙 [별지 제10호서식]</div>
    <div class="rx-title">처 방 전</div>
    <div class="rx-meta-row">
      <span>발급번호: <strong>${rxFormatDocNo(rx)}</strong></span>
      <span>발급일: <strong>${rx.issueDate}</strong></span>
    </div>
    <div class="rx-validity">
      <span>처방전 유효기간: 발급일부터 ( ${RX_VALID_DAYS} )일간</span>
      <span>처방전 유효기간 내에 구매해야 합니다.</span>
    </div>

    <div class="rx-info-cols">
      <table class="rx-form-table">
        <tr class="rx-scope-row"><td colspan="2">${isGroup ? '군별처방 [■] / 개별처방 [ ]' : '개별처방 [■] / 군별처방 [ ]'}</td></tr>
        <tr><td class="rx-label">동물의 종류</td><td class="rx-value">${rx.animalType || '-'}</td></tr>
        <tr><td class="rx-label">축사번호</td><td class="rx-value">${rx.barnRange || '-'}</td></tr>
        <tr><td class="rx-label">마릿수</td><td class="rx-value">${rx.headCount ? Number(rx.headCount).toLocaleString() + '수' : '-'}</td></tr>
        <tr><td class="rx-label">처방 수의사</td><td class="rx-value">${RX_CLINIC.vetName} (서명/날인)</td></tr>
      </table>
      <table class="rx-form-table">
        <tr><td class="rx-label">동물의 소유자 성명</td><td class="rx-value">${rx.owner || '-'}</td></tr>
        <tr><td class="rx-label">전화번호</td><td class="rx-value">${rx.phone || '-'}</td></tr>
        <tr><td class="rx-label">생년월일</td><td class="rx-value">${rx.ownerBirth || '-'}</td></tr>
        <tr><td class="rx-label">농장명</td><td class="rx-value">${rx.farmName}</td></tr>
        <tr><td class="rx-label">동물병원 명칭</td><td class="rx-value">${RX_CLINIC.name}</td></tr>
        <tr><td class="rx-label">사업자번호</td><td class="rx-value">${RX_CLINIC.bizNo}</td></tr>
        <tr><td class="rx-label">면허번호</td><td class="rx-value">제 ${RX_CLINIC.licenseNo} 호</td></tr>
      </table>
    </div>

    <div class="rx-section-title">처방 내역</div>
    <table class="rx-table">
      <thead><tr><th>성분명</th><th>권장제품명</th><th>용량<br>(1회투여량)</th><th>용법</th><th>처방일수<br>(투약일수)</th><th>판매수량<br>(포장단위)</th><th>비고</th></tr></thead>
      <tbody><tr>
        <td style="white-space:pre-line">${rx.ingredient || '-'}</td>
        <td><strong>${rx.productName}</strong></td>
        <td>${dosePerAdmin}</td>
        <td>${rx.usageMethod || '-'}</td>
        <td>${rx.days}일</td>
        <td>${rx.quantity}</td>
        <td>${note}</td>
      </tr></tbody>
    </table>

    <div class="rx-section-title">의약품 판매 내용</div>
    <table class="rx-form-table">
      <tr><td class="rx-label">판매기관</td><td class="rx-value">${RX_PHARMACY.name} (대표자 ${RX_PHARMACY.ceo})</td></tr>
      <tr><td class="rx-label">판매 약사</td><td class="rx-value">${RX_PHARMACY.pharmacistName} (면허번호 ${RX_PHARMACY.pharmacistLicenseNo})</td></tr>
      <tr><td class="rx-label">판매 연월일</td><td class="rx-value">${rx.issueDate}</td></tr>
    </table>
    <table class="rx-table">
      <thead><tr><th>판매제품명(제조사)</th><th>규격<br>(포장단위)</th><th>판매량</th><th>유통기한</th><th>휴약기간</th><th>비고</th></tr></thead>
      <tbody><tr>
        <td><strong>${rx.productName}</strong></td>
        <td>개</td>
        <td>${Math.round(rx.quantity)}</td>
        <td>${rx.expiryDate || '-'}</td>
        <td>${rx.withdrawalDays != null ? rx.withdrawalDays + '일' : '-'}</td>
        <td>${note}</td>
      </tr></tbody>
    </table>

    <div class="print-sign">
      <div class="print-sign-box">처방 수의사 (서명/날인)</div>
      <div class="print-sign-box">판매 약사 (서명/날인)</div>
      <div class="print-sign-box">농 장 주 확인</div>
    </div>

    <div class="rx-footer-note">210㎜×297㎜(일반용지 60g/㎡(재활용품))</div>
  </div>`;

  document.getElementById('print-area').innerHTML = html;
  closeModal('modal-prescription');
  setTimeout(() => window.print(), 200);
}
