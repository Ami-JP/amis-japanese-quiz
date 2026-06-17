import KanjiRandomReviewClient from "@/components/KanjiRandomReviewClient";

export const dynamic = "force-dynamic";

export default function KanjiMeaningRandomReviewPage() {
  return (
    <KanjiRandomReviewClient
      kind="meaning"
      titleJa="今までの意味問題をランダム復習"
      titleEn="Random Meaning Review"
      descriptionJa="これまでにやった意味問題を、5問だけランダムに復習しよう♪"
      descriptionEn="Review 5 meaning questions you’ve already tried."
      questionsApi="/api/kanji-meaning-random-review/questions"
      attemptsApi="/api/kanji-meaning-random-review/attempts"
      backHref="/student-home"
      backLabel="ホームに戻る / Back to Home"
    />
  );
}