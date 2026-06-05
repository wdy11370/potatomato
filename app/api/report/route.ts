import { NextResponse } from "next/server";
import { z } from "zod";
import { mockReport } from "@/lib/mockCoach";
import { callOpenAIText } from "@/lib/openai";

const turnSchema = z.object({
  id: z.string(),
  speaker: z.enum(["ai", "user"]),
  text: z.string(),
  createdAt: z.string()
});

const requestSchema = z.object({
  turns: z.array(turnSchema)
});

export async function POST(request: Request) {
  const body = requestSchema.parse(await request.json());

  try {
    const content = await callOpenAIText([
      {
        role: "system",
        content:
          "Generate a Chinese after-class English speaking report as JSON: overall, pronunciation, fluency, grammar, vocabulary, taskCompletion numbers 0-100, strengths array, issues array, drills array."
      },
      { role: "user", content: JSON.stringify(body.turns) }
    ]);

    if (content) return NextResponse.json(JSON.parse(content));
  } catch {
    // Fall through to deterministic demo report.
  }

  return NextResponse.json(mockReport(body.turns));
}
