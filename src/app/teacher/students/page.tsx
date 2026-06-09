import Link from "next/link";
import type { CSSProperties } from "react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type StudentProgressRow = {
  student_id: string;
  display_name: string | null;
  student_login_id: string | null;
  is_active: boolean | null;
  current_unit: string | null;
  last_order_completed: number | null;
};

type WrongKanjiRow = {
  student_id: string;
  kanji: string;
};

function formatProgress(lastOrderCompleted: number | null) {
  if (lastOrderCompleted === null || lastOrderCompleted === undefined) {
    return "0";
  }

  return String(lastOrderCompleted);
}

function formatUnit(unit: string | null) {
  if (!unit) return "まだ記録なし";
  return unit;
}

function ErrorView({ message }: { message: string }) {
  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <section style={styles.errorCard}>
          <p style={styles.label}>TEACHER DASHBOARD</p>
          <h1 style={styles.title}>漢字クイズ進捗管理</h1>
          <p style={styles.errorText}>{message}</p>
        </section>
      </div>
    </main>
  );
}

export default async function TeacherStudentsPage() {
  const db = supabaseAdmin as any;

  const { data: progressRows, error: progressError } = await db
    .from("teacher_student_progress_view")
    .select("*")
    .order("display_name", { ascending: true });

  const { data: wrongRows, error: wrongError } = await db
    .from("teacher_wrong_kanji_view")
    .select("student_id, kanji");

  if (progressError) {
    return (
      <ErrorView
        message={`生徒の進捗を読み込めませんでした：${progressError.message}`}
      />
    );
  }

  if (wrongError) {
    return (
      <ErrorView
        message={`未正解データを読み込めませんでした：${wrongError.message}`}
      />
    );
  }

  const progressList: StudentProgressRow[] = progressRows ?? [];
  const wrongList: WrongKanjiRow[] = wrongRows ?? [];

  const wrongCountMap = new Map<string, number>();

  for (const row of wrongList) {
    const current = wrongCountMap.get(row.student_id) ?? 0;
    wrongCountMap.set(row.student_id, current + 1);
  }

  const activeCount = progressList.filter((student) => student.is_active).length;
  const inactiveCount = progressList.length - activeCount;

  const totalWrongNow = progressList.reduce((sum, student) => {
    return sum + (wrongCountMap.get(student.student_id) ?? 0);
  }, 0);

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div>
            <p style={styles.label}>TEACHER DASHBOARD</p>
            <h1 style={styles.title}>漢字クイズ進捗管理</h1>
            <p style={styles.subtitle}>
              生徒ごとの現在のユニット・進捗・未正解の漢字を確認できます。
            </p>
          </div>

          <Link href="/teacher/n4-progress" style={styles.topButton}>
            N4進捗を見る
          </Link>
        </header>

        <section style={styles.summaryGrid}>
          <div style={styles.summaryCard}>
            <p style={styles.summaryLabel}>登録生徒</p>
            <strong style={styles.summaryValue}>{progressList.length}</strong>
          </div>

          <div style={styles.summaryCard}>
            <p style={styles.summaryLabel}>有効な生徒</p>
            <strong style={styles.summaryValue}>{activeCount}</strong>
          </div>

          <div style={styles.summaryCard}>
            <p style={styles.summaryLabel}>現在の未正解</p>
            <strong style={styles.summaryValue}>{totalWrongNow}</strong>
          </div>

          <div style={styles.summaryCard}>
            <p style={styles.summaryLabel}>無効な生徒</p>
            <strong style={styles.summaryValue}>{inactiveCount}</strong>
          </div>
        </section>

        <section style={styles.legendCard}>
          <span style={styles.legendItem}>
            <i style={{ ...styles.dot, background: "#22c55e" }} />
            有効
          </span>

          <span style={styles.legendItem}>
            <i style={{ ...styles.dot, background: "#94a3b8" }} />
            無効
          </span>

          <span style={styles.legendItem}>
            <i style={{ ...styles.dot, background: "#f59e0b" }} />
            現在の未正解
          </span>

          <span style={styles.legendItem}>
            <i style={{ ...styles.dot, background: "#6366f1" }} />
            漢字クイズ
          </span>
        </section>

        <section style={styles.navCard}>
          <div>
            <strong style={styles.navTitle}>N4コースの進捗はこちら</strong>
            <p style={styles.navText}>
              N4 30日集中対策の完了日数・正解率・間違えた問題は専用ページで確認できます。
            </p>
          </div>

          <Link href="/teacher/n4-progress" style={styles.navButton}>
            N4進捗管理へ
          </Link>
        </section>

        {progressList.length === 0 ? (
          <section style={styles.emptyCard}>
            <h2 style={styles.emptyTitle}>まだ生徒がいません</h2>
            <p style={styles.emptyText}>
              生徒アカウントが作成されると、ここに表示されます。
            </p>
          </section>
        ) : (
          <section style={styles.studentList}>
            {progressList.map((student) => {
              const wrongNow = wrongCountMap.get(student.student_id) ?? 0;
              const displayName = student.display_name || "名前なし";
              const loginId = student.student_login_id || "-";
              const isActive = Boolean(student.is_active);

              return (
                <article style={styles.studentCard} key={student.student_id}>
                  <div style={styles.studentMain}>
                    <div style={styles.studentNameArea}>
                      <strong style={styles.studentName}>{displayName}</strong>
                      <span style={styles.studentLoginId}>{loginId}</span>
                    </div>

                    <div style={styles.studentStats}>
                      <div style={styles.statBox}>
                        <span style={styles.statLabel}>現在のユニット</span>
                        <strong style={styles.statValue}>
                          {formatUnit(student.current_unit)}
                        </strong>
                      </div>

                      <div style={styles.statBox}>
                        <span style={styles.statLabel}>進捗</span>
                        <strong style={styles.statValue}>
                          {formatProgress(student.last_order_completed)}
                        </strong>
                      </div>

                      <div
                        style={{
                          ...styles.statBox,
                          background: wrongNow > 0 ? "#fffbeb" : "#f0fdf4",
                        }}
                      >
                        <span
                          style={{
                            ...styles.statLabel,
                            color: wrongNow > 0 ? "#b45309" : "#15803d",
                          }}
                        >
                          現在の未正解
                        </span>
                        <strong
                          style={{
                            ...styles.statValue,
                            color: wrongNow > 0 ? "#b45309" : "#15803d",
                          }}
                        >
                          {wrongNow}
                        </strong>
                      </div>

                      <div style={styles.statBox}>
                        <span style={styles.statLabel}>状態</span>
                        {isActive ? (
                          <strong style={{ ...styles.statusText, color: "#15803d" }}>
                            有効
                          </strong>
                        ) : (
                          <strong style={{ ...styles.statusText, color: "#64748b" }}>
                            無効
                          </strong>
                        )}
                      </div>
                    </div>

                    <Link
                      href={`/teacher/students/${student.student_id}`}
                      style={styles.detailButton}
                    >
                      詳細を見る
                    </Link>
                  </div>
                </article>
              );
            })}
          </section>
        )}
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
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
    margin: "18px 0 0",
    color: "#64748b",
    fontSize: 16,
    fontWeight: 800,
    lineHeight: 1.8,
  },

  topButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: 16,
    background: "#0f172a",
    color: "#ffffff",
    padding: "14px 20px",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 900,
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

  legendCard: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px 20px",
    background: "#ffffff",
    borderRadius: 22,
    padding: "16px 20px",
    marginBottom: 18,
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.07)",
    border: "1px solid rgba(148, 163, 184, 0.22)",
  },

  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: "#334155",
    fontSize: 14,
    fontWeight: 900,
  },

  dot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    display: "inline-block",
  },

  navCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 18,
    background: "#ffffff",
    borderRadius: 24,
    padding: 22,
    marginBottom: 22,
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.08)",
    border: "1px solid rgba(148, 163, 184, 0.22)",
  },

  navTitle: {
    display: "block",
    color: "#0f172a",
    fontSize: 18,
    fontWeight: 950,
  },

  navText: {
    margin: "8px 0 0",
    color: "#64748b",
    fontSize: 14,
    fontWeight: 800,
    lineHeight: 1.7,
  },

  navButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: 16,
    background: "#eef2ff",
    color: "#3730a3",
    padding: "13px 18px",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 950,
  },

  studentList: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },

  studentCard: {
    background: "#ffffff",
    borderRadius: 28,
    boxShadow: "0 16px 38px rgba(15, 23, 42, 0.08)",
    border: "1px solid rgba(148, 163, 184, 0.22)",
    overflow: "hidden",
  },

  studentMain: {
    display: "grid",
    gridTemplateColumns: "minmax(160px, 1fr) minmax(420px, 2.3fr) auto",
    gap: 18,
    alignItems: "center",
    padding: 24,
  },

  studentNameArea: {
    minWidth: 0,
  },

  studentName: {
    display: "block",
    color: "#0f172a",
    fontSize: 22,
    fontWeight: 950,
    lineHeight: 1.2,
    wordBreak: "break-word",
  },

  studentLoginId: {
    display: "block",
    marginTop: 6,
    color: "#64748b",
    fontSize: 14,
    fontWeight: 850,
    wordBreak: "break-word",
  },

  studentStats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: 12,
  },

  statBox: {
    background: "#f8fafc",
    borderRadius: 18,
    padding: "14px 16px",
    minHeight: 78,
  },

  statLabel: {
    display: "block",
    color: "#64748b",
    fontSize: 12,
    fontWeight: 900,
    marginBottom: 8,
  },

  statValue: {
    display: "block",
    color: "#0f172a",
    fontSize: 17,
    fontWeight: 950,
    lineHeight: 1.35,
    wordBreak: "break-word",
  },

  statusText: {
    display: "block",
    fontSize: 17,
    fontWeight: 950,
  },

  detailButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    background: "#0f172a",
    color: "#ffffff",
    padding: "13px 18px",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 950,
    whiteSpace: "nowrap",
  },

  emptyCard: {
    background: "#ffffff",
    borderRadius: 28,
    padding: 40,
    textAlign: "center",
    boxShadow: "0 16px 38px rgba(15, 23, 42, 0.08)",
    border: "1px solid rgba(148, 163, 184, 0.22)",
  },

  emptyTitle: {
    margin: 0,
    color: "#0f172a",
    fontSize: 26,
    fontWeight: 950,
  },

  emptyText: {
    margin: "12px 0 0",
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
};