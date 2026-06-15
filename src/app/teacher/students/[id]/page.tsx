import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type StudentProgressRow = {
  student_id: string;
  display_name: string | null;
  student_login_id: string | null;
  is_active: boolean | null;
  current_unit: string | null;
  last_order_completed: number | null;
};

type AttemptRow = {
  id: number;
  student_account_id: string;
  kanji: string;
  unit: string;
  order_in_unit: number;
  quiz_type: string;
  user_answer: string | null;
  correct_answer: string | null;
  is_correct: boolean;
  answered_at: string | null;
};

type UnitProgressRow = {
  unit: string;
  last_order_completed: number | null;
  completed_count: number | null;
  is_completed: boolean | null;
  last_studied_at: string | null;
};

type ReadingProgressRow = UnitProgressRow & {
  difficulty_tier: string | null;
};

type KanjiHintRow = {
  unit: string;
  kanji: string;
  order_in_unit: number | null;
};

type QuestionMasterRow = {
  id: number;
  unit: string;
  category: string;
  question_type: string;
  prompt: string;
  translation_en: string | null;
  answer_text: string | null;
  answer_aliases: unknown;
  target_text: string | null;
  order_in_unit: number | null;
  kanji_order_in_unit: number | null;
  reading_variant_order: number | null;
  hint_kanji_keys: string | null;
  difficulty_tier: string | null;
};

type MistakeHistoryItem = {
  key: string;
  kanji: string;
  unit: string;
  quiz_type: string;
  review_status: "resolved" | "needs_review";
};

type UnitCardData = {
  unit: string;
  grade: number | null;
  status: "completed" | "in_progress" | "not_started";
  is_latest: boolean;
  last_studied_at: string | null;
  meaning_answered_count: number;
  meaning_total_count: number;
  reading_answered_count: number;
  reading_total_count: number;
  advanced_answered_count: number;
  advanced_total_count: number;
  mistake_count: number;
  unresolved_count: number;
};

type GradeGroup = {
  grade: number;
  units: UnitCardData[];
  completed_count: number;
  total_count: number;
  mistake_count: number;
  unresolved_count: number;
  has_latest: boolean;
};

function formatShortDate(value: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isMeaningQuiz(quizType: string | null | undefined) {
  return String(quizType ?? "").includes("meaning");
}

function isReadingQuiz(quizType: string | null | undefined) {
  const value = String(quizType ?? "");
  return value.includes("reading") || value.includes("input");
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[　]/g, "")
    .replace(/[。、，,.!！?？]/g, "");
}

function parseAliases(value: unknown) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);

      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item ?? "").trim()).filter(Boolean);
      }
    } catch {
      return value
        .split(new RegExp("[／/，、,\\n\\r;；|｜]+", "g"))
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function splitAnswerCandidates(value: string | null | undefined) {
  if (!value) return [];

  return String(value)
    .split(new RegExp("[／/，、,\\n\\r;；|｜]+", "g"))
    .map((item) => item.trim())
    .filter(Boolean);
}

function isReadingQuestionMaster(question: QuestionMasterRow) {
  const category = String(question.category ?? "");
  const questionType = String(question.question_type ?? "");

  return (
    category === "kanji" &&
    (questionType.includes("input") ||
      questionType.includes("reading") ||
      Boolean(question.answer_text && /[ぁ-んァ-ン]/.test(question.answer_text)))
  );
}

function getAttemptQuestionKey(attempt: AttemptRow) {
  if (isMeaningQuiz(attempt.quiz_type)) {
    return [attempt.unit, attempt.kanji, attempt.quiz_type].join("__");
  }

  return [
    attempt.unit,
    attempt.kanji,
    attempt.quiz_type,
    attempt.correct_answer ?? "",
  ].join("__");
}

function getUniqueQuestionCount(attempts: AttemptRow[]) {
  return new Set(attempts.map((attempt) => getAttemptQuestionKey(attempt))).size;
}

function normalizeDifficultyTier(value: string | null | undefined) {
  return String(value ?? "normal") === "high_level" ? "high_level" : "normal";
}

function getLatestDate(values: Array<string | null | undefined>) {
  const dates = values
    .filter((value): value is string => Boolean(value))
    .sort();

  return dates.length > 0 ? dates[dates.length - 1] : null;
}

function getLatestStudiedAt(
  meaningProgressList: UnitProgressRow[],
  readingProgressList: ReadingProgressRow[]
) {
  return getLatestDate([
    ...meaningProgressList.map((item) => item.last_studied_at),
    ...readingProgressList.map((item) => item.last_studied_at),
  ]);
}

function countCompletedByProgress<T extends { order_in_unit: number | null }>(
  rows: T[],
  progress: UnitProgressRow | ReadingProgressRow | undefined
) {
  const total = rows.length;

  if (total === 0) return 0;

  if ((progress?.completed_count ?? 0) >= 1 || progress?.is_completed === true) {
    return total;
  }

  const lastOrderCompleted = progress?.last_order_completed ?? 0;

  if (lastOrderCompleted <= 0) return 0;

  return rows.filter((row) => {
    const order = row.order_in_unit ?? 0;
    return order > 0 && order <= lastOrderCompleted;
  }).length;
}

function getGradeFromUnit(unit: string) {
  const match = unit.match(/grade(\d+)-kanji-/);
  if (!match) return null;
  return Number(match[1]);
}

function sortUnitNames(a: string, b: string) {
  const pattern = /grade(\d+)-kanji-(\d+)/;
  const aMatch = a.match(pattern);
  const bMatch = b.match(pattern);

  if (aMatch && bMatch) {
    const aGrade = Number(aMatch[1]);
    const bGrade = Number(bMatch[1]);
    const aUnit = Number(aMatch[2]);
    const bUnit = Number(bMatch[2]);

    if (aGrade !== bGrade) return aGrade - bGrade;
    return aUnit - bUnit;
  }

  return a.localeCompare(b);
}

function getUnitStatus(params: {
  meaningAnswered: number;
  meaningTotal: number;
  readingAnswered: number;
  readingTotal: number;
}) {
  const { meaningAnswered, meaningTotal, readingAnswered, readingTotal } = params;

  const total = meaningTotal + readingTotal;
  const answered = meaningAnswered + readingAnswered;

  if (total > 0 && answered >= total) return "completed";
  if (answered > 0) return "in_progress";
  return "not_started";
}

function getStatusLabel(status: UnitCardData["status"]) {
  if (status === "completed") return "完了";
  if (status === "in_progress") return "途中";
  return "未着手";
}

function getStatusStyle(status: UnitCardData["status"], isLatest: boolean) {
  if (isLatest) {
    return {
      borderColor: "#6366f1",
      background: "#eef2ff",
    };
  }

  if (status === "completed") {
    return {
      borderColor: "#22c55e",
      background: "#dcfce7",
    };
  }

  if (status === "in_progress") {
    return {
      borderColor: "#facc15",
      background: "#fef9c3",
    };
  }

  return {
    borderColor: "#60a5fa",
    background: "#dbeafe",
  };
}

function buildMistakeHistory(attempts: AttemptRow[]) {
  const grouped = new Map<string, AttemptRow[]>();

  for (const attempt of attempts) {
    const key = getAttemptQuestionKey(attempt);
    const list = grouped.get(key) ?? [];
    list.push(attempt);
    grouped.set(key, list);
  }

  const result: MistakeHistoryItem[] = [];

  for (const [key, rows] of grouped) {
    const sortedRows = [...rows].sort((a, b) => {
      const timeA = new Date(a.answered_at ?? "").getTime();
      const timeB = new Date(b.answered_at ?? "").getTime();

      if (timeA !== timeB) return timeA - timeB;

      return a.id - b.id;
    });

    const wrongRows = sortedRows.filter((row) => !row.is_correct);
    if (wrongRows.length === 0) continue;

    const firstWrong = wrongRows[0];
    const latestAttempt = sortedRows[sortedRows.length - 1];

    result.push({
      key,
      kanji: firstWrong.kanji,
      unit: firstWrong.unit,
      quiz_type: firstWrong.quiz_type,
      review_status: latestAttempt.is_correct ? "resolved" : "needs_review",
    });
  }

  return result;
}

function buildUnitCards(params: {
  attempts: AttemptRow[];
  meaningProgressList: UnitProgressRow[];
  readingProgressList: ReadingProgressRow[];
  kanjiHints: KanjiHintRow[];
  readingNormalQuestions: QuestionMasterRow[];
  readingAdvancedQuestions: QuestionMasterRow[];
  mistakeHistory: MistakeHistoryItem[];
}) {
  const {
    attempts,
    meaningProgressList,
    readingProgressList,
    kanjiHints,
    readingNormalQuestions,
    readingAdvancedQuestions,
    mistakeHistory,
  } = params;

  const latestStudiedAt = getLatestStudiedAt(
    meaningProgressList,
    readingProgressList
  );

  const unitNames = Array.from(
    new Set([
      ...kanjiHints.map((row) => row.unit),
      ...readingNormalQuestions.map((row) => row.unit),
      ...readingAdvancedQuestions.map((row) => row.unit),
      ...meaningProgressList.map((row) => row.unit),
      ...readingProgressList.map((row) => row.unit),
      ...attempts.map((row) => row.unit),
    ])
  )
    .filter((unit): unit is string => Boolean(unit) && getGradeFromUnit(unit) !== null)
    .sort(sortUnitNames);

  return unitNames.map((unit): UnitCardData => {
    const meaningProgress = meaningProgressList.find((item) => item.unit === unit);

    const readingNormalProgress = readingProgressList.find(
      (item) =>
        item.unit === unit && normalizeDifficultyTier(item.difficulty_tier) === "normal"
    );

    const readingAdvancedProgress = readingProgressList.find(
      (item) =>
        item.unit === unit &&
        normalizeDifficultyTier(item.difficulty_tier) === "high_level"
    );

    const unitAttempts = attempts.filter((attempt) => attempt.unit === unit);

    const meaningRows = kanjiHints.filter((row) => row.unit === unit);
    const normalReadingRows = readingNormalQuestions.filter(
      (row) => row.unit === unit
    );
    const advancedReadingRows = readingAdvancedQuestions.filter(
      (row) => row.unit === unit
    );

    const meaningTotal = meaningRows.length;
    const readingTotal = normalReadingRows.length;
    const advancedTotal = advancedReadingRows.length;

    const meaningAnswered = countCompletedByProgress(
      meaningRows,
      meaningProgress
    );

    const readingAnswered = countCompletedByProgress(
      normalReadingRows,
      readingNormalProgress
    );

    const advancedAnswered = countCompletedByProgress(
      advancedReadingRows,
      readingAdvancedProgress
    );

    const unitMistakes = mistakeHistory.filter((item) => item.unit === unit);

    const unresolved = unitMistakes.filter(
      (item) => item.review_status === "needs_review"
    );

    const status = getUnitStatus({
      meaningAnswered,
      meaningTotal,
      readingAnswered,
      readingTotal,
    });

    const lastStudiedAt = getLatestDate([
      meaningProgress?.last_studied_at,
      readingNormalProgress?.last_studied_at,
      readingAdvancedProgress?.last_studied_at,
      ...unitAttempts.map((attempt) => attempt.answered_at),
    ]);

    return {
      unit,
      grade: getGradeFromUnit(unit),
      status,
      is_latest: Boolean(lastStudiedAt) && lastStudiedAt === latestStudiedAt,
      last_studied_at: lastStudiedAt,
      meaning_answered_count: meaningAnswered,
      meaning_total_count: meaningTotal,
      reading_answered_count: readingAnswered,
      reading_total_count: readingTotal,
      advanced_answered_count: advancedAnswered,
      advanced_total_count: advancedTotal,
      mistake_count: unitMistakes.length,
      unresolved_count: unresolved.length,
    };
  });
}

function buildGradeGroups(unitCards: UnitCardData[]) {
  const map = new Map<number, UnitCardData[]>();

  for (const unit of unitCards) {
    const grade = unit.grade ?? 0;
    const list = map.get(grade) ?? [];
    list.push(unit);
    map.set(grade, list);
  }

  const grades = Array.from(map.keys()).sort((a, b) => a - b);

  return grades.map((grade): GradeGroup => {
    const units = (map.get(grade) ?? []).sort((a, b) =>
      sortUnitNames(a.unit, b.unit)
    );

    return {
      grade,
      units,
      completed_count: units.filter((unit) => unit.status === "completed").length,
      total_count: units.length,
      mistake_count: units.reduce((sum, unit) => sum + unit.mistake_count, 0),
      unresolved_count: units.reduce((sum, unit) => sum + unit.unresolved_count, 0),
      has_latest: units.some((unit) => unit.is_latest),
    };
  });
}

function ErrorView({ message }: { message: string }) {
  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <section style={styles.errorCard}>
          <p style={styles.label}>TEACHER DASHBOARD</p>
          <h1 style={styles.title}>生徒詳細</h1>
          <p style={styles.errorText}>{message}</p>

          <div style={styles.errorActions}>
            <Link href="/teacher/students" style={styles.secondaryButton}>
              生徒一覧に戻る
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

export default async function TeacherStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = supabaseAdmin as any;

  const { data: student, error: studentError } = await db
    .from("teacher_student_progress_view")
    .select("*")
    .eq("student_id", id)
    .maybeSingle();

  if (studentError) {
    return (
      <ErrorView
        message={`生徒の詳細を読み込めませんでした：${studentError.message}`}
      />
    );
  }

  if (!student) {
    notFound();
  }

  const { data: attempts, error: attemptsError } = await db
    .from("kanji_attempts")
    .select(
      "id, student_account_id, kanji, unit, order_in_unit, quiz_type, user_answer, correct_answer, is_correct, answered_at"
    )
    .eq("student_account_id", id)
    .order("answered_at", { ascending: false })
    .limit(5000);

  const { data: unitProgressRows, error: unitProgressError } = await db
    .from("student_kanji_progress")
    .select("unit, last_order_completed, completed_count, is_completed, last_studied_at")
    .eq("student_account_id", id)
    .order("unit", { ascending: true });

  const { data: readingProgressRows, error: readingProgressError } = await db
    .from("student_reading_progress")
    .select(
      "unit, difficulty_tier, last_order_completed, completed_count, is_completed, last_studied_at"
    )
    .eq("student_account_id", id)
    .in("difficulty_tier", ["normal", "high_level"])
    .order("unit", { ascending: true })
    .order("difficulty_tier", { ascending: true });

  const { data: kanjiHintsRaw, error: kanjiHintsError } = await db
    .from("kanji_hints")
    .select("unit, kanji, order_in_unit")
    .order("unit", { ascending: true })
    .order("order_in_unit", { ascending: true });

  const { data: readingQuestionsRaw, error: readingQuestionsError } = await db
    .from("questions_master")
    .select(
      `
      id,
      unit,
      category,
      question_type,
      prompt,
      translation_en,
      answer_text,
      answer_aliases,
      target_text,
      order_in_unit,
      kanji_order_in_unit,
      reading_variant_order,
      hint_kanji_keys,
      difficulty_tier
    `
    )
    .eq("is_published", true)
    .eq("quiz_mode", "ordered")
    .eq("category", "kanji");

  if (attemptsError) {
    return (
      <ErrorView
        message={`回答履歴を読み込めませんでした：${attemptsError.message}`}
      />
    );
  }

  if (unitProgressError) {
    return (
      <ErrorView
        message={`意味クイズ進捗を読み込めませんでした：${unitProgressError.message}`}
      />
    );
  }

  if (readingProgressError) {
    return (
      <ErrorView
        message={`読みクイズ進捗を読み込めませんでした：${readingProgressError.message}`}
      />
    );
  }

  if (kanjiHintsError) {
    return (
      <ErrorView
        message={`漢字ヒントデータを読み込めませんでした：${kanjiHintsError.message}`}
      />
    );
  }

  if (readingQuestionsError) {
    return (
      <ErrorView
        message={`読みクイズ問題データを読み込めませんでした：${readingQuestionsError.message}`}
      />
    );
  }

  const studentData: StudentProgressRow = student;
  const attemptList: AttemptRow[] = attempts ?? [];
  const meaningProgressList: UnitProgressRow[] = unitProgressRows ?? [];
  const readingProgressList: ReadingProgressRow[] = readingProgressRows ?? [];
  const kanjiHints: KanjiHintRow[] = kanjiHintsRaw ?? [];
  const readingQuestions: QuestionMasterRow[] = (readingQuestionsRaw ?? []).filter(
    (question: QuestionMasterRow) => isReadingQuestionMaster(question)
  );

  const readingNormalQuestions = readingQuestions.filter(
    (question) => normalizeDifficultyTier(question.difficulty_tier) === "normal"
  );

  const readingAdvancedQuestions = readingQuestions.filter(
    (question) => normalizeDifficultyTier(question.difficulty_tier) === "high_level"
  );

  const mistakeHistory = buildMistakeHistory(attemptList);

  const unitCards = buildUnitCards({
    attempts: attemptList,
    meaningProgressList,
    readingProgressList,
    kanjiHints,
    readingNormalQuestions,
    readingAdvancedQuestions,
    mistakeHistory,
  });

  const gradeGroups = buildGradeGroups(unitCards);

  const totalUnits = unitCards.length;
  const completedUnits = unitCards.filter(
    (unit) => unit.status === "completed"
  ).length;

  const startedUnits = unitCards.filter(
    (unit) => unit.status !== "not_started"
  ).length;

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div>
            <p style={styles.label}>TEACHER DASHBOARD</p>
            <h1 style={styles.title}>{studentData.display_name || "名前なし"}</h1>
            <p style={styles.subtitle}>
              Login ID：{studentData.student_login_id || "-"}
            </p>
          </div>

          <div style={styles.headerActions}>
            <Link href={`/teacher/students/${id}`} style={styles.primaryButton}>
              更新
            </Link>

            <Link href="/teacher/students" style={styles.secondaryButton}>
              生徒一覧に戻る
            </Link>
          </div>
        </header>

        <section style={styles.summaryGrid}>
          <div style={styles.summaryCard}>
            <p style={styles.summaryLabel}>完了ユニット</p>
            <strong style={styles.summaryValue}>
              {completedUnits}/{totalUnits}
            </strong>
          </div>

          <div style={styles.summaryCard}>
            <p style={styles.summaryLabel}>着手済みユニット</p>
            <strong style={styles.summaryValue}>{startedUnits}</strong>
          </div>

          <div style={styles.summaryCard}>
            <p style={styles.summaryLabel}>回答数</p>
            <strong style={styles.summaryValue}>{attemptList.length}</strong>
          </div>

          <div style={styles.summaryCard}>
            <p style={styles.summaryLabel}>一度でも間違えた問題</p>
            <strong
              style={{
                ...styles.summaryValue,
                color: mistakeHistory.length > 0 ? "#b45309" : "#15803d",
              }}
            >
              {mistakeHistory.length}
            </strong>
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.sectionTitle}>グレード別進捗</h2>
              <p style={styles.sectionSubText}>
                グレードを開くと、ユニットごとの進捗が表示されます。読みはnormal、高度はhigh_levelを別々に表示します。
              </p>
            </div>
          </div>

          <div style={styles.legendRow}>
            <span style={styles.legendItem}>
              <i style={{ ...styles.legendDot, background: "#22c55e" }} />
              完了
            </span>
            <span style={styles.legendItem}>
              <i style={{ ...styles.legendDot, background: "#facc15" }} />
              途中
            </span>
            <span style={styles.legendItem}>
              <i style={{ ...styles.legendDot, background: "#60a5fa" }} />
              未着手
            </span>
            <span style={styles.legendItem}>
              <i style={{ ...styles.legendDot, background: "#6366f1" }} />
              最近学習
            </span>
          </div>

          {gradeGroups.length === 0 ? (
            <p style={styles.emptyText}>まだ進捗はありません。</p>
          ) : (
            <div style={styles.gradeList}>
              {gradeGroups.map((gradeGroup) => (
                <section
                  key={gradeGroup.grade}
                  style={styles.gradeDetails}
                >
                  <div style={styles.gradeSummary}>
                    <div style={styles.gradeSummaryMain}>
                      <strong style={styles.gradeTitle}>
                        Grade {gradeGroup.grade}
                      </strong>

                      {gradeGroup.has_latest ? (
                        <span style={styles.latestUnitBadge}>最近学習</span>
                      ) : null}
                    </div>

                    <div style={styles.gradeStats}>
                      <span>完了 {gradeGroup.completed_count}/{gradeGroup.total_count}</span>
                      <span>間違い {gradeGroup.mistake_count}</span>
                      <span>要確認 {gradeGroup.unresolved_count}</span>
                    </div>
                  </div>

                  <div style={styles.unitGrid}>
                    {gradeGroup.units.map((unit) => {
                      const statusStyle = getStatusStyle(
                        unit.status,
                        unit.is_latest
                      );
                      const hasMistakes = unit.mistake_count > 0;

                      return (
                        <article
                          key={unit.unit}
                          style={{
                            ...styles.unitCard,
                            borderColor: statusStyle.borderColor,
                            background: statusStyle.background,
                          }}
                        >
                          <div style={styles.unitTop}>
                            <div>
                              <strong style={styles.unitName}>{unit.unit}</strong>
                              <div style={styles.unitStatusLine}>
                                <span style={styles.unitStatusText}>
                                  {getStatusLabel(unit.status)}
                                </span>
                                {unit.is_latest ? (
                                  <span style={styles.latestUnitBadge}>
                                    最近学習
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <span style={styles.unitDate}>
                              {formatShortDate(unit.last_studied_at)}
                            </span>
                          </div>

                          <div style={styles.unitSimpleStats}>
                            <div style={styles.unitMiniBox}>
                              <span style={styles.miniLabel}>意味</span>
                              <strong style={styles.miniValue}>
                                {unit.meaning_answered_count}/
                                {unit.meaning_total_count}
                              </strong>
                            </div>

                            <div style={styles.unitMiniBox}>
                              <span style={styles.miniLabel}>読み</span>
                              <strong style={styles.miniValue}>
                                {unit.reading_answered_count}/
                                {unit.reading_total_count}
                              </strong>
                            </div>

                            <div style={styles.unitMiniBox}>
                              <span style={styles.miniLabel}>高度</span>
                              <strong style={styles.miniValue}>
                                {unit.advanced_answered_count}/
                                {unit.advanced_total_count}
                              </strong>
                            </div>

                            <div
                              style={{
                                ...styles.unitMiniBox,
                                background: hasMistakes ? "#fff7ed" : "#f0fdf4",
                              }}
                            >
                              <span
                                style={{
                                  ...styles.miniLabel,
                                  color: hasMistakes ? "#c2410c" : "#15803d",
                                }}
                              >
                                一度でも間違えた問題
                              </span>
                              <strong
                                style={{
                                  ...styles.miniValue,
                                  color: hasMistakes ? "#c2410c" : "#15803d",
                                }}
                              >
                                {unit.mistake_count}
                              </strong>
                            </div>
                          </div>

                          {hasMistakes ? (
                            <Link
                              href={`/teacher/students/${id}/mistakes?unit=${encodeURIComponent(
                                unit.unit
                              )}`}
                              style={styles.mistakeLink}
                            >
                              間違えた問題を見る
                            </Link>
                          ) : (
                            <div style={styles.noMistakeText}>間違いなし</div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f1f5f9",
    color: "#0f172a",
    padding: "28px 18px",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  shell: {
    width: "min(1280px, 100%)",
    margin: "0 auto",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 20,
    marginBottom: 24,
  },

  label: {
    margin: "0 0 8px",
    color: "#6366f1",
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: "0.18em",
  },

  title: {
    margin: 0,
    color: "#0f172a",
    fontSize: "clamp(34px, 5vw, 58px)",
    lineHeight: 1.05,
    fontWeight: 950,
    letterSpacing: "-0.05em",
  },

  subtitle: {
    margin: "14px 0 0",
    color: "#64748b",
    fontSize: 17,
    fontWeight: 850,
  },

  headerActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },

  primaryButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    background: "#0f172a",
    color: "#ffffff",
    padding: "14px 20px",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 950,
  },

  secondaryButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    background: "#ffffff",
    color: "#334155",
    padding: "14px 20px",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 950,
    boxShadow: "0 10px 26px rgba(15, 23, 42, 0.08)",
    border: "1px solid rgba(148, 163, 184, 0.25)",
  },

  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 16,
    marginBottom: 18,
  },

  summaryCard: {
    background: "#ffffff",
    borderRadius: 24,
    padding: 22,
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.08)",
    border: "1px solid rgba(148, 163, 184, 0.22)",
  },

  summaryLabel: {
    margin: "0 0 12px",
    color: "#64748b",
    fontSize: 13,
    fontWeight: 900,
  },

  summaryValue: {
    display: "block",
    color: "#0f172a",
    fontSize: 34,
    fontWeight: 950,
    lineHeight: 1,
  },

  card: {
    background: "#ffffff",
    borderRadius: 28,
    padding: 24,
    marginBottom: 18,
    boxShadow: "0 16px 38px rgba(15, 23, 42, 0.08)",
    border: "1px solid rgba(148, 163, 184, 0.22)",
  },

  cardHeader: {
    marginBottom: 18,
  },

  sectionTitle: {
    margin: 0,
    color: "#0f172a",
    fontSize: 22,
    fontWeight: 950,
    letterSpacing: "-0.03em",
  },

  sectionSubText: {
    margin: "8px 0 0",
    color: "#64748b",
    fontSize: 14,
    fontWeight: 800,
    lineHeight: 1.7,
  },

  legendRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px 16px",
    marginBottom: 18,
    padding: "12px 14px",
    borderRadius: 18,
    background: "#f8fafc",
  },

  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    color: "#334155",
    fontSize: 13,
    fontWeight: 900,
  },

  legendDot: {
    width: 13,
    height: 13,
    borderRadius: 999,
    display: "inline-block",
  },

  gradeList: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },

  gradeDetails: {
    borderRadius: 24,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    overflow: "hidden",
  },

  gradeSummary: {
    cursor: "pointer",
    padding: "18px 20px",
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    listStyle: "none",
  },

  gradeSummaryMain: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },

  gradeTitle: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: 950,
  },

  gradeStats: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    color: "#475569",
    fontSize: 13,
    fontWeight: 900,
  },

  unitGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 12,
    padding: "0 16px 16px",
  },

  unitCard: {
    border: "3px solid #cbd5e1",
    borderRadius: 22,
    padding: 14,
  },

  unitTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
  },

  unitName: {
    display: "block",
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 950,
    lineHeight: 1.25,
    wordBreak: "break-word",
  },

  unitStatusLine: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    flexWrap: "wrap",
  },

  unitStatusText: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: 950,
  },

  latestUnitBadge: {
    display: "inline-flex",
    borderRadius: 999,
    padding: "4px 8px",
    background: "#6366f1",
    color: "#ffffff",
    fontSize: 11,
    fontWeight: 950,
    whiteSpace: "nowrap",
  },

  unitDate: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: 850,
    whiteSpace: "nowrap",
  },

  unitSimpleStats: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 8,
  },

  unitMiniBox: {
    background: "rgba(255,255,255,0.75)",
    borderRadius: 14,
    padding: "10px 11px",
  },

  miniLabel: {
    display: "block",
    marginBottom: 5,
    color: "#64748b",
    fontSize: 11,
    fontWeight: 900,
  },

  miniValue: {
    display: "block",
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 950,
  },

  mistakeLink: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
    borderRadius: 14,
    padding: "10px 12px",
    background: "#0f172a",
    color: "#ffffff",
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 950,
  },

  noMistakeText: {
    marginTop: 12,
    borderRadius: 14,
    padding: "10px 12px",
    background: "rgba(255,255,255,0.75)",
    color: "#15803d",
    fontSize: 13,
    fontWeight: 950,
    textAlign: "center",
  },

  emptyText: {
    margin: 0,
    color: "#64748b",
    fontSize: 14,
    fontWeight: 800,
  },

  errorCard: {
    background: "#ffffff",
    borderRadius: 28,
    padding: 36,
    textAlign: "center",
    boxShadow: "0 16px 38px rgba(15, 23, 42, 0.08)",
    border: "1px solid rgba(148, 163, 184, 0.22)",
  },

  errorText: {
    margin: "20px 0 0",
    background: "#fef2f2",
    color: "#dc2626",
    borderRadius: 18,
    padding: "14px 16px",
    fontSize: 14,
    fontWeight: 850,
    lineHeight: 1.7,
  },

  errorActions: {
    marginTop: 18,
    display: "flex",
    justifyContent: "center",
  },
};