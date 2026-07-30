import { createClient } from "@/lib/supabase-server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

// Who can see this page. Set ADMIN_EMAIL in the environment (Vercel + .env.local) to
// your Supabase login email. Falls back to the owner's known address so it works
// out of the box; override with the env var if that isn't your login.
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "ewill40@gmail.com").toLowerCase();

const usd = (n) => "$" + (n || 0).toFixed(2);
const usd4 = (n) => "$" + (n || 0).toFixed(4);
const num = (n) => (n || 0).toLocaleString();

export default async function AdminPage() {
  // Auth via the cookie-scoped (anon) client — this is the logged-in user.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || (user.email || "").toLowerCase() !== ADMIN_EMAIL) notFound();

  // Cross-user aggregate needs the service role (bypasses RLS). Server-only, never shipped to the browser.
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let rows = [];
  let loadError = null;
  const { data, error } = await admin
    .from("api_usage")
    .select("user_id, kind, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, web_searches, est_cost_usd, created_at")
    .order("created_at", { ascending: false })
    .limit(10000);
  if (error) loadError = error.message;
  else rows = data || [];

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const weekAgo = Date.now() - 7 * 86400000;
  // First instant of the current calendar month (local) — for the per-user monthly cost view.
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthLabel = now.toLocaleString("en-US", { month: "long", year: "numeric" });

  const agg = {
    all: { cost: 0, calls: 0 },
    today: { cost: 0, calls: 0 },
    week: { cost: 0, calls: 0 },
    month: { cost: 0, calls: 0 },
    web: 0,
    cacheRead: 0,
    input: 0,
    output: 0,
  };
  const byKind = {};
  const byUser = {}; // user_id -> { calls, cost, mCalls, mCost, last }
  for (const r of rows) {
    const cost = Number(r.est_cost_usd) || 0;
    const ts = new Date(r.created_at).getTime();
    agg.all.cost += cost; agg.all.calls += 1;
    agg.web += r.web_searches || 0;
    agg.cacheRead += r.cache_read_tokens || 0;
    agg.input += r.input_tokens || 0;
    agg.output += r.output_tokens || 0;
    if ((r.created_at || "").slice(0, 10) === todayStr) { agg.today.cost += cost; agg.today.calls += 1; }
    if (ts >= weekAgo) { agg.week.cost += cost; agg.week.calls += 1; }
    const inMonth = ts >= monthStart;
    if (inMonth) { agg.month.cost += cost; agg.month.calls += 1; }
    const k = r.kind || "coach";
    if (!byKind[k]) byKind[k] = { calls: 0, cost: 0 };
    byKind[k].calls += 1; byKind[k].cost += cost;
    const uid = r.user_id || "unknown";
    if (!byUser[uid]) byUser[uid] = { calls: 0, cost: 0, mCalls: 0, mCost: 0, last: 0 };
    const u = byUser[uid];
    u.calls += 1; u.cost += cost;
    if (inMonth) { u.mCalls += 1; u.mCost += cost; }
    if (ts > u.last) u.last = ts;
  }
  const cacheTotal = agg.cacheRead + agg.input;
  const cachePct = cacheTotal > 0 ? Math.round((agg.cacheRead / cacheTotal) * 100) : 0;
  const recent = rows.slice(0, 25);

  // Resolve user_id -> email so the per-user table is readable. Service-role only; best-effort.
  const emailById = {};
  try {
    const { data: userList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of userList?.users || []) emailById[u.id] = u.email || u.id;
  } catch (e) { /* fall back to showing a truncated id */ }

  // Active users THIS MONTH, ranked by spend — the "cost per active user per month" view.
  const usersMonth = Object.entries(byUser)
    .filter(([, v]) => v.mCalls > 0)
    .map(([id, v]) => ({ id, email: emailById[id] || id.slice(0, 8) + "…", ...v }))
    .sort((a, b) => b.mCost - a.mCost);
  const activeThisMonth = usersMonth.length;
  const avgPerUserMonth = activeThisMonth ? agg.month.cost / activeThisMonth : 0;

  const card = { background: "#28221B", border: "1px solid #3A322A", borderRadius: 14, padding: "16px 18px" };
  const label = { fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "#6F665A", marginBottom: 6 };
  const big = { fontSize: 26, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif" };
  const sub = { fontSize: 12, color: "#A99F8E", marginTop: 2 };
  const th = { textAlign: "left", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "#6F665A", padding: "8px 10px", borderBottom: "1px solid #3A322A" };
  const td = { fontSize: 13, color: "#F6F1E7", padding: "8px 10px", borderBottom: "1px solid #211C16" };

  return (
    <div style={{ minHeight: "100vh", background: "#15120E", color: "#F6F1E7", fontFamily: "'Inter',system-ui,sans-serif", padding: "28px 18px 60px", overflowY: "auto" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, margin: 0 }}>Keep the Muscle · API usage</h1>
          <a href="/app" style={{ color: "#8BE05A", fontSize: 13, textDecoration: "none" }}>← Back to app</a>
        </div>

        {loadError ? (
          <div style={{ ...card, borderColor: "#F0604D", color: "#F0604D" }}>
            Couldn't load usage: {loadError}. If the <code>api_usage</code> table isn't created yet, run the schema migration first.
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 12 }}>
              <div style={card}><div style={label}>Total spend</div><div style={big}>{usd(agg.all.cost)}</div><div style={sub}>{num(agg.all.calls)} calls all-time</div></div>
              <div style={card}><div style={label}>Today</div><div style={big}>{usd(agg.today.cost)}</div><div style={sub}>{num(agg.today.calls)} calls</div></div>
              <div style={card}><div style={label}>Last 7 days</div><div style={big}>{usd(agg.week.cost)}</div><div style={sub}>{num(agg.week.calls)} calls</div></div>
              <div style={card}><div style={label}>This month</div><div style={big}>{usd(agg.month.cost)}</div><div style={sub}>{monthLabel} &middot; {num(agg.month.calls)} calls</div></div>
              <div style={card}><div style={label}>Avg / active user</div><div style={big}>{usd4(avgPerUserMonth)}</div><div style={sub}>{num(activeThisMonth)} active this month</div></div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 20 }}>
              <div style={card}><div style={label}>Prompt cache hit</div><div style={big}>{cachePct}%</div><div style={sub}>{num(agg.cacheRead)} cached vs {num(agg.input)} fresh input tokens</div></div>
              <div style={card}><div style={label}>Output tokens</div><div style={big}>{num(agg.output)}</div><div style={sub}>generated across all calls</div></div>
              <div style={card}><div style={label}>Web searches</div><div style={big}>{num(agg.web)}</div><div style={sub}>{usd(agg.web * 0.01)} at $10/1k</div></div>
            </div>

            <div style={{ ...card, padding: 0, marginBottom: 20, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>Kind</th><th style={th}>Calls</th><th style={th}>Total</th><th style={th}>Avg / call</th></tr></thead>
                <tbody>
                  {Object.entries(byKind).sort((a, b) => b[1].cost - a[1].cost).map(([k, v]) => (
                    <tr key={k}><td style={td}>{k}</td><td style={td}>{num(v.calls)}</td><td style={td}>{usd(v.cost)}</td><td style={td}>{usd4(v.calls ? v.cost / v.calls : 0)}</td></tr>
                  ))}
                  {Object.keys(byKind).length === 0 && <tr><td style={td} colSpan={4}>No usage logged yet.</td></tr>}
                </tbody>
              </table>
            </div>

            <div style={{ ...label, marginBottom: 8 }}>Cost by user &middot; {monthLabel}</div>
            <div style={{ ...card, padding: 0, marginBottom: 20, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>User</th><th style={th}>Calls</th><th style={th}>Cost (mo)</th><th style={th}>Avg / call</th><th style={th}>Last active</th></tr></thead>
                <tbody>
                  {usersMonth.map((u) => (
                    <tr key={u.id}><td style={td}>{u.email}</td><td style={td}>{num(u.mCalls)}</td><td style={td}>{usd4(u.mCost)}</td><td style={td}>{usd4(u.mCalls ? u.mCost / u.mCalls : 0)}</td><td style={td}>{new Date(u.last).toLocaleDateString()}</td></tr>
                  ))}
                  {usersMonth.length === 0 && <tr><td style={td} colSpan={5}>No active users this month.</td></tr>}
                </tbody>
              </table>
            </div>

            <div style={{ ...label, marginBottom: 8 }}>Recent calls</div>
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>When</th><th style={th}>Kind</th><th style={th}>In / out</th><th style={th}>Cost</th></tr></thead>
                <tbody>
                  {recent.map((r, i) => (
                    <tr key={i}>
                      <td style={td}>{new Date(r.created_at).toLocaleString()}</td>
                      <td style={td}>{r.kind || "coach"}</td>
                      <td style={td}>{num(r.input_tokens)} / {num(r.output_tokens)}{r.cache_read_tokens ? ` · ${num(r.cache_read_tokens)} cached` : ""}</td>
                      <td style={td}>{usd4(Number(r.est_cost_usd) || 0)}</td>
                    </tr>
                  ))}
                  {recent.length === 0 && <tr><td style={td} colSpan={4}>No calls yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
