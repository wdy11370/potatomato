import { z } from "zod";
import { reportPrompt } from "@/lib/agents/prompts/report";
import { generateText } from "@/lib/agents/tools/textModelTool";
import type { AgentProvider } from "@/lib/agents/state";
import type { Report, Turn } from "@/lib/mockCoach";

const scoreSchema = z.number().min(0).max(100);

const reportSchema = z.object({
  overall: scoreSchema,
  pronunciation: scoreSchema,
  fluency: scoreSchema,
  grammar: scoreSchema,
  vocabulary: scoreSchema,
  taskCompletion: scoreSchema,
  strengths: z.array(z.string()),
  issues: z.array(z.string()),
  drills: z.array(z.string())
});

type ReportResult = {
  report: Report;
  provider: AgentProvider;
  fallback: boolean;
};

export async function generateReport(turns: Turn[]): Promise<ReportResult> {
  if (process.env.USE_LLM_REPORT !== "true") {
    throw new Error("LLM report is disabled. Set USE_LLM_REPORT=true to generate model reports.");
  }

  try {
    const result = await generateText(
      [
        { role: "system", content: reportPrompt },
        { role: "user", content: JSON.stringify(turns) }
      ],
      { json: true, temperature: 0.25 }
    );

    if (!result.content) throw new Error("DeepSeek report returned empty content.");

    const parsed = reportSchema.safeParse(JSON.parse(result.content));
    if (!parsed.success) throw new Error("DeepSeek report JSON does not match the required schema.");

    return {
      report: parsed.data,
      provider: result.provider ?? "rules",
      fallback: false
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "DeepSeek report call failed.");
  }
}
