# Muscle Mindset — Keep the Muscle
## Project brief for Claude Code

---

## What this is

A React fitness coaching SaaS app for people with suppressed appetites (GLP-1 medication, illness recovery, high stress). The product logic is **already fully built** as a single JSX file (`keep-the-muscle.jsx`). Your job is to wire it into real infrastructure: auth, database, payments, and deployment. Do not rewrite the product logic — adapt the plumbing only.

---

## Stack

- **Framework:** Next.js (App Router)
- **Auth + Database:** Supabase (handles both — do not use a separate auth library)
- **Payments:** Stripe (monthly subscription)
- **Deployment:** Vercel
- **Language:** JavaScript (not TypeScript — keep it simple)
- **Styling:** The app has its own CSS-in-JS string in the JSX. Do not add Tailwind or any CSS framework.

---

## What already exists

The file `keep-the-muscle.jsx` is a complete working React app. It contains:

- Onboarding gate (collects sex, appetite, height, weight, age, BF%, equipment, restrictions)
- `buildTargets()` — computes calorie/protein/carb/fat/water targets from inputs
- Dashboard with three signal tiles: Feed, Train, Protect
- Vitamin + water tracking tiles with tap-to-explain info badges
- Weight + body fat log with lean mass trend detection
- Meal Scan Preview modal (pre-eat verdict, native Canvas share card)
- Coach chat powered by Claude API with web search
- Day-close scorer with Muscle Protection Mode (inverted Reset Mode)
- A `store` object (`store.get(key)` / `store.set(key, value)`) that currently reads/writes to `window.storage` (Claude.ai artifact storage). **This is what you are replacing with Supabase.**

---

## The three things that must change

### 1. Replace `store` with Supabase

The current app has three storage keys. Map them to three Supabase tables:

**`ktm:profile`** → `profiles` table
Stores the user's computed targets and inputs. One row per user.
```
profiles (
  id uuid references auth.users primary key,
  sex text,
  appetite text,
  weight_lbs numeric,
  height_in numeric,
  age integer,
  bf numeric,
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
)
```

**`ktm:today:{date}`** → `daily_logs` table
Stores one row per user per calendar date. `items` and `messages` are JSON arrays.
```
daily_logs (
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
)
```

**`ktm:meta`** → `user_meta` table
Stores rolling history arrays and streak counters. One row per user, upserted on every day-close.
```
user_meta (
  user_id uuid references auth.users primary key,
  streak integer default 0,
  under_eat_days integer default 0,
  protection_days_left integer default 0,
  train_history jsonb default '[]',
  water_history jsonb default '[]',
  vitamin_history jsonb default '[]',
  weight_logs jsonb default '[]',
  updated_at timestamptz default now()
)
```

Enable Row Level Security on all three tables. Each user can only read/write their own rows (policy: `auth.uid() = user_id` or `auth.uid() = id`).

Replace the `store` object in the app with a Supabase client wrapper that maps the same `get(key)` / `set(key, value)` interface — this keeps the rest of the app's calls unchanged. The key patterns to handle:

- `"ktm:profile"` → upsert/select from `profiles` where `id = auth.uid()`
- `"ktm:today:{YYYY-MM-DD}"` → upsert/select from `daily_logs` where `user_id = auth.uid()` and `date = {date}`
- `"ktm:meta"` → upsert/select from `user_meta` where `user_id = auth.uid()`

---

### 2. Proxy the Anthropic API through a Next.js API route

The app currently calls `https://api.anthropic.com/v1/messages` directly from the browser. This exposes the API key. Move it server-side.

Create `/app/api/coach/route.js`. It should:
- Accept a POST with `{ system, messages, tools }` in the body
- Forward to Anthropic using the `ANTHROPIC_API_KEY` env variable (server-side only, never exposed to client)
- Stream or return the response as-is
- Be protected — only authenticated users (valid Supabase session) can call it

Update the two `fetch("https://api.anthropic.com/v1/messages", ...)` calls in the JSX to point to `/api/coach` instead. The request body shape stays identical.

---

### 3. Add Stripe subscription gating

Users must have an active subscription to use the app. Free trial: 7 days from signup, then paywall.

**Stripe setup:**
- One product: "Keep the Muscle" monthly subscription (~$9.99/month — confirm with owner before going live)
- Checkout via Stripe-hosted checkout page
- Webhook endpoint at `/app/api/stripe-webhook/route.js`

**Add a `subscriptions` table:**
```
subscriptions (
  user_id uuid references auth.users primary key,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text,  -- 'trialing' | 'active' | 'canceled' | 'past_due'
  trial_end timestamptz,
  current_period_end timestamptz,
  updated_at timestamptz default now()
)
```

**Gating logic:**
- After login, check `subscriptions` table for this user
- If no row exists, create one with `status = 'trialing'` and `trial_end = now() + 7 days`
- If `status` is `active` or (`trialing` and `trial_end > now())` → show the app
- Otherwise → show a paywall screen with a "Subscribe" button that redirects to Stripe Checkout
- Stripe webhook updates the `subscriptions` table on `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

---

## Auth flow

- Use Supabase Auth with email + password (no OAuth required for v1)
- Three screens before the app: Sign Up, Log In, and the paywall (if subscription lapsed)
- After sign up: check `profiles` table. If no row exists, show the onboarding gate. If a row exists, skip straight to the Coach dashboard.
- Session persistence: Supabase handles this automatically via cookies in Next.js. Users stay logged in across browser closes and return visits. This replaces the current `window.storage` persistence entirely.

---

## Environment variables needed

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # server-side only, for webhook handler

# Anthropic (server-side only — never NEXT_PUBLIC_)
ANTHROPIC_API_KEY=

# Stripe
STRIPE_SECRET_KEY=           # server-side only
STRIPE_WEBHOOK_SECRET=       # server-side only
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_STRIPE_PRICE_ID= # the monthly subscription price ID
```

---

## File structure target

```
/app
  /page.js              ← root: redirect to /login or /app based on session
  /login/page.js        ← sign in + sign up
  /app/page.js          ← the main Coach app (imports keep-the-muscle.jsx)
  /api/coach/route.js   ← Anthropic proxy
  /api/stripe-webhook/route.js ← Stripe event handler
  /api/create-checkout/route.js ← creates Stripe checkout session
/components
  /PaywallScreen.js     ← shown when subscription is lapsed/missing
/lib
  /supabase.js          ← Supabase client (browser)
  /supabase-server.js   ← Supabase client (server, for API routes)
/keep-the-muscle.jsx    ← the existing product file, minimal changes only
```

---

## What NOT to change in keep-the-muscle.jsx

- `buildTargets()` — the math is correct, do not touch it
- `systemPrompt()` — the coach prompt, do not touch it
- `scanSystemPrompt()` — the scan prompt, do not touch it
- All tile logic (feedLit, trainLit, protectAtRisk, etc.)
- All component render logic (Coach, Onboarding, ScanModal, WeightLog, ScoreCard, etc.)
- The CSS string
- `TILE_INFO`, `WORKOUTS`, `TILE_INFO` constants

Only change:
- The `store` object (replace with Supabase-backed version)
- The two `fetch("https://api.anthropic.com/...")` calls (point to `/api/coach`)
- Remove the `window.storage` check since that no longer applies

---

## Build order

Do this in sequence, verifying each step works before moving to the next:

1. Scaffold Next.js project, install dependencies (`@supabase/supabase-js`, `stripe`, `@supabase/ssr`)
2. Create Supabase tables and RLS policies
3. Build auth screens (login/signup)
4. Replace `store` with Supabase client — verify profile save/load works
5. Build the `/api/coach` proxy — verify coach chat works
6. Build subscriptions table + Stripe webhook + paywall screen
7. Wire trial logic (7-day free trial on signup)
8. Deploy to Vercel, verify env vars are set, test end-to-end

---

## Key constraints

- Never expose `ANTHROPIC_API_KEY` to the browser
- Never expose `STRIPE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` to the browser
- RLS must be on for all tables — no user should ever be able to read another user's data
- The Stripe webhook must verify the signature using `STRIPE_WEBHOOK_SECRET` before processing any event
- Daily logs are keyed by date in the user's local timezone — use the same `todayKey()` function already in the app (`new Date().toISOString().slice(0, 10)`)
- Do not add any UI frameworks, component libraries, or CSS resets — the app has its own complete styling

---

## When you're done

The app should:
- Load at a real URL (Vercel deployment)
- Allow sign up with email + password
- Give a 7-day free trial
- After trial, show a paywall with Stripe checkout
- After payment, show the full app
- Persist all user data (profile, daily logs, meta, weight logs) in Supabase across devices and browser sessions
- Come back to exactly where it left off after closing and reopening the browser
