"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { judgeKanjiWritingAnswer } from "@/lib/kanjiWritingAnswerJudge";

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

type WritingQuestion = {
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

type SetOverviewStatus = "done" | "not_started";

type SetOverviewItem = {
  setNumber: number;
  startOrder: number;
  endOrder: number;
  status: SetOverviewStatus;
  isToday: boolean;
};

type SetOverview = {
  setSize: number;
  totalQuestionCount: number;
  totalSetCount: number;
  completedSetCount: number;
  todaySetNumber: number | null;
  sets: SetOverviewItem[];
};

type BatchResponse = {
  account: {
    display_name: string | null;
    student_login_id: string;
  };
  unit: string;
  difficulty_tier: string;
  mode: "normal" | "practice-set";
  setNumber?: number | null;
  startOrder?: number | null;
  endOrder?: number | null;
  lastOrderCompleted: number;
  completedQuestionCount?: number;
  finished: boolean;
  isUnitComplete?: boolean;
  hasAdvancedAvailable?: boolean;
  setOverview?: SetOverview;
  questions: WritingQuestion[];
  error?: string;
};

type SaveProgressResponse = {
  ok: boolean;
  isUnitComplete?: boolean;
  lastOrderCompleted?: number;
  completedQuestionCount?: number;
  error?: string;
};

type AttemptRow = {
  question_id: string | number | null;
  unit: string | null;
  order_in_unit: number;
  kanji_order_in_unit?: number | null;
  reading_variant_order?: number | null;
  prompt: string;
  target_text: string;
  answer_text: string;
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
  mode: "desktop" | "tablet" | "phone" | "small-phone",
) {
  if (mode === "small-phone") {
    if (promptLength <= 8) return 32;
    if (promptLength <= 12) return 28;
    if (promptLength <= 16) return 24;
    if (promptLength <= 22) return 21;
    if (promptLength <= 30) return 18;
    return 16;
  }

  if (mode === "phone") {
    if (promptLength <= 8) return 38;
    if (promptLength <= 12) return 32;
    if (promptLength <= 16) return 28;
    if (promptLength <= 22) return 24;
    if (promptLength <= 30) return 20;
    return 17;
  }

  if (mode === "tablet") {
    if (promptLength <= 8) return 52;
    if (promptLength <= 12) return 46;
    if (promptLength <= 16) return 38;
    if (promptLength <= 22) return 31;
    if (promptLength <= 30) return 26;
    return 22;
  }

  if (promptLength <= 8) return 72;
  if (promptLength <= 12) return 64;
  if (promptLength <= 16) return 54;
  if (promptLength <= 22) return 40;
  if (promptLength <= 30) return 32;
  if (promptLength <= 44) return 26;
  return 22;
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

function getUnitDisplayLabel(unit: string) {
  const match = unit.match(/^grade(\d+)-kanji-(\d+)$/);

  if (!match) return unit;

  return `Level ${match[1]} / Unit ${match[2]}`;
}

function getUnitListHref(unit: string) {
  const match = unit.match(/^grade(\d+)-kanji-/);
  const level = match?.[1];

  if (!level) return "/student-home/writing";

  return `/student-home/writing/level/${level}`;
}

function getSetStatusText(item: SetOverviewItem) {
  if (item.status === "done") return "Done";
  if (item.isToday) return "Today";
  return "Available";
}

function KanjiWritingQuizInner() {
  const searchParams = useSearchParams();
  const unit = (searchParams.get("unit") ?? "").trim();
  const difficultyTier = (searchParams.get("tier") ?? "normal").trim();
  const rawMode = (searchParams.get("mode") ?? "normal").trim();
  const startOrderParam = (searchParams.get("startOrder") ?? "").trim();
  const endOrderParam = (searchParams.get("endOrder") ?? "").trim();
  const setNumberParam = (searchParams.get("setNumber") ?? "").trim();

  const initialMode: "normal" | "practice-set" =
    rawMode === "practice-set" ? "practice-set" : "normal";

  const startOrder = startOrderParam ? Number(startOrderParam) : null;
  const endOrder = endOrderParam ? Number(endOrderParam) : null;
  const setNumber = setNumberParam ? Number(setNumberParam) : null;

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

  const [showEnglish, setShowEnglish] = useState(false);

  const [checked, setChecked] = useState(false);
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);
  const [showComplete, setShowComplete] = useState(false);
  const [unitComplete, setUnitComplete] = useState(false);

  const [currentMode, setCurrentMode] = useState<"normal" | "practice-set">(
    initialMode,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [showUnitStartScreen, setShowUnitStartScreen] = useState(false);
  const [startScreenProgress, setStartScreenProgress] = useState(0);
  const [startScreenHasAdvanced, setStartScreenHasAdvanced] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  function focusInputSoon() {
    if (!isDesktop && !isTablet) return;

    setTimeout(() => {
      inputRef.current?.focus();
    }, 80);
  }

  async function loadBatch(
    mode: "normal" | "practice-set",
    options?: {
      setNumber?: number | null;
      startOrder?: number | null;
      endOrder?: number | null;
      startFromBeginning?: boolean;
    },
  ) {
    if (!unit) {
      setError("unit is required in the URL.");
      setLoading(false);
      return;
    }

    setCurrentMode(mode);
    setShowUnitStartScreen(false);
    setLoading(true);
    setError("");
    setQuestionIndex(0);
    setAnswers([]);
    setAttempts([]);
    setChecked(false);
    setWasCorrect(null);
    setShowComplete(false);
    setUnitComplete(false);
    setShowEnglish(false);
    setMenuOpen(false);

    const params = new URLSearchParams();
    params.set("unit", unit);
    params.set("tier", difficultyTier);
    params.set("mode", mode);

    if (mode === "practice-set") {
      const nextSetNumber = options?.setNumber ?? setNumber;
      const nextStart = options?.startOrder ?? startOrder;
      const nextEnd = options?.endOrder ?? endOrder;

      if (nextSetNumber != null) params.set("setNumber", String(nextSetNumber));
      if (nextStart != null) params.set("startOrder", String(nextStart));
      if (nextEnd != null) params.set("endOrder", String(nextEnd));
    }

    if (mode === "normal" && options?.startFromBeginning) {
      params.set("startFromBeginning", "1");
    }

    const res = await fetch(`/api/kanji-writing-quiz?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });

    if (res.status === 401) {
      window.location.href = "/student-login";
      return;
    }

    const data = (await res.json()) as BatchResponse;

    if (!res.ok) {
      setError(data.error ?? "Failed to load quiz.");
      setBatch(null);
      setLoading(false);
      return;
    }

    setBatch(data);
    setLoading(false);

    focusInputSoon();
  }

  useEffect(() => {
    async function init() {
      if (!unit) {
        setError("unit is required in the URL.");
        setLoading(false);
        return;
      }

      if (initialMode === "practice-set") {
        await loadBatch("practice-set", {
          setNumber,
          startOrder,
          endOrder,
        });
        return;
      }

      setLoading(true);
      setError("");
      setUnitComplete(false);

      const params = new URLSearchParams();
      params.set("unit", unit);
      params.set("tier", difficultyTier);
      params.set("mode", "normal");

      const res = await fetch(`/api/kanji-writing-quiz?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });

      if (res.status === 401) {
        window.location.href = "/student-login";
        return;
      }

      const data = (await res.json()) as BatchResponse;

      if (!res.ok) {
        setError(data.error ?? "Failed to load quiz.");
        setBatch(null);
        setLoading(false);
        return;
      }

      setBatch(data);
      setStartScreenProgress(data.completedQuestionCount ?? data.lastOrderCompleted ?? 0);
      setStartScreenHasAdvanced(data.hasAdvancedAvailable === true);
      setShowUnitStartScreen(true);
      setLoading(false);
    }

    init();
  }, [unit, difficultyTier, initialMode, startOrderParam, endOrderParam, setNumberParam]);

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

  const activeQuestions = batch?.questions ?? [];

  const currentQuestion = useMemo(() => {
    if (activeQuestions.length === 0) return null;
    return activeQuestions[questionIndex] ?? null;
  }, [activeQuestions, questionIndex]);

  useEffect(() => {
    if (!currentQuestion) return;
    setShowEnglish(false);
    setChecked(false);
    setWasCorrect(null);

    focusInputSoon();
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

  function isAnswerCorrect(question: WritingQuestion, rawInput: string) {
    return judgeKanjiWritingAnswer({
      userAnswer: rawInput,
      targetText: question.target_text,
    });
  }

  function renderWritingPrompt(question: WritingQuestion) {
    const prompt = question.prompt;
    const target = question.target_text;
    const hiragana = question.answer_text;

    if (!target || !prompt.includes(target)) {
      return <span>{prompt}</span>;
    }

    const firstIndex = prompt.indexOf(target);
    const before = prompt.slice(0, firstIndex);
    const after = prompt.slice(firstIndex + target.length);

    return (
      <>
        <span>{before}</span>
        <span
          style={
            checked
              ? { ...styles.targetWrap, ...styles.targetWrapChecked }
              : styles.targetWrap
          }
        >
          <span>{checked ? target : `（${hiragana}）`}</span>
          <span style={styles.targetUnderline} />
        </span>
        <span>{after}</span>
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
          answer_text: currentQuestion.answer_text,
          user_answer: value,
          correct_answer: currentQuestion.target_text,
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

    saveProgress();
  }

  async function saveProgress() {
    if (!batch) return;

    setSaving(true);
    setError("");

    const res = await fetch("/api/kanji-writing-quiz", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        unit: batch.unit,
        difficulty_tier: batch.difficulty_tier,
        mode: batch.mode,
        setNumber: batch.setNumber ?? null,
        advanceCount: batch.mode === "normal" ? batch.questions.length : 0,
        baseLastOrderCompleted: batch.lastOrderCompleted ?? 0,
        attempts,
      }),
    });

    if (res.status === 401) {
      window.location.href = "/student-login";
      return;
    }

    const data = (await res.json()) as SaveProgressResponse;

    if (!res.ok) {
      setError(data.error ?? "Failed to save progress.");
      setSaving(false);
      return;
    }

    const nextUnitComplete = data.isUnitComplete === true;

    setUnitComplete(nextUnitComplete);

    setBatch((prev) => {
      if (!prev) return prev;

      return {
        ...prev,
        lastOrderCompleted:
          typeof data.lastOrderCompleted === "number"
            ? data.lastOrderCompleted
            : prev.lastOrderCompleted,
        completedQuestionCount:
          typeof data.completedQuestionCount === "number"
            ? data.completedQuestionCount
            : prev.completedQuestionCount,
        isUnitComplete: nextUnitComplete,
        finished: nextUnitComplete ? true : prev.finished,
      };
    });

    setSaving(false);
    setShowComplete(true);
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

  async function handleStudyNextFiveKanji() {
    setMenuOpen(false);
    await loadBatch("normal");
  }

  function handlePracticeThisSetAgain() {
    setShowComplete(false);
    setUnitComplete(false);
    setCurrentMode(batch?.mode === "practice-set" ? "practice-set" : "normal");
    setQuestionIndex(0);
    setAnswers([]);
    setAttempts([]);
    setChecked(false);
    setWasCorrect(null);
    setShowEnglish(false);
    setMenuOpen(false);

    focusInputSoon();
  }

  async function loadStartScreenBatch() {
    if (!unit) return;

    setLoading(true);
    setError("");
    setShowComplete(false);
    setUnitComplete(false);
    setQuestionIndex(0);
    setAnswers([]);
    setAttempts([]);
    setChecked(false);
    setWasCorrect(null);
    setShowEnglish(false);
    setMenuOpen(false);

    const params = new URLSearchParams();
    params.set("unit", unit);
    params.set("tier", difficultyTier);
    params.set("mode", "normal");


    const res = await fetch(`/api/kanji-writing-quiz?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });

    if (res.status === 401) {
      window.location.href = "/student-login";
      return;
    }

    const data = (await res.json()) as BatchResponse;

    if (!res.ok) {
      setError(data.error ?? "Failed to load quiz.");
      setBatch(null);
      setLoading(false);
      return;
    }

    setBatch(data);
    setStartScreenProgress(data.completedQuestionCount ?? data.lastOrderCompleted ?? 0);
    setStartScreenHasAdvanced(data.hasAdvancedAvailable === true);
    setCurrentMode("normal");
    setShowUnitStartScreen(true);
    setLoading(false);
  }

  async function handleContinueFromStartScreen() {
    if (batch?.questions?.length) {
      setCurrentMode("normal");
      setShowUnitStartScreen(false);
      focusInputSoon();
      return;
    }

    await loadBatch("normal");
  }

  async function handleBackToUnitMap() {
    await loadStartScreenBatch();
  }

  function handleBackToUnitList() {
    window.location.href = getUnitListHref(unit);
  }

  async function handlePracticeSetFromMap(item: SetOverviewItem) {
    await loadBatch("practice-set", {
      setNumber: item.setNumber,
      startOrder: item.startOrder,
      endOrder: item.endOrder,
    });
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    if (event.repeat) return;
    if (event.defaultPrevented) return;
    if (event.nativeEvent.isComposing) return;
    if ((event.nativeEvent as any).keyCode === 229) return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (loading || saving || showComplete || showUnitStartScreen) return;
    if (!currentQuestion) return;

    const value = getCurrentInputValue();
    if (!checked && !value.trim()) return;

    event.preventDefault();
    handleCheckOrNext();
  }

  const correctCount = attempts.filter((item) => item.is_correct).length;
  const answeredCount = attempts.length;
  const progressText =
    activeQuestions.length > 0
      ? `${questionIndex + 1} / ${activeQuestions.length}`
      : "0 / 0";

  const promptLength = currentQuestion
    ? currentQuestion.prompt.length + currentQuestion.answer_text.length
    : 0;

  const promptFontSize = getPromptFontSize(promptLength, deviceMode);

  const shouldShowResult = checked && currentQuestion;
  const handwritingMessageJa =
    "手書き入力で挑戦してみよう♪ スマホやタブレットの「日本語手書き」入力を使って挑戦してみてね";
  const handwritingMessageEn =
    "Try handwriting input! Use Japanese handwriting input on your phone or tablet and give it a try.";

  if (loading) {
    return (
      <main style={styles.page}>
        <section style={styles.loadingCard}>
          <p style={styles.loadingEmoji}>✏️</p>
          <p style={styles.loadingText}>Loading kanji writing quiz...</p>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main style={styles.page}>
        <section style={styles.loadingCard}>
          <p style={styles.loadingEmoji}>⚠️</p>
          <h1 style={styles.errorTitle}>Quiz could not be loaded</h1>
          <p style={styles.errorText}>{error}</p>
          <button type="button" onClick={goHome} style={styles.secondaryButton}>
            Back to Home
          </button>
        </section>
      </main>
    );
  }

  if (showUnitStartScreen && batch) {
    const setOverview = batch.setOverview;

    return (
      <main style={styles.page}>
        <section style={styles.startCard}>
          <p style={styles.kicker}>Kanji Writing Quiz</p>
          <h1 style={styles.startTitle}>{getUnitDisplayLabel(batch.unit)}</h1>
          <p style={styles.startSubtitle}>
            Look at the hiragana and type the correct kanji.
          </p>

          <div style={styles.handwritingBox}>
            <p style={styles.handwritingTitle}>手書き入力で挑戦してみよう♪</p>
            <p style={styles.handwritingText}>
              スマホやタブレットの「日本語手書き」入力を使って挑戦してみてね
            </p>
            <p style={styles.handwritingTextEn}>{handwritingMessageEn}</p>
          </div>

          <div style={styles.startInfoGrid}>
            <div style={styles.startInfoCard}>
              <span style={styles.startInfoLabel}>Progress</span>
              <strong style={styles.startInfoValue}>{startScreenProgress}</strong>
              <span style={styles.startInfoSmall}>questions completed</span>
            </div>

            <div style={styles.startInfoCard}>
              <span style={styles.startInfoLabel}>Difficulty</span>
              <strong style={styles.startInfoValue}>
                {difficultyTier === "high_level" ? "Challenge" : "Normal"}
              </strong>
              <span style={styles.startInfoSmall}>
                {difficultyTier === "high_level" ? "高度" : "ふつう"}
              </span>
            </div>
          </div>

          <div style={styles.startButtonGrid}>
            <button
              type="button"
              onClick={handleContinueFromStartScreen}
              style={styles.primaryButton}
              disabled={!batch.questions.length && batch.finished}
            >
              Continue
              <span style={styles.buttonTiny}>続きから始める</span>
            </button>
          </div>

          {setOverview ? (
            <section style={styles.setMapSection}>
              <div style={styles.setMapHeader}>
                <div>
                  <p style={styles.setMapLabel}>Set Map</p>
                  <h2 style={styles.setMapTitle}>5問ずつ練習</h2>
                </div>
                <span style={styles.setMapBadge}>
                  {setOverview.completedSetCount} / {setOverview.totalSetCount}
                </span>
              </div>

              <div style={styles.colorGuideBox}>
                <p style={styles.colorGuideTitle}>色の見方 / Color guide</p>
                <div style={styles.colorGuideList}>
                  <span style={styles.colorGuideItem}>
                    <span style={{ ...styles.colorDot, ...styles.colorDotDone }} />
                    完了 / Done
                  </span>
                  <span style={styles.colorGuideItem}>
                    <span style={{ ...styles.colorDot, ...styles.colorDotToday }} />
                    今日の位置 / Today
                  </span>
                  <span style={styles.colorGuideItem}>
                    <span style={{ ...styles.colorDot, ...styles.colorDotAvailable }} />
                    いつでも練習できます / Available
                  </span>
                </div>
                <p style={styles.colorGuideNote}>
                  好きなSetから練習できます。グレー表示は使いません。
                </p>
              </div>

              <div style={styles.setGrid}>
                {setOverview.sets.map((item) => (
                  <button
                    key={item.setNumber}
                    type="button"
                    onClick={() => handlePracticeSetFromMap(item)}
                    style={{
                      ...styles.setButton,
                      ...(item.status === "done" ? styles.setButtonDone : {}),
                      ...(item.isToday ? styles.setButtonToday : {}),
                    }}
                  >
                    <span style={styles.setNumber}>Set {item.setNumber}</span>
                    <span style={styles.setRange}>
                      {item.startOrder}-{item.endOrder}
                    </span>
                    <span style={styles.setStatus}>{getSetStatusText(item)}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <div style={styles.startFooterNav}>
            <button type="button" onClick={goHome} style={styles.textButton}>
              Back to Home
            </button>

            <button
              type="button"
              onClick={handleBackToUnitList}
              style={styles.textButton}
            >
              Back to Unit Menu
            </button>

            {difficultyTier !== "high_level" && startScreenHasAdvanced ? (
              <a
                href={`/kanji-writing-quiz?unit=${encodeURIComponent(
                  unit,
                )}&tier=high_level`}
                style={styles.textLink}
              >
                Challenge / 高度な漢字入力クイズへ
              </a>
            ) : null}
          </div>
        </section>
      </main>
    );
  }

  if (showComplete && batch) {
    const accuracy =
      answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

    return (
      <main style={styles.page}>
        <section style={styles.completeCard}>
          <p style={styles.completeEmoji}>🎉</p>
          <h1 style={styles.completeTitle}>
            {unitComplete ? "Unit Complete!" : "Good job!"}
          </h1>
          <p style={styles.completeText}>
            {correctCount} / {answeredCount} correct ・ {accuracy}%
          </p>

          {unitComplete ? (
            <p style={styles.completeSubText}>
              このUnitの漢字入力クイズが終わりました。
            </p>
          ) : (
            <p style={styles.completeSubText}>次の5問に進めます。</p>
          )}

          <div style={styles.completeButtonGrid}>
            <button
              type="button"
              onClick={handleBackToUnitMap}
              style={styles.secondaryButton}
            >
              Back to Set Map
            </button>

            {!unitComplete ? (
              <button
                type="button"
                onClick={handleStudyNextFiveKanji}
                style={styles.primaryButton}
              >
                Next 5 questions
              </button>
            ) : null}

            <button
              type="button"
              onClick={handlePracticeThisSetAgain}
              style={styles.secondaryButton}
            >
              Practice again
            </button>
          </div>

          {unitComplete &&
          difficultyTier !== "high_level" &&
          batch.hasAdvancedAvailable ? (
            <a
              href={`/kanji-writing-quiz?unit=${encodeURIComponent(
                unit,
              )}&tier=high_level`}
              style={styles.challengeLink}
            >
              Challenge / 高度な漢字入力クイズへ
            </a>
          ) : null}
        </section>
      </main>
    );
  }

  if (!currentQuestion || !batch) {
    return (
      <main style={styles.page}>
        <section style={styles.loadingCard}>
          <p style={styles.loadingEmoji}>🌱</p>
          <h1 style={styles.errorTitle}>No quiz is available</h1>
          <p style={styles.errorText}>There are no questions for this unit yet.</p>
          <button type="button" onClick={goHome} style={styles.secondaryButton}>
            Back to Home
          </button>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.quizShell}>
        <header style={styles.quizHeader}>
          <div>
            <p style={styles.kicker}>Kanji Writing Quiz</p>
            <h1 style={styles.quizTitle}>{getUnitDisplayLabel(batch.unit)}</h1>
            <p style={styles.quizSubTitle}>
              {difficultyTier === "high_level" ? "Challenge" : "Normal"} ・{" "}
              {batch.mode === "practice-set" && batch.setNumber
                ? `Set ${batch.setNumber}`
                : "Today’s 5 questions"}
            </p>
          </div>

          <div ref={menuRef} style={styles.menuWrap}>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              style={styles.menuButton}
              aria-label="Open menu"
            >
              ☰
            </button>

            {menuOpen ? (
              <div style={styles.menuPanel}>
                <button
                  type="button"
                  onClick={handleBackToUnitMap}
                  style={styles.menuItem}
                >
                  Back to Set Map
                </button>
                <button
                  type="button"
                  onClick={handleBackToUnitList}
                  style={styles.menuItem}
                >
                  Back to Unit Menu
                </button>
                <button type="button" onClick={goHome} style={styles.menuItem}>
                  Back to Home
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  style={styles.menuItem}
                  disabled={loggingOut}
                >
                  Log out
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <section style={styles.progressRow}>
          <div style={styles.progressPill}>{progressText}</div>
          <div style={styles.progressTrack}>
            <div
              style={{
                ...styles.progressFill,
                width: `${((questionIndex + (checked ? 1 : 0)) /
                  activeQuestions.length) *
                  100}%`,
              }}
            />
          </div>
        </section>

        <section style={styles.handwritingMiniBox}>
          <span style={styles.handwritingMiniIcon}>✍️</span>
          <span>{handwritingMessageJa}</span>
        </section>

        <section style={styles.questionCard}>
          <div style={styles.questionTopRow}>
            <AssetImage
              src={ASSETS.character}
              alt=""
              fallback="✏️"
              style={styles.characterImage}
            />

            <div style={styles.questionInstructionBox}>
              <p style={styles.questionInstruction}>
                文の中のひらがなを見て、漢字を入力してください。
              </p>
              <p style={styles.questionInstructionEn}>
                Type the kanji for the hiragana in the sentence.
              </p>
            </div>
          </div>

          <div
            style={{
              ...styles.promptBox,
              fontSize: promptFontSize,
            }}
          >
            {renderWritingPrompt(currentQuestion)}
          </div>

          {(showEnglish || checked) && currentQuestion.translation_en ? (
            <p style={styles.translationText}>{currentQuestion.translation_en}</p>
          ) : null}

          <div style={styles.utilityButtonRow}>
            <button
              type="button"
              onClick={() => setShowEnglish((prev) => !prev)}
              style={styles.utilityButton}
            >
              English
            </button>
          </div>

          <div style={styles.answerArea}>
            <input
              ref={inputRef}
              value={getCurrentInputValue()}
              onChange={(event) => setCurrentInputValue(event.target.value)}
              onKeyDown={handleInputKeyDown}
              disabled={checked || saving}
              placeholder="漢字を入力"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              style={{
                ...styles.answerInput,
                ...(checked
                  ? wasCorrect
                    ? styles.answerInputCorrect
                    : styles.answerInputWrong
                  : {}),
              }}
            />

            <button
              type="button"
              onClick={handleCheckOrNext}
              disabled={
                saving || (!checked && !getCurrentInputValue().trim())
              }
              style={styles.checkButton}
            >
              {saving ? "Saving..." : checked ? "Next" : "Check"}
            </button>
          </div>

          {shouldShowResult ? (
            <section
              style={{
                ...styles.resultBox,
                ...(wasCorrect ? styles.resultCorrect : styles.resultWrong),
              }}
            >
              <div style={styles.resultTop}>
                <AssetImage
                  src={wasCorrect ? ASSETS.correct : ASSETS.wrong}
                  alt=""
                  fallback={wasCorrect ? "⭕" : "❌"}
                  style={styles.resultIcon}
                />

                <div>
                  <p style={styles.resultTitle}>
                    {wasCorrect ? "Correct!" : "Almost!"}
                  </p>
                  <p style={styles.resultText}>
                    正しい漢字：<strong>{currentQuestion.target_text}</strong>
                  </p>
                </div>
              </div>
            </section>
          ) : null}
        </section>
      </div>
    </main>
  );
}

export default function KanjiWritingQuizPage() {
  return (
    <Suspense
      fallback={
        <main style={styles.page}>
          <section style={styles.loadingCard}>
            <p style={styles.loadingEmoji}>✏️</p>
            <p style={styles.loadingText}>Loading kanji writing quiz...</p>
          </section>
        </main>
      }
    >
      <KanjiWritingQuizInner />
    </Suspense>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh",
    background:
      "linear-gradient(180deg, #f8fbff 0%, #e8f2ff 45%, #fff6e8 100%)",
    padding: "18px 12px 24px",
    color: "#172033",
    fontFamily:
      'Arial Rounded MT Bold, Arial, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif',
  },

  topBar: {
    width: "min(980px, 100%)",
    margin: "0 auto 10px",
    display: "flex",
    justifyContent: "flex-end",
  },

  topBarButton: {
    border: "3px solid #1f2b3d",
    borderRadius: 999,
    background: "#ffffff",
    color: "#1f2b3d",
    padding: "9px 16px",
    fontSize: 14,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 4px 0 rgba(31,43,61,0.12)",
  },

  loadingCard: {
    width: "min(720px, 100%)",
    margin: "80px auto 0",
    background: "rgba(255,255,255,0.95)",
    border: "3px solid #1f2b3d",
    borderRadius: 28,
    padding: 30,
    textAlign: "center",
    boxShadow: "0 10px 0 rgba(31,43,61,0.12)",
  },

  loadingEmoji: {
    margin: 0,
    fontSize: 52,
  },

  loadingText: {
    margin: "12px 0 0",
    fontSize: 18,
    fontWeight: 900,
  },

  errorTitle: {
    margin: "10px 0",
    fontSize: 28,
    fontWeight: 900,
  },

  errorText: {
    margin: "0 0 18px",
    fontSize: 15,
    fontWeight: 800,
    color: "#536174",
  },

  startCard: {
    width: "min(980px, 100%)",
    margin: "0 auto",
    background: "rgba(255,255,255,0.95)",
    border: "3px solid #1f2b3d",
    borderRadius: 30,
    padding: "24px 18px",
    boxShadow: "0 12px 0 rgba(31,43,61,0.12)",
  },

  kicker: {
    margin: 0,
    color: "#8b5cf6",
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  startTitle: {
    margin: "6px 0 6px",
    fontSize: "clamp(34px, 6vw, 56px)",
    fontWeight: 900,
    lineHeight: 1.05,
  },

  startSubtitle: {
    margin: "0 0 16px",
    fontSize: 16,
    fontWeight: 800,
    color: "#536174",
  },

  handwritingBox: {
    background: "#f4efff",
    border: "3px solid #7c3aed",
    borderRadius: 22,
    padding: "13px 14px",
    marginBottom: 16,
  },

  handwritingTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 900,
    color: "#4c1d95",
  },

  handwritingText: {
    margin: "4px 0 0",
    fontSize: 14,
    fontWeight: 900,
    color: "#4c1d95",
  },

  handwritingTextEn: {
    margin: "5px 0 0",
    fontSize: 13,
    fontWeight: 800,
    color: "#6d28d9",
  },

  startInfoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginBottom: 16,
  },

  startInfoCard: {
    background: "#ffffff",
    border: "2px solid #d7e6f8",
    borderRadius: 20,
    padding: 14,
  },

  startInfoLabel: {
    display: "block",
    fontSize: 12,
    fontWeight: 900,
    color: "#6d7c90",
  },

  startInfoValue: {
    display: "block",
    marginTop: 4,
    fontSize: 30,
    fontWeight: 900,
    color: "#172033",
  },

  startInfoSmall: {
    display: "block",
    marginTop: 2,
    fontSize: 12,
    fontWeight: 800,
    color: "#536174",
  },

  startButtonGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(210px, 360px)",
    justifyContent: "center",
    gap: 12,
    marginBottom: 12,
  },

  primaryButton: {
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    border: "3px solid #1f2b3d",
    borderRadius: 20,
    background: "#c4f2d8",
    color: "#172033",
    minHeight: 58,
    padding: "11px 16px",
    fontSize: 18,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 7px 0 rgba(31,43,61,0.12)",
    textDecoration: "none",
  },

  secondaryButton: {
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    border: "3px solid #1f2b3d",
    borderRadius: 20,
    background: "#ffffff",
    color: "#172033",
    minHeight: 58,
    padding: "11px 16px",
    fontSize: 16,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 7px 0 rgba(31,43,61,0.12)",
    textDecoration: "none",
  },

  buttonTiny: {
    marginTop: 3,
    fontSize: 12,
    color: "#536174",
  },

  challengeLink: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
    border: "3px solid #1f2b3d",
    borderRadius: 20,
    background: "#efe5ff",
    color: "#172033",
    minHeight: 54,
    padding: "11px 16px",
    fontSize: 15,
    fontWeight: 900,
    textDecoration: "none",
    boxShadow: "0 7px 0 rgba(31,43,61,0.12)",
    marginBottom: 16,
  },

  setMapSection: {
    marginTop: 18,
    borderTop: "2px dashed #d7e6f8",
    paddingTop: 18,
  },

  setMapHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },

  setMapLabel: {
    margin: 0,
    color: "#6d7c90",
    fontSize: 13,
    fontWeight: 900,
  },

  setMapTitle: {
    margin: "2px 0 0",
    fontSize: 24,
    fontWeight: 900,
  },

  setMapBadge: {
    border: "3px solid #1f2b3d",
    borderRadius: 999,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 900,
    background: "#ffffff",
  },

  colorGuideBox: {
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "#d7e6f8",
    borderRadius: 16,
    background: "#f8fbff",
    padding: "10px 12px",
    marginBottom: 12,
  },

  colorGuideTitle: {
    margin: "0 0 7px",
    fontSize: 12,
    fontWeight: 900,
    color: "#536174",
  },

  colorGuideList: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px 14px",
    alignItems: "center",
    fontSize: 12,
    fontWeight: 800,
    color: "#172033",
  },

  colorGuideItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  },

  colorDot: {
    width: 13,
    height: 13,
    borderRadius: 999,
    borderWidth: 2,
    borderStyle: "solid",
    display: "inline-block",
    flexShrink: 0,
  },

  colorDotDone: {
    background: "#dcfce7",
    borderColor: "#22c55e",
  },

  colorDotToday: {
    background: "#efe5ff",
    borderColor: "#7c3aed",
  },

  colorDotAvailable: {
    background: "#ffffff",
    borderColor: "#1f2b3d",
  },

  colorGuideNote: {
    margin: "7px 0 0",
    fontSize: 11,
    fontWeight: 700,
    color: "#6d7c90",
  },

  setGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(126px, 1fr))",
    gap: 10,
  },

  setButton: {
    borderWidth: 3,
    borderStyle: "solid",
    borderColor: "#1f2b3d",
    borderRadius: 18,
    background: "#ffffff",
    color: "#172033",
    padding: "10px 8px",
    minHeight: 78,
    cursor: "pointer",
    boxShadow: "0 6px 0 rgba(31,43,61,0.12)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 3,
  },

  setButtonDone: {
    background: "#dcfce7",
    borderColor: "#22c55e",
  },

  setButtonToday: {
    background: "#efe5ff",
    borderColor: "#7c3aed",
  },


  setNumber: {
    fontSize: 16,
    fontWeight: 900,
  },

  setRange: {
    fontSize: 12,
    fontWeight: 800,
    color: "#536174",
  },

  setStatus: {
    fontSize: 11,
    fontWeight: 900,
    color: "#6d7c90",
  },

  startFooterNav: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "10px 16px",
    marginTop: 18,
  },

  textButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    color: "#536174",
    fontSize: 14,
    fontWeight: 900,
    textDecoration: "underline",
    cursor: "pointer",
    padding: 0,
  },

  textLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#7c3aed",
    fontSize: 13,
    fontWeight: 900,
    textDecoration: "underline",
  },

  quizShell: {
    width: "min(980px, 100%)",
    margin: "0 auto",
  },

  quizHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    background: "rgba(255,255,255,0.95)",
    border: "3px solid #1f2b3d",
    borderRadius: 24,
    padding: "15px 16px",
    boxShadow: "0 8px 0 rgba(31,43,61,0.12)",
    marginBottom: 12,
  },

  quizTitle: {
    margin: "4px 0 3px",
    fontSize: "clamp(26px, 5vw, 40px)",
    fontWeight: 900,
    lineHeight: 1.08,
  },

  quizSubTitle: {
    margin: 0,
    color: "#536174",
    fontSize: 13,
    fontWeight: 900,
  },

  menuWrap: {
    position: "relative",
  },

  menuButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    border: "3px solid #1f2b3d",
    background: "#ffffff",
    color: "#172033",
    fontSize: 25,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 5px 0 rgba(31,43,61,0.12)",
  },

  menuPanel: {
    position: "absolute",
    top: 56,
    right: 0,
    width: 210,
    background: "#ffffff",
    border: "3px solid #1f2b3d",
    borderRadius: 18,
    padding: 8,
    zIndex: 20,
    boxShadow: "0 8px 0 rgba(31,43,61,0.12)",
  },

  menuItem: {
    display: "block",
    width: "100%",
    border: "none",
    background: "transparent",
    padding: "11px 10px",
    textAlign: "left",
    fontSize: 14,
    fontWeight: 900,
    color: "#172033",
    cursor: "pointer",
    borderRadius: 12,
  },

  progressRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },

  progressPill: {
    border: "3px solid #1f2b3d",
    background: "#ffffff",
    borderRadius: 999,
    padding: "7px 12px",
    fontSize: 14,
    fontWeight: 900,
    whiteSpace: "nowrap",
  },

  progressTrack: {
    flex: 1,
    height: 14,
    borderRadius: 999,
    background: "#d7e6f8",
    border: "2px solid #ffffff",
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    background: "#8b5cf6",
    borderRadius: 999,
    transition: "width 160ms ease",
  },

  handwritingMiniBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#f4efff",
    border: "2px solid #d8b4fe",
    borderRadius: 18,
    color: "#4c1d95",
    fontSize: 13,
    fontWeight: 900,
    padding: "9px 12px",
    marginBottom: 12,
  },

  handwritingMiniIcon: {
    fontSize: 18,
  },

  questionCard: {
    background: "rgba(255,255,255,0.96)",
    border: "3px solid #1f2b3d",
    borderRadius: 30,
    padding: "18px 14px 16px",
    boxShadow: "0 12px 0 rgba(31,43,61,0.12)",
  },

  questionTopRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },

  characterImage: {
    width: 62,
    height: 62,
    objectFit: "contain",
    flexShrink: 0,
  },

  questionInstructionBox: {
    minWidth: 0,
  },

  questionInstruction: {
    margin: 0,
    fontSize: 17,
    fontWeight: 900,
    color: "#172033",
  },

  questionInstructionEn: {
    margin: "3px 0 0",
    fontSize: 13,
    fontWeight: 800,
    color: "#536174",
  },

  readingCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#efe5ff",
    border: "3px solid #7c3aed",
    borderRadius: 24,
    padding: "12px 14px",
    marginBottom: 12,
  },

  readingLabel: {
    fontSize: 12,
    fontWeight: 900,
    color: "#6d28d9",
  },

  readingValue: {
    marginTop: 3,
    fontSize: "clamp(34px, 8vw, 58px)",
    fontWeight: 900,
    color: "#172033",
    lineHeight: 1,
  },

  promptBox: {
    minHeight: 118,
    borderRadius: 24,
    background: "#fffdf5",
    border: "3px solid #f0dca4",
    padding: "18px 14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    fontWeight: 900,
    lineHeight: 1.55,
    flexWrap: "wrap",
  },

  rubyWord: {
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    verticalAlign: "middle",
    lineHeight: 1.1,
  },

  rubyText: {
    fontSize: "0.42em",
    lineHeight: 1,
    color: "#536174",
  },

  targetWrap: {
    position: "relative",
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    color: "#7c3aed",
    margin: "0 3px",
    lineHeight: 1.1,
  },

  targetWrapChecked: {
    color: "#172033",
  },

  targetRubyText: {
    fontSize: "0.42em",
    lineHeight: 1,
    color: "#7c3aed",
    marginBottom: 2,
  },

  targetUnderline: {
    width: "100%",
    height: 4,
    borderRadius: 999,
    background: "#7c3aed",
    marginTop: 3,
  },

  readingInSentence: {
    color: "#7c3aed",
  },

  readingPromptBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#efe5ff",
    color: "#7c3aed",
    borderRadius: 999,
    padding: "0.04em 0.32em",
    marginRight: "0.25em",
  },

  translationText: {
    margin: "10px 0 0",
    textAlign: "center",
    fontSize: 14,
    fontWeight: 800,
    color: "#536174",
  },

  utilityButtonRow: {
    display: "flex",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },

  utilityButton: {
    border: "2px solid #1f2b3d",
    borderRadius: 999,
    background: "#ffffff",
    color: "#172033",
    padding: "7px 12px",
    fontSize: 13,
    fontWeight: 900,
    cursor: "pointer",
  },

  hintBox: {
    marginTop: 12,
    background: "#f6f9ff",
    border: "2px solid #d7e6f8",
    borderRadius: 18,
    padding: 12,
  },

  hintKanjiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: 8,
  },

  hintKanjiCard: {
    background: "#ffffff",
    borderRadius: 14,
    padding: 10,
    border: "1px solid #d7e6f8",
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },

  hintKanji: {
    fontSize: 26,
    fontWeight: 900,
    color: "#172033",
  },

  hintMeaning: {
    fontSize: 12,
    fontWeight: 800,
    color: "#536174",
  },

  hintReading: {
    fontSize: 12,
    fontWeight: 800,
    color: "#536174",
  },

  hintText: {
    margin: 0,
    fontSize: 14,
    fontWeight: 800,
    color: "#536174",
  },

  answerArea: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 10,
    marginTop: 14,
  },

  answerInput: {
    width: "100%",
    minWidth: 0,
    borderWidth: 3,
    borderStyle: "solid",
    borderColor: "#1f2b3d",
    borderRadius: 20,
    background: "#ffffff",
    padding: "15px 14px",
    fontSize: "clamp(26px, 7vw, 40px)",
    fontWeight: 900,
    color: "#172033",
    outline: "none",
    boxShadow: "inset 0 3px 0 rgba(31,43,61,0.08)",
    textAlign: "center",
  },

  answerInputCorrect: {
    borderColor: "#22c55e",
    background: "#dcfce7",
  },

  answerInputWrong: {
    borderColor: "#ef4444",
    background: "#fee2e2",
  },

  checkButton: {
    border: "3px solid #1f2b3d",
    borderRadius: 20,
    background: "#c4f2d8",
    color: "#172033",
    minWidth: 102,
    padding: "12px 16px",
    fontSize: 17,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 6px 0 rgba(31,43,61,0.12)",
  },

  resultBox: {
    marginTop: 14,
    borderRadius: 22,
    padding: 14,
    borderWidth: 3,
    borderStyle: "solid",
    borderColor: "#1f2b3d",
  },

  resultCorrect: {
    background: "#dcfce7",
    borderColor: "#22c55e",
  },

  resultWrong: {
    background: "#fff1f2",
    borderColor: "#ef4444",
  },

  resultTop: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },

  resultIcon: {
    width: 58,
    height: 58,
    objectFit: "contain",
    flexShrink: 0,
  },

  resultTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 900,
    color: "#172033",
  },

  resultText: {
    margin: "3px 0 0",
    fontSize: 17,
    fontWeight: 900,
    color: "#172033",
  },

  resultDetailBox: {
    marginTop: 10,
    background: "rgba(255,255,255,0.72)",
    borderRadius: 16,
    padding: 12,
  },

  resultExample: {
    margin: 0,
    fontSize: 15,
    fontWeight: 900,
    color: "#172033",
  },

  resultExampleEn: {
    margin: "5px 0 0",
    fontSize: 13,
    fontWeight: 800,
    color: "#536174",
  },

  resultExplanation: {
    margin: "9px 0 0",
    fontSize: 14,
    fontWeight: 800,
    color: "#172033",
  },

  resultExplanationEn: {
    margin: "5px 0 0",
    fontSize: 13,
    fontWeight: 800,
    color: "#536174",
  },

  completeCard: {
    width: "min(760px, 100%)",
    margin: "48px auto 0",
    background: "rgba(255,255,255,0.96)",
    border: "3px solid #1f2b3d",
    borderRadius: 30,
    padding: "30px 18px",
    textAlign: "center",
    boxShadow: "0 12px 0 rgba(31,43,61,0.12)",
  },

  completeEmoji: {
    margin: 0,
    fontSize: 64,
  },

  completeTitle: {
    margin: "8px 0",
    fontSize: "clamp(32px, 7vw, 52px)",
    fontWeight: 900,
    lineHeight: 1.05,
  },

  completeText: {
    margin: 0,
    fontSize: 18,
    fontWeight: 900,
    color: "#172033",
  },

  completeSubText: {
    margin: "8px 0 18px",
    fontSize: 14,
    fontWeight: 800,
    color: "#536174",
  },

  completeButtonGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 12,
  },
};
