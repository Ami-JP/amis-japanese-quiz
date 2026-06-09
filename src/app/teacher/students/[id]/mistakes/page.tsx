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
};

type MistakeHistoryItem = {
  key: string;
  kanji: string;
  unit: string;
  quiz_type: string;
  quiz_label: string;
  order_in_unit: number;
  question_text: string;
  translation_en: string | null;
  target_text: string;
  first_wrong_answer: string;
  first_wrong_at: string | null;
  latest_answer: string;
  latest_is_correct: boolean;
  latest_answered_at: string | null;
  correct_answer: string;
  wrong_count: number;
  attempt_count: number;
  review_status: "resolved" | "needs_review";
};

function formatDate(value: string | null) {
  if (!value) return "まだ記録なし";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("ja-JP", {
    year: "numeric",
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

function getQuizTypeLabel(quizType: string | null | undefined) {
  if (isMeaningQuiz(quizType)) return "意味クイズ";
  if (isReadingQuiz(quizType)) return "読みクイズ";
  return quizType || "クイズ";
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

function answerMatchesQuestion(attempt: AttemptRow, question: QuestionMasterRow) {
  const attemptAnswer = normalizeText(attempt.correct_answer);
  const answerCandidates = [
    question.answer_text,
    ...splitAnswerCandidates(question.answer_text),
    ...parseAliases(question.answer_aliases),
  ];

  return answerCandidates.some(
    (candidate) => normalizeText(candidate) === attemptAnswer
  );
}

function questionContainsKanji(attempt: AttemptRow, question: QuestionMasterRow) {
  const kanji = attempt.kanji;
  if (!kanji) return false;

  return (
    question.target_text === kanji ||
    question.prompt.includes(kanji) ||
    String(question.hint_kanji_keys ?? "").includes(kanji)
  );
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

function findReadingQuestionForAttempt(
  attempt: AttemptRow,
  questions: QuestionMasterRow[]
) {
  const sameUnitReadingQuestions = questions.filter(
    (question) => question.unit === attempt.unit && isReadingQuestionMaster(question)
  );

  const sameKanjiQuestions = sameUnitReadingQuestions.filter((question) =>
    questionContainsKanji(attempt, question)
  );

  const sameAnswerQuestions = sameKanjiQuestions.filter((question) =>
    answerMatchesQuestion(attempt, question)
  );

  if (sameAnswerQuestions.length > 0) {
    return sameAnswerQuestions[0];
  }

  if (sameKanjiQuestions.length > 0) {
    return sameKanjiQuestions[0];
  }

  return null;
}

function getQuestionText(attempt: AttemptRow, question: QuestionMasterRow | null) {
  if (isMeaningQuiz(attempt.quiz_type)) {
    return `「${attempt.kanji}」の意味はどれですか。`;
  }

  if (question?.prompt) return question.prompt;

  if (isReadingQuiz(attempt.quiz_type)) {
    return "問題文を取得できませんでした。";
  }

  return "問題文を取得できませんでした。";
}

function getTargetText(attempt: AttemptRow, question: QuestionMasterRow | null) {
  if (isMeaningQuiz(attempt.quiz_type)) {
    return attempt.kanji;
  }

  return question?.target_text || attempt.kanji;
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

function buildMistakeHistory(params: {
  attempts: AttemptRow[];
  questions: QuestionMasterRow[];
}) {
  const { attempts, questions } = params;
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

    const question = isReadingQuiz(firstWrong.quiz_type)
      ? findReadingQuestionForAttempt(firstWrong, questions)
      : null;

    result.push({
      key,
      kanji: firstWrong.kanji,
      unit: firstWrong.unit,
      quiz_type: firstWrong.quiz_type,
      quiz_label: getQuizTypeLabel(firstWrong.quiz_type),
      order_in_unit: firstWrong.order_in_unit,
      question_text: getQuestionText(firstWrong, question),
      translation_en: isReadingQuiz(firstWrong.quiz_type)
        ? question?.translation_en ?? null
        : null,
      target_text: getTargetText(firstWrong, question),
      first_wrong_answer: firstWrong.user_answer || "空欄",
      first_wrong_at: firstWrong.answered_at,
      latest_answer: latestAttempt.user_answer || "空欄",
      latest_is_correct: latestAttempt.is_correct,
      latest_answered_at: latestAttempt.answered_at,
      correct_answer: firstWrong.correct_answer || "-",
      wrong_count: wrongRows.length,
      attempt_count: sortedRows.length,
      review_status: latestAttempt.is_correct ? "resolved" : "needs_review",
    });
  }

  return result.sort(
    (a, b) =>
      new Date(b.first_wrong_at ?? "").getTime() -
      new Date(a.first_wrong_at ?? "").getTime()
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <section style={styles.errorCard}>
          <p style={styles.label}>TEACHER DASHBOARD</p>
          <h1 style={styles.title}>間違えた問題</h1>
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

export default async function TeacherStudentMistakesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ unit?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const selectedUnit = resolvedSearchParams.unit?.trim() || "";

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

  let attemptsQuery = db
    .from("kanji_attempts")
    .select(
      "id, student_account_id, kanji, unit, order_in_unit, quiz_type, user_answer, correct_answer, is_correct, answered_at"
    )
    .eq("student_account_id", id)
    .order("answered_at", { ascending: false })
    .limit(5000);

  if (selectedUnit) {
    attemptsQuery = attemptsQuery.eq("unit", selectedUnit);
  }

  const { data: attempts, error: attemptsError } = await attemptsQuery;

  if (attemptsError) {
    return (
      <ErrorView
        message={`回答履歴を読み込めませんでした：${attemptsError.message}`}
      />
    );
  }

  const attemptList: AttemptRow[] = attempts ?? [];

  const readingUnits = Array.from(
    new Set(
      attemptList
        .filter((attempt) => isReadingQuiz(attempt.quiz_type))
        .map((attempt) => attempt.unit)
    )
  ).filter(Boolean);

  let questionList: QuestionMasterRow[] = [];

  if (readingUnits.length > 0) {
    const { data: questionsRaw, error: questionsError } = await db
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
        hint_kanji_keys
      `
      )
      .in("unit", readingUnits)
      .eq("is_published", true)
      .eq("category", "kanji");

    if (questionsError) {
      return (
        <ErrorView
          message={`読みクイズ問題データを読み込めませんでした：${questionsError.message}`}
        />
      );
    }

    questionList = (questionsRaw ?? []).filter((question: QuestionMasterRow) =>
      isReadingQuestionMaster(question)
    );
  }

  const mistakeHistory = buildMistakeHistory({
    attempts: attemptList,
    questions: questionList,
  });

  const unresolvedMistakes = mistakeHistory.filter(
    (item) => item.review_status === "needs_review"
  );

  const resolvedMistakes = mistakeHistory.filter(
    (item) => item.review_status === "resolved"
  );

  const meaningMistakes = mistakeHistory.filter((item) =>
    isMeaningQuiz(item.quiz_type)
  );

  const readingMistakes = mistakeHistory.filter((item) =>
    isReadingQuiz(item.quiz_type)
  );

  const studentData: StudentProgressRow = student;

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div>
            <p style={styles.label}>TEACHER DASHBOARD</p>
            <h1 style={styles.title}>間違えた問題</h1>
            <p style={styles.subtitle}>
              {studentData.display_name || "名前なし"} / Login ID：
              {studentData.student_login_id || "-"}
            </p>
            <p style={styles.unitText}>
              {selectedUnit ? `対象ユニット：${selectedUnit}` : "全ユニット"}
            </p>
          </div>

          <div style={styles.headerActions}>
            <Link
              href={`/teacher/students/${id}/mistakes${
                selectedUnit ? `?unit=${encodeURIComponent(selectedUnit)}` : ""
              }`}
              style={styles.primaryButton}
            >
              更新
            </Link>

            <Link href={`/teacher/students/${id}`} style={styles.secondaryButton}>
              生徒詳細に戻る
            </Link>
          </div>
        </header>

        <section style={styles.summaryGrid}>
          <div style={styles.summaryCard}>
            <p style={styles.summaryLabel}>一度でも間違えた問題</p>
            <strong style={styles.summaryValue}>{mistakeHistory.length}</strong>
          </div>

          <div style={styles.summaryCard}>
            <p style={styles.summaryLabel}>まだ要確認</p>
            <strong
              style={{
                ...styles.summaryValue,
                color: unresolvedMistakes.length > 0 ? "#b91c1c" : "#15803d",
              }}
            >
              {unresolvedMistakes.length}
            </strong>
          </div>

          <div style={styles.summaryCard}>
            <p style={styles.summaryLabel}>復習で正解済み</p>
            <strong style={{ ...styles.summaryValue, color: "#0f766e" }}>
              {resolvedMistakes.length}
            </strong>
          </div>

          <div style={styles.summaryCard}>
            <p style={styles.summaryLabel}>意味 / 読み</p>
            <strong style={styles.summaryValueSmall}>
              意味 {meaningMistakes.length} / 読み {readingMistakes.length}
            </strong>
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.sectionTitle}>
                {selectedUnit ? `${selectedUnit} の間違えた問題` : "間違えた問題"}
              </h2>
              <p style={styles.sectionSubText}>
                一度でも間違えた問題を表示しています。復習で正解済みの問題も残して確認できます。
              </p>
            </div>
          </div>

          {mistakeHistory.length === 0 ? (
            <div style={styles.goodBox}>
              <strong>間違えた問題はありません</strong>
              <p>
                {selectedUnit
                  ? "このユニットでは、まだ間違えた記録がありません。"
                  : "この生徒には、まだ間違えた記録がありません。"}
              </p>
            </div>
          ) : (
            <div style={styles.mistakeList}>
              {mistakeHistory.map((item) => (
                <article style={styles.mistakeItem} key={item.key}>
                  <div style={styles.mistakeTop}>
                    <div style={styles.badgeRow}>
                      <span
                        style={
                          isMeaningQuiz(item.quiz_type)
                            ? styles.meaningBadge
                            : styles.readingBadge
                        }
                      >
                        {item.quiz_label}
                      </span>

                      <span style={styles.unitBadge}>{item.unit}</span>

                      <span style={styles.orderBadge}>No. {item.order_in_unit}</span>
                    </div>

                    <span
                      style={
                        item.review_status === "resolved"
                          ? styles.resolvedBadge
                          : styles.needsReviewBadge
                      }
                    >
                      {item.review_status === "resolved"
                        ? "復習で正解済み"
                        : "まだ要確認"}
                    </span>
                  </div>

                  <div style={styles.questionBox}>
                    <span style={styles.infoLabel}>問題文</span>
                    <strong style={styles.questionText}>{item.question_text}</strong>
                    {item.translation_en ? (
                      <small style={styles.translationText}>
                        {item.translation_en}
                      </small>
                    ) : null}
                  </div>

                  <div style={styles.answerCompare}>
                    <div style={styles.compareBox}>
                      <span style={styles.infoLabel}>Target</span>
                      <strong style={styles.infoValueSmall}>
                        {item.target_text || item.kanji}
                      </strong>
                    </div>

                    <div style={styles.wrongAnswerBox}>
                      <span style={styles.infoLabel}>生徒の誤答</span>
                      <strong style={styles.infoValueSmall}>
                        {item.first_wrong_answer}
                      </strong>
                    </div>

                    <div style={styles.correctAnswerBox}>
                      <span style={styles.infoLabel}>正解</span>
                      <strong style={styles.infoValueSmall}>
                        {item.correct_answer}
                      </strong>
                    </div>
                  </div>

                  <div style={styles.metaGrid}>
                    <div style={styles.metaBox}>
                      <span style={styles.infoLabel}>最初に間違えた日時</span>
                      <strong style={styles.infoValueSmall}>
                        {formatDate(item.first_wrong_at)}
                      </strong>
                    </div>

                    <div style={styles.metaBox}>
                      <span style={styles.infoLabel}>最後の回答</span>
                      <strong style={styles.infoValueSmall}>
                        {item.latest_answer}
                      </strong>
                    </div>

                    <div style={styles.metaBox}>
                      <span style={styles.infoLabel}>最後に解いた日時</span>
                      <strong style={styles.infoValueSmall}>
                        {formatDate(item.latest_answered_at)}
                      </strong>
                    </div>

                    <div style={styles.metaBox}>
                      <span style={styles.infoLabel}>間違えた回数</span>
                      <strong style={styles.infoValueSmall}>
                        {item.wrong_count}回 / 全{item.attempt_count}回
                      </strong>
                    </div>
                  </div>
                </article>
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
    width: "min(1180px, 100%)",
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

  unitText: {
    margin: "10px 0 0",
    color: "#0f172a",
    fontSize: 15,
    fontWeight: 900,
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

  summaryValueSmall: {
    display: "block",
    color: "#0f172a",
    fontSize: 20,
    fontWeight: 950,
    lineHeight: 1.4,
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

  goodBox: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: 20,
    padding: 18,
    color: "#15803d",
  },

  mistakeList: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },

  mistakeItem: {
    background: "#ffffff",
    border: "1px solid #fee2e2",
    borderRadius: 22,
    padding: 16,
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
  },

  mistakeTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },

  badgeRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },

  meaningBadge: {
    display: "inline-flex",
    borderRadius: 999,
    padding: "6px 10px",
    background: "#e0e7ff",
    color: "#3730a3",
    fontSize: 12,
    fontWeight: 950,
  },

  readingBadge: {
    display: "inline-flex",
    borderRadius: 999,
    padding: "6px 10px",
    background: "#dcfce7",
    color: "#15803d",
    fontSize: 12,
    fontWeight: 950,
  },

  unitBadge: {
    display: "inline-flex",
    borderRadius: 999,
    padding: "6px 10px",
    background: "#f1f5f9",
    color: "#475569",
    fontSize: 12,
    fontWeight: 950,
  },

  orderBadge: {
    display: "inline-flex",
    borderRadius: 999,
    padding: "6px 10px",
    background: "#fff7ed",
    color: "#c2410c",
    fontSize: 12,
    fontWeight: 950,
  },

  resolvedBadge: {
    display: "inline-flex",
    borderRadius: 999,
    padding: "7px 11px",
    background: "#ccfbf1",
    color: "#0f766e",
    fontSize: 12,
    fontWeight: 950,
    whiteSpace: "nowrap",
  },

  needsReviewBadge: {
    display: "inline-flex",
    borderRadius: 999,
    padding: "7px 11px",
    background: "#fee2e2",
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: 950,
    whiteSpace: "nowrap",
  },

  questionBox: {
    background: "#f8fafc",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },

  infoLabel: {
    display: "block",
    color: "#64748b",
    fontSize: 12,
    fontWeight: 900,
    marginBottom: 7,
  },

  questionText: {
    display: "block",
    color: "#0f172a",
    fontSize: 18,
    fontWeight: 950,
    lineHeight: 1.55,
  },

  translationText: {
    display: "block",
    marginTop: 6,
    color: "#64748b",
    fontSize: 13,
    fontWeight: 800,
    lineHeight: 1.5,
  },

  answerCompare: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 10,
    marginBottom: 12,
  },

  compareBox: {
    background: "#f8fafc",
    borderRadius: 16,
    padding: 12,
  },

  wrongAnswerBox: {
    background: "#fef2f2",
    borderRadius: 16,
    padding: 12,
  },

  correctAnswerBox: {
    background: "#f0fdf4",
    borderRadius: 16,
    padding: 12,
  },

  infoValueSmall: {
    display: "block",
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 950,
    lineHeight: 1.5,
    wordBreak: "break-word",
  },

  metaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
  },

  metaBox: {
    background: "#f8fafc",
    borderRadius: 16,
    padding: 12,
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