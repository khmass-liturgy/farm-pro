// ─── 약품 관리 ────────────────────────────────────────────────────────────
function openDrugModal(id) {
  editingId.drug = id || null;
  const drug = id ? load('drugs').find(d => d.id === id) : null;
  document.getElementById('modal-drug-title').textContent = id ? '약품 편집' : '약품 등록';
  ['name','type','ingredient','maker','dose','withdrawal','indication','notes'].forEach(k => {
    const el = document.getElementById('d-'+k);
    if(el) el.value = drug ? (drug[k]||'') : '';
  });
  if(drug) document.getElementById('d-type').value = drug.type||'항생제';
  document.getElementById('d-dose-basis').value = '';
  document.getElementById('d-dose-amount').value = '';
  document.getElementById('d-dose').dataset.autoValue = ''; // 선택기가 마지막으로 채운 값(수동 입력과 구분용)
  document.getElementById('d-name-search-results').innerHTML = '';
  openModal('modal-drug');
}
// 표준 용법/용량 선택 시 "표준 용량/방법" 입력칸을 채워준다(직접 수정 가능한 보조 선택기).
// 사용자가 이미 직접 값을 입력/수정했다면(선택기가 채운 값과 다르면) 덮어쓰지 않는다.
function applyDoseSelects() {
  const doseEl = document.getElementById('d-dose');
  const basis = document.getElementById('d-dose-basis').value;
  const amount = document.getElementById('d-dose-amount').value;
  if (!basis && !amount) return;
  if (doseEl.value !== '' && doseEl.value !== doseEl.dataset.autoValue) return;
  const combined = [basis, amount].filter(Boolean).join(' ');
  doseEl.value = combined;
  doseEl.dataset.autoValue = combined;
}
async function saveDrug() {
  const name = document.getElementById('d-name').value.trim();
  if (!name) { alert('약품명은 필수입니다.'); return; }
  const data = {
    name,
    type: document.getElementById('d-type').value,
    ingredient: document.getElementById('d-ingredient').value.trim(),
    maker: document.getElementById('d-maker').value.trim(),
    dose: document.getElementById('d-dose').value.trim(),
    withdrawal: document.getElementById('d-withdrawal').value.trim(),
    indication: document.getElementById('d-indication').value.trim(),
    notes: document.getElementById('d-notes').value.trim(),
  };
  try {
    if (editingId.drug) await updateRow('drugs', editingId.drug, data);
    else await insertRow('drugs', data);
  } catch (e) { alert('저장 실패: ' + e.message); return; }
  closeModal('modal-drug');
  renderDrugs();
}
async function deleteDrug(id) {
  if (!confirm('삭제하시겠습니까?')) return;
  try { await deleteRow('drugs', id); } catch (e) { alert('삭제 실패: ' + e.message); return; }
  renderDrugs();
}
function renderDrugs() {
  const q = (document.getElementById('drug-search')?.value||'').toLowerCase();
  const ft = document.getElementById('drug-filter-type')?.value||'';
  let drugs = load('drugs').filter(d =>
    (!q || d.name.toLowerCase().includes(q) || (d.ingredient||'').toLowerCase().includes(q)) &&
    (!ft || d.type === ft)
  );
  const tbody = document.getElementById('drug-tbody');
  const empty = document.getElementById('drug-empty');
  const typeColors = { '항생제':'badge-blue', '콕시듐제':'badge-green', '영양제':'badge-amber', '소독제':'badge-teal', '성장촉진제':'badge-purple', '대사촉진제':'badge-red', '기타':'badge-red' };
  if (!drugs.length) { tbody.innerHTML=''; empty.style.display=''; return; }
  empty.style.display='none';
  tbody.innerHTML = drugs.map(d => `
    <tr>
      <td><strong>${d.name}</strong></td>
      <td><span class="badge ${typeColors[d.type]||'badge-blue'}">${d.type}</span></td>
      <td style="color:var(--text-secondary)">${d.ingredient||'-'}</td>
      <td>${d.dose||'-'}</td>
      <td>${d.withdrawal ? '<span class="badge badge-red">'+d.withdrawal+'</span>' : '-'}</td>
      <td>${d.indication||'-'}</td>
      <td style="color:var(--text-secondary)">${d.notes||'-'}</td>
      <td><div class="flex-gap">
        <button class="btn btn-outline btn-sm" onclick="openDrugModal('${d.id}')">편집</button>
        <button class="btn btn-danger btn-sm" onclick="deleteDrug('${d.id}')">삭제</button>
      </div></td>
    </tr>`).join('');
}

// ─── 백신 관리 ────────────────────────────────────────────────────────────
function openVaccineModal(id) {
  editingId.vaccine = id || null;
  const v = id ? load('vaccines').find(x => x.id === id) : null;
  document.getElementById('modal-vacc-title').textContent = id ? '백신 편집' : '백신 등록';
  ['name','disease','method','age','dilution','notes'].forEach(k => {
    const el = document.getElementById('v-'+k);
    if(el) el.value = v ? (v[k]||'') : '';
  });
  if(v) document.getElementById('v-method').value = v.method||'음수백신';
  openModal('modal-vaccine');
}
async function saveVaccine() {
  const name = document.getElementById('v-name').value.trim();
  if (!name) { alert('백신명은 필수입니다.'); return; }
  const data = {
    name,
    disease: document.getElementById('v-disease').value.trim(),
    method: document.getElementById('v-method').value,
    age: document.getElementById('v-age').value.trim(),
    dilution: document.getElementById('v-dilution').value.trim(),
    notes: document.getElementById('v-notes').value.trim(),
  };
  try {
    if (editingId.vaccine) await updateRow('vaccines', editingId.vaccine, data);
    else await insertRow('vaccines', data);
  } catch (e) { alert('저장 실패: ' + e.message); return; }
  closeModal('modal-vaccine');
  renderVaccines();
}
async function deleteVaccine(id) {
  if (!confirm('삭제하시겠습니까?')) return;
  try { await deleteRow('vaccines', id); } catch (e) { alert('삭제 실패: ' + e.message); return; }
  renderVaccines();
}
function renderVaccines() {
  const q = (document.getElementById('vacc-search')?.value||'').toLowerCase();
  let vaccines = load('vaccines').filter(v =>
    !q || v.name.toLowerCase().includes(q) || (v.disease||'').toLowerCase().includes(q)
  );
  const tbody = document.getElementById('vacc-tbody');
  const empty = document.getElementById('vacc-empty');
  const methodColors = { '음수백신':'badge-blue', '분무백신':'badge-green', '점안':'badge-amber', '근육주사':'badge-red', '기타':'badge-purple' };
  if (!vaccines.length) { tbody.innerHTML=''; empty.style.display=''; return; }
  empty.style.display='none';
  tbody.innerHTML = vaccines.map(v => `
    <tr>
      <td><strong>${v.name}</strong></td>
      <td>${v.disease||'-'}</td>
      <td><span class="badge ${methodColors[v.method]||'badge-blue'}">${v.method}</span></td>
      <td>${v.age||'-'}</td>
      <td>${v.dilution||'-'}</td>
      <td style="color:var(--text-secondary)">${v.notes||'-'}</td>
      <td><div class="flex-gap">
        <button class="btn btn-outline btn-sm" onclick="openVaccineModal('${v.id}')">편집</button>
        <button class="btn btn-danger btn-sm" onclick="deleteVaccine('${v.id}')">삭제</button>
      </div></td>
    </tr>`).join('');
}

// ─── 사료첨가제 관리 ──────────────────────────────────────────────────────
function openFeedModal(id) {
  editingId.feed = id || null;
  const f = id ? load('feeds').find(x => x.id === id) : null;
  document.getElementById('modal-feed-title').textContent = id ? '사료첨가제 편집' : '사료첨가제 등록';
  ['name','type','ingredient','maker','dose','period','effect','notes'].forEach(k => {
    const el = document.getElementById('fd-'+k);
    if(el) el.value = f ? (f[k]||'') : '';
  });
  if(f) document.getElementById('fd-type').value = f.type||'영양제·비타민';
  openModal('modal-feed');
}
async function saveFeed() {
  const name = document.getElementById('fd-name').value.trim();
  if (!name) { alert('제품명은 필수입니다.'); return; }
  const data = {
    name,
    type: document.getElementById('fd-type').value,
    ingredient: document.getElementById('fd-ingredient').value.trim(),
    maker: document.getElementById('fd-maker').value.trim(),
    dose: document.getElementById('fd-dose').value.trim(),
    period: document.getElementById('fd-period').value.trim(),
    effect: document.getElementById('fd-effect').value.trim(),
    notes: document.getElementById('fd-notes').value.trim(),
  };
  try {
    if (editingId.feed) await updateRow('feeds', editingId.feed, data);
    else await insertRow('feeds', data);
  } catch (e) { alert('저장 실패: ' + e.message); return; }
  closeModal('modal-feed');
  renderFeeds();
}
async function deleteFeed(id) {
  if (!confirm('삭제하시겠습니까?')) return;
  try { await deleteRow('feeds', id); } catch (e) { alert('삭제 실패: ' + e.message); return; }
  renderFeeds();
}
function renderFeeds() {
  const q = (document.getElementById('feed-search')?.value||'').toLowerCase();
  const ft = document.getElementById('feed-filter-type')?.value||'';
  let feeds = load('feeds').filter(f =>
    (!q || f.name.toLowerCase().includes(q) || (f.ingredient||'').toLowerCase().includes(q)) &&
    (!ft || f.type === ft)
  );
  const tbody = document.getElementById('feed-tbody');
  const empty = document.getElementById('feed-empty');
  const typeColors = {'영양제·비타민':'badge-amber','성장촉진제':'badge-purple','항곰팡이제':'badge-red','소화효소제':'badge-green','유산균·프로바이오틱':'badge-teal','면역증강제':'badge-blue','콕시듐예방':'badge-green','기타':'badge-blue'};
  if (!feeds.length) { tbody.innerHTML=''; empty.style.display=''; return; }
  empty.style.display='none';
  tbody.innerHTML = feeds.map(f => `
    <tr>
      <td><strong>${f.name}</strong></td>
      <td><span class="badge ${typeColors[f.type]||'badge-blue'}">${f.type}</span></td>
      <td style="color:var(--text-secondary)">${f.ingredient||'-'}</td>
      <td><strong>${f.dose||'-'}</strong></td>
      <td style="color:var(--text-secondary)">${f.period||'-'}</td>
      <td style="color:var(--text-secondary)">${f.maker||'-'}</td>
      <td style="color:var(--text-secondary)">${f.notes||'-'}</td>
      <td><div class="flex-gap">
        <button class="btn btn-outline btn-sm" onclick="openFeedModal('${f.id}')">편집</button>
        <button class="btn btn-danger btn-sm" onclick="deleteFeed('${f.id}')">삭제</button>
      </div></td>
    </tr>`).join('');
}
