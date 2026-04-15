import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStudentSession } from "@/lib/auth/student";

const QUESTION_LIMIT = 5;
const TABLE_NAME = "questions_master";

type StudentAccount = {
  id: string;
  student_login_id: string;
  display_name: string | null;
  is_active: boolean;
};

type ReadingQuestionRow = {
  id: string | number | null;
  unit: string | null;
  category: string | null;
  question_type: string | null;
  jlpt_level: string | null;
  order_in_unit: number | null;
  quiz_mode: string | null;
  is_published: boolean | null;
  prompt: string | null;
  translation_en: string | null;
  target_text: string | null;
  target_ruby: string | null;
  ruby_annotations: unknown;
  answer_text: string | null;
  answer_aliases: unknown;
  meaning_ja: string | null;
  meaning_en: string | null;
  hint_kanji_keys: unknown;
  hint_ja: string | null;
  hint_en: string | null;
  explanation_ja: string | null;
  explanation_en: string | null;
  difficulty_tier: string | null;
};

type ReadingProgress = {
  student_account_id: string;
  unit: string;
  difficulty_tier: string;
  last_order_completed: number;
  last_studied_at: string | null;
  is_completed: boolean;
};

type AttemptRow = {
  question_id: string | number | null;
  unit: string | null;
  order_in_unit: number;
  prompt: string;
  target_text: string;
  user_answer: string;
  correct_answer: string;
  is_correct: boolean;
  difficulty_tier: string;
};

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function normalizeText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

function parseLooseJsonArray(value: unknown): string[] {
  if (value == null) return [];

  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value).trim()].filter(Boolean);
  }

  if (typeof value !== "string") return [];

  const text = value.trim();
  if (!text || text === "null") return [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // JSON でない文字列はそのまま分割処理へ
  }

  return text
    .split(/[、,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeDifficultyTier(value: unknown): string {
  const text = normalizeText(value).toLowerCase();
  return text || "normal";
}

function shuffleArray<T>(items: T[]) {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function pickString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

async function getLoggedInAccount(db: any) {
  const session = await getStudentSession();

  if (!session?.studentAccountId) {
    return {
      account: null,
      errorResponse: NextResponse.json(
        { error: "Unauthorized. Please log in again." },
        { status: 401 }
      ),
    };
  }

  const { data, error } = await db
    .from("student_accounts")
    .select("id, student_login_id, display_name, is_active")
    .eq("id", session.studentAccountId)
    .single();

  if (error || !data) {
    return {
      account: null,
      errorResponse: NextResponse.json(
        { error: error?.message ?? "Account not found." },
        { status: 400 }
      ),
    };
  }

  const account = data as StudentAccount;

  if (!account.is_active) {
    return {
      account: null,
      errorResponse: NextResponse.json(
        { error: "This account is inactive." },
        { status: 403 }
      ),
    };
  }

  return { account, errorResponse: null };
}

async function getReadingProgress(
  db: any,
  studentAccountId: string,
  unit: string,
  difficultyTier: string
) {
  const { data, error } = await db
    .from("student_reading_progress")
    .select(
      "student_account_id, unit, difficulty_tier, last_order_completed, last_studied_at, is_completed"
    )
    .eq("student_account_id", studentAccountId)
    .eq("unit", unit)
    .eq("difficulty_tier", difficultyTier)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as ReadingProgress | null;
}

async function fetchQuestionPool(
  db: any,
  unit: string,
  difficultyTier: string
): Promise<ReadingQuestionRow[]> {
  const { data, error } = await db
    .from(TABLE_NAME)
    .select(
      `
      id,
      unit,
      category,
      question_type,
      jlpt_level,
      order_in_unit,
      quiz_mode,
      is_published,
      prompt,
      translation_en,
      target_text,
      target_ruby,
      ruby_annotations,
      answer_text,
      answer_aliases,
      meaning_ja,
      meaning_en,
      hint_kanji_keys,
      hint_ja,
      hint_en,
      explanation_ja,
      explanation_en,
      difficulty_tier
    `
    )
    .eq("unit", unit)
    .eq("category", "kanji")
    .eq("question_type", "input")
    .eq("is_published", true)
    .order("order_in_unit", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as ReadingQuestionRow[];

  return rows.filter(
    (row) => normalizeDifficultyTier(row.difficulty_tier) === difficultyTier
  );
}

async function fetchKanjiHintMap(
  db: any,
  keys: string[]
): Promise<Record<string, any>> {
  if (keys.length === 0) return {};

  const { data, error } = await db
    .from("kanji_hints")
    .select("*")
    .in("kanji", keys);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Record<string, unknown>[];

  return rows.reduce<Record<string, any>>((acc, row) => {
    const kanji = normalizeText(row.kanji);
    if (!kanji) return acc;

    acc[kanji] = {
      kanji,
      meaning_ja: pickString(row, ["meaning_ja"]),
      meaning_en: pickString(row, ["meaning_en"]),
      on_yomi: pickString(row, [
        "on_yomi",
        "onyomi_ja",
        "onyomi",
        "on_reading",
        "reading_on",
      ]),
      kun_yomi: pickString(row, [
        "kun_yomi",
        "kunyomi_ja",
        "kunyomi",
        "kun_reading",
        "reading_kun",
      ]),
      ruby: pickString(row, [
        "ruby",
        "reading_hiragana",
        "reading",
        "target_ruby",
      ]),
    };

    return acc;
  }, {});
}

function buildQuestionResponse(
  row: ReadingQuestionRow,
  hintMap: Record<string, any>
) {
  const promptAnnotationKeys = parseLooseJsonArray(row.ruby_annotations);
  const hintKeys = parseLooseJsonArray(row.hint_kanji_keys);

  const promptRubyItems = promptAnnotationKeys.map((text) => {
    const exact = hintMap[text];
    return {
      text,
      ruby: exact?.ruby ?? "",
    };
  });

  const hintKanjiItems = hintKeys.map((key) => {
    const item = hintMap[key];
    return {
      kanji: key,
      meaning_ja: item?.meaning_ja ?? "",
      meaning_en: item?.meaning_en ?? "",
      on_yomi: item?.on_yomi ?? "",
      kun_yomi: item?.kun_yomi ?? "",
    };
  });

  return {
    id: row.id,
    unit: normalizeText(row.unit),
    order_in_unit: row.order_in_unit ?? 0,
    prompt: normalizeText(row.prompt),
    translation_en: normalizeText(row.translation_en),
    target_text: normalizeText(row.target_text),
    target_ruby: normalizeText(row.target_ruby),
    prompt_ruby_items: promptRubyItems,
    answer_text: normalizeText(row.answer_text),
    answer_aliases: parseLooseJsonArray(row.answer_aliases),
    meaning_ja: normalizeText(row.meaning_ja),
    meaning_en: normalizeText(row.meaning_en),
    hint_ja: normalizeText(row.hint_ja),
    hint_en: normalizeText(row.hint_en),
    explanation_ja: normalizeText(row.explanation_ja),
    explanation_en: normalizeText(row.explanation_en),
    hint_kanji_items: hintKanjiItems,
    difficulty_tier: normalizeDifficultyTier(row.difficulty_tier),
  };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const db = supabase as any;

    const { account, errorResponse } = await getLoggedInAccount(db);
    if (!account) return errorResponse!;

    const unit = normalizeText(request.nextUrl.searchParams.get("unit"));
    const difficultyTier = normalizeDifficultyTier(
      request.nextUrl.searchParams.get("tier")
    );
    const mode = normalizeText(request.nextUrl.searchParams.get("mode")) || "normal";

    if (!unit) {
      return NextResponse.json(
        { error: "unit is required." },
        { status: 400 }
      );
    }

    const pool = await fetchQuestionPool(db, unit, difficultyTier);

    const allHintKeys = Array.from(
      new Set(
        pool.flatMap((row) => [
          ...parseLooseJsonArray(row.hint_kanji_keys),
          ...parseLooseJsonArray(row.ruby_annotations),
        ])
      )
    );

    const hintMap = await fetchKanjiHintMap(db, allHintKeys);

    if (mode === "practice") {
      const questions = shuffleArray(pool)
        .slice(0, QUESTION_LIMIT)
        .map((row) => buildQuestionResponse(row, hintMap));

      return NextResponse.json({
        account: {
          display_name: account.display_name,
          student_login_id: account.student_login_id,
        },
        unit,
        difficulty_tier: difficultyTier,
        mode: "practice",
        lastOrderCompleted: 0,
        finished: questions.length === 0,
        questions,
      });
    }

    const progress = await getReadingProgress(
      db,
      account.id,
      unit,
      difficultyTier
    );
    const lastOrderCompleted = progress?.last_order_completed ?? 0;

    const questions = pool
      .filter(
        (row) =>
          row.order_in_unit !== null && row.order_in_unit > lastOrderCompleted
      )
      .slice(0, QUESTION_LIMIT)
      .map((row) => buildQuestionResponse(row, hintMap));

    return NextResponse.json({
      account: {
        display_name: account.display_name,
        student_login_id: account.student_login_id,
      },
      unit,
      difficulty_tier: difficultyTier,
      mode: "normal",
      lastOrderCompleted,
      finished: questions.length === 0,
      questions,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const db = supabase as any;
    const body = await request.json();

    const { account, errorResponse } = await getLoggedInAccount(db);
    if (!account) return errorResponse!;

    const unit = normalizeText(body.unit);
    const difficultyTier = normalizeDifficultyTier(body.difficulty_tier);
    const mode = normalizeText(body.mode) || "normal";
    const attempts = Array.isArray(body.attempts)
      ? (body.attempts as AttemptRow[])
      : [];
    const advanceCount =
      typeof body.advanceCount === "number" ? body.advanceCount : 0;

    if (!unit) {
      return NextResponse.json(
        { error: "unit is required." },
        { status: 400 }
      );
    }

    if (attempts.length > 0) {
      const now = new Date().toISOString();

      const rows = attempts.map((item) => ({
        student_account_id: account.id,
        kanji: item.target_text || item.prompt,
        unit: item.unit ?? unit,
        order_in_unit: item.order_in_unit,
        quiz_type: "reading_choice",
        user_answer: item.user_answer,
        correct_answer: item.correct_answer,
        is_correct: item.is_correct,
        answered_at: now,
      }));

      const { error: insertError } = await db.from("kanji_attempts").insert(rows);

      if (insertError) {
        return NextResponse.json(
          { error: insertError.message },
          { status: 400 }
        );
      }
    }

    if (mode === "normal" && advanceCount > 0) {
      const current = await getReadingProgress(
        db,
        account.id,
        unit,
        difficultyTier
      );

      const newLastOrderCompleted =
        (current?.last_order_completed ?? 0) + advanceCount;

      const progressRow = {
        student_account_id: account.id,
        unit,
        difficulty_tier: difficultyTier,
        last_order_completed: newLastOrderCompleted,
        last_studied_at: new Date().toISOString(),
        is_completed: false,
        updated_at: new Date().toISOString(),
      };

      const { error: upsertError } = await db
        .from("student_reading_progress")
        .upsert(progressRow);

      if (upsertError) {
        return NextResponse.json(
          { error: upsertError.message },
          { status: 400 }
        );
      }

      const pool = await fetchQuestionPool(db, unit, difficultyTier);
      const hasRemaining = pool.some(
        (row) => (row.order_in_unit ?? 0) > newLastOrderCompleted
      );

      if (!hasRemaining) {
        const { error: completeError } = await db
          .from("student_reading_progress")
          .upsert({
            ...progressRow,
            is_completed: true,
          });

        if (completeError) {
          return NextResponse.json(
            { error: completeError.message },
            { status: 400 }
          );
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}