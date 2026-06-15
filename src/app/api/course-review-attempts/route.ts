import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  meaning_ja: string | null;
  meaning_en: string | null;
  explanation_ja: string | null;
  explanation_en: string | null;
  status: string;
  is_published: boolean;
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

const allowedSelectionReasons = new Set<SelectionReason>([
  "missed_multiple",
  "missed_once",
  "not_reviewed_yet",
  "not_recently_seen",
  "supplemental",
]);

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

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
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
    const fullMeaningEn = question.meaning_en?.trim();
    const displayMeaning = fullMeaningEn || correctAnswer;

    return `「${question.target_text}」は英語で「${displayMeaning}」に近い意味です。`;
  }

  return question.explanation_ja;
}

function getSelectionReason(value: unknown): SelectionReason {
  if (typeof value !== "string") return "supplemental";

  if (allowedSelectionReasons.has(value as SelectionReason)) {
    return value as SelectionReason;
  }

  return "supplemental";
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

    const reviewSessionId =
      typeof body.review_session_id === "string"
        ? body.review_session_id.trim()
        : "";

    const selectionReason = getSelectionReason(body.selection_reason);

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

    if (reviewSessionId && !isValidUuid(reviewSessionId)) {
      return NextResponse.json(
        {
          ok: false,
          error: "review_session_id must be a valid UUID.",
        },
        { status: 400 }
      );
    }

    const safeReviewSessionId = reviewSessionId || randomUUID();

    const studentAccountId = await getStudentAccountId({
      supabase,
      request,
    });

    const { data: question, error: questionError } = await supabase
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
        meaning_ja,
        meaning_en,
        explanation_ja,
        explanation_en,
        status,
        is_published
      `
      )
      .eq("id", courseQuestionId)
      .eq("is_published", true)
      .eq("status", "ready")
      .maybeSingle();

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

    const { data: insertedAttempt, error: insertAttemptError } = await supabase
      .from("course_review_attempts")
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
        review_session_id: safeReviewSessionId,
        selection_reason: selectionReason,
      })
      .select(
        `
        id,
        course_question_id,
        user_answer,
        correct_answer,
        is_correct,
        review_session_id,
        selection_reason,
        answered_at
      `
      )
      .maybeSingle();

    if (insertAttemptError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to save review attempt.",
          detail: insertAttemptError.message,
        },
        { status: 500 }
      );
    }

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