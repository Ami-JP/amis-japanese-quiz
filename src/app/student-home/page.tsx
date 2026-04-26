import { redirect } from "next/navigation";
import { getStudentSession } from "@/lib/auth/student";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const UNITS = [
  {
    levelLabel: "Level 1",
    unitLabel: "Unit 01",
    unit: "grade1-kanji-01",
    available: true,
  },
  {
    levelLabel: "Level 1",
    unitLabel: "Unit 02",
    unit: "grade1-kanji-02",
    available: true,
  },
  {
    levelLabel: "Level 1",
    unitLabel: "Unit 03",
    unit: "grade1-kanji-03",
    available: false,
  },
];

export default async function StudentHomePage() {
  const session = await getStudentSession();

  if (!session?.studentAccountId) {
    redirect("/student-login");
  }

  const db = supabaseAdmin as any;

  const { data: account } = await db
    .from("student_accounts")
    .select("display_name, student_login_id")
    .eq("id", session.studentAccountId)
    .maybeSingle();

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
            Choose a unit and practice the meaning and reading.
          </p>
        </div>

        <div style={styles.unitList}>
          {UNITS.map((item) => (
            <section key={item.unit} style={styles.unitCard}>
              <div style={styles.unitHeader}>
                <div>
                  <p style={styles.levelText}>{item.levelLabel}</p>
                  <h2 style={styles.unitTitle}>{item.unitLabel}</h2>
                </div>

                {!item.available ? (
                  <span style={styles.comingSoon}>Coming soon</span>
                ) : null}
              </div>

              <div style={styles.buttonGrid}>
                <a
                  href={
                    item.available
                      ? `/kanji-quiz-test?unit=${item.unit}&tier=normal&mode=normal`
                      : "#"
                  }
                  style={{
                    ...styles.quizButton,
                    ...styles.meaningButton,
                    ...(item.available ? {} : styles.disabledButton),
                  }}
                >
                  <span style={styles.buttonMain}>Meaning Quiz</span>
                  <span style={styles.buttonSub}>意味クイズ</span>
                </a>

                <a
                  href={
                    item.available
                      ? `/kanji-reading-quiz?unit=${item.unit}&tier=normal&mode=normal`
                      : "#"
                  }
                  style={{
                    ...styles.quizButton,
                    ...styles.readingButton,
                    ...(item.available ? {} : styles.disabledButton),
                  }}
                >
                  <span style={styles.buttonMain}>Reading Quiz</span>
                  <span style={styles.buttonSub}>読みクイズ</span>
                </a>
              </div>
            </section>
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
    marginBottom: 22,
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

  unitList: {
    display: "grid",
    gap: 16,
  },

  unitCard: {
    border: "3px solid #1f2b3d",
    borderRadius: 22,
    background: "#fff",
    padding: 18,
  },

  unitHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },

  levelText: {
    margin: 0,
    color: "#6d7c90",
    fontSize: 14,
    fontWeight: 900,
  },

  unitTitle: {
    margin: 0,
    fontSize: 28,
    fontWeight: 900,
  },

  comingSoon: {
    background: "#eeeeee",
    color: "#777",
    borderRadius: 999,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 900,
  },

  buttonGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },

  quizButton: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 94,
    borderRadius: 20,
    border: "3px solid #1f2b3d",
    textDecoration: "none",
    color: "#111",
    boxShadow: "0 6px 0 rgba(31,43,61,0.14)",
    transition: "transform 0.12s ease",
    textAlign: "center",
  },

  meaningButton: {
    background: "#ddef57",
  },

  readingButton: {
    background: "#9ec1f0",
  },

  disabledButton: {
    pointerEvents: "none",
    opacity: 0.45,
    boxShadow: "none",
  },

  buttonMain: {
    width: "100%",
    textAlign: "center",
    fontSize: 22,
    fontWeight: 900,
    lineHeight: 1.05,
  },

  buttonSub: {
    width: "100%",
    textAlign: "center",
    marginTop: 5,
    fontSize: 14,
    fontWeight: 900,
  },
};