import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const form = await request.formData();
  const text = String(form.get("text") ?? "");
  const audio = form.get("audio");
  const audioSize = audio instanceof File ? audio.size : 0;
  const hasAzure = Boolean(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);

  if (!hasAzure) {
    return NextResponse.json({
      mode: "mock",
      pronScore: 74,
      accuracyScore: 72,
      fluencyScore: 78,
      prosodyScore: 70,
      note: text
        ? `演示评分：已收到文本 "${text.slice(0, 60)}"${audioSize ? ` 和 ${Math.round(audioSize / 1024)}KB 音频` : ""}。配置 Azure Speech 后可返回单词级/音素级评分。`
        : "演示评分：配置 Azure Speech 后可返回单词级/音素级评分。"
    });
  }

  return NextResponse.json({
    mode: "configured",
    note:
      "Azure Speech key detected. Production assessment should convert browser audio to WAV/PCM and call Azure Pronunciation Assessment with the transcript as reference text."
  });
}
