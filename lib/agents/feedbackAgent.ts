import { z } from "zod";
import { feedbackPrompt } from "@/lib/agents/prompts/feedback";
import { generateText } from "@/lib/agents/tools/textModelTool";
import { ruleCoachTool } from "@/lib/agents/tools/ruleCoachTool";
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
  const ruleFeedback = ruleCoachTool.feedback(text);

  if (process.env.USE_LLM_FEEDBACK !== "true") {
    return { feedback: ruleFeedback, provider: "rules", fallback: false };
  }

  try {
    const result = await generateText(
      [
        { role: "system", content: feedbackPrompt },
        { role: "user", content: text }
      ],
      { json: true, temperature: 0.25 }
    );

    if (!result.content) return { feedback: ruleFeedback, provider: "rules", fallback: true };
    const normalized = normalizeFeedback(JSON.parse(result.content), text);
    if (!normalized) return { feedback: ruleFeedback, provider: "rules", fallback: true };

    return {
      feedback: normalized,
      provider: result.provider ?? "rules",
      fallback: false
    };
  } catch {
    return { feedback: ruleFeedback, provider: "rules", fallback: true };
  }
}

function normalizeFeedback(value: unknown, originalText: string): Feedback | null {
  const parsed = feedbackSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const fallback = ruleCoachTool.feedback(originalText);
  const corrected = stringValue(record.corrected) ?? stringValue(record.correctedSentence);
  const issue = stringValue(record.issue) ?? stringValue(record.explanationChinese) ?? stringValue(record.explanation);
  const better = stringValue(record.better) ?? stringValue(record.betterExpression) ?? stringValue(record.suggestion);
  const pronunciationHint = stringValue(record.pronunciationHint) ?? stringValue(record.pronunciation);

  if (!corrected && !issue && !better && !pronunciationHint) return null;

  return {
    corrected: corrected ?? fallback.corrected,
    issue: issue ?? fallback.issue,
    better: better ?? fallback.better,
    pronunciationHint: pronunciationHint ?? fallback.pronunciationHint
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
