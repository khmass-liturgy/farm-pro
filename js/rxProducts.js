// ─── 처방전용 제품 관리 ────────────────────────────────────────────────────
function openRxProductModal(id) {
  editingId.rxProduct = id || null;
  const p = id ? load('rxProducts').find(x => x.id === id) : null;
  document.getElementById('modal-rxp-title').textContent = id ? '처방전용 제품 편집' : '처방전용 제품 등록';
  ['name','ingredient','withdrawal-days','purpose','dose-amount'].forEach(k => {
    const el = document.getElementById('rxp-'+k);
    if (el) el.value = p ? (p[k.replace(/-/g,'_')] ?? '') : '';
  });
  document.getElementById('rxp-category').value = p?.category || '액상';
  document.getElementById('rxp-usage-method').value = p?.usage_method || '음수';
  openModal('modal-rxproduct');
}

async function saveRxProduct() {
  const name = document.getElementById('rxp-name').value.trim();
  if (!name) { alert('제품명은 필수입니다.'); return; }
  const data = {
    name,
    ingredient: document.getElementById('rxp-ingredient').value.trim(),
    withdrawal_days: document.getElementById('rxp-withdrawal-days').value,
    purpose: document.getElementById('rxp-purpose').value.trim(),
    dose_amount: document.getElementById('rxp-dose-amount').value.trim(),
    category: document.getElementById('rxp-category').value,
    usage_method: document.getElementById('rxp-usage-method').value,
  };
  try {
    if (editingId.rxProduct) await updateRow('rxProducts', editingId.rxProduct, data);
    else await insertRow('rxProducts', data);
  } catch (e) { alert('저장 실패: ' + e.message); return; }
  closeModal('modal-rxproduct');
  renderRxProducts();
}

async function deleteRxProduct(id) {
  if (!confirm('삭제하시겠습니까?')) return;
  try { await deleteRow('rxProducts', id); } catch (e) { alert('삭제 실패: ' + e.message); return; }
  renderRxProducts();
}

function renderRxProducts() {
  const q = (document.getElementById('rxp-search')?.value || '').toLowerCase();
  const products = load('rxProducts').filter(p =>
    !q || p.name.toLowerCase().includes(q) || (p.ingredient || '').toLowerCase().includes(q)
  );
  const tbody = document.getElementById('rxp-tbody');
  const empty = document.getElementById('rxp-empty');
  if (!products.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  const catColors = { '액상': 'badge-blue', '수용산': 'badge-teal', '백신': 'badge-green', '기타': 'badge-purple' };
  tbody.innerHTML = products.map(p => `
    <tr>
      <td><strong>${p.name}</strong></td>
      <td style="color:var(--text-secondary); white-space:pre-line">${p.ingredient || '-'}</td>
      <td>${p.withdrawal_days != null ? '<span class="badge badge-red">' + p.withdrawal_days + '일</span>' : '-'}</td>
      <td>${p.purpose || '-'}</td>
      <td>${p.dose_amount || '-'}</td>
      <td><span class="badge ${catColors[p.category] || 'badge-blue'}">${p.category}</span></td>
      <td>${p.usage_method}</td>
      <td><div class="flex-gap">
        <button class="btn btn-outline btn-sm" onclick="openRxProductModal('${p.id}')">편집</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRxProduct('${p.id}')">삭제</button>
      </div></td>
    </tr>`).join('');
}
