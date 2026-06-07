import { NextResponse } from "next/server";
import { z } from "zod";
import { createSystemPrompt, Turn } from "@/lib/mockCoach";
import { getScenario } from "@/lib/scenarios";
import { callTextModel } from "@/lib/textModel";

const requestSchema = z.object({
  scenarioId: z.enum(["interview", "restaurant", "meeting"]),
  turns: z.array(
    z.object({
      id: z.string(),
      speaker: z.enum(["ai", "user"]),
      text: z.string(),
      createdAt: z.string()
    })
  )
});

export async function POST(request: Request) {
  const body = requestSchema.parse(await request.json());
  const scenario = getScenario(body.scenarioId);

  if (process.env.USE_LLM_CHAT !== "true") {
    return NextResponse.json({ message: "LLM chat is disabled." }, { status: 503 });
  }

  const messages = [
    { role: "system" as const, content: createSystemPrompt(scenario) },
    ...body.turns.slice(-10).map((turn: Turn) => ({
      role: turn.speaker === "ai" ? ("assistant" as const) : ("user" as const),
      content: turn.text
    }))
  ];

  const content = await callTextModel(messages, { temperature: 0.7 });
  const text = sanitizeReply(content);
  if (!text) return NextResponse.json({ message: "DeepSeek returned empty content." }, { status: 502 });
  return NextResponse.json({ text });
}

function sanitizeReply(content: string | null | undefined) {
  if (!content) return null;
  return content
    .replace(/[\u4e00-\u9fff][\s\S]*$/, "")
    .replace(/\bThinking\.{0,3}[\s\S]*$/i, "")
    .trim();
}
