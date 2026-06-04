import { redirect } from "next/navigation";
import { getStudentSession } from "@/lib/auth/student";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getKanjiLevel,
  getQuizHref,
  getQuizLabels,
  normalizeQuizKind,
} from "@/lib/kanjiUnits";

type ProgressRow = {
  unit: string;
  completed_count: number | null;
};

type PageProps = {
  params: Promise<{
    level: string;
  }>;
  searchParams?: Promise<{
    quiz?: string | string[];
  }>;
};

export default async function StudentLevelPage({
  params,
  searchParams,
}: PageProps) {
  const session = await getStudentSession();

  if (!session?.studentAccountId) {
    redirect("/student-login");
  }

  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const levelNumber = Number(resolvedParams.level);
  const level = getKanjiLevel(levelNumber);

  if (!level) {
    redirect("/student-home");
  }

  const quizKind = normalizeQuizKind(resolvedSearchParams.quiz);
  const quizLabels = getQuizLabels(quizKind);

  const db = supabaseAdmin as any;

  const unitIds = level.units.map((item) => item.unit);

  const { data: progressRowsRaw } =
    quizKind === "reading"
      ? await db
          .from("student_reading_progress")
          .select("unit, completed_count")
          .eq("student_account_id", session.studentAccountId)
          .eq("difficulty_tier", "normal")
          .in("unit", unitIds)
      : await db
          .from("student_kanji_progress")
          .select("unit, completed_count")
          .eq("student_account_id", session.studentAccountId)
          .in("unit", unitIds);

  const progressRows = (progressRowsRaw ?? []) as ProgressRow[];
  const progressMap = new Map<string, number>();

  for (const row of progressRows) {
    if (row.unit) {
      progressMap.set(row.unit, row.completed_count ?? 0);
    }
  }

  const clearCount = level.units.filter(
    (item) => (progressMap.get(item.unit) ?? 0) >= 1
  ).length;

  return (
    <main style={styles.page}>
      <div style={styles.topBar}>
        <a href="/student-home" style={styles.backButton}>
          ← Back to Levels
        </a>

        <form action="/api/student-logout" method="post" style={styles.logoutForm}>
          <button type="submit" style={styles.logoutButton}>
            Log out
          </button>
        </form>
      </div>

      <section style={styles.card}>
        <div style={styles.header}>
          <p style={styles.kicker}>Kanji Quiz</p>
          <h1 style={styles.title}>{level.levelLabel}</h1>
          <p style={styles.quizTitle}>{quizLabels.title}</p>
          <p style={styles.quizSub}>{quizLabels.sub}</p>

          <div style={styles.progressPill}>
            {clearCount} / {level.unitCount} units clear
          </div>

          <p style={styles.chooseText}>Choose a unit.</p>
        </div>

        <div style={styles.unitButtonList}>
          {level.units.map((item) => {
            const isClear = (progressMap.get(item.unit) ?? 0) >= 1;

            return (
              <a
                key={item.unit}
                href={getQuizHref(item.unit, quizKind)}
                style={{
                  ...styles.unitButton,
                  ...(quizKind === "reading"
                    ? styles.readingUnitButton
                    : styles.meaningUnitButton),
                }}
              >
                <span style={styles.unitButtonText}>{item.unitLabel}</span>
                {isClear ? <span style={styles.clearStamp}>CLEAR</span> : null}
              </a>
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

  topBar: {
    width: "min(720px, 100%)",
    margin: "0 auto 12px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },

  backButton: {
    border: "3px solid #1f2b3d",
    borderRadius: 999,
    background: "#ffffff",
    color: "#1f2b3d",
    padding: "10px 18px",
    fontSize: 15,
    fontWeight: 900,
    textDecoration: "none",
    boxShadow: "0 4px 0 rgba(31,43,61,0.12)",
  },

  logoutForm: {
    margin: 0,
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
    width: "min(720px, 100%)",
    margin: "0 auto",
    background: "rgba(255,255,255,0.92)",
    border: "3px solid #1f2b3d",
    borderRadius: 28,
    padding: "28px 18px 22px",
    boxShadow: "0 12px 0 rgba(31,43,61,0.12)",
  },

  header: {
    textAlign: "center",
    marginBottom: 20,
  },

  kicker: {
    margin: 0,
    fontSize: 15,
    fontWeight: 900,
    color: "#4d97d4",
    letterSpacing: 1,
  },

  title: {
    margin: "4px 0 6px",
    fontSize: "clamp(48px, 12vw, 86px)",
    fontWeight: 900,
    lineHeight: 0.98,
  },

  quizTitle: {
    margin: 0,
    fontSize: "clamp(24px, 6vw, 36px)",
    fontWeight: 900,
    lineHeight: 1.1,
  },

  quizSub: {
    margin: "4px 0 0",
    fontSize: 15,
    fontWeight: 900,
    color: "#536174",
  },

  progressPill: {
    display: "inline-block",
    marginTop: 14,
    border: "3px solid #1f2b3d",
    borderRadius: 999,
    background: "#ffffff",
    padding: "8px 14px",
    fontSize: 15,
    fontWeight: 900,
    boxShadow: "0 4px 0 rgba(31,43,61,0.10)",
  },

  chooseText: {
    margin: "14px 0 0",
    fontSize: 16,
    fontWeight: 800,
    color: "#536174",
  },

  unitButtonList: {
    display: "grid",
    gap: 12,
  },

  unitButton: {
    position: "relative",
    minHeight: 64,
    border: "3px solid #1f2b3d",
    borderRadius: 20,
    padding: "14px 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    textDecoration: "none",
    color: "#172033",
    boxShadow: "0 7px 0 rgba(31,43,61,0.12)",
  },

  meaningUnitButton: {
    background: "#fff3c4",
  },

  readingUnitButton: {
    background: "#d9ecff",
  },

  unitButtonText: {
    fontSize: 24,
    fontWeight: 900,
    lineHeight: 1,
  },

  clearStamp: {
    border: "2px solid #c62828",
    color: "#c62828",
    background: "rgba(255,255,255,0.92)",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 900,
    transform: "rotate(5deg)",
  },
};