"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');
:root{--ink:#15120E;--raise:#211C16;--card:#28221B;--line:#3A322A;--txt:#F6F1E7;--muted:#A99F8E;--faint:#6F665A;--go:#8BE05A;--hold:#F2B33D;--stop:#F0604D;--gold:#D4AF37;}
*{box-sizing:border-box;}
body{margin:0;background:var(--ink);color:var(--txt);font-family:'Inter',system-ui,sans-serif;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:20px;}
.wrap{width:100%;max-width:400px;}
.logo{font-family:'Space Grotesk';font-weight:700;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--txt);margin-bottom:32px;text-align:center;}
.logo .gold{color:var(--gold);}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px;}
label{display:block;font-size:12px;color:var(--muted);margin:0 0 6px;font-weight:500;}
.field{margin-bottom:14px;}
input{width:100%;padding:12px 13px;border-radius:11px;border:1px solid var(--line);background:var(--raise);color:var(--txt);font-size:15px;font-family:'Space Grotesk';outline:none;}
input:focus{border-color:var(--go);}
.btn{display:block;width:100%;padding:14px;border-radius:12px;border:none;cursor:pointer;font-size:15px;font-weight:700;font-family:inherit;background:var(--go);color:#15120E;margin-top:18px;transition:.15s;}
.btn:disabled{opacity:.4;cursor:not-allowed;}
.err{font-size:13px;color:var(--stop);margin-top:10px;line-height:1.4;}
.ok{font-size:13px;color:var(--go);margin-top:10px;line-height:1.4;}
.h{font-family:'Space Grotesk';font-weight:700;font-size:18px;margin:0 0 8px;text-align:center;}
.sub{font-size:13px;color:var(--muted);line-height:1.55;text-align:center;margin:0 0 20px;}
.mutelink{display:inline-block;color:var(--muted);font-size:13px;text-decoration:none;}
.mutelink:hover{color:var(--txt);}
`;

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Supabase's recovery link lands here with a one-time ?code (PKCE). Exchange
  // it for a session. If the browser client already auto-exchanged it, our call
  // no-ops/fails harmlessly and getSession still finds the recovery session.
  useEffect(() => {
    let active = true;
    (async () => {
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        try { await supabase.auth.exchangeCodeForSession(code); } catch {}
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      setValid(!!session);
      setReady(true);
    })();
    return () => { active = false; };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (password.length < 8) { setErr("Use at least 8 characters."); return; }
    if (password !== confirm) { setErr("Those passwords don't match."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setErr(error.message); setBusy(false); return; }
    // Drop the temporary recovery session so they log in fresh with the new password.
    await supabase.auth.signOut();
    router.replace("/login?reset=1");
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="wrap">
        <div className="logo">MUSCLE <span className="gold">MINDSET</span> · KEEP THE MUSCLE</div>
        <div className="card">
          {!ready ? (
            <p className="sub" style={{ margin: 0 }}>Loading…</p>
          ) : !valid ? (
            <>
              <div className="h">Link expired</div>
              <p className="sub">This reset link is invalid or has already been used. Reset links expire after 1 hour and work only once.</p>
              <div style={{ textAlign: "center" }}><Link href="/forgot-password" className="mutelink">Request a new link</Link></div>
            </>
          ) : (
            <form onSubmit={submit}>
              <div className="h">Set a new password</div>
              <p className="sub">Choose a new password for your account.</p>
              <div className="field"><label>New password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" autoFocus /></div>
              <div className="field"><label>Confirm password</label><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" /></div>
              <button className="btn" type="submit" disabled={busy}>{busy ? "…" : "Update password"}</button>
              {err && <div className="err">{err}</div>}
            </form>
          )}
        </div>
      </div>
    </>
  );
}
