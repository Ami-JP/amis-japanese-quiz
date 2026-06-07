import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  kanji_list: unknown;
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

function shuffleArray<T>(array: T[]) {
  const copied = [...array];

  for (let index = copied.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copied[index], copied[randomIndex]] = [copied[randomIndex], copied[index]];
  }

  return copied;
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return [];
}

function isMeaningQuestion(question: CourseQuestionRow) {
  return question.section === "kanji_meaning" || question.quiz_type === "kanji_meaning";
}

function normalizeChoice(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[。、，,.!！?？]/g, "");
}

function getCorrectMeaningFromHint(params: {
  question: CourseQuestionRow;
  hint: KanjiHintRow | null;
}) {
  const { question, hint } = params;

  const hintMeaning = hint?.meaning_en?.trim();

  if (hintMeaning) {
    return hintMeaning;
  }

  return question.answer_text;
}

function buildMeaningChoices(params: {
  question: CourseQuestionRow;
  hint: KanjiHintRow | null;
}) {
  const { question, hint } = params;

  const correctAnswer = getCorrectMeaningFromHint({ question, hint });
  const oldAnswer = question.answer_text;

  const rawChoices = toArray(question.choices_json).filter(
    (choice): choice is string => typeof choice === "string"
  );

  const distractors = rawChoices.filter((choice) => {
    const normalizedChoice = normalizeChoice(choice);
    return (
      normalizedChoice !== normalizeChoice(correctAnswer) &&
      normalizedChoice !== normalizeChoice(oldAnswer)
    );
  });

  const uniqueChoices: string[] = [];

  for (const choice of [correctAnswer, ...distractors]) {
    const alreadyExists = uniqueChoices.some(
      (existing) => normalizeChoice(existing) === normalizeChoice(choice)
    );

    if (!alreadyExists) {
      uniqueChoices.push(choice);
    }
  }

  return shuffleArray(uniqueChoices.slice(0, 4));
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);

    const courseSlug = searchParams.get("course_slug")?.trim() || "";
    const dayText = searchParams.get("day")?.trim() || "";
    const dayNumber = Number(dayText);

    const previewRequested =
      searchParams.get("preview") === "1" || searchParams.get("preview") === "true";

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
          error: "day must be a positive number.",
        },
        { status: 400 }
      );
    }

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

    const { data: courseRaw, error: courseError } = await courseQuery.maybeSingle();

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

    let dayQuery = supabase
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
      .eq("day_number", dayNumber);

    if (!previewRequested) {
      dayQuery = dayQuery.eq("is_published", true);
    }

    const { data: dayRaw, error: dayError } = await dayQuery.maybeSingle();

    if (dayError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch course day.",
          detail: dayError.message,
        },
        { status: 500 }
      );
    }

    if (!dayRaw) {
      return NextResponse.json(
        {
          ok: false,
          error: "Course day not found or not published.",
        },
        { status: 404 }
      );
    }

    const day = dayRaw as CourseDayRow;

    let questionsQuery = supabase
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
      .eq("course_day_id", day.id)
      .eq("day_number", dayNumber)
      .eq("status", "ready")
      .order("question_order", { ascending: true });

    if (!previewRequested) {
      questionsQuery = questionsQuery.eq("is_published", true);
    }

    const { data: questionsRaw, error: questionsError } = await questionsQuery;

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

    const questions = (questionsRaw ?? []) as CourseQuestionRow[];

    const meaningKanjiList = Array.from(
      new Set(
        questions
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

    const decoratedQuestions = questions.map((question) => {
      const hint = isMeaningQuestion(question)
        ? hintMap.get(question.target_text) ?? null
        : null;

      if (isMeaningQuestion(question)) {
        const correctAnswer = getCorrectMeaningFromHint({ question, hint });

        return {
          ...question,
          answer_text: correctAnswer,
          meaning_en: hint?.meaning_en ?? question.meaning_en,
          meaning_ja: hint?.meaning_ja ?? question.meaning_ja,
          choices_json: buildMeaningChoices({ question, hint }),
          ruby_annotations: toArray(question.ruby_annotations),
          kanji_hint: hint,
        };
      }

      return {
        ...question,
        choices_json: toArray(question.choices_json),
        ruby_annotations: toArray(question.ruby_annotations),
        kanji_hint: null,
      };
    });

    const counts = {
      total: decoratedQuestions.length,
      kanji_meaning: decoratedQuestions.filter(
        (question) => question.section === "kanji_meaning"
      ).length,
      vocab_reading: decoratedQuestions.filter(
        (question) => question.section === "vocab_reading"
      ).length,
    };

    return NextResponse.json({
      ok: true,
      preview: previewRequested,
      course,
      day,
      counts,
      questions: decoratedQuestions,
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