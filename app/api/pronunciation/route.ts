import { NextResponse } from "next/server";
import { assessPronunciationWithAzure, summarizePronunciationResult } from "@/lib/azurePronunciation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const text = String(form.get("text") ?? "");
  const audio = form.get("audio");
  const audioSize = audio instanceof File ? audio.size : 0;
  const audioType = audio instanceof File ? audio.type : "";
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

  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json(
      {
        mode: "configured",
        note: "Azure Speech key 已配置，但没有收到音频文件。请先录音后再发送。"
      },
      { status: 400 }
    );
  }

  if (!text.trim()) {
    return NextResponse.json(
      {
        mode: "configured",
        note: "Azure Pronunciation Assessment 需要 reference text。请传入用户本轮转写文本或跟读句子。"
      },
      { status: 400 }
    );
  }

  if (!audioType.includes("wav") && !audio.name.toLowerCase().endsWith(".wav")) {
    return NextResponse.json({
      mode: "configured",
      note: `Azure Speech key 已配置，收到 ${audioType || "unknown"} 音频 ${Math.round(audioSize / 1024)}KB。当前后端评测需要 WAV/PCM；请先把浏览器 webm 转成 wav 再调用。`
    });
  }

  try {
    const wavBuffer = Buffer.from(await audio.arrayBuffer());
    const rawResult = await assessPronunciationWithAzure(wavBuffer, text);
    return NextResponse.json(summarizePronunciationResult(rawResult));
  } catch (error) {
    return NextResponse.json(
      {
        mode: "azure-error",
        note: error instanceof Error ? error.message : "Azure Pronunciation Assessment failed."
      },
      { status: 502 }
    );
  }
}
