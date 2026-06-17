import { NextRequest } from "next/server";
import { handleMeaningRandomReviewAttempts } from "@/lib/kanjiRandomReview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleMeaningRandomReviewAttempts(request);
}