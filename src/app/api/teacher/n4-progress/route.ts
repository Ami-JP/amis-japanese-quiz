import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyTeacherSession } from "@/lib/auth/teacher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CourseRow = {
  id: string;
  course_slug: string;
  title: string;
  total_days: number;
};

type EnrollmentRow = {
  student_account_id: string;
  status: string;
};

type StudentRow = {
  id: string;
  student_login_id: string;
  display_name: string | null;
  is_active: boolean | null;
};

type ProgressRow = {
  student_account_id: string;
  day_number: number;
  status: string;
  total_questions: number | null;
  answered_count: number | null;
  correct_count: number | null;
  incorrect_count: number | null;
  accuracy: number | null;
  completed_at: string | null;
  last_answered_at: string | null;
};

type AttemptRow = {
  student_account_id: string;
  course_question_id: string;
  day_number: number;
  question_order: number;
  target_text: string | null;
  user_answer: string | null;
  correct_answer: string | null;
  is_correct: boolean;
  answered_at: string;
};

type QuestionRow = {
  id: string;
  section: string | null;
  prompt: string | null;
  completed_sentence: string | null;
  translation_en: string | null;
  target_text: string | null;
  answer_text: string | null;
  meaning_ja: string | null;
  meaning_en: string | null;
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

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function getAccuracyPercent(correctCount: number, answeredCount: number) {
  if (answeredCount <= 0) return null;
  return Math.round((correctCount / answeredCount) * 100);
}

function buildDayAttemptTimes(attemptRows: AttemptRow[]) {
  const map = new Map<
    string,
    {
      first_answered_at: string | null;
      last_answered_at_from_attempts: string | null;
    }
  >();

  for (const attempt of attemptRows) {
    const key = `${attempt.student_account_id}:${attempt.day_number}`;
    const current = map.get(key);

    if (!current) {
      map.set(key, {
        first_answered_at: attempt.answered_at,
        last_answered_at_from_attempts: attempt.answered_at,
      });
      continue;
    }

    const currentFirst = current.first_answered_at
      ? new Date(current.first_answered_at).getTime()
      : Number.POSITIVE_INFINITY;

    const currentLast = current.last_answered_at_from_attempts
      ? new Date(current.last_answered_at_from_attempts).getTime()
      : 0;

    const attemptTime = new Date(attempt.answered_at).getTime();

    if (attemptTime < currentFirst) {
      current.first_answered_at = attempt.answered_at;
    }

    if (attemptTime > currentLast) {
      current.last_answered_at_from_attempts = attempt.answered_at;
    }
  }

  return map;
}

function buildDayRows(params: {
  totalDays: number;
  progressRows: ProgressRow[];
  studentId: string;
  dayAttemptTimes: Map<
    string,
    {
      first_answered_at: string | null;
      last_answered_at_from_attempts: string | null;
    }
  >;
}) {
  const { totalDays, progressRows, studentId, dayAttemptTimes } = params;

  const progressMap = new Map<number, ProgressRow>();

  for (const row of progressRows) {
    progressMap.set(row.day_number, row);
  }

  return Array.from({ length: totalDays }, (_, index) => {
    const dayNumber = index + 1;
    const progress = progressMap.get(dayNumber);
    const timeInfo = dayAttemptTimes.get(`${studentId}:${dayNumber}`);

    return {
      day_number: dayNumber,
      status: progress?.status ?? "not_started",
      total_questions: toNumber(progress?.total_questions),
      answered_count: toNumber(progress?.answered_count),
      correct_count: toNumber(progress?.correct_count),
      incorrect_count: toNumber(progress?.incorrect_count),
      accuracy: progress?.accuracy ?? null,
      first_answered_at: timeInfo?.first_answered_at ?? null,
      last_answered_at:
        progress?.last_answered_at ??
        timeInfo?.last_answered_at_from_attempts ??
        null,
      completed_at: progress?.completed_at ?? null,
    };
  });
}

function buildMistakeHistory(params: {
  attempts: AttemptRow[];
  questionMap: Map<string, QuestionRow>;
}) {
  const { attempts, questionMap } = params;

  const grouped = new Map<string, AttemptRow[]>();

  for (const attempt of attempts) {
    if (!attempt.course_question_id) continue;

    const key = attempt.course_question_id;
    const list = grouped.get(key) ?? [];
    list.push(attempt);
    grouped.set(key, list);
  }

  const result = [];

  for (const [, rows] of grouped) {
    const sortedRows = [...rows].sort(
      (a, b) =>
        new Date(a.answered_at).getTime() - new Date(b.answered_at).getTime()
    );

    const wrongRows = sortedRows.filter((row) => !row.is_correct);

    if (wrongRows.length === 0) continue;

    const firstWrong = wrongRows[0];
    const lastWrong = wrongRows[wrongRows.length - 1];
    const latestAttempt = sortedRows[sortedRows.length - 1];

    const question = questionMap.get(firstWrong.course_question_id);

    result.push({
      day_number: firstWrong.day_number,
      question_order: firstWrong.question_order,
      section: question?.section ?? null,
      prompt: question?.prompt ?? null,
      completed_sentence: question?.completed_sentence ?? null,
      translation_en: question?.translation_en ?? null,
      target_text: question?.target_text ?? firstWrong.target_text ?? null,
      meaning_ja: question?.meaning_ja ?? null,
      meaning_en: question?.meaning_en ?? null,
      correct_answer:
        question?.answer_text ?? firstWrong.correct_answer ?? latestAttempt.correct_answer,
      first_wrong_answer: firstWrong.user_answer,
      first_wrong_at: firstWrong.answered_at,
      last_wrong_answer: lastWrong.user_answer,
      last_wrong_at: lastWrong.answered_at,
      latest_answer: latestAttempt.user_answer,
      latest_is_correct: latestAttempt.is_correct,
      latest_answered_at: latestAttempt.answered_at,
      wrong_count: wrongRows.length,
      attempt_count: sortedRows.length,
      review_status: latestAttempt.is_correct ? "resolved" : "needs_review",
    });
  }

  return result.sort(
    (a, b) =>
      new Date(b.last_wrong_at).getTime() - new Date(a.last_wrong_at).getTime()
  );
}

export async function GET() {
  try {
    const teacherOk = await verifyTeacherSession();

    if (!teacherOk) {
      return NextResponse.json(
        {
          ok: false,
          error: "Unauthorized.",
        },
        { status: 401 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: courseRaw, error: courseError } = await supabase
      .from("courses")
      .select("id, course_slug, title, total_days")
      .eq("course_slug", "n4-28days")
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

    if (!courseRaw) {
      return NextResponse.json(
        {
          ok: false,
          error: "N4 course was not found.",
        },
        { status: 404 }
      );
    }

    const course = courseRaw as CourseRow;
    const totalDays = course.total_days || 30;

    const { data: enrollmentsRaw, error: enrollmentsError } = await supabase
      .from("course_enrollments")
      .select("student_account_id, status")
      .eq("course_id", course.id)
      .eq("status", "active");

    if (enrollmentsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch enrollments.",
          detail: enrollmentsError.message,
        },
        { status: 500 }
      );
    }

    const enrollments = (enrollmentsRaw ?? []) as EnrollmentRow[];
    const studentIds = enrollments.map((row) => row.student_account_id);

    if (studentIds.length === 0) {
      return NextResponse.json({
        ok: true,
        course,
        summary: {
          student_count: 0,
          active_student_count: 0,
          total_answered: 0,
          total_correct: 0,
          average_accuracy: null,
        },
        students: [],
      });
    }

    const { data: studentsRaw, error: studentsError } = await supabase
      .from("student_accounts")
      .select("id, student_login_id, display_name, is_active")
      .in("id", studentIds)
      .order("student_login_id", { ascending: true });

    if (studentsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch students.",
          detail: studentsError.message,
        },
        { status: 500 }
      );
    }

    const students = (studentsRaw ?? []) as StudentRow[];

    const { data: progressRaw, error: progressError } = await supabase
      .from("course_progress")
      .select(
        `
        student_account_id,
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
      .eq("course_id", course.id)
      .in("student_account_id", studentIds)
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

    const progressRows = (progressRaw ?? []) as ProgressRow[];

    const { data: attemptsRaw, error: attemptsError } = await supabase
      .from("course_attempts")
      .select(
        `
        student_account_id,
        course_question_id,
        day_number,
        question_order,
        target_text,
        user_answer,
        correct_answer,
        is_correct,
        answered_at
      `
      )
      .eq("course_id", course.id)
      .in("student_account_id", studentIds)
      .order("answered_at", { ascending: true });

    if (attemptsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch course attempts.",
          detail: attemptsError.message,
        },
        { status: 500 }
      );
    }

    const attempts = (attemptsRaw ?? []) as AttemptRow[];
    const dayAttemptTimes = buildDayAttemptTimes(attempts);

    const questionIds = Array.from(
      new Set(
        attempts
          .map((attempt) => attempt.course_question_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    const questionMap = new Map<string, QuestionRow>();

    if (questionIds.length > 0) {
      const { data: questionsRaw, error: questionsError } = await supabase
        .from("course_questions")
        .select(
          `
          id,
          section,
          prompt,
          completed_sentence,
          translation_en,
          target_text,
          answer_text,
          meaning_ja,
          meaning_en
        `
        )
        .in("id", questionIds);

      if (questionsError) {
        return NextResponse.json(
          {
            ok: false,
            error: "Failed to fetch course questions.",
            detail: questionsError.message,
          },
          { status: 500 }
        );
      }

      for (const question of (questionsRaw ?? []) as QuestionRow[]) {
        questionMap.set(question.id, question);
      }
    }

    const progressByStudent = new Map<string, ProgressRow[]>();
    const attemptsByStudent = new Map<string, AttemptRow[]>();

    for (const row of progressRows) {
      const list = progressByStudent.get(row.student_account_id) ?? [];
      list.push(row);
      progressByStudent.set(row.student_account_id, list);
    }

    for (const attempt of attempts) {
      const list = attemptsByStudent.get(attempt.student_account_id) ?? [];
      list.push(attempt);
      attemptsByStudent.set(attempt.student_account_id, list);
    }

    const decoratedStudents = students.map((student) => {
      const studentProgress = progressByStudent.get(student.id) ?? [];
      const studentAttempts = attemptsByStudent.get(student.id) ?? [];

      const days = buildDayRows({
        totalDays,
        progressRows: studentProgress,
        studentId: student.id,
        dayAttemptTimes,
      });

      const completedDays = days.filter((day) =>
        ["completed", "review_needed"].includes(day.status)
      ).length;

      const reviewNeededDays = days.filter(
        (day) => day.status === "review_needed"
      ).length;

      const inProgressDays = days.filter(
        (day) => day.status === "in_progress"
      ).length;

      const totalAnswered = days.reduce(
        (sum, day) => sum + toNumber(day.answered_count),
        0
      );

      const totalCorrect = days.reduce(
        (sum, day) => sum + toNumber(day.correct_count),
        0
      );

      const accuracyPercent = getAccuracyPercent(totalCorrect, totalAnswered);

      const lastAnsweredAt =
        days
          .map((day) => day.last_answered_at)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null;

      const mistakeHistory = buildMistakeHistory({
        attempts: studentAttempts,
        questionMap,
      });

      const unresolvedMistakeCount = mistakeHistory.filter(
        (item) => item.review_status === "needs_review"
      ).length;

      const resolvedMistakeCount = mistakeHistory.filter(
        (item) => item.review_status === "resolved"
      ).length;

      return {
        student_account_id: student.id,
        student_login_id: student.student_login_id,
        display_name: student.display_name,
        is_active: student.is_active ?? true,
        completed_days: completedDays,
        review_needed_days: reviewNeededDays,
        in_progress_days: inProgressDays,
        total_answered: totalAnswered,
        total_correct: totalCorrect,
        accuracy_percent: accuracyPercent,
        last_answered_at: lastAnsweredAt,
        days,
        mistake_history: mistakeHistory,
        unresolved_mistake_count: unresolvedMistakeCount,
        resolved_mistake_count: resolvedMistakeCount,
      };
    });

    const totalAnsweredAll = decoratedStudents.reduce(
      (sum, student) => sum + student.total_answered,
      0
    );

    const totalCorrectAll = decoratedStudents.reduce(
      (sum, student) => sum + student.total_correct,
      0
    );

    return NextResponse.json({
      ok: true,
      course,
      summary: {
        student_count: decoratedStudents.length,
        active_student_count: decoratedStudents.filter(
          (student) => student.is_active
        ).length,
        total_answered: totalAnsweredAll,
        total_correct: totalCorrectAll,
        average_accuracy: getAccuracyPercent(totalCorrectAll, totalAnsweredAll),
      },
      students: decoratedStudents,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}