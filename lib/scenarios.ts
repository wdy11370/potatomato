import { BriefcaseBusiness, Coffee, UsersRound } from "lucide-react";

export type ScenarioId = "interview" | "restaurant" | "meeting";

export type Scenario = {
  id: ScenarioId;
  name: string;
  role: string;
  level: "B1" | "B2" | "C1";
  objective: string;
  firstLine: string;
  successCriteria: string[];
};

export const scenarios: Scenario[] = [
  {
    id: "interview",
    name: "英文面试",
    role: "AI 面试官",
    level: "B2",
    objective: "完成一次产品/运营岗位的英文行为面试。",
    firstLine: "Welcome. Could you briefly introduce yourself and tell me about a project you are proud of?",
    successCriteria: ["清楚自我介绍", "使用 STAR 结构", "主动追问岗位信息"]
  },
  {
    id: "restaurant",
    name: "餐厅点餐",
    role: "AI 服务员",
    level: "B1",
    objective: "完成订位、点餐、询问推荐和结账。",
    firstLine: "Good evening. Do you have a reservation, or would you like a table for tonight?",
    successCriteria: ["礼貌表达需求", "询问菜品信息", "处理结账场景"]
  },
  {
    id: "meeting",
    name: "商务会议",
    role: "AI 同事",
    level: "C1",
    objective: "在项目同步会上表达进展、风险和下一步计划。",
    firstLine: "Let's start with your update. What progress did your team make this week?",
    successCriteria: ["表达项目进展", "说明风险与依赖", "提出下一步行动"]
  }
];

export const scenarioIconMap = {
  interview: BriefcaseBusiness,
  restaurant: Coffee,
  meeting: UsersRound
};

export function getScenario(id: ScenarioId) {
  return scenarios.find((scenario) => scenario.id === id) ?? scenarios[0];
}
