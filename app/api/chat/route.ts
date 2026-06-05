import { NextResponse } from "next/server";
import { z } from "zod";
import { createSystemPrompt, mockReply, Turn } from "@/lib/mockCoach";
import { getScenario, ScenarioId } from "@/lib/scenarios";

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
  const latestUser = [...body.turns].reverse().find((turn) => turn.speaker === "user");

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      text: mockReply(body.scenarioId as ScenarioId, latestUser?.text ?? "", body.turns.length)
    });
  }

  const messages = [
    { role: "system" as const, content: createSystemPrompt(scenario) },
    ...body.turns.slice(-10).map((turn: Turn) => ({
      role: turn.speaker === "ai" ? ("assistant" as const) : ("user" as const),
      content: turn.text
    }))
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL ?? "gpt-4o-mini",
      messages,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    return NextResponse.json({ text: mockReply(body.scenarioId as ScenarioId, latestUser?.text ?? "", body.turns.length) });
  }

  const json = await response.json();
  return NextResponse.json({ text: json.choices?.[0]?.message?.content ?? scenario.firstLine });
}
