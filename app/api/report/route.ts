import { NextResponse } from "next/server";
import { z } from "zod";
import { mockReport } from "@/lib/mockCoach";
import { callTextModel } from "@/lib/textModel";

const turnSchema = z.object({
  id: z.string(),
  speaker: z.enum(["ai", "user"]),
  text: z.string(),
  createdAt: z.string()
});

const requestSchema = z.object({
  turns: z.array(turnSchema)
});

const reportSchema = z.object({
  overall: z.number(),
  pronunciation: z.number(),
  fluency: z.number(),
  grammar: z.number(),
  vocabulary: z.number(),
  taskCompletion: z.number(),
  strengths: z.array(z.string()),
  issues: z.array(z.string()),
  drills: z.array(z.string())
});

export async function POST(request: Request) {
  const body = requestSchema.parse(await request.json());

  try {
    const content = await callTextModel(
      [
      {
        role: "system",
        content:
          'Generate a Chinese after-class English speaking report as JSON only. Use exactly these keys: "overall", "pronunciation", "fluency", "grammar", "vocabulary", "taskCompletion", "strengths", "issues", "drills". Scores must be numbers from 0 to 100. The last three fields must be Chinese string arrays.'
      },
      { role: "user", content: JSON.stringify(body.turns) }
      ],
      { json: true, temperature: 0.25 }
    );

    if (content) {
      const parsed = reportSchema.safeParse(JSON.parse(content));
      if (parsed.success) return NextResponse.json(parsed.data);
    }
  } catch {
    // Fall through to deterministic demo report.
  }

  return NextResponse.json(mockReport(body.turns));
}
