import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";

type AzureSpeechJson = {
  NBest?: Array<{
    PronunciationAssessment?: {
      PronScore?: number;
      AccuracyScore?: number;
      FluencyScore?: number;
      CompletenessScore?: number;
      ProsodyScore?: number;
    };
    Words?: unknown[];
  }>;
};

export async function assessPronunciationWithAzure(wavBuffer: Buffer, referenceText: string) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;

  if (!key || !region) {
    throw new Error("AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are required.");
  }

  const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage = "en-US";

  const audioConfig = SpeechSDK.AudioConfig.fromWavFileInput(wavBuffer);
  const pronConfig = new SpeechSDK.PronunciationAssessmentConfig(
    referenceText,
    SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
    SpeechSDK.PronunciationAssessmentGranularity.Phoneme,
    true
  );

  pronConfig.enableProsodyAssessment = true;
  pronConfig.phonemeAlphabet = "IPA";
  pronConfig.nbestPhonemeCount = 5;

  const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
  pronConfig.applyTo(recognizer);

  return new Promise<AzureSpeechJson>((resolve, reject) => {
    recognizer.recognizeOnceAsync(
      (result) => {
        const rawJson = result.properties.getProperty(SpeechSDK.PropertyId.SpeechServiceResponse_JsonResult);
        recognizer.close();
        resolve(JSON.parse(rawJson));
      },
      (error) => {
        recognizer.close();
        reject(new Error(error));
      }
    );
  });
}

export function summarizePronunciationResult(result: AzureSpeechJson) {
  const top = result.NBest?.[0];
  const assessment = top?.PronunciationAssessment;

  return {
    mode: "azure",
    pronScore: assessment?.PronScore ?? null,
    accuracyScore: assessment?.AccuracyScore ?? null,
    fluencyScore: assessment?.FluencyScore ?? null,
    completenessScore: assessment?.CompletenessScore ?? null,
    prosodyScore: assessment?.ProsodyScore ?? null,
    words: top?.Words ?? [],
    raw: result
  };
}
