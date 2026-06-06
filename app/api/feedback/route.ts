import { NextResponse } from "next/server";
import { z } from "zod";
import { mockFeedback } from "@/lib/mockCoach";
import { callTextModel } from "@/lib/textModel";

const requestSchema = z.object({
  text: z.string().min(1)
});

const feedbackSchema = z.object({
  corrected: z.string(),
  issue: z.string(),
  better: z.string(),
  pronunciationHint: z.string()
});

export async function POST(request: Request) {
  const body = requestSchema.parse(await request.json());
  const ruleFeedback = mockFeedback(body.text);

  if (process.env.USE_LLM_FEEDBACK !== "true") {
    return NextResponse.json(ruleFeedback);
  }

  try {
    const content = await callTextModel(
      [
      {
        role: "system",
        content:
          'You are an English speaking coach. Return JSON only. Use exactly these keys: "corrected", "issue", "better", "pronunciationHint". "corrected" should be the corrected English sentence. The other three values should be concise Chinese feedback. Do not add extra keys.'
      },
      { role: "user", content: body.text }
      ],
      { json: true, temperature: 0.25 }
    );

    if (content) return NextResponse.json(normalizeFeedback(JSON.parse(content), body.text));
  } catch {
    // Fall through to deterministic demo feedback.
  }

  return NextResponse.json(ruleFeedback);
}

function normalizeFeedback(value: unknown, originalText: string) {
  const parsed = feedbackSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const fallback = mockFeedback(originalText);

  return {
    corrected: stringValue(record.corrected) ?? stringValue(record.correctedSentence) ?? fallback.corrected,
    issue: stringValue(record.issue) ?? stringValue(record.explanationChinese) ?? stringValue(record.explanation) ?? fallback.issue,
    better: stringValue(record.better) ?? stringValue(record.betterExpression) ?? stringValue(record.suggestion) ?? fallback.better,
    pronunciationHint:
      stringValue(record.pronunciationHint) ?? stringValue(record.pronunciation) ?? fallback.pronunciationHint
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
