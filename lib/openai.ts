export async function callOpenAIText(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>) {
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
      temperature: 0.45,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI text call failed: ${response.status} ${await response.text()}`);
  }

  const json = await response.json();
  return json.choices?.[0]?.message?.content as string | undefined;
}
