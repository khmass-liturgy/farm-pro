// ─── 처방전 발급 (수의사법 시행규칙 [별지 제10호서식]) ────────────────────
// 병원/판매업체 고정 정보 — 실제 사업자 정보로 하드코딩
const RX_CLINIC = { name: '대한동물병원', phone: '010-9150-8844', bizNo: '141-04-74801', vetName: '최동명', licenseNo: '8433' };
const RX_PHARMACY = { name: '대한가축약품', ceo: '조민형', pharmacistName: '김숙자', pharmacistLicenseNo: '4973' };
const RX_MAX_ITEMS = 4; // 원본 서식의 처방내역/판매내역 표가 4행

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

// ─── 처방 품목(최대 4개) 슬롯 ───────────────────────────────────────────────
let rxItemSlotCount = 0;

function rxProductOptionsHtml(selectedId) {
  const products = load('rxProducts');
  let opts = '<option value="">제품 선택</option>';
  opts += products.map(p =>
    `<option value="${p.id}"${p.id === selectedId ? ' selected' : ''}>${p.name}${p.purpose ? ' - ' + p.purpose : ''}</option>`
  ).join('');
  return opts;
}

function initRxItemSlots(existingItems) {
  rxItemSlotCount = 0;
  const wrap = document.getElementById('rx-items-wrap');
  wrap.innerHTML = '';
  if (existingItems && existingItems.length) existingItems.forEach(it => addRxItemSlot(it));
  else addRxItemSlot();
  updateRxAddItemButton();
}

function updateRxAddItemButton() {
  const btn = document.getElementById('rx-add-item-btn');
  if (btn) btn.style.display = rxItemSlotCount >= RX_MAX_ITEMS ? 'none' : '';
}

function addRxItemSlot(existing) {
  if (rxItemSlotCount >= RX_MAX_ITEMS) return;
  const idx = rxItemSlotCount++;
  const wrap = document.getElementById('rx-items-wrap');
  const div = document.createElement('div');
  div.id = `rx-item-slot-${idx}`;
  div.style.cssText = 'position:relative; background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:12px 14px; margin-bottom:10px;';
  div.innerHTML = `
    ${idx > 0 ? `<button type="button" onclick="removeRxItemSlot(${idx})" title="삭제"
      style="position:absolute; top:8px; right:8px; background:var(--red-bg); color:var(--red); border:none; border-radius:4px; padding:2px 8px; cursor:pointer; font-size:13px;">×</button>` : ''}
    <div style="font-size:11px; font-weight:700; color:var(--text-secondary); margin-bottom:8px;">품목 ${idx + 1}</div>
    <div class="form-row">
      <div class="form-group"><label>제품 *</label>
        <select id="rxi-product-${idx}" onchange="onRxItemProductChange(${idx})">${rxProductOptionsHtml(existing?.productId || '')}</select>
      </div>
      <div class="form-group"><label>유통기한 <span class="text-muted">(선택)</span></label><input id="rxi-expiry-${idx}" type="date" value="${existing?.expiryDate || ''}"></div>
    </div>
    <div class="text-muted mb-16" id="rxi-summary-${idx}">제품을 선택하면 성분/용법/휴약기간이 자동으로 채워집니다.</div>
    <div class="form-row">
      <div class="form-group"><label>처방일수 *</label><input id="rxi-days-${idx}" type="number" min="1" placeholder="예) 3" value="${existing?.days || ''}" oninput="updateRxItemDosePreview(${idx})"></div>
      <div class="form-group"><label>판매수량 *</label><input id="rxi-qty-${idx}" type="number" min="0" step="0.01" placeholder="예) 12" value="${existing?.quantity ?? ''}" oninput="updateRxItemDosePreview(${idx})"></div>
    </div>
    <div class="text-muted mb-16" id="rxi-dose-${idx}">1회투여량(용량) = 판매수량 ÷ 처방일수</div>
    <div class="form-group"><label>비고 <span class="text-muted">(선택, 비워두면 제품의 사용목적이 표시됩니다)</span></label><input id="rxi-note-${idx}" value="${existing?.note || ''}" placeholder="예) 대장균증치료"></div>`;
  wrap.appendChild(div);
  onRxItemProductChange(idx);
  updateRxItemDosePreview(idx);
  updateRxAddItemButton();
}

function removeRxItemSlot(idx) {
  const el = document.getElementById(`rx-item-slot-${idx}`);
  if (el) el.remove();
  updateRxAddItemButton();
}

function onRxItemProductChange(idx) {
  const sel = document.getElementById(`rxi-product-${idx}`);
  const product = load('rxProducts').find(p => p.id === sel?.value);
  const summary = document.getElementById(`rxi-summary-${idx}`);
  if (!summary) return;
  if (!product) { summary.textContent = '제품을 선택하면 성분/용법/휴약기간이 자동으로 채워집니다.'; return; }
  const parts = [
    `성분 ${product.ingredient || '-'}`, `용법 ${product.usage_method}`,
    `휴약기간 ${product.withdrawal_days != null ? product.withdrawal_days + '일' : '-'}`,
  ];
  summary.textContent = parts.join(' · ');
}

function updateRxItemDosePreview(idx) {
  const days = Number(document.getElementById(`rxi-days-${idx}`)?.value);
  const qty = Number(document.getElementById(`rxi-qty-${idx}`)?.value);
  const el = document.getElementById(`rxi-dose-${idx}`);
  if (!el) return;
  if (days > 0 && qty > 0) {
    el.textContent = `1회투여량(용량) = ${qty} ÷ ${days}일 = ${(qty / days).toFixed(2).replace(/\.?0+$/, '')}`;
  } else {
    el.textContent = '1회투여량(용량) = 판매수량 ÷ 처방일수';
  }
}

function collectRxItems() {
  const items = [];
  const products = load('rxProducts');
  for (let idx = 0; idx < rxItemSlotCount; idx++) {
    const sel = document.getElementById(`rxi-product-${idx}`);
    if (!sel) continue; // 삭제된 슬롯
    const productId = sel.value;
    const days = document.getElementById(`rxi-days-${idx}`).value;
    const quantity = document.getElementById(`rxi-qty-${idx}`).value;
    if (!productId && !days && !quantity) continue; // 완전히 빈 슬롯은 건너뜀
    if (!productId || !days || !quantity) return { error: `품목 ${idx + 1}: 제품/처방일수/판매수량을 모두 입력해주세요.` };
    const product = products.find(p => p.id === productId);
    items.push({
      productId, productName: product.name, ingredient: product.ingredient,
      usageMethod: product.usage_method, purpose: product.purpose, withdrawalDays: product.withdrawal_days,
      days: Number(days), quantity: Number(quantity),
      expiryDate: document.getElementById(`rxi-expiry-${idx}`).value || null,
      note: document.getElementById(`rxi-note-${idx}`).value.trim() || null,
    });
  }
  return { items };
}

// ─── 처방전 발급/편집 ────────────────────────────────────────────────────
function openRxPrescriptionModal(id) {
  editingId.prescription = id || null;
  const rx = id ? load('prescriptions').find(p => p.id === id) : null;
  populateFarmSelect('rx-farm', rx?.farmId || '');
  document.getElementById('rx-issue-date').value = rx?.issueDate || new Date().toISOString().slice(0, 10);
  document.getElementById('rx-scope').value = rx?.scope || 'group';
  onRxFarmChange();
  initRxItemSlots(rx?.items || []);
  openModal('modal-prescription');
}

async function saveRxPrescription() {
  const farmId = document.getElementById('rx-farm').value;
  const issueDate = document.getElementById('rx-issue-date').value;
  if (!farmId || !issueDate) { alert('농장과 발급일은 필수입니다.'); return; }
  const { items, error } = collectRxItems();
  if (error) { alert(error); return; }
  if (!items.length) { alert('처방 품목을 1개 이상 입력해주세요.'); return; }
  const farm = load('farms').find(f => f.id === farmId);
  const data = {
    issueDate, scope: document.getElementById('rx-scope').value,
    farmId, farmName: farm.name, owner: farm.owner, phone: farm.phone,
    ownerBirth: farm.owner_birth, animalType: farm.type, headCount: farm.count, barnRange: farm.barn_range,
    items,
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
  const list = load('prescriptions').filter(p => {
    const productNames = (p.items || []).map(it => it.productName).join(' ').toLowerCase();
    return (!q || (p.farmName || '').toLowerCase().includes(q) || productNames.includes(q)) &&
      (!ff || p.farmId === ff);
  });
  const tbody = document.getElementById('rx-tbody');
  const empty = document.getElementById('rx-empty');
  if (!list.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  tbody.innerHTML = list.map(p => {
    const items = p.items || [];
    const productLabel = items.map(it => it.productName).join(', ') || '-';
    return `
    <tr>
      <td>${p.issueNo != null ? '#' + p.issueNo : '-'}</td>
      <td>${p.issueDate}</td>
      <td><strong>${p.farmName}</strong></td>
      <td>${p.owner || '-'}</td>
      <td>${productLabel}</td>
      <td>${items.length}개</td>
      <td><div class="flex-gap">
        <button class="btn btn-primary btn-sm" onclick="printPrescription('${p.id}')">🖨️ 인쇄</button>
        <button class="btn btn-outline btn-sm" onclick="openRxPrescriptionModal('${p.id}')">편집</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRxPrescription('${p.id}')">삭제</button>
      </div></td>
    </tr>`;
  }).join('');
}

// ─── A4 인쇄 (실제 처방전 PDF 좌표를 그대로 옮긴 15열 그리드로 재현) ────────
function rxFormatDocNo(rx) {
  const ymd = (rx.issueDate || '').replace(/-/g, '');
  return `${RX_CLINIC.licenseNo}${ymd}${rx.issueNo ?? ''}`;
}

// 유효기간 = 발급일 + 1년. DB의 valid_until(generated column)을 우선 쓰고,
// 아직 supabase/schema.sql을 재실행하지 않아 컬럼이 없는 환경을 위해 클라이언트에서도 계산한다.
function rxValidUntil(rx) {
  if (rx.validUntil) return rx.validUntil;
  // Date.UTC + toISOString(둘 다 UTC 기준)으로 계산해야 한다. new Date(str+'T00:00:00')는
  // 로컬시간으로 파싱되므로, UTC+9(한국) 브라우저에서 toISOString() 결과가 하루 당겨진다.
  const [y, m, d] = rx.issueDate.split('-').map(Number);
  return new Date(Date.UTC(y + 1, m - 1, d)).toISOString().slice(0, 10);
}

function rxFormatDateKo(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-');
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}

// 실제 처방전 PDF를 좌표 단위로 측정해 그대로 옮긴 15열×31행 CSS Grid 좌표.
// rx-cell(col1,col2,row1,row2)는 그 좌표에 해당하는 그리드 영역에 라벨/값 한 칸을 그려준다.
function rxCell(cls, c1, c2, r1, r2, content) {
  return `<div class="rx-cell ${cls}" style="grid-column:${c1}/${c2};grid-row:${r1}/${r2}">${content}</div>`;
}

function printPrescription(id) {
  const rx = load('prescriptions').find(p => p.id === id);
  if (!rx) return;
  const validUntil = rxValidUntil(rx);
  const indivMark = rx.scope === 'individual' ? '■' : ' ';
  const groupMark = rx.scope === 'group' ? '■' : ' ';
  const items = rx.items || [];
  const blankItem = { ingredient: '', productName: '', doseLabel: '', usageMethod: '', days: '', quantity: '', note: '', withdrawalDays: null, expiryDate: '' };
  const rows4 = Array.from({ length: RX_MAX_ITEMS }, (_, i) => {
    const it = items[i];
    if (!it) return { ...blankItem, empty: true };
    return { ...it, doseLabel: it.days > 0 ? (it.quantity / it.days).toFixed(2).replace(/\.?0+$/, '') : '-', note: it.note || it.purpose || '-', empty: false };
  });

  const cells = [
    rxCell('topline', 1, 16, 1, 2, '■ 수의사법 시행규칙 [별지 제10호서식]'),
    rxCell('title', 1, 16, 2, 3, '처 방 전'),

    rxCell('metabar', 1, 4, 3, 4, ''),
    rxCell('metabar', 4, 9, 3, 4, rxFormatDateKo(rx.issueDate)),
    rxCell('metabar', 9, 13, 3, 4, '발급 번호'),
    rxCell('metabar', 13, 16, 3, 4, rxFormatDocNo(rx)),

    rxCell('note strong', 1, 5, 4, 5, '처방전 유효기간'),
    rxCell('note strong', 5, 9, 4, 5, `발급일부터 1년간 (~ ${validUntil})`),
    rxCell('note', 12, 16, 4, 5, '처방전 유효기간 내에 구매해야 합니다.'),

    rxCell('label tight vmid', 1, 2, 5, 9, `개별<br>처방<br>[${indivMark}]`),
    rxCell('label', 2, 5, 5, 6, '동물의 이름'),
    rxCell('value', 5, 8, 5, 6, ''),
    rxCell('label tight vmid', 9, 12, 5, 9, '동물의<br>소유자[■]<br>관리인[ ]'),
    rxCell('label', 13, 14, 5, 6, '성명'),
    rxCell('value', 14, 16, 5, 6, rx.owner || '-'),
    rxCell('label', 2, 5, 6, 7, '동물의 종류'),
    rxCell('value', 5, 8, 6, 7, ''),
    rxCell('label', 13, 14, 6, 7, '전화번호'),
    rxCell('value', 14, 16, 6, 7, rx.phone || '-'),
    rxCell('label', 2, 5, 7, 8, '성별/연령/체중'),
    rxCell('value', 5, 8, 7, 8, '암·수 / 세 / kg / 임신'),
    rxCell('label', 13, 14, 7, 8, '생년월일'),
    rxCell('value', 14, 16, 7, 8, rx.ownerBirth || '-'),
    rxCell('label', 2, 5, 8, 9, ''),
    rxCell('value', 5, 8, 8, 9, ''),
    rxCell('label', 13, 14, 8, 9, '농장명'),
    rxCell('value', 14, 16, 8, 9, rx.farmName),

    rxCell('label tight vmid', 1, 2, 9, 12, `군별<br>처방<br>[${groupMark}]`),
    rxCell('label', 2, 5, 9, 10, '축사번호'),
    rxCell('value', 5, 7, 9, 10, rx.barnRange || '-'),
    rxCell('label center', 7, 8, 9, 10, '동'),
    rxCell('label tight vmid', 9, 12, 9, 12, '동물병원[■]<br>축산농장[ ]'),
    rxCell('label', 13, 14, 9, 10, '명칭'),
    rxCell('value', 14, 16, 9, 10, RX_CLINIC.name),
    rxCell('label', 2, 5, 10, 11, '동물의 종류'),
    rxCell('value', 5, 8, 10, 11, rx.animalType || '-'),
    rxCell('label', 13, 14, 10, 11, '전화번호'),
    rxCell('value', 14, 16, 10, 11, RX_CLINIC.phone),
    rxCell('label', 2, 5, 11, 12, '마릿수'),
    rxCell('value', 5, 8, 11, 12, rx.headCount ? Number(rx.headCount).toLocaleString() + '수' : '-'),
    rxCell('label', 13, 14, 11, 12, '사업자번호'),
    rxCell('value', 14, 16, 11, 12, RX_CLINIC.bizNo),

    rxCell('label', 1, 5, 12, 13, '처방 수의사'),
    rxCell('value stamp-anchor', 5, 9, 12, 13, `${RX_CLINIC.vetName} (서명/날인)<img class="rx-stamp rx-stamp-hospital" src="img/rx-stamp-hospital.png" alt="">`),
    rxCell('label', 9, 13, 12, 13, '면허번호'),
    rxCell('value', 13, 16, 12, 13, `제 ${RX_CLINIC.licenseNo} 호`),

    rxCell('label', 1, 2, 14, 16, '필/선'),
    rxCell('label', 2, 9, 14, 15, '성분명'),
    rxCell('label', 2, 6, 15, 16, '성분명'),
    rxCell('label', 6, 9, 15, 16, '권장제품명'),
    rxCell('label', 9, 12, 14, 16, '용량<br>(1회투여량)'),
    rxCell('label', 12, 13, 14, 16, '용법'),
    rxCell('label', 13, 14, 14, 16, '처방일수<br>(투약일수)'),
    rxCell('label', 14, 15, 14, 16, '판매수량<br>(포장단위)'),
    rxCell('label', 15, 16, 14, 16, '비고'),

    ...rows4.flatMap((it, i) => {
      const r1 = 16 + i, r2 = r1 + 1;
      return [
        rxCell('value center', 1, 2, r1, r2, it.empty ? '-' : '선'),
        rxCell('value pre', 2, 6, r1, r2, it.empty ? '-' : (it.ingredient || '-')),
        rxCell('value strong', 6, 9, r1, r2, it.empty ? '-' : it.productName),
        rxCell('value center', 9, 12, r1, r2, it.empty ? '-' : it.doseLabel),
        rxCell('value center', 12, 13, r1, r2, it.empty ? '-' : (it.usageMethod || '-')),
        rxCell('value center', 13, 14, r1, r2, it.empty ? '-' : `${it.days}일`),
        rxCell('value center', 14, 15, r1, r2, it.empty ? '-' : it.quantity),
        rxCell('value', 15, 16, r1, r2, it.empty ? '-' : it.note),
      ];
    }),

    rxCell('section-title', 1, 16, 21, 22, '의약품 판매 내용'),

    rxCell('label', 1, 4, 22, 23, '판매기관'),
    rxCell('label', 4, 5, 22, 23, '명칭'),
    rxCell('value', 5, 9, 22, 23, RX_PHARMACY.name),
    rxCell('label', 9, 11, 22, 23, '대표자 성명'),
    rxCell('value center', 11, 16, 22, 23, RX_PHARMACY.ceo),

    rxCell('label', 1, 4, 23, 24, '판매 약사'),
    rxCell('label', 4, 5, 23, 24, '성명'),
    rxCell('value stamp-anchor', 5, 9, 23, 24, `${RX_PHARMACY.pharmacistName}<img class="rx-stamp rx-stamp-pharmacist" src="img/rx-stamp-pharmacist.png" alt="">`),
    rxCell('label', 9, 11, 23, 24, '면허번호'),
    rxCell('value center', 11, 16, 23, 24, RX_PHARMACY.pharmacistLicenseNo),

    rxCell('label', 1, 4, 24, 25, '판매 연월일'),
    rxCell('value', 4, 9, 24, 25, rx.issueDate),
    rxCell('label', 9, 11, 24, 25, '비고'),
    rxCell('value', 11, 16, 24, 25, ''),

    rxCell('label', 1, 2, 26, 27, '필/선'),
    rxCell('label', 2, 7, 26, 27, '판매제품명(제조사)'),
    rxCell('label', 7, 10, 26, 27, '규격<br>(포장단위)'),
    rxCell('label', 10, 13, 26, 27, '판매량'),
    rxCell('label', 13, 14, 26, 27, '유통기한'),
    rxCell('label', 14, 15, 26, 27, '휴약기간'),
    rxCell('label', 15, 16, 26, 27, '비고'),

    ...rows4.flatMap((it, i) => {
      const r1 = 27 + i, r2 = r1 + 1;
      return [
        rxCell('value center', 1, 2, r1, r2, it.empty ? '-' : '선'),
        rxCell('value strong', 2, 7, r1, r2, it.empty ? '-' : it.productName),
        rxCell('value center', 7, 10, r1, r2, it.empty ? '-' : '개'),
        rxCell('value center', 10, 13, r1, r2, it.empty ? '-' : Math.round(it.quantity)),
        rxCell('value center', 13, 14, r1, r2, it.empty ? '-' : (it.expiryDate || '-')),
        rxCell('value center', 14, 15, r1, r2, it.empty ? '-' : (it.withdrawalDays != null ? it.withdrawalDays + '일' : '-')),
        rxCell('value', 15, 16, r1, r2, it.empty ? '-' : it.note),
      ];
    }),

    rxCell('footer', 1, 16, 31, 32, '210㎜×297㎜(일반용지 60g/㎡(재활용품))'),
  ].join('');

  const html = `<div class="print-page"><div class="rx-grid">${cells}</div></div>`;

  document.getElementById('print-area').innerHTML = html;
  closeModal('modal-prescription');
  setTimeout(() => window.print(), 200);
}
