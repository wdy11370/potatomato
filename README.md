# Potatomato Speaking Coach

Potatomato Speaking Coach 是一个可本地部署的 AI 英语口语练习网页应用。用户选择训练场景后，直接点击录音说英文，系统会保存录音、自动转写、调用 AI 生成下一轮对话，并在会话结束后生成纠错反馈和训练报告。

演示视频链接：【题目一：AI英语口语陪练工具Demo】 https://www.bilibili.com/video/BV1qpEh6YEFP/?share_source=copy_web&vd_source=8475a37a7897505ce8732b4ae306d44f

## 功能

- 场景化口语训练：英文面试、餐厅点餐、商务会议等。
- 语音输入：浏览器录音，服务端接收音频。
- 自动转写：调用讯飞 ASR。
- AI 对话：回复由 DeepSeek 生成。
- 即时反馈：对用户每轮英文回答进行语法、表达、场景适配度分析。
- 发音评测：支持讯飞语音评测接口。
- 课后报告：根据真实对话记录生成总结。
- 多条存档：浏览器本地保存多条练习记录。
- 

## 技术栈

- Next.js 15
- React 19
- TypeScript
- DeepSeek Chat API
- 讯飞 ASR / 讯飞语音评测
- MediaRecorder
- Web Speech API
- FFmpeg 音频转码
- localStorage 会话存档

## 项目结构

```text
app/
  api/
    agent/turn/       AI 对话、即时反馈、发音评测编排接口
    agent/report/     课后报告接口
    asr/              讯飞 ASR 转写接口
    chat/             兼容旧版聊天接口
    feedback/         兼容旧版反馈接口
    pronunciation/    发音评测接口
    report/           兼容旧版报告接口
  page.tsx            主页面
  globals.css         页面样式

lib/
  agents/             口语训练 Agent 编排
  iflytekAsr.ts       讯飞 ASR WebSocket 调用
  iflytekPronunciation.ts 讯飞语音评测调用
  azurePronunciation.ts   Azure 发音评测调用
  audioTranscode.ts   音频转码
  textModel.ts        DeepSeek / OpenAI / Ollama 文本模型调用
  scenarios.ts        训练场景配置

public/
  potatomato-icon.png 图标
```

## 快速运行

先进入项目目录：

```powershell
cd YOUR_DIR
```

安装依赖：

```powershell
npm install
```

复制环境变量模板：

```powershell
Copy-Item .env.example .env.local
```

启动开发服务器：

```powershell
npm run dev
```

## 环境变量

`.env.local` 

推荐配置：

```env
TEXT_PROVIDER=deepseek
DEEPSEEK_API_URL=https://api.deepseek.com/chat/completions
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_API_KEY=

USE_LLM_CHAT=true
USE_LLM_FEEDBACK=true
USE_LLM_REPORT=true

PRONUNCIATION_PROVIDER=iflytek
IFLYTEK_ISE_URL=wss://ise-api.xfyun.cn/v2/open-ise
IFLYTEK_ASR_URL=wss://iat-api.xfyun.cn/v2/iat
IFLYTEK_APP_ID=
IFLYTEK_API_KEY=
IFLYTEK_API_SECRET=
```

可选配置：

```env
OPENAI_API_KEY=
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview-2024-12-17
OPENAI_TEXT_MODEL=gpt-4o-mini

OLLAMA_BASE_URL=
OLLAMA_MODEL=

AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=
```

## API Key 获取位置

DeepSeek：

1. 进入 DeepSeek 开放平台。
2. 创建 API Key。
3. 将 Key 填入 `.env.local` 的 `DEEPSEEK_API_KEY`。

讯飞：

1. 进入讯飞开放平台控制台。
2. 创建“语音听写”应用，用于 ASR。
3. 创建或开通“语音评测”能力，用于发音评测。
4. 在应用详情页找到 `APPID`、`APIKey`、`APISecret`。
5. 分别填入 `.env.local` 的 `IFLYTEK_APP_ID`、`IFLYTEK_API_KEY`、`IFLYTEK_API_SECRET`。

## 调用链路

用户录音后的主链路：

```text
浏览器录音
  -> MediaRecorder 保存音频
  -> 浏览器语音识别尝试转写
  -> 如果转写失败，调用 /api/asr
  -> /api/asr 调用讯飞 ASR
  -> /api/agent/turn
  -> Dialogue Agent 调用 DeepSeek 生成下一轮回复
  -> Feedback Agent 调用 DeepSeek 生成针对性纠错
  -> Pronunciation Tool 调用讯飞或 Azure 进行发音评测
  -> 前端保存音频、文本、反馈和 AI 回复
```

生成报告链路：

```text
点击生成报告
  -> /api/agent/report
  -> Report Agent 调用 DeepSeek
  -> 基于真实 turns / feedback / pronunciation 生成课后总结
  -> 存入本地历史记录
```

## 本地存档

应用使用浏览器 `localStorage` 保存历史记录：

- 当前会话：`potatomato-speaking-coach-session`
- 历史记录：`potatomato-speaking-coach-history`

同一浏览器中刷新页面不会丢失记录。换浏览器、清理浏览器缓存或换设备后，本地记录不会自动迁移。

## 当前模型配置建议

推荐演示组合：

```text
文本对话 / 纠错 / 报告：DeepSeek
语音转写：讯飞 ASR
发音评测：讯飞语音评测
录音与页面交互：浏览器 MediaRecorder
```

