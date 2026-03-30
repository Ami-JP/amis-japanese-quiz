import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const TEST_LOGIN_ID = "test_ami_001";
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
  order_in_unit: number;
  quiz_type: string;
  user_answer: string;
  correct_answer: string;
  is_correct: boolean;
};

type AttemptHistoryRow = {
  kanji: string;
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

async function moveToNextUnitIfNeeded(params: {
  supabase: ReturnType<typeof createClient>;
  accountId: string;
  currentUnit: string;
  newLastOrderCompleted: number;
}) {
  const { supabase, accountId, currentUnit, newLastOrderCompleted } = params;

  const { count: remainingCount, error: remainingError } = await supabase
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

  const { error: completeProgressError } = await supabase
    .from("student_kanji_progress")
    .update({
      is_completed: true,
      last_studied_at: new Date().toISOString(),
    })
    .eq("student_account_id", accountId)
    .eq("unit", currentUnit);

  if (completeProgressError) {
    throw new Error(completeProgressError.message);
  }

  const { data: nextUnitRow, error: nextUnitError } = await supabase
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

  if (!nextUnitRow?.unit) {
    return { nextUnit: null };
  }

  const nextUnit = nextUnitRow.unit;

  const { error: updateAccountError } = await supabase
    .from("student_accounts")
    .update({ current_unit: nextUnit })
    .eq("id", accountId);

  if (updateAccountError) {
    throw new Error(updateAccountError.message);
  }

  const { error: nextProgressError } = await supabase
    .from("student_kanji_progress")
    .upsert({
      student_account_id: accountId,
      unit: nextUnit,
      last_order_completed: 0,
      last_studied_at: null,
      is_completed: false,
    });

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

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const mode = request.nextUrl.searchParams.get("mode") ?? "normal";

    const { data: account, error: accountError } = await supabase
      .from("student_accounts")
      .select("id, student_login_id, display_name, is_active, current_unit")
      .eq("student_login_id", TEST_LOGIN_ID)
      .single<StudentAccount>();

    if (accountError || !account) {
      return NextResponse.json(
        { error: accountError?.message ?? "Test account not found." },
        { status: 400 }
      );
    }

    if (!account.is_active) {
      return NextResponse.json(
        { error: "This account is inactive." },
        { status: 403 }
      );
    }

    if (!account.current_unit) {
      return NextResponse.json(
        { error: "current_unit is empty." },
        { status: 400 }
      );
    }

    const { data: progress } = await supabase
      .from("student_kanji_progress")
      .select(
        "student_account_id, unit, last_order_completed, last_studied_at, is_completed"
      )
      .eq("student_account_id", account.id)
      .eq("unit", account.current_unit)
      .single<StudentProgress>();

    const lastOrderCompleted = progress?.last_order_completed ?? 0;

    const { data: poolRows, error: poolError } = await supabase
      .from("kanji_hints")
      .select(
        "kanji, meaning_ja, meaning_en, school_grade, jlpt_level, unit, order_in_unit, tags"
      )
      .eq("unit", account.current_unit)
      .eq("is_published", true)
      .not("meaning_en", "is", null)
      .returns<KanjiHintRow[]>();

    if (poolError) {
      return NextResponse.json({ error: poolError.message }, { status: 400 });
    }

    const pool = poolRows ?? [];

    if (mode === "review-wrong") {
      const { data: attempts, error: attemptsError } = await supabase
        .from("kanji_attempts")
        .select("kanji, order_in_unit, is_correct, answered_at")
        .eq("student_account_id", account.id)
        .eq("unit", account.current_unit)
        .eq("quiz_type", "meaning_choice")
        .order("answered_at", { ascending: false })
        .returns<AttemptHistoryRow[]>();

      if (attemptsError) {
        return NextResponse.json(
          { error: attemptsError.message },
          { status: 400 }
        );
      }

      const wrongKanjis = getLatestWrongKanji(attempts ?? []);

      if (wrongKanjis.length === 0) {
        return NextResponse.json({
          account: {
            display_name: account.display_name,
            student_login_id: account.student_login_id,
          },
          unit: account.current_unit,
          lastOrderCompleted,
          mode,
          finished: true,
          questions: [],
        });
      }

      const wrongRows = pool.filter((row) => wrongKanjis.includes(row.kanji));
      const sourceRows = shuffleArray(wrongRows).slice(0, REVIEW_LIMIT);

      return NextResponse.json({
        account: {
          display_name: account.display_name,
          student_login_id: account.student_login_id,
        },
        unit: account.current_unit,
        lastOrderCompleted,
        mode,
        finished: sourceRows.length === 0,
        questions: makeQuizItems(sourceRows, pool),
      });
    }

    if (mode === "review-studied") {
      const studiedRows = pool.filter((row) => {
        if (row.order_in_unit === null) return false;
        return row.order_in_unit <= lastOrderCompleted;
      });

      const sourceRows = shuffleArray(studiedRows).slice(0, REVIEW_LIMIT);

      return NextResponse.json({
        account: {
          display_name: account.display_name,
          student_login_id: account.student_login_id,
        },
        unit: account.current_unit,
        lastOrderCompleted,
        mode,
        finished: sourceRows.length === 0,
        questions: makeQuizItems(sourceRows, pool),
      });
    }

    let activeUnit = account.current_unit;
    let activePool = pool;
    let activeLastOrderCompleted = lastOrderCompleted;

    let orderedRows = activePool
      .filter(
        (row) =>
          row.order_in_unit !== null &&
          row.order_in_unit > activeLastOrderCompleted
      )
      .sort((a, b) => (a.order_in_unit ?? 0) - (b.order_in_unit ?? 0))
      .slice(0, QUESTION_LIMIT);

    if (orderedRows.length === 0) {
      const { data: nextUnitRow, error: nextUnitError } = await supabase
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

      if (nextUnitRow?.unit) {
        activeUnit = nextUnitRow.unit;

        await supabase
          .from("student_accounts")
          .update({ current_unit: activeUnit })
          .eq("id", account.id);

        await supabase.from("student_kanji_progress").upsert({
          student_account_id: account.id,
          unit: activeUnit,
          last_order_completed: 0,
          last_studied_at: null,
          is_completed: false,
        });

        const { data: nextPoolRows, error: nextPoolError } = await supabase
          .from("kanji_hints")
          .select(
            "kanji, meaning_ja, meaning_en, school_grade, jlpt_level, unit, order_in_unit, tags"
          )
          .eq("unit", activeUnit)
          .eq("is_published", true)
          .not("meaning_en", "is", null)
          .returns<KanjiHintRow[]>();

        if (nextPoolError) {
          return NextResponse.json(
            { error: nextPoolError.message },
            { status: 400 }
          );
        }

        activePool = nextPoolRows ?? [];
        activeLastOrderCompleted = 0;

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
    const body = await request.json();

    const loginId = body.loginId as string;
    const unit = body.unit as string;
    const advanceCount = body.advanceCount as number;
    const mode = (body.mode as string) ?? "normal";
    const attempts = (body.attempts ?? []) as AttemptRow[];

    const { data: account, error: accountError } = await supabase
      .from("student_accounts")
      .select("id, current_unit")
      .eq("student_login_id", loginId)
      .single();

    if (accountError || !account) {
      return NextResponse.json(
        { error: accountError?.message ?? "Account not found." },
        { status: 400 }
      );
    }

    if (attempts.length > 0) {
      const rows = attempts.map((item) => ({
        student_account_id: account.id,
        kanji: item.kanji,
        unit,
        order_in_unit: item.order_in_unit,
        quiz_type: item.quiz_type,
        user_answer: item.user_answer,
        correct_answer: item.correct_answer,
        is_correct: item.is_correct,
        answered_at: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase
        .from("kanji_attempts")
        .insert(rows);

      if (insertError) {
        return NextResponse.json(
          { error: insertError.message },
          { status: 400 }
        );
      }
    }

    if (mode === "normal") {
      const { data: progress } = await supabase
        .from("student_kanji_progress")
        .select("last_order_completed")
        .eq("student_account_id", account.id)
        .eq("unit", unit)
        .single();

      const newLastOrderCompleted =
        (progress?.last_order_completed ?? 0) + advanceCount;

      const { error: upsertError } = await supabase
        .from("student_kanji_progress")
        .upsert({
          student_account_id: account.id,
          unit,
          last_order_completed: newLastOrderCompleted,
          last_studied_at: new Date().toISOString(),
          is_completed: false,
        });

      if (upsertError) {
        return NextResponse.json({ error: upsertError.message }, { status: 400 });
      }

      await moveToNextUnitIfNeeded({
        supabase,
        accountId: account.id,
        currentUnit: unit,
        newLastOrderCompleted,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}