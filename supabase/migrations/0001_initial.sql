create extension if not exists pgcrypto;

create table public.airlines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 40),
  code text not null check (char_length(code) between 2 and 3),
  hub_iata text not null,
  cash bigint not null default 25000000 check (cash >= 0),
  reputation numeric(5,2) not null default 50 check (reputation between 0 and 100),
  current_day integer not null default 1,
  lifetime_profit bigint not null default 0,
  created_at timestamptz not null default now(),
  unique(owner_id)
);

create table public.aircraft_types (
  id text primary key,
  manufacturer text not null,
  model text not null,
  seats integer not null check (seats > 0),
  range_km integer not null check (range_km > 0),
  cruise_kmh integer not null check (cruise_kmh > 0),
  monthly_lease integer not null check (monthly_lease >= 0),
  fuel_cost_per_km numeric(10,2) not null check (fuel_cost_per_km >= 0),
  maintenance_per_flight integer not null check (maintenance_per_flight >= 0)
);

create table public.aircraft (
  id uuid primary key default gen_random_uuid(),
  airline_id uuid not null references public.airlines(id) on delete cascade,
  type_id text not null references public.aircraft_types(id),
  registration text not null unique,
  condition numeric(5,2) not null default 100 check (condition between 0 and 100),
  created_at timestamptz not null default now()
);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  airline_id uuid not null references public.airlines(id) on delete cascade,
  aircraft_id uuid not null references public.aircraft(id) on delete restrict,
  origin_iata text not null,
  destination_iata text not null,
  weekly_frequency integer not null check (weekly_frequency between 1 and 35),
  economy_fare integer not null check (economy_fare >= 1),
  created_at timestamptz not null default now(),
  check (origin_iata <> destination_iata)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  airline_id uuid not null references public.airlines(id) on delete cascade,
  amount bigint not null,
  category text not null,
  description text not null,
  created_at timestamptz not null default now()
);

alter table public.airlines enable row level security;
alter table public.aircraft enable row level security;
alter table public.routes enable row level security;
alter table public.transactions enable row level security;

create policy "owners read airline" on public.airlines for select using (owner_id = auth.uid());
create policy "owners read aircraft" on public.aircraft for select using (airline_id in (select id from public.airlines where owner_id = auth.uid()));
create policy "owners read routes" on public.routes for select using (airline_id in (select id from public.airlines where owner_id = auth.uid()));
create policy "owners read transactions" on public.transactions for select using (airline_id in (select id from public.airlines where owner_id = auth.uid()));

-- Mutations should go through trusted server actions/RPCs. The client gets read-only RLS access.
