import crypto from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
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

    const url = new URL(request.url);
    const res = NextResponse.redirect(new URL("/student-login", url));

    res.cookies.set("student_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
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