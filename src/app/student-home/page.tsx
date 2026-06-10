import { redirect } from "next/navigation";
import { getStudentSession } from "@/lib/auth/student";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  ALL_KANJI_UNIT_IDS,
  ALL_KANJI_UNITS,
  KANJI_LEVELS,
  getQuizHref,
} from "@/lib/kanjiUnits";

type AccountRow = {
  display_name: string | null;
  student_login_id: string | null;
  current_unit: string | null;
};

type KanjiHintRow = {
  kanji: string | null;
  unit: string | null;
  order_in_unit: number | null;
};

type ProgressRow = {
  unit: string | null;
  completed_count: number | null;
  last_order_completed: number | null;
  last_studied_at: string | null;
  is_completed: boolean | null;
};

type ReadingHistoryRow = {
  question_id: string | number | null;
  unit: string | null;
  kanji_order_in_unit: number | null;
  shown_count: number | null;
  last_shown_at: string | null;
};

type ReadingQuestionLookupRow = {
  id: string | number | null;
  unit: string | null;
  kanji_order_in_unit: number | null;
};

type LevelStatus = {
  meaningClear: boolean;
  readingClear: boolean;
};

function normalizeText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

function normalizeNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function sortByLastStudiedDesc<T extends { last_studied_at: string | null }>(
  a: T,
  b: T
) {
  const aTime = a.last_studied_at ? new Date(a.last_studied_at).getTime() : 0;
  const bTime = b.last_studied_at ? new Date(b.last_studied_at).getTime() : 0;
  return bTime - aTime;
}

function getNextUnitAfter(unit: string, completedMap: Map<string, number>) {
  const index = ALL_KANJI_UNITS.findIndex((item) => item.unit === unit);

  if (index === -1) {
    return ALL_KANJI_UNITS.find((item) => (completedMap.get(item.unit) ?? 0) < 1)
      ?.unit;
  }

  return ALL_KANJI_UNITS.slice(index + 1).find(
    (item) => (completedMap.get(item.unit) ?? 0) < 1
  )?.unit;
}

function getContinueUnit(
  progressRows: ProgressRow[],
  completedMap: Map<string, number>,
  fallbackUnit?: string | null
) {
  const validUnitSet = new Set(ALL_KANJI_UNIT_IDS);

  const rows = progressRows.filter((row) => {
    const unit = normalizeText(row.unit);
    return unit && validUnitSet.has(unit);
  });

  const partialRows = rows
    .filter(
      (row) =>
        normalizeNumber(row.last_order_completed) > 0 &&
        normalizeNumber(row.completed_count) < 1
    )
    .sort(sortByLastStudiedDesc);

  const partialUnit = normalizeText(partialRows[0]?.unit);
  if (partialUnit) return partialUnit;

  const latestRows = rows
    .filter((row) => normalizeText(row.last_studied_at))
    .sort(sortByLastStudiedDesc);

  const latestUnit = normalizeText(latestRows[0]?.unit);

  if (latestUnit) {
    if ((completedMap.get(latestUnit) ?? 0) < 1) {
      return latestUnit;
    }

    const nextUnit = getNextUnitAfter(latestUnit, completedMap);
    if (nextUnit) return nextUnit;
  }

  const safeFallback = normalizeText(fallbackUnit);
  if (safeFallback && validUnitSet.has(safeFallback)) {
    return safeFallback;
  }

  const firstIncomplete = ALL_KANJI_UNITS.find(
    (item) => (completedMap.get(item.unit) ?? 0) < 1
  );

  return firstIncomplete?.unit ?? ALL_KANJI_UNITS[0].unit;
}

function buildKanjiIndexes(kanjiHints: KanjiHintRow[]) {
  const kanjiSet = new Set<string>();
  const hintsByUnit = new Map<string, KanjiHintRow[]>();
  const kanjiByUnitOrder = new Map<string, string>();

  for (const row of kanjiHints) {
    const kanji = normalizeText(row.kanji);
    const unit = normalizeText(row.unit);
    const order = normalizeNumber(row.order_in_unit);

    if (!kanji || !unit || order <= 0) continue;

    kanjiSet.add(kanji);

    const currentRows = hintsByUnit.get(unit) ?? [];
    currentRows.push(row);
    hintsByUnit.set(unit, currentRows);

    kanjiByUnitOrder.set(`${unit}::${order}`, kanji);
  }

  for (const [unit, rows] of hintsByUnit.entries()) {
    hintsByUnit.set(
      unit,
      [...rows].sort(
        (a, b) =>
          normalizeNumber(a.order_in_unit) - normalizeNumber(b.order_in_unit)
      )
    );
  }

  return {
    kanjiSet,
    hintsByUnit,
    kanjiByUnitOrder,
  };
}

async function fetchAllPublishedKanjiHints(db: any): Promise<KanjiHintRow[]> {
  const pageSize = 1000;
  let from = 0;
  const allRows: KanjiHintRow[] = [];

  while (true) {
    const to = from + pageSize - 1;

    const { data, error } = await db
      .from("kanji_hints")
      .select("kanji, unit, order_in_unit")
      .eq("is_published", true)
      .order("unit", { ascending: true })
      .order("order_in_unit", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as KanjiHintRow[];
    allRows.push(...rows);

    if (rows.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return allRows;
}


async function fetchAllStudentReadingHistory(
  db: any,
  studentAccountId: string
): Promise<ReadingHistoryRow[]> {
  const pageSize = 1000;
  let from = 0;
  const allRows: ReadingHistoryRow[] = [];

  while (true) {
    const to = from + pageSize - 1;

    const { data, error } = await db
      .from("student_reading_question_history")
      .select("question_id, unit, kanji_order_in_unit, shown_count, last_shown_at")
      .eq("student_account_id", studentAccountId)
      .range(from, to);

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as ReadingHistoryRow[];
    allRows.push(...rows);

    if (rows.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return allRows;
}

async function fetchReadingQuestionLookupRowsByIds(
  db: any,
  questionIds: string[]
): Promise<ReadingQuestionLookupRow[]> {
  const uniqueIds = Array.from(new Set(questionIds.map(normalizeText).filter(Boolean)));

  if (uniqueIds.length === 0) {
    return [];
  }

  const chunkSize = 500;
  const allRows: ReadingQuestionLookupRow[] = [];

  for (let index = 0; index < uniqueIds.length; index += chunkSize) {
    const chunk = uniqueIds.slice(index, index + chunkSize);

    const { data, error } = await db
      .from("questions_master")
      .select("id, unit, kanji_order_in_unit")
      .in("id", chunk);

    if (error) {
      throw new Error(error.message);
    }

    allRows.push(...((data ?? []) as ReadingQuestionLookupRow[]));
  }

  return allRows;
}

function addMeaningLearnedKanji(params: {
  learnedKanjiSet: Set<string>;
  progressRows: ProgressRow[];
  hintsByUnit: Map<string, KanjiHintRow[]>;
}) {
  const { learnedKanjiSet, progressRows, hintsByUnit } = params;

  for (const progress of progressRows) {
    const unit = normalizeText(progress.unit);
    const lastOrderCompleted = normalizeNumber(progress.last_order_completed);
    if (!unit || lastOrderCompleted <= 0) continue;

    const hintRows = hintsByUnit.get(unit) ?? [];

    for (const hint of hintRows) {
      const order = normalizeNumber(hint.order_in_unit);
      const kanji = normalizeText(hint.kanji);

      if (kanji && order > 0 && order <= lastOrderCompleted) {
        learnedKanjiSet.add(kanji);
      }
    }
  }
}

function addReadingLearnedKanji(params: {
  learnedKanjiSet: Set<string>;
  readingHistoryRows: ReadingHistoryRow[];
  readingQuestionMap: Map<string, ReadingQuestionLookupRow>;
  kanjiByUnitOrder: Map<string, string>;
  hintsByUnit: Map<string, KanjiHintRow[]>;
  readingProgressRows: ProgressRow[];
}) {
  const {
    learnedKanjiSet,
    readingHistoryRows,
    readingQuestionMap,
    kanjiByUnitOrder,
    hintsByUnit,
    readingProgressRows,
  } = params;

  for (const history of readingHistoryRows) {
    const hasActuallySeenQuestion =
      normalizeNumber(history.shown_count) > 0 ||
      normalizeText(history.last_shown_at) !== "";

    if (!hasActuallySeenQuestion) {
      continue;
    }

    const questionId = normalizeText(history.question_id);
    const question = questionId ? readingQuestionMap.get(questionId) : null;

    const unit = normalizeText(question?.unit) || normalizeText(history.unit);
    const kanjiOrder =
      normalizeNumber(question?.kanji_order_in_unit) ||
      normalizeNumber(history.kanji_order_in_unit);

    if (!unit || kanjiOrder <= 0) {
      continue;
    }

    const learnedKanji = kanjiByUnitOrder.get(`${unit}::${kanjiOrder}`);

    if (learnedKanji) {
      learnedKanjiSet.add(learnedKanji);
    }
  }

  for (const progress of readingProgressRows) {
    const unit = normalizeText(progress.unit);

    if (!unit || normalizeNumber(progress.completed_count) < 1) {
      continue;
    }

    const hintRows = hintsByUnit.get(unit) ?? [];

    for (const hint of hintRows) {
      const kanji = normalizeText(hint.kanji);
      if (kanji) {
        learnedKanjiSet.add(kanji);
      }
    }
  }
}
export default async function StudentHomePage() {
  const session = await getStudentSession();

  if (!session?.studentAccountId) {
    redirect("/student-login");
  }

  const db = supabaseAdmin as any;

  const [
    { data: accountRaw },
    kanjiHintRows,
    { data: meaningProgressRowsRaw },
    { data: readingProgressRowsRaw },
    readingHistoryRows,
  ] = await Promise.all([
    db
      .from("student_accounts")
      .select("display_name, student_login_id, current_unit")
      .eq("id", session.studentAccountId)
      .maybeSingle(),

    fetchAllPublishedKanjiHints(db),

    db
      .from("student_kanji_progress")
      .select(
        "unit, completed_count, last_order_completed, last_studied_at, is_completed"
      )
      .eq("student_account_id", session.studentAccountId)
      .in("unit", ALL_KANJI_UNIT_IDS),

    db
      .from("student_reading_progress")
      .select(
        "unit, completed_count, last_order_completed, last_studied_at, is_completed"
      )
      .eq("student_account_id", session.studentAccountId)
      .eq("difficulty_tier", "normal")
      .in("unit", ALL_KANJI_UNIT_IDS),

    fetchAllStudentReadingHistory(db, session.studentAccountId),
  ]);

  const readingQuestionIds = Array.from(
    new Set(readingHistoryRows.map((row) => normalizeText(row.question_id)).filter(Boolean))
  );

  const readingQuestionRows = await fetchReadingQuestionLookupRowsByIds(
    db,
    readingQuestionIds
  );

  const account = accountRaw as AccountRow | null;
  const meaningProgressRows = (meaningProgressRowsRaw ?? []) as ProgressRow[];
  const readingProgressRows = (readingProgressRowsRaw ?? []) as ProgressRow[];

  const { kanjiSet, hintsByUnit, kanjiByUnitOrder } =
    buildKanjiIndexes(kanjiHintRows);

  const readingQuestionMap = new Map<string, ReadingQuestionLookupRow>();

  for (const row of readingQuestionRows) {
    const id = normalizeText(row.id);
    if (id) {
      readingQuestionMap.set(id, row);
    }
  }

  const meaningProgressMap = new Map<string, number>();
  const readingProgressMap = new Map<string, number>();

  for (const row of meaningProgressRows) {
    const unit = normalizeText(row.unit);
    if (unit) {
      meaningProgressMap.set(unit, normalizeNumber(row.completed_count));
    }
  }

  for (const row of readingProgressRows) {
    const unit = normalizeText(row.unit);
    if (unit) {
      readingProgressMap.set(unit, normalizeNumber(row.completed_count));
    }
  }

  const levelStatusMap: Record<number, LevelStatus> = {};

  for (const level of KANJI_LEVELS) {
    const meaningClear = level.units.every(
      (unit) => (meaningProgressMap.get(unit.unit) ?? 0) >= 1
    );

    const readingClear = level.units.every(
      (unit) => (readingProgressMap.get(unit.unit) ?? 0) >= 1
    );

    levelStatusMap[level.level] = {
      meaningClear,
      readingClear,
    };
  }

  const meaningLearnedKanjiSet = new Set<string>();
  const readingLearnedKanjiSet = new Set<string>();

  addMeaningLearnedKanji({
    learnedKanjiSet: meaningLearnedKanjiSet,
    progressRows: meaningProgressRows,
    hintsByUnit,
  });

  addReadingLearnedKanji({
    learnedKanjiSet: readingLearnedKanjiSet,
    readingHistoryRows,
    readingQuestionMap,
    kanjiByUnitOrder,
    hintsByUnit,
    readingProgressRows,
  });

  const totalKanjiCount = kanjiSet.size;

  const meaningLearnedKanjiCount = Array.from(meaningLearnedKanjiSet).filter(
    (kanji) => kanjiSet.has(kanji)
  ).length;

  const readingLearnedKanjiCount = Array.from(readingLearnedKanjiSet).filter(
    (kanji) => kanjiSet.has(kanji)
  ).length;

  const meaningProgressPercent =
    totalKanjiCount > 0
      ? Math.min(
          100,
          Math.round((meaningLearnedKanjiCount / totalKanjiCount) * 100)
        )
      : 0;

  const readingProgressPercent =
    totalKanjiCount > 0
      ? Math.min(
          100,
          Math.round((readingLearnedKanjiCount / totalKanjiCount) * 100)
        )
      : 0;

  const continueMeaningUnit = getContinueUnit(
    meaningProgressRows,
    meaningProgressMap,
    account?.current_unit
  );

  const continueReadingUnit = getContinueUnit(
    readingProgressRows,
    readingProgressMap
  );

  return (
    <main style={styles.page}>
      <form action="/api/student-logout" method="post" style={styles.logoutForm}>
        <button type="submit" style={styles.logoutButton}>
          Log out
        </button>
      </form>

      <section style={styles.card}>
        <div style={styles.header}>
          <p style={styles.kicker}>Kanji Quiz</p>
          <h1 style={styles.title}>
            Welcome{account?.display_name ? `, ${account.display_name}` : ""}!
          </h1>
          <p style={styles.subtitle}>
            Choose a level and practice the meaning or reading.
          </p>
        </div>

        <section style={styles.progressPanel}>
          <div style={styles.progressMainRow}>
            <div style={styles.progressTextBlock}>
              <p style={styles.progressLabel}>ここまで学習した漢字</p>
              <p style={styles.progressNote}>意味と読みを別々に表示しています</p>
            </div>

            <p style={styles.encourageText}>✨ その調子！</p>
          </div>

          <div style={styles.progressSplitGrid}>
            <div style={{ ...styles.progressMetricCard, ...styles.meaningProgressCard }}>
              <div style={styles.progressMetricTop}>
                <span style={styles.progressMetricLabel}>意味</span>
                <span style={styles.progressMetricSub}>Meaning</span>
              </div>

              <p style={styles.progressMetricNumber}>
                {meaningLearnedKanjiCount} / {totalKanjiCount}
              </p>

              <div
                style={styles.progressBarTrack}
                aria-label={`Meaning quiz kanji progress ${meaningProgressPercent}%`}
              >
                <div
                  style={{
                    ...styles.progressBarFill,
                    ...styles.meaningProgressFill,
                    width: `${meaningProgressPercent}%`,
                  }}
                />
              </div>
            </div>

            <div style={{ ...styles.progressMetricCard, ...styles.readingProgressCard }}>
              <div style={styles.progressMetricTop}>
                <span style={styles.progressMetricLabel}>読み</span>
                <span style={styles.progressMetricSub}>Reading</span>
              </div>

              <p style={styles.progressMetricNumber}>
                {readingLearnedKanjiCount} / {totalKanjiCount}
              </p>

              <div
                style={styles.progressBarTrack}
                aria-label={`Reading quiz kanji progress ${readingProgressPercent}%`}
              >
                <div
                  style={{
                    ...styles.progressBarFill,
                    ...styles.readingProgressFill,
                    width: `${readingProgressPercent}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <p style={styles.smallStepText}>
            今日の小さな一歩：
            <span style={styles.smallStepStrong}>5問だけでOK 🌱</span>
          </p>

          <div style={styles.continueBox}>
            <p style={styles.continueTitle}>Continue</p>
            <p style={styles.continueSub}>前回の続きから始める</p>

            <div style={styles.continueGrid}>
              <a
                href={getQuizHref(continueMeaningUnit, "meaning")}
                style={{
                  ...styles.continueButton,
                  ...styles.meaningButton,
                }}
              >
                <span style={styles.continueMain}>Meaning</span>
                <span style={styles.continueSmall}>意味クイズ</span>
              </a>

              <a
                href={getQuizHref(continueReadingUnit, "reading")}
                style={{
                  ...styles.continueButton,
                  ...styles.readingButton,
                }}
              >
                <span style={styles.continueMain}>Reading</span>
                <span style={styles.continueSmall}>読みクイズ</span>
              </a>
            </div>
          </div>
        </section>

        <div style={styles.levelList}>
          {KANJI_LEVELS.map((level) => {
            const status = levelStatusMap[level.level] ?? {
              meaningClear: false,
              readingClear: false,
            };

            return (
              <section key={level.level} style={styles.levelCard}>
                <div style={styles.levelHeader}>
                  <div>
                    <p style={styles.levelText}>Kanji Level</p>
                    <h2 style={styles.levelTitle}>{level.levelLabel}</h2>
                  </div>

                  <span style={styles.unitCountBadge}>
                    {level.unitCount} units
                  </span>
                </div>

                <div style={styles.buttonGrid}>
                  <a
                    href={`/student-home/level/${level.level}?quiz=meaning`}
                    style={{
                      ...styles.quizButton,
                      ...styles.meaningButton,
                    }}
                  >
                    {status.meaningClear ? (
                      <span style={styles.clearStamp}>CLEAR</span>
                    ) : null}
                    <span style={styles.buttonMain}>Meaning Quiz</span>
                    <span style={styles.buttonSub}>意味クイズ</span>
                  </a>

                  <a
                    href={`/student-home/level/${level.level}?quiz=reading`}
                    style={{
                      ...styles.quizButton,
                      ...styles.readingButton,
                    }}
                  >
                    {status.readingClear ? (
                      <span style={styles.clearStamp}>CLEAR</span>
                    ) : null}
                    <span style={styles.buttonMain}>Reading Quiz</span>
                    <span style={styles.buttonSub}>読みクイズ</span>
                  </a>
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh",
    background:
      "linear-gradient(180deg, #f8fbff 0%, #e8f2ff 45%, #fff6e8 100%)",
    padding: "28px 16px",
    color: "#172033",
    fontFamily:
      'Arial Rounded MT Bold, Arial, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif',
  },

  logoutForm: {
    width: "min(920px, 100%)",
    margin: "0 auto 12px",
    display: "flex",
    justifyContent: "flex-end",
  },

  logoutButton: {
    border: "3px solid #1f2b3d",
    borderRadius: 999,
    background: "#ffffff",
    color: "#1f2b3d",
    padding: "10px 18px",
    fontSize: 15,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 4px 0 rgba(31,43,61,0.12)",
  },

  card: {
    width: "min(920px, 100%)",
    margin: "0 auto",
    background: "rgba(255,255,255,0.92)",
    border: "3px solid #1f2b3d",
    borderRadius: 28,
    padding: "26px 18px 22px",
    boxShadow: "0 12px 0 rgba(31,43,61,0.12)",
  },

  header: {
    textAlign: "center",
    marginBottom: 16,
  },

  kicker: {
    margin: 0,
    fontSize: 15,
    fontWeight: 900,
    color: "#4d97d4",
    letterSpacing: 1,
  },

  title: {
    margin: "6px 0 8px",
    fontSize: "clamp(30px, 5vw, 48px)",
    fontWeight: 900,
    lineHeight: 1.05,
  },

  subtitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: "#536174",
  },

  progressPanel: {
    background: "#f6f9ff",
    border: "2px solid #d7e6f8",
    borderRadius: 22,
    padding: "14px 16px 16px",
    marginBottom: 18,
  },

  progressMainRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 10,
  },

  progressTextBlock: {
    minWidth: 0,
  },

  progressLabel: {
    margin: 0,
    fontSize: 13,
    fontWeight: 900,
    color: "#6d7c90",
  },

  progressNote: {
    margin: "3px 0 0",
    fontSize: 12,
    fontWeight: 800,
    color: "#6d7c90",
  },

  progressSplitGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
    marginBottom: 10,
  },

  progressMetricCard: {
    border: "2px solid #d7e6f8",
    borderRadius: 18,
    padding: "10px 10px 9px",
    background: "#ffffff",
    minWidth: 0,
  },

  meaningProgressCard: {
    background: "#fff9df",
  },

  readingProgressCard: {
    background: "#edf7ff",
  },

  progressMetricTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
  },

  progressMetricLabel: {
    fontSize: 17,
    fontWeight: 900,
    color: "#172033",
  },

  progressMetricSub: {
    fontSize: 11,
    fontWeight: 900,
    color: "#6d7c90",
  },

  progressMetricNumber: {
    margin: "4px 0 5px",
    fontSize: "clamp(24px, 5vw, 34px)",
    fontWeight: 900,
    lineHeight: 1,
    color: "#172033",
  },

  progressNumber: {
    margin: "2px 0 0",
    fontSize: "clamp(32px, 6vw, 46px)",
    fontWeight: 900,
    lineHeight: 1,
    color: "#172033",
  },

  encourageText: {
    margin: "4px 0 0",
    color: "#172033",
    fontSize: "clamp(15px, 2.8vw, 18px)",
    fontWeight: 900,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  },

  progressBarTrack: {
    width: "100%",
    height: 12,
    borderRadius: 999,
    background: "#e3edf8",
    overflow: "hidden",
    marginTop: 6,
    marginBottom: 8,
  },

  progressBarFill: {
    height: "100%",
    borderRadius: 999,
    background: "#7fb8e8",
  },

  meaningProgressFill: {
    background: "#f0c64f",
  },

  readingProgressFill: {
    background: "#7fb8e8",
  },

  smallStepText: {
    margin: "0 0 12px",
    fontSize: 14,
    fontWeight: 900,
    color: "#536174",
  },

  smallStepStrong: {
    color: "#172033",
  },

  continueBox: {
    marginTop: 2,
  },

  continueTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 900,
    color: "#172033",
    textAlign: "center",
  },

  continueSub: {
    margin: "2px 0 10px",
    fontSize: 13,
    fontWeight: 800,
    color: "#536174",
    textAlign: "center",
  },

  continueGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },

  continueButton: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 66,
    borderRadius: 18,
    border: "3px solid #1f2b3d",
    textDecoration: "none",
    color: "#172033",
    boxShadow: "0 6px 0 rgba(31,43,61,0.12)",
    padding: "9px 8px",
    textAlign: "center",
  },

  continueMain: {
    fontSize: 18,
    fontWeight: 900,
    lineHeight: 1.1,
  },

  continueSmall: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: 800,
    color: "#516071",
  },

  levelList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 16,
  },

  levelCard: {
    border: "3px solid #1f2b3d",
    borderRadius: 22,
    background: "#ffffff",
    padding: 18,
    boxShadow: "0 7px 0 rgba(31,43,61,0.12)",
  },

  levelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },

  levelText: {
    margin: 0,
    color: "#6d7c90",
    fontSize: 14,
    fontWeight: 900,
  },

  levelTitle: {
    margin: 0,
    fontSize: "clamp(30px, 4vw, 42px)",
    fontWeight: 900,
    lineHeight: 1.05,
  },

  unitCountBadge: {
    background: "#ffffff",
    color: "#172033",
    border: "3px solid #1f2b3d",
    borderRadius: 999,
    padding: "8px 13px",
    fontSize: 13,
    fontWeight: 900,
    whiteSpace: "nowrap",
    boxShadow: "0 4px 0 rgba(31,43,61,0.10)",
  },

  buttonGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },

  quizButton: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 86,
    borderRadius: 20,
    border: "3px solid #1f2b3d",
    textDecoration: "none",
    color: "#172033",
    boxShadow: "0 7px 0 rgba(31,43,61,0.12)",
    padding: "12px 10px",
    textAlign: "center",
  },

  meaningButton: {
    background: "#fff3c4",
  },

  readingButton: {
    background: "#d9ecff",
  },

  buttonMain: {
    fontSize: "clamp(17px, 2.5vw, 20px)",
    fontWeight: 900,
    lineHeight: 1.1,
  },

  buttonSub: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: 800,
    color: "#516071",
  },

  clearStamp: {
    position: "absolute",
    top: 8,
    right: 8,
    border: "2px solid #c62828",
    color: "#c62828",
    background: "rgba(255,255,255,0.92)",
    borderRadius: 999,
    padding: "3px 8px",
    fontSize: 11,
    fontWeight: 900,
    transform: "rotate(8deg)",
  },
};