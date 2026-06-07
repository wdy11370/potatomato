# Potatomato Speaking Coach

一个可本地运行的 AI 英语口语陪练网页应用。支持场景选择、英文输入/语音输入、AI 场景对话、即时表达纠错、发音评测接口和课后报告。

项目默认不需要任何 API Key 也能启动运行：聊天、纠错和报告会使用本地规则教练引擎。配置 OpenAI、Ollama 或 Azure 后，可以切换到真实模型/真实发音评测。

## 快速启动

```bash
npm install
npm run dev
```

打开：

```text
http://127.0.0.1:3000
```

也可以使用：

```text
http://localhost:3000
```

## 从 GitHub 下载后需要什么

仓库已经包含运行所需的源码、图标、配置和依赖声明：

- `package.json`
- `package-lock.json`
- `app/`
- `lib/`
- `public/potatomato-icon.png`
- `.env.example`

不需要上传或提交这些目录：

- `node_modules/`
- `.next/`
- `.env`
- `.env.local`
- `Cognitive-Speech-TTS/`
- `SpeechSDK-JavaScript-*.zip`

下载后执行 `npm install` 会自动安装依赖，包括：

- Next.js / React
- Azure Speech SDK
- ffmpeg-static
- lucide-react
- zod

## 环境变量

复制 `.env.example` 为 `.env.local`：

```bash
cp .env.example .env.local
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env.local
```

可选配置：

```env
OPENAI_API_KEY=
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview-2024-12-17
OPENAI_TEXT_MODEL=gpt-4o-mini

OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:3b
USE_LLM_CHAT=false
USE_LLM_FEEDBACK=false
USE_LLM_REPORT=false

AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=
```

## 当前默认模式

默认模式适合演示和本地测试：

- 聊天：快速规则教练引擎
- 纠错：规则化表达诊断
- 报告：基于真实输入统计生成
- 发音：无 Azure key 时返回演示评分

这样做的好处是响应快，不会因为本地小模型慢而长时间 Thinking。

## 可选：接入 Ollama

如果本机有 Ollama，可以设置：

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:3b
USE_LLM_CHAT=true
USE_LLM_FEEDBACK=true
USE_LLM_REPORT=true
```

建议只在测试模型效果时开启。日常演示建议保持 `false`，速度更稳定。

## 可选：接入 Azure 发音评测

配置：

```env
AZURE_SPEECH_KEY=your_azure_speech_key
AZURE_SPEECH_REGION=your_region
```

前端录音默认是 `webm`。后端已经内置 `ffmpeg-static`，会自动转成 Azure 需要的 `16kHz / mono / PCM WAV`，再调用 Azure Pronunciation Assessment。

## 构建检查

```bash
npm run build
```

## 功能链路

```text
Browser
  -> Web Speech API / MediaRecorder
  -> Next.js API Routes
  -> /api/chat: 场景角色回复
  -> /api/feedback: 即时表达纠错
  -> /api/pronunciation: webm 转 wav + Azure 发音评测
  -> /api/report: 课后报告
```

## 推荐演示方式

1. 选择“英文面试”。
2. 输入一个过短回答，例如 `1`，查看系统如何提示无效输入。
3. 输入完整回答，例如：

```text
I managed a customer engagement campaign and increased user participation by 30%.
```

4. 查看 AI 追问、即时纠错和课后报告。

## Agent Workflow

The app now uses a workflow-style speaking-coach agent. The learner still sees one simple speaking practice surface, while the implementation exposes a clear agent boundary for technical review.

Main flow:

```text
Browser
  -> /api/agent/turn
  -> AgentOrchestrator
  -> dialogue agent
  -> feedback agent
  -> pronunciation tool
  -> Agent Trace
```

Report flow:

```text
Browser
  -> /api/agent/report
  -> AgentOrchestrator
  -> report agent
  -> Agent Trace
```

Key files:

- `lib/agents/orchestrator.ts`
- `lib/agents/state.ts`
- `lib/agents/trace.ts`
- `lib/agents/dialogueAgent.ts`
- `lib/agents/feedbackAgent.ts`
- `lib/agents/reportAgent.ts`
- `lib/agents/tools/`
- `app/api/agent/turn/route.ts`
- `app/api/agent/report/route.ts`

The main learner experience stays simple. For technical demos, open the `Agent Trace` panel to inspect each workflow step, provider selection, fallback behavior, and timing.

See `docs/agent-architecture.md` for the module map and demo explanation.
