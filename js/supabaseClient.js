// Supabase 클라이언트 초기화 + 동기 STORE 캐시.
//
// 기존 앱의 render*()/populate*Select()/getDrugOptions() 등 수십 곳이
// load(key)를 "동기 함수"로 가정하고 호출한다. 이를 깨지 않기 위해
// 부팅 시 refreshAllStores()로 전체 테이블을 한 번에 읽어 STORE에 캐싱하고,
// load(key)는 항상 STORE[key]를 동기적으로 반환한다.
// 저장(insertRow/updateRow/deleteRow)만 async로 Supabase에 접근한다.

const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const STORE = { farms: [], drugs: [], vaccines: [], feeds: [], programs: [], batches: [], medicationLogs: [], rxProducts: [], prescriptions: [] };

// 현재 편집 중인 각 엔티티의 id. 여러 feature 파일이 공유하는 전역 상태라 여기서 한 번만 선언한다.
const editingId = { farm: null, drug: null, vaccine: null, feed: null, program: null, batch: null, medicationLog: null, rxProduct: null, prescription: null };

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
        owner_birth: o.owner_birth || null, barn_range: o.barn_range || null,
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
  rxProducts: {
    table: 'prescription_products', orderBy: 'name', ascending: true,
    toRow(o) {
      return {
        name: o.name, ingredient: o.ingredient || null,
        withdrawal_days: o.withdrawal_days === '' || o.withdrawal_days == null ? null : Number(o.withdrawal_days),
        purpose: o.purpose || null, dose_amount: o.dose_amount || null,
        category: o.category, usage_method: o.usage_method,
      };
    },
    fromRow(r) { return { ...r }; },
  },
  prescriptions: {
    table: 'prescriptions', orderBy: 'created_at', ascending: false,
    toRow(o) {
      return {
        issue_date: o.issueDate, scope: o.scope || 'group',
        farm_id: o.farmId || null, farm_name_snapshot: o.farmName,
        owner_snapshot: o.owner || null, phone_snapshot: o.phone || null,
        owner_birth_snapshot: o.ownerBirth || null, animal_type_snapshot: o.animalType || null,
        head_count_snapshot: o.headCount === '' || o.headCount == null ? null : Number(o.headCount),
        barn_range_snapshot: o.barnRange || null,
        product_id: o.productId || null, product_name_snapshot: o.productName,
        ingredient_snapshot: o.ingredient || null, usage_method_snapshot: o.usageMethod || null,
        purpose_snapshot: o.purpose || null,
        withdrawal_days_snapshot: o.withdrawalDays === '' || o.withdrawalDays == null ? null : Number(o.withdrawalDays),
        days: Number(o.days), quantity: Number(o.quantity),
        expiry_date: o.expiryDate || null, note: o.note || null,
        issued_by_email: o.issuedByEmail || null,
      };
    },
    fromRow(r) {
      return {
        id: r.id, issueNo: r.issue_no, issueDate: r.issue_date, scope: r.scope,
        farmId: r.farm_id, farmName: r.farm_name_snapshot,
        owner: r.owner_snapshot, phone: r.phone_snapshot, ownerBirth: r.owner_birth_snapshot,
        animalType: r.animal_type_snapshot, headCount: r.head_count_snapshot, barnRange: r.barn_range_snapshot,
        productId: r.product_id, productName: r.product_name_snapshot,
        ingredient: r.ingredient_snapshot, usageMethod: r.usage_method_snapshot, purpose: r.purpose_snapshot,
        withdrawalDays: r.withdrawal_days_snapshot,
        days: r.days, quantity: r.quantity, expiryDate: r.expiry_date, note: r.note,
        issuedByEmail: r.issued_by_email, createdAt: r.created_at,
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
