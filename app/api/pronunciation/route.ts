import { NextResponse } from "next/server";
import { getAudioExtension, transcodeToAzureWav } from "@/lib/audioTranscode";
import { assessPronunciationWithAzure, summarizePronunciationResult } from "@/lib/azurePronunciation";

export const runtime = "nodejs";

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
        ? `演示评分：已收到文本 "${text.slice(0, 60)}"${audioSize ? ` 和 ${Math.round(audioSize / 1024)}KB 音频` : ""}。配置 Azure Speech 后会自动转码并返回单词级/音素级评分。`
        : "演示评分：配置 Azure Speech 后会自动转码并返回单词级/音素级评分。"
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

  try {
    const inputBuffer = Buffer.from(await audio.arrayBuffer());
    const isWav = audio.type.includes("wav") || audio.name.toLowerCase().endsWith(".wav");
    const wavBuffer = isWav ? inputBuffer : await transcodeToAzureWav(inputBuffer, getAudioExtension(audio));
    const rawResult = await assessPronunciationWithAzure(wavBuffer, text);

    return NextResponse.json({
      ...summarizePronunciationResult(rawResult),
      transcode: {
        inputType: audio.type || "unknown",
        inputSizeKb: Math.round(audio.size / 1024),
        output: isWav ? "original wav" : "converted wav 16kHz mono PCM"
      }
    });
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
