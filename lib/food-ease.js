// How easy a food is to eat on a GLP-1 medication: two SEPARATE questions, matching the two questions members will be asked.
//
//   filling  how filling the food is for its calories      light | medium | filling   ("could I eat more of it?")
//   comfort  how likely it is to sit badly (nausea, bloat)  gentle | neutral | heavy   ("did it go down easy?")
//
// HONEST STATUS: these are HYPOTHESES, not findings. The tags below are hand-assigned from (a) dietitian and clinician commentary
// that rich/greasy food and warm, strong-smelling food are harder on a slowed stomach, and (b) small studies suggesting liquid
// meals are less filling than solid ones. No study has tested these rules in GLP-1 users, and the weights are placeholders.
// Member ratings (comfort and fullness, with context) are meant to replace these rules over time.
// Pure data + functions: no React, no I/O.

export const FORMATS = ["liquid", "soft", "solid"];       // liquid = drink/shake; soft = spoonable (yogurt, cottage cheese, canned fish, scrambled); solid = needs chewing
export const RICHNESS = ["lean", "moderate", "rich"];     // rich = fatty / greasy / cured
export const SERVE = ["cold", "warm", "either"];          // how it is normally eaten

export const EASE_SOURCE = "Hand-tagged from dietitian guidance and the slowed-stomach mechanism; not tested in GLP-1 users; to be replaced by member ratings";

// One entry per catalog id (lib/food-catalog.js). A test fails if a catalog food has no tags here.
export const EASE_TAGS = {
  eggs3:           { format: "solid",  richness: "moderate", serve: "warm" },
  eggs2:           { format: "solid",  richness: "moderate", serve: "warm" },
  chicken6:        { format: "solid",  richness: "lean",     serve: "warm" },
  chicken4:        { format: "solid",  richness: "lean",     serve: "warm" },
  turkey6:         { format: "solid",  richness: "lean",     serve: "warm" },
  shrimp6:         { format: "solid",  richness: "lean",     serve: "warm" },
  salmon6:         { format: "solid",  richness: "rich",     serve: "warm" },
  steak6lean:      { format: "solid",  richness: "moderate", serve: "warm" },
  steak6:          { format: "solid",  richness: "rich",     serve: "warm" },
  tuna:            { format: "soft",   richness: "lean",     serve: "cold" },
  safecatch:       { format: "soft",   richness: "lean",     serve: "cold" },
  rotisserie5:     { format: "solid",  richness: "moderate", serve: "either" },
  sausage2:        { format: "solid",  richness: "rich",     serve: "warm" },
  yogurt170:       { format: "soft",   richness: "lean",     serve: "cold" },
  cottage150:      { format: "soft",   richness: "lean",     serve: "cold" },
  cottage113:      { format: "soft",   richness: "lean",     serve: "cold" },
  stringcheese:    { format: "solid",  richness: "moderate", serve: "cold" },
  shake:           { format: "liquid", richness: "lean",     serve: "cold" },
  "fairlife-np":   { format: "liquid", richness: "lean",     serve: "cold" },
  chomps:          { format: "solid",  richness: "moderate", serve: "either" },
  beefstick:       { format: "solid",  richness: "rich",     serve: "either" },
  "fairlife-milk": { format: "liquid", richness: "lean",     serve: "cold" },
  "fairlife-core": { format: "liquid", richness: "lean",     serve: "cold" },
  whey:            { format: "liquid", richness: "lean",     serve: "cold" },
  eggwhites:       { format: "soft",   richness: "lean",     serve: "warm" },
};

const FILLING_POINTS = { liquid: 0, soft: 1, solid: 2 };
const RICHNESS_POINTS = { lean: 0, moderate: 1, rich: 2 };

// Profile for one food id. A food with no tags (for example one a member added) comes back as unknown: neutral on both, `known: false`.
export function easeProfile(id) {
  const t = EASE_TAGS[id];
  if (!t) return { known: false, filling: "medium", comfort: "neutral", fillingPoints: 1, comfortPoints: 1, reasons: ["not rated yet"] };
  const fillingPoints = FILLING_POINTS[t.format];
  const comfortPoints = RICHNESS_POINTS[t.richness] + (t.serve === "warm" ? 0.5 : 0);
  const reasons = [];
  reasons.push(t.format === "liquid" ? "a drink: usually less filling" : t.format === "soft" ? "soft and spoonable" : "solid: usually more filling");
  if (t.richness === "rich") reasons.push("rich or fatty: slower to leave the stomach");
  else if (t.richness === "moderate") reasons.push("moderate fat");
  else if (t.richness === "lean") reasons.push("lean: usually gentle");
  if (t.serve === "cold") reasons.push("served cold: often easier");
  else if (t.serve === "warm" && t.richness !== "lean") reasons.push("served warm: smell can be harder");
  return {
    known: true,
    filling: fillingPoints === 0 ? "light" : fillingPoints === 1 ? "medium" : "filling",
    comfort: comfortPoints <= 0.5 ? "gentle" : comfortPoints <= 1.5 ? "neutral" : "heavy",
    fillingPoints,
    comfortPoints,
    reasons,
  };
}

// Protein per 100 cal, discounted for how filling and how hard on the stomach the food is. Higher = more protein for the least
// fullness and the least nausea risk. The 0.25 discounts are PLACEHOLDERS to be tuned from member ratings.
export function lowAppetiteScore(pick) {
  const ppc = pick && pick.c > 0 ? (pick.g / pick.c) * 100 : 0;
  const e = easeProfile(pick && pick.id);
  return ppc / (1 + 0.25 * e.fillingPoints) / (1 + 0.25 * e.comfortPoints);
}

// Re-rank a pool of picks ({ id?, n, g, c }) for someone whose appetite is suppressed. Returns a new array; the input is not changed.
// The sort is stable, so equal scores keep their incoming order. Not an array -> empty array.
export function rankForLowAppetite(pool) {
  if (!Array.isArray(pool)) return [];
  return pool.map((p, i) => ({ p, i, s: lowAppetiteScore(p) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.p);
}
