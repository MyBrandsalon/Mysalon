-- ═══════════════════════════════════════════════════════════════════
--  SOLO SALON — ADDITIONAL SCHEMA
--  Run in Supabase Dashboard → SQL Editor AFTER running supabase-schema.sql
-- ═══════════════════════════════════════════════════════════════════

-- 1. SALON BRANDING  (per-salon custom branding / logo)
create table if not exists salon_branding (
  id           bigserial primary key,
  salon_id     text unique references salons(id),
  salon_name   text,                  -- override display name
  logo_url     text,                  -- URL or base64 data-URI
  logo_text    text,                  -- short text logo fallback (e.g. "BT")
  tagline      text,
  primary_color text default '#007A56',
  accent_color  text default '#F5E030',
  updated_at   timestamptz default now()
);

alter table salon_branding enable row level security;
create policy "anon_all_salon_branding" on salon_branding
  for all to anon using (true) with check (true);

-- 2. SUPER ADMINS table  (separate from staff — platform-level admins)
create table if not exists super_admins (
  id           bigserial primary key,
  name         text,
  phone        text unique,
  login_pin    text,
  created_at   timestamptz default now()
);

alter table super_admins enable row level security;
create policy "anon_all_super_admins" on super_admins
  for all to anon using (true) with check (true);

-- 3. Update STAFF roles to include 'owner' (single-salon owner = admin+manager)
--    No schema change needed — just use role='owner' when creating staff rows
--    The owner_salon_id is stored in salonId column like manager/barber

-- 4. OFFERS table (already referenced in app code — create if missing)
create table if not exists offers (
  id            bigserial primary key,
  title         text,
  emoji         text default '🎁',
  discount_pct  numeric default 0,
  min_billing   numeric default 0,
  salon_id      text,
  is_global     boolean default false,
  active        boolean default true,
  expires_at    timestamptz,
  created_at    timestamptz default now()
);

alter table offers enable row level security;
create policy "anon_all_offers" on offers
  for all to anon using (true) with check (true);

-- 5. PNL INPUTS (already in main schema but re-included for completeness)
--    (skip if already created by main schema)

-- 6. MGR_CASH_IN — add desc column if missing (safe to run twice)
alter table mgr_cash_in add column if not exists "desc" text;
alter table mgr_cash_in add column if not exists "handedTo" text;
alter table mgr_cash_in add column if not exists "type" text default 'cash_in';
alter table mgr_cash_in add column if not exists "status" text default 'pending';

-- 7. ENTRIES — add offer columns if missing
alter table entries add column if not exists "offerName"     text;
alter table entries add column if not exists "offerPct"      numeric default 0;
alter table entries add column if not exists "offerDiscount" numeric default 0;

-- 8. STAFF — add allowBackdate column
alter table staff add column if not exists "allowBackdate" boolean default false;

-- 9. SALONS — add branding/cost columns used in PNL
alter table salons add column if not exists "isCompany"    boolean default false;
alter table salons add column if not exists "rent"         numeric default 0;
alter table salons add column if not exists "staffRent"    numeric default 0;
alter table salons add column if not exists "extraFood"    numeric default 0;
alter table salons add column if not exists "frPct"        numeric default 0;
alter table salons add column if not exists "companyPct"   numeric default 100;
alter table salons add column if not exists "partners"     text default '[]';

-- Insert default super admin (change PIN before going live!)
-- insert into super_admins (name, phone, login_pin) values ('Super Admin', '9999999999', '000000');
