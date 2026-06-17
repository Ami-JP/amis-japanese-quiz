import { handleMeaningRandomReviewQuestions } from "@/lib/kanjiRandomReview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return handleMeaningRandomReviewQuestions();
}