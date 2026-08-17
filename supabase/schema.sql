-- 농장 투약관리 시스템 — Supabase 초기 스키마
-- Supabase 프로젝트의 SQL Editor에서 전체를 한 번에 실행하세요.
-- 재실행해도 안전하도록 대부분 idempotent 하게 작성했습니다(테이블/정책이 이미 있으면 건너뜀).

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────
-- updated_at 자동 갱신 트리거
-- ─────────────────────────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ─────────────────────────────────────────────────────────────────────────
-- 마스터 데이터: 농장 / 약품 / 백신 / 사료첨가제
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists farms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner text not null,
  type text not null default '육계',
  count int,
  address text not null,
  phone text,
  vet text,
  vet_phone text,
  houses int,
  focus text,
  notes text,
  owner_birth date,
  barn_range text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 기존 배포본에 이미 farms 테이블이 있을 경우를 위한 컬럼 추가 (처방전 발급에 필요)
alter table farms add column if not exists owner_birth date;
alter table farms add column if not exists barn_range text;

create table if not exists drugs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default '항생제',
  ingredient text,
  maker text,
  dose text,
  withdrawal text,
  indication text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vaccines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  disease text,
  method text not null default '음수백신',
  age text,
  dilution text,
  maker text,
  ingredient text,
  species text not null default '공통',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 기존 배포본에 이미 vaccines 테이블이 있을 경우를 위한 컬럼 추가
alter table vaccines add column if not exists maker text;
alter table vaccines add column if not exists ingredient text;

-- 축종 구분(육계/산란계/공통) — 투약 프로그램에서 농장 축종에 맞는 백신만 고르게 한다.
-- 기본값을 '공통'으로 둔 것은 의도적이다. 이미 등록된 백신은 축종 정보가 없으므로
-- 잘못 감추는 것보다 전 축종에 그대로 보이는 편이 안전하다.
alter table vaccines add column if not exists species text not null default '공통';

create table if not exists feeds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default '영양제·비타민',
  ingredient text,
  maker text,
  dose text,
  period text,
  effect text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- 투약 프로그램 (일자별 계획은 JSONB — 단일 블록으로 편집/저장되고
-- 기존 로컬 백업 JSON 구조를 그대로 담을 수 있어 마이그레이션이 쉬움)
--
-- days 원소 형태: { day:int, drugs:[{drugId:uuid|null, name:text}], vaccine:{vaccineId:uuid|null, name:text}|null, note:text }
-- feed_items 원소 형태: { feedId:uuid|'__custom__'|null, name:text, dose:text, period:text }
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists programs (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid references farms(id) on delete set null,
  farm_name_snapshot text,
  name text not null,
  duration int not null default 30,
  placement_date date,
  species text,
  breed text,
  focus text,
  notes text,
  feed_memo text,
  feed_items jsonb not null default '[]'::jsonb,
  days jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_programs_farm_id on programs(farm_id);

-- 기존 배포본용 컬럼 추가: 프로그램의 축종·품종
-- (품종을 알아야 일령별 목표 온·습도를 매뉴얼에서 찾아 보여줄 수 있다)
alter table programs add column if not exists species text;
alter table programs add column if not exists breed text;

-- 기존 배포본에 이미 programs 테이블이 있을 경우를 위한 컬럼 추가
alter table programs add column if not exists placement_date date;

-- ─────────────────────────────────────────────────────────────────────────
-- 입추(사육배치) 관리 — 신규
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists batches (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references farms(id) on delete restrict,
  program_id uuid references programs(id) on delete set null,
  program_name_snapshot text,
  house text,
  placement_date date not null,
  bird_count int,
  status text not null default 'active' check (status in ('active','completed')),
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_batches_farm_id on batches(farm_id);
create index if not exists idx_batches_status on batches(status);

-- 기존 배포본에 이미 batches 테이블이 있을 경우를 위한 컬럼 추가
-- (동별 축종/품종 — 대시보드 사양표준 요약 카드가 품종으로 육종회사 매뉴얼을 조회하는 데 필요)
alter table batches add column if not exists species text;
alter table batches add column if not exists breed text;

-- ─────────────────────────────────────────────────────────────────────────
-- 투약 이력 기록(실적) — 신규
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists medication_logs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references batches(id) on delete cascade,
  log_date date not null default current_date,
  program_day int,
  drug_id uuid references drugs(id) on delete set null,
  drug_name_text text,
  vaccine_id uuid references vaccines(id) on delete set null,
  vaccine_name_text text,
  dose_note text,
  administered_by_email text,
  note text,
  created_at timestamptz not null default now(),
  constraint medication_logs_has_content check (drug_name_text is not null or vaccine_name_text is not null)
);

create index if not exists idx_medlogs_batch_id on medication_logs(batch_id);
create index if not exists idx_medlogs_drug_id on medication_logs(drug_id);
create index if not exists idx_medlogs_log_date on medication_logs(log_date);

-- 기존 배포본에 이미 medication_logs 테이블이 있을 경우를 위한 컬럼 추가
-- ("투약상담 및 처방" — 상담 중 진단한 질병을 기록. 투약 없이 진단만 한 상담도
--  기록할 수 있도록 기존 "약품 또는 백신 필수" 제약을 완화한다)
alter table medication_logs add column if not exists disease text;
alter table medication_logs drop constraint if exists medication_logs_has_content;
alter table medication_logs add constraint medication_logs_has_content
  check (drug_name_text is not null or vaccine_name_text is not null or disease is not null or note is not null);

-- ─────────────────────────────────────────────────────────────────────────
-- 처방전 (수의사법 시행규칙 [별지 제10호서식]) — 신규
--
-- prescription_products: 처방전 발급 시 선택하는 제품 마스터(성분/휴약기간/
--   사용목적/사용량/분류/용법이 구조화되어 있어야 서식 자동완성이 가능하므로
--   기존 drugs 테이블과 별도로 둔다).
-- prescriptions: 발급대장. 발급 시점의 농장/제품 정보를 스냅샷으로 저장해
--   이후 농장·제품 정보가 바뀌어도 이미 발급된 처방전 내용은 변하지 않는다.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists prescription_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ingredient text,
  withdrawal_days int,
  purpose text,
  dose_amount text,
  category text not null default '액상',
  usage_method text not null default '음수',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- items 원소 형태: { productId:uuid|null, productName:text, ingredient:text,
--   usageMethod:text, purpose:text, withdrawalDays:int|null, days:int,
--   quantity:number, expiryDate:date|null, note:text|null }
-- 원본 서식의 처방내역/판매내역 표가 4행이므로 한 처방전에 최대 4개 품목을 담는다.
create table if not exists prescriptions (
  id uuid primary key default gen_random_uuid(),
  issue_no bigint generated always as identity,
  issue_date date not null default current_date,
  valid_until date generated always as ((issue_date + interval '1 year')::date) stored,
  scope text not null default 'group' check (scope in ('individual','group')),
  farm_id uuid references farms(id) on delete set null,
  farm_name_snapshot text not null,
  owner_snapshot text,
  phone_snapshot text,
  owner_birth_snapshot date,
  animal_type_snapshot text,
  head_count_snapshot int,
  barn_range_snapshot text,
  items jsonb not null default '[]'::jsonb,
  issued_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists idx_prescriptions_farm_id on prescriptions(farm_id);
create index if not exists idx_prescriptions_issue_date on prescriptions(issue_date);

-- 기존 배포본에 이미 prescriptions 테이블이 있을 경우를 위한 컬럼 추가/마이그레이션
-- (유효기간 = 발급일로부터 1년, DB가 항상 자동으로 계산/저장 / 품목을 단일 컬럼에서
--  items 배열로 옮겨 한 처방전에 여러 제품을 담을 수 있게 함)
alter table prescriptions add column if not exists valid_until date generated always as ((issue_date + interval '1 year')::date) stored;
alter table prescriptions add column if not exists items jsonb not null default '[]'::jsonb;
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'prescriptions' and column_name = 'product_name_snapshot') then
    update prescriptions set items = jsonb_build_array(jsonb_build_object(
        'productId', product_id, 'productName', product_name_snapshot, 'ingredient', ingredient_snapshot,
        'usageMethod', usage_method_snapshot, 'purpose', purpose_snapshot, 'withdrawalDays', withdrawal_days_snapshot,
        'days', days, 'quantity', quantity, 'expiryDate', expiry_date, 'note', note
      ))
      where items = '[]'::jsonb and product_name_snapshot is not null;
    alter table prescriptions drop column product_id;
    alter table prescriptions drop column product_name_snapshot;
    alter table prescriptions drop column ingredient_snapshot;
    alter table prescriptions drop column usage_method_snapshot;
    alter table prescriptions drop column purpose_snapshot;
    alter table prescriptions drop column withdrawal_days_snapshot;
    alter table prescriptions drop column days;
    alter table prescriptions drop column quantity;
    alter table prescriptions drop column expiry_date;
    alter table prescriptions drop column note;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 닭 임상평가 (SCS + 확장 임상평가 종합평가표)
--
-- 농장 방문 시 개체 단위로 기록한다. 원본 종합평가표(닭_임상평가_SCS_종합평가표.xlsx)의
-- 구조를 그대로 옮긴 것으로, 채점 항목 정의와 계산식은 js/clinicalAssessment.js에 있다.
--
--   scs      : { tailPosition:0|1|null, headPosition:…, … } 7개 항목, null = 미상
--   clinical : { activity:0-3, gait:0-3, … } 13개 항목, 합계 0–34
--   SI = scs_score ÷ 7 × 100,  CI = clinical_score ÷ 34 × 100,  DI = SI×0.4 + CI×0.6
--
-- 점수/등급을 컬럼으로도 저장하는 이유: 평가 시점의 판정을 그대로 남기기 위함이다.
-- 나중에 채점 기준이 바뀌어도 과거 기록의 판정이 소급해서 달라지면 안 된다.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists clinical_assessments (
  id uuid primary key default gen_random_uuid(),
  assessed_at date not null default current_date,
  farm_id uuid references farms(id) on delete set null,
  farm_name_snapshot text not null,
  batch_id uuid references batches(id) on delete set null,
  subject_id text,
  house text,
  age_days int,
  temperature_c numeric(4,1),
  humidity_pct numeric(4,1),
  scs jsonb not null default '{}'::jsonb,
  clinical jsonb not null default '{}'::jsonb,
  scs_score int not null default 0,
  scs_unknown int not null default 0,
  clinical_score int not null default 0,
  si numeric(5,1) not null default 0,
  ci numeric(5,1) not null default 0,
  di numeric(5,1) not null default 0,
  grade text not null default '저위험',
  urgent_flags jsonb not null default '[]'::jsonb,
  notes text,
  assessed_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 이미 clinical_assessments를 만든 배포본을 위한 컬럼 추가
-- (계군 연결 = batch_id, 계사 습도 = humidity_pct)
--
-- 반드시 아래 create index보다 먼저 와야 한다. 테이블이 이미 있으면 위의
-- "create table if not exists"가 통째로 건너뛰어져 새 컬럼이 생기지 않는데,
-- 그 상태에서 batch_id에 인덱스를 걸면 42703(column does not exist)로 죽는다.
alter table clinical_assessments add column if not exists batch_id uuid references batches(id) on delete set null;
alter table clinical_assessments add column if not exists humidity_pct numeric(4,1);

create index if not exists idx_clinical_assessments_farm_id on clinical_assessments(farm_id);
create index if not exists idx_clinical_assessments_assessed_at on clinical_assessments(assessed_at);
create index if not exists idx_clinical_assessments_batch_id on clinical_assessments(batch_id);

drop trigger if exists trg_clinical_assessments_updated_at on clinical_assessments;
create trigger trg_clinical_assessments_updated_at before update on clinical_assessments
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 농장 구서작업 컨설팅 평가 (구서 감사표 20항목)
--
-- 원본: 농장_구서작업_컨설팅_평가표.xlsx. 항목 정의와 계산식은 js/rodentControl.js에 있다.
--   scores   : { 'R-01': 0|1|2|3, ... } 0=적합 1=부분개선 2=부적합 3=긴급
--   evidence : { 'R-01': '관찰 메모', ... } 점수 1 이상인 항목의 현장 증거
--   가중위험도(%) = Σ(점수 × 중요도) ÷ Σ(3 × 중요도) × 100
--
-- 임상평가와 같은 이유로 점수·등급을 컬럼으로도 저장한다. 나중에 채점 기준이나
-- 항목이 바뀌어도 그때 농장주에게 전달한 보고서의 판정이 소급해 달라지면 안 된다.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists rodent_assessments (
  id uuid primary key default gen_random_uuid(),
  assessed_at date not null default current_date,
  farm_id uuid references farms(id) on delete set null,
  farm_name_snapshot text not null,
  scores jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  risk_score int not null default 0,
  max_score int not null default 0,
  risk_pct numeric(5,1) not null default 0,
  grade text not null default '양호',
  critical_count int not null default 0,
  area_scores jsonb not null default '{}'::jsonb,
  notes text,
  assessed_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_rodent_assessments_farm_id on rodent_assessments(farm_id);
create index if not exists idx_rodent_assessments_assessed_at on rodent_assessments(assessed_at);

drop trigger if exists trg_rodent_assessments_updated_at on rodent_assessments;
create trigger trg_rodent_assessments_updated_at before update on rodent_assessments
  for each row execute function set_updated_at();

-- 처방전용 제품 마스터 초기 데이터 (이미 같은 이름의 제품이 있으면 건너뜀)
insert into prescription_products (name, ingredient, withdrawal_days, purpose, dose_amount, category, usage_method)
select v.name, v.ingredient, v.withdrawal_days, v.purpose, v.dose_amount, v.category, v.usage_method
from (values
  ('독시돈액', 'Doxycydine hyclate Hydrate', 10, '대장균증치료', '1L', '액상', '음수'),
  ('ABBNE', 'ABBNE oil Vaccine', 0, '예방백신', '0.5cc', '백신', '근육'),
  ('챔프', 'Ampiciline hydrate 200g', 3, '괴사성장염치료', null, '액상', '음수'),
  ('암피파워', 'Ampicillin hydrate 100g
Colistin sulfate 250 miu', 7, '괴사성장염 및 대장균증치료', null, '액상', '음수'),
  ('암피포스', 'Ampicillin hydrate 200g', 3, '괴사성장염치료', null, '액상', '음수'),
  ('더블암피', 'Ampicilline hydrate 200g', 3, '괴사성장염치료', null, '액상', '음수'),
  ('암프롤', 'Amprolium HCl 200g', 1, '콕시듐증치료', null, '액상', '음수'),
  ('카프란200액', 'Apramycin 200g', 14, '대장균증치료', '1L', '액상', '음수'),
  ('베타맥스', 'Betaine, Vitamin C,
Mg, NaCl, Na, K, Glucose', 0, '탈수증 및 괴사성장염의 치료', null, '액상', '음수'),
  ('콜리틴액', 'Colistin Sulfate 5억IU', 0, '대장균증치료', '1L', '액상', '음수'),
  ('마스타콕스', 'Declazuril 25g', 5, '콕시듐증치료', null, '액상', '음수'),
  ('디크라솔', 'Declazuril 25gram', 5, '콕시듐증치료', null, '액상', '음수'),
  ('유니디크라', 'Diclazuril 25g', 5, '콕시듐증치료', null, '액상', '음수'),
  ('디클라콕스', 'Diclazuril 25gram', 5, '콕시듐증치료', null, '액상', '음수'),
  ('독시원', 'Doxycydine hyclate Hydrate 100g', 7, '대장균증치료', '1L', '액상', '음수'),
  ('엔로클리닉', 'Enrofloxacin 200g', 12, '대장균증치료', null, '액상', '음수'),
  ('엔록실', 'Enrofloxacine 200g', 12, '대장균증치료', '1L', '액상', '음수'),
  ('패트롤', 'Enrofloxacine 50g', 10, '대장균증치료', '1kg', '액상', '음수'),
  ('플로펜액200', 'Florfenicol 20%', 2, '대장균증치료', '1L', '액상', '음수'),
  ('맥스플로', 'Florfenicol 40%', 28, '대장균증치료', null, '액상', '음수'),
  ('린스코어산', 'Lincomycin HCl 22g
Spectinomycin sulfate 22g', 2, '대장균증치료', null, '액상', '음수'),
  ('린콜액', 'Lincomycin Hydrochloride 100g
Colistine sulfate 600,000,000 IU', 3, '호흡기질병치료', null, '액상', '음수'),
  ('린스펙', 'Lincomycine HCl 22g
Spectinomycin sulfate 22g', 3, '대장균증치료', null, '액상', '음수'),
  ('MG ILT', 'MG + ILT', 0, '예방백신', '1 drop', '백신', '점안'),
  ('페니마이신', 'Penicillin G potassium 80mIU
Streptomycin sulfate 120g', 12, '대장균증치료', null, '액상', '음수'),
  ('티푸스', 'SG 9R', 0, '예방백신', '0.2cc', '백신', '근육'),
  ('다원틸미로(액)', 'tilmicosin 100g', 10, '관절염치료', null, '액상', '음수'),
  ('틸미로200(액)', 'tilmicosin 200g', 10, '관절염치료', null, '액상', '음수'),
  ('비타비트', 'Vit A,D3,E', 0, '과절이상 및 영양보충', null, '액상', '음수'),
  ('이콜라이', '대장균백신', 0, '예방백신', '0.5cc', '백신', '음수'),
  ('뉴암피', '암피실린 200g', 3, '괴사성장염치료', null, '액상', '음수'),
  ('넬암피200', '암피실린20%', 3, '장염의 치료', null, '액상', '음수'),
  ('SF타이로킹', '타일로신50%', 1, '호흡기질병치료', null, '액상', '음수'),
  ('레드암피40', '암피실린 400g', 3, '대장균증 및 장염의 치료', null, '액상', '음수'),
  ('메타콜', '린코마이신 100g,
콜리스틴 6억IU', 3, '대장균증 및 마이코플라즈마병 치료', '1L', '액상', '음수'),
  ('프로암피', '암피실린 200g', 3, '괴사성장염치료', '1kg', '수용산', '음수')
) as v(name, ingredient, withdrawal_days, purpose, dose_amount, category, usage_method)
where not exists (select 1 from prescription_products p where p.name = v.name);

-- ─────────────────────────────────────────────────────────────────────────
-- updated_at 트리거 부착 (가변 테이블에만)
-- ─────────────────────────────────────────────────────────────────────────
drop trigger if exists trg_farms_updated_at on farms;
create trigger trg_farms_updated_at before update on farms
  for each row execute function set_updated_at();

drop trigger if exists trg_drugs_updated_at on drugs;
create trigger trg_drugs_updated_at before update on drugs
  for each row execute function set_updated_at();

drop trigger if exists trg_vaccines_updated_at on vaccines;
create trigger trg_vaccines_updated_at before update on vaccines
  for each row execute function set_updated_at();

drop trigger if exists trg_feeds_updated_at on feeds;
create trigger trg_feeds_updated_at before update on feeds
  for each row execute function set_updated_at();

drop trigger if exists trg_programs_updated_at on programs;
create trigger trg_programs_updated_at before update on programs
  for each row execute function set_updated_at();

drop trigger if exists trg_batches_updated_at on batches;
create trigger trg_batches_updated_at before update on batches
  for each row execute function set_updated_at();

drop trigger if exists trg_prescription_products_updated_at on prescription_products;
create trigger trg_prescription_products_updated_at before update on prescription_products
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security — 공유 워크스페이스 모델
-- (로그인한 사용자는 누구나 전체 데이터를 읽고 쓸 수 있음. 내부 직원용 툴을
--  전제로 한 설계이며, 계정 발급은 Supabase 대시보드에서 관리자가 직접 함)
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['farms','drugs','vaccines','feeds','programs','batches','medication_logs','prescription_products','prescriptions','clinical_assessments','rodent_assessments']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists authenticated_full_access on %I', t);
    execute format(
      'create policy authenticated_full_access on %I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;
