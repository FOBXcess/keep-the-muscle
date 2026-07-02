import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(req) {
  const { email, password, code } = await req.json();

  const expectedCode = process.env.SIGNUP_ACCESS_CODE;
  if (!expectedCode || code?.trim().toUpperCase() !== expectedCode.trim().toUpperCase()) {
    return NextResponse.json({ error: "Invalid access code. Check your Stan Store purchase email." }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
