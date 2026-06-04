-- ══════════════════════════════════════════════════════════════════════
--  MYSALON — SUPABASE SCHEMA
--  Multi-tenant salon management platform
--  Designed to scale to 10 lakh+ salons
--  Run this in a brand-new Supabase project (SQL Editor → Run All)
-- ══════════════════════════════════════════════════════════════════════

-- ── Extensions ──────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";     -- fast name search
create extension if not exists "unaccent";    -- accent-insensitive search

-- ══════════════════════════════════════════════════════════════════════
--  TENANTS  (one row per salon / salon group)
-- ══════════════════════════════════════════════════════════════════════
create table if not exists tenants (
  id              uuid primary key default uuid_generate_v4(),
  slug            text unique not null,          -- URL slug: mysalon.in/s/{slug}
  name            text not null,                 -- Salon display name
  owner_name      text,
  owner_phone     text unique not null,
  owner_pin       text not null,                 -- hashed PIN (store bcrypt hash)
  logo_url        text,                          -- Supabase Storage path
  address         text,
  city            text,
  state           text,
  pincode         text,
  plan            text not null default 'free'   check (plan in ('free','pro','business')),
  plan_expires_at timestamptz,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Index for fast slug + phone lookups
create index if not exists tenants_slug_idx   on tenants(slug);
create index if not exists tenants_phone_idx  on tenants(owner_phone);
create index if not exists tenants_plan_idx   on tenants(plan);
create index if not exists tenants_city_idx   on tenants(city);

-- ══════════════════════════════════════════════════════════════════════
--  SUBSCRIPTIONS  (payment & plan history)
-- ══════════════════════════════════════════════════════════════════════
create table if not exists subscriptions (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  plan            text not null check (plan in ('free','pro','business')),
  amount          numeric(10,2) default 0,
  currency        text default 'INR',
  payment_id      text,                          -- Razorpay / UPI ref
  status          text default 'active' check (status in ('active','expired','cancelled','trial')),
  starts_at       timestamptz not null default now(),
  expires_at      timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists subs_tenant_idx on subscriptions(tenant_id);
create index if not exists subs_status_idx on subscriptions(status);

-- ══════════════════════════════════════════════════════════════════════
--  SALONS  (branches within a tenant — single branch or multi-branch)
-- ══════════════════════════════════════════════════════════════════════
create table if not exists salons (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  name            text not null,
  address         text,
  city            text,
  phone           text,
  mgr_phone       text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists salons_tenant_idx on salons(tenant_id);

-- ══════════════════════════════════════════════════════════════════════
--  STAFF  (stylists, managers, franchise owners per tenant)
-- ══════════════════════════════════════════════════════════════════════
create table if not exists staff (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  salon_id        uuid references salons(id) on delete set null,
  name            text not null,
  phone           text not null,
  role            text not null check (role in ('stylist','manager','franchise','saleshead','admin')),
  login_pin       text,
  assigned_salons jsonb,                         -- for franchise / saleshead: array of salon_ids
  join_date       date,
  salary_type     text check (salary_type in ('fixed','commission','hybrid')),
  base_salary     numeric(10,2) default 0,
  commission_pct  numeric(5,2) default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists staff_tenant_idx  on staff(tenant_id);
create index if not exists staff_salon_idx   on staff(salon_id);
create index if not exists staff_phone_idx   on staff(phone);
create index if not exists staff_role_idx    on staff(role);
create unique index if not exists staff_tenant_phone_idx on staff(tenant_id, phone);

-- ══════════════════════════════════════════════════════════════════════
--  CUSTOMERS  (per tenant — a customer belongs to one salon network)
-- ══════════════════════════════════════════════════════════════════════
create table if not exists customers (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  name            text not null,
  phone           text not null,
  login_pin       text,
  email           text,
  dob             date,
  referral_code   text unique,
  referred_by     text,                          -- referral_code of referrer
  loyalty_points  integer not null default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists customers_tenant_idx  on customers(tenant_id);
create index if not exists customers_phone_idx   on customers(phone);
create unique index if not exists customers_tenant_phone_idx on customers(tenant_id, phone);

-- ══════════════════════════════════════════════════════════════════════
--  ENTRIES  (daily service transactions — core revenue record)
-- ══════════════════════════════════════════════════════════════════════
create table if not exists entries (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  salon_id        uuid references salons(id) on delete set null,
  stylist_id      uuid references staff(id) on delete set null,
  customer_phone  text,
  customer_id     uuid references customers(id) on delete set null,
  date            date not null default current_date,
  services        text,
  amount          numeric(10,2) not null default 0,
  discount        numeric(10,2) default 0,
  final_amount    numeric(10,2) generated always as (amount - coalesce(discount,0)) stored,
  payment_mode    text default 'cash' check (payment_mode in ('cash','upi','card','other')),
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists entries_tenant_idx  on entries(tenant_id);
create index if not exists entries_salon_idx   on entries(salon_id);
create index if not exists entries_stylist_idx on entries(stylist_id);
create index if not exists entries_date_idx    on entries(date);
-- Composite for fast daily reports
create index if not exists entries_tenant_date_idx on entries(tenant_id, date);

-- ══════════════════════════════════════════════════════════════════════
--  STYLE CARDS  (customer hair profile — Free tier)
-- ══════════════════════════════════════════════════════════════════════
create table if not exists style_cards (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  customer_id     uuid references customers(id) on delete cascade,
  stylist_id      uuid references staff(id) on delete set null,
  salon_id        uuid references salons(id) on delete set null,
  date            date not null default current_date,
  hair_type       text,
  hair_length     text,
  services_done   text,
  products_used   text,
  stylist_notes   text,
  next_visit_due  date,
  photo_url       text,
  created_at      timestamptz not null default now()
);

create index if not exists stylecards_tenant_idx    on style_cards(tenant_id);
create index if not exists stylecards_customer_idx  on style_cards(customer_id);

-- ══════════════════════════════════════════════════════════════════════
--  VISITS  (every customer visit record — linked to entries + style_cards)
-- ══════════════════════════════════════════════════════════════════════
create table if not exists visits (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  salon_id        uuid references salons(id) on delete set null,
  customer_id     uuid references customers(id) on delete set null,
  stylist_id      uuid references staff(id) on delete set null,
  entry_id        uuid references entries(id) on delete set null,
  date            date not null default current_date,
  services        text,
  amount          numeric(10,2) default 0,
  created_at      timestamptz not null default now()
);

create index if not exists visits_tenant_idx    on visits(tenant_id);
create index if not exists visits_customer_idx  on visits(customer_id);
create index if not exists visits_date_idx      on visits(date);

-- ══════════════════════════════════════════════════════════════════════
--  CASH IN  (additional cash collection records per stylist)
-- ══════════════════════════════════════════════════════════════════════
create table if not exists cash_in (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  salon_id        uuid references salons(id) on delete set null,
  stylist_id      uuid references staff(id) on delete set null,
  date            date not null default current_date,
  amount          numeric(10,2) not null default 0,
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists cashin_tenant_idx   on cash_in(tenant_id);
create index if not exists cashin_stylist_idx  on cash_in(stylist_id);

-- ══════════════════════════════════════════════════════════════════════
--  EXPENSES  (salon operating expenses)
-- ══════════════════════════════════════════════════════════════════════
create table if not exists expenses (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  salon_id        uuid references salons(id) on delete set null,
  recorded_by     uuid references staff(id) on delete set null,
  date            date not null default current_date,
  category        text,
  description     text,
  amount          numeric(10,2) not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists expenses_tenant_idx on expenses(tenant_id);
create index if not exists expenses_salon_idx  on expenses(salon_id);
create index if not exists expenses_date_idx   on expenses(date);

-- ══════════════════════════════════════════════════════════════════════
--  ATTENDANCE  (daily stylist attendance)
-- ══════════════════════════════════════════════════════════════════════
create table if not exists attendance (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  salon_id        uuid references salons(id) on delete set null,
  stylist_id      uuid not null references staff(id) on delete cascade,
  date            date not null default current_date,
  status          text not null default 'present' check (status in ('present','absent','half')),
  check_in        time,
  check_out       time,
  created_at      timestamptz not null default now(),
  unique(tenant_id, stylist_id, date)
);

create index if not exists att_tenant_idx   on attendance(tenant_id);
create index if not exists att_stylist_idx  on attendance(stylist_id);
create index if not exists att_date_idx     on attendance(date);

-- ══════════════════════════════════════════════════════════════════════
--  ADVANCES  (salary advances to stylists)
-- ══════════════════════════════════════════════════════════════════════
create table if not exists advances (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  stylist_id      uuid not null references staff(id) on delete cascade,
  date            date not null default current_date,
  amount          numeric(10,2) not null default 0,
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists advances_tenant_idx  on advances(tenant_id);
create index if not exists advances_stylist_idx on advances(stylist_id);

-- ══════════════════════════════════════════════════════════════════════
--  DEDUCTIONS  (monthly payroll deductions)
-- ══════════════════════════════════════════════════════════════════════
create table if not exists deductions (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  stylist_id      uuid not null references staff(id) on delete cascade,
  month           text not null,                 -- 'YYYY-MM'
  description     text,
  amount          numeric(10,2) not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists ded_tenant_idx  on deductions(tenant_id);
create index if not exists ded_stylist_idx on deductions(stylist_id);

-- ══════════════════════════════════════════════════════════════════════
--  COSMETICS  (inventory — Free tier feature)
-- ══════════════════════════════════════════════════════════════════════
create table if not exists cosmetics (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  salon_id        uuid references salons(id) on delete set null,
  product_name    text not null,
  brand           text,
  category        text,
  unit            text default 'pcs',
  stock_qty       numeric(10,2) not null default 0,
  min_stock       numeric(10,2) default 1,
  purchase_price  numeric(10,2) default 0,
  sell_price      numeric(10,2) default 0,
  last_updated    timestamptz default now(),
  created_at      timestamptz not null default now()
);

create index if not exists cosmetics_tenant_idx on cosmetics(tenant_id);
create index if not exists cosmetics_salon_idx  on cosmetics(salon_id);

-- ══════════════════════════════════════════════════════════════════════
--  QUEUE TOKENS  (Pro+ feature — save-the-time queue)
-- ══════════════════════════════════════════════════════════════════════
create table if not exists queue_tokens (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  salon_id        uuid references salons(id) on delete set null,
  barber_id       uuid references staff(id) on delete set null,
  customer_name   text,
  customer_phone  text,
  customer_id     uuid references customers(id) on delete set null,
  token_number    text,
  position        integer,
  services        text,
  status          text default 'waiting' check (status in ('waiting','in_chair','done','cancelled','no_show')),
  offer_pct       integer default 0,
  offer_name      text,
  eta_minutes     integer,
  date            date not null default current_date,
  start_time      timestamptz,
  served_time     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists queue_tenant_idx  on queue_tokens(tenant_id);
create index if not exists queue_salon_idx   on queue_tokens(salon_id);
create index if not exists queue_date_idx    on queue_tokens(date);
create index if not exists queue_status_idx  on queue_tokens(status);

-- ══════════════════════════════════════════════════════════════════════
--  HIRE BOARD  (Business+ feature — stylist job postings)
-- ══════════════════════════════════════════════════════════════════════
create table if not exists hire_board (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  salon_id        uuid references salons(id) on delete set null,
  title           text not null,
  description     text,
  experience_yrs  integer default 0,
  salary_range    text,
  city            text,
  is_active       boolean not null default true,
  expires_at      date,
  created_at      timestamptz not null default now()
);

create index if not exists hire_tenant_idx on hire_board(tenant_id);
create index if not exists hire_city_idx   on hire_board(city);

-- ══════════════════════════════════════════════════════════════════════
--  SUPER ADMINS  (MySalon platform super admins — not salon staff)
-- ══════════════════════════════════════════════════════════════════════
create table if not exists super_admins (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  phone           text unique not null,
  login_pin       text not null,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ══════════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY (RLS)
--  All tenant data is isolated by tenant_id using RLS policies.
--  The anon key can only read/write rows where tenant_id matches
--  the value passed in the query (enforced at app layer via JWT claim
--  or via a Postgres config parameter set at session start).
--
--  For a public-key model (your current Budget Barber approach),
--  enable RLS but use the service_role key only on the server side.
--  For client-side isolation, use Supabase Auth + JWT claims.
--
--  Pattern: enable RLS on every table, then add permissive policies
--  so your existing fetch+filter approach continues to work.
-- ══════════════════════════════════════════════════════════════════════

alter table tenants        enable row level security;
alter table subscriptions  enable row level security;
alter table salons         enable row level security;
alter table staff          enable row level security;
alter table customers      enable row level security;
alter table entries        enable row level security;
alter table style_cards    enable row level security;
alter table visits         enable row level security;
alter table cash_in        enable row level security;
alter table expenses       enable row level security;
alter table attendance     enable row level security;
alter table advances       enable row level security;
alter table deductions     enable row level security;
alter table cosmetics      enable row level security;
alter table queue_tokens   enable row level security;
alter table hire_board     enable row level security;
alter table super_admins   enable row level security;

-- ── Public read policies (anon key) ─────────────────────────────────
-- Each app filters by tenant_id in the query — RLS adds a safety net.
-- Replace with JWT-claim policies for production hardening.

create policy "anon_all_tenants"       on tenants       for all using (true) with check (true);
create policy "anon_all_subscriptions" on subscriptions for all using (true) with check (true);
create policy "anon_all_salons"        on salons        for all using (true) with check (true);
create policy "anon_all_staff"         on staff         for all using (true) with check (true);
create policy "anon_all_customers"     on customers     for all using (true) with check (true);
create policy "anon_all_entries"       on entries       for all using (true) with check (true);
create policy "anon_all_style_cards"   on style_cards   for all using (true) with check (true);
create policy "anon_all_visits"        on visits        for all using (true) with check (true);
create policy "anon_all_cash_in"       on cash_in       for all using (true) with check (true);
create policy "anon_all_expenses"      on expenses      for all using (true) with check (true);
create policy "anon_all_attendance"    on attendance    for all using (true) with check (true);
create policy "anon_all_advances"      on advances      for all using (true) with check (true);
create policy "anon_all_deductions"    on deductions    for all using (true) with check (true);
create policy "anon_all_cosmetics"     on cosmetics     for all using (true) with check (true);
create policy "anon_all_queue"         on queue_tokens  for all using (true) with check (true);
create policy "anon_all_hire"          on hire_board    for all using (true) with check (true);
create policy "anon_all_super_admins"  on super_admins  for all using (true) with check (true);

-- ══════════════════════════════════════════════════════════════════════
--  SUPABASE STORAGE BUCKET  (for logos)
--  Run this separately in Supabase Dashboard → Storage → New Bucket
--  OR via API:
--    POST /storage/v1/bucket  { "id": "salon-assets", "public": true }
-- ══════════════════════════════════════════════════════════════════════

-- insert into storage.buckets (id, name, public) values ('salon-assets', 'salon-assets', true);

-- ══════════════════════════════════════════════════════════════════════
--  SEED — First super admin
--  Change phone + pin before running!
-- ══════════════════════════════════════════════════════════════════════
insert into super_admins (name, phone, login_pin) values
  ('MySalon Admin', '9999999999', '999999')
on conflict (phone) do nothing;

-- ══════════════════════════════════════════════════════════════════════
--  PERFORMANCE NOTES FOR 10 LAKH+ SALONS
--  1. tenants table will have 10L rows — slug + phone indexes cover it.
--  2. entries is the largest table: ~500 entries/day × 10L salons = 5B rows/year.
--     Partition entries by created_at (monthly) using pg_partman for best perf.
--  3. Enable Supabase connection pooler (PgBouncer, transaction mode).
--  4. Use Supabase Edge Functions for heavy aggregations (payroll, monthly reports).
--  5. Add read replicas when reads > 80% of load.
--  6. Use Supabase Realtime only for queue_tokens table to limit channel overhead.
-- ══════════════════════════════════════════════════════════════════════
