"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { judgeReadingAnswer } from "@/lib/readingAnswerJudge";
import { judgeKanjiWritingAnswer } from "@/lib/kanjiWritingAnswerJudge";

type ReviewKind = "meaning" | "reading" | "writing";

type SelectionReason =
  | "missed_multiple"
  | "missed_once"
  | "not_reviewed_yet"
  | "not_recently_seen"
  | "supplemental";

type BaseQuestion = {
  selection_reason: SelectionReason;
  unit?: string | null;
  set_number?: number | null;
  order_in_unit?: number | null;
  difficulty_tier?: string | null;
};

type MeaningQuestion = BaseQuestion & {
  quiz_type: "meaning_choice";
  id: string;
  kanji: string;
  target_text: string;
  correct_answer: string;
  meaning_en: string;
  meaning_ja: string;
  onyomi_ja: string;
  kunyomi_ja: string;
  example_words_ja: string;
  example_words_en: string;
  choices: string[];
};

type InputQuestion = BaseQuestion & {
  quiz_type: "reading_input" | "writing_input";
  id: number;
  question_id: number;
  prompt: string;
  translation_en: string;
  target_text: string;
  target_ruby: string;
  answer_text: string;
  answer_aliases: unknown;
  ruby_annotations: unknown;
  meaning_ja: string;
  meaning_en: string;
  hint_ja: string;
  hint_en: string;
  explanation_ja: string;
  explanation_en: string;
  correct_answer: string;
  kanji_order_in_unit?: number | null;
  reading_variant_order?: number | null;
};

type ReviewQuestion = MeaningQuestion | InputQuestion;

type ApiResponse = {
  ok: boolean;
  error?: string;
  reviewSessionId?: string;
  quiz_type?: string;
  questions?: ReviewQuestion[];
};

type Props = {
  kind: ReviewKind;
  titleJa: string;
  titleEn: string;
  descriptionJa: string;
  descriptionEn: string;
  questionsApi: string;
  attemptsApi: string;
  backHref: string;
  backLabel: string;
};

type CheckedResult = {
  isCorrect: boolean;
  userAnswer: string;
  saved: boolean;
  saveError: string;
};

type RubyEntry = {
  text: string;
  ruby: string;
};

function normalizeText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeForLooseCompare(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  if (!contentType.includes("application/json")) {
    const preview = text.slice(0, 300).replace(/\s+/g, " ");

    throw new Error(
      `API returned non-JSON response. status=${response.status}. ` +
        `This usually means the API route is missing, has a server error, or returned an HTML page. ` +
        `Preview: ${preview}`,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `API returned invalid JSON. status=${response.status}. Preview: ${text.slice(
        0,
        300,
      )}`,
    );
  }
}

function getQuestionKey(question: ReviewQuestion): string {
  if (question.quiz_type === "meaning_choice") {
    return `meaning:${question.kanji}`;
  }

  return `${question.quiz_type}:${question.question_id}`;
}

function getLevelLabel(unit: string | null | undefined): string {
  const unitText = normalizeText(unit);
  const match = unitText.match(/^grade(\d+)-kanji-/);

  if (!match) return "";

  return `Lv.${match[1]}`;
}

function getTinyLocationLabel(question: ReviewQuestion): string {
  const parts: string[] = [];
  const level = getLevelLabel(question.unit);

  if (level) parts.push(level);
  if (question.unit) parts.push(question.unit);
  if (question.set_number) parts.push(`Set ${question.set_number}`);

  return parts.join(" / ");
}

function parseRubyAnnotations(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => normalizeText(item)).filter(Boolean);
      }
    } catch {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function parseRubyEntries(value: unknown): RubyEntry[] {
  const annotations = parseRubyAnnotations(value);

  const entries = annotations
    .map((item) => {
      const [rawText, ...rubyParts] = item.split(":");
      const text = normalizeText(rawText);
      const ruby = normalizeText(rubyParts.join(":"));

      return { text, ruby };
    })
    .filter((entry) => entry.text && entry.ruby);

  const seen = new Set<string>();
  const uniqueEntries: RubyEntry[] = [];

  for (const entry of entries) {
    const key = `${entry.text}::${entry.ruby}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueEntries.push(entry);
  }

  return uniqueEntries.sort((a, b) => b.text.length - a.text.length);
}

function isTargetRubyEntry(entryText: string, targetText: string) {
  const entry = normalizeText(entryText);
  const target = normalizeText(targetText);

  if (!entry || !target) return false;

  return entry === target || target.includes(entry) || entry.includes(target);
}

function judgeQuestion(
  kind: ReviewKind,
  question: ReviewQuestion,
  userAnswer: string,
): boolean {
  if (kind === "meaning" && question.quiz_type === "meaning_choice") {
    return (
      normalizeForLooseCompare(userAnswer) ===
      normalizeForLooseCompare(question.correct_answer)
    );
  }

  if (kind === "reading" && question.quiz_type === "reading_input") {
    return judgeReadingAnswer({
      userAnswer,
      answerText: question.answer_text,
      answerAliases: question.answer_aliases ?? [],
    });
  }

  if (kind === "writing" && question.quiz_type === "writing_input") {
    return judgeKanjiWritingAnswer({
      userAnswer,
      targetText: question.target_text,
    });
  }

  return false;
}

function getFallbackRubyText(question: InputQuestion): string {
  const targetRuby = normalizeText(question.target_ruby);
  if (targetRuby) return targetRuby;

  const answerText = normalizeText(question.answer_text);
  if (answerText) return answerText;

  return normalizeText(question.correct_answer);
}

function renderHighlightedText(params: {
  text: string;
  targetText: string;
  displayText?: string;
  rubyText?: string;
}) {
  const safeText = normalizeText(params.text);
  const safeTarget = normalizeText(params.targetText);
  const safeDisplay = normalizeText(params.displayText) || safeTarget;
  const safeRuby = normalizeText(params.rubyText);

  if (!safeText) return null;

  if (!safeTarget || !safeText.includes(safeTarget)) {
    return <>{safeText}</>;
  }

  const parts = safeText.split(safeTarget);

  return (
    <>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {part}
          {index < parts.length - 1 &&
            (safeRuby ? (
              <ruby className="inlineRuby inlineRubyTarget">
                <span className="targetHighlight">{safeDisplay}</span>
                <rt>{safeRuby}</rt>
              </ruby>
            ) : (
              <span className="targetHighlight">{safeDisplay}</span>
            ))}
        </span>
      ))}
    </>
  );
}

function renderTextWithRubyAnnotations(params: {
  text: string;
  rubyEntries: RubyEntry[];
  targetText: string;
  fallbackRubyText?: string;
}) {
  const safeText = normalizeText(params.text);
  const safeTarget = normalizeText(params.targetText);
  const fallbackRuby = normalizeText(params.fallbackRubyText);

  if (!safeText) return null;

  const entries = [...params.rubyEntries];

  if (
    safeTarget &&
    fallbackRuby &&
    !entries.some((entry) => isTargetRubyEntry(entry.text, safeTarget))
  ) {
    entries.unshift({
      text: safeTarget,
      ruby: fallbackRuby,
    });
  }

  if (entries.length === 0) {
    return renderHighlightedText({
      text: safeText,
      targetText: safeTarget,
      displayText: safeTarget,
      rubyText: fallbackRuby,
    });
  }

  const nodes: React.ReactNode[] = [];
  let index = 0;

  while (index < safeText.length) {
    const matched = entries.find((entry) => safeText.startsWith(entry.text, index));

    if (!matched) {
      nodes.push(
        <span key={`text-${index}`}>
          {safeText[index]}
        </span>,
      );
      index += 1;
      continue;
    }

    const isTarget = isTargetRubyEntry(matched.text, safeTarget);

    nodes.push(
      <ruby
        key={`ruby-${index}-${matched.text}-${matched.ruby}`}
        className={isTarget ? "inlineRuby inlineRubyTarget" : "inlineRuby inlineRubyNormal"}
      >
        <span className={isTarget ? "targetHighlight" : "normalRubyBase"}>
          {matched.text}
        </span>
        <rt>{matched.ruby}</rt>
      </ruby>,
    );

    index += matched.text.length;
  }

  return <>{nodes}</>;
}

function renderWritingPromptBeforeCheck(question: InputQuestion) {
  const prompt = normalizeText(question.prompt);
  const targetText = normalizeText(question.target_text);
  const answerText = normalizeText(question.answer_text);

  if (!prompt) return null;

  if (targetText && answerText && prompt.includes(targetText)) {
    return renderHighlightedText({
      text: prompt,
      targetText,
      displayText: answerText,
    });
  }

  if (answerText && prompt.includes(answerText)) {
    return renderHighlightedText({
      text: prompt,
      targetText: answerText,
      displayText: answerText,
    });
  }

  return <>{prompt}</>;
}

function renderReadingPromptBeforeCheck(question: InputQuestion) {
  return renderHighlightedText({
    text: question.prompt,
    targetText: question.target_text,
    displayText: question.target_text,
  });
}

function renderPromptAfterCheck(question: InputQuestion) {
  const rubyEntries = parseRubyEntries(question.ruby_annotations);
  const fallbackRuby = getFallbackRubyText(question);

  return renderTextWithRubyAnnotations({
    text: question.prompt,
    rubyEntries,
    targetText: question.target_text,
    fallbackRubyText: fallbackRuby,
  });
}

export default function KanjiRandomReviewClient({
  kind,
  titleJa,
  titleEn,
  descriptionJa,
  descriptionEn,
  questionsApi,
  attemptsApi,
  backHref,
  backLabel,
}: Props) {
  const answerInputRef = useRef<HTMLInputElement | null>(null);
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [reviewSessionId, setReviewSessionId] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checkedResults, setCheckedResults] = useState<
    Record<string, CheckedResult>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [isFinished, setIsFinished] = useState(false);
  const [isComposing, setIsComposing] = useState(false);

  const currentQuestion = questions[currentIndex] ?? null;
  const currentKey = currentQuestion ? getQuestionKey(currentQuestion) : "";
  const currentAnswer = answers[currentKey] ?? "";
  const currentResult = checkedResults[currentKey] ?? null;

  const correctCount = useMemo(() => {
    return Object.values(checkedResults).filter((result) => result.isCorrect)
      .length;
  }, [checkedResults]);

  useEffect(() => {
    if (
      !isLoading &&
      !isFinished &&
      currentQuestion &&
      currentQuestion.quiz_type !== "meaning_choice" &&
      !currentResult
    ) {
      window.setTimeout(() => {
        answerInputRef.current?.focus();
      }, 80);
    }
  }, [currentIndex, currentQuestion, currentResult, isFinished, isLoading]);

  async function loadQuestions() {
    setIsLoading(true);
    setLoadError("");
    setIsFinished(false);
    setCurrentIndex(0);
    setAnswers({});
    setCheckedResults({});

    try {
      const response = await fetch(questionsApi, {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });

      const data = await readJsonResponse<ApiResponse>(response);

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Failed to load random review questions.");
      }

      setQuestions(Array.isArray(data.questions) ? data.questions : []);
      setReviewSessionId(data.reviewSessionId || "");
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Failed to load random review questions.",
      );
      setQuestions([]);
      setReviewSessionId("");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionsApi]);

  async function saveAttempt(params: {
    question: ReviewQuestion;
    userAnswer: string;
  }) {
    const payload =
      kind === "meaning" && params.question.quiz_type === "meaning_choice"
        ? {
            reviewSessionId,
            attempts: [
              {
                kanji: params.question.kanji,
                user_answer: params.userAnswer,
                selection_reason: params.question.selection_reason,
              },
            ],
          }
        : {
            reviewSessionId,
            attempts: [
              {
                question_id:
                  params.question.quiz_type === "meaning_choice"
                    ? undefined
                    : params.question.question_id,
                user_answer: params.userAnswer,
                selection_reason: params.question.selection_reason,
              },
            ],
          };

    const response = await fetch(attemptsApi, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await readJsonResponse<{ ok?: boolean; error?: string }>(
      response,
    );

    if (!response.ok || data?.ok === false) {
      throw new Error(data?.error || "Failed to save this answer.");
    }
  }

  async function handleCheck() {
    if (!currentQuestion || currentResult || isSaving) return;

    const userAnswer = normalizeText(currentAnswer);

    if (!userAnswer) return;

    const isCorrect = judgeQuestion(kind, currentQuestion, userAnswer);

    setCheckedResults((prev) => ({
      ...prev,
      [currentKey]: {
        isCorrect,
        userAnswer,
        saved: false,
        saveError: "",
      },
    }));

    setIsSaving(true);

    try {
      await saveAttempt({
        question: currentQuestion,
        userAnswer,
      });

      setCheckedResults((prev) => ({
        ...prev,
        [currentKey]: {
          ...(prev[currentKey] ?? {
            isCorrect,
            userAnswer,
            saved: false,
            saveError: "",
          }),
          saved: true,
          saveError: "",
        },
      }));
    } catch (error) {
      setCheckedResults((prev) => ({
        ...prev,
        [currentKey]: {
          ...(prev[currentKey] ?? {
            isCorrect,
            userAnswer,
            saved: false,
            saveError: "",
          }),
          saved: false,
          saveError:
            error instanceof Error
              ? error.message
              : "Failed to save this answer.",
        },
      }));
    } finally {
      setIsSaving(false);
    }
  }

  function handleNext() {
    if (isSaving) return;

    if (currentIndex >= questions.length - 1) {
      setIsFinished(true);
      return;
    }

    setCurrentIndex((prev) => prev + 1);
  }

  function handleGlobalEnter() {
    if (isComposing || isSaving) return;
    if (!currentQuestion) return;

    if (currentResult) {
      handleNext();
      return;
    }

    if (currentAnswer.trim()) {
      void handleCheck();
    }
  }

  useEffect(() => {
    function onWindowKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter") return;
      if (event.isComposing || isComposing) return;
      if (isLoading || isFinished || isSaving) return;
      if (!currentQuestion) return;

      event.preventDefault();
      handleGlobalEnter();
    }

    window.addEventListener("keydown", onWindowKeyDown);

    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentAnswer,
    currentIndex,
    currentQuestion,
    currentResult,
    isComposing,
    isFinished,
    isLoading,
    isSaving,
  ]);

  function renderQuestionPrompt(question: ReviewQuestion) {
    if (question.quiz_type === "meaning_choice") {
      return (
        <div className="meaningPrompt">
          <div className="kanjiTarget">{question.kanji}</div>
          <p className="smallGuide">この漢字の意味はどれですか。</p>
          <p className="smallGuideEn">Choose the meaning of this kanji.</p>
        </div>
      );
    }

    const isChecked = Boolean(currentResult);

    if (question.quiz_type === "writing_input") {
      return (
        <div className="promptWrapper">
          <p className="promptText">
            {isChecked
              ? renderPromptAfterCheck(question)
              : renderWritingPromptBeforeCheck(question)}
          </p>

          {isChecked && question.translation_en && (
            <p className="translationText">{question.translation_en}</p>
          )}

          {!isChecked && (
            <>
              <p className="smallGuide">
                赤いひらがなの部分を、漢字で入力してください。
              </p>
              <p className="smallGuideEn">
                Type the kanji for the red hiragana part.
              </p>
            </>
          )}
        </div>
      );
    }

    return (
      <div className="promptWrapper">
        <p className="promptText">
          {isChecked
            ? renderPromptAfterCheck(question)
            : renderReadingPromptBeforeCheck(question)}
        </p>

        {isChecked && question.translation_en && (
          <p className="translationText">{question.translation_en}</p>
        )}

        {!isChecked && (
          <>
            <p className="smallGuide">赤い部分の読み方を入力してください。</p>
            <p className="smallGuideEn">Type the reading of the red target part.</p>
          </>
        )}
      </div>
    );
  }

  function renderAnswerArea(question: ReviewQuestion) {
    if (question.quiz_type === "meaning_choice") {
      return (
        <div className="choiceGrid">
          {question.choices.map((choice) => {
            const isSelected = currentAnswer === choice;

            return (
              <button
                key={choice}
                type="button"
                className={`choiceButton ${isSelected ? "selectedChoice" : ""}`}
                disabled={Boolean(currentResult)}
                onClick={() =>
                  setAnswers((prev) => ({
                    ...prev,
                    [currentKey]: choice,
                  }))
                }
              >
                {choice}
              </button>
            );
          })}
        </div>
      );
    }

    return (
      <input
        ref={answerInputRef}
        className="answerInput"
        value={currentAnswer}
        disabled={Boolean(currentResult)}
        placeholder={
          question.quiz_type === "reading_input"
            ? "例：やま / yama"
            : "例：山"
        }
        onChange={(event) =>
          setAnswers((prev) => ({
            ...prev,
            [currentKey]: event.target.value,
          }))
        }
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
      />
    );
  }

  function renderResult(question: ReviewQuestion, result: CheckedResult) {
    return (
      <div className={`resultBox ${result.isCorrect ? "correct" : "wrong"}`}>
        <p className="resultTitle">
          {result.isCorrect ? "Correct! 🎉" : "Almost! Let’s review."}
        </p>

        {question.quiz_type === "meaning_choice" && (
          <div className="simpleExplanation">
            <p>
              <strong>{question.kanji}</strong> は{" "}
              <strong>{question.meaning_en}</strong> という意味です。
            </p>
            {question.meaning_ja && <p>{question.meaning_ja}</p>}
          </div>
        )}

        {question.quiz_type === "reading_input" && (
          <div className="simpleExplanation">
            <p>
              <strong>{question.target_text}</strong> は{" "}
              <strong>{question.meaning_en || "この文の中のターゲット"}</strong>{" "}
              という意味です。
            </p>
            {question.meaning_ja && <p>{question.meaning_ja}</p>}
          </div>
        )}

        {question.quiz_type === "writing_input" && (
          <div className="simpleExplanation">
            <p>
              <strong>{question.target_text}</strong> は{" "}
              <strong>{question.meaning_en || question.answer_text}</strong>{" "}
              という意味です。
            </p>
          </div>
        )}

        {result.saveError && (
          <p className="saveError">
            保存に失敗しました。画面を更新せず、このエラーを教えてください。
            <br />
            {result.saveError}
          </p>
        )}

        {result.saved && <p className="savedText">Saved.</p>}
      </div>
    );
  }

  if (isLoading) {
    return (
      <main className="pageShell">
        <div className="card">
          <p className="loadingText">Loading random review...</p>
        </div>

        <style jsx>{styles}</style>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="pageShell">
        <div className="card">
          <h1 className="titleJa">読み込みできませんでした</h1>
          <p className="errorText">{loadError}</p>
          <div className="buttonRow">
            <button type="button" className="primaryButton" onClick={loadQuestions}>
              もう一度読み込む / Try Again
            </button>
            <Link href={backHref} className="secondaryButton">
              {backLabel}
            </Link>
          </div>
        </div>

        <style jsx>{styles}</style>
      </main>
    );
  }

  if (questions.length === 0) {
    return (
      <main className="pageShell">
        <div className="card">
          <h1 className="titleJa">復習できる問題がありません</h1>
          <p className="descriptionJa">
            まだ通常クイズの履歴が少ないか、問題を読み込めませんでした。
          </p>
          <p className="descriptionEn">
            There are no review questions available yet.
          </p>
          <Link href={backHref} className="primaryButton">
            {backLabel}
          </Link>
        </div>

        <style jsx>{styles}</style>
      </main>
    );
  }

  if (isFinished) {
    return (
      <main className="pageShell">
        <div className="card finishCard">
          <p className="finishIcon">🌸</p>
          <h1 className="titleJa">Good job!</h1>
          <p className="descriptionJa">5問のランダム復習が終わりました。</p>
          <p className="descriptionEn">
            You finished 5 random review questions.
          </p>
          <p className="scoreText">
            Score: {correctCount} / {questions.length}
          </p>
          <p className="descriptionJa">
            もう少しできそうなら、あと5問だけチャレンジしてみよう♪
          </p>
          <p className="descriptionEn">
            If you have a little more energy, try 5 more questions.
          </p>

          <div className="buttonRow">
            <button type="button" className="primaryButton" onClick={loadQuestions}>
              もう5問やる / Try 5 More
            </button>
            <Link href={backHref} className="secondaryButton">
              {backLabel}
            </Link>
          </div>
        </div>

        <style jsx>{styles}</style>
      </main>
    );
  }

  return (
    <main className="pageShell">
      <section className="card">
        <div className="topMeta">
          <span>
            {currentIndex + 1} / {questions.length}
          </span>
          {currentQuestion && (
            <span>{getTinyLocationLabel(currentQuestion)}</span>
          )}
        </div>

        <div className="headerBlock">
          <h1 className="titleJa">{titleJa}</h1>
          <p className="titleEn">{titleEn}</p>
          <p className="descriptionJa">{descriptionJa}</p>
          <p className="descriptionEn">{descriptionEn}</p>
        </div>

        {currentQuestion && (
          <div className="questionBlock">
            {renderQuestionPrompt(currentQuestion)}
            {renderAnswerArea(currentQuestion)}

            {!currentResult && (
              <button
                type="button"
                className="primaryButton fullButton"
                disabled={!currentAnswer.trim() || isSaving}
                onClick={handleCheck}
              >
                Check
              </button>
            )}

            {currentResult && renderResult(currentQuestion, currentResult)}

            {currentResult && (
              <button
                type="button"
                className="primaryButton fullButton"
                disabled={isSaving}
                onClick={handleNext}
              >
                {currentIndex >= questions.length - 1
                  ? "Finish"
                  : "Next Question"}
              </button>
            )}
          </div>
        )}

        <div className="bottomNav">
          <Link href={backHref}>{backLabel}</Link>
        </div>
      </section>

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .pageShell {
    min-height: 100vh;
    padding: 24px 14px;
    background:
      radial-gradient(circle at top left, rgba(255, 233, 238, 0.9), transparent 32%),
      linear-gradient(180deg, #fff8fb 0%, #f7fbff 100%);
    color: #1f2937;
  }

  .card {
    width: 100%;
    max-width: 720px;
    margin: 0 auto;
    padding: 22px;
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 14px 36px rgba(31, 41, 55, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.8);
  }

  .finishCard {
    text-align: center;
  }

  .finishIcon {
    font-size: 42px;
    margin: 0 0 8px;
  }

  .topMeta {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 14px;
    color: #9ca3af;
    font-size: 11px;
    line-height: 1.4;
  }

  .headerBlock {
    margin-bottom: 22px;
  }

  .titleJa {
    margin: 0;
    font-size: 24px;
    line-height: 1.35;
    color: #111827;
  }

  .titleEn {
    margin: 4px 0 14px;
    color: #6b7280;
    font-size: 14px;
  }

  .descriptionJa {
    margin: 0 0 4px;
    font-size: 15px;
    line-height: 1.7;
  }

  .descriptionEn {
    margin: 0;
    color: #6b7280;
    font-size: 13px;
    line-height: 1.6;
  }

  .questionBlock {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .meaningPrompt {
    text-align: center;
  }

  .kanjiTarget {
    font-size: 72px;
    line-height: 1.1;
    font-weight: 800;
    color: #111827;
    margin: 10px 0;
  }

  .promptWrapper {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .promptText {
    margin: 0;
    padding: 18px;
    border-radius: 18px;
    background: #f9fafb;
    font-size: 22px;
    line-height: 2.05;
    text-align: center;
    color: #111827;
  }

  .inlineRuby {
    ruby-position: over;
  }

  .inlineRuby rt {
    font-weight: 800;
    letter-spacing: 0.04em;
  }

  .inlineRubyTarget rt {
    color: #ef4444;
    font-size: 12px;
  }

  .inlineRubyNormal rt {
    color: #111827;
    font-size: 10px;
  }

  .normalRubyBase {
    color: #111827;
    font-weight: 800;
  }

  .targetHighlight {
    color: #ef4444;
    font-weight: 900;
    text-decoration: underline;
    text-decoration-thickness: 3px;
    text-underline-offset: 5px;
  }

  .translationText {
    margin: 4px 0 0;
    text-align: center;
    color: #6b7280;
    font-size: 14px;
    line-height: 1.6;
  }

  .smallGuide {
    margin: 8px 0 0;
    font-size: 14px;
    color: #374151;
    line-height: 1.6;
  }

  .smallGuideEn {
    margin: 2px 0 0;
    font-size: 12px;
    color: #6b7280;
    line-height: 1.5;
  }

  .choiceGrid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .choiceButton {
    width: 100%;
    padding: 14px 16px;
    border-radius: 16px;
    border: 1px solid #e5e7eb;
    background: #ffffff;
    color: #111827;
    font-size: 16px;
    text-align: left;
    cursor: pointer;
  }

  .choiceButton:disabled {
    cursor: default;
    opacity: 0.9;
  }

  .selectedChoice {
    border-color: #fb7185;
    background: #fff1f2;
  }

  .answerInput {
    width: 100%;
    box-sizing: border-box;
    padding: 15px 16px;
    border-radius: 16px;
    border: 1px solid #d1d5db;
    background: #ffffff;
    color: #111827;
    -webkit-text-fill-color: #111827;
    caret-color: #111827;
    font-size: 20px;
    text-align: center;
  }

  .answerInput::placeholder {
    color: #9ca3af;
    -webkit-text-fill-color: #9ca3af;
  }

  .answerInput:disabled {
    color: #111827;
    -webkit-text-fill-color: #111827;
    background: #f9fafb;
    opacity: 1;
  }

  .answerInput:focus {
    outline: none;
    border-color: #fb7185;
    box-shadow: 0 0 0 3px rgba(251, 113, 133, 0.18);
  }

  .primaryButton,
  .secondaryButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 46px;
    padding: 12px 18px;
    border-radius: 999px;
    border: none;
    text-decoration: none;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
  }

  .primaryButton {
    background: #fb7185;
    color: #ffffff;
  }

  .primaryButton:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .secondaryButton {
    background: #f3f4f6;
    color: #374151;
  }

  .fullButton {
    width: 100%;
  }

  .buttonRow {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 18px;
  }

  .resultBox {
    padding: 16px;
    border-radius: 18px;
    border: 1px solid #e5e7eb;
  }

  .resultBox.correct {
    background: #f0fdf4;
    border-color: #bbf7d0;
  }

  .resultBox.wrong {
    background: #fff7ed;
    border-color: #fed7aa;
  }

  .resultTitle {
    margin: 0 0 10px;
    font-size: 18px;
    font-weight: 800;
  }

  .simpleExplanation {
    color: #374151;
    font-size: 14px;
    line-height: 1.7;
  }

  .simpleExplanation p {
    margin: 6px 0;
  }

  .savedText {
    margin: 8px 0 0;
    color: #16a34a;
    font-size: 12px;
    font-weight: 700;
  }

  .saveError {
    margin: 10px 0 0;
    color: #b91c1c;
    font-size: 12px;
    line-height: 1.6;
  }

  .scoreText {
    margin: 18px 0;
    font-size: 20px;
    font-weight: 800;
  }

  .loadingText,
  .errorText {
    margin: 0;
    font-size: 15px;
    line-height: 1.7;
  }

  .errorText {
    color: #b91c1c;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .bottomNav {
    margin-top: 24px;
    text-align: center;
    font-size: 13px;
  }

  .bottomNav a {
    color: #6b7280;
    text-decoration: none;
  }

  @media (min-width: 640px) {
    .pageShell {
      padding: 40px 18px;
    }

    .card {
      padding: 30px;
    }

    .choiceGrid {
      grid-template-columns: 1fr 1fr;
    }

    .buttonRow {
      flex-direction: row;
      justify-content: center;
    }
  }
`;
