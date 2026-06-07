import crypto from "node:crypto";
import WebSocket from "ws";

type IflytekIatMessage = {
  code?: number;
  message?: string;
  data?: {
    status?: number;
    result?: {
      ws?: Array<{
        cw?: Array<{
          w?: string;
        }>;
      }>;
    };
  };
};

export async function transcribeWithIflytek(input: {
  pcmBuffer: Buffer;
  language?: "en_us" | "zh_cn";
}) {
  const appId = process.env.IFLYTEK_APP_ID;
  const apiKey = process.env.IFLYTEK_API_KEY;
  const apiSecret = process.env.IFLYTEK_API_SECRET;

  if (!appId || !apiKey || !apiSecret) {
    throw new Error("IFLYTEK_APP_ID, IFLYTEK_API_KEY and IFLYTEK_API_SECRET are required.");
  }

  const url = createIflytekAuthUrl({
    baseUrl: process.env.IFLYTEK_ASR_URL ?? "wss://iat-api.xfyun.cn/v2/iat",
    apiKey,
    apiSecret
  });

  return runIflytekIat({
    url,
    appId,
    pcmBuffer: input.pcmBuffer,
    language: input.language ?? "en_us"
  });
}

function createIflytekAuthUrl(input: {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
}) {
  const parsed = new URL(input.baseUrl);
  const host = parsed.host;
  const path = parsed.pathname;
  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
  const signature = crypto.createHmac("sha256", input.apiSecret).update(signatureOrigin).digest("base64");
  const authorizationOrigin = `api_key="${input.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin).toString("base64");

  parsed.searchParams.set("authorization", authorization);
  parsed.searchParams.set("date", date);
  parsed.searchParams.set("host", host);
  return parsed.toString();
}

function runIflytekIat(input: {
  url: string;
  appId: string;
  pcmBuffer: Buffer;
  language: "en_us" | "zh_cn";
}) {
  return new Promise<string>((resolve, reject) => {
    const ws = new WebSocket(input.url);
    const parts: string[] = [];
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("Iflytek ASR timed out."));
    }, 45000);

    ws.on("open", () => {
      sendAudioFrames(ws, input);
    });

    ws.on("message", (message) => {
      const result = parseMessage(message.toString());
      if (result.code && result.code !== 0) {
        clearTimeout(timeout);
        ws.close();
        reject(new Error(result.message || `Iflytek ASR error code ${result.code}`));
        return;
      }

      const text = extractText(result);
      if (text) parts.push(text);

      if (result.data?.status === 2) {
        clearTimeout(timeout);
        ws.close();
        resolve(cleanTranscript(parts.join("")));
      }
    });

    ws.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    ws.on("close", () => clearTimeout(timeout));
  });
}

function sendAudioFrames(
  ws: WebSocket,
  input: {
    appId: string;
    pcmBuffer: Buffer;
    language: "en_us" | "zh_cn";
  }
) {
  const frameSize = 1280;
  let offset = 0;

  const sendNext = () => {
    const end = Math.min(offset + frameSize, input.pcmBuffer.length);
    const frame = input.pcmBuffer.subarray(offset, end);
    const isFirst = offset === 0;
    const isLast = end >= input.pcmBuffer.length;

    ws.send(
      JSON.stringify({
        ...(isFirst
          ? {
              common: { app_id: input.appId },
              business: {
                language: input.language,
                domain: "iat",
                accent: "mandarin",
                vad_eos: 3000
              }
            }
          : {}),
        data: {
          status: isFirst ? 0 : isLast ? 2 : 1,
          format: "audio/L16;rate=16000",
          encoding: "raw",
          audio: frame.toString("base64")
        }
      })
    );

    offset = end;
    if (!isLast) setTimeout(sendNext, 40);
  };

  sendNext();
}

function parseMessage(value: string): IflytekIatMessage {
  try {
    return JSON.parse(value) as IflytekIatMessage;
  } catch {
    return { code: -1, message: "Invalid Iflytek ASR response." };
  }
}

function extractText(message: IflytekIatMessage) {
  return (
    message.data?.result?.ws
      ?.flatMap((item) => item.cw ?? [])
      .map((item) => item.w ?? "")
      .join("") ?? ""
  );
}

function cleanTranscript(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
