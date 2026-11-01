// Offline tests for the food core: catalog, ranker, USDA matcher, and macro guardrail.
// No network and no API keys needed. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG, STATUSES, SUGGESTABLE_STATUSES, COOK, COST, SLOTS, seedFoods, needsCheck, proteinPerCal, isSuggestable, pickFromLibraryRow } from "../lib/food-catalog.js";
import { rankCandidates } from "../lib/food-rank.js";
import { pickBestFood } from "../lib/usda.js";
import { reconcileMacros } from "../lib/nutrition-reconcile.js";
import { EGG_PROTEIN_G, EGG_CAL } from "../lib/home-protein.js";

// ---- catalog integrity ----
test("catalog: every entry has a valid status, a source, tags and a unique id and name", () => {
  const ids = new Set(), names = new Set();
  for (const e of CATALOG) {
    assert.ok(STATUSES.includes(e.status), `${e.id}: bad status ${e.status}`);
    assert.ok(e.src, `${e.id}: no source`);
    assert.ok(COOK.includes(e.tags.cook) && COST.includes(e.tags.cost) && Array.isArray(e.tags.contains), `${e.id}: bad tags`);
    assert.ok(!ids.has(e.id) && !names.has(e.n.toLowerCase()), `${e.id}: duplicate id or name`);
    ids.add(e.id); names.add(e.n.toLowerCase());
  }
});

test("catalog: no entry claims 'verified' (KTM has not re-checked any label itself)", () => {
  assert.deepEqual(CATALOG.filter((e) => e.status === "verified").map((e) => e.id), []);
  assert.deepEqual(CATALOG.filter((e) => /verified/i.test(e.src) && !/not verified|not re-checked/i.test(e.src)).map((e) => e.id), []);
});

test("catalog: no impossible numbers (protein alone can't exceed the calories)", () => {
  for (const e of CATALOG) {
    assert.ok(e.p > 0 && e.c > 0, `${e.id}: protein and calories must be positive`);
    assert.ok(e.p * 4 <= e.c * 1.05, `${e.id}: ${e.p}g protein can't fit in ${e.c} cal`);
  }
});

test("catalog: egg entries equal count x the per-egg value", () => {
  for (const e of CATALOG.filter((x) => x.family === "egg")) {
    assert.equal(e.p, Math.round(e.count * EGG_PROTEIN_G), `${e.id} protein`);
    assert.equal(e.c, e.count * EGG_CAL, `${e.id} calories`);
  }
});

test("catalog: entries in the same family agree on protein per gram (within 25%)", () => {
  const fam = {};
  for (const e of CATALOG.filter((x) => x.family && x.grams)) (fam[e.family] ||= []).push(e.p / e.grams);
  for (const [name, dens] of Object.entries(fam)) {
    const lo = Math.min(...dens), hi = Math.max(...dens);
    assert.ok(hi <= lo * 1.25, `${name}: protein per gram disagrees (${lo.toFixed(3)} vs ${hi.toFixed(3)})`);
  }
});

test("catalog: suggestable statuses never include the excluded ones; nothing is flagged for a check", () => {
  assert.ok(!SUGGESTABLE_STATUSES.includes("unconfirmed") && !SUGGESTABLE_STATUSES.includes("discontinued"));
  assert.deepEqual(needsCheck(), []);
});

test("seed: 16 foods, each with slots and contexts from the allowed values", () => {
  const seed = seedFoods();
  assert.equal(seed.length, 16);
  for (const f of seed) {
    assert.ok(f.n && f.g > 0 && f.c > 0);
    assert.ok(f.slots.length && f.slots.every((s) => SLOTS.includes(s)), `${f.n}: bad slots`);
    assert.ok(f.contexts.length && f.contexts.every((c) => c === "home" || c === "store"), `${f.n}: bad contexts`);
  }
});

// ---- protein density helpers ----
test("proteinPerCal: grams of protein per 100 calories", () => {
  assert.equal(proteinPerCal({ g: 30, c: 150 }), 20);
  assert.equal(proteinPerCal({ g: 10, c: 0 }), 0);
});

test("isSuggestable: needs real protein AND >= 10 g per 100 cal", () => {
  assert.equal(isSuggestable({ g: 30, c: 150 }), true);   // a real shake
  assert.equal(isSuggestable({ g: 2, c: 40 }), false);    // too little protein
  assert.equal(isSuggestable({ g: 12, c: 400 }), false);  // protein-marketed junk
  assert.equal(isSuggestable(null), false);
});

test("pickFromLibraryRow: scales per-100 g macros to the label serving, or returns null", () => {
  const p = pickFromLibraryRow({ name: "Skyr", serving_label: "1 cup", serving_grams: 200, protein: 11, cal: 60 });
  assert.deepEqual(p, { n: "1 cup Skyr", g: 22, c: 120 });
  assert.equal(pickFromLibraryRow({ name: "X", protein: 10, cal: 100 }), null); // no serving weight
  assert.equal(pickFromLibraryRow(null), null);
});

// ---- ranker ----
test("rankCandidates: ranked by protein per calorie, highest first", () => {
  const pool = rankCandidates({ place: "home", daypart: "lunch" });
  assert.ok(pool && pool.length > 1);
  for (let i = 1; i < pool.length; i++) assert.ok(proteinPerCal(pool[i - 1]) >= proteinPerCal(pool[i]), `order broke at ${pool[i].n}`);
});

test("rankCandidates: respects place and day part", () => {
  const store = rankCandidates({ place: "store", daypart: "breakfast" }).map((p) => p.n);
  assert.ok(store.includes("a protein shake"));
  assert.ok(!store.includes("6 oz chicken")); // home-only
});

test("rankCandidates: merges extra picks and drops duplicate names", () => {
  const pool = rankCandidates({ place: "home", daypart: "lunch", extra: [{ n: "A Can Of Tuna", g: 26, c: 128 }, { n: "Skyr cup", g: 20, c: 100 }] });
  assert.equal(pool.filter((p) => p.n.toLowerCase() === "a can of tuna").length, 1);
  assert.ok(pool.some((p) => p.n === "Skyr cup"));
});

test("rankCandidates: returns null when nothing fits", () => {
  assert.equal(rankCandidates({ place: "nowhere", daypart: "lunch" }), null);
});

// ---- USDA matcher (mock search hits) ----
const mock = (description, dataType) => ({ description, dataType });

test("pickBestFood: a plain query lands on the raw whole food, not chips or dehydrated", () => {
  const hits = [mock("Banana chips", "Branded"), mock("Bananas, dehydrated", "SR Legacy"), mock("Bananas, raw", "Foundation")];
  assert.equal(pickBestFood(hits, "banana").description, "Bananas, raw");
});

test("pickBestFood: plain chicken breast never matches breaded or nuggets", () => {
  const hits = [mock("Chicken, breast, breaded, fried", "Survey (FNDDS)"), mock("Chicken nuggets", "Branded"), mock("Chicken, broilers or fryers, breast, meat only, roasted", "SR Legacy")];
  assert.ok(pickBestFood(hits, "chicken breast roasted").description.includes("roasted"));
});

// ---- guardrail ----
test("reconcileMacros: trusts a USDA row that agrees with the estimate", () => {
  const r = reconcileMacros({ cal: 100, carbs: 20 }, { cal: 105, protein: 5, carbs: 21, fat: 1 });
  assert.equal(r.source, "usda");
  assert.equal(r.reason, "ok");
});

test("reconcileMacros: calorie divergence keeps the estimate (wrong-food match)", () => {
  const r = reconcileMacros({ cal: 100, protein: 1, carbs: 25, fat: 0 }, { cal: 350, protein: 2, carbs: 85, fat: 1 });
  assert.equal(r.source, "estimate");
  assert.equal(r.reason, "cal_divergence");
});

test("reconcileMacros: a plain meat that USDA returns loaded with carbs keeps the estimate", () => {
  const r = reconcileMacros({ cal: 280, protein: 52, carbs: 0, fat: 6 }, { cal: 300, protein: 30, carbs: 20, fat: 12 });
  assert.equal(r.source, "estimate");
  assert.equal(r.reason, "carb_identity");
});

test("reconcileMacros: no row or an error keeps the estimate", () => {
  assert.equal(reconcileMacros({ cal: 200, protein: 20 }, null).reason, "no_row");
  assert.equal(reconcileMacros({ cal: 200, protein: 20 }, { error: "not_found" }).reason, "not_found");
});

test("reconcileMacros: never ships calories that contradict the macros", () => {
  const r = reconcileMacros({ cal: 0, protein: 0, carbs: 36, fat: 0 }, null);
  assert.equal(r.picked.cal, 144); // 36 g carbs x 4
});

test("reconcileMacros: a genuinely calorie-free item stays at 0", () => {
  assert.equal(reconcileMacros({ cal: 0, protein: 0, carbs: 0, fat: 0 }, null).picked.cal, 0);
});
