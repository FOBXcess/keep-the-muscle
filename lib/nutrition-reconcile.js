// The guardrail that decides, per food, whether to TRUST the USDA database row or fall back to the
// model's own macro estimate. USDA and the model scale the SAME grams, so a big disagreement means
// USDA matched the wrong food (a breaded/branded/composite mismatch), not that the portion is off.
//
// This is the single source of truth for that decision: the app and the tests both call it.
//
//   est  — the model's estimate  { cal, protein, carbs, fat }
//   usda — the database result   { cal, protein, carbs, fat } | { error } | null
// Returns { picked: {cal,protein,carbs,fat}, source: "usda"|"estimate", reason }.
export function reconcileMacros(est, usda) {
  const e = {
    cal: Number(est?.cal) || 0, protein: Number(est?.protein) || 0,
    carbs: Number(est?.carbs) || 0, fat: Number(est?.fat) || 0,
  };
  // Never ship calories that contradict the macros. A USDA row (or a weak estimate) can carry
  // protein/carbs/fat with a blank or kJ-only energy field — that shipped grapes as "0 cal · 36c",
  // which is physically impossible. When the macros imply real energy (4/4/9) and the stored calories
  // are missing or far below it, derive calories from the macros. Only kicks in when there's real
  // energy to reconcile, so a genuinely calorie-free item (diet soda: 0 macros → 0 cal) is untouched,
  // and the ±10% slack around the 4/4/9 estimate leaves fiber/alcohol/polyol foods alone.
  const macroCal = (m) => (m.protein || 0) * 4 + (m.carbs || 0) * 4 + (m.fat || 0) * 9;
  const withSaneCal = (m) => {
    const mc = macroCal(m);
    return mc >= 20 && (!(m.cal > 0) || m.cal < mc * 0.5) ? { ...m, cal: Math.round(mc) } : m;
  };
  const keep = (reason) => ({ picked: withSaneCal(e), source: "estimate", reason });

  // No usable database row → keep the estimate.
  if (!usda || usda.error || !(usda.cal || usda.protein || usda.carbs)) {
    return keep(usda && usda.error ? "not_found" : "no_row");
  }
  const u = {
    cal: Number(usda.cal) || 0, protein: Number(usda.protein) || 0,
    carbs: Number(usda.carbs) || 0, fat: Number(usda.fat) || 0,
  };

  // Calorie divergence: a food-IDENTITY mismatch (dried banana vs raw) or a composite dish USDA
  // can't represent (overnight oats → dry-oats row). Trust the model, not the bad row.
  if (e.cal > 0 && u.cal > 0 && (u.cal > e.cal * 1.8 || u.cal < e.cal * 0.55)) return keep("cal_divergence");
  // Identity guard: a near-zero-carb whole food (plain meat, fish, eggs) that USDA returns loaded
  // with carbs is a breaded/sauced/branded mismatch, not the food asked for.
  if (e.carbs <= 3 && u.carbs >= 8) return keep("carb_identity");
  // Same for a low-fat food coming back fatty.
  if (e.fat <= 4 && u.fat >= 12 && u.cal > e.cal * 1.3) return keep("fat_identity");

  return { picked: withSaneCal(u), source: "usda", reason: "ok" };
}
