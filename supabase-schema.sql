-- Run this in the Supabase SQL Editor (supabase.com → project → SQL Editor)

-- Profiles: one row per user, computed targets + onboarding inputs
create table if not exists profiles (
  id uuid references auth.users primary key,
  sex text,
  appetite text,
  weight_lbs numeric,
  height_in numeric,
  age integer,
  bf numeric,
  goal_weight_lbs numeric,
  equipment text,
  restrictions text,
  calories integer,
  protein integer,
  carbs integer,
  fat integer,
  water_goal integer,
  lean_lbs integer,
  accuracy text,
  below_medical_floor boolean,
  start_date date,
  created_at timestamptz default now()
);

alter table profiles enable row level security;
create policy "users manage own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);


-- Daily logs: one row per user per calendar date
create table if not exists daily_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  date date not null,
  cal integer default 0,
  protein integer default 0,
  carbs integer default 0,
  fat integer default 0,
  water integer default 0,
  lifted boolean default false,
  vitamin boolean default false,
  items jsonb default '[]',
  messages jsonb default '[]',
  unique(user_id, date)
);

alter table daily_logs enable row level security;
create policy "users manage own logs" on daily_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- User meta: streak, history arrays, rolling state
create table if not exists user_meta (
  user_id uuid references auth.users primary key,
  streak integer default 0,
  under_eat_days integer default 0,
  protection_days_left integer default 0,
  train_history jsonb default '[]',
  water_history jsonb default '[]',
  vitamin_history jsonb default '[]',
  weight_logs jsonb default '[]',
  updated_at timestamptz default now()
);

alter table user_meta enable row level security;
create policy "users manage own meta" on user_meta
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- Favorites: one JSON blob per user, the quick-log tally aggregated across days.
-- Keyed by normalized food name -> { name, cal, protein, carbs, fat, verdict, count, last }.
create table if not exists ktm_favorites (
  user_id uuid references auth.users primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table ktm_favorites enable row level security;
create policy "users manage own ktm favorites" on ktm_favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- API usage log: one row per Anthropic call, for tracking real token spend + cost.
-- Written server-side from /api/coach after each request. est_cost_usd uses the
-- Sonnet 4.6 prices hard-coded in that route (update both together if pricing changes).
create table if not exists api_usage (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users on delete set null,
  kind text,                       -- 'coach' | 'scan'
  model text,
  input_tokens integer default 0,
  output_tokens integer default 0,
  cache_read_tokens integer default 0,
  cache_write_tokens integer default 0,
  web_searches integer default 0,
  est_cost_usd numeric(10,6) default 0,
  created_at timestamptz default now()
);

alter table api_usage enable row level security;
create policy "users read own api usage" on api_usage
  for select using (auth.uid() = user_id);
create policy "users insert own api usage" on api_usage
  for insert with check (auth.uid() = user_id);
