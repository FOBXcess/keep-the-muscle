"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
.tabs{display:flex;gap:4px;margin-bottom:24px;background:var(--raise);border-radius:10px;padding:4px;}
.tab{flex:1;padding:9px;border:none;border-radius:8px;background:none;color:var(--muted);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:.15s;}
.tab.on{background:var(--card);color:var(--txt);}
label{display:block;font-size:12px;color:var(--muted);margin:0 0 6px;font-weight:500;}
.field{margin-bottom:14px;}
input{width:100%;padding:12px 13px;border-radius:11px;border:1px solid var(--line);background:var(--raise);color:var(--txt);font-size:15px;font-family:'Space Grotesk';outline:none;}
input:focus{border-color:var(--go);}
.btn{display:block;width:100%;padding:14px;border-radius:12px;border:none;cursor:pointer;font-size:15px;font-weight:700;font-family:inherit;background:var(--go);color:#15120E;margin-top:18px;transition:.15s;}
.btn:disabled{opacity:.4;cursor:not-allowed;}
.err{font-size:13px;color:var(--stop);margin-top:10px;line-height:1.4;}
.ok{font-size:13px;color:var(--go);margin-top:10px;line-height:1.4;}
.mutelink{display:inline-block;color:var(--muted);font-size:13px;text-decoration:none;}
.mutelink:hover{color:var(--txt);}
`;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const supabase = createClient();

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("reset") === "1") setOk("Password updated — log in with your new password.");
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setOk("");
    setBusy(true);

    if (mode === "signup") {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, code }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Signup failed."); setBusy(false); return; }
      setOk("Account created — you can log in now.");
      setMode("login");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setErr(error.message); setBusy(false); return; }
      router.push("/app");
    }
    setBusy(false);
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="wrap">
        <div className="logo">MUSCLE <span className="gold">MINDSET</span> · KEEP THE MUSCLE</div>
        <div className="card">
          <div className="tabs">
            <button className={`tab ${mode === "login" ? "on" : ""}`} onClick={() => { setMode("login"); setErr(""); setOk(""); }}>Log in</button>
            <button className={`tab ${mode === "signup" ? "on" : ""}`} onClick={() => { setMode("signup"); setErr(""); setOk(""); }}>Sign up</button>
          </div>
          <form onSubmit={submit}>
            <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
            <div className="field"><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === "signup" ? "new-password" : "current-password"} /></div>
            {mode === "signup" && (
              <div className="field"><label>Access code</label><input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="From your Stan Store purchase" required /></div>
            )}
            <button className="btn" type="submit" disabled={busy}>{busy ? "…" : mode === "login" ? "Log in" : "Create account"}</button>
            {mode === "login" && (
              <div style={{ textAlign: "center", marginTop: 14 }}><Link href="/forgot-password" className="mutelink">Forgot password?</Link></div>
            )}
            {err && <div className="err">{err}</div>}
            {ok && <div className="ok">{ok}</div>}
          </form>
        </div>
      </div>
    </>
  );
}
