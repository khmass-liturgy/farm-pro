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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security — 공유 워크스페이스 모델
-- (로그인한 사용자는 누구나 전체 데이터를 읽고 쓸 수 있음. 내부 직원용 툴을
--  전제로 한 설계이며, 계정 발급은 Supabase 대시보드에서 관리자가 직접 함)
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['farms','drugs','vaccines','feeds','programs','batches','medication_logs']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists authenticated_full_access on %I', t);
    execute format(
      'create policy authenticated_full_access on %I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;
