import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REVIEW_QUESTION_LIMIT = 5;

type CourseRow = {
  id: string;
  course_slug: string;
  title: string;
  jlpt_level: string | null;
  description: string | null;
  total_days: number;
  is_published: boolean;
};

type CourseQuestionRow = {
  id: string;
  course_id: string;
  course_day_id: string;
  day_number: number;
  question_order: number;
  section: string;
  quiz_type: string;
  target_text: string;
  answer_text: string;
  prompt: string;
  completed_sentence: string | null;
  translation_en: string | null;
  choices_json: unknown;
  ruby_annotations: unknown;
  source_kanji: string | null;
  source_vocab_level: string | null;
  meaning_ja: string | null;
  meaning_en: string | null;
  explanation_ja: string | null;
  explanation_en: string | null;
  reading_source: string | null;
  example_sentence_quality: string | null;
  status: string;
  is_published: boolean;
  notes: string | null;
};

type CourseAttemptRow = {
  course_question_id: string;
  is_correct: boolean;
  answered_at: string;
};

type CourseReviewAttemptRow = {
  course_question_id: string;
  is_correct: boolean;
  answered_at: string;
};

type StudentSessionResult = {
  student_account_id: string;
  expires_at?: string | null;
};

type StudentAccountRow = {
  id: string;
  is_active: boolean;
};

type KanjiHintRow = {
  kanji: string;
  onyomi_ja: string | null;
  kunyomi_ja: string | null;
  meaning_ja: string | null;
  onyomi_en: string | null;
  kunyomi_en: string | null;
  meaning_en: string | null;
  example_words_ja: string | null;
  example_words_en: string | null;
};

type SelectionReason =
  | "missed_multiple"
  | "missed_once"
  | "not_reviewed_yet"
  | "not_recently_seen"
  | "supplemental";

type NormalAttemptSummary = {
  normal_attempt_count: number;
  normal_wrong_count: number;
  normal_correct_count: number;
  last_normal_attempted_at: string | null;
  last_wrong_at: string | null;
  normal_attempts_last_2_days: number;
};

type ReviewAttemptSummary = {
  review_attempt_count: number;
  review_wrong_count: number;
  review_correct_count: number;
  last_reviewed_at: string | null;
  reviewed_today_count: number;
  reviewed_yesterday_count: number;
  review_attempts_last_7_days: number;
  review_correct_last_7_days: number;
};

type ScoredQuestion = CourseQuestionRow & {
  normal_attempt_count: number;
  normal_wrong_count: number;
  normal_correct_count: number;
  last_normal_attempted_at: string | null;
  last_wrong_at: string | null;
  normal_attempts_last_2_days: number;

  review_attempt_count: number;
  review_wrong_count: number;
  review_correct_count: number;
  last_reviewed_at: string | null;
  reviewed_today_count: number;
  reviewed_yesterday_count: number;
  review_attempts_last_7_days: number;
  review_correct_last_7_days: number;

  selection_reason: SelectionReason;
  priority_score: number;
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

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return [];
}

function isMeaningQuestion(question: CourseQuestionRow) {
  return (
    question.section === "kanji_meaning" ||
    question.quiz_type === "kanji_meaning"
  );
}

function getStartOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function isWithinDays(dateText: string | null, days: number) {
  if (!dateText) return false;

  const time = new Date(dateText).getTime();

  if (Number.isNaN(time)) return false;

  return time >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function isBeforeDays(dateText: string | null, days: number) {
  if (!dateText) return true;

  const time = new Date(dateText).getTime();

  if (Number.isNaN(time)) return true;

  return time < Date.now() - days * 24 * 60 * 60 * 1000;
}

function isToday(dateText: string | null) {
  if (!dateText) return false;

  const time = new Date(dateText).getTime();

  if (Number.isNaN(time)) return false;

  return time >= getStartOfToday().getTime();
}

function isYesterday(dateText: string | null) {
  if (!dateText) return false;

  const time = new Date(dateText).getTime();

  if (Number.isNaN(time)) return false;

  const todayStart = getStartOfToday().getTime();
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;

  return time >= yesterdayStart && time < todayStart;
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

  const { data: student, error: studentError } = await supabase
    .from("student_accounts")
    .select("id, is_active")
    .eq("id", typedSession.student_account_id)
    .maybeSingle();

  if (studentError) {
    throw new Error(`Failed to verify student account: ${studentError.message}`);
  }

  const typedStudent = student as StudentAccountRow | null;

  if (!typedStudent?.id || !typedStudent.is_active) {
    throw new Error("Student account is not active.");
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

function buildNormalAttemptSummary(attempts: CourseAttemptRow[]) {
  const map = new Map<string, NormalAttemptSummary>();

  for (const attempt of attempts) {
    const current =
      map.get(attempt.course_question_id) ??
      ({
        normal_attempt_count: 0,
        normal_wrong_count: 0,
        normal_correct_count: 0,
        last_normal_attempted_at: null,
        last_wrong_at: null,
        normal_attempts_last_2_days: 0,
      } satisfies NormalAttemptSummary);

    current.normal_attempt_count += 1;

    if (attempt.is_correct) {
      current.normal_correct_count += 1;
    } else {
      current.normal_wrong_count += 1;
      if (
        !current.last_wrong_at ||
        new Date(attempt.answered_at).getTime() >
          new Date(current.last_wrong_at).getTime()
      ) {
        current.last_wrong_at = attempt.answered_at;
      }
    }

    if (
      !current.last_normal_attempted_at ||
      new Date(attempt.answered_at).getTime() >
        new Date(current.last_normal_attempted_at).getTime()
    ) {
      current.last_normal_attempted_at = attempt.answered_at;
    }

    if (isWithinDays(attempt.answered_at, 2)) {
      current.normal_attempts_last_2_days += 1;
    }

    map.set(attempt.course_question_id, current);
  }

  return map;
}

function buildReviewAttemptSummary(attempts: CourseReviewAttemptRow[]) {
  const map = new Map<string, ReviewAttemptSummary>();

  for (const attempt of attempts) {
    const current =
      map.get(attempt.course_question_id) ??
      ({
        review_attempt_count: 0,
        review_wrong_count: 0,
        review_correct_count: 0,
        last_reviewed_at: null,
        reviewed_today_count: 0,
        reviewed_yesterday_count: 0,
        review_attempts_last_7_days: 0,
        review_correct_last_7_days: 0,
      } satisfies ReviewAttemptSummary);

    current.review_attempt_count += 1;

    if (attempt.is_correct) {
      current.review_correct_count += 1;
    } else {
      current.review_wrong_count += 1;
    }

    if (
      !current.last_reviewed_at ||
      new Date(attempt.answered_at).getTime() >
        new Date(current.last_reviewed_at).getTime()
    ) {
      current.last_reviewed_at = attempt.answered_at;
    }

    if (isToday(attempt.answered_at)) {
      current.reviewed_today_count += 1;
    }

    if (isYesterday(attempt.answered_at)) {
      current.reviewed_yesterday_count += 1;
    }

    if (isWithinDays(attempt.answered_at, 7)) {
      current.review_attempts_last_7_days += 1;

      if (attempt.is_correct) {
        current.review_correct_last_7_days += 1;
      }
    }

    map.set(attempt.course_question_id, current);
  }

  return map;
}

function getSelectionReason(params: {
  normal: NormalAttemptSummary | undefined;
  review: ReviewAttemptSummary | undefined;
}): SelectionReason {
  const { normal, review } = params;

  const wrongCount = normal?.normal_wrong_count ?? 0;
  const reviewCount = review?.review_attempt_count ?? 0;
  const lastNormalAttemptedAt = normal?.last_normal_attempted_at ?? null;

  if (wrongCount >= 2) return "missed_multiple";
  if (wrongCount === 1) return "missed_once";
  if (reviewCount === 0) return "not_reviewed_yet";

  if (!lastNormalAttemptedAt || isBeforeDays(lastNormalAttemptedAt, 7)) {
    return "not_recently_seen";
  }

  return "supplemental";
}

function scoreQuestion(params: {
  normal: NormalAttemptSummary | undefined;
  review: ReviewAttemptSummary | undefined;
}) {
  const { normal, review } = params;

  const normalAttemptCount = normal?.normal_attempt_count ?? 0;
  const normalWrongCount = normal?.normal_wrong_count ?? 0;
  const normalAttemptsLast2Days = normal?.normal_attempts_last_2_days ?? 0;

  const reviewAttemptCount = review?.review_attempt_count ?? 0;
  const reviewedTodayCount = review?.reviewed_today_count ?? 0;
  const reviewedYesterdayCount = review?.reviewed_yesterday_count ?? 0;
  const reviewAttemptsLast7Days = review?.review_attempts_last_7_days ?? 0;
  const reviewCorrectLast7Days = review?.review_correct_last_7_days ?? 0;
  const lastReviewedAt = review?.last_reviewed_at ?? null;

  let score = 0;

  if (normalWrongCount >= 2) {
    score += 120;
  } else if (normalWrongCount === 1) {
    score += 90;
  }

  score += Math.min(normalWrongCount, 5) * 10;

  if (reviewAttemptCount === 0) {
    score += 30;
  }

  if (!lastReviewedAt) {
    score += 20;
  } else if (isBeforeDays(lastReviewedAt, 7)) {
    score += 20;
  } else if (isBeforeDays(lastReviewedAt, 3)) {
    score += 10;
  }

  if (normalAttemptCount > 0) {
    score += 8;
  }

  if (normalAttemptsLast2Days > 0) {
    score -= 35;
  }

  if (reviewedTodayCount > 0) {
    score -= 80;
  }

  if (reviewedYesterdayCount > 0) {
    score -= 40;
  }

  if (reviewCorrectLast7Days > 0) {
    score -= 30;
  }

  score -= Math.min(reviewAttemptsLast7Days, 5) * 8;

  score += Math.random() * 15;

  return score;
}

function decorateQuestions(params: {
  questions: ScoredQuestion[];
  hintMap: Map<string, KanjiHintRow>;
  reviewSessionId: string;
}) {
  const { questions, hintMap, reviewSessionId } = params;

  return questions.map((question, index) => {
    const kanjiHint = isMeaningQuestion(question)
      ? hintMap.get(question.target_text) ?? null
      : null;

    return {
      id: question.id,
      course_id: question.course_id,
      course_day_id: question.course_day_id,
      day_number: question.day_number,
      question_order: question.question_order,
      section: question.section,
      quiz_type: question.quiz_type,
      target_text: question.target_text,
      answer_text: question.answer_text,
      prompt: question.prompt,
      completed_sentence: question.completed_sentence,
      translation_en: question.translation_en,
      choices_json: toArray(question.choices_json),
      ruby_annotations: toArray(question.ruby_annotations),
      source_kanji: question.source_kanji,
      source_vocab_level: question.source_vocab_level,
      meaning_ja: question.meaning_ja,
      meaning_en: question.meaning_en,
      explanation_ja: question.explanation_ja,
      explanation_en: question.explanation_en,
      reading_source: question.reading_source,
      example_sentence_quality: question.example_sentence_quality,
      status: question.status,
      is_published: question.is_published,
      notes: question.notes,
      kanji_hint: kanjiHint,

      review_session_id: reviewSessionId,
      review_order: index + 1,
      selection_reason: question.selection_reason,
      priority_score: Number(question.priority_score.toFixed(2)),
    };
  });
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

    const { data: courseRaw, error: courseError } = await supabase
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
      .eq("is_published", true)
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
          error: "Course not found or not published.",
        },
        { status: 404 }
      );
    }

    const course = courseRaw as CourseRow;

    await assertCourseEnrollment({
      supabase,
      studentAccountId,
      courseId: course.id,
    });

    const { data: questionsRaw, error: questionsError } = await supabase
      .from("course_questions")
      .select(
        `
        id,
        course_id,
        course_day_id,
        day_number,
        question_order,
        section,
        quiz_type,
        target_text,
        answer_text,
        prompt,
        completed_sentence,
        translation_en,
        choices_json,
        ruby_annotations,
        source_kanji,
        source_vocab_level,
        meaning_ja,
        meaning_en,
        explanation_ja,
        explanation_en,
        reading_source,
        example_sentence_quality,
        status,
        is_published,
        notes
      `
      )
      .eq("course_id", course.id)
      .eq("status", "ready")
      .eq("is_published", true)
      .order("day_number", { ascending: true })
      .order("question_order", { ascending: true })
      .limit(1000);

    if (questionsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch review question candidates.",
          detail: questionsError.message,
        },
        { status: 500 }
      );
    }

    const questions = (questionsRaw ?? []) as CourseQuestionRow[];

    if (questions.length === 0) {
      return NextResponse.json({
        ok: true,
        course,
        review_session_id: randomUUID(),
        counts: {
          requested: REVIEW_QUESTION_LIMIT,
          returned: 0,
          total_candidates: 0,
        },
        questions: [],
      });
    }

    const { data: normalAttemptsRaw, error: normalAttemptsError } = await supabase
      .from("course_attempts")
      .select("course_question_id, is_correct, answered_at")
      .eq("student_account_id", studentAccountId)
      .eq("course_id", course.id)
      .order("answered_at", { ascending: true })
      .limit(10000);

    if (normalAttemptsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch course attempts.",
          detail: normalAttemptsError.message,
        },
        { status: 500 }
      );
    }

    const { data: reviewAttemptsRaw, error: reviewAttemptsError } = await supabase
      .from("course_review_attempts")
      .select("course_question_id, is_correct, answered_at")
      .eq("student_account_id", studentAccountId)
      .eq("course_id", course.id)
      .order("answered_at", { ascending: true })
      .limit(10000);

    if (reviewAttemptsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch review attempts.",
          detail: reviewAttemptsError.message,
        },
        { status: 500 }
      );
    }

    const normalSummaryMap = buildNormalAttemptSummary(
      (normalAttemptsRaw ?? []) as CourseAttemptRow[]
    );

    const reviewSummaryMap = buildReviewAttemptSummary(
      (reviewAttemptsRaw ?? []) as CourseReviewAttemptRow[]
    );

   const scoredQuestions: ScoredQuestion[] = questions
  .map<ScoredQuestion>((question) => {
        const normal = normalSummaryMap.get(question.id);
        const review = reviewSummaryMap.get(question.id);

        return {
          ...question,

          normal_attempt_count: normal?.normal_attempt_count ?? 0,
          normal_wrong_count: normal?.normal_wrong_count ?? 0,
          normal_correct_count: normal?.normal_correct_count ?? 0,
          last_normal_attempted_at: normal?.last_normal_attempted_at ?? null,
          last_wrong_at: normal?.last_wrong_at ?? null,
          normal_attempts_last_2_days:
            normal?.normal_attempts_last_2_days ?? 0,

          review_attempt_count: review?.review_attempt_count ?? 0,
          review_wrong_count: review?.review_wrong_count ?? 0,
          review_correct_count: review?.review_correct_count ?? 0,
          last_reviewed_at: review?.last_reviewed_at ?? null,
          reviewed_today_count: review?.reviewed_today_count ?? 0,
          reviewed_yesterday_count: review?.reviewed_yesterday_count ?? 0,
          review_attempts_last_7_days: review?.review_attempts_last_7_days ?? 0,
          review_correct_last_7_days:
            review?.review_correct_last_7_days ?? 0,

          selection_reason: getSelectionReason({
            normal,
            review,
          }),
          priority_score: scoreQuestion({
            normal,
            review,
          }),
        };
      })
      .sort((a, b) => b.priority_score - a.priority_score)
      .slice(0, REVIEW_QUESTION_LIMIT);

    const meaningKanjiList = Array.from(
      new Set(
        scoredQuestions
          .filter(isMeaningQuestion)
          .map((question) => question.target_text)
          .filter(Boolean)
      )
    );

    let hintMap = new Map<string, KanjiHintRow>();

    if (meaningKanjiList.length > 0) {
      const { data: hints, error: hintsError } = await supabase
        .from("kanji_hints")
        .select(
          `
          kanji,
          onyomi_ja,
          kunyomi_ja,
          meaning_ja,
          onyomi_en,
          kunyomi_en,
          meaning_en,
          example_words_ja,
          example_words_en
        `
        )
        .in("kanji", meaningKanjiList);

      if (hintsError) {
        return NextResponse.json(
          {
            ok: false,
            error: "Failed to fetch kanji hints.",
            detail: hintsError.message,
          },
          { status: 500 }
        );
      }

      hintMap = new Map(
        ((hints ?? []) as KanjiHintRow[]).map((hint) => [hint.kanji, hint])
      );
    }

    const reviewSessionId = randomUUID();

    const decoratedQuestions = decorateQuestions({
      questions: scoredQuestions,
      hintMap,
      reviewSessionId,
    });

    const counts = {
      requested: REVIEW_QUESTION_LIMIT,
      returned: decoratedQuestions.length,
      total_candidates: questions.length,
      missed_multiple: scoredQuestions.filter(
        (question) => question.selection_reason === "missed_multiple"
      ).length,
      missed_once: scoredQuestions.filter(
        (question) => question.selection_reason === "missed_once"
      ).length,
      not_reviewed_yet: scoredQuestions.filter(
        (question) => question.selection_reason === "not_reviewed_yet"
      ).length,
      not_recently_seen: scoredQuestions.filter(
        (question) => question.selection_reason === "not_recently_seen"
      ).length,
      supplemental: scoredQuestions.filter(
        (question) => question.selection_reason === "supplemental"
      ).length,
    };

    return NextResponse.json({
      ok: true,
      course,
      review_session_id: reviewSessionId,
      counts,
      questions: decoratedQuestions,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";

    const status =
      message.includes("session") ||
      message.includes("Student") ||
      message.includes("not enrolled") ||
      message.includes("not active")
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