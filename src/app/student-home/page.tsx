import { redirect } from "next/navigation";
import { getStudentSession } from "@/lib/auth/student";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const UNITS = [
  { levelLabel: "Level 1", unitLabel: "Unit 01", unit: "grade1-kanji-01", available: true },
  { levelLabel: "Level 1", unitLabel: "Unit 02", unit: "grade1-kanji-02", available: true },
  { levelLabel: "Level 1", unitLabel: "Unit 03", unit: "grade1-kanji-03", available: false },
];

type UnitStatus = {
  meaningClear: boolean;
  readingClear: boolean;
  hasAdvanced: boolean;
};

export default async function StudentHomePage() {
  const session = await getStudentSession();
  if (!session?.studentAccountId) redirect("/student-login");

  const db = supabaseAdmin as any;
  const { data: account } = await db
    .from("student_accounts")
    .select("display_name, student_login_id")
    .eq("id", session.studentAccountId)
    .maybeSingle();

  const statusMap: Record<string, UnitStatus> = {};

  for (const item of UNITS) {
    if (!item.available) {
      statusMap[item.unit] = { meaningClear: false, readingClear: false, hasAdvanced: false };
      continue;
    }

    const [
      { data: meaningProgress },
      { data: readingProgress },
      { count: advancedCount },
    ] = await Promise.all([
      db
        .from("student_kanji_progress")
        .select("is_completed")
        .eq("student_account_id", session.studentAccountId)
        .eq("unit", item.unit)
        .maybeSingle(),
      db
        .from("student_reading_progress")
        .select("is_completed")
        .eq("student_account_id", session.studentAccountId)
        .eq("unit", item.unit)
        .eq("difficulty_tier", "normal")
        .maybeSingle(),
      db
        .from("questions_master")
        .select("*", { count: "exact", head: true })
        .eq("unit", item.unit)
        .eq("is_published", true)
        .eq("difficulty_tier", "high_level"),
    ]);

    statusMap[item.unit] = {
      meaningClear: meaningProgress?.is_completed === true,
      readingClear: readingProgress?.is_completed === true,
      hasAdvanced: (advancedCount ?? 0) > 0,
    };
  }

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
          <h1 style={styles.title}>Welcome{account?.display_name ? `, ${account.display_name}` : ""}!</h1>
          <p style={styles.subtitle}>Choose a unit and practice the meaning and reading.</p>
          <div style={styles.guidanceBox}>
            <p style={styles.guidanceText}>Meaning Quiz and Reading Quiz use the same unit order.</p>
            <p style={styles.guidanceText}>Studying both together can help you learn kanji more effectively.</p>
          </div>
        </div>

        <div style={styles.unitList}>
          {UNITS.map((item) => {
            const status = statusMap[item.unit] ?? {
              meaningClear: false,
              readingClear: false,
              hasAdvanced: false,
            };

            return (
              <section key={item.unit} style={styles.unitCard}>
                <div style={styles.unitHeader}>
                  <div>
                    <p style={styles.levelText}>{item.levelLabel}</p>
                    <h2 style={styles.unitTitle}>{item.unitLabel}</h2>
                  </div>
                  {!item.available ? <span style={styles.comingSoon}>Coming soon</span> : null}
                </div>

                <div style={styles.buttonGrid}>
                  <a
                    href={item.available ? `/kanji-quiz-test?unit=${item.unit}&mode=normal` : "#"}
                    style={{ ...styles.quizButton, ...styles.meaningButton, ...(item.available ? {} : styles.disabledButton) }}
                  >
                    {status.meaningClear ? <span style={styles.clearStamp}>CLEAR</span> : null}
                    <span style={styles.buttonMain}>Meaning Quiz</span>
                    <span style={styles.buttonSub}>意味クイズ</span>
                  </a>

                  <a
                    href={item.available ? `/kanji-reading-quiz?unit=${item.unit}&tier=normal&mode=normal` : "#"}
                    style={{ ...styles.quizButton, ...styles.readingButton, ...(item.available ? {} : styles.disabledButton) }}
                  >
                    {status.readingClear ? <span style={styles.clearStamp}>CLEAR</span> : null}
                    <span style={styles.buttonMain}>Reading Quiz</span>
                    <span style={styles.buttonSub}>読みクイズ</span>
                    {status.hasAdvanced ? <span style={styles.advancedHint}>Advanced available</span> : null}
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
    background: "linear-gradient(180deg, #f8fbff 0%, #e8f2ff 45%, #fff6e8 100%)",
    padding: "28px 16px",
    color: "#172033",
    fontFamily: 'Arial Rounded MT Bold, Arial, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif',
  },
  logoutForm: { width: "min(920px, 100%)", margin: "0 auto 12px", display: "flex", justifyContent: "flex-end" },
  logoutButton: {
    border: "3px solid #1f2b3d", borderRadius: 999, background: "#ffffff", color: "#1f2b3d", padding: "10px 18px",
    fontSize: 15, fontWeight: 900, cursor: "pointer", boxShadow: "0 4px 0 rgba(31,43,61,0.12)",
  },
  card: {
    width: "min(920px, 100%)", margin: "0 auto", background: "rgba(255,255,255,0.92)", border: "3px solid #1f2b3d",
    borderRadius: 28, padding: "26px 18px 22px", boxShadow: "0 12px 0 rgba(31,43,61,0.12)",
  },
  header: { textAlign: "center", marginBottom: 22 },
  kicker: { margin: 0, fontSize: 15, fontWeight: 900, color: "#4d97d4", letterSpacing: 1 },
  title: { margin: "6px 0 8px", fontSize: "clamp(30px, 5vw, 48px)", fontWeight: 900, lineHeight: 1.05 },
  subtitle: { margin: 0, fontSize: 16, fontWeight: 700, color: "#536174" },
  guidanceBox: { marginTop: 14, padding: "12px 14px", borderRadius: 18, background: "#f3f8ff", border: "2px solid #c9dbf5" },
  guidanceText: { margin: 0, fontSize: 14, fontWeight: 700, lineHeight: 1.45, color: "#425167" },
  unitList: { display: "grid", gap: 16 },
  unitCard: { border: "3px solid #1f2b3d", borderRadius: 22, background: "#fff", padding: 18 },
  unitHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 },
  levelText: { margin: 0, color: "#6d7c90", fontSize: 14, fontWeight: 900 },
  unitTitle: { margin: 0, fontSize: 28, fontWeight: 900 },
  comingSoon: { background: "#eeeeee", color: "#777", borderRadius: 999, padding: "8px 12px", fontSize: 13, fontWeight: 900 },
  buttonGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 },
  quizButton: {
    position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    minHeight: 94, borderRadius: 20, border: "3px solid #1f2b3d", textDecoration: "none", color: "#172033",
    boxShadow: "0 7px 0 rgba(31,43,61,0.12)", padding: "12px 10px", textAlign: "center",
  },
  meaningButton: { background: "#fff3c4" },
  readingButton: { background: "#d9ecff" },
  disabledButton: { pointerEvents: "none", opacity: 0.5 },
  buttonMain: { fontSize: 20, fontWeight: 900, lineHeight: 1.1 },
  buttonSub: { marginTop: 4, fontSize: 13, fontWeight: 800, color: "#516071" },
  advancedHint: { marginTop: 8, fontSize: 12, fontWeight: 900, color: "#b42318" },
  clearStamp: {
    position: "absolute", top: -6, right: -4, border: "2px solid #c62828", color: "#c62828",
    background: "rgba(255,255,255,0.95)", borderRadius: 999, padding: "3px 8px", fontSize: 11,
    fontWeight: 900, transform: "rotate(10deg)", boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
};
