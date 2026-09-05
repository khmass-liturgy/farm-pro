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

// renderFarms()와 exportFarmsExcel()이 "화면에 지금 보이는 것과 내보내는 것을
// 같게" 유지하도록 같은 필터 로직을 공유한다.
function filteredFarms() {
  const q = (document.getElementById('farm-search')?.value||'').toLowerCase();
  const ft = document.getElementById('farm-filter-type')?.value||'';
  return load('farms').filter(f =>
    (!q || f.name.includes(q) || f.address.includes(q) || f.owner.includes(q)) &&
    (!ft || f.type === ft)
  );
}

function renderFarms() {
  let farms = filteredFarms();
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

// ─── 농장 목록 엑셀로 내보내기 ──────────────────────────────────────────────
// 사용자가 예전부터 써온 주소록.xlsx와 같은 열 순서(이름·농장명·동수·주소·전화번호·
// 사육수수·생년월일·축종·품종)로 내보낸다 — 다른 프로그램에서 그대로 열어보거나
// 인쇄해서 들고 다니기 위함. 검색·축종 필터를 걸어둔 채 누르면 그 결과만 담긴다.
function farmBreedNameFor(farmId) {
  const d = farmBreedDefault(farmId); // js/programs.js — 그 농장 계군(입추)에 입력된 품종
  if (!d) return '';
  const speciesKey = speciesKeyOf(d.species);
  return (speciesKey && CONSULT_BREEDS[speciesKey]?.breeds[d.breed]?.name) || d.breed || '';
}

function exportFarmsExcel() {
  const farms = filteredFarms();
  if (!farms.length) { alert('내보낼 농장이 없습니다.'); return; }
  const header = ['이름', '농장명', '동수', '주소', '전화번호', '사육수수', '생년월일', '축종', '품종'];
  const rows = farms.map(f => [
    f.owner || '', f.name || '', f.houses ?? '', f.address || '', f.phone || '',
    f.count ?? '',
    // 원본 주소록과 같은 표기(생년월일 앞 6자리, 구분자 없음)로 맞춘다.
    (f.owner_birth || '').replace(/-/g, '').slice(2),
    f.type || '', farmBreedNameFor(f.id),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 6 }, { wch: 38 }, { wch: 15 }, { wch: 10 }, { wch: 9 }, { wch: 8 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '주소록');
  XLSX.writeFile(wb, `농장주소록_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
