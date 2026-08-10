// ─── 처방전 발급 (수의사법 시행규칙 [별지 제10호서식]) ────────────────────
// 병원/판매업체 고정 정보 — 실제 사업자 정보로 하드코딩
const RX_CLINIC = { name: '대한동물병원', phone: '010-9150-8844', bizNo: '141-04-74801', vetName: '최동명', licenseNo: '8433' };
const RX_PHARMACY = { name: '대한가축약품', ceo: '조민형', pharmacistName: '김숙자', pharmacistLicenseNo: '4973' };

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

// ─── A4 인쇄 (실제 처방전 서식과 동일한 21열 그리드로 재현) ─────────────────
function rxFormatDocNo(rx) {
  const ymd = (rx.issueDate || '').replace(/-/g, '');
  return `${RX_CLINIC.licenseNo}${ymd}${rx.issueNo ?? ''}`;
}

// 유효기간 = 발급일 + 1년. DB의 valid_until(generated column)을 우선 쓰고,
// 아직 supabase/schema.sql을 재실행하지 않아 컬럼이 없는 환경을 위해 클라이언트에서도 계산한다.
function rxValidUntil(rx) {
  if (rx.validUntil) return rx.validUntil;
  // Date.UTC + toISOString (둘 다 UTC 기준)으로 계산해야 한다. new Date(str+'T00:00:00')는
  // 로컬시간으로 파싱되므로, UTC+9(한국) 브라우저에서 toISOString() 결과가 하루 당겨진다.
  const [y, m, d] = rx.issueDate.split('-').map(Number);
  return new Date(Date.UTC(y + 1, m - 1, d)).toISOString().slice(0, 10);
}

function rxFormatDateKo(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-');
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}

// 원본 엑셀 서식(출력서식(대한))의 실제 열너비(A~U, 21열)/행높이 비율을 그대로 옮긴
// CSS Grid 좌표. rx-cell(col1,col2,row1,row2)는 그 좌표에 해당하는 그리드 영역에
// 라벨/값 한 칸을 그려준다(엑셀의 병합 셀 범위와 1:1 대응).
function rxCell(cls, c1, c2, r1, r2, content) {
  return `<div class="rx-cell ${cls}" style="grid-column:${c1}/${c2};grid-row:${r1}/${r2}">${content}</div>`;
}

function printPrescription(id) {
  const rx = load('prescriptions').find(p => p.id === id);
  if (!rx) return;
  const dosePerAdmin = rx.days > 0 ? (rx.quantity / rx.days).toFixed(2).replace(/\.?0+$/, '') : '-';
  const note = rx.note || rx.purpose || '-';
  const validUntil = rxValidUntil(rx);
  const indivMark = rx.scope === 'individual' ? '■' : ' ';
  const groupMark = rx.scope === 'group' ? '■' : ' ';

  const cells = [
    rxCell('topline', 1, 22, 1, 2, '■ 수의사법 시행규칙 [별지 제10호서식]'),
    rxCell('title', 1, 22, 2, 3, '처 방 전'),

    rxCell('value center', 3, 13, 4, 5, rxFormatDateKo(rx.issueDate)),
    rxCell('label center', 13, 17, 4, 5, '발급 번호'),
    rxCell('value center', 17, 20, 4, 5, rxFormatDocNo(rx)),

    rxCell('label', 1, 5, 5, 6, '처방전 유효기간'),
    rxCell('value', 5, 13, 5, 6, `발급일부터 1년간 (~ ${validUntil})`),
    rxCell('note', 13, 22, 5, 6, '처방전 유효기간 내에 구매해야 합니다.'),

    rxCell('label tight vmid', 1, 2, 7, 11, `개별<br>처방<br>[${indivMark}]`),
    rxCell('label', 2, 7, 7, 9, '동물의 이름'),
    rxCell('value', 7, 13, 7, 9, ''),
    rxCell('label tight vmid', 13, 17, 7, 11, `동물의<br>소유자[■]<br>관리인[ ]`),
    rxCell('label', 17, 19, 7, 8, '성명'),
    rxCell('value', 19, 22, 7, 8, rx.owner || '-'),
    rxCell('label', 17, 19, 8, 9, '전화번호'),
    rxCell('value', 19, 22, 8, 9, rx.phone || '-'),
    rxCell('label', 2, 7, 9, 10, '동물의 종류'),
    rxCell('value', 7, 13, 9, 10, ''),
    rxCell('label', 17, 19, 9, 10, '생년월일'),
    rxCell('value', 19, 22, 9, 10, rx.ownerBirth || '-'),
    rxCell('label', 2, 7, 10, 11, '성별/연령/체중'),
    rxCell('value', 7, 13, 10, 11, '암·수 / 세 / kg / 임신'),
    rxCell('label', 17, 19, 10, 11, '농장명'),
    rxCell('value', 19, 22, 10, 11, rx.farmName),

    rxCell('label tight vmid', 1, 2, 11, 14, `군별<br>처방<br>[${groupMark}]`),
    rxCell('label', 2, 7, 11, 12, '축사번호'),
    rxCell('value', 7, 11, 11, 12, rx.barnRange || '-'),
    rxCell('label center', 11, 13, 11, 12, '동'),
    rxCell('label tight vmid', 13, 17, 11, 14, `동물병원[■]<br>축산농장[ ]`),
    rxCell('label', 17, 19, 11, 12, '명칭'),
    rxCell('value', 19, 22, 11, 12, RX_CLINIC.name),
    rxCell('label', 2, 7, 12, 13, '동물의 종류'),
    rxCell('value', 7, 13, 12, 13, rx.animalType || '-'),
    rxCell('label', 17, 19, 12, 13, '전화번호'),
    rxCell('value', 19, 22, 12, 13, RX_CLINIC.phone),
    rxCell('label', 2, 7, 13, 14, '마릿수'),
    rxCell('value', 7, 13, 13, 14, rx.headCount ? Number(rx.headCount).toLocaleString() + '수' : '-'),
    rxCell('label', 17, 19, 13, 14, '사업자번호'),
    rxCell('value', 19, 22, 13, 14, RX_CLINIC.bizNo),

    rxCell('label', 1, 7, 14, 15, '처방 수의사'),
    rxCell('value stamp-anchor', 7, 13, 14, 15, `${RX_CLINIC.vetName} (서명/날인)<img class="rx-stamp rx-stamp-hospital" src="img/rx-stamp-hospital.png" alt="">`),
    rxCell('label', 13, 17, 14, 15, '면허번호'),
    rxCell('value', 17, 22, 14, 15, `제 ${RX_CLINIC.licenseNo} 호`),

    rxCell('header', 1, 2, 16, 18, '필/선'),
    rxCell('header', 2, 8, 16, 18, '성분명'),
    rxCell('header', 8, 13, 16, 18, '권장제품명'),
    rxCell('header', 13, 16, 16, 18, '용량<br>(1회투여량)'),
    rxCell('header', 16, 18, 16, 18, '용법'),
    rxCell('header', 18, 19, 16, 18, '처방일수<br>(투약일수)'),
    rxCell('header', 19, 20, 16, 18, '판매수량<br>(포장단위)'),
    rxCell('header', 20, 22, 16, 18, '비고'),

    rxCell('value center', 1, 2, 18, 19, '선'),
    rxCell('value pre', 2, 8, 18, 19, rx.ingredient || '-'),
    rxCell('value strong', 8, 13, 18, 19, rx.productName),
    rxCell('value center', 13, 16, 18, 19, dosePerAdmin),
    rxCell('value center', 16, 18, 18, 19, rx.usageMethod || '-'),
    rxCell('value center', 18, 19, 18, 19, `${rx.days}일`),
    rxCell('value center', 19, 20, 18, 19, rx.quantity),
    rxCell('value', 20, 22, 18, 19, note),

    rxCell('section-title', 1, 22, 20, 21, '의약품 판매 내용'),

    rxCell('label', 1, 4, 21, 22, '판매기관'),
    rxCell('label', 4, 8, 21, 22, '명칭'),
    rxCell('value', 8, 12, 21, 22, RX_PHARMACY.name),
    rxCell('label', 12, 16, 21, 22, '대표자 성명'),
    rxCell('value', 16, 22, 21, 22, RX_PHARMACY.ceo),

    rxCell('label', 1, 4, 22, 23, '판매 약사'),
    rxCell('label', 4, 8, 22, 23, '성명'),
    rxCell('value stamp-anchor', 8, 12, 22, 23, `${RX_PHARMACY.pharmacistName}<img class="rx-stamp rx-stamp-pharmacist" src="img/rx-stamp-pharmacist.png" alt="">`),
    rxCell('label', 12, 16, 22, 23, '면허번호'),
    rxCell('value', 16, 22, 22, 23, RX_PHARMACY.pharmacistLicenseNo),

    rxCell('label', 1, 4, 23, 24, '판매 연월일'),
    rxCell('value', 4, 12, 23, 24, rx.issueDate),
    rxCell('label', 12, 16, 23, 24, '비고'),
    rxCell('value', 16, 22, 23, 24, ''),

    rxCell('header', 1, 2, 25, 26, '필/선'),
    rxCell('header', 2, 11, 25, 26, '판매제품명(제조사)'),
    rxCell('header', 11, 15, 25, 26, '규격<br>(포장단위)'),
    rxCell('header', 15, 18, 25, 26, '판매량'),
    rxCell('header', 18, 19, 25, 26, '유통기한'),
    rxCell('header', 19, 20, 25, 26, '휴약기간'),
    rxCell('header', 20, 22, 25, 26, '비고'),

    rxCell('value center', 1, 2, 26, 27, '선'),
    rxCell('value strong', 2, 11, 26, 27, rx.productName),
    rxCell('value center', 11, 15, 26, 27, '개'),
    rxCell('value center', 15, 18, 26, 27, Math.round(rx.quantity)),
    rxCell('value center', 18, 19, 26, 27, rx.expiryDate || '-'),
    rxCell('value center', 19, 20, 26, 27, rx.withdrawalDays != null ? rx.withdrawalDays + '일' : '-'),
    rxCell('value', 20, 22, 26, 27, note),

    rxCell('footer', 1, 22, 27, 28, '210㎜×297㎜(일반용지 60g/㎡(재활용품))'),
  ].join('');

  const html = `<div class="print-page"><div class="rx-grid">${cells}</div></div>`;

  document.getElementById('print-area').innerHTML = html;
  closeModal('modal-prescription');
  setTimeout(() => window.print(), 200);
}
