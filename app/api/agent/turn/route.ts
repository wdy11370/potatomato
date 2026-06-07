import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgentTurn } from "@/lib/agents/orchestrator";

export const runtime = "nodejs";

const turnSchema = z.object({
  id: z.string(),
  speaker: z.enum(["ai", "user"]),
  text: z.string(),
  createdAt: z.string()
});

const jsonSchema = z.object({
  sessionId: z.string().optional(),
  scenarioId: z.enum(["interview", "restaurant", "meeting"]),
  turns: z.array(turnSchema),
  text: z.string().trim().min(1),
  includeTrace: z.boolean().optional()
});

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const input = contentType.includes("multipart/form-data")
      ? await parseFormRequest(request)
      : jsonSchema.parse(await request.json());

    const result = await runAgentTurn(input);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, "Agent turn failed.") },
      { status: 400 }
    );
  }
}

async function parseFormRequest(request: Request) {
  const form = await request.formData();
  const rawTurns = String(form.get("turns") ?? "[]");
  const audio = form.get("audio");
  const parsed = jsonSchema.parse({
    sessionId: stringOrUndefined(form.get("sessionId")),
    scenarioId: String(form.get("scenarioId") ?? ""),
    turns: JSON.parse(rawTurns),
    text: String(form.get("text") ?? ""),
    includeTrace: String(form.get("includeTrace") ?? "false") === "true"
  });

  return {
    ...parsed,
    audio: audio instanceof File ? audio : undefined
  };
}

function stringOrUndefined(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : undefined;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return "Invalid request.";
  if (error instanceof SyntaxError) return "Invalid JSON.";
  if (error instanceof Error && error.message === "User text is required.") return error.message;
  return fallback;
}
