import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CourseRow = {
  id: string;
  course_slug: string;
  title: string;
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
  explanation_ja: string | null;
  explanation_en: string | null;
  status: string;
  is_published: boolean;
};

type CourseAttemptRow = {
  course_question_id: string;
  is_correct: boolean;
  answered_at: string;
};

type CourseAttemptStatusRow = {
  course_question_id: string;
  question_order: number;
  is_correct: boolean;
  answered_at: string;
};

type StudentSessionResult = {
  student_account_id: string;
  expires_at?: string | null;
};

type KanjiHintRow = {
  kanji: string;
  onyomi_ja: string | null;
  kunyomi_ja: string | null;
  meaning_ja: string | null;
  meaning_en: string | null;
  example_words_ja: string | null;
  example_words_en: string | null;
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

function isMeaningQuestion(question: CourseQuestionRow) {
  return (
    question.section === "kanji_meaning" ||
    question.quiz_type === "kanji_meaning"
  );
}

function isReadingQuestion(question: CourseQuestionRow) {
  if (isMeaningQuestion(question)) return false;

  return (
    question.section === "kanji_reading" ||
    question.section === "vocab_reading" ||
    question.quiz_type === "kanji_reading" ||
    question.quiz_type === "vocab_reading" ||
    question.section.includes("reading") ||
    question.quiz_type.includes("reading")
  );
}

function katakanaToHiragana(value: string) {
  return value.replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
}

function normalizeAnswer(value: string) {
  return katakanaToHiragana(
    value
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[　]/g, "")
      .replace(/[。、，,.!！?？]/g, "")
  );
}

function splitCorrectAnswers(correctAnswer: string) {
  return correctAnswer
    .split(/[／/,，、\n\r;；|｜]+/g)
    .map((answer) => answer.trim())
    .filter(Boolean);
}

function getCorrectAnswerCandidates(correctAnswer: string) {
  const candidates = [correctAnswer.trim(), ...splitCorrectAnswers(correctAnswer)];

  const uniqueCandidates: string[] = [];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const normalizedCandidate = normalizeAnswer(candidate);

    const alreadyExists = uniqueCandidates.some(
      (existing) => normalizeAnswer(existing) === normalizedCandidate
    );

    if (!alreadyExists) {
      uniqueCandidates.push(candidate);
    }
  }

  return uniqueCandidates;
}

function hasKana(value: string) {
  return /[\u3040-\u30ff]/.test(value);
}

function hasLatin(value: string) {
  return /[A-Za-zāīūēōĀĪŪĒŌ]/.test(value);
}

function isLikelyRomaji(value: string) {
  const normalized = value.normalize("NFKC").trim();

  if (!normalized) return false;
  if (hasKana(normalized)) return false;

  return hasLatin(normalized);
}

function normalizeRomaji(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[āĀ]/g, "a")
    .replace(/[īĪ]/g, "i")
    .replace(/[ūŪ]/g, "u")
    .replace(/[ēĒ]/g, "e")
    .replace(/[ōŌ]/g, "o")
    .replace(/[^a-z]/g, "");
}

const basicRomajiMap: Record<string, string[]> = {
  あ: ["a"],
  い: ["i"],
  う: ["u"],
  え: ["e"],
  お: ["o"],

  か: ["ka"],
  き: ["ki"],
  く: ["ku"],
  け: ["ke"],
  こ: ["ko"],

  さ: ["sa"],
  し: ["shi", "si"],
  す: ["su"],
  せ: ["se"],
  そ: ["so"],

  た: ["ta"],
  ち: ["chi", "ti"],
  つ: ["tsu", "tu"],
  て: ["te"],
  と: ["to"],

  な: ["na"],
  に: ["ni"],
  ぬ: ["nu"],
  ね: ["ne"],
  の: ["no"],

  は: ["ha"],
  ひ: ["hi"],
  ふ: ["fu", "hu"],
  へ: ["he"],
  ほ: ["ho"],

  ま: ["ma"],
  み: ["mi"],
  む: ["mu"],
  め: ["me"],
  も: ["mo"],

  や: ["ya"],
  ゆ: ["yu"],
  よ: ["yo"],

  ら: ["ra"],
  り: ["ri"],
  る: ["ru"],
  れ: ["re"],
  ろ: ["ro"],

  わ: ["wa"],
  を: ["o", "wo"],
  ん: ["n"],

  が: ["ga"],
  ぎ: ["gi"],
  ぐ: ["gu"],
  げ: ["ge"],
  ご: ["go"],

  ざ: ["za"],
  じ: ["ji", "zi"],
  ず: ["zu"],
  ぜ: ["ze"],
  ぞ: ["zo"],

  だ: ["da"],
  ぢ: ["ji", "di"],
  づ: ["zu", "du"],
  で: ["de"],
  ど: ["do"],

  ば: ["ba"],
  び: ["bi"],
  ぶ: ["bu"],
  べ: ["be"],
  ぼ: ["bo"],

  ぱ: ["pa"],
  ぴ: ["pi"],
  ぷ: ["pu"],
  ぺ: ["pe"],
  ぽ: ["po"],

  ぁ: ["a"],
  ぃ: ["i"],
  ぅ: ["u"],
  ぇ: ["e"],
  ぉ: ["o"],
};

const digraphRomajiMap: Record<string, string[]> = {
  きゃ: ["kya"],
  きゅ: ["kyu"],
  きょ: ["kyo"],

  しゃ: ["sha", "sya"],
  しゅ: ["shu", "syu"],
  しょ: ["sho", "syo"],

  ちゃ: ["cha", "tya", "cya"],
  ちゅ: ["chu", "tyu", "cyu"],
  ちょ: ["cho", "tyo", "cyo"],

  にゃ: ["nya"],
  にゅ: ["nyu"],
  にょ: ["nyo"],

  ひゃ: ["hya"],
  ひゅ: ["hyu"],
  ひょ: ["hyo"],

  みゃ: ["mya"],
  みゅ: ["myu"],
  みょ: ["myo"],

  りゃ: ["rya"],
  りゅ: ["ryu"],
  りょ: ["ryo"],

  ぎゃ: ["gya"],
  ぎゅ: ["gyu"],
  ぎょ: ["gyo"],

  じゃ: ["ja", "jya", "zya"],
  じゅ: ["ju", "jyu", "zyu"],
  じょ: ["jo", "jyo", "zyo"],

  ぢゃ: ["ja", "dya"],
  ぢゅ: ["ju", "dyu"],
  ぢょ: ["jo", "dyo"],

  びゃ: ["bya"],
  びゅ: ["byu"],
  びょ: ["byo"],

  ぴゃ: ["pya"],
  ぴゅ: ["pyu"],
  ぴょ: ["pyo"],
};

function getSyllableOptions(value: string, index: number) {
  const twoChars = value.slice(index, index + 2);

  if (digraphRomajiMap[twoChars]) {
    return {
      options: digraphRomajiMap[twoChars],
      nextIndex: index + 2,
    };
  }

  const oneChar = value[index];

  return {
    options: basicRomajiMap[oneChar] ?? [oneChar],
    nextIndex: index + 1,
  };
}

function getFirstConsonant(value: string) {
  const first = value[0];

  if (!first) return "";
  if ("aeiou".includes(first)) return "";
  if (first === "n") return "n";

  return first;
}

function combineOptionSets(optionSets: string[][]) {
  let results = [""];

  for (const options of optionSets) {
    const nextResults: string[] = [];

    for (const current of results) {
      for (const option of options) {
        nextResults.push(current + option);
      }
    }

    results = Array.from(new Set(nextResults));

    if (results.length > 256) {
      results = results.slice(0, 256);
    }
  }

  return results;
}

function addLongVowelVariants(candidate: string) {
  const normalized = normalizeRomaji(candidate);
  const variants = new Set<string>();

  variants.add(normalized);

  variants.add(normalized.replace(/ou/g, "o"));
  variants.add(normalized.replace(/oo/g, "o"));
  variants.add(normalized.replace(/uu/g, "u"));
  variants.add(normalized.replace(/aa/g, "a"));
  variants.add(normalized.replace(/ii/g, "i"));
  variants.add(normalized.replace(/ee/g, "e"));
  variants.add(normalized.replace(/ei/g, "e"));

  variants.add(
    normalized
      .replace(/aa/g, "a")
      .replace(/ii/g, "i")
      .replace(/uu/g, "u")
      .replace(/ee/g, "e")
      .replace(/oo/g, "o")
  );

  variants.add(
    normalized
      .replace(/ou/g, "o")
      .replace(/ei/g, "e")
      .replace(/aa/g, "a")
      .replace(/ii/g, "i")
      .replace(/uu/g, "u")
      .replace(/ee/g, "e")
      .replace(/oo/g, "o")
  );

  return Array.from(variants).filter(Boolean);
}

function hiraganaToRomajiCandidates(value: string) {
  const hira = normalizeAnswer(value);

  if (!hira || !hasKana(hira)) {
    return [];
  }

  const optionSets: string[][] = [];
  let index = 0;

  while (index < hira.length) {
    const char = hira[index];

    if (char === "っ") {
      const next = getSyllableOptions(hira, index + 1);
      const doubledOptions = next.options
        .map((option) => getFirstConsonant(option))
        .filter(Boolean);

      optionSets.push(doubledOptions.length > 0 ? doubledOptions : [""]);
      index += 1;
      continue;
    }

    if (char === "ん") {
      const next = getSyllableOptions(hira, index + 1);
      const nextStartsWithBmp = next.options.some((option) =>
        /^[bmp]/.test(option)
      );

      optionSets.push(nextStartsWithBmp ? ["n", "m"] : ["n"]);
      index += 1;
      continue;
    }

    const syllable = getSyllableOptions(hira, index);
    optionSets.push(syllable.options);
    index = syllable.nextIndex;
  }

  const baseCandidates = combineOptionSets(optionSets);
  const allCandidates = new Set<string>();

  for (const candidate of baseCandidates) {
    for (const variant of addLongVowelVariants(candidate)) {
      allCandidates.add(variant);
    }
  }

  return Array.from(allCandidates).filter(Boolean);
}

function judgeAnswer(params: {
  userAnswer: string;
  correctAnswer: string;
  question: CourseQuestionRow;
}) {
  const { userAnswer, correctAnswer, question } = params;

  const normalizedUserAnswer = normalizeAnswer(userAnswer);

  if (!normalizedUserAnswer) return false;

  const correctAnswerCandidates = getCorrectAnswerCandidates(correctAnswer);

  if (correctAnswerCandidates.length === 0) {
    return false;
  }

  const kanaOrEnglishMatched = correctAnswerCandidates.some((answer) => {
    const normalizedCorrectAnswer = normalizeAnswer(answer);
    return normalizedUserAnswer === normalizedCorrectAnswer;
  });

  if (kanaOrEnglishMatched) {
    return true;
  }

  if (!isReadingQuestion(question)) {
    return false;
  }

  if (!isLikelyRomaji(userAnswer)) {
    return false;
  }

  const normalizedRomajiUserAnswer = normalizeRomaji(userAnswer);

  if (!normalizedRomajiUserAnswer) {
    return false;
  }

  const romajiCandidates = correctAnswerCandidates.flatMap((answer) =>
    hiraganaToRomajiCandidates(answer)
  );

  return romajiCandidates.some(
    (candidate) => normalizeRomaji(candidate) === normalizedRomajiUserAnswer
  );
}

async function getKanjiHintForMeaningQuestion(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  question: CourseQuestionRow;
}) {
  const { supabase, question } = params;

  if (!isMeaningQuestion(question)) {
    return null;
  }

  const { data, error } = await supabase
    .from("kanji_hints")
    .select(
      `
      kanji,
      onyomi_ja,
      kunyomi_ja,
      meaning_ja,
      meaning_en,
      example_words_ja,
      example_words_en
    `
    )
    .eq("kanji", question.target_text)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch kanji hint: ${error.message}`);
  }

  return (data ?? null) as KanjiHintRow | null;
}

function getCorrectAnswer(params: {
  question: CourseQuestionRow;
  kanjiHint: KanjiHintRow | null;
}) {
  const { question } = params;

  return question.answer_text;
}

function getExplanationJa(params: {
  question: CourseQuestionRow;
  correctAnswer: string;
}) {
  const { question, correctAnswer } = params;

  if (isMeaningQuestion(question)) {
    return `「${question.target_text}」は英語で「${correctAnswer}」に近い意味です。`;
  }

  return question.explanation_ja;
}

async function getAttemptNumber(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  studentAccountId: string;
  courseQuestionId: string;
}) {
  const { supabase, studentAccountId, courseQuestionId } = params;

  const { count, error } = await supabase
    .from("course_attempts")
    .select("id", { count: "exact", head: true })
    .eq("student_account_id", studentAccountId)
    .eq("course_question_id", courseQuestionId);

  if (error) {
    throw new Error(`Failed to count previous attempts: ${error.message}`);
  }

  return (count ?? 0) + 1;
}

async function getTotalQuestionsForDay(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  courseId: string;
  courseDayId: string;
  dayNumber: number;
  preview: boolean;
}) {
  const { supabase, courseId, courseDayId, dayNumber, preview } = params;

  let query = supabase
    .from("course_questions")
    .select("id", { count: "exact", head: true })
    .eq("course_id", courseId)
    .eq("course_day_id", courseDayId)
    .eq("day_number", dayNumber)
    .eq("status", "ready");

  if (!preview) {
    query = query.eq("is_published", true);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(`Failed to count day questions: ${error.message}`);
  }

  return count ?? 0;
}

async function recalculateProgress(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  studentAccountId: string;
  question: CourseQuestionRow;
  totalQuestions: number;
}) {
  const { supabase, studentAccountId, question, totalQuestions } = params;

  const { data: attempts, error: attemptsError } = await supabase
    .from("course_attempts")
    .select("course_question_id, is_correct, answered_at")
    .eq("student_account_id", studentAccountId)
    .eq("course_id", question.course_id)
    .eq("day_number", question.day_number)
    .order("answered_at", { ascending: true });

  if (attemptsError) {
    throw new Error(`Failed to fetch attempts: ${attemptsError.message}`);
  }

  const latestByQuestion = new Map<string, CourseAttemptRow>();

  for (const attempt of (attempts ?? []) as CourseAttemptRow[]) {
    latestByQuestion.set(attempt.course_question_id, attempt);
  }

  const latestAttempts = Array.from(latestByQuestion.values());

  const answeredCount = latestAttempts.length;
  const correctCount = latestAttempts.filter((attempt) => attempt.is_correct).length;
  const incorrectCount = Math.max(answeredCount - correctCount, 0);

  const status =
    answeredCount === 0
      ? "not_started"
      : totalQuestions > 0 && answeredCount >= totalQuestions
        ? incorrectCount > 0
          ? "review_needed"
          : "completed"
        : "in_progress";

  const completedAt =
    status === "completed" || status === "review_needed"
      ? new Date().toISOString()
      : null;

  const lastAnsweredAt = new Date().toISOString();

  const { data: progress, error: progressError } = await supabase
    .from("course_progress")
    .upsert(
      {
        student_account_id: studentAccountId,
        course_id: question.course_id,
        course_day_id: question.course_day_id,
        day_number: question.day_number,
        status,
        total_questions: totalQuestions,
        answered_count: answeredCount,
        correct_count: correctCount,
        incorrect_count: incorrectCount,
        completed_at: completedAt,
        last_answered_at: lastAnsweredAt,
      },
      {
        onConflict: "student_account_id,course_id,day_number",
      }
    )
    .select(
      `
      id,
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
    .maybeSingle();

  if (progressError) {
    throw new Error(`Failed to update progress: ${progressError.message}`);
  }

  return progress;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const courseSlug = searchParams.get("course_slug")?.trim() || "";
    const dayNumber = Number(searchParams.get("day") || "");
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

    if (!courseSlug) {
      return NextResponse.json(
        {
          ok: false,
          error: "course_slug is required.",
        },
        { status: 400 }
      );
    }

    if (!Number.isInteger(dayNumber) || dayNumber <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "day is required.",
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
      .select("id, course_slug, title, total_days, is_published")
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

    let questionQuery = supabase
      .from("course_questions")
      .select("id, question_order")
      .eq("course_id", typedCourse.id)
      .eq("day_number", dayNumber)
      .eq("status", "ready")
      .order("question_order", { ascending: true });

    if (!previewRequested) {
      questionQuery = questionQuery.eq("is_published", true);
    }

    const { data: questions, error: questionsError } = await questionQuery;

    if (questionsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch day questions.",
          detail: questionsError.message,
        },
        { status: 500 }
      );
    }

    const questionIds = new Set(
      ((questions ?? []) as { id: string; question_order: number }[]).map(
        (question) => question.id
      )
    );

    const { data: attemptsRaw, error: attemptsError } = await supabase
      .from("course_attempts")
      .select("course_question_id, question_order, is_correct, answered_at")
      .eq("student_account_id", studentAccountId)
      .eq("course_id", typedCourse.id)
      .eq("day_number", dayNumber)
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

    const latestByQuestion = new Map<string, CourseAttemptStatusRow>();

    for (const attempt of (attemptsRaw ?? []) as CourseAttemptStatusRow[]) {
      if (questionIds.has(attempt.course_question_id)) {
        latestByQuestion.set(attempt.course_question_id, attempt);
      }
    }

    const latestAttempts = Array.from(latestByQuestion.values()).sort(
      (a, b) => a.question_order - b.question_order
    );

    const answeredQuestionIds = latestAttempts.map(
      (attempt) => attempt.course_question_id
    );

    const missedQuestionIds = latestAttempts
      .filter((attempt) => !attempt.is_correct)
      .map((attempt) => attempt.course_question_id);

    const { data: progress, error: progressError } = await supabase
      .from("course_progress")
      .select(
        `
        id,
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
      .eq("day_number", dayNumber)
      .maybeSingle();

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

    return NextResponse.json({
      ok: true,
      answered_question_ids: answeredQuestionIds,
      missed_question_ids: missedQuestionIds,
      progress,
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

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid request body.",
        },
        { status: 400 }
      );
    }

    const courseQuestionId =
      typeof body.course_question_id === "string"
        ? body.course_question_id.trim()
        : "";

    const userAnswer =
      typeof body.user_answer === "string" ? body.user_answer.trim() : "";

    const previewRequested = body.preview === true || body.preview === "1";

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

    if (!courseQuestionId) {
      return NextResponse.json(
        {
          ok: false,
          error: "course_question_id is required.",
        },
        { status: 400 }
      );
    }

    if (!userAnswer) {
      return NextResponse.json(
        {
          ok: false,
          error: "user_answer is required.",
        },
        { status: 400 }
      );
    }

    const studentAccountId = await getStudentAccountId({
      supabase,
      request,
    });

    let questionQuery = supabase
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
        explanation_ja,
        explanation_en,
        status,
        is_published
      `
      )
      .eq("id", courseQuestionId);

    if (!previewRequested) {
      questionQuery = questionQuery.eq("is_published", true).eq("status", "ready");
    }

    const { data: question, error: questionError } = await questionQuery.maybeSingle();

    if (questionError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch course question.",
          detail: questionError.message,
        },
        { status: 500 }
      );
    }

    if (!question) {
      return NextResponse.json(
        {
          ok: false,
          error: "Course question not found or not published.",
        },
        { status: 404 }
      );
    }

    if (question.status !== "ready" && !previewRequested) {
      return NextResponse.json(
        {
          ok: false,
          error: "This question is not available.",
        },
        { status: 403 }
      );
    }

    const typedQuestion = question as CourseQuestionRow;

    await assertCourseEnrollment({
      supabase,
      studentAccountId,
      courseId: typedQuestion.course_id,
    });

    const kanjiHint = await getKanjiHintForMeaningQuestion({
      supabase,
      question: typedQuestion,
    });

    const correctAnswer = getCorrectAnswer({
      question: typedQuestion,
      kanjiHint,
    });

    const explanationJa = getExplanationJa({
      question: typedQuestion,
      correctAnswer,
    });

    const isCorrect = judgeAnswer({
      userAnswer,
      correctAnswer,
      question: typedQuestion,
    });

    const attemptNumber = await getAttemptNumber({
      supabase,
      studentAccountId,
      courseQuestionId: typedQuestion.id,
    });

    const { data: insertedAttempt, error: insertAttemptError } = await supabase
      .from("course_attempts")
      .insert({
        student_account_id: studentAccountId,
        course_id: typedQuestion.course_id,
        course_day_id: typedQuestion.course_day_id,
        course_question_id: typedQuestion.id,
        day_number: typedQuestion.day_number,
        question_order: typedQuestion.question_order,
        quiz_type: typedQuestion.quiz_type,
        target_text: typedQuestion.target_text,
        user_answer: userAnswer,
        correct_answer: correctAnswer,
        is_correct: isCorrect,
        attempt_number: attemptNumber,
      })
      .select(
        `
        id,
        course_question_id,
        user_answer,
        correct_answer,
        is_correct,
        attempt_number,
        answered_at
      `
      )
      .maybeSingle();

    if (insertAttemptError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to save course attempt.",
          detail: insertAttemptError.message,
        },
        { status: 500 }
      );
    }

    const totalQuestions = await getTotalQuestionsForDay({
      supabase,
      courseId: typedQuestion.course_id,
      courseDayId: typedQuestion.course_day_id,
      dayNumber: typedQuestion.day_number,
      preview: previewRequested,
    });

    const progress = await recalculateProgress({
      supabase,
      studentAccountId,
      question: typedQuestion,
      totalQuestions,
    });

    return NextResponse.json({
      ok: true,
      result: {
        is_correct: isCorrect,
        user_answer: userAnswer,
        correct_answer: correctAnswer,
        explanation_ja: explanationJa,
        explanation_en: typedQuestion.explanation_en,
        kanji_hint: kanjiHint,
      },
      attempt: insertedAttempt,
      progress,
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