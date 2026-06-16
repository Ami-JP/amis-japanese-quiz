"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

type CourseHomeDay = {
  id: string;
  day_number: number;
  day_title: string;
  day_theme: string | null;
  kanji_list: string[] | null;
  is_published: boolean;
  question_count: number;
  state:
    | "completed"
    | "review_needed"
    | "in_progress"
    | "current"
    | "available"
    | "coming_soon";
  progress: {
    day_number: number;
    status: string;
    total_questions: number;
    answered_count: number;
    correct_count: number;
    incorrect_count: number;
    accuracy: number | null;
    completed_at: string | null;
    last_answered_at: string | null;
  } | null;
};

type CourseHomeResponse = {
  ok: boolean;
  error?: string;
  course?: {
    id: string;
    course_slug: string;
    title: string;
    jlpt_level: string | null;
    description: string | null;
    total_days: number;
    is_published: boolean;
  };
  summary?: {
    total_days: number;
    loaded_days: number;
    playable_days: number;
    completed_days: number;
    review_needed_days: number;
    progress_percent: number;
    overall_accuracy: number;
    overall_answered_count: number;
    overall_correct_count: number;
  };
  days?: CourseHomeDay[];
};

function getParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function getDayText(dayNumber: number) {
  if (dayNumber === 29) return "まちがえ\nやすい\n漢字①";
  if (dayNumber === 30) return "まちがえ\nやすい\n漢字②";

  return `${dayNumber}\n日目`;
}

function chunkDays(days: CourseHomeDay[], size: number) {
  const chunks: CourseHomeDay[][] = [];

  for (let i = 0; i < days.length; i += size) {
    const row = days.slice(i, i + size);
    chunks.push(chunks.length % 2 === 0 ? row : [...row].reverse());
  }

  return chunks;
}

function isClickable(day: CourseHomeDay) {
  return day.question_count > 0 && day.state !== "coming_soon";
}

function getDayClass(day: CourseHomeDay) {
  const classes = ["dayNode"];

  if (day.state === "completed") classes.push("completed");
  if (day.state === "review_needed") classes.push("reviewNeeded");
  if (day.state === "in_progress") classes.push("inProgress");
  if (day.state === "current") classes.push("current");
  if (day.state === "available") classes.push("available");
  if (day.state === "coming_soon") classes.push("comingSoon");

  if (day.day_number === 7 || day.day_number === 14 || day.day_number === 21) {
    classes.push("milestoneDay");
  }
  if (day.day_number === 28 || day.day_number === 30) classes.push("finalDay");
  if (day.day_number === 29) classes.push("reviewDay");
  if (day.day_number === 29) classes.push("challengeDay");
  if (day.day_number === 30) classes.push("finalCheckDay");

  return classes.join(" ");
}

function getDayDecoration(dayNumber: number) {
  if (dayNumber === 3) return "✨";
  if (dayNumber === 7) return "🌟";
  if (dayNumber === 10) return "🌸";
  if (dayNumber === 14) return "💪";
  if (dayNumber === 18) return "🌙";
  if (dayNumber === 21) return "🔥";
  if (dayNumber === 25) return "🎈";
  if (dayNumber === 28) return "🚩";
  if (dayNumber === 29) return "📝";
  if (dayNumber === 30) return "🏁";
  return "";
}

function getMotivationLabel(dayNumber: number) {
  if (dayNumber === 3) return "いいスタート！";
  if (dayNumber === 7) return "1週間達成！";
  if (dayNumber === 14) return "半分まで来た！";
  if (dayNumber === 21) return "あと少し！";
  if (dayNumber === 28) return "28日達成！";
  if (dayNumber === 29) return "Mix-up Kanji 1";
  if (dayNumber === 30) return "Mix-up Kanji 2";
  return "";
}

export default function CourseHomePage() {
  const params = useParams();
  const router = useRouter();

  const courseSlug = getParamValue(params.courseSlug);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [data, setData] = useState<CourseHomeResponse | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const days = useMemo(() => data?.days ?? [], [data]);
  const rows = useMemo(() => chunkDays(days, 5), [days]);

  const completedDays = data?.summary?.completed_days ?? 0;
  const totalDays = data?.summary?.total_days ?? 30;
  const reviewNeededDays = data?.summary?.review_needed_days ?? 0;
  const progressPercent = data?.summary?.progress_percent ?? 0;
  const overallAccuracy = data?.summary?.overall_accuracy ?? 0;
  const answeredCount = data?.summary?.overall_answered_count ?? 0;
  const correctCount = data?.summary?.overall_correct_count ?? 0;

  useEffect(() => {
    async function loadHome() {
      try {
        setLoading(true);
        setLoadError("");

        if (!courseSlug) {
          throw new Error("Course slug was not found.");
        }

        const response = await fetch(
          `/api/course-home?course_slug=${encodeURIComponent(courseSlug)}`,
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          }
        );

        const json = (await response.json()) as CourseHomeResponse;

        if (!response.ok || !json.ok) {
          throw new Error(json.error || "Failed to load course home.");
        }

        setData(json);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load course home.";
        setLoadError(message);
      } finally {
        setLoading(false);
      }
    }

    loadHome();
  }, [courseSlug]);

  async function handleLogout() {
    if (loggingOut) return;

    try {
      setLoggingOut(true);

      await fetch("/api/student-logout", {
        method: "POST",
        credentials: "include",
      });

      router.push(`/course-login/${encodeURIComponent(courseSlug)}`);
      router.refresh();
    } catch {
      router.push(`/course-login/${encodeURIComponent(courseSlug)}`);
      router.refresh();
    }
  }

  if (loading) {
    return (
      <main className="page">
        <section className="centerCard">
          <div className="loader" />
          <p className="loadingText">Loading...</p>
        </section>

        <style jsx>{styles}</style>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="page">
        <section className="centerCard">
          <p className="emoji">⚠️</p>
          <h1 className="errorTitle">Could not load the course</h1>
          <p className="errorText">{loadError}</p>

          <Link
            className="loginLink"
            href={`/course-login/${encodeURIComponent(courseSlug)}`}
          >
            Login
          </Link>
        </section>

        <style jsx>{styles}</style>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="gameShell">
        <header className="topStatus">
          <div className="avatar">🌸</div>

          <div className="courseName">
            <span>JLPT N4</span>
            <strong>28日集中対策 + まちがえやすい漢字</strong>
          </div>

          <button className="logoutButton" type="button" onClick={handleLogout}>
            {loggingOut ? "Logging out..." : "Logout"}
          </button>
        </header>

        <section className="heroCard">
          <div className="heroText">
            <p className="courseLabel">JLPT N4</p>
            <h1>
              <span>N4</span> 28日集中対策
            </h1>
            <p>28日で基礎を固めて、最後にまちがえやすい漢字を確認！</p>
          </div>

          <div className="ninjaBox">
            <div className="sparkle">✦</div>
            <div className="ninja">🥷</div>
            <div className="speech">合格！</div>
          </div>

          <div className="summaryPanel">
            <div className="summaryItem wide">
              <p>全体の進み具合</p>
              <div className="progressLine" aria-label={`Progress ${progressPercent}%`}>
                <div
                  className="progressFill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <strong>{progressPercent}%</strong>
            </div>

            <div className="summaryItem">
              <p>完了した項目</p>
              <strong>
                {completedDays} / {totalDays}
              </strong>
              <span className="smallStat">28 days + 2 mix-up kanji reviews</span>
              {reviewNeededDays > 0 && (
                <span className="smallStat">復習あり {reviewNeededDays}日 / Review needed</span>
              )}
            </div>

            <div className="summaryItem">
              <p>全体の正解率</p>
              <strong>
                {answeredCount > 0 ? `${overallAccuracy}%` : "まだ記録なし"}
              </strong>
              {answeredCount > 0 && (
                <span className="smallStat">
                  {correctCount} / {answeredCount} correct
                </span>
              )}
            </div>
          </div>
        </section>

        <section className="extraPracticeCard" aria-label="Extra Practice">
          <div className="extraPracticeText">
            <span className="extraPracticeBadge">Special</span>
            <h2>ちょっと余裕がある日だけの特別練習</h2>
            <p className="extraPracticeSub">
              Special practice for days when you have a little extra time
            </p>
            <p className="extraPracticeLead">
              今までの問題を振り返って、苦手を少しだけ減らそう♪
              <br />
              Let’s look back at the questions you’ve tried and reduce your weak
              points little by little.
            </p>
          </div>

          <div className="extraPracticeAction">
            <div className="extraPracticeIcon">🌟</div>
            <Link
              className="extraPracticeButton"
              href={`/course/${encodeURIComponent(courseSlug)}/review`}
            >
              <span>特別練習</span>
              <small>Extra Practice</small>
            </Link>
          </div>
        </section>

        <section className="legendPanel" aria-label="Map color guide">
          <div className="legendItem">
            <span className="legendDot completedDot" />
            <span>完了 / Done</span>
          </div>

          <div className="legendItem">
            <span className="legendDot reviewDot" />
            <span>復習 / Review</span>
          </div>

          <div className="legendItem">
            <span className="legendDot progressDot" />
            <span>途中 / Progress</span>
          </div>

          <div className="legendItem">
            <span className="legendDot availableDot" />
            <span>未着手 / Not started</span>
          </div>

          <div className="legendItem">
            <span className="legendDot soonDot" />
            <span>準備中 / Soon</span>
          </div>
        </section>

        <section className="mapArea">
          <div className="startFlag">
            <span>スタート！</span>
            <div>🚩</div>
          </div>

          {rows.map((row, rowIndex) => (
            <div
              className={[
                "mapRow",
                rowIndex % 2 === 0 ? "evenRow" : "oddRow",
              ].join(" ")}
              key={`row-${rowIndex}`}
            >
              {row.map((day, index) => {
                const clickable = isClickable(day);
                const decoration = getDayDecoration(day.day_number);
                const motivationLabel = getMotivationLabel(day.day_number);

                const node = (
                  <div className="nodeWrap">
                    {day.state === "current" && (
                      <div className="currentMarker">
                        <span>今日ここ🔻</span>
                        <small>Today</small>
                      </div>
                    )}

                    {decoration && <span className="decoration">{decoration}</span>}

                    <div className={getDayClass(day)}>
                      <span>{getDayText(day.day_number)}</span>
                    </div>

                    {motivationLabel && (
                      <div className="eventLabel">{motivationLabel}</div>
                    )}
                  </div>
                );

                return (
                  <div className="mapCell" key={day.id}>
                    {index < row.length - 1 && <div className="road roadRight" />}

                    {clickable ? (
                      <Link
                        className="dayLink"
                        href={`/course/${encodeURIComponent(courseSlug)}/day/${
                          day.day_number
                        }`}
                      >
                        {node}
                      </Link>
                    ) : (
                      node
                    )}
                  </div>
                );
              })}

              {rowIndex < rows.length - 1 && (
                <div
                  className={[
                    "rowConnector",
                    rowIndex % 2 === 0 ? "rightConnector" : "leftConnector",
                  ].join(" ")}
                />
              )}
            </div>
          ))}
        </section>
      </section>

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .page {
    min-height: 100vh;
    padding: 18px;
    background:
      radial-gradient(circle at 15% 6%, rgba(75, 85, 255, 0.32), transparent 26%),
      radial-gradient(circle at 90% 22%, rgba(124, 58, 237, 0.22), transparent 28%),
      linear-gradient(180deg, #050b22 0%, #07122d 45%, #061025 100%);
    color: #f8fafc;
    font-family:
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
  }

  .gameShell {
    width: min(980px, 100%);
    margin: 0 auto;
    padding-bottom: 18px;
  }

  .topStatus {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 14px;
  }

  .avatar {
    width: 62px;
    height: 62px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(180deg, #f9a8d4, #7c3aed);
    border: 4px solid rgba(255, 255, 255, 0.18);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
    font-size: 34px;
  }

  .courseName {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .courseName span {
    color: #fda4af;
    font-size: 13px;
    font-weight: 950;
    letter-spacing: 0.08em;
  }

  .courseName strong {
    color: #ffffff;
    font-size: 21px;
    font-weight: 950;
    letter-spacing: 0.02em;
  }

  .logoutButton {
    margin-left: auto;
    padding: 11px 14px;
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(30, 41, 79, 0.92);
    color: #ffffff;
    font-size: 13px;
    font-weight: 900;
    cursor: pointer;
  }

  .heroCard {
    position: relative;
    overflow: hidden;
    padding: 34px 34px 22px;
    border-radius: 34px;
    background:
      radial-gradient(circle at 82% 28%, rgba(96, 165, 250, 0.32), transparent 22%),
      radial-gradient(circle at 14% 20%, rgba(244, 114, 182, 0.22), transparent 22%),
      linear-gradient(135deg, #2431a8 0%, #151f6d 42%, #0d174a 100%);
    border: 1px solid rgba(147, 197, 253, 0.28);
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.34);
  }

  .heroCard::before {
    content: "✦ ✧ ✦ ✧ ✦ ✧ ✦";
    position: absolute;
    top: 32px;
    left: 36px;
    right: 36px;
    color: rgba(255, 255, 255, 0.18);
    font-size: 30px;
    letter-spacing: 26px;
    pointer-events: none;
  }

  .heroText {
    position: relative;
    z-index: 2;
  }

  .courseLabel {
    margin: 0 0 8px;
    color: #fda4af;
    font-size: 20px;
    font-weight: 950;
  }

  .heroText h1 {
    margin: 0;
    color: #fff7ed;
    font-size: clamp(42px, 7vw, 70px);
    font-weight: 950;
    letter-spacing: 0.04em;
    line-height: 1.05;
  }

  .heroText h1 span {
    color: #fde047;
  }

  .heroText p:last-child {
    margin: 14px 0 0;
    color: #c7d2fe;
    font-size: 18px;
    font-weight: 850;
  }

  .ninjaBox {
    position: absolute;
    right: 42px;
    top: 34px;
    width: 178px;
    height: 168px;
  }

  .ninja {
    position: absolute;
    right: 16px;
    bottom: 0;
    font-size: 90px;
    filter: drop-shadow(0 12px 20px rgba(0, 0, 0, 0.35));
  }

  .sparkle {
    position: absolute;
    left: 0;
    top: 26px;
    color: #fde68a;
    font-size: 36px;
  }

  .speech {
    position: absolute;
    right: 0;
    top: 0;
    padding: 8px 13px;
    border-radius: 16px;
    background: rgba(255, 247, 237, 0.9);
    color: #1f2937;
    font-size: 18px;
    font-weight: 950;
    transform: rotate(-4deg);
  }

  .summaryPanel {
    position: relative;
    z-index: 2;
    margin-top: 28px;
    padding: 18px 20px;
    display: grid;
    grid-template-columns: 1.4fr 1fr 1fr;
    gap: 18px;
    border-radius: 24px;
    background: rgba(4, 12, 34, 0.78);
    border: 1px solid rgba(147, 197, 253, 0.2);
  }

  .summaryItem {
    padding-right: 16px;
    border-right: 1px solid rgba(148, 163, 184, 0.22);
  }

  .summaryItem:last-child {
    border-right: none;
  }

  .summaryItem p {
    margin: 0 0 9px;
    color: #cbd5e1;
    font-size: 15px;
    font-weight: 850;
  }

  .summaryItem strong {
    display: block;
    color: #f9a8d4;
    font-size: 26px;
    font-weight: 950;
    line-height: 1.2;
  }

  .smallStat {
    display: block;
    margin-top: 6px;
    color: #cbd5e1;
    font-size: 12px;
    font-weight: 800;
    line-height: 1.4;
  }

  .progressLine {
    width: 100%;
    height: 16px;
    margin: 0 0 8px;
    border-radius: 999px;
    overflow: hidden;
    background: #18223e;
  }

  .progressFill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, #a3e635, #84cc16);
  }

  .extraPracticeCard {
    margin: 14px 0 0;
    padding: 18px 20px;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 18px;
    align-items: center;
    border-radius: 28px;
    background:
      radial-gradient(circle at 12% 20%, rgba(253, 224, 71, 0.28), transparent 26%),
      radial-gradient(circle at 88% 18%, rgba(216, 180, 254, 0.28), transparent 24%),
      linear-gradient(135deg, rgba(76, 29, 149, 0.96), rgba(91, 33, 182, 0.9) 46%, rgba(30, 41, 59, 0.92));
    border: 1px solid rgba(221, 214, 254, 0.35);
    box-shadow: 0 18px 46px rgba(0, 0, 0, 0.28);
  }

  .extraPracticeText {
    min-width: 0;
  }

  .extraPracticeBadge {
    display: inline-flex;
    margin-bottom: 8px;
    padding: 5px 10px;
    border-radius: 999px;
    background: rgba(255, 251, 235, 0.94);
    color: #581c87;
    font-size: 11px;
    font-weight: 950;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .extraPracticeText h2 {
    margin: 0;
    color: #fff7ed;
    font-size: clamp(22px, 4vw, 34px);
    font-weight: 950;
    line-height: 1.25;
    letter-spacing: 0.01em;
  }

  .extraPracticeSub {
    margin: 6px 0 0;
    color: #fde68a;
    font-size: 14px;
    font-weight: 900;
    line-height: 1.45;
  }

  .extraPracticeLead {
    margin: 10px 0 0;
    color: #e9d5ff;
    font-size: 14px;
    font-weight: 800;
    line-height: 1.65;
  }

  .extraPracticeAction {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .extraPracticeIcon {
    width: 72px;
    height: 72px;
    flex: 0 0 auto;
    border-radius: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 251, 235, 0.94);
    box-shadow:
      0 8px 0 rgba(146, 64, 14, 0.7),
      0 14px 24px rgba(0, 0, 0, 0.24);
    font-size: 38px;
  }

  .extraPracticeButton {
    min-width: 178px;
    min-height: 58px;
    padding: 13px 18px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 2px;
    background: linear-gradient(180deg, #fef08a, #facc15 54%, #f59e0b);
    color: #451a03;
    text-decoration: none;
    box-shadow:
      0 8px 0 #92400e,
      0 14px 28px rgba(0, 0, 0, 0.24);
    transition:
      transform 140ms ease,
      filter 140ms ease;
  }

  .extraPracticeButton:hover {
    transform: translateY(-2px);
    filter: brightness(1.04);
  }

  .extraPracticeButton span {
    font-size: 17px;
    font-weight: 950;
    line-height: 1.1;
  }

  .extraPracticeButton small {
    font-size: 12px;
    font-weight: 900;
    line-height: 1.1;
  }

  .legendPanel {
    margin: 12px 0 0;
    padding: 9px 10px;
    display: flex;
    flex-wrap: wrap;
    gap: 7px 8px;
    border-radius: 18px;
    background: rgba(4, 12, 34, 0.58);
    border: 1px solid rgba(147, 197, 253, 0.16);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
  }

  .legendItem {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.42);
    color: #f8fafc;
    white-space: nowrap;
  }

  .legendDot {
    width: 12px;
    height: 12px;
    flex: 0 0 auto;
    border-radius: 999px;
    border: 2px solid rgba(255, 255, 255, 0.72);
    box-shadow: 0 0 10px rgba(255, 255, 255, 0.12);
  }

  .legendItem span:not(.legendDot) {
    font-size: 11px;
    font-weight: 950;
    line-height: 1;
  }

  .completedDot {
    background: #22c55e;
  }

  .reviewDot {
    background: #8b5cf6;
  }

  .progressDot {
    background: #facc15;
  }

  .availableDot {
    background: #3b82f6;
  }

  .soonDot {
    background: #94a3b8;
  }

  .mapArea {
    position: relative;
    margin-top: 28px;
    padding: 42px 20px 16px;
  }

  .mapArea::before {
    content: "";
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 8% 14%, rgba(255, 255, 255, 0.12) 0 3px, transparent 4px),
      radial-gradient(circle at 80% 26%, rgba(255, 255, 255, 0.12) 0 4px, transparent 5px),
      radial-gradient(circle at 42% 72%, rgba(255, 255, 255, 0.1) 0 3px, transparent 4px);
    pointer-events: none;
  }

  .startFlag {
    position: absolute;
    left: 4px;
    top: 12px;
    z-index: 5;
    color: #78350f;
    text-align: center;
    font-weight: 950;
  }

  .startFlag span {
    display: inline-block;
    padding: 8px 12px;
    border-radius: 12px;
    background: #ffedd5;
    color: #7c2d12;
    box-shadow: 0 6px 0 #fdba74;
  }

  .startFlag div {
    margin-top: 4px;
    font-size: 46px;
  }

  .mapRow {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 22px;
    margin-bottom: 42px;
  }

  .mapRow:last-child {
    margin-bottom: 0;
  }

  .mapCell {
    position: relative;
    display: flex;
    justify-content: center;
    min-height: 140px;
  }

  .road {
    position: absolute;
    top: 64px;
    left: 58%;
    width: 82%;
    height: 10px;
    border-radius: 999px;
    background: repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.72) 0 18px,
      rgba(255, 255, 255, 0.28) 18px 28px
    );
    box-shadow: 0 0 12px rgba(255, 255, 255, 0.12);
  }

  .rowConnector {
    position: absolute;
    bottom: -24px;
    width: 10px;
    height: 52px;
    border-radius: 999px;
    background: repeating-linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.72) 0 16px,
      rgba(255, 255, 255, 0.28) 16px 26px
    );
    box-shadow: 0 0 12px rgba(255, 255, 255, 0.12);
  }

  .rightConnector {
    right: 10%;
  }

  .leftConnector {
    left: 10%;
  }

  .nodeWrap {
    position: relative;
    z-index: 3;
    display: flex;
    align-items: center;
    flex-direction: column;
    padding-top: 18px;
  }

  .dayLink {
    color: inherit;
    text-decoration: none;
  }

  .currentMarker {
    position: absolute;
    top: -22px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 6;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 6px 10px;
    border-radius: 14px;
    background: rgba(255, 247, 237, 0.96);
    color: #7c2d12;
    box-shadow:
      0 5px 0 rgba(180, 83, 9, 0.7),
      0 10px 18px rgba(0, 0, 0, 0.25);
    white-space: nowrap;
    pointer-events: none;
  }

  .currentMarker span {
    font-size: 13px;
    font-weight: 950;
    line-height: 1.1;
  }

  .currentMarker small {
    font-size: 10px;
    font-weight: 900;
    color: #92400e;
    line-height: 1.1;
  }

  .dayNode {
    width: 104px;
    height: 104px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    background:
      radial-gradient(circle at 34% 22%, rgba(255, 255, 255, 0.45), transparent 30%),
      linear-gradient(180deg, #60a5fa 0%, #2563eb 100%);
    border: 5px solid rgba(147, 197, 253, 0.65);
    box-shadow:
      0 8px 0 #1e40af,
      0 0 20px rgba(96, 165, 250, 0.42);
    color: #ffffff;
    text-align: center;
    transition:
      transform 140ms ease,
      filter 140ms ease;
  }

  .dayLink:hover .dayNode {
    transform: translateY(-4px) scale(1.04);
    filter: brightness(1.12);
  }

  .dayNode span {
    white-space: pre-line;
    font-size: 28px;
    font-weight: 950;
    line-height: 1.05;
    text-shadow: 0 3px 0 rgba(15, 23, 42, 0.34);
  }

  .dayNode.available {
    background:
      radial-gradient(circle at 34% 22%, rgba(255, 255, 255, 0.45), transparent 30%),
      linear-gradient(180deg, #60a5fa 0%, #2563eb 100%);
    border-color: #bfdbfe;
    box-shadow:
      0 8px 0 #1d4ed8,
      0 0 20px rgba(96, 165, 250, 0.44);
  }

  .dayNode.current {
    background:
      radial-gradient(circle at 34% 22%, rgba(255, 255, 255, 0.54), transparent 30%),
      linear-gradient(180deg, #fef08a 0%, #f59e0b 52%, #dc2626 100%);
    border-color: #fff7ed;
    box-shadow:
      0 8px 0 #991b1b,
      0 0 0 8px rgba(254, 240, 138, 0.2),
      0 0 30px rgba(250, 204, 21, 0.7);
  }

  .dayNode.completed {
    background:
      radial-gradient(circle at 34% 22%, rgba(255, 255, 255, 0.5), transparent 30%),
      linear-gradient(180deg, #86efac 0%, #16a34a 100%);
    border-color: #bbf7d0;
    box-shadow:
      0 8px 0 #15803d,
      0 0 20px rgba(34, 197, 94, 0.44);
  }

  .dayNode.reviewNeeded {
    background:
      radial-gradient(circle at 34% 22%, rgba(255, 255, 255, 0.5), transparent 30%),
      linear-gradient(180deg, #c084fc 0%, #7e22ce 100%);
    border-color: #ddd6fe;
    box-shadow:
      0 8px 0 #581c87,
      0 0 20px rgba(168, 85, 247, 0.42);
  }

  .dayNode.inProgress {
    background:
      radial-gradient(circle at 34% 22%, rgba(255, 255, 255, 0.5), transparent 30%),
      linear-gradient(180deg, #fde68a 0%, #facc15 48%, #d97706 100%);
    border-color: #fef3c7;
    box-shadow:
      0 8px 0 #92400e,
      0 0 22px rgba(250, 204, 21, 0.46);
    color: #ffffff;
  }

  .dayNode.comingSoon {
    background:
      radial-gradient(circle at 34% 22%, rgba(255, 255, 255, 0.28), transparent 30%),
      linear-gradient(180deg, #94a3b8 0%, #475569 100%);
    border-color: rgba(203, 213, 225, 0.42);
    box-shadow:
      0 8px 0 #1e293b,
      0 0 14px rgba(148, 163, 184, 0.18);
    opacity: 0.82;
  }

  .dayNode.finalDay {
    width: 124px;
    height: 124px;
  }

  .dayNode.challengeDay span,
  .dayNode.finalCheckDay span {
    font-size: 18px;
    line-height: 1.05;
    letter-spacing: -0.02em;
  }

  .dayNode.reviewDay {
    outline: 3px solid rgba(221, 214, 254, 0.34);
    outline-offset: 5px;
  }

  .decoration {
    position: absolute;
    top: 2px;
    right: -4px;
    z-index: 4;
    font-size: 34px;
    filter: drop-shadow(0 5px 6px rgba(0, 0, 0, 0.38));
  }

  .eventLabel {
    margin-top: -2px;
    padding: 7px 12px;
    border-radius: 12px;
    background: rgba(255, 247, 237, 0.92);
    color: #312e81;
    font-size: 14px;
    font-weight: 950;
    box-shadow: 0 5px 0 rgba(0, 0, 0, 0.22);
    white-space: nowrap;
  }

  .centerCard {
    width: min(430px, 100%);
    min-height: 360px;
    margin: 0 auto;
    padding: 28px;
    border-radius: 30px;
    background: rgba(255, 255, 255, 0.94);
    color: #111827;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .emoji {
    margin: 0 0 8px;
    font-size: 44px;
  }

  .errorTitle {
    margin: 0 0 8px;
    font-size: 24px;
    font-weight: 950;
  }

  .errorText,
  .loadingText {
    margin: 8px 0 0;
    color: #64748b;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.6;
  }

  .errorText {
    color: #dc2626;
  }

  .loginLink {
    display: inline-flex;
    margin-top: 18px;
    padding: 13px 18px;
    border-radius: 999px;
    background: linear-gradient(90deg, #facc15, #fb923c);
    color: #111827;
    font-size: 14px;
    font-weight: 950;
    text-decoration: none;
  }

  .loader {
    width: 44px;
    height: 44px;
    border-radius: 999px;
    border: 5px solid #e5e7eb;
    border-top-color: #f59e0b;
    animation: spin 800ms linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 820px) {
    .page {
      padding: 12px;
    }

    .topStatus {
      gap: 10px;
    }

    .avatar {
      width: 52px;
      height: 52px;
      font-size: 28px;
    }

    .courseName strong {
      font-size: 17px;
    }

    .courseName span {
      font-size: 11px;
    }

    .logoutButton {
      padding: 9px 11px;
      font-size: 12px;
    }

    .heroCard {
      padding: 26px 18px 18px;
      border-radius: 28px;
    }

    .ninjaBox {
      right: 16px;
      top: 22px;
      width: 108px;
      height: 108px;
      opacity: 0.9;
    }

    .ninja {
      font-size: 58px;
    }

    .speech {
      font-size: 13px;
      padding: 6px 9px;
    }

    .sparkle {
      font-size: 24px;
    }

    .summaryPanel {
      grid-template-columns: 1fr;
      gap: 10px;
      padding: 14px;
    }

    .summaryItem {
      border-right: none;
      border-bottom: 1px solid rgba(148, 163, 184, 0.18);
      padding: 0 0 10px;
    }

    .summaryItem:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .summaryItem strong {
      font-size: 21px;
    }

    .extraPracticeCard {
      grid-template-columns: 1fr;
      gap: 14px;
      padding: 18px;
      border-radius: 26px;
    }

    .extraPracticeText h2 {
      font-size: 24px;
    }

    .extraPracticeSub,
    .extraPracticeLead {
      font-size: 13px;
    }

    .extraPracticeAction {
      width: 100%;
      align-items: stretch;
    }

    .extraPracticeIcon {
      width: 58px;
      height: 58px;
      border-radius: 20px;
      font-size: 31px;
    }

    .extraPracticeButton {
      flex: 1;
      min-width: 0;
    }

    .legendPanel {
      margin-top: 10px;
      padding: 8px 9px;
      gap: 6px;
    }

    .legendItem {
      padding: 5px 7px;
      gap: 5px;
    }

    .legendDot {
      width: 11px;
      height: 11px;
      border-width: 2px;
    }

    .legendItem span:not(.legendDot) {
      font-size: 10px;
    }

    .mapArea {
      padding: 34px 0 8px;
    }

    .startFlag {
      display: none;
    }

    .mapRow {
      gap: 9px;
      margin-bottom: 36px;
    }

    .mapCell {
      min-height: 106px;
    }

    .road {
      top: 52px;
      height: 7px;
    }

    .rowConnector {
      bottom: -22px;
      height: 42px;
      width: 7px;
    }

    .nodeWrap {
      padding-top: 18px;
    }

    .currentMarker {
      top: -20px;
      padding: 5px 8px;
      border-radius: 12px;
    }

    .currentMarker span {
      font-size: 10px;
    }

    .currentMarker small {
      font-size: 8px;
    }

    .dayNode {
      width: 72px;
      height: 72px;
      border-width: 3px;
      box-shadow: 0 6px 0 #1e40af;
    }

    .dayNode.finalDay {
      width: 78px;
      height: 78px;
    }

    .dayNode.challengeDay span,
    .dayNode.finalCheckDay span {
      font-size: 12px;
      line-height: 1.05;
    }

    .dayNode span {
      font-size: 20px;
    }

    .decoration {
      top: 4px;
      right: -8px;
      font-size: 24px;
    }

    .eventLabel {
      font-size: 10px;
      padding: 5px 7px;
    }
  }

  @media (max-width: 430px) {
    .legendPanel {
      display: flex;
      flex-wrap: wrap;
      max-height: none;
    }

    .legendItem {
      flex: 0 1 auto;
    }

    .extraPracticeAction {
      flex-direction: column;
    }

    .extraPracticeIcon {
      display: none;
    }

    .extraPracticeButton {
      width: 100%;
    }

    .mapRow {
      gap: 5px;
    }

    .dayNode {
      width: 62px;
      height: 62px;
    }

    .dayNode.finalDay {
      width: 68px;
      height: 68px;
    }

    .dayNode.challengeDay span,
    .dayNode.finalCheckDay span {
      font-size: 11px;
      line-height: 1.1;
    }

    .dayNode span {
      font-size: 17px;
    }

    .road {
      top: 47px;
      height: 6px;
    }

    .rowConnector {
      height: 38px;
    }

    .heroText h1 {
      font-size: 38px;
    }
  }
`;