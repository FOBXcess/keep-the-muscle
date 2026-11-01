// Offline tests for the GLP-1 ease rules (fullness + comfort). Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { EASE_TAGS, EASE_SOURCE, FORMATS, RICHNESS, SERVE, easeProfile, lowAppetiteScore, rankForLowAppetite } from "../lib/food-ease.js";
import { CATALOG, seedFoods } from "../lib/food-catalog.js";
import { rankCandidates } from "../lib/food-rank.js";

test("every catalog food has ease tags with allowed values, and no tag points at a missing food", () => {
  const ids = new Set(CATALOG.map((e) => e.id));
  for (const id of ids) {
    const t = EASE_TAGS[id];
    assert.ok(t, `${id}: no ease tags`);
    assert.ok(FORMATS.includes(t.format) && RICHNESS.includes(t.richness) && SERVE.includes(t.serve), `${id}: bad tag value`);
  }
  for (const id of Object.keys(EASE_TAGS)) assert.ok(ids.has(id), `${id}: tags for a food that is not in the catalog`);
});

test("the rules are honestly labelled as untested", () => {
  assert.match(EASE_SOURCE, /not tested/i);
});

test("a cold lean drink is light and gentle", () => {
  const e = easeProfile("shake");
  assert.equal(e.filling, "light");
  assert.equal(e.comfort, "gentle");
  assert.equal(e.known, true);
});

test("a rich solid is filling and heavy", () => {
  const e = easeProfile("sausage2");
  assert.equal(e.filling, "filling");
  assert.equal(e.comfort, "heavy");
});

test("fullness and comfort are scored independently", () => {
  const lean = easeProfile("chicken6");   // solid + lean + warm
  assert.equal(lean.filling, "filling");  // filling...
  assert.equal(lean.comfort, "gentle");   // ...but gentle on the stomach
  const filled = Object.keys(EASE_TAGS).map((id) => easeProfile(id));
  assert.ok(new Set(filled.map((e) => `${e.filling}/${e.comfort}`)).size >= 4, "the two scores should split foods into several different combinations");
});

test("every profile explains itself", () => {
  for (const id of Object.keys(EASE_TAGS)) assert.ok(easeProfile(id).reasons.length >= 2, `${id}: needs reasons`);
});

test("an unknown food is neutral and flagged as not rated", () => {
  for (const id of [undefined, null, "member-added-food"]) {
    const e = easeProfile(id);
    assert.equal(e.known, false);
    assert.equal(e.filling, "medium");
    assert.equal(e.comfort, "neutral");
  }
});

test("lowAppetiteScore: a shake beats the same protein density in a heavy solid", () => {
  const shake = { id: "shake", n: "shake", g: 30, c: 150 };
  const sausage = { id: "sausage2", n: "sausage", g: 30, c: 150 };
  assert.ok(lowAppetiteScore(shake) > lowAppetiteScore(sausage));
});

test("lowAppetiteScore: handles missing or zero-calorie input without throwing", () => {
  assert.equal(lowAppetiteScore(null), 0);
  assert.equal(lowAppetiteScore({ id: "shake", g: 10, c: 0 }), 0);
});

test("rankForLowAppetite: does not change the input and is stable on ties", () => {
  const pool = [{ n: "a", g: 20, c: 100 }, { n: "b", g: 20, c: 100 }, { n: "c", g: 20, c: 100 }];
  const copy = JSON.stringify(pool);
  const out = rankForLowAppetite(pool);
  assert.equal(JSON.stringify(pool), copy);
  assert.deepEqual(out.map((p) => p.n), ["a", "b", "c"]);
  assert.notEqual(out, pool);
});

test("rankForLowAppetite: not an array gives an empty array", () => {
  assert.deepEqual(rankForLowAppetite(null), []);
  assert.deepEqual(rankForLowAppetite(undefined), []);
});

test("rankForLowAppetite: on the real store breakfast pool, drinks lead and rich solids trail", () => {
  const pool = rankForLowAppetite(rankCandidates({ place: "store", daypart: "breakfast" }));
  const profile = (p) => easeProfile(p.id);
  const firstSolid = pool.findIndex((p) => profile(p).filling === "filling");
  const lastDrink = pool.map((p) => profile(p).filling).lastIndexOf("light");
  if (firstSolid !== -1 && lastDrink !== -1) assert.ok(lastDrink < firstSolid, "all drinks should rank above all solids at equal-ish protein density");
});

test("seed foods and ranked picks carry their catalog id so ease can be looked up", () => {
  assert.ok(seedFoods().every((f) => typeof f.id === "string" && EASE_TAGS[f.id]));
  const pool = rankCandidates({ place: "home", daypart: "lunch" });
  assert.ok(pool.every((p) => typeof p.id === "string"));
});

test("a member-added pick with no id is kept in the ranking, scored as neutral", () => {
  const out = rankForLowAppetite([{ n: "Skyr cup", g: 20, c: 100 }, { id: "shake", n: "shake", g: 30, c: 150 }]);
  assert.equal(out.length, 2);
  assert.ok(out.some((p) => p.n === "Skyr cup"));
});
