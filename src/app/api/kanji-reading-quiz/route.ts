import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStudentSession } from "@/lib/auth/student";

const QUESTION_LIMIT = 5;
const TABLE_NAME = "questions_master";

type StudentAccount = { id: string; student_login_id: string; display_name: string | null; is_active: boolean };
type ReadingQuestionRow = {
  id: string | number | null;
  unit: string | null;
  category: string | null;
  question_type: string | null;
  order_in_unit: number | null;
  kanji_order_in_unit: number | null;
  reading_variant_order: number | null;
  is_published: boolean | null;
  prompt: string | null;
  translation_en: string | null;
  target_text: string | null;
  target_ruby: string | null;
  ruby_annotations: unknown;
  answer_text: string | null;
  answer_aliases: unknown;
  meaning_en: string | null;
  hint_kanji_keys: unknown;
  hint_en: string | null;
  explanation_en: string | null;
  difficulty_tier: string | null;
};
type ReadingProgress = { student_account_id: string; unit: string; difficulty_tier: string; last_order_completed: number; last_studied_at: string | null; is_completed: boolean };
type AttemptRow = { question_id: string | number | null; unit: string | null; order_in_unit: number; kanji_order_in_unit?: number | null; reading_variant_order?: number | null; prompt: string; target_text: string; user_answer: string; correct_answer: string; is_correct: boolean; difficulty_tier: string };

type RubyAnnotationItem = { text: string; ruby: string };
type ReadingHistoryRow = { question_id: string; shown_count: number; correct_count: number; wrong_count: number; last_shown_at: string | null };

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase environment variables.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function normalizeText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  return "";
}
function normalizeNumber(value: unknown): number | null { const num = Number(value); return Number.isFinite(num) ? num : null; }
function normalizeDifficultyTier(value: unknown): string { const text = normalizeText(value).toLowerCase(); return text || "normal"; }
function questionIdKey(id: string | number | null) { return normalizeText(id); }

function parseLooseJsonArray(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  const text = value.trim();
  if (!text || text === "null") return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {}
  return text.split(/[、,\n]/).map((item) => item.trim()).filter(Boolean);
}

function parseRubyAnnotationStringItem(value: string): RubyAnnotationItem | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const separatorIndex = normalized.search(/[:：]/);
  if (separatorIndex === -1) return { text: normalized, ruby: "" };
  const text = normalized.slice(0, separatorIndex).trim();
  const ruby = normalized.slice(separatorIndex + 1).trim();
  if (!text) return null;
  return { text, ruby };
}

function parseRubyAnnotations(value: unknown): RubyAnnotationItem[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "string") return parseRubyAnnotationStringItem(item);
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        const text = normalizeText(obj.text) || normalizeText(obj.word) || normalizeText(obj.kanji);
        const ruby = normalizeText(obj.ruby) || normalizeText(obj.reading) || normalizeText(obj.furigana);
        if (!text) return null;
        return { text, ruby };
      }
      return null;
    }).filter((item): item is RubyAnnotationItem => item !== null);
  }
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw || raw === "null") return [];
    try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parseRubyAnnotations(parsed); } catch {}
    return raw.split(/[、,\n]/).map((item) => parseRubyAnnotationStringItem(item)).filter((item): item is RubyAnnotationItem => item !== null);
  }
  return [];
}

function pickString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const text = normalizeText(row[key]);
    if (text) return text;
  }
  return "";
}

async function getLoggedInAccount(db: any) {
  const session = await getStudentSession();
  if (!session?.studentAccountId) {
    return { account: null, errorResponse: NextResponse.json({ error: "Unauthorized. Please log in again." }, { status: 401 }) };
  }
  const { data, error } = await db.from("student_accounts").select("id, student_login_id, display_name, is_active").eq("id", session.studentAccountId).single();
  if (error || !data) {
    return { account: null, errorResponse: NextResponse.json({ error: error?.message ?? "Account not found." }, { status: 400 }) };
  }
  const account = data as StudentAccount;
  if (!account.is_active) {
    return { account: null, errorResponse: NextResponse.json({ error: "This account is inactive." }, { status: 403 }) };
  }
  return { account, errorResponse: null };
}

async function getReadingProgress(db: any, studentAccountId: string, unit: string, difficultyTier: string) {
  const { data, error } = await db.from("student_reading_progress")
    .select("student_account_id, unit, difficulty_tier, last_order_completed, last_studied_at, is_completed")
    .eq("student_account_id", studentAccountId)
    .eq("unit", unit)
    .eq("difficulty_tier", difficultyTier)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as ReadingProgress | null;
}

async function hasAdvancedReadingQuestions(db: any, unit: string) {
  const { count, error } = await db.from(TABLE_NAME).select("*", { count: "exact", head: true }).eq("unit", unit).eq("is_published", true).eq("difficulty_tier", "high_level");
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

async function fetchQuestionPool(db: any, unit: string, difficultyTier: string): Promise<ReadingQuestionRow[]> {
  const { data, error } = await db.from(TABLE_NAME)
    .select(`id,unit,category,question_type,order_in_unit,kanji_order_in_unit,reading_variant_order,is_published,prompt,translation_en,target_text,target_ruby,ruby_annotations,answer_text,answer_aliases,meaning_en,hint_kanji_keys,hint_en,explanation_en,difficulty_tier`)
    .eq("unit", unit)
    .eq("is_published", true)
    .order("order_in_unit", { ascending: true })
    .order("kanji_order_in_unit", { ascending: true, nullsFirst: false })
    .order("reading_variant_order", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ReadingQuestionRow[];
  return rows.filter((row) => {
    const tierMatches = normalizeDifficultyTier(row.difficulty_tier) === difficultyTier;
    const category = normalizeText(row.category).toLowerCase();
    const questionType = normalizeText(row.question_type).toLowerCase();
    const hasReadingTarget = normalizeText(row.target_text) !== "" && normalizeText(row.target_ruby) !== "";
    const typeMatches = questionType === "input" || questionType === "kanji_reading" || questionType === "reading_input";
    const categoryMatches = category === "" || category === "kanji" || category === "reading" || category === "kanji_reading";
    return tierMatches && hasReadingTarget && typeMatches && categoryMatches;
  });
}

async function fetchReadingHistoryMap(db: any, studentAccountId: string, questionIds: string[]): Promise<Record<string, ReadingHistoryRow>> {
  if (questionIds.length === 0) return {};
  const { data, error } = await db.from("student_reading_question_history")
    .select("question_id, shown_count, correct_count, wrong_count, last_shown_at")
    .eq("student_account_id", studentAccountId)
    .in("question_id", questionIds);
  if (error) throw new Error(error.message);
  return ((data ?? []) as ReadingHistoryRow[]).reduce<Record<string, ReadingHistoryRow>>((acc, row) => {
    acc[String(row.question_id)] = row;
    return acc;
  }, {});
}

function chooseOneReadingPerKanji(pool: ReadingQuestionRow[], historyMap: Record<string, ReadingHistoryRow>) {
  const groups = new Map<number, ReadingQuestionRow[]>();
  for (const row of pool) {
    const kanjiOrder = normalizeNumber(row.kanji_order_in_unit);
    if (kanjiOrder == null) continue;
    const current = groups.get(kanjiOrder) ?? [];
    current.push(row);
    groups.set(kanjiOrder, current);
  }
  const selected: ReadingQuestionRow[] = [];
  const sortedGroups = Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
  for (const [, rows] of sortedGroups) {
    const sorted = [...rows].sort((a, b) => {
      const aHistory = historyMap[questionIdKey(a.id)];
      const bHistory = historyMap[questionIdKey(b.id)];
      const aShown = aHistory?.shown_count ?? 0;
      const bShown = bHistory?.shown_count ?? 0;
      if (aShown !== bShown) return aShown - bShown;
      const aWrong = aHistory?.wrong_count ?? 0;
      const bWrong = bHistory?.wrong_count ?? 0;
      if (aWrong !== bWrong) return bWrong - aWrong;
      const aLast = aHistory?.last_shown_at ? new Date(aHistory.last_shown_at).getTime() : 0;
      const bLast = bHistory?.last_shown_at ? new Date(bHistory.last_shown_at).getTime() : 0;
      if (aLast !== bLast) return aLast - bLast;
      return (normalizeNumber(a.reading_variant_order) ?? 999999) - (normalizeNumber(b.reading_variant_order) ?? 999999);
    });
    if (sorted[0]) selected.push(sorted[0]);
  }
  return selected.slice(0, QUESTION_LIMIT);
}

async function fetchKanjiHintMap(db: any, keys: string[]): Promise<Record<string, any>> {
  if (keys.length === 0) return {};
  const { data, error } = await db.from("kanji_hints").select("*").in("kanji", keys);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.reduce<Record<string, any>>((acc, row) => {
    const kanji = normalizeText(row.kanji);
    if (!kanji) return acc;
    acc[kanji] = {
      kanji,
      meaning_en: pickString(row, ["meaning_en"]),
      on_yomi: pickString(row, ["on_yomi", "onyomi_ja", "onyomi", "on_reading", "reading_on"]),
      kun_yomi: pickString(row, ["kun_yomi", "kunyomi_ja", "kunyomi", "kun_reading", "reading_kun"]),
      ruby: pickString(row, ["ruby", "reading_hiragana", "reading", "target_ruby"]),
    };
    return acc;
  }, {});
}

function buildQuestionResponse(row: ReadingQuestionRow, hintMap: Record<string, any>) {
  const rubyAnnotationItems = parseRubyAnnotations(row.ruby_annotations);
  const hintKeys = parseLooseJsonArray(row.hint_kanji_keys);
  const promptRubyItems = rubyAnnotationItems.map((item) => {
    if (item.ruby) return { text: item.text, ruby: item.ruby };
    const exact = hintMap[item.text];
    return { text: item.text, ruby: exact?.ruby ?? "" };
  }).filter((item) => item.text && item.ruby);
  const hintKanjiItems = hintKeys.map((key) => {
    const item = hintMap[key];
    return { kanji: key, meaning_ja: "", meaning_en: item?.meaning_en ?? "", on_yomi: item?.on_yomi ?? "", kun_yomi: item?.kun_yomi ?? "" };
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
    meaning_ja: "",
    meaning_en: normalizeText(row.meaning_en),
    hint_ja: "",
    hint_en: normalizeText(row.hint_en),
    explanation_ja: "",
    explanation_en: normalizeText(row.explanation_en),
    hint_kanji_items: hintKanjiItems,
    difficulty_tier: normalizeDifficultyTier(row.difficulty_tier),
  };
}

async function buildHintMapForRows(db: any, rows: ReadingQuestionRow[]) {
  const allHintKeys = Array.from(new Set(rows.flatMap((row) => [
    ...parseLooseJsonArray(row.hint_kanji_keys),
    ...parseRubyAnnotations(row.ruby_annotations).filter((item) => !item.ruby).map((item) => item.text),
  ])));
  return fetchKanjiHintMap(db, allHintKeys);
}

async function updateReadingQuestionHistory(db: any, studentAccountId: string, unit: string, attempts: AttemptRow[]) {
  if (attempts.length === 0) return;
  const now = new Date().toISOString();
  for (const item of attempts) {
    const questionId = questionIdKey(item.question_id);
    if (!questionId) continue;
    const { data: existing, error: fetchError } = await db
      .from("student_reading_question_history")
      .select("id, shown_count, correct_count, wrong_count, kanji_order_in_unit, reading_variant_order")
      .eq("student_account_id", studentAccountId)
      .eq("question_id", questionId)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    const row = {
      student_account_id: studentAccountId,
      question_id: questionId,
      unit: item.unit ?? unit,
      kanji_order_in_unit: item.kanji_order_in_unit ?? existing?.kanji_order_in_unit ?? null,
      reading_variant_order: item.reading_variant_order ?? existing?.reading_variant_order ?? null,
      shown_count: (existing?.shown_count ?? 0) + 1,
      correct_count: (existing?.correct_count ?? 0) + (item.is_correct ? 1 : 0),
      wrong_count: (existing?.wrong_count ?? 0) + (item.is_correct ? 0 : 1),
      last_shown_at: now,
      updated_at: now,
    };
    const { error: upsertError } = await db.from("student_reading_question_history").upsert(row, { onConflict: "student_account_id,question_id" });
    if (upsertError) throw new Error(upsertError.message);
  }
}

function getMaxAttemptOrder(attempts: AttemptRow[]) {
  return attempts.reduce((max, item) => {
    const order = normalizeNumber(item.order_in_unit) ?? 0;
    return order > max ? order : max;
  }, 0);
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const db = supabase as any;
    const { account, errorResponse } = await getLoggedInAccount(db);
    if (!account) return errorResponse!;

    const unit = normalizeText(request.nextUrl.searchParams.get("unit"));
    const difficultyTier = normalizeDifficultyTier(request.nextUrl.searchParams.get("tier"));
    const startFromBeginning = request.nextUrl.searchParams.get("startFromBeginning") === "1";

    if (!unit) return NextResponse.json({ error: "unit is required." }, { status: 400 });

    const [pool, advancedAvailable] = await Promise.all([
      fetchQuestionPool(db, unit, difficultyTier),
      hasAdvancedReadingQuestions(db, unit),
    ]);

    const progress = await getReadingProgress(db, account.id, unit, difficultyTier);
    const effectiveLastOrderCompleted = startFromBeginning ? 0 : progress?.last_order_completed ?? 0;

    const orderedRows = pool
      .filter((row) => row.order_in_unit !== null && row.order_in_unit > effectiveLastOrderCompleted)
      .sort((a, b) => (a.order_in_unit ?? 0) - (b.order_in_unit ?? 0))
      .slice(0, QUESTION_LIMIT);

    const hintMap = await buildHintMapForRows(db, orderedRows);
    const questions = orderedRows.map((row) => buildQuestionResponse(row, hintMap));

    return NextResponse.json({
      account: { display_name: account.display_name, student_login_id: account.student_login_id },
      unit,
      difficulty_tier: difficultyTier,
      mode: "normal",
      lastOrderCompleted: effectiveLastOrderCompleted,
      finished: questions.length === 0 && !startFromBeginning,
      isUnitComplete: questions.length === 0 && !startFromBeginning,
      hasAdvancedAvailable: advancedAvailable,
      questions,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
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
    const attempts = Array.isArray(body.attempts) ? (body.attempts as AttemptRow[]) : [];
    const advanceCount = typeof body.advanceCount === "number" ? body.advanceCount : 0;
    const startFromBeginning = body.startFromBeginning === true;

    if (!unit) return NextResponse.json({ error: "unit is required." }, { status: 400 });

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
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });
      await updateReadingQuestionHistory(db, account.id, unit, attempts);
    }

    const current = await getReadingProgress(db, account.id, unit, difficultyTier);
    const currentLastOrder = startFromBeginning ? 0 : current?.last_order_completed ?? 0;
    const maxAttemptOrder = getMaxAttemptOrder(attempts);
    const newLastOrderCompleted = maxAttemptOrder > 0 ? Math.max(currentLastOrder, maxAttemptOrder) : currentLastOrder + Math.max(advanceCount, 0);

    const baseProgressRow = {
      student_account_id: account.id,
      unit,
      difficulty_tier: difficultyTier,
      last_order_completed: newLastOrderCompleted,
      last_studied_at: new Date().toISOString(),
      is_completed: false,
      updated_at: new Date().toISOString(),
    };
    const { error: upsertError } = await db.from("student_reading_progress").upsert(baseProgressRow);
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 400 });

    const pool = await fetchQuestionPool(db, unit, difficultyTier);
    const hasRemaining = pool.some((row) => (row.order_in_unit ?? 0) > newLastOrderCompleted);
    if (!hasRemaining) {
      const { error: completeError } = await db.from("student_reading_progress").upsert({ ...baseProgressRow, is_completed: true });
      if (completeError) return NextResponse.json({ error: completeError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
