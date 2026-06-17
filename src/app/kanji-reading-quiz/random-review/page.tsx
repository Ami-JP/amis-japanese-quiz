import KanjiRandomReviewClient from "@/components/KanjiRandomReviewClient";

export const dynamic = "force-dynamic";

export default function KanjiReadingRandomReviewPage() {
  return (
    <KanjiRandomReviewClient
      kind="reading"
      titleJa="今までの読み問題をランダム復習"
      titleEn="Random Reading Review"
      descriptionJa="これまでにやった読み問題を、5問だけランダムに復習しよう♪"
      descriptionEn="Review 5 reading questions you’ve already tried."
      questionsApi="/api/kanji-reading-random-review/questions"
      attemptsApi="/api/kanji-reading-random-review/attempts"
      backHref="/student-home"
      backLabel="ホームに戻る / Back to Home"
    />
  );
}