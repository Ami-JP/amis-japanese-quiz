export function normalizeKanjiWritingAnswer(value: unknown): string {
  if (value == null) return "";
  return String(value).normalize("NFKC").trim();
}

export function judgeKanjiWritingAnswer(params: {
  userAnswer: unknown;
  targetText: unknown;
}): boolean {
  return (
    normalizeKanjiWritingAnswer(params.userAnswer) ===
    normalizeKanjiWritingAnswer(params.targetText)
  );
}
