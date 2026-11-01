// Offline tests for the member food-rating rules. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FULLNESS, COMFORT, MIN_RATERS, PROMPT_OPENS_MIN, PROMPT_CLOSES_MIN, MAX_OPEN_PROMPTS, PRIOR_STRENGTH, foodKey, ratingKey, ratedKeyFromRow, ratingPrompts, validateRating, interpretSummary, blendEase } from "../lib/food-ratings.js";
import { easeProfile, lowAppetiteScore } from "../lib/food-ease.js";

const NOW = Date.parse("2026-11-01T18:00:00Z");
const minsAgo = (m) => new Date(NOW - m * 60000).toISOString();

// ---- food key ----
test("foodKey: lowercase, letters and digits only, single spaces", () => {
  assert.equal(foodKey("  Greek   Yogurt, plain! "), "greek yogurt plain");
  assert.equal(foodKey("2 EGGS"), "2 eggs");
  assert.equal(foodKey(null), "");
  assert.equal(foodKey(undefined), "");
});

test("foodKey: capped at 80 characters", () => {
  assert.equal(foodKey("a".repeat(200)).length, 80);
});

// ---- who gets asked, and when ----
test("ratingPrompts: asks only after 1 hour, and stops after 12 hours", () => {
  // Each time is tested on its own, so the cap on how many prompts show at once can't hide a wrong boundary.
  const asked = (m) => ratingPrompts([{ name: "x", at: minsAgo(m) }], new Set(), NOW).length === 1;
  assert.equal(asked(10), false, "just eaten");
  assert.equal(asked(PROMPT_OPENS_MIN - 1), false, "1 minute before the hour");
  assert.equal(asked(PROMPT_OPENS_MIN), true, "exactly an hour");
  assert.equal(asked(120), true, "two hours");
  assert.equal(asked(PROMPT_CLOSES_MIN), true, "exactly twelve hours");
  assert.equal(asked(PROMPT_CLOSES_MIN + 1), false, "just past twelve hours");
});

test("ratingPrompts: most recent first, and never more than the cap", () => {
  const items = [{ name: "a", at: minsAgo(300) }, { name: "b", at: minsAgo(90) }, { name: "c", at: minsAgo(200) }, { name: "d", at: minsAgo(65) }];
  const out = ratingPrompts(items, new Set(), NOW);
  assert.equal(out.length, MAX_OPEN_PROMPTS);
  assert.deepEqual(out.map((p) => p.item.name), ["d", "b"]);
});

test("ratingPrompts: skips foods already rated, matched by food AND time", () => {
  const a = { name: "Greek Yogurt", at: minsAgo(90) };
  const b = { name: "greek yogurt", at: minsAgo(400) }; // same food, eaten at another time
  const out = ratingPrompts([a, b], new Set([ratingKey(a)]), NOW);
  assert.deepEqual(out.map((p) => p.item.at), [b.at]);
  assert.equal(ratingPrompts([a], [ratingKey(a)], NOW).length, 0); // an array works too
});

test("ratingPrompts: works with the exact timestamp format the app now stamps on logged foods", () => {
  const stamped = new Date(NOW - 61 * 60000).toISOString(); // same call keep-the-muscle.jsx makes: new Date().toISOString()
  const out = ratingPrompts([{ name: "Greek yogurt", cal: 100, protein: 17, carbs: 6, fat: 0, verdict: "good", at: stamped }], new Set(), NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].minutesAgo, 61);
  assert.equal(validateRating({ name: "Greek yogurt", at: stamped, fullness: "just_right", comfort: "easy" }).value.at, stamped);
});

test("a saved row matches its logged item even though the database writes the time differently", () => {
  const item = { name: "Greek Yogurt!", at: "2026-11-01T16:00:00.000Z" };
  const row = { food_key: "greek yogurt", eaten_at: "2026-11-01T16:00:00+00:00" };            // how Postgres returns it
  const rowOffset = { food_key: "greek yogurt", eaten_at: "2026-11-01T09:00:00-07:00" };      // the same instant in another zone
  assert.equal(ratedKeyFromRow(row), ratingKey(item));
  assert.equal(ratedKeyFromRow(rowOffset), ratingKey(item));
  assert.notEqual(ratedKeyFromRow({ ...row, eaten_at: "2026-11-01T16:00:01+00:00" }), ratingKey(item)); // a different moment stays different
  assert.equal(ratingPrompts([{ ...item, at: new Date(NOW - 90 * 60000).toISOString() }], [ratedKeyFromRow({ food_key: "greek yogurt", eaten_at: new Date(NOW - 90 * 60000).toISOString().replace("Z", "+00:00") })], NOW).length, 0);
});

test("ratingPrompts: items logged before timestamps existed are never asked about", () => {
  const out = ratingPrompts([{ name: "old log", cal: 100 }, { name: "bad time", at: "yesterday-ish" }, { name: "empty", at: "" }], new Set(), NOW);
  assert.deepEqual(out, []);
});

test("ratingPrompts: ignores nameless items, future times and bad input", () => {
  assert.deepEqual(ratingPrompts([{ name: "", at: minsAgo(90) }, { at: minsAgo(90) }, null], new Set(), NOW), []);
  assert.deepEqual(ratingPrompts([{ name: "from the future", at: minsAgo(-30) }], new Set(), NOW), []);
  assert.deepEqual(ratingPrompts(null, new Set(), NOW), []);
  assert.deepEqual(ratingPrompts([{ name: "x", at: minsAgo(90) }], new Set(), "not a time"), []);
});

test("ratingPrompts: accepts a Date for now and reports how long ago", () => {
  const out = ratingPrompts([{ name: "x", at: minsAgo(75) }], new Set(), new Date(NOW));
  assert.equal(out.length, 1);
  assert.equal(out[0].minutesAgo, 75);
});

// ---- validating a rating ----
const good = { name: "Greek yogurt", at: minsAgo(90), fullness: "just_right", comfort: "easy" };

test("validateRating: accepts a complete rating and normalizes it", () => {
  const r = validateRating({ ...good, name: "  Greek yogurt  " });
  assert.equal(r.ok, true);
  assert.equal(r.value.foodKey, "greek yogurt");
  assert.equal(r.value.name, "Greek yogurt");
  assert.equal(r.value.at, good.at);
  assert.equal("daysSinceDose" in r.value, false);
});

test("validateRating: only the known answers are allowed", () => {
  for (const f of FULLNESS) for (const c of COMFORT) assert.equal(validateRating({ ...good, fullness: f, comfort: c }).ok, true);
  assert.equal(validateRating({ ...good, fullness: "full" }).ok, false);
  assert.equal(validateRating({ ...good, comfort: "bad" }).ok, false);
  assert.equal(validateRating({ ...good, fullness: undefined }).ok, false);
});

test("validateRating: needs a food name and a valid time", () => {
  assert.equal(validateRating({ ...good, name: "  " }).ok, false);
  assert.equal(validateRating({ ...good, at: "nope" }).ok, false);
  assert.equal(validateRating(null).ok, false);
  assert.equal(validateRating("rating").ok, false);
});

test("validateRating: days since dose is optional, whole, and 0 to 30", () => {
  assert.equal(validateRating({ ...good, daysSinceDose: 0 }).value.daysSinceDose, 0);
  assert.equal(validateRating({ ...good, daysSinceDose: "3" }).value.daysSinceDose, 3);
  assert.equal(validateRating({ ...good, daysSinceDose: "" }).ok, true);
  assert.equal(validateRating({ ...good, daysSinceDose: null }).ok, true);
  for (const bad of [-1, 31, 2.5, "abc"]) assert.equal(validateRating({ ...good, daysSinceDose: bad }).ok, false, String(bad));
});

test("validateRating: drops unknown fields, so nothing extra (like a medication name) is ever saved", () => {
  const r = validateRating({ ...good, medication: "secret", dose: "2.4mg", userId: "someone-else" });
  assert.deepEqual(Object.keys(r.value).sort(), ["at", "comfort", "foodKey", "fullness", "name"]);
});

// ---- showing community results ----
const row = (o) => ({ raters: 8, ratings: 10, could_eat_more: 6, just_right: 3, too_filling: 1, easy: 7, okay: 2, queasy: 1, ...o });

test("interpretSummary: hidden until enough different people have rated", () => {
  assert.deepEqual(interpretSummary(null), { shown: false, raters: 0, needed: MIN_RATERS });
  assert.deepEqual(interpretSummary(row({ raters: 2 })), { shown: false, raters: 2, needed: MIN_RATERS - 2 });
  assert.equal(interpretSummary(row({ raters: MIN_RATERS - 1 })).shown, false);
  assert.equal(interpretSummary(row({ raters: MIN_RATERS })).shown, true);
});

test("interpretSummary: shares, and points on the same 0-2 scale as the hand-tagged rules", () => {
  const s = interpretSummary(row());
  assert.deepEqual(s.fullness, { could_eat_more: 60, just_right: 30, too_filling: 10 });
  assert.deepEqual(s.comfort, { easy: 70, okay: 20, queasy: 10 });
  assert.equal(s.fillingPoints, 0.5);   // (6*0 + 3*1 + 1*2) / 10
  assert.equal(s.comfortPoints, 0.4);   // (7*0 + 2*1 + 1*2) / 10
});

test("interpretSummary: a zero-ratings row is not shown", () => {
  assert.equal(interpretSummary(row({ ratings: 0 })).shown, false);
});

// ---- blending the starting guess with what members said ----
test("blendEase: with no visible ratings the hand-tagged guess stands, untouched", () => {
  const seed = easeProfile("chicken6");
  const out = blendEase(seed, interpretSummary(null));
  assert.equal(out.source, "seed");
  assert.equal(out.fillingPoints, seed.fillingPoints);
  assert.equal(out.comfortPoints, seed.comfortPoints);
  assert.equal(blendEase(seed, undefined).source, "seed");
});

test("blendEase: ratings pull the points toward what members reported, more as ratings grow", () => {
  const seed = easeProfile("chicken6"); // hand-tagged: filling (2), gentle (0.5)
  const sayLight = (n) => interpretSummary({ raters: n, ratings: n, could_eat_more: n, just_right: 0, too_filling: 0, easy: n, okay: 0, queasy: 0 });
  const few = blendEase(seed, sayLight(MIN_RATERS));
  const many = blendEase(seed, sayLight(500));
  assert.equal(few.source, "blend");
  assert.ok(few.fillingPoints < seed.fillingPoints && few.fillingPoints > 0, "a few ratings move it part of the way");
  assert.ok(many.fillingPoints < few.fillingPoints, "many ratings move it further");
  assert.ok(many.fillingPoints < 0.1, "with hundreds of ratings the members' answer dominates");
  assert.equal(few.ratings, MIN_RATERS);
});

test("blendEase: at exactly the prior strength, the guess and the members count equally", () => {
  const seed = { fillingPoints: 2, comfortPoints: 2 };
  const out = blendEase(seed, { shown: true, ratings: PRIOR_STRENGTH, fillingPoints: 0, comfortPoints: 0 });
  assert.equal(out.fillingPoints, 1);
  assert.equal(out.comfortPoints, 1);
});

test("the ranking can use blended points: members saying a food is queasy pushes it down", () => {
  const pick = { id: "chicken6", n: "chicken", g: 52, c: 280 };
  const seedScore = lowAppetiteScore(pick);
  const queasy = interpretSummary({ raters: 50, ratings: 50, could_eat_more: 0, just_right: 0, too_filling: 50, easy: 0, okay: 0, queasy: 50 });
  assert.ok(lowAppetiteScore(pick, blendEase(easeProfile("chicken6"), queasy)) < seedScore);
});

// ---- the SQL and the JS must agree on the privacy minimum ----
test("the minimum raters is the same number in the SQL file and in the JS", () => {
  const sql = readFileSync(new URL("../supabase-food-ratings.sql", import.meta.url), "utf8");
  const m = sql.match(/having count\(distinct user_id\) >= (\d+)/);
  assert.ok(m, "the summary function must withhold small groups");
  assert.equal(Number(m[1]), MIN_RATERS);
});

test("the SQL file: rows are protected, anon gets nothing, and the answers are constrained", () => {
  const sql = readFileSync(new URL("../supabase-food-ratings.sql", import.meta.url), "utf8");
  assert.match(sql, /alter table food_ratings enable row level security/);
  assert.match(sql, /auth\.uid\(\) = user_id/);
  assert.match(sql, /revoke all on food_ratings from anon/);
  assert.doesNotMatch(sql, /grant [^;]*to (anon|public)/i);
  for (const v of [...FULLNESS, ...COMFORT]) assert.ok(sql.includes(`'${v}'`), `${v} must be an allowed value in the table`);
});
