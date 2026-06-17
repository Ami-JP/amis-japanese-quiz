import { redirect } from "next/navigation";
import { getStudentSession } from "@/lib/auth/student";
import { KANJI_LEVELS } from "@/lib/kanjiUnits";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function KanjiWritingLevelSelectPage() {
  const session = await getStudentSession();

  if (!session?.studentAccountId) {
    redirect("/student-login");
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <a href="/student-home" style={styles.backLink}>
          ← Home
        </a>

        <div style={styles.header}>
          <p style={styles.kicker}>Writing Quiz</p>
          <h1 style={styles.title}>漢字入力クイズ</h1>
          <p style={styles.subtitle}>
            ひらがなを見て、文に合う漢字を入力する練習です。
          </p>
          <p style={styles.subtitleEn}>
            Choose a level, then choose a unit.
          </p>
        </div>

        <div style={styles.handwritingBox}>
          <p style={styles.handwritingTitle}>手書き入力で挑戦してみよう♪</p>
          <p style={styles.handwritingText}>
            スマホやタブレットの「日本語手書き」入力を使って挑戦してみてね
          </p>
        </div>

        <div style={styles.levelGrid}>
          {KANJI_LEVELS.map((level) => (
            <a
              key={level.level}
              href={`/student-home/writing/level/${level.level}`}
              style={styles.levelCard}
            >
              <span style={styles.levelLabel}>Kanji Level</span>
              <strong style={styles.levelTitle}>{level.levelLabel}</strong>
              <span style={styles.unitCount}>{level.unitCount} units</span>
            </a>
          ))}
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
    width: "min(920px, 100%)",
    margin: "0 auto",
    background: "rgba(255,255,255,0.94)",
    border: "3px solid #1f2b3d",
    borderRadius: 28,
    padding: "22px 18px 24px",
    boxShadow: "0 12px 0 rgba(31,43,61,0.12)",
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
    margin: "18px 0 16px",
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

  handwritingBox: {
    background: "#f4efff",
    border: "3px solid #7c3aed",
    borderRadius: 22,
    padding: "14px 16px",
    marginBottom: 18,
  },

  handwritingTitle: {
    margin: 0,
    fontSize: 17,
    fontWeight: 900,
    color: "#5b21b6",
  },

  handwritingText: {
    margin: "6px 0 0",
    fontSize: 14,
    fontWeight: 800,
    color: "#4c1d95",
  },

  levelGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 14,
  },

  levelCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
    border: "3px solid #1f2b3d",
    borderRadius: 22,
    background: "#efe5ff",
    color: "#172033",
    textDecoration: "none",
    padding: "16px 12px",
    boxShadow: "0 7px 0 rgba(31,43,61,0.12)",
    textAlign: "center",
  },

  levelLabel: {
    color: "#7c3aed",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  levelTitle: {
    marginTop: 6,
    fontSize: 26,
    fontWeight: 900,
  },

  unitCount: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: 800,
    color: "#536174",
  },
};
