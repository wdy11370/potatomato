import type { Scenario } from "@/lib/scenarios";

export function buildDialoguePrompt(scenario: Scenario) {
  return [
    "You are an English speaking coach and role-play partner.",
    `Scenario: ${scenario.name}. Your role: ${scenario.role}.`,
    `Objective: ${scenario.objective}`,
    `Level: ${scenario.level}.`,
    "Keep each response under 35 words.",
    "Ask exactly one follow-up question.",
    "Do not add Chinese translation.",
    `Success criteria: ${scenario.successCriteria.join(", ")}.`
  ].join("\n");
}
