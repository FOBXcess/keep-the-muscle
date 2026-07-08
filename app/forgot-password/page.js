"use client";
import { useState } from "react";
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const supabase = createClient();

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    // Never reveal whether the email is registered. resetPasswordForEmail
    // resolves successfully for unknown addresses; only a genuine server/
    // transport failure should surface an error to the user.
    if (error && (error.status ?? 500) >= 500) {
      setErr("Something went wrong on our end. Please try again in a moment.");
      return;
    }
    setSent(true);
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="wrap">
        <div className="logo">MUSCLE <span className="gold">MINDSET</span> · KEEP THE MUSCLE</div>
        <div className="card">
          {sent ? (
            <>
              <div className="h">Check your email</div>
              <p className="sub">If an account exists for <b>{email}</b>, we just sent a link to reset your password. It expires in 1 hour and can only be used once.</p>
              <div style={{ textAlign: "center" }}><Link href="/login" className="mutelink">← Back to log in</Link></div>
            </>
          ) : (
            <form onSubmit={submit}>
              <div className="h">Reset your password</div>
              <p className="sub">Enter your email and we'll send you a link to set a new one.</p>
              <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus /></div>
              <button className="btn" type="submit" disabled={busy}>{busy ? "…" : "Send reset link"}</button>
              {err && <div className="err">{err}</div>}
              <div style={{ textAlign: "center", marginTop: 16 }}><Link href="/login" className="mutelink">← Back to log in</Link></div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
