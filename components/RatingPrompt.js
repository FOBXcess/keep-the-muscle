"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ratingPrompts, validateRating, ratedKeyFromRow } from "@/lib/food-ratings";

// "How did it sit with you?" Asked about foods the member logged, about an hour after eating (rules live in lib/food-ratings.js).
// Styling reuses the app's own classes (card, fl, seg, btn, gate, x, lead); nothing new is added to the app's CSS.
//
// props:
//   items    today's logged items (each stamped with `at` when logged)
//   ratings  { listRecent(): Promise<rows>, save(rating): Promise<{ ok, error? }> } from AppShell; with none, this renders nothing

const SKIP_KEY = "ktm:ratingSkips"; // a per-device convenience: foods the member chose to skip. Wrapped in try/catch: storage can be unavailable.
const readSkips = () => { try { const v = JSON.parse(window.localStorage.getItem(SKIP_KEY) || "[]"); return Array.isArray(v) ? v.slice(-200) : []; } catch { return []; } };
const writeSkips = (list) => { try { window.localStorage.setItem(SKIP_KEY, JSON.stringify(list.slice(-200))); } catch { /* storage unavailable: the skip lasts until reload */ } };

const FULLNESS_CHOICES = [["could_eat_more", "Could eat more"], ["just_right", "Just right"], ["too_filling", "Too filling"]];
const COMFORT_CHOICES = [["easy", "Went down easy"], ["okay", "Okay"], ["queasy", "Queasy"]];

const ago = (minutes) => (minutes < 120 ? `${minutes} min ago` : `${Math.round(minutes / 60)} hours ago`);

export default function RatingPrompt({ items, ratings }) {
  const [now, setNow] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(false);        // don't show anything until we know what was already rated
  const [rated, setRated] = useState(() => new Set());
  const [skipped, setSkipped] = useState([]);
  const [answers, setAnswers] = useState({});         // ratingKey -> { fullness, comfort }
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { setSkipped(readSkips()); }, []);
  // Re-check every minute so a prompt appears on its own once the hour passes, even if the app stays open.
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (!ratings) return undefined;
    let live = true;
    Promise.resolve(ratings.listRecent())
      .then((rows) => { if (live) setRated((prev) => new Set([...prev, ...(rows || []).map(ratedKeyFromRow)])); })
      .catch(() => {})
      .finally(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, [ratings]);

  const prompts = useMemo(
    () => (ratings && loaded ? ratingPrompts(items, new Set([...rated, ...skipped]), now) : []),
    [ratings, loaded, items, rated, skipped, now]
  );

  // A prompt can appear on its own an hour after a meal, possibly below the visible part of the chat. Bring it into view
  // the first time it shows up; not on every minute tick and not after each save.
  const wrapRef = useRef(null);
  const wasShown = useRef(false);
  useEffect(() => {
    if (!prompts.length) { wasShown.current = false; return; }
    if (!wasShown.current) {
      wasShown.current = true;
      try { if (wrapRef.current) wrapRef.current.scrollIntoView({ block: "end", behavior: "smooth" }); } catch { /* old browser: leave it where it is */ }
    }
  }, [prompts.length]);

  if (!prompts.length) return null;

  const pick = (key, field, value) => setAnswers((a) => ({ ...a, [key]: { ...a[key], [field]: value } }));

  const skip = (key) => { const next = [...skipped, key]; setSkipped(next); writeSkips(next); };

  const save = async (p) => {
    const a = answers[p.key] || {};
    const v = validateRating({ name: p.item.name, at: p.item.at, fullness: a.fullness, comfort: a.comfort });
    if (!v.ok) { setError(v.error); return; }
    setSaving(p.key); setError("");
    try {
      const r = await ratings.save(v.value);
      if (r && r.ok) setRated((prev) => new Set([...prev, p.key]));
      else setError("Couldn't save that. Try again in a moment.");
    } catch {
      setError("Couldn't save that. Try again in a moment.");
    }
    setSaving(null);
  };

  return (
    <div data-testid="rating-prompts" ref={wrapRef}>
      {prompts.slice(0, 1).map((p) => {   // one at a time, newest first: the next appears after this one is answered or skipped
        const a = answers[p.key] || {};
        return (
          <div className="card" key={p.key} style={{ marginTop: 10, padding: 14 }} data-testid="rating-card">
            <div style={{ fontWeight: 700 }}>How did {p.item.name} sit with you?</div>
            <div className="lead" style={{ fontSize: 12.5 }}>Logged {ago(p.minutesAgo)}</div>

            <label className="fl" style={{ margin: "10px 0 5px" }}>Did it fill you up?</label>
            <div className="seg">
              {FULLNESS_CHOICES.map(([v, label]) => (
                <button key={v} className={a.fullness === v ? "on" : ""} onClick={() => pick(p.key, "fullness", v)}>{label}</button>
              ))}
            </div>

            <label className="fl" style={{ margin: "10px 0 5px" }}>Did it sit well?</label>
            <div className="seg">
              {COMFORT_CHOICES.map(([v, label]) => (
                <button key={v} className={a.comfort === v ? "on" : ""} onClick={() => pick(p.key, "comfort", v)}>{label}</button>
              ))}
            </div>

            {error && <div className="gate">{error}</div>}
            <button className="btn go" style={{ marginTop: 10, padding: 12 }} disabled={!a.fullness || !a.comfort || saving === p.key} onClick={() => save(p)}>
              {saving === p.key ? "Saving…" : "Save"}
            </button>
            <div style={{ textAlign: "center", marginTop: 6, fontSize: 11.5, color: "var(--faint)" }}>
              <button className="x" onClick={() => skip(p.key)}>Skip</button>
              {" · "}Only combined results from many people are ever shared.
            </div>
          </div>
        );
      })}
    </div>
  );
}
