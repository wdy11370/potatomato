import { Scenario, getScenario, ScenarioId } from "@/lib/scenarios";

export type Turn = {
  id: string;
  speaker: "ai" | "user";
  text: string;
  createdAt: string;
};

export type Feedback = {
  corrected: string;
  issue: string;
  better: string;
  pronunciationHint: string;
};

export type Report = {
  overall: number;
  pronunciation: number;
  fluency: number;
  grammar: number;
  vocabulary: number;
  taskCompletion: number;
  strengths: string[];
  issues: string[];
  drills: string[];
};

export function createSystemPrompt(scenario: Scenario) {
  return [
    `You are an English speaking coach and role-play partner.`,
    `Scenario: ${scenario.name}. Your role: ${scenario.role}.`,
    `Objective: ${scenario.objective}`,
    `Level: ${scenario.level}.`,
    `Keep each response under 45 words, ask one natural follow-up question, and do not over-correct during conversation.`,
    `Success criteria: ${scenario.successCriteria.join(", ")}.`
  ].join("\n");
}

export function mockReply(scenarioId: ScenarioId, userText: string, turnCount: number) {
  const scenario = getScenario(scenarioId);
  const lower = userText.toLowerCase();

  if (!userText.trim()) return scenario.firstLine;
  if (scenario.id === "interview") {
    if (lower.includes("project")) {
      return "That sounds relevant. What was your specific responsibility, and how did you measure the result?";
    }
    if (lower.includes("team")) {
      return "Good. Can you describe a disagreement in that team and how you handled it?";
    }
    return turnCount > 4
      ? "Before we wrap up, what questions do you have about this role?"
      : "Could you give me a concrete example with the situation, action, and result?";
  }

  if (scenario.id === "restaurant") {
    if (lower.includes("reservation")) return "Great. May I have your name and how many people are in your party?";
    if (lower.includes("recommend")) return "Our seafood pasta is popular tonight. Would you like anything to drink with it?";
    if (lower.includes("bill") || lower.includes("check")) return "Of course. Would you like to pay by card or cash?";
    return "Certainly. Would you like me to explain today's specials before you order?";
  }

  if (lower.includes("risk")) {
    return "Thanks for flagging that. What support do you need from the team to reduce that risk?";
  }
  if (lower.includes("next")) {
    return "That plan is clear. What timeline should we commit to for the next milestone?";
  }
  return "Could you make that update more specific with progress, blockers, and the next action?";
}

export function mockFeedback(text: string): Feedback {
  const trimmed = text.trim();
  const corrected = trimmed
    .replace(/\bi am\b/gi, "I am")
    .replace(/\bi\b/g, "I")
    .replace(/\bwant order\b/gi, "would like to order");

  return {
    corrected: corrected || "Try answering in one complete sentence.",
    issue: trimmed.split(/\s+/).length < 7 ? "回答偏短，建议补充原因或例子。" : "表达基本清楚，注意使用更自然的连接词。",
    better:
      trimmed.split(/\s+/).length < 7
        ? "You can add: for example, because, as a result."
        : "A more natural style is: Let me give you a specific example.",
    pronunciationHint: "如识别文本和你原意不同，优先复练关键词、词尾辅音和重音位置。"
  };
}

export function mockReport(turns: Turn[]): Report {
  const userTurns = turns.filter((turn) => turn.speaker === "user");
  const avgLength =
    userTurns.reduce((sum, turn) => sum + turn.text.split(/\s+/).filter(Boolean).length, 0) /
    Math.max(userTurns.length, 1);
  const taskCompletion = Math.min(92, 58 + userTurns.length * 8);
  const fluency = Math.min(88, 56 + Math.round(avgLength * 2.3));
  const grammar = Math.min(90, 68 + Math.round(avgLength));

  return {
    overall: Math.round((taskCompletion + fluency + grammar + 74 + 76) / 5),
    pronunciation: 74,
    fluency,
    grammar,
    vocabulary: 76,
    taskCompletion,
    strengths: ["能持续参与对话", "回答中已有明确意图", "适合继续做场景化复练"],
    issues: ["部分回答较短，缺少例子", "可增加连接词提升自然度", "发音评测需要接入 Azure 后显示单词级结果"],
    drills: ["用 STAR 结构复述一次项目经历", "跟读 5 个关键词并录音", "把一个短回答扩展为 3 句话"]
  };
}
