"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type HintKanjiItem = {
  kanji: string;
  meaning_ja: string;
  meaning_en: string;
  on_yomi: string;
  kun_yomi: string;
};

type PromptRubyItem = {
  text: string;
  ruby: string;
};

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
  account: {
    display_name: string | null;
    student_login_id: string;
  };
  unit: string;
  difficulty_tier: string;
  mode: "normal" | "practice" | "practice-set";
  startOrder?: number | null;
  endOrder?: number | null;
  lastOrderCompleted: number;
  finished: boolean;
  hasMoreReadingVariants?: boolean;
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

const ASSETS = {
  character: "/reading-quiz/character.png",
  hand: "/reading-quiz/hand.png",
  bulb: "/reading-quiz/bulb.png",
  correct: "/reading-quiz/correct.png",
  wrong: "/reading-quiz/wrong.png",
};

function normalizeKanaInput(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[ァ-ヶ]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0x60)
    )
    .toLowerCase();
}

function playTone(type: "correct" | "wrong") {
  try {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;

    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.type = "sine";
    oscillator.frequency.value = type === "correct" ? 880 : 240;

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.22);
  } catch {}
}

function useWindowWidth() {
  const [windowWidth, setWindowWidth] = useState(1280);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return windowWidth;
}

function getPromptFontSize(
  promptLength: number,
  mode: "desktop" | "tablet" | "phone" | "small-phone"
) {
  if (mode === "small-phone") {
    if (promptLength <= 8) return 34;
    if (promptLength <= 12) return 30;
    if (promptLength <= 16) return 26;
    if (promptLength <= 22) return 22;
    return 20;
  }

  if (mode === "phone") {
    if (promptLength <= 8) return 42;
    if (promptLength <= 12) return 36;
    if (promptLength <= 16) return 31;
    if (promptLength <= 22) return 26;
    return 22;
  }

  if (mode === "tablet") {
    if (promptLength <= 8) return 58;
    if (promptLength <= 12) return 50;
    if (promptLength <= 16) return 43;
    if (promptLength <= 22) return 36;
    return 30;
  }

  if (promptLength <= 8) return 82;
  if (promptLength <= 12) return 74;
  if (promptLength <= 16) return 64;
  if (promptLength <= 22) return 54;
  if (promptLength <= 28) return 46;
  if (promptLength <= 34) return 40;
  return 34;
}

function AssetImage({
  src,
  alt,
  fallback,
  style,
}: {
  src: string;
  alt: string;
  fallback: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <div style={style}>{fallback}</div>;
  }

  return (
    <img
      src={src}
      alt={alt}
      style={style}
      onError={() => setFailed(true)}
      draggable={false}
    />
  );
}

function splitReadingsToLines(value: string) {
  return value
    .split("、")
    .map((part) => part.trim())
    .filter(Boolean);
}

function KanjiReadingQuizInner() {
  const searchParams = useSearchParams();
  const unit = (searchParams.get("unit") ?? "").trim();
  const difficultyTier = (searchParams.get("tier") ?? "normal").trim();
  const rawMode = (searchParams.get("mode") ?? "normal").trim();
  const startOrderParam = (searchParams.get("startOrder") ?? "").trim();
  const endOrderParam = (searchParams.get("endOrder") ?? "").trim();

  const initialMode: "normal" | "practice" | "practice-set" =
    rawMode === "practice"
      ? "practice"
      : rawMode === "practice-set"
      ? "practice-set"
      : "normal";

  const startOrder = startOrderParam ? Number(startOrderParam) : null;
  const endOrder = endOrderParam ? Number(endOrderParam) : null;

  const windowWidth = useWindowWidth();
  const isDesktop = windowWidth >= 1200;
  const isTablet = windowWidth >= 700 && windowWidth < 1200;
  const isSmallPhone = windowWidth < 430;
  const deviceMode = isDesktop
    ? "desktop"
    : isTablet
    ? "tablet"
    : isSmallPhone
    ? "small-phone"
    : "phone";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [batch, setBatch] = useState<BatchResponse | null>(null);

  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);

  const [showFurigana, setShowFurigana] = useState(false);
  const [showEnglish, setShowEnglish] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const [checked, setChecked] = useState(false);
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);
  const [showComplete, setShowComplete] = useState(false);
  const [showStartScreen, setShowStartScreen] = useState(true);

  const [reviewQuestions, setReviewQuestions] = useState<
    ReadingQuestion[] | null
  >(null);
  const [lastCompletedQuestions, setLastCompletedQuestions] = useState<
    ReadingQuestion[]
  >([]);
  const [currentMode, setCurrentMode] = useState<
    "normal" | "practice" | "practice-set" | "review"
  >(initialMode);
  const [menuOpen, setMenuOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  async function loadBatch(
    mode: "normal" | "practice" | "practice-set",
    options?: { startOrder?: number | null; endOrder?: number | null }
  ) {
    if (!unit) {
      setError("unit is required in the URL.");
      setLoading(false);
      return;
    }

    setCurrentMode(mode);
    setLoading(true);
    setError("");
    setQuestionIndex(0);
    setAnswers([]);
    setAttempts([]);
    setChecked(false);
    setWasCorrect(null);
    setShowComplete(false);
    setShowFurigana(false);
    setShowEnglish(false);
    setShowHint(false);
    setReviewQuestions(null);
    setMenuOpen(false);
    setShowStartScreen(false);

    const params = new URLSearchParams();
    params.set("unit", unit);
    params.set("tier", difficultyTier);
    params.set("mode", mode);

    if (mode === "practice-set") {
      const nextStart = options?.startOrder ?? startOrder;
      const nextEnd = options?.endOrder ?? endOrder;

      if (nextStart != null) params.set("startOrder", String(nextStart));
      if (nextEnd != null) params.set("endOrder", String(nextEnd));
    }

    const res = await fetch(`/api/kanji-reading-quiz?${params.toString()}`, {
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

    setTimeout(() => {
      inputRef.current?.focus();
    }, 80);
  }

  useEffect(() => {
    setLoading(false);
    setShowStartScreen(true);
  }, [unit, difficultyTier, initialMode, startOrderParam, endOrderParam]);

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

  const activeQuestions = reviewQuestions ?? batch?.questions ?? [];

  const currentQuestion = useMemo(() => {
    if (activeQuestions.length === 0) return null;
    return activeQuestions[questionIndex] ?? null;
  }, [activeQuestions, questionIndex]);

  useEffect(() => {
    if (!currentQuestion) return;
    setShowFurigana(false);
    setShowEnglish(false);
    setShowHint(false);
    setChecked(false);
    setWasCorrect(null);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 80);
  }, [currentQuestion?.id]);

  function getCurrentInputValue() {
    return answers[questionIndex] ?? "";
  }

  function setCurrentInputValue(value: string) {
    setAnswers((prev) => {
      const next = [...prev];
      next[questionIndex] = value;
      return next;
    });
  }

  function isAnswerCorrect(question: ReadingQuestion, rawInput: string) {
    const normalizedInput = normalizeKanaInput(rawInput);
    const accepted = [question.answer_text, ...(question.answer_aliases ?? [])]
      .map((item) => normalizeKanaInput(item))
      .filter(Boolean);

    return accepted.includes(normalizedInput);
  }

  function renderAnnotatedSegment(
    text: string,
    promptRubyItems: PromptRubyItem[],
    keyPrefix: string
  ) {
    const rubyMap = new Map(
      promptRubyItems
        .filter((item) => item.text && item.ruby)
        .map((item) => [item.text, item.ruby])
    );

    if (!showFurigana || rubyMap.size === 0) {
      return <span>{text}</span>;
    }

    const items = Array.from(rubyMap.entries()).sort(
      (a, b) => b[0].length - a[0].length
    );

    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    let key = 0;

    while (cursor < text.length) {
      let matched = false;

      for (const [token, ruby] of items) {
        if (!token) continue;

        if (text.slice(cursor, cursor + token.length) === token) {
          nodes.push(
            <span key={`${keyPrefix}-${key}`} style={styles.rubyWord}>
              <span style={styles.rubyText}>{ruby}</span>
              <span>{token}</span>
            </span>
          );

          cursor += token.length;
          key += 1;
          matched = true;
          break;
        }
      }

      if (!matched) {
        nodes.push(<span key={`${keyPrefix}-${key}`}>{text[cursor]}</span>);
        cursor += 1;
        key += 1;
      }
    }

    return <>{nodes}</>;
  }

  function renderPrompt(question: ReadingQuestion) {
    const prompt = question.prompt;
    const target = question.target_text;

    if (!target || !prompt.includes(target)) {
      return <span>{prompt}</span>;
    }

    const firstIndex = prompt.indexOf(target);
    const before = prompt.slice(0, firstIndex);
    const after = prompt.slice(firstIndex + target.length);

    return (
      <>
        {renderAnnotatedSegment(before, question.prompt_ruby_items, "before")}
        <span style={styles.targetWrap}>
          <span>{target}</span>
          <span style={styles.targetUnderline} />
        </span>
        {renderAnnotatedSegment(after, question.prompt_ruby_items, "after")}
      </>
    );
  }

  function handleCheckOrNext() {
    if (!currentQuestion) return;

    const value = getCurrentInputValue();

    if (!checked) {
      if (!value.trim()) return;

      const correct = isAnswerCorrect(currentQuestion, value);

      setChecked(true);
      setWasCorrect(correct);
      playTone(correct ? "correct" : "wrong");

      setAttempts((prev) => [
        ...prev,
        {
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
        },
      ]);

      return;
    }

    if (questionIndex < activeQuestions.length - 1) {
      setQuestionIndex((prev) => prev + 1);
      return;
    }

    if (currentMode === "review") {
      setLastCompletedQuestions(activeQuestions);
      setShowComplete(true);
      return;
    }

    saveProgress();
  }

  async function saveProgress() {
    if (!batch) return;

    setSaving(true);
    setError("");

    const res = await fetch("/api/kanji-reading-quiz", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        unit: batch.unit,
        difficulty_tier: batch.difficulty_tier,
        mode: batch.mode,
        advanceCount: batch.mode === "normal" ? batch.questions.length : 0,
        attempts,
      }),
    });

    if (res.status === 401) {
      window.location.href = "/student-login";
      return;
    }

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Failed to save progress.");
      setSaving(false);
      return;
    }

    setSaving(false);
    setLastCompletedQuestions(activeQuestions);
    setShowComplete(true);
  }

  function startWrongReview() {
    if (!batch) return;

    const wrongIds = attempts
      .filter((item) => !item.is_correct)
      .map((item) => item.question_id);

    const uniqueWrongQuestions = batch.questions.filter((q) =>
      wrongIds.includes(q.id)
    );

    if (uniqueWrongQuestions.length === 0) return;

    setCurrentMode("review");
    setReviewQuestions(uniqueWrongQuestions);
    setQuestionIndex(0);
    setAnswers([]);
    setAttempts([]);
    setChecked(false);
    setWasCorrect(null);
    setShowComplete(false);
    setShowFurigana(false);
    setShowEnglish(false);
    setShowHint(false);
    setMenuOpen(false);
    setShowStartScreen(false);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 80);
  }

  function startPracticeThisSetAgain() {
    if (lastCompletedQuestions.length === 0) return;

    setCurrentMode("review");
    setReviewQuestions(lastCompletedQuestions);
    setQuestionIndex(0);
    setAnswers([]);
    setAttempts([]);
    setChecked(false);
    setWasCorrect(null);
    setShowComplete(false);
    setShowFurigana(false);
    setShowEnglish(false);
    setShowHint(false);
    setMenuOpen(false);
    setShowStartScreen(false);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 80);
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

  function goHome() {
    window.location.href = "/student-home";
  }

  async function handlePracticeMoreReadings() {
    setMenuOpen(false);
    await loadBatch("normal");
  }

  async function handleContinueFromStartScreen() {
    await loadBatch("normal");
  }

  async function handleStartFromBeginningFromStartScreen() {
    await loadBatch("practice");
  }

  async function handleContinueMenu() {
    setMenuOpen(false);
    await loadBatch("normal");
  }

  async function handleRestartUnit() {
    setMenuOpen(false);
    await loadBatch("practice");
  }

  function renderReadingLines(value: string, side: "left" | "right") {
    const lines = splitReadingsToLines(value);
    const style =
      side === "left" ? styles.readingCellLeft : styles.readingCellRight;

    return (
      <div style={style}>
        {lines.length === 0 ? (
          "-"
        ) : (
          lines.map((line, index) => (
            <div key={`${side}-${index}`} style={styles.readingLine}>
              {line}
            </div>
          ))
        )}
      </div>
    );
  }

  function renderHintPanel(question: ReadingQuestion, mobile: boolean) {
    const columns =
      question.hint_kanji_items.length <= 2
        ? "repeat(2, minmax(0, 1fr))"
        : mobile
        ? "repeat(2, minmax(0, 1fr))"
        : "repeat(3, minmax(0, 1fr))";

    return (
      <div
        style={{
          ...styles.hintPanel,
          padding: mobile ? "12px 10px 8px" : "12px 12px 8px",
        }}
      >
        <div style={styles.hintTopBox}>
          <div style={styles.hintTopLine}>
            <strong>Meaning:</strong>
            <span>{question.meaning_en}</span>
          </div>
        </div>

        {question.hint_en ? (
          <div style={styles.freeHintText}>{question.hint_en}</div>
        ) : null}

        {question.hint_kanji_items.length > 0 ? (
          <div
            style={{
              ...styles.hintKanjiGrid,
              gridTemplateColumns: columns,
            }}
          >
            {question.hint_kanji_items.map((item) => (
              <div key={item.kanji} style={styles.hintKanjiCard}>
                <div
                  style={{
                    ...styles.hintKanji,
                    fontSize: mobile ? 34 : 48,
                  }}
                >
                  {item.kanji}
                </div>

                <div style={styles.readingTable}>
                  <div style={styles.readingHeaderOn}>音読み / On-yomi</div>
                  <div style={styles.readingHeaderKun}>訓読み / Kun-yomi</div>
                  {renderReadingLines(item.on_yomi || "-", "left")}
                  {renderReadingLines(item.kun_yomi || "-", "right")}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div style={styles.okuriganaNote}>
          Parentheses show okurigana, the hiragana part that is often written
          after the kanji in a word.
        </div>
      </div>
    );
  }

  const correctCount = attempts.filter((a) => a.is_correct).length;
  const wrongCount = attempts.filter((a) => !a.is_correct).length;

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.centerWrap}>
          <div style={styles.loadingCard}>Loading...</div>
        </div>
      </main>
    );
  }

  if (showStartScreen) {
    return (
      <main style={styles.page}>
        <div style={styles.centerWrap}>
          <div style={styles.messageCard}>
            <h2 style={styles.messageTitle}>Ready to study?</h2>
            <p style={styles.messageText}>
              Unit: <strong>{unit}</strong>
            </p>

            <div style={styles.completeButtons}>
              <button
                type="button"
                onClick={handleContinueFromStartScreen}
                style={styles.primaryButton}
              >
                Continue
              </button>

              <button
                type="button"
                onClick={handleStartFromBeginningFromStartScreen}
                style={styles.secondaryButton}
              >
                Start from beginning
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
          <div style={styles.messageCard}>
            <h2 style={styles.messageTitle}>Something went wrong</h2>
            <p style={styles.messageText}>{error}</p>
          </div>
        </div>
      </main>
    );
  }

  if (showComplete) {
    return (
      <main style={styles.page}>
        <div style={styles.centerWrap}>
          <div style={styles.messageCard}>
            <h2 style={styles.messageTitle}>
              {currentMode === "review" ? "Review complete!" : "Set complete!"}
            </h2>
            <p style={styles.messageText}>
              Correct: {correctCount} /{" "}
              {activeQuestions.length || batch?.questions.length || 0}
            </p>
            <p style={styles.messageText}>Wrong: {wrongCount}</p>

            <div style={styles.completeButtons}>
              <button
                type="button"
                onClick={startWrongReview}
                style={styles.primaryButton}
              >
                Review wrong answers
              </button>

              <button
                type="button"
                onClick={handlePracticeMoreReadings}
                style={styles.primaryButton}
              >
                Practice 5 more
              </button>

              <button
                type="button"
                onClick={goHome}
                style={styles.secondaryButton}
              >
                Back to Home
              </button>

              <button
                type="button"
                onClick={startPracticeThisSetAgain}
                style={styles.secondaryButton}
              >
                Practice this set again
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!currentQuestion) {
    return (
      <main style={styles.page}>
        <div style={styles.centerWrap}>
          <div style={styles.messageCard}>
            <h2 style={styles.messageTitle}>No questions available</h2>
            <p style={styles.messageText}>
              Please check your unit or published data.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const promptFontSize = getPromptFontSize(
    currentQuestion.prompt.length,
    deviceMode
  );

  const compactQuestionNumberSize = isDesktop ? 88 : isTablet ? 64 : 52;
  const compactQuestionFont = isDesktop ? 48 : isTablet ? 34 : 26;

  return (
    <main style={styles.page}>
      <div
        style={{
          ...styles.appFrame,
          width: isDesktop
            ? "min(1680px, calc(100vw - 72px))"
            : "min(1000px, calc(100vw - 20px))",
          height: isDesktop ? "calc(100dvh - 48px)" : "auto",
          minHeight: isDesktop ? undefined : "calc(100dvh - 20px)",
        }}
      >
        <div
          style={{
            ...styles.outerBlueEdge,
            inset: isDesktop
              ? "-12px -12px -4px -12px"
              : "-6px -6px -2px -6px",
          }}
        />

        <div
          style={{
            ...styles.windowBar,
            minHeight: isDesktop ? 66 : 58,
            padding: isDesktop ? "7px 30px" : "8px 14px",
          }}
        >
          <div style={{ ...styles.windowDots, gap: isDesktop ? 16 : 10 }}>
            <span
              style={{
                ...styles.dot,
                background: "#9ec1f0",
                width: isDesktop ? 38 : 24,
                height: isDesktop ? 38 : 24,
                borderWidth: isDesktop ? 4 : 3,
              }}
            />
            <span
              style={{
                ...styles.dot,
                background: "#e7ef64",
                width: isDesktop ? 38 : 24,
                height: isDesktop ? 38 : 24,
                borderWidth: isDesktop ? 4 : 3,
              }}
            />
            <span
              style={{
                ...styles.dot,
                background: "#f3a0a6",
                width: isDesktop ? 38 : 24,
                height: isDesktop ? 38 : 24,
                borderWidth: isDesktop ? 4 : 3,
              }}
            />
          </div>

          <div
            style={{
              ...styles.windowTitle,
              fontSize: isDesktop ? 27 : isTablet ? 18 : 15,
              marginLeft: 8,
              flex: 1,
              textAlign: "right",
            }}
          >
            Kanji Reading Quiz
          </div>

          <div ref={menuRef} style={styles.menuWrapInline}>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              style={{
                ...styles.menuButton,
                fontSize: isDesktop ? 15 : 13,
                padding: isDesktop ? "9px 14px" : "7px 10px",
              }}
            >
              ☰
            </button>

            {menuOpen ? (
              <div
                style={{
                  ...styles.menuDropdown,
                  right: 0,
                  minWidth: isDesktop ? 220 : 190,
                }}
              >
                <button
                  type="button"
                  style={styles.menuItem}
                  onClick={handleContinueMenu}
                >
                  Continue
                </button>

                <button
                  type="button"
                  style={styles.menuItem}
                  onClick={handleRestartUnit}
                >
                  Start from beginning
                </button>

                <button
                  type="button"
                  style={styles.menuItem}
                  onClick={goHome}
                >
                  Back to Home
                </button>

                <button
                  type="button"
                  style={{
                    ...styles.menuItem,
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
        </div>

        <div
          style={{
            ...styles.contentOuter,
            padding: isDesktop
              ? "4px 24px 2px"
              : isTablet
              ? "8px 14px 20px"
              : "8px 12px 18px",
            display: "flex",
            flexDirection: "column",
            gap: isDesktop ? 1 : 10,
            minHeight: isDesktop ? "calc(100% - 66px)" : "auto",
          }}
        >
          <div
            style={{
              ...styles.topTitleArea,
              justifyContent: isTablet ? "space-between" : "center",
            }}
          >
            <div style={{ ...styles.sparkle, fontSize: isDesktop ? 38 : 24 }}>
              ✦
            </div>

            <div style={{ textAlign: "center", flex: isTablet ? 1 : undefined }}>
              <div
                style={{
                  ...styles.bigTitle,
                  fontSize: isDesktop
                    ? 44
                    : isTablet
                    ? 32
                    : isSmallPhone
                    ? 24
                    : 28,
                  lineHeight: isDesktop ? 1.03 : 1.06,
                }}
              >
                CAN YOU READ THIS KANJI?
              </div>
              <div
                style={{
                  ...styles.smallTitle,
                  fontSize: isDesktop ? 22 : isTablet ? 18 : 15,
                }}
              >
                〜この漢字、読めるかな？〜
              </div>
            </div>

            {isTablet ? (
              <div style={styles.tabletTopRight}>
                <div
                  style={{
                    ...styles.questionNumber,
                    width: compactQuestionNumberSize,
                    height: compactQuestionNumberSize,
                    fontSize: compactQuestionFont,
                  }}
                >
                  {questionIndex + 1}
                </div>

                <AssetImage
                  src={ASSETS.character}
                  alt="character"
                  fallback={<span style={{ fontSize: 44 }}>🤔</span>}
                  style={{
                    width: 88,
                    height: 88,
                    objectFit: "contain",
                  }}
                />
              </div>
            ) : (
              <div style={{ ...styles.sparkle, fontSize: isDesktop ? 38 : 24 }}>
                ✦
              </div>
            )}
          </div>

          {isDesktop ? (
            <div style={styles.desktopLayout}>
              <div style={styles.desktopLeftButtons}>
                <button
                  type="button"
                  onClick={() => setShowFurigana((prev) => !prev)}
                  style={styles.sideBlueButton}
                >
                  <span style={styles.centeredButtonText}>ふりがなを表示</span>
                  <span style={styles.centeredButtonText}>Show Furigana</span>
                  <span
                    style={{
                      ...styles.sideButtonNote,
                      width: "100%",
                      textAlign: "center",
                    }}
                  >
                    (for Other Kanji)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowEnglish((prev) => !prev)}
                  style={styles.sidePinkButton}
                >
                  <span style={styles.centeredButtonText}>英訳</span>
                  <span style={styles.centeredButtonText}>Show English</span>
                  <span
                    style={{
                      ...styles.sideButtonNote,
                      width: "100%",
                      textAlign: "center",
                    }}
                  >
                    &nbsp;
                  </span>
                </button>
              </div>

              <div style={styles.desktopMain}>
                <div style={styles.desktopTop}>
                  <div style={styles.numberWrapDesktop}>
                    <div
                      style={{
                        ...styles.questionNumber,
                        width: compactQuestionNumberSize,
                        height: compactQuestionNumberSize,
                        fontSize: compactQuestionFont,
                      }}
                    >
                      {questionIndex + 1}
                    </div>
                  </div>

                  <div style={styles.promptWrapDesktop}>
                    <div
                      style={{
                        ...styles.promptCard,
                        minHeight: 164,
                        padding: "8px 18px",
                        transform: "translateX(-56px)",
                        width: "calc(100% + 56px)",
                      }}
                    >
                      <div
                        style={{
                          ...styles.promptText,
                          fontSize: promptFontSize,
                          lineHeight: 1.01,
                          transform: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {renderPrompt(currentQuestion)}
                      </div>
                    </div>

                    <div style={styles.translationRowDesktop}>
                      {showEnglish ? (
                        <div style={styles.translationText}>
                          {currentQuestion.translation_en}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div style={styles.characterWrap}>
                    <AssetImage
                      src={ASSETS.character}
                      alt="character"
                      fallback={<span style={{ fontSize: 120 }}>🤔</span>}
                      style={{
                        width: 320,
                        height: 320,
                        objectFit: "contain",
                        userSelect: "none",
                        pointerEvents: "none",
                      }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    ...styles.desktopBottom,
                    gridTemplateColumns: showHint
                      ? "minmax(0, 1fr) minmax(410px, 0.94fr)"
                      : "minmax(0, 1fr) 304px",
                  }}
                >
                  <div style={styles.inputBlockDesktop}>
                    <div style={styles.inputTitleDesktop}>
                      読みを入力
                      <br />
                      Type in hiragana
                    </div>

                    <div style={styles.inputRowDesktop}>
                      <div style={styles.arrowDesktop}>»»</div>
                      <input
                        ref={inputRef}
                        type="text"
                        value={getCurrentInputValue()}
                        onChange={(e) => setCurrentInputValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleCheckOrNext();
                          }
                        }}
                        disabled={checked || saving}
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        style={styles.answerInputDesktop}
                      />
                    </div>

                    <div style={styles.resultAreaDesktop}>
                      {checked && wasCorrect === true ? (
                        <div style={styles.correctDesktop}>
                          <AssetImage
                            src={ASSETS.correct}
                            alt="correct"
                            fallback={<span style={{ fontSize: 24 }}>👍</span>}
                            style={{
                              width: 126,
                              height: 74,
                              objectFit: "contain",
                            }}
                          />
                          <span style={{ fontSize: 38 }}>正解</span>
                        </div>
                      ) : null}

                      {checked && wasCorrect === false ? (
                        <div style={styles.wrongDesktop}>
                          <div style={styles.wrongBadgeLine}>
                            <AssetImage
                              src={ASSETS.wrong}
                              alt="wrong"
                              fallback={<span style={{ fontSize: 30 }}>☹️</span>}
                              style={{
                                width: 58,
                                height: 58,
                                objectFit: "contain",
                              }}
                            />
                            <div style={styles.wrongBadge}>CORRECT ANSWER</div>
                            <div style={styles.wrongAnswerDesktop}>
                              {currentQuestion.answer_text}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div style={styles.bottomButtonRowDesktop}>
                      <button
                        type="button"
                        onClick={handleCheckOrNext}
                        disabled={saving || !getCurrentInputValue().trim()}
                        style={{
                          ...styles.primaryButton,
                          opacity:
                            saving || !getCurrentInputValue().trim() ? 0.45 : 1,
                          cursor:
                            saving || !getCurrentInputValue().trim()
                              ? "not-allowed"
                              : "pointer",
                        }}
                      >
                        {saving ? "Saving..." : checked ? "Next" : "Check"}
                      </button>

                      <button
                        type="button"
                        onClick={startPracticeThisSetAgain}
                        style={styles.secondaryButton}
                      >
                        Practice this set again
                      </button>
                    </div>
                  </div>

                  <div style={styles.hintBlockDesktop}>
                    {!showHint ? (
                      <div style={styles.hintButtonWrap}>
                        <button
                          type="button"
                          onClick={() => setShowHint(true)}
                          style={styles.hintButton}
                        >
                          <span style={styles.hintMiniText}>ヒントを見る</span>
                          <span style={styles.hintMainText}>Hint</span>
                        </button>

                        <AssetImage
                          src={ASSETS.hand}
                          alt="hand"
                          fallback={<span style={styles.hintHand}>☟</span>}
                          style={{
                            width: 116,
                            height: 116,
                            objectFit: "contain",
                            alignSelf: "center",
                            transform: "translateX(18px)",
                          }}
                        />
                      </div>
                    ) : (
                      <div style={styles.hintPanelWrap}>
                        <AssetImage
                          src={ASSETS.bulb}
                          alt="bulb"
                          fallback={<span style={{ fontSize: 76 }}>💡</span>}
                          style={{
                            ...styles.bulbDesktop,
                            width: 104,
                            height: 104,
                            objectFit: "contain",
                          }}
                        />
                        {renderHintPanel(currentQuestion, false)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={styles.mobileLayout}>
              {!isTablet ? (
                <div
                  style={{
                    ...styles.mobileTopRow,
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      ...styles.questionNumber,
                      width: compactQuestionNumberSize,
                      height: compactQuestionNumberSize,
                      fontSize: compactQuestionFont,
                    }}
                  >
                    {questionIndex + 1}
                  </div>

                  <AssetImage
                    src={ASSETS.character}
                    alt="character"
                    fallback={<span style={{ fontSize: 44 }}>🤔</span>}
                    style={{
                      width: 82,
                      height: 82,
                      objectFit: "contain",
                    }}
                  />
                </div>
              ) : null}

              <div
                style={{
                  ...styles.promptCard,
                  minHeight: isTablet ? 150 : isSmallPhone ? 110 : 126,
                  padding: isTablet
                    ? "14px 18px"
                    : isSmallPhone
                    ? "12px 12px"
                    : "14px 14px",
                }}
              >
                <div
                  style={{
                    ...styles.promptText,
                    fontSize: promptFontSize,
                    lineHeight: 1.12,
                    whiteSpace: "normal",
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                    width: "100%",
                  }}
                >
                  {renderPrompt(currentQuestion)}
                </div>
              </div>

              <div style={styles.translationRowMobile}>
                {showEnglish ? (
                  <div
                    style={{
                      ...styles.translationText,
                      fontSize: isTablet ? 24 : isSmallPhone ? 18 : 20,
                    }}
                  >
                    {currentQuestion.translation_en}
                  </div>
                ) : null}
              </div>

              <div
                style={{
                  ...styles.mobileButtonsRow,
                  gridTemplateColumns: isTablet
                    ? "repeat(2, minmax(0, 260px))"
                    : "1fr 1fr",
                  justifyContent: "center",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowFurigana((prev) => !prev)}
                  style={styles.sideBlueButtonMobile}
                >
                  <span style={styles.centeredButtonText}>ふりがなを表示</span>
                  <span style={styles.centeredButtonText}>Show Furigana</span>
                  <span
                    style={{
                      ...styles.sideButtonNote,
                      width: "100%",
                      textAlign: "center",
                    }}
                  >
                    (for Other Kanji)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowEnglish((prev) => !prev)}
                  style={styles.sidePinkButtonMobile}
                >
                  <span style={styles.centeredButtonText}>英訳</span>
                  <span style={styles.centeredButtonText}>Show English</span>
                  <span
                    style={{
                      ...styles.sideButtonNote,
                      width: "100%",
                      textAlign: "center",
                    }}
                  >
                    &nbsp;
                  </span>
                </button>
              </div>

              <div
                style={{
                  marginTop: isTablet ? 2 : 0,
                }}
              >
                {!showHint ? (
                  <div style={styles.mobileHintBlock}>
                    <button
                      type="button"
                      onClick={() => setShowHint(true)}
                      style={{
                        ...styles.hintButton,
                        width: "100%",
                        minHeight: isTablet ? 84 : 74,
                        boxShadow: isTablet
                          ? "10px 10px 0 #9ec1f0"
                          : "8px 8px 0 #9ec1f0",
                      }}
                    >
                      <span style={styles.hintMiniText}>ヒントを見る</span>
                      <span
                        style={{
                          ...styles.hintMainText,
                          fontSize: isTablet ? 46 : 34,
                        }}
                      >
                        Hint
                      </span>
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: isTablet ? 0 : 2 }}>
                    <div style={styles.mobileBulbRow}>
                      <div style={styles.mobileBulb}>
                        <AssetImage
                          src={ASSETS.bulb}
                          alt="bulb"
                          fallback={<span style={{ fontSize: 56 }}>💡</span>}
                          style={{
                            width: isTablet ? 86 : 68,
                            height: isTablet ? 86 : 68,
                            objectFit: "contain",
                          }}
                        />
                      </div>
                    </div>

                    {renderHintPanel(currentQuestion, true)}
                  </div>
                )}
              </div>

              <div
                style={{
                  ...styles.inputTitleMobile,
                  marginTop: isTablet ? 24 : 18,
                  fontSize: isTablet ? 24 : 20,
                }}
              >
                読みを入力
                <br />
                Type in hiragana
              </div>

              <div
                style={{
                  ...styles.inputRowMobile,
                  gridTemplateColumns: isTablet
                    ? "44px minmax(0, 1fr)"
                    : "40px minmax(0, 1fr)",
                  gap: isTablet ? 10 : 6,
                }}
              >
                <div
                  style={{
                    ...styles.arrowMobile,
                    fontSize: isTablet ? 34 : 28,
                  }}
                >
                  »»
                </div>

                <input
                  ref={inputRef}
                  type="text"
                  value={getCurrentInputValue()}
                  onChange={(e) => setCurrentInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCheckOrNext();
                    }
                  }}
                  disabled={checked || saving}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  style={{
                    ...styles.answerInputMobile,
                    height: isTablet ? 62 : 56,
                    fontSize: isTablet ? 28 : 22,
                  }}
                />
              </div>

              {checked && wasCorrect === true ? (
                <div
                  style={{
                    ...styles.correctMobile,
                    fontSize: isTablet ? 26 : 22,
                  }}
                >
                  <AssetImage
                    src={ASSETS.correct}
                    alt="correct"
                    fallback={<span style={{ fontSize: 28 }}>👍</span>}
                    style={{
                      width: isTablet ? 88 : 74,
                      height: isTablet ? 52 : 44,
                      objectFit: "contain",
                    }}
                  />
                  <span>正解</span>
                </div>
              ) : null}

              {checked && wasCorrect === false ? (
                <div style={styles.wrongMobile}>
                  <div style={styles.wrongBadgeLineMobile}>
                    <AssetImage
                      src={ASSETS.wrong}
                      alt="wrong"
                      fallback={<span style={{ fontSize: 26 }}>☹️</span>}
                      style={{
                        width: isTablet ? 44 : 38,
                        height: isTablet ? 44 : 38,
                        objectFit: "contain",
                      }}
                    />
                    <div style={styles.wrongBadge}>CORRECT ANSWER</div>
                  </div>
                  <div
                    style={{
                      ...styles.wrongAnswerMobile,
                      fontSize: isTablet ? 28 : 24,
                    }}
                  >
                    {currentQuestion.answer_text}
                  </div>
                </div>
              ) : null}

              <div
                style={{
                  ...styles.bottomButtonRowMobile,
                  marginTop: isTablet ? 14 : 12,
                }}
              >
                <button
                  type="button"
                  onClick={handleCheckOrNext}
                  disabled={saving || !getCurrentInputValue().trim()}
                  style={{
                    ...styles.primaryButton,
                    width: "100%",
                    opacity:
                      saving || !getCurrentInputValue().trim() ? 0.45 : 1,
                    cursor:
                      saving || !getCurrentInputValue().trim()
                        ? "not-allowed"
                        : "pointer",
                    fontSize: isTablet ? 20 : 16,
                    padding: isTablet ? "12px 18px" : "10px 14px",
                  }}
                >
                  {saving ? "Saving..." : checked ? "Next" : "Check"}
                </button>

                <button
                  type="button"
                  onClick={startPracticeThisSetAgain}
                  style={{
                    ...styles.secondaryButton,
                    width: "100%",
                    fontSize: isTablet ? 20 : 16,
                    padding: isTablet ? "12px 18px" : "10px 14px",
                  }}
                >
                  Practice this set again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function KanjiReadingQuizPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}>
      <KanjiReadingQuizInner />
    </Suspense>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh",
    background:
      "repeating-linear-gradient(90deg, #98b9e5 0, #98b9e5 56px, #a8c4ea 56px, #a8c4ea 60px), repeating-linear-gradient(0deg, rgba(255,255,255,0.22) 0, rgba(255,255,255,0.22) 56px, transparent 56px, transparent 60px)",
    overflowX: "hidden",
    overflowY: "auto",
    color: "#111",
    fontFamily:
      'Arial Rounded MT Bold, Arial, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif',
    paddingBottom: 18,
  },
  centerWrap: {
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  loadingCard: {
    background: "#fff",
    border: "4px solid #111",
    borderRadius: 24,
    padding: "22px 28px",
    fontSize: 24,
    fontWeight: 900,
  },
  messageCard: {
    background: "#f7f7f7",
    border: "4px solid #111",
    borderRadius: 28,
    padding: "28px 22px",
    width: "min(720px, 92vw)",
    textAlign: "center",
  },
  messageTitle: {
    margin: 0,
    fontSize: 32,
    fontWeight: 900,
  },
  messageText: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1.5,
  },
  completeButtons: {
    display: "flex",
    gap: 12,
    justifyContent: "center",
    flexWrap: "wrap",
    marginTop: 20,
  },
  appFrame: {
    margin: "10px auto 6px",
    background: "#efefef",
    border: "4px solid #111",
    borderRadius: 28,
    position: "relative",
    boxShadow: "0 1px 0 rgba(0,0,0,0.08)",
    overflow: "visible",
  },
  outerBlueEdge: {
    position: "absolute",
    border: "6px solid #7ea6da",
    borderRadius: 34,
    pointerEvents: "none",
  },
  windowBar: {
    background: "#7fe1b3",
    borderBottom: "4px solid #111",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    position: "relative",
    zIndex: 200,
    gap: 10,
  },
  windowDots: {
    display: "flex",
    alignItems: "center",
  },
  dot: {
    borderRadius: "50%",
    border: "4px solid #111",
    display: "inline-block",
    flexShrink: 0,
  },
  windowTitle: {
    fontWeight: 900,
    color: "#244988",
    letterSpacing: 0.5,
    lineHeight: 1.05,
  },
  menuWrapInline: {
    position: "relative",
    flexShrink: 0,
    zIndex: 300,
  },
  menuButton: {
    border: "3px solid #111",
    borderRadius: 999,
    background: "#fff",
    color: "#111",
    fontWeight: 900,
    cursor: "pointer",
    lineHeight: 1,
  },
  menuDropdown: {
    position: "absolute",
    top: "calc(100% + 8px)",
    background: "#fff",
    borderRadius: 18,
    boxShadow: "0 16px 34px rgba(0,0,0,0.24)",
    overflow: "hidden",
    zIndex: 9999,
    pointerEvents: "auto",
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
    padding: "12px 14px",
    fontSize: 14,
  },
  contentOuter: {
    position: "relative",
    zIndex: 1,
  },
  topTitleArea: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  tabletTopRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  sparkle: {
    color: "#8fb4ea",
    fontWeight: 900,
    lineHeight: 1,
  },
  bigTitle: {
    fontWeight: 900,
    color: "#8cb4ee",
    textShadow:
      "-2px 0 #244988, 0 2px #244988, 2px 0 #244988, 0 -2px #244988",
    letterSpacing: 1,
  },
  smallTitle: {
    fontWeight: 900,
    marginTop: 2,
    lineHeight: 1.06,
  },
  desktopLayout: {
    display: "grid",
    gridTemplateColumns: "150px minmax(0, 1fr)",
    gap: 18,
    height: "100%",
    alignItems: "stretch",
  },
  desktopLeftButtons: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    justifyContent: "center",
    paddingTop: 58,
  },
  desktopMain: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  desktopTop: {
    display: "grid",
    gridTemplateColumns: "84px minmax(0, 1fr) 138px",
    gap: 12,
    alignItems: "start",
  },
  numberWrapDesktop: {
    display: "flex",
    justifyContent: "flex-start",
    paddingTop: 18,
    transform: "translateX(-68px)",
  },
  promptWrapDesktop: {
    minWidth: 0,
  },
  translationRowDesktop: {
    minHeight: 54,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
    width: "calc(100% + 56px)",
    transform: "translateX(-56px)",
    marginLeft: "auto",
    marginRight: "auto",
  },
  desktopBottom: {
    display: "grid",
    gap: 10,
    alignItems: "start",
    flex: 1,
    minHeight: 0,
    marginTop: 0,
  },
  inputBlockDesktop: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    paddingTop: "0px",
    transform: "translateY(-8px)",
  },
  hintBlockDesktop: {
    minWidth: 0,
    display: "flex",
    alignItems: "flex-start",
    paddingTop: "0px",
  },
  mobileLayout: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  mobileTopRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
  },
  mobileButtonsRow: {
    display: "grid",
    gap: 10,
  },
  translationRowMobile: {
    minHeight: 26,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  centeredButtonText: {
    width: "100%",
    textAlign: "center",
  },
  sideBlueButton: {
    border: "4px solid #111",
    borderRadius: 999,
    background: "#4d97d4",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    padding: "10px 10px",
    boxShadow: "0 5px 0 rgba(0,0,0,0.15)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontSize: 14,
    lineHeight: 1.08,
    minHeight: 76,
    justifyContent: "center",
  },
  sidePinkButton: {
    border: "4px solid #111",
    borderRadius: 999,
    background: "#cf6da2",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    padding: "10px 10px",
    boxShadow: "0 5px 0 rgba(0,0,0,0.15)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontSize: 14,
    lineHeight: 1.08,
    minHeight: 76,
    justifyContent: "center",
  },
  sideBlueButtonMobile: {
    border: "4px solid #111",
    borderRadius: 999,
    background: "#4d97d4",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    padding: "8px 8px",
    boxShadow: "0 5px 0 rgba(0,0,0,0.15)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontSize: 13,
    lineHeight: 1.08,
    minHeight: 72,
    justifyContent: "center",
  },
  sidePinkButtonMobile: {
    border: "4px solid #111",
    borderRadius: 999,
    background: "#cf6da2",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    padding: "8px 8px",
    boxShadow: "0 5px 0 rgba(0,0,0,0.15)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontSize: 13,
    lineHeight: 1.08,
    minHeight: 72,
    justifyContent: "center",
  },
  sideButtonNote: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: 800,
    lineHeight: 1.05,
    opacity: 0.95,
  },
  questionNumber: {
    borderRadius: "50%",
    background: "#f2a0a7",
    color: "#fff",
    fontWeight: 900,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  promptCard: {
    border: "4px solid #111",
    borderRadius: 28,
    background: "#ddef57",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    overflow: "hidden",
    width: "100%",
  },
  promptText: {
    fontWeight: 900,
    color: "#244988",
    letterSpacing: 0.1,
  },
  rubyWord: {
    position: "relative",
    display: "inline-block",
    paddingTop: "0.32em",
    lineHeight: 1,
  },
  rubyText: {
    position: "absolute",
    left: "50%",
    top: "-0.08em",
    transform: "translateX(-50%)",
    fontSize: "0.24em",
    fontWeight: 900,
    color: "#244988",
    lineHeight: 1,
    whiteSpace: "nowrap",
    pointerEvents: "none",
  },
  targetWrap: {
    position: "relative",
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    paddingBottom: 10,
    margin: "0 2px",
  },
  targetUnderline: {
    position: "absolute",
    left: "8%",
    right: "8%",
    bottom: -2,
    height: 10,
    background: "#38a0d8",
    borderRadius: 999,
  },
  translationText: {
    textAlign: "center",
    fontWeight: 900,
    lineHeight: 1.15,
    width: "100%",
    marginLeft: "auto",
    marginRight: "auto",
  },
  characterWrap: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 0,
    transform: "translateX(10px)",
  },
  inputTitleDesktop: {
    fontWeight: 900,
    textAlign: "center",
    lineHeight: 1.04,
    fontSize: 21,
    marginBottom: 8,
    marginTop: 0,
  },
  inputTitleMobile: {
    fontWeight: 900,
    textAlign: "center",
    lineHeight: 1.08,
  },
  inputRowDesktop: {
    display: "grid",
    gridTemplateColumns: "70px minmax(0, 1fr)",
    gap: 12,
    alignItems: "center",
  },
  inputRowMobile: {
    display: "grid",
    alignItems: "center",
  },
  arrowDesktop: {
    fontSize: 52,
    fontWeight: 900,
    lineHeight: 1,
    textAlign: "center",
  },
  arrowMobile: {
    fontWeight: 900,
    lineHeight: 1,
    textAlign: "center",
  },
  answerInputDesktop: {
    width: "100%",
    height: 72,
    border: "8px solid #111",
    borderRadius: 22,
    background: "#fff",
    padding: "0 18px",
    outline: "none",
    fontWeight: 900,
    fontSize: 34,
    color: "#111",
    boxSizing: "border-box",
  },
  answerInputMobile: {
    width: "100%",
    border: "6px solid #111",
    borderRadius: 20,
    background: "#fff",
    padding: "0 14px",
    outline: "none",
    fontWeight: 900,
    color: "#111",
    boxSizing: "border-box",
  },
  resultAreaDesktop: {
    minHeight: 54,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  correctDesktop: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontWeight: 900,
  },
  wrongDesktop: {
    textAlign: "center",
  },
  wrongBadgeLine: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  wrongBadgeLineMobile: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 6,
    flexWrap: "wrap",
  },
  wrongAnswerDesktop: {
    color: "#e50000",
    fontWeight: 900,
    fontSize: 38,
    lineHeight: 1.05,
  },
  correctMobile: {
    marginTop: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    fontWeight: 900,
  },
  wrongMobile: {
    marginTop: 10,
    textAlign: "center",
  },
  wrongAnswerMobile: {
    marginTop: 4,
    color: "#e50000",
    fontWeight: 900,
    lineHeight: 1.05,
  },
  wrongBadge: {
    display: "inline-block",
    background: "#20b3a8",
    color: "#111",
    padding: "7px 10px",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 900,
  },
  hintButtonWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "flex-start",
    width: "100%",
    gap: 8,
    transform: "translateY(-14px)",
  },
  mobileHintBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  hintButton: {
    border: "none",
    borderRadius: 28,
    background: "#f2a0a0",
    color: "#111",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "12px 12px 0 #9ec1f0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 78,
    padding: "8px 16px",
    flex: 1,
  },
  hintMiniText: {
    fontSize: 16,
    lineHeight: 1.05,
    fontWeight: 900,
  },
  hintMainText: {
    fontWeight: 900,
    lineHeight: 1,
    fontSize: 44,
    textShadow: "0.5px 0 #111, -0.5px 0 #111",
  },
  hintHand: {
    fontSize: 48,
    color: "#9ec1f0",
    lineHeight: 1,
  },
  hintPanelWrap: {
    position: "relative",
    paddingTop: 18,
    width: "100%",
    transform: "translateY(-14px)",
  },
  bulbDesktop: {
    position: "absolute",
    top: -20,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 2,
  },
  mobileBulbRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 2,
  },
  mobileBulb: {
    textAlign: "center",
    lineHeight: 1,
    position: "relative",
    zIndex: 2,
    display: "flex",
    justifyContent: "center",
  },
  hintPanel: {
    position: "relative",
    border: "6px solid #111",
    borderRadius: 18,
    background: "#fff",
    minHeight: 150,
  },
  hintTopBox: {
    background: "#90f0c9",
    padding: "8px 10px 6px",
    marginTop: 10,
  },
  hintTopLine: {
    display: "grid",
    gridTemplateColumns: "86px minmax(0, 1fr)",
    gap: 8,
    fontWeight: 700,
    fontSize: 13,
    marginBottom: 3,
    alignItems: "start",
  },
  freeHintText: {
    marginTop: 5,
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.28,
  },
  hintKanjiGrid: {
    display: "grid",
    gap: 6,
    marginTop: 6,
  },
  hintKanjiCard: {
    textAlign: "center",
    padding: "2px",
  },
  hintKanji: {
    fontWeight: 900,
    lineHeight: 1,
  },
  readingTable: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    border: "2px solid #111",
    borderRadius: 10,
    overflow: "hidden",
    marginTop: 4,
  },
  readingHeaderOn: {
    background: "#f48e8e",
    padding: "6px 5px",
    fontSize: 11,
    fontWeight: 900,
    lineHeight: 1.15,
    borderRight: "2px solid #111",
  },
  readingHeaderKun: {
    background: "#90b7e9",
    padding: "6px 5px",
    fontSize: 11,
    fontWeight: 900,
    lineHeight: 1.15,
  },
  readingCellLeft: {
    padding: "6px 5px",
    fontSize: 13,
    fontWeight: 900,
    borderTop: "2px solid #111",
    borderRight: "2px solid #111",
    whiteSpace: "normal",
    wordBreak: "keep-all",
  },
  readingCellRight: {
    padding: "6px 5px",
    fontSize: 13,
    fontWeight: 900,
    borderTop: "2px solid #111",
    whiteSpace: "normal",
    wordBreak: "keep-all",
  },
  readingLine: {
    lineHeight: 1.18,
    marginBottom: 1,
  },
  okuriganaNote: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 1.4,
    fontWeight: 700,
    color: "#333",
  },
  bottomButtonRowDesktop: {
    display: "flex",
    gap: 10,
    justifyContent: "center",
    flexWrap: "wrap",
    marginTop: 6,
  },
  bottomButtonRowMobile: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  primaryButton: {
    border: "none",
    borderRadius: 999,
    background: "#111",
    color: "#fff",
    padding: "12px 22px",
    fontSize: 17,
    fontWeight: 900,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "none",
    borderRadius: 999,
    background: "#dcdcdc",
    color: "#111",
    padding: "12px 22px",
    fontSize: 17,
    fontWeight: 900,
    cursor: "pointer",
  },
};