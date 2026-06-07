import { getAudioExtension, transcodeToAzureWav, transcodeToPcm16k } from "@/lib/audioTranscode";
import { assessPronunciationWithAzure, summarizePronunciationResult } from "@/lib/azurePronunciation";
import { assessPronunciationWithIflytek } from "@/lib/iflytekPronunciation";
import type { PronunciationSummary } from "@/lib/agents/state";

export async function assessPronunciation(input: {
  text: string;
  audio?: File;
}): Promise<PronunciationSummary> {
  const referenceText = input.text.trim();

  if (!referenceText) {
    return {
      mode: "skipped",
      note: "Pronunciation assessment skipped because the reference text is empty."
    };
  }

  if (process.env.PRONUNCIATION_PROVIDER === "iflytek") {
    return assessWithIflytek(input, referenceText);
  }

  if (!hasAzureSpeechConfig()) {
    if (!input.audio) {
      return {
        mode: "skipped",
        note: "Pronunciation assessment skipped because no audio was received. Configure Azure Speech or record audio for scoring."
      };
    }

    return {
      mode: "mock",
      pronScore: 74,
      accuracyScore: 72,
      fluencyScore: 78,
      prosodyScore: 70,
      note: "Mock pronunciation scores are shown because Azure Speech is not configured; audio was received."
    };
  }

  if (!input.audio) {
    return {
      mode: "configured",
      note: "Azure Speech is configured, but no audio file was received."
    };
  }

  try {
    const extension = getAudioExtension(input.audio);
    const inputBuffer = Buffer.from(await input.audio.arrayBuffer());
    const wavBuffer = extension.toLowerCase() === "wav" ? inputBuffer : await transcodeToAzureWav(inputBuffer, extension);
    const result = await assessPronunciationWithAzure(wavBuffer, referenceText);
    const summary = summarizePronunciationResult(result);
    const score = summary.pronScore;

    return {
      mode: "azure",
      pronScore: summary.pronScore,
      accuracyScore: summary.accuracyScore,
      fluencyScore: summary.fluencyScore,
      completenessScore: summary.completenessScore,
      prosodyScore: summary.prosodyScore,
      words: summary.words,
      note: `Pronunciation score: ${score ?? "--"}`,
      transcode: {
        inputType: input.audio.type || extension,
        inputSizeKb: Math.round(input.audio.size / 1024),
        output: extension.toLowerCase() === "wav" ? "original wav" : "azure wav"
      }
    };
  } catch {
    return {
      mode: "azure-error",
      note: "Pronunciation assessment failed. Please try again with a clear recording."
    };
  }
}

async function assessWithIflytek(
  input: {
    text: string;
    audio?: File;
  },
  referenceText: string
): Promise<PronunciationSummary> {
  if (!hasIflytekConfig()) {
    return {
      mode: "configured",
      note: "Iflytek pronunciation is selected, but IFLYTEK_APP_ID / IFLYTEK_API_KEY / IFLYTEK_API_SECRET are not configured."
    };
  }

  if (!input.audio) {
    return {
      mode: "configured",
      note: "Iflytek pronunciation is configured, but no audio file was received."
    };
  }

  try {
    const extension = getAudioExtension(input.audio);
    const inputBuffer = Buffer.from(await input.audio.arrayBuffer());
    const pcmBuffer = await transcodeToPcm16k(inputBuffer, extension);
    const summary = await assessPronunciationWithIflytek({ pcmBuffer, referenceText });

    return {
      mode: "iflytek",
      pronScore: summary.pronScore,
      accuracyScore: summary.accuracyScore,
      fluencyScore: summary.fluencyScore,
      completenessScore: summary.completenessScore,
      note: summary.note,
      words: summary.rawXml ? [{ provider: "iflytek", rawXml: summary.rawXml }] : [],
      transcode: {
        inputType: input.audio.type || extension,
        inputSizeKb: Math.round(input.audio.size / 1024),
        output: "iflytek pcm 16kHz mono s16le"
      }
    };
  } catch {
    return {
      mode: "iflytek-error",
      note: "Iflytek pronunciation assessment failed. Please check credentials, reference text, and recording quality."
    };
  }
}

function hasAzureSpeechConfig() {
  return Boolean(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);
}

function hasIflytekConfig() {
  return Boolean(process.env.IFLYTEK_APP_ID && process.env.IFLYTEK_API_KEY && process.env.IFLYTEK_API_SECRET);
}
