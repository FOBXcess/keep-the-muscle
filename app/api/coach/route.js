import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// Claude Sonnet 4.6 pricing, USD per token (web search billed per request).
// Update these if Anthropic changes pricing — the logged est_cost_usd uses them.
const PRICE = {
  input: 3 / 1e6,
  output: 15 / 1e6,
  cacheWrite: 3.75 / 1e6, // 1.25x input (5-min ephemeral cache)
  cacheRead: 0.30 / 1e6,  // 0.1x input
  webSearch: 10 / 1000,   // $10 per 1,000 searches
};

function estimateCost(u) {
  if (!u) return { cost: 0, web: 0 };
  const input = u.input_tokens || 0;
  const output = u.output_tokens || 0;
  const cacheWrite = u.cache_creation_input_tokens || 0;
  const cacheRead = u.cache_read_input_tokens || 0;
  const web = u.server_tool_use?.web_search_requests || 0;
  const cost =
    input * PRICE.input +
    output * PRICE.output +
    cacheWrite * PRICE.cacheWrite +
    cacheRead * PRICE.cacheRead +
    web * PRICE.webSearch;
  return { cost, web, input, output, cacheWrite, cacheRead };
}

export async function POST(req) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Per-user rate limiting (cheap version): count this user's already-logged
  // Anthropic calls in api_usage across two windows. Protects against a runaway
  // client or leaked session hammering the coach and running up the bill.
  // Reads own rows only (api_usage RLS select policy). Limits are far above any
  // real day of coaching use — they only bite abuse.
  const RL_PER_MIN = 30;   // burst ceiling
  const RL_PER_DAY = 400;  // sustained-use ceiling
  const nowMs = Date.now();
  const overLimit = async (windowMs, max) => {
    const { count } = await supabase
      .from("api_usage")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", new Date(nowMs - windowMs).toISOString());
    return (count || 0) >= max;
  };
  if ((await overLimit(60_000, RL_PER_MIN)) || (await overLimit(86_400_000, RL_PER_DAY))) {
    return NextResponse.json(
      { error: { message: "You're sending requests too fast — give it a moment and try again." } },
      { status: 429 }
    );
  }

  const body = await req.json();
  // `kind` is our own tag for usage logging — Anthropic must not receive it.
  const { kind, ...anthropicBody } = body;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "interleaved-thinking-2025-05-14",
    },
    body: JSON.stringify(anthropicBody),
  });

  const data = await res.json();

  // Fire-and-forget usage logging. Never let a logging failure (e.g. table not yet
  // created) break the coach response the user is waiting on.
  if (res.ok && data?.usage) {
    try {
      const e = estimateCost(data.usage);
      await supabase.from("api_usage").insert({
        user_id: user.id,
        kind: kind || "coach",
        model: anthropicBody.model || null,
        input_tokens: e.input,
        output_tokens: e.output,
        cache_read_tokens: e.cacheRead,
        cache_write_tokens: e.cacheWrite,
        web_searches: e.web,
        est_cost_usd: Number(e.cost.toFixed(6)),
      });
    } catch (err) {
      // swallow — logging is best-effort
    }
  }

  return NextResponse.json(data, { status: res.status });
}
