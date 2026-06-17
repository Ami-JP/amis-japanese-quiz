import { redirect, notFound } from "next/navigation";
import { getStudentSession } from "@/lib/auth/student";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { KANJI_LEVELS } from "@/lib/kanjiUnits";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type QuestionRow = {
  unit: string | null;
  category: string | null;
  question_type: string | null;
  target_text: string | null;
  target_ruby: string | null;
  answer_text: string | null;
  difficulty_tier: string | null;
};

type ProgressRow = {
  unit: string | null;
  difficulty_tier: string | null;
  last_order_completed: number | null;
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

function normalizeDifficultyTier(value: unknown): "normal" | "high_level" {
  return normalizeText(value).toLowerCase() === "high_level"
    ? "high_level"
    : "normal";
}

function isWritingQuestion(row: QuestionRow) {
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

  return hasWritingTarget && typeMatches && categoryMatches;
}

function getUnitDisplayLabel(unit: string) {
  const match = unit.match(/^grade(\d+)-kanji-(\d+)$/);

  if (!match) return unit;

  return `Level ${match[1]} / Unit ${match[2]}`;
}

function getProgressPercent(completed: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
}

export default async function KanjiWritingUnitSelectPage({
  params,
}: {
  params: Promise<{ level: string }>;
}) {
  const session = await getStudentSession();

  if (!session?.studentAccountId) {
    redirect("/student-login");
  }

  const { level: rawLevel } = await params;
  const levelNumber = Number(rawLevel);
  const level = KANJI_LEVELS.find((item) => item.level === levelNumber);

  if (!level) {
    notFound();
  }

  const unitIds = level.units.map((unit) => unit.unit);
  const db = supabaseAdmin as any;

  const [{ data: questionRowsRaw }, { data: progressRowsRaw }] =
    await Promise.all([
      db
        .from("questions_master")
        .select(
          "unit, category, question_type, target_text, target_ruby, answer_text, difficulty_tier",
        )
        .eq("is_published", true)
        .eq("quiz_mode", "ordered")
        .in("unit", unitIds),

      db
        .from("student_kanji_writing_progress")
        .select("unit, difficulty_tier, last_order_completed")
        .eq("student_account_id", session.studentAccountId)
        .in("unit", unitIds),
    ]);

  const questionRows = ((questionRowsRaw ?? []) as QuestionRow[]).filter(
    isWritingQuestion,
  );
  const progressRows = (progressRowsRaw ?? []) as ProgressRow[];

  const totalByUnitTier = new Map<string, number>();
  const progressByUnitTier = new Map<string, number>();

  for (const row of questionRows) {
    const unit = normalizeText(row.unit);
    if (!unit) continue;

    const tier = normalizeDifficultyTier(row.difficulty_tier);
    const key = `${unit}::${tier}`;
    totalByUnitTier.set(key, (totalByUnitTier.get(key) ?? 0) + 1);
  }

  for (const row of progressRows) {
    const unit = normalizeText(row.unit);
    if (!unit) continue;

    const tier = normalizeDifficultyTier(row.difficulty_tier);
    const key = `${unit}::${tier}`;
    progressByUnitTier.set(key, normalizeNumber(row.last_order_completed));
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.topLinks}>
          <a href="/student-home/writing" style={styles.backLink}>
            Back to Level Menu
          </a>
          <a href="/student-home" style={styles.backLink}>
            Back to Home
          </a>
        </div>

        <div style={styles.header}>
          <p style={styles.kicker}>Writing Quiz</p>
          <h1 style={styles.title}>{level.levelLabel}</h1>
          <p style={styles.subtitle}>Unitを選んでください。</p>
          <p style={styles.subtitleEn}>Choose a unit to practice kanji writing.</p>
        </div>

        <div style={styles.unitGrid}>
          {level.units.map((unit) => {
            const normalKey = `${unit.unit}::normal`;
            const advancedKey = `${unit.unit}::high_level`;
            const normalTotal = totalByUnitTier.get(normalKey) ?? 0;
            const advancedTotal = totalByUnitTier.get(advancedKey) ?? 0;
            const normalCompleted = Math.min(
              progressByUnitTier.get(normalKey) ?? 0,
              normalTotal,
            );
            const percent = getProgressPercent(normalCompleted, normalTotal);

            return (
              <section key={unit.unit} style={styles.unitCard}>
                <div style={styles.unitCardHeader}>
                  <div>
                    <p style={styles.unitLabel}>Unit</p>
                    <h2 style={styles.unitTitle}>
                      {getUnitDisplayLabel(unit.unit)}
                    </h2>
                  </div>

                  <span style={styles.progressBadge}>
                    {normalCompleted} / {normalTotal}
                  </span>
                </div>

                <div style={styles.progressTrack}>
                  <div
                    style={{
                      ...styles.progressFill,
                      width: `${percent}%`,
                    }}
                  />
                </div>

                <a
                  href={`/kanji-writing-quiz?unit=${encodeURIComponent(
                    unit.unit,
                  )}&tier=normal`}
                  style={styles.startButton}
                >
                  Start Writing Quiz
                  <span style={styles.buttonTiny}>漢字入力クイズ</span>
                </a>

                {advancedTotal > 0 ? (
                  <a
                    href={`/kanji-writing-quiz?unit=${encodeURIComponent(
                      unit.unit,
                    )}&tier=high_level`}
                    style={styles.challengeLink}
                  >
                    Challenge / 高度な漢字入力クイズ
                  </a>
                ) : null}
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

  card: {
    width: "min(980px, 100%)",
    margin: "0 auto",
    background: "rgba(255,255,255,0.94)",
    border: "3px solid #1f2b3d",
    borderRadius: 28,
    padding: "22px 18px 24px",
    boxShadow: "0 12px 0 rgba(31,43,61,0.12)",
  },

  topLinks: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },

  backLink: {
    display: "inline-flex",
    alignItems: "center",
    border: "3px solid #1f2b3d",
    borderRadius: 999,
    background: "#ffffff",
    color: "#1f2b3d",
    padding: "8px 14px",
    fontSize: 14,
    fontWeight: 900,
    textDecoration: "none",
    boxShadow: "0 4px 0 rgba(31,43,61,0.12)",
  },

  header: {
    textAlign: "center",
    margin: "18px 0 18px",
  },

  kicker: {
    margin: 0,
    color: "#7c3aed",
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  title: {
    margin: "6px 0 8px",
    fontSize: "clamp(32px, 6vw, 52px)",
    fontWeight: 900,
    lineHeight: 1.05,
  },

  subtitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    color: "#374151",
  },

  subtitleEn: {
    margin: "5px 0 0",
    fontSize: 14,
    fontWeight: 700,
    color: "#6b7280",
  },

  unitGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 14,
  },

  unitCard: {
    border: "3px solid #1f2b3d",
    borderRadius: 24,
    background: "#ffffff",
    padding: 14,
    boxShadow: "0 7px 0 rgba(31,43,61,0.12)",
  },

  unitCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },

  unitLabel: {
    margin: 0,
    color: "#7c3aed",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  unitTitle: {
    margin: "4px 0 0",
    fontSize: 22,
    fontWeight: 900,
  },

  progressBadge: {
    border: "2px solid #7c3aed",
    borderRadius: 999,
    padding: "5px 9px",
    background: "#f4efff",
    color: "#5b21b6",
    fontSize: 13,
    fontWeight: 900,
    whiteSpace: "nowrap",
  },

  progressTrack: {
    margin: "12px 0 12px",
    height: 12,
    borderRadius: 999,
    background: "#e5e7eb",
    overflow: "hidden",
    border: "2px solid #1f2b3d",
  },

  progressFill: {
    height: "100%",
    background: "#7c3aed",
    borderRadius: 999,
  },

  startButton: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 62,
    borderRadius: 18,
    border: "3px solid #1f2b3d",
    background: "#efe5ff",
    color: "#172033",
    textDecoration: "none",
    fontSize: 17,
    fontWeight: 900,
    boxShadow: "0 5px 0 rgba(31,43,61,0.12)",
  },

  buttonTiny: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: 800,
    color: "#536174",
  },

  challengeLink: {
    display: "inline-flex",
    justifyContent: "center",
    marginTop: 10,
    width: "100%",
    color: "#7c3aed",
    fontSize: 13,
    fontWeight: 900,
    textDecoration: "none",
  },
};
