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

type InputDiagnosis = {
  valid: boolean;
  severity: "ok" | "weak" | "invalid";
  reason: string;
  coachingReply: string;
};

const fillerPattern = /^(hi|hello|hey|ok|okay|yes|no|嗯|啊|哈|\?|？|\.|,|\d+)$/i;
const chinesePattern = /[\u4e00-\u9fff]/;

export function createSystemPrompt(scenario: Scenario) {
  return [
    "You are an English speaking coach and role-play partner.",
    `Scenario: ${scenario.name}. Your role: ${scenario.role}.`,
    `Objective: ${scenario.objective}`,
    `Level: ${scenario.level}.`,
    "Keep each response under 35 words. Ask one follow-up question. Do not add Chinese translation.",
    `Success criteria: ${scenario.successCriteria.join(", ")}.`
  ].join("\n");
}

export function diagnoseInput(text: string): InputDiagnosis {
  const trimmed = text.trim();
  const words = getWords(trimmed);

  if (!trimmed) {
    return invalid("没有收到有效回答。请用一句完整英文回答当前问题。");
  }

  if (fillerPattern.test(trimmed) || words.length <= 1) {
    return invalid("回答过短，无法判断口语能力。请至少说 8 个英文词，并包含一个具体信息。");
  }

  if (chinesePattern.test(trimmed)) {
    return {
      valid: false,
      severity: "weak",
      reason: "回答中混入中文，当前训练目标是英文口语输出。",
      coachingReply:
        "Please answer in English only. Try one full sentence with your role, project, and result."
    };
  }

  if (words.length < 6) {
    return {
      valid: false,
      severity: "weak",
      reason: "回答太短，缺少上下文或例子。",
      coachingReply:
        "Good start, but please make it more complete. Add what you did, why it mattered, and one result."
    };
  }

  return {
    valid: true,
    severity: "ok",
    reason: "回答有效。",
    coachingReply: ""
  };
}

function invalid(reason: string): InputDiagnosis {
  return {
    valid: false,
    severity: "invalid",
    reason,
    coachingReply:
      "I need a complete English answer to continue. For example: I worked on a payment project and improved checkout success by 15%."
  };
}

export function mockReply(scenarioId: ScenarioId, userText: string, turnCount: number) {
  const scenario = getScenario(scenarioId);
  const diagnosis = diagnoseInput(userText);

  if (!userText.trim()) return scenario.firstLine;
  if (!diagnosis.valid) return diagnosis.coachingReply;

  const lower = userText.toLowerCase();
  if (scenario.id === "interview") {
    if (hasAny(lower, ["30%", "percent", "increase", "improve", "reduced", "result"])) {
      return "Good. What exactly did you do to achieve that result, and what trade-off did you manage?";
    }
    if (hasAny(lower, ["project", "campaign", "payment", "product"])) {
      return "That is relevant. Please explain your role, the challenge, and the measurable outcome.";
    }
    if (hasAny(lower, ["team", "collaborate", "stakeholder"])) {
      return "Nice. Tell me about one disagreement in that collaboration and how you resolved it.";
    }
    return turnCount > 6
      ? "Before we wrap up, what question would you ask the interviewer about this role?"
      : "Please give one concrete example using situation, action, and result.";
  }

  if (scenario.id === "restaurant") {
    if (hasAny(lower, ["reservation", "table"])) return "Sure. What name is the reservation under, and how many people are coming?";
    if (hasAny(lower, ["recommend", "suggestion", "special"])) return "Our seafood pasta is popular. Do you have any allergies or dietary restrictions?";
    if (hasAny(lower, ["bill", "check", "pay"])) return "Of course. Would you like to pay together or split the bill?";
    return "Certainly. Please order one dish, one drink, and ask one polite question about the menu.";
  }

  if (hasAny(lower, ["risk", "blocker", "dependency"])) {
    return "Thanks for flagging that. What decision or support do you need from the team today?";
  }
  if (hasAny(lower, ["next", "timeline", "milestone"])) {
    return "That plan is clear. What owner and deadline should we commit to for the next milestone?";
  }
  return "Please make your update specific: progress, blocker, next action, and deadline.";
}

export function mockFeedback(text: string): Feedback {
  const trimmed = text.trim();
  const diagnosis = diagnoseInput(trimmed);
  const corrections = buildCorrections(trimmed);
  const corrected = corrections.corrected || trimmed || "Please answer in a complete English sentence.";

  if (!diagnosis.valid) {
    return {
      corrected,
      issue: diagnosis.reason,
      better: buildBetterExample(trimmed),
      pronunciationHint: "先保证句子完整，再做发音评分；过短输入无法可靠评估发音。"
    };
  }

  return {
    corrected,
    issue: corrections.issues.length ? corrections.issues.join("；") : "表达基本有效，但还可以补充更具体的结果或例子。",
    better: buildBetterExample(corrected),
    pronunciationHint: buildPronunciationHint(corrected)
  };
}

function buildCorrections(text: string) {
  let corrected = text.trim();
  const issues: string[] = [];

  const replacements: Array<[RegExp, string, string]> = [
    [/\bI want order\b/gi, "I would like to order", "want order 缺少 to，点餐场景建议用更礼貌的 would like to"],
    [/\bI no have\b/gi, "I don't have", "no have 是中式表达，应改为 don't have"],
    [/\bdon't have reservation\b/gi, "don't have a reservation", "reservation 是可数名词，单数前需要 a"],
    [/\bI am work\b/gi, "I work", "I am work 结构错误，应使用 I work 或 I am working"],
    [/\bWe improve\b/g, "We improved", "描述过去项目结果时应使用过去时 improved"],
    [/\breduce payment failed rate\b/gi, "reduced the payment failure rate", "名词搭配应为 payment failure rate，并使用过去时"],
    [/\buser participation\b/gi, "user engagement", "面试中 user engagement 比 user participation 更自然"]
  ];

  for (const [pattern, replacement, issue] of replacements) {
    if (pattern.test(corrected)) {
      corrected = corrected.replace(pattern, replacement);
      issues.push(issue);
    }
  }

  if (/^[a-z]/.test(corrected)) {
    corrected = corrected.charAt(0).toUpperCase() + corrected.slice(1);
    issues.push("句首需要大写");
  }

  if (corrected && !/[.!?]$/.test(corrected)) {
    corrected += ".";
    issues.push("句末建议补充标点，让表达更完整");
  }

  return { corrected, issues };
}

function buildBetterExample(text: string) {
  const lower = text.toLowerCase();
  if (hasAny(lower, ["payment", "conversion", "campaign", "project"])) {
    return "更好的面试回答：In my last project, I led a payment optimization initiative, reduced the failure rate by 12%, and coordinated with engineering and operations to launch it on time.";
  }
  if (hasAny(lower, ["coffee", "reservation", "table", "order"])) {
    return "更自然的点餐表达：I would like a table for two, and could you recommend a popular pasta dish?";
  }
  if (hasAny(lower, ["risk", "next", "team", "deadline"])) {
    return "更清晰的会议表达：We finished the prototype this week, but the payment API is still a risk. I need backend support before Friday.";
  }
  return "建议用 2-3 句话回答：先说明背景，再说明你的行动，最后给出一个具体结果。";
}

function buildPronunciationHint(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("project")) return "重点跟读 project：注意重音在第一个音节 /ˈprɑːdʒekt/。";
  if (lower.includes("reservation")) return "重点跟读 reservation：注意 /v/ 和 /ʃən/，不要吞掉中间音节。";
  if (lower.includes("payment")) return "重点跟读 payment failure rate：注意 payment 的 /eɪ/ 和 failure 的连读。";
  return "建议放慢语速，确保词尾辅音说清楚，尤其是 worked、improved、asked 这类词。";
}

export function mockReport(turns: Turn[]): Report {
  const userTurns = turns.filter((turn) => turn.speaker === "user");
  const validTurns = userTurns.filter((turn) => diagnoseInput(turn.text).valid);
  const invalidTurns = userTurns.length - validTurns.length;
  const wordCounts = userTurns.map((turn) => getWords(turn.text).length);
  const totalWords = wordCounts.reduce((sum, count) => sum + count, 0);
  const avgWords = totalWords / Math.max(userTurns.length, 1);
  const concreteSignals = countSignals(userTurns.map((turn) => turn.text).join(" "));
  const grammarIssues = userTurns.reduce((sum, turn) => sum + buildCorrections(turn.text).issues.length, 0);

  const taskCompletion = clamp(35 + validTurns.length * 16 + concreteSignals * 5 - invalidTurns * 15, 20, 92);
  const fluency = clamp(40 + avgWords * 4 - invalidTurns * 12, 20, 90);
  const grammar = clamp(88 - grammarIssues * 7 - invalidTurns * 10, 25, 92);
  const vocabulary = clamp(45 + uniqueWordCount(userTurns) * 2 + concreteSignals * 4, 30, 90);
  const pronunciation = userTurns.length ? clamp(72 - invalidTurns * 8, 45, 82) : 0;
  const overall = Math.round((taskCompletion + fluency + grammar + vocabulary + pronunciation) / 5);

  return {
    overall,
    pronunciation,
    fluency,
    grammar,
    vocabulary,
    taskCompletion,
    strengths: buildStrengths(validTurns, concreteSignals),
    issues: buildIssues(userTurns, invalidTurns, grammarIssues, avgWords),
    drills: buildDrills(userTurns, invalidTurns, grammarIssues)
  };
}

function buildStrengths(validTurns: Turn[], concreteSignals: number) {
  const strengths: string[] = [];
  if (validTurns.length > 0) strengths.push(`完成了 ${validTurns.length} 轮有效英文回答。`);
  if (concreteSignals > 0) strengths.push("回答中出现了项目、结果或数据，具备面试表达雏形。");
  if (validTurns.some((turn) => getWords(turn.text).length >= 12)) strengths.push("部分回答已经能展开成完整句。");
  return strengths.length ? strengths : ["目前有效英文输出较少，需要先建立完整回答。"];
}

function buildIssues(userTurns: Turn[], invalidTurns: number, grammarIssues: number, avgWords: number) {
  const issues: string[] = [];
  if (invalidTurns > 0) issues.push(`${invalidTurns} 轮输入过短或混入中文，无法作为有效口语表现评分。`);
  if (avgWords < 8) issues.push("平均回答长度偏短，缺少背景、行动和结果。");
  if (grammarIssues > 0) issues.push(`检测到 ${grammarIssues} 个基础表达问题，例如时态、搭配或中式表达。`);
  if (!userTurns.some((turn) => /\d+|%|percent|result|impact/i.test(turn.text))) {
    issues.push("缺少可量化结果，面试场景说服力不足。");
  }
  return issues.length ? issues : ["主要问题不明显，下一步应提高表达自然度和细节密度。"];
}

function buildDrills(userTurns: Turn[], invalidTurns: number, grammarIssues: number) {
  const drills: string[] = [];
  if (invalidTurns > 0) drills.push("把 hello、?、数字这类输入改写成 1 句完整英文回答。");
  if (grammarIssues > 0) drills.push("专项复练过去时：improved、reduced、managed、launched。");
  if (userTurns.some((turn) => /project|campaign|payment/i.test(turn.text))) {
    drills.push("用 STAR 结构重说项目经历：Situation、Task、Action、Result 各一句。");
  }
  drills.push("录音跟读 3 遍自己的最佳回答，重点检查词尾辅音和语速。");
  return drills;
}

function hasAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function getWords(text: string) {
  return text.match(/[a-zA-Z]+(?:'[a-zA-Z]+)?|\d+%?/g) ?? [];
}

function countSignals(text: string) {
  const signals = ["project", "campaign", "payment", "result", "improve", "reduced", "increase", "30%", "percent", "team"];
  const lower = text.toLowerCase();
  return signals.filter((signal) => lower.includes(signal)).length;
}

function uniqueWordCount(turns: Turn[]) {
  const words = turns.flatMap((turn) => getWords(turn.text.toLowerCase()));
  return new Set(words.filter((word) => word.length > 2)).size;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}
