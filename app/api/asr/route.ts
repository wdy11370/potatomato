import { NextResponse } from "next/server";
import { getAudioExtension, transcodeToPcm16k } from "@/lib/audioTranscode";
import { transcribeWithIflytek } from "@/lib/iflytekAsr";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    const language = String(form.get("language") ?? "en_us") === "zh_cn" ? "zh_cn" : "en_us";

    if (!(audio instanceof File)) {
      return NextResponse.json({ transcript: "", message: "No audio file received." }, { status: 400 });
    }

    const extension = getAudioExtension(audio);
    const inputBuffer = Buffer.from(await audio.arrayBuffer());
    const pcmBuffer = await transcodeToPcm16k(inputBuffer, extension);
    const transcript = await transcribeWithIflytek({ pcmBuffer, language });

    return NextResponse.json({
      transcript,
      provider: "iflytek",
      inputSizeKb: Math.round(audio.size / 1024)
    });
  } catch (error) {
    return NextResponse.json(
      { transcript: "", message: error instanceof Error ? error.message : "ASR failed." },
      { status: 500 }
    );
  }
}
