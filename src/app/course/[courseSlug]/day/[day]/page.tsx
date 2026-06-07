"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type KanjiHint = {
  kanji: string;
  onyomi_ja: string | null;
  kunyomi_ja: string | null;
  meaning_ja: string | null;
  meaning_en: string | null;
  example_words_ja: string | null;
  example_words_en: string | null;
};

type CourseQuestion = {
  id: string;
  day_number: number;
  question_order: number;
  section: "kanji_meaning" | "vocab_reading" | string;
  quiz_type: "kanji_meaning" | "sentence_reading" | string;
  target_text: string;
  answer_text: string;
  prompt: string;
  completed_sentence: string | null;
  translation_en: string | null;
  choices_json: unknown[];
  ruby_annotations: unknown[];
  source_kanji: string | null;
  source_vocab_level: string | null;
  meaning_ja: string | null;
  meaning_en: string | null;
  explanation_ja: string | null;
  explanation_en: string | null;
  reading_source: string | null;
  example_sentence_quality: string | null;
  status: string;
  is_published: boolean;
  notes: string | null;
  kanji_hint?: KanjiHint | null;
};

type CourseResponse = {
  ok: boolean;
  preview: boolean;
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
  day?: {
    id: string;
    day_number: number;
    day_title: string;
    day_theme: string | null;
    kanji_list: string[];
    is_published: boolean;
  };
  questions?: CourseQuestion[];
  counts?: {
    total: number;
    kanji_meaning: number;
    vocab_reading: number;
  };
};

type Progress = {
  id: string;
  day_number: number;
  status: string;
  total_questions: number;
  answered_count: number;
  correct_count: number;
  incorrect_count: number;
  accuracy: number;
  completed_at: string | null;
  last_answered_at: string | null;
};

type AttemptResponse = {
  ok: boolean;
  error?: string;
  result?: {
    is_correct: boolean;
    user_answer: string;
    correct_answer: string;
    explanation_ja: string | null;
    explanation_en: string | null;
    kanji_hint: KanjiHint | null;
  };
  progress?: Progress;
};

type AttemptStatusResponse = {
  ok: boolean;
  error?: string;
  answered_question_ids?: string[];
  missed_question_ids?: string[];
  progress?: Progress | null;
};

type RubyItem = {
  text: string;
  reading: string;
};

function getParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function isMeaningQuestion(question: CourseQuestion) {
  return question.section === "kanji_meaning" || question.quiz_type === "kanji_meaning";
}

function isReadingQuestion(question: CourseQuestion) {
  return question.section === "vocab_reading" || question.quiz_type === "sentence_reading";
}

function safeChoices(value: unknown[]) {
  return value.filter((choice): choice is string => typeof choice === "string");
}

function splitExamplePairs(params: {
  ja: string | null;
  en: string | null;
}) {
  const jaItems = params.ja
    ? params.ja
        .split(/[、,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  const enItems = params.en
    ? params.en
        .split(";")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  return jaItems.slice(0, 6).map((ja, index) => ({
    ja,
    en: enItems[index] ?? "",
  }));
}

function getQuestionTypeLabel(question: CourseQuestion) {
  if (isMeaningQuestion(question)) return "Kanji meaning";
  if (isReadingQuestion(question)) return "Reading";
  return "Quiz";
}

function getQuestionInstruction(question: CourseQuestion) {
  if (isMeaningQuestion(question)) {
    return "Choose the correct meaning.";
  }

  if (isReadingQuestion(question)) {
    return "Type the reading in hiragana.";
  }

  return "Answer the question.";
}

function highlightTarget(sentence: string, targetText: string) {
  if (!sentence || !targetText || !sentence.includes(targetText)) {
    return sentence;
  }

  const parts = sentence.split(targetText);

  return parts.map((part, index) => (
    <span key={`${part}-${index}`}>
      {part}
      {index < parts.length - 1 && <mark className="targetMark">{targetText}</mark>}
    </span>
  ));
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getStringFromUnknownObject(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;

  for (const key of keys) {
    const item = record[key];

    if (typeof item === "string" && item.trim()) {
      return item.trim();
    }
  }

  return "";
}

function parseRubyAnnotations(value: unknown[]): RubyItem[] {
  if (!Array.isArray(value)) return [];

  const items: RubyItem[] = [];

  for (const item of value) {
    const text = getStringFromUnknownObject(item, [
      "text",
      "kanji",
      "target",
      "surface",
      "word",
      "base",
    ]);

    const reading = getStringFromUnknownObject(item, [
      "reading",
      "ruby",
      "furigana",
      "rt",
      "yomi",
    ]);

    if (text && reading) {
      items.push({
        text,
        reading,
      });
    }
  }

  const unique = new Map<string, RubyItem>();

  for (const item of items) {
    unique.set(`${item.text}:${item.reading}`, item);
  }

  return Array.from(unique.values()).sort((a, b) => b.text.length - a.text.length);
}

function getFallbackRubyItems(question: CourseQuestion): RubyItem[] {
  const sentence = question.completed_sentence ?? question.prompt;

  const fallbackMap: Record<string, RubyItem[]> = {
    "今夜は海の近くの旅館に泊まります。": [
      { text: "今夜", reading: "こんや" },
      { text: "海", reading: "うみ" },
      { text: "近", reading: "ちか" },
      { text: "旅館", reading: "りょかん" },
      { text: "泊", reading: "と" },
    ],
    "朝早く家を出発する予定です。": [
      { text: "朝", reading: "あさ" },
      { text: "早", reading: "はや" },
      { text: "家", reading: "いえ" },
      { text: "出発", reading: "しゅっぱつ" },
      { text: "予定", reading: "よてい" },
    ],
    "タクシーの運転手さんが駅まで送ってくれました。": [
      { text: "運転手", reading: "うんてんしゅ" },
      { text: "駅", reading: "えき" },
      { text: "送", reading: "おく" },
    ],
    "旅行中は交通ルールを守りましょう。": [
      { text: "旅行中", reading: "りょこうちゅう" },
      { text: "交通", reading: "こうつう" },
      { text: "守", reading: "まも" },
    ],
    "京都で青い着物を着てみたいです。": [
      { text: "京都", reading: "きょうと" },
      { text: "青", reading: "あお" },
      { text: "着物", reading: "きもの" },
      { text: "着", reading: "き" },
    ],
    "駅に早く着いたので、少し休みました。": [
      { text: "駅", reading: "えき" },
      { text: "早", reading: "はや" },
      { text: "着", reading: "つ" },
      { text: "少", reading: "すこ" },
      { text: "休", reading: "やす" },
    ],
  };

  return fallbackMap[sentence] ?? [];
}

function mergeRubyItems(params: {
  annotationItems: RubyItem[];
  fallbackItems: RubyItem[];
  fallbackTargetText: string;
  fallbackReading: string;
}) {
  const { annotationItems, fallbackItems, fallbackTargetText, fallbackReading } = params;

  const map = new Map<string, RubyItem>();

  for (const item of fallbackItems) {
    if (item.text && item.reading) {
      map.set(item.text, item);
    }
  }

  for (const item of annotationItems) {
    if (item.text && item.reading) {
      map.set(item.text, item);
    }
  }

  if (fallbackTargetText && fallbackReading && !map.has(fallbackTargetText)) {
    map.set(fallbackTargetText, {
      text: fallbackTargetText,
      reading: fallbackReading,
    });
  }

  return Array.from(map.values()).sort((a, b) => b.text.length - a.text.length);
}

function buildRubySentenceHtml(params: {
  sentence: string;
  rubyAnnotations: unknown[];
  fallbackRubyItems: RubyItem[];
  fallbackTargetText: string;
  fallbackReading: string;
}) {
  const {
    sentence,
    rubyAnnotations,
    fallbackRubyItems,
    fallbackTargetText,
    fallbackReading,
  } = params;

  if (!sentence) return "";

  const annotationItems = parseRubyAnnotations(rubyAnnotations);

  const usableItems = mergeRubyItems({
    annotationItems,
    fallbackItems: fallbackRubyItems,
    fallbackTargetText,
    fallbackReading,
  }).filter((item) => item.text && item.reading && sentence.includes(item.text));

  if (usableItems.length === 0) {
    return escapeHtml(sentence);
  }

  const pattern = new RegExp(
    usableItems.map((item) => escapeRegExp(item.text)).join("|"),
    "g"
  );

  const readingMap = new Map(usableItems.map((item) => [item.text, item.reading]));

  let html = "";
  let lastIndex = 0;

  for (const match of sentence.matchAll(pattern)) {
    const matchedText = match[0];
    const index = match.index ?? 0;
    const reading = readingMap.get(matchedText);

    html += escapeHtml(sentence.slice(lastIndex, index));

    if (reading) {
      html += `<ruby>${escapeHtml(matchedText)}<rt>${escapeHtml(reading)}</rt></ruby>`;
    } else {
      html += escapeHtml(matchedText);
    }

    lastIndex = index + matchedText.length;
  }

  html += escapeHtml(sentence.slice(lastIndex));

  return html;
}

function getMeaningText(question: CourseQuestion) {
  const meaningEn = question.meaning_en?.trim();
  const meaningJa = question.meaning_ja?.trim();

  if (meaningEn && meaningJa) {
    return `${meaningEn} / ${meaningJa}`;
  }

  return meaningEn || meaningJa || "";
}

function katakanaToHiragana(value: string) {
  return value.replace(/[ァ-ヶ]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
}

function normalizeAnswer(value: string) {
  return katakanaToHiragana(
    value
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[　]/g, "")
      .replace(/[。、，,.!！?？]/g, "")
  );
}

function splitCorrectAnswers(correctAnswer: string) {
  return correctAnswer
    .split(/[／/，、
;；|｜]+/g)
    .map((answer) => answer.trim())
    .filter(Boolean);
}

function getCorrectAnswerCandidates(correctAnswer: string) {
  const candidates = [correctAnswer.trim(), ...splitCorrectAnswers(correctAnswer)];
  const uniqueCandidates: string[] = [];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const normalizedCandidate = normalizeAnswer(candidate);
    const alreadyExists = uniqueCandidates.some(
      (existing) => normalizeAnswer(existing) === normalizedCandidate
    );

    if (!alreadyExists) {
      uniqueCandidates.push(candidate);
    }
  }

  return uniqueCandidates;
}

function judgeAnswer(params: {
  userAnswer: string;
  correctAnswer: string;
}) {
  const { userAnswer, correctAnswer } = params;
  const normalizedUserAnswer = normalizeAnswer(userAnswer);

  if (!normalizedUserAnswer) return false;

  return getCorrectAnswerCandidates(correctAnswer).some((answer) => {
    return normalizeAnswer(answer) === normalizedUserAnswer;
  });
}

function buildImmediateResult(params: {
  question: CourseQuestion;
  userAnswer: string;
}): NonNullable<AttemptResponse["result"]> {
  const { question, userAnswer } = params;
  const correctAnswer = question.answer_text;
  const isCorrect = judgeAnswer({ userAnswer, correctAnswer });

  return {
    is_correct: isCorrect,
    user_answer: userAnswer,
    correct_answer: correctAnswer,
    explanation_ja: question.explanation_ja,
    explanation_en: question.explanation_en,
    kanji_hint: question.kanji_hint ?? null,
  };
}

export default function CourseDayQuizPage() {
  const params = useParams();

  const courseSlug = getParamValue(params.courseSlug);
  const dayParam = getParamValue(params.day);
  const dayNumber = Number(dayParam);
  const courseHomeHref = `/course/${courseSlug}`;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [courseData, setCourseData] = useState<CourseResponse | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState("");
  const [typedAnswer, setTypedAnswer] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [answerResult, setAnswerResult] = useState<AttemptResponse["result"] | null>(null);
  const [latestProgress, setLatestProgress] = useState<Progress | null>(null);

  const [finished, setFinished] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [wrongQuestionIds, setWrongQuestionIds] = useState<string[]>([]);
  const [reviewQuestionIds, setReviewQuestionIds] = useState<string[]>([]);
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<string[]>([]);

  const allQuestions = useMemo(() => courseData?.questions ?? [], [courseData]);

  const activeQuestions = useMemo(() => {
    if (!reviewMode) return allQuestions;
    return allQuestions.filter((question) => reviewQuestionIds.includes(question.id));
  }, [allQuestions, reviewMode, reviewQuestionIds]);

  const currentQuestion = activeQuestions[currentIndex];

  const progressPercent =
    activeQuestions.length === 0
      ? 0
      : Math.round(((currentIndex + 1) / activeQuestions.length) * 100);

  const answeredPercent =
    activeQuestions.length === 0
      ? 0
      : Math.round((currentIndex / activeQuestions.length) * 100);

  useEffect(() => {
    async function loadQuestions() {
      try {
        setLoading(true);
        setLoadError("");

        if (!courseSlug || !Number.isInteger(dayNumber) || dayNumber <= 0) {
          throw new Error("Invalid course or day.");
        }

        const questionsResponse = await fetch(
          `/api/course-questions?course_slug=${encodeURIComponent(
            courseSlug
          )}&day=${dayNumber}`,
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          }
        );

        const questionsData = (await questionsResponse.json()) as CourseResponse;

        if (!questionsResponse.ok || !questionsData.ok) {
          throw new Error(questionsData.error || "Failed to load course questions.");
        }

        const questions = questionsData.questions ?? [];

        const statusResponse = await fetch(
          `/api/course-attempts?course_slug=${encodeURIComponent(
            courseSlug
          )}&day=${dayNumber}`,
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          }
        );

        const statusData = (await statusResponse.json()) as AttemptStatusResponse;

        if (!statusResponse.ok || !statusData.ok) {
          throw new Error(statusData.error || "Failed to load course progress.");
        }

        const answeredIds = statusData.answered_question_ids ?? [];
        const missedIds = statusData.missed_question_ids ?? [];

        const answeredSet = new Set(answeredIds);
        const firstUnansweredIndex = questions.findIndex(
          (question) => !answeredSet.has(question.id)
        );

        setCourseData(questionsData);
        setAnsweredQuestionIds(answeredIds);
        setWrongQuestionIds(missedIds);
        setReviewQuestionIds([]);
        setReviewMode(false);
        setLatestProgress(statusData.progress ?? null);
        setAnswerResult(null);
        setSelectedChoice("");
        setTypedAnswer("");

        if (questions.length > 0 && firstUnansweredIndex === -1) {
          setCurrentIndex(0);
          setFinished(true);
        } else {
          setCurrentIndex(firstUnansweredIndex >= 0 ? firstUnansweredIndex : 0);
          setFinished(false);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load course questions.";
        setLoadError(message);
      } finally {
        setLoading(false);
      }
    }

    loadQuestions();
  }, [courseSlug, dayNumber]);

  function resetAnswerState() {
    setSelectedChoice("");
    setTypedAnswer("");
    setAnswerResult(null);
    setSubmitting(false);
  }

  function rememberWrongQuestion(questionId: string) {
    setWrongQuestionIds((previous) => {
      if (previous.includes(questionId)) return previous;
      return [...previous, questionId];
    });
  }

  function removeWrongQuestion(questionId: string) {
    setWrongQuestionIds((previous) => previous.filter((id) => id !== questionId));
  }

  function rememberAnsweredQuestion(questionId: string) {
    setAnsweredQuestionIds((previous) => {
      if (previous.includes(questionId)) return previous;
      return [...previous, questionId];
    });
  }

  async function handleSubmit() {
    if (!currentQuestion || submitting || answerResult) return;

    const userAnswer = isMeaningQuestion(currentQuestion)
      ? selectedChoice.trim()
      : typedAnswer.trim();

    if (!userAnswer) return;

    const immediateResult = buildImmediateResult({
      question: currentQuestion,
      userAnswer,
    });

    rememberAnsweredQuestion(currentQuestion.id);

    if (immediateResult.is_correct) {
      removeWrongQuestion(currentQuestion.id);
    } else {
      rememberWrongQuestion(currentQuestion.id);
    }

    setAnswerResult(immediateResult);
    setSubmitting(true);

    try {
      const response = await fetch("/api/course-attempts", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          course_question_id: currentQuestion.id,
          user_answer: userAnswer,
        }),
      });

      const data = (await response.json()) as AttemptResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Failed to submit answer.");
      }

      const savedResult = data.result ?? immediateResult;

      if (savedResult.is_correct) {
        removeWrongQuestion(currentQuestion.id);
      } else {
        rememberWrongQuestion(currentQuestion.id);
      }

      setAnswerResult(savedResult);
      setLatestProgress(data.progress ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save answer.";
      alert(`答えは表示しましたが、保存に失敗しました。
${message}`);
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    if (currentIndex >= activeQuestions.length - 1) {
      setFinished(true);
      return;
    }

    setCurrentIndex((previous) => previous + 1);
    resetAnswerState();
  }

  function handleRestart() {
    setCurrentIndex(0);
    setFinished(false);
    setReviewMode(false);
    setReviewQuestionIds([]);
    setWrongQuestionIds([]);
    setAnsweredQuestionIds([]);
    resetAnswerState();
  }

  function handleStartReview() {
    if (wrongQuestionIds.length === 0) return;

    setReviewQuestionIds(wrongQuestionIds);
    setReviewMode(true);
    setCurrentIndex(0);
    setFinished(false);
    resetAnswerState();
  }

  function getReadingSentenceHtml(question: CourseQuestion, correctAnswer: string) {
    const sentence = question.completed_sentence ?? question.prompt;

    return buildRubySentenceHtml({
      sentence,
      rubyAnnotations: question.ruby_annotations,
      fallbackRubyItems: getFallbackRubyItems(question),
      fallbackTargetText: question.target_text,
      fallbackReading: correctAnswer,
    });
  }

  if (loading) {
    return (
      <main className="page">
        <div className="card centerCard">
          <div className="loader" />
          <p className="loadingText">Loading Day {dayParam}...</p>
        </div>

        <style jsx>{styles}</style>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="page">
        <div className="card centerCard">
          <p className="emoji">⚠️</p>
          <h1 className="title">Could not load the quiz</h1>
          <p className="errorText">{loadError}</p>

          <div className="buttonRow">
            <Link
              className="secondaryButton"
              href={`/course-login/${encodeURIComponent(courseSlug)}`}
            >
              Go to login
            </Link>
          </div>
        </div>

        <style jsx>{styles}</style>
      </main>
    );
  }

  if (!courseData?.course || !courseData.day || allQuestions.length === 0) {
    return (
      <main className="page">
        <div className="card centerCard">
          <p className="emoji">🌙</p>
          <h1 className="title">No questions yet</h1>
          <p className="subText">This day has no quiz questions.</p>
          <div className="buttonRow">
            <Link className="secondaryButton" href={courseHomeHref}>
              Back to course map
            </Link>
          </div>
        </div>

        <style jsx>{styles}</style>
      </main>
    );
  }

  if (finished) {
    const answered = latestProgress?.answered_count ?? answeredQuestionIds.length;
    const correct = latestProgress?.correct_count ?? 0;
    const incorrect = latestProgress?.incorrect_count ?? wrongQuestionIds.length;
    const accuracy = latestProgress?.accuracy ?? 0;
    const hasReview = wrongQuestionIds.length > 0;

    return (
      <main className="page">
        <section className="card finishCard">
          <p className="emoji">{hasReview ? "🌱" : "🎉"}</p>
          <p className="courseLabelDark">{courseData.course.title}</p>
          <h2 className="finishTitle">
            {reviewMode && !hasReview
              ? "Review finished!"
              : `Day ${dayNumber} finished!`}
          </h2>

          <div className="resultGrid">
            <div className="resultBox">
              <span className="resultNumber">{answered}</span>
              <span className="resultLabel">Answered</span>
            </div>
            <div className="resultBox">
              <span className="resultNumber">{correct}</span>
              <span className="resultLabel">Correct</span>
            </div>
            <div className="resultBox">
              <span className="resultNumber">{incorrect}</span>
              <span className="resultLabel">Review</span>
            </div>
            <div className="resultBox">
              <span className="resultNumber">{accuracy}%</span>
              <span className="resultLabel">Accuracy</span>
            </div>
          </div>

          {hasReview ? (
            <button className="reviewNeededButton" type="button" onClick={handleStartReview}>
              <span>Review missed questions</span>
              <small>間違えた問題だけもう一度</small>
            </button>
          ) : (
            <div className="statusBadge good">Completed</div>
          )}

          <div className="buttonRow">
            <button className="secondaryButton" type="button" onClick={handleRestart}>
              Try again
            </button>
            <Link className="primaryButton" href={courseHomeHref}>
              Back to course map
            </Link>
          </div>

          <p className="finishNote">
            You can leave now. Your progress has been saved.
          </p>
        </section>

        <style jsx>{styles}</style>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="progressArea">
        <div className="progressInfo">
          <span>
            {reviewMode ? "Review" : "Question"} {currentIndex + 1} / {activeQuestions.length}
          </span>
          <span>{progressPercent}%</span>
        </div>
        <div className="progressTrack">
          <div
            className="progressFill"
            style={{
              width: `${answerResult ? progressPercent : answeredPercent}%`,
            }}
          />
        </div>
      </section>

      <div className="topActionRow">
        <Link className="topSmallButton" href={courseHomeHref}>
          <span>保存して一時終了</span>
          <small>Save and exit</small>
        </Link>

        <Link className="topSmallButton" href={courseHomeHref}>
          <span>ホームに戻る</span>
          <small>Back to course map</small>
        </Link>
      </div>

      <section className="card quizCard">
        <div className="questionHeader">
          <span className="typeBadge">
            {reviewMode ? "Review" : getQuestionTypeLabel(currentQuestion)}
          </span>
          <span className="smallText">Day {dayNumber}</span>
        </div>

        <p className="instruction">{getQuestionInstruction(currentQuestion)}</p>

        {isMeaningQuestion(currentQuestion) ? (
          <>
            <div className="targetKanji">{currentQuestion.target_text}</div>
            <p className="promptText">{currentQuestion.prompt}</p>

            <div className="choiceList">
              {safeChoices(currentQuestion.choices_json).map((choice) => {
                const isSelected = selectedChoice === choice;
                const isCorrect =
                  answerResult && choice === answerResult.correct_answer;
                const isWrong =
                  answerResult &&
                  isSelected &&
                  choice !== answerResult.correct_answer;

                return (
                  <button
                    key={choice}
                    type="button"
                    className={[
                      "choiceButton",
                      isSelected ? "selected" : "",
                      isCorrect ? "correct" : "",
                      isWrong ? "wrong" : "",
                    ].join(" ")}
                    onClick={() => {
                      if (!answerResult) setSelectedChoice(choice);
                    }}
                    disabled={Boolean(answerResult)}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="sentenceBox">
              {highlightTarget(
                currentQuestion.completed_sentence ?? currentQuestion.prompt,
                currentQuestion.target_text
              )}
            </div>

            <label className="inputLabel" htmlFor="answer-input">
              Reading
            </label>
            <input
              id="answer-input"
              className="answerInput"
              value={typedAnswer}
              onChange={(event) => setTypedAnswer(event.target.value)}
              placeholder="ひらがなで入力"
              disabled={Boolean(answerResult)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleSubmit();
                }
              }}
            />

            <p className="hintText">
              Target: <strong>{currentQuestion.target_text}</strong>
            </p>
          </>
        )}

        {answerResult && (
          <div className={answerResult.is_correct ? "answerBox correctBox" : "answerBox wrongBox"}>
            <p className="answerTitle">
              {answerResult.is_correct ? "Correct!" : "Not quite"}
            </p>

            <p className="answerLine">
              Correct answer: <strong>{answerResult.correct_answer}</strong>
            </p>

            {answerResult.explanation_ja && (
              <p className="explanationText">{answerResult.explanation_ja}</p>
            )}

            {isReadingQuestion(currentQuestion) && getMeaningText(currentQuestion) && (
              <p className="meaningText">
                Meaning: <strong>{getMeaningText(currentQuestion)}</strong>
              </p>
            )}

            {isMeaningQuestion(currentQuestion) && answerResult.kanji_hint && (
              <div className="kanjiInfoBox">
                <div className="readingGrid">
                  <div className="readingCard">
                    <p className="readingLabel">音読み</p>
                    <p className="readingValue">
                      {answerResult.kanji_hint.onyomi_ja || "—"}
                    </p>
                  </div>

                  <div className="readingCard">
                    <p className="readingLabel">訓読み</p>
                    <p className="readingValue">
                      {answerResult.kanji_hint.kunyomi_ja || "—"}
                    </p>
                  </div>
                </div>

                {splitExamplePairs({
                  ja: answerResult.kanji_hint.example_words_ja,
                  en: answerResult.kanji_hint.example_words_en,
                }).length > 0 && (
                  <div className="exampleWordArea">
                    <p className="exampleTitle">代表的な言葉 / Example words</p>

                    <div className="examplePairList">
                      {splitExamplePairs({
                        ja: answerResult.kanji_hint.example_words_ja,
                        en: answerResult.kanji_hint.example_words_en,
                      }).map((pair) => (
                        <div className="examplePairCard" key={pair.ja}>
                          <p className="examplePairJa">{pair.ja}</p>
                          {pair.en && <p className="examplePairEn">{pair.en}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {isReadingQuestion(currentQuestion) && (
              <div className="readingAfterAnswer">
                <p
                  className="rubySentence"
                  dangerouslySetInnerHTML={{
                    __html: getReadingSentenceHtml(
                      currentQuestion,
                      answerResult.correct_answer
                    ),
                  }}
                />

                {currentQuestion.translation_en && (
                  <p className="translationAfterAnswer">{currentQuestion.translation_en}</p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="buttonRow">
          {!answerResult ? (
            <button
              className="primaryButton"
              type="button"
              onClick={handleSubmit}
              disabled={
                submitting ||
                (isMeaningQuestion(currentQuestion)
                  ? !selectedChoice
                  : !typedAnswer.trim())
              }
            >
              {submitting ? "Checking..." : "Check"}
            </button>
          ) : (
            <button className="primaryButton" type="button" onClick={handleNext}>
              {currentIndex >= activeQuestions.length - 1 ? "Finish" : "Next"}
            </button>
          )}
        </div>
      </section>

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .page {
    min-height: 100vh;
    padding: 20px;
    background:
      radial-gradient(circle at top left, rgba(255, 211, 105, 0.18), transparent 32%),
      radial-gradient(circle at bottom right, rgba(128, 169, 255, 0.18), transparent 28%),
      linear-gradient(180deg, #12162a 0%, #101424 48%, #0b1020 100%);
    color: #f8fafc;
    font-family:
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
  }

  .progressArea {
    width: min(760px, 100%);
    margin: 0 auto 10px;
    padding-top: 4px;
  }

  .progressInfo {
    display: flex;
    justify-content: space-between;
    margin-bottom: 7px;
    color: #cbd5e1;
    font-size: 13px;
    font-weight: 700;
  }

  .progressTrack {
    height: 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    overflow: hidden;
  }

  .progressFill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, #facc15, #fb923c);
    transition: width 220ms ease;
  }

  .topActionRow {
    width: min(760px, 100%);
    margin: 0 auto 12px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }

  .topSmallButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 2px;
    min-width: 132px;
    padding: 8px 12px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: #f8fafc;
    font-size: 12px;
    font-weight: 900;
    text-decoration: none;
    line-height: 1.2;
  }

  .topSmallButton small {
    color: #cbd5e1;
    font-size: 10px;
    font-weight: 800;
  }

  .topSmallButton:hover {
    background: rgba(255, 255, 255, 0.22);
  }

  .card {
    width: min(760px, 100%);
    margin: 0 auto;
    border-radius: 28px;
    background: rgba(255, 255, 255, 0.94);
    color: #111827;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.26);
  }

  .quizCard {
    padding: 22px;
  }

  .centerCard {
    min-height: 360px;
    padding: 28px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
  }

  .finishCard {
    padding: 28px 22px;
    text-align: center;
  }

  .questionHeader {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 18px;
  }

  .typeBadge {
    padding: 7px 12px;
    border-radius: 999px;
    background: #111827;
    color: #f8fafc;
    font-size: 12px;
    font-weight: 800;
  }

  .smallText {
    color: #64748b;
    font-size: 13px;
    font-weight: 700;
  }

  .instruction {
    margin: 0 0 14px;
    color: #475569;
    font-size: 14px;
    font-weight: 700;
  }

  .targetKanji {
    margin: 8px auto 16px;
    width: 122px;
    height: 122px;
    border-radius: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fef3c7;
    border: 3px solid #f59e0b;
    color: #111827;
    font-size: 68px;
    font-weight: 900;
    box-shadow: 0 12px 0 #d97706;
  }

  .promptText {
    margin: 0 0 18px;
    text-align: center;
    color: #334155;
    font-size: 18px;
    font-weight: 800;
  }

  .choiceList {
    display: grid;
    gap: 10px;
  }

  .choiceButton {
    width: 100%;
    padding: 15px 16px;
    border-radius: 18px;
    border: 2px solid #e5e7eb;
    background: #ffffff;
    color: #111827;
    font-size: 16px;
    font-weight: 800;
    text-align: left;
    cursor: pointer;
    transition:
      transform 120ms ease,
      border-color 120ms ease,
      background 120ms ease;
  }

  .choiceButton:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: #f59e0b;
    background: #fffbeb;
  }

  .choiceButton.selected {
    border-color: #f59e0b;
    background: #fef3c7;
  }

  .choiceButton.correct {
    border-color: #16a34a;
    background: #dcfce7;
  }

  .choiceButton.wrong {
    border-color: #dc2626;
    background: #fee2e2;
  }

  .choiceButton:disabled {
    cursor: default;
  }

  .sentenceBox {
    padding: 20px;
    border-radius: 20px;
    background: #f8fafc;
    border: 2px solid #e2e8f0;
    color: #111827;
    font-size: 22px;
    font-weight: 800;
    line-height: 1.65;
  }

  .targetMark {
    padding: 2px 4px;
    border-radius: 7px;
    background: #fef3c7;
    color: #111827;
  }

  .inputLabel {
    display: block;
    margin: 18px 2px 7px;
    color: #334155;
    font-size: 14px;
    font-weight: 800;
  }

  .answerInput {
    width: 100%;
    box-sizing: border-box;
    padding: 16px 18px;
    border-radius: 18px;
    border: 2px solid #cbd5e1;
    background: #ffffff;
    color: #111827;
    font-size: 22px;
    font-weight: 800;
    outline: none;
  }

  .answerInput:focus {
    border-color: #f59e0b;
    box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.16);
  }

  .hintText {
    margin: 10px 2px 0;
    color: #64748b;
    font-size: 13px;
  }

  .answerBox {
    margin-top: 18px;
    padding: 16px;
    border-radius: 20px;
    border: 2px solid;
  }

  .correctBox {
    background: #dcfce7;
    border-color: #16a34a;
  }

  .wrongBox {
    background: #fee2e2;
    border-color: #dc2626;
  }

  .answerTitle {
    margin: 0 0 6px;
    font-size: 18px;
    font-weight: 900;
  }

  .answerLine {
    margin: 0;
    font-size: 15px;
    color: #334155;
  }

  .explanationText {
    margin: 8px 0 0;
    color: #334155;
    font-size: 14px;
    line-height: 1.55;
  }

  .meaningText {
    margin: 8px 0 0;
    color: #334155;
    font-size: 14px;
    font-weight: 800;
    line-height: 1.55;
  }

  .meaningText strong {
    color: #111827;
  }

  .kanjiInfoBox {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid rgba(15, 23, 42, 0.12);
  }

  .readingGrid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .readingCard {
    padding: 13px 14px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.78);
    border: 1px solid rgba(15, 23, 42, 0.12);
  }

  .readingLabel {
    margin: 0 0 5px;
    color: #475569;
    font-size: 12px;
    font-weight: 900;
  }

  .readingValue {
    margin: 0;
    color: #111827;
    font-size: 18px;
    font-weight: 900;
    line-height: 1.45;
  }

  .exampleWordArea {
    margin-top: 10px;
  }

  .exampleTitle {
    margin: 0 0 6px;
    color: #334155;
    font-size: 12px;
    font-weight: 900;
  }

  .examplePairList {
    display: grid;
    gap: 6px;
  }

  .examplePairCard {
    padding: 7px 10px;
    border-radius: 13px;
    background: #fef3c7;
    border: 1px solid #f59e0b;
  }

  .examplePairJa {
    margin: 0;
    color: #78350f;
    font-size: 13px;
    font-weight: 900;
    line-height: 1.35;
  }

  .examplePairEn {
    margin: 2px 0 0;
    color: #92400e;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.3;
  }

  .readingAfterAnswer {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid rgba(15, 23, 42, 0.12);
  }

  .rubySentence {
    margin: 0;
    color: #111827;
    font-size: 19px;
    font-weight: 850;
    line-height: 2.35;
  }

  .rubySentence rt {
    color: #475569;
    font-size: 10px;
    font-weight: 800;
  }

  .translationAfterAnswer {
    margin: 8px 0 0;
    color: #475569;
    font-size: 14px;
    line-height: 1.5;
  }

  .buttonRow {
    display: flex;
    justify-content: center;
    gap: 10px;
    margin-top: 22px;
    flex-wrap: wrap;
  }

  .primaryButton,
  .secondaryButton {
    min-width: 150px;
    padding: 14px 20px;
    border-radius: 999px;
    font-size: 15px;
    font-weight: 900;
    text-decoration: none;
    text-align: center;
    cursor: pointer;
    border: none;
  }

  .primaryButton {
    background: linear-gradient(90deg, #facc15, #fb923c);
    color: #111827;
    box-shadow: 0 10px 0 #c2410c;
  }

  .primaryButton:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    box-shadow: none;
  }

  .secondaryButton {
    background: #e2e8f0;
    color: #111827;
  }

  .reviewNeededButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 3px;
    margin-top: 4px;
    padding: 14px 22px;
    border-radius: 999px;
    border: none;
    background: #fef3c7;
    color: #92400e;
    font-size: 15px;
    font-weight: 950;
    cursor: pointer;
  }

  .reviewNeededButton small {
    font-size: 12px;
    font-weight: 850;
  }

  .reviewNeededButton:hover {
    background: #fde68a;
  }

  .finishNote {
    margin: 16px 0 0;
    color: #64748b;
    font-size: 13px;
    font-weight: 700;
  }

  .emoji {
    margin: 0 0 10px;
    font-size: 48px;
  }

  .title {
    margin: 0 0 8px;
    font-size: 24px;
  }

  .finishTitle {
    margin: 0 0 8px;
    font-size: 28px;
  }

  .courseLabelDark {
    margin: 0 0 4px;
    color: #64748b;
    font-size: 13px;
    font-weight: 800;
  }

  .subText {
    margin: 0;
    color: #64748b;
    font-size: 15px;
    line-height: 1.6;
  }

  .errorText {
    margin: 8px 0 0;
    color: #dc2626;
    font-size: 15px;
    line-height: 1.6;
  }

  .loadingText {
    margin-top: 14px;
    color: #475569;
    font-weight: 800;
  }

  .loader {
    width: 44px;
    height: 44px;
    border-radius: 999px;
    border: 5px solid #e5e7eb;
    border-top-color: #f59e0b;
    animation: spin 800ms linear infinite;
  }

  .resultGrid {
    margin: 22px 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }

  .resultBox {
    padding: 14px 8px;
    border-radius: 18px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
  }

  .resultNumber {
    display: block;
    font-size: 22px;
    font-weight: 900;
  }

  .resultLabel {
    display: block;
    margin-top: 3px;
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
  }

  .statusBadge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 9px 14px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 900;
  }

  .statusBadge.good {
    background: #dcfce7;
    color: #166534;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 640px) {
    .page {
      padding: 14px;
    }

    .topActionRow {
      justify-content: center;
    }

    .topSmallButton {
      flex: 1;
      min-width: 130px;
    }

    .quizCard {
      padding: 18px;
      border-radius: 24px;
    }

    .targetKanji {
      width: 104px;
      height: 104px;
      border-radius: 28px;
      font-size: 58px;
    }

    .sentenceBox {
      padding: 16px;
      font-size: 19px;
    }

    .readingGrid {
      grid-template-columns: 1fr;
    }

    .rubySentence {
      font-size: 16px;
    }

    .resultGrid {
      grid-template-columns: repeat(2, 1fr);
    }

    .primaryButton,
    .secondaryButton {
      width: 100%;
    }
  }
`;