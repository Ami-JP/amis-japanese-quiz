import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStudentSession } from "@/lib/auth/student";

const QUESTION_LIMIT = 5;
const REVIEW_LIMIT = 10;

type StudentAccount = {
  id: string;
  student_login_id: string;
  display_name: string | null;
  is_active: boolean;
  current_unit: string | null;
};

type StudentProgress = {
  student_account_id: string;
  unit: string;
  last_order_completed: number;
  last_studied_at: string | null;
  is_completed: boolean;
};

type KanjiHintRow = {
  kanji: string;
  meaning_ja: string | null;
  meaning_en: string | null;
  school_grade: string | null;
  jlpt_level: string | null;
  unit: string | null;
  order_in_unit: number | null;
  tags: string | null;
};

type AttemptRow = {
  kanji: string;
  unit: string | null;
  order_in_unit: number;
  quiz_type: string;
  user_answer: string;
  correct_answer: string;
  is_correct: boolean;
};

type AttemptHistoryRow = {
  kanji: string;
  unit: string | null;
  order_in_unit: number | null;
  is_correct: boolean;
  answered_at: string;
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

function shuffleArray<T>(items: T[]): T[] {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function normalizeText(text: string | null | undefined): string {
  return (text ?? "").trim();
}

function buildMeaningLabel(row: { meaning_en: string | null }): string {
  return normalizeText(row.meaning_en);
}

function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  return tags
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

function hasSharedTags(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const setA = new Set(a);
  return b.some((tag) => setA.has(tag));
}

function uniquePreserveOrder<T>(items: T[]) {
  return Array.from(new Set(items));
}

function sortRowsByKanjiOrder(rows: KanjiHintRow[], kanjis: string[]) {
  const rowMap = new Map<string, KanjiHintRow>();

  for (const row of rows) {
    if (!rowMap.has(row.kanji)) {
      rowMap.set(row.kanji, row);
    }
  }

  return kanjis
    .map((kanji) => rowMap.get(kanji))
    .filter((row): row is KanjiHintRow => Boolean(row));
}

function makeQuizItems(sourceRows: KanjiHintRow[], pool: KanjiHintRow[]) {
  return sourceRows
    .filter((q) => q.order_in_unit !== null && normalizeText(q.meaning_en))
    .map((q) => {
      const correctLabel = buildMeaningLabel(q);
      const currentTags = parseTags(q.tags);

      const baseCandidates = pool.filter((item) => {
        if (item.kanji === q.kanji) return false;
        const label = buildMeaningLabel(item);
        if (!label) return false;
        if (label === correctLabel) return false;
        return true;
      });

      let narrowedCandidates = baseCandidates;

      const noSharedTagCandidates = baseCandidates.filter((item) => {
        const itemTags = parseTags(item.tags);
        return !hasSharedTags(currentTags, itemTags);
      });

      if (noSharedTagCandidates.length >= 3) {
        narrowedCandidates = noSharedTagCandidates;
      } else if (q.school_grade) {
        const sameGrade = baseCandidates.filter(
          (item) => item.school_grade === q.school_grade
        );
        const sameGradeNoShared = sameGrade.filter((item) => {
          const itemTags = parseTags(item.tags);
          return !hasSharedTags(currentTags, itemTags);
        });

        if (sameGradeNoShared.length >= 3) {
          narrowedCandidates = sameGradeNoShared;
        } else if (sameGrade.length >= 3) {
          narrowedCandidates = sameGrade;
        }
      } else if (q.jlpt_level) {
        const sameJlpt = baseCandidates.filter(
          (item) => item.jlpt_level === q.jlpt_level
        );
        const sameJlptNoShared = sameJlpt.filter((item) => {
          const itemTags = parseTags(item.tags);
          return !hasSharedTags(currentTags, itemTags);
        });

        if (sameJlptNoShared.length >= 3) {
          narrowedCandidates = sameJlptNoShared;
        } else if (sameJlpt.length >= 3) {
          narrowedCandidates = sameJlpt;
        }
      }

      const uniqueWrongLabels = Array.from(
        new Set(
          narrowedCandidates
            .map((item) => buildMeaningLabel(item))
            .filter(Boolean)
        )
      );

      const wrongLabels = shuffleArray(uniqueWrongLabels).slice(0, 3);

      const options = shuffleArray([
        { label: correctLabel, isCorrect: true },
        ...wrongLabels.map((label) => ({
          label,
          isCorrect: false,
        })),
      ]);

      return {
        kanji: q.kanji,
        unit: q.unit,
        order_in_unit: q.order_in_unit!,
        questionText:
          "Which of the following is closest in meaning to this kanji?",
        correctAnswer: correctLabel,
        options,
      };
    });
}

async function fetchKanjiPool(db: any, unit?: string) {
  let query = db
    .from("kanji_hints")
    .select(
      "kanji, meaning_ja, meaning_en, school_grade, jlpt_level, unit, order_in_unit, tags"
    )
    .eq("is_published", true)
    .not("meaning_en", "is", null);

  if (unit) {
    query = query.eq("unit", unit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as KanjiHintRow[];
}

async function getCurrentProgress(db: any, accountId: string, unit: string) {
  const { data, error } = await db
    .from("student_kanji_progress")
    .select(
      "student_account_id, unit, last_order_completed, last_studied_at, is_completed"
    )
    .eq("student_account_id", accountId)
    .eq("unit", unit)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as StudentProgress | null;
}

async function moveToNextUnitIfNeeded(params: {
  supabase: any;
  accountId: string;
  currentUnit: string;
  newLastOrderCompleted: number;
}) {
  const { supabase, accountId, currentUnit, newLastOrderCompleted } = params;
  const db = supabase as any;

  const { count: remainingCount, error: remainingError } = await db
    .from("kanji_hints")
    .select("*", { count: "exact", head: true })
    .eq("unit", currentUnit)
    .eq("is_published", true)
    .gt("order_in_unit", newLastOrderCompleted);

  if (remainingError) {
    throw new Error(remainingError.message);
  }

  if ((remainingCount ?? 0) > 0) {
    return { nextUnit: null };
  }

  const completeProgressRow = {
    student_account_id: accountId,
    unit: currentUnit,
    last_order_completed: newLastOrderCompleted,
    last_studied_at: new Date().toISOString(),
    is_completed: true,
  };

  const { error: completeProgressError } = await db
    .from("student_kanji_progress")
    .upsert(completeProgressRow);

  if (completeProgressError) {
    throw new Error(completeProgressError.message);
  }

  const { data: nextUnitRowRaw, error: nextUnitError } = await db
    .from("kanji_hints")
    .select("unit")
    .eq("is_published", true)
    .gt("unit", currentUnit)
    .order("unit", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (nextUnitError) {
    throw new Error(nextUnitError.message);
  }

  const nextUnitRow = nextUnitRowRaw as { unit: string | null } | null;

  if (!nextUnitRow?.unit) {
    return { nextUnit: null };
  }

  const nextUnit = nextUnitRow.unit;

  const { error: updateAccountError } = await db
    .from("student_accounts")
    .update({ current_unit: nextUnit })
    .eq("id", accountId);

  if (updateAccountError) {
    throw new Error(updateAccountError.message);
  }

  const nextProgressRow = {
    student_account_id: accountId,
    unit: nextUnit,
    last_order_completed: 0,
    last_studied_at: null,
    is_completed: false,
  };

  const { error: nextProgressError } = await db
    .from("student_kanji_progress")
    .upsert(nextProgressRow);

  if (nextProgressError) {
    throw new Error(nextProgressError.message);
  }

  return { nextUnit };
}

function getLatestWrongKanji(attempts: AttemptHistoryRow[]) {
  const latestByKanji = new Map<
    string,
    { kanji: string; order_in_unit: number | null; is_correct: boolean }
  >();

  for (const row of attempts) {
    if (!latestByKanji.has(row.kanji)) {
      latestByKanji.set(row.kanji, {
        kanji: row.kanji,
        order_in_unit: row.order_in_unit,
        is_correct: row.is_correct,
      });
    }
  }

  return Array.from(latestByKanji.values())
    .filter((row) => row.is_correct === false)
    .map((row) => row.kanji);
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

  const { data: accountRaw, error: accountError } = await db
    .from("student_accounts")
    .select("id, student_login_id, display_name, is_active, current_unit")
    .eq("id", session.studentAccountId)
    .single();

  const account = accountRaw as StudentAccount | null;

  if (accountError || !account) {
    return {
      account: null,
      errorResponse: NextResponse.json(
        { error: accountError?.message ?? "Account not found." },
        { status: 400 }
      ),
    };
  }

  if (!account.is_active) {
    return {
      account: null,
      errorResponse: NextResponse.json(
        { error: "This account is inactive." },
        { status: 403 }
      ),
    };
  }

  return {
    account,
    errorResponse: null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const db = supabase as any;

    const mode =
      (request.nextUrl.searchParams.get("mode") as
        | "normal"
        | "review-wrong"
        | "review-studied"
        | "practice-set"
        | "practice-unit") ?? "normal";

    const requestedUnit = normalizeText(request.nextUrl.searchParams.get("unit"));
    const startOrderParam = Number(
      request.nextUrl.searchParams.get("startOrder") ?? 0
    );
    const endOrderParam = Number(
      request.nextUrl.searchParams.get("endOrder") ?? 0
    );

    const { account, errorResponse } = await getLoggedInAccount(db);
    if (!account) {
      return errorResponse!;
    }

    if (mode === "review-wrong" || mode === "review-studied") {
      const globalPool = await fetchKanjiPool(db);

      const { data: attemptsRaw, error: attemptsError } = await db
        .from("kanji_attempts")
        .select("kanji, unit, order_in_unit, is_correct, answered_at")
        .eq("student_account_id", account.id)
        .eq("quiz_type", "meaning_choice")
        .order("answered_at", { ascending: false });

      if (attemptsError) {
        return NextResponse.json(
          { error: attemptsError.message },
          { status: 400 }
        );
      }

      const attempts = (attemptsRaw ?? []) as AttemptHistoryRow[];

      const targetKanjis =
        mode === "review-wrong"
          ? getLatestWrongKanji(attempts).slice(0, REVIEW_LIMIT)
          : uniquePreserveOrder(attempts.map((row) => row.kanji)).slice(
              0,
              REVIEW_LIMIT
            );

      if (targetKanjis.length === 0) {
        const progress = account.current_unit
          ? await getCurrentProgress(db, account.id, account.current_unit)
          : null;

        return NextResponse.json({
          account: {
            display_name: account.display_name,
            student_login_id: account.student_login_id,
          },
          unit: account.current_unit ?? "",
          lastOrderCompleted: progress?.last_order_completed ?? 0,
          mode,
          lockedToUnit: false,
          finished: true,
          questions: [],
        });
      }

      const sourceRows = sortRowsByKanjiOrder(globalPool, targetKanjis).slice(
        0,
        REVIEW_LIMIT
      );

      const progress = account.current_unit
        ? await getCurrentProgress(db, account.id, account.current_unit)
        : null;

      return NextResponse.json({
        account: {
          display_name: account.display_name,
          student_login_id: account.student_login_id,
        },
        unit: account.current_unit ?? sourceRows[0]?.unit ?? "",
        lastOrderCompleted: progress?.last_order_completed ?? 0,
        mode,
        lockedToUnit: false,
        finished: sourceRows.length === 0,
        questions: makeQuizItems(sourceRows, globalPool),
      });
    }

    if (mode === "practice-set") {
      const unit = requestedUnit;
      const startOrder = startOrderParam;
      const endOrder = endOrderParam;

      if (!unit || !startOrder || !endOrder) {
        return NextResponse.json(
          { error: "unit, startOrder, and endOrder are required." },
          { status: 400 }
        );
      }

      const unitPool = await fetchKanjiPool(db, unit);

      const sourceRows = shuffleArray(
        unitPool
          .filter(
            (row) =>
              row.order_in_unit !== null &&
              row.order_in_unit >= startOrder &&
              row.order_in_unit <= endOrder
          )
          .sort((a, b) => (a.order_in_unit ?? 0) - (b.order_in_unit ?? 0))
      );

      const progress = await getCurrentProgress(db, account.id, unit);

      return NextResponse.json({
        account: {
          display_name: account.display_name,
          student_login_id: account.student_login_id,
        },
        unit,
        lastOrderCompleted: progress?.last_order_completed ?? 0,
        mode,
        lockedToUnit: true,
        finished: sourceRows.length === 0,
        questions: makeQuizItems(sourceRows, unitPool),
      });
    }

    if (mode === "practice-unit") {
      const unit = requestedUnit;
      const startOrder = startOrderParam > 0 ? startOrderParam : 1;

      if (!unit) {
        return NextResponse.json(
          { error: "unit is required." },
          { status: 400 }
        );
      }

      const unitPool = await fetchKanjiPool(db, unit);

      const orderedRows = unitPool
        .filter(
          (row) =>
            row.order_in_unit !== null && row.order_in_unit >= startOrder
        )
        .sort((a, b) => (a.order_in_unit ?? 0) - (b.order_in_unit ?? 0))
        .slice(0, QUESTION_LIMIT);

      const sourceRows = shuffleArray(orderedRows);

      const progress = await getCurrentProgress(db, account.id, unit);

      return NextResponse.json({
        account: {
          display_name: account.display_name,
          student_login_id: account.student_login_id,
        },
        unit,
        lastOrderCompleted: progress?.last_order_completed ?? 0,
        mode,
        lockedToUnit: true,
        finished: sourceRows.length === 0,
        questions: makeQuizItems(sourceRows, unitPool),
      });
    }

    const lockedToUnit = Boolean(requestedUnit);
    let activeUnit = requestedUnit || account.current_unit;

    if (!activeUnit) {
      return NextResponse.json(
        { error: "current_unit is empty." },
        { status: 400 }
      );
    }

    let activePool = await fetchKanjiPool(db, activeUnit);
    let progress = await getCurrentProgress(db, account.id, activeUnit);
    let activeLastOrderCompleted = progress?.last_order_completed ?? 0;

    let orderedRows = activePool
      .filter(
        (row) =>
          row.order_in_unit !== null &&
          row.order_in_unit > activeLastOrderCompleted
      )
      .sort((a, b) => (a.order_in_unit ?? 0) - (b.order_in_unit ?? 0))
      .slice(0, QUESTION_LIMIT);

    if (orderedRows.length === 0 && !lockedToUnit) {
      const { data: nextUnitRowRaw, error: nextUnitError } = await db
        .from("kanji_hints")
        .select("unit")
        .eq("is_published", true)
        .gt("unit", activeUnit)
        .order("unit", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextUnitError) {
        return NextResponse.json(
          { error: nextUnitError.message },
          { status: 400 }
        );
      }

      const nextUnitRow = nextUnitRowRaw as { unit: string | null } | null;

      if (nextUnitRow?.unit) {
        activeUnit = nextUnitRow.unit;

        const { error: updateCurrentUnitError } = await db
          .from("student_accounts")
          .update({ current_unit: activeUnit })
          .eq("id", account.id);

        if (updateCurrentUnitError) {
          return NextResponse.json(
            { error: updateCurrentUnitError.message },
            { status: 400 }
          );
        }

        const nextProgressRow = {
          student_account_id: account.id,
          unit: activeUnit,
          last_order_completed: 0,
          last_studied_at: null,
          is_completed: false,
        };

        const { error: upsertNextProgressError } = await db
          .from("student_kanji_progress")
          .upsert(nextProgressRow);

        if (upsertNextProgressError) {
          return NextResponse.json(
            { error: upsertNextProgressError.message },
            { status: 400 }
          );
        }

        activePool = await fetchKanjiPool(db, activeUnit);
        progress = await getCurrentProgress(db, account.id, activeUnit);
        activeLastOrderCompleted = progress?.last_order_completed ?? 0;

        orderedRows = activePool
          .filter(
            (row) =>
              row.order_in_unit !== null &&
              row.order_in_unit > activeLastOrderCompleted
          )
          .sort((a, b) => (a.order_in_unit ?? 0) - (b.order_in_unit ?? 0))
          .slice(0, QUESTION_LIMIT);
      }
    }

    const sourceRows = shuffleArray(orderedRows);

    return NextResponse.json({
      account: {
        display_name: account.display_name,
        student_login_id: account.student_login_id,
      },
      unit: activeUnit,
      lastOrderCompleted: activeLastOrderCompleted,
      mode,
      lockedToUnit,
      finished: sourceRows.length === 0,
      questions: makeQuizItems(sourceRows, activePool),
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

    const unit = typeof body.unit === "string" ? body.unit : "";
    const advanceCount =
      typeof body.advanceCount === "number" ? body.advanceCount : 0;
    const mode =
      (body.mode as
        | "normal"
        | "review-wrong"
        | "review-studied"
        | "practice-set"
        | "practice-unit") ?? "normal";
    const attempts = (body.attempts ?? []) as AttemptRow[];
    const lockToUnit = body.lockToUnit === true;

    const { account, errorResponse } = await getLoggedInAccount(db);
    if (!account) {
      return errorResponse!;
    }

    if (attempts.length > 0) {
      const now = new Date().toISOString();

      const rows = attempts.map((item) => ({
        student_account_id: account.id,
        kanji: item.kanji,
        unit: item.unit ?? unit,
        order_in_unit: item.order_in_unit,
        quiz_type: item.quiz_type,
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

    if (mode === "normal") {
      if (!unit) {
        return NextResponse.json(
          { error: "unit is required." },
          { status: 400 }
        );
      }

      const progress = await getCurrentProgress(db, account.id, unit);

      const newLastOrderCompleted =
        (progress?.last_order_completed ?? 0) + advanceCount;

      const progressRow = {
        student_account_id: account.id,
        unit,
        last_order_completed: newLastOrderCompleted,
        last_studied_at: new Date().toISOString(),
        is_completed: false,
      };

      const { error: upsertError } = await db
        .from("student_kanji_progress")
        .upsert(progressRow);

      if (upsertError) {
        return NextResponse.json(
          { error: upsertError.message },
          { status: 400 }
        );
      }

      const { error: updateCurrentUnitError } = await db
        .from("student_accounts")
        .update({ current_unit: unit })
        .eq("id", account.id);

      if (updateCurrentUnitError) {
        return NextResponse.json(
          { error: updateCurrentUnitError.message },
          { status: 400 }
        );
      }

      if (!lockToUnit) {
        await moveToNextUnitIfNeeded({
          supabase,
          accountId: account.id,
          currentUnit: unit,
          newLastOrderCompleted,
        });
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