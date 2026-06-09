"use client";

import { useEffect, useMemo, useState } from "react";

type DayProgress = {
  day_number: number;
  status: string;
  total_questions: number;
  answered_count: number;
  correct_count: number;
  incorrect_count: number;
  accuracy: number | null;
  first_answered_at: string | null;
  last_answered_at: string | null;
  completed_at: string | null;
};

type MistakeHistory = {
  day_number: number;
  question_order: number;
  section: string | null;
  prompt: string | null;
  completed_sentence: string | null;
  translation_en: string | null;
  target_text: string | null;
  meaning_ja: string | null;
  meaning_en: string | null;
  correct_answer: string | null;
  first_wrong_answer: string | null;
  first_wrong_at: string;
  last_wrong_answer: string | null;
  last_wrong_at: string;
  latest_answer: string | null;
  latest_is_correct: boolean;
  latest_answered_at: string;
  wrong_count: number;
  attempt_count: number;
  review_status: "resolved" | "needs_review";
};

type StudentProgress = {
  student_account_id: string;
  student_login_id: string;
  display_name: string | null;
  is_active: boolean;
  completed_days: number;
  review_needed_days: number;
  in_progress_days: number;
  total_answered: number;
  total_correct: number;
  accuracy_percent: number | null;
  last_answered_at: string | null;
  days: DayProgress[];
  mistake_history: MistakeHistory[];
  unresolved_mistake_count: number;
  resolved_mistake_count: number;
};

type N4ProgressResponse = {
  ok: boolean;
  error?: string;
  course?: {
    id: string;
    course_slug: string;
    title: string;
    total_days: number;
  };
  summary?: {
    student_count: number;
    active_student_count: number;
    total_answered: number;
    total_correct: number;
    average_accuracy: number | null;
  };
  students?: StudentProgress[];
};

function formatDate(value: string | null) {
  if (!value) return "まだ記録なし";

  try {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getStatusLabel(status: string) {
  if (status === "completed") return "完了";
  if (status === "review_needed") return "復習あり";
  if (status === "in_progress") return "途中";
  if (status === "not_started") return "未着手";
  return status;
}

function getSectionLabel(section: string | null) {
  if (section === "kanji_meaning") return "漢字の意味";
  if (section === "kanji_reading") return "漢字の読み";
  if (section === "vocab_reading") return "語彙の読み";
  if (section === "grammar") return "文法";
  return "問題";
}

function getStatusClass(status: string) {
  if (status === "completed") return "day completed";
  if (status === "review_needed") return "day reviewNeeded";
  if (status === "in_progress") return "day inProgress";
  if (status === "not_started") return "day notStarted";
  return "day notStarted";
}

function getQuestionText(mistake: MistakeHistory) {
  return mistake.completed_sentence || mistake.prompt || "問題文なし";
}

export default function TeacherN4ProgressPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [data, setData] = useState<N4ProgressResponse | null>(null);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(
    null
  );

  const students = useMemo(() => data?.students ?? [], [data]);

  async function loadProgress() {
    try {
      setLoading(true);
      setLoadError("");

      const response = await fetch("/api/teacher/n4-progress", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const json = (await response.json()) as N4ProgressResponse;

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Failed to load N4 progress.");
      }

      setData(json);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load N4 progress.";
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProgress();
  }, []);

  return (
    <main className="page">
      <section className="shell">
        <header className="header">
          <div>
            <p className="label">Teacher Dashboard</p>
            <h1>N4 30日集中対策 進捗管理</h1>
            <p className="subText">
              生徒ごとの完了日数・復習あり・正解率・学習日時・一度でも間違えた問題を確認できます。
            </p>
          </div>

          <button className="reloadButton" type="button" onClick={loadProgress}>
            更新
          </button>
        </header>

        {loading && (
          <section className="card centerCard">
            <div className="loader" />
            <p>読み込み中...</p>
          </section>
        )}

        {!loading && loadError && (
          <section className="card errorCard">
            <h2>読み込みできませんでした</h2>
            <p>{loadError}</p>
          </section>
        )}

        {!loading && !loadError && (
          <>
            <section className="summaryGrid">
              <div className="summaryCard">
                <p>登録生徒</p>
                <strong>{data?.summary?.student_count ?? 0}</strong>
              </div>

              <div className="summaryCard">
                <p>回答数</p>
                <strong>{data?.summary?.total_answered ?? 0}</strong>
              </div>

              <div className="summaryCard">
                <p>正解数</p>
                <strong>{data?.summary?.total_correct ?? 0}</strong>
              </div>

              <div className="summaryCard">
                <p>全体正解率</p>
                <strong>
                  {data?.summary?.average_accuracy == null
                    ? "まだ記録なし"
                    : `${data.summary.average_accuracy}%`}
                </strong>
              </div>
            </section>

            <section className="legendCard">
              <span>
                <i className="dot completedDot" /> 完了
              </span>
              <span>
                <i className="dot reviewDot" /> 復習あり
              </span>
              <span>
                <i className="dot progressDot" /> 途中
              </span>
              <span>
                <i className="dot notStartedDot" /> 未着手
              </span>
              <span>
                <i className="dot needsReviewDot" /> 要確認
              </span>
              <span>
                <i className="dot resolvedDot" /> 正解済み
              </span>
            </section>

            <section className="studentList">
              {students.length === 0 ? (
                <div className="card emptyCard">
                  <p>まだN4講座に登録されている生徒がいません。</p>
                </div>
              ) : (
                students.map((student) => {
                  const expanded =
                    expandedStudentId === student.student_account_id;

                  return (
                    <article
                      className="studentCard"
                      key={student.student_account_id}
                    >
                      <button
                        className="studentMain"
                        type="button"
                        onClick={() =>
                          setExpandedStudentId(
                            expanded ? null : student.student_account_id
                          )
                        }
                      >
                        <div className="studentNameArea">
                          <strong>
                            {student.display_name || student.student_login_id}
                          </strong>
                          <span>{student.student_login_id}</span>
                        </div>

                        <div className="studentStats">
                          <div>
                            <span>完了</span>
                            <strong>{student.completed_days}/30日</strong>
                          </div>

                          <div>
                            <span>復習</span>
                            <strong>{student.review_needed_days}日</strong>
                          </div>

                          <div>
                            <span>正解率</span>
                            <strong>
                              {student.accuracy_percent == null
                                ? "未記録"
                                : `${student.accuracy_percent}%`}
                            </strong>
                          </div>

                          <div>
                            <span>一度でも間違えた問題</span>
                            <strong>{student.mistake_history.length}問</strong>
                          </div>

                          <div>
                            <span>要確認</span>
                            <strong>{student.unresolved_mistake_count}問</strong>
                          </div>
                        </div>

                        <div className="lastSeen">
                          <span>最終学習</span>
                          <strong>{formatDate(student.last_answered_at)}</strong>
                        </div>

                        <span className="expandMark">
                          {expanded ? "▲" : "▼"}
                        </span>
                      </button>

                      {expanded && (
                        <div className="studentDetail">
                          <div className="dayGrid">
                            {student.days.map((day) => (
                              <div
                                className={getStatusClass(day.status)}
                                key={`${student.student_account_id}-${day.day_number}`}
                                title={`Day ${day.day_number}: ${getStatusLabel(
                                  day.status
                                )}`}
                              >
                                <strong>{day.day_number}</strong>
                                <span>{getStatusLabel(day.status)}</span>
                                {day.answered_count > 0 && (
                                  <small>
                                    {day.correct_count}/{day.answered_count}
                                  </small>
                                )}
                              </div>
                            ))}
                          </div>

                          <div className="detailGrid">
                            <div className="detailBox">
                              <h3>1日目・2日目…をいつやったか</h3>

                              <div className="dayTable">
                                {student.days
                                  .filter((day) => day.answered_count > 0)
                                  .map((day) => (
                                    <div className="dayRow" key={day.day_number}>
                                      <div>
                                        <strong>Day {day.day_number}</strong>
                                        <span>{getStatusLabel(day.status)}</span>
                                      </div>

                                      <div>
                                        <span>開始</span>
                                        <strong>
                                          {formatDate(day.first_answered_at)}
                                        </strong>
                                      </div>

                                      <div>
                                        <span>最終回答</span>
                                        <strong>
                                          {formatDate(day.last_answered_at)}
                                        </strong>
                                      </div>

                                      <div>
                                        <span>完了</span>
                                        <strong>
                                          {formatDate(day.completed_at)}
                                        </strong>
                                      </div>

                                      <div>
                                        <span>正解</span>
                                        <strong>
                                          {day.correct_count}/{day.answered_count}
                                        </strong>
                                      </div>
                                    </div>
                                  ))}

                                {student.days.every(
                                  (day) => day.answered_count === 0
                                ) && (
                                  <p className="mutedText">
                                    まだ回答記録がありません。
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="detailBox">
                              <h3>一度でも間違えた問題</h3>

                              {student.mistake_history.length === 0 ? (
                                <p className="mutedText">
                                  まだ間違えた問題はありません。
                                </p>
                              ) : (
                                <div className="mistakeList">
                                  {student.mistake_history.map(
                                    (mistake, index) => (
                                      <div
                                        className="mistakeItem"
                                        key={`${mistake.day_number}-${mistake.question_order}-${index}`}
                                      >
                                        <div className="mistakeHeader">
                                          <div className="badgeRow">
                                            <span className="mistakeBadge">
                                              Day {mistake.day_number} - Q
                                              {mistake.question_order}
                                            </span>

                                            <span className="sectionBadge">
                                              {getSectionLabel(mistake.section)}
                                            </span>
                                          </div>

                                          <span
                                            className={
                                              mistake.review_status ===
                                              "resolved"
                                                ? "resolvedBadge"
                                                : "needsReviewBadge"
                                            }
                                          >
                                            {mistake.review_status === "resolved"
                                              ? "復習で正解済み"
                                              : "まだ要確認"}
                                          </span>
                                        </div>

                                        <div className="questionBox">
                                          <span>問題文</span>
                                          <strong>
                                            {getQuestionText(mistake)}
                                          </strong>
                                          {mistake.translation_en && (
                                            <small>{mistake.translation_en}</small>
                                          )}
                                        </div>

                                        <div className="answerCompare">
                                          <div>
                                            <span>Target</span>
                                            <strong>
                                              {mistake.target_text || "-"}
                                            </strong>
                                          </div>

                                          <div className="wrongAnswer">
                                            <span>最初の誤答</span>
                                            <strong>
                                              {mistake.first_wrong_answer ||
                                                "空欄"}
                                            </strong>
                                          </div>

                                          <div className="correctAnswer">
                                            <span>正解</span>
                                            <strong>
                                              {mistake.correct_answer || "-"}
                                            </strong>
                                          </div>
                                        </div>

                                        <div className="historyBox">
                                          <div>
                                            <span>最初に間違えた日時</span>
                                            <strong>
                                              {formatDate(
                                                mistake.first_wrong_at
                                              )}
                                            </strong>
                                          </div>

                                          <div>
                                            <span>最後に間違えた答え</span>
                                            <strong>
                                              {mistake.last_wrong_answer ||
                                                "空欄"}
                                            </strong>
                                          </div>

                                          <div>
                                            <span>最後の回答</span>
                                            <strong>
                                              {mistake.latest_answer || "空欄"}
                                            </strong>
                                          </div>

                                          <div>
                                            <span>最後に解いた日時</span>
                                            <strong>
                                              {formatDate(
                                                mistake.latest_answered_at
                                              )}
                                            </strong>
                                          </div>

                                          <div>
                                            <span>間違えた回数</span>
                                            <strong>{mistake.wrong_count}回</strong>
                                          </div>

                                          <div>
                                            <span>総回答回数</span>
                                            <strong>
                                              {mistake.attempt_count}回
                                            </strong>
                                          </div>
                                        </div>

                                        {(mistake.meaning_ja ||
                                          mistake.meaning_en) && (
                                          <div className="meaningBox">
                                            {mistake.meaning_ja && (
                                              <p>意味：{mistake.meaning_ja}</p>
                                            )}
                                            {mistake.meaning_en && (
                                              <p>Meaning: {mistake.meaning_en}</p>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </section>
          </>
        )}
      </section>

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .page {
    min-height: 100vh;
    padding: 24px;
    background: #f1f5f9;
    color: #0f172a;
    font-family:
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
  }

  .shell {
    width: min(1180px, 100%);
    margin: 0 auto;
  }

  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 20px;
  }

  .label {
    margin: 0 0 6px;
    color: #6366f1;
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-size: clamp(28px, 4vw, 44px);
    font-weight: 950;
    letter-spacing: -0.04em;
  }

  .subText {
    margin: 10px 0 0;
    color: #64748b;
    font-size: 15px;
    font-weight: 700;
  }

  .reloadButton {
    border: none;
    border-radius: 14px;
    padding: 12px 18px;
    background: #0f172a;
    color: white;
    font-size: 14px;
    font-weight: 900;
    cursor: pointer;
  }

  .card,
  .studentCard,
  .summaryCard,
  .legendCard {
    border-radius: 22px;
    background: white;
    box-shadow: 0 12px 34px rgba(15, 23, 42, 0.08);
    border: 1px solid rgba(148, 163, 184, 0.22);
  }

  .centerCard,
  .errorCard,
  .emptyCard {
    padding: 32px;
    text-align: center;
  }

  .loader {
    width: 34px;
    height: 34px;
    margin: 0 auto 12px;
    border-radius: 999px;
    border: 4px solid #cbd5e1;
    border-top-color: #6366f1;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .summaryGrid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 14px;
  }

  .summaryCard {
    padding: 18px;
  }

  .summaryCard p {
    margin: 0 0 8px;
    color: #64748b;
    font-size: 13px;
    font-weight: 900;
  }

  .summaryCard strong {
    color: #0f172a;
    font-size: 28px;
    font-weight: 950;
  }

  .legendCard {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 16px;
    padding: 14px 16px;
    margin-bottom: 16px;
    color: #334155;
    font-size: 13px;
    font-weight: 900;
  }

  .legendCard span {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  .dot {
    width: 13px;
    height: 13px;
    border-radius: 999px;
    display: inline-block;
  }

  .completedDot {
    background: #22c55e;
  }

  .reviewDot {
    background: #a855f7;
  }

  .progressDot {
    background: #facc15;
  }

  .notStartedDot {
    background: #60a5fa;
  }

  .needsReviewDot {
    background: #ef4444;
  }

  .resolvedDot {
    background: #14b8a6;
  }

  .studentList {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .studentCard {
    overflow: hidden;
  }

  .studentMain {
    width: 100%;
    border: none;
    background: white;
    padding: 18px;
    display: grid;
    grid-template-columns: 1.1fr 1.8fr 1.1fr auto;
    gap: 16px;
    align-items: center;
    text-align: left;
    cursor: pointer;
  }

  .studentNameArea {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .studentNameArea strong {
    color: #0f172a;
    font-size: 19px;
    font-weight: 950;
  }

  .studentNameArea span {
    color: #64748b;
    font-size: 13px;
    font-weight: 800;
  }

  .studentStats {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
  }

  .studentStats div,
  .lastSeen {
    padding: 12px;
    border-radius: 16px;
    background: #f8fafc;
  }

  .studentStats span,
  .lastSeen span {
    display: block;
    margin-bottom: 4px;
    color: #64748b;
    font-size: 12px;
    font-weight: 900;
  }

  .studentStats strong,
  .lastSeen strong {
    color: #0f172a;
    font-size: 15px;
    font-weight: 950;
  }

  .expandMark {
    color: #64748b;
    font-size: 16px;
    font-weight: 950;
  }

  .studentDetail {
    padding: 0 18px 18px;
    border-top: 1px solid #e2e8f0;
  }

  .dayGrid {
    display: grid;
    grid-template-columns: repeat(10, minmax(0, 1fr));
    gap: 8px;
    padding-top: 18px;
    margin-bottom: 18px;
  }

  .day {
    min-height: 58px;
    border-radius: 14px;
    padding: 8px 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    text-align: center;
    color: #0f172a;
    font-weight: 900;
  }

  .day strong {
    font-size: 15px;
  }

  .day span {
    font-size: 10px;
  }

  .day small {
    font-size: 10px;
    color: #334155;
  }

  .completed {
    background: #dcfce7;
    border: 2px solid #22c55e;
  }

  .reviewNeeded {
    background: #f3e8ff;
    border: 2px solid #a855f7;
  }

  .inProgress {
    background: #fef9c3;
    border: 2px solid #facc15;
  }

  .notStarted {
    background: #dbeafe;
    border: 2px solid #60a5fa;
  }

  .detailGrid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  .detailBox {
    padding: 16px;
    border-radius: 18px;
    background: #f8fafc;
  }

  .detailBox h3 {
    margin: 0 0 12px;
    font-size: 16px;
    font-weight: 950;
  }

  .dayTable {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .dayRow {
    display: grid;
    grid-template-columns: 0.8fr 1.3fr 1.3fr 1.3fr 0.8fr;
    gap: 8px;
    padding: 12px;
    border-radius: 14px;
    background: white;
    color: #334155;
    font-size: 12px;
    font-weight: 800;
  }

  .dayRow div {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .dayRow span {
    color: #64748b;
    font-size: 11px;
    font-weight: 900;
  }

  .dayRow strong {
    color: #0f172a;
    font-size: 12px;
    font-weight: 950;
  }

  .mistakeList {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .mistakeItem {
    padding: 14px;
    border-radius: 18px;
    background: white;
    border: 1px solid #fee2e2;
  }

  .mistakeHeader {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }

  .badgeRow {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .mistakeBadge,
  .sectionBadge,
  .resolvedBadge,
  .needsReviewBadge {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 5px 9px;
    font-size: 11px;
    font-weight: 950;
  }

  .mistakeBadge {
    background: #fee2e2;
    color: #991b1b;
  }

  .sectionBadge {
    background: #e0e7ff;
    color: #3730a3;
  }

  .resolvedBadge {
    background: #ccfbf1;
    color: #0f766e;
  }

  .needsReviewBadge {
    background: #fee2e2;
    color: #b91c1c;
  }

  .questionBox {
    padding: 12px;
    border-radius: 14px;
    background: #f8fafc;
    margin-bottom: 10px;
  }

  .questionBox span,
  .answerCompare span,
  .historyBox span {
    display: block;
    color: #64748b;
    font-size: 11px;
    font-weight: 950;
    margin-bottom: 4px;
  }

  .questionBox strong {
    display: block;
    color: #0f172a;
    font-size: 15px;
    font-weight: 950;
    line-height: 1.55;
  }

  .questionBox small {
    display: block;
    margin-top: 5px;
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
    line-height: 1.45;
  }

  .answerCompare {
    display: grid;
    grid-template-columns: 0.9fr 1fr 1fr;
    gap: 8px;
    margin-bottom: 10px;
  }

  .answerCompare div,
  .historyBox div {
    padding: 10px;
    border-radius: 13px;
    background: #f8fafc;
  }

  .answerCompare strong,
  .historyBox strong {
    color: #0f172a;
    font-size: 14px;
    font-weight: 950;
  }

  .wrongAnswer {
    background: #fef2f2 !important;
  }

  .wrongAnswer strong {
    color: #b91c1c;
  }

  .correctAnswer {
    background: #f0fdf4 !important;
  }

  .correctAnswer strong {
    color: #15803d;
  }

  .historyBox {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 10px;
  }

  .meaningBox {
    padding: 10px 12px;
    border-radius: 13px;
    background: #fff7ed;
    margin-bottom: 10px;
  }

  .meaningBox p {
    margin: 3px 0;
    color: #9a3412;
    font-size: 12px;
    font-weight: 850;
  }

  .mutedText {
    margin: 0;
    color: #64748b;
    font-size: 13px;
    font-weight: 800;
  }

  @media (max-width: 1100px) {
    .studentStats {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 980px) {
    .detailGrid {
      grid-template-columns: 1fr;
    }

    .dayRow {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 860px) {
    .page {
      padding: 16px;
    }

    .header {
      flex-direction: column;
    }

    .summaryGrid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .studentMain {
      grid-template-columns: 1fr;
    }

    .studentStats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .lastSeen {
      width: 100%;
    }

    .dayGrid {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }

    .answerCompare {
      grid-template-columns: 1fr;
    }

    .historyBox {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 520px) {
    .summaryGrid {
      grid-template-columns: 1fr;
    }

    .studentStats {
      grid-template-columns: 1fr;
    }

    .dayGrid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .dayRow {
      grid-template-columns: 1fr;
    }

    .mistakeHeader {
      flex-direction: column;
      align-items: flex-start;
    }
  }
`;