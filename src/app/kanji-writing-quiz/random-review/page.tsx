import KanjiRandomReviewClient from "@/components/KanjiRandomReviewClient";

export const dynamic = "force-dynamic";

export default function KanjiWritingRandomReviewPage() {
  return (
    <KanjiRandomReviewClient
      kind="writing"
      titleJa="今までの書き問題をランダム復習"
      titleEn="Random Writing Review"
      descriptionJa="これまでにやった書き問題を、5問だけランダムに復習しよう♪"
      descriptionEn="Review 5 writing questions you’ve already tried."
      questionsApi="/api/kanji-writing-random-review/questions"
      attemptsApi="/api/kanji-writing-random-review/attempts"
      backHref="/student-home/writing"
      backLabel="書きクイズメニューに戻る / Back to Writing Menu"
    />
  );
}
