// Member food ratings: "how did this food sit with you?" Pure rules, no React, no I/O.
//
// Design (decided with the owner): only people who LOGGED a food are asked, about 1 hour after eating, so every rating comes
// from real experience of that meal. Two separate questions, matching lib/food-ease.js:
//   fullness  could_eat_more | just_right | too_filling      ("could I have eaten more of it?")
//   comfort   easy | okay | queasy                            ("did it go down easy?")
// Ratings are shown to others only in aggregate and only once enough DIFFERENT people have rated the food (see MIN_RATERS).
//
// PLACEHOLDERS (product choices not yet tuned with real data): PROMPT_OPENS_MIN, PROMPT_CLOSES_MIN, MAX_OPEN_PROMPTS, MIN_RATERS,
// PRIOR_STRENGTH. They are named constants so they are easy to change in one place.

export const FULLNESS = ["could_eat_more", "just_right", "too_filling"];
export const COMFORT = ["easy", "okay", "queasy"];

export const PROMPT_OPENS_MIN = 60;        // ask no sooner than 1 hour after the food was logged
export const PROMPT_CLOSES_MIN = 12 * 60;  // stop asking after 12 hours (memory fades; avoids stale nagging)
export const MAX_OPEN_PROMPTS = 2;         // never show more than this many at once
// KEEP IN SYNC with the minimum in supabase-food-ratings.sql (food_rating_summary). The database enforces it; this copy only
// lets the screen explain "not enough ratings yet".
export const MIN_RATERS = 5;
export const PRIOR_STRENGTH = 10;          // how many ratings it takes for members to outweigh the hand-tagged starting guess

// A stable key for "the same food" from a free-text name: lowercase, letters and digits only, single spaces.
// Limitation: different phrasings of one food ("2 eggs" / "two scrambled eggs") get different keys, so ratings fragment until
// logged items are matched to catalog foods (the table has a nullable catalog_id for that).
export function foodKey(name) {
  return String(name == null ? "" : name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
}

const toMs = (iso) => { const t = typeof iso === "string" ? Date.parse(iso) : NaN; return Number.isFinite(t) ? t : null; };

// Same instant, same text: the app writes "2026-11-01T16:00:00.000Z" but the database hands the same moment back as
// "2026-11-01T16:00:00+00:00". Both must produce the same key, or an already-rated food would be asked about again.
const isoOf = (at) => { const ms = toMs(at); return ms == null ? String(at) : new Date(ms).toISOString(); };

// One rating is identified by the food and the moment it was logged (a person can eat the same food twice in a day).
export const ratingKey = (item) => `${foodKey(item && item.name)}|${isoOf(item && item.at)}`;

// The same key, built from a saved row (columns food_key and eaten_at) so saved ratings can be matched to logged items.
export const ratedKeyFromRow = (row) => `${row && row.food_key}|${isoOf(row && row.eaten_at)}`;

// Which logged foods should we ask about right now?
//   items      today's logged items; only those with an `at` (ISO time string) can be asked about
//   ratedKeys  Set (or array) of ratingKey() values already rated or skipped
//   now        Date or ms
// Returns up to MAX_OPEN_PROMPTS items, most recent first (freshest memory). Items with no usable time, from the future, too
// recent, too old, already rated, or with no name are skipped.
export function ratingPrompts(items, ratedKeys, now = Date.now()) {
  if (!Array.isArray(items)) return [];
  const done = ratedKeys instanceof Set ? ratedKeys : new Set(Array.isArray(ratedKeys) ? ratedKeys : []);
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(nowMs)) return [];
  const out = [];
  for (const item of items) {
    if (!item || !foodKey(item.name)) continue;
    const at = toMs(item.at);
    if (at == null) continue;
    const minutes = (nowMs - at) / 60000;
    if (minutes < PROMPT_OPENS_MIN || minutes > PROMPT_CLOSES_MIN) continue;
    const key = ratingKey(item);
    if (done.has(key)) continue;
    out.push({ item, key, foodKey: foodKey(item.name), minutesAgo: Math.floor(minutes), at });
  }
  return out.sort((a, b) => a.minutesAgo - b.minutesAgo).slice(0, MAX_OPEN_PROMPTS);
}

// Check a rating before it is saved. Returns { ok: true, value } with only the known fields, or { ok: false, error }.
// `daysSinceDose` is optional context (0-30). Nothing about the medication itself is collected.
export function validateRating(r) {
  if (!r || typeof r !== "object") return { ok: false, error: "no rating" };
  if (!FULLNESS.includes(r.fullness)) return { ok: false, error: "fullness must be one of " + FULLNESS.join(", ") };
  if (!COMFORT.includes(r.comfort)) return { ok: false, error: "comfort must be one of " + COMFORT.join(", ") };
  if (!foodKey(r.name)) return { ok: false, error: "no food name" };
  if (toMs(r.at) == null) return { ok: false, error: "no time the food was eaten" };
  const value = { name: String(r.name).trim().slice(0, 120), foodKey: foodKey(r.name), at: new Date(toMs(r.at)).toISOString(), fullness: r.fullness, comfort: r.comfort };
  if (r.daysSinceDose != null && r.daysSinceDose !== "") {
    const d = Number(r.daysSinceDose);
    if (!Number.isInteger(d) || d < 0 || d > 30) return { ok: false, error: "days since dose must be a whole number from 0 to 30" };
    value.daysSinceDose = d;
  }
  return { ok: true, value };
}

// Turn the aggregate the database returns for one food into something a screen can show.
//   row  { raters, ratings, could_eat_more, just_right, too_filling, easy, okay, queasy } or null
// When fewer than MIN_RATERS different people have rated it, nothing is shown (the database already withholds the counts).
export function interpretSummary(row) {
  const raters = Number(row && row.raters) || 0;
  if (!row || raters < MIN_RATERS) return { shown: false, raters, needed: Math.max(0, MIN_RATERS - raters) };
  const n = Number(row.ratings) || 0;
  if (n <= 0) return { shown: false, raters, needed: 0 };
  const share = (v) => Math.round((Number(v) / n) * 100);
  const fullness = { could_eat_more: share(row.could_eat_more), just_right: share(row.just_right), too_filling: share(row.too_filling) };
  const comfort = { easy: share(row.easy), okay: share(row.okay), queasy: share(row.queasy) };
  // Same 0-2 scale the hand-tagged rules use: could_eat_more = light (0), just_right = medium (1), too_filling = filling (2).
  const fillingPoints = (Number(row.could_eat_more) * 0 + Number(row.just_right) * 1 + Number(row.too_filling) * 2) / n;
  const comfortPoints = (Number(row.easy) * 0 + Number(row.okay) * 1 + Number(row.queasy) * 2) / n;
  return { shown: true, raters, ratings: n, fullness, comfort, fillingPoints, comfortPoints };
}

// Blend the hand-tagged starting guess with what members actually reported. With no ratings the guess stands; as ratings
// accumulate they take over: weight = n / (n + PRIOR_STRENGTH). Returns the points to use for ranking.
//   seed     easeProfile(id) from lib/food-ease.js ({ fillingPoints, comfortPoints })
//   summary  interpretSummary(row)
export function blendEase(seed, summary) {
  const base = { fillingPoints: seed.fillingPoints, comfortPoints: seed.comfortPoints, source: "seed", ratings: 0 };
  if (!summary || !summary.shown) return base;
  const w = summary.ratings / (summary.ratings + PRIOR_STRENGTH);
  return {
    fillingPoints: (1 - w) * seed.fillingPoints + w * summary.fillingPoints,
    comfortPoints: (1 - w) * seed.comfortPoints + w * summary.comfortPoints,
    source: "blend",
    ratings: summary.ratings,
  };
}
