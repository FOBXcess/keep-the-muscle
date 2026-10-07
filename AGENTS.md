# AGENTS.md — Keep the Muscle (KTM)

Single source of truth for this repo. `CLAUDE.md` is the original build brief;
this file is the living state + the roadmap to "Autopilot level." Update it with
every meaningful change.

Owner: Eric Williams (EdubFit). Prefers short answers, ONE next step at a time.

---

## 1. What this product is

A fitness coaching web app for people with **suppressed appetite** (GLP-1
meds, illness recovery, high stress). The job: protect muscle while weight
comes off. Core theme = "Keep the Muscle" — protein floor first, no guilt,
strength training as the muscle-protection piece.

Sister product (the quality bar we're chasing): **Muscle Mindset Autopilot**.
KTM should reach Autopilot's engineering quality while keeping its own GLP-1 theme.

---

## 2. Stack & hosting

- **Framework:** Next.js 15 (App Router), React 19 — JavaScript, not TypeScript
- **Auth + DB:** Supabase (`@supabase/ssr`, `@supabase/supabase-js`)
- **AI:** Anthropic API, proxied server-side through `/api/coach` (key never hits the browser)
- **Styling:** self-contained CSS-in-JS string inside `keep-the-muscle.jsx` — no Tailwind, no UI libs
- **Deployment target:** Vercel
- **Access gate (current):** `SIGNUP_ACCESS_CODE` env var (invite-code signup). Stripe is NOT wired yet.

### Env vars (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=    # server only
ANTHROPIC_API_KEY=            # server only
SIGNUP_ACCESS_CODE=           # invite gate for signup
```

### Supabase tables (see `supabase-schema.sql`)
`profiles`, `daily_logs`, `user_meta`, `ktm_favorites`, `api_usage`.
RLS on all of them — each user reads/writes only their own rows.

---

## 3. Product rules (carry over from Autopilot, keep KTM theme)

- **No guilt language.** Activity never "earns" a treat. Protein first.
- **Plain language, tiny steps, one next action at a time** (owner has ADHD).
- **Protein floor is the real signal.** Floor + target both computed off goal weight.
- **MPS threshold:** aim 25–40g protein per eating occasion, 3–4 feedings/day — not one big dump.
- **Low-appetite reality:** favor soft/liquid, protein-per-bite, small frequent hits.
- **Weekly trends over single days** for weight, energy, appetite.
- **Safety:** never give medication or dose advice — food, protein, training only; medical questions → their doctor.
- **Admin-only tools stay admin-only.**

---

## 4. Architecture rule (the core principle)

**Code derives the numbers; the model only writes the coaching.**
- `buildTargets()` — pure function, computes calorie/protein/carb/fat/water targets + protein floor. Model never sets these.
- Day-close scorer (`computeWeekly`, finalize/rollover, Protection Mode, streak) — pure logic.
- Tile states (Feed/Train/Protect, protein LIT/OK/AT-RISK/NO-DATA) — code-derived.
- **Exception today:** the food scan verdict is currently MODEL-derived (see gap #2).

---

## 5. Current state — what's BUILT

- Next.js 15 + React 19 app, Supabase email/password auth (login, signup, forgot/reset password, email confirm)
- `store` abstraction wired to Supabase via `setStore()` injection — profile, daily logs, meta, favorites persist across devices
- `buildTargets()` + full tile logic + onboarding gate
- Coach chat via `/api/coach` proxy (server-side key)
- **Cost control:** every AI call logged to `api_usage` (tokens, web searches, `est_cost_usd`); `/api/coach` also rate-limits per user. Admin usage dashboard at `app/admin/page.js` (per-user/month cost view).
- Scan/pre-eat preview modal (verdict card + native Canvas share card)
- Weekly recap (in-app + shareable gold-on-black poster), streak, day-close scorer with Muscle Protection Mode
- GLP-1 coaching already in the prompts: MPS threshold, soft/liquid for low appetite, GI help, weekly-trend logic, protein-per-meal nudges

---

## 6. Gap list to "Autopilot level" (ranked)

| # | Gap | Current state | Rough size |
|---|-----|---------------|-----------|
| 1 | **Tests / eval harness** — `npm run eval` style checks on `buildTargets`, scorer, tile logic; a render smoke test; mutation checks. Autopilot has ~640 checks. | **None.** | L |
| 2 | **Scanner → code-derived + live** — move the scan verdict/tiers (Meets / Protein Booster / Protein Snack / Skip / No data) into pure code so scans cost $0, add live speed-scan over camera + recents strip. | Exists but **model-derived** (~4.7¢/scan); no live speed-scan or recents. | M–L |
| 3 | **Day plan ("GPS")** — protein stops spread across the day (breakfast/lunch/dinner/snacks, renameable), a route, "next stop" one-action focus. | Weekly verdict, streak, scorer exist; **no intra-day stops/route.** | M |
| 4 | **Monetization** — decide Stripe subscription vs keep invite-code. If Stripe: product + checkout + webhook + paywall + `subscriptions` table + 7-day trial. | Invite code only; **no Stripe.** | M |
| 5 | **GLP-1 light/dose-day mode** — a low-appetite/nausea "lighter plan" check-in with no guilt; hydration + fiber nudges as first-class. | Partially in prompts; **not a distinct mode.** | S–M |
| 6 | **Workflow discipline** — branch → build → run eval+smoke → PR with plain-English tested/not-tested summary → merge on owner's word → resync to main. | Informal; depends on #1 existing. | S |

(This `AGENTS.md` itself closes Autopilot point #6 "one source of truth.")

---

## 7. Rough cost / time

- **Build effort:** ~8–15 focused build sessions (≈1–2 weeks part-time). Contract-dev equivalent ≈ $3–8k of work.
- **Ongoing $$:** near zero at low volume — Supabase + Vercel free tiers; only real variable cost is the Anthropic API (coach ~2.1¢/call). Moving the scanner to code-derived (#2) makes scans free.

---

## 8. Commands

```
npm run dev      # local dev
npm run build    # production build
npm run start    # serve production build
# npm run eval / npm run smoke  → TO BE ADDED (gap #1)
```

---

## 9. Workflow

1. Branch off main.
2. Build the one agreed step.
3. Run eval + smoke (once they exist); state tested / not tested plainly.
4. Open a PR with a plain-English summary. Merge only when the owner says "merge."
5. Resync the branch to main after merge.
6. Update this file with every change.

---

## 10. What NOT to change in `keep-the-muscle.jsx`

`buildTargets()`, `systemPrompt()`, `scanSystemPrompt()`, tile logic, component
render logic, the CSS string, and the `TILE_INFO` / `WORKOUTS` constants —
unless a gap item explicitly calls for it. Plumbing changes only, by default.
