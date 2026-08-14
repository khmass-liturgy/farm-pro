// ─── 백업/복원 (클라우드 데이터 기준) ──────────────────────────────────────
function backupData() {
  const data = {};
  Object.keys(TABLES).forEach(k => { data[k] = load(k); });
  data._meta = { version: '2.0', exportedAt: new Date().toISOString(), source: 'cloud' };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '농장투약관리_백업_' + new Date().toLocaleDateString('ko-KR').replace(/\. /g,'-').replace('.','') + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

async function restoreData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function (ev) {
    try {
      const data = JSON.parse(ev.target.result);
      if (data._meta?.source !== 'cloud') {
        alert('이 파일은 구버전(로컬 저장) 백업 형식입니다. 아래 "로컬 데이터 클라우드로 업로드" 기능을 사용하세요.');
        return;
      }
      if (!confirm(`백업 파일을 복원하면 동일 id의 데이터가 덮어씌워집니다.\n내보낸 날짜: ${data._meta?.exportedAt||'알 수 없음'}\n\n계속하시겠습니까?`)) return;
      for (const key of ['farms','drugs','vaccines','feeds','programs','batches','medicationLogs','clinicalAssessments']) {
        const rows = data[key];
        if (!rows || !rows.length) continue;
        const cfg = TABLES[key];
        const payload = rows.map(o => ({ id: o.id, ...cfg.toRow(o) }));
        const { error } = await sb.from(cfg.table).upsert(payload);
        if (error) throw error;
      }
      await refreshAllStores();
      alert('복원 완료!');
      showPage('dashboard');
    } catch (err) { alert('복원 실패: ' + err.message); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

async function clearAllData() {
  if (!confirm('⚠️ 모든 데이터가 삭제됩니다. 반드시 백업 후 진행하세요.\n\n정말로 삭제하시겠습니까?')) return;
  if (!confirm('마지막 확인입니다. 정말 전체 데이터를 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return;
  try {
    for (const table of ['medication_logs','batches','programs','feeds','vaccines','drugs','farms']) {
      const { error } = await sb.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
    }
    await refreshAllStores();
    alert('데이터가 초기화되었습니다.');
    showPage('dashboard');
  } catch (e) { alert('초기화 실패: ' + e.message); }
}

// ─── 로컬(localStorage) 데이터 → 클라우드 1회 업로드 ─────────────────────
// 구버전(localStorage 기반) 앱에서 내보낸 백업 JSON을 읽어 새 UUID를 발급하며
// Supabase로 옮긴다. 되돌릴 수 없고, 같은 파일을 다시 업로드하면 중복 생성된다.
async function importLocalBackupToCloud(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function (ev) {
    try {
      const data = JSON.parse(ev.target.result);
      if (data._meta?.source === 'cloud') {
        alert('이 파일은 이미 클라우드 백업 형식입니다. 위쪽의 "JSON 파일 복원" 기능을 사용하세요.');
        return;
      }
      if (!confirm('구버전(로컬) 백업을 클라우드로 업로드합니다.\n이 작업은 되돌릴 수 없고, 같은 파일을 다시 업로드하면 데이터가 중복 생성됩니다.\n\n계속하시겠습니까?')) return;

      const farmIdMap = {}, drugIdMap = {}, vaccineIdMap = {}, feedIdMap = {};

      for (const f of (data.farms || [])) {
        const { data: row, error } = await sb.from('farms').insert({
          name: f.name, owner: f.owner, type: f.type, count: f.count || null, address: f.address,
          phone: f.phone || null, vet: f.vet || null, vet_phone: f.vet_phone || null,
          houses: f.houses || null, focus: f.focus || null, notes: f.notes || null,
        }).select().single();
        if (error) throw error;
        farmIdMap[f.id] = row.id;
      }
      for (const d of (data.drugs || [])) {
        const { data: row, error } = await sb.from('drugs').insert({
          name: d.name, type: d.type, ingredient: d.ingredient || null, maker: d.maker || null,
          dose: d.dose || null, withdrawal: d.withdrawal || null, indication: d.indication || null, notes: d.notes || null,
        }).select().single();
        if (error) throw error;
        drugIdMap[d.id] = row.id;
      }
      for (const v of (data.vaccines || [])) {
        const { data: row, error } = await sb.from('vaccines').insert({
          name: v.name, disease: v.disease || null, method: v.method, age: v.age || null, dilution: v.dilution || null, notes: v.notes || null,
        }).select().single();
        if (error) throw error;
        vaccineIdMap[v.id] = row.id;
      }
      for (const fd of (data.feeds || [])) {
        const { data: row, error } = await sb.from('feeds').insert({
          name: fd.name, type: fd.type, ingredient: fd.ingredient || null, maker: fd.maker || null,
          dose: fd.dose || null, period: fd.period || null, effect: fd.effect || null, notes: fd.notes || null,
        }).select().single();
        if (error) throw error;
        feedIdMap[fd.id] = row.id;
      }
      for (const p of (data.programs || [])) {
        const legacyDays = p.days || [];
        const days = legacyDays.map(d => {
          const legacyNames = d.drugList || (d.drug ? d.drug.split('+').map(s => s.trim()).filter(Boolean) : []);
          const drugs = legacyNames.map(name => {
            const matched = (data.drugs || []).find(x => x.name === name);
            return { drugId: matched ? (drugIdMap[matched.id] || null) : null, name };
          });
          let vaccine = null;
          if (d.vaccine) {
            const matchedV = (data.vaccines || []).find(x => x.name === d.vaccine);
            vaccine = { vaccineId: matchedV ? (vaccineIdMap[matchedV.id] || null) : null, name: d.vaccine };
          }
          return { day: d.day, drugs, vaccine, note: d.note || '' };
        });
        const feedItems = (p.feedItems || []).map(it => ({
          feedId: it.feedId && feedIdMap[it.feedId] ? feedIdMap[it.feedId] : (it.feedId === '__custom__' ? '__custom__' : null),
          name: it.name, dose: it.dose, period: it.period,
        }));
        const { error } = await sb.from('programs').insert({
          farm_id: farmIdMap[p.farmId] || null, farm_name_snapshot: p.farmName || null,
          name: p.name, duration: p.duration || 30, focus: p.focus || null, notes: p.notes || null,
          feed_memo: p.feedMemo || null, feed_items: feedItems, days,
        });
        if (error) throw error;
      }

      await refreshAllStores();
      alert('클라우드 업로드 완료! 대시보드로 이동합니다.');
      showPage('dashboard');
    } catch (err) { alert('업로드 실패: ' + err.message); }
  };
  reader.readAsText(file);
  e.target.value = '';
}
