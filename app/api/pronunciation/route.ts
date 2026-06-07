import { NextResponse } from "next/server";
import { assessPronunciation } from "@/lib/agents/tools/pronunciationTool";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const text = String(form.get("text") ?? "");
  const audio = form.get("audio");

  const result = await assessPronunciation({
    text,
    audio: audio instanceof File ? audio : undefined
  });

  return NextResponse.json(result);
}
