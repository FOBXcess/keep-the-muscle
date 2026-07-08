import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// Landing point for the password-recovery email link.
// The email template points here with a single-use token_hash; we verify it,
// which sets the session cookie, then hand off to the reset-password form.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") || "/reset-password";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Missing/expired/used token → reset page renders its "link expired" state.
  return NextResponse.redirect(new URL("/reset-password?error=invalid", origin));
}
