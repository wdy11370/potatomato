import { NextResponse } from "next/server";
import { z } from "zod";
import { mockFeedback } from "@/lib/mockCoach";
import { callOpenAIText } from "@/lib/openai";

const requestSchema = z.object({
  text: z.string().min(1)
});

export async function POST(request: Request) {
  const body = requestSchema.parse(await request.json());

  try {
    const content = await callOpenAIText([
      {
        role: "system",
        content:
          "You are an English speaking coach. Return compact JSON with corrected, issue, better, pronunciationHint. Use Chinese for explanations and keep feedback practical."
      },
      { role: "user", content: body.text }
    ]);

    if (content) return NextResponse.json(JSON.parse(content));
  } catch {
    // Fall through to deterministic demo feedback.
  }

  return NextResponse.json(mockFeedback(body.text));
}
