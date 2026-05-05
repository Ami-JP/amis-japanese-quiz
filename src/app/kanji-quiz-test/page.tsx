"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type QuizOption = { label: string; isCorrect: boolean };
type QuizQuestion = { kanji: string; unit: string | null; order_in_unit: number; questionText: string; correctAnswer: string; options: QuizOption[] };
type BatchResponse = {
  account: { display_name: string | null; student_login_id: string };
  unit: string;
  lastOrderCompleted: number;
  mode?: string;
  lockedToUnit?: boolean;
  finished?: boolean;
  isUnitComplete?: boolean;
  questions: QuizQuestion[];
};
type AttemptRow = { kanji: string; unit: string | null; order_in_unit: number; quiz_type: string; user_answer: string; correct_answer: string; is_correct: boolean };
type QuizMode = "normal" | "review-wrong" | "review-studied";

function KanjiQuizTestInner() {
  const searchParams = useSearchParams();
  const requestedUnit = (searchParams.get("unit") ?? "").trim();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [batch, setBatch] = useState<BatchResponse | null>(null);
  const [resumeBatch, setResumeBatch] = useState<BatchResponse | null>(null);

  const [mainIndex, setMainIndex] = useState(0);
  const [reviewQueue, setReviewQueue] = useState<QuizQuestion[]>([]);
  const [phase, setPhase] = useState<"main" | "review">("main");
  const [selected, setSelected] = useState("");
  const [checked, setChecked] = useState(false);
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quizMode, setQuizMode] = useState<QuizMode>("normal");
  const [showSetComplete, setShowSetComplete] = useState(false);
  const [showUnitComplete, setShowUnitComplete] = useState(false);
  const [showStartScreen, setShowStartScreen] = useState(false);
  const [lastSetCorrectCount, setLastSetCorrectCount] = useState(0);
  const [lastSetWrongCount, setLastSetWrongCount] = useState(0);
  const [lastCompletedQuestions, setLastCompletedQuestions] = useState<QuizQuestion[]>([]);

  const [windowWidth, setWindowWidth] = useState(1200);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleResize() { setWindowWidth(window.innerWidth); }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isMobile = windowWidth <= 768;
  const isSmallMobile = windowWidth <= 430;

  async function fetchBatchOnce(options?: { startFromBeginning?: boolean }) {
    const params = new URLSearchParams();
    params.set("mode", "normal");
    if (requestedUnit) params.set("unit", requestedUnit);
    if (options?.startFromBeginning) params.set("startFromBeginning", "1");

    const res = await fetch(`/api/kanji-quiz-test?${params.toString()}`, { method: "GET", credentials: "include" });
    if (res.status === 401) { window.location.href = "/student-login"; return null; }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load quiz.");
    return data as BatchResponse;
  }

  async function loadBatch(options?: { startFromBeginning?: boolean }) {
    setLoading(true);
    setError("");
    setSelected("");
    setChecked(false);
    setWasCorrect(null);
    setMainIndex(0);
    setReviewQueue([]);
    setPhase("main");
    setAttempts([]);
    setQuizMode("normal");
    setShowSetComplete(false);
    setShowUnitComplete(false);
    setShowStartScreen(false);

    try {
      const data = await fetchBatchOnce(options);
      if (!data) return;
      setBatch(data);
      if (data.isUnitComplete === true && (!data.questions || data.questions.length === 0)) {
        setShowUnitComplete(true);
        return;
      }
    } catch (err) {
      setBatch(null);
      setError(err instanceof Error ? err.message : "Failed to load quiz.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function init() {
      try {
        const data = await fetchBatchOnce();
        if (!data) return;

        if (requestedUnit && data.lastOrderCompleted > 0 && data.isUnitComplete !== true) {
          setResumeBatch(data);
          setShowStartScreen(true);
          setLoading(false);
          return;
        }

        setBatch(data);
        if (data.isUnitComplete === true && (!data.questions || data.questions.length === 0)) {
          setShowUnitComplete(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load quiz.");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [requestedUnit]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) setMenuOpen(false);
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

  async function saveSetOnly(options?: { startFromBeginning?: boolean }) {
    if (!batch) return false;
    setSaving(true);
    setError("");

    const res = await fetch("/api/kanji-quiz-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        unit: batch.unit,
        advanceCount: batch.questions.length,
        attempts,
        mode: quizMode,
        lockToUnit: batch.lockedToUnit === true,
        startFromBeginning: options?.startFromBeginning === true,
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

  async function checkCompletion() {
    const params = new URLSearchParams();
    params.set("mode", "normal");
    if (requestedUnit) params.set("unit", requestedUnit);

    const res = await fetch(`/api/kanji-quiz-test?${params.toString()}`, { method: "GET", credentials: "include" });
    if (!res.ok) return false;
    const data = await res.json();
    return data.isUnitComplete === true;
  }

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setMenuOpen(false);
    try {
      await fetch("/api/student-logout", { method: "POST", credentials: "include" });
    } finally {
      window.location.href = "/student-login";
    }
  }

  function handleBackToHome() { setMenuOpen(false); window.location.href = "/student-home"; }
  function resetQuestionState() { setSelected(""); setChecked(false); setWasCorrect(null); }

  function openSetCompleteScreen() {
    const correctCount = attempts.filter((item) => item.is_correct).length;
    const wrongCount = attempts.filter((item) => !item.is_correct).length;
    setLastSetCorrectCount(correctCount);
    setLastSetWrongCount(wrongCount);
    setLastCompletedQuestions(batch?.questions ?? []);
    setShowSetComplete(true);
  }

  async function saveAndAdvance() {
    const startFromBeginning = showStartScreen === false && resumeBatch !== null && batch?.lastOrderCompleted === 0 && resumeBatch.lastOrderCompleted > 0;
    const ok = await saveSetOnly({ startFromBeginning });
    if (!ok) return;
    if (await checkCompletion()) {
      setShowUnitComplete(true);
      return;
    }
    openSetCompleteScreen();
  }

  async function handleNext() {
    if (!currentQuestion) return;

    if (!checked) {
      if (!selected) return;
      const correct = selected === currentQuestion.correctAnswer;
      setChecked(true);
      setWasCorrect(correct);
      setAttempts((prev) => [...prev, {
        kanji: currentQuestion.kanji,
        unit: currentQuestion.unit,
        order_in_unit: currentQuestion.order_in_unit,
        quiz_type: "meaning_choice",
        user_answer: selected,
        correct_answer: currentQuestion.correctAnswer,
        is_correct: correct,
      }]);

      if (!correct) {
        if (phase === "main") {
          setReviewQueue((prev) => {
            const exists = prev.some((item) => item.kanji === currentQuestion.kanji && item.order_in_unit === currentQuestion.order_in_unit);
            return exists ? prev : [...prev, currentQuestion];
          });
        } else {
          setReviewQueue((prev) => [...prev.slice(1), currentQuestion]);
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
      await saveAndAdvance();
      return;
    }

    if (phase === "review") {
      const nextQueue = wasCorrect ? reviewQueue.slice(1) : reviewQueue;
      if (wasCorrect) setReviewQueue(nextQueue);
      resetQuestionState();
      if (nextQueue.length === 0 && wasCorrect) await saveAndAdvance();
    }
  }

  async function handleContinueRequestedUnit() {
    setResumeBatch(null);
    await loadBatch();
  }

  async function handleStartFromBeginning() {
    setResumeBatch(null);
    await loadBatch({ startFromBeginning: true });
  }

  async function handleDoFiveMore() { await loadBatch(); }

  function handleTryThisSetAgain() {
    if (!lastCompletedQuestions.length || !batch) return;
    setBatch({ ...batch, questions: lastCompletedQuestions, isUnitComplete: false, finished: false });
    setMainIndex(0);
    setReviewQueue([]);
    setPhase("main");
    setSelected("");
    setChecked(false);
    setWasCorrect(null);
    setAttempts([]);
    setShowSetComplete(false);
  }

  function handleFinishForToday() { window.location.href = "/student-home"; }

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

    if (!checked && selectedThis) optionStyle = { ...optionStyle, ...styles.optionSelected };
    if (showCorrect) optionStyle = { ...optionStyle, ...styles.optionCorrect };
    if (showWrong) optionStyle = { ...optionStyle, ...styles.optionWrong };
    return optionStyle;
  }

  if (loading) return <main style={styles.page}><div style={styles.centerWrap}><div style={styles.loadingCard}>Please wait a moment...</div></div></main>;

  if (showStartScreen && requestedUnit) {
    return (
      <main style={styles.page}>
        <div style={styles.centerWrap}>
          <div style={{ ...styles.emptyCard, width: isMobile ? "92%" : 760 }}>
            <h2 style={styles.emptyTitle}>Ready to study?</h2>
            <p style={styles.emptyText}>Unit: <strong>{requestedUnit}</strong></p>
            <div style={{ ...styles.emptyButtons, flexDirection: isMobile ? "column" : "row" }}>
              <button type="button" onClick={handleContinueRequestedUnit} style={styles.emptyPrimaryButton}>Continue</button>
              <button type="button" onClick={handleStartFromBeginning} style={styles.emptySecondaryButton}>Start from beginning</button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (showUnitComplete) {
    return (
      <main style={styles.page}>
        <div style={styles.centerWrap}>
          <div style={{ ...styles.emptyCard, width: isMobile ? "92%" : 760 }}>
            <h2 style={styles.emptyTitle}>Congratulations!</h2>
            <p style={styles.emptyText}>You finished this unit!</p>
            <div style={{ ...styles.emptyButtons, flexDirection: isMobile ? "column" : "row" }}>
              <button type="button" onClick={handleBackToHome} style={styles.emptyPrimaryButton}>Back to Home</button>
              <button type="button" onClick={handleStartFromBeginning} style={styles.emptySecondaryButton}>Start from beginning</button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error) return <main style={styles.page}><div style={styles.centerWrap}><div style={{ ...styles.emptyCard, width: isMobile ? "92%" : 720 }}><h2 style={styles.emptyTitle}>Something went wrong</h2><p style={styles.emptyText}>{error}</p></div></div></main>;

  if (showSetComplete) {
    return (
      <main style={styles.page}>
        <div style={styles.centerWrap}>
          <div style={{ ...styles.setCompleteCard, width: isMobile ? "92%" : "100%", padding: isMobile ? "26px 20px" : "34px 30px" }}>
            <h2 style={{ ...styles.setCompleteTitle, fontSize: isMobile ? 28 : 34 }}>Set complete!</h2>
            <p style={{ ...styles.setCompleteText, fontSize: isMobile ? 16 : 20 }}>You finished {batch?.questions.length ?? 0} questions.</p>
            <p style={{ ...styles.setCompleteScore, fontSize: isMobile ? 15 : 18 }}>Correct: {lastSetCorrectCount} / {batch?.questions.length ?? 0}</p>
            <p style={{ ...styles.setCompleteScore, fontSize: isMobile ? 15 : 18 }}>Wrong answers: {lastSetWrongCount}</p>
            <div style={{ ...styles.setCompleteButtons, flexDirection: isMobile ? "column" : "row", alignItems: "center" }}>
              <button type="button" onClick={handleDoFiveMore} style={{ ...styles.setCompletePrimaryButton, width: isMobile ? "100%" : undefined, fontSize: isMobile ? 16 : 18 }}>Study 5 more kanji</button>
              <button type="button" onClick={handleStartFromBeginning} style={{ ...styles.setCompleteSecondaryButton, width: isMobile ? "100%" : undefined, fontSize: isMobile ? 16 : 18 }}>Start from beginning</button>
              <button type="button" onClick={handleFinishForToday} style={{ ...styles.setCompleteSecondaryButton, width: isMobile ? "100%" : undefined, fontSize: isMobile ? 16 : 18 }}>Back to Home</button>
              <button type="button" onClick={handleTryThisSetAgain} style={{ ...styles.setCompleteSecondaryButton, width: isMobile ? "100%" : undefined, fontSize: isMobile ? 16 : 18 }}>Try this set again</button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!batch || batch.questions.length === 0 || !currentQuestion) {
    return (
      <main style={styles.page}>
        <div style={styles.centerWrap}>
          <div style={{ ...styles.emptyCard, width: isMobile ? "92%" : 760 }}>
            <h2 style={styles.emptyTitle}>No questions available</h2>
            <p style={styles.emptyText}>Please wait a moment, or go back home.</p>
            <div style={{ ...styles.emptyButtons, flexDirection: isMobile ? "column" : "row" }}>
              <button type="button" onClick={handleBackToHome} style={styles.emptyPrimaryButton}>Back to Home</button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={{ ...styles.appFrame, gridTemplateRows: isMobile ? "138px minmax(0, 1fr)" : "162px minmax(0, 1fr)" }}>
        <div style={{ ...styles.topArea, padding: isMobile ? "10px 12px 26px" : "12px 18px 42px" }}>
          <div style={styles.topInner}>
            <div style={{ ...styles.metaRow, gap: isMobile ? 8 : 16, marginBottom: isMobile ? 4 : 6, alignItems: "center" }}>
              <div style={styles.metaBox}>
                <div style={{ ...styles.metaLabel, fontSize: isMobile ? 12 : 15 }}>Unit</div>
                <div style={{ ...styles.metaValue, fontSize: isMobile ? 14 : 18, maxWidth: isMobile ? 110 : undefined, wordBreak: "break-word" }}>{batch.unit}</div>
              </div>

              <div style={styles.menuWrap} ref={menuRef}>
                <button type="button" onClick={() => setMenuOpen((prev) => !prev)} style={{ ...styles.menuButton, padding: isMobile ? "8px 14px" : "10px 16px", fontSize: isMobile ? 14 : 16 }}>☰ Menu</button>
                {menuOpen ? (
                  <div style={{ ...styles.menuDropdown, minWidth: isMobile ? 220 : 260, right: 0 }}>
                    <button type="button" style={{ ...styles.menuItem, fontSize: isMobile ? 14 : 16, padding: isMobile ? "12px 14px" : "14px 16px" }} onClick={handleBackToHome}>Back to Home</button>
                    <button type="button" style={{ ...styles.menuItem, fontSize: isMobile ? 14 : 16, padding: isMobile ? "12px 14px" : "14px 16px", borderBottom: "none", color: "#b42318" }} onClick={handleLogout}>{loggingOut ? "Logging out..." : "Logout"}</button>
                  </div>
                ) : null}
              </div>

              <div style={{ ...styles.metaBox, textAlign: "right" }}>
                <div style={{ ...styles.metaLabel, fontSize: isMobile ? 12 : 15 }}>{phase === "main" ? "Set progress" : "Review"}</div>
                <div style={{ ...styles.metaValue, fontSize: isMobile ? 14 : 18 }}>{progressLabel}</div>
              </div>
            </div>

            <h1 style={{ ...styles.title, fontSize: isMobile ? 16 : 30, lineHeight: 1.08, maxWidth: 980, marginLeft: "auto", marginRight: "auto" }}>Which meaning is closest to this kanji?</h1>
          </div>
        </div>

        <div style={{ ...styles.gridArea, marginTop: isMobile ? -10 : -22, padding: isMobile ? "0 10px 10px" : "0 16px 14px" }}>
          <div style={styles.contentWrap}>
            <div style={{ ...styles.stickyShadow, width: isMobile ? (isSmallMobile ? 112 : 126) : "min(220px, 34vw)", height: isMobile ? (isSmallMobile ? 112 : 126) : "min(220px, 34vw)", transform: isMobile ? "translate(6px, 6px)" : "translate(10px, 10px)" }} />
            <div style={{ ...styles.stickyNote, width: isMobile ? (isSmallMobile ? 112 : 126) : "min(220px, 34vw)", height: isMobile ? (isSmallMobile ? 112 : 126) : "min(220px, 34vw)", margin: isMobile ? `${isSmallMobile ? -112 : -126}px auto 10px` : "-220px auto 14px" }}>
              <div style={styles.stickyFold} />
              <div style={{ ...styles.kanji, fontSize: isMobile ? (isSmallMobile ? 62 : 70) : 144 }}>{currentQuestion.kanji}</div>
            </div>

            <div style={{ ...styles.optionsGrid, gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: isMobile ? 10 : 16 }}>
              {currentQuestion.options.map((option, index) => (
                <button key={`${currentQuestion.kanji}-${index}-${option.label}`} type="button" onClick={() => { if (!checked) setSelected(option.label); }} style={getOptionStyle(option)}>
                  <span style={{ ...styles.optionIndex, fontSize: isMobile ? (isSmallMobile ? 12 : 14) : 22 }}>{["①", "②", "③", "④"][index]}</span>
                  <span style={{ ...styles.optionText, lineHeight: 1.15 }}>{option.label}</span>
                </button>
              ))}
            </div>

            <div style={{ ...styles.feedbackBox, marginTop: isMobile ? 10 : 12, padding: isMobile ? "10px 12px" : "14px 18px", borderRadius: isMobile ? 16 : 20 }}>
              {!checked ? (
                <p style={{ ...styles.feedbackText, fontSize: isMobile ? (isSmallMobile ? 12 : 13) : 22 }}>Choose one answer, then press “Next” to check it.</p>
              ) : wasCorrect ? (
                <p style={{ ...styles.feedbackText, color: "#138a36", fontSize: isMobile ? (isSmallMobile ? 12 : 13) : 22 }}>⭕ Correct!</p>
              ) : (
                <div>
                  <p style={{ ...styles.feedbackText, color: "#c62828", marginBottom: 6, fontSize: isMobile ? (isSmallMobile ? 12 : 13) : 22 }}>❌ Incorrect</p>
                  <p style={{ ...styles.correctAnswerText, fontSize: isMobile ? (isSmallMobile ? 12 : 13) : 21 }}>Correct answer: {currentQuestion.correctAnswer}</p>
                </div>
              )}
            </div>

            <div style={{ ...styles.nextWrap, marginTop: isMobile ? 10 : 12 }}>
              <button type="button" onClick={handleNext} disabled={saving || (!checked && !selected)} style={{ ...styles.nextButton, ...(saving || (!checked && !selected) ? styles.nextButtonDisabled : {}), fontSize: isMobile ? 16 : 20, padding: isMobile ? "10px 24px" : "12px 28px" }}>
                {saving ? "Saving..." : checked ? phase === "main" ? "Next Question" : "Continue Review" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function KanjiQuizTestPage() {
  return <Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}><KanjiQuizTestInner /></Suspense>;
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100dvh", background: "#efefef", color: "#111", fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  appFrame: { minHeight: "100dvh", display: "grid" },
  centerWrap: { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  loadingCard: { background: "#fff", padding: "24px 28px", borderRadius: 24, fontSize: 28, fontWeight: 800, boxShadow: "0 10px 30px rgba(0,0,0,0.08)", textAlign: "center" },
  setCompleteCard: { background: "#fff", borderRadius: 28, boxShadow: "0 10px 30px rgba(0,0,0,0.08)", textAlign: "center", minWidth: 340, maxWidth: 560 },
  setCompleteTitle: { margin: 0, fontWeight: 900, color: "#111" },
  setCompleteText: { margin: "12px 0 0", fontWeight: 700, color: "#333" },
  setCompleteScore: { margin: "10px 0 0", fontWeight: 800, color: "#222" },
  setCompleteButtons: { display: "flex", justifyContent: "center", gap: 14, marginTop: 24, flexWrap: "wrap" },
  setCompletePrimaryButton: { border: "none", borderRadius: 999, background: "#111", color: "#fff", padding: "14px 24px", fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 18px rgba(0,0,0,0.12)" },
  setCompleteSecondaryButton: { border: "none", borderRadius: 999, background: "#d9d9d9", color: "#111", padding: "14px 24px", fontWeight: 900, cursor: "pointer" },
  emptyCard: { background: "#fff", borderRadius: 28, boxShadow: "0 10px 30px rgba(0,0,0,0.08)", textAlign: "center", padding: "34px 26px" },
  emptyTitle: { margin: 0, fontSize: 32, fontWeight: 900, color: "#111" },
  emptyText: { margin: "14px 0 0", fontSize: 18, lineHeight: 1.5, fontWeight: 700, color: "#444" },
  emptyButtons: { display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginTop: 24 },
  emptyPrimaryButton: { border: "none", borderRadius: 999, background: "#111", color: "#fff", padding: "12px 22px", fontSize: 16, fontWeight: 900, cursor: "pointer" },
  emptySecondaryButton: { border: "none", borderRadius: 999, background: "#ececec", color: "#111", padding: "12px 22px", fontSize: 16, fontWeight: 900, cursor: "pointer" },
  topArea: { background: "#0f9b99" },
  topInner: { maxWidth: 1180, margin: "0 auto" },
  metaRow: { display: "flex", justifyContent: "space-between", flexWrap: "nowrap" },
  metaBox: { color: "#ffffff", fontWeight: 700 },
  metaLabel: { lineHeight: 1.15, opacity: 0.95 },
  metaValue: { lineHeight: 1.15, marginTop: 3 },
  title: { textAlign: "center", color: "#111", fontWeight: 900, letterSpacing: "-0.02em" },
  menuWrap: { position: "relative" },
  menuButton: { border: "none", borderRadius: 999, background: "#111", color: "#fff", fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 18px rgba(0,0,0,0.12)" },
  menuDropdown: { position: "absolute", top: "100%", marginTop: 10, background: "#fff", borderRadius: 18, boxShadow: "0 16px 34px rgba(0,0,0,0.14)", overflow: "hidden", zIndex: 30 },
  menuItem: { width: "100%", border: "none", background: "#fff", color: "#111", fontWeight: 800, textAlign: "left", cursor: "pointer", borderBottom: "1px solid #ececec" },
  gridArea: { minHeight: 0, backgroundColor: "#efefef", backgroundImage: "linear-gradient(#dddddd 2px, transparent 2px), linear-gradient(90deg, #dddddd 2px, transparent 2px)", backgroundSize: "32px 32px" },
  contentWrap: { maxWidth: 860, margin: "0 auto", paddingBottom: 18 },
  stickyShadow: { background: "rgba(0,0,0,0.12)", borderRadius: 6 },
  stickyNote: { position: "relative", background: "#f5ee76", borderRadius: 6, display: "grid", placeItems: "center", boxShadow: "0 10px 24px rgba(0,0,0,0.18)" },
  stickyFold: { position: "absolute", top: 0, right: 0, width: 0, height: 0, borderLeft: "22px solid transparent", borderBottom: "22px solid rgba(0,0,0,0.12)" },
  kanji: { fontWeight: 900, lineHeight: 1, color: "#222" },
  optionsGrid: { display: "grid" },
  optionButton: { border: "3px solid #111", background: "#fff", color: "#111", fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", textAlign: "left", boxShadow: "0 6px 0 rgba(0,0,0,0.08)" },
  optionSelected: { background: "#fff3c4" },
  optionCorrect: { background: "#d8f7df", borderColor: "#138a36" },
  optionWrong: { background: "#ffe0e0", borderColor: "#c62828" },
  optionIndex: { flexShrink: 0 },
  optionText: { fontWeight: 900 },
  feedbackBox: { background: "#fff", border: "2px solid #111", minHeight: 70 },
  feedbackText: { margin: 0, fontWeight: 800 },
  correctAnswerText: { margin: 0, fontWeight: 800, color: "#111" },
  nextWrap: { display: "flex", justifyContent: "center" },
  nextButton: { border: "none", borderRadius: 999, background: "#111", color: "#fff", fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 18px rgba(0,0,0,0.12)" },
  nextButtonDisabled: { opacity: 0.45, cursor: "not-allowed" },
};
