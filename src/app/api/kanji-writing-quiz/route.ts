import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStudentSession } from "@/lib/auth/student";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const QUESTION_LIMIT = 5;
const TABLE_NAME = "questions_master";

type StudentAccount = {
  id: string;
  student_login_id: string;
  display_name: string | null;
  is_active: boolean;
};

type WritingQuestionRow = {
  id: string | number | null;
  unit: string | null;
  category: string | null;
  question_type: string | null;
  jlpt_level: string | null;
  order_in_unit: number | null;
  kanji_order_in_unit: number | null;
  reading_variant_order: number | null;
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

type WritingHistoryProgressRow = {
  question_id: string | number | null;
  order_in_unit: number | null;
};

type AttemptRow = {
  question_id: string | number | null;
  unit: string | null;
  order_in_unit: number;
  kanji_order_in_unit?: number | null;
  reading_variant_order?: number | null;
  prompt: string;
  target_text: string;
  answer_text: string;
  user_answer: string;
  correct_answer: string;
  is_correct: boolean;
  difficulty_tier: string;
};

type RubyAnnotationItem = {
  text: string;
  ruby: string;
};

type SetOverviewStatus = "done" | "not_started";

type SetOverviewItem = {
  setNumber: number;
  startOrder: number;
  endOrder: number;
  status: SetOverviewStatus;
  isToday: boolean;
};

type SetOverview = {
  setSize: number;
  totalQuestionCount: number;
  totalSetCount: number;
  completedSetCount: number;
  todaySetNumber: number | null;
  sets: SetOverviewItem[];
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

function normalizeNumber(value: unknown): number | null {
  if (value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeDifficultyTier(value: unknown): string {
  const text = normalizeText(value).toLowerCase();
  return text === "high_level" ? "high_level" : "normal";
}

function questionIdKey(id: string | number | null) {
  return normalizeText(id);
}

function pickString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    const text = normalizeText(value);
    if (text) return text;
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
      return parsed
        .map((item) => {
          if (typeof item === "string") return item.trim();

          if (item && typeof item === "object") {
            const obj = item as Record<string, unknown>;
            const itemText =
              normalizeText(obj.text) ||
              normalizeText(obj.word) ||
              normalizeText(obj.kanji);

            const itemRuby =
              normalizeText(obj.ruby) ||
              normalizeText(obj.reading) ||
              normalizeText(obj.furigana);

            if (itemText && itemRuby) return `${itemText}:${itemRuby}`;
            if (itemText) return itemText;
          }

          return String(item).trim();
        })
        .filter(Boolean);
    }
  } catch {}

  return text
    .split(/[、,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseRubyAnnotationStringItem(
  value: string,
): RubyAnnotationItem | null {
  const normalized = value.trim();
  if (!normalized) return null;

  const separatorIndex = normalized.search(/[:：]/);

  if (separatorIndex === -1) {
    return {
      text: normalized,
      ruby: "",
    };
  }

  const text = normalized.slice(0, separatorIndex).trim();
  const ruby = normalized.slice(separatorIndex + 1).trim();

  if (!text) return null;

  return {
    text,
    ruby,
  };
}

function parseRubyAnnotations(value: unknown): RubyAnnotationItem[] {
  if (value == null) return [];

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") {
          return parseRubyAnnotationStringItem(item);
        }

        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          const text =
            normalizeText(obj.text) ||
            normalizeText(obj.word) ||
            normalizeText(obj.kanji);

          const ruby =
            normalizeText(obj.ruby) ||
            normalizeText(obj.reading) ||
            normalizeText(obj.furigana);

          if (!text) return null;

          return { text, ruby };
        }

        return null;
      })
      .filter((item): item is RubyAnnotationItem => item !== null);
  }

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw || raw === "null") return [];

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parseRubyAnnotations(parsed);
    } catch {}

    return raw
      .split(/[、,\n]/)
      .map((item) => parseRubyAnnotationStringItem(item))
      .filter((item): item is RubyAnnotationItem => item !== null);
  }

  return [];
}

async function getLoggedInAccount(db: any) {
  const session = await getStudentSession();

  if (!session?.studentAccountId) {
    return {
      account: null,
      errorResponse: NextResponse.json(
        { error: "Unauthorized. Please log in again." },
        { status: 401 },
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
        { status: 400 },
      ),
    };
  }

  const account = data as StudentAccount;

  if (!account.is_active) {
    return {
      account: null,
      errorResponse: NextResponse.json(
        { error: "This account is inactive." },
        { status: 403 },
      ),
    };
  }

  return { account, errorResponse: null };
}

async function fetchWritingHistoryProgressRows(
  db: any,
  studentAccountId: string,
  unit: string,
  difficultyTier: string,
): Promise<WritingHistoryProgressRow[]> {
  const { data, error } = await db
    .from("student_kanji_writing_question_history")
    .select("question_id, order_in_unit")
    .eq("student_account_id", studentAccountId)
    .eq("unit", unit)
    .eq("difficulty_tier", difficultyTier);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as WritingHistoryProgressRow[];
}

async function hasAdvancedWritingQuestions(db: any, unit: string) {
  const rows = await fetchQuestionPool(db, unit, "high_level");
  return rows.length > 0;
}

async function fetchQuestionPool(
  db: any,
  unit: string,
  difficultyTier: string,
): Promise<WritingQuestionRow[]> {
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
      kanji_order_in_unit,
      reading_variant_order,
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
    `,
    )
    .eq("unit", unit)
    .eq("is_published", true)
    .eq("quiz_mode", "ordered")
    .order("order_in_unit", { ascending: true })
    .order("kanji_order_in_unit", { ascending: true, nullsFirst: false })
    .order("reading_variant_order", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as WritingQuestionRow[];

  return rows.filter((row) => {
    const tierMatches =
      normalizeDifficultyTier(row.difficulty_tier) === difficultyTier;

    const category = normalizeText(row.category).toLowerCase();
    const questionType = normalizeText(row.question_type).toLowerCase();

    const hasWritingTarget =
      normalizeText(row.target_text) !== "" &&
      normalizeText(row.answer_text || row.target_ruby) !== "";

    const typeMatches =
      questionType === "input" ||
      questionType === "kanji_reading" ||
      questionType === "reading_input";

    const categoryMatches =
      category === "" ||
      category === "kanji" ||
      category === "reading" ||
      category === "kanji_reading";

    return tierMatches && hasWritingTarget && typeMatches && categoryMatches;
  });
}

async function fetchKanjiHintMap(
  db: any,
  keys: string[],
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
      meaning_ja: "",
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

async function buildHintMapForRows(db: any, rows: WritingQuestionRow[]) {
  const allHintKeys = Array.from(
    new Set(
      rows.flatMap((row) => [
        ...parseLooseJsonArray(row.hint_kanji_keys),
        ...parseRubyAnnotations(row.ruby_annotations)
          .filter((item) => !item.ruby)
          .map((item) => item.text),
      ]),
    ),
  );

  return fetchKanjiHintMap(db, allHintKeys);
}

function buildQuestionResponse(
  row: WritingQuestionRow,
  hintMap: Record<string, any>,
) {
  const rubyAnnotationItems = parseRubyAnnotations(row.ruby_annotations);
  const hintKeys = parseLooseJsonArray(row.hint_kanji_keys);

  const promptRubyItems = rubyAnnotationItems
    .map((item) => {
      if (item.ruby) {
        return {
          text: item.text,
          ruby: item.ruby,
        };
      }

      const exact = hintMap[item.text];

      return {
        text: item.text,
        ruby: exact?.ruby ?? "",
      };
    })
    .filter((item) => item.text && item.ruby);

  const hintKanjiItems = hintKeys.map((key) => {
    const item = hintMap[key];

    return {
      kanji: key,
      meaning_ja: "",
      meaning_en: item?.meaning_en ?? "",
      on_yomi: item?.on_yomi ?? "",
      kun_yomi: item?.kun_yomi ?? "",
    };
  });

  return {
    id: row.id,
    unit: normalizeText(row.unit),
    order_in_unit: row.order_in_unit ?? 0,
    kanji_order_in_unit: row.kanji_order_in_unit ?? null,
    reading_variant_order: row.reading_variant_order ?? null,
    prompt: normalizeText(row.prompt),
    translation_en: normalizeText(row.translation_en),
    target_text: normalizeText(row.target_text),
    target_ruby: normalizeText(row.target_ruby),
    prompt_ruby_items: promptRubyItems,
    answer_text: normalizeText(row.answer_text || row.target_ruby),
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

function compareWritingRows(a: WritingQuestionRow, b: WritingQuestionRow) {
  const aOrder = normalizeNumber(a.order_in_unit) ?? 999999;
  const bOrder = normalizeNumber(b.order_in_unit) ?? 999999;
  if (aOrder !== bOrder) return aOrder - bOrder;

  const aKanji = normalizeNumber(a.kanji_order_in_unit) ?? 999999;
  const bKanji = normalizeNumber(b.kanji_order_in_unit) ?? 999999;
  if (aKanji !== bKanji) return aKanji - bKanji;

  const aVariant = normalizeNumber(a.reading_variant_order) ?? 999999;
  const bVariant = normalizeNumber(b.reading_variant_order) ?? 999999;
  if (aVariant !== bVariant) return aVariant - bVariant;

  const aId = normalizeNumber(a.id) ?? 999999;
  const bId = normalizeNumber(b.id) ?? 999999;
  return aId - bId;
}

function getOrderedRows(pool: WritingQuestionRow[]) {
  return pool
    .filter((row) => {
      const order = normalizeNumber(row.order_in_unit);
      return order != null && order > 0;
    })
    .sort(compareWritingRows);
}

function filterPracticeSetPool(
  pool: WritingQuestionRow[],
  setNumber: number | null,
  startOrder: number | null,
  endOrder: number | null,
) {
  const orderedRows = getOrderedRows(pool);

  if (setNumber != null && setNumber >= 1) {
    const startIndex = (setNumber - 1) * QUESTION_LIMIT;
    return orderedRows.slice(startIndex, startIndex + QUESTION_LIMIT);
  }

  if (startOrder == null || endOrder == null) {
    return [];
  }

  return orderedRows
    .filter((row) => {
      const order = normalizeNumber(row.order_in_unit);
      if (order == null) return false;
      return order >= startOrder && order <= endOrder;
    })
    .slice(0, QUESTION_LIMIT);
}

function buildAnsweredQuestionIdSet(historyRows: WritingHistoryProgressRow[]) {
  return new Set(
    historyRows
      .map((row) => questionIdKey(row.question_id))
      .filter(Boolean),
  );
}

function getCompletedQuestionCount(
  pool: WritingQuestionRow[],
  historyRows: WritingHistoryProgressRow[],
) {
  const questionIdsInPool = new Set(
    getOrderedRows(pool)
      .map((row) => questionIdKey(row.id))
      .filter(Boolean),
  );
  const answeredIds = buildAnsweredQuestionIdSet(historyRows);

  let count = 0;
  for (const id of questionIdsInPool) {
    if (answeredIds.has(id)) count += 1;
  }

  return count;
}

function getContiguousLastOrderCompleted(
  pool: WritingQuestionRow[],
  historyRows: WritingHistoryProgressRow[],
) {
  const answeredIds = buildAnsweredQuestionIdSet(historyRows);
  const orderedRows = getOrderedRows(pool);
  let lastOrderCompleted = 0;

  for (const row of orderedRows) {
    const id = questionIdKey(row.id);
    const order = normalizeNumber(row.order_in_unit) ?? 0;

    if (!id || !answeredIds.has(id)) {
      break;
    }

    lastOrderCompleted = order;
  }

  return lastOrderCompleted;
}

function buildSetOverview(params: {
  pool: WritingQuestionRow[];
  historyRows: WritingHistoryProgressRow[];
}): SetOverview {
  const { pool, historyRows } = params;
  const answeredIds = buildAnsweredQuestionIdSet(historyRows);
  const orderedRows = getOrderedRows(pool);

  const totalQuestionCount = orderedRows.length;
  const totalSetCount = Math.ceil(totalQuestionCount / QUESTION_LIMIT);
  const sets: SetOverviewItem[] = [];

  let completedSetCount = 0;

  for (let index = 0; index < totalSetCount; index += 1) {
    const chunk = orderedRows.slice(
      index * QUESTION_LIMIT,
      index * QUESTION_LIMIT + QUESTION_LIMIT,
    );

    const firstRow = chunk[0];
    const lastRow = chunk[chunk.length - 1];

    const startOrder =
      normalizeNumber(firstRow?.order_in_unit) ?? index * QUESTION_LIMIT + 1;
    const endOrder =
      normalizeNumber(lastRow?.order_in_unit) ??
      Math.min((index + 1) * QUESTION_LIMIT, totalQuestionCount);

    const setIsCompleted =
      chunk.length > 0 &&
      chunk.every((row) => {
        const id = questionIdKey(row.id);
        return id && answeredIds.has(id);
      });

    if (setIsCompleted) {
      completedSetCount += 1;
    }

    sets.push({
      setNumber: index + 1,
      startOrder,
      endOrder,
      status: setIsCompleted ? "done" : "not_started",
      isToday: false,
    });
  }

  const todaySet = sets.find((item) => item.status !== "done") ?? null;

  return {
    setSize: QUESTION_LIMIT,
    totalQuestionCount,
    totalSetCount,
    completedSetCount,
    todaySetNumber: todaySet?.setNumber ?? null,
    sets: sets.map((item) => ({
      ...item,
      isToday: todaySet?.setNumber === item.setNumber,
    })),
  };
}

function normalizeKanjiInput(value: unknown) {
  return normalizeText(value);
}

function isWritingAnswerCorrect(userAnswer: unknown, correctAnswer: unknown) {
  return normalizeKanjiInput(userAnswer) === normalizeKanjiInput(correctAnswer);
}

async function fetchRowsByAttemptIds(
  db: any,
  attempts: AttemptRow[],
): Promise<Map<string, WritingQuestionRow>> {
  const ids = Array.from(
    new Set(attempts.map((item) => questionIdKey(item.question_id)).filter(Boolean)),
  );

  if (ids.length === 0) return new Map();

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
      kanji_order_in_unit,
      reading_variant_order,
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
    `,
    )
    .in("id", ids);

  if (error) {
    throw new Error(error.message);
  }

  const map = new Map<string, WritingQuestionRow>();

  for (const row of (data ?? []) as WritingQuestionRow[]) {
    const id = questionIdKey(row.id);
    if (id) map.set(id, row);
  }

  return map;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const db = supabase as any;

    const { account, errorResponse } = await getLoggedInAccount(db);
    if (!account) return errorResponse!;

    const unit = normalizeText(request.nextUrl.searchParams.get("unit"));
    const difficultyTier = normalizeDifficultyTier(
      request.nextUrl.searchParams.get("tier"),
    );
    const mode =
      normalizeText(request.nextUrl.searchParams.get("mode")) || "normal";
    const startOrder = normalizeNumber(
      request.nextUrl.searchParams.get("startOrder"),
    );
    const endOrder = normalizeNumber(
      request.nextUrl.searchParams.get("endOrder"),
    );
    const setNumber = normalizeNumber(
      request.nextUrl.searchParams.get("setNumber"),
    );

    if (!unit) {
      return NextResponse.json({ error: "unit is required." }, { status: 400 });
    }

    const [pool, advancedAvailable, historyRows] = await Promise.all([
      fetchQuestionPool(db, unit, difficultyTier),
      hasAdvancedWritingQuestions(db, unit),
      fetchWritingHistoryProgressRows(db, account.id, unit, difficultyTier),
    ]);

    const completedQuestionCount = getCompletedQuestionCount(pool, historyRows);
    const contiguousLastOrderCompleted = getContiguousLastOrderCompleted(
      pool,
      historyRows,
    );

    if (mode === "practice-set") {
      const practiceSetPool = filterPracticeSetPool(
        pool,
        setNumber,
        startOrder,
        endOrder,
      );
      const selectedRows = practiceSetPool.slice(0, QUESTION_LIMIT);
      const hintMap = await buildHintMapForRows(db, selectedRows);
      const questions = selectedRows.map((row) =>
        buildQuestionResponse(row, hintMap),
      );

      return NextResponse.json({
        account: {
          display_name: account.display_name,
          student_login_id: account.student_login_id,
        },
        unit,
        difficulty_tier: difficultyTier,
        mode: "practice-set",
        setNumber: setNumber ?? null,
        startOrder: normalizeNumber(selectedRows[0]?.order_in_unit) ?? startOrder,
        endOrder:
          normalizeNumber(selectedRows[selectedRows.length - 1]?.order_in_unit) ??
          endOrder,
        lastOrderCompleted: contiguousLastOrderCompleted,
        completedQuestionCount,
        finished: questions.length === 0,
        isUnitComplete: false,
        hasAdvancedAvailable: advancedAvailable,
        setOverview: buildSetOverview({ pool, historyRows }),
        questions,
      });
    }

    const lastOrderCompleted = contiguousLastOrderCompleted;
    const unitHasBeenCompleted =
      pool.length > 0 && completedQuestionCount >= pool.length;

    if (unitHasBeenCompleted) {
      return NextResponse.json({
        account: {
          display_name: account.display_name,
          student_login_id: account.student_login_id,
        },
        unit,
        difficulty_tier: difficultyTier,
        mode: "normal",
        startOrder: null,
        endOrder: null,
        lastOrderCompleted,
        completedQuestionCount,
        finished: true,
        isUnitComplete: true,
        hasAdvancedAvailable: advancedAvailable,
        setOverview: buildSetOverview({ pool, historyRows }),
        questions: [],
      });
    }

    const orderedCandidates = getOrderedRows(pool);
    const answeredIds = buildAnsweredQuestionIdSet(historyRows);
    const firstUnansweredIndex = orderedCandidates.findIndex((row) => {
      const id = questionIdKey(row.id);
      return !id || !answeredIds.has(id);
    });

    const orderedRows =
      firstUnansweredIndex === -1
        ? []
        : orderedCandidates.slice(
            firstUnansweredIndex,
            firstUnansweredIndex + QUESTION_LIMIT,
          );

    const hintMap = await buildHintMapForRows(db, orderedRows);
    const questions = orderedRows.map((row) =>
      buildQuestionResponse(row, hintMap),
    );

    return NextResponse.json({
      account: {
        display_name: account.display_name,
        student_login_id: account.student_login_id,
      },
      unit,
      difficulty_tier: difficultyTier,
      mode: "normal",
      startOrder: null,
      endOrder: null,
      lastOrderCompleted,
      completedQuestionCount,
      finished: questions.length === 0,
      isUnitComplete: unitHasBeenCompleted,
      hasAdvancedAvailable: advancedAvailable,
      setOverview: buildSetOverview({ pool, historyRows }),
      questions,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
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


    if (!unit) {
      return NextResponse.json({ error: "unit is required." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const questionMap = await fetchRowsByAttemptIds(db, attempts);

    if (attempts.length > 0) {
      const historyRows = attempts.flatMap((item) => {
        const questionId = questionIdKey(item.question_id);
        const masterRow = questionId ? questionMap.get(questionId) : null;

        if (!questionId || !masterRow) return [];

        const targetText = normalizeText(masterRow.target_text);
        const answerText = normalizeText(masterRow.answer_text || masterRow.target_ruby);
        const userAnswer = normalizeText(item.user_answer);

        if (!targetText || !answerText || !userAnswer) return [];

        const numericQuestionId = Number(questionId);
        if (!Number.isFinite(numericQuestionId)) return [];

        return [
          {
            student_account_id: account.id,
            question_id: numericQuestionId,
            unit: normalizeText(masterRow.unit) || unit,
            difficulty_tier: normalizeDifficultyTier(masterRow.difficulty_tier),
            set_number:
              typeof body.setNumber === "number" ? body.setNumber : null,
            order_in_unit: masterRow.order_in_unit ?? item.order_in_unit ?? null,
            prompt: normalizeText(masterRow.prompt),
            target_text: targetText,
            answer_text: answerText,
            user_answer: userAnswer,
            correct_answer: targetText,
            is_correct: isWritingAnswerCorrect(userAnswer, targetText),
            answered_at: now,
          },
        ];
      });

      if (historyRows.length > 0) {
        const { error: insertError } = await db
          .from("student_kanji_writing_question_history")
          .insert(historyRows);

        if (insertError) {
          return NextResponse.json(
            { error: insertError.message },
            { status: 400 },
          );
        }
      }
    }

    if (mode !== "normal" && mode !== "practice-set") {
      return NextResponse.json({
        ok: true,
        isUnitComplete: false,
        lastOrderCompleted: 0,
      });
    }

    const [pool, updatedHistoryRows] = await Promise.all([
      fetchQuestionPool(db, unit, difficultyTier),
      fetchWritingHistoryProgressRows(db, account.id, unit, difficultyTier),
    ]);

    const completedQuestionCount = getCompletedQuestionCount(
      pool,
      updatedHistoryRows,
    );
    const contiguousLastOrderCompleted = getContiguousLastOrderCompleted(
      pool,
      updatedHistoryRows,
    );

    const progressRow = {
      student_account_id: account.id,
      unit,
      difficulty_tier: difficultyTier,
      last_order_completed: contiguousLastOrderCompleted,
      updated_at: now,
    };

    const { error: progressError } = await db
      .from("student_kanji_writing_progress")
      .upsert(progressRow, {
        onConflict: "student_account_id,unit,difficulty_tier",
      });

    if (progressError) {
      return NextResponse.json(
        { error: progressError.message },
        { status: 400 },
      );
    }

    const isUnitComplete = pool.length > 0 && completedQuestionCount >= pool.length;

    return NextResponse.json({
      ok: true,
      isUnitComplete,
      lastOrderCompleted: contiguousLastOrderCompleted,
      completedQuestionCount,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
