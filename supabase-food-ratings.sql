-- Food ratings: "how did this food sit with you?" Run this in KTM's OWN Supabase SQL Editor (idempotent).
--
-- One row per person per meal they rated. Members are asked only about foods they logged, about an hour after eating.
-- Individual rows are PRIVATE to the person who wrote them. Everyone else only ever sees an aggregate, via
-- food_rating_summary(), and only once at least 5 DIFFERENT people have rated that food.
-- KEEP THAT 5 IN SYNC with MIN_RATERS in lib/food-ratings.js.
--
-- Health-data note: days_since_dose is optional context (days since the last medication dose). Nothing about which
-- medication or what dose is collected. Treat the table as sensitive: never expose rows, only the summary.

create table if not exists food_ratings (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid not null references auth.users on delete cascade,
  food_key        text not null,          -- normalized name, see foodKey() in lib/food-ratings.js
  food_name       text not null,          -- the name as the member logged it
  catalog_id      text,                   -- the seed catalog food it matches, when known (nullable)
  eaten_at        timestamptz not null,   -- when the food was logged
  rated_at        timestamptz not null default now(),
  fullness        text not null check (fullness in ('could_eat_more', 'just_right', 'too_filling')),
  comfort         text not null check (comfort in ('easy', 'okay', 'queasy')),
  days_since_dose integer check (days_since_dose is null or (days_since_dose between 0 and 30)),
  unique (user_id, food_key, eaten_at)
);

create index if not exists food_ratings_food_key_idx on food_ratings (food_key);

alter table food_ratings enable row level security;

drop policy if exists "users manage own food ratings" on food_ratings;
create policy "users manage own food ratings" on food_ratings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Explicit least-privilege grants (Supabase no longer grants these automatically on new tables). Signed-in users only; never anon.
revoke all on food_ratings from anon;
grant select, insert, update, delete on food_ratings to authenticated;

-- Community summary for one food. SECURITY DEFINER so it can count everyone's rows, but it returns ONLY totals, and returns
-- nothing at all until at least 5 different people have rated the food.
create or replace function food_rating_summary(p_food_key text)
returns table (
  raters integer,
  ratings integer,
  could_eat_more integer,
  just_right integer,
  too_filling integer,
  easy integer,
  okay integer,
  queasy integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(distinct user_id)::integer,
    count(*)::integer,
    count(*) filter (where fullness = 'could_eat_more')::integer,
    count(*) filter (where fullness = 'just_right')::integer,
    count(*) filter (where fullness = 'too_filling')::integer,
    count(*) filter (where comfort = 'easy')::integer,
    count(*) filter (where comfort = 'okay')::integer,
    count(*) filter (where comfort = 'queasy')::integer
  from food_ratings
  where food_key = p_food_key
  having count(distinct user_id) >= 5;
$$;

revoke all on function food_rating_summary(text) from public;
revoke all on function food_rating_summary(text) from anon;
grant execute on function food_rating_summary(text) to authenticated;
