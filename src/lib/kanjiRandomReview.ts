import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getStudentSession } from "@/lib/auth/student";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { judgeReadingAnswer } from "@/lib/readingAnswerJudge";
import { judgeKanjiWritingAnswer } from "@/lib/kanjiWritingAnswerJudge";

type ReviewKind = "meaning" | "reading" | "writing";

type SelectionReason =
  | "missed_multiple"
  | "missed_once"
  | "not_reviewed_yet"
  | "not_recently_seen"
  | "supplemental";

type AccountRow = {
  display_name: string | null;
  student_login_id: string;
};

type MeaningHintRow = {
  kanji: string;
  unit: string | null;
  order_in_unit: number | null;
  meaning_en: string | null;
  meaning_ja: string | null;
  onyomi_ja: string | null;
  kunyomi_ja: string | null;
  example_words_ja: string | null;
  example_words_en: string | null;
  is_published: boolean | null;
};

type KanjiAttemptRow = {
  kanji: string | null;
  unit: string | null;
  order_in_unit: number | null;
  quiz_type: string | null;
  is_correct: boolean | null;
  answered_at: string | null;
};

type ReadingHistoryRow = {
  question_id: string | null;
  unit: string | null;
  kanji_order_in_unit: number | null;
  reading_variant_order: number | null;
  shown_count: number | null;
  correct_count: number | null;
  wrong_count: number | null;
  last_shown_at: string | null;
  needs_review: boolean | null;
};

type WritingHistoryRow = {
  question_id: number | string | null;
  unit: string | null;
  difficulty_tier: string | null;
  set_number: number | null;
  order_in_unit: number | null;
  prompt: string | null;
  target_text: string | null;
  answer_text: string | null;
  user_answer: string | null;
  correct_answer: string | null;
  is_correct: boolean | null;
  answered_at: string | null;
};

type QuestionMasterRow = {
  id: number;
  unit: string;
  category: string | null;
  question_type: string | null;
  is_published: boolean | null;
  prompt: string | null;
  translation_en: string | null;
  hint_ja: string | null;
  hint_en: string | null;
  explanation_ja: string | null;
  explanation_en: string | null;
  answer_text: string | null;
  answer_aliases: unknown;
  target_text: string | null;
  target_ruby: string | null;
  ruby_annotations: unknown;
  meaning_ja: string | null;
  meaning_en: string | null;
  onyomi_ja: string | null;
  kunyomi_ja: string | null;
  difficulty_tier: string | null;
  order_in_unit: number | null;
  kanji_order_in_unit: number | null;
  reading_variant_order: number | null;
};

type ReviewAttemptRow = {
  kanji?: string | null;
  question_id?: number | string | null;
  is_correct: boolean | null;
  answered_at: string | null;
};

type ScoredItem<T> = {
  item: T;
  score: number;
  selection_reason: SelectionReason;
};

type MeaningReviewQuestion = {
  id: string;
  kanji: string;
  unit: string | null;
  order_in_unit: number | null;
  set_number: number | null;
  quiz_type: "meaning_choice";
  target_text: string;
  correct_answer: string;
  meaning_en: string;
  meaning_ja: string;
  onyomi_ja: string;
  kunyomi_ja: string;
  example_words_ja: string;
  example_words_en: string;
  choices: string[];
  selection_reason: SelectionReason;
};

type InputReviewQuestion = {
  id: number;
  question_id: number;
  unit: string;
  difficulty_tier: string;
  set_number: number | null;
  order_in_unit: number | null;
  kanji_order_in_unit: number | null;
  reading_variant_order: number | null;
  quiz_type: "reading_input" | "writing_input";
  prompt: string;
  translation_en: string;
  target_text: string;
  target_ruby: string;
  answer_text: string;
  answer_aliases: unknown;
  ruby_annotations: unknown;
  meaning_ja: string;
  meaning_en: string;
  hint_ja: string;
  hint_en: string;
  explanation_ja: string;
  explanation_en: string;
  correct_answer: string;
  selection_reason: SelectionReason;
};

function normalizeText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

function normalizeNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeQuestionId(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (!Number.isInteger(num)) return null;
  if (num <= 0) return null;
  return num;
}

function normalizeSelectionReason(value: unknown): SelectionReason {
  const text = normalizeText(value);

  if (
    text === "missed_multiple" ||
    text === "missed_once" ||
    text === "not_reviewed_yet" ||
    text === "not_recently_seen" ||
    text === "supplemental"
  ) {
    return text;
  }

  return "supplemental";
}

function daysAgo(value: string | null | undefined): number | null {
  if (!value) return null;

  const time = new Date(value).getTime();

  if (!Number.isFinite(time)) return null;

  return (Date.now() - time) / (1000 * 60 * 60 * 24);
}

function getSetNumber(params: {
  setNumber?: number | null;
  kanjiOrderInUnit?: number | null;
  orderInUnit?: number | null;
}) {
  if (params.setNumber != null && Number.isFinite(params.setNumber)) {
    return params.setNumber;
  }

  const base = params.kanjiOrderInUnit ?? params.orderInUnit;

  if (base == null || !Number.isFinite(base) || base <= 0) {
    return null;
  }

  return Math.ceil(base / 5);
}

function uniqueTexts(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const text = normalizeText(value);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }

  return result;
}

function shuffle<T>(items: T[]) {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }

  return next;
}

function pickTopFive<T>(items: ScoredItem<T>[]) {
  return items
    .map((item) => ({
      ...item,
      score: item.score + Math.random() * 8,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

async function getStudentOr401() {
  const session = await getStudentSession();

  if (!session?.studentAccountId) {
    return {
      studentAccountId: null,
      response: NextResponse.json(
        { error: "Unauthorized. Please log in again." },
        { status: 401 },
      ),
    };
  }

  return {
    studentAccountId: session.studentAccountId,
    response: null,
  };
}

async function getAccount(db: any, studentAccountId: string) {
  const { data } = await db
    .from("student_accounts")
    .select("display_name, student_login_id")
    .eq("id", studentAccountId)
    .maybeSingle();

  return (data ?? null) as AccountRow | null;
}

function getMeaningStats(attemptRows: KanjiAttemptRow[]) {
  const stats = new Map<
    string,
    {
      wrongCount: number;
      correctCount: number;
      totalCount: number;
      latestAnsweredAt: string | null;
      unit: string | null;
      orderInUnit: number | null;
    }
  >();

  for (const row of attemptRows) {
    const kanji = normalizeText(row.kanji);
    if (!kanji) continue;

    const current =
      stats.get(kanji) ??
      {
        wrongCount: 0,
        correctCount: 0,
        totalCount: 0,
        latestAnsweredAt: null,
        unit: null,
        orderInUnit: null,
      };

    current.totalCount += 1;

    if (row.is_correct === true) {
      current.correctCount += 1;
    } else if (row.is_correct === false) {
      current.wrongCount += 1;
    }

    if (
      row.answered_at &&
      (!current.latestAnsweredAt ||
        new Date(row.answered_at).getTime() >
          new Date(current.latestAnsweredAt).getTime())
    ) {
      current.latestAnsweredAt = row.answered_at;
      current.unit = row.unit;
      current.orderInUnit = row.order_in_unit;
    }

    stats.set(kanji, current);
  }

  return stats;
}

function getReviewStatsByKanji(rows: ReviewAttemptRow[]) {
  const stats = new Map<
    string,
    {
      shownCount: number;
      latestAnsweredAt: string | null;
      latestIsCorrect: boolean | null;
    }
  >();

  for (const row of rows) {
    const kanji = normalizeText(row.kanji);
    if (!kanji) continue;

    const current =
      stats.get(kanji) ??
      {
        shownCount: 0,
        latestAnsweredAt: null,
        latestIsCorrect: null,
      };

    current.shownCount += 1;

    if (
      row.answered_at &&
      (!current.latestAnsweredAt ||
        new Date(row.answered_at).getTime() >
          new Date(current.latestAnsweredAt).getTime())
    ) {
      current.latestAnsweredAt = row.answered_at;
      current.latestIsCorrect = row.is_correct;
    }

    stats.set(kanji, current);
  }

  return stats;
}

function getReviewStatsByQuestionId(rows: ReviewAttemptRow[]) {
  const stats = new Map<
    number,
    {
      shownCount: number;
      latestAnsweredAt: string | null;
      latestIsCorrect: boolean | null;
    }
  >();

  for (const row of rows) {
    const questionId = normalizeQuestionId(row.question_id);
    if (questionId == null) continue;

    const current =
      stats.get(questionId) ??
      {
        shownCount: 0,
        latestAnsweredAt: null,
        latestIsCorrect: null,
      };

    current.shownCount += 1;

    if (
      row.answered_at &&
      (!current.latestAnsweredAt ||
        new Date(row.answered_at).getTime() >
          new Date(current.latestAnsweredAt).getTime())
    ) {
      current.latestAnsweredAt = row.answered_at;
      current.latestIsCorrect = row.is_correct;
    }

    stats.set(questionId, current);
  }

  return stats;
}

function scoreMeaningQuestion(params: {
  row: MeaningHintRow;
  normalStats: ReturnType<typeof getMeaningStats>;
  reviewStats: ReturnType<typeof getReviewStatsByKanji>;
  supplemental: boolean;
}): ScoredItem<MeaningHintRow> {
  const kanji = normalizeText(params.row.kanji);
  const normal = params.normalStats.get(kanji);
  const review = params.reviewStats.get(kanji);

  let score = 10;
  let selection_reason: SelectionReason = params.supplemental
    ? "supplemental"
    : "not_recently_seen";

  if (normal?.wrongCount && normal.wrongCount >= 2) {
    score += 120;
    selection_reason = "missed_multiple";
  } else if (normal?.wrongCount && normal.wrongCount >= 1) {
    score += 95;
    selection_reason = "missed_once";
  } else if (!params.supplemental) {
    score += 40;
  }

  if (!review) {
    score += 35;
    if (selection_reason === "not_recently_seen") {
      selection_reason = "not_reviewed_yet";
    }
  }

  const reviewDays = daysAgo(review?.latestAnsweredAt);
  if (reviewDays != null) {
    if (reviewDays < 1) score -= 90;
    else if (reviewDays < 2) score -= 40;
    else if (reviewDays >= 7) score += 20;
  }

  if (review?.latestIsCorrect === true && reviewDays != null && reviewDays < 7) {
    score -= 18;
  }

  const normalDays = daysAgo(normal?.latestAnsweredAt);
  if (normalDays != null && normalDays < 2) {
    score -= 8;
  }

  return {
    item: params.row,
    score,
    selection_reason,
  };
}

function scoreReadingQuestion(params: {
  row: QuestionMasterRow;
  history: ReadingHistoryRow | null;
  review: ReturnType<typeof getReviewStatsByQuestionId> extends Map<
    number,
    infer V
  >
    ? V | undefined
    : never;
  supplemental: boolean;
}): ScoredItem<QuestionMasterRow> {
  const wrongCount = params.history?.wrong_count ?? 0;
  let score = 10;
  let selection_reason: SelectionReason = params.supplemental
    ? "supplemental"
    : "not_recently_seen";

  if (wrongCount >= 2) {
    score += 120;
    selection_reason = "missed_multiple";
  } else if (wrongCount >= 1) {
    score += 95;
    selection_reason = "missed_once";
  } else if (!params.supplemental) {
    score += 40;
  }

  if (!params.review) {
    score += 35;
    if (selection_reason === "not_recently_seen") {
      selection_reason = "not_reviewed_yet";
    }
  }

  if (params.history?.needs_review === true) {
    score += 35;
  }

  const reviewDays = daysAgo(params.review?.latestAnsweredAt);
  if (reviewDays != null) {
    if (reviewDays < 1) score -= 90;
    else if (reviewDays < 2) score -= 40;
    else if (reviewDays >= 7) score += 20;
  }

  if (
    params.review?.latestIsCorrect === true &&
    reviewDays != null &&
    reviewDays < 7
  ) {
    score -= 18;
  }

  const normalDays = daysAgo(params.history?.last_shown_at);
  if (normalDays != null && normalDays < 2) {
    score -= 8;
  }

  return {
    item: params.row,
    score,
    selection_reason,
  };
}

function scoreWritingQuestion(params: {
  row: QuestionMasterRow;
  historyRows: WritingHistoryRow[];
  review: ReturnType<typeof getReviewStatsByQuestionId> extends Map<
    number,
    infer V
  >
    ? V | undefined
    : never;
  supplemental: boolean;
}): ScoredItem<QuestionMasterRow> {
  const wrongCount = params.historyRows.filter(
    (row) => row.is_correct === false,
  ).length;

  const latestHistory = params.historyRows
    .filter((row) => row.answered_at)
    .sort(
      (a, b) =>
        new Date(b.answered_at ?? 0).getTime() -
        new Date(a.answered_at ?? 0).getTime(),
    )[0];

  let score = 10;
  let selection_reason: SelectionReason = params.supplemental
    ? "supplemental"
    : "not_recently_seen";

  if (wrongCount >= 2) {
    score += 120;
    selection_reason = "missed_multiple";
  } else if (wrongCount >= 1) {
    score += 95;
    selection_reason = "missed_once";
  } else if (!params.supplemental) {
    score += 40;
  }

  if (!params.review) {
    score += 35;
    if (selection_reason === "not_recently_seen") {
      selection_reason = "not_reviewed_yet";
    }
  }

  const reviewDays = daysAgo(params.review?.latestAnsweredAt);
  if (reviewDays != null) {
    if (reviewDays < 1) score -= 90;
    else if (reviewDays < 2) score -= 40;
    else if (reviewDays >= 7) score += 20;
  }

  if (
    params.review?.latestIsCorrect === true &&
    reviewDays != null &&
    reviewDays < 7
  ) {
    score -= 18;
  }

  const normalDays = daysAgo(latestHistory?.answered_at);
  if (normalDays != null && normalDays < 2) {
    score -= 8;
  }

  return {
    item: params.row,
    score,
    selection_reason,
  };
}

function toMeaningQuestion(params: {
  row: MeaningHintRow;
  selection_reason: SelectionReason;
  choices: string[];
}): MeaningReviewQuestion {
  const correct = normalizeText(params.row.meaning_en);

  return {
    id: params.row.kanji,
    kanji: params.row.kanji,
    unit: params.row.unit,
    order_in_unit: params.row.order_in_unit,
    set_number: getSetNumber({
      orderInUnit: params.row.order_in_unit,
    }),
    quiz_type: "meaning_choice",
    target_text: params.row.kanji,
    correct_answer: correct,
    meaning_en: correct,
    meaning_ja: normalizeText(params.row.meaning_ja),
    onyomi_ja: normalizeText(params.row.onyomi_ja),
    kunyomi_ja: normalizeText(params.row.kunyomi_ja),
    example_words_ja: normalizeText(params.row.example_words_ja),
    example_words_en: normalizeText(params.row.example_words_en),
    choices: params.choices,
    selection_reason: params.selection_reason,
  };
}

function toInputQuestion(params: {
  row: QuestionMasterRow;
  kind: "reading" | "writing";
  selection_reason: SelectionReason;
}): InputReviewQuestion {
  return {
    id: params.row.id,
    question_id: params.row.id,
    unit: params.row.unit,
    difficulty_tier: normalizeText(params.row.difficulty_tier) || "normal",
    set_number: getSetNumber({
      kanjiOrderInUnit: params.row.kanji_order_in_unit,
      orderInUnit: params.row.order_in_unit,
    }),
    order_in_unit: params.row.order_in_unit,
    kanji_order_in_unit: params.row.kanji_order_in_unit,
    reading_variant_order: params.row.reading_variant_order,
    quiz_type: params.kind === "reading" ? "reading_input" : "writing_input",
    prompt: normalizeText(params.row.prompt),
    translation_en: normalizeText(params.row.translation_en),
    target_text: normalizeText(params.row.target_text),
    target_ruby: normalizeText(params.row.target_ruby),
    answer_text: normalizeText(params.row.answer_text),
    answer_aliases: params.row.answer_aliases ?? [],
    ruby_annotations: params.row.ruby_annotations ?? [],
    meaning_ja: normalizeText(params.row.meaning_ja),
    meaning_en: normalizeText(params.row.meaning_en),
    hint_ja: normalizeText(params.row.hint_ja),
    hint_en: normalizeText(params.row.hint_en),
    explanation_ja: normalizeText(params.row.explanation_ja),
    explanation_en: normalizeText(params.row.explanation_en),
    correct_answer:
      params.kind === "reading"
        ? normalizeText(params.row.answer_text)
        : normalizeText(params.row.target_text),
    selection_reason: params.selection_reason,
  };
}

async function getMeaningChoices(db: any, selectedRows: MeaningHintRow[]) {
  const { data } = await db
    .from("kanji_hints")
    .select("meaning_en")
    .eq("is_published", true)
    .not("meaning_en", "is", null)
    .limit(2000);

  const allMeanings = uniqueTexts(
    ((data ?? []) as { meaning_en: string | null }[]).map(
      (row) => row.meaning_en ?? "",
    ),
  );

  const choicesByKanji = new Map<string, string[]>();

  for (const row of selectedRows) {
    const correct = normalizeText(row.meaning_en);
    const distractors = shuffle(
      allMeanings.filter((meaning) => meaning && meaning !== correct),
    ).slice(0, 3);

    choicesByKanji.set(row.kanji, shuffle(uniqueTexts([correct, ...distractors])));
  }

  return choicesByKanji;
}

async function fetchQuestionMasterRowsByIds(db: any, ids: number[]) {
  if (ids.length === 0) return [];

  const { data, error } = await db
    .from("questions_master")
    .select(
      [
        "id",
        "unit",
        "category",
        "question_type",
        "is_published",
        "prompt",
        "translation_en",
        "hint_ja",
        "hint_en",
        "explanation_ja",
        "explanation_en",
        "answer_text",
        "answer_aliases",
        "target_text",
        "target_ruby",
        "ruby_annotations",
        "meaning_ja",
        "meaning_en",
        "onyomi_ja",
        "kunyomi_ja",
        "difficulty_tier",
        "order_in_unit",
        "kanji_order_in_unit",
        "reading_variant_order",
      ].join(", "),
    )
    .eq("is_published", true)
    .in("id", ids);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as QuestionMasterRow[]).filter(
    (row) => normalizeText(row.target_text) && normalizeText(row.answer_text),
  );
}

async function fetchSupplementalQuestionMasterRows(db: any, excludeIds: Set<number>) {
  const { data, error } = await db
    .from("questions_master")
    .select(
      [
        "id",
        "unit",
        "category",
        "question_type",
        "is_published",
        "prompt",
        "translation_en",
        "hint_ja",
        "hint_en",
        "explanation_ja",
        "explanation_en",
        "answer_text",
        "answer_aliases",
        "target_text",
        "target_ruby",
        "ruby_annotations",
        "meaning_ja",
        "meaning_en",
        "onyomi_ja",
        "kunyomi_ja",
        "difficulty_tier",
        "order_in_unit",
        "kanji_order_in_unit",
        "reading_variant_order",
      ].join(", "),
    )
    .eq("is_published", true)
    .eq("category", "kanji")
    .eq("question_type", "input")
    .eq("quiz_mode", "ordered")
    .limit(1000);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as QuestionMasterRow[])
    .filter((row) => !excludeIds.has(row.id))
    .filter((row) => normalizeText(row.target_text) && normalizeText(row.answer_text));
}

export async function handleMeaningRandomReviewQuestions() {
  try {
    const auth = await getStudentOr401();
    if (auth.response) return auth.response;

    const studentAccountId = auth.studentAccountId;
    const db = supabaseAdmin as any;

    const account = await getAccount(db, studentAccountId);

    const [{ data: normalAttempts }, { data: reviewAttempts }] =
      await Promise.all([
        db
          .from("kanji_attempts")
          .select("kanji, unit, order_in_unit, quiz_type, is_correct, answered_at")
          .eq("student_account_id", studentAccountId)
          .eq("quiz_type", "meaning_choice")
          .order("answered_at", { ascending: false })
          .limit(2000),

        db
          .from("kanji_meaning_random_review_attempts")
          .select("kanji, is_correct, answered_at")
          .eq("student_account_id", studentAccountId)
          .order("answered_at", { ascending: false })
          .limit(2000),
      ]);

    const normalRows = (normalAttempts ?? []) as KanjiAttemptRow[];
    const normalStats = getMeaningStats(normalRows);
    const reviewStats = getReviewStatsByKanji((reviewAttempts ?? []) as ReviewAttemptRow[]);
    const seenKanji = Array.from(normalStats.keys());

    let candidateRows: MeaningHintRow[] = [];

    if (seenKanji.length > 0) {
      const { data, error } = await db
        .from("kanji_hints")
        .select(
          "kanji, unit, order_in_unit, meaning_en, meaning_ja, onyomi_ja, kunyomi_ja, example_words_ja, example_words_en, is_published",
        )
        .eq("is_published", true)
        .in("kanji", seenKanji);

      if (error) throw new Error(error.message);

      candidateRows = ((data ?? []) as MeaningHintRow[]).filter((row) =>
        normalizeText(row.meaning_en),
      );
    }

    const existingKanji = new Set(candidateRows.map((row) => row.kanji));

    if (candidateRows.length < 5) {
      const { data, error } = await db
        .from("kanji_hints")
        .select(
          "kanji, unit, order_in_unit, meaning_en, meaning_ja, onyomi_ja, kunyomi_ja, example_words_ja, example_words_en, is_published",
        )
        .eq("is_published", true)
        .not("meaning_en", "is", null)
        .limit(1000);

      if (error) throw new Error(error.message);

      const supplemental = ((data ?? []) as MeaningHintRow[])
        .filter((row) => normalizeText(row.meaning_en))
        .filter((row) => !existingKanji.has(row.kanji));

      candidateRows = [...candidateRows, ...supplemental];
    }

    const scored = candidateRows.map((row) =>
      scoreMeaningQuestion({
        row,
        normalStats,
        reviewStats,
        supplemental: !normalStats.has(row.kanji),
      }),
    );

    const selected = pickTopFive(scored);
    const selectedRows = selected.map((item) => item.item);
    const choicesByKanji = await getMeaningChoices(db, selectedRows);

    return NextResponse.json({
      ok: true,
      reviewSessionId: randomUUID(),
      account,
      quiz_type: "meaning_choice",
      questions: selected.map((item) =>
        toMeaningQuestion({
          row: item.item,
          selection_reason: item.selection_reason,
          choices: choicesByKanji.get(item.item.kanji) ?? [
            normalizeText(item.item.meaning_en),
          ],
        }),
      ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load meaning random review.",
      },
      { status: 500 },
    );
  }
}

export async function handleReadingRandomReviewQuestions() {
  try {
    const auth = await getStudentOr401();
    if (auth.response) return auth.response;

    const studentAccountId = auth.studentAccountId;
    const db = supabaseAdmin as any;

    const account = await getAccount(db, studentAccountId);

    const [{ data: historyRowsRaw }, { data: reviewAttemptsRaw }] =
      await Promise.all([
        db
          .from("student_reading_question_history")
          .select(
            "question_id, unit, kanji_order_in_unit, reading_variant_order, shown_count, correct_count, wrong_count, last_shown_at, needs_review",
          )
          .eq("student_account_id", studentAccountId)
          .order("last_shown_at", { ascending: false })
          .limit(2000),

        db
          .from("kanji_reading_random_review_attempts")
          .select("question_id, is_correct, answered_at")
          .eq("student_account_id", studentAccountId)
          .order("answered_at", { ascending: false })
          .limit(2000),
      ]);

    const historyRows = (historyRowsRaw ?? []) as ReadingHistoryRow[];
    const historyById = new Map<number, ReadingHistoryRow>();

    for (const row of historyRows) {
      const questionId = normalizeQuestionId(row.question_id);
      if (questionId == null) continue;
      historyById.set(questionId, row);
    }

    const reviewedById = getReviewStatsByQuestionId(
      (reviewAttemptsRaw ?? []) as ReviewAttemptRow[],
    );

    const seenIds = Array.from(historyById.keys());
    const seenIdSet = new Set(seenIds);

    const seenQuestionRows = await fetchQuestionMasterRowsByIds(db, seenIds);
    const supplementalRows =
      seenQuestionRows.length < 5
        ? await fetchSupplementalQuestionMasterRows(db, seenIdSet)
        : [];

    const scoredSeen = seenQuestionRows.map((row) =>
      scoreReadingQuestion({
        row,
        history: historyById.get(row.id) ?? null,
        review: reviewedById.get(row.id),
        supplemental: false,
      }),
    );

    const scoredSupplemental = supplementalRows.map((row) =>
      scoreReadingQuestion({
        row,
        history: null,
        review: reviewedById.get(row.id),
        supplemental: true,
      }),
    );

    const selected = pickTopFive([...scoredSeen, ...scoredSupplemental]);

    return NextResponse.json({
      ok: true,
      reviewSessionId: randomUUID(),
      account,
      quiz_type: "reading_input",
      questions: selected.map((item) =>
        toInputQuestion({
          row: item.item,
          kind: "reading",
          selection_reason: item.selection_reason,
        }),
      ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load reading random review.",
      },
      { status: 500 },
    );
  }
}

export async function handleWritingRandomReviewQuestions() {
  try {
    const auth = await getStudentOr401();
    if (auth.response) return auth.response;

    const studentAccountId = auth.studentAccountId;
    const db = supabaseAdmin as any;

    const account = await getAccount(db, studentAccountId);

    const [{ data: historyRowsRaw }, { data: reviewAttemptsRaw }] =
      await Promise.all([
        db
          .from("student_kanji_writing_question_history")
          .select(
            "question_id, unit, difficulty_tier, set_number, order_in_unit, prompt, target_text, answer_text, user_answer, correct_answer, is_correct, answered_at",
          )
          .eq("student_account_id", studentAccountId)
          .order("answered_at", { ascending: false })
          .limit(2000),

        db
          .from("kanji_writing_random_review_attempts")
          .select("question_id, is_correct, answered_at")
          .eq("student_account_id", studentAccountId)
          .order("answered_at", { ascending: false })
          .limit(2000),
      ]);

    const historyRows = (historyRowsRaw ?? []) as WritingHistoryRow[];
    const historyById = new Map<number, WritingHistoryRow[]>();

    for (const row of historyRows) {
      const questionId = normalizeQuestionId(row.question_id);
      if (questionId == null) continue;

      const current = historyById.get(questionId) ?? [];
      current.push(row);
      historyById.set(questionId, current);
    }

    const reviewedById = getReviewStatsByQuestionId(
      (reviewAttemptsRaw ?? []) as ReviewAttemptRow[],
    );

    const seenIds = Array.from(historyById.keys());
    const seenIdSet = new Set(seenIds);

    const seenQuestionRows = await fetchQuestionMasterRowsByIds(db, seenIds);
    const supplementalRows =
      seenQuestionRows.length < 5
        ? await fetchSupplementalQuestionMasterRows(db, seenIdSet)
        : [];

    const scoredSeen = seenQuestionRows.map((row) =>
      scoreWritingQuestion({
        row,
        historyRows: historyById.get(row.id) ?? [],
        review: reviewedById.get(row.id),
        supplemental: false,
      }),
    );

    const scoredSupplemental = supplementalRows.map((row) =>
      scoreWritingQuestion({
        row,
        historyRows: [],
        review: reviewedById.get(row.id),
        supplemental: true,
      }),
    );

    const selected = pickTopFive([...scoredSeen, ...scoredSupplemental]);

    return NextResponse.json({
      ok: true,
      reviewSessionId: randomUUID(),
      account,
      quiz_type: "writing_input",
      questions: selected.map((item) =>
        toInputQuestion({
          row: item.item,
          kind: "writing",
          selection_reason: item.selection_reason,
        }),
      ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load writing random review.",
      },
      { status: 500 },
    );
  }
}

export async function handleMeaningRandomReviewAttempts(request: NextRequest) {
  try {
    const auth = await getStudentOr401();
    if (auth.response) return auth.response;

    const studentAccountId = auth.studentAccountId;
    const db = supabaseAdmin as any;
    const body = await request.json();

    const reviewSessionId =
      normalizeText(body?.reviewSessionId) || normalizeText(body?.review_session_id) || randomUUID();

    const attempts = Array.isArray(body?.attempts) ? body.attempts : [];

    if (attempts.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No attempts were provided." },
        { status: 400 },
      );
    }

    const kanjiList = uniqueTexts(attempts.map((item: any) => item?.kanji));

    const { data: hintRowsRaw, error } = await db
      .from("kanji_hints")
      .select("kanji, unit, order_in_unit, meaning_en, meaning_ja")
      .eq("is_published", true)
      .in("kanji", kanjiList);

    if (error) throw new Error(error.message);

    const hintsByKanji = new Map<string, MeaningHintRow>();

    for (const row of (hintRowsRaw ?? []) as MeaningHintRow[]) {
      hintsByKanji.set(row.kanji, row);
    }

    const rowsToInsert = attempts.flatMap((item: any) => {
      const kanji = normalizeText(item?.kanji);
      const hint = hintsByKanji.get(kanji);

      if (!hint) return [];

      const userAnswer = normalizeText(item?.user_answer ?? item?.userAnswer);
      const correctAnswer = normalizeText(hint.meaning_en);
      const isCorrect =
        userAnswer.toLowerCase() === correctAnswer.toLowerCase();

      return [
        {
          student_account_id: studentAccountId,
          review_session_id: reviewSessionId,
          kanji,
          unit: hint.unit,
          order_in_unit: hint.order_in_unit,
          quiz_type: "meaning_choice",
          target_text: kanji,
          user_answer: userAnswer,
          correct_answer: correctAnswer,
          is_correct: isCorrect,
          meaning_en: correctAnswer,
          meaning_ja: normalizeText(hint.meaning_ja),
          selection_reason: normalizeSelectionReason(item?.selection_reason),
        },
      ];
    });

    if (rowsToInsert.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid attempts were provided." },
        { status: 400 },
      );
    }

    const { error: insertError } = await db
      .from("kanji_meaning_random_review_attempts")
      .insert(rowsToInsert);

    if (insertError) throw new Error(insertError.message);

    return NextResponse.json({
      ok: true,
      savedCount: rowsToInsert.length,
      reviewSessionId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to save meaning random review attempts.",
      },
      { status: 500 },
    );
  }
}

export async function handleReadingRandomReviewAttempts(request: NextRequest) {
  try {
    const auth = await getStudentOr401();
    if (auth.response) return auth.response;

    const studentAccountId = auth.studentAccountId;
    const db = supabaseAdmin as any;
    const body = await request.json();

    const reviewSessionId =
      normalizeText(body?.reviewSessionId) || normalizeText(body?.review_session_id) || randomUUID();

    const attempts = Array.isArray(body?.attempts) ? body.attempts : [];

    if (attempts.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No attempts were provided." },
        { status: 400 },
      );
    }

    const questionIds = Array.from(
      new Set(
        attempts
          .map((item: any) => normalizeQuestionId(item?.question_id ?? item?.id))
          .filter((id: number | null): id is number => id != null),
      ),
    );

    const questionRows = await fetchQuestionMasterRowsByIds(db, questionIds);
    const questionsById = new Map(questionRows.map((row) => [row.id, row]));

    const rowsToInsert = attempts.flatMap((item: any) => {
      const questionId = normalizeQuestionId(item?.question_id ?? item?.id);
      if (questionId == null) return [];

      const question = questionsById.get(questionId);
      if (!question) return [];

      const userAnswer = normalizeText(item?.user_answer ?? item?.userAnswer);
      const correctAnswer = normalizeText(question.answer_text);

      const isCorrect = judgeReadingAnswer({
        userAnswer,
        answerText: question.answer_text,
        answerAliases: question.answer_aliases ?? [],
      });

      return [
        {
          student_account_id: studentAccountId,
          review_session_id: reviewSessionId,
          question_id: question.id,
          unit: question.unit,
          difficulty_tier: normalizeText(question.difficulty_tier) || "normal",
          set_number: getSetNumber({
            kanjiOrderInUnit: question.kanji_order_in_unit,
            orderInUnit: question.order_in_unit,
          }),
          order_in_unit: question.order_in_unit,
          kanji_order_in_unit: question.kanji_order_in_unit,
          reading_variant_order: question.reading_variant_order,
          quiz_type: "reading_input",
          prompt: normalizeText(question.prompt),
          target_text: normalizeText(question.target_text),
          user_answer: userAnswer,
          correct_answer: correctAnswer,
          is_correct: isCorrect,
          selection_reason: normalizeSelectionReason(item?.selection_reason),
        },
      ];
    });

    if (rowsToInsert.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid attempts were provided." },
        { status: 400 },
      );
    }

    const { error: insertError } = await db
      .from("kanji_reading_random_review_attempts")
      .insert(rowsToInsert);

    if (insertError) throw new Error(insertError.message);

    return NextResponse.json({
      ok: true,
      savedCount: rowsToInsert.length,
      reviewSessionId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to save reading random review attempts.",
      },
      { status: 500 },
    );
  }
}

export async function handleWritingRandomReviewAttempts(request: NextRequest) {
  try {
    const auth = await getStudentOr401();
    if (auth.response) return auth.response;

    const studentAccountId = auth.studentAccountId;
    const db = supabaseAdmin as any;
    const body = await request.json();

    const reviewSessionId =
      normalizeText(body?.reviewSessionId) || normalizeText(body?.review_session_id) || randomUUID();

    const attempts = Array.isArray(body?.attempts) ? body.attempts : [];

    if (attempts.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No attempts were provided." },
        { status: 400 },
      );
    }

    const questionIds = Array.from(
      new Set(
        attempts
          .map((item: any) => normalizeQuestionId(item?.question_id ?? item?.id))
          .filter((id: number | null): id is number => id != null),
      ),
    );

    const questionRows = await fetchQuestionMasterRowsByIds(db, questionIds);
    const questionsById = new Map(questionRows.map((row) => [row.id, row]));

    const rowsToInsert = attempts.flatMap((item: any) => {
      const questionId = normalizeQuestionId(item?.question_id ?? item?.id);
      if (questionId == null) return [];

      const question = questionsById.get(questionId);
      if (!question) return [];

      const userAnswer = normalizeText(item?.user_answer ?? item?.userAnswer);
      const correctAnswer = normalizeText(question.target_text);

      const isCorrect = judgeKanjiWritingAnswer({
        userAnswer,
        targetText: question.target_text,
      });

      return [
        {
          student_account_id: studentAccountId,
          review_session_id: reviewSessionId,
          question_id: question.id,
          unit: question.unit,
          difficulty_tier: normalizeText(question.difficulty_tier) || "normal",
          set_number: getSetNumber({
            kanjiOrderInUnit: question.kanji_order_in_unit,
            orderInUnit: question.order_in_unit,
          }),
          order_in_unit: question.order_in_unit,
          kanji_order_in_unit: question.kanji_order_in_unit,
          quiz_type: "writing_input",
          prompt: normalizeText(question.prompt),
          target_text: normalizeText(question.target_text),
          answer_text: normalizeText(question.answer_text),
          user_answer: userAnswer,
          correct_answer: correctAnswer,
          is_correct: isCorrect,
          selection_reason: normalizeSelectionReason(item?.selection_reason),
        },
      ];
    });

    if (rowsToInsert.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid attempts were provided." },
        { status: 400 },
      );
    }

    const { error: insertError } = await db
      .from("kanji_writing_random_review_attempts")
      .insert(rowsToInsert);

    if (insertError) throw new Error(insertError.message);

    return NextResponse.json({
      ok: true,
      savedCount: rowsToInsert.length,
      reviewSessionId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to save writing random review attempts.",
      },
      { status: 500 },
    );
  }
}