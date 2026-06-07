import { buildDialoguePrompt } from "@/lib/agents/prompts/dialogue";
import { generateText } from "@/lib/agents/tools/textModelTool";
import type { AgentProvider, InputDiagnosis } from "@/lib/agents/state";
import { getScenario, type ScenarioId } from "@/lib/scenarios";
import type { Turn } from "@/lib/mockCoach";

type DialogueResult = {
  text: string;
  provider: AgentProvider;
  fallback: boolean;
};

export async function generateDialogueReply(input: {
  scenarioId: ScenarioId;
  turns: Turn[];
  latestText: string;
  diagnosis: InputDiagnosis;
}): Promise<DialogueResult> {
  if (process.env.USE_LLM_CHAT !== "true") {
    throw new Error("LLM chat is disabled. Set USE_LLM_CHAT=true to generate model replies.");
  }

  const scenario = getScenario(input.scenarioId);
  const recentTurns = ensureLatestUserTurn(input.turns, input.latestText);
  const messages = [
    { role: "system" as const, content: buildDialoguePrompt(scenario) },
    ...recentTurns.slice(-10).map((turn) => ({
      role: turn.speaker === "ai" ? ("assistant" as const) : ("user" as const),
      content: turn.text
    }))
  ];

  let result;
  try {
    result = await generateText(messages, { temperature: 0.7 });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "DeepSeek dialogue call failed.");
  }

  const sanitized = sanitizeReply(result.content);

  if (!sanitized) {
    throw new Error("DeepSeek dialogue returned empty content.");
  }

  return {
    text: sanitized,
    provider: result.provider ?? "rules",
    fallback: false
  };
}

function ensureLatestUserTurn(turns: Turn[], latestText: string): Turn[] {
  const latest = latestText.trim();
  if (!latest) return turns;

  const lastTurn = turns.at(-1);
  if (lastTurn?.speaker === "user" && lastTurn.text.trim() === latest) return turns;

  return [
    ...turns,
    {
      id: "latest-user-input",
      speaker: "user",
      text: latest,
      createdAt: new Date().toISOString()
    }
  ];
}

function sanitizeReply(content: string | null | undefined) {
  if (!content) return null;
  return content
    .replace(/[\u4e00-\u9fff][\s\S]*$/, "")
    .replace(/\bThinking\.{0,3}[\s\S]*$/i, "")
    .trim();
}
