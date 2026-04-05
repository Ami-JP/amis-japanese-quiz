import crypto from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const rawToken = cookieStore.get("student_session")?.value;
    const db = supabaseAdmin as any;

    if (rawToken) {
      const tokenHash = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

      await db
        .from("student_sessions")
        .delete()
        .eq("session_token_hash", tokenHash);
    }

    const res = NextResponse.json({ ok: true });

    res.cookies.set("student_session", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return res;
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}