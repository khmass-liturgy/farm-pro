// ─── 농장 관리 ────────────────────────────────────────────────────────────
// 담당 수의사는 항상 대한동물병원 최동명 수의사가 맡으므로 기본값으로 고정한다
// (기존 농장에 다른 값이 저장되어 있으면 그 값을 그대로 보여주고, 비어있을 때만 채움).
const DEFAULT_VET_NAME = '최동명 수의사';
const DEFAULT_VET_PHONE = '010-9150-8844';

function openFarmModal(id) {
  editingId.farm = id || null;
  const farm = id ? load('farms').find(f => f.id === id) : null;
  document.getElementById('modal-farm-title').textContent = id ? '농장 편집' : '농장 등록';
  ['name','owner','type','address','phone','vet','vet-phone','houses','focus','notes','owner-birth','barn-range'].forEach(k => {
    const el = document.getElementById('f-'+k);
    if (el) el.value = farm ? (farm[k.replace('-','_')] || '') : '';
  });
  // 축종 목록에서 '오리'를 뺐지만, 이미 '오리'로 저장된 농장을 편집할 때 그 값이
  // 사라지면 안 되므로 목록에 없는 값은 임시 option으로 살려둔다.
  ensureSelectOption(document.getElementById('f-type'), farm ? (farm.type || '') : '');
  if (farm) document.getElementById('f-type').value = farm.type || '육계';
  if (!document.getElementById('f-vet').value) document.getElementById('f-vet').value = DEFAULT_VET_NAME;
  if (!document.getElementById('f-vet-phone').value) document.getElementById('f-vet-phone').value = DEFAULT_VET_PHONE;
  openModal('modal-farm');
}

async function saveFarm() {
  const name = document.getElementById('f-name').value.trim();
  const owner = document.getElementById('f-owner').value.trim();
  const address = document.getElementById('f-address').value.trim();
  if (!name || !owner || !address) { alert('농장명, 농장주, 주소는 필수 입력 항목입니다.'); return; }
  const data = {
    name, owner,
    type: document.getElementById('f-type').value,
    count: document.getElementById('f-count').value,
    address,
    phone: document.getElementById('f-phone').value.trim(),
    vet: document.getElementById('f-vet').value.trim(),
    vet_phone: document.getElementById('f-vet-phone').value.trim(),
    houses: document.getElementById('f-houses').value,
    focus: document.getElementById('f-focus').value.trim(),
    notes: document.getElementById('f-notes').value.trim(),
    owner_birth: document.getElementById('f-owner-birth').value || null,
    barn_range: document.getElementById('f-barn-range').value.trim(),
  };
  try {
    if (editingId.farm) await updateRow('farms', editingId.farm, data);
    else await insertRow('farms', data);
  } catch (e) { alert('저장 실패: ' + e.message); return; }
  closeModal('modal-farm');
  renderFarms();
}

async function deleteFarm(id) {
  if (!confirm('이 농장을 삭제하시겠습니까?')) return;
  try { await deleteRow('farms', id); }
  catch (e) { alert('삭제 실패: 이 농장에 연결된 입추 기록이 있으면 먼저 삭제해야 합니다.\n(' + e.message + ')'); return; }
  renderFarms();
}

function renderFarms() {
  const q = (document.getElementById('farm-search')?.value||'').toLowerCase();
  const ft = document.getElementById('farm-filter-type')?.value||'';
  let farms = load('farms').filter(f =>
    (!q || f.name.includes(q) || f.address.includes(q) || f.owner.includes(q)) &&
    (!ft || f.type === ft)
  );
  const badgeMap = { '육계':'badge-blue', '삼계':'badge-green', '산란계':'badge-red', '토종닭':'badge-amber', '오리':'badge-teal', '기타':'badge-purple' };
  const tbody = document.getElementById('farm-tbody');
  const empty = document.getElementById('farm-empty');
  if (!farms.length) { tbody.innerHTML=''; empty.style.display=''; return; }
  empty.style.display='none';
  tbody.innerHTML = farms.map(f => `
    <tr>
      <td><strong>${f.name}</strong></td>
      <td>${f.owner}</td>
      <td><span class="badge ${badgeMap[f.type]||'badge-blue'}">${f.type}</span></td>
      <td style="color:var(--text-secondary)">${f.address}</td>
      <td>${f.phone||'-'}</td>
      <td>${f.count ? Number(f.count).toLocaleString()+'수' : '-'}</td>
      <td>${f.vet || DEFAULT_VET_NAME}</td>
      <td><div class="flex-gap">
        <button class="btn btn-outline btn-sm" onclick="openFarmModal('${f.id}')">편집</button>
        <button class="btn btn-danger btn-sm" onclick="deleteFarm('${f.id}')">삭제</button>
      </div></td>
    </tr>`).join('');
}
