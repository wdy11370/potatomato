import { NextResponse } from "next/server";

export async function POST() {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      mode: "mock",
      message: "OPENAI_API_KEY is not configured. The app will use browser speech recognition and text chat."
    });
  }

  const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_REALTIME_MODEL ?? "gpt-4o-realtime-preview-2024-12-17",
      voice: "alloy",
      instructions:
        "You are a friendly English speaking coach. Keep responses concise, natural, and role-play oriented."
    })
  });

  if (!response.ok) {
    return NextResponse.json({ mode: "mock", message: await response.text() }, { status: 502 });
  }

  const data = await response.json();
  return NextResponse.json({ mode: "realtime", ...data });
}
