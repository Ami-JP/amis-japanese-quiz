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

type CourseDayRow = {
  id: string;
  day_number: number;
  day_title: string;
  day_theme: string | null;
  kanji_list: string[] | null;
  is_published: boolean;
};

type CourseProgressRow = {
  day_number: number;
  status: string;
  total_questions: number;
  answered_count: number;
  correct_count: number;
  incorrect_count: number;
  accuracy: number | null;
  completed_at: string | null;
  last_answered_at: string | null;
};

type CourseQuestionForCount = {
  day_number: number;
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

async function assertCourseEnrollment(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  studentAccountId: string;
  courseId: string;
}) {
  const { supabase, studentAccountId, courseId } = params;

  const { data: enrollment, error } = await supabase
    .from("course_enrollments")
    .select("id, status")
    .eq("student_account_id", studentAccountId)
    .eq("course_id", courseId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to verify course enrollment: ${error.message}`);
  }

  if (!enrollment) {
    throw new Error("You are not enrolled in this course.");
  }
}

function countQuestionsByDay(questions: CourseQuestionForCount[]) {
  const map = new Map<number, number>();

  for (const question of questions) {
    map.set(question.day_number, (map.get(question.day_number) ?? 0) + 1);
  }

  return map;
}

function buildProgressMap(progressRows: CourseProgressRow[]) {
  return new Map(progressRows.map((progress) => [progress.day_number, progress]));
}

function decideDayState(params: {
  day: CourseDayRow;
  questionCount: number;
  progress: CourseProgressRow | null;
  firstPlayableDay: number | null;
}) {
  const { day, questionCount, progress, firstPlayableDay } = params;

  if (questionCount <= 0) {
    return "coming_soon";
  }

  if (progress?.status === "completed" || status === "review_needed") {
    return "completed";
  }

  if (progress?.status === "review_needed") {
    return "review_needed";
  }

  if (progress?.status === "in_progress") {
    return "in_progress";
  }

  if (firstPlayableDay === day.day_number) {
    return "current";
  }

  return "available";
}

function calculateOverallAccuracy(progressRows: CourseProgressRow[]) {
  const answeredCount = progressRows.reduce((sum, progress) => {
    return sum + Math.max(0, progress.answered_count ?? 0);
  }, 0);

  const correctCount = progressRows.reduce((sum, progress) => {
    return sum + Math.max(0, progress.correct_count ?? 0);
  }, 0);

  const accuracy =
    answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

  return {
    answered_count: answeredCount,
    correct_count: correctCount,
    overall_accuracy: accuracy,
  };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const courseSlug = searchParams.get("course_slug")?.trim() || "";

    if (!courseSlug) {
      return NextResponse.json(
        {
          ok: false,
          error: "course_slug is required.",
        },
        { status: 400 }
      );
    }

    const studentAccountId = await getStudentAccountId({
      supabase,
      request,
    });

    const { data: course, error: courseError } = await supabase
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
      .eq("course_slug", courseSlug)
      .maybeSingle();

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

    if (!course) {
      return NextResponse.json(
        {
          ok: false,
          error: "Course not found.",
        },
        { status: 404 }
      );
    }

    const typedCourse = course as CourseRow;

    await assertCourseEnrollment({
      supabase,
      studentAccountId,
      courseId: typedCourse.id,
    });

    const { data: daysRaw, error: daysError } = await supabase
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
      .eq("course_id", typedCourse.id)
      .order("day_number", { ascending: true });

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

    const days = (daysRaw ?? []) as CourseDayRow[];

    const { data: questionsRaw, error: questionsError } = await supabase
      .from("course_questions")
      .select("day_number")
      .eq("course_id", typedCourse.id)
      .eq("status", "ready")
      .eq("is_published", true);

    if (questionsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch question counts.",
          detail: questionsError.message,
        },
        { status: 500 }
      );
    }

    const questionCountMap = countQuestionsByDay(
      (questionsRaw ?? []) as CourseQuestionForCount[]
    );

    const { data: progressRaw, error: progressError } = await supabase
      .from("course_progress")
      .select(
        `
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
      .eq("course_id", typedCourse.id)
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

    const progressRows = (progressRaw ?? []) as CourseProgressRow[];
    const progressMap = buildProgressMap(progressRows);

    const firstPlayableDay =
      days.find((day) => {
        const count = questionCountMap.get(day.day_number) ?? 0;
        const progress = progressMap.get(day.day_number) ?? null;

        return count > 0 && progress?.status !== "completed";
      })?.day_number ?? null;

    const decoratedDays = days.map((day) => {
      const questionCount = questionCountMap.get(day.day_number) ?? 0;
      const progress = progressMap.get(day.day_number) ?? null;

      return {
        ...day,
        question_count: questionCount,
        progress,
        state: decideDayState({
          day,
          questionCount,
          progress,
          firstPlayableDay,
        }),
      };
    });

    const totalDays = typedCourse.total_days || decoratedDays.length || 30;

    const completedDays = decoratedDays.filter(
      (day) => day.state === "completed"
    ).length;

    const reviewNeededDays = decoratedDays.filter(
      (day) => day.state === "review_needed"
    ).length;

    const playableDays = decoratedDays.filter(
      (day) => day.question_count > 0
    ).length;

    const progressPercent =
      totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;

    const accuracySummary = calculateOverallAccuracy(progressRows);

    return NextResponse.json({
      ok: true,
      course: typedCourse,
      summary: {
        total_days: totalDays,
        loaded_days: decoratedDays.length,
        playable_days: playableDays,
        completed_days: completedDays,
        review_needed_days: reviewNeededDays,
        progress_percent: progressPercent,
        overall_accuracy: accuracySummary.overall_accuracy,
        overall_answered_count: accuracySummary.answered_count,
        overall_correct_count: accuracySummary.correct_count,
      },
      days: decoratedDays,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";

    const status =
      message.includes("session") ||
      message.includes("Student") ||
      message.includes("not enrolled")
        ? 401
        : 500;

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status }
    );
  }
}