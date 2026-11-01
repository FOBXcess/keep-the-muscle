// Seed food catalog for Keep the Muscle: the foods the app can suggest, each with a natural serving, protein (g), calories,
// a status + source for every number, and tags describing the food (how it's prepared, cost, grab-and-go, allergens).
// Pure data + helpers: no React, no I/O.
//
// STATUS: what we can honestly say about a number. Never describe a number as "verified" unless it is.
//   "verified"      re-checked against the product's own label / official nutrition, with a `checked` date (nothing is verified yet in KTM)
//   "reference"     a standard reference value for a plain food (USDA-style), entered by hand, not re-checked live
//   "label-typical" the typical label of a common packaged product, entered by hand, not re-checked against the current label
//   "estimate"      a rough hand-entered number
//   "guide"         a row from a hand-written guide, not re-checked
//   "unconfirmed" / "discontinued"  never suggested
// `needsCheck: true` marks a number that looks off and needs a human (or a label) to confirm it.
import { EGG_PROTEIN_G, EGG_CAL } from "./home-protein.js";

export const STATUSES = ["verified", "reference", "label-typical", "estimate", "guide", "unconfirmed", "discontinued"];
export const SUGGESTABLE_STATUSES = ["verified", "reference", "label-typical", "estimate", "guide"];
export const COOK = ["none", "heat", "stove", "oven"]; // none = eat as is; heat = microwave/heat-and-eat; stove / oven = real cooking
export const SLOTS = ["morning", "midday", "evening"]; // when a food makes sense; every seed food says so, so nothing is offered at the wrong time of day by default
export const COST = [1, 2, 3];                          // 1 = cheap staple, 2 = typical, 3 = pricey

const SRC = {
  usda: "Standard reference value (USDA-style) entered by hand; not re-checked live",
  label: "Typical product label entered by hand; not re-checked against the current label",
  rough: "Rough hand-entered estimate; not checked against a source",
};

// n = the phrase the member sees, p = protein g, c = calories for that serving. `carbs/fat/sugar` where known. `family` groups entries that are the SAME food in
// different servings (protein density should agree across a family). `when` = which meal slots / contexts (home or store) the seed suggests it for.
export const CATALOG = [
  // ---- eggs: computed from ONE per-egg value so every list agrees (USDA large egg ≈ 6.3 g protein, 72 cal) ----
  { id: "eggs3", n: "3 eggs", p: Math.round(3 * EGG_PROTEIN_G), c: 3 * EGG_CAL, carbs: 1, fat: 14, family: "egg", count: 3, usda: { q: "egg whole cooked hard-boiled", grams: 150 }, status: "reference", src: SRC.usda,
    tags: { cook: "stove", cost: 1, grab: false, fridge: true, contains: ["egg"] }, when: { slots: ["morning"], contexts: ["home"] } },
  { id: "eggs2", n: "2 eggs", p: Math.round(2 * EGG_PROTEIN_G), c: 2 * EGG_CAL, carbs: 1, fat: 10, family: "egg", count: 2, usda: { q: "egg whole cooked hard-boiled", grams: 100 }, status: "reference", src: SRC.usda,
    tags: { cook: "stove", cost: 1, grab: false, fridge: true, contains: ["egg"] }, when: { slots: ["morning", "midday"], contexts: ["home"] } },
  // ---- lean meats / fish ----
  { id: "chicken6", n: "6 oz chicken", p: 52, c: 280, carbs: 0, fat: 6, grams: 170, family: "chicken-breast", usda: { q: "chicken breast meat only cooked roasted", grams: 170 }, status: "reference", src: SRC.usda,
    tags: { cook: "stove", cost: 2, grab: false, fridge: true, contains: ["poultry"] }, when: { slots: ["midday", "evening"], contexts: ["home"] } },
  { id: "chicken4", n: "Chicken breast (4 oz)", p: 35, c: 185, carbs: 0, fat: 4, grams: 113, family: "chicken-breast", usda: { q: "chicken breast meat only cooked roasted", grams: 113 }, status: "reference", src: SRC.usda,
    tags: { cook: "stove", cost: 2, grab: false, fridge: true, contains: ["poultry"] , slots: ["midday", "evening"] } },
  { id: "turkey6", n: "6 oz turkey breast", p: 51, c: 250, usda: { q: "turkey breast meat only cooked roasted", grams: 170 }, status: "reference", src: SRC.usda,
    note: "Was 230 cal; USDA (roasted turkey breast, meat only, 170 g) is 51g protein / 250 cal. Checked live.",
    tags: { cook: "stove", cost: 2, grab: false, fridge: true, contains: ["poultry"] }, when: { slots: ["midday", "evening"], contexts: ["home"] } },
  { id: "shrimp6", n: "6 oz shrimp", p: 41, c: 170, usda: { q: "shrimp cooked", grams: 170 }, status: "reference", src: SRC.usda,
    tags: { cook: "stove", cost: 3, grab: false, fridge: true, contains: ["shellfish"] }, when: { slots: ["evening"], contexts: ["home"] } },
  { id: "salmon6", n: "6 oz salmon", p: 34, c: 350, status: "estimate", src: SRC.rough, note: "Farmed Atlantic salmon is closer to 37g protein for 6 oz cooked.",
    tags: { cook: "stove", cost: 3, grab: false, fridge: true, contains: ["fish"] }, when: { slots: ["evening"], contexts: ["home"] } },
  { id: "steak6lean", n: "6 oz lean steak", p: 46, c: 320, status: "estimate", src: SRC.rough,
    tags: { cook: "stove", cost: 3, grab: false, fridge: true, contains: ["beef"] }, when: { slots: ["evening"], contexts: ["home"] } },
  { id: "steak6", n: "6 oz steak", p: 46, c: 440, status: "estimate", src: SRC.rough, note: "A typical (not lean) cut; the lean cut is 6 oz lean steak.",
    tags: { cook: "stove", cost: 3, grab: false, fridge: true, contains: ["beef"] , slots: ["midday", "evening"] } },
  { id: "tuna", n: "a can of tuna", p: 26, c: 128, usda: { q: "tuna light canned in water drained solids", grams: 142 }, status: "reference", src: SRC.usda,
    tags: { cook: "none", cost: 1, grab: true, fridge: false, contains: ["fish"] }, when: { slots: ["midday"], contexts: ["home", "store"] } },
  { id: "safecatch", n: "a Safe Catch tuna", p: 39, c: 165, carbs: 0, fat: 1, grams: 142, status: "label-typical", src: SRC.label,
    note: "Whole can is about 1.5 label servings (label serving 3 oz = 110 cal, 26g protein). Not re-checked for KTM.",
    tags: { cook: "none", cost: 2, grab: true, fridge: false, contains: ["fish"] }, when: { slots: ["midday"], contexts: ["store"] } },
  { id: "rotisserie5", n: "rotisserie chicken (5 oz)", p: 43, c: 250, status: "estimate", src: SRC.rough,
    tags: { cook: "none", cost: 2, grab: true, fridge: true, contains: ["poultry"] }, when: { slots: ["midday", "evening"], contexts: ["store"] } },
  { id: "sausage2", n: "2 turkey sausages", p: 14, c: 140, status: "estimate", src: SRC.rough,
    tags: { cook: "stove", cost: 2, grab: false, fridge: true, contains: ["poultry"] }, when: { slots: ["morning"], contexts: ["home"] } },
  // ---- dairy ----
  { id: "yogurt170", n: "a Greek yogurt cup (170 g)", p: 17, c: 100, carbs: 6, fat: 0, sugar: 5, grams: 170, family: "greek-yogurt", status: "label-typical", src: SRC.label,
    note: "Replaces '1 cup Greek yogurt (17g / 130 cal)' and '150g Greek yogurt (15g / 90 cal)', which disagreed with each other and with the stack partner.",
    tags: { cook: "none", cost: 1, grab: true, fridge: true, contains: ["dairy"] }, when: { slots: ["morning", "evening"], contexts: ["home", "store"] } },
  { id: "cottage150", n: "150g cottage cheese", p: 17, c: 120, status: "estimate", src: SRC.rough, family: "cottage-cheese", grams: 150,
    tags: { cook: "none", cost: 1, grab: true, fridge: true, contains: ["dairy"] }, when: { slots: ["morning", "evening"], contexts: ["home", "store"] } },
  { id: "cottage113", n: "Cottage cheese (½ cup)", p: 12, c: 90, carbs: 5, fat: 2.5, sugar: 4, grams: 113, family: "cottage-cheese", status: "label-typical", src: SRC.label,
    tags: { cook: "none", cost: 1, grab: true, fridge: true, contains: ["dairy"] , slots: ["morning", "midday", "evening"] } },
  { id: "stringcheese", n: "a string cheese", p: 7, c: 80, status: "label-typical", src: SRC.label,
    tags: { cook: "none", cost: 1, grab: true, fridge: true, contains: ["dairy"] }, when: { slots: ["morning", "midday", "evening"], contexts: ["store"] } },
  // ---- shakes / grab-and-go ----
  { id: "shake", n: "a protein shake", p: 30, c: 150, status: "estimate", src: SRC.rough,
    tags: { cook: "none", cost: 2, grab: true, fridge: false, contains: ["dairy"] }, when: { slots: ["morning", "midday", "evening"], contexts: ["store"] } },
  { id: "fairlife-np", n: "a Fairlife shake", p: 30, c: 150, status: "label-typical", src: SRC.label, note: "The Nutrition Plan 11.5 oz shake (150 cal, 30g protein). Core Power is a different product: see Fairlife Core Power shake.",
    tags: { cook: "none", cost: 2, grab: true, fridge: false, contains: ["dairy"] , slots: ["morning", "midday", "evening"] } },
  { id: "chomps", n: "a Chomps stick", p: 10, c: 100, status: "label-typical", src: SRC.label,
    tags: { cook: "none", cost: 2, grab: true, fridge: false, contains: ["beef"] , slots: ["midday", "evening"] } },
  { id: "beefstick", n: "a beef stick", p: 10, c: 100, status: "label-typical", src: SRC.label,
    tags: { cook: "none", cost: 1, grab: true, fridge: false, contains: ["beef"] }, when: { slots: ["midday", "evening"], contexts: ["store"] } },
  // ---- stack partners that have no pick of their own (typical label values; one serving each) ----
  { id: "fairlife-milk", n: "Fairlife 2% milk (1 cup)", p: 13, c: 120, carbs: 6, fat: 4.5, sugar: 6, grams: 240, status: "label-typical", src: SRC.label,
    tags: { cook: "none", cost: 1, grab: true, fridge: true, contains: ["dairy"] , slots: ["morning", "midday", "evening"] } },
  { id: "fairlife-core", n: "Fairlife Core Power shake", p: 26, c: 170, carbs: 8, fat: 4.5, sugar: 4, grams: 414, status: "label-typical", src: SRC.label,
    tags: { cook: "none", cost: 2, grab: true, fridge: false, contains: ["dairy"] , slots: ["morning", "midday", "evening"] } },
  { id: "whey", n: "Whey protein (1 scoop)", p: 24, c: 120, carbs: 3, fat: 1.5, sugar: 1, grams: 31, status: "label-typical", src: SRC.label,
    tags: { cook: "none", cost: 2, grab: true, fridge: false, contains: ["dairy"] , slots: ["morning", "midday", "evening"] } },
  { id: "eggwhites", n: "Egg whites (1 cup)", p: 26, c: 126, carbs: 2, fat: 0, sugar: 2, grams: 243, usda: { q: "egg white raw", grams: 243 }, status: "reference", src: SRC.usda,
    tags: { cook: "heat", cost: 1, grab: true, fridge: true, contains: ["egg"] , slots: ["morning", "midday", "evening"] } },
];

const byId = Object.fromEntries(CATALOG.map((e) => [e.id, e]));

// The seed pool the ranker starts from: [{ n, g, c, slots, contexts }], in a fixed order. Only foods with a `when` tag are in the seed.
const SEED_ORDER = ["chicken6", "turkey6", "shrimp6", "tuna", "salmon6", "steak6lean", "eggs3", "eggs2", "yogurt170", "cottage150", "sausage2", "shake", "rotisserie5", "safecatch", "beefstick", "stringcheese"];
export function seedFoods() {
  return SEED_ORDER.map((id) => byId[id]).map((e) => ({ n: e.n, g: e.p, c: e.c, slots: e.when.slots, contexts: e.when.contexts }));
}

// Every number that looks off and needs a human check.
export const needsCheck = () => CATALOG.filter((e) => e.needsCheck).map((e) => ({ id: e.id, n: e.n, p: e.p, c: e.c, note: e.note || "" }));

// Protein per calorie: grams of protein per 100 calories. Higher = more protein for the calories.
export const proteinPerCal = (pick) => (pick.c > 0 ? (pick.g / pick.c) * 100 : 0);

// Only a genuinely protein-dense pick should be suggested, otherwise the pool fills with whatever someone scanned (a soda, a candy bar).
// Requires a meaningful amount of protein AND at least 10 g per 100 cal (chicken ~18, a real shake ~20, junk ~1-2).
export function isSuggestable(pick) {
  return !!pick && pick.g >= 10 && proteinPerCal(pick) >= 10;
}

// Turn a shared food-library row (per-100 g macros + a label serving) into a ready-to-suggest pick, or null when the row lacks a usable serving weight.
// n = a natural phrase, g = protein for the serving, c = its calories.
export function pickFromLibraryRow(row) {
  const sg = Number(row && row.serving_grams);
  const p100 = Number(row && row.protein);
  const c100 = Number(row && row.cal);
  if (!(sg > 0) || !(p100 > 0) || !(c100 > 0)) return null;
  const f = sg / 100;
  const label = (row.serving_label || "").toString().trim();
  const name = (row.name || "").toString().trim();
  const n = (label ? `${label} ${name}` : `1 serving ${name}`).slice(0, 60);
  return { n, g: Math.round(p100 * f), c: Math.round(c100 * f) };
}
