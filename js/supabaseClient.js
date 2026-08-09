// Supabase 클라이언트 초기화 + 동기 STORE 캐시.
//
// 기존 앱의 render*()/populate*Select()/getDrugOptions() 등 수십 곳이
// load(key)를 "동기 함수"로 가정하고 호출한다. 이를 깨지 않기 위해
// 부팅 시 refreshAllStores()로 전체 테이블을 한 번에 읽어 STORE에 캐싱하고,
// load(key)는 항상 STORE[key]를 동기적으로 반환한다.
// 저장(insertRow/updateRow/deleteRow)만 async로 Supabase에 접근한다.

const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const STORE = { farms: [], drugs: [], vaccines: [], feeds: [], programs: [], batches: [], medicationLogs: [] };

// 현재 편집 중인 각 엔티티의 id. 여러 feature 파일이 공유하는 전역 상태라 여기서 한 번만 선언한다.
const editingId = { farm: null, drug: null, vaccine: null, feed: null, program: null, batch: null, medicationLog: null };

// key(JS 쪽에서 쓰는 이름) -> { table, orderBy, ascending, columns(insert/update 시 허용 필드), toRow, fromRow }
const TABLES = {
  farms: {
    table: 'farms', orderBy: 'created_at', ascending: true,
    toRow(o) {
      return {
        name: o.name, owner: o.owner, type: o.type,
        count: o.count === '' || o.count == null ? null : Number(o.count),
        address: o.address, phone: o.phone || null, vet: o.vet || null, vet_phone: o.vet_phone || null,
        houses: o.houses === '' || o.houses == null ? null : Number(o.houses),
        focus: o.focus || null, notes: o.notes || null,
      };
    },
    fromRow(r) { return { ...r }; },
  },
  drugs: {
    table: 'drugs', orderBy: 'created_at', ascending: true,
    toRow(o) {
      return {
        name: o.name, type: o.type, ingredient: o.ingredient || null, maker: o.maker || null,
        dose: o.dose || null, withdrawal: o.withdrawal || null, indication: o.indication || null, notes: o.notes || null,
      };
    },
    fromRow(r) { return { ...r }; },
  },
  vaccines: {
    table: 'vaccines', orderBy: 'created_at', ascending: true,
    toRow(o) {
      return { name: o.name, disease: o.disease || null, method: o.method, age: o.age || null, dilution: o.dilution || null, notes: o.notes || null };
    },
    fromRow(r) { return { ...r }; },
  },
  feeds: {
    table: 'feeds', orderBy: 'created_at', ascending: true,
    toRow(o) {
      return {
        name: o.name, type: o.type, ingredient: o.ingredient || null, maker: o.maker || null,
        dose: o.dose || null, period: o.period || null, effect: o.effect || null, notes: o.notes || null,
      };
    },
    fromRow(r) { return { ...r }; },
  },
  programs: {
    table: 'programs', orderBy: 'created_at', ascending: true,
    toRow(o) {
      return {
        farm_id: o.farmId || null, farm_name_snapshot: o.farmName || null,
        name: o.name, duration: Number(o.duration) || 30, focus: o.focus || null, notes: o.notes || null,
        feed_memo: o.feedMemo || null, feed_items: o.feedItems || [], days: o.days || [],
      };
    },
    fromRow(r) {
      return {
        id: r.id, farmId: r.farm_id, farmName: r.farm_name_snapshot,
        name: r.name, duration: r.duration, focus: r.focus, notes: r.notes,
        feedMemo: r.feed_memo, feedItems: r.feed_items || [], days: r.days || [],
        createdAt: r.created_at,
      };
    },
  },
  batches: {
    table: 'batches', orderBy: 'placement_date', ascending: false,
    toRow(o) {
      return {
        farm_id: o.farmId, program_id: o.programId || null, program_name_snapshot: o.programName || null,
        house: o.house || null, placement_date: o.placementDate,
        bird_count: o.birdCount === '' || o.birdCount == null ? null : Number(o.birdCount),
        status: o.status || 'active', end_date: o.endDate || null, notes: o.notes || null,
      };
    },
    fromRow(r) {
      return {
        id: r.id, farmId: r.farm_id, programId: r.program_id, programName: r.program_name_snapshot,
        house: r.house, placementDate: r.placement_date, birdCount: r.bird_count,
        status: r.status, endDate: r.end_date, notes: r.notes, createdAt: r.created_at,
      };
    },
  },
  medicationLogs: {
    table: 'medication_logs', orderBy: 'log_date', ascending: false,
    toRow(o) {
      return {
        batch_id: o.batchId, log_date: o.logDate, program_day: o.programDay ?? null,
        drug_id: o.drugId || null, drug_name_text: o.drugName || null,
        vaccine_id: o.vaccineId || null, vaccine_name_text: o.vaccineName || null,
        dose_note: o.doseNote || null, administered_by_email: o.administeredByEmail || null, note: o.note || null,
      };
    },
    fromRow(r) {
      return {
        id: r.id, batchId: r.batch_id, logDate: r.log_date, programDay: r.program_day,
        drugId: r.drug_id, drugName: r.drug_name_text, vaccineId: r.vaccine_id, vaccineName: r.vaccine_name_text,
        doseNote: r.dose_note, administeredByEmail: r.administered_by_email, note: r.note, createdAt: r.created_at,
      };
    },
  },
};

function load(key) {
  return STORE[key] || [];
}

async function refreshOne(key) {
  const cfg = TABLES[key];
  const { data, error } = await sb.from(cfg.table).select('*').order(cfg.orderBy, { ascending: cfg.ascending });
  if (error) throw error;
  STORE[key] = (data || []).map(cfg.fromRow);
  return STORE[key];
}

async function refreshAllStores() {
  await Promise.all(Object.keys(TABLES).map(refreshOne));
}

async function insertRow(key, obj) {
  const cfg = TABLES[key];
  const { data, error } = await sb.from(cfg.table).insert(cfg.toRow(obj)).select().single();
  if (error) throw error;
  const row = cfg.fromRow(data);
  STORE[key] = [...(STORE[key] || []), row];
  return row;
}

async function updateRow(key, id, obj) {
  const cfg = TABLES[key];
  const { data, error } = await sb.from(cfg.table).update(cfg.toRow(obj)).eq('id', id).select().single();
  if (error) throw error;
  const row = cfg.fromRow(data);
  STORE[key] = (STORE[key] || []).map(r => r.id === id ? row : r);
  return row;
}

async function deleteRow(key, id) {
  const cfg = TABLES[key];
  const { error } = await sb.from(cfg.table).delete().eq('id', id);
  if (error) throw error;
  STORE[key] = (STORE[key] || []).filter(r => r.id !== id);
}
