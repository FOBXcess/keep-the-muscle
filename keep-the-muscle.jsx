import React, { useState, useEffect, useRef } from "react";

/* ---------------- persistence ---------------- */
// store is injected via props from AppShell (Supabase-backed).
// Falls back to in-memory for standalone use.
const memFallback = {};
const fallbackStore = {
  async get(k) { return k in memFallback ? memFallback[k] : null; },
  async set(k, v) { memFallback[k] = v; },
};
let _store = fallbackStore;
export function setStore(s) { _store = s; }
const store = { get: (k) => _store.get(k), set: (k, v) => _store.set(k, v) };
const todayKey = () => new Date().toISOString().slice(0, 10);
const r5 = (n) => Math.round(n / 5) * 5;
const r10 = (n) => Math.round(n / 10) * 10;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Pick a food emoji for a favorite chip from keywords in its name; generic muscle fallback.
function foodEmoji(name) {
  const n = (name || "").toLowerCase();
  const map = [["egg", "🍳"], ["chicken", "🍗"], ["turkey", "🦃"], ["steak", "🥩"], ["beef", "🥩"], ["burger", "🍔"], ["bacon", "🥓"], ["salmon", "🐟"], ["tuna", "🐟"], ["fish", "🐟"], ["shrimp", "🦐"], ["rice", "🍚"], ["oat", "🥣"], ["yogurt", "🥛"], ["milk", "🥛"], ["whey", "🥤"], ["shake", "🥤"], ["protein", "🥤"], ["broth", "🍲"], ["soup", "🍲"], ["banana", "🍌"], ["apple", "🍎"], ["berr", "🫐"], ["avocado", "🥑"], ["salad", "🥗"], ["peanut", "🥜"], ["almond", "🥜"], ["nut", "🥜"], ["cheese", "🧀"], ["bread", "🍞"], ["potato", "🥔"], ["coffee", "☕"], ["pasta", "🍝"], ["chocolate", "🍫"]];
  for (const [k, e] of map) if (n.includes(k)) return e;
  return "💪";
}

// Roll a set of logged food items into the persisted favorites tally (latest macros win, count increments).
function mergeFavorites(prev, items) {
  const next = { ...(prev || {}) };
  for (const it of items || []) {
    if (!it || !it.name || (!it.cal && !it.protein)) continue;
    const key = it.name.trim().toLowerCase();
    if (!key) continue;
    const was = next[key];
    next[key] = {
      name: it.name.trim(),
      cal: it.cal || 0, protein: it.protein || 0, carbs: it.carbs || 0, fat: it.fat || 0,
      verdict: it.verdict || (was && was.verdict) || null,
      count: (was ? was.count : 0) + 1,
      last: todayKey(),
    };
  }
  return next;
}

// From the tally, surface the genuine favorites: logged 3+ times, most-used first, cap the list.
const FAV_THRESHOLD = 3;
function topFavorites(fav, limit = 6) {
  return Object.values(fav || {})
    .filter((f) => f.count >= FAV_THRESHOLD)
    .sort((a, b) => b.count - a.count || (b.last || "").localeCompare(a.last || ""))
    .slice(0, limit);
}

// downscale a photo so it's fast to send and small enough to persist
function fileToImg(file, max = 768, q = 0.72) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        let w = im.width, h = im.height;
        if (w > h && w > max) { h = Math.round(h * max / w); w = max; }
        else if (h > max) { w = Math.round(w * max / h); h = max; }
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(im, 0, 0, w, h);
        const dataUrl = c.toDataURL("image/jpeg", q);
        resolve({ dataUrl, base64: dataUrl.split(",")[1] });
      };
      im.onerror = reject; im.src = fr.result;
    };
    fr.onerror = reject; fr.readAsDataURL(file);
  });
}

/* ---------------- target math (computed, not guessed) ----------------
   Core philosophy shift from Autopilot: there is no engineered deficit here.
   Appetite suppression IS the deficit — the app's job is to set a PROTECTIVE
   near-maintenance number and never let it slip below the clinical floor,
   not to carve out additional restriction on top of what's already happening. */
function buildTargets({ sex, weightLbs, heightIn, age, bf, appetite }) {
  const kg = weightLbs / 2.2046, cm = heightIn * 2.54;
  const hasBf = bf !== null && bf !== undefined && bf > 0 && bf < 60;
  const leanKg = hasBf ? kg * (1 - bf / 100) : null;

  // BMR: Katch-McArdle (lean-mass based) when body fat % is known; otherwise Mifflin-St Jeor.
  const bmr = hasBf
    ? 370 + 21.6 * leanKg
    : (sex === "male" ? 10 * kg + 6.25 * cm - 5 * age + 5 : 10 * kg + 6.25 * cm - 5 * age - 161);

  // No goal multiplier stacked on top — the target IS roughly maintenance, never an
  // added cut. But the activity multiplier itself scales DOWN with appetite: lower
  // appetite tends to travel with lower overall energy/activity too (fatigue, illness),
  // so this reuses the appetite signal already collected rather than a flat assumption
  // calibrated for Autopilot's actively-training population (1.45x).
  const activityMult = appetite === "barely" ? 1.2 : appetite === "low" ? 1.25 : appetite === "reduced" ? 1.3 : 1.35;
  const tdee = bmr * activityMult;

  // Clinical safety floor — 1200 cal/day women, 1500 cal/day men, without medical
  // supervision. For a lot of users TDEE math alone already clears this; for smaller/
  // older/lower-mass bodies the floor is the real backstop that keeps the number protective.
  const medicalFloor = sex === "male" ? 1500 : 1200;
  const calories = Math.max(r10(tdee), medicalFloor);
  const belowMedicalFloor = r10(tdee) < medicalFloor;

  const leanLbs = hasBf ? leanKg * 2.2046 : weightLbs;

  // Protein multiplier scales UP for lighter bodies. This is the resolved fix for the
  // carb-floor problem from the earlier GLP-1 build: a flat low multiplier on a small
  // frame produces an unreasonably low carb number once a protein:carb ratio is applied
  // on top of it. Raising the multiplier for lighter bodyweights fixes it at the source
  // instead of bolting on an arbitrary flat carb floor that breaks the underlying logic.
  const pMult = leanLbs < 110 ? 1.3 : leanLbs < 140 ? 1.2 : 1.1;
  const protein = r5(leanLbs * pMult);

  // No protein:carb RATIO here — that's deliberately cut. Ratio-driven carbs is exactly
  // the kind of macro-cycling complexity that breaks on light frames and isn't needed for
  // this population. Fat gets a sane floor off lean mass; carbs simply fill what's left.
  const fatFloor = leanLbs * 0.3;
  const fat = r5(Math.max(fatFloor, (calories * 0.27) / 9));
  const carbs = Math.max(r5((calories - protein * 4 - fat * 9) / 4), 40);

  // Water goal runs a bit higher than a standard hydration target — electrolytes/water
  // are a daily default concern here, since appetite loss quiets thirst too, not just
  // a training-day sweat-loss thing.
  const waterGoal = clamp(r5(weightLbs * 0.6), 64, 110);

  return {
    calories, protein, carbs, fat, waterGoal,
    leanLbs: hasBf ? Math.round(leanLbs) : null, bf: hasBf ? bf : null,
    accuracy: hasBf ? "lean-mass" : "weight-based", belowMedicalFloor,
  };
}

/* ---------------- simple muscle-protection training (no periodization, no seasons) ----------------
   The only question this answers: "am I doing enough resistance work to keep muscle
   while weight comes down." One full session and one minimum-effective-dose session
   per equipment tier — that's the whole engine. No phases, no cycles. */
const WORKOUTS = {
  gym: {
    full: ["Goblet or Back Squat 3x8-10", "Chest Press (DB/machine/barbell) 3x8-10", "Seated Row or Lat Pulldown 3x10", "Romanian Deadlift or Leg Press 3x10", "Standing Shoulder Press 2x10", "Plank 3x20-30s"],
    minimum: ["Leg Press (light) 2x10", "Chest Press (light) 2x10", "Seated Row (light) 2x10", "5-10 min total — still counts, something beats nothing"],
  },
  home: {
    full: ["DB Goblet Squat 3x10", "DB Floor or Bench Press 3x10", "Single-Arm DB Row 3x10/side", "DB Romanian Deadlift 3x10", "DB Shoulder Press 2x10", "Dead Bug or Plank 3x20-30s"],
    minimum: ["DB Goblet Squat (light) 2x10", "DB Floor Press (light) 2x10", "DB Row (light) 2x10/side", "5-10 min total — still counts, something beats nothing"],
  },
  bodyweight: {
    full: ["Bodyweight Squats 3x12-15", "Push-Ups (knee or full) 3x8-12", "Band or Towel Rows 3x12", "Glute Bridges 3x15", "Wall or Incline Push-Ups 2x10", "Plank 3x20-30s"],
    minimum: ["Chair Squats 2x10", "Wall Push-Ups 2x10", "Standing Band Rows 2x10", "5-10 min total — still counts, something beats nothing"],
  },
};

// Tap-to-explain content for each tile's "ⓘ" badge. Plain language, written for the
// person using the app, not the coach prompt — this is what renders in the shared
// explain panel when a badge is tapped.
const TILE_INFO = {
  calories: { label: "CALORIES", text: "Total calories vs. your daily target. The number is set high on purpose — near maintenance with no diet-style cut, since the deficit here already comes from low appetite. It's a ceiling to grow toward, not a bar to clear today, so the tile lights green once you're halfway there. Going over is never the issue; sustained under-eating is — which is why a warning shows if you drop below the clinical daily floor (1,500 cal men / 1,200 cal women)." },
  protein: { label: "PROTEIN", text: "Protein is the signal that matters most — it's what actually protects muscle during any deficit, appetite-driven or not. The tile lights green only at 100% of your target, because protein is the one number worth fully hitting. Coming up short here is the real muscle-loss risk, not the calorie count." },
  hydrate: { label: "HYDRATE", text: "Water plus minerals, together — the daily recovery basics for this population. Appetite loss quiets thirst the same way it quiets hunger, so reduced intake itself drives dehydration, not just sweat. The tile lights green when you've hit your water goal AND logged your minerals (a multivitamin and/or an electrolyte mix). A pinch of salt in water counts." },
  water: { label: "WATER", text: "Electrolytes are worth pairing with water daily here — appetite loss quiets thirst the same way it quiets hunger, so reduced intake itself is often the driver, not just sweat losses. A basic electrolyte mix, or a pinch of salt in water, helps." },
  minerals: { label: "MINERALS", text: "One daily tap covering a multivitamin and/or electrolytes — insurance against the gaps most likely to open up when food variety drops on reduced intake: B12, iron, vitamin D, magnesium, plus the sodium and potassium electrolytes carry. A basic complete multivitamin plus an electrolyte mix (or a pinch of salt in water) covers most of this. Check with a doctor before adding anything beyond that." },
  weight: { label: "WEIGHT + BODY FAT", text: "Body fat % alongside weight (if you have a way to measure it) lets this tell fat loss apart from muscle loss — the actual question this app exists to answer. Home scales are noisy day to day — hydration, time of day, and recent food all shift the number more than real change does — so weekly, same time of day, beats daily. Don't react to a single reading; the trend over 2+ weeks is what's real." },
};


/* ---------------- coach system prompt ----------------
   This is a LOW-APPETITE coach, not a "GLP-1 coach." The clinical reasoning: GLP-1
   drugs don't have a special muscle-wasting mechanism — the muscle loss that happens
   with any large rapid calorie deficit is the same muscle loss here. The drug is the
   trigger; the deficit is the mechanism. So this coaches the deficit/under-eating
   generically, which is both the clinically correct call and the thing that serves
   anyone eating much less than usual for any reason — illness, stress, recovery,
   or medication — without narrowing to one drug. */
// Returns the system prompt as two content blocks so the large, stable ruleset can be
// prompt-cached (cache_control: ephemeral) while the volatile per-turn status line stays
// uncached. The static block is everything that only changes when the PROFILE changes
// (stable across a chat session); the volatile block is TODAY SO FAR, which updates on
// nearly every message as food is logged — so it's split out and placed last (adjacent to
// the conversation) to keep the cache prefix identical turn-to-turn.
function systemPrompt(p, t, meta) {
  const left = (a, b) => Math.max(0, a - b);
  const wk = WORKOUTS[p.equipment] || WORKOUTS.home;
  const staticPrompt = `You are the Muscle Mindset — Keep the Muscle coach: a low-appetite muscle-protection coach for people eating much less than usual (GLP-1 medication, illness recovery, high stress, or any other cause). MAKE decisions, don't suggest. The job here is preventing UNDER-eating, not preventing overeating. No guilt, ever — appetite loss usually isn't a choice. Keep replies tight, end with ONE next step. No long lectures.

USER PROFILE: ${p.sex}, ${p.weightLbs} lb${p.bf ? ` at ${p.bf}% body fat (${p.leanLbs} lb lean mass — targets built off this)` : " (body fat % unknown — targets built off total weight)"}, appetite lately: ${p.appetite}. Targets: ${p.calories} cal, ${p.protein}g protein, ${p.carbs}g carbs, ${p.fat}g fat, ${p.waterGoal}oz water. Training access: ${p.equipment}. Restrictions: ${p.restrictions || "none"}.

TRAINING — simple muscle-protection programming, no phases/seasons/periodization:
Full session (${p.equipment}): ${wk.full.join("; ")}.
Minimum effective dose (low-energy days — this still counts, full credit): ${wk.minimum.join("; ")}.
2-4 sessions/week is the target. If asked "give me a workout," give ONE session — infer whether today's a full-energy or low-energy day from what they say, default to the minimum-dose version if they mention low energy, low appetite, or fatigue.

RULES:
- Protein is the dominant signal, always — it's what protects muscle during ANY deficit, voluntary or not. Calories matter for energy, but protein coming up short is the thing that actually costs muscle.
- MEAL CADENCE: small, frequent meals beat 2-3 big ones — a full stomach kills an already-suppressed appetite further. Push more, smaller protein hits across the day rather than front- or back-loading.
- WHEN APPETITE IS LOW: favor liquid/soft protein — protein shakes, Greek yogurt, cottage cheese, bone broth + protein powder, scrambled eggs, string cheese. These go down easiest when a full plate feels impossible.
- "EAT THIS NOW" / protein-per-bite: when asked what to eat, what to eat now, or for suggestions when appetite is low, rank options by protein delivered per bite / per stomach-space, NOT by calorie efficiency. Most protein for the least volume is the actual value here — that's the differentiated thing this app does versus a generic tracker.
- THE CALORIE NUMBER WILL LOOK HIGH — say so before they have to ask. It's set near maintenance on purpose, with no diet-style cut subtracted, because the deficit here is already coming from appetite — stacking another one on top is the exact thing that costs muscle. That means it will look bigger than a typical weight-loss number, and almost certainly bigger than what they're managing to eat most days right now. That gap is expected, not a sign anything's wrong or unreachable. Make this explicit any time the number comes up, looks daunting, or they compare it to a "normal" diet target: it's a ceiling to grow toward over time, not a bar to clear today. Going over it is never a problem this app watches for — only going too far under it is.
- HYDRATION + ELECTROLYTES: a sensible DAILY default for this population specifically — appetite loss quiets the thirst signal the same way it quiets hunger, so reduced intake itself (not just sweat losses) is the driver. Encourage them daily, not just on training days.
- GI / CONSTIPATION: common here and not a medical emergency on its own. Non-diagnostic guidance only — more fluid, magnesium, gentle fiber build-up (not a sudden high-fiber dump), short walks. If asked for "GI help," give this directly.
- VITAMIN/SUPPLEMENT LABEL PHOTOS: if a photo is clearly a multivitamin or electrolyte product label (not food), read it and give a short, honest take on whether it covers what matters for this population (B12, iron, vitamin D, magnesium are the ones most likely to run short on reduced intake) — generic and educational, never a dosing recommendation. This is NOT a food log: always return "logs": [] for these, never invent calories/protein for a supplement. Checking the Minerals tile off is a separate, manual action on their end — don't tell them it's been marked done.
- NO seed-oil detection, no hidden-sugar flagging, no food-tier hierarchy — that's a different app's framework and isn't this population's problem. Any food that delivers real protein without crowding out more eating today counts as a good choice here.
- NEVER ask about medication, drug name, dose, or how long someone's been on anything. If it comes up, acknowledge it in passing, but don't engage clinically with it — redirect to appetite, protein, and intake, which is what's actually relevant regardless of the cause.
- NO drug-specific interaction warnings (e.g. "this interacts with your specific medication"). Generic disclaimers are fine and expected: "check with a doctor before starting any new supplement, especially if on prescription medication."
- RED-FLAG SAFETY LIST (if any of these come up, however phrased): persistent vomiting, can't keep fluids down, rapid unexplained weight loss, fainting, chest pain, severe weakness, blood in stool or vomit, or appetite loss lasting more than 1-2 weeks. If any appear, that turn's reply should clearly and calmly say this needs a doctor's attention, ahead of any other coaching in that message. Frame it as the general safety advice anyone would get for these symptoms — not as managing a medication's side effects.
- WEEKLY TRENDS over single-day numbers: weight, energy, and appetite all fluctuate day to day. What matters is the direction over 1-2 weeks. If weight is dropping fast (roughly more than 1% of bodyweight per week), say so plainly and connect it to protein — faster loss with low protein intake is a faster route to losing muscle, not just fat. If they've logged body fat % alongside weight at least twice, 10+ days apart, that's the more direct signal — it can show whether the loss is actually fat or muscle, not just a proxy for it. Either way, never react to a single reading: home body-fat scales swing several percent just from hydration and time of day, so one weird number isn't a trend. If they ask about a single jump, say so plainly rather than reading meaning into noise.
${meta.protectionDaysLeft ? `\nMUSCLE PROTECTION MODE IS CURRENTLY ACTIVE: ${meta.protectionDaysLeft} clean day(s) left. Reinforce this if relevant — today specifically needs protein at floor, calories at floor, and hydration hit, or the clock restarts.` : ""}
- CALORIES TILE LOGIC (use these exact numbers if asked why it's lit/not lit/warning — never invent different thresholds): GREEN/lit = calories at or above 50% of target (the target runs high on purpose, so half of it is already a solid day). RED/warning = at least 30% of the calorie target logged AND total calories still under the clinical daily floor (${p.sex === "male" ? 1500 : 1200} cal for this user) — the tile's concern is under-eating, never overeating.
- PROTEIN TILE LOGIC: GREEN/lit = protein at 100% of target — protein is the one number worth fully hitting, so nothing less lights it. RED/at-risk = at least 30% of the calorie target logged AND protein still under 50% of target; that's the real muscle-loss signal.
- HYDRATE TILE LOGIC: a TODAY signal combining water and minerals. GREEN/lit = the water goal (${p.waterGoal}oz) is hit AND minerals are logged for the day (a multivitamin and/or electrolytes). Otherwise it stays unlit — there's no red state on this tile. Longer-run patterns (several days of low hydration, or an unsafe loss rate) don't show here; they feed Muscle Protection Mode instead — the loss-rate check uses body-fat-tagged weigh-ins (lean mass directly) when at least two exist 10+ days apart, otherwise it falls back to weight alone. Raise those trends in a check-in, not as a tile explanation.
- Commands you handle: "eat this now" / "what should I eat" (rank by protein-per-bite, favor soft/liquid if appetite's low), "meal plan" (a few small protein-anchored meals/snacks for the day), "give me a workout" (use the session library above, full or minimum), "GI help" (the non-diagnostic guidance above), "check in" (ask how appetite/energy/training are trending over the week, not the day).

WHEN THEY REPORT EATING SOMETHING: log its macros. For branded, packaged, or restaurant/chain items, USE web search to find real nutrition facts, then log exact numbers scaled to the amount given. For generic/homemade foods, estimate directly — no search needed. Always produce numbers — never say you can't look it up. Keep "reply" clean coach text: no URLs or citations. Put every food item in the "logs" array.

WHEN THEY LOG A FOOD, rate it with a "verdict" — only for food logs, never workouts/check-ins/general chat:
- "good" = protein-dense relative to volume/calories AND appetite-friendly (easy to actually get down right now).
- "caution" = meaningfully low protein for its volume, or it's crowding out room for more eating today — still a perfectly reasonable food, just not doing much for the floor.
- "bad" = reserved for real scale: takes up significant stomach space with essentially no protein payoff (a big bowl of pasta, a large soda, a big plate of fries), or is genuinely hard to get down when appetite is the bottleneck. A small low-protein side eaten ALONGSIDE solid protein sources — a few grapes next to eggs and a shake, for example — is NOT "bad"; it's trivial volume, rate it "caution" at most.
Be honest — this is the rating that teaches them, not flattery. When several items are logged together and most of them are protein-strong, lead "reply" with that win — don't open by nitpicking the one minor low-protein side.

If multiple foods are logged in one message, put EACH as its own entry in "logs" — never narrate calculations as prose, never use markdown in "reply". Keep "reply" to 2-4 short sentences max.

CRITICAL OUTPUT RULE: your entire response must be ONE valid JSON object and NOTHING else — no markdown, no text before or after. Respond ONLY with this exact shape:
{"reply":"<coach message, tight, 2-4 sentences max, one next step>","logs":[{"name":"<short>","cal":<int>,"protein":<int>,"carbs":<int>,"fat":<int>,"verdict":"good"|"caution"|"bad"}]}
(Always an array, even for one item. Use "logs": [] if nothing was eaten this turn — e.g. workout requests, check-ins, general questions.)`;

  const volatilePrompt = `TODAY SO FAR: ${t.cal} cal (${left(p.calories, t.cal)} to go), ${t.protein}g protein (${left(p.protein, t.protein)}g to go), ${t.water || 0}oz water. Minerals today: ${t.vitamin ? "taken" : "not yet"}.`;

  return [
    { type: "text", text: staticPrompt, cache_control: { type: "ephemeral" } },
    { type: "text", text: volatilePrompt },
  ];
}

/* ---------------- pre-eat scan prompt ----------------
   Same idea as Autopilot's scan — preview a food BEFORE eating it — but the verdict
   logic is rebuilt around this app's actual rules: there's no budget to stay under,
   no seed-oil framework, and the real question is protein-per-bite and whether it's
   actually getting them closer to the floor, not whether it "fits" a ceiling. */
function scanSystemPrompt(p, t) {
  const calLeft = Math.max(0, p.calories - t.cal);
  const proteinLeft = Math.max(0, p.protein - t.protein);
  return `You are the Muscle Mindset — Keep the Muscle coach doing a PRE-EAT SCAN — a preview verdict, NOT a food log. The user is thinking about eating something and wants to know if it's a good move RIGHT NOW before they commit.

DO NOT LOG THIS FOOD. Return "logs": [] always. This is a preview only.

USER'S DAY SO FAR: ${t.cal} cal eaten (${calLeft > 0 ? calLeft + " to go toward the floor" : "floor reached — going over is never the issue here"}), ${t.protein}g protein (${proteinLeft > 0 ? proteinLeft + "g still needed" : "protein floor hit ✅"}), water: ${t.water || 0}/${p.waterGoal}oz.
USER TARGETS: ${p.calories} cal, ${p.protein}g protein, ${p.carbs}g carbs, ${p.fat}g fat. Appetite lately: ${p.appetite}.
Remember: the calorie number is a protective floor, not a ceiling — there is no "over budget" state to warn about here. The only thing worth flagging is whether this food meaningfully helps close the protein gap, especially given appetite is the bottleneck, not calories.

SCAN RULES:
1. IDENTIFY the food from the photo or description. Use web search for any branded/restaurant item to get real macros. For a generic meal, estimate accurately.
2. PORTION & MACRO CONSISTENCY — the user has specified a portion size. ALL FOUR macros (cal/protein/carbs/fat) MUST be for that ONE exact portion — never mix a per-serving protein with a per-package calorie count. The calorie value is DERIVED, not looked up: set cal = protein×4 + carbs×4 + fat×9, rounded to the nearest 5 (the app enforces this exact formula, so any calorie figure you write anywhere — including the Reality Check — MUST use this derived number, or it will contradict the card). (For a 3 oz tuna serving: 26g protein, 0g carbs, ~1g fat → cal = 26×4 + 1×9 = 113 → 115. NOT 400+ cal.)
3. VERDICT: "good", "caution", or "bad" — based on protein-per-bite (most protein for the least stomach space, since appetite/volume is the real constraint), and whether it's appetite-friendly (easy to actually get down right now, e.g. liquid/soft protein when appetite is low). "good" = protein-dense and easy to get down. "caution" = low protein for its volume, or it's likely to crowd out room for more eating today. "bad" = takes up real stomach space with little to no protein payoff, or is genuinely hard to get down when appetite is the bottleneck.
4. SWAP: if verdict is "caution" or "bad", give ONE specific, actionable swap toward something higher protein-per-bite — be concrete ("swap the [X] for [Y]"), not vague.
5. CONTEXT LINE: one sentence on how this fits their day right now — lean on the protein gap, not the calorie ceiling.
6. NO seed-oil detection, no hidden-sugar flagging — not this app's framework.
7. CARD VERDICT (drives the shareable card): map the food to ONE of these four —
   • "elite" 🔥 = a standout, exceptional protein-per-bite; the kind of choice you'd screenshot to brag about.
   • "muscle" 🥇 = a solid, protein-forward move that clearly helps close today's gap.
   • "protein_trap" ⚠️ = looks fine but is low protein for its volume; it crowds out room for real protein.
   • "calorie_trap" 🚨 = lots of calories and stomach space for little to no protein payoff.
   Still return the plain "verdict" (good/caution/bad) as well — logging depends on it. Rough mapping: elite/muscle→good or the top of caution, protein_trap→caution, calorie_trap→bad.
8. REALITY CHECK: ONE short punch — the undeniable, screenshot-worthy fact people repost. Internally draft 3-4 candidates and output ONLY the strongest. Keep it under ~12 words, one clause, no lead-in. It MUST be impossible to argue with — so build it from numbers that are ALREADY on the card (the exact cal/protein you're returning) or from safe, obvious comparisons. Good examples: "26g of protein for only 110 calories." / "More protein than two protein bars." / "This is what real protein density looks like." Conversational, never clinical. No hashtags, no emojis.
   MATH RULES (a wrong number kills the whole card):
   • Only cite numbers that are exactly correct and internally consistent. Prefer restating the card's own macros — those can never be wrong.
   • Do NOT invent packaging/quantity conversions (cans, bags, scoops, "you'd need X") unless the package size is known AND the count is exactly right. When unsure, restate the macros instead.
   • Never let two numbers in one sentence contradict each other.
9. LESSON: ONE short teaching takeaway — the fitness principle this food illustrates, so the card teaches, not just scores. 3-7 words, punchy, quotable. Examples: "Protein density beats protein marketing." / "Protein snacks aren't protein meals." / "'Greek' doesn't always mean high-protein." / "Liquids count too." / "Whole foods usually win." No emojis, no hashtags.
10. FOOD IQ: an integer 0-100 scoring how well this food serves a muscle-protection goal (protein-per-calorie and protein-per-bite are what move the score). Be consistent with the card verdict: elite ≈ 90-100, muscle ≈ 75-89, protein_trap ≈ 45-64, calorie_trap ≈ 15-44.

RESPONSE SCHEMA — ONE valid JSON object, nothing else:
{"reply":"<2-3 sentence verdict + context>","preview":{"name":"<food name>","cal":<int>,"protein":<int>,"carbs":<int>,"fat":<int>,"verdict":"good"|"caution"|"bad","cardVerdict":"elite"|"muscle"|"protein_trap"|"calorie_trap","foodIQ":<int 0-100>,"swap":"<specific swap or empty string if good>","contextLine":"<one sentence on how this fits their day right now>","realityCheck":"<one short undeniable punch, ideally the card's own macros>","lesson":"<one short teaching takeaway>"},"logs":[]}`;
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');
:root{--ink:#15120E;--raise:#211C16;--card:#28221B;--line:#3A322A;--txt:#F6F1E7;--muted:#A99F8E;--faint:#6F665A;
--go:#8BE05A;--hold:#F2B33D;--stop:#F0604D;--water:#56C7F0;--carb:#C79BF2;--fat:#F2A65A;--gold:#D4AF37;}
*{box-sizing:border-box;}
html,body{overflow:hidden;overscroll-behavior:none;}
.mm{font-family:'Inter',system-ui,sans-serif;background:var(--ink);color:var(--txt);height:100dvh;height:100svh;overflow:hidden;position:relative;display:flex;flex-direction:column;}
.sg{font-family:'Space Grotesk',sans-serif;}
.scroll{padding:16px;overflow-y:auto;flex:1 1 auto;}
.scroll.center{display:flex;flex-direction:column;justify-content:safe center;max-width:560px;margin:0 auto;width:100%;padding:calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom));}
/* onboarding */
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;margin-bottom:14px;}
.eyebrow{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin-bottom:10px;}
.lead{font-size:14.5px;line-height:1.5;color:var(--muted);}
label.fl{display:block;font-size:13px;color:var(--muted);margin:16px 0 7px;font-weight:500;}
.seg{display:flex;gap:6px;flex-wrap:wrap;}
.seg button{flex:1;min-width:72px;padding:11px 8px;border-radius:11px;border:1px solid var(--line);background:var(--raise);color:var(--muted);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:.15s;}
.seg button.on{background:var(--go);color:#15120E;border-color:var(--go);}
.seg button:hover{border-color:var(--go);}
.inp{width:100%;padding:12px 13px;border-radius:11px;border:1px solid var(--line);background:var(--raise);color:var(--txt);font-size:16px;font-family:'Space Grotesk';outline:none;}
.inp.t{font-family:'Inter';font-size:15px;}
.inp:focus{border-color:var(--go);}
.row{display:flex;gap:10px;}
.btn{display:block;width:100%;padding:14px;border-radius:12px;border:none;cursor:pointer;font-size:15px;font-weight:700;font-family:inherit;transition:.15s;}
.btn.go{background:var(--go);color:#15120E;}
.btn.go:disabled{opacity:.4;cursor:not-allowed;}
.gate{font-size:12.5px;color:var(--hold);margin-top:10px;line-height:1.45;}
/* dashboard (pinned) */
.dash{flex:0 0 auto;background:var(--card);border-bottom:1px solid var(--line);padding:calc(12px + env(safe-area-inset-top)) 14px 14px;}
.dhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;flex-wrap:wrap;}
.favbar{flex:0 0 auto;display:flex;align-items:center;gap:7px;background:var(--ink);border-bottom:1px solid var(--line);padding:8px 12px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
.favbar::-webkit-scrollbar{display:none;}
.favlbl{flex:0 0 auto;font-family:'Space Grotesk';font-size:9px;font-weight:700;letter-spacing:.1em;color:var(--faint);text-transform:uppercase;}
.favchip{flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:6px 11px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--txt);font-size:12.5px;font-weight:600;font-family:'Inter';cursor:pointer;white-space:nowrap;transition:.15s;}
.favchip:hover{border-color:var(--go);color:#fff;}
.favchip:active{transform:scale(.94);}
.favchip:disabled{opacity:.4;cursor:not-allowed;}
.favchip .fp{color:var(--go);font-family:'Space Grotesk';font-weight:700;font-size:11px;}
.dhead .lg{font-family:'Space Grotesk';font-weight:700;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--txt);white-space:nowrap;}
.dhead .lg .gold{color:var(--gold);}
.streak{font-size:12px;color:var(--hold);font-weight:600;font-family:'Space Grotesk';white-space:nowrap;}
.infobtn{background:none;border:none;color:var(--faint);font-size:11px;font-weight:600;cursor:pointer;font-family:'Space Grotesk';padding:0;}
.infobtn:hover{color:var(--muted);}
.signals3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px;align-items:start;}
.signals3 .word{position:relative;background:#1a1611;border:1.5px solid var(--line);border-radius:11px;padding:9px 5px;text-align:center;transition:.35s;}
.signals3 .wl{display:block;font-family:'Space Grotesk';font-size:10px;letter-spacing:.1em;color:var(--faint);transition:.35s;}
.signals3 .wb{display:block;font-family:'Space Grotesk';font-weight:700;font-size:14px;letter-spacing:.01em;color:var(--faint);margin-top:1px;transition:.35s;}
.signals3 .wc{display:block;font-size:10.5px;color:var(--faint);margin-top:4px;transition:.35s;line-height:1.3;}
.signals3 .word.lit-go{border-color:var(--go);background:rgba(139,224,90,.12);box-shadow:0 0 14px rgba(139,224,90,.22);}
.signals3 .word.lit-go .wl,.signals3 .word.lit-go .wb{color:var(--go);}
.signals3 .word.lit-go .wc{color:#bfe8a0;}
.signals3 .word.lit-risk{border-color:var(--stop);background:rgba(240,96,77,.14);box-shadow:0 0 14px rgba(240,96,77,.28);animation:riskpulse 2s ease-in-out infinite;}
.signals3 .word.lit-risk .wl,.signals3 .word.lit-risk .wb{color:var(--stop);}
.signals3 .word.lit-risk .wc{color:#f7b3ab;}
@keyframes riskpulse{0%,100%{box-shadow:0 0 11px rgba(240,96,77,.22);}50%{box-shadow:0 0 18px rgba(240,96,77,.4);}}
.ibadge{position:absolute;top:3px;right:4px;background:none;border:none;color:var(--faint);font-size:10px;cursor:pointer;padding:2px 3px;line-height:1;font-family:'Space Grotesk';opacity:.65;}
.ibadge:hover{opacity:1;color:var(--txt);}
.explain{background:var(--raise);border:1px solid var(--line);border-radius:10px;padding:9px 12px;margin:0 0 8px;}
.explain b{display:block;font-family:'Space Grotesk';font-size:10px;letter-spacing:.08em;color:var(--muted);margin-bottom:4px;}
.explain p{margin:0;font-size:12px;color:var(--muted);line-height:1.5;}
.mbars{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;}
.mb .ml{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);display:flex;justify-content:space-between;margin-bottom:4px;}
.mb .ml b{color:var(--txt);font-family:'Space Grotesk';}
.bar{height:6px;border-radius:99px;background:#1a1611;overflow:hidden;}
.bar i{display:block;height:100%;border-radius:99px;transition:width .4s ease;}
.sigrow{display:flex;gap:5px;}
.sig{position:relative;flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:7px 3px;background:var(--raise);border:1px solid var(--line);border-radius:9px;cursor:pointer;transition:.15s;}
.sig:hover{border-color:var(--go);}
.sig .sl{font-size:9px;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);}
.sig .sv{font-size:13px;}
.sig .sn{font-size:12.5px;color:var(--muted);font-family:'Space Grotesk';font-weight:600;white-space:nowrap;}
.sig.adj{cursor:default;padding-bottom:6px;}
.sig.adj.hit{border-color:var(--go);background:rgba(139,224,90,.08);}
.sig.adj.low{border-color:var(--hold);background:rgba(242,179,61,.1);}
.sig.adj.low .sl{color:var(--hold);}
.sig.adj.hit .sl{color:var(--go);}
.sig.lit-go{border-color:var(--go);background:rgba(139,224,90,.08);}
.sig.lit-go .sl{color:var(--go);}
.sig.adj .pm{display:flex;gap:3px;margin-top:4px;width:100%;}
.sig.adj .pm button{flex:1;background:var(--card);border:1px solid var(--line);color:var(--txt);border-radius:6px;font-size:12px;font-weight:700;padding:2px 0;cursor:pointer;font-family:inherit;line-height:1;}
.sig.adj .pm button:hover{border-color:var(--go);}
.sig.adj .pm button:disabled{opacity:.3;cursor:not-allowed;}
.tip{font-size:10.5px;color:var(--faint);line-height:1.4;margin-top:7px;}
.wtrow{display:flex;align-items:center;gap:6px;}
.wtrow input{flex:1;padding:7px 9px;border-radius:8px;border:1px solid var(--line);background:var(--raise);color:var(--txt);font-size:13px;font-family:'Space Grotesk';outline:none;min-width:0;}
.wtrow input.bfinput{flex:0 0 58px;}
.wtrow input:focus{border-color:var(--go);}
.wtrow button{flex:0 0 auto;padding:7px 11px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--muted);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;}
.wtrow button:hover{border-color:var(--go);color:var(--txt);}
.wttrend{display:block;margin-top:5px;font-size:11px;color:var(--muted);}
/* chat */
.msg{margin-bottom:12px;display:flex;}
.msg.u{justify-content:flex-end;}
.bub{max-width:85%;padding:11px 14px;border-radius:15px;font-size:14.5px;line-height:1.5;white-space:pre-wrap;}
.msg.u .bub{background:var(--go);color:#15120E;border-bottom-right-radius:5px;font-weight:500;}
.msg.c .bub{background:var(--card);border:1px solid var(--line);border-bottom-left-radius:5px;}
.logged{display:inline-block;margin-top:8px;font-size:12px;color:var(--go);font-family:'Space Grotesk';}
.scorecard{background:var(--raise);border:1px solid var(--line);border-radius:12px;padding:14px;}
.scorecard .sl2{display:flex;justify-content:space-between;font-size:14px;padding:6px 0;border-bottom:1px solid var(--line);}
.scorecard .sl2:last-of-type{border-bottom:none;}
.dots{font-family:'Space Grotesk';}
/* input */
.foot{flex:0 0 auto;border-top:1px solid var(--line);background:var(--ink);padding:10px 12px calc(10px + env(safe-area-inset-bottom));}
.qa{display:flex;gap:6px;overflow-x:auto;padding-bottom:8px;}
.qa button{white-space:nowrap;padding:7px 12px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--muted);font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;flex:0 0 auto;}
.qa button:hover{border-color:var(--go);color:var(--txt);}
.inrow{display:flex;gap:8px;align-items:flex-end;}
.inrow textarea{flex:1;resize:none;padding:11px 13px;border-radius:13px;border:1px solid var(--line);background:var(--raise);color:var(--txt);font-size:15px;font-family:'Inter';outline:none;max-height:90px;}
.inrow textarea:focus{border-color:var(--go);}
.send{flex:0 0 auto;width:44px;height:44px;border-radius:12px;border:none;background:var(--go);color:#15120E;font-size:18px;cursor:pointer;}
.send:disabled{opacity:.4;}
.cam{flex:0 0 auto;width:44px;height:44px;border-radius:12px;border:1px solid var(--line);background:var(--raise);color:var(--muted);font-size:18px;cursor:pointer;}
.cam:hover{border-color:var(--go);}
.cam:disabled{opacity:.4;}
.x{background:none;border:none;color:var(--muted);font-size:12px;cursor:pointer;font-family:inherit;}
/* meal scan preview */
.scan-overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;}
.scan-sheet{background:var(--card);border-radius:22px 22px 0 0;width:100%;max-width:560px;padding:20px 18px calc(24px + env(safe-area-inset-bottom));max-height:90dvh;overflow-y:auto;}
.scan-handle{width:36px;height:4px;background:var(--line);border-radius:99px;margin:0 auto 18px;}
.scan-header{font-family:'Space Grotesk';font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);margin-bottom:14px;}
.scan-img-wrap{position:relative;margin-bottom:14px;}
.scan-img-wrap img{width:100%;max-height:200px;object-fit:cover;border-radius:12px;display:block;}
.scan-img-wrap .retake{position:absolute;top:8px;right:8px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.15);color:var(--txt);font-size:11.5px;font-weight:600;padding:5px 10px;border-radius:8px;cursor:pointer;font-family:inherit;}
.scan-portion{margin-bottom:14px;}
.scan-portion label{display:block;font-size:12px;color:var(--muted);margin-bottom:6px;font-weight:500;}
.scan-portion-row{display:flex;gap:8px;align-items:center;}
.scan-portion-row input{flex:1;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--raise);color:var(--txt);font-size:15px;font-family:'Space Grotesk';outline:none;}
.scan-portion-row input:focus{border-color:var(--go);}
.scan-portion-row .scan-go{flex:0 0 auto;padding:10px 18px;border-radius:10px;border:none;background:var(--go);color:#15120E;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;}
.scan-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;}
.scan-chips button{padding:5px 11px;border-radius:99px;border:1px solid var(--line);background:var(--raise);color:var(--muted);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;}
.scan-chips button:hover{border-color:var(--go);color:var(--txt);}
.scan-result{margin-top:4px;}
.scan-macro-row{display:flex;gap:6px;margin:10px 0;}
.scan-macro{flex:1;background:var(--raise);border:1px solid var(--line);border-radius:10px;padding:8px 6px;text-align:center;}
.scan-macro .sm-val{display:block;font-family:'Space Grotesk';font-weight:700;font-size:16px;}
.scan-macro .sm-lbl{display:block;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);margin-top:2px;}
.scan-context{font-size:13px;color:var(--muted);line-height:1.5;margin:10px 0 4px;font-style:italic;}
.scan-reply{font-size:14px;color:var(--txt);line-height:1.5;margin-bottom:12px;}
.scan-swap{background:rgba(242,179,61,.1);border:1px solid var(--hold);border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:13px;color:var(--hold);line-height:1.45;}
.scan-swap b{color:var(--hold);font-family:'Space Grotesk';font-size:11px;letter-spacing:.06em;display:block;margin-bottom:3px;}
.scan-actions{display:flex;gap:8px;margin-top:14px;}
.scan-actions button{flex:1;padding:13px;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;border:none;}
.scan-log-btn{background:var(--go);color:#15120E;}
.scan-dismiss-btn{background:var(--raise);border:1px solid var(--line) !important;color:var(--muted);}
.scan-entry{display:flex;flex-direction:column;align-items:center;gap:14px;}
.scan-entry .scan-icon{font-size:44px;line-height:1;}
.scan-entry p{font-size:14px;color:var(--muted);text-align:center;line-height:1.5;max-width:280px;}
.scan-btn-row{display:flex;gap:10px;width:100%;}
.scan-btn-row button{flex:1;padding:13px;border-radius:12px;border:1.5px solid var(--line);background:var(--raise);color:var(--txt);font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;flex-direction:column;align-items:center;gap:4px;}
.scan-btn-row button .sbi{font-size:22px;}
.scan-btn-row button:hover{border-color:var(--go);}
.scan-text-wrap{width:100%;}
.scan-text-wrap textarea{width:100%;padding:12px 13px;border-radius:11px;border:1px solid var(--line);background:var(--raise);color:var(--txt);font-size:15px;font-family:'Inter';outline:none;resize:none;}
.scan-text-wrap textarea:focus{border-color:var(--go);}
.share-card{background:#0C0A07;border:1.5px solid #2A2620;border-radius:18px;padding:20px 18px;margin-top:14px;text-align:center;}
.share-card-head{font-family:'Space Grotesk';font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#E8B44A;margin-bottom:10px;font-weight:800;}
.share-card-verdict{font-family:'Space Grotesk';font-size:38px;font-weight:800;margin-bottom:4px;letter-spacing:.01em;line-height:1.05;}
.share-card-iq{font-family:'Space Grotesk';font-size:15px;color:#8A8175;font-weight:800;letter-spacing:.06em;margin-bottom:12px;}
.share-card-iq b{font-size:19px;}
.share-card-name{font-size:14px;color:#F6F1E7;margin-bottom:14px;font-weight:600;}
.share-card-macros{display:flex;justify-content:center;gap:16px;flex-wrap:wrap;font-size:13px;color:#8A8175;margin-bottom:14px;font-family:'Space Grotesk';}
.share-card-macros b{font-weight:800;}
.share-card-reality{font-size:16px;color:#F6F1E7;line-height:1.4;font-weight:700;padding:0 6px;margin-bottom:10px;}
.share-card-lesson{font-size:14px;color:#E8B44A;font-style:italic;font-weight:600;margin-bottom:14px;}
.share-card-foot{font-size:11px;color:#8A8175;margin-top:6px;font-family:'Space Grotesk';border-top:1px solid #2A2620;padding-top:12px;line-height:1.7;}
.share-size-label{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);font-family:'Space Grotesk';font-weight:700;margin-top:14px;margin-bottom:8px;}
.share-size-row{display:flex;gap:8px;}
.share-size-btn{flex:1;padding:9px;border-radius:10px;border:1.5px solid var(--line);background:var(--raise);color:var(--muted);font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;}
.share-size-btn.active{border-color:var(--gold);color:var(--gold);background:rgba(232,180,74,.1);}
.share-btn{width:100%;margin-top:10px;padding:13px;border-radius:12px;border:1.5px solid var(--gold);background:rgba(232,180,74,.12);color:var(--gold);font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;letter-spacing:.01em;}
.share-btn:hover{background:rgba(232,180,74,.2);}
.share-btn:disabled{opacity:.5;cursor:not-allowed;}
@media (prefers-reduced-motion:reduce){*{transition:none!important;}}
`;

const blankDay = () => ({ date: todayKey(), cal: 0, protein: 0, carbs: 0, fat: 0, water: 0, lifted: false, vitamin: false, items: [], messages: [] });

// A day counts as "played" if the user actually did anything with it — used to decide
// whether a rolled-over day gets a real grade or a gentler welcome-back.
const dayHadActivity = (d) => !!d && (d.cal > 0 || d.lifted || (d.water || 0) > 0 || d.vitamin || (d.items && d.items.length > 0));

// Grade one day's record against the profile and the meta snapshot going into that day.
//   finalize=true  → commits streak / protection-mode / history transitions (day rollover).
//   finalize=false → read-only snapshot for the "Grade my day" check-in (no state changes).
// Kept pure and at module scope so both the rollover finalizer and the live check-in share
// one source of truth for what a "clean day" means.
function gradeDay(day, profile, meta, finalize) {
  const feedHit = day.protein >= profile.protein * 0.85 && day.cal >= profile.calories * 0.85;
  const trainHit = !!day.lifted;
  const waterHit = (day.water || 0) >= profile.waterGoal * 0.85;
  const underEatToday = day.cal < profile.calories * 0.85 || day.protein < profile.protein * 0.7;

  // Trend flags read only from the historical meta arrays, so they mean the same thing
  // whether we grade "now" or at rollover.
  const recentWater = (meta.waterHistory || []).slice(-5);
  const chronicHydrationRisk = recentWater.length >= 3 && recentWater.filter((h) => !h).length >= Math.ceil(recentWater.length * 0.6);
  const weightLogs = meta.weightLogs || [];
  const bfLogs = weightLogs.filter((w) => w.bf != null);
  const hasRecentBfTrend = (() => {
    if (bfLogs.length < 2) return false;
    const last = bfLogs[bfLogs.length - 1];
    const lastDate = new Date(last.date);
    return !!([...bfLogs].reverse().find((w) => (lastDate - new Date(w.date)) / 86400000 >= 10));
  })();
  const rapidWeightLoss = (() => {
    if (weightLogs.length < 2) return false;
    const last = weightLogs[weightLogs.length - 1];
    const lastDate = new Date(last.date);
    const prior = [...weightLogs].reverse().find((w) => (lastDate - new Date(w.date)) / 86400000 >= 6);
    if (!prior) return false;
    const days = Math.max(1, (lastDate - new Date(prior.date)) / 86400000);
    return ((prior.lbs - last.lbs) / days) * 7 > profile.weightLbs * 0.01;
  })();
  const muscleLossRisk = (() => {
    if (!hasRecentBfTrend) return false;
    const last = bfLogs[bfLogs.length - 1];
    const lastDate = new Date(last.date);
    const prior = [...bfLogs].reverse().find((w) => (lastDate - new Date(w.date)) / 86400000 >= 10);
    const leanLast = last.lbs * (1 - last.bf / 100);
    const leanPrior = prior.lbs * (1 - prior.bf / 100);
    const days = Math.max(1, (lastDate - new Date(prior.date)) / 86400000);
    return ((leanPrior - leanLast) / days) * 7 > last.lbs * 0.005;
  })();
  const compositionConcern = hasRecentBfTrend ? muscleLossRisk : rapidWeightLoss;

  const inProtectionMode = (meta.protectionDaysLeft || 0) > 0;
  let newUnderEatDays = meta.underEatDays || 0;
  let newProtectionDaysLeft = meta.protectionDaysLeft || 0;
  let newStreak = meta.streak || 0;
  let newTrainHistory = meta.trainHistory || [];
  let newWaterHistory = meta.waterHistory || [];
  let newVitaminHistory = meta.vitaminHistory || [];
  let justTriggered = false;

  if (finalize) {
    newUnderEatDays = underEatToday ? (meta.underEatDays || 0) + 1 : 0;
    if (inProtectionMode) {
      const cleanDay = feedHit && waterHit;
      newProtectionDaysLeft = cleanDay ? (meta.protectionDaysLeft || 0) - 1 : 3; // any missed day restarts the clock
      newUnderEatDays = 0;
    } else if (newUnderEatDays >= 2) {
      justTriggered = true; newProtectionDaysLeft = 3; newUnderEatDays = 0;
    }
    newTrainHistory = [...(meta.trainHistory || []), trainHit].slice(-7);
    newWaterHistory = [...(meta.waterHistory || []), waterHit].slice(-7);
    newVitaminHistory = [...(meta.vitaminHistory || []), !!day.vitamin].slice(-7);
    newStreak = feedHit && !inProtectionMode && !justTriggered
      ? (meta.streak || 0) + 1
      : (inProtectionMode || justTriggered ? 0 : (meta.streak || 0));
  }

  const data = {
    feedHit, trainHit, waterHit, vitaminHit: !!day.vitamin,
    day: (day.date || todayKey()).slice(5),
    compositionConcern, hasRecentBfTrend, chronicHydrationRisk,
    water: day.water || 0, waterGoal: profile.waterGoal,
    inProtectionMode: inProtectionMode || justTriggered,
    protectionDaysLeft: newProtectionDaysLeft,
  };

  const when = finalize ? "Tomorrow" : "From here";
  let fix;
  if (justTriggered) fix = "You're not eating enough to protect the body you're trying to build. Muscle Protection Mode starts now: each day gets graded — protein at floor, calories at floor, hydration hit. Miss any piece on any day and the 3-day count restarts. No tricks, just the floor, enforced.";
  else if (inProtectionMode) {
    const cleanDay = feedHit && waterHit;
    fix = cleanDay
      ? (finalize ? `Clean Protection day. ${newProtectionDaysLeft} more to go and you're out.` : `On track for a clean Protection day — hold it and that's ${newProtectionDaysLeft} to go.`)
      : `Protection day ${finalize ? "missed" : "at risk"} (${(!feedHit) ? "floor not hit, " : ""}${!waterHit ? "hydration light" : ""}) — ${finalize ? "the 3-day clock restarts from here. Same floor tomorrow, no shortcuts." : "close these out before the day ends to keep the clock moving."}`;
  }
  else if (compositionConcern && hasRecentBfTrend) fix = `The body-fat trend shows real muscle loss alongside the weight, not just fat. That's exactly what this app is meant to catch. ${when}: protein at floor is non-negotiable.`;
  else if (compositionConcern) fix = `Weight's coming off faster than is safe for muscle right now. That's not extra progress, that's a faster route to losing muscle along with fat. ${when}: protein at floor is non-negotiable.`;
  else if (chronicHydrationRisk) fix = `Hydration's been light for several days running, not just today — that adds up. ${when}: water and electrolytes first thing, before anything else.`;
  else if (!feedHit) fix = day.protein < profile.protein * 0.85 ? `${when}: protein first — a shake or Greek yogurt closes the gap fast without needing a full plate.` : `${when}: a little more food overall, small and frequent rather than one big meal.`;
  else if (!waterHit) fix = `Water's light — ${Math.round(day.water || 0)}/${profile.waterGoal}oz. Appetite loss quiets thirst too, not just hunger. ${when}: electrolytes alongside water, front-loaded before noon.`;
  else fix = finalize ? "Protein floor hit and hydration locked in — you protected your muscle today. Let's do it again tomorrow." : "Protein and hydration are both on track — you're nailing it. Keep it right here through the rest of the day.";

  const newMeta = { streak: newStreak, underEatDays: newUnderEatDays, protectionDaysLeft: newProtectionDaysLeft, trainHistory: newTrainHistory, waterHistory: newWaterHistory, vitaminHistory: newVitaminHistory };
  return { data, fix, newMeta };
}

export default function App({ store: injectedStore } = {}) {
  if (injectedStore) _store = injectedStore;
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [today, setToday] = useState(blankDay());
  const [streak, setStreak] = useState(0);
  const [underEatDays, setUnderEatDays] = useState(0);
  const [protectionDaysLeft, setProtectionDaysLeft] = useState(0);
  const [trainHistory, setTrainHistory] = useState([]);
  const [waterHistory, setWaterHistory] = useState([]);
  const [vitaminHistory, setVitaminHistory] = useState([]);
  const [weightLogs, setWeightLogs] = useState([]);
  const [lastActiveDate, setLastActiveDate] = useState(null);
  const [finalizedDate, setFinalizedDate] = useState(null);
  const [favorites, setFavorites] = useState({});

  useEffect(() => {
    (async () => {
      const p = await store.get("ktm:profile");
      const todayStr = todayKey();
      const t = await store.get("ktm:today:" + todayStr);
      let m = (await store.get("ktm:meta")) || {};
      const f = await store.get("ktm:favorites");
      if (p) setProfile(p);
      if (f) setFavorites(f);

      // ---- DAY ROLLOVER ----
      // The streak/history is now banked automatically when the calendar day ends, not on a
      // button press. If the last day the user logged is in the past and hasn't been graded
      // yet, grade it now and seed its recap into today's fresh panel.
      let seedForToday = null;
      if (p && m.lastActiveDate && m.lastActiveDate < todayStr && m.finalizedDate !== m.lastActiveDate) {
        const prevDay = await store.get("ktm:today:" + m.lastActiveDate);
        const gapDays = Math.round((new Date(todayStr) - new Date(m.lastActiveDate)) / 86400000);
        if (dayHadActivity(prevDay)) {
          const { data, fix, newMeta } = gradeDay(prevDay, p, m, true);
          m = { ...m, ...newMeta };
          if (gapDays > 1) m.streak = 0; // a fully skipped day since then breaks the streak
          const dn = p.startDate ? Math.max(1, Math.round((new Date(m.lastActiveDate) - new Date(p.startDate)) / 86400000) + 1) : null;
          const finalFix = gapDays > 1 ? `${fix} You also missed a day since — streak reset to 0.` : fix;
          seedForToday = { role: "score", data: { ...data, title: dn ? `DAY ${dn} — GRADED` : "YESTERDAY — GRADED" }, fix: finalFix };
        } else {
          m = { ...m, streak: 0 };
          seedForToday = { role: "c", text: "Welcome back — a day slipped by without any logging, so the streak resets to 0. Clean slate today. First move: something small and protein-heavy — a shake, Greek yogurt, or a couple of eggs." };
        }
        m.finalizedDate = m.lastActiveDate;
        store.set("ktm:meta", m);
      }

      setStreak(m.streak || 0);
      setUnderEatDays(m.underEatDays || 0);
      setProtectionDaysLeft(m.protectionDaysLeft || 0);
      setTrainHistory(m.trainHistory || []);
      setWaterHistory(m.waterHistory || []);
      setVitaminHistory(m.vitaminHistory || []);
      setWeightLogs(m.weightLogs || []);
      setLastActiveDate(m.lastActiveDate || null);
      setFinalizedDate(m.finalizedDate || null);

      if (t && t.date === todayStr) {
        setToday(t);
      } else if (seedForToday) {
        // New calendar day with a recap to show: open a fresh panel led by the recap card.
        const fresh = { ...blankDay(), messages: [seedForToday, { role: "c", text: "Fresh panel — new day. What do you need?" }] };
        setToday(fresh);
        store.set("ktm:today:" + todayStr, fresh);
        const nm = { ...m, lastActiveDate: todayStr };
        store.set("ktm:meta", nm);
        setLastActiveDate(todayStr);
      }
      setReady(true);
    })();
  }, []);

  const saveToday = (t) => {
    setToday(t);
    store.set("ktm:today:" + todayKey(), t);
    // Stamp the active day so the rollover finalizer knows which day to grade next time.
    if (lastActiveDate !== todayKey()) {
      setLastActiveDate(todayKey());
      saveMeta({ lastActiveDate: todayKey() });
    }
  };

  // Mistake/undo path: wipe today's numbers and log without touching history or streak.
  const clearToday = () => {
    saveToday({ ...blankDay(), messages: [{ role: "c", text: "Today's cleared — calories, macros, and the log are back to zero. Your streak and history are untouched." }] });
  };

  // Undo just the most recent food log (the common fat-finger fix).
  const undoLast = () => {
    if (!today.items || today.items.length === 0) return;
    const last = today.items[today.items.length - 1];
    const items = today.items.slice(0, -1);
    saveToday({
      ...today,
      cal: Math.max(0, today.cal - (last.cal || 0)),
      protein: Math.max(0, today.protein - (last.protein || 0)),
      carbs: Math.max(0, today.carbs - (last.carbs || 0)),
      fat: Math.max(0, today.fat - (last.fat || 0)),
      items,
      messages: [...(today.messages || []), { role: "c", text: `Removed "${last.name || "last item"}" — ${last.protein || 0}g protein, ${last.cal || 0} cal backed out.` }],
    });
  };

  // Every logged food nudges the favorites tally; once something crosses the threshold it
  // becomes a one-tap quick-log chip. Aggregates across days automatically, no user action.
  const recordFavorites = (items) => {
    if (!items || !items.length) return;
    setFavorites((prev) => { const next = mergeFavorites(prev, items); store.set("ktm:favorites", next); return next; });
  };

  const saveMeta = (next) => {
    const merged = { streak, underEatDays, protectionDaysLeft, trainHistory, waterHistory, vitaminHistory, weightLogs, lastActiveDate, finalizedDate, ...next };
    setStreak(merged.streak); setUnderEatDays(merged.underEatDays); setProtectionDaysLeft(merged.protectionDaysLeft);
    setTrainHistory(merged.trainHistory); setWaterHistory(merged.waterHistory); setVitaminHistory(merged.vitaminHistory); setWeightLogs(merged.weightLogs);
    setLastActiveDate(merged.lastActiveDate); setFinalizedDate(merged.finalizedDate);
    store.set("ktm:meta", merged);
  };

  // Weight is logged as a structured number (not parsed from chat) — same reliability
  // reasoning as the steps/water adjusters in Autopilot: deterministic UI input beats
  // asking an LLM to extract a number from prose for something this consequential.
  // Body fat % is optional and rides on the same entry — only stored when it's a
  // plausible value, so a stray bad input doesn't quietly corrupt the trend.
  const logWeight = (lbs, bf) => {
    if (!lbs || lbs <= 0) return;
    const entry = { date: todayKey(), lbs };
    if (bf != null && bf > 0 && bf < 60) entry.bf = bf;
    const next = [...weightLogs, entry].slice(-30);
    saveMeta({ weightLogs: next });
  };

  if (!ready) return <div className="mm"><style>{CSS}</style><div className="scroll center"><p className="lead">Loading…</p></div></div>;

  if (!profile) return (
    <div className="mm"><style>{CSS}</style>
      <Onboarding onDone={(p) => {
        const pWithStart = { ...p, startDate: todayKey() };
        setProfile(pWithStart); store.set("ktm:profile", pWithStart);
        const t = { ...blankDay(), messages: [{ role: "c", text: `You're set. ${p.calories} cal, ${p.protein}g protein, ${p.waterGoal}oz water.\n\nThat calorie number is probably higher than you'd expect, maybe higher than what you're managing to eat most days right now. That's intentional — it's a ceiling to grow toward, not a bar you need to clear today. Going over it is never the problem here; going too far under it, day after day, is the only thing this app watches for.\n\nTell me what you eat and I'll track it. Try "eat this now", "give me a workout", or "GI help".\n\nFirst move: something small and protein-heavy — a shake, Greek yogurt, or a couple eggs — even if a full meal doesn't sound possible right now.` }] };
        saveToday(t);
      }} />
    </div>
  );

  return <Coach {...{ profile, today, saveToday, streak, underEatDays, protectionDaysLeft, trainHistory, waterHistory, vitaminHistory, weightLogs, saveMeta, logWeight, clearToday, undoLast, favorites, recordFavorites, resetProfile: () => { setProfile(null); store.set("ktm:profile", null); } }} />;
}

/* ---------------- ONBOARDING (gate) ---------------- */
function Onboarding({ onDone }) {
  const [sex, setSex] = useState("");
  const [appetite, setAppetite] = useState("");
  const [ft, setFt] = useState(""); const [inch, setInch] = useState("");
  const [wt, setWt] = useState(""); const [age, setAge] = useState("");
  const [bfPct, setBfPct] = useState("");
  const [equip, setEquip] = useState("home");
  const [restr, setRestr] = useState("");
  const lbs = parseFloat(wt), heightIn = parseFloat(ft) * 12 + (parseFloat(inch) || 0), a = parseFloat(age);
  const bf = bfPct ? parseFloat(bfPct) : null;
  const bfValid = bf === null || (bf > 0 && bf < 60);
  const ok = sex && appetite && lbs > 0 && parseFloat(ft) > 0 && a > 0 && bfValid;

  return (
    <div className="scroll center">
      <div className="card">
        <div className="eyebrow">Muscle Mindset · Keep the Muscle setup</div>
        <p className="lead">A few things so nothing's guessed — your targets are computed from these, not made up.</p>
        <label className="fl">How's your appetite been lately?</label>
        <div className="seg">
          {[["normal", "Normal"], ["reduced", "Reduced"], ["low", "Low"], ["barely", "Barely eating"]].map(([v, l]) => (
            <button key={v} className={appetite === v ? "on" : ""} onClick={() => setAppetite(v)}>{l}</button>
          ))}
        </div>
        <label className="fl">Sex <span style={{ color: "var(--faint)" }}>(sets the calorie math)</span></label>
        <div className="seg">{["male", "female"].map((s) => <button key={s} className={sex === s ? "on" : ""} onClick={() => setSex(s)}>{s}</button>)}</div>
        <div className="row" style={{ marginTop: 4 }}>
          <div style={{ flex: 1 }}><label className="fl">Height</label>
            <div className="row"><input className="inp" inputMode="numeric" placeholder="ft" value={ft} onChange={(e) => setFt(e.target.value.replace(/[^\d]/g, ""))} /><input className="inp" inputMode="numeric" placeholder="in" value={inch} onChange={(e) => setInch(e.target.value.replace(/[^\d]/g, ""))} /></div>
          </div>
          <div style={{ flex: 1 }}><label className="fl">Weight (lb)</label><input className="inp" inputMode="decimal" placeholder="150" value={wt} onChange={(e) => setWt(e.target.value.replace(/[^\d.]/g, ""))} /></div>
        </div>
        <label className="fl">Age</label>
        <input className="inp" inputMode="numeric" placeholder="35" value={age} onChange={(e) => setAge(e.target.value.replace(/[^\d]/g, ""))} />
        <label className="fl">Body fat % <span style={{ color: "var(--faint)" }}>(optional, but the most accurate input)</span></label>
        <input className="inp" inputMode="decimal" placeholder="e.g. 28 — leave blank if unknown" value={bfPct} onChange={(e) => setBfPct(e.target.value.replace(/[^\d.]/g, ""))} />
        <p style={{ fontSize: 11.5, color: bfPct ? "var(--go)" : "var(--faint)", marginTop: 6, lineHeight: 1.4 }}>
          {bfPct ? "✓ Targets will be built off lean mass — the most accurate method." : "Know it from a scan or scale? Add it and your protein/calorie targets get built off lean mass instead of total weight."}
        </p>
        {!bfValid && <p className="gate">⚠ Body fat % should be a realistic number under 60.</p>}
        <label className="fl">Training access</label>
        <div className="seg">{[["gym", "Gym"], ["home", "Home (DBs/bands)"], ["bodyweight", "Bodyweight only"]].map(([v, l]) => <button key={v} className={equip === v ? "on" : ""} onClick={() => setEquip(v)}>{l}</button>)}</div>
        <label className="fl">Restrictions <span style={{ color: "var(--faint)" }}>(optional)</span></label>
        <input className="inp t" placeholder="e.g. no dairy" value={restr} onChange={(e) => setRestr(e.target.value)} />
        {!ok && bfValid && <p className="gate">⚠ Appetite, sex, height, weight & age are needed before targets — computed, never generic.</p>}
      </div>
      <button className="btn go" disabled={!ok} onClick={() => onDone({ sex, appetite, weightLbs: lbs, heightIn, age: a, equipment: equip, restrictions: restr.trim(), ...buildTargets({ sex, weightLbs: lbs, heightIn, age: a, bf, appetite }) })}>Build my plan →</button>
    </div>
  );
}

/* ---------------- COACH (pinned dash + chat) ---------------- */
function Coach({ profile, today, saveToday, streak, underEatDays, protectionDaysLeft, trainHistory, waterHistory, vitaminHistory, weightLogs, saveMeta, logWeight, clearToday, undoLast, favorites, recordFavorites, resetProfile }) {
  const [input, setInput] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [expandedTile, setExpandedTile] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dayGrade, setDayGrade] = useState(null); // ephemeral "Grade my day" check-in card
  const scrollRef = useRef(null);
  const fileRef = useRef(null);
  const msgs = today.messages || [];

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [msgs, busy]);

  const toggleExplain = (key) => (e) => { e.stopPropagation(); setExpandedTile(expandedTile === key ? null : key); };

  // FEED — protein + calorie floor. Grace period built in: no real signal to judge
  // "at risk" until there's meaningful data logged for the day (mirrors Autopilot's
  // fasted/early-day grace period, just applied to the inverted concern here).
  const hasMeaningfulData = today.cal >= profile.calories * 0.3;
  const medicalFloor = profile.sex === "male" ? 1500 : 1200;
  // CALORIES — the target runs high on purpose, so half of it is already a solid day: green at 50%.
  // A red warning only fires once real data is logged and intake is still under the clinical floor.
  const calLit = today.cal >= profile.calories * 0.5;
  const calWarn = !calLit && hasMeaningfulData && today.cal < medicalFloor;
  // PROTEIN — the dominant muscle-protection signal; only fully lit at 100% of target. Deeply
  // short protein with real data logged is the actual muscle-loss risk, so it flags red.
  const proteinLit = today.protein >= profile.protein;
  const proteinAtRisk = !proteinLit && hasMeaningfulData && today.protein < profile.protein * 0.5;

  // Chronic hydration shortfall — Protect is supposed to watch "eating, hydrating, and
  // recovering" as a trend, not just today's number (that's what the Water adjuster tile
  // already covers). Needs at least 3 tracked days before judging (grace period, same
  // pattern as everywhere else), then flags if hydration's missed the goal on most of the
  // last several days.
  const recentWater = waterHistory.slice(-5);
  const chronicHydrationRisk = recentWater.length >= 3 && recentWater.filter((hit) => !hit).length >= Math.ceil(recentWater.length * 0.6);

  // Rapid weight loss: compare the latest weigh-in against one roughly a week earlier.
  // Threshold is ~1% of bodyweight/week — fast enough that protein not keeping pace
  // means more of that loss is muscle, not just fat. This is the FALLBACK signal —
  // used only when there's no reliable body-fat trend to check directly (below).
  const rapidWeightLoss = (() => {
    if (weightLogs.length < 2) return false;
    const last = weightLogs[weightLogs.length - 1];
    const lastDate = new Date(last.date);
    const prior = [...weightLogs].reverse().find((w) => (lastDate - new Date(w.date)) / 86400000 >= 6);
    if (!prior) return false;
    const days = Math.max(1, (lastDate - new Date(prior.date)) / 86400000);
    const lossPerWeek = ((prior.lbs - last.lbs) / days) * 7;
    return lossPerWeek > profile.weightLbs * 0.01;
  })();

  // Lean mass trend: the direct version of the question Protect exists to answer —
  // is the weight coming off fat, or muscle. Only kicks in when two body-fat-tagged
  // entries exist at least 10 days apart (longer gap than the weight-only check, since
  // home BIA scales bounce 2-5% just from hydration/time-of-day — a week isn't enough
  // separation to trust a single comparison). When this data exists, it REPLACES the
  // cruder weight-only proxy above, since it's measuring the actual thing, not a stand-in.
  const bfLogs = weightLogs.filter((w) => w.bf != null);
  const hasRecentBfTrend = (() => {
    if (bfLogs.length < 2) return false;
    const last = bfLogs[bfLogs.length - 1];
    const lastDate = new Date(last.date);
    return !!([...bfLogs].reverse().find((w) => (lastDate - new Date(w.date)) / 86400000 >= 10));
  })();
  const muscleLossRisk = (() => {
    if (!hasRecentBfTrend) return false;
    const last = bfLogs[bfLogs.length - 1];
    const lastDate = new Date(last.date);
    const prior = [...bfLogs].reverse().find((w) => (lastDate - new Date(w.date)) / 86400000 >= 10);
    const leanLast = last.lbs * (1 - last.bf / 100);
    const leanPrior = prior.lbs * (1 - prior.bf / 100);
    const days = Math.max(1, (lastDate - new Date(prior.date)) / 86400000);
    const leanLossPerWeek = ((leanPrior - leanLast) / days) * 7;
    return leanLossPerWeek > last.lbs * 0.005; // >0.5% of bodyweight in LEAN mass/week
  })();
  const compositionConcern = hasRecentBfTrend ? muscleLossRisk : rapidWeightLoss;

  // PROTECT — the trend signal, not a today signal: hydration consistency over the last
  // several days, weight-loss pace, and whether Muscle Protection Mode is running. Feed
  // and Train answer "did today go right"; Protect answers "is the week heading somewhere
  // safe." protectReason always carries a plain-language line so the tile never just says
  // "fine" or "not fine" without saying what it actually checked.
  const protectAtRisk = protectionDaysLeft > 0 || compositionConcern || chronicHydrationRisk;
  const protectLit = !protectAtRisk;
  const protectReason = protectionDaysLeft > 0 ? "Protection Mode active"
    : compositionConcern ? (hasRecentBfTrend ? "Losing muscle, not just fat" : "Weight dropping fast")
    : chronicHydrationRisk ? "Hydration falling behind"
    : "Hydration + pace, on track";

  const waterLow = today.cal >= profile.calories * 0.3 && (today.water || 0) < profile.waterGoal * 0.25;

  // HYDRATE — today's water + minerals, combined. Green only when the water goal is hit AND
  // minerals are logged. (Multi-day hydration/composition trends still feed Muscle Protection
  // Mode via the banner above; this tile stays a simple today signal.)
  const waterHitFull = (today.water || 0) >= profile.waterGoal;
  const mineralsDone = !!today.vitamin;
  const hydrateLit = waterHitFull && mineralsDone;

  const dayNumber = profile.startDate
    ? Math.max(1, Math.round((new Date(todayKey()) - new Date(profile.startDate)) / 86400000) + 1)
    : 1;

  const favs = topFavorites(favorites);

  // One-tap re-log of a favorite: pure replay of the exact numbers last logged for that food —
  // no AI call, no estimate, so it can't invent a portion. Accuracy is preserved by construction.
  const quickLog = (f) => {
    if (busy) return;
    const l = { name: f.name, cal: f.cal || 0, protein: f.protein || 0, carbs: f.carbs || 0, fat: f.fat || 0, verdict: f.verdict || null };
    const nt = {
      ...today,
      cal: today.cal + l.cal, protein: today.protein + l.protein, carbs: today.carbs + l.carbs, fat: today.fat + l.fat,
      items: [...today.items, l],
      messages: [...(today.messages || []), { role: "c", text: `Logged ${l.name} again — ${l.protein}g protein, ${l.cal} cal added.`, logged: `+${l.protein}g protein · ${l.cal} cal logged`, verdict: l.verdict }],
    };
    saveToday(nt);
    recordFavorites([l]);
  };

  const push = (m, t) => { const nt = { ...t, messages: [...(t.messages || []), m] }; saveToday(nt); return nt; };

  const histFrom = (t, dropLast) => {
    let arr = (t.messages || []).slice(0, dropLast ? -1 : undefined)
      .filter((m) => m.role === "u" || m.role === "c")
      .map((m) => ({ role: m.role === "u" ? "user" : "assistant", content: m.text || "[photo]" }))
      .slice(-8);
    while (arr.length && arr[0].role === "assistant") arr.shift(); // API must start with user
    return arr;
  };

  const callCoach = async (apiMessages, t) => {
    const res = await fetch("/api/coach", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "coach", model: "claude-sonnet-4-6", max_tokens: 1000, system: systemPrompt(profile, t, { protectionDaysLeft, trainHistory }), messages: apiMessages, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }] }),
    });
    if (!res.ok) {
      let detail = "";
      try { const err = await res.json(); detail = err?.error?.message || JSON.stringify(err?.error || err); }
      catch (e) { try { detail = await res.text(); } catch (e2) {} }
      throw new Error(detail || `Coach API failed (${res.status})`);
    }
    return res.json();
  };

  const applyResponse = (data, t) => {
    const raw = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    const txt = raw.replace(/```json|```/g, "").trim();
    let parsed;
    try { parsed = JSON.parse(txt); }
    catch {
      // Model may have wrapped the JSON in prose/markdown despite instructions — pull out
      // the LAST balanced {...} block (explanatory prose tends to come before it, not after).
      const matches = txt.match(/\{[\s\S]*\}/g);
      if (matches) {
        for (let i = matches.length - 1; i >= 0 && !parsed; i--) {
          try { parsed = JSON.parse(matches[i]); } catch (e2) {}
        }
      }
      // Last resort: never show raw JSON/markdown to the user — show a clean generic line instead.
      if (!parsed) parsed = { reply: "Logged. Check your numbers above.", logs: [] };
    }
    const logs = Array.isArray(parsed.logs) ? parsed.logs : (parsed.log ? [parsed.log] : []);
    let nt = { ...t };
    let addedCal = 0, addedProtein = 0;
    // Verdict aggregation is calorie-weighted, not worst-wins. A few low-protein grapes
    // alongside 5 eggs and a protein shake shouldn't drag the whole plate down to "bad" —
    // that's exactly the kind of false-alarm guilt this app is supposed to avoid. Weighting
    // by calorie share means a minor side item barely moves the needle either direction;
    // a meal that's actually dominated by something bad still correctly comes out bad.
    const rank = { good: 1, caution: 2, bad: 3 };
    let weightedScore = 0, verdictWeight = 0;
    for (const l of logs) {
      if (!l || (!l.cal && !l.protein)) continue;
      nt = { ...nt, cal: nt.cal + (l.cal || 0), protein: nt.protein + (l.protein || 0), carbs: nt.carbs + (l.carbs || 0), fat: nt.fat + (l.fat || 0), items: [...nt.items, l] };
      addedCal += l.cal || 0; addedProtein += l.protein || 0;
      if (l.verdict && rank[l.verdict]) {
        const weight = Math.max(l.cal || 0, 1);
        weightedScore += rank[l.verdict] * weight;
        verdictWeight += weight;
      }
    }
    const combinedVerdict = verdictWeight > 0
      ? (weightedScore / verdictWeight < 1.5 ? "good" : weightedScore / verdictWeight < 2.5 ? "caution" : "bad")
      : null;
    const replyText = typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : (logs.length ? "Logged." : "");
    nt = { ...nt, messages: [...nt.messages, {
      role: "c", text: replyText,
      logged: logs.length ? `+${addedProtein}g protein · ${addedCal} cal logged` : null,
      verdict: combinedVerdict,
    }] };
    saveToday(nt);
    recordFavorites(logs);
  };

  const send = async (raw) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setDayGrade(null);
    const t = push({ role: "u", text }, today);
    setBusy(true);
    try { applyResponse(await callCoach(histFrom(t), t), t); }
    catch (e) { push({ role: "c", text: `Couldn't reach the coach: ${e.message || "unknown error"}. Try again in a moment.` }, t); }
    setBusy(false);
  };

  const sendImage = async (file) => {
    if (!file || busy) return;
    setDayGrade(null);
    let img; try { img = await fileToImg(file); } catch (e) { return; }
    const t = push({ role: "u", text: "", img: img.dataUrl }, today);
    setBusy(true);
    const userMsg = { role: "user", content: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: img.base64 } },
      { type: "text", text: "Photo attached. If it's a nutrition label, read the macros off it exactly; if it's a meal, estimate the macros from the plate. Log it per your rules and return ONLY the JSON envelope." },
    ] };
    try { applyResponse(await callCoach([...histFrom(t, true), userMsg], t), t); }
    catch (e) { push({ role: "c", text: `Couldn't read that photo: ${e.message || "try again, or type the item in."}` }, t); }
    setBusy(false);
  };

  // "Grade my day" — a read-only check-in the user can pull up any time.
  // It grades the day as-it-stands (finalize=false) and shows an ephemeral ScoreCard.
  // It does NOT touch meta, bank the streak, or reset the panel — banking happens
  // automatically at calendar-day rollover (see the load effect's gradeDay(..., true)).
  const gradeToday = () => {
    const meta = { streak, underEatDays, protectionDaysLeft, trainHistory, waterHistory, vitaminHistory, weightLogs };
    const { data, fix } = gradeDay(today, profile, meta, false);
    setDayGrade({ data: { ...data, title: `DAY ${dayNumber} — SO FAR` }, fix });
  };

  const setVal = (patch) => saveToday({ ...today, ...patch });
  const toggleVitamin = () => saveToday({ ...today, vitamin: !today.vitamin });

  return (
    <div className="mm"><style>{CSS}</style>
      <div className="dash">
        <div className="dhead">
          <div className="lg">MUSCLE <b className="gold">MINDSET</b> · KEEP THE MUSCLE</div>
          <div className="streak">Day {dayNumber}{streak > 0 ? ` · 🔥 ${streak}` : ""} · <button className="infobtn" onClick={() => setShowInfo(!showInfo)}>ⓘ</button></div>
        </div>
        {profile.belowMedicalFloor && (
          <p style={{ fontSize: 11, color: "var(--hold)", margin: "0 0 8px", lineHeight: 1.4, fontWeight: 600 }}>
            ℹ️ Your calculated maintenance landed under the safe minimum, so your target is set to the clinical floor of {profile.calories} cal — this is a protective number, not a deficit.
          </p>
        )}
        {protectionDaysLeft > 0 && (
          <p style={{ fontSize: 11.5, color: "var(--stop)", margin: "0 0 8px", lineHeight: 1.4, fontWeight: 700, background: "rgba(240,96,77,.12)", border: "1px solid var(--stop)", borderRadius: 8, padding: "7px 10px" }}>
            🛡️ MUSCLE PROTECTION MODE — {protectionDaysLeft} clean day{protectionDaysLeft === 1 ? "" : "s"} left. Today needs: protein at floor, calories at floor, hydration hit. Miss any piece and the clock restarts.
          </p>
        )}
        {showInfo && (
          <div style={{ fontSize: 10.5, color: "var(--faint)", marginBottom: 6, fontFamily: "Inter", lineHeight: 1.55 }}>
            <b style={{ color: "var(--muted)", fontFamily: "Space Grotesk" }}>Why the calorie number looks high:</b> it's set near maintenance on purpose, with no diet-style cut subtracted — the deficit here already comes from appetite, so stacking another one on top is the thing that costs muscle. It's a ceiling to grow toward, not a bar to clear today. Over is never a problem; sustained-under is the only thing watched for.
            {profile.accuracy === "lean-mass" && <div style={{ marginTop: 4 }}>✓ Targets built from {profile.leanLbs} lb lean mass ({profile.bf}% BF)</div>}
            <div style={{ marginTop: 6 }}>Tap the ⓘ on any tile below for what it tracks specifically.</div>
          </div>
        )}
        <div className="signals3">
          <div className={`word ${calLit ? "lit-go" : calWarn ? "lit-risk" : ""}`}>
            <button className="ibadge" onClick={toggleExplain("calories")}>ⓘ</button>
            <span className="wl">{calWarn ? "⚠️ CALORIES" : "CALORIES"}</span>
            <span className="wb">{Math.min(999, Math.round((today.cal / profile.calories) * 100))}%</span>
            <span className="wc">{today.cal}/{profile.calories} cal</span>
          </div>
          <div className={`word ${proteinLit ? "lit-go" : proteinAtRisk ? "lit-risk" : ""}`}>
            <button className="ibadge" onClick={toggleExplain("protein")}>ⓘ</button>
            <span className="wl">{proteinAtRisk ? "⚠️ PROTEIN" : "PROTEIN"}</span>
            <span className="wb">{Math.min(999, Math.round((today.protein / profile.protein) * 100))}%</span>
            <span className="wc">{today.protein}/{profile.protein}g</span>
          </div>
          <div className={`word ${hydrateLit ? "lit-go" : ""}`}>
            <button className="ibadge" onClick={toggleExplain("hydrate")}>ⓘ</button>
            <span className="wl">HYDRATE</span>
            <span className="wb">{hydrateLit ? "✅" : "💧"}</span>
            <span className="wc">{Math.round(today.water || 0)}/{profile.waterGoal}oz · {mineralsDone ? "minerals ✓" : "minerals —"}</span>
          </div>
        </div>
        {proteinAtRisk && (
          <p style={{ fontSize: 11.5, color: "var(--stop)", margin: "0 0 8px", lineHeight: 1.4, fontWeight: 600 }}>
            🔴 Protein's deeply short with real data logged today — that's the muscle-loss risk, not a calorie number. Protein first, even small amounts.
          </p>
        )}
        <div className="sigrow">
          <div className={`sig ${today.vitamin ? "lit-go" : ""}`} onClick={toggleVitamin}>
            <button className="ibadge" onClick={toggleExplain("minerals")}>ⓘ</button>
            <span className="sl">Minerals</span><span className="sv">{today.vitamin ? "✅" : "⬜"}</span>
          </div>
          <div className={`sig adj ${(today.water || 0) >= profile.waterGoal ? "hit" : waterLow ? "low" : ""}`}>
            <button className="ibadge" onClick={toggleExplain("water")}>ⓘ</button>
            <span className="sl">Water {(today.water || 0) >= profile.waterGoal ? "✅" : waterLow ? "⚠️" : ""}</span>
            <span className="sn">{Math.round(today.water || 0)}/{profile.waterGoal}oz</span>
            <div className="pm">
              <button onClick={() => setVal({ water: Math.max(0, (today.water || 0) - 8) })} disabled={(today.water || 0) <= 0}>−</button>
              <button onClick={() => setVal({ water: (today.water || 0) < profile.waterGoal ? Math.min(profile.waterGoal, (today.water || 0) + 8) : (today.water || 0) + 8 })}>+</button>
            </div>
          </div>
        </div>
        {expandedTile && TILE_INFO[expandedTile] && (
          <div className="explain">
            <b>{TILE_INFO[expandedTile].label}</b>
            <p>{TILE_INFO[expandedTile].text}</p>
          </div>
        )}
        <WeightLog logs={weightLogs} onLog={logWeight} toggleExplain={toggleExplain} />
      </div>

      {favs.length > 0 && (
        <div className="favbar">
          <span className="favlbl">⚡ Quick&nbsp;log</span>
          {favs.map((f) => (
            <button key={f.name} className="favchip" onClick={() => quickLog(f)} disabled={busy}
              title={`${f.name} · ${f.cal} cal · logged ${f.count}×`}>
              <span>{foodEmoji(f.name)}</span><span>{f.name}</span><span className="fp">{f.protein}p</span>
            </button>
          ))}
        </div>
      )}

      <div className="scroll" ref={scrollRef}>
        {msgs.map((m, i) => m.role === "score" ? <ScoreCard key={i} d={m.data} fix={m.fix} /> : (
          <div className={`msg ${m.role}`} key={i}>
            <div className="bub">
              {m.img && <img src={m.img} alt="meal" style={{ maxWidth: "180px", width: "100%", borderRadius: 10, display: "block", marginBottom: m.text ? 8 : 0 }} />}
              {m.verdict && <VerdictBadge verdict={m.verdict} />}
              {m.text}
              {m.logged && <span className="logged">{m.logged}</span>}
            </div>
          </div>
        ))}
        {dayGrade && <ScoreCard d={dayGrade.data} fix={dayGrade.fix} />}
        {busy && <div className="msg c"><div className="bub" style={{ color: "var(--muted)" }}>…</div></div>}
      </div>

      <div className="foot">
        <div className="qa">
          <button onClick={() => setScanOpen(true)} disabled={busy} style={{ borderColor: "var(--gold)", color: "var(--gold)" }}>🔍 Scan before eating</button>
          {today.items && today.items.length > 0 && (
            <button onClick={undoLast} disabled={busy} style={{ borderColor: "var(--hold)", color: "var(--hold)" }}>↩ Undo last log</button>
          )}
          <button onClick={gradeToday} disabled={busy} style={{ borderColor: "var(--go)", color: "var(--go)" }}>Grade my day</button>
          {["Eat this now", "Meal plan", "Give me a workout", "GI help", "Check in"].map((q) => (
            <button key={q} onClick={() => send(q)} disabled={busy}>{q}</button>
          ))}
        </div>
        <div className="inrow">
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) sendImage(f); e.target.value = ""; }} />
          <button className="cam" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy} title="Photo of a label or meal">📷</button>
          <textarea rows={1} placeholder="Log a meal, snap a label, or ask…" value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button className="send" onClick={() => send()} disabled={busy || !input.trim()}>↑</button>
        </div>
        <div style={{ textAlign: "center", marginTop: 6, display: "flex", justifyContent: "center", gap: 14 }}>
          <ClearTodayLink onClear={clearToday} />
          <button className="x" onClick={resetProfile}>Reset profile</button>
        </div>
      </div>
      {scanOpen && (
        <ScanModal
          profile={profile}
          today={today}
          onClose={() => setScanOpen(false)}
          onLog={(preview) => {
            const l = { name: preview.name, cal: preview.cal, protein: preview.protein, carbs: preview.carbs, fat: preview.fat, verdict: preview.verdict };
            const nt = {
              ...today,
              cal: today.cal + (l.cal || 0), protein: today.protein + (l.protein || 0),
              carbs: today.carbs + (l.carbs || 0), fat: today.fat + (l.fat || 0),
              items: [...today.items, l],
              messages: [...(today.messages || []), { role: "c", text: `Logged ${l.name} — ${l.protein}g protein, ${l.cal} cal added to today.`, logged: `+${l.protein}g protein · ${l.cal} cal logged`, verdict: l.verdict }],
            };
            saveToday(nt);
            recordFavorites([l]);
            setScanOpen(false);
          }}
          systemPromptFn={scanSystemPrompt}
        />
      )}
    </div>
  );
}

/* ---------------- MEAL SCAN PREVIEW MODAL ----------------
   Preview a food's verdict BEFORE eating it. The share-card export uses native Canvas
   (no external script), so it can't be blocked by CSP the way dynamically-loaded
   html2canvas was — this is the fixed approach, ported from Autopilot. */
function ScanModal({ profile, today, onClose, onLog, systemPromptFn }) {
  const [step, setStep] = useState("entry");
  const [imgData, setImgData] = useState(null);
  const [textInput, setTextInput] = useState("");
  const [portion, setPortion] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const [sharing, setSharing] = useState(false);

  const verdictCfg = {
    good: { icon: "✅", label: "Works For You", color: "var(--go)", hex: "#8BE05A", bg: "rgba(139,224,90,.13)" },
    caution: { icon: "⚠️", label: "Use Wisely", color: "var(--hold)", hex: "#F2B33D", bg: "rgba(242,179,61,.13)" },
    bad: { icon: "❌", label: "Works Against You", color: "var(--stop)", hex: "#F0604D", bg: "rgba(240,96,77,.13)" },
  };

  // Shareable-card verdicts — bigger, punchier language built for a social screenshot,
  // not a clinical report. Maps from preview.cardVerdict (falls back off the plain verdict).
  const cardVerdictCfg = {
    elite: { icon: "🔥", label: "ELITE FUEL", hex: "#E8B44A" },
    muscle: { icon: "🥇", label: "MUSCLE MOVE", hex: "#8BE05A" },
    protein_trap: { icon: "⚠️", label: "PROTEIN TRAP", hex: "#F2B33D" },
    calorie_trap: { icon: "🚨", label: "CALORIE TRAP", hex: "#F0604D" },
  };
  const cardVerdictKey = (p) =>
    (cardVerdictCfg[p.cardVerdict] && p.cardVerdict) ||
    { good: "muscle", caution: "protein_trap", bad: "calorie_trap" }[p.verdict] ||
    "muscle";
  const cardVerdictFor = (p) => cardVerdictCfg[cardVerdictKey(p)];
  // Food IQ falls back to a sensible score-per-verdict when the coach omits it.
  const foodIQFor = (p) =>
    Number.isFinite(p.foodIQ) ? p.foodIQ
      : { elite: 96, muscle: 82, protein_trap: 55, calorie_trap: 30 }[cardVerdictKey(p)];

  // Export presets — one-tap sizes for the platforms people actually post to.
  const SHARE_SIZES = {
    square: { w: 1080, h: 1080, label: "Post 1:1" },
    portrait: { w: 1080, h: 1350, label: "Feed 4:5" },
    story: { w: 1080, h: 1920, label: "Story 9:16" },
  };
  const [shareSize, setShareSize] = useState("square");

  const runScan = async (imageData, text, portionStr) => {
    setScanning(true); setStep("scanning"); setError(null);
    const portionNote = portionStr ? `Portion: ${portionStr}.` : "Estimate a standard single serving.";
    const sys = systemPromptFn(profile, today);
    let messages;
    if (imageData) {
      messages = [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageData.base64 } },
        { type: "text", text: `Pre-eat scan. ${portionNote} ${text ? "Additional context: " + text : "Identify what this is and evaluate it."} Return ONLY the JSON preview envelope.` },
      ] }];
    } else {
      messages = [{ role: "user", content: `Pre-eat scan. Food: "${text}". ${portionNote} Return ONLY the JSON preview envelope.` }];
    }
    try {
      const res = await fetch("/api/coach", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "scan", model: "claude-sonnet-4-6", max_tokens: 1000, system: sys, messages, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }] }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      const raw = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
      const txt = raw.replace(/```json|```/g, "").trim();
      let parsed;
      try { parsed = JSON.parse(txt); } catch {
        const matches = txt.match(/\{[\s\S]*\}/g);
        if (matches) { for (let i = matches.length - 1; i >= 0 && !parsed; i--) { try { parsed = JSON.parse(matches[i]); } catch {} } }
      }
      if (!parsed || !parsed.preview) throw new Error("Couldn't read the scan result. Try again.");
      // Hard calorie lock: derive calories from the macros (Atwater) so the number on the
      // card can never contradict the protein/carb/fat it's shown next to. Rounded to the
      // nearest 5 to read like a label.
      const pr = parsed.preview;
      const atwater = 4 * (pr.protein || 0) + 4 * (pr.carbs || 0) + 9 * (pr.fat || 0);
      pr.cal = Math.round(atwater / 5) * 5;
      setResult(parsed);
      setStep("result");
    } catch (e) {
      setError(e.message || "Scan failed — try again.");
      setStep("entry");
    }
    setScanning(false);
  };

  const handleFile = async (file) => {
    try { const img = await fileToImg(file); setImgData(img); setStep("portion"); }
    catch { setError("Couldn't load that image."); }
  };

  const handleScanFromEntry = () => { if (!textInput.trim()) return; setStep("portion"); };
  const handlePortionSubmit = (portionStr) => { runScan(imgData, textInput, portionStr || portion); };

  // Premium share card — native Canvas (no external script, CSP-safe). Black / gold / white,
  // no gradients, everything big enough to read from across a room. Async so the product
  // photo can be loaded and drawn. `size` picks one of the SHARE_SIZES presets.
  const GOLD = "#E8B44A", WHITE = "#F6F1E7", MUTED = "#8A8175", BG = "#0C0A07", PANEL = "#16130E", LINE = "#2A2620";

  const loadImage = (src) =>
    new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });

  // Rounded-rect path helper.
  const rr = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const buildShareCanvas = async (p, cv, sizeKey) => {
    const { w: W, h: H } = SHARE_SIZES[sizeKey] || SHARE_SIZES.square;
    const M = 88;                       // outer margin
    const contentW = W - M * 2;
    const cx = W / 2;                    // horizontal centre — everything is centred

    const photo = await loadImage(imgData?.dataUrl || null);

    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.textBaseline = "alphabetic";

    // background + thin gold frame
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = LINE; ctx.lineWidth = 2;
    rr(ctx, 28, 28, W - 56, H - 56, 28); ctx.stroke();

    ctx.textAlign = "center";
    const iq = foodIQFor(p);

    // --- pre-measure the flexible text blocks so the product photo can take the slack ---
    const measure = document.createElement("canvas").getContext("2d");
    measure.font = "600 34px 'Inter', sans-serif";
    const nameLines = wrapLines(measure, p.name, contentW - 10);
    const rcText = p.realityCheck || p.contextLine || "";
    measure.font = "700 40px 'Inter', sans-serif";
    const rcLines = rcText ? wrapLines(measure, rcText, contentW - 20) : [];

    // Vertical budget. Everything except the image is a fixed advance; the image absorbs
    // whatever is left, so the same layout balances across 1:1 / 4:5 / 9:16.
    const nameLineH = 44, rcLineH = 52;
    const contentTop = 74, headerAdv = 64, verdictBlock = 120, iqAdv = 66;
    const nameAdv = nameLines.length * nameLineH + 26;
    const macroMh = 120, macroAdv = macroMh + 44;
    const rcAdv = rcLines.length ? rcLines.length * rcLineH + 30 : 0;
    const lessonAdv = p.lesson ? 58 : 0;
    const footerH = 176, bottomPad = 30;
    const nonImage = contentTop + headerAdv + verdictBlock + iqAdv + nameAdv + macroAdv + rcAdv + lessonAdv;
    const imgH = H - nonImage - footerH - bottomPad;

    let y = contentTop;

    // --- brand header (no "Meal Scan" — the verdict is the hook) ---
    ctx.fillStyle = GOLD;
    ctx.font = "800 40px 'Space Grotesk', sans-serif";
    ctx.fillText("MUSCLE MINDSET AI", cx, y);
    y += headerAdv;

    // --- VERDICT: the hero element, auto-fit so long labels never clip ---
    const vText = `${cv.icon} ${cv.label}`;
    let vFont = 96;
    ctx.font = `800 ${vFont}px 'Space Grotesk', sans-serif`;
    while (ctx.measureText(vText).width > contentW - 10 && vFont > 54) {
      vFont -= 2; ctx.font = `800 ${vFont}px 'Space Grotesk', sans-serif`;
    }
    ctx.fillStyle = cv.hex;
    ctx.fillText(vText, cx, y + vFont * 0.78);
    y += verdictBlock;

    // --- Food IQ score (curiosity hook: "wait, tuna's a 96?") ---
    const iqLabel = "FOOD IQ ", iqNum = `${iq}/100`;
    ctx.font = "800 30px 'Space Grotesk', sans-serif";
    const wLbl = ctx.measureText(iqLabel).width;
    ctx.font = "800 46px 'Space Grotesk', sans-serif";
    const wNum = ctx.measureText(iqNum).width;
    const iqStart = cx - (wLbl + wNum) / 2;
    ctx.textAlign = "left";
    ctx.fillStyle = MUTED; ctx.font = "800 30px 'Space Grotesk', sans-serif";
    ctx.fillText(iqLabel, iqStart, y);
    ctx.fillStyle = cv.hex; ctx.font = "800 46px 'Space Grotesk', sans-serif";
    ctx.fillText(iqNum, iqStart + wLbl, y);
    ctx.textAlign = "center";
    y += iqAdv;

    // --- food name ---
    ctx.fillStyle = WHITE;
    ctx.font = "600 34px 'Inter', sans-serif";
    nameLines.forEach((line, i) => ctx.fillText(line, cx, y + i * nameLineH));
    y += nameAdv;

    // --- product image (or a branded panel for text-only scans); skipped if there's no room ---
    if (imgH > 90) {
      const iw = contentW;
      rr(ctx, M, y, iw, imgH, 24);
      ctx.save(); ctx.clip();
      if (photo) {
        const ar = photo.width / photo.height, panelAr = iw / imgH;
        let dw, dh, dx, dy;
        if (ar > panelAr) { dh = imgH; dw = imgH * ar; dx = M - (dw - iw) / 2; dy = y; }
        else { dw = iw; dh = iw / ar; dx = M; dy = y - (dh - imgH) / 2; }
        ctx.drawImage(photo, dx, dy, dw, dh);
      } else {
        ctx.fillStyle = PANEL; ctx.fillRect(M, y, iw, imgH);
        ctx.fillStyle = LINE;
        ctx.font = "800 120px 'Space Grotesk', sans-serif";
        ctx.fillText("🧠", cx, y + imgH / 2 + 40);
      }
      ctx.restore();
      ctx.strokeStyle = LINE; ctx.lineWidth = 2; rr(ctx, M, y, iw, imgH, 24); ctx.stroke();
      y += imgH + 40;
    } else {
      y += Math.max(0, imgH) + 40;
    }

    // --- macro row ---
    const macros = [["CALORIES", p.cal, WHITE], ["PROTEIN", p.protein + "g", GOLD], ["CARBS", p.carbs + "g", WHITE], ["FAT", p.fat + "g", WHITE]];
    const gap = 22;
    const mw = (contentW - gap * 3) / 4;
    macros.forEach(([lab, val, color], i) => {
      const x = M + i * (mw + gap);
      ctx.fillStyle = PANEL; rr(ctx, x, y, mw, macroMh, 18); ctx.fill();
      ctx.strokeStyle = LINE; ctx.lineWidth = 1.5; rr(ctx, x, y, mw, macroMh, 18); ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = "800 44px 'Space Grotesk', sans-serif";
      ctx.fillText(String(val), x + mw / 2, y + 66);
      ctx.fillStyle = MUTED;
      ctx.font = "700 18px 'Space Grotesk', sans-serif";
      ctx.fillText(lab, x + mw / 2, y + 98);
    });
    y += macroAdv;

    // --- reality check (the undeniable punch) ---
    if (rcLines.length) {
      ctx.fillStyle = WHITE;
      ctx.font = "700 40px 'Inter', sans-serif";
      rcLines.forEach((line, i) => ctx.fillText(line, cx, y + i * rcLineH));
      y += rcLines.length * rcLineH + 30;
    }

    // --- lesson (the teaching takeaway) ---
    if (p.lesson) {
      ctx.fillStyle = GOLD;
      ctx.font = "italic 700 32px 'Inter', sans-serif";
      ctx.fillText(p.lesson, cx, y);
    }

    // --- brand footer with CTA ---
    ctx.strokeStyle = LINE; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(M + 80, H - footerH); ctx.lineTo(W - M - 80, H - footerH); ctx.stroke();
    ctx.fillStyle = WHITE;
    ctx.font = "700 28px 'Space Grotesk', sans-serif";
    ctx.fillText("Scanned with 🧠 Muscle Mindset AI", cx, H - 116);
    ctx.fillStyle = GOLD;
    ctx.font = "800 34px 'Space Grotesk', sans-serif";
    ctx.fillText("Scan yours →  musclemindset.app", cx, H - 70);
    ctx.fillStyle = MUTED;
    ctx.font = "600 22px 'Inter', sans-serif";
    ctx.fillText("@musclemindsetai   ·   YouTube: Muscle Mindset AI", cx, H - 34);

    ctx.textAlign = "left";
    return canvas;
  };

  function wrapLines(ctx, text, maxWidth) {
    const words = text.split(" ");
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  const handleShare = async (p, cv, sizeKey) => {
    if (sharing) return;
    setSharing(true);
    try {
      const canvas = await buildShareCanvas(p, cv, sizeKey);
      canvas.toBlob((blob) => {
        if (!blob) { setSharing(false); alert("Couldn't generate the image — try a screenshot instead."); return; }
        // Direct download only — navigator.share() with files requires a top-level browsing
        // context and is blocked inside the artifact's iframe regardless of CSP. A same-origin
        // download link has no such restriction.
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `muscle-mindset-card-${sizeKey}.png`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        setSharing(false);
      }, "image/png");
    } catch { setSharing(false); alert("Couldn't generate share image — try a screenshot instead."); }
  };

  return (
    <div className="scan-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="scan-sheet">
        <div className="scan-handle" />
        <div className="scan-header">🔍 Scan a meal — preview before you eat</div>
        {step === "entry" && (
          <div className="scan-entry">
            <div className="scan-icon">🍽️</div>
            <p>Snap a photo of the meal or label, or describe what you're thinking about eating. The coach will check it against your protein floor before you commit.</p>
            {error && <p style={{ color: "var(--stop)", fontSize: 13 }}>{error}</p>}
            <div className="scan-btn-row">
              <button onClick={() => fileRef.current?.click()}><span className="sbi">📷</span>Photo</button>
              <button onClick={() => setStep("text")}><span className="sbi">✏️</span>Describe it</button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          </div>
        )}
        {step === "text" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="scan-text-wrap">
              <textarea rows={3} placeholder="e.g. Greek yogurt with berries, or a protein shake..." value={textInput}
                onChange={(e) => setTextInput(e.target.value)} autoFocus />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setStep("entry")} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--raise)", color: "var(--muted)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Back</button>
              <button onClick={handleScanFromEntry} disabled={!textInput.trim()} style={{ flex: 2, padding: "10px", borderRadius: 10, border: "none", background: "var(--go)", color: "#15120E", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: textInput.trim() ? 1 : 0.4 }}>Next →</button>
            </div>
          </div>
        )}
        {step === "portion" && (
          <div>
            {imgData && (<div className="scan-img-wrap"><img src={imgData.dataUrl} alt="meal" /><button className="retake" onClick={() => { setImgData(null); setStep("entry"); }}>Retake</button></div>)}
            {textInput && !imgData && (<div style={{ background: "var(--raise)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 14, color: "var(--muted)" }}>"{textInput}"</div>)}
            <div className="scan-portion">
              <label>How much are you eating?</label>
              <div className="scan-portion-row">
                <input placeholder="e.g. 1 cup, 6 oz, half plate…" value={portion}
                  onChange={(e) => setPortion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handlePortionSubmit(portion); }} />
                <button className="scan-go" onClick={() => handlePortionSubmit(portion)}>Scan →</button>
              </div>
              <div className="scan-chips">
                {["A few bites", "Standard serving", "Half portion", "Whole plate"].map((s) => (
                  <button key={s} onClick={() => handlePortionSubmit(s)}>{s}</button>
                ))}
              </div>
            </div>
          </div>
        )}
        {step === "scanning" && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            {imgData && <img src={imgData.dataUrl} alt="meal" style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 12, marginBottom: 18, opacity: 0.6 }} />}
            <div style={{ fontSize: 28, marginBottom: 12 }}>🔍</div>
            <p style={{ color: "var(--muted)", fontSize: 14 }}>Checking it against your protein floor…</p>
          </div>
        )}
        {step === "result" && result && (() => {
          const p = result.preview;
          const vc = verdictCfg[p.verdict] || verdictCfg.caution;
          const cv = cardVerdictFor(p);
          return (
            <div className="scan-result">
              {imgData && <div className="scan-img-wrap" style={{ marginBottom: 12 }}><img src={imgData.dataUrl} alt="meal" /></div>}
              <div style={{ background: vc.bg, border: `1.5px solid ${vc.color}`, borderRadius: 12, padding: "12px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 24 }}>{vc.icon}</span>
                <div>
                  <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 16, color: vc.color }}>{vc.label}</div>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 1 }}>{p.name}</div>
                </div>
              </div>
              <div className="scan-macro-row">
                {[["cal", p.cal, "var(--txt)"], ["protein", p.protein + "g", "var(--go)"], ["carbs", p.carbs + "g", "var(--carb)"], ["fat", p.fat + "g", "var(--fat)"]].map(([l, v, c]) => (
                  <div className="scan-macro" key={l}><span className="sm-val" style={{ color: c }}>{v}</span><span className="sm-lbl">{l}</span></div>
                ))}
              </div>
              {p.contextLine && <div className="scan-context">"{p.contextLine}"</div>}
              <div className="scan-reply">{result.reply}</div>
              {p.swap && <div className="scan-swap"><b>💡 SWAP SUGGESTION</b>{p.swap}</div>}

              {/* Shareable card — a premium, screenshot-ready social post, not a nutrition report. */}
              <div className="share-card">
                <div className="share-card-head">MUSCLE MINDSET AI</div>
                <div className="share-card-verdict" style={{ color: cv.hex }}>{cv.icon} {cv.label}</div>
                <div className="share-card-iq"><span>FOOD IQ</span> <b style={{ color: cv.hex }}>{foodIQFor(p)}/100</b></div>
                <div className="share-card-name">{p.name}</div>
                <div className="share-card-macros">
                  <span><b style={{ color: "#F6F1E7" }}>{p.cal}</b> cal</span>
                  <span><b style={{ color: "#E8B44A" }}>{p.protein}g</b> protein</span>
                  <span><b style={{ color: "#F6F1E7" }}>{p.carbs}g</b> carbs</span>
                  <span><b style={{ color: "#F6F1E7" }}>{p.fat}g</b> fat</span>
                </div>
                {(p.realityCheck || p.contextLine) && (
                  <div className="share-card-reality">{p.realityCheck || p.contextLine}</div>
                )}
                {p.lesson && <div className="share-card-lesson">{p.lesson}</div>}
                <div className="share-card-foot">
                  Scanned with 🧠 Muscle Mindset AI<br />
                  <b style={{ color: "#E8B44A" }}>Scan yours →  musclemindset.app</b><br />
                  @musclemindsetai · YouTube: Muscle Mindset AI
                </div>
              </div>

              <div className="share-size-label">Choose a size</div>
              <div className="share-size-row">
                {Object.entries(SHARE_SIZES).map(([key, s]) => (
                  <button key={key} className={"share-size-btn" + (shareSize === key ? " active" : "")}
                    onClick={() => setShareSize(key)}>{s.label}</button>
                ))}
              </div>
              <button className="share-btn" onClick={() => handleShare(p, cv, shareSize)} disabled={sharing}>
                {sharing ? "⏳ Creating card…" : "✨ Create Share Card"}
              </button>
              <div className="scan-actions">
                <button className="scan-log-btn" onClick={() => onLog(p)}>✅ Log it — add to today</button>
                <button className="scan-dismiss-btn" onClick={onClose}>Skip it</button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// Structured weight log — optional body-fat % rides on the same entry. No chart, no
// history view in v1; just enough to feed the lean-mass trend check and give a quick
// "is this moving in a sane direction" glance.
function WeightLog({ logs, onLog, toggleExplain }) {
  const [val, setVal] = useState("");
  const [bfVal, setBfVal] = useState("");
  const last = logs.length ? logs[logs.length - 1] : null;
  const prior = logs.length > 1 ? logs[logs.length - 2] : null;
  const wTrend = last && prior ? last.lbs - prior.lbs : null;
  const bfTrend = last && prior && last.bf != null && prior.bf != null ? last.bf - prior.bf : null;
  const submit = () => {
    const n = parseFloat(val);
    if (n > 0) {
      const bf = bfVal ? parseFloat(bfVal) : null;
      onLog(n, bf);
      setVal(""); setBfVal("");
    }
  };
  return (
    <div style={{ marginTop: 7 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: "var(--faint)", fontFamily: "Space Grotesk", letterSpacing: ".08em", textTransform: "uppercase" }}>Weight + Body Fat</span>
        <button className="ibadge" style={{ position: "static" }} onClick={toggleExplain("weight")}>ⓘ</button>
      </div>
      <div className="wtrow">
        <input inputMode="decimal" placeholder={last ? `last: ${last.lbs} lb` : "weight (lb)"} value={val} onChange={(e) => setVal(e.target.value.replace(/[^\d.]/g, ""))} />
        <input className="bfinput" inputMode="decimal" placeholder={last && last.bf != null ? `${last.bf}% BF` : "BF% opt."} value={bfVal} onChange={(e) => setBfVal(e.target.value.replace(/[^\d.]/g, ""))} />
        <button onClick={submit}>Log</button>
      </div>
      {wTrend !== null && (
        <span className="wttrend">
          {wTrend < 0 ? `↓${Math.abs(wTrend).toFixed(1)}lb` : wTrend > 0 ? `↑${wTrend.toFixed(1)}lb` : "—lb"}
          {bfTrend !== null ? ` · ${bfTrend < 0 ? `↓${Math.abs(bfTrend).toFixed(1)}` : bfTrend > 0 ? `↑${bfTrend.toFixed(1)}` : "—"}% BF` : ""} since last
        </span>
      )}
    </div>
  );
}

function ClearTodayLink({ onClear }) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <span style={{ fontSize: 12, color: "var(--stop)" }}>
        Wipe today's numbers?{" "}
        <button className="x" style={{ color: "var(--stop)", fontWeight: 700 }} onClick={() => { onClear(); setConfirming(false); }}>Yes, clear it</button>{" "}
        <button className="x" onClick={() => setConfirming(false)}>Cancel</button>
      </span>
    );
  }
  return <button className="x" onClick={() => setConfirming(true)}>Clear today</button>;
}

function VerdictBadge({ verdict }) {
  const cfg = {
    good: { icon: "✅", label: "Works For You", color: "var(--go)", bg: "rgba(139,224,90,.12)" },
    caution: { icon: "⚠️", label: "Use Wisely", color: "var(--hold)", bg: "rgba(242,179,61,.12)" },
    bad: { icon: "❌", label: "Works Against You", color: "var(--stop)", bg: "rgba(240,96,77,.12)" },
  }[verdict];
  if (!cfg) return null;
  return (
    <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${cfg.color}`, background: cfg.bg, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 15 }}>{cfg.icon}</span>
      <span style={{ color: cfg.color, fontWeight: 700, fontSize: 13, fontFamily: "Space Grotesk", letterSpacing: ".01em" }}>{cfg.label}</span>
    </div>
  );
}

function ScoreCard({ d, fix }) {
  const Row = ({ lab, v, color }) => <div className="sl2"><span>{lab}</span><span style={color ? { color, fontWeight: 700 } : {}}>{v}</span></div>;
  return (
    <div className="msg c"><div className="bub" style={{ width: "100%", maxWidth: "100%" }}>
      <div className="sg" style={{ fontWeight: 600, letterSpacing: ".1em", marginBottom: 8 }}>{d.title || `DAY ${d.day} CLOSED`}</div>
      <div className="scorecard">
        <Row lab="Feed" v={d.feedHit ? "✅ Floor hit" : "⚠️ Under floor"} color={d.feedHit ? "var(--go)" : "var(--stop)"} />
        <Row lab="Protect" v={d.inProtectionMode ? "🛡️ Protection Mode" : d.compositionConcern ? (d.hasRecentBfTrend ? "⚠️ Losing muscle" : "⚠️ Loss too fast") : d.chronicHydrationRisk ? "⚠️ Hydration behind" : "✅ On track"} color={d.inProtectionMode || d.compositionConcern || d.chronicHydrationRisk ? "var(--stop)" : "var(--go)"} />
        <Row lab="Water" v={d.waterHit ? `💧 ${d.water}/${d.waterGoal}oz — hit it` : `💧 ${d.water}/${d.waterGoal}oz — light`} color={d.waterHit ? "var(--go)" : "var(--hold)"} />
        <Row lab="Vitamin" v={d.vitaminHit ? "✅ Taken" : "⬜ Skipped"} color={d.vitaminHit ? "var(--go)" : "var(--faint)"} />
        {d.inProtectionMode && <Row lab="Muscle Protection Mode" v={`🛡️ ${d.protectionDaysLeft} clean day${d.protectionDaysLeft === 1 ? "" : "s"} left`} color="var(--stop)" />}
      </div>
      <div style={{ marginTop: 10, color: (d.compositionConcern || d.inProtectionMode) ? "var(--stop)" : "var(--hold)", fontWeight: 600, fontSize: 14 }}>🛡️ {fix}</div>
    </div></div>
  );
}
