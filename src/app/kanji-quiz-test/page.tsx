"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type QuizOption = {
  label: string;
  isCorrect: boolean;
};

type QuizQuestion = {
  kanji: string;
  unit: string | null;
  order_in_unit: number;
  questionText: string;
  correctAnswer: string;
  options: QuizOption[];
};

type BatchResponse = {
  account: {
    display_name: string | null;
    student_login_id: string;
  };
  unit: string;
  lastOrderCompleted: number;
  mode?: string;
  lockedToUnit?: boolean;
  finished?: boolean;
  questions: QuizQuestion[];
};

type AttemptRow = {
  kanji: string;
  unit: string | null;
  order_in_unit: number;
  quiz_type: string;
  user_answer: string;
  correct_answer: string;
  is_correct: boolean;
};

type QuizMode =
  | "normal"
  | "review-wrong"
  | "review-studied"
  | "practice-set"
  | "practice-unit";

type PracticeTarget = {
  unit: string;
  startOrder: number;
  endOrder?: number;
};

export default function KanjiQuizTestPage() {
  const searchParams = useSearchParams();
  const requestedUnit = (searchParams.get("unit") ?? "").trim();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [batch, setBatch] = useState<BatchResponse | null>(null);

  const [mainIndex, setMainIndex] = useState(0);
  const [reviewQueue, setReviewQueue] = useState<QuizQuestion[]>([]);
  const [phase, setPhase] = useState<"main" | "review">("main");

  const [selected, setSelected] = useState<string>("");
  const [checked, setChecked] = useState(false);
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quizMode, setQuizMode] = useState<QuizMode>("normal");
  const [showSetComplete, setShowSetComplete] = useState(false);
  const [showFinishMessage, setShowFinishMessage] = useState(false);
  const [lastSetCorrectCount, setLastSetCorrectCount] = useState(0);
  const [lastSetWrongCount, setLastSetWrongCount] = useState(0);
  const [lastCompletedSet, setLastCompletedSet] = useState<PracticeTarget | null>(
    null
  );
  const [showUnitStartScreen, setShowUnitStartScreen] = useState(false);

  const [windowWidth, setWindowWidth] = useState(1200);

  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleResize() {
      setWindowWidth(window.innerWidth);
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isMobile = windowWidth <= 768;
  const isSmallMobile = windowWidth <= 430;

  function getPracticeTargetFromBatch(currentBatch: BatchResponse | null) {
    if (!currentBatch || currentBatch.questions.length === 0) return null;

    const orders = currentBatch.questions
      .map((q) => q.order_in_unit)
      .filter((n) => typeof n === "number");

    if (orders.length === 0) return null;

    return {
      unit: currentBatch.questions[0]?.unit ?? currentBatch.unit,
      startOrder: Math.min(...orders),
      endOrder: Math.max(...orders),
    };
  }

  async function loadBatch(
    mode: QuizMode = "normal",
    practiceTarget?: PracticeTarget | null
  ) {
    setLoading(true);
    setError("");
    setSelected("");
    setChecked(false);
    setWasCorrect(null);
    setMainIndex(0);
    setReviewQueue([]);
    setPhase("main");
    setAttempts([]);
    setQuizMode(mode);
    setShowSetComplete(false);
    setShowFinishMessage(false);

    const params = new URLSearchParams();
    params.set("mode", mode);

    if (mode === "normal" && requestedUnit) {
      params.set("unit", requestedUnit);
    }

    if (mode === "practice-set" && practiceTarget) {
      params.set("unit", practiceTarget.unit);
      params.set("startOrder", String(practiceTarget.startOrder));
      params.set("endOrder", String(practiceTarget.endOrder ?? 0));
    }

    if (mode === "practice-unit" && practiceTarget) {
      params.set("unit", practiceTarget.unit);
      params.set("startOrder", String(practiceTarget.startOrder));
    }

    const res = await fetch(`/api/kanji-quiz-test?${params.toString()}`, {
      method: "GET",
      credentials: "include",
    });

    if (res.status === 401) {
      window.location.href = "/student-login";
      return;
    }

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Failed to load quiz.");
      setBatch(null);
      setLoading(false);
      return;
    }

    setBatch(data);
    setLoading(false);
  }

  useEffect(() => {
    if (requestedUnit) {
      setShowUnitStartScreen(true);
      setLoading(false);
      return;
    }

    loadBatch("normal");
  }, [requestedUnit]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentQuestion = useMemo(() => {
    if (!batch || batch.questions.length === 0) return null;
    if (phase === "main") return batch.questions[mainIndex] ?? null;
    return reviewQueue[0] ?? null;
  }, [batch, mainIndex, phase, reviewQueue]);

  const progressLabel = useMemo(() => {
    if (!batch) return "";
    if (phase === "main") return `${mainIndex + 1} / ${batch.questions.length}`;
    return `Review: ${reviewQueue.length} left`;
  }, [batch, mainIndex, phase, reviewQueue.length]);

  async function saveSetOnly() {
    if (!batch) return false;

    setSaving(true);
    setError("");

    const res = await fetch("/api/kanji-quiz-test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        unit: batch.unit,
        advanceCount: batch.questions.length,
        attempts,
        mode: quizMode,
        lockToUnit: batch.lockedToUnit === true,
      }),
    });

    if (res.status === 401) {
      setSaving(false);
      window.location.href = "/student-login";
      return false;
    }

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Failed to save progress.");
      setSaving(false);
      return false;
    }

    setSaving(false);
    return true;
  }

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);
    setMenuOpen(false);

    try {
      await fetch("/api/student-logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      window.location.href = "/student-login";
    }
  }

  function resetQuestionState() {
    setSelected("");
    setChecked(false);
    setWasCorrect(null);
  }

  function openSetCompleteScreen() {
    const correctCount = attempts.filter((item) => item.is_correct).length;
    const wrongCount = attempts.filter((item) => !item.is_correct).length;

    setLastSetCorrectCount(correctCount);
    setLastSetWrongCount(wrongCount);

    const target = getPracticeTargetFromBatch(batch);
    if (target) {
      setLastCompletedSet(target);
    }

    setShowSetComplete(true);
  }

  async function handleNext() {
    if (!currentQuestion) return;

    if (!checked) {
      if (!selected) return;

      const correct = selected === currentQuestion.correctAnswer;
      setChecked(true);
      setWasCorrect(correct);

      setAttempts((prev) => [
        ...prev,
        {
          kanji: currentQuestion.kanji,
          unit: currentQuestion.unit,
          order_in_unit: currentQuestion.order_in_unit,
          quiz_type: "meaning_choice",
          user_answer: selected,
          correct_answer: currentQuestion.correctAnswer,
          is_correct: correct,
        },
      ]);

      if (!correct) {
        if (phase === "main") {
          setReviewQueue((prev) => {
            const exists = prev.some(
              (item) =>
                item.kanji === currentQuestion.kanji &&
                item.order_in_unit === currentQuestion.order_in_unit
            );
            return exists ? prev : [...prev, currentQuestion];
          });
        } else {
          setReviewQueue((prev) => {
            const rest = prev.slice(1);
            return [...rest, currentQuestion];
          });
        }
      }
      return;
    }

    if (phase === "main") {
      if (!batch) return;

      if (mainIndex < batch.questions.length - 1) {
        setMainIndex((prev) => prev + 1);
        resetQuestionState();
        return;
      }

      if (reviewQueue.length > 0) {
        setPhase("review");
        resetQuestionState();
        return;
      }

      const ok = await saveSetOnly();
      if (!ok) return;

      openSetCompleteScreen();
      return;
    }

    if (phase === "review") {
      const nextQueue = wasCorrect ? reviewQueue.slice(1) : reviewQueue;

      if (wasCorrect) {
        setReviewQueue(nextQueue);
      }

      resetQuestionState();

      if (nextQueue.length === 0 && wasCorrect) {
        const ok = await saveSetOnly();
        if (!ok) return;

        openSetCompleteScreen();
      }
    }
  }

  async function handleMenuAction(mode: QuizMode) {
    setMenuOpen(false);

    if (mode === "practice-unit") {
      const targetUnit = batch?.unit || requestedUnit;
      if (!targetUnit) return;
      await loadBatch("practice-unit", {
        unit: targetUnit,
        startOrder: 1,
      });
      return;
    }

    await loadBatch(mode);
  }

  async function handleDoFiveMore() {
    if (quizMode === "practice-unit" && lastCompletedSet?.endOrder) {
      await loadBatch("practice-unit", {
        unit: lastCompletedSet.unit,
        startOrder: lastCompletedSet.endOrder + 1,
      });
      return;
    }

    await loadBatch("normal");
  }

  async function handlePracticeSetAgain() {
    if (!lastCompletedSet) return;
    setMenuOpen(false);
    await loadBatch("practice-set", lastCompletedSet);
  }

  async function handleContinueRequestedUnit() {
    setShowUnitStartScreen(false);
    await loadBatch("normal");
  }

  async function handlePracticeRequestedUnit() {
    if (!requestedUnit) return;
    setShowUnitStartScreen(false);
    await loadBatch("practice-unit", {
      unit: requestedUnit,
      startOrder: 1,
    });
  }

  function handleFinishForToday() {
    setShowSetComplete(false);
    setShowFinishMessage(true);
  }

  function getOptionStyle(option: QuizOption): React.CSSProperties {
    const selectedThis = selected === option.label;
    const showCorrect = checked && option.isCorrect;
    const showWrong = checked && selectedThis && !option.isCorrect;

    let optionStyle: React.CSSProperties = {
      ...styles.optionButton,
      fontSize: isMobile ? (isSmallMobile ? 13 : 15) : 24,
      padding: isMobile ? (isSmallMobile ? "12px 12px" : "14px 14px") : "18px 22px",
      minHeight: isMobile ? (isSmallMobile ? 72 : 78) : 82,
      borderRadius: isMobile ? 20 : 26,
      gap: isMobile ? 6 : 8,
    };

    if (!checked && selectedThis) {
      optionStyle = {
        ...optionStyle,
        ...styles.optionSelected,
      };
    }

    if (showCorrect) {
      optionStyle = {
        ...optionStyle,
        ...styles.optionCorrect,
      };
    }

    if (showWrong) {
      optionStyle = {
        ...optionStyle,
        ...styles.optionWrong,
      };
    }

    return optionStyle;
  }

  function renderActionButtons() {
    return (
      <div
        style={{
          ...styles.emptyButtons,
          flexDirection: isMobile ? "column" : "row",
        }}
      >
        {requestedUnit ? (
          <>
            <button
              type="button"
              onClick={handleContinueRequestedUnit}
              style={styles.emptyPrimaryButton}
            >
              Continue this unit
            </button>

            <button
              type="button"
              onClick={handlePracticeRequestedUnit}
              style={styles.emptySecondaryButton}
            >
              Practice from the beginning
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => loadBatch("normal")}
            style={styles.emptyPrimaryButton}
          >
            Back to quiz
          </button>
        )}

        <button
          type="button"
          onClick={() => loadBatch("review-wrong")}
          style={styles.emptySecondaryButton}
        >
          Review wrong answers
        </button>

        <button
          type="button"
          onClick={() => loadBatch("review-studied")}
          style={styles.emptySecondaryButton}
        >
          Shuffle 10 studied kanji
        </button>

        {lastCompletedSet ? (
          <button
            type="button"
            onClick={handlePracticeSetAgain}
            style={styles.emptySecondaryButton}
          >
            Practice this set again
          </button>
        ) : null}
      </div>
    );
  }

  function getEmptyStateText() {
    if (quizMode === "review-wrong") {
      return {
        title: "No wrong answers to review",
        message: "You do not have any review questions right now.",
      };
    }

    if (quizMode === "review-studied") {
      return {
        title: "No studied kanji found",
        message: "Please answer a few quiz questions first, then try again.",
      };
    }

    if (quizMode === "practice-set") {
      return {
        title: "This set is not available",
        message: "Please go back to the quiz and finish a set first.",
      };
    }

    if (quizMode === "practice-unit") {
      return {
        title: "You reached the end of this unit",
        message: "You can go back, review, or start this unit again anytime.",
      };
    }

    return {
      title: "No questions available",
      message: "Please wait a moment, or go back to the quiz.",
    };
  }

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.centerWrap}>
          <div style={styles.loadingCard}>Please wait a moment...</div>
        </div>
      </main>
    );
  }

  if (showUnitStartScreen && requestedUnit) {
    return (
      <main style={styles.page}>
        <div style={styles.centerWrap}>
          <div
            style={{
              ...styles.emptyCard,
              width: isMobile ? "92%" : 760,
            }}
          >
            <h2 style={styles.emptyTitle}>Ready to study?</h2>
            <p style={styles.emptyText}>
              Unit: <strong>{requestedUnit}</strong>
            </p>
            <div
              style={{
                ...styles.emptyButtons,
                flexDirection: isMobile ? "column" : "row",
              }}
            >
              <button
                type="button"
                onClick={handleContinueRequestedUnit}
                style={styles.emptyPrimaryButton}
              >
                Continue
              </button>

              <button
                type="button"
                onClick={handlePracticeRequestedUnit}
                style={styles.emptySecondaryButton}
              >
                Practice from the beginning
              </button>

              <button
                type="button"
                onClick={() => loadBatch("review-wrong")}
                style={styles.emptySecondaryButton}
              >
                Review wrong answers
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main style={styles.page}>
        <div style={styles.centerWrap}>
          <div
            style={{
              ...styles.emptyCard,
              width: isMobile ? "92%" : 720,
            }}
          >
            <h2 style={styles.emptyTitle}>Something went wrong</h2>
            <p style={styles.emptyText}>{error}</p>
            {renderActionButtons()}
          </div>
        </div>
      </main>
    );
  }

  if (showFinishMessage) {
    return (
      <main style={styles.page}>
        <div style={styles.centerWrap}>
          <div
            style={{
              ...styles.finishCard,
              width: isMobile ? "92%" : undefined,
              padding: isMobile ? "26px 20px" : "34px 30px",
            }}
          >
            <h2
              style={{
                ...styles.finishTitle,
                fontSize: isMobile ? 28 : 34,
              }}
            >
              Great work today!
            </h2>
            <p
              style={{
                ...styles.finishText,
                fontSize: isMobile ? 16 : 20,
              }}
            >
              You can stop here and come back anytime.
            </p>
            <button
              type="button"
              onClick={() => {
                if (requestedUnit) {
                  setShowFinishMessage(false);
                  setShowUnitStartScreen(true);
                  return;
                }
                loadBatch("normal");
              }}
              style={{
                ...styles.finishButton,
                fontSize: isMobile ? 16 : 18,
                padding: isMobile ? "12px 20px" : "14px 26px",
              }}
            >
              {requestedUnit ? "Back to unit menu" : "Start again"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (showSetComplete) {
    return (
      <main style={styles.page}>
        <div style={styles.centerWrap}>
          <div
            style={{
              ...styles.setCompleteCard,
              width: isMobile ? "92%" : "100%",
              padding: isMobile ? "26px 20px" : "34px 30px",
            }}
          >
            <h2
              style={{
                ...styles.setCompleteTitle,
                fontSize: isMobile ? 28 : 34,
              }}
            >
              Set complete!
            </h2>
            <p
              style={{
                ...styles.setCompleteText,
                fontSize: isMobile ? 16 : 20,
              }}
            >
              You finished {batch?.questions.length ?? 0} questions.
            </p>
            <p
              style={{
                ...styles.setCompleteScore,
                fontSize: isMobile ? 15 : 18,
              }}
            >
              Correct: {lastSetCorrectCount} / {batch?.questions.length ?? 0}
            </p>
            <p
              style={{
                ...styles.setCompleteScore,
                fontSize: isMobile ? 15 : 18,
              }}
            >
              Wrong answers: {lastSetWrongCount}
            </p>

            <div
              style={{
                ...styles.setCompleteButtons,
                flexDirection: isMobile ? "column" : "row",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                onClick={handleDoFiveMore}
                style={{
                  ...styles.setCompletePrimaryButton,
                  width: isMobile ? "100%" : undefined,
                  fontSize: isMobile ? 16 : 18,
                }}
              >
                Do 5 more
              </button>

              <button
                type="button"
                onClick={handleFinishForToday}
                style={{
                  ...styles.setCompleteSecondaryButton,
                  width: isMobile ? "100%" : undefined,
                  fontSize: isMobile ? 16 : 18,
                }}
              >
                Finish for today
              </button>
            </div>

            {lastCompletedSet ? (
              <button
                type="button"
                onClick={handlePracticeSetAgain}
                style={{
                  ...styles.practiceSetButton,
                  width: isMobile ? "100%" : undefined,
                }}
              >
                Practice this set again
              </button>
            ) : null}

            {(requestedUnit || batch?.unit) && (
              <button
                type="button"
                onClick={() =>
                  loadBatch("practice-unit", {
                    unit: batch?.unit || requestedUnit,
                    startOrder: 1,
                  })
                }
                style={{
                  ...styles.reviewWrongButton,
                  width: isMobile ? "100%" : undefined,
                }}
              >
                Practice from the beginning
              </button>
            )}

            {lastSetWrongCount > 0 ? (
              <button
                type="button"
                onClick={() => loadBatch("review-wrong")}
                style={{
                  ...styles.reviewWrongButton,
                  width: isMobile ? "100%" : undefined,
                }}
              >
                Review wrong answers
              </button>
            ) : null}
          </div>
        </div>
      </main>
    );
  }

  if (!batch || batch.questions.length === 0 || !currentQuestion) {
    const emptyState = getEmptyStateText();

    return (
      <main style={styles.page}>
        <div style={styles.centerWrap}>
          <div
            style={{
              ...styles.emptyCard,
              width: isMobile ? "92%" : 760,
            }}
          >
            <h2 style={styles.emptyTitle}>{emptyState.title}</h2>
            <p style={styles.emptyText}>{emptyState.message}</p>
            {renderActionButtons()}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div
        style={{
          ...styles.appFrame,
          gridTemplateRows: isMobile ? "150px minmax(0, 1fr)" : "170px minmax(0, 1fr)",
        }}
      >
        <div
          style={{
            ...styles.topArea,
            padding: isMobile ? "12px 12px 34px" : "14px 18px 52px",
          }}
        >
          <div style={styles.topInner}>
            <div
              style={{
                ...styles.metaRow,
                gap: isMobile ? 8 : 16,
                marginBottom: isMobile ? 6 : 8,
                alignItems: "center",
              }}
            >
              <div style={styles.metaBox}>
                <div
                  style={{
                    ...styles.metaLabel,
                    fontSize: isMobile ? 12 : 16,
                  }}
                >
                  Unit
                </div>
                <div
                  style={{
                    ...styles.metaValue,
                    fontSize: isMobile ? 14 : 18,
                    maxWidth: isMobile ? 110 : undefined,
                    wordBreak: "break-word",
                  }}
                >
                  {batch.unit}
                </div>
              </div>

              <div style={styles.menuWrap} ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  style={{
                    ...styles.menuButton,
                    padding: isMobile ? "8px 14px" : "10px 16px",
                    fontSize: isMobile ? 14 : 16,
                  }}
                >
                  ☰ Menu
                </button>

                {menuOpen ? (
                  <div
                    style={{
                      ...styles.menuDropdown,
                      minWidth: isMobile ? 220 : 260,
                      right: 0,
                    }}
                  >
                    {requestedUnit ? (
                      <button
                        type="button"
                        style={{
                          ...styles.menuItem,
                          fontSize: isMobile ? 14 : 16,
                          padding: isMobile ? "12px 14px" : "14px 16px",
                        }}
                        onClick={handleContinueRequestedUnit}
                      >
                        Continue this unit
                      </button>
                    ) : null}

                    {(requestedUnit || batch.unit) ? (
                      <button
                        type="button"
                        style={{
                          ...styles.menuItem,
                          fontSize: isMobile ? 14 : 16,
                          padding: isMobile ? "12px 14px" : "14px 16px",
                        }}
                        onClick={() => handleMenuAction("practice-unit")}
                      >
                        Practice from the beginning
                      </button>
                    ) : null}

                    <button
                      type="button"
                      style={{
                        ...styles.menuItem,
                        fontSize: isMobile ? 14 : 16,
                        padding: isMobile ? "12px 14px" : "14px 16px",
                      }}
                      onClick={() => handleMenuAction("review-wrong")}
                    >
                      Review wrong answers
                    </button>

                    <button
                      type="button"
                      style={{
                        ...styles.menuItem,
                        fontSize: isMobile ? 14 : 16,
                        padding: isMobile ? "12px 14px" : "14px 16px",
                      }}
                      onClick={() => handleMenuAction("review-studied")}
                    >
                      Shuffle 10 studied kanji
                    </button>

                    {lastCompletedSet ? (
                      <button
                        type="button"
                        style={{
                          ...styles.menuItem,
                          fontSize: isMobile ? 14 : 16,
                          padding: isMobile ? "12px 14px" : "14px 16px",
                        }}
                        onClick={handlePracticeSetAgain}
                      >
                        Practice this set again
                      </button>
                    ) : null}

                    <button
                      type="button"
                      style={{
                        ...styles.menuItem,
                        fontSize: isMobile ? 14 : 16,
                        padding: isMobile ? "12px 14px" : "14px 16px",
                      }}
                      onClick={() => handleMenuAction("normal")}
                    >
                      Back to normal lesson
                    </button>

                    <button
                      type="button"
                      style={{
                        ...styles.menuItem,
                        fontSize: isMobile ? 14 : 16,
                        padding: isMobile ? "12px 14px" : "14px 16px",
                        borderBottom: "none",
                        color: "#b42318",
                      }}
                      onClick={handleLogout}
                    >
                      {loggingOut ? "Logging out..." : "Logout"}
                    </button>
                  </div>
                ) : null}
              </div>

              <div style={{ ...styles.metaBox, textAlign: "right" }}>
                <div
                  style={{
                    ...styles.metaLabel,
                    fontSize: isMobile ? 12 : 16,
                  }}
                >
                  {phase === "main" ? "Set progress" : "Review"}
                </div>
                <div
                  style={{
                    ...styles.metaValue,
                    fontSize: isMobile ? 14 : 18,
                  }}
                >
                  {progressLabel}
                </div>
              </div>
            </div>

            <h1
              style={{
                ...styles.title,
                fontSize: isMobile ? (isSmallMobile ? 16 : 18) : 34,
                lineHeight: isMobile ? 1.15 : 1.08,
                maxWidth: 900,
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              Which of the following is closest in meaning to this kanji?
            </h1>
          </div>
        </div>

        <div
          style={{
            ...styles.gridArea,
            marginTop: isMobile ? -12 : -26,
            padding: isMobile ? "0 10px 10px" : "0 16px 14px",
          }}
        >
          <div style={styles.contentWrap}>
            <div
              style={{
                ...styles.stickyShadow,
                width: isMobile ? (isSmallMobile ? 118 : 132) : "min(240px, 38vw)",
                height: isMobile ? (isSmallMobile ? 118 : 132) : "min(240px, 38vw)",
                transform: isMobile ? "translate(6px, 6px)" : "translate(10px, 10px)",
              }}
            />
            <div
              style={{
                ...styles.stickyNote,
                width: isMobile ? (isSmallMobile ? 118 : 132) : "min(240px, 38vw)",
                height: isMobile ? (isSmallMobile ? 118 : 132) : "min(240px, 38vw)",
                margin: isMobile
                  ? `${isSmallMobile ? -118 : -132}px auto 10px`
                  : "-240px auto 14px",
              }}
            >
              <div style={styles.stickyFold} />
              <div
                style={{
                  ...styles.kanji,
                  fontSize: isMobile ? (isSmallMobile ? 64 : 72) : 150,
                }}
              >
                {currentQuestion.kanji}
              </div>
            </div>

            <div
              style={{
                ...styles.optionsGrid,
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: isMobile ? 10 : 16,
              }}
            >
              {currentQuestion.options.map((option, index) => (
                <button
                  key={`${currentQuestion.kanji}-${index}-${option.label}`}
                  type="button"
                  onClick={() => {
                    if (checked) return;
                    setSelected(option.label);
                  }}
                  style={getOptionStyle(option)}
                >
                  <span
                    style={{
                      ...styles.optionIndex,
                      fontSize: isMobile ? (isSmallMobile ? 12 : 14) : 22,
                    }}
                  >
                    {["①", "②", "③", "④"][index]}
                  </span>
                  <span
                    style={{
                      ...styles.optionText,
                      lineHeight: 1.15,
                    }}
                  >
                    {option.label}
                  </span>
                </button>
              ))}
            </div>

            <div
              style={{
                ...styles.feedbackBox,
                marginTop: isMobile ? 10 : 12,
                padding: isMobile ? "10px 12px" : "14px 18px",
                borderRadius: isMobile ? 16 : 20,
              }}
            >
              {!checked ? (
                <p
                  style={{
                    ...styles.feedbackText,
                    fontSize: isMobile ? (isSmallMobile ? 12 : 13) : 22,
                  }}
                >
                  Choose one answer, then press “Next” to check if it is correct.
                </p>
              ) : wasCorrect ? (
                <p
                  style={{
                    ...styles.feedbackText,
                    color: "#138a36",
                    fontSize: isMobile ? (isSmallMobile ? 12 : 13) : 22,
                  }}
                >
                  ⭕ Correct!
                </p>
              ) : (
                <div>
                  <p
                    style={{
                      ...styles.feedbackText,
                      color: "#c62828",
                      marginBottom: 6,
                      fontSize: isMobile ? (isSmallMobile ? 12 : 13) : 22,
                    }}
                  >
                    ❌ Incorrect
                  </p>
                  <p
                    style={{
                      ...styles.correctAnswerText,
                      fontSize: isMobile ? (isSmallMobile ? 12 : 13) : 21,
                    }}
                  >
                    Correct answer: {currentQuestion.correctAnswer}
                  </p>
                </div>
              )}
            </div>

            <div
              style={{
                ...styles.nextWrap,
                marginTop: isMobile ? 10 : 12,
              }}
            >
              <button
                type="button"
                onClick={handleNext}
                disabled={saving || (!checked && !selected)}
                style={{
                  ...styles.nextButton,
                  ...(saving || (!checked && !selected)
                    ? styles.nextButtonDisabled
                    : {}),
                  fontSize: isMobile ? 16 : 20,
                  padding: isMobile ? "10px 24px" : "12px 28px",
                }}
              >
                {saving
                  ? "Saving..."
                  : checked
                  ? phase === "main"
                    ? "Next Question"
                    : "Continue Review"
                  : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh",
    background: "#efefef",
    color: "#111",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  appFrame: {
    minHeight: "100dvh",
    display: "grid",
  },
  centerWrap: {
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingCard: {
    background: "#fff",
    padding: "24px 28px",
    borderRadius: 24,
    fontSize: 28,
    fontWeight: 800,
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
    textAlign: "center",
  },
  finishCard: {
    background: "#fff",
    borderRadius: 28,
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
    textAlign: "center",
    minWidth: 320,
  },
  finishTitle: {
    margin: 0,
    fontWeight: 900,
    color: "#111",
  },
  finishText: {
    margin: "14px 0 0",
    fontWeight: 700,
    color: "#333",
  },
  finishButton: {
    marginTop: 22,
    border: "none",
    borderRadius: 999,
    background: "#111",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(0,0,0,0.12)",
  },
  setCompleteCard: {
    background: "#fff",
    borderRadius: 28,
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
    textAlign: "center",
    minWidth: 340,
    maxWidth: 560,
  },
  setCompleteTitle: {
    margin: 0,
    fontWeight: 900,
    color: "#111",
  },
  setCompleteText: {
    margin: "12px 0 0",
    fontWeight: 700,
    color: "#333",
  },
  setCompleteScore: {
    margin: "10px 0 0",
    fontWeight: 800,
    color: "#222",
  },
  setCompleteButtons: {
    display: "flex",
    justifyContent: "center",
    gap: 14,
    marginTop: 24,
    flexWrap: "wrap",
  },
  setCompletePrimaryButton: {
    border: "none",
    borderRadius: 999,
    background: "#111",
    color: "#fff",
    padding: "14px 24px",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(0,0,0,0.12)",
  },
  setCompleteSecondaryButton: {
    border: "none",
    borderRadius: 999,
    background: "#d9d9d9",
    color: "#111",
    padding: "14px 24px",
    fontWeight: 900,
    cursor: "pointer",
  },
  practiceSetButton: {
    marginTop: 16,
    border: "none",
    borderRadius: 999,
    background: "#3578e5",
    color: "#fff",
    padding: "12px 22px",
    fontSize: 16,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(0,0,0,0.12)",
  },
  reviewWrongButton: {
    marginTop: 16,
    border: "none",
    borderRadius: 999,
    background: "#0f9b99",
    color: "#fff",
    padding: "12px 22px",
    fontSize: 16,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(0,0,0,0.12)",
  },
  emptyCard: {
    background: "#fff",
    borderRadius: 28,
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
    textAlign: "center",
    padding: "34px 26px",
  },
  emptyTitle: {
    margin: 0,
    fontSize: 32,
    fontWeight: 900,
    color: "#111",
  },
  emptyText: {
    margin: "14px 0 0",
    fontSize: 18,
    lineHeight: 1.5,
    fontWeight: 700,
    color: "#444",
  },
  emptyButtons: {
    display: "flex",
    justifyContent: "center",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 24,
  },
  emptyPrimaryButton: {
    border: "none",
    borderRadius: 999,
    background: "#111",
    color: "#fff",
    padding: "12px 22px",
    fontSize: 16,
    fontWeight: 900,
    cursor: "pointer",
  },
  emptySecondaryButton: {
    border: "none",
    borderRadius: 999,
    background: "#ececec",
    color: "#111",
    padding: "12px 22px",
    fontSize: 16,
    fontWeight: 900,
    cursor: "pointer",
  },
  topArea: {
    background: "#0f9b99",
  },
  topInner: {
    maxWidth: 1180,
    margin: "0 auto",
  },
  metaRow: {
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "nowrap",
  },
  metaBox: {
    color: "#ffffff",
    fontWeight: 700,
  },
  metaLabel: {
    lineHeight: 1.15,
    opacity: 0.95,
  },
  metaValue: {
    lineHeight: 1.15,
    marginTop: 3,
  },
  title: {
    textAlign: "center",
    color: "#111",
    fontWeight: 900,
    letterSpacing: "-0.02em",
  },
  menuWrap: {
    position: "relative",
  },
  menuButton: {
    border: "none",
    borderRadius: 999,
    background: "#111",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(0,0,0,0.12)",
  },
  menuDropdown: {
    position: "absolute",
    top: "100%",
    marginTop: 10,
    background: "#fff",
    borderRadius: 18,
    boxShadow: "0 16px 34px rgba(0,0,0,0.14)",
    overflow: "hidden",
    zIndex: 30,
  },
  menuItem: {
    width: "100%",
    border: "none",
    background: "#fff",
    color: "#111",
    fontWeight: 800,
    textAlign: "left",
    cursor: "pointer",
    borderBottom: "1px solid #ececec",
  },
  gridArea: {
    minHeight: 0,
    backgroundColor: "#efefef",
    backgroundImage:
      "linear-gradient(#dddddd 2px, transparent 2px), linear-gradient(90deg, #dddddd 2px, transparent 2px)",
    backgroundSize: "110px 110px",
  },
  contentWrap: {
    maxWidth: 1180,
    margin: "0 auto",
    display: "grid",
    gridTemplateRows: "auto auto auto auto",
    alignContent: "start",
    width: "100%",
  },
  stickyShadow: {
    background: "#85d4c8",
    margin: "0 auto",
    borderRadius: 6,
  },
  stickyNote: {
    background: "#c7e8cb",
    position: "relative",
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 16px 30px rgba(0,0,0,0.08)",
  },
  stickyFold: {
    position: "absolute",
    left: 0,
    bottom: 0,
    width: "28%",
    height: "28%",
    background: "#efefef",
    borderTopRightRadius: 999,
  },
  kanji: {
    fontWeight: 900,
    lineHeight: 1,
    color: "#000",
    position: "relative",
    zIndex: 1,
  },
  optionsGrid: {
    display: "grid",
    alignItems: "stretch",
    width: "min(1040px, 100%)",
    margin: "0 auto",
  },
  optionButton: {
    border: "none",
    background: "#e9c46c",
    color: "#111",
    fontWeight: 900,
    lineHeight: 1.15,
    textAlign: "left",
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
    display: "flex",
    alignItems: "center",
    transition: "transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease",
    minWidth: 0,
  },
  optionSelected: {
    background: "#f6d98d",
    boxShadow: "0 0 0 5px #111 inset, 0 8px 18px rgba(0,0,0,0.08)",
    transform: "translateY(-2px)",
  },
  optionCorrect: {
    background: "#bde7bf",
    boxShadow: "0 0 0 5px #138a36 inset, 0 8px 18px rgba(0,0,0,0.08)",
  },
  optionWrong: {
    background: "#f5b7b1",
    boxShadow: "0 0 0 5px #c62828 inset, 0 8px 18px rgba(0,0,0,0.08)",
  },
  optionIndex: {
    flexShrink: 0,
    fontWeight: 900,
  },
  optionText: {
    display: "inline-block",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    minWidth: 0,
  },
  feedbackBox: {
    width: "min(900px, 100%)",
    marginLeft: "auto",
    marginRight: "auto",
    background: "#fff",
    boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
  },
  feedbackText: {
    margin: 0,
    fontWeight: 800,
    color: "#333",
    lineHeight: 1.3,
    textAlign: "center",
  },
  correctAnswerText: {
    margin: 0,
    fontWeight: 800,
    color: "#222",
    textAlign: "center",
    lineHeight: 1.3,
  },
  nextWrap: {
    display: "flex",
    justifyContent: "center",
  },
  nextButton: {
    border: "none",
    borderRadius: 999,
    background: "#111",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(0,0,0,0.12)",
  },
  nextButtonDisabled: {
    opacity: 0.35,
    cursor: "not-allowed",
  },
};