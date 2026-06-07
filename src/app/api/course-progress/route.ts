import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type StudentSessionResult = {
  student_account_id: string;
  expires_at?: string | null;
};

type CourseRow = {
  id: string;
  course_slug: string;
  title: string;
  jlpt_level: string | null;
  description: string | null;
  total_days: number;
  is_published: boolean;
};

type CourseProgressRow = {
  id: string;
  course_id: string;
  course_day_id: string | null;
  day_number: number;
  status: "not_started" | "in_progress" | "completed" | "review_needed";
  total_questions: number;
  answered_count: number;
  correct_count: number;
  incorrect_count: number;
  accuracy: number | null;
  completed_at: string | null;
  last_answered_at: string | null;
};

type CourseDayRow = {
  id: string;
  day_number: number;
  day_title: string;
  day_theme: string | null;
  kanji_list: unknown;
  is_published: boolean;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function isExpired(expiresAt?: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

async function getStudentAccountId(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  request: NextRequest;
}) {
  const { supabase, request } = params;

  const sessionToken = request.cookies.get("student_session")?.value;

  if (!sessionToken) {
    throw new Error("Student session cookie was not found.");
  }

  const sessionTokenHash = sha256Hex(sessionToken);

  const { data: session, error } = await supabase
    .from("student_sessions")
    .select("student_account_id, expires_at")
    .eq("session_token_hash", sessionTokenHash)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to verify student session: ${error.message}`);
  }

  if (!session?.student_account_id) {
    throw new Error("Student session was not found.");
  }

  const typedSession = session as StudentSessionResult;

  if (isExpired(typedSession.expires_at)) {
    throw new Error("Student session has expired.");
  }

  return typedSession.student_account_id;
}

function normalizeStatus(status?: string | null) {
  if (
    status === "in_progress" ||
    status === "completed" ||
    status === "review_needed"
  ) {
    return status;
  }

  return "not_started";
}

function getDayState(params: {
  dayNumber: number;
  status: string;
  nextDayNumber: number;
}) {
  const { dayNumber, status, nextDayNumber } = params;

  if (status === "completed") return "completed";
  if (status === "review_needed") return "review_needed";
  if (status === "in_progress") return "current";
  if (dayNumber === nextDayNumber) return "current";
  if (dayNumber < nextDayNumber) return "available";

  return "locked";
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);

    const courseSlug = searchParams.get("course_slug") || "n4-28days";
    const previewRequested = searchParams.get("preview") === "1";

    const previewAllowed =
      process.env.NODE_ENV !== "production" ||
      process.env.ALLOW_COURSE_PREVIEW === "true";

    if (previewRequested && !previewAllowed) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Preview mode is not allowed. Set ALLOW_COURSE_PREVIEW=true if you need draft preview.",
        },
        { status: 403 }
      );
    }

    const studentAccountId = await getStudentAccountId({
      supabase,
      request,
    });

    let courseQuery = supabase
      .from("courses")
      .select(
        `
        id,
        course_slug,
        title,
        jlpt_level,
        description,
        total_days,
        is_published
      `
      )
      .eq("course_slug", courseSlug);

    if (!previewRequested) {
      courseQuery = courseQuery.eq("is_published", true);
    }

    const { data: courseRaw, error: courseError } =
      await courseQuery.maybeSingle();

    if (courseError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch course.",
          detail: courseError.message,
        },
        { status: 500 }
      );
    }

    if (!courseRaw) {
      return NextResponse.json(
        {
          ok: false,
          error: "Course not found or not published.",
        },
        { status: 404 }
      );
    }

    const course = courseRaw as CourseRow;

    let daysQuery = supabase
      .from("course_days")
      .select(
        `
        id,
        day_number,
        day_title,
        day_theme,
        kanji_list,
        is_published
      `
      )
      .eq("course_id", course.id)
      .order("day_number", { ascending: true });

    if (!previewRequested) {
      daysQuery = daysQuery.eq("is_published", true);
    }

    const { data: days, error: daysError } = await daysQuery;

    if (daysError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch course days.",
          detail: daysError.message,
        },
        { status: 500 }
      );
    }

    const { data: progressRows, error: progressError } = await supabase
      .from("course_progress")
      .select(
        `
        id,
        course_id,
        course_day_id,
        day_number,
        status,
        total_questions,
        answered_count,
        correct_count,
        incorrect_count,
        accuracy,
        completed_at,
        last_answered_at
      `
      )
      .eq("student_account_id", studentAccountId)
      .eq("course_id", course.id)
      .order("day_number", { ascending: true });

    if (progressError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch course progress.",
          detail: progressError.message,
        },
        { status: 500 }
      );
    }

    const progressByDay = new Map<number, CourseProgressRow>();

    for (const row of (progressRows ?? []) as CourseProgressRow[]) {
      progressByDay.set(row.day_number, row);
    }

    const normalizedDays = ((days ?? []) as CourseDayRow[]).map((day) => {
      const progress = progressByDay.get(day.day_number);

      return {
        id: day.id,
        day_number: day.day_number,
        day_title: day.day_title,
        day_theme: day.day_theme,
        kanji_list: parseJsonArray(day.kanji_list),
        is_published: day.is_published,
        progress: {
          status: normalizeStatus(progress?.status),
          total_questions: progress?.total_questions ?? 0,
          answered_count: progress?.answered_count ?? 0,
          correct_count: progress?.correct_count ?? 0,
          incorrect_count: progress?.incorrect_count ?? 0,
          accuracy: progress?.accuracy ?? 0,
          completed_at: progress?.completed_at ?? null,
          last_answered_at: progress?.last_answered_at ?? null,
        },
      };
    });

    const completedDays = normalizedDays.filter(
      (day) => day.progress.status === "completed"
    ).length;

    const reviewNeededDays = normalizedDays.filter(
      (day) => day.progress.status === "review_needed"
    ).length;

    const inProgressDay = normalizedDays.find(
      (day) => day.progress.status === "in_progress"
    );

    const firstNotCompletedDay = normalizedDays.find(
      (day) =>
        day.progress.status !== "completed" &&
        day.progress.status !== "review_needed"
    );

    const nextDayNumber =
      inProgressDay?.day_number ??
      firstNotCompletedDay?.day_number ??
      normalizedDays[normalizedDays.length - 1]?.day_number ??
      1;

    const daysWithState = normalizedDays.map((day) => ({
      ...day,
      state: getDayState({
        dayNumber: day.day_number,
        status: day.progress.status,
        nextDayNumber,
      }),
    }));

    const totalAnswered = daysWithState.reduce(
      (sum, day) => sum + day.progress.answered_count,
      0
    );

    const totalCorrect = daysWithState.reduce(
      (sum, day) => sum + day.progress.correct_count,
      0
    );

    const totalIncorrect = daysWithState.reduce(
      (sum, day) => sum + day.progress.incorrect_count,
      0
    );

    const overallAccuracy =
      totalAnswered === 0
        ? 0
        : Math.round((totalCorrect / totalAnswered) * 10000) / 100;

    const totalDays =
      typeof course.total_days === "number" && course.total_days > 0
        ? course.total_days
        : daysWithState.length;

    return NextResponse.json({
      ok: true,
      preview: previewRequested,
      student_account_id: studentAccountId,
      course: {
        id: course.id,
        course_slug: course.course_slug,
        title: course.title,
        jlpt_level: course.jlpt_level,
        description: course.description,
        total_days: totalDays,
        is_published: course.is_published,
      },
      summary: {
        total_days: totalDays,
        loaded_days: daysWithState.length,
        completed_days: completedDays,
        review_needed_days: reviewNeededDays,
        next_day_number: nextDayNumber,
        total_answered: totalAnswered,
        total_correct: totalCorrect,
        total_incorrect: totalIncorrect,
        overall_accuracy: overallAccuracy,
        completion_rate:
          totalDays === 0
            ? 0
            : Math.round((completedDays / totalDays) * 10000) / 100,
      },
      days: daysWithState,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";

    const status =
      message.includes("session") || message.includes("Student") ? 401 : 500;

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status }
    );
  }
}