// Supabase 클라이언트 초기화 + 동기 STORE 캐시.
//
// 기존 앱의 render*()/populate*Select()/getDrugOptions() 등 수십 곳이
// load(key)를 "동기 함수"로 가정하고 호출한다. 이를 깨지 않기 위해
// 부팅 시 refreshAllStores()로 전체 테이블을 한 번에 읽어 STORE에 캐싱하고,
// load(key)는 항상 STORE[key]를 동기적으로 반환한다.
// 저장(insertRow/updateRow/deleteRow)만 async로 Supabase에 접근한다.

const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const STORE = { farms: [], drugs: [], vaccines: [], feeds: [], programs: [], batches: [], medicationLogs: [], rxProducts: [], prescriptions: [], clinicalAssessments: [] };

// 현재 편집 중인 각 엔티티의 id. 여러 feature 파일이 공유하는 전역 상태라 여기서 한 번만 선언한다.
const editingId = { farm: null, drug: null, vaccine: null, feed: null, program: null, batch: null, medicationLog: null, rxProduct: null, prescription: null, clinicalAssessment: null };

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
      return {
        name: o.name, disease: o.disease || null, method: o.method, age: o.age || null, dilution: o.dilution || null,
        maker: o.maker || null, ingredient: o.ingredient || null, notes: o.notes || null,
      };
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
        name: o.name, duration: Number(o.duration) || 30, placement_date: o.placementDate || null,
        focus: o.focus || null, notes: o.notes || null,
        feed_memo: o.feedMemo || null, feed_items: o.feedItems || [], days: o.days || [],
      };
    },
    fromRow(r) {
      return {
        id: r.id, farmId: r.farm_id, farmName: r.farm_name_snapshot,
        name: r.name, duration: r.duration, placementDate: r.placement_date, focus: r.focus, notes: r.notes,
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
        species: o.species || null, breed: o.breed || null,
        status: o.status || 'active', end_date: o.endDate || null, notes: o.notes || null,
      };
    },
    fromRow(r) {
      return {
        id: r.id, farmId: r.farm_id, programId: r.program_id, programName: r.program_name_snapshot,
        house: r.house, placementDate: r.placement_date, birdCount: r.bird_count,
        species: r.species, breed: r.breed,
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
        dose_note: o.doseNote || null, administered_by_email: o.administeredByEmail || null,
        note: o.note || null, disease: o.disease || null,
      };
    },
    fromRow(r) {
      return {
        id: r.id, batchId: r.batch_id, logDate: r.log_date, programDay: r.program_day,
        drugId: r.drug_id, drugName: r.drug_name_text, vaccineId: r.vaccine_id, vaccineName: r.vaccine_name_text,
        doseNote: r.dose_note, administeredByEmail: r.administered_by_email, note: r.note,
        disease: r.disease, createdAt: r.created_at,
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
        items: o.items || [],
        issued_by_email: o.issuedByEmail || null,
      };
    },
    fromRow(r) {
      return {
        id: r.id, issueNo: r.issue_no, issueDate: r.issue_date, validUntil: r.valid_until, scope: r.scope,
        farmId: r.farm_id, farmName: r.farm_name_snapshot,
        owner: r.owner_snapshot, phone: r.phone_snapshot, ownerBirth: r.owner_birth_snapshot,
        animalType: r.animal_type_snapshot, headCount: r.head_count_snapshot, barnRange: r.barn_range_snapshot,
        items: r.items || [],
        issuedByEmail: r.issued_by_email, createdAt: r.created_at,
      };
    },
  },
  clinicalAssessments: {
    table: 'clinical_assessments', orderBy: 'assessed_at', ascending: false,
    toRow(o) {
      return {
        assessed_at: o.assessedAt, farm_id: o.farmId || null, farm_name_snapshot: o.farmName,
        batch_id: o.batchId || null,
        subject_id: o.subjectId || null, house: o.house || null,
        age_days: o.ageDays === '' || o.ageDays == null ? null : Number(o.ageDays),
        temperature_c: o.temperatureC === '' || o.temperatureC == null ? null : Number(o.temperatureC),
        humidity_pct: o.humidityPct === '' || o.humidityPct == null ? null : Number(o.humidityPct),
        scs: o.scs || {}, clinical: o.clinical || {},
        scs_score: o.scsScore, scs_unknown: o.scsUnknown, clinical_score: o.clinicalScore,
        si: o.si, ci: o.ci, di: o.di, grade: o.grade, urgent_flags: o.urgentFlags || [],
        notes: o.notes || null, assessed_by_email: o.assessedByEmail || null,
      };
    },
    fromRow(r) {
      return {
        id: r.id, assessedAt: r.assessed_at, farmId: r.farm_id, farmName: r.farm_name_snapshot,
        batchId: r.batch_id,
        subjectId: r.subject_id, house: r.house, ageDays: r.age_days,
        temperatureC: r.temperature_c, humidityPct: r.humidity_pct,
        scs: r.scs || {}, clinical: r.clinical || {},
        scsScore: r.scs_score, scsUnknown: r.scs_unknown, clinicalScore: r.clinical_score,
        si: Number(r.si), ci: Number(r.ci), di: Number(r.di), grade: r.grade,
        urgentFlags: r.urgent_flags || [],
        notes: r.notes, assessedByEmail: r.assessed_by_email, createdAt: r.created_at,
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

// 테이블 하나가 실패해도 앱 전체를 못 쓰게 만들지 않는다.
// 새 기능을 배포한 직후 supabase/schema.sql을 아직 실행하지 않았으면 그 테이블만
// 조회에 실패하는데, 예전처럼 Promise.all로 묶으면 부팅이 통째로 중단돼 화면이 뜨지 않았다.
// 전부 실패한 경우(설정·네트워크·인증 문제)에만 호출부로 에러를 올린다.
async function refreshAllStores() {
  const keys = Object.keys(TABLES);
  const results = await Promise.allSettled(keys.map(refreshOne));
  const failed = results
    .map((r, i) => (r.status === 'rejected' ? { key: keys[i], table: TABLES[keys[i]].table, reason: r.reason } : null))
    .filter(Boolean);
  if (failed.length === keys.length) throw failed[0].reason;
  failed.forEach(f => {
    console.warn(`[farm-pro] '${f.table}' 테이블을 불러오지 못했습니다. supabase/schema.sql을 실행했는지 확인하세요.`, f.reason);
  });
  return failed;
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
