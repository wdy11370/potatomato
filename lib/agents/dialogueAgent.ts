import { buildDialoguePrompt } from "@/lib/agents/prompts/dialogue";
import { generateText } from "@/lib/agents/tools/textModelTool";
import { ruleCoachTool } from "@/lib/agents/tools/ruleCoachTool";
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
  if (!input.diagnosis.valid || process.env.USE_LLM_CHAT !== "true") {
    return ruleReply(input, process.env.USE_LLM_CHAT === "true");
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
  } catch {
    return ruleReply(input, true);
  }

  const sanitized = sanitizeReply(result.content);

  if (!sanitized) {
    return ruleReply(input, true);
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

function ruleReply(
  input: {
    scenarioId: ScenarioId;
    turns: Turn[];
    latestText: string;
  },
  fallback: boolean
): DialogueResult {
  return {
    text: ruleCoachTool.reply(input.scenarioId, input.latestText, input.turns.length),
    provider: "rules",
    fallback
  };
}

function sanitizeReply(content: string | null | undefined) {
  if (!content) return null;
  return content
    .replace(/[\u4e00-\u9fff][\s\S]*$/, "")
    .replace(/\bThinking\.{0,3}[\s\S]*$/i, "")
    .trim();
}
