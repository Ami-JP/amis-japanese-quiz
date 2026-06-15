"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { judgeReadingAnswer } from "@/lib/readingAnswerJudge";

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

type SetOverviewStatus = "done" | "review" | "not_started" | "soon";

type SetOverviewItem = {
  setNumber: number;
  startOrder: number;
  endOrder: number;
  status: SetOverviewStatus;
  isToday: boolean;
  reviewCount: number;
};

type SetOverview = {
  setSize: number;
  totalQuestionCount: number;
  totalSetCount: number;
  completedSetCount: number;
  todaySetNumber: number | null;
  reviewCount: number;
  sets: SetOverviewItem[];
};

type BatchResponse = {
  account: {
    display_name: string | null;
    student_login_id: string;
  };
  unit: string;
  difficulty_tier: string;
  mode: "normal" | "practice-set" | "review-wrong" | "practice";
  setNumber?: number | null;
  startOrder?: number | null;
  endOrder?: number | null;
  lastOrderCompleted: number;
  completedCount?: number;
  finished: boolean;
  isUnitComplete?: boolean;
  hasAdvancedAvailable?: boolean;
  hasMoreReadingVariants?: boolean;
  setOverview?: SetOverview;
  questions: ReadingQuestion[];
  error?: string;
};

type SaveProgressResponse = {
  ok: boolean;
  isUnitComplete?: boolean;
  completedCount?: number;
  lastOrderCompleted?: number;
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
  mode: "desktop" | "tablet" | "phone" | "small-phone"
) {
  if (mode === "small-phone") {
    if (promptLength <= 8) return 34;
    if (promptLength <= 12) return 30;
    if (promptLength <= 16) return 25;
    if (promptLength <= 20) return 22;
    if (promptLength <= 26) return 19;
    if (promptLength <= 34) return 17;
    return 16;
  }

  if (mode === "phone") {
    if (promptLength <= 8) return 42;
    if (promptLength <= 12) return 36;
    if (promptLength <= 16) return 30;
    if (promptLength <= 20) return 25;
    if (promptLength <= 26) return 22;
    if (promptLength <= 34) return 19;
    if (promptLength <= 44) return 17;
    return 16;
  }

  if (mode === "tablet") {
    if (promptLength <= 8) return 58;
    if (promptLength <= 12) return 50;
    if (promptLength <= 16) return 42;
    if (promptLength <= 20) return 34;
    if (promptLength <= 26) return 29;
    if (promptLength <= 34) return 25;
    if (promptLength <= 44) return 22;
    return 20;
  }

  if (promptLength <= 8) return 82;
  if (promptLength <= 12) return 74;
  if (promptLength <= 16) return 62;
  if (promptLength <= 20) return 42;
  if (promptLength <= 26) return 36;
  if (promptLength <= 34) return 30;
  if (promptLength <= 44) return 26;
  if (promptLength <= 58) return 23;
  return 21;
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

function getUnitDisplayLabel(unit: string) {
  const match = unit.match(/^grade(\d+)-kanji-(\d+)$/);

  if (!match) return unit;

  return `Level ${match[1]} / Unit ${match[2]}`;
}

function getUnitListHref(unit: string) {
  const match = unit.match(/^grade(\d+)-kanji-/);
  const level = match?.[1];

  if (!level) return "/student-home";

  return `/student-home/level/${level}?quiz=reading`;
}

function getSetStatusText(item: SetOverviewItem) {
  if (item.status === "review") return "Review";
  if (item.status === "done") return "Done";
  if (item.status === "soon") return "Soon";
  return "Not started";
}

function getReviewMessage(reviewCount: number) {
  if (reviewCount > 0) {
    return {
      title: `Reviewあり：${reviewCount}件`,
      text: "もう一度練習できます",
    };
  }

  return {
    title: "Review：0件",
    text: "Perfect! 復習はありません",
  };
}

function getAccuracyPercent(correctCount: number, answeredCount: number) {
  if (answeredCount <= 0) return 0;
  return Math.round((correctCount / answeredCount) * 100);
}

function KanjiReadingQuizInner() {
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

  const [showFurigana, setShowFurigana] = useState(false);
  const [showEnglish, setShowEnglish] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const [checked, setChecked] = useState(false);
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);
  const [showComplete, setShowComplete] = useState(false);
  const [unitComplete, setUnitComplete] = useState(false);

  const [reviewQuestions, setReviewQuestions] = useState<
    ReadingQuestion[] | null
  >(null);
  const [currentMode, setCurrentMode] = useState<
    "normal" | "practice-set" | "review"
  >(initialMode);
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
    }
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
    setShowFurigana(false);
    setShowEnglish(false);
    setShowHint(false);
    setReviewQuestions(null);
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

    const res = await fetch(`/api/kanji-reading-quiz?${params.toString()}`, {
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
      if (unit) {
        setLoading(true);
        setError("");
        setUnitComplete(false);

        const params = new URLSearchParams();
        params.set("unit", unit);
        params.set("tier", difficultyTier);
        params.set("mode", "normal");

        const res = await fetch(`/api/kanji-reading-quiz?${params.toString()}`, {
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
        setStartScreenProgress(data.lastOrderCompleted ?? 0);
        setStartScreenHasAdvanced(data.hasAdvancedAvailable === true);

        setShowUnitStartScreen(true);

        setLoading(false);
        return;
      }

      await loadBatch(initialMode, {
        startOrder,
        endOrder,
      });
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

  useEffect(() => {
    function handleGlobalEnter(event: KeyboardEvent) {
      if (event.key !== "Enter") return;
      if (event.repeat) return;
      if (event.defaultPrevented) return;
      if (event.isComposing) return;
      if ((event as any).keyCode === 229) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (loading || saving || showComplete || showUnitStartScreen) return;
      if (!currentQuestion) return;
      if (menuOpen) return;

      const target = event.target;

      if (target instanceof HTMLElement) {
        if (target.closest("textarea, select, button, a")) {
          return;
        }

        if (!checked && target.closest("input")) {
          return;
        }
      }

      const value = getCurrentInputValue();

      if (!checked && !value.trim()) return;

      event.preventDefault();
      handleCheckOrNext();
    }

    window.addEventListener("keydown", handleGlobalEnter);

    return () => {
      window.removeEventListener("keydown", handleGlobalEnter);
    };
  }, [
    checked,
    currentQuestion,
    getCurrentInputValue,
    handleCheckOrNext,
    loading,
    menuOpen,
    saving,
    showComplete,
    showUnitStartScreen,
  ]);

  function isAnswerCorrect(question: ReadingQuestion, rawInput: string) {
    return judgeReadingAnswer({
      userAnswer: rawInput,
      answerText: question.answer_text,
      answerAliases: question.answer_aliases,
    });
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

    if (!shouldShowFurigana || rubyMap.size === 0) {
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
        <span
          style={
            checked
              ? { ...styles.targetWrap, ...styles.targetWrapChecked }
              : styles.targetWrap
          }
        >
          {checked && question.target_ruby ? (
            <span style={styles.targetRubyText}>{question.target_ruby}</span>
          ) : null}
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
      saveReviewProgress();
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
        completedCount:
          typeof data.completedCount === "number"
            ? data.completedCount
            : prev.completedCount,
        isUnitComplete: nextUnitComplete,
        finished: nextUnitComplete ? true : prev.finished,
      };
    });

    setSaving(false);
    setShowComplete(true);
  }

  async function saveReviewProgress() {
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
        mode: "review-wrong",
        advanceCount: 0,
        attempts,
      }),
    });

    if (res.status === 401) {
      window.location.href = "/student-login";
      return;
    }

    const data = (await res.json()) as SaveProgressResponse;

    if (!res.ok) {
      setError(data.error ?? "Failed to save review progress.");
      setSaving(false);
      return;
    }

    setSaving(false);
    setShowComplete(true);
  }

  async function startWrongReview() {
    if (!unit) return;

    setMenuOpen(false);
    setSaving(false);
    setError("");

    const params = new URLSearchParams();
    params.set("unit", batch?.unit ?? unit);
    params.set("tier", batch?.difficulty_tier ?? difficultyTier);
    params.set("mode", "review-wrong");

    const res = await fetch(`/api/kanji-reading-quiz?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });

    if (res.status === 401) {
      window.location.href = "/student-login";
      return;
    }

    const data = (await res.json()) as BatchResponse;

    if (!res.ok) {
      setError(data.error ?? "Failed to load review questions.");
      return;
    }

    if (!data.questions || data.questions.length === 0) {
      window.alert("No wrong answers to review right now!");
      return;
    }

    setBatch(data);
    setCurrentMode("review");
    setReviewQuestions(data.questions);
    setQuestionIndex(0);
    setAnswers([]);
    setAttempts([]);
    setChecked(false);
    setWasCorrect(null);
    setShowComplete(false);
    setUnitComplete(false);
    setShowFurigana(false);
    setShowEnglish(false);
    setShowHint(false);
    setShowUnitStartScreen(false);
    setMenuOpen(false);

    focusInputSoon();
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
    if (!batch) return;
    if (batch.mode !== "practice-set") return;
    if (batch.setNumber == null && (batch.startOrder == null || batch.endOrder == null)) return;

    await loadBatch("practice-set", {
      setNumber: batch.setNumber ?? null,
      startOrder: batch.startOrder ?? null,
      endOrder: batch.endOrder ?? null,
    });
  }

  async function handleStudyNextFiveKanji() {
    setMenuOpen(false);
    await loadBatch("normal");
  }

  function handlePracticeThisSetAgain() {
    setShowComplete(false);
    setUnitComplete(false);
    setReviewQuestions(null);
    setCurrentMode(batch?.mode === "practice-set" ? "practice-set" : "normal");
    setQuestionIndex(0);
    setAnswers([]);
    setAttempts([]);
    setChecked(false);
    setWasCorrect(null);
    setShowFurigana(false);
    setShowEnglish(false);
    setShowHint(false);
    setMenuOpen(false);

    focusInputSoon();
  }

  async function loadStartScreenBatch(options?: { startFromBeginning?: boolean }) {
    if (!unit) return;

    setLoading(true);
    setError("");
    setShowComplete(false);
    setUnitComplete(false);
    setReviewQuestions(null);
    setQuestionIndex(0);
    setAnswers([]);
    setAttempts([]);
    setChecked(false);
    setWasCorrect(null);
    setShowFurigana(false);
    setShowEnglish(false);
    setShowHint(false);
    setMenuOpen(false);

    const params = new URLSearchParams();
    params.set("unit", unit);
    params.set("tier", difficultyTier);
    params.set("mode", "normal");

    if (options?.startFromBeginning) {
      params.set("startFromBeginning", "1");
    }

    const res = await fetch(`/api/kanji-reading-quiz?${params.toString()}`, {
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
    setStartScreenProgress(data.lastOrderCompleted ?? 0);
    setStartScreenHasAdvanced(data.hasAdvancedAvailable === true);
    setCurrentMode("normal");
    setShowUnitStartScreen(true);
    setLoading(false);
  }

  async function handleContinueFromStartScreen() {
    if (batch?.questions?.length) {
      setCurrentMode("normal");
      setReviewQuestions(null);
      setShowUnitStartScreen(false);
      focusInputSoon();
      return;
    }

    await loadBatch("normal");
  }

  async function handleStartFromBeginningFromStartScreen() {
    await loadStartScreenBatch({ startFromBeginning: true });
  }

  async function handleBackToUnitMap() {
    await loadStartScreenBatch();
  }

  function handleBackToUnitList() {
    window.location.href = getUnitListHref(unit);
  }

  async function handlePracticeSetFromMap(item: SetOverviewItem) {
    if (item.status === "soon") return;

    await loadBatch("practice-set", {
      setNumber: item.setNumber,
      startOrder: item.startOrder,
      endOrder: item.endOrder,
    });
  }

  async function handleContinueMenu() {
    setMenuOpen(false);
    await loadBatch("normal");
  }

  async function handleRestartUnit() {
    setMenuOpen(false);
    await loadBatch("normal", { startFromBeginning: true });
  }

  function handleTryAdvanced() {
    window.location.href = `/kanji-reading-quiz?unit=${encodeURIComponent(
      unit
    )}&tier=high_level&mode=normal`;
  }

  function renderSetLegend() {
    const items = [
      { label: "Done", style: styles.legendDoneDot },
      { label: "Review", style: styles.legendReviewDot },
      { label: "Not started", style: styles.legendNotStartedDot },
      { label: "Soon", style: styles.legendSoonDot },
    ];

    return (
      <div style={styles.setLegend} aria-label="Set color legend">
        {items.map((item) => (
          <div key={item.label} style={styles.legendItem}>
            <span style={{ ...styles.legendDot, ...item.style }} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    );
  }

  function renderSetMap(overview: SetOverview) {
    if (overview.totalSetCount <= 0) {
      return (
        <div style={styles.setMapEmpty}>
          This unit does not have reading sets yet.
        </div>
      );
    }

    return (
      <div style={styles.setMapGrid}>
        {overview.sets.map((item) => {
          const setStyle =
            item.status === "review"
              ? styles.setNodeReview
              : item.status === "done"
              ? styles.setNodeDone
              : item.status === "soon"
              ? styles.setNodeSoon
              : styles.setNodeNotStarted;

          const disabled = item.status === "soon";

          return (
            <div key={item.setNumber} style={styles.setNodeWrap}>
              {item.isToday ? <div style={styles.todayFlag}>今日はここ</div> : null}
              <button
                type="button"
                onClick={() => void handlePracticeSetFromMap(item)}
                disabled={disabled}
                style={{
                  ...styles.setNode,
                  ...setStyle,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.55 : 1,
                }}
                title={
                  disabled
                    ? "This set is not available yet."
                    : `Practice Set ${item.setNumber}`
                }
              >
                <span style={styles.setNodeNumber}>Set {item.setNumber}</span>
                <span style={styles.setNodeStatus}>{getSetStatusText(item)}</span>
              </button>
            </div>
          );
        })}
      </div>
    );
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
          padding: mobile ? "8px 8px 6px" : "10px 10px 6px",
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
                    fontSize: mobile ? 30 : 42,
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
  const isPracticeSet = batch?.mode === "practice-set";
  const hasMoreReadings = batch?.hasMoreReadingVariants === true;
  const isFinalUnitComplete = currentMode !== "review" && unitComplete;

  const shouldShowFurigana = showFurigana || checked;
  const shouldShowEnglish = showEnglish || checked;
  const shouldShowHint = showHint || checked;

  useEffect(() => {
    function handleStartOrCompleteEnter(event: KeyboardEvent) {
      if (event.key !== "Enter") return;
      if (event.repeat) return;
      if (event.defaultPrevented) return;
      if (event.isComposing) return;
      if ((event as any).keyCode === 229) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (loading || saving || menuOpen) return;
      if (!showUnitStartScreen && !showComplete) return;

      const target = event.target;

      if (target instanceof HTMLElement) {
        if (target.closest("textarea, input, select, button, a")) {
          return;
        }
      }

      event.preventDefault();

      if (showUnitStartScreen) {
        void handleContinueFromStartScreen();
        return;
      }

      if (showComplete) {
        if (currentMode === "review" || isFinalUnitComplete) {
          void handleBackToUnitMap();
          return;
        }

        void handleStudyNextFiveKanji();
      }
    }

    window.addEventListener("keydown", handleStartOrCompleteEnter);

    return () => {
      window.removeEventListener("keydown", handleStartOrCompleteEnter);
    };
  }, [
    currentMode,
    isFinalUnitComplete,
    loading,
    menuOpen,
    saving,
    showComplete,
    showUnitStartScreen,
  ]);


  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.centerWrap}>
          <div style={styles.loadingCard}>Loading...</div>
        </div>
      </main>
    );
  }

  if (showUnitStartScreen && unit) {
    const isFirstTime = startScreenProgress === 0 && difficultyTier === "normal";
    const overview = batch?.setOverview ?? null;
    const reviewCount = overview?.reviewCount ?? 0;
    const reviewMessage = getReviewMessage(reviewCount);
    const remainingSetCount = overview
      ? Math.max(0, overview.totalSetCount - overview.completedSetCount)
      : 0;
    const isOverviewUnitComplete =
      !!overview &&
      overview.totalSetCount > 0 &&
      overview.completedSetCount >= overview.totalSetCount;
    const todayBoxLabel = isOverviewUnitComplete ? "完了 / Done" : "今日はここ";
    const todaySetLabel = overview?.todaySetNumber
      ? `Set ${overview.todaySetNumber}`
      : overview && overview.totalSetCount > 0
      ? "Unit complete!"
      : "Ready";
    const canContinue =
      (batch?.questions?.length ?? 0) > 0 && !isOverviewUnitComplete;

    return (
      <main style={styles.page}>
        <div style={styles.centerWrap}>
          <div style={{ ...styles.messageCard, ...styles.unitMapCard }}>
            <div style={styles.unitMapTopRow}>
              <button
                type="button"
                onClick={handleBackToUnitList}
                style={styles.smallBackButton}
              >
                ← Back to Units
              </button>
            </div>

            <p style={styles.unitMapKicker}>
              {difficultyTier === "high_level" ? "Advanced Reading Quiz" : "Reading Quiz"}
            </p>
            <h2 style={styles.messageTitle}>{getUnitDisplayLabel(unit)}</h2>

            <div style={styles.todayBox}>
              <span style={styles.todayLabel}>{todayBoxLabel}</span>
              <strong style={styles.todaySetText}>{todaySetLabel}</strong>
            </div>

            {overview ? (
              <>
                <p style={styles.unitMapProgressText}>
                  {overview.completedSetCount} / {overview.totalSetCount} sets completed
                </p>
                <p style={styles.unitMapSmallText}>
                  {remainingSetCount > 0
                    ? `あと${remainingSetCount}セット！`
                    : "Congratulations! Unit complete!"}
                </p>

                <section
                  style={{
                    ...styles.reviewSummaryBox,
                    ...(reviewCount > 0
                      ? styles.reviewSummaryBoxActive
                      : styles.reviewSummaryBoxPerfect),
                  }}
                >
                  <div>
                    <p style={styles.reviewSummaryTitle}>{reviewMessage.title}</p>
                    <p style={styles.reviewSummaryText}>{reviewMessage.text}</p>
                  </div>

                  <button
                    type="button"
                    onClick={startWrongReview}
                    disabled={reviewCount <= 0}
                    style={{
                      ...styles.reviewUnitButton,
                      opacity: reviewCount > 0 ? 1 : 0.55,
                      cursor: reviewCount > 0 ? "pointer" : "not-allowed",
                    }}
                  >
                    Review this unit
                  </button>
                </section>

                {renderSetLegend()}
                {renderSetMap(overview)}
              </>
            ) : (
              <p style={styles.messageText}>
                Unit: <strong>{unit}</strong>
              </p>
            )}

            <div style={styles.completeButtons}>
              {isFirstTime ? (
                <>
                  <button
                    type="button"
                    onClick={handleContinueFromStartScreen}
                    disabled={!canContinue}
                    style={{
                      ...styles.primaryButton,
                      fontSize: 18,
                      padding: "14px 28px",
                      opacity: canContinue ? 1 : 0.55,
                      cursor: canContinue ? "pointer" : "not-allowed",
                    }}
                  >
                    Start today's set
                  </button>

                  {startScreenHasAdvanced ? (
                    <button
                      type="button"
                      onClick={handleTryAdvanced}
                      style={{
                        ...styles.secondaryButton,
                        fontSize: 15,
                        padding: "10px 18px",
                        opacity: 0.9,
                      }}
                    >
                      Try Advanced
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleContinueFromStartScreen}
                    disabled={!canContinue}
                    style={{
                      ...styles.primaryButton,
                      opacity: canContinue ? 1 : 0.55,
                      cursor: canContinue ? "pointer" : "not-allowed",
                    }}
                  >
                    Continue
                  </button>

                  <button
                    type="button"
                    onClick={handleBackToUnitList}
                    style={styles.secondaryButton}
                  >
                    Back to Units
                  </button>

                  <button
                    type="button"
                    onClick={goHome}
                    style={styles.secondaryButton}
                  >
                    Back to Home
                  </button>

                  {difficultyTier === "normal" && startScreenHasAdvanced ? (
                    <button
                      type="button"
                      onClick={handleTryAdvanced}
                      style={{
                        ...styles.secondaryButton,
                        fontSize: 15,
                        padding: "10px 18px",
                        opacity: 0.9,
                      }}
                    >
                      Try Advanced
                    </button>
                  ) : null}
                </>
              )}
            </div>

            <p style={styles.enterHintText}>Press Enter to continue.</p>
            <p style={styles.practiceSetNote}>
              Set buttons are for practice. Use Continue for your next normal set.
            </p>
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
    const answeredCount = activeQuestions.length || batch?.questions.length || 0;
    const accuracyPercent = getAccuracyPercent(correctCount, answeredCount);
    const completeTitle =
      currentMode === "review"
        ? "Review complete!"
        : isFinalUnitComplete
        ? "Congratulations!"
        : "Set complete!";
    const completeSubText =
      currentMode === "review"
        ? "Nice review! Unit画面で色を確認しましょう。"
        : isFinalUnitComplete
        ? "Unit complete! よくがんばりました！"
        : "Nice work! 次の5問に進めます。";

    return (
      <main style={styles.page}>
        <div style={styles.centerWrap}>
          <div style={styles.messageCard}>
            <h2 style={styles.messageTitle}>{completeTitle}</h2>
            <p style={styles.completeSubText}>{completeSubText}</p>

            <div style={styles.resultStatsGrid}>
              <div style={styles.resultStatCard}>
                <span style={styles.resultStatLabel}>Answered</span>
                <strong style={styles.resultStatNumber}>{answeredCount}</strong>
              </div>
              <div style={styles.resultStatCard}>
                <span style={styles.resultStatLabel}>Correct</span>
                <strong style={styles.resultStatNumber}>{correctCount}</strong>
              </div>
              <div style={styles.resultStatCard}>
                <span style={styles.resultStatLabel}>Review</span>
                <strong style={styles.resultStatNumber}>{wrongCount}</strong>
              </div>
              <div style={styles.resultStatCard}>
                <span style={styles.resultStatLabel}>Accuracy</span>
                <strong style={styles.resultStatNumber}>{accuracyPercent}%</strong>
              </div>
            </div>

            <div style={styles.completeButtons}>
              {isFinalUnitComplete ? (
                <>
                  <button
                    type="button"
                    onClick={handleBackToUnitMap}
                    style={styles.primaryButton}
                  >
                    Back to Unit Map
                  </button>

                  <button
                    type="button"
                    onClick={startWrongReview}
                    style={styles.secondaryButton}
                  >
                    Review wrong answers
                  </button>

                  <button
                    type="button"
                    onClick={goHome}
                    style={styles.secondaryButton}
                  >
                    Back to Home
                  </button>
                </>
              ) : currentMode === "review" ? (
                <>
                  <button
                    type="button"
                    onClick={handleBackToUnitMap}
                    style={styles.primaryButton}
                  >
                    Back to Unit Map
                  </button>

                  <button
                    type="button"
                    onClick={startWrongReview}
                    style={styles.secondaryButton}
                  >
                    Review more
                  </button>

                  <button
                    type="button"
                    onClick={goHome}
                    style={styles.secondaryButton}
                  >
                    Back to Home
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleStudyNextFiveKanji}
                    style={styles.primaryButton}
                  >
                    Practice 5 more
                  </button>

                  <button
                    type="button"
                    onClick={startWrongReview}
                    style={styles.secondaryButton}
                  >
                    Review wrong answers
                  </button>

                  <button
                    type="button"
                    onClick={handlePracticeThisSetAgain}
                    style={styles.secondaryButton}
                  >
                    Practice this set again
                  </button>

                  <button
                    type="button"
                    onClick={handleBackToUnitMap}
                    style={styles.secondaryButton}
                  >
                    Back to Unit Map
                  </button>

                  <button
                    type="button"
                    onClick={goHome}
                    style={styles.secondaryButton}
                  >
                    Back to Home
                  </button>
                </>
              )}
            </div>

            <p style={styles.enterHintText}>
              {currentMode === "review" || isFinalUnitComplete
                ? "Press Enter to go back to the Unit Map."
                : "Press Enter to practice 5 more."}
            </p>
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
            <h2 style={styles.messageTitle}>
              No quiz is available for this unit yet
            </h2>
            <p style={styles.messageText}>
              You may have finished this unit, or the questions may still be in
              preparation. Please ask your teacher.
            </p>

            <div style={{ marginTop: 22 }}>
              <button
                type="button"
                onClick={goHome}
                style={styles.secondaryButton}
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const promptFontSize = getPromptFontSize(
    currentQuestion.prompt.length,
    deviceMode
  );

  const shouldWrapPrompt =
    currentQuestion.prompt.length >
    (isDesktop ? 18 : isTablet ? 14 : isSmallPhone ? 10 : 12);

  const promptLineHeight = shouldWrapPrompt
    ? shouldShowFurigana
      ? isDesktop
        ? 1.34
        : 1.36
      : isDesktop
      ? 1.18
      : 1.2
    : isDesktop
    ? 1.01
    : 1.04;

  const promptTextFitStyle: React.CSSProperties = {
    ...styles.promptText,
    fontSize: promptFontSize,
    lineHeight: promptLineHeight,
    transform: "none",
    whiteSpace: shouldWrapPrompt ? "normal" : "nowrap",
    overflowWrap: "anywhere",
    wordBreak: shouldWrapPrompt ? "break-word" : "normal",
    maxWidth: "100%",
    width: "100%",
  };

  const compactQuestionNumberSize = isDesktop
    ? 88
    : isTablet
    ? 60
    : isSmallPhone
    ? 40
    : 44;
  const compactQuestionFont = isDesktop ? 48 : isTablet ? 32 : isSmallPhone ? 22 : 24;

  const currentSetNumber =
    currentMode === "review"
      ? null
      : batch?.mode === "practice-set"
      ? batch.setNumber ?? null
      : batch?.setOverview?.todaySetNumber ?? null;

  const quizSetBadgeText =
    currentMode === "review"
      ? "Review"
      : currentSetNumber != null
      ? `Set ${currentSetNumber}`
      : batch?.mode === "practice-set"
      ? "Practice Set"
      : "Today's Set";

  return (
    <main style={styles.page}>
      <div
        style={{
          ...styles.appFrame,
          width: isDesktop
            ? "min(1680px, calc(100vw - 72px))"
            : "min(1000px, calc(100vw - 12px))",
          height: isDesktop ? "calc(100dvh - 48px)" : "auto",
          minHeight: isDesktop ? undefined : "calc(100dvh - 12px)",
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
            minHeight: isDesktop ? 66 : isTablet ? 54 : 46,
            padding: isDesktop ? "7px 30px" : isTablet ? "7px 14px" : "5px 10px",
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
                  onClick={handleBackToUnitMap}
                >
                  Back to Set Map
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
              ? "2px 24px 2px"
              : isTablet
              ? "6px 12px 14px"
              : "5px 10px 10px",
            display: "flex",
            flexDirection: "column",
            gap: isDesktop ? 1 : isTablet ? 7 : 5,
            minHeight: isDesktop ? "calc(100% - 66px)" : "auto",
          }}
        >
          <div
            style={{
              ...styles.quizSetBadge,
              top: isDesktop ? 8 : isTablet ? 8 : 6,
              right: isDesktop ? 26 : isTablet ? 14 : 12,
              fontSize: isDesktop ? 13 : isTablet ? 12 : 11,
              padding: isDesktop ? "5px 12px" : "4px 9px",
            }}
          >
            {quizSetBadgeText}
          </div>

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
                    ? 30
                    : isSmallPhone
                    ? 21
                    : 23,
                  lineHeight: isDesktop ? 1.03 : 1.06,
                }}
              >
                CAN YOU READ THIS KANJI?
              </div>
              <div
                style={{
                  ...styles.smallTitle,
                  fontSize: isDesktop ? 22 : isTablet ? 17 : 13,
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
                        minHeight: shouldWrapPrompt ? 158 : 140,
                        padding: shouldWrapPrompt ? "8px 18px" : "6px 16px",
                        transform: "translateX(-56px)",
                        width: "calc(100% + 56px)",
                      }}
                    >
                      <div style={promptTextFitStyle}>
                        {renderPrompt(currentQuestion)}
                      </div>
                    </div>

                    <div style={styles.translationRowDesktop}>
                      {shouldShowEnglish ? (
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
                        width: 250,
                        height: 250,
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
                    gridTemplateColumns: shouldShowHint
                      ? "minmax(0, 1fr) minmax(390px, 0.9fr)"
                      : "minmax(0, 1fr) 290px",
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
                            if (
                              e.nativeEvent.isComposing ||
                              (e.nativeEvent as any).keyCode === 229
                            ) {
                              return;
                            }

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
                    </div>
                  </div>

                  <div style={styles.hintBlockDesktop}>
                    {!shouldShowHint ? (
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
                      width: isSmallPhone ? 54 : 60,
                      height: isSmallPhone ? 54 : 60,
                      objectFit: "contain",
                    }}
                  />
                </div>
              ) : null}

              <div
                style={{
                  ...styles.promptCard,
                  minHeight: isTablet
                    ? shouldWrapPrompt
                      ? 146
                      : 126
                    : isSmallPhone
                    ? shouldWrapPrompt
                      ? 104
                      : 86
                    : shouldWrapPrompt
                    ? 112
                    : 94,
                  padding: isTablet
                    ? "10px 14px"
                    : isSmallPhone
                    ? "8px 10px"
                    : "9px 10px",
                }}
              >
                <div style={promptTextFitStyle}>
                  {renderPrompt(currentQuestion)}
                </div>
              </div>

              <div style={styles.translationRowMobile}>
                {shouldShowEnglish ? (
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
                  style={{
                    ...styles.sideBlueButtonMobile,
                    minHeight: isTablet ? 62 : 50,
                    fontSize: isTablet ? 12 : 10,
                    padding: isTablet ? "7px 8px" : "5px 6px",
                    borderWidth: isTablet ? 4 : 3,
                  }}
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
                  style={{
                    ...styles.sidePinkButtonMobile,
                    minHeight: isTablet ? 62 : 50,
                    fontSize: isTablet ? 12 : 10,
                    padding: isTablet ? "7px 8px" : "5px 6px",
                    borderWidth: isTablet ? 4 : 3,
                  }}
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
                {!shouldShowHint ? (
                  <div style={styles.mobileHintBlock}>
                    <button
                      type="button"
                      onClick={() => setShowHint(true)}
                      style={{
                        ...styles.hintButton,
                        width: "100%",
                        minHeight: isTablet ? 70 : 56,
                        borderRadius: isTablet ? 24 : 22,
                        padding: isTablet ? "7px 12px" : "5px 10px",
                        boxShadow: isTablet
                          ? "8px 8px 0 #9ec1f0"
                          : "6px 6px 0 #9ec1f0",
                      }}
                    >
                      <span style={styles.hintMiniText}>ヒントを見る</span>
                      <span
                        style={{
                          ...styles.hintMainText,
                          fontSize: isTablet ? 38 : 28,
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
                            width: isTablet ? 68 : 48,
                            height: isTablet ? 68 : 48,
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
                  marginTop: isTablet ? 12 : 7,
                  fontSize: isTablet ? 22 : 18,
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
                    ? "40px minmax(0, 1fr)"
                    : "32px minmax(0, 1fr)",
                  gap: isTablet ? 8 : 5,
                }}
              >
                <div
                  style={{
                    ...styles.arrowMobile,
                    fontSize: isTablet ? 30 : 24,
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
                      if (
                        e.nativeEvent.isComposing ||
                        (e.nativeEvent as any).keyCode === 229
                      ) {
                        return;
                      }

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
                    height: isTablet ? 56 : 46,
                    fontSize: isTablet ? 26 : 21,
                  }}
                />
              </div>

              {checked && wasCorrect === true ? (
                <div
                  style={{
                    ...styles.correctMobile,
                    fontSize: isTablet ? 24 : 20,
                  }}
                >
                  <AssetImage
                    src={ASSETS.correct}
                    alt="correct"
                    fallback={<span style={{ fontSize: 28 }}>👍</span>}
                    style={{
                      width: isTablet ? 72 : 56,
                      height: isTablet ? 42 : 34,
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
                        width: isTablet ? 38 : 30,
                        height: isTablet ? 38 : 30,
                        objectFit: "contain",
                      }}
                    />
                    <div style={styles.wrongBadge}>CORRECT ANSWER</div>
                  </div>
                  <div
                    style={{
                      ...styles.wrongAnswerMobile,
                      fontSize: isTablet ? 26 : 21,
                    }}
                  >
                    {currentQuestion.answer_text}
                  </div>
                </div>
              ) : null}

              <div
                style={{
                  ...styles.bottomButtonRowMobile,
                  marginTop: isTablet ? 10 : 6,
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
                    fontSize: isTablet ? 19 : 16,
                    padding: isTablet ? "10px 18px" : "8px 12px",
                  }}
                >
                  {saving ? "Saving..." : checked ? "Next" : "Check"}
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
  unitMapCard: {
    background: "rgba(255,255,255,0.94)",
    width: "min(760px, 94vw)",
  },
  unitMapTopRow: {
    display: "flex",
    justifyContent: "flex-start",
    marginBottom: 8,
  },
  smallBackButton: {
    border: "3px solid #111",
    borderRadius: 999,
    background: "#fff",
    color: "#111",
    padding: "8px 14px",
    fontSize: 14,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 4px 0 rgba(0,0,0,0.12)",
  },
  unitMapKicker: {
    margin: "0 0 8px",
    color: "#4d97d4",
    fontSize: 15,
    fontWeight: 900,
    letterSpacing: 1,
  },
  todayBox: {
    margin: "16px auto 12px",
    border: "4px solid #111",
    borderRadius: 24,
    background: "#fff3c4",
    padding: "12px 16px",
    width: "min(420px, 100%)",
    boxShadow: "0 6px 0 rgba(0,0,0,0.12)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    alignItems: "center",
  },
  todayLabel: {
    background: "#111",
    color: "#fff",
    borderRadius: 999,
    padding: "4px 12px",
    fontSize: 13,
    fontWeight: 900,
  },
  todaySetText: {
    fontSize: 28,
    fontWeight: 900,
    lineHeight: 1.1,
  },
  unitMapProgressText: {
    margin: "12px 0 2px",
    fontSize: 18,
    fontWeight: 900,
  },
  unitMapSmallText: {
    margin: "0 0 12px",
    fontSize: 15,
    fontWeight: 900,
    color: "#536174",
  },
  reviewSummaryBox: {
    border: "3px solid #111",
    borderRadius: 22,
    padding: "12px 14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    margin: "14px auto",
    textAlign: "left",
  },
  reviewSummaryBoxActive: {
    background: "#efe2ff",
  },
  reviewSummaryBoxPerfect: {
    background: "#def8e8",
  },
  reviewSummaryTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 900,
  },
  reviewSummaryText: {
    margin: "4px 0 0",
    fontSize: 13,
    fontWeight: 800,
    color: "#536174",
  },
  reviewUnitButton: {
    border: "3px solid #111",
    borderRadius: 999,
    background: "#8b5cf6",
    color: "#fff",
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 900,
    flexShrink: 0,
  },
  setLegend: {
    display: "flex",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: "8px 12px",
    margin: "8px 0 12px",
    fontSize: 12,
    fontWeight: 900,
    color: "#1f2b3d",
  },
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    display: "inline-block",
    width: 12,
    height: 12,
    borderRadius: 999,
    border: "2px solid #111",
  },
  legendDoneDot: {
    background: "#8ee6a8",
  },
  legendReviewDot: {
    background: "#c5a3ff",
  },
  legendNotStartedDot: {
    background: "#bfe0ff",
  },
  legendSoonDot: {
    background: "#dcdcdc",
  },
  setMapGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))",
    gap: "18px 12px",
    margin: "18px 0 8px",
  },
  setNodeWrap: {
    position: "relative",
    minHeight: 92,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  todayFlag: {
    position: "absolute",
    top: -8,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#111",
    color: "#fff",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 900,
    zIndex: 2,
    whiteSpace: "nowrap",
  },
  setNode: {
    border: "4px solid #111",
    borderRadius: 22,
    minHeight: 72,
    width: "100%",
    padding: "14px 8px 10px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    boxShadow: "0 6px 0 rgba(0,0,0,0.12)",
  },
  setNodeDone: {
    background: "#8ee6a8",
  },
  setNodeReview: {
    background: "#c5a3ff",
  },
  setNodeNotStarted: {
    background: "#bfe0ff",
  },
  setNodeSoon: {
    background: "#dcdcdc",
  },
  setNodeNumber: {
    fontSize: 18,
    fontWeight: 900,
    lineHeight: 1,
  },
  setNodeStatus: {
    fontSize: 12,
    fontWeight: 900,
    lineHeight: 1,
  },
  setMapEmpty: {
    border: "3px dashed #111",
    borderRadius: 20,
    padding: 16,
    fontSize: 15,
    fontWeight: 900,
    background: "#fff",
    marginTop: 14,
  },
  enterHintText: {
    margin: "14px 0 0",
    fontSize: 13,
    fontWeight: 900,
    color: "#536174",
  },
  practiceSetNote: {
    margin: "6px 0 0",
    fontSize: 12,
    fontWeight: 800,
    color: "#536174",
  },
  completeSubText: {
    margin: "10px 0 0",
    fontSize: 16,
    fontWeight: 900,
    color: "#536174",
  },
  resultStatsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 10,
    margin: "20px 0 4px",
  },
  resultStatCard: {
    border: "3px solid #111",
    borderRadius: 18,
    background: "#fff",
    padding: "10px 6px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    boxShadow: "0 4px 0 rgba(0,0,0,0.10)",
  },
  resultStatLabel: {
    fontSize: 11,
    fontWeight: 900,
    color: "#536174",
  },
  resultStatNumber: {
    fontSize: 24,
    fontWeight: 900,
    lineHeight: 1,
  },
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
  quizSetBadge: {
    position: "absolute",
    zIndex: 5,
    border: "3px solid #111",
    borderRadius: 999,
    background: "#fff3c4",
    color: "#244988",
    fontWeight: 900,
    lineHeight: 1,
    boxShadow: "0 3px 0 rgba(0,0,0,0.12)",
    pointerEvents: "none",
    whiteSpace: "nowrap",
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
    gridTemplateColumns: "132px minmax(0, 1fr)",
    gap: 18,
    height: "100%",
    alignItems: "stretch",
  },
  desktopLeftButtons: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    justifyContent: "flex-start",
    paddingTop: 132,
  },
  desktopMain: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  desktopTop: {
    display: "grid",
    gridTemplateColumns: "84px minmax(0, 1fr) 118px",
    gap: 10,
    alignItems: "start",
  },
  numberWrapDesktop: {
    display: "flex",
    justifyContent: "flex-start",
    paddingTop: 8,
    transform: "translateX(-68px)",
  },
  promptWrapDesktop: {
    minWidth: 0,
  },
  translationRowDesktop: {
    minHeight: 38,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 6,
    width: "calc(100% + 56px)",
    transform: "translateX(-56px)",
    marginLeft: "auto",
    marginRight: "auto",
  },
  desktopBottom: {
    display: "grid",
    gap: 8,
    alignItems: "start",
    flex: 1,
    minHeight: 0,
    marginTop: -6,
  },
  inputBlockDesktop: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    paddingTop: "0px",
    transform: "translateY(-16px)",
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
    gap: 6,
  },
  mobileTopRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    marginTop: -2,
    marginBottom: -2,
  },
  mobileButtonsRow: {
    display: "grid",
    gap: 8,
  },
  translationRowMobile: {
    minHeight: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  centeredButtonText: {
    width: "100%",
    textAlign: "center",
  },
  sideBlueButton: {
    border: "3px solid #111",
    borderRadius: 999,
    background: "#4d97d4",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    padding: "7px 8px",
    boxShadow: "0 4px 0 rgba(0,0,0,0.15)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontSize: 12,
    lineHeight: 1.08,
    minHeight: 62,
    justifyContent: "center",
  },
  sidePinkButton: {
    border: "3px solid #111",
    borderRadius: 999,
    background: "#cf6da2",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    padding: "7px 8px",
    boxShadow: "0 4px 0 rgba(0,0,0,0.15)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontSize: 12,
    lineHeight: 1.08,
    minHeight: 62,
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
    marginTop: 1,
    fontSize: 8,
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
    boxSizing: "border-box",
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
  targetWrapChecked: {
    paddingTop: "0.34em",
  },
  targetRubyText: {
    position: "absolute",
    left: "50%",
    top: "-0.06em",
    transform: "translateX(-50%)",
    fontSize: "0.26em",
    fontWeight: 900,
    color: "#d11f1f",
    lineHeight: 1,
    whiteSpace: "nowrap",
    pointerEvents: "none",
  },
  targetTextChecked: {
    color: "#d11f1f",
    fontWeight: 900,
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
  targetUnderlineChecked: {
    background: "#d11f1f",
    height: 12,
    left: "2%",
    right: "2%",
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
    fontSize: 20,
    marginBottom: 6,
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
    height: 64,
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
    minHeight: 46,
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
    marginTop: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    fontWeight: 900,
  },
  wrongMobile: {
    marginTop: 4,
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
    gap: 6,
    transform: "translateY(-22px)",
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
    paddingTop: 14,
    width: "100%",
    transform: "translateY(-24px)",
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
    gap: 6,
    marginBottom: -2,
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
    padding: "7px 9px 5px",
    marginTop: 6,
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
    padding: "5px 4px",
    fontSize: 11,
    fontWeight: 900,
    lineHeight: 1.15,
    borderRight: "2px solid #111",
  },
  readingHeaderKun: {
    background: "#90b7e9",
    padding: "5px 4px",
    fontSize: 11,
    fontWeight: 900,
    lineHeight: 1.15,
  },
  readingCellLeft: {
    padding: "5px 4px",
    fontSize: 13,
    fontWeight: 900,
    borderTop: "2px solid #111",
    borderRight: "2px solid #111",
    whiteSpace: "normal",
    wordBreak: "keep-all",
  },
  readingCellRight: {
    padding: "5px 4px",
    fontSize: 13,
    fontWeight: 900,
    borderTop: "2px solid #111",
    whiteSpace: "normal",
    wordBreak: "keep-all",
  },
  readingLine: {
    lineHeight: 1.18,
    marginBottom: 2,
  },
  okuriganaNote: {
    marginTop: 5,
    fontSize: 9,
    lineHeight: 1.25,
    fontWeight: 700,
    color: "#333",
  },
  bottomButtonRowDesktop: {
    display: "flex",
    justifyContent: "center",
    marginTop: 2,
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