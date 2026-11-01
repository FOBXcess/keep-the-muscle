// Pure candidate ranker for food suggestions. Given the situation, it returns a pool of picks ranked by protein per calorie,
// for the caller to combine and display. It does NOT choose wording, produce a verdict, or touch the day's log.
// If it can't produce a pool, it returns null and the caller keeps whatever it was already using.

import { seedFoods, proteinPerCal } from "./food-catalog.js";

// The caller's day parts map onto the catalog's meal slots.
const DAYPART_SLOT = { breakfast: "morning", lunch: "midday", dinner: "evening" };

// Return a pool ranked by protein per calorie, highest first. It merges the slot/context-tagged seed catalog with `extra`
// (foods people added to the shared library, already quality-checked), which have no slot yet so they're eligible anytime.
// `place` is "home" or "store". Shape: { n, g, c } (display phrase, protein grams, calories). Duplicates by name are dropped.
export function rankCandidates({ place, daypart, extra = [] } = {}) {
  const slot = DAYPART_SLOT[daypart] || "midday";
  const seed = seedFoods().filter((f) => f.contexts.includes(place) && f.slots.includes(slot)).map(({ n, g, c }) => ({ n, g, c }));
  const pool = [...seed, ...(Array.isArray(extra) ? extra : [])];
  if (!pool.length) return null;
  const seen = new Set();
  return pool
    .sort((a, b) => proteinPerCal(b) - proteinPerCal(a))
    .filter((p) => { const k = (p.n || "").toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
}
