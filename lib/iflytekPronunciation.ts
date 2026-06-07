import crypto from "node:crypto";
import WebSocket from "ws";

type IflytekRawResult = {
  code?: number;
  message?: string;
  data?: {
    status?: number;
    data?: string;
  };
};

export type IflytekPronunciationResult = {
  provider: "iflytek";
  pronScore: number | null;
  accuracyScore: number | null;
  fluencyScore: number | null;
  completenessScore: number | null;
  note: string;
  rawXml?: string;
};

export async function assessPronunciationWithIflytek(input: {
  pcmBuffer: Buffer;
  referenceText: string;
}): Promise<IflytekPronunciationResult> {
  const appId = process.env.IFLYTEK_APP_ID;
  const apiKey = process.env.IFLYTEK_API_KEY;
  const apiSecret = process.env.IFLYTEK_API_SECRET;

  if (!appId || !apiKey || !apiSecret) {
    throw new Error("IFLYTEK_APP_ID, IFLYTEK_API_KEY and IFLYTEK_API_SECRET are required.");
  }

  const url = createIflytekAuthUrl({
    baseUrl: process.env.IFLYTEK_ISE_URL ?? "wss://ise-api.xfyun.cn/v2/open-ise",
    apiKey,
    apiSecret
  });

  const rawXml = await runIflytekWebSocket({
    url,
    appId,
    pcmBuffer: input.pcmBuffer,
    referenceText: input.referenceText
  });

  return summarizeIflytekXml(rawXml);
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

function runIflytekWebSocket(input: {
  url: string;
  appId: string;
  pcmBuffer: Buffer;
  referenceText: string;
}) {
  return new Promise<string>((resolve, reject) => {
    const ws = new WebSocket(input.url);
    const chunks: string[] = [];
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("Iflytek pronunciation assessment timed out."));
    }, 45000);

    ws.on("open", () => {
      sendSessionBegin(ws, input.appId, input.referenceText);
      sendAudioFrames(ws, input.pcmBuffer);
    });

    ws.on("message", (message) => {
      const result = parseIflytekMessage(message.toString());
      if (result.code && result.code !== 0) {
        clearTimeout(timeout);
        ws.close();
        reject(new Error(result.message || `Iflytek ISE error code ${result.code}`));
        return;
      }

      const encoded = result.data?.data;
      if (encoded) chunks.push(Buffer.from(encoded, "base64").toString("utf8"));

      if (result.data?.status === 2) {
        clearTimeout(timeout);
        ws.close();
        resolve(chunks.join(""));
      }
    });

    ws.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    ws.on("close", () => clearTimeout(timeout));
  });
}

function sendSessionBegin(ws: WebSocket, appId: string, referenceText: string) {
  ws.send(
    JSON.stringify({
      common: { app_id: appId },
      business: {
        sub: "ise",
        ent: "en_vip",
        category: "read_sentence",
        rstcd: "utf8",
        group: "pupil",
        check_type: "easy",
        grade: "junior",
        tte: "utf-8",
        cmd: "ssb",
        auf: "audio/L16;rate=16000",
        aue: "raw",
        text: Buffer.from(`\uFEFF${referenceText}`, "utf8").toString("base64")
      },
      data: {
        status: 0,
        data: ""
      }
    })
  );
}

function sendAudioFrames(ws: WebSocket, pcmBuffer: Buffer) {
  const frameSize = 1280;
  let offset = 0;
  let index = 0;

  while (offset < pcmBuffer.length) {
    const end = Math.min(offset + frameSize, pcmBuffer.length);
    const frame = pcmBuffer.subarray(offset, end);
    const isLast = end >= pcmBuffer.length;

    ws.send(
      JSON.stringify({
        business: {
          cmd: "auw",
          aus: isLast ? 4 : index === 0 ? 1 : 2,
          aue: "raw"
        },
        data: {
          status: isLast ? 2 : 1,
          data: frame.toString("base64")
        }
      })
    );

    offset = end;
    index += 1;
  }
}

function parseIflytekMessage(value: string): IflytekRawResult {
  try {
    return JSON.parse(value) as IflytekRawResult;
  } catch {
    return { code: -1, message: "Invalid Iflytek response." };
  }
}

function summarizeIflytekXml(rawXml: string): IflytekPronunciationResult {
  const total = pickScore(rawXml, ["total_score", "score"]);
  const accuracy = pickScore(rawXml, ["accuracy_score", "phone_score"]);
  const fluency = pickScore(rawXml, ["fluency_score"]);
  const integrity = pickScore(rawXml, ["integrity_score", "complete_score"]);

  return {
    provider: "iflytek",
    pronScore: total,
    accuracyScore: accuracy,
    fluencyScore: fluency,
    completenessScore: integrity,
    note: `Iflytek pronunciation score: ${total ?? "--"}`,
    rawXml
  };
}

function pickScore(xml: string, names: string[]) {
  for (const name of names) {
    const attributeMatch = xml.match(new RegExp(`${name}="([0-9.]+)"`, "i"));
    if (attributeMatch) return normalizeScore(Number(attributeMatch[1]));

    const tagMatch = xml.match(new RegExp(`<${name}>([0-9.]+)</${name}>`, "i"));
    if (tagMatch) return normalizeScore(Number(tagMatch[1]));
  }
  return null;
}

function normalizeScore(value: number) {
  if (!Number.isFinite(value)) return null;
  if (value <= 5) return Math.round(value * 20);
  if (value <= 10) return Math.round(value * 10);
  return Math.round(Math.min(100, value));
}
