// USDA FoodData Central lookup — the "database" behind exact macros.
// Returns per-item macros scaled to `grams`, or an { error } object so callers can
// fall back to an estimate when there's no match / no key. Needs USDA_API_KEY (server-side only).
const USDA_NUTRIENTS = { energyKcal: 1008, energyKj: 1062, protein: 1003, fat: 1004, carbs: 1005 };

// Processing/variant words that make a plain-food lookup wrong when the user didn't ask for them
// ("banana" should not match dehydrated banana or banana chips).
const BAD_MODIFIERS = ["dehydrated", "dried", "powder", "chip", "chips", "fried", "crisp", "crisps",
  "sweetened", "candied", "syrup", "concentrate", "infant", "baby food", "flavored", "canned",
  // Processed/prepared meat variants — a plain "chicken breast" must never match these.
  "breaded", "battered", "nugget", "nuggets", "patty", "patties", "tender", "tenders", "strip",
  "strips", "popcorn", "wing", "wings", "sausage", "luncheon", "lunch meat", "deli", "cured",
  "smoked", "marinated", "glazed", "teriyaki", "barbecue", "bbq", "cordon", "stuffed", "with sauce",
  "with gravy", "salad"];

// Score search hits so a plain query lands on the generic, raw/whole-food entry.
// Exported so it can be unit-tested offline with mock USDA results.
export function pickBestFood(foods, query) {
  const qLc = (query || "").toLowerCase().trim();
  const qWords = qLc.split(/\s+/).filter(Boolean);
  const scoreOf = (food, idx) => {
    const d = (food.description || "").toLowerCase();
    const dt = food.dataType || "";
    let s = 0;
    if (dt === "Foundation" || dt === "SR Legacy") s += 4;
    else if (dt === "Survey (FNDDS)") s += 3;         // "as eaten" — good for prepared dishes
    // Branded gets +0
    if (qWords.length && qWords.every((w) => d.includes(w))) s += 3; // all query words present
    if (d === qLc || d.startsWith(qLc + ",") || d.startsWith(qLc + " ")) s += 2;
    for (const b of BAD_MODIFIERS) { if (d.includes(b) && !qLc.includes(b)) s -= 4; }
    if (d.includes("raw") && !/cook|roast|baked|fried/.test(qLc)) s += 1;
    s -= Math.min(d.length, 70) / 70;   // shorter descriptions are usually the generic item
    s -= idx * 0.06;                    // gentle tiebreak toward USDA's own ranking
    return s;
  };
  let best = foods[0], bestScore = -Infinity;
  foods.forEach((f, i) => { const sc = scoreOf(f, i); if (sc > bestScore) { bestScore = sc; best = f; } });
  return best;
}

const macrosPer100 = (food) => {
  const per100 = {};
  for (const n of food.foodNutrients || []) {
    const id = n.nutrientId;
    if (id === USDA_NUTRIENTS.protein) per100.protein = n.value;
    else if (id === USDA_NUTRIENTS.fat) per100.fat = n.value;
    else if (id === USDA_NUTRIENTS.carbs) per100.carbs = n.value;
    else if (id === USDA_NUTRIENTS.energyKcal && (n.unitName || "").toUpperCase() === "KCAL") per100.cal = n.value;
    else if (id === USDA_NUTRIENTS.energyKj && per100.cal == null) per100.cal = n.value / 4.184;
  }
  return per100;
};

export async function lookupFood(query, grams) {
  const key = process.env.USDA_API_KEY;
  if (!key) return { error: "no_db" };
  if (!query || !(grams > 0)) return { error: "bad_args" };
  try {
    // Generic databases first (raw/whole-food entries) — Branded last. Grab a page and SCORE
    // the results instead of blindly taking foods[0], which for "banana" would surface a
    // dried/branded variant (3-4x the calories of a raw one).
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${key}` +
      `&query=${encodeURIComponent(query)}&pageSize=15&requireAllWords=false` +
      `&dataType=${encodeURIComponent("Foundation,SR Legacy,Survey (FNDDS),Branded")}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return { error: "db_error" };
    const j = await r.json();
    const foods = (j.foods || []).filter(Boolean);
    if (!foods.length) return { error: "not_found" };
    const food = pickBestFood(foods, query);
    if (!food) return { error: "not_found" };
    const per100 = macrosPer100(food);
    if (per100.cal == null && per100.protein == null && per100.carbs == null) return { error: "no_macros" };
    const f = grams / 100;
    const round = (v) => (v == null ? 0 : Math.round(v * f));
    return {
      name: food.description || query,
      brand: food.brandOwner || food.brandName || undefined,
      grams,
      cal: round(per100.cal),
      protein: round(per100.protein),
      carbs: round(per100.carbs),
      fat: round(per100.fat),
      source: "USDA FoodData Central",
    };
  } catch {
    return { error: "db_error" };
  }
}
