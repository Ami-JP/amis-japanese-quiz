import { NextRequest } from "next/server";
import { handleReadingRandomReviewAttempts } from "@/lib/kanjiRandomReview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleReadingRandomReviewAttempts(request);
}