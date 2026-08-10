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
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  focus text,
  notes text,
  feed_memo text,
  feed_items jsonb not null default '[]'::jsonb,
  days jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_programs_farm_id on programs(farm_id);

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

create table if not exists prescriptions (
  id uuid primary key default gen_random_uuid(),
  issue_no bigint generated always as identity,
  issue_date date not null default current_date,
  scope text not null default 'group' check (scope in ('individual','group')),
  farm_id uuid references farms(id) on delete set null,
  farm_name_snapshot text not null,
  owner_snapshot text,
  phone_snapshot text,
  owner_birth_snapshot date,
  animal_type_snapshot text,
  head_count_snapshot int,
  barn_range_snapshot text,
  product_id uuid references prescription_products(id) on delete set null,
  product_name_snapshot text not null,
  ingredient_snapshot text,
  usage_method_snapshot text,
  purpose_snapshot text,
  withdrawal_days_snapshot int,
  days int not null,
  quantity numeric not null,
  expiry_date date,
  note text,
  issued_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists idx_prescriptions_farm_id on prescriptions(farm_id);
create index if not exists idx_prescriptions_issue_date on prescriptions(issue_date);

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
  foreach t in array array['farms','drugs','vaccines','feeds','programs','batches','medication_logs','prescription_products','prescriptions']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists authenticated_full_access on %I', t);
    execute format(
      'create policy authenticated_full_access on %I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;
