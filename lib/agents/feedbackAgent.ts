import { z } from "zod";
import { feedbackPrompt } from "@/lib/agents/prompts/feedback";
import { generateText } from "@/lib/agents/tools/textModelTool";
import type { AgentProvider } from "@/lib/agents/state";
import type { Feedback } from "@/lib/mockCoach";

const feedbackSchema = z.object({
  corrected: z.string(),
  issue: z.string(),
  better: z.string(),
  pronunciationHint: z.string()
});

type FeedbackResult = {
  feedback: Feedback;
  provider: AgentProvider;
  fallback: boolean;
};

export async function generateFeedback(text: string): Promise<FeedbackResult> {
  if (process.env.USE_LLM_FEEDBACK !== "true") {
    throw new Error("LLM feedback is disabled. Set USE_LLM_FEEDBACK=true to generate model feedback.");
  }

  try {
    const result = await generateText(
      [
        { role: "system", content: feedbackPrompt },
        { role: "user", content: text }
      ],
      { json: true, temperature: 0.25 }
    );

    if (!result.content) throw new Error("DeepSeek feedback returned empty content.");
    const normalized = normalizeFeedback(JSON.parse(result.content), text);
    if (!normalized) throw new Error("DeepSeek feedback JSON does not match the required schema.");

    return {
      feedback: normalized,
      provider: result.provider ?? "rules",
      fallback: false
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "DeepSeek feedback call failed.");
  }
}

function normalizeFeedback(value: unknown, originalText: string): Feedback | null {
  const parsed = feedbackSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const corrected = stringValue(record.corrected) ?? stringValue(record.correctedSentence);
  const issue = stringValue(record.issue) ?? stringValue(record.explanationChinese) ?? stringValue(record.explanation);
  const better = stringValue(record.better) ?? stringValue(record.betterExpression) ?? stringValue(record.suggestion);
  const pronunciationHint = stringValue(record.pronunciationHint) ?? stringValue(record.pronunciation);

  if (!corrected && !issue && !better && !pronunciationHint) return null;

  return {
    corrected: corrected ?? originalText,
    issue: issue ?? "DeepSeek did not provide a specific issue.",
    better: better ?? "DeepSeek did not provide an improved expression.",
    pronunciationHint: pronunciationHint ?? "DeepSeek did not provide a pronunciation hint."
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
