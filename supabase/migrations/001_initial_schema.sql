-- Seaside Beach Club - initial schema
-- Source: Developer Handoff v3.0 (May 2026)

create extension if not exists pgcrypto;

-- ============================================================
-- members
-- ============================================================
create table public.members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  member_id text unique not null,
  first_name text,
  last_name text,
  email text unique,
  phone text,
  membership_type text,
  member_since integer,
  cabana text,
  two_stickers boolean not null default false,
  onboarded boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index members_auth_user_id_idx on public.members (auth_user_id);

-- ============================================================
-- household_members
-- ============================================================
create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  member_id text not null references public.members(member_id) on delete cascade,
  full_name text not null,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create index household_members_member_id_idx on public.household_members (member_id);

-- ============================================================
-- vehicles
-- ============================================================
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  member_id text not null references public.members(member_id) on delete cascade,
  make text,
  model text,
  color text,
  license_plate text,
  created_at timestamptz not null default now()
);

create index vehicles_member_id_idx on public.vehicles (member_id);

-- ============================================================
-- guests
-- ============================================================
create table public.guests (
  id uuid primary key default gen_random_uuid(),
  member_id text not null references public.members(member_id) on delete cascade,
  member_name text,
  guest_name text not null,
  email text,
  phone text,
  visit_date date,
  fee integer not null default 35,
  paid boolean not null default false,
  payment_method text check (payment_method is null or payment_method in ('cash','check')),
  checked_in_by text,
  created_at timestamptz not null default now()
);

create index guests_member_id_idx on public.guests (member_id);
create index guests_guest_name_lower_idx on public.guests (lower(guest_name));
create index guests_email_idx on public.guests (email);

-- ============================================================
-- employees
-- ============================================================
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text unique not null,
  role text not null check (role in ('gate_device','ops_manager','business_manager','employee')),
  area text,
  active boolean not null default true,
  since integer,
  created_at timestamptz not null default now()
);

create index employees_auth_user_id_idx on public.employees (auth_user_id);
create index employees_email_lower_idx on public.employees (lower(email));

-- ============================================================
-- shifts
-- ============================================================
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  shift_date date not null,
  start_time text,
  end_time text,
  area text,
  status text not null default 'scheduled' check (status in ('scheduled','dropped','picked_up','completed')),
  dropped_reason text,
  picked_up_by uuid references public.employees(id) on delete set null,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create index shifts_employee_id_idx on public.shifts (employee_id);
create index shifts_shift_date_idx on public.shifts (shift_date);

-- ============================================================
-- clock_records
-- ============================================================
create table public.clock_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  shift_date date not null,
  clock_in timestamptz,
  clock_out timestamptz,
  override_by uuid references public.employees(id) on delete set null,
  override_note text,
  created_at timestamptz not null default now()
);

create index clock_records_employee_id_idx on public.clock_records (employee_id, shift_date);

-- ============================================================
-- labor_assignments
-- ============================================================
create table public.labor_assignments (
  id uuid primary key default gen_random_uuid(),
  shift_date date not null,
  slot text check (slot in ('s1','s2','s3','s4')),
  employee_id uuid not null references public.employees(id) on delete cascade,
  duty text check (duty in ('Float','Varsity Parking','JV Parking','Line Duty')),
  created_at timestamptz not null default now()
);

create index labor_assignments_date_idx on public.labor_assignments (shift_date);

-- ============================================================
-- kitchen_assignments
-- ============================================================
create table public.kitchen_assignments (
  id uuid primary key default gen_random_uuid(),
  shift_date date not null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  station text check (station in ('Bay Marie','Grill','Organizer','Fryer','Orders')),
  created_at timestamptz not null default now()
);

create index kitchen_assignments_date_idx on public.kitchen_assignments (shift_date);

-- ============================================================
-- issues
-- ============================================================
create table public.issues (
  id uuid primary key default gen_random_uuid(),
  member_id text not null references public.members(member_id) on delete cascade,
  category text not null check (category in ('Maintenance','Safety','Cabana','Bathroom','Facility','General')),
  subject text not null,
  description text,
  status text not null default 'Open' check (status in ('Open','In Progress','Resolved')),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index issues_member_id_idx on public.issues (member_id);
create index issues_status_idx on public.issues (status);

-- ============================================================
-- beach_flag (single-row table, fixed UUID)
-- ============================================================
create table public.beach_flag (
  id uuid primary key,
  color text not null check (color in ('green','yellow','red','purple')),
  set_by uuid references public.employees(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- notices
-- ============================================================
create table public.notices (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  urgent boolean not null default false,
  posted_by uuid references public.employees(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- events
-- ============================================================
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date,
  event_time text,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- realtime: member portal subscribes to beach_flag changes
-- ============================================================
alter publication supabase_realtime add table public.beach_flag;
alter publication supabase_realtime add table public.notices;
