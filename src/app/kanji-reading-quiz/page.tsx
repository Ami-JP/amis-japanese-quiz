"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type HintKanjiItem = { kanji: string; meaning_ja: string; meaning_en: string; on_yomi: string; kun_yomi: string };
type PromptRubyItem = { text: string; ruby: string };
type ReadingQuestion = {
  id: string | number | null;
  unit: string;
  order_in_unit: number;
  kanji_order_in_unit?: number | null;
  reading_variant_order?: number | null;
  prompt: string;
  translation_en: string;
  target_text: string;
  target_ruby: string;
  prompt_ruby_items: PromptRubyItem[];
  answer_text: string;
  answer_aliases: string[];
  meaning_ja: string;
  meaning_en: string;
  hint_ja: string;
  hint_en: string;
  explanation_ja: string;
  explanation_en: string;
  hint_kanji_items: HintKanjiItem[];
  difficulty_tier: string;
};

type BatchResponse = {
  account: { display_name: string | null; student_login_id: string };
  unit: string;
  difficulty_tier: string;
  mode: "normal";
  lastOrderCompleted: number;
  finished: boolean;
  isUnitComplete?: boolean;
  hasAdvancedAvailable?: boolean;
  questions: ReadingQuestion[];
};

type AttemptRow = {
  question_id: string | number | null;
  unit: string | null;
  order_in_unit: number;
  kanji_order_in_unit?: number | null;
  reading_variant_order?: number | null;
  prompt: string;
  target_text: string;
  user_answer: string;
  correct_answer: string;
  is_correct: boolean;
  difficulty_tier: string;
};

function normalizeKanaInput(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .toLowerCase();
}

function KanjiReadingQuizInner() {
  const searchParams = useSearchParams();
  const unit = (searchParams.get("unit") ?? "").trim();
  const difficultyTier = (searchParams.get("tier") ?? "normal").trim();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [batch, setBatch] = useState<BatchResponse | null>(null);
  const [resumeBatch, setResumeBatch] = useState<BatchResponse | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [checked, setChecked] = useState(false);
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);
  const [showEnglish, setShowEnglish] = useState(false);
  const [showFurigana, setShowFurigana] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [showStartScreen, setShowStartScreen] = useState(false);
  const [showUnitComplete, setShowUnitComplete] = useState(false);
  const [hasAdvancedAvailable, setHasAdvancedAvailable] = useState(false);
  const [reviewQuestions, setReviewQuestions] = useState<ReadingQuestion[] | null>(null);
  const [currentMode, setCurrentMode] = useState<"normal" | "review">("normal");
  const [lastCompletedQuestions, setLastCompletedQuestions] = useState<ReadingQuestion[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function fetchBatchOnce(options?: { startFromBeginning?: boolean; tier?: string }) {
    const targetTier = options?.tier ?? difficultyTier;
    const params = new URLSearchParams();
    params.set("unit", unit);
    params.set("tier", targetTier);
    params.set("mode", "normal");
    if (options?.startFromBeginning) params.set("startFromBeginning", "1");

    const res = await fetch(`/api/kanji-reading-quiz?${params.toString()}`, { credentials: "include" });
    if (res.status === 401) {
      window.location.href = "/student-login";
      return null;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load quiz.");
    return data as BatchResponse;
  }

  async function loadBatch(options?: { startFromBeginning?: boolean; tier?: string }) {
    setLoading(true);
    setError("");
    setQuestionIndex(0);
    setAnswers([]);
    setAttempts([]);
    setChecked(false);
    setWasCorrect(null);
    setShowComplete(false);
    setShowUnitComplete(false);
    setShowEnglish(false);
    setShowFurigana(false);
    setShowHint(false);
    setReviewQuestions(null);
    setCurrentMode("normal");
    setShowStartScreen(false);

    try {
      const data = await fetchBatchOnce(options);
      if (!data) return;
      setBatch(data);
      setHasAdvancedAvailable(data.hasAdvancedAvailable === true);
      if (data.isUnitComplete === true && data.questions.length === 0) {
        setShowUnitComplete(true);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quiz.");
      setBatch(null);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }

  useEffect(() => {
    async function init() {
      try {
        const data = await fetchBatchOnce();
        if (!data) return;
        setHasAdvancedAvailable(data.hasAdvancedAvailable === true);

        if (difficultyTier === "normal") {
          if (data.lastOrderCompleted === 0 && data.isUnitComplete !== true) {
            setShowStartScreen(true);
            return;
          }
          if (data.lastOrderCompleted > 0 && data.isUnitComplete !== true) {
            setResumeBatch(data);
            setShowStartScreen(true);
            return;
          }
        }

        setBatch(data);
        if (data.isUnitComplete === true && data.questions.length === 0) setShowUnitComplete(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load quiz.");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [unit, difficultyTier]);

  const activeQuestions = reviewQuestions ?? batch?.questions ?? [];
  const currentQuestion = useMemo(() => activeQuestions[questionIndex] ?? null, [activeQuestions, questionIndex]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [questionIndex, currentQuestion?.id]);

  function getCurrentInputValue() { return answers[questionIndex] ?? ""; }
  function setCurrentInputValue(value: string) {
    setAnswers((prev) => {
      const next = [...prev];
      next[questionIndex] = value;
      return next;
    });
  }

  function isAnswerCorrect(question: ReadingQuestion, rawInput: string) {
    const normalizedInput = normalizeKanaInput(rawInput);
    const accepted = [question.answer_text, ...(question.answer_aliases ?? [])].map((item) => normalizeKanaInput(item)).filter(Boolean);
    return accepted.includes(normalizedInput);
  }

  async function saveProgress(options?: { startFromBeginning?: boolean }) {
    if (!batch) return false;
    setSaving(true);
    setError("");
    const res = await fetch("/api/kanji-reading-quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        unit: batch.unit,
        difficulty_tier: batch.difficulty_tier,
        mode: "normal",
        advanceCount: batch.questions.length,
        attempts,
        startFromBeginning: options?.startFromBeginning === true,
      }),
    });
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
    params.set("unit", unit);
    params.set("tier", difficultyTier);
    params.set("mode", "normal");
    const res = await fetch(`/api/kanji-reading-quiz?${params.toString()}`, { credentials: "include" });
    if (!res.ok) return false;
    const data = await res.json();
    return data.isUnitComplete === true;
  }

  async function finishSet() {
    const startFromBeginning = batch?.lastOrderCompleted === 0 && resumeBatch !== null && resumeBatch.lastOrderCompleted > 0;
    const ok = await saveProgress({ startFromBeginning });
    if (!ok) return;
    setLastCompletedQuestions(activeQuestions);
    if (await checkCompletion()) {
      setShowUnitComplete(true);
      return;
    }
    setShowComplete(true);
  }

  async function handleCheckOrNext() {
    if (!currentQuestion) return;
    if (!checked) {
      const value = getCurrentInputValue();
      if (!value.trim()) return;
      const correct = isAnswerCorrect(currentQuestion, value);
      setChecked(true);
      setWasCorrect(correct);
      setAttempts((prev) => [...prev, {
        question_id: currentQuestion.id,
        unit: currentQuestion.unit,
        order_in_unit: currentQuestion.order_in_unit,
        kanji_order_in_unit: currentQuestion.kanji_order_in_unit ?? null,
        reading_variant_order: currentQuestion.reading_variant_order ?? null,
        prompt: currentQuestion.prompt,
        target_text: currentQuestion.target_text,
        user_answer: value,
        correct_answer: currentQuestion.answer_text,
        is_correct: correct,
        difficulty_tier: currentQuestion.difficulty_tier,
      }]);
      return;
    }

    if (questionIndex < activeQuestions.length - 1) {
      setQuestionIndex((prev) => prev + 1);
      setChecked(false);
      setWasCorrect(null);
      return;
    }

    if (currentMode === "review") {
      setLastCompletedQuestions(activeQuestions);
      setShowComplete(true);
      return;
    }

    await finishSet();
  }

  function startWrongReview() {
    if (!batch) return;
    const wrongIds = attempts.filter((item) => !item.is_correct).map((item) => item.question_id);
    const uniqueWrongQuestions = batch.questions.filter((q) => wrongIds.includes(q.id));
    if (!uniqueWrongQuestions.length) return;
    setCurrentMode("review");
    setReviewQuestions(uniqueWrongQuestions);
    setQuestionIndex(0);
    setAnswers([]);
    setAttempts([]);
    setChecked(false);
    setWasCorrect(null);
    setShowComplete(false);
  }

  function handleTryThisSetAgain() {
    if (!lastCompletedQuestions.length || !batch) return;
    setBatch({ ...batch, questions: lastCompletedQuestions, isUnitComplete: false, finished: false });
    setQuestionIndex(0);
    setAnswers([]);
    setAttempts([]);
    setChecked(false);
    setWasCorrect(null);
    setShowComplete(false);
    setCurrentMode("normal");
    setReviewQuestions(null);
  }

  if (loading) return <main style={styles.page}><div style={styles.centerWrap}><div style={styles.card}>Loading...</div></div></main>;
  if (error) return <main style={styles.page}><div style={styles.centerWrap}><div style={styles.card}><h2 style={styles.title}>Something went wrong</h2><p>{error}</p></div></div></main>;

  if (showStartScreen && difficultyTier === "normal") {
    const isFirstTime = !resumeBatch;
    return (
      <main style={styles.page}>
        <div style={styles.centerWrap}>
          <div style={styles.card}>
            <h2 style={styles.title}>Ready to study?</h2>
            <p style={styles.message}>Unit: <strong>{unit}</strong></p>
            <div style={styles.buttonRow}>
              {isFirstTime ? (
                <button type="button" onClick={() => loadBatch()} style={styles.primaryLarge}>Normal Mode</button>
              ) : (
                <button type="button" onClick={() => loadBatch()} style={styles.primary}>Continue</button>
              )}
              {!isFirstTime ? <button type="button" onClick={() => loadBatch({ startFromBeginning: true })} style={styles.secondary}>Start from beginning</button> : null}
              {hasAdvancedAvailable ? <button type="button" onClick={() => (window.location.href = `/kanji-reading-quiz?unit=${encodeURIComponent(unit)}&tier=high_level&mode=normal`)} style={isFirstTime ? styles.subtle : styles.secondary}>Try Advanced</button> : null}
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (showUnitComplete) {
    return <main style={styles.page}><div style={styles.centerWrap}><div style={styles.card}><h2 style={styles.title}>Congratulations!</h2><p style={styles.message}>You finished this unit!</p><div style={styles.buttonRow}><button type="button" onClick={() => (window.location.href = "/student-home")} style={styles.primary}>Back to Home</button><button type="button" onClick={() => loadBatch({ startFromBeginning: true })} style={styles.secondary}>Start from beginning</button></div></div></div></main>;
  }

  if (showComplete) {
    return <main style={styles.page}><div style={styles.centerWrap}><div style={styles.card}><h2 style={styles.title}>Set complete!</h2><p style={styles.message}>Correct: {attempts.filter((a) => a.is_correct).length} / {activeQuestions.length}</p><div style={styles.buttonRow}><button type="button" onClick={startWrongReview} style={styles.primary}>Review wrong answers</button><button type="button" onClick={() => loadBatch()} style={styles.primary}>Practice 5 more</button><button type="button" onClick={() => (window.location.href = "/student-home")} style={styles.secondary}>Back to Home</button><button type="button" onClick={handleTryThisSetAgain} style={styles.secondary}>Try this set again</button></div></div></div></main>;
  }

  if (!currentQuestion) return <main style={styles.page}><div style={styles.centerWrap}><div style={styles.card}><h2 style={styles.title}>No questions available</h2></div></div></main>;

  return (
    <main style={styles.page}>
      <div style={styles.quizWrap}>
        <div style={styles.topBar}><span>{difficultyTier === "high_level" ? "Advanced Reading" : "Reading Quiz"}</span><button type="button" onClick={() => (window.location.href = "/student-home")} style={styles.homeButton}>Home</button></div>
        <div style={styles.kanjiCard}>{currentQuestion.target_text}</div>
        <div style={styles.prompt}>{currentQuestion.prompt}</div>
        {showEnglish ? <div style={styles.translation}>{currentQuestion.translation_en}</div> : null}
        <div style={styles.toggleRow}><button type="button" style={styles.secondary} onClick={() => setShowEnglish((v) => !v)}>Show English</button><button type="button" style={styles.secondary} onClick={() => setShowHint((v) => !v)}>Hint</button></div>
        {showHint ? <div style={styles.hintBox}><div>Meaning: {currentQuestion.meaning_en}</div><div>{currentQuestion.hint_en}</div></div> : null}
        <input ref={inputRef} value={getCurrentInputValue()} onChange={(e) => setCurrentInputValue(e.target.value)} style={styles.input} placeholder="Type in hiragana" />
        {checked ? <div style={wasCorrect ? styles.correct : styles.wrong}>{wasCorrect ? "Correct!" : `Correct answer: ${currentQuestion.answer_text}`}</div> : null}
        <div style={styles.buttonRow}><button type="button" onClick={handleCheckOrNext} disabled={saving || (!checked && !getCurrentInputValue().trim())} style={styles.primary}>{saving ? "Saving..." : checked ? "Next" : "Check"}</button></div>
      </div>
    </main>
  );
}

export default function KanjiReadingQuizPage() {
  return <Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}><KanjiReadingQuizInner /></Suspense>;
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100dvh", background: "#eef5ff", padding: 16, fontFamily: 'Arial, "Hiragino Kaku Gothic ProN", sans-serif' },
  centerWrap: { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" },
  card: { width: "min(720px, 94vw)", background: "#fff", border: "3px solid #111", borderRadius: 24, padding: 24, textAlign: "center" },
  title: { margin: 0, fontSize: 30, fontWeight: 900 },
  message: { fontSize: 18, fontWeight: 700, lineHeight: 1.5 },
  buttonRow: { display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: 18 },
  primary: { border: "none", borderRadius: 999, background: "#111", color: "#fff", padding: "12px 20px", fontWeight: 900, cursor: "pointer" },
  primaryLarge: { border: "none", borderRadius: 999, background: "#111", color: "#fff", padding: "15px 28px", fontWeight: 900, fontSize: 18, cursor: "pointer" },
  secondary: { border: "none", borderRadius: 999, background: "#dcdcdc", color: "#111", padding: "12px 20px", fontWeight: 800, cursor: "pointer" },
  subtle: { border: "none", borderRadius: 999, background: "#d9dde5", color: "#111", padding: "10px 18px", fontWeight: 800, cursor: "pointer" },
  quizWrap: { width: "min(900px, 96vw)", margin: "0 auto", background: "#fff", borderRadius: 24, border: "3px solid #111", padding: 20 },
  topBar: { display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 900, fontSize: 22, marginBottom: 12 },
  homeButton: { border: "none", borderRadius: 999, background: "#dcdcdc", color: "#111", padding: "10px 16px", fontWeight: 800, cursor: "pointer" },
  kanjiCard: { background: "#f5ee76", border: "3px solid #111", borderRadius: 20, padding: 20, fontSize: 64, fontWeight: 900, textAlign: "center", marginBottom: 14 },
  prompt: { fontSize: 30, fontWeight: 900, lineHeight: 1.3, textAlign: "center", marginBottom: 10 },
  translation: { textAlign: "center", fontWeight: 800, marginBottom: 10 },
  toggleRow: { display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 10 },
  hintBox: { background: "#f5fbff", border: "2px solid #111", borderRadius: 16, padding: 12, marginBottom: 12, lineHeight: 1.5 },
  input: { width: "100%", border: "4px solid #111", borderRadius: 18, padding: "14px 16px", fontSize: 24, fontWeight: 900, boxSizing: "border-box" },
  correct: { color: "#138a36", fontWeight: 900, marginTop: 12, textAlign: "center" },
  wrong: { color: "#c62828", fontWeight: 900, marginTop: 12, textAlign: "center" },
};
