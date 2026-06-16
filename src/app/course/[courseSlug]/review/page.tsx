"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

type ReviewQuestion = {
  id: string;
  course_id: string;
  course_day_id: string;
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

  review_session_id: string;
  review_order: number;
  selection_reason:
    | "missed_multiple"
    | "missed_once"
    | "not_reviewed_yet"
    | "not_recently_seen"
    | "supplemental"
    | string;
  priority_score?: number;
};

type ReviewQuestionsResponse = {
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
  review_session_id?: string;
  counts?: {
    requested: number;
    returned: number;
    total_candidates: number;
  };
  questions?: ReviewQuestion[];
};

type ReviewAttemptResponse = {
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
  attempt?: {
    id: string;
    course_question_id: string;
    user_answer: string;
    correct_answer: string;
    is_correct: boolean;
    review_session_id: string;
    selection_reason: string;
    answered_at: string;
  };
};

type AnswerResultState = {
  questionId: string;
  result: NonNullable<ReviewAttemptResponse["result"]>;
};

type RubyItem = {
  text: string;
  reading: string;
};

function getParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

const choiceQuizTypes = new Set([
  "kanji_meaning",
  "reading_choice",
  "kanji_choice",
  "context_vocab_choice",
  "same_meaning_choice",
]);

function isMeaningQuestion(question: ReviewQuestion) {
  return (
    question.section === "kanji_meaning" ||
    question.quiz_type === "kanji_meaning"
  );
}

function isChoiceQuestion(question: ReviewQuestion) {
  return choiceQuizTypes.has(question.quiz_type);
}

function isReadingInputQuestion(question: ReviewQuestion) {
  if (isChoiceQuestion(question)) return false;

  return (
    question.section === "kanji_reading" ||
    question.section === "vocab_reading" ||
    question.quiz_type === "kanji_reading" ||
    question.quiz_type === "vocab_reading" ||
    question.quiz_type === "sentence_reading" ||
    question.section.includes("reading") ||
    question.quiz_type.includes("reading")
  );
}

function isReadingQuestion(question: ReviewQuestion) {
  if (isMeaningQuestion(question)) return false;
  if (question.quiz_type === "reading_choice") return true;

  return isReadingInputQuestion(question);
}

function shouldShowSentenceAfterAnswer(question: ReviewQuestion) {
  return !isMeaningQuestion(question) && (isReadingQuestion(question) || isChoiceQuestion(question));
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

function getQuestionTypeLabel(question: ReviewQuestion) {
  if (isMeaningQuestion(question)) return "Kanji meaning";
  if (question.quiz_type === "reading_choice") return "Reading choice";
  if (question.quiz_type === "kanji_choice") return "Kanji choice";
  if (question.quiz_type === "context_vocab_choice") return "Vocabulary choice";
  if (question.quiz_type === "same_meaning_choice") return "Meaning choice";
  if (isReadingInputQuestion(question)) return "Reading";
  return "Quiz";
}

function getQuestionInstruction(question: ReviewQuestion) {
  if (isMeaningQuestion(question)) {
    return "Choose the correct meaning.";
  }

  if (question.quiz_type === "reading_choice") {
    return "Choose the correct reading.";
  }

  if (question.quiz_type === "kanji_choice") {
    return "Choose the correct kanji.";
  }

  if (question.quiz_type === "context_vocab_choice") {
    return "Choose the best word for the sentence.";
  }

  if (question.quiz_type === "same_meaning_choice") {
    return "Choose the sentence with a similar meaning.";
  }

  if (isReadingInputQuestion(question)) {
    return "Type the reading in hiragana or romaji.";
  }

  return "Answer the question.";
}

function highlightText(params: { sentence: string; targetText: string }) {
  const { sentence, targetText } = params;

  if (!sentence || !targetText || !sentence.includes(targetText)) {
    return sentence;
  }

  const parts = sentence.split(targetText);

  return parts.map((part, index) => (
    <span key={`${part}-${index}`}>
      {part}
      {index < parts.length - 1 && (
        <mark className="targetMark">{targetText}</mark>
      )}
    </span>
  ));
}

function highlightTarget(question: ReviewQuestion) {
  return highlightText({
    sentence: question.completed_sentence ?? question.prompt,
    targetText: question.target_text,
  });
}

function isDay29Or30MixupKanjiChoice(params: {
  question: ReviewQuestion;
  courseSlug: string;
}) {
  const { question, courseSlug } = params;

  return (
    courseSlug === "n4-28days" &&
    (question.day_number === 29 || question.day_number === 30) &&
    question.section === "mini_test" &&
    question.quiz_type === "kanji_choice"
  );
}

function isKanjiOnlyRubyText(value: string) {
  // Extra Practiceでも、Day29/30の漢字選択問題だけは、送り仮名にはrubyを出さない。
  // 例：多い -> 多(おお)い、少し -> 少(すこ)し。
  return /^[一-龯々〆ヶヵ]+$/.test(value);
}

function getSafeQuestionRubyItems(question: ReviewQuestion) {
  const sentence = question.completed_sentence ?? question.prompt;
  const choices = safeChoices(question.choices_json);
  const blockedTexts = new Set([
    question.target_text,
    question.answer_text,
    ...choices,
  ]);

  return parseRubyAnnotations(question.ruby_annotations).filter((item) => {
    if (!item.text || !item.reading) return false;
    if (!isKanjiOnlyRubyText(item.text)) return false;
    if (!sentence.includes(item.text)) return false;
    if (blockedTexts.has(item.text)) return false;
    return true;
  });
}

function buildQuestionSentenceHtmlWithRuby(question: ReviewQuestion) {
  const sentence = question.completed_sentence ?? question.prompt;
  const targetText = question.target_text;
  const safeRubyItems = getSafeQuestionRubyItems(question);

  if (!sentence) return "";

  if (!targetText || !sentence.includes(targetText)) {
    return buildRubySentenceHtml({
      sentence,
      rubyAnnotations: safeRubyItems,
    });
  }

  const parts = sentence.split(targetText);
  const escapedTarget = escapeHtml(targetText);

  return parts
    .map((part, index) => {
      const partHtml = buildRubySentenceHtml({
        sentence: part,
        rubyAnnotations: safeRubyItems,
      });

      if (index >= parts.length - 1) return partHtml;
      return `${partHtml}<mark class="targetMark">${escapedTarget}</mark>`;
    })
    .join("");
}

function renderChoiceQuestionSentence(params: {
  question: ReviewQuestion;
  courseSlug: string;
}) {
  const { question, courseSlug } = params;

  // N4コースのDay29/30「まちがえやすい漢字」だけ、問題文の漢字に安全なふりがなを出す。
  // それ以外の復習問題は従来どおりにして、Day1〜28の読み問題へ影響させない。
  if (!isDay29Or30MixupKanjiChoice({ question, courseSlug })) {
    return highlightTarget(question);
  }

  return (
    <span
      className="rubySentence questionRubySentence"
      dangerouslySetInnerHTML={{
        __html: buildQuestionSentenceHtmlWithRuby(question),
      }}
    />
  );
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

function buildRubySentenceHtml(params: {
  sentence: string;
  rubyAnnotations: unknown[];
}) {
  const { sentence, rubyAnnotations } = params;

  if (!sentence) return "";

  const usableItems = parseRubyAnnotations(rubyAnnotations).filter(
    (item) => item.text && item.reading && sentence.includes(item.text)
  );

  if (usableItems.length === 0) {
    return escapeHtml(sentence);
  }

  const pattern = new RegExp(
    usableItems.map((item) => escapeRegExp(item.text)).join("|"),
    "g"
  );

  const readingMap = new Map(
    usableItems.map((item) => [item.text, item.reading])
  );

  let html = "";
  let lastIndex = 0;

  for (const match of sentence.matchAll(pattern)) {
    const matchedText = match[0];
    const index = match.index ?? 0;
    const reading = readingMap.get(matchedText);

    html += escapeHtml(sentence.slice(lastIndex, index));

    if (reading) {
      html += `<ruby>${escapeHtml(matchedText)}<rt>${escapeHtml(
        reading
      )}</rt></ruby>`;
    } else {
      html += escapeHtml(matchedText);
    }

    lastIndex = index + matchedText.length;
  }

  html += escapeHtml(sentence.slice(lastIndex));

  return html;
}

function getMeaningText(question: ReviewQuestion) {
  const meaningEn = question.meaning_en?.trim();
  const meaningJa = question.meaning_ja?.trim();

  if (meaningEn && meaningJa) {
    return `${meaningEn} / ${meaningJa}`;
  }

  return meaningEn || meaningJa || "";
}

export default function CourseReviewPage() {
  const params = useParams();

  const courseSlug = getParamValue(params.courseSlug);
  const courseHomeHref = `/course/${encodeURIComponent(courseSlug)}`;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [courseTitle, setCourseTitle] = useState("N4 30日集中対策");
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [reviewSessionId, setReviewSessionId] = useState("");

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState("");
  const [typedAnswer, setTypedAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [answerResultState, setAnswerResultState] =
    useState<AnswerResultState | null>(null);

  const [finished, setFinished] = useState(false);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  const answerInputRef = useRef<HTMLInputElement | null>(null);

  const currentQuestion = questions[currentIndex];

  const answerResult =
    answerResultState && currentQuestion?.id === answerResultState.questionId
      ? answerResultState.result
      : null;

  const loadReviewQuestions = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError("");

      if (!courseSlug) {
        throw new Error("Course slug was not found.");
      }

      const response = await fetch(
        `/api/course-review-questions?course_slug=${encodeURIComponent(
          courseSlug
        )}`,
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }
      );

      const json = (await response.json()) as ReviewQuestionsResponse;

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Failed to load review questions.");
      }

      const loadedQuestions = json.questions ?? [];

      setCourseTitle(json.course?.title ?? "N4 30日集中対策");
      setQuestions(loadedQuestions);
      setReviewSessionId(json.review_session_id ?? "");
      setCurrentIndex(0);
      setSelectedChoice("");
      setTypedAnswer("");
      setSubmitting(false);
      setAnswerResultState(null);
      setFinished(false);
      setAnsweredCount(0);
      setCorrectCount(0);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load review questions.";
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [courseSlug]);

  useEffect(() => {
    loadReviewQuestions();
  }, [loadReviewQuestions]);

  useEffect(() => {
    if (!currentQuestion) return;
    if (!isReadingInputQuestion(currentQuestion)) return;
    if (answerResult) return;
    if (finished || loading) return;

    const timer = window.setTimeout(() => {
      answerInputRef.current?.focus();
    }, 50);

    return () => {
      window.clearTimeout(timer);
    };
  }, [currentQuestion?.id, answerResult, finished, loading]);

  const progressPercent =
    questions.length === 0
      ? 0
      : Math.round(((currentIndex + 1) / questions.length) * 100);

  const answeredPercent =
    questions.length === 0
      ? 0
      : Math.round((currentIndex / questions.length) * 100);

  function resetAnswerInput() {
    setSelectedChoice("");
    setTypedAnswer("");
    setAnswerResultState(null);
    setSubmitting(false);
  }

  async function handleSubmit() {
    if (!currentQuestion || submitting || answerResult) return;

    const userAnswer = isChoiceQuestion(currentQuestion)
      ? selectedChoice.trim()
      : typedAnswer.trim();

    if (!userAnswer) return;

    try {
      setSubmitting(true);

      const response = await fetch("/api/course-review-attempts", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          course_question_id: currentQuestion.id,
          user_answer: userAnswer,
          review_session_id:
            currentQuestion.review_session_id || reviewSessionId,
          selection_reason: currentQuestion.selection_reason,
        }),
      });

      const json = (await response.json()) as ReviewAttemptResponse;

      if (!response.ok || !json.ok || !json.result) {
        throw new Error(json.error || "Failed to submit review answer.");
      }

      setAnswerResultState({
        questionId: currentQuestion.id,
        result: json.result,
      });

      setAnsweredCount((previous) => previous + 1);

      if (json.result.is_correct) {
        setCorrectCount((previous) => previous + 1);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to submit answer.";

      alert(`保存に失敗しました。\n${message}`);
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    resetAnswerInput();

    if (currentIndex >= questions.length - 1) {
      setFinished(true);
      return;
    }

    setCurrentIndex((previous) => previous + 1);
  }

  useEffect(() => {
    function handleGlobalEnter(event: KeyboardEvent) {
      if (event.key !== "Enter") return;
      if (event.isComposing) return;
      if (!answerResult) return;
      if (submitting || finished || loading) return;
      if (!currentQuestion) return;

      event.preventDefault();
      handleNext();
    }

    window.addEventListener("keydown", handleGlobalEnter);

    return () => {
      window.removeEventListener("keydown", handleGlobalEnter);
    };
  });

  async function handleTryFiveMore() {
    await loadReviewQuestions();
  }

  function getReadingSentenceHtml(question: ReviewQuestion) {
    const sentence = question.completed_sentence ?? question.prompt;

    return buildRubySentenceHtml({
      sentence,
      rubyAnnotations: question.ruby_annotations,
    });
  }

  const incorrectCount = Math.max(answeredCount - correctCount, 0);
  const accuracy =
    answeredCount === 0 ? 0 : Math.round((correctCount / answeredCount) * 100);

  if (loading) {
    return (
      <main className="page">
        <div className="card centerCard">
          <div className="loader" />
          <p className="loadingText">Loading Extra Practice...</p>
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
          <h1 className="title">Could not load Extra Practice</h1>
          <p className="errorText">{loadError}</p>

          <div className="buttonRow">
            <Link
              className="secondaryButton"
              href={`/course-login/${encodeURIComponent(courseSlug)}`}
            >
              Go to login
            </Link>

            <button
              className="primaryButton"
              type="button"
              onClick={loadReviewQuestions}
            >
              Try again
            </button>
          </div>
        </div>

        <style jsx>{styles}</style>
      </main>
    );
  }

  if (questions.length === 0) {
    return (
      <main className="page">
        <div className="card centerCard">
          <p className="emoji">🌙</p>
          <h1 className="title">No review questions yet</h1>
          <p className="subText">
            There are no questions available for Extra Practice right now.
          </p>

          <div className="buttonRow">
            <Link className="primaryButton" href={courseHomeHref}>
              Back to Home
            </Link>
          </div>
        </div>

        <style jsx>{styles}</style>
      </main>
    );
  }

  if (finished) {
    return (
      <main className="page">
        <section className="card finishCard">
          <p className="emoji">🌟</p>
          <p className="courseLabelDark">{courseTitle}</p>

          <h1 className="finishTitle">Good job!</h1>

          <p className="finishLead">
            5問の特別練習が終わりました。
            <br />
            You finished 5 Extra Practice questions.
          </p>

          <div className="resultGrid">
            <div className="resultBox">
              <span className="resultNumber">{answeredCount}</span>
              <span className="resultLabel">Answered</span>
            </div>

            <div className="resultBox">
              <span className="resultNumber">{correctCount}</span>
              <span className="resultLabel">Correct</span>
            </div>

            <div className="resultBox">
              <span className="resultNumber">{incorrectCount}</span>
              <span className="resultLabel">Review</span>
            </div>

            <div className="resultBox">
              <span className="resultNumber">{accuracy}%</span>
              <span className="resultLabel">Accuracy</span>
            </div>
          </div>

          <p className="finishNoteStrong">
            もう少しできそうなら、あと5問だけチャレンジしてみよう♪
          </p>

          <p className="finishNote">
            If you have a little more energy, try 5 more questions.
          </p>

          <div className="buttonRow">
            <button
              className="primaryButton"
              type="button"
              onClick={handleTryFiveMore}
            >
              <span>もう5問やる</span>
              <small>Try 5 More</small>
            </button>

            <Link className="secondaryButton" href={courseHomeHref}>
              <span>ホームに戻る</span>
              <small>Back to Home</small>
            </Link>
          </div>

          <p className="saveNote">
            特別練習の記録は保存されました。通常のDay進捗には影響しません。
          </p>
        </section>

        <style jsx>{styles}</style>
      </main>
    );
  }

  if (!currentQuestion) {
    return (
      <main className="page">
        <div className="card centerCard">
          <p className="emoji">⚠️</p>
          <h1 className="title">Question not found</h1>

          <div className="buttonRow">
            <Link className="primaryButton" href={courseHomeHref}>
              Back to Home
            </Link>
          </div>
        </div>

        <style jsx>{styles}</style>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="progressArea">
        <div className="progressInfo">
          <span>
            Extra Practice {currentIndex + 1} / {questions.length}
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
          <small>Back to Home</small>
        </Link>
      </div>

      <section className="card quizCard">
        <div className="questionHeader">
          <span className="typeBadge">Extra Practice</span>
          <span className="smallText">
            {getQuestionTypeLabel(currentQuestion)} / Day{" "}
            {currentQuestion.day_number}
          </span>
        </div>

        <div className="reviewIntroBox">
          <p>ちょっと余裕がある日だけの特別練習</p>
          <span>Special practice for days when you have a little extra time</span>
        </div>

        <p className="instruction">{getQuestionInstruction(currentQuestion)}</p>

        {isChoiceQuestion(currentQuestion) ? (
          <>
            {isMeaningQuestion(currentQuestion) ? (
              <>
                <div className="targetKanji">{currentQuestion.target_text}</div>
                <p className="promptText">{currentQuestion.prompt}</p>
              </>
            ) : (
              <div className="sentenceBox">
                {renderChoiceQuestionSentence({
                  question: currentQuestion,
                  courseSlug,
                })}
              </div>
            )}

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
                    disabled={Boolean(answerResult) || submitting}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="sentenceBox">{highlightTarget(currentQuestion)}</div>

            <label className="inputLabel" htmlFor="answer-input">
              Reading
            </label>

            <input
              ref={answerInputRef}
              id="answer-input"
              className="answerInput"
              value={typedAnswer}
              onChange={(event) => setTypedAnswer(event.target.value)}
              placeholder="ひらがな または romaji"
              disabled={Boolean(answerResult) || submitting}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                if (event.nativeEvent.isComposing) return;

                handleSubmit();
              }}
            />

            <p className="hintText">
              Target: <strong>{currentQuestion.target_text}</strong>
            </p>
          </>
        )}

        {answerResult && (
          <div
            className={
              answerResult.is_correct
                ? "answerBox correctBox"
                : "answerBox wrongBox"
            }
          >
            <p className="answerTitle">
              {answerResult.is_correct ? "Correct!" : "Not quite"}
            </p>

            <p className="answerLine">
              Correct answer: <strong>{answerResult.correct_answer}</strong>
            </p>

            {answerResult.explanation_ja && (
              <p className="explanationText">{answerResult.explanation_ja}</p>
            )}

            {!isMeaningQuestion(currentQuestion) && getMeaningText(currentQuestion) && (
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
                          {pair.en && (
                            <p className="examplePairEn">{pair.en}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {shouldShowSentenceAfterAnswer(currentQuestion) && (
              <div className="readingAfterAnswer">
                <p
                  className="rubySentence"
                  dangerouslySetInnerHTML={{
                    __html: getReadingSentenceHtml(currentQuestion),
                  }}
                />

                {currentQuestion.translation_en && (
                  <p className="translationAfterAnswer">
                    {currentQuestion.translation_en}
                  </p>
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
                (isChoiceQuestion(currentQuestion)
                  ? !selectedChoice
                  : !typedAnswer.trim())
              }
            >
              {submitting ? "Checking..." : "Check"}
            </button>
          ) : (
            <button className="primaryButton" type="button" onClick={handleNext}>
              {currentIndex >= questions.length - 1 ? "Finish" : "Next"}
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
      radial-gradient(circle at top left, rgba(196, 181, 253, 0.22), transparent 32%),
      radial-gradient(circle at bottom right, rgba(251, 191, 36, 0.18), transparent 28%),
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
    background: linear-gradient(90deg, #c084fc, #facc15);
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
    margin-bottom: 14px;
  }

  .typeBadge {
    padding: 7px 12px;
    border-radius: 999px;
    background: #581c87;
    color: #f8fafc;
    font-size: 12px;
    font-weight: 900;
  }

  .smallText {
    color: #64748b;
    font-size: 13px;
    font-weight: 700;
  }

  .reviewIntroBox {
    margin: 0 0 16px;
    padding: 12px 14px;
    border-radius: 18px;
    background: linear-gradient(135deg, #faf5ff, #fffbeb);
    border: 1px solid #e9d5ff;
  }

  .reviewIntroBox p {
    margin: 0 0 4px;
    color: #581c87;
    font-size: 15px;
    font-weight: 950;
  }

  .reviewIntroBox span {
    color: #6b7280;
    font-size: 12px;
    font-weight: 800;
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
    border-color: #c084fc;
    background: #faf5ff;
  }

  .choiceButton.selected {
    border-color: #7c3aed;
    background: #f3e8ff;
  }

  .choiceButton.correct {
    border-color: #22c55e;
    background: #dcfce7;
  }

  .choiceButton.wrong {
    border-color: #ef4444;
    background: #fee2e2;
  }

  .choiceButton:disabled {
    cursor: default;
  }

  .sentenceBox {
    margin: 4px 0 18px;
    padding: 20px 18px;
    border-radius: 22px;
    background: #f8fafc;
    border: 2px solid #e2e8f0;
    color: #111827;
    font-size: 24px;
    font-weight: 900;
    line-height: 1.7;
    text-align: center;
  }

  .targetMark {
    padding: 1px 5px;
    border-radius: 8px;
    background: #fde68a;
    color: #7c2d12;
  }

  .inputLabel {
    display: block;
    margin: 0 0 7px;
    color: #475569;
    font-size: 13px;
    font-weight: 900;
  }

  .answerInput {
    width: 100%;
    box-sizing: border-box;
    padding: 16px 16px;
    border-radius: 18px;
    border: 2px solid #cbd5e1;
    background: #ffffff;
    color: #111827;
    font-size: 20px;
    font-weight: 900;
    outline: none;
  }

  .answerInput:focus {
    border-color: #7c3aed;
    box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.16);
  }

  .hintText {
    margin: 9px 0 0;
    color: #64748b;
    font-size: 13px;
    font-weight: 700;
  }

  .answerBox {
    margin-top: 18px;
    padding: 16px;
    border-radius: 22px;
    border: 2px solid transparent;
  }

  .correctBox {
    background: #dcfce7;
    border-color: #22c55e;
  }

  .wrongBox {
    background: #fee2e2;
    border-color: #ef4444;
  }

  .answerTitle {
    margin: 0 0 8px;
    color: #111827;
    font-size: 20px;
    font-weight: 950;
  }

  .answerLine {
    margin: 0 0 8px;
    color: #1f2937;
    font-size: 15px;
    font-weight: 800;
  }

  .explanationText {
    margin: 9px 0 0;
    color: #334155;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.55;
  }

  .meaningText {
    margin: 9px 0 0;
    color: #334155;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.55;
  }

  .kanjiInfoBox {
    margin-top: 14px;
    padding: 14px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.62);
  }

  .readingGrid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .readingCard {
    padding: 12px;
    border-radius: 16px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
  }

  .readingLabel {
    margin: 0 0 5px;
    color: #64748b;
    font-size: 12px;
    font-weight: 900;
  }

  .readingValue {
    margin: 0;
    color: #111827;
    font-size: 16px;
    font-weight: 950;
  }

  .exampleWordArea {
    margin-top: 12px;
  }

  .exampleTitle {
    margin: 0 0 8px;
    color: #475569;
    font-size: 13px;
    font-weight: 900;
  }

  .examplePairList {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .examplePairCard {
    padding: 10px;
    border-radius: 14px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
  }

  .examplePairJa {
    margin: 0;
    color: #111827;
    font-size: 14px;
    font-weight: 950;
  }

  .examplePairEn {
    margin: 4px 0 0;
    color: #64748b;
    font-size: 12px;
    font-weight: 700;
  }

  .readingAfterAnswer {
    margin-top: 14px;
    padding: 14px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.65);
  }

  .rubySentence {
    margin: 0;
    color: #111827;
    font-size: 20px;
    font-weight: 900;
    line-height: 1.9;
    text-align: center;
  }

  .rubySentence rt {
    color: #7c3aed;
    font-size: 11px;
    font-weight: 900;
  }

  .questionRubySentence {
    display: block;
    font-size: 24px;
    line-height: 1.9;
  }

  .questionRubySentence rt {
    font-size: 11px;
  }

  .translationAfterAnswer {
    margin: 10px 0 0;
    color: #475569;
    font-size: 13px;
    font-weight: 700;
    line-height: 1.5;
    text-align: center;
  }

  .buttonRow {
    margin-top: 18px;
    display: flex;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .primaryButton,
  .secondaryButton {
    min-width: 170px;
    min-height: 52px;
    padding: 13px 18px;
    border-radius: 999px;
    border: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 2px;
    font-size: 16px;
    font-weight: 950;
    text-decoration: none;
    cursor: pointer;
    line-height: 1.2;
  }

  .primaryButton {
    background: linear-gradient(180deg, #a855f7, #7c3aed);
    color: #ffffff;
    box-shadow: 0 8px 0 #581c87;
  }

  .primaryButton:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .primaryButton:disabled {
    opacity: 0.55;
    cursor: default;
    box-shadow: none;
  }

  .secondaryButton {
    background: #e5e7eb;
    color: #111827;
    box-shadow: 0 8px 0 #cbd5e1;
  }

  .primaryButton small,
  .secondaryButton small {
    font-size: 11px;
    font-weight: 800;
    opacity: 0.9;
  }

  .emoji {
    margin: 0 0 10px;
    font-size: 54px;
  }

  .title {
    margin: 0 0 10px;
    color: #111827;
    font-size: 26px;
    font-weight: 950;
  }

  .subText,
  .errorText {
    margin: 0;
    color: #475569;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.6;
  }

  .errorText {
    color: #b91c1c;
  }

  .courseLabelDark {
    margin: 0 0 8px;
    color: #581c87;
    font-size: 14px;
    font-weight: 950;
  }

  .finishTitle {
    margin: 0 0 10px;
    color: #111827;
    font-size: 34px;
    font-weight: 950;
  }

  .finishLead {
    margin: 0 auto 18px;
    color: #475569;
    font-size: 16px;
    font-weight: 800;
    line-height: 1.65;
  }

  .resultGrid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin: 18px 0;
  }

  .resultBox {
    padding: 13px 8px;
    border-radius: 18px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
  }

  .resultNumber {
    display: block;
    color: #7c3aed;
    font-size: 28px;
    font-weight: 950;
    line-height: 1.1;
  }

  .resultLabel {
    display: block;
    margin-top: 5px;
    color: #64748b;
    font-size: 11px;
    font-weight: 900;
  }

  .finishNoteStrong {
    margin: 18px 0 4px;
    color: #111827;
    font-size: 16px;
    font-weight: 950;
    line-height: 1.55;
  }

  .finishNote {
    margin: 0;
    color: #64748b;
    font-size: 14px;
    font-weight: 800;
    line-height: 1.55;
  }

  .saveNote {
    margin: 18px 0 0;
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
    line-height: 1.55;
  }

  .loader {
    width: 42px;
    height: 42px;
    border: 5px solid #e5e7eb;
    border-top-color: #7c3aed;
    border-radius: 999px;
    animation: spin 800ms linear infinite;
  }

  .loadingText {
    margin: 14px 0 0;
    color: #475569;
    font-size: 15px;
    font-weight: 800;
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

    .quizCard,
    .finishCard {
      padding: 18px;
      border-radius: 24px;
    }

    .questionHeader {
      align-items: flex-start;
      flex-direction: column;
      gap: 8px;
    }

    .sentenceBox {
      font-size: 21px;
      padding: 18px 14px;
    }

    .targetKanji {
      width: 112px;
      height: 112px;
      font-size: 62px;
    }

    .resultGrid {
      grid-template-columns: repeat(2, 1fr);
    }

    .readingGrid {
      grid-template-columns: 1fr;
    }

    .examplePairList {
      grid-template-columns: 1fr;
    }

    .primaryButton,
    .secondaryButton {
      width: 100%;
    }

    .topActionRow {
      justify-content: stretch;
    }

    .topSmallButton {
      flex: 1;
      min-width: 0;
    }
  }
`;