type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type TextModelOptions = {
  json?: boolean;
  temperature?: number;
};

export async function callTextModel(messages: ChatMessage[], options: TextModelOptions = {}) {
  const openAIResult = await callOpenAIText(messages, options).catch(() => null);
  if (openAIResult) return openAIResult;

  return callOllamaText(messages, options).catch(() => null);
}

async function callOpenAIText(messages: ChatMessage[], options: TextModelOptions) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL ?? "gpt-4o-mini",
      messages,
      temperature: options.temperature ?? 0.45,
      ...(options.json ? { response_format: { type: "json_object" } } : {})
    }),
    signal: AbortSignal.timeout(45000)
  });

  if (!response.ok) {
    throw new Error(`OpenAI text call failed: ${response.status} ${await response.text()}`);
  }

  const json = await response.json();
  return json.choices?.[0]?.message?.content as string | undefined;
}

async function callOllamaText(messages: ChatMessage[], options: TextModelOptions) {
  const response = await fetch(`${process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434"}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL ?? "qwen2.5:3b",
      messages,
      stream: false,
      format: options.json ? "json" : undefined,
      options: {
        temperature: options.temperature ?? 0.35,
        num_predict: options.json ? 700 : 160
      }
    }),
    signal: AbortSignal.timeout(60000)
  });

  if (!response.ok) {
    throw new Error(`Ollama text call failed: ${response.status} ${await response.text()}`);
  }

  const json = await response.json();
  return json.message?.content as string | undefined;
}
