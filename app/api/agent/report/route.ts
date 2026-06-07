import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgentReport } from "@/lib/agents/orchestrator";

export const runtime = "nodejs";

const turnSchema = z.object({
  id: z.string(),
  speaker: z.enum(["ai", "user"]),
  text: z.string(),
  createdAt: z.string()
});

const requestSchema = z.object({
  sessionId: z.string().optional(),
  scenarioId: z.enum(["interview", "restaurant", "meeting"]),
  turns: z.array(turnSchema),
  includeTrace: z.boolean().optional()
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const result = await runAgentReport(input);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, "Agent report failed.") },
      { status: 400 }
    );
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return "Invalid request.";
  if (error instanceof SyntaxError) return "Invalid JSON.";
  return fallback;
}
