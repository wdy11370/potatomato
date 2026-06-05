# AI English Speaking Coach

一个网页端英语口语陪练 MVP：支持场景选择、语音识别、AI 角色对话、即时纠错、发音评测接口和课后报告。

## 功能

- 场景：英文面试、餐厅点餐、商务会议
- 输入：浏览器麦克风语音识别，也支持手动输入
- 输出：AI 角色英文回复，浏览器 TTS 播放
- 反馈：每轮表达纠错、发音评测占位、课后能力报告
- 服务：无密钥时自动演示模式，有 `OPENAI_API_KEY` 时调用 OpenAI 文本接口

## 启动

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。

## 环境变量

复制 `.env.example` 为 `.env.local`：

```bash
OPENAI_API_KEY=your_key
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview-2024-12-17
OPENAI_TEXT_MODEL=gpt-4o-mini

AZURE_SPEECH_KEY=your_azure_key
AZURE_SPEECH_REGION=your_region
```

## 架构

```text
Browser
  -> Web Speech API / MediaRecorder
  -> Next.js API Routes
  -> /api/chat: AI 场景角色回复
  -> /api/feedback: 语法与表达纠错
  -> /api/pronunciation: 发音评测接口
  -> /api/report: 课后总结报告
```

生产版建议把实时对话切到 OpenAI Realtime API + WebRTC，把发音评测接入 Azure Speech Pronunciation Assessment，并将 `MediaRecorder` 音频转为 Azure 评测需要的 WAV/PCM 格式。
