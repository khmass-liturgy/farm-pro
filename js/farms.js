// ─── 농장 관리 ────────────────────────────────────────────────────────────
// 담당 수의사는 항상 대한동물병원 최동명 수의사라 농장 등록/관리 화면(목록·입력창)에서는 항목을 뺐다.
// 이 기본값은 투약 프로그램 인쇄의 "수의사 연락처"·문자 발송의 발신번호 등에서 계속 쓴다.
const DEFAULT_VET_NAME = '최동명 수의사';
const DEFAULT_VET_PHONE = '010-9150-8844';

function openFarmModal(id) {
  editingId.farm = id || null;
  const farm = id ? load('farms').find(f => f.id === id) : null;
  document.getElementById('modal-farm-title').textContent = id ? '농장 편집' : '농장 등록';
  ['name','owner','type','count','address','phone','houses','focus','notes','owner-birth','barn-range'].forEach(k => {
    const el = document.getElementById('f-'+k);
    if (el) el.value = farm ? (farm[k.replace('-','_')] || '') : '';
  });
  // 축종 목록에서 '오리'를 뺐지만, 이미 '오리'로 저장된 농장을 편집할 때 그 값이
  // 사라지면 안 되므로 목록에 없는 값은 임시 option으로 살려둔다.
  ensureSelectOption(document.getElementById('f-type'), farm ? (farm.type || '') : '');
  if (farm) document.getElementById('f-type').value = farm.type || '육계';
  openModal('modal-farm');
}

async function saveFarm() {
  const name = document.getElementById('f-name').value.trim();
  const owner = document.getElementById('f-owner').value.trim();
  const address = document.getElementById('f-address').value.trim();
  if (!name || !owner || !address) { alert('농장명, 농장주, 주소는 필수 입력 항목입니다.'); return; }
  // 담당 수의사 칸은 화면에서 뺐지만 DB 열은 그대로라, 편집할 때 예전에 저장된 값이 지워지지 않게 그대로 넘긴다.
  const prev = editingId.farm ? load('farms').find(x => x.id === editingId.farm) : null;
  const data = {
    name, owner,
    type: document.getElementById('f-type').value,
    count: document.getElementById('f-count').value,
    address,
    phone: document.getElementById('f-phone').value.trim(),
    vet: prev?.vet || '',
    vet_phone: prev?.vet_phone || '',
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
  const list = load('farms').filter(f =>
    (!q || f.name.includes(q) || f.address.includes(q) || f.owner.includes(q)) &&
    (!ft || f.type === ft)
  );
  return sortFarms(list);
}

// ─── 목록 정렬 ─────────────────────────────────────────────────────────────
// 머리글(농장명·농장주·축종)을 누르면 오름차순 → 다시 누르면 내림차순. 다른 머리글을 누르면 그 열 오름차순.
// 같은 값끼리는 농장명 오름차순으로 묶어 순서가 흔들리지 않게 한다. 고른 정렬은 브라우저에 기억해 둔다.
let farmSort = (() => {
  try { const v = JSON.parse(localStorage.getItem('farmSort') || 'null'); if (v && v.key) return v; } catch (e) {}
  return { key: '', dir: 'asc' };
})();
function setFarmSort(key) {
  farmSort = farmSort.key === key
    ? { key, dir: farmSort.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: 'asc' };
  try { localStorage.setItem('farmSort', JSON.stringify(farmSort)); } catch (e) {}
  renderFarms();
}
function sortFarms(list) {
  const { key, dir } = farmSort;
  if (!key) return list;
  const cmp = (a, b) => String(a || '').localeCompare(String(b || ''), 'ko', { numeric: true });
  const sign = dir === 'desc' ? -1 : 1;
  return [...list].sort((a, b) => sign * cmp(a[key], b[key]) || cmp(a.name, b.name));
}
function updateFarmSortHeaders() {
  document.querySelectorAll('#page-farms th.th-sort').forEach(th => {
    const on = th.dataset.sort === farmSort.key;
    th.classList.toggle('sort-asc', on && farmSort.dir === 'asc');
    th.classList.toggle('sort-desc', on && farmSort.dir === 'desc');
  });
}

// ─── 상단 요약(등록 농장 수·전체 수수·육계·산란계) ─────────────────────────────
// 검색·필터와 상관없이 등록된 전체 농장 기준이다.
// 농장에 입추수수를 안 적은 경우(예전 데이터 등) 그 농장의 사육중 입추 기록 수수 합으로 대신 센다.
function farmHeadCount(farm, activeBatches) {
  const n = Number(farm.count);
  if (farm.count !== '' && farm.count != null && Number.isFinite(n) && n > 0) return { n, from: 'farm' };
  const sum = activeBatches.filter(b => b.farmId === farm.id)
    .reduce((s, b) => s + (Number(b.birdCount) || 0), 0);
  return sum > 0 ? { n: sum, from: 'batch' } : { n: 0, from: 'none' };
}
function renderFarmStats() {
  const el = document.getElementById('farm-stats');
  if (!el) return;
  const farms = load('farms');
  const active = load('batches').filter(b => b.status === 'active');
  const agg = (list) => list.reduce((a, f) => {
    const h = farmHeadCount(f, active);
    a.count++; a.birds += h.n;
    if (h.from === 'batch') a.fromBatch++;
    if (h.from === 'none') a.missing++;
    return a;
  }, { count: 0, birds: 0, fromBatch: 0, missing: 0 });
  const all = agg(farms);
  const broiler = agg(farms.filter(f => f.type === '육계'));
  const layer = agg(farms.filter(f => f.type === '산란계'));
  const others = all.count - broiler.count - layer.count;
  const fmt = n => n.toLocaleString();
  const note = a => [
    a.fromBatch ? `입추기록 반영 ${a.fromBatch}곳` : '',
    a.missing ? `수수 미입력 ${a.missing}곳` : '',
  ].filter(Boolean).join(' · ');
  const card = (label, value, unit, sub, title) =>
    `<div class="stat-card"${title ? ` title="${title}"` : ''}><div class="stat-label">${label}</div><div class="stat-value">${value}<span style="font-size:14px;font-weight:600;margin-left:3px">${unit}</span></div><div class="stat-sub">${sub || '&nbsp;'}</div></div>`;
  const missTitle = '농장 편집에서 입추수수를 입력하면 정확해집니다. 비어 있으면 사육중 입추 기록의 수수를 대신 셉니다.';
  el.innerHTML = [
    card('등록 전체 농장', fmt(all.count), '곳', `육계 ${broiler.count} · 산란계 ${layer.count}${others ? ` · 기타 ${others}` : ''}`),
    card('전체 수수', fmt(all.birds), '수', note(all) || '등록 농장 입추수수 합계', missTitle),
    card('육계', fmt(broiler.count), '곳', `${fmt(broiler.birds)}수${note(broiler) ? ' · ' + note(broiler) : ''}`, missTitle),
    card('산란계', fmt(layer.count), '곳', `${fmt(layer.birds)}수${note(layer) ? ' · ' + note(layer) : ''}`, missTitle),
  ].join('');
}

// 목록 왼쪽 체크박스로 고른 농장을 도구줄 「💛 카톡 발송」으로 한꺼번에 보낸다(출하전검사 등 목록과 같은 방식).
let farmSelectedIds = new Set();
function toggleFarmSelectAll(checked) {
  const ids = filteredFarms().map(f => f.id);
  ids.forEach(id => checked ? farmSelectedIds.add(id) : farmSelectedIds.delete(id));
  renderFarms();
}
function toggleFarmSelect(id, checked) {
  if (checked) farmSelectedIds.add(id); else farmSelectedIds.delete(id);
  renderFarms();
}
function kakaoSendSelectedFarms() {
  const farms = load('farms').filter(f => farmSelectedIds.has(f.id));
  const btn = document.getElementById('farm-kakao-btn');
  return kakaoSendFarms(farms, btn).finally(() => { if (btn) btn.disabled = farmSelectedIds.size === 0; });
}

function renderFarms() {
  renderFarmStats();
  updateFarmSortHeaders();
  const liveIds = new Set(load('farms').map(f => f.id));
  farmSelectedIds.forEach(id => { if (!liveIds.has(id)) farmSelectedIds.delete(id); });
  const kakaoBtn = document.getElementById('farm-kakao-btn');
  if (kakaoBtn && !kakaoDocBusy) kakaoBtn.disabled = farmSelectedIds.size === 0;
  const countEl = document.getElementById('farm-selected-count');
  if (countEl) countEl.textContent = farmSelectedIds.size ? `${farmSelectedIds.size}곳 선택` : '';
  let farms = filteredFarms();
  const badgeMap = { '육계':'badge-blue', '삼계':'badge-green', '산란계':'badge-red', '종계':'badge-teal', '토종닭':'badge-amber', '오리':'badge-teal', '기타':'badge-purple' };
  const tbody = document.getElementById('farm-tbody');
  const empty = document.getElementById('farm-empty');
  const checkAll = document.getElementById('farm-check-all');
  if (!farms.length) { tbody.innerHTML=''; empty.style.display=''; if (checkAll) checkAll.checked = false; return; }
  empty.style.display='none';
  if (checkAll) checkAll.checked = farms.every(f => farmSelectedIds.has(f.id));
  const activeBatches = load('batches').filter(b => b.status === 'active');
  // 입추수수 칸: 농장에 적은 값이 없으면 상단 요약과 같은 기준(사육중 입추 기록 합)으로 보여주고 출처를 표시한다.
  const countCell = f => {
    const h = farmHeadCount(f, activeBatches);
    if (h.from === 'farm') return h.n.toLocaleString() + '수';
    if (h.from === 'batch') return `${h.n.toLocaleString()}수 <span class="text-muted" style="font-size:11px" title="농장 정보에 입추수수가 비어 있어 사육중 입추 기록의 수수를 표시합니다">(입추기록)</span>`;
    return '-';
  };
  tbody.innerHTML = farms.map(f => `
    <tr>
      <td style="text-align:center"><input type="checkbox" ${farmSelectedIds.has(f.id) ? 'checked' : ''} onchange="toggleFarmSelect('${f.id}', this.checked)"></td>
      <td><strong>${f.name}</strong></td>
      <td>${f.owner}</td>
      <td><span class="badge ${badgeMap[f.type]||'badge-blue'}">${f.type}</span></td>
      <td style="color:var(--text-secondary)">${f.address}</td>
      <td>${f.phone||'-'}</td>
      <td>${countCell(f)}</td>
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
